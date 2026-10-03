/**
 * La lectura de ambiente a mano de una instalación de secado (spec §4.5).
 * Registrar pide `sample:manage` sobre la instalación, el mismo permiso que una
 * inspección de cama, sin inventar un recurso RBAC; ver pide manage o view.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { scopeTargetsFor, TraceabilityAccessError } from "./lots";
import { normalizeToCanonical, UnitValidationError } from "./units";
import type { ClassificationLevel, DryingVentilation, SkyCondition } from "../../generated/prisma/client";
import type { LecturaReciente, LecturaVigente } from "./ambienteVigente";
import { exigirPersonaPermitida } from "../people/quienLoHizo";

export class AmbienteError extends Error {}

export interface LecturaDeAmbienteInput {
  facilityLocationId: string;
  rackLocationId?: string | null;
  rackLevel?: number | null;
  occurredAt: Date;
  operatorPersonId?: string | null;
  temperatura?: { valor: number; unidad: "C" | "F" } | null;
  humedadRelativaPct?: number | null;
  cielo?: SkyCondition | null;
  notaCielo?: string | null;
  ventilacion?: DryingVentilation | null;
  notaVentilacion?: string | null;
  supersedesId?: string | null;
  correctionReason?: string | null;
}

const NOTA_MAX = 300;
const unDecimal = (n: number) => n === Number(n.toFixed(1));

async function puedeEn(userAccountId: string, lugar: { id: string; classification: ClassificationLevel }, acciones: ("manage" | "view")[]) {
  for (const target of scopeTargetsFor({ locationId: lugar.id })) {
    for (const accion of acciones) if (await can(userAccountId, accion, "sample", target, lugar.classification)) return true;
  }
  return false;
}

async function instalacion(facilityLocationId: string) {
  const lugar = await prisma.location.findUnique({ where: { id: facilityLocationId } });
  if (!lugar || lugar.locationType !== "drying_facility") throw new AmbienteError("instalacion_invalida");
  return lugar;
}

export async function puedeRegistrarAmbienteEn(userAccountId: string, facilityLocationId: string) {
  const lugar = await prisma.location.findUnique({ where: { id: facilityLocationId } });
  return !!lugar && lugar.locationType === "drying_facility" && (await puedeEn(userAccountId, lugar, ["manage"]));
}

export async function registrarLecturaDeAmbiente(userAccountId: string, input: LecturaDeAmbienteInput) {
  const nota = (s?: string | null) => {
    const t = s?.trim() || null;
    if (t && t.length > NOTA_MAX) throw new AmbienteError("datos_invalidos");
    return t;
  };
  const skyNote = nota(input.notaCielo);
  const ventilationNote = nota(input.notaVentilacion);
  if ((skyNote && !input.cielo) || (ventilationNote && !input.ventilacion)) throw new AmbienteError("nota_sin_valor");
  if (input.rackLevel != null && !(Number.isInteger(input.rackLevel) && input.rackLevel >= 1 && input.rackLevel <= 2147483647)) {
    throw new AmbienteError("datos_invalidos");
  }

  let airTemperatureC: number | null = null;
  if (input.temperatura) {
    const { valor, unidad } = input.temperatura;
    // En °C se guarda lo tecleado: más de un decimal sería un redondeo silencioso
    // de un hecho medido. En °F la conversión redondea a la precisión de §1.
    if (!Number.isFinite(valor) || (unidad === "C" && !unDecimal(valor))) throw new AmbienteError("datos_invalidos");
    try {
      airTemperatureC = Math.round(normalizeToCanonical("temperature", valor, unidad).value * 10) / 10;
    } catch (error) {
      if (error instanceof UnitValidationError) throw new AmbienteError(error.message.startsWith("out_of_range") ? "fuera_de_rango" : "datos_invalidos");
      throw error;
    }
  }
  const hr = input.humedadRelativaPct ?? null;
  if (hr != null) {
    if (!Number.isFinite(hr) || !unDecimal(hr)) throw new AmbienteError("datos_invalidos");
    if (hr < 0 || hr > 100) throw new AmbienteError("fuera_de_rango");
  }
  if (airTemperatureC == null && hr == null && !input.cielo && !input.ventilacion) throw new AmbienteError("lectura_vacia");
  // Su propia clase desde que el formulario puede corregir: «falta el motivo»
  // es lo que un operario va a ver, y `datos_invalidos` dice «faltan datos
  // obligatorios o hay valores que no corresponden», que no señala cuál.
  const correctionReason = nota(input.correctionReason);
  if (input.supersedesId && !correctionReason) throw new AmbienteError("motivo_obligatorio");

  const lugar = await instalacion(input.facilityLocationId);
  if (!(await puedeEn(userAccountId, lugar, ["manage"]))) throw new TraceabilityAccessError("no_sample_access");

  // El mismo punto que exige el disparador, dicho antes para dar un motivo legible.
  if (input.rackLocationId) {
    const estante = await prisma.location.findUnique({ where: { id: input.rackLocationId } });
    if (!estante || estante.locationType !== "drying_rack" || estante.parentLocationId !== lugar.id) throw new AmbienteError("punto_invalido");
  }
  if (input.rackLevel != null) {
    const existe = await prisma.location.count({ where: {
      locationType: "drying_bed", rackLevel: input.rackLevel,
      OR: input.rackLocationId
        ? [{ parentLocationId: input.rackLocationId }]
        : [{ parentLocationId: lugar.id }, { parentLocation: { locationType: "drying_rack", parentLocationId: lugar.id } }],
    } });
    if (!existe) throw new AmbienteError("punto_invalido");
  }
  if (input.supersedesId) {
    const original = await prisma.dryingAmbientReading.findUnique({ where: { id: input.supersedesId } });
    if (!original || original.facilityLocationId !== lugar.id || original.supersededAt) throw new AmbienteError("datos_invalidos");
  }

  return prisma.$transaction(async (tx) => {
    await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ locationId: lugar.id }], { db: tx });
    if (input.supersedesId) {
      const { count } = await tx.dryingAmbientReading.updateMany({ where: { id: input.supersedesId, supersededAt: null }, data: { supersededAt: new Date() } });
      if (count !== 1) throw new AmbienteError("datos_invalidos");
    }
    const fila = await tx.dryingAmbientReading.create({ data: {
      facilityLocationId: lugar.id, rackLocationId: input.rackLocationId ?? null, rackLevel: input.rackLevel ?? null,
      occurredAt: input.occurredAt, operatorPersonId: input.operatorPersonId ?? null,
      airTemperatureC, temperatureEntryUnit: input.temperatura ? input.temperatura.unidad : null, relativeHumidityPct: hr,
      skyCondition: input.cielo ?? null, skyNote, ventilation: input.ventilacion ?? null, ventilationNote,
      sourceType: "manual",
      provenanceClass: airTemperatureC != null || hr != null ? "measured_fact" : "direct_observation",
      supersedesId: input.supersedesId ?? null, correctionReason, createdBy: userAccountId,
    } });
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: input.supersedesId ? "drying_ambient_reading.correct" : "drying_ambient_reading.create",
      entityType: "drying_ambient_reading", entityId: fila.id, after: fila, sourceInterface: "traceability.service" }, tx);
    return { id: fila.id };
  });
}

const SELECCION = {
  id: true, rackLocationId: true, rackLevel: true, occurredAt: true, airTemperatureC: true,
  relativeHumidityPct: true, skyCondition: true, ventilation: true, sourceType: true,
  // Para rotular lo reemplazado y para PRECARGAR una corrección. Una corrección
  // es una fila nueva, así que lo que el formulario no reenvíe se pierde: sin
  // las notas y sin la persona aquí, arreglar una temperatura se llevaría por
  // delante la nota del cielo que alguien escribió ayer.
  supersededAt: true, skyNote: true, ventilationNote: true, operatorPersonId: true,
} as const;

function aVigente(f: {
  id: string; rackLocationId: string | null; rackLevel: number | null; occurredAt: Date;
  airTemperatureC: { toString(): string } | null; relativeHumidityPct: { toString(): string } | null;
  skyCondition: string | null; ventilation: string | null; sourceType: string;
}): LecturaVigente {
  return {
    id: f.id, rackId: f.rackLocationId, rackLevel: f.rackLevel, occurredAt: f.occurredAt,
    airTemperatureC: f.airTemperatureC == null ? null : Number(f.airTemperatureC),
    relativeHumidityPct: f.relativeHumidityPct == null ? null : Number(f.relativeHumidityPct),
    skyCondition: f.skyCondition, ventilation: f.ventilation, sourceType: f.sourceType,
  };
}

/** Las vigentes —la más reciente de cada punto, sin supersedidas—, las 20 últimas, y la zona de la
 *  instalación para enseñar su hora (una lectura sin hora no se puede fechar: sólo con su edad, dos
 *  lecturas «hace 2 h» no se distinguen). */
