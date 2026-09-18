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
      const ya = await tx.storeAllocation.aggregate({ where: { lotId: lote.id }, _sum: { unitsAssigned: true } });
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
    if (recibidos > antes.unitsAssigned) throw new TiendaInvalida(`mas_de_lo_asignado:${antes.unitsAssigned}`);
    if (recibidos < antes.unitsAssigned && !nota) throw new TiendaInvalida("faltante_sin_motivo");

    const hecho = await tx.storeAllocation.updateMany({
      where: { id: antes.id, receivedAt: null },
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
      where: { receivedAt: null },
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
      productVariant: { select: { sku: true, variantName: true, product: { select: { name: true } } } },
    },
  });
  const asignados = filas.reduce((a, f) => a + f.unitsAssigned, 0);
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
