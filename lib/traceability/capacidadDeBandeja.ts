/**
 * Pesaje de bandeja cargada y capacidad por estado (spec §4.2b). La capacidad es
 * DERIVADA y no se guarda: área × profundidad media × densidad media de los
 * pesajes vigentes de ese estado. Sin pesajes, el estimado SUPUESTO —sólo cereza—
 * o «sin medir». Nunca se rellena un hueco (21_rubrica_veracidad §2).
 */
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { areaM2, tiposDeBandeja } from "../equipos/bandejas";
import { CAPACIDAD_SUPUESTA } from "../beneficio/capacidadSupuesta";

export type EstadoDeCarga = "CHERRY" | "MUCILAGE_HONEY" | "PARCHMENT";
const ESTADOS: EstadoDeCarga[] = ["CHERRY", "MUCILAGE_HONEY", "PARCHMENT"];
export class PesajeError extends Error {}

const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * ¿Tiene `n` a lo sumo `k` decimales? F3 (revisión final 2): la versión
 * anterior contaba caracteres tras el punto en `n.toString()`, y
 * `n.toString()` de un número muy pequeño o muy grande sale en notación
 * exponencial — `(5e-7).toString()` es `"5e-7"`, sin punto, así que contaba
 * CERO decimales y la cifra pasaba el filtro para que la base la redondeara
 * de todos modos. La forma de comparación no mira cómo se ESCRIBIÓ el
 * número: redondea a `k` decimales y compara el VALOR — a prueba de
 * notación exponencial porque `toFixed` opera sobre el número, no sobre su
 * representación en texto.
 */
function noExcedeDecimales(n: number, k: number): boolean {
  return n === Number(n.toFixed(k));
}

// A7 (revisión final del plan 2a): un redondeo silencioso de un HECHO medido
// (00_conventions/21_rubrica_veracidad) no se detecta con "> 0": una
// profundidad de 2,85 cm entra igual que 2,8 y la base la guarda truncada a
// DECIMAL(5,1) sin decirlo. Los límites son los del propio rango de la
// columna: DECIMAL(5,1) y DECIMAL(10,3).
const PROFUNDIDAD_MAX_CM = 1000;
const NET_KG_MAX = 10_000_000;

export async function registrarPesaje(userAccountId: string, input: {
  trayTypeId: string; lotId: string; materialState: EstadoDeCarga; netKg: number; profundidadesCm: number[];
  occurredAt: Date; operatorPersonId?: string | null; supersedesId?: string | null; correctionReason?: string | null;
}) {
  if (!ESTADOS.includes(input.materialState)) throw new PesajeError("estado_invalido");
  const n = input.profundidadesCm.length;
  if (
    !(Number.isFinite(input.netKg) && input.netKg > 0 && input.netKg < NET_KG_MAX && noExcedeDecimales(input.netKg, 3)) ||
    n < 3 || n > 4 ||
    !input.profundidadesCm.every((p) => Number.isFinite(p) && p > 0 && p < PROFUNDIDAD_MAX_CM && noExcedeDecimales(p, 1))
  ) {
    throw new PesajeError("datos_invalidos");
  }
  if (input.supersedesId && !input.correctionReason?.trim()) throw new PesajeError("datos_invalidos");
  const lot = await prisma.lot.findUniqueOrThrow({ where: { id: input.lotId } });
  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId: lot.projectId, locationId: lot.locationId }]);
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

/**
 * Separa las filas que esta cuenta puede VER de las que no, contando las
 * ocultas sin exponer nada de ellas. Compartida por `capacidadDeTipo` (RULING
 * de la revisión final del plan 2a: la capacidad se agrega SÓLO de lo visible)
 * y `pesajesDeTipo` (el camino de vuelta) para que las dos apliquen la misma regla.
 */
async function separarVisibles<T extends { lot: { projectId: string | null; locationId: string | null; classification: import("../../generated/prisma/client").ClassificationLevel } }>(
  userAccountId: string,
  filas: T[],
): Promise<{ visibles: T[]; ocultos: number }> {
  const visibles: T[] = [];
  let ocultos = 0;
  for (const p of filas) {
    try {
      await requireLotAccess(userAccountId, "view", [{ projectId: p.lot.projectId, locationId: p.lot.locationId, classification: p.lot.classification }]);
      visibles.push(p);
    } catch (error) {
      if (!(error instanceof TraceabilityAccessError)) throw error;
      ocultos++;
    }
  }
  return { visibles, ocultos };
}

