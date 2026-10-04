/**
 * Phase 1, ticket T3 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §10, §27, §34). Generalized typed observations against a Lot or Sample —
 * temperature, pH, Brix, relative humidity, moisture, water activity.
 *
 * Append-only by construction, same as lib/traceability/lots.ts and
 * quantity.ts: there is no `updateMeasurement`. A correction is always a
 * new Measurement row with `correctsId` pointing at the row it corrects and
 * a mandatory `reason` — never an in-place edit (§27's correction model,
 * the same shape as sensory.Assessment.supersedesAssessmentId).
 *
 * RBAC reuses `lot:manage`/`lot:view` (§26 — deliberately not
 * `research:create_measurement`, keeping Operational Measurement distinct
 * from Approved Research Evidence). A Measurement's subject may be a Lot or
 * a Sample; both carry the same project/location scope shape, so access is
 * checked against whichever subject is present.
 *
 * **S1 (45_S1_SUELO_AMBIENTE_TAZA.md §2) añade un sujeto que NO es café**: el
 * lote de biochar. Y con él, una segunda ruta de autorización.
 *
 * Lo que hace falta decir, porque no se ve al leer la firma: Lot y Sample
 * comparten forma de ámbito —los dos llevan `projectId` y `locationId`— y por
 * eso `requireLotAccess` puede recibir los dos juntos. Un `BiocharBatch` no:
 * su ámbito es la Location donde se produjo, y su permiso es
 * `location:manage_attributes`, el mismo con el que se registró el lote. Dos
 * permisos distintos no se pueden acumular en una lista de candidatos —eso
 * dejaría que el más laxo abriera lo del otro—, así que se resuelve **por
 * rama**, y el sujeto es exclusivo: o café, o biochar, nunca los dos.
 */
import { exigirPersonaPermitida, type Ancla } from "../people/quienLoHizo";
import { prisma } from "../db";
import { unaVezPorEnvio } from "../envios/unaVezPorEnvio";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { loteDividido } from "./procesoDelLinaje";
import { requireLocationAttributeAccess } from "./locations";
import type { ClassificationLevel } from "../rbac/types";
import {
  LIMITES_SOBRE_MIEL,
  normalizeToCanonical,
  variablePerteneceAlPanel,
  type DominioDeVariable,
  type MeasurementVariable,
} from "./units";
import { recordAuditEvent } from "../audit";
import { crearInspeccionEnTransaccion } from "./samplingEvents";
import { fueraDeRango, hayDesajuste } from "../equipos/modos";
import { materialNoEsDeSecado } from "./avisoDeModo";
import { instrumentosParaMedicion } from "../equipos/equipos";
import type { MaterialState, SamplingRole, SamplingZone, SampleKind, ProvenanceClass } from "../../generated/prisma/client";

export class MeasurementValidationError extends Error {}

interface ScopeCandidate {
  projectId?: string | null;
  locationId?: string | null;
  // ADR-062 — the subject's own classification travels with its scope, so a
  // measurement cannot be gated more loosely than the lot or sample it is about.
  classification: ClassificationLevel;
}

/**
 * Autoriza la lectura contra su sujeto, sea de la cadena del café o no.
 *
 * Una sola función y no dos porque `recordMeasurement` y `correctMeasurement`
 * tienen que decidir igual: una corrección de una lectura de biochar no puede
 * pedir permisos de café sólo porque el camino de corrección sea más viejo.
 */
export interface SujetoDeMedicion {
  lotId?: string | null;
  sampleId?: string | null;
  biocharBatchId?: string | null;
  soilSampleId?: string | null;
  foliarSampleId?: string | null;
}

/**
 * Los sujetos que NO son café, y la Location contra la que se autoriza cada uno.
 *
 * Una tabla y no tres `if`: al añadir el tercero, la cadena de condiciones ya
 * repetía la misma forma tres veces, y esa repetición es donde se cuela el que
 * comprueba la exclusividad de uno y se olvida del otro.
 */
