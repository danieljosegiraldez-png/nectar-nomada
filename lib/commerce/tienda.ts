/**
 * De un lote de miel envasado a la tienda — ADR-163.
 *
 * **Dos actos, y el segundo es el único que toca la tienda** (Daniel, 2026-09-18): no todo lo
 * envasado va a la tienda de Néctar Nómada. Después de envasar, quien trabaja el lote ASIGNA una
 * cantidad de envases a una variante del producto; en la tienda alguien CONFIRMA lo que llegó, y
 * sólo entonces sube el inventario. Una asignación sin confirmar no vende nada.
 *
 * **Dos permisos distintos, a propósito.** Asignar exige `lot:manage` sobre el lote —es trabajo
 * de campo, el mismo que envasar—. Recibir y crear variantes exigen `commerce:manage_store`, que
 * ningún perfil de campo tiene: lo que se ofrece a la venta no lo decide quien envasa.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { requireLotAccess, TraceabilityAccessError } from "../traceability/lots";
import { Prisma } from "../../generated/prisma/client";
import { computeLotBalance } from "../traceability/balance";

export class TiendaInvalida extends Error {}
export class TiendaSinPermiso extends Error {}

const PLATAFORMA = { scopeType: "platform", scopeRefId: null } as const;

export async function puedeGestionarTienda(userAccountId: string): Promise<boolean> {
  return can(userAccountId, "manage_store", "commerce", PLATAFORMA, "internal");
}

async function exigeTienda(userAccountId: string) {
  if (!(await puedeGestionarTienda(userAccountId))) throw new TiendaSinPermiso("sin_permiso_de_tienda");
}

function enteroPositivo(valor: unknown, codigo: string): number {
  const n = typeof valor === "number" ? valor : Number(String(valor ?? "").trim());
  if (!Number.isInteger(n) || n <= 0) throw new TiendaInvalida(codigo);
  return n;
}

/**
 * Cuántos envases salieron del envasado que produjo este lote, o `null` si el lote no salió de
 * un envasado. Es el techo de lo que se puede asignar: no se ofrecen a la tienda envases que
 * nadie envasó.
 */
async function envasesDelLote(tx: Prisma.TransactionClient, lotId: string): Promise<number | null> {
  const salida = await tx.lotTransformationOutput.findFirst({
    where: { lotId, transformation: { transformationType: "packaging" } },
    select: { transformation: { select: { packageCount: true } } },
  });
  return salida?.transformation.packageCount ?? null;
}

export interface AsignarATiendaInput {
  lotId: string;
  productVariantId: string;
  unitsAssigned: number | string;
  /** El DÍA (medianoche UTC, `fechaDeDia`). */
  assignedAt: Date;
}

/**
 * Asigna envases de un lote envasado a una variante. **No toca el inventario.**
 *
 * `Serializable`: dos asignaciones simultáneas del mismo lote leerían la misma suma y podrían
 * pasarse juntas del techo. Con aislamiento serializable una de las dos reintenta y ve la otra.
 */
export async function asignarATienda(userAccountId: string, input: AsignarATiendaInput) {
  const lote = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lote) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [lote]);
  const unidades = enteroPositivo(input.unitsAssigned, "envases_invalidos");

  return prisma.$transaction(
    async (tx) => {
      const envases = await envasesDelLote(tx, lote.id);
      if (envases === null) throw new TiendaInvalida("el_lote_no_esta_envasado");
      const variante = await tx.productVariant.findUnique({ where: { id: input.productVariantId } });
      if (!variante || variante.status !== "active") throw new TiendaInvalida("variante_no_disponible");
      const ya = await tx.storeAllocation.aggregate({ where: { lotId: lote.id, cancelledAt: null }, _sum: { unitsAssigned: true } });
      const asignados = ya._sum.unitsAssigned ?? 0;
      if (asignados + unidades > envases) throw new TiendaInvalida(`mas_envases_de_los_que_hay:${envases - asignados}`);

      const fila = await tx.storeAllocation.create({
        data: {
          lotId: lote.id,
          productVariantId: variante.id,
          unitsAssigned: unidades,
          assignedAt: input.assignedAt,
          assignedBy: userAccountId,
        },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "store_allocation.assign",
          entityType: "store_allocation",
          entityId: fila.id,
          after: fila,
          sourceInterface: "commerce.tienda",
        },
        tx,
      );
      return fila;
    },
    { isolationLevel: "Serializable" },
  );
}

