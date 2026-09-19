/**
 * Los pedidos de cereza del beneficio: a quién, cuánto, con qué margen, y la calidad pedida.
 *
 * Spec: docs/superpowers/specs/2026-09-19-recepcion-de-cereza-en-beneficio-design.md §3.3. Daniel,
 * 2026-09-19: «solicité 500 kg de cerezas y llegaron 520 kg… se solicitó tanto rojo con tanto
 * margen % de verde».
 *
 * - **Opcional**, y a **cualquier fuente**: una finca propia (su `site`) o un productor de fuera.
 * - **La cantidad se compara aquí; la calidad se guarda y la evalúa la pieza 3**, con `prime_ripe`,
 *   `underripe` y `floaters` de la selección.
 * - **Lo que falta se juzga al cerrar** (mientras está abierto pueden llegar más entregas); el
 *   exceso lo juzga la recepción que lo cruza (`recepcionesDeCereza.ts`). **Nunca bloquea.**
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLotAccess } from "./lots";

export class PedidoError extends Error {}

export type FuenteDePedido = { fincaSiteId: string } | { proveedorId: string };

async function beneficio(beneficioId: string) {
  const b = await prisma.location.findUnique({ where: { id: beneficioId }, select: { id: true, locationType: true, classification: true } });
  if (!b || b.locationType !== "beneficio") throw new PedidoError("beneficio_no_valido");
  return b;
}

export async function exigeGestionarBeneficio(userAccountId: string, beneficioId: string) {
  const b = await beneficio(beneficioId);
  await requireLotAccess(userAccountId, "manage", [{ locationId: b.id, classification: b.classification }]);
  return b;
}

export async function exigeVerBeneficio(userAccountId: string, beneficioId: string) {
  const b = await beneficio(beneficioId);
  await requireLotAccess(userAccountId, "view", [{ locationId: b.id, classification: b.classification }]);
  return b;
}

/**
 * Lo recibido contra lo pedido. `exceso` y `falta` son contra el margen: 500 pedidos con 2 % de
 * margen admiten de 490 a 510 sin nota.
 */
export function cantidadDelPedido(kgPedidos: number, recibidoKg: number, margenPct: number) {
  // En enteros —gramos y centésimas de punto, la resolución de las columnas— para que el borde sea
  // exacto: en coma flotante, 100 × (1 + 13/100) da 112,99999999999999 y 113 kg salían «exceso»
  // (revisión de Codex, hallazgo 8).
  const pedidoG = Math.round(kgPedidos * 1000);
  const recibidoG = Math.round(recibidoKg * 1000);
  const margenBp = Math.round(margenPct * 100);
  const diferenciaKg = (recibidoG - pedidoG) / 1000;
  return {
    diferenciaKg,
    diferenciaPct: (recibidoG - pedidoG) / pedidoG,
    exceso: recibidoG * 10_000 > pedidoG * (10_000 + margenBp),
    falta: recibidoG * 10_000 < pedidoG * (10_000 - margenBp),
  };
}

function exigePct(v: number | null | undefined, campo: string) {
  if (v == null) return null;
  if (!(Number.isFinite(v) && v >= 0 && v <= 100)) throw new PedidoError(`${campo}_invalido`);
  return v;
}

