/**
 * Phase 1, ticket T1 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §8, §34). Canonical Lot + LotTransformation — the mechanism underneath
 * DOMAIN_MODEL.md §4's Agricultural Traceability chain, reconciling it with
 * COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md §F's already-approved design.
 *
 * Append-only by construction: there is deliberately no `updateLot` or
 * `updateLotTransformation` function in this file. A correction is always a
 * new LotTransformation, never an edit to an existing one — the same
 * principle already proven for sensory.Assessment and
 * SensoryProtocolVersion elsewhere in this codebase (execution plan §8.2).
 *
 * RBAC: Farm Operator Assignments may be scoped to `project` or `location`
 * (execution plan §26 decision record) — a *location*-scoped Assignment only
 * authorizes an action against a Lot if the Lot itself resolves to that
 * location (RBAC.md §3's leaf-scope containment rule), so every check here
 * tries every scope target a Lot actually carries (project, location),
 * never just one.
 */
import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import type { ScopeTarget } from "../rbac/types";
import type { Prisma, ProvenanceClass } from "../../generated/prisma/client";

export class TraceabilityAccessError extends Error {}

/** Every concrete scope target a Lot (or a to-be-created Lot's parent context) resolves against — never just one. */
export function scopeTargetsFor(input: { projectId?: string | null; locationId?: string | null }): ScopeTarget[] {
  const targets: ScopeTarget[] = [];
  if (input.projectId) targets.push({ scopeType: "project", scopeRefId: input.projectId });
  if (input.locationId) targets.push({ scopeType: "location", scopeRefId: input.locationId });
  // A Lot with neither is only manageable platform-wide — `can()` already
  // resolves a Platform Admin's assignment against any concrete target, but
  // with no project/location to point at, the only target left to check is
  // platform scope itself.
  if (targets.length === 0) targets.push({ scopeType: "platform", scopeRefId: null });
  return targets;
}

export async function requireLotAccess(
  userAccountId: string,
  action: "manage" | "view",
  candidates: ReadonlyArray<{ projectId?: string | null; locationId?: string | null }>,
) {
  for (const candidate of candidates) {
    for (const target of scopeTargetsFor(candidate)) {
      if (await can(userAccountId, action, "lot", target)) return;
    }
  }
  throw new TraceabilityAccessError("no_lot_access");
}

export interface CreateLotInput {
  lotCode: string;
  // A3 (22_APIARY_V1_SCOPING_REPORT.md §2) added "honey" to the DB enum;
  // kept in sync here rather than left stale — a caller creating or
  // filtering a honey Lot through the generic createLot()/getLotList()
  // path needs this widened, same as every prior lotType addition.
  lotType: "cherry" | "processing" | "drying" | "green" | "roast" | "sample" | "other" | "honey";
  organizationId?: string | null;
  projectId?: string | null;
  locationId?: string | null;
}

export async function createLot(userAccountId: string, input: CreateLotInput) {
  await requireLotAccess(userAccountId, "manage", [input]);

  return prisma.lot.create({
    data: {
      lotCode: input.lotCode,
      lotType: input.lotType,
      organizationId: input.organizationId ?? null,
      projectId: input.projectId ?? null,
      locationId: input.locationId ?? null,
      createdBy: userAccountId,
    },
  });
}

export interface RecordTransformationInput {
  transformationType:
    | "split"
    | "merge"
    | "blend"
    | "stage_change"
    | "sample_extraction"
    | "loss"
    | "disposal"
    | "sale";
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required, no fallback — the caller (app/actions/traceability.ts)
  // must state a real class for every transformation type; there is no
  // single correct default across split/merge/blend/stage_change/etc.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  inputs: ReadonlyArray<{ lotId: string; quantity?: number | null; unit?: string | null }>;
  // New Lot(s) this transformation produces — every LotTransformation output
  // is a freshly created Lot row (execution plan §8.1's lineage diagram: a
  // stage change, a split, a merge all produce a *new* node, never mutate an
  // existing one), never a reference to a pre-existing Lot. Empty for
  // loss/disposal/sale, and for sample_extraction in this ticket (Sample
  // creation is T5, not T1 — the transformation record itself is still
  // valid with zero Lot outputs).
  outputs: ReadonlyArray<{
    lotCode: string;
    lotType: CreateLotInput["lotType"];
    quantity?: number | null;
    unit?: string | null;
  }>;
}

