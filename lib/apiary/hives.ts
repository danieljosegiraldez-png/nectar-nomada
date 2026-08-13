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
import type { ColonyOriginType, DataQuality, Prisma, ProvenanceClass } from "../../generated/prisma/client";

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

/**
 * A7 — recordColonyEvent's own gate: accepts the broad `apiary:manage`
 * (Farm Operator and anyone else with full apiary write access) OR the
 * narrower `colony_event:manage` (Apiary Colony Event Recorder — a
 * trainee who can log events but not create a Hive/Colony/Inspection).
 * recordInspection deliberately does NOT use this — it stays gated by
 * apiary:manage alone, per §7's own requirement that ColonyEvent access
 * never implies Inspection access.
 */
export async function requireColonyEventWriteAccess(
  userAccountId: string,
  candidates: ReadonlyArray<{ projectId?: string | null; locationId?: string | null }>,
) {
  for (const candidate of candidates) {
    for (const target of apiaryScopeTargetsFor(candidate)) {
      if (await can(userAccountId, "manage", "apiary", target)) return;
      if (await can(userAccountId, "manage", "colony_event", target)) return;
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
  const hive = await prisma.hive.findUnique({
    where: { id: hiveId },
    include: { colonies: { include: { assets: true } }, assets: true },
  });
  if (!hive) throw new ApiaryAccessError("hive_not_found");
  await requireApiaryAccess(userAccountId, "view", [{ projectId: hive.projectId, locationId: hive.locationId }]);
  return hive;
}

/**
 * A5 (§3). What apiary_site Locations a user can see for the `/apiaries`
 * list — the same "aggregate the concrete scope refs an Assignment
 * actually grants" reasoning `lib/traceability/lots.ts`'s
 * `resolveLotVisibility` already uses for `/lots`, against the `apiary`
 * subject instead of `lot`. A platform-scoped Assignment sees every
 * apiary; a project/location-scoped one sees only apiaries reachable
 * through those scopes; no qualifying Assignment sees none.
 */
interface ApiaryVisibility {
  mode: "all" | "none" | "scoped";
  projectIds: string[];
  locationIds: string[];
}

async function resolveApiaryVisibility(userAccountId: string, action: "view" | "manage" = "view"): Promise<ApiaryVisibility> {
  const now = new Date();
  const assignments = await prisma.assignment.findMany({
    where: {
      userAccountId,
      status: "active",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
    include: { scope: true, roleProfile: { include: { permissions: { include: { permission: true } } } } },
  });

  const granting = assignments.filter((a) =>
    a.roleProfile.permissions.some((rp) => rp.permission.resourceType === "apiary" && rp.permission.action === action),
  );

  if (granting.some((a) => a.scope.scopeType === "platform")) {
    return { mode: "all", projectIds: [], locationIds: [] };
  }

  const projectIds = [
    ...new Set(
      granting
        .filter((a) => a.scope.scopeType === "project")
        .map((a) => a.scope.scopeRefId)
        .filter((id): id is string => id != null),
    ),
  ];
  const locationIds = [
    ...new Set(
      granting
        .filter((a) => a.scope.scopeType === "location")
        .map((a) => a.scope.scopeRefId)
        .filter((id): id is string => id != null),
    ),
  ];

  if (projectIds.length === 0 && locationIds.length === 0) {
    return { mode: "none", projectIds: [], locationIds: [] };
  }
  return { mode: "scoped", projectIds, locationIds };
}

/**
 * Capped at 200, newest-named-first is meaningless for a handful of
 * apiary sites — ordered by name instead, matching how few rows this
 * table will realistically ever hold relative to `/lots`.
 */
export async function getApiaryList(userAccountId: string) {
  const visibility = await resolveApiaryVisibility(userAccountId);
  if (visibility.mode === "none") return [];

  const where: Prisma.LocationWhereInput = {
    locationType: "apiary_site",
    ...(visibility.mode === "scoped"
      ? {
          OR: [
            { id: { in: visibility.locationIds } },
            { hives: { some: { projectId: { in: visibility.projectIds } } } },
          ],
        }
      : {}),
  };

  return prisma.location.findMany({
    where,
    include: { hives: true },
    orderBy: { name: "asc" },
    take: 200,
  });
}

export async function getApiaryDetail(userAccountId: string, locationId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    include: { hives: { include: { colonies: true }, orderBy: { identifier: "asc" } } },
  });
  if (!location || location.locationType !== "apiary_site") throw new ApiaryAccessError("apiary_not_found");

  // Reachable either directly (a location-scoped Assignment against this
  // apiary itself) or through any Hive already sited here (a project-
  // scoped Assignment against whatever Project that Hive belongs to) —
  // the same "try every concrete candidate" discipline requireApiaryAccess
  // already applies everywhere else, just fed more than one candidate.
  const candidates = [{ locationId: location.id }, ...location.hives.map((h) => ({ projectId: h.projectId, locationId: h.locationId }))];
  await requireApiaryAccess(userAccountId, "view", candidates);

  return location;
}

/**
 * Optional Project dropdown for the "New Hive" form — mirrors
 * `lib/traceability/lots.ts`'s `getManageableContext` for `lot`, against
 * `apiary` instead. `Hive.projectId` is genuinely optional (A1's own
 * note: a location-scoped Assignment already suffices on its own), so an
 * empty list here just means the form omits the dropdown, not an error.
 */
export async function getManageableApiaryProjects(userAccountId: string) {
  const visibility = await resolveApiaryVisibility(userAccountId, "manage");
  if (visibility.mode === "none") return [];
  if (visibility.mode === "all") return prisma.project.findMany({ orderBy: { name: "asc" } });
  return prisma.project.findMany({ where: { id: { in: visibility.projectIds } }, orderBy: { name: "asc" } });
}