/**
 * Qué panel de laboratorio corresponde a cada sujeto.
 *
 * `PANELES` sólo filtraba desplegables: `recordMeasurement` aceptaba cualquier
 * variable para cualquier sujeto, así que un POST con `variable=brix` sobre una
 * muestra de suelo dejaba evidencia semánticamente falsa en su ficha. La
 * autorización pasaba legítimamente; lo que fallaba era la integridad. Lo
 * encontró la cuarta revisión independiente, y el formulario no es la frontera
 * (SECURITY.md §2).
 *
 * Los sujetos de café **no** se validan contra un panel: sus variables las
 * gobierna el protocolo y la receta, no un panel de laboratorio.
 */
const PANEL_DEL_SUJETO: Record<string, DominioDeVariable> = {
  biocharBatchId: "analisis_de_enmienda",
  soilSampleId: "analisis_de_suelo",
  foliarSampleId: "analisis_foliar",
};

const SUJETOS_NO_CAFE = [
  {
    campo: "biocharBatchId",
    error: "biochar_batch_not_found",
    async ubicacion(id: string) {
      const fila = await prisma.biocharBatch.findUnique({
        where: { id },
        select: { producedAtLocationId: true },
      });
      return fila?.producedAtLocationId ?? null;
    },
  },
  {
    campo: "soilSampleId",
    error: "soil_sample_not_found",
    async ubicacion(id: string) {
      const fila = await prisma.soilSample.findUnique({ where: { id }, select: { locationId: true } });
      return fila?.locationId ?? null;
    },
  },
  {
    campo: "foliarSampleId",
    error: "foliar_sample_not_found",
    async ubicacion(id: string) {
      const fila = await prisma.foliarSample.findUnique({ where: { id }, select: { locationId: true } });
      return fila?.locationId ?? null;
    },
  },
] as const;

/** Autoriza y devuelve el ámbito del sujeto: lo reusa «quién lo hizo» (P-G) como ancla. */
async function requireSubjectAccess(userAccountId: string, subject: SujetoDeMedicion): Promise<Ancla[]> {
  const presentes = SUJETOS_NO_CAFE.filter((s) => subject[s.campo]);

  if (presentes.length > 0) {
    // Exclusivo, no acumulativo. Dos sujetos son dos ámbitos, y elegir uno
    // sería elegir el más laxo. Incluye dos sujetos NO-café entre sí: una
    // lectura no es a la vez de una muestra de suelo y de una foliar.
    if (presentes.length > 1 || subject.lotId || subject.sampleId) {
      throw new MeasurementValidationError("non_coffee_subject_is_exclusive");
    }
    const s = presentes[0]!;
    const locationId = await s.ubicacion(subject[s.campo]!);
    if (!locationId) throw new TraceabilityAccessError(s.error);
    await requireLocationAttributeAccess(userAccountId, locationId);
    return [{ locationId }];
  }

  const candidates = await scopeCandidatesForSubject(subject.lotId, subject.sampleId);
  await requireLotAccess(userAccountId, "manage", candidates);
  return candidates.map((c) => ({ projectId: c.projectId, locationId: c.locationId }));
}

async function scopeCandidatesForSubject(lotId?: string | null, sampleId?: string | null): Promise<ScopeCandidate[]> {
  if (!lotId && !sampleId) {
    throw new MeasurementValidationError("subject_required");
  }

  const candidates: ScopeCandidate[] = [];
  if (lotId) {
    const lot = await prisma.lot.findUnique({ where: { id: lotId } });
    if (!lot) throw new TraceabilityAccessError("lot_not_found");
    candidates.push({ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification });
  }
  if (sampleId) {
    const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
    if (!sample) throw new TraceabilityAccessError("sample_not_found");
    candidates.push({ projectId: sample.projectId, locationId: sample.locationId, classification: sample.classification });
  }
  return candidates;
}