/**
 * Creates a LotTransformation plus its input rows (referencing existing
 * Lots) and output rows (each backed by a brand-new Lot), atomically. RBAC
 * is checked against every *input* Lot's own project/location scope — an
 * operator must have manage access to at least one of the lots actually
 * being transformed; newly-created outputs inherit no independent scope
 * requirement of their own since they don't exist until this call succeeds.
 */
export async function recordTransformation(userAccountId: string, input: RecordTransformationInput) {
  if (input.inputs.length === 0) {
    throw new TraceabilityAccessError("inputs_required");
  }

  const inputLots = await prisma.lot.findMany({
    where: { id: { in: input.inputs.map((i) => i.lotId) } },
  });
  if (inputLots.length !== new Set(input.inputs.map((i) => i.lotId)).size) {
    throw new TraceabilityAccessError("lot_not_found");
  }

  await requireLotAccess(
    userAccountId,
    "manage",
    inputLots.map((lot) => ({ projectId: lot.projectId, locationId: lot.locationId })),
  );

  const provenanceClass = input.provenanceClass;

  const result = await prisma.$transaction(async (tx) => {
    const transformation = await tx.lotTransformation.create({
      data: {
        transformationType: input.transformationType,
        occurredAt: input.occurredAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
        provenanceClass,
        sourceReference: input.sourceReference ?? null,
        inputs: {
          create: input.inputs.map((i) => ({
            lotId: i.lotId,
            quantity: i.quantity ?? null,
            unit: i.unit ?? null,
          })),
        },
      },
    });

    // Inherit the first input lot's project/location/organization context —
    // the same farm/plot a material came from, unless a future ticket needs
    // to model a genuine cross-project transfer explicitly. Guaranteed to
    // exist: input.inputs.length was checked non-zero above, and inputLots
    // was verified to match that count.
    const sourceLot = inputLots[0]!;

    const outputLots = [];
    for (const output of input.outputs) {
      const outputLot = await tx.lot.create({
        data: {
          lotCode: output.lotCode,
          lotType: output.lotType,
          organizationId: sourceLot.organizationId,
          projectId: sourceLot.projectId,
          locationId: sourceLot.locationId,
          createdBy: userAccountId,
        },
      });
      await tx.lotTransformationOutput.create({
        data: {
          transformationId: transformation.id,
          lotId: outputLot.id,
          quantity: output.quantity ?? null,
          unit: output.unit ?? null,
        },
      });
      // Seed the new lot's own quantity ledger so computeCurrentQuantity
      // (lib/traceability/quantity.ts) reports correctly for it from
      // creation, not just for lots created by HarvestEvent/ReceivingEvent
      // — LotTransformationOutput.quantity was previously only a snapshot
      // on the join row, disconnected from SUM(QuantityEvent). Skipped
      // when quantity isn't given, same "missing stays missing" rule as
      // everywhere else.
      if (output.quantity != null && output.unit) {
        await tx.quantityEvent.create({
          data: {
            lotId: outputLot.id,
            eventType: "process_output",
            quantity: output.quantity,
            unit: output.unit,
            occurredAt: input.occurredAt,
            transformationId: transformation.id,
            createdBy: userAccountId,
            // Same reliability as the transformation that produced it.
            provenanceClass,
            sourceReference: input.sourceReference ?? null,
          },
        });
      }
      outputLots.push(outputLot);
    }

    return { transformation, outputLots };
  });

  // C1 §3: evidentiary write (LotTransformation carries provenanceClass) —
  // recorded after the transaction commits, not inside it, since an audit
  // row for a transaction that later rolled back would misrepresent what
  // actually happened.
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "lot_transformation.create",
    entityType: "lot_transformation",
    entityId: result.transformation.id,
    after: result.transformation,
    sourceInterface: "traceability.service",
  });

  return result;
}

/**
 * Both directions of lineage, via recursive CTEs — "where did this come
 * from" (ancestors, walking output → input backward) and "what did this
 * become" (descendants, walking input → output forward). Execution plan
 * §8.3: no graph database needed, ordinary recursive SQL over the
 * input/output join tables.
 */
