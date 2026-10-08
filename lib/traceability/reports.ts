/**
 * T13 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md §30 screen
 * 11, §34). The Lot Summary Report — reuses `getLotDetail`'s aggregation
 * and RBAC check wholesale (no independent `requireLotAccess` call here,
 * same "already-gated aggregation" reasoning as `getSensoryLinkageForSamples`
 * and the T12.5 asset query) and adds exactly what a report needs beyond
 * an operator's own working view of the lot: an "origin" section (which
 * real-world harvest(s)/delivery(ies) this lot traces back to),
 * human-readable lineage (lot codes, not bare UUIDs — the report is
 * designed to be printed and read without clicking through the app), and
 * lineage-wide Processing/Measurements — a report looks backward across
 * the lot's full ancestry for what happened to the material on the way
 * here, not just transformations/readings that happen to name this exact
 * lot row (see the reasoning inline below; this is where the report
 * genuinely diverges from getLotDetail's per-lot working view, not a
 * simple wrapper around it).
 *
 * No new schema. `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §N sketches a
 * versioned `reporting.report`/`report_version` system — that is Phase 2
 * input, approved as architecture/sequencing only (ADR-020), not this
 * ticket's scope (Schema: None in the ticket table). This function always
 * computes the report fresh from current data; "reproduces from live
 * data" (the ticket's own test requirement) means calling it twice
 * against unchanged data returns the same content, not that a historical
 * version is preserved across future corrections — that's the deferred
 * `report_version` concern, not built here.
 */
import { prisma } from "../db";
import { getLotDetail, requireLotAccess, TraceabilityAccessError } from "./lots";
import { getRoastSessionDetail } from "./roasting";
import { tuesteVisible } from "./tuesteVisible";

/**
 * A lot's origin is every HarvestEvent/ReceivingEvent/ApiaryHarvestEvent
 * whose resultingLotId is this lot itself or any of its lineage ancestors
 * — plural, not singular, because a blend transformation genuinely has
 * multiple parents (execution plan §8.3's DAG, not a tree). A lot with no
 * origin event anywhere in its ancestry (shouldn't happen given every Lot
 * originates from one of these three events or a transformation output
 * that eventually traces back to one, but the query makes no assumption)
 * simply returns an empty origins array — rendered as "unknown," never a
 * guessed value, per DATA_ARCHITECTURE.md §4.
 *
 * ApiaryHarvestEvent (A3) was added after this function was originally
 * written and, until now, was never included here — every honey Lot's
 * report claimed "origin unknown" despite the harvest being fully
 * recorded (visible on the Lot's own detail page via `getLotDetail`,
 * which does query it). Found via A8's own live-browser verification
 * pass and fixed here, not worked around.
 */