export interface RecordMeasurementInput {
  instrumentId?: string | null;
  instrumentModeId?: string | null;
  materialState?: MaterialState | null;
  samplingEventId?: string | null;
  samplingRole?: SamplingRole | null;
  samplingZone?: SamplingZone | null;
  sampleKind?: SampleKind | null;
  // Clave de idempotencia del formulario web, igual que en jornales.
  claveDeEnvio?: string | null;
  variable: MeasurementVariable;
  value: number;
  unit: string; // as entered by the operator — may differ from canonical (e.g. °F)
  occurredAt: Date;
  lotId?: string | null;
  sampleId?: string | null;
  // R1 (docs/implementation/33_R1_ROASTSESSION_TAXONOMIA_SENSORIAL.md §1.4)
  // — an additional link alongside lotId, not a third independent subject:
  // green-coffee moisture/density measured just before a specific roast
  // still scopes/RBAC-checks against the Lot like any other Lot
  // measurement, but also carrying roastSessionId is what distinguishes
  // "measured for this roast" from an ordinary storage-phase reading of the
  // same Lot — no separate "moment" field needed, the FK's presence already
  // says so. Requires lotId to be set alongside it (validated below).
  roastSessionId?: string | null;
  // Pre-existing gap fix (found while wiring roastSessionId above): these
  // three FKs have been real columns on Measurement since T6/T7/T8 (see
  // the schema's own comment on this model) but recordMeasurement never
  // accepted or set them — a measurement taken mid-fermentation/-drying or
  // against a StorageAssignment could only ever be linked to the Lot in
  // general. Same "additional link alongside lotId" shape as
  // roastSessionId: each requires lotId to be set alongside it (validated
  // below), not a fourth/fifth/sixth independent subject.
  fermentationRunId?: string | null;
  dryingRunId?: string | null;
  storageAssignmentId?: string | null;
  // RO1 (docs/implementation/34_RO1_RESEARCH_OS.md §2, §8) — same
  // additional-link-alongside-lotId shape as every FK above: a PE-protocol
  // reading taken during a TreatmentBatch's execution, at a specific
  // ProcessingStage moment. Requires lotId (validated below), same
  // reasoning as roastSessionId's own comment.
  treatmentBatchId?: string | null;
  processingStageId?: string | null;
  // S1 §2 — sujetos independientes, no enlaces más: no exigen `lotId`, lo
  // excluyen, y son exclusivos también entre sí. Tabla 7 (biochar), Tabla 3
  // (suelo) y §7.1 (foliar) del marco.
  biocharBatchId?: string | null;
  soilSampleId?: string | null;
  foliarSampleId?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required, no fallback. The MeasurementForm UI (app/components/
  // traceability/MeasurementForm.tsx) exposes this as a real select,
  // defaulting to "measured_fact" (a manually-read instrument value —
  // thermometer, refractometer, pH meter, moisture meter — per T9.5 §3(b)'s
  // "harvest weight read off a scale" example), but changeable per reading.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function recordMeasurement(userAccountId: string, input: RecordMeasurementInput) {
  const anclas = await requireSubjectAccess(userAccountId, input);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, anclas);

  if (input.roastSessionId && !input.lotId) {
    throw new MeasurementValidationError("roast_session_link_requires_lot_id");
  }
  if (input.fermentationRunId && !input.lotId) {
    throw new MeasurementValidationError("fermentation_run_link_requires_lot_id");
  }
  if (input.dryingRunId && !input.lotId) {
    throw new MeasurementValidationError("drying_run_link_requires_lot_id");
  }
  if (input.storageAssignmentId && !input.lotId) {
    throw new MeasurementValidationError("storage_assignment_link_requires_lot_id");
  }
  if (input.treatmentBatchId && !input.lotId) {
    throw new MeasurementValidationError("treatment_batch_link_requires_lot_id");
  }
  if (input.processingStageId && !input.lotId) {
    throw new MeasurementValidationError("processing_stage_link_requires_lot_id");
  }

