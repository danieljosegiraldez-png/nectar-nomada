/**
 * Confirms `tests/traceability/e2e.test.ts`'s own `afterAll` cleanup —
 * not a re-implementation of it, the literal exported `cleanupE2eFixtures`
 * function it calls — fails loudly under the exact conditions that caused
 * the incident, instead of silently deleting every row in ten tables.
 *
 * The incident shape: `beforeAll` completed the harvest step (so
 * `cherryLotId` was assigned a real value) and then threw or timed out
 * before the fermentation/drying/sensory steps ran, leaving every later
 * variable `undefined`. `afterAll` still ran with that partial state.
 * This test reconstructs exactly that state and calls the real cleanup
 * function with it.
 *
 * No Neon connection is required for this test to pass or fail correctly:
 * `assertDefinedWhere` throws synchronously on the first vulnerable field,
 * before the first `prisma.*.deleteMany` call is ever reached — the
 * failure happens in-process, before any network I/O. That is the
 * property being pinned here.
 */
import { describe, expect, it } from "vitest";
import { cleanupE2eFixtures, type E2eFixtureIds } from "../traceability/e2e-cleanup";
import { UnsafeWhereClauseError } from "./assertDefinedWhere";

describe("e2e.test.ts's real afterAll cleanup, under a partial beforeAll failure", () => {
  it("throws UnsafeWhereClauseError instead of deleting, when only the harvest step completed", async () => {
    // Mirrors the actual incident: cherryLotId is a real-looking value
    // (the harvest step finished), everything assigned by later steps
    // (fermentation, drying, storage, sensory) is still undefined. Cast
    // through `unknown` deliberately — this is the exact way the real bug
    // occurs: the declared type says `string`, the runtime value is not.
    const partialIds = {
      cherryLotId: "a-real-lot-id-from-the-harvest-step",
      dryingStageLotId: undefined,
      greenLotId: undefined,
      fermentationRunId: undefined,
      dryingRunId: undefined,
      storageAssignmentId: undefined,
      sampleId: undefined,
      protocolId: undefined,
      protocolVersionId: undefined,
      sessionId: undefined,
      flightId: undefined,
      blindSampleId: undefined,
      operatorUserAccountId: "a-real-user-account-id",
      wrongProjectUserAccountId: "another-real-user-account-id",
      projectId: "a-real-project-id",
      plotLocationId: "a-real-location-id",
      warehouseLocationId: undefined,
      organizationId: "a-real-organization-id",
    } as unknown as E2eFixtureIds;

    await expect(cleanupE2eFixtures("t14-e2e-failsafe-test", partialIds)).rejects.toThrow(UnsafeWhereClauseError);
  });

  it("throws on the very first vulnerable field (blindSampleId), matching the original incident's own first line", async () => {
    const partialIds = {
      cherryLotId: "a-real-lot-id",
      dryingStageLotId: "a-real-lot-id",
      greenLotId: "a-real-lot-id",
      fermentationRunId: "a-real-run-id",
      dryingRunId: "a-real-run-id",
      storageAssignmentId: "a-real-assignment-id",
      sampleId: "a-real-sample-id",
      protocolId: "a-real-protocol-id",
      protocolVersionId: "a-real-version-id",
      sessionId: "a-real-session-id",
      flightId: "a-real-flight-id",
      blindSampleId: undefined, // the one field that was actually undefined in the incident
      operatorUserAccountId: "a-real-user-account-id",
      wrongProjectUserAccountId: "another-real-user-account-id",
      projectId: "a-real-project-id",
      plotLocationId: "a-real-location-id",
      warehouseLocationId: "a-real-location-id",
      organizationId: "a-real-organization-id",
    } as unknown as E2eFixtureIds;

    let thrown: unknown;
    try {
      await cleanupE2eFixtures("t14-e2e-failsafe-test", partialIds);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnsafeWhereClauseError);
    expect((thrown as Error).message).toContain("blindSampleId");
  });

  it("never reaches a real Prisma call when the guard rejects — proven without a database connection", async () => {
    // If this test needed Neon to pass, it would hang or reject with a
    // connection error, not the guard's own error. Running it with no
    // DATABASE_URL loaded (see the accompanying verification note) and
    // still getting UnsafeWhereClauseError is the actual proof; this
    // assertion documents the property, the run itself demonstrates it.
    const partialIds = { organizationId: undefined } as unknown as E2eFixtureIds;
    await expect(cleanupE2eFixtures("t14-e2e-failsafe-test", partialIds)).rejects.toThrow(UnsafeWhereClauseError);
  });
});