export async function getLotLineage(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");

  await requireLotAccess(userAccountId, "view", [{ projectId: lot.projectId, locationId: lot.locationId }]);

  const ancestors = await prisma.$queryRaw<Array<{ lot_id: string; depth: number }>>`
    WITH RECURSIVE ancestry AS (
      SELECT lto.lot_id AS output_lot_id, lti.lot_id AS input_lot_id, 0 AS depth
      FROM traceability.lot_transformation_output lto
      JOIN traceability.lot_transformation_input lti ON lti.transformation_id = lto.transformation_id
      WHERE lto.lot_id = ${lotId}::uuid
      UNION ALL
      SELECT lto.lot_id, lti.lot_id, ancestry.depth + 1
      FROM ancestry
      JOIN traceability.lot_transformation_output lto ON lto.lot_id = ancestry.input_lot_id
      JOIN traceability.lot_transformation_input lti ON lti.transformation_id = lto.transformation_id
    )
    SELECT DISTINCT input_lot_id AS lot_id, depth FROM ancestry ORDER BY depth ASC;
  `;

  const descendants = await prisma.$queryRaw<Array<{ lot_id: string; depth: number }>>`
    WITH RECURSIVE descent AS (
      SELECT lti.lot_id AS input_lot_id, lto.lot_id AS output_lot_id, 0 AS depth
      FROM traceability.lot_transformation_input lti
      JOIN traceability.lot_transformation_output lto ON lto.transformation_id = lti.transformation_id
      WHERE lti.lot_id = ${lotId}::uuid
      UNION ALL
      SELECT lti.lot_id, lto.lot_id, descent.depth + 1
      FROM descent
      JOIN traceability.lot_transformation_input lti ON lti.lot_id = descent.output_lot_id
      JOIN traceability.lot_transformation_output lto ON lto.transformation_id = lti.transformation_id
    )
    SELECT DISTINCT output_lot_id AS lot_id, depth FROM descent ORDER BY depth ASC;
  `;

  return {
    lot,
    ancestorLotIds: ancestors.map((r) => r.lot_id),
    descendantLotIds: descendants.map((r) => r.lot_id),
  };
}

/**
 * T10 (§29, §34): what Lots (and, by extension, Samples) a user can see for
 * list/dashboard purposes — distinct from `requireLotAccess`'s per-resource
 * check, since "list everything I can see" needs the actual set of
 * project/location scope refs a user's Assignments grant `lot:view`
 * against, not just a yes/no answer for one already-known Lot. A
 * platform-scoped Assignment (RBAC.md §3: "platform always contains")
 * sees everything; a project/location-scoped one sees only Lots resolving
 * to those scopes; a user with no qualifying Assignment sees nothing.
 */
interface LotVisibility {
  mode: "all" | "none" | "scoped";
  projectIds: string[];
  locationIds: string[];
}

