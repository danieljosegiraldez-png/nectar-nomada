/**
 * `e2e.test.ts`'s cleanup logic, kept in a plain (non-`.test.ts`) module
 * deliberately — so `tests/helpers/e2e-cleanup-failsafe.test.ts` can
 * import and call the exact same function with deliberately-partial
 * fixture ids, without also re-executing `e2e.test.ts`'s own top-level
 * `describe`/`beforeAll`/`afterAll` registration, which is what would
 * happen if the failsafe test imported straight from a `.test.ts` file.
 *
 * Every field on `E2eFixtureIds` is typed exactly as `e2e.test.ts`'s own
 * module-level `let` declarations are (plain `string`), which is the
 * honest reflection of the bug this guards against: TypeScript's types
 * say these are always strings, but a `beforeAll` that throws or times
 * out partway through leaves some of them `undefined` at runtime
 * regardless of what the type checker believes.
 */
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

export interface E2eFixtureIds {
  blindSampleId: string;
  flightId: string;
  sessionId: string;
  protocolVersionId: string;
  protocolId: string;
  sampleId: string;
  greenLotId: string;
  storageAssignmentId: string;
  cherryLotId: string;
  dryingStageLotId: string;
  dryingRunId: string;
  fermentationRunId: string;
  operatorUserAccountId: string;
  wrongProjectUserAccountId: string;
  projectId: string;
  plotLocationId: string;
  warehouseLocationId: string;
  organizationId: string;
}

export async function cleanupE2eFixtures(runId: string, ids: E2eFixtureIds) {
  await prisma.panelResult.deleteMany({ where: assertDefinedWhere({ blindSampleId: ids.blindSampleId }) });
  await prisma.sensoryBlindMapping.deleteMany({ where: assertDefinedWhere({ blindSampleId: ids.blindSampleId }) });
  await prisma.sensoryBlindSample.deleteMany({ where: assertDefinedWhere({ id: ids.blindSampleId }) });
  await prisma.sensoryFlight.deleteMany({ where: assertDefinedWhere({ id: ids.flightId }) });
  await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: ids.sessionId }) });
  await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: ids.protocolVersionId }) });
  await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: ids.protocolId }) });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ id: ids.sampleId }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: ids.greenLotId }) });
  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ id: ids.storageAssignmentId }) });

  const allLotIds = [ids.cherryLotId, ids.dryingStageLotId, ids.greenLotId];
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: allLotIds } }) });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: allLotIds } } } }, { outputs: { some: { lotId: { in: allLotIds } } } }] }),
  });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: ids.dryingRunId }) });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: ids.fermentationRunId }) });
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ resultingLotId: ids.cherryLotId }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: allLotIds } }) });

  const userAccountIds = [ids.operatorUserAccountId, ids.wrongProjectUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: ids.projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: runId } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ name: { contains: runId } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [ids.plotLocationId, ids.warehouseLocationId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: ids.organizationId }) });
}