export async function getLotReport(userAccountId: string, lotId: string) {
  const detail = await getLotDetail(userAccountId, lotId);

  const ancestorIds = detail.lineage.ancestorLotIds;
  const descendantIds = detail.lineage.descendantLotIds;
  const originCandidateIds = [lotId, ...ancestorIds];

  const [harvestOrigins, receivingOrigins, apiaryHarvestOrigins, ancestorLots, descendantLots] = await Promise.all([
    prisma.harvestEvent.findMany({
      where: { resultingLotId: { in: originCandidateIds } },
      include: { location: true, organization: true },
      orderBy: { harvestedAt: "asc" },
    }),
    prisma.receivingEvent.findMany({
      where: { resultingLotId: { in: originCandidateIds } },
      include: { location: true, organization: true },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.apiaryHarvestEvent.findMany({
      where: { resultingLotId: { in: originCandidateIds } },
      include: { colony: { include: { hive: { include: { location: { include: { organization: true } } } } } } },
      orderBy: { occurredAt: "asc" },
    }),
    ancestorIds.length ? prisma.lot.findMany({ where: { id: { in: ancestorIds } } }) : Promise.resolve([]),
    descendantIds.length ? prisma.lot.findMany({ where: { id: { in: descendantIds } } }) : Promise.resolve([]),
  ]);

  // A report answers "how did we get here," so Processing looks backward
  // across the whole lineage (self + ancestors), not just transformations
  // that happen to name this exact lot as input/output the way Lot
  // Detail's own working view does — getLotDetail's fermentationRuns/
  // dryingRuns/storageAssignments are correctly scoped for an operator
  // acting on *this* lot right now, but a green lot's client report that
  // omitted its own fermentation step because that stage-change named the
  // cherry lot, not the green one, would misrepresent the material's
  // actual history. Forward-looking (what a lot later became) stays in
  // Lineage's descendantLots list — a viewer follows that link to reach
  // the downstream lot's own report, rather than this one growing to
  // cover material it didn't produce.
  const lineageLotIds = [lotId, ...ancestorIds];
  const lineageTransformations = await prisma.lotTransformation.findMany({
    where: { OR: [{ inputs: { some: { lotId: { in: lineageLotIds } } } }, { outputs: { some: { lotId: { in: lineageLotIds } } } }] },
  });
  const lineageFermentationRunIds = [...new Set(lineageTransformations.map((t) => t.fermentationRunId).filter((id): id is string => id != null))];
  const lineageDryingRunIds = [...new Set(lineageTransformations.map((t) => t.dryingRunId).filter((id): id is string => id != null))];

  // Same backward-looking reasoning as Processing above, applied to
  // Measurements: most readings (fermentation temperature, drying
  // moisture) are taken against the lot as it existed *at that stage*,
  // an ancestor of the one being reported on — a green lot's report that
  // showed zero measurements because none were ever taken against the
  // green lot specifically would misrepresent what was actually recorded.
  const [fermentationRuns, dryingRuns, storageAssignments, measurements] = await Promise.all([
    lineageFermentationRunIds.length
      ? prisma.fermentationRun.findMany({ where: { id: { in: lineageFermentationRunIds } }, include: { interventions: { orderBy: { occurredAt: "asc" } } } })
      : Promise.resolve([]),
    lineageDryingRunIds.length
      ? prisma.dryingRun.findMany({ where: { id: { in: lineageDryingRunIds } }, include: { turningEvents: { orderBy: { occurredAt: "asc" } } } })
      : Promise.resolve([]),
    prisma.storageAssignment.findMany({ where: { lotId: { in: lineageLotIds } }, include: { location: true }, orderBy: { startedAt: "asc" } }),
    prisma.measurement.findMany({ where: { lotId: { in: lineageLotIds } }, orderBy: { occurredAt: "asc" } }),
  ]);

  const roastPreparations = await getReportRoastPreparations(userAccountId, detail.samples.map((sample) => sample.id));

  return {
    ...detail,
    roastPreparations,
    fermentationRuns,
    dryingRuns,
    storageAssignments,
    measurements,
    origins: { harvestEvents: harvestOrigins, receivingEvents: receivingOrigins, apiaryHarvestEvents: apiaryHarvestOrigins },
    ancestorLots,
    descendantLots,
    generatedAt: new Date(),
  };
}

export type LotReport = Awaited<ReturnType<typeof getLotReport>>;

/** Called only after the report has authorized these samples' source lot.
 * Preparation details additionally pass the existing roast source-lot gate.
 * Never return blind codes, assessments, or evaluator identity.
 */
export async function getReportRoastPreparations(userAccountId: string, sampleIds: string[]) {
  if (!sampleIds.length) return [];
  const mappings = await prisma.sensoryBlindMapping.findMany({
    where: { sampleId: { in: sampleIds }, roastSessionId: { not: null } },
    select: { sampleId: true, roastSessionId: true, revealedAt: true,
      blindSample: { select: { flight: { select: { sessionId: true, session: { select: { status: true } } } } } } },
  });
  const preparations = [];
  const authorizedRoasts = new Map<string, ReturnType<typeof getRoastSessionDetail>>();
  for (const mapping of mappings) {
    if (!mapping.roastSessionId) continue;
    // ADR-043: una cata abierta y sin revelar no dice qué tueste tiene en la mesa.
    if (!tuesteVisible(mapping.revealedAt != null, mapping.blindSample.flight.session.status)) continue;
    try {
      let authorizedRoast = authorizedRoasts.get(mapping.roastSessionId);
      if (!authorizedRoast) {
        authorizedRoast = getRoastSessionDetail(userAccountId, mapping.roastSessionId);
        authorizedRoasts.set(mapping.roastSessionId, authorizedRoast);
      }
      const roast = await authorizedRoast;
      const sourceLotCodes: string[] = [];
      const roastCodes: string[] = [];
      for (const transformation of roast.transformations ?? []) {
        for (const [kind, rows] of [["source", transformation.inputs], ["output", transformation.outputs]] as const) {
          for (const { lot } of rows) {
            if (kind === "output" && lot.lotType !== "roast") continue;
            try {
              await requireLotAccess(userAccountId, "view", [lot]);
              (kind === "source" ? sourceLotCodes : roastCodes).push(lot.lotCode);
            } catch (error) {
              if (!(error instanceof TraceabilityAccessError)) throw error;
            }
          }
        }
      }
      preparations.push({
        sampleId: mapping.sampleId, sessionId: mapping.blindSample.flight.sessionId,
        roastId: roast.id, startedAt: roast.startedAt, endedAt: roast.endedAt,
        roastLevel: roast.roastLevel,
        roastCodes,
        sourceLotCodes,
        roasterName: roast.roaster?.displayName ?? null,
        equipmentName: roast.equipment?.name ?? roast.equipmentNote ?? null,
        chargeWeightKg: roast.chargeWeightKg?.toString() ?? null,
        dischargeWeightKg: roast.dischargeWeightKg?.toString() ?? null,
      });
    } catch (error) {
      if (!(error instanceof TraceabilityAccessError)) throw error;
      // An inaccessible preparation must not expose even its reference.
    }
  }
  return preparations;
}
