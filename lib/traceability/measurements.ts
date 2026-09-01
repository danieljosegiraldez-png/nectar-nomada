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
import { prisma } from "../db";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { requireLocationAttributeAccess } from "./locations";
import type { ClassificationLevel } from "../rbac/types";
import { normalizeToCanonical, type MeasurementVariable } from "./units";
import { recordAuditEvent } from "../audit";
import type { ProvenanceClass } from "../../generated/prisma/client";

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
async function requireSubjectAccess(
  userAccountId: string,
  subject: { lotId?: string | null; sampleId?: string | null; biocharBatchId?: string | null },
) {
  if (subject.biocharBatchId) {
    // Exclusivo, no acumulativo: si alguien manda las dos cosas, no hay un
    // ámbito que resolver sino dos, y elegir uno sería elegir el más laxo.
    if (subject.lotId || subject.sampleId) {
      throw new MeasurementValidationError("biochar_batch_subject_is_exclusive");
    }
    const lote = await prisma.biocharBatch.findUnique({
      where: { id: subject.biocharBatchId },
      select: { producedAtLocationId: true },
    });
    if (!lote) throw new TraceabilityAccessError("biochar_batch_not_found");
    await requireLocationAttributeAccess(userAccountId, lote.producedAtLocationId);
    return;
  }

  const candidates = await scopeCandidatesForSubject(subject.lotId, subject.sampleId);
  await requireLotAccess(userAccountId, "manage", candidates);
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
  // S1 §2 — un sujeto independiente, no un enlace más: no exige `lotId`, lo
  // excluye. Es la Tabla 7 del marco (pH, CEC, ceniza, carbono, N, macros)
  // sobre un lote de biochar.
  biocharBatchId?: string | null;
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
  await requireSubjectAccess(userAccountId, input);

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

  const normalized = normalizeToCanonical(input.variable, input.value, input.unit);

  const measurement = await prisma.measurement.create({
    data: {
      variable: input.variable,
      value: normalized.value,
      unit: normalized.unit,
      occurredAt: input.occurredAt,
      lotId: input.lotId ?? null,
      sampleId: input.sampleId ?? null,
      roastSessionId: input.roastSessionId ?? null,
      fermentationRunId: input.fermentationRunId ?? null,
      dryingRunId: input.dryingRunId ?? null,
      storageAssignmentId: input.storageAssignmentId ?? null,
      treatmentBatchId: input.treatmentBatchId ?? null,
      processingStageId: input.processingStageId ?? null,
      biocharBatchId: input.biocharBatchId ?? null,
      sourceType: "manual",
      operatorPersonId: input.operatorPersonId ?? null,
      notes: input.notes ?? null,
      createdBy: userAccountId,
      provenanceClass: input.provenanceClass,
      sourceReference: input.sourceReference ?? null,
    },
  });

  // C1 §3: evidentiary write (carries provenanceClass).
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "measurement.create",
    entityType: "measurement",
    entityId: measurement.id,
    after: measurement,
    sourceInterface: "traceability.service",
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

  await requireSubjectAccess(userAccountId, original);

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