export async function ambienteDeInstalacion(userAccountId: string, facilityLocationId: string) {
  const lugar = await instalacion(facilityLocationId);
  if (!(await puedeEn(userAccountId, lugar, ["manage", "view"]))) throw new TraceabilityAccessError("no_sample_access");
  const orderBy = [{ occurredAt: "desc" as const }, { createdAt: "desc" as const }];
  const [vigentes, recientes] = await Promise.all([
    // `vigentes` SÍ filtra las reemplazadas: una reemplazada no es la condición
    // actual de ningún punto, y la rejilla y la vista rápida salen de aquí.
    prisma.dryingAmbientReading.findMany({
      where: { facilityLocationId: lugar.id, supersededAt: null },
      orderBy, distinct: ["rackLocationId", "rackLevel"], select: SELECCION,
    }),
    // `recientes` NO filtra. Es el registro, y hasta el 2026-10-01 escondía lo
    // corregido: el operario que corregía una lectura la veía esfumarse sin
    // saber si había guardado o borrado, y quien leyera el secado después no
    // podía ver qué se creyó en su momento. Decisión de Daniel ese día.
    prisma.dryingAmbientReading.findMany({
      where: { facilityLocationId: lugar.id }, orderBy, take: 20, select: SELECCION,
    }),
  ]);
  // El motivo se guarda en la fila NUEVA, así que para rotular la reemplazada
  // hay que traerlo de su reemplazo. Se consulta en vez de buscarlo entre estas
  // 20: la corrección puede quedar fuera del corte, y un motivo ausente se
  // leería como «no se dio ninguno» cuando el servicio lo exige.
  const reemplazadasIds = recientes.filter((f) => f.supersededAt != null).map((f) => f.id);
  const correcciones = reemplazadasIds.length === 0 ? [] : await prisma.dryingAmbientReading.findMany({
    where: { supersedesId: { in: reemplazadasIds } }, select: { supersedesId: true, correctionReason: true },
  });
  const motivoDe = new Map(correcciones.map((c) => [c.supersedesId, c.correctionReason] as const));
  type FilaReciente = Parameters<typeof aVigente>[0] & {
    supersededAt: Date | null; skyNote: string | null; ventilationNote: string | null; operatorPersonId: string | null;
  };
  const aReciente = (f: FilaReciente): LecturaReciente => ({
    ...aVigente(f),
    reemplazada: f.supersededAt == null ? null : { en: f.supersededAt, motivo: motivoDe.get(f.id) ?? null },
    notaCielo: f.skyNote, notaVentilacion: f.ventilationNote, operadorPersonId: f.operatorPersonId,
  });
  return { vigentes: vigentes.map(aVigente), recientes: recientes.map(aReciente), zona: lugar.timezone };
}