  // La variable tiene que pertenecer al panel del sujeto. Se comprueba después
  // de autorizar: qué puede ver alguien no depende de si el dato es coherente.
  for (const [campo, dominio] of Object.entries(PANEL_DEL_SUJETO)) {
    if (input[campo as keyof typeof input] && !variablePerteneceAlPanel(input.variable, dominio)) {
      throw new MeasurementValidationError(`variable_not_in_panel:${input.variable}:${dominio}`);
    }
  }

  if (input.instrumentId) {
    const visibles = await instrumentosParaMedicion(userAccountId);
    if (!visibles.some((e) => e.id === input.instrumentId)) throw new MeasurementValidationError("instrument_not_available");
  }
  if (input.instrumentModeId && !input.instrumentId) throw new MeasurementValidationError("instrument_required");
  if ((input.materialState || input.samplingEventId || input.samplingRole || input.samplingZone || input.sampleKind) && !input.lotId) {
    throw new MeasurementValidationError("sample_context_requires_lot_id");
  }
  // Una zona es la zona DE una inspección: sin ninguna, no es zona de nada. Pero nadie en el patio
  // abre una inspección para anotar una humedad (Daniel, 2026-09-29), así que con una corrida de
  // secado a la vista el servicio la crea él mismo, más abajo y dentro de la transacción. Sin
  // corrida sigue sin haber de qué colgarla, y ahí se niega igual que siempre.
  if ((input.samplingRole || input.samplingZone) && !input.samplingEventId && !input.dryingRunId) {
    throw new MeasurementValidationError("sampling_event_required");
  }
  if (input.sampleId && (input.materialState || input.samplingEventId || input.samplingRole || input.samplingZone || input.sampleKind)) {
    throw new MeasurementValidationError("existing_sample_is_immutable");
  }
  // ADR-160: sobre un lote de MIEL el Brix se lee a 58-90, fuera del limite del cafe.
  const tipoDeLote = input.lotId
    ? (await prisma.lot.findUnique({ where: { id: input.lotId }, select: { lotType: true } }))?.lotType ?? null
    : null;
  const normalized = normalizeToCanonical(
    input.variable, input.value, input.unit,
    tipoDeLote === "honey" ? LIMITES_SOBRE_MIEL[input.variable] : undefined,
  );

