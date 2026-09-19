/**
 * Pesaje de bandeja cargada y capacidad por estado (spec §4.2b). La capacidad es
 * DERIVADA y no se guarda: área × profundidad media × densidad media de los
 * pesajes vigentes de ese estado. Sin pesajes, el estimado SUPUESTO —sólo cereza—
 * o «sin medir». Nunca se rellena un hueco (21_rubrica_veracidad §2).
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { areaM2, tiposDeBandeja } from "../equipos/bandejas";
import { CAPACIDAD_SUPUESTA } from "../beneficio/capacidadSupuesta";

export type EstadoDeCarga = "CHERRY" | "MUCILAGE_HONEY" | "PARCHMENT";
const ESTADOS: EstadoDeCarga[] = ["CHERRY", "MUCILAGE_HONEY", "PARCHMENT"];
export class PesajeError extends Error {}

const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export async function registrarPesaje(userAccountId: string, input: {
  trayTypeId: string; lotId: string; materialState: EstadoDeCarga; netKg: number; profundidadesCm: number[];
  occurredAt: Date; operatorPersonId?: string | null; supersedesId?: string | null; correctionReason?: string | null;
}) {
  if (!ESTADOS.includes(input.materialState)) throw new PesajeError("estado_invalido");
  const n = input.profundidadesCm.length;
  if (!(Number.isFinite(input.netKg) && input.netKg > 0) || n < 3 || n > 4 || !input.profundidadesCm.every((p) => Number.isFinite(p) && p > 0)) {
    throw new PesajeError("datos_invalidos");
  }
  if (input.supersedesId && !input.correctionReason?.trim()) throw new PesajeError("datos_invalidos");
  const lot = await prisma.lot.findUniqueOrThrow({ where: { id: input.lotId } });
  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);
  const tipo = await prisma.dryingTrayType.findUnique({ where: { id: input.trayTypeId } });
  if (!tipo || tipo.organizationId !== lot.organizationId) throw new PesajeError("tipo_no_encontrado");

  // Corregir un pesaje exige gestionar SU lote, no sólo el que se presenta: sin
  // esto, quien gestiona L1 retiraba el pesaje de L2 (revisión de Codex del plan 2a).
  if (input.supersedesId) {
    const original = await prisma.dryingTrayWeighing.findUnique({ where: { id: input.supersedesId }, include: { lot: true } });
    if (!original || original.trayTypeId !== tipo.id || original.supersededAt) throw new PesajeError("datos_invalidos");
    await requireLotAccess(userAccountId, "manage", [{ projectId: original.lot.projectId, locationId: original.lot.locationId, classification: original.lot.classification }]);
  }

  const densidadKgM3 = input.netKg / (areaM2(tipo) * (media(input.profundidadesCm) / 100));
  return prisma.$transaction(async (tx) => {
    if (input.supersedesId) {
      const { count } = await tx.dryingTrayWeighing.updateMany({ where: { id: input.supersedesId, supersededAt: null, trayTypeId: tipo.id }, data: { supersededAt: new Date() } });
      if (count !== 1) throw new PesajeError("datos_invalidos");
    }
    const p = await tx.dryingTrayWeighing.create({ data: {
      trayTypeId: tipo.id, lotId: lot.id, materialState: input.materialState, netKg: input.netKg,
      depthPointsCm: input.profundidadesCm, occurredAt: input.occurredAt, operatorPersonId: input.operatorPersonId ?? null,
      provenanceClass: "measured_fact", supersedesId: input.supersedesId ?? null,
      correctionReason: input.correctionReason?.trim() || null, createdBy: userAccountId,
    } });
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: input.supersedesId ? "drying_tray_weighing.correct" : "drying_tray_weighing.create",
      entityType: "drying_tray_weighing", entityId: p.id, after: p, sourceInterface: "traceability.service" }, tx);
    return { id: p.id, densidadKgM3 };
  });
}

export async function capacidadDeTipo(userAccountId: string, trayTypeId: string) {
  const tipo = await prisma.dryingTrayType.findUniqueOrThrow({ where: { id: trayTypeId } });
  // Mismo permiso de lectura que la lista de tipos: quien no ve ninguno, no ve éste.
  if (!(await tiposDeBandeja(userAccountId, tipo.organizationId)).some((t) => t.id === tipo.id)) throw new PesajeError("tipo_no_encontrado");
  const area = areaM2(tipo);
  const pesajes = await prisma.dryingTrayWeighing.findMany({ where: { trayTypeId, supersededAt: null } });
  const estados = ESTADOS.map((estado) => {
    const suyos = pesajes.filter((p) => p.materialState === estado);
    if (suyos.length > 0) {
      const profundidades = suyos.map((p) => media(p.depthPointsCm.map(Number)));
      const densidades = suyos.map((p, i) => Number(p.netKg) / (area * (profundidades[i]! / 100)));
      const profundidadCm = media(profundidades);
      const densidadKgM3 = media(densidades);
      return { estado, fuente: "medido" as const, pesajes: suyos.length, pesajeIds: suyos.map((p) => p.id), densidadKgM3, profundidadCm,
        capacidadKg: area * (profundidadCm / 100) * densidadKgM3, fuenteDelEstimado: null };
    }
    const sup = (CAPACIDAD_SUPUESTA as Partial<Record<EstadoDeCarga, { densidadKgM3: number; profundidadCm: number; fuente: string }>>)[estado];
    if (sup) {
      return { estado, fuente: "estimado" as const, pesajes: 0, pesajeIds: [], densidadKgM3: sup.densidadKgM3, profundidadCm: sup.profundidadCm,
        capacidadKg: area * (sup.profundidadCm / 100) * sup.densidadKgM3, fuenteDelEstimado: sup.fuente };
    }
    return { estado, fuente: "sin_medir" as const, pesajes: 0, pesajeIds: [], densidadKgM3: null, profundidadCm: null, capacidadKg: null, fuenteDelEstimado: null };
  });
  return { areaM2: area, estados };
}

/**
 * El camino de vuelta de una capacidad medida (21_rubrica_veracidad §2.6: ninguna
 * cifra sin poder llegar a las lecturas que la formaron). Cada pesaje con su kg,
 * sus profundidades, su densidad y su fecha. El LOTE sólo se nombra a quien puede
 * ver ese lote; el número sí cuenta, porque forma la media que la persona ve.
 */
