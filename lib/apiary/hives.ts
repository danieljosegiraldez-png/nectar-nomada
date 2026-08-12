/**
 * Ticket A1 (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md §2-3), A2
 * (§1a, §3 REVISED) added Colony's origin fields below. Hive/Colony are
 * much smaller than lib/traceability/lots.ts's shape: no transformation
 * DAG, just physical/biological entities and an RBAC check mirroring
 * requireLotAccess's own project/location leaf-scope containment
 * (RBAC.md §3), against the `apiary` subject instead of `lot`.
 *
 * Inspection/ColonyEvent (recordInspection/recordColonyEvent) live in
 * ./inspections and ./colonyEvents, not here — both resolve RBAC via
 * their parent Colony's own Hive, using requireApiaryAccess exported
 * below (reuse, not a second RBAC helper).
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import type { ScopeTarget } from "../rbac/types";
import type { ColonyOriginType, DataQuality, ProvenanceClass } from "../../generated/prisma/client";

export class ApiaryAccessError extends Error {}

/** Every concrete scope target a Hive (or a to-be-created Hive's parent context) resolves against — never just one. */
export function apiaryScopeTargetsFor(input: { projectId?: string | null; locationId?: string | null }): ScopeTarget[] {
  const targets: ScopeTarget[] = [];
  if (input.projectId) targets.push({ scopeType: "project", scopeRefId: input.projectId });
  if (input.locationId) targets.push({ scopeType: "location", scopeRefId: input.locationId });
  if (targets.length === 0) targets.push({ scopeType: "platform", scopeRefId: null });
  return targets;
}

export async function requireApiaryAccess(
  userAccountId: string,
  action: "manage" | "view",
  candidates: ReadonlyArray<{ projectId?: string | null; locationId?: string | null }>,
) {
  for (const candidate of candidates) {
    for (const target of apiaryScopeTargetsFor(candidate)) {
      if (await can(userAccountId, action, "apiary", target)) return;
    }
  }
  throw new ApiaryAccessError("no_apiary_access");
}

export interface CreateHiveInput {
  identifier: string;
  locationId: string;
  projectId?: string | null;
  installedAt?: Date | null;
  status?: "active" | "empty" | "retired";
}

export async function createHive(userAccountId: string, input: CreateHiveInput) {
  await requireApiaryAccess(userAccountId, "manage", [input]);

  return prisma.hive.create({
    data: {
      identifier: input.identifier,
      locationId: input.locationId,
      projectId: input.projectId ?? null,
      installedAt: input.installedAt ?? null,
      status: input.status ?? "active",
      createdBy: userAccountId,
    },
  });
}

export interface CreateColonyInput {
  hiveId: string;
  startedAt: Date;
  status?: "active" | "dead" | "absconded";
  // §1's boundary analysis: "Pass, required — a capture-or-lose-it fact."
  // No default — a colony's origin, once forgotten, is not reconstructable
  // from anything else the platform records.
  originType: ColonyOriginType;
  originNote?: string | null;
  // No default here either, matching every other provenance-carrying
  // write's convention (ADR-038) — the action layer must state a real
  // class.
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
}

export async function createColony(userAccountId: string, input: CreateColonyInput) {
  const hive = await prisma.hive.findUnique({ where: { id: input.hiveId } });
  if (!hive) throw new ApiaryAccessError("hive_not_found");
  await requireApiaryAccess(userAccountId, "manage", [{ projectId: hive.projectId, locationId: hive.locationId }]);

  return prisma.colony.create({
    data: {
      hiveId: input.hiveId,
      startedAt: input.startedAt,
      status: input.status ?? "active",
      originType: input.originType,
      originNote: input.originNote ?? null,
      provenanceClass: input.provenanceClass,
      dataQuality: input.dataQuality ?? null,
      createdBy: userAccountId,
    },
  });
}

export async function getHive(userAccountId: string, hiveId: string) {
  const hive = await prisma.hive.findUnique({ where: { id: hiveId }, include: { colonies: true } });
  if (!hive) throw new ApiaryAccessError("hive_not_found");
  await requireApiaryAccess(userAccountId, "view", [{ projectId: hive.projectId, locationId: hive.locationId }]);
  return hive;
}