export async function capacidadDeTipo(userAccountId: string, trayTypeId: string) {
  const tipo = await prisma.dryingTrayType.findUniqueOrThrow({ where: { id: trayTypeId } });
  // Mismo permiso de lectura que la lista de tipos: quien no ve ninguno, no ve éste.
  if (!(await tiposDeBandeja(userAccountId, tipo.organizationId)).some((t) => t.id === tipo.id)) throw new PesajeError("tipo_no_encontrado");
  const area = areaM2(tipo);
  const pesajes = await prisma.dryingTrayWeighing.findMany({ where: { trayTypeId, supersededAt: null }, include: { lot: true } });
  const estados = [];
  for (const estado of ESTADOS) {
    const todos = pesajes.filter((p) => p.materialState === estado);
    // RULING (revisión final del plan 2a, A2): la capacidad se calcula SÓLO de
    // los pesajes que esta cuenta puede ver. Con una única lectura oculta, la
    // "capacidad" salía igual a su `netKg` exacto — una fuga de un dato
    // restringido disfrazada de agregado. `pesajes`/`pesajeIds` cuentan y
    // listan sólo lo visible; `ocultos` es el conteo de lo que no.
    const { visibles: suyos, ocultos } = await separarVisibles(userAccountId, todos);
    if (suyos.length > 0) {
      const profundidades = suyos.map((p) => media(p.depthPointsCm.map(Number)));
      const densidades = suyos.map((p, i) => Number(p.netKg) / (area * (profundidades[i]! / 100)));
      const profundidadCm = media(profundidades);
      const densidadKgM3 = media(densidades);
      // F5 (cheap win, revisión final 2): el detalle sale del MISMO `suyos` ya
      // autorizado por `separarVisibles` arriba — antes `vistaDeBandejas`
      // volvía a llamar `pesajesDeTipo`, que vuelve a consultar Y a
      // re-autorizar cada pesaje visible, por cada estado medido.
      const visiblesDetalle = suyos
        .map((p, i) => ({
          id: p.id, occurredAt: p.occurredAt, lote: p.lot.lotCode, netKg: Number(p.netKg),
          profundidadesCm: p.depthPointsCm.map(Number), densidadKgM3: densidades[i]!,
        }))
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
      estados.push({ estado, fuente: "medido" as const, pesajes: suyos.length, pesajeIds: suyos.map((p) => p.id), densidadKgM3, profundidadCm,
        capacidadKg: area * (profundidadCm / 100) * densidadKgM3, fuenteDelEstimado: null, ocultos, detalle: { visibles: visiblesDetalle, ocultos } });
      continue;
    }
    if (ocultos > 0) {
      // Hay pesajes de ese estado, pero ninguno visible: ni número ni estimado
      // — un estimado aquí escondería que SÍ hay una medida, sólo que esta
      // cuenta no la ve.
      estados.push({ estado, fuente: "sin_acceso" as const, pesajes: 0, pesajeIds: [], densidadKgM3: null, profundidadCm: null, capacidadKg: null, fuenteDelEstimado: null, ocultos, detalle: null });
      continue;
    }
    // Sin ningún pesaje en absoluto (visible u oculto) — el estimado aplica aquí, y sólo aquí.
    const sup = (CAPACIDAD_SUPUESTA as Partial<Record<EstadoDeCarga, { densidadKgM3: number; profundidadCm: number; fuente: string }>>)[estado];
    if (sup) {
      estados.push({ estado, fuente: "estimado" as const, pesajes: 0, pesajeIds: [], densidadKgM3: sup.densidadKgM3, profundidadCm: sup.profundidadCm,
        capacidadKg: area * (sup.profundidadCm / 100) * sup.densidadKgM3, fuenteDelEstimado: sup.fuente, ocultos: 0, detalle: null });
      continue;
    }
    estados.push({ estado, fuente: "sin_medir" as const, pesajes: 0, pesajeIds: [], densidadKgM3: null, profundidadCm: null, capacidadKg: null, fuenteDelEstimado: null, ocultos: 0, detalle: null });
  }
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
  const { visibles: suyos, ocultos } = await separarVisibles(userAccountId, filas);
  const visibles = suyos.map((p) => {
    const profundidadCm = media(p.depthPointsCm.map(Number));
    return {
      id: p.id, occurredAt: p.occurredAt, lote: p.lot.lotCode, netKg: Number(p.netKg),
      profundidadesCm: p.depthPointsCm.map(Number), densidadKgM3: Number(p.netKg) / (area * (profundidadCm / 100)),
    };
  });
  return { visibles, ocultos };
}
