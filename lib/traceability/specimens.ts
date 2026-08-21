/**
 * F1 (docs/implementation/30_F1_OPERACION_FINCA_ESQUEMA.md §3, §5), extending
 * `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §2's design. Schema/service only —
 * no UI, by explicit product-owner decision (`29_...md` §6).
 *
 * `specimen:manage`/`specimen:view` gate this file, not `lot:manage` — a
 * Specimen is a standing land asset (a tracked tree, or a broca trap
 * modeled as a Specimen per direct decision, §5), not a Lot in the
 * processing-chain sense, same reasoning A1 used for `apiary:manage`.
 *
 * Trap lifecycle (active → removed → reinstalled, §5) is deliberately not
 * a third status value — `Specimen.status` only ever holds `active` or
 * `removed` for a trap (`dead` is plant-only); the *history* of a cycle
 * lives in `SpecimenObservation` rows (`installed`/`removed`/
 * `reinstalled`), which is also where the actual capture-count readings
 * (`trap_check`) live — reusing the one observation mechanism rather than
 * building a parallel one, per the ticket's own instruction.
 */
import { prisma } from "../db";
import { can, CLASSIFICATION_GATE_DEFERRED } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import type { ScopeTarget } from "../rbac/types";
import type {
  DataQuality,
  ProvenanceClass,
  SpecimenObservationType,
  SpecimenSector,
  SpecimenType,
} from "../../generated/prisma/client";

export class SpecimenAccessError extends Error {}
export class SpecimenValidationError extends Error {}

async function resolveLocationScope(locationId: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) throw new SpecimenAccessError("location_not_found");
  return location;
}

async function requireSpecimenAccess(userAccountId: string, action: "manage" | "view", locationId: string) {
  const target: ScopeTarget = { scopeType: "location", scopeRefId: locationId };
  if (await can(userAccountId, action, "specimen", target, CLASSIFICATION_GATE_DEFERRED)) return;
  throw new SpecimenAccessError("no_specimen_access");
}

export interface CreateSpecimenInput {
  locationId: string;
  specimenType: SpecimenType;
  commonName: string;
  varietalNote?: string | null;
  plantedDate?: Date | null;
  sectorSimple?: SpecimenSector | null;
  gridRow?: number | null;
  gridPosition?: number | null;
  densityNote?: string | null;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
}

/**
 * §3: both sector mechanisms are always accepted together — a Specimen
 * "puede tener uno, el otro, los dos, o ninguno." No validation forces a
 * choice between `sectorSimple` and `gridRow`/`gridPosition`.
 */
export async function createSpecimen(userAccountId: string, input: CreateSpecimenInput) {
  if (!input.commonName.trim()) throw new SpecimenValidationError("common_name_required");

  await resolveLocationScope(input.locationId);
  await requireSpecimenAccess(userAccountId, "manage", input.locationId);

  const specimen = await prisma.specimen.create({
    data: {
      locationId: input.locationId,
      specimenType: input.specimenType,
      commonName: input.commonName.trim(),
      varietalNote: input.varietalNote ?? null,
      plantedDate: input.plantedDate ?? null,
      sectorSimple: input.sectorSimple ?? null,
      gridRow: input.gridRow ?? null,
      gridPosition: input.gridPosition ?? null,
      densityNote: input.densityNote ?? null,
      notes: input.notes ?? null,
      provenanceClass: input.provenanceClass,
      dataQuality: input.dataQuality ?? null,
      createdBy: userAccountId,
    },
  });

  // C1 §3: an origin/existence fact, same precedent as Colony (A2).
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "specimen.create",
    entityType: "specimen",
    entityId: specimen.id,
    after: specimen,
    sourceInterface: "traceability.service",
  });

  return specimen;
}

export interface RecordSpecimenObservationInput {
  specimenId: string;
  observationType: SpecimenObservationType;
  observedAt: Date;
  observerPersonId?: string | null;
  // Only meaningful for observationType = "trap_check" — validated below,
  // not enforced at the schema level (a Measurement-style generalized
  // value/unit pair wasn't asked for and would be inventing structure
  // ahead of a second numeric observation type actually needing one).
  captureCount?: number | null;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
}

export async function recordSpecimenObservation(userAccountId: string, input: RecordSpecimenObservationInput) {
  if (input.observationType === "trap_check" && input.captureCount == null) {
    throw new SpecimenValidationError("capture_count_required_for_trap_check");
  }

  const specimen = await prisma.specimen.findUnique({ where: { id: input.specimenId } });
  if (!specimen) throw new SpecimenAccessError("specimen_not_found");

  await requireSpecimenAccess(userAccountId, "manage", specimen.locationId);

  const observation = await prisma.specimenObservation.create({
    data: {
      specimenId: input.specimenId,
      observationType: input.observationType,
      observedAt: input.observedAt,
      observerPersonId: input.observerPersonId ?? null,
      captureCount: input.captureCount ?? null,
      notes: input.notes ?? null,
      provenanceClass: input.provenanceClass,
      dataQuality: input.dataQuality ?? null,
      createdBy: userAccountId,
    },
  });

  // §5's cycle: `removed` sets the Specimen to removed; `installed`/
  // `reinstalled` return it to active. `trap_check`/other observation
  // types never change Specimen.status — a capture-count reading isn't a
  // lifecycle transition.
  if (input.observationType === "removed") {
    await prisma.specimen.update({ where: { id: input.specimenId }, data: { status: "removed" } });
  } else if (input.observationType === "installed" || input.observationType === "reinstalled") {
    await prisma.specimen.update({ where: { id: input.specimenId }, data: { status: "active" } });
  }

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "specimen_observation.create",
    entityType: "specimen_observation",
    entityId: observation.id,
    after: observation,
    sourceInterface: "traceability.service",
  });

  return observation;
}

/** §5: the series, not the individual reading, is what's valuable — "qué sectores están más afectados y cuáles ya fueron tratados." */
export async function getTrapCheckSeries(userAccountId: string, specimenId: string) {
  const specimen = await prisma.specimen.findUnique({ where: { id: specimenId } });
  if (!specimen) throw new SpecimenAccessError("specimen_not_found");

  await requireSpecimenAccess(userAccountId, "view", specimen.locationId);

  return prisma.specimenObservation.findMany({
    where: { specimenId, observationType: "trap_check" },
    orderBy: { observedAt: "asc" },
  });
}
