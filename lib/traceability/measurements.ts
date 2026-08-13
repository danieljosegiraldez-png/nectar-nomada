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
 */
import { prisma } from "../db";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { normalizeToCanonical, type MeasurementVariable } from "./units";
import { recordAuditEvent } from "../audit";
import type { ProvenanceClass } from "../../generated/prisma/client";

export class MeasurementValidationError extends Error {}

interface ScopeCandidate {
  projectId?: string | null;
  locationId?: string | null;
}

async function scopeCandidatesForSubject(lotId?: string | null, sampleId?: string | null): Promise<ScopeCandidate[]> {
  if (!lotId && !sampleId) {
    throw new MeasurementValidationError("subject_required");
  }

  const candidates: ScopeCandidate[] = [];
  if (lotId) {
    const lot = await prisma.lot.findUnique({ where: { id: lotId } });
    if (!lot) throw new TraceabilityAccessError("lot_not_found");
    candidates.push({ projectId: lot.projectId, locationId: lot.locationId });
  }
  if (sampleId) {
    const sample = await prisma.sample.findUnique({ where: { id: sampleId } });
    if (!sample) throw new TraceabilityAccessError("sample_not_found");
    candidates.push({ projectId: sample.projectId, locationId: sample.locationId });
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
  const candidates = await scopeCandidatesForSubject(input.lotId, input.sampleId);
  await requireLotAccess(userAccountId, "manage", candidates);

  if (input.roastSessionId && !input.lotId) {
    throw new MeasurementValidationError("roast_session_link_requires_lot_id");
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

  const candidates = await scopeCandidatesForSubject(original.lotId, original.sampleId);
  await requireLotAccess(userAccountId, "manage", candidates);

  const normalized = normalizeToCanonical(original.variable as MeasurementVariable, input.value, input.unit);

  const correction = await prisma.measurement.create({
    data: {
      variable: original.variable,
      value: normalized.value,
      unit: normalized.unit,
      occurredAt: input.occurredAt,
      lotId: original.lotId,
      sampleId: original.sampleId,
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
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "measurement.correct",
    entityType: "measurement",
    entityId: correction.id,
    before: original,
    after: correction,
    reason: input.reason,
    sourceInterface: "traceability.service",
  });

  return correction;
}