export async function crearPedido(
  userAccountId: string,
  input: {
    beneficioId: string;
    fuente: FuenteDePedido;
    fecha: Date;
    kgPedidos: number;
    margenCantidadPct: number;
    minMaduroPct?: number | null;
    maxVerdePct?: number | null;
    maxFlotesPct?: number | null;
  },
) {
  await exigeGestionarBeneficio(userAccountId, input.beneficioId);
  if (Number.isNaN(input.fecha.getTime())) throw new PedidoError("fecha_invalida");
  if (!(Number.isFinite(input.kgPedidos) && input.kgPedidos > 0)) throw new PedidoError("kg_invalidos");
  if (!(Number.isFinite(input.margenCantidadPct) && input.margenCantidadPct >= 0)) throw new PedidoError("margen_invalido");
  if ("fincaSiteId" in input.fuente) {
    const f = await prisma.location.findUnique({ where: { id: input.fuente.fincaSiteId }, select: { locationType: true } });
    if (f?.locationType !== "site") throw new PedidoError("fuente_no_valida");
  } else {
    const p = await prisma.organization.findUnique({ where: { id: input.fuente.proveedorId }, select: { organizationType: true } });
    if (p?.organizationType !== "producer") throw new PedidoError("fuente_no_valida");
  }
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoDeCereza.create({
      data: {
        beneficioId: input.beneficioId,
        fincaSiteId: "fincaSiteId" in input.fuente ? input.fuente.fincaSiteId : null,
        proveedorId: "proveedorId" in input.fuente ? input.fuente.proveedorId : null,
        fecha: input.fecha,
        kgPedidos: input.kgPedidos,
        margenCantidadPct: input.margenCantidadPct,
        minMaduroPct: exigePct(input.minMaduroPct, "min_maduro"),
        maxVerdePct: exigePct(input.maxVerdePct, "max_verde"),
        maxFlotesPct: exigePct(input.maxFlotesPct, "max_flotes"),
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "cherry_order.create", entityType: "pedido_de_cereza", entityId: pedido.id, after: pedido, sourceInterface: "traceability.service" },
      tx,
    );
    return pedido;
  });
}

async function recibidoDe(pedidoIds: readonly string[]) {
  const filas = await prisma.recepcionDeCereza.groupBy({
    by: ["pedidoId"],
    where: { pedidoId: { in: [...pedidoIds] }, estado: "recibida" },
    _sum: { netoKg: true },
  });
  return new Map(filas.map((f) => [f.pedidoId as string, Number(f._sum.netoKg ?? 0)]));
}

/** Cierra un pedido. Si lo recibido se queda por debajo del margen, cerrar exige nota. */
export async function cerrarPedido(userAccountId: string, input: { pedidoId: string; nota?: string | null }) {
  const pedido = await prisma.pedidoDeCereza.findUnique({ where: { id: input.pedidoId } });
  if (!pedido) throw new PedidoError("pedido_no_encontrado");
  await exigeGestionarBeneficio(userAccountId, pedido.beneficioId);
  const nota = input.nota?.trim() || null;
  return prisma.$transaction(async (tx) => {
    // Dos cierres a la vez: el segundo espera y ve «cerrado» (revisión de Codex, hallazgo 6).
    await tx.$queryRaw`SELECT "id" FROM "traceability"."pedido_de_cereza" WHERE "id" = ${pedido.id}::uuid FOR UPDATE`;
    const antes = await tx.pedidoDeCereza.findUniqueOrThrow({ where: { id: pedido.id } });
    if (antes.estado !== "abierto") throw new PedidoError("ya_cerrado");
    const suma = await tx.recepcionDeCereza.aggregate({ where: { pedidoId: antes.id, estado: "recibida" }, _sum: { netoKg: true } });
    const c = cantidadDelPedido(Number(antes.kgPedidos), Number(suma._sum.netoKg ?? 0), Number(antes.margenCantidadPct));
    if (c.falta && !nota) throw new PedidoError("nota_obligatoria");
    const despues = await tx.pedidoDeCereza.update({ where: { id: antes.id }, data: { estado: "cerrado", cerradoAt: new Date(), notaDeCierre: nota } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "cherry_order.close", entityType: "pedido_de_cereza", entityId: antes.id, before: antes, after: despues, sourceInterface: "traceability.service" },
      tx,
    );
    return despues;
  });
}

/** Los pedidos de un beneficio, con lo recibido contra lo pedido. */
export async function pedidosDeBeneficio(userAccountId: string, beneficioId: string) {
  await exigeVerBeneficio(userAccountId, beneficioId);
  const pedidos = await prisma.pedidoDeCereza.findMany({
    where: { beneficioId },
    orderBy: [{ estado: "asc" }, { fecha: "desc" }],
    include: { fincaSite: { select: { id: true, name: true } }, proveedor: { select: { id: true, name: true } } },
  });
  const recibido = await recibidoDe(pedidos.map((p) => p.id));
  return pedidos.map((p) => {
    const kg = recibido.get(p.id) ?? 0;
    const c = cantidadDelPedido(Number(p.kgPedidos), kg, Number(p.margenCantidadPct));
    return { ...p, recibidoKg: kg, diferenciaKg: c.diferenciaKg, diferenciaPct: c.diferenciaPct, exceso: c.exceso, falta: c.falta };
  });
}