async function resolveLotVisibility(userAccountId: string, action: "view" | "manage" = "view"): Promise<LotVisibility> {
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

  const viewGranting = assignments.filter((a) =>
    a.roleProfile.permissions.some((rp) => rp.permission.resourceType === "lot" && rp.permission.action === action),
  );

  if (viewGranting.some((a) => a.scope.scopeType === "platform")) {
    return { mode: "all", projectIds: [], locationIds: [] };
  }

  const projectIds = [
    ...new Set(
      viewGranting
        .filter((a) => a.scope.scopeType === "project")
        .map((a) => a.scope.scopeRefId)
        .filter((id): id is string => id != null),
    ),
  ];
  const locationIds = [
    ...new Set(
      viewGranting
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

function scopeOrClauses(visibility: LotVisibility): Array<{ projectId: { in: string[] } } | { locationId: { in: string[] } }> {
  const clauses: Array<{ projectId: { in: string[] } } | { locationId: { in: string[] } }> = [];
  if (visibility.projectIds.length) clauses.push({ projectId: { in: visibility.projectIds } });
  if (visibility.locationIds.length) clauses.push({ locationId: { in: visibility.locationIds } });
  return clauses;
}

/** Null return means "matches nothing" — the caller should short-circuit rather than query with an empty OR (which Prisma/Postgres would read as "matches everything"). */
function lotWhereFromVisibility(visibility: LotVisibility): Prisma.LotWhereInput | null {
  if (visibility.mode === "all") return {};
  if (visibility.mode === "none") return null;
  return { OR: scopeOrClauses(visibility) };
}

function sampleWhereFromVisibility(visibility: LotVisibility): Prisma.SampleWhereInput | null {
  if (visibility.mode === "all") return {};
  if (visibility.mode === "none") return null;
  return { OR: scopeOrClauses(visibility) };
}

function lotMatchesVisibility(lot: { projectId: string | null; locationId: string | null }, visibility: LotVisibility): boolean {
  if (visibility.mode === "all") return true;
  if (visibility.mode === "none") return false;
  return (
    (lot.projectId != null && visibility.projectIds.includes(lot.projectId)) ||
    (lot.locationId != null && visibility.locationIds.includes(lot.locationId))
  );
}

export interface LotListFilters {
  lotType?: CreateLotInput["lotType"];
}

/** Filterable list for the `/lots` screen (§30 screen 2) — capped at 200, newest first; Phase 1 has no pagination UI yet. */
export async function getLotList(userAccountId: string, filters: LotListFilters = {}) {
  const visibility = await resolveLotVisibility(userAccountId);
  const where = lotWhereFromVisibility(visibility);
  if (where === null) return [];

  return prisma.lot.findMany({
    where: { ...where, ...(filters.lotType ? { lotType: filters.lotType } : {}) },
    include: { project: true, organization: true, location: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

// Placeholder threshold for the "requiring attention" card (§23: "past a
// configurable threshold") — Phase 1 has no settings UI to make this
// actually configurable yet, so it's a named constant, not a magic number.
const ATTENTION_MEASUREMENT_STALENESS_HOURS = 24;

/**
 * The four Active Operations cards (§23) — concrete, actionable queries,
 * not a decorative dashboard. Every card is scoped to what this user's
 * Assignments actually let them see.
 */
export async function getActiveOperations(userAccountId: string) {
  const visibility = await resolveLotVisibility(userAccountId);
  if (visibility.mode === "none") {
    return { activeFermentationRuns: [], activeDryingRuns: [], lotsNeedingMeasurement: [], samplesAwaitingSensory: [] };
  }

  const runInclude = {
    transformations: {
      where: { transformationType: "stage_change" as const },
      orderBy: { occurredAt: "asc" as const },
      take: 1,
      include: { inputs: { include: { lot: { include: { project: true } } } } },
    },
  };

  const [fermentationRunRows, dryingRunRows] = await Promise.all([
    prisma.fermentationRun.findMany({ where: { endedAt: null }, include: runInclude }),
    prisma.dryingRun.findMany({ where: { endedAt: null }, include: runInclude }),
  ]);

  const withSourceLot = <T extends { transformations: Array<{ inputs: Array<{ lot: NonNullable<unknown> }> }> }>(rows: T[]) =>
    rows
      .map((run) => ({ run, lot: run.transformations[0]?.inputs[0]?.lot ?? null }))
      .filter((entry): entry is { run: T; lot: NonNullable<(typeof entry)["lot"]> } => entry.lot != null);

  const activeFermentationRuns = withSourceLot(fermentationRunRows).filter((e) => lotMatchesVisibility(e.lot as { projectId: string | null; locationId: string | null }, visibility));
  const activeDryingRuns = withSourceLot(dryingRunRows).filter((e) => lotMatchesVisibility(e.lot as { projectId: string | null; locationId: string | null }, visibility));

  const staleThreshold = new Date(Date.now() - ATTENTION_MEASUREMENT_STALENESS_HOURS * 60 * 60 * 1000);
  const activeLotIds = [
    ...activeFermentationRuns.map((e) => (e.lot as { id: string }).id),
    ...activeDryingRuns.map((e) => (e.lot as { id: string }).id),
  ];
  const recentlyMeasuredLotIds =
    activeLotIds.length === 0
      ? new Set<string>()
      : new Set(
          (
            await prisma.measurement.findMany({
              where: { lotId: { in: activeLotIds }, occurredAt: { gte: staleThreshold } },
              select: { lotId: true },
            })
          ).map((m) => m.lotId),
        );
  const lotsNeedingMeasurement = [...activeFermentationRuns, ...activeDryingRuns]
    .map((e) => e.lot as { id: string; lotCode: string })
    .filter((lot) => !recentlyMeasuredLotIds.has(lot.id));

  const sampleWhere = sampleWhereFromVisibility(visibility);
  const samplesAwaitingSensory =
    sampleWhere === null
      ? []
      : await prisma.sample.findMany({
          where: { ...sampleWhere, sourceLotId: { not: null }, blindMappings: { none: {} } },
          orderBy: { createdAt: "desc" },
          take: 50,
        });

  return { activeFermentationRuns, activeDryingRuns, lotsNeedingMeasurement, samplesAwaitingSensory };
}

/**
 * Full Lot Detail aggregation (§23) — everything the page needs in one
 * call except current quantity (lib/traceability/quantity.ts's
 * computeCurrentQuantity, called separately by the page to avoid a
 * lots.ts → quantity.ts → lots.ts import cycle). `auditEvents` is
 * intentionally queried even though no Phase 1 write path has ever
 * populated `core.AuditEvent` for a traceability entity yet — the section
 * renders correctly empty, which is an honest reflection of unbuilt
 * instrumentation, not a bug in this query.
 */
export async function getLotDetail(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    include: { project: true, organization: true, location: true },
  });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");

  await requireLotAccess(userAccountId, "view", [{ projectId: lot.projectId, locationId: lot.locationId }]);

  const [
    lineage,
    transformations,
    quantityEvents,
    measurements,
    samples,
    storageAssignments,
    tasks,
    auditEvents,
    harvestEvent,
    receivingEvent,
    apiaryHarvestEvent,
  ] = await Promise.all([
    getLotLineage(userAccountId, lotId),
    prisma.lotTransformation.findMany({
      where: { OR: [{ inputs: { some: { lotId } } }, { outputs: { some: { lotId } } }] },
      include: { inputs: true, outputs: true },
      orderBy: { occurredAt: "asc" },
    }),
    prisma.quantityEvent.findMany({ where: { lotId }, orderBy: { occurredAt: "asc" } }),
    prisma.measurement.findMany({ where: { lotId }, orderBy: { occurredAt: "asc" } }),
    prisma.sample.findMany({ where: { sourceLotId: lotId }, orderBy: { createdAt: "asc" } }),
    prisma.storageAssignment.findMany({ where: { lotId }, include: { location: true }, orderBy: { startedAt: "asc" } }),
    lot.projectId
      ? prisma.task.findMany({ where: { projectId: lot.projectId }, orderBy: { createdAt: "desc" }, take: 20 })
      : Promise.resolve([]),
    prisma.auditEvent.findMany({ where: { entityType: "Lot", entityId: lotId }, orderBy: { occurredAt: "desc" } }),
    // T12.5: the originating HarvestEvent, if this lot came from one.
    prisma.harvestEvent.findUnique({ where: { resultingLotId: lotId } }),
    // T12.6: the originating ReceivingEvent, if this lot came from one
    // instead — needed so labour can attach to Receiving specifically
    // (unlike T12.5's photos, which attach receiving-stage media via
    // lotId directly since Asset has no receivingEventId FK; labour_entry
    // does have one, per the source report's own field spec).
    prisma.receivingEvent.findUnique({ where: { resultingLotId: lotId } }),
    // A5 (22_APIARY_V1_SCOPING_REPORT.md) — the originating
    // ApiaryHarvestEvent, if this lot is a honey batch. Mutually exclusive
    // with harvestEvent/receivingEvent in practice (a Lot originates from
    // at most one of the three), fetched unconditionally the same way —
    // cheap for a lot that isn't honey (a single indexed unique lookup
    // that just returns null), no lotType branching needed to decide
    // whether to ask.
    prisma.apiaryHarvestEvent.findUnique({ where: { resultingLotId: lotId } }),
  ]);

  const fermentationRunIds = [...new Set(transformations.map((t) => t.fermentationRunId).filter((id): id is string => id != null))];
  const dryingRunIds = [...new Set(transformations.map((t) => t.dryingRunId).filter((id): id is string => id != null))];

  const [fermentationRuns, dryingRuns, sensoryLinkage, assets, labourEntries, materialConsumptionEntries] = await Promise.all([
    fermentationRunIds.length
      ? prisma.fermentationRun.findMany({ where: { id: { in: fermentationRunIds } }, include: { interventions: { orderBy: { occurredAt: "asc" } } } })
      : Promise.resolve([]),
    dryingRunIds.length
      ? prisma.dryingRun.findMany({ where: { id: { in: dryingRunIds } }, include: { turningEvents: { orderBy: { occurredAt: "asc" } } } })
      : Promise.resolve([]),
    getSensoryLinkageForSamples(samples.map((s) => s.id)),
    // T12.5: every Asset attached anywhere in this lot's chain, one query —
    // grouped by attachment point in the page component, not here, since
    // "how to render six kinds of attachment" is a UI concern, not a
    // service-layer one. No independent RBAC check inside this query: the
    // requireLotAccess("view", ...) call above already gates the whole
    // aggregation this belongs to, same as sensoryLinkage.
    prisma.asset.findMany({
      where: {
        OR: [
          { lotId },
          harvestEvent ? { harvestEventId: harvestEvent.id } : undefined,
          { measurementId: { in: measurements.map((m) => m.id) } },
          { fermentationRunId: { in: fermentationRunIds } },
          { dryingRunId: { in: dryingRunIds } },
          { sampleId: { in: samples.map((s) => s.id) } },
        ].filter((clause): clause is NonNullable<typeof clause> => clause != null),
      },
      orderBy: { createdAt: "desc" },
    }),
    // T12.6: every LabourEntry across this lot's four possible attachment
    // points — same "grouping is a UI concern" reasoning as assets above.
    prisma.labourEntry.findMany({
      where: {
        OR: [
          harvestEvent ? { harvestEventId: harvestEvent.id } : undefined,
          receivingEvent ? { receivingEventId: receivingEvent.id } : undefined,
          { fermentationRunId: { in: fermentationRunIds } },
          { dryingRunId: { in: dryingRunIds } },
        ].filter((clause): clause is NonNullable<typeof clause> => clause != null),
      },
      orderBy: { occurredAt: "desc" },
    }),
    // T12.6: every MaterialConsumptionEntry, scoped to fermentation/drying only.
    prisma.materialConsumptionEntry.findMany({
      where: { OR: [{ fermentationRunId: { in: fermentationRunIds } }, { dryingRunId: { in: dryingRunIds } }] },
      orderBy: { occurredAt: "desc" },
    }),
  ]);

  return {
    lot,
    lineage,
    transformations,
    quantityEvents,
    measurements,
    samples,
    fermentationRuns,
    dryingRuns,
    storageAssignments,
    tasks,
    auditEvents,
    sensoryLinkage,
    harvestEvent,
    receivingEvent,
    apiaryHarvestEvent,
    assets,
    labourEntries,
    materialConsumptionEntries,
  };
}

export interface SensoryLinkageEntry {
  sessionId: string;
  sessionName: string;
  sessionStatus: string;
  revealed: boolean;
  overallResult: { meanValue: string; minValue: string; maxValue: string; responseCount: number } | null;
}

/**
 * T12 (§34): read-only join from Sample → SensoryBlindMapping →
 * SensoryBlindSample → (SensoryFlight → SensorySession) + PanelResult, so
 * Lot Detail can show "this lot's cupped sample scored X" without an
 * empty/error state for a Sample that was never cupped (§30 screen 10's
 * "renders when present, absent gracefully otherwise").
 *
 * Deliberately gated by `lot:view` alone (already enforced by the caller,
 * getLotDetail), not `blind_mapping:view`. RBAC.md §7's restriction exists
 * to keep a *judge* from learning which real sample a blind code maps to
 * before/while scoring — it is not a rule that final, computed results
 * must stay hidden from the operator of the lot that produced them
 * forever. This function only ever returns an aggregate `PanelResult`
 * (mean/min/max/responseCount) and the session's own name/status; it never
 * returns `blindCode`, the mapping row itself, or any individual
 * Assessment/evaluator identity — Farm Operator (the actual caller here)
 * holds neither `blind_mapping:view` nor any `sensory:*` permission, and
 * none is needed for this specific, narrow exposure.
 *
 * Also deliberately does not apply a `classification:clear_*` check
 * against SensorySession (which defaults to `internal`) — the ticket's own
 * "shows its PanelResult; one without shows nothing" framing gates on
 * whether a result has been *computed*, not on the session's own
 * classification. If that turns out to be the wrong call, it is a
 * one-line fix (a `can()` check against `session.classification`), not a
 * schema change.
 */
export async function getSensoryLinkageForSamples(sampleIds: string[]): Promise<Record<string, SensoryLinkageEntry[]>> {
  if (sampleIds.length === 0) return {};

  const samples = await prisma.sample.findMany({
    where: { id: { in: sampleIds } },
    select: {
      id: true,
      blindMappings: {
        select: {
          revealedAt: true,
          blindSample: {
            select: {
              flight: { select: { session: { select: { id: true, name: true, status: true } } } },
              panelResults: {
                where: { attributeId: null },
                select: { meanValue: true, minValue: true, maxValue: true, responseCount: true },
              },
            },
          },
        },
      },
    },
  });

  const result: Record<string, SensoryLinkageEntry[]> = {};
  for (const sample of samples) {
    if (sample.blindMappings.length === 0) continue;
    result[sample.id] = sample.blindMappings.map((mapping) => {
      const overall = mapping.blindSample.panelResults[0] ?? null;
      return {
        sessionId: mapping.blindSample.flight.session.id,
        sessionName: mapping.blindSample.flight.session.name,
        sessionStatus: mapping.blindSample.flight.session.status,
        revealed: mapping.revealedAt != null,
        overallResult: overall
          ? {
              meanValue: overall.meanValue.toString(),
              minValue: overall.minValue.toString(),
              maxValue: overall.maxValue.toString(),
              responseCount: overall.responseCount,
            }
          : null,
      };
    });
  }
  return result;
}

/**
 * What a user can actually pick from when creating a lot or moving one to
 * storage (§30 screens 4/8) — enough detail (organization, location
 * hierarchy) to render real dropdowns instead of asking an operator to
 * paste in a raw UUID.
 *
 * Projects are scoped to the user's actual `lot:manage` Assignments (cheap
 * and exact — a project-scoped Assignment names its project directly).
 * Locations are shown system-wide rather than scope-filtered: a
 * project-scoped Farm Operator's harvest still needs a real plot/location,
 * and this schema has no direct Location→Project relationship to compute
 * "locations belonging to project X" from. The dropdown is a convenience,
 * not the security boundary — `recordHarvestEvent`/`moveLotToStorage`
 * still run the real `requireLotAccess` check server-side regardless of
 * what's offered here, so a mismatched pick fails safely with a normal
 * error, not a silent authorization bypass.
 */
export async function getManageableContext(userAccountId: string) {
  const visibility = await resolveLotVisibility(userAccountId, "manage");

  const [projects, locations] = await Promise.all([
    visibility.mode === "none"
      ? Promise.resolve([])
      : visibility.mode === "all"
        ? prisma.project.findMany({ orderBy: { name: "asc" } })
        : prisma.project.findMany({ where: { id: { in: visibility.projectIds } }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ include: { organization: true }, orderBy: { name: "asc" } }),
  ]);

  const organizations = [
    ...new Map(
      locations.filter((l) => l.organization != null).map((l) => [l.organization!.id, l.organization!]),
    ).values(),
  ];

  return { projects, locations, organizations };
}

/**
 * Candidate observers for the measurement-entry "who actually took this
 * reading" override (T9.5 §3(c)) — every active Person, system-wide, plus
 * which one is this user's own. Same reasoning as getManageableContext's
 * Location dropdown above: a convenience for a two-tap override, not a
 * security boundary — operatorPersonId carries no RBAC weight of its own.
 */
export async function getObserverCandidates(userAccountId: string) {
  const [account, people] = await Promise.all([
    prisma.userAccount.findUnique({ where: { id: userAccountId }, select: { personId: true } }),
    prisma.person.findMany({ where: { status: "active" }, orderBy: { displayName: "asc" } }),
  ]);
  return { people, selfPersonId: account?.personId ?? null };
}

/** Lightweight lot fetch + view-access check for the simpler "record X" form pages, which don't need getLotDetail's full aggregation. */
export async function getLotSummary(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [{ projectId: lot.projectId, locationId: lot.locationId }]);
  return lot;
}