export interface ConfirmarRecepcionInput {
  allocationId: string;
  unitsReceived: number | string;
  /** Obligatoria si llegan menos de los asignados: envases rotos, se quedaron en la finca... */
  receiptNote?: string | null;
  /** El DÍA de la recepción. */
  receivedAt: Date;
}

/**
 * Confirma lo que llegó a la tienda y **sólo entonces** suma al inventario de la variante.
 *
 * **Cero es una recepción válida** —se rompió todo por el camino— y exige nota como cualquier
 * faltante. Una variante sin inventario llevado (`null`, «no se cuenta») empieza a contarse con
 * lo recibido: recibir envases contados en una variante que no cuenta los perdería.
 *
 * Una asignación se recibe UNA vez: la actualización lleva `receivedAt: null` en su condición, así
 * que dos confirmaciones a la vez no suman dos veces.
 */
export async function confirmarRecepcion(userAccountId: string, input: ConfirmarRecepcionInput) {
  await exigeTienda(userAccountId);
  const recibidos = typeof input.unitsReceived === "number" ? input.unitsReceived : Number(String(input.unitsReceived ?? "").trim());
  if (!Number.isInteger(recibidos) || recibidos < 0) throw new TiendaInvalida("recibidos_invalidos");
  const nota = input.receiptNote?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const antes = await tx.storeAllocation.findUnique({ where: { id: input.allocationId } });
    if (!antes) throw new TiendaInvalida("asignacion_no_encontrada");
    if (antes.receivedAt) throw new TiendaInvalida("ya_recibida");
    if (antes.cancelledAt) throw new TiendaInvalida("asignacion_anulada");
    if (recibidos > antes.unitsAssigned) throw new TiendaInvalida(`mas_de_lo_asignado:${antes.unitsAssigned}`);
    if (recibidos < antes.unitsAssigned && !nota) throw new TiendaInvalida("faltante_sin_motivo");

    const hecho = await tx.storeAllocation.updateMany({
      where: { id: antes.id, receivedAt: null, cancelledAt: null },
      data: { receivedAt: input.receivedAt, receivedBy: userAccountId, unitsReceived: recibidos, receiptNote: nota },
    });
    if (hecho.count !== 1) throw new TiendaInvalida("ya_recibida");

    const variante = await tx.productVariant.findUniqueOrThrow({ where: { id: antes.productVariantId } });
    const inventario = (variante.inventoryCount ?? 0) + recibidos;
    await tx.productVariant.update({ where: { id: variante.id }, data: { inventoryCount: inventario } });

    const despues = await tx.storeAllocation.findUniqueOrThrow({ where: { id: antes.id } });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "store_allocation.receive",
        entityType: "store_allocation",
        entityId: antes.id,
        before: { allocation: antes, inventoryCount: variante.inventoryCount },
        after: { allocation: despues, inventoryCount: inventario },
        reason: nota ?? undefined,
        sourceInterface: "commerce.tienda",
      },
      tx,
    );
    return { asignacion: despues, inventario };
  });
}

export interface NuevaVarianteInput {
  productId: string;
  variantName: string;
  sku: string;
  priceAmount: number | string;
}