  // Escritura y auditoría en la MISMA transacción. Lo pidió la revisión
  // independiente del 2026-09-01 con un argumento que no era el de siempre:
  // desde S1 estas filas **abren Gate 0**, así que una medición que persiste
  // sin su audit no sólo pierde trazabilidad — puede habilitar una aplicación
  // de enmienda irreversible. `correctMeasurement` ya lo hacía; esto lo iguala.
  // El ayudante abre la transacción: la medición y su audit ya iban juntas, y
  // ahora la clave del envío entra en la misma.
  const measurement = await unaVezPorEnvio(userAccountId, input.claveDeEnvio, {
    tipo: "Measurement",
    // Lleva la inspección de vuelta al llamador, para que la SIGUIENTE lectura de la misma pasada
    // pueda nombrarla y no se creen dos. La rama de recuperación la trae igual: un reenvío con la
    // misma clave tiene que devolver exactamente la misma forma, o el tipo genérico no cierra.
    recuperar: async (id) => {
      const m = await prisma.measurement.findUniqueOrThrow({
        where: { id },
        include: { sample: { select: { samplingEventId: true } } },
      });
      const { sample, ...resto } = m;
      return { ...resto, inspeccionId: sample?.samplingEventId ?? null };
    },
    crear: async (tx) => {
  // Parte 1, R6.6 (2026-10-01): un lote dividido bajo un proceso queda cerrado: «todo registro posterior
  // pertenece a un hijo» (`20_modelo_ciclo_completo.md` §1.1). Lo de ANTES de la división se admite (decisión de
  // Daniel, 2026-10-02): `loteDividido` compara con la fecha de la lectura.
  if (input.lotId && (await loteDividido(tx, input.lotId, input.occurredAt))) throw new MeasurementValidationError("lote_dividido");
  const lot = input.lotId ? await tx.lot.findUniqueOrThrow({ where: { id: input.lotId } }) : null;
  const modo = input.instrumentModeId ? await tx.instrumentMeasurementMode.findUnique({ where: { id: input.instrumentModeId } }) : null;
  if (input.instrumentModeId && (!modo || modo.equipmentId !== input.instrumentId || modo.retiredAt)) {
    throw new MeasurementValidationError("instrument_mode_not_available");
  }
  // ADR-160. Un modo que declara QUE lee no puede firmar otra variable: el modo H% de un
  // refractometro de miel no produce un Brix. Sin declarar (`null`) no se acusa: ADR-080.
  if (modo?.variable && modo.variable !== input.variable) {
    throw new MeasurementValidationError(`instrument_mode_variable_mismatch:${modo.variable}:${input.variable}`);
  }
  // Fuera del rango de su escala el aparato no da numero: no es una lectura, es un error
  // de captura. Es el unico limite que acota el Brix de la miel (ver LIMITES_SOBRE_MIEL).
  if (modo && fueraDeRango({ ...modo, rangeMin: modo.rangeMin == null ? null : Number(modo.rangeMin), rangeMax: modo.rangeMax == null ? null : Number(modo.rangeMax) }, normalized.value)) {
    throw new MeasurementValidationError("fuera_del_rango_del_modo");
  }
  if (input.samplingEventId) {
    const evento = await tx.samplingEvent.findUnique({ where: { id: input.samplingEventId } });
    if (!evento || !input.dryingRunId || evento.dryingRunId !== input.dryingRunId) throw new MeasurementValidationError("sampling_event_context_mismatch");
    const origen = await tx.lotTransformation.findFirst({ where: {
      dryingRunId: input.dryingRunId, inputs: { some: { lotId: input.lotId! } },
    } });
    if (!origen) throw new MeasurementValidationError("sampling_event_context_mismatch");
  }
  // La inspección implícita. Se comprueba primero que la corrida sea DEL LOTE autorizado —la misma
  // comprobación que hace el camino explícito justo arriba—: sin ella, una zona con el id de una
  // corrida ajena crearía una inspección sobre trabajo de otro.
  // Una zona ES el papel `ZONE`, y no por convención: lo dice el CHECK `sample_zona_exige_papel_zona`
  // de `core.sample`. Así que se deriva en vez de preguntarse — el mismo criterio por el que la
  // unidad sale de la variable desde el 2026-09-11, cuando Daniel dijo que el formulario le hacía
  // trabajar de más. Un papel explícito manda sobre la derivación.
  const papelDeMuestreo = input.samplingRole ?? (input.samplingZone ? ("ZONE" as const) : null);
  let samplingEventId = input.samplingEventId ?? null;
  if (!samplingEventId && (input.samplingRole || input.samplingZone) && input.dryingRunId) {
    const origen = await tx.lotTransformation.findFirst({ where: {
      dryingRunId: input.dryingRunId, inputs: { some: { lotId: input.lotId! } },
    } });
    if (!origen) throw new MeasurementValidationError("sampling_event_context_mismatch");
    const implicita = await crearInspeccionEnTransaccion(tx, userAccountId, {
      dryingRunId: input.dryingRunId,
      occurredAt: input.occurredAt,
      operatorPersonId: input.operatorPersonId ?? null,
    });
    samplingEventId = implicita.id;
  }
  const enSecado = !!input.dryingRunId || lot?.lotType === "drying";
  let sampleId = input.sampleId ?? null;
  if (lot && (input.materialState || samplingEventId || input.sampleKind)) {
    const muestra = await tx.sample.create({ data: {
      sampleCode: `M-${crypto.randomUUID()}`, sampleType: "", sourceLotId: lot.id,
      projectId: lot.projectId, organizationId: lot.organizationId, locationId: lot.locationId,
      classification: lot.classification, createdBy: userAccountId,
      materialState: input.materialState, samplingEventId,
      samplingRole: papelDeMuestreo, samplingZone: input.samplingZone, sampleKind: input.sampleKind,
      stageAtExtraction: enSecado ? "drying" : input.fermentationRunId ? "processing" : lot.lotType,
    } });
    sampleId = muestra.id;
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: "sample.create",
      entityType: "sample", entityId: muestra.id, after: muestra, sourceInterface: "traceability.service" }, tx);
  }
  // Un lote de miel no necesita que nadie declare su material: la miel ES su tipo de lote
  // (A3). Sin esto, un modo de cafe usado sobre miel no levantaria ninguna marca.
  const material =
    input.materialState ??
    (sampleId ? (await tx.sample.findUniqueOrThrow({ where: { id: sampleId } })).materialState : null) ??
    (lot?.lotType === "honey" ? "BEE_HONEY" : null);
  const creada = await tx.measurement.create({
    data: {
      variable: input.variable,
      value: normalized.value,
      unit: normalized.unit,
      occurredAt: input.occurredAt,
      lotId: input.lotId ?? null,
      sampleId,
      instrumentId: input.instrumentId ?? null,
      instrumentModeId: input.instrumentModeId ?? null,
      roastSessionId: input.roastSessionId ?? null,
      fermentationRunId: input.fermentationRunId ?? null,
      dryingRunId: input.dryingRunId ?? null,
      storageAssignmentId: input.storageAssignmentId ?? null,
      treatmentBatchId: input.treatmentBatchId ?? null,
      processingStageId: input.processingStageId ?? null,
      biocharBatchId: input.biocharBatchId ?? null,
      soilSampleId: input.soilSampleId ?? null,
      foliarSampleId: input.foliarSampleId ?? null,
      sourceType: "manual",
      operatorPersonId: input.operatorPersonId ?? null,
      notes: input.notes ?? null,
      createdBy: userAccountId,
      provenanceClass: input.provenanceClass,
      sourceReference: input.sourceReference ?? null,
    },
  });

  const razones = [
    ...(hayDesajuste(modo ? { ...modo, rangeMin: modo.rangeMin == null ? null : Number(modo.rangeMin), rangeMax: modo.rangeMax == null ? null : Number(modo.rangeMax) } : null, material) ? ["mode_material_mismatch" as const] : []),
    ...(materialNoEsDeSecado(material, enSecado) ? ["material_stage_mismatch" as const] : []),
  ];
  for (const reason of razones) {
    const marca = await tx.measurementReviewFlag.create({ data: { measurementId: creada.id, reason, raisedByCheckId: null } });
    await recordAuditEvent({ actorUserAccountId: userAccountId, operation: "measurement_review_flag.create",
      entityType: "measurement_review_flag", entityId: marca.id, after: marca, sourceInterface: "traceability.service" }, tx);
  }

  // C1 §3: evidentiary write (carries provenanceClass).
  await recordAuditEvent(
    {
      actorUserAccountId: userAccountId,
      operation: "measurement.create",
      entityType: "measurement",
      entityId: creada.id,
      after: creada,
      sourceInterface: "traceability.service",
    },
    tx,
  );
  return { ...creada, inspeccionId: samplingEventId };
    },
  });

  return measurement;
}

