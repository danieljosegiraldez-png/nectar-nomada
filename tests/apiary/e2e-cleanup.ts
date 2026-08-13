/**
 * `e2e.test.ts`'s cleanup logic, kept in a plain (non-`.test.ts`) module —
 * same split as `tests/traceability/e2e-cleanup.ts`, so a future failsafe
 * test could import and call it with deliberately-partial fixture ids
 * without also re-running this file's own `describe`/`beforeAll`.
 *
 * Every field typed as plain `string`, matching `e2e.test.ts`'s own
 * module-level `let` declarations (ADR-045's own reasoning: the type
 * checker believes these are always strings, a `beforeAll` that throws or
 * times out partway through does not).
 */
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

export interface ApiaryE2eFixtureIds {
  blindSampleId: string;
  flightId: string;
  sessionId: string;
  protocolVersionId: string;
  protocolId: string;
  sampleId: string;
  honeyLotId: string;
  apiaryHarvestEventId: string;
  colonyId: string;
  hiveId: string;
  operatorUserAccountId: string;
  wrongProjectUserAccountId: string;
  projectId: string;
  apiarySiteId: string;
  organizationId: string;
}

export async function cleanupApiaryE2eFixtures(runId: string, ids: ApiaryE2eFixtureIds) {
  await prisma.panelResult.deleteMany({ where: assertDefinedWhere({ blindSampleId: ids.blindSampleId }) });
  await prisma.sensoryBlindMapping.deleteMany({ where: assertDefinedWhere({ blindSampleId: ids.blindSampleId }) });
  await prisma.sensoryBlindSample.deleteMany({ where: assertDefinedWhere({ id: ids.blindSampleId }) });
  await prisma.sensoryFlight.deleteMany({ where: assertDefinedWhere({ id: ids.flightId }) });
  await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: ids.sessionId }) });
  await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: ids.protocolVersionId }) });
  await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: ids.protocolId }) });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ id: ids.sampleId }) });

  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: ids.honeyLotId }) });
  await prisma.apiaryHarvestEvent.deleteMany({ where: assertDefinedWhere({ id: ids.apiaryHarvestEventId }) });
  // createSampleFromLot records a LotTransformation (the honey Lot as
  // input) — same FK ordering T14/A3's own cleanups already need.
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: ids.honeyLotId } } }, { outputs: { some: { lotId: ids.honeyLotId } } }] }),
  });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: ids.honeyLotId }) });

  await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId: ids.colonyId }) });
  await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId: ids.colonyId }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: ids.colonyId }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: ids.hiveId }) });

  const userAccountIds = [ids.operatorUserAccountId, ids.wrongProjectUserAccountId];
  // Derive scope ids from the Assignments *before* deleting them — the
  // wrong-project operator's own Scope (a second Project, `ids.projectId`
  // alone never covers it) would otherwise leak every run. This is the bug
  // `tests/traceability/e2e-cleanup.ts` (T14) carries too; fixed here, not
  // there — out of this ticket's scope to touch T14's own file.
  const assignmentsToRemove = await prisma.assignment.findMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  const scopeIds = assignmentsToRemove.map((a) => a.scopeId);
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  if (scopeIds.length > 0) {
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
  }
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: runId } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ name: { contains: runId } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: ids.apiarySiteId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: ids.organizationId }) });
}
