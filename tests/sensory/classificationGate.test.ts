/**
 * The classification AND-gate in the Sensory module — ADR-081.
 *
 * `SensorySession` has carried a `classification` column since it was added,
 * with a comment promising "the same independent AND-gate as every other
 * module". Nothing read it: every gate in lib/sensory/service.ts resolved
 * permission keys and stopped there, so a judge assigned to a `confidential`
 * session opened it on `sensory:submit_assessment` alone.
 *
 * Every case below is a PAIR in which only the session's classification
 * changes. That is what makes the refusals mean something: if the gate ever
 * reverts to reading a constant, the "confidential is refused" halves start
 * passing when they should fail, and the paired "internal is allowed" halves
 * catch a gate that has instead begun refusing everything.
 *
 * The roles are the real seeded profiles, not hand-built permission sets, so
 * these fail if Sensory Judge's or Sensory Head Judge's clearances ever widen
 * past `internal`.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import {
  getJudgeSessions,
  getSessionForJudge,
  getSessionForHeadJudge,
  getAssessmentHistoryForEvaluator,
  submitAssessment,
  computePanelResult,
  SensoryAccessError,
} from "../../lib/sensory/service";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `sclsgate-${Date.now()}`;

let protocolId: string;
let protocolVersionId: string;
let attributeId: string;
let sessionId: string;
let flightId: string;
let blindSampleId: string;
let judge: string;
let headJudge: string;
const personIds: string[] = [];
const userAccountIds: string[] = [];

async function makeAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "SCLS", familyName: label, displayName: `SCLS ${label} ${RUN}` },
  });
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  personIds.push(person.id);
  userAccountIds.push(account.id);
  return account.id;
}

async function setClassification(level: "internal" | "confidential") {
  await prisma.sensorySession.update({ where: { id: sessionId }, data: { classification: level } });
}

beforeAll(async () => {
  const protocol = await prisma.sensoryProtocol.create({
    data: { domain: "honey", name: `SCLS Protocol ${RUN}`, status: "active" },
  });
  protocolId = protocol.id;
  const version = await prisma.sensoryProtocolVersion.create({
    data: { protocolId, version: 1, scoreMin: 0, scoreMax: 100, status: "active" },
  });
  protocolVersionId = version.id;
  const attribute = await prisma.sensoryAttribute.create({
    data: { protocolVersionId, name: "Aroma", displayOrder: 0, scaleMin: 0, scaleMax: 20 },
  });
  attributeId = attribute.id;

  const session = await prisma.sensorySession.create({
    // `purpose` declared so computePanelResult reaches the access gate rather
    // than stopping at S2 §2a's undeclared-purpose refusal (tests/sensory/
    // purpose.test.ts covers that path).
    data: {
      name: `SCLS Session ${RUN}`,
      protocolVersionId,
      status: "in_progress",
      purpose: "rank",
      classification: "internal",
    },
  });
  sessionId = session.id;
  const flight = await prisma.sensoryFlight.create({
    data: { sessionId, name: `SCLS Flight ${RUN}`, sequenceOrder: 1 },
  });
  flightId = flight.id;
  const blindSample = await prisma.sensoryBlindSample.create({
    data: { flightId, blindCode: `${RUN}-BC1` },
  });
  blindSampleId = blindSample.id;

  judge = await makeAccount("Judge");
  headJudge = await makeAccount("HeadJudge");

  const scope = await prisma.scope.create({ data: { scopeType: "session", scopeRefId: sessionId } });
  const judgeProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Sensory Judge" } });
  const headProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Sensory Head Judge" } });
  await prisma.assignment.create({
    data: { userAccountId: judge, roleProfileId: judgeProfile.id, scopeId: scope.id, status: "active" },
  });
  await prisma.assignment.create({
    data: { userAccountId: headJudge, roleProfileId: headProfile.id, scopeId: scope.id, status: "active" },
  });
});

afterAll(async () => {
  // ADR-045 — never a deleteMany whose where clause could silently become {}.
  await prisma.panelResult.deleteMany({ where: assertDefinedWhere({ blindSampleId }) });
  await prisma.attributeResponse.deleteMany({ where: assertDefinedWhere({ attributeId }) });
  await prisma.assessment.deleteMany({ where: assertDefinedWhere({ blindSampleId }) });
  await prisma.sensoryBlindSample.deleteMany({ where: assertDefinedWhere({ id: blindSampleId }) });
  await prisma.sensoryFlight.deleteMany({ where: assertDefinedWhere({ id: flightId }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: sessionId }) });
  await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: sessionId }) });
  await prisma.sensoryAttribute.deleteMany({ where: assertDefinedWhere({ id: attributeId }) });
  await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: protocolVersionId }) });
  await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: protocolId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
});

describe("opening a session", () => {
  it("refuses a confidential session to a judge who holds the action permission", async () => {
    await setClassification("confidential");
    await expect(getSessionForJudge(judge, sessionId)).rejects.toBeInstanceOf(SensoryAccessError);
  });

  it("allows the same judge once the session is internal", async () => {
    await setClassification("internal");
    const view = await getSessionForJudge(judge, sessionId);
    expect(view.session.id).toBe(sessionId);
    expect(view.canSubmitAssessment).toBe(true);
  });

  it("refuses a session that does not exist rather than treating it as public", async () => {
    // A stale id must not become the bypass — the same rule
    // scopeClassification.ts states for a missing Project or Location.
    await expect(
      getSessionForJudge(judge, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(SensoryAccessError);
  });
});

describe("the session list", () => {
  it("omits a confidential session the judge is assigned to", async () => {
    // Hiding the row is not cosmetic: the list carries the session and
    // protocol names, which are the sensitive part of a restricted session.
    await setClassification("confidential");
    const sessions = await getJudgeSessions(judge);
    expect(sessions.map((s) => s.id)).not.toContain(sessionId);
  });

  it("lists it once it is internal", async () => {
    await setClassification("internal");
    const sessions = await getJudgeSessions(judge);
    expect(sessions.map((s) => s.id)).toContain(sessionId);
  });
});

describe("submitting an assessment", () => {
  it("refuses to write into a confidential session", async () => {
    await setClassification("confidential");
    await expect(
      submitAssessment(judge, { blindSampleId, overallScore: 80, attributeResponses: [{ attributeId, value: 15 }] }),
    ).rejects.toBeInstanceOf(SensoryAccessError);
  });

  it("accepts the submission once the session is internal", async () => {
    await setClassification("internal");
    const assessment = await submitAssessment(judge, {
      blindSampleId,
      overallScore: 80,
      attributeResponses: [{ attributeId, value: 15 }],
    });
    expect(assessment.blindSampleId).toBe(blindSampleId);
  });
});

describe("the head judge's view and panel results", () => {
  it("refuses the blind mapping view on a confidential session", async () => {
    // Sensory Head Judge clears internal and no further, so the reveal is
    // gated by classification even for the role that holds blind_mapping:view.
    await setClassification("confidential");
    await expect(getSessionForHeadJudge(headJudge, sessionId)).rejects.toBeInstanceOf(SensoryAccessError);
  });

  it("refuses to compute a panel result on a confidential session", async () => {
    await setClassification("confidential");
    await expect(computePanelResult(headJudge, blindSampleId)).rejects.toBeInstanceOf(SensoryAccessError);
  });

  it("allows both once the session is internal", async () => {
    await setClassification("internal");
    const session = await getSessionForHeadJudge(headJudge, sessionId);
    expect(session.id).toBe(sessionId);

    const results = await computePanelResult(headJudge, blindSampleId);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("an evaluator's own sensory history", () => {
  it("drops assessments whose session the evaluator no longer clears", async () => {
    // Ownership is not sufficient on its own: the row is the judge's, but the
    // session and protocol names travelling with it are the session's to
    // classify. Otherwise "My Tastings" is the way around the gate.
    await setClassification("internal");
    const before = await getAssessmentHistoryForEvaluator(judge);
    expect(before.map((a) => a.blindSample.flight.session.id)).toContain(sessionId);

    await setClassification("confidential");
    const after = await getAssessmentHistoryForEvaluator(judge);
    expect(after.map((a) => a.blindSample.flight.session.id)).not.toContain(sessionId);
  });

  it("returns them the moment clearance does — the record was withheld, never removed", async () => {
    await setClassification("internal");
    const restored = await getAssessmentHistoryForEvaluator(judge);
    expect(restored.map((a) => a.blindSample.flight.session.id)).toContain(sessionId);

    // And the assessment itself was never touched by any of this.
    const stored = await prisma.assessment.count({ where: { blindSampleId, status: "submitted" } });
    expect(stored).toBe(1);
  });
});