export interface CorrectMeasurementInput {
  measurementId: string;
  value: number;
  unit: string;
  occurredAt: Date;
  reason: string;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required — see RecordMeasurementInput's comment.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

/**
 * Writes a new Measurement row pointing at the one it corrects. The
 * original row is never touched — its full history stays queryable,
 * matching the append-only invariant every other traceability table in
 * this codebase already proves.
 */
export async function correctMeasurement(userAccountId: string, input: CorrectMeasurementInput) {
  if (!input.reason.trim()) {
    throw new MeasurementValidationError("reason_required");
  }

  const original = await prisma.measurement.findUnique({ where: { id: input.measurementId } });
  if (!original) throw new TraceabilityAccessError("measurement_not_found");

  const anclas = await requireSubjectAccess(userAccountId, original);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, anclas, { actual: original.operatorPersonId });

  // No se corrige lo ya corregido: se corrige lo vigente. Dos correcciones de
  // la misma lectura no se ordenan entre sí —ninguna supersede a la otra— y
  // dejarían dos valores compitiendo por ser el bueno, que es exactamente lo
  // que `correctsId` existe para evitar. Quien quiera enmendar una corrección,
  // corrige la corrección.
  const yaCorregida = await prisma.measurement.findFirst({
    where: { correctsId: original.id },
    select: { id: true },
  });
  if (yaCorregida) throw new MeasurementValidationError("measurement_already_corrected");