/** Crear una variante de un producto — «Miel multifloral 500 g». El precio lo da el dueño. */
export async function crearVariante(userAccountId: string, input: NuevaVarianteInput) {
  await exigeTienda(userAccountId);
  const nombre = input.variantName.trim();
  const sku = input.sku.trim();
  if (!nombre) throw new TiendaInvalida("falta_nombre");
  if (!sku) throw new TiendaInvalida("falta_sku");
  const precio = typeof input.priceAmount === "number" ? input.priceAmount : Number(String(input.priceAmount ?? "").trim());
  if (!Number.isFinite(precio) || precio <= 0) throw new TiendaInvalida("precio_invalido");
  const producto = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!producto) throw new TiendaInvalida("producto_no_encontrado");

  try {
    return await prisma.$transaction(async (tx) => {
      // Sin inventario llevado hasta que llegue algo: `null` es «no se cuenta», y un 0 escrito
      // aquí diría que se contó y no hay nada.
      const v = await tx.productVariant.create({
        data: { productId: producto.id, variantName: nombre, sku, priceAmount: precio, createdBy: userAccountId },
      });
      await recordAuditEvent(
        { actorUserAccountId: userAccountId, operation: "product_variant.create", entityType: "product_variant",
          entityId: v.id, after: v, sourceInterface: "commerce.tienda" },
        tx,
      );
      return v;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new TiendaInvalida("sku_repetido");
    throw e;
  }
}

/** Lo que la página de la tienda enseña: productos con sus variantes, y lo que espera recepción. */
export async function tiendaParaGestionar(userAccountId: string) {
  await exigeTienda(userAccountId);
  const [productos, pendientes] = await Promise.all([
    prisma.product.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, status: true,
        variants: { orderBy: { sku: "asc" }, select: { id: true, sku: true, variantName: true, priceAmount: true, priceCurrency: true, inventoryCount: true, status: true } },
      },
    }),
    prisma.storeAllocation.findMany({
      where: { receivedAt: null, cancelledAt: null },
      orderBy: { assignedAt: "asc" },
      select: {
        id: true, unitsAssigned: true, assignedAt: true,
        lot: { select: { id: true, lotCode: true } },
        productVariant: { select: { sku: true, variantName: true, product: { select: { name: true } } } },
      },
    }),
  ]);
  return { productos, pendientes };
}

/**
 * Las asignaciones de un lote, y los envases que quedan por asignar, para su ficha.
 *
 * **No autoriza y no pide principal**: su único llamador es la ficha del lote, que la invoca
 * DESPUÉS de que `getLotDetail` autorice —y `getLotDetail` lanza si no hay permiso de ver—,
 * pasándole el id del lote ya autorizado.
 */
export async function asignacionesDeLote(lotId: string) {
  const envases = await envasesDelLote(prisma, lotId);
  if (envases === null) return null;
  const filas = await prisma.storeAllocation.findMany({
    where: { lotId },
    orderBy: { assignedAt: "asc" },
    select: {
      id: true, unitsAssigned: true, assignedAt: true, unitsReceived: true, receivedAt: true, receiptNote: true,
      cancelledAt: true, cancelReason: true,
      productVariant: { select: { sku: true, variantName: true, product: { select: { name: true } } } },
    },
  });
  // Lo anulado se enseña —es historia— pero no cuenta: sus envases volvieron a libres.
  const asignados = filas.filter((f) => !f.cancelledAt).reduce((a, f) => a + f.unitsAssigned, 0);
  return { envases, asignados, libres: envases - asignados, filas };
}

/**
 * Las variantes activas a las que se puede asignar. **Es catálogo**, lo mismo que la ficha
 * pública de cada producto ya enseña; no pide principal. Su llamador —la ficha del lote— ya
 * autorizó el lote antes de ofrecerlas.
 */
export async function variantesParaAsignar() {
  return prisma.productVariant.findMany({
    where: { status: "active" },
    orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
    select: { id: true, sku: true, variantName: true, product: { select: { name: true } } },
  });
}

/**
 * Cuántos frascos de una variante quedan en cada lote, en la TIENDA: lo recibido menos lo ya
 * despachado. Lo asignado y no recibido no cuenta: no está en el estante.
 */
async function disponiblesPorLote(tx: Prisma.TransactionClient, productVariantId: string) {
  const recibidos = await tx.storeAllocation.groupBy({
    by: ["lotId"],
    where: { productVariantId, receivedAt: { not: null } },
    _sum: { unitsReceived: true },
  });
  const despachados = await tx.orderItemLot.groupBy({
    by: ["lotId"],
    where: { orderItem: { productVariantId } },
    _sum: { units: true },
  });
  const salida = new Map<string, number>();
  for (const r of recibidos) salida.set(r.lotId, r._sum.unitsReceived ?? 0);
  for (const d of despachados) salida.set(d.lotId, (salida.get(d.lotId) ?? 0) - (d._sum.units ?? 0));
  return salida;
}

