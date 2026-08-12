/**
 * Ticket A2 — REVISED (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md
 * §1a, §3). Inspection stays formal and structurally protected — no
 * `feeding`/`treatment` value exists anywhere on this table, so the DB
 * schema itself makes the original collapse-bug impossible.
 *
 * RBAC resolves via the parent Colony's own Hive (project/location),
 * reusing requireApiaryAccess from ./hives rather than a second helper —
 * the same "resolve via the parent" pattern lib/traceability/storage.ts
 * already uses against its parent Lot.
 */
import { prisma } from "../db";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import type { InspectionOutcome, ProvenanceClass } from "../../generated/prisma/client";

async function resolveColonyScope(colonyId: string) {
  const colony = await prisma.colony.findUnique({ where: { id: colonyId }, include: { hive: true } });
  if (!colony) throw new ApiaryAccessError("colony_not_found");
  return { projectId: colony.hive.projectId, locationId: colony.hive.locationId };
}

export interface RecordInspectionInput {
  colonyId: string;
  occurredAt?: Date;
  operatorPersonId?: string | null;
  outcome: InspectionOutcome;
  broodPatternNote?: string | null;
  queenSighted?: boolean | null;
  storesLevel?: string | null;
  temperamentNote?: string | null;
  pestDiseaseFlags?: string | null;
  note?: string | null;
}

/**
 * `provenanceClass` is not a caller-supplied field — fixed to
 * `direct_observation` here, at the action layer, for every call site
 * (§1a: "a trained person opened the hive and assessed it"), the same
 * non-operator-selectable discipline T12.6 already established for its
 * own fixed-per-call-site provenanceClass values.
 */
export async function recordInspection(userAccountId: string, input: RecordInspectionInput) {
  const scope = await resolveColonyScope(input.colonyId);
  await requireApiaryAccess(userAccountId, "manage", [scope]);

  const provenanceClass: ProvenanceClass = "direct_observation";

  return prisma.inspection.create({
    data: {
      colonyId: input.colonyId,
      occurredAt: input.occurredAt ?? new Date(),
      operatorPersonId: input.operatorPersonId ?? null,
      outcome: input.outcome,
      broodPatternNote: input.broodPatternNote ?? null,
      queenSighted: input.queenSighted ?? null,
      storesLevel: input.storesLevel ?? null,
      temperamentNote: input.temperamentNote ?? null,
      pestDiseaseFlags: input.pestDiseaseFlags ?? null,
      note: input.note ?? null,
      provenanceClass,
      createdBy: userAccountId,
    },
  });
}

export async function listInspectionsForColony(userAccountId: string, colonyId: string) {
  const scope = await resolveColonyScope(colonyId);
  await requireApiaryAccess(userAccountId, "view", [scope]);

  return prisma.inspection.findMany({ where: { colonyId }, orderBy: { occurredAt: "desc" } });
}