  const normalized = normalizeToCanonical(original.variable as MeasurementVariable, input.value, input.unit);

  // Escritura y auditoría en la misma transacción (mecanismo de la PR #92):
  // corregir un hecho evidencial es en sí una escritura evidencial, y una
  // corrección guardada sin su audit es peor que ninguna.
  const correction = await prisma.$transaction(async (tx) => {
  // Parte 1, R6.6 (revisión final, ronda de arreglo 1, 2026-10-03): la cuarta puerta. Una corrección es una medición NUEVA
  // sobre el lote de la original, con la fecha que se le dé, y no miraba la división: una corrección fechada después de
  // dividir quedaba colgada del lote cerrado. La misma regla que `recordMeasurement`, con la fecha de la corrección: lo de
  // antes de la división se admite (decisión de Daniel, 2026-10-02).
  if (original.lotId && (await loteDividido(tx, original.lotId, input.occurredAt))) throw new MeasurementValidationError("lote_dividido");
  const creada = await tx.measurement.create({
    data: {
      variable: original.variable,
      value: normalized.value,
      unit: normalized.unit,
      occurredAt: input.occurredAt,
      lotId: original.lotId,
      sampleId: original.sampleId,
      // S1 §2 — el sujeto tiene que viajar a la fila que corrige. Sin esto,
      // una corrección de una lectura de biochar quedaría SIN SUJETO: no
      // aparecería en la ficha del lote, y corregirla otra vez fallaría con
      // `subject_required`. Con Lot/Sample no se notaba porque siempre había
      // uno de los dos.
      //
      // OBSERVADO al hacer esto, y NO arreglado aquí: los otros seis enlaces
      // (`roastSessionId`, `fermentationRunId`, `dryingRunId`,
      // `storageAssignmentId`, `treatmentBatchId`, `processingStageId`)
      // tampoco viajan, y ahí sí se pierde información — el esquema dice que
      // la presencia de `roastSessionId` es lo único que distingue una lectura
      // de humedad pre-tueste de una de almacenamiento, así que corregirla la
      // convierte en la otra. Es anterior a este cambio y toca módulos que
      // este trabajo no examinó; se señala en vez de tocarlo de paso.
      biocharBatchId: original.biocharBatchId,
      soilSampleId: original.soilSampleId,
      foliarSampleId: original.foliarSampleId,
      sourceType: "manual",
      operatorPersonId: input.operatorPersonId ?? null,
      notes: input.notes ?? null,
      correctsId: original.id,
      reason: input.reason,
      createdBy: userAccountId,
      provenanceClass: input.provenanceClass,
      sourceReference: input.sourceReference ?? null,
    },
  });

  // C1 §3: correcting an evidentiary fact is itself an evidentiary write.
  await recordAuditEvent(
    {
      actorUserAccountId: userAccountId,
      operation: "measurement.correct",
      entityType: "measurement",
      entityId: creada.id,
      before: original,
      after: creada,
      reason: input.reason,
      sourceInterface: "traceability.service",
    },
    tx,
  );
  return creada;
  });

  return correction;
}

/** Sólo inspecciones de una corrida vinculada al lote autorizado. */
export async function inspeccionesParaMedicion(userAccountId: string, lotId: string, dryingRunId: string) {
  await requireSubjectAccess(userAccountId, { lotId });
  const origen = await prisma.lotTransformation.findFirst({ where: { dryingRunId, inputs: { some: { lotId } } } });
  if (!origen) return [];
  return prisma.samplingEvent.findMany({ where: { dryingRunId }, select: { id: true, occurredAt: true }, orderBy: { occurredAt: "desc" } });
}