/**
 * Los pedidos pagados que esperan despacho, con los lotes de los que puede salir cada artículo.
 */
export async function pedidosPorDespachar(userAccountId: string) {
  await exigeTienda(userAccountId);
  const pedidos = await prisma.order.findMany({
    where: { status: "paid" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, orderNumber: true, createdAt: true,
      items: { select: { id: true, quantity: true, productVariantId: true, productVariant: { select: { sku: true, variantName: true, product: { select: { name: true } } } } } },
    },
  });
  const variantes = [...new Set(pedidos.flatMap((p) => p.items.map((i) => i.productVariantId)))];
  const lotesPorVariante = new Map<string, { lotId: string; lotCode: string; disponibles: number }[]>();
  for (const v of variantes) {
    const disp = await disponiblesPorLote(prisma, v);
    const conStock = [...disp.entries()].filter(([, n]) => n > 0);
    const codigos = await prisma.lot.findMany({ where: { id: { in: conStock.map(([id]) => id) } }, select: { id: true, lotCode: true } });
    const codigo = new Map(codigos.map((c) => [c.id, c.lotCode]));
    lotesPorVariante.set(v, conStock.map(([lotId, disponibles]) => ({ lotId, lotCode: codigo.get(lotId) ?? lotId, disponibles })));
  }
  return pedidos.map((p) => ({
    ...p,
    items: p.items.map((i) => ({ ...i, lotes: lotesPorVariante.get(i.productVariantId) ?? [] })),
  }));
}

export interface DespacharPedidoInput {
  orderId: string;
  /** El DÍA del despacho. */
  despachadoEn: Date;
  /** Cuántos frascos de cada artículo salen de cada lote. Las filas en cero se ignoran. */
  filas: readonly { orderItemId: string; lotId: string; units: number | string }[];
}

/**
 * Despachar un pedido pagado diciendo de qué lote sale cada frasco — ADR-169.
 *
 * Por cada artículo, lo que sale de los lotes tiene que sumar **exactamente** lo pedido; de cada
 * lote no puede salir más de lo que la tienda recibió de esa variante y no despachó ya. Y los
 * kilos de esos frascos (frascos × masa neta del envasado) **salen del libro del lote**: la venta
 * llega a la trazabilidad, no se queda en la tienda.
 *
 * `Serializable`: dos despachos a la vez del mismo lote leerían el mismo disponible.
 */
