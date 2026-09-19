/**
 * ADR-163 — de un lote de miel envasado a la tienda, contra Postgres.
 *
 * **Lo que sólo se puede afirmar con la base:** que asignar NO toca el inventario y recibir sí,
 * que no se asignan más envases de los que salieron del envasado, que una recepción no suma dos
 * veces, y que las reglas de la recepción viven también en la base.
 *
 * **Las aserciones filtran por los ids de esta corrida.** El gestor de la tienda es Platform
 * Admin, que ve la base compartida entera (la lección de PR #395): nada aquí cuenta filas globales.
 *
 * Grupo `base-sembrada`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony } from "../../lib/apiary/hives";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { completarCierreDeCosecha } from "../../lib/apiary/cierreDeCosecha";
import { envasarMiel, procesarMiel } from "../../lib/apiary/mielDelLote";
import { anularAsignacion, asignacionesDeLote, asignarATienda, confirmarRecepcion, crearVariante, despacharPedido, pedidosPorDespachar, tiendaParaGestionar } from "../../lib/commerce/tienda";
import { computeCurrentQuantity } from "../../lib/traceability/quantity";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `tnd-${Date.now()}`;
const DIA = new Date("2026-09-15T00:00:00Z");

describe("de un lote envasado a la tienda", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let operador: string;
  let tendero: string;
  let otro: string;
  let scopeId: string;
  const personIds: string[] = [];
  let colonyId: string;
  let productId: string;
  const lotes: string[] = [];

  async function crearCuenta(etiqueta: string) {
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN_ID})`, locale: "es" },
    });
    personIds.push(person.id);
    return (await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })).id;
  }

  /** Cosecha de 30 kg → proceso → 40 envases de 500 g. Devuelve el lote envasado y el procesado. */
  let n = 0;
  async function loteEnvasado() {
    n += 1;
    const { harvestEvent, lot } = await recordApiaryHarvest(operador, {
      colonyId, lotCode: `MIEL-${RUN_ID.slice(-6)}-${n}`, occurredAt: new Date("2026-09-01T09:00:00Z"),
      framesHarvested: 6, provenanceClass: "direct_observation",
    });
    lotes.push(lot.id);
    await completarCierreDeCosecha(operador, { apiaryHarvestEventId: harvestEvent.id, extractedWeightKg: 30 });
    const p = await procesarMiel(operador, {
      lotId: lot.id, occurredAt: DIA, acts: ["colado"], inputKg: 30, outputKg: 30, provenanceClass: "measured_fact",
    });
    const e = await envasarMiel(operador, {
      lotId: p.lote.id, occurredAt: DIA, inputKg: 20, packageCount: 40, packageNetMassG: 500, provenanceClass: "measured_fact",
    });
    return { envasado: e.lote, procesado: p.lote };
  }

  let nv = 0;
  async function variante(inventoryCount: number | null = null) {
    nv += 1;
    const v = await crearVariante(tendero, { productId, variantName: `Miel 500 g ${nv}`, sku: `${RUN_ID}-${nv}`, priceAmount: 12 });
    if (inventoryCount !== null) await prisma.productVariant.update({ where: { id: v.id }, data: { inventoryCount } });
    return v.id;
  }

  /** Un pedido PAGADO de `cantidades` frascos por variante, a nombre del operador. */
  let np = 0;
  async function pedidoPagado(lineas: { variante: string; cantidad: number }[], status: "paid" | "pending_payment" = "paid") {
    np += 1;
    return prisma.order.create({
      data: {
        orderNumber: `${RUN_ID}-P${np}`, userAccountId: operador, status, subtotalAmount: 0,
        items: { create: lineas.map((l) => ({ productVariantId: l.variante, quantity: l.cantidad, unitPriceAmount: 12, currency: "USD" })) },
      },
      include: { items: true },
    });
  }

  /** Un lote envasado (40 × 500 g) con `recibidos` frascos ya recibidos en la tienda para `v`. */
  async function enTienda(v: string, recibidos: number) {
    const { envasado } = await loteEnvasado();
    const a = await asignarATienda(operador, { lotId: envasado.id, productVariantId: v, unitsAssigned: recibidos, assignedAt: DIA });
    await confirmarRecepcion(tendero, { allocationId: a.id, unitsReceived: recibidos, receivedAt: DIA });
    return envasado;
  }

  const saldoKg = async (lotId: string) => Number((await computeCurrentQuantity(tendero, lotId)).quantity);

  const inventario = async (id: string) => (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).inventoryCount;

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
      })
    ).id;
    projectId = (await prisma.project.create({ data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" } })).id;
    locationId = (
      await prisma.location.create({
        data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
      })
    ).id;
    operador = await crearCuenta("Operador");
    tendero = await crearCuenta("Tendero");
    otro = await crearCuenta("Otro");
    const fo = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    scopeId = (await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } })).id;
    await prisma.assignment.create({ data: { userAccountId: operador, roleProfileId: fo.id, scopeId } });
    // El ámbito de plataforma se REUSA, nunca se crea ni se borra: es compartido.
    const pa = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
    const plataforma =
      (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
      (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
    await prisma.assignment.create({ data: { userAccountId: tendero, roleProfileId: pa.id, scopeId: plataforma.id } });

    const hive = await createHive(operador, { projectId, locationId, identifier: `T-${RUN_ID.slice(-4)}` });
    colonyId = (
      await createColony(operador, { hiveId: hive.id, originType: "captured", startedAt: new Date("2026-01-01"), provenanceClass: "direct_observation" })
    ).id;
    productId = (await prisma.product.create({ data: { slug: `test-${RUN_ID}`, name: `TEST Miel (${RUN_ID})` } })).id;
  });

  afterEach(async () => {
    for (;;) {
      const hijos = await prisma.lotTransformationOutput.findMany({
        where: { transformation: { inputs: { some: { lotId: { in: lotes } } } }, lotId: { notIn: lotes } },
        select: { lotId: true },
      });
      if (hijos.length === 0) break;
      lotes.push(...hijos.map((h) => h.lotId));
    }
    const trans = (
      await prisma.lotTransformationInput.findMany({ where: assertDefinedWhere({ lotId: { in: lotes } }), select: { transformationId: true } })
    ).map((x) => x.transformationId);
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: [operador, tendero, otro] } }) });
    // El despacho antes que el libro: su fila apunta al asiento con RESTRICT.
    await prisma.orderItemLot.deleteMany({ where: assertDefinedWhere({ orderItem: { order: { orderNumber: { startsWith: RUN_ID } } } }) });
    await prisma.orderItem.deleteMany({ where: assertDefinedWhere({ order: { orderNumber: { startsWith: RUN_ID } } }) });
    await prisma.order.deleteMany({ where: assertDefinedWhere({ orderNumber: { startsWith: RUN_ID } }) });
    await prisma.storeAllocation.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
    await prisma.deviation.deleteMany({ where: assertDefinedWhere({ lotTransformationId: { in: trans } }) });
    await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
    await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: trans } }) });
    await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: trans } }) });
    await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: trans } }) });
    await prisma.apiaryHarvestEvent.deleteMany({ where: assertDefinedWhere({ colonyId }) });
    await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
    await prisma.productVariant.deleteMany({ where: assertDefinedWhere({ productId }) });
    lotes.length = 0;
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: assertDefinedWhere({ id: productId }) });
    const colonias = await prisma.colony.findMany({ where: { hive: { locationId } }, select: { id: true } });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias.map((c) => c.id) } }) });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [operador, tendero, otro] } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [operador, tendero, otro] } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("LO QUE EL DUEÑO PIDIÓ: asignar NO toca la tienda; recibir sí, y sólo lo que llegó", async () => {
    const { envasado } = await loteEnvasado();
    const v = await variante();
    const a = await asignarATienda(operador, { lotId: envasado.id, productVariantId: v, unitsAssigned: 30, assignedAt: DIA });
    expect(await inventario(v)).toBeNull();
    const pendiente = (await tiendaParaGestionar(tendero)).pendientes.filter((p) => p.id === a.id);
    expect(pendiente.map((p) => p.unitsAssigned)).toEqual([30]);

    const r = await confirmarRecepcion(tendero, { allocationId: a.id, unitsReceived: 28, receiptNote: "dos frascos rotos", receivedAt: DIA });
    expect(r.inventario).toBe(28);
    expect(await inventario(v)).toBe(28);
    const fila = await prisma.storeAllocation.findUniqueOrThrow({ where: { id: a.id } });
    expect([fila.unitsReceived, fila.receivedBy, fila.receiptNote]).toEqual([28, tendero, "dos frascos rotos"]);
    expect((await tiendaParaGestionar(tendero)).pendientes.some((p) => p.id === a.id)).toBe(false);
  });

  it("NO SE ASIGNAN MÁS ENVASES DE LOS QUE SALIERON del envasado, sumando lo ya asignado", async () => {
    const { envasado } = await loteEnvasado();
    const v = await variante();
    await asignarATienda(operador, { lotId: envasado.id, productVariantId: v, unitsAssigned: 30, assignedAt: DIA });
    await expect(
      asignarATienda(operador, { lotId: envasado.id, productVariantId: v, unitsAssigned: 11, assignedAt: DIA }),
    ).rejects.toThrow(/mas_envases_de_los_que_hay:10/);
    const resumen = await asignacionesDeLote(envasado.id);
    expect([resumen?.envases, resumen?.asignados, resumen?.libres]).toEqual([40, 30, 10]);
  });

  it("UN LOTE QUE NO SALIÓ DE UN ENVASADO no tiene envases que asignar", async () => {
    const { procesado } = await loteEnvasado();
    const v = await variante();
    await expect(
      asignarATienda(operador, { lotId: procesado.id, productVariantId: v, unitsAssigned: 1, assignedAt: DIA }),
    ).rejects.toThrow(/el_lote_no_esta_envasado/);
    expect(await asignacionesDeLote(procesado.id)).toBeNull();
  });

  it("UNA RECEPCIÓN NO SUMA DOS VECES, y el inventario que ya había se respeta", async () => {
    const { envasado } = await loteEnvasado();
    const v = await variante(5);
    const a = await asignarATienda(operador, { lotId: envasado.id, productVariantId: v, unitsAssigned: 10, assignedAt: DIA });
    await confirmarRecepcion(tendero, { allocationId: a.id, unitsReceived: 10, receivedAt: DIA });
    await expect(confirmarRecepcion(tendero, { allocationId: a.id, unitsReceived: 10, receivedAt: DIA })).rejects.toThrow(/ya_recibida/);
    expect(await inventario(v)).toBe(15);
  });

  it("FALTANTE SIN MOTIVO y MÁS DE LO ASIGNADO se rechazan, y el inventario no se mueve", async () => {
    const { envasado } = await loteEnvasado();
    const v = await variante();
    const a = await asignarATienda(operador, { lotId: envasado.id, productVariantId: v, unitsAssigned: 10, assignedAt: DIA });
    await expect(confirmarRecepcion(tendero, { allocationId: a.id, unitsReceived: 9, receivedAt: DIA })).rejects.toThrow(/faltante_sin_motivo/);
    await expect(confirmarRecepcion(tendero, { allocationId: a.id, unitsReceived: 11, receivedAt: DIA })).rejects.toThrow(/mas_de_lo_asignado:10/);
    expect(await inventario(v)).toBeNull();
  });

  it("QUIEN ENVASA NO RECIBE: confirmar y crear variantes exigen commerce:manage_store", async () => {
    const { envasado } = await loteEnvasado();
    const v = await variante();
    const a = await asignarATienda(operador, { lotId: envasado.id, productVariantId: v, unitsAssigned: 5, assignedAt: DIA });
    await expect(confirmarRecepcion(operador, { allocationId: a.id, unitsReceived: 5, receivedAt: DIA })).rejects.toThrow(/sin_permiso_de_tienda/);
    await expect(crearVariante(operador, { productId, variantName: "x", sku: `${RUN_ID}-x`, priceAmount: 1 })).rejects.toThrow(/sin_permiso_de_tienda/);
    expect(await inventario(v)).toBeNull();
  });

  it("QUIEN NO TIENE EL LOTE no lo asigna", async () => {
    const { envasado } = await loteEnvasado();
    const v = await variante();
    await expect(
      asignarATienda(otro, { lotId: envasado.id, productVariantId: v, unitsAssigned: 1, assignedAt: DIA }),
    ).rejects.toThrow(/no_lot_access/);
  });

  it("un SKU repetido se rechaza con su nombre, no con un error de base", async () => {
    await variante();
    await expect(crearVariante(tendero, { productId, variantName: "otra", sku: `${RUN_ID}-${nv}`, priceAmount: 3 })).rejects.toThrow(/sku_repetido/);
  });

  it("ADR-169 — DESPACHAR: quien despacha dice el lote, el pedido queda servido y el libro del lote baja", async () => {
    const v = await variante();
    const lote = await enTienda(v, 30);
    const antes = await saldoKg(lote.id);
    const pedido = await pedidoPagado([{ variante: v, cantidad: 3 }]);
    await despacharPedido(tendero, { orderId: pedido.id, despachadoEn: DIA, filas: [{ orderItemId: pedido.items[0]!.id, lotId: lote.id, units: 3 }] });

    expect((await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } })).status).toBe("fulfilled");
    const fila = await prisma.orderItemLot.findFirstOrThrow({ where: { orderItemId: pedido.items[0]!.id } });
    expect([fila.lotId, fila.units, fila.dispatchedBy]).toEqual([lote.id, 3, tendero]);
    // 3 frascos × 500 g = 1,5 kg fuera del libro del lote.
    expect(antes - (await saldoKg(lote.id))).toBeCloseTo(1.5, 6);
    expect((await pedidosPorDespachar(tendero)).some((p) => p.id === pedido.id)).toBe(false);
  });

  it("ADR-169 — UN ARTÍCULO PUEDE SALIR DE DOS LOTES, y la lista ofrece los dos con lo que queda", async () => {
    const v = await variante();
    const a = await enTienda(v, 3);
    const b = await enTienda(v, 4);
    const pedido = await pedidoPagado([{ variante: v, cantidad: 5 }]);
    const ofrecidos = (await pedidosPorDespachar(tendero)).find((p) => p.id === pedido.id)!.items[0]!.lotes;
    expect(ofrecidos.map((l) => [l.lotId, l.disponibles]).sort()).toEqual([[a.id, 3], [b.id, 4]].sort());
    await despacharPedido(tendero, {
      orderId: pedido.id, despachadoEn: DIA,
      filas: [{ orderItemId: pedido.items[0]!.id, lotId: a.id, units: 3 }, { orderItemId: pedido.items[0]!.id, lotId: b.id, units: "2" }],
    });
    expect(await prisma.orderItemLot.count({ where: { orderItemId: pedido.items[0]!.id } })).toBe(2);
  });

  it("ADR-169 — SI NO CUADRA CON LO PEDIDO no se despacha nada", async () => {
    const v = await variante();
    const lote = await enTienda(v, 10);
    const antes = await saldoKg(lote.id);
    const pedido = await pedidoPagado([{ variante: v, cantidad: 3 }]);
    await expect(
      despacharPedido(tendero, { orderId: pedido.id, despachadoEn: DIA, filas: [{ orderItemId: pedido.items[0]!.id, lotId: lote.id, units: 2 }] }),
    ).rejects.toThrow(/no_cuadra:3:2/);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } })).status).toBe("paid");
    expect(await saldoKg(lote.id)).toBe(antes);
  });

  it("ADR-169 — DE UN LOTE NO SALE MÁS DE LO RECIBIDO; lo asignado y no recibido no está en el estante", async () => {
    const v = await variante();
    const recibido = await enTienda(v, 2);
    const { envasado: soloAsignado } = await loteEnvasado();
    await asignarATienda(operador, { lotId: soloAsignado.id, productVariantId: v, unitsAssigned: 10, assignedAt: DIA });
    const pedido = await pedidoPagado([{ variante: v, cantidad: 3 }]);
    const item = pedido.items[0]!.id;
    await expect(
      despacharPedido(tendero, { orderId: pedido.id, despachadoEn: DIA, filas: [{ orderItemId: item, lotId: recibido.id, units: 3 }] }),
    ).rejects.toThrow(/lote_sin_tantos:2/);
    await expect(
      despacharPedido(tendero, { orderId: pedido.id, despachadoEn: DIA, filas: [{ orderItemId: item, lotId: soloAsignado.id, units: 3 }] }),
    ).rejects.toThrow(/lote_sin_tantos:0/);
  });

  it("ADR-169 — LO YA DESPACHADO SALE DEL ESTANTE: un segundo pedido no puede llevarse los mismos frascos", async () => {
    // Lo destapó un flip-test: ninguna prueba despachaba dos veces del mismo lote, así que restar
    // lo ya despachado podía desaparecer sin que nada cayera.
    const v = await variante();
    const lote = await enTienda(v, 3);
    const primero = await pedidoPagado([{ variante: v, cantidad: 2 }]);
    await despacharPedido(tendero, { orderId: primero.id, despachadoEn: DIA, filas: [{ orderItemId: primero.items[0]!.id, lotId: lote.id, units: 2 }] });
    const segundo = await pedidoPagado([{ variante: v, cantidad: 2 }]);
    await expect(
      despacharPedido(tendero, { orderId: segundo.id, despachadoEn: DIA, filas: [{ orderItemId: segundo.items[0]!.id, lotId: lote.id, units: 2 }] }),
    ).rejects.toThrow(/lote_sin_tantos:1/);
  });

  it("ADR-169 — UN PEDIDO SIN PAGAR no se despacha, y quien envasa no despacha", async () => {
    const v = await variante();
    const lote = await enTienda(v, 5);
    const sinPagar = await pedidoPagado([{ variante: v, cantidad: 1 }], "pending_payment");
    await expect(
      despacharPedido(tendero, { orderId: sinPagar.id, despachadoEn: DIA, filas: [{ orderItemId: sinPagar.items[0]!.id, lotId: lote.id, units: 1 }] }),
    ).rejects.toThrow(/pedido_no_despachable:pending_payment/);
    const pagado = await pedidoPagado([{ variante: v, cantidad: 1 }]);
    await expect(
      despacharPedido(operador, { orderId: pagado.id, despachadoEn: DIA, filas: [{ orderItemId: pagado.items[0]!.id, lotId: lote.id, units: 1 }] }),
    ).rejects.toThrow(/sin_permiso_de_tienda/);
  });

  it("ADR-170 — ANULAR libera los envases, deja quién, cuándo y por qué, y la tienda deja de esperarla", async () => {
    const { envasado } = await loteEnvasado();
    const v = await variante();
    const a = await asignarATienda(operador, { lotId: envasado.id, productVariantId: v, unitsAssigned: 40, assignedAt: DIA });
    await expect(
      asignarATienda(operador, { lotId: envasado.id, productVariantId: v, unitsAssigned: 1, assignedAt: DIA }),
    ).rejects.toThrow(/mas_envases_de_los_que_hay:0/);

    await anularAsignacion(operador, { allocationId: a.id, reason: "  el camión no sale  ", cancelledAt: DIA });
    const fila = await prisma.storeAllocation.findUniqueOrThrow({ where: { id: a.id } });
    expect([fila.cancelledBy, fila.cancelReason, fila.cancelledAt?.toISOString()]).toEqual([operador, "el camión no sale", DIA.toISOString()]);
    const resumen = await asignacionesDeLote(envasado.id);
    expect([resumen?.asignados, resumen?.libres]).toEqual([0, 40]);
    expect((await tiendaParaGestionar(tendero)).pendientes.some((p) => p.id === a.id)).toBe(false);
    const auditoria = await prisma.auditEvent.findMany({ where: { entityId: a.id, operation: "store_allocation.cancel" } });
    expect(auditoria.map((x) => x.actorUserAccountId)).toEqual([operador]);

    // Libres de verdad: se pueden volver a asignar enteros.
    await asignarATienda(operador, { lotId: envasado.id, productVariantId: v, unitsAssigned: 40, assignedAt: DIA });
    expect(await inventario(v)).toBeNull();
  });

  it("ADR-170 — UNA ANULADA NO SE RECIBE, UNA RECIBIDA NO SE ANULA, y ninguna se anula dos veces", async () => {
    const { envasado } = await loteEnvasado();
    const v = await variante();
    const a = await asignarATienda(operador, { lotId: envasado.id, productVariantId: v, unitsAssigned: 10, assignedAt: DIA });
    const b = await asignarATienda(operador, { lotId: envasado.id, productVariantId: v, unitsAssigned: 10, assignedAt: DIA });
    await anularAsignacion(tendero, { allocationId: a.id, reason: "no hay sitio en la tienda", cancelledAt: DIA });
    await expect(confirmarRecepcion(tendero, { allocationId: a.id, unitsReceived: 10, receivedAt: DIA })).rejects.toThrow(/asignacion_anulada/);
    await expect(anularAsignacion(operador, { allocationId: a.id, reason: "otra vez", cancelledAt: DIA })).rejects.toThrow(/asignacion_anulada/);
    await confirmarRecepcion(tendero, { allocationId: b.id, unitsReceived: 10, receivedAt: DIA });
    await expect(anularAsignacion(operador, { allocationId: b.id, reason: "tarde", cancelledAt: DIA })).rejects.toThrow(/ya_recibida/);
    expect(await inventario(v)).toBe(10);
  });

  it("ADR-170 — SIN MOTIVO no se anula, y QUIEN NO TIENE NI EL LOTE NI LA TIENDA tampoco", async () => {
    const { envasado } = await loteEnvasado();
    const v = await variante();
    const a = await asignarATienda(operador, { lotId: envasado.id, productVariantId: v, unitsAssigned: 10, assignedAt: DIA });
    await expect(anularAsignacion(operador, { allocationId: a.id, reason: "   ", cancelledAt: DIA })).rejects.toThrow(/anular_sin_motivo/);
    await expect(anularAsignacion(otro, { allocationId: a.id, reason: "porque sí", cancelledAt: DIA })).rejects.toThrow(/no_lot_access/);
    const fila = await prisma.storeAllocation.findUniqueOrThrow({ where: { id: a.id } });
    expect(fila.cancelledAt).toBeNull();
  });

  it("LAS REGLAS VIVEN EN LA BASE: cada CHECK rechaza lo suyo, y lo válido entra", async () => {
    const { envasado } = await loteEnvasado();
    const v = await variante();
    async function sonda(cols: string, vals: string): Promise<string> {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `INSERT INTO commerce.store_allocation (lot_id, product_variant_id, assigned_at, assigned_by, units_assigned${cols})
             VALUES ('${envasado.id}', '${v}', now(), '${operador}', 10${vals})`,
          );
          throw new Error("DESHACER");
        });
      } catch (e) {
        const m = (e as Error).message;
        if (m.includes("DESHACER")) return "entra";
        return m.match(/store_allocation_[a-z_]+/)?.[0] ?? m.slice(0, 120);
      }
      return "?";
    }
    const recep = (n: number, nota: string | null) =>
      [", received_at, received_by, units_received, receipt_note", `, now(), '${tendero}', ${n}, ${nota === null ? "NULL" : `'${nota}'`}`] as const;
    expect(await sonda("", "")).toBe("entra");
    expect(await sonda(...recep(8, "rotos"))).toBe("entra");
    expect(await sonda(", units_received", ", 10")).toBe("store_allocation_recepcion_completa");
    expect(await sonda(...recep(8, null))).toBe("store_allocation_faltante_dice_por_que");
    expect(await sonda(...recep(11, "x"))).toBe("store_allocation_recibidos_en_rango");
    const anul = (motivo: string | null) =>
      [", cancelled_at, cancelled_by, cancel_reason", `, now(), '${operador}', ${motivo === null ? "NULL" : `'${motivo}'`}`] as const;
    expect(await sonda(...anul("no sale"))).toBe("entra");
    expect(await sonda(...anul(null))).toBe("store_allocation_anulacion_completa");
    expect(await sonda(...anul("   "))).toBe("store_allocation_anulacion_completa");
    expect(await sonda(", cancelled_at", ", now()")).toBe("store_allocation_anulacion_completa");
    expect(
      await sonda(
        ", received_at, received_by, units_received, cancelled_at, cancelled_by, cancel_reason",
        `, now(), '${tendero}', 10, now(), '${operador}', 'x'`,
      ),
    ).toBe("store_allocation_recibida_o_anulada");
    const cero = await sonda("", "").then(() =>
      prisma.$executeRawUnsafe(
        `INSERT INTO commerce.store_allocation (lot_id, product_variant_id, assigned_at, assigned_by, units_assigned) VALUES ('${envasado.id}', '${v}', now(), '${operador}', 0)`,
      ).then(() => "entra", (e: Error) => e.message.match(/store_allocation_[a-z_]+/)?.[0] ?? "otro"),
    );
    expect(cero).toBe("store_allocation_asignados_positivos");
  });
});