export async function pesajesDeTipo(userAccountId: string, trayTypeId: string, estado: EstadoDeCarga) {
  const tipo = await prisma.dryingTrayType.findUniqueOrThrow({ where: { id: trayTypeId } });
  if (!(await tiposDeBandeja(userAccountId, tipo.organizationId)).some((t) => t.id === tipo.id)) throw new PesajeError("tipo_no_encontrado");
  const area = areaM2(tipo);
  const filas = await prisma.dryingTrayWeighing.findMany({
    where: { trayTypeId, materialState: estado, supersededAt: null }, orderBy: { occurredAt: "desc" }, include: { lot: true },
  });
  // Una lectura de un lote que esta persona NO ve —por ámbito o por clasificación—
  // no se enseña en absoluto: ni su lote, ni su peso, ni sus profundidades. Se
  // CUENTA, para que la media que ve diga de cuántas lecturas sale (segunda pasada
  // de Codex: ver la media no da derecho a cada lectura).
  const visibles = [];
  let ocultos = 0;
  for (const p of filas) {
    try {
      await requireLotAccess(userAccountId, "view", [{ projectId: p.lot.projectId, locationId: p.lot.locationId, classification: p.lot.classification }]);
    } catch (error) {
      if (!(error instanceof TraceabilityAccessError)) throw error;
      ocultos++;
      continue;
    }
    const profundidadCm = media(p.depthPointsCm.map(Number));
    visibles.push({
      id: p.id, occurredAt: p.occurredAt, lote: p.lot.lotCode, netKg: Number(p.netKg),
      profundidadesCm: p.depthPointsCm.map(Number), densidadKgM3: Number(p.netKg) / (area * (profundidadCm / 100)),
    });
  }
  return { visibles, ocultos };
}