export async function despacharPedido(userAccountId: string, input: DespacharPedidoInput) {
  await exigeTienda(userAccountId);
  const filas = input.filas
    .map((f) => ({ ...f, units: typeof f.units === "number" ? f.units : Number(String(f.units ?? "").trim() || "0") }))
    .filter((f) => f.units !== 0);
  for (const f of filas) if (!Number.isInteger(f.units) || f.units < 0) throw new TiendaInvalida("frascos_invalidos");

  return prisma.$transaction(
    async (tx) => {
      const pedido = await tx.order.findUnique({ where: { id: input.orderId }, include: { items: true } });
      if (!pedido) throw new TiendaInvalida("pedido_no_encontrado");
      if (pedido.status !== "paid") throw new TiendaInvalida(`pedido_no_despachable:${pedido.status}`);

      for (const item of pedido.items) {
        const suma = filas.filter((f) => f.orderItemId === item.id).reduce((a, f) => a + f.units, 0);
        if (suma !== item.quantity) throw new TiendaInvalida(`no_cuadra:${item.quantity}:${suma}`);
      }
      const itemPorId = new Map(pedido.items.map((i) => [i.id, i]));
      if (filas.some((f) => !itemPorId.has(f.orderItemId))) throw new TiendaInvalida("articulo_ajeno");

      const creadas = [];
      for (const f of filas) {
        const item = itemPorId.get(f.orderItemId)!;
        const disp = (await disponiblesPorLote(tx, item.productVariantId)).get(f.lotId) ?? 0;
        if (f.units > disp) throw new TiendaInvalida(`lote_sin_tantos:${disp}`);
        const envasado = await tx.lotTransformationOutput.findFirst({
          where: { lotId: f.lotId, transformation: { transformationType: "packaging" } },
          select: { transformation: { select: { packageNetMassG: true } } },
        });
        const netoG = envasado?.transformation.packageNetMassG;
        if (netoG == null) throw new TiendaInvalida("lote_no_envasado");
        const kg = new Prisma.Decimal(netoG).mul(f.units).div(1000);
        const saldo = await computeLotBalance(tx, f.lotId);
        if (!saldo.recorded || saldo.quantity.lessThan(kg)) throw new TiendaInvalida("libro_sin_saldo");

        const asiento = await tx.quantityEvent.create({
          data: {
            lotId: f.lotId, eventType: "transfer_out", quantity: kg, unit: "kg", occurredAt: input.despachadoEn,
            createdBy: userAccountId, provenanceClass: "original_record", sourceReference: `order:${pedido.orderNumber}`,
          },
        });
        creadas.push(
          await tx.orderItemLot.create({
            data: { orderItemId: f.orderItemId, lotId: f.lotId, units: f.units, quantityEventId: asiento.id, dispatchedAt: input.despachadoEn, dispatchedBy: userAccountId },
          }),
        );
      }

      const despues = await tx.order.update({ where: { id: pedido.id }, data: { status: "fulfilled" } });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "order.fulfill",
          entityType: "order",
          entityId: pedido.id,
          before: { status: pedido.status },
          after: { status: despues.status, lotes: creadas.map((c) => ({ orderItemId: c.orderItemId, lotId: c.lotId, units: c.units })) },
          sourceInterface: "commerce.tienda",
        },
        tx,
      );
      return { pedido: despues, lotes: creadas };
    },
    { isolationLevel: "Serializable" },
  );
}

export interface AnularAsignacionInput {
  allocationId: string;
  /** Obligatorio: una anulación sin motivo no se puede discutir después. */
  reason: string;
  /** El DÍA de la anulación. */
  cancelledAt: Date;
}

/**
 * Anular una asignación que NUNCA se recibió — ADR-170. Sus envases vuelven a libres para
 * asignarse de nuevo. **No se borra**: queda con quién, cuándo y por qué.
 *
 * Puede anular quien gestiona el LOTE (quien asignó) o quien lleva la TIENDA (quien iba a
 * recibir): los dos lados saben que el envío no va a salir. **Una asignación recibida no se
 * anula**: esos frascos ya están en el estante. La actualización lleva `receivedAt: null` y
 * `cancelledAt: null` en su condición, así que no pisa una recepción que llegue a la vez.
 */
export async function anularAsignacion(userAccountId: string, input: AnularAsignacionInput) {
  const motivo = input.reason.trim();
  if (!motivo) throw new TiendaInvalida("anular_sin_motivo");
  const antes = await prisma.storeAllocation.findUnique({ where: { id: input.allocationId }, include: { lot: true } });
  if (!antes) throw new TiendaInvalida("asignacion_no_encontrada");
  if (!(await puedeGestionarTienda(userAccountId))) await requireLotAccess(userAccountId, "manage", [antes.lot]);
  if (antes.receivedAt) throw new TiendaInvalida("ya_recibida");
  if (antes.cancelledAt) throw new TiendaInvalida("asignacion_anulada");

  return prisma.$transaction(async (tx) => {
    const hecho = await tx.storeAllocation.updateMany({
      where: { id: antes.id, receivedAt: null, cancelledAt: null },
      data: { cancelledAt: input.cancelledAt, cancelledBy: userAccountId, cancelReason: motivo },
    });
    if (hecho.count !== 1) throw new TiendaInvalida("ya_recibida");
    const despues = await tx.storeAllocation.findUniqueOrThrow({ where: { id: antes.id } });
    const { lot: _lote, ...fila } = antes;
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "store_allocation.cancel",
        entityType: "store_allocation",
        entityId: antes.id,
        before: fila,
        after: despues,
        reason: motivo,
        sourceInterface: "commerce.tienda",
      },
      tx,
    );
    return despues;
  });
}
