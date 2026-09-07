/**
 * R1 (docs/implementation/33_R1_ROASTSESSION_TAXONOMIA_SENSORIAL.md §2, §4.4).
 * Real Postgres (Neon), no mocks. Covers submitting a structured
 * descriptor/defect pick with a technical cause and a confidence level
 * alongside the existing numeric AttributeResponse and free-text comment —
 * confirming the addition is additive, not a replacement.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { submitAssessment, SensoryAccessError } from "../../lib/sensory/service";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `r1-desc-${Date.now()}`;

let protocolId: string;
let protocolVersionId: string;
let attributeId: string;
let floralDescriptorId: string;
let defectDescriptorId: string;
let sessionId: string;
let flightId: string;
let blindSampleId: string;
let otherBlindSampleId: string;
let duplicadoBlindSampleId: string;
let evaluatorUserAccountId: string;
let unauthorizedUserAccountId: string;

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "en" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

beforeAll(async () => {
  const protocol = await prisma.sensoryProtocol.create({ data: { domain: "honey", name: `TEST R1 Protocol (${RUN_ID})`, status: "active" } });
  protocolId = protocol.id;
  const version = await prisma.sensoryProtocolVersion.create({
    data: { protocolId, version: 1, scoreMin: 0, scoreMax: 100, status: "active" },
  });
  protocolVersionId = version.id;

  const attribute = await prisma.sensoryAttribute.create({
    data: { protocolVersionId, name: "Aroma", displayOrder: 0, scaleMin: 0, scaleMax: 20 },
  });
  attributeId = attribute.id;

  const floralDescriptor = await prisma.sensoryDescriptor.create({
    data: {
      protocolVersionId,
      family: "TEST floral",
      specificDescriptor: "rose",
      classification: "positive",
      displayOrder: 0,
    },
  });
  floralDescriptorId = floralDescriptor.id;
  const defectDescriptor = await prisma.sensoryDescriptor.create({
    data: {
      protocolVersionId,
      family: "TEST unwanted fermentation",
      specificDescriptor: "acetic acid",
      classification: "defect",
      technicalCause: "harvested above 18% moisture",
      displayOrder: 1,
    },
  });
  defectDescriptorId = defectDescriptor.id;

  const session = await prisma.sensorySession.create({
    data: { name: `TEST R1 Session (${RUN_ID})`, protocolVersionId, status: "in_progress", classification: "internal" },
  });
  sessionId = session.id;
  const flight = await prisma.sensoryFlight.create({ data: { sessionId, name: `TEST R1 Flight (${RUN_ID})`, sequenceOrder: 1 } });
  flightId = flight.id;
  const blindSample = await prisma.sensoryBlindSample.create({ data: { flightId, blindCode: `${RUN_ID}-BC1` } });
  blindSampleId = blindSample.id;
  const otherBlindSample = await prisma.sensoryBlindSample.create({ data: { flightId, blindCode: `${RUN_ID}-BC2` } });
  otherBlindSampleId = otherBlindSample.id;
  // Propia, para que el envío duplicado no choque con las de otras pruebas.
  const duplicadoBlindSample = await prisma.sensoryBlindSample.create({ data: { flightId, blindCode: `${RUN_ID}-BC3` } });
  duplicadoBlindSampleId = duplicadoBlindSample.id;

  evaluatorUserAccountId = await createTestUserAccount("R1Evaluator");
  const judgeProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Sensory Judge" } });
  const scope = await prisma.scope.create({ data: { scopeType: "session", scopeRefId: sessionId } });
  await prisma.assignment.create({ data: { userAccountId: evaluatorUserAccountId, roleProfileId: judgeProfile.id, scopeId: scope.id } });

  unauthorizedUserAccountId = await createTestUserAccount("R1Unauthorized");
});

afterAll(async () => {
  await prisma.sensoryDescriptorResponse.deleteMany({ where: assertDefinedWhere({ descriptorId: { in: [floralDescriptorId, defectDescriptorId] } }) });
  await prisma.attributeResponse.deleteMany({ where: assertDefinedWhere({ attributeId } ) });
  await prisma.assessment.deleteMany({ where: assertDefinedWhere({ blindSampleId: { in: [blindSampleId, otherBlindSampleId, duplicadoBlindSampleId] } }) });
  await prisma.sensoryBlindSample.deleteMany({ where: assertDefinedWhere({ id: { in: [blindSampleId, otherBlindSampleId, duplicadoBlindSampleId] } }) });
  await prisma.sensoryFlight.deleteMany({ where: assertDefinedWhere({ id: flightId }) });
  await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: sessionId }) });
  await prisma.sensoryDescriptor.deleteMany({ where: assertDefinedWhere({ id: { in: [floralDescriptorId, defectDescriptorId] } }) });
  await prisma.sensoryAttribute.deleteMany({ where: assertDefinedWhere({ id: attributeId }) });
  await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: protocolVersionId }) });
  await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: protocolId }) });

  const userAccountIds = [evaluatorUserAccountId, unauthorizedUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: sessionId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
});

describe("§4.4 — structured descriptor + defect with technical cause + confidence, free text still works", () => {
  it("rejects a user with no session access", async () => {
    await expect(
      submitAssessment(unauthorizedUserAccountId, {
        blindSampleId,
        attributeResponses: [{ attributeId, value: 15 }],
        descriptorResponses: [{ descriptorId: floralDescriptorId, confidence: "high" }],
      }),
    ).rejects.toThrow(SensoryAccessError);
  });

  it("submits attribute responses, a structured descriptor, a defect with technical cause and confidence, and free text together", async () => {
    const assessment = await submitAssessment(evaluatorUserAccountId, {
      blindSampleId,
      overallScore: 78,
      comment: "TEST — off-flavor, confianza media, defecto de familia posiblemente fermentación",
      attributeResponses: [{ attributeId, value: 14, comment: "TEST muted aroma" }],
      descriptorResponses: [
        { descriptorId: floralDescriptorId, confidence: "high", comment: "TEST clearly rose" },
        { descriptorId: defectDescriptorId, confidence: "medium" },
      ],
    });

    expect(assessment.comment).toContain("off-flavor");
    expect(assessment.attributeResponses).toHaveLength(1);
    expect(assessment.attributeResponses[0]?.value.toString()).toBe("14");
    expect(assessment.descriptorResponses).toHaveLength(2);

    const floralResponse = assessment.descriptorResponses.find((r) => r.descriptorId === floralDescriptorId);
    const defectResponse = assessment.descriptorResponses.find((r) => r.descriptorId === defectDescriptorId);
    expect(floralResponse?.confidence).toBe("high");
    expect(defectResponse?.confidence).toBe("medium");

    // The defect's technical cause lives on the vocabulary row, readable
    // via the descriptor, not duplicated onto every response.
    const defectDescriptor = await prisma.sensoryDescriptor.findUniqueOrThrow({ where: { id: defectDescriptorId } });
    expect(defectDescriptor.technicalCause).toBe("harvested above 18% moisture");
    expect(defectDescriptor.classification).toBe("defect");
  });

  it("still accepts an assessment with attribute responses and free text but zero descriptor responses — the addition is optional", async () => {
    const assessment = await submitAssessment(evaluatorUserAccountId, {
      blindSampleId: otherBlindSampleId,
      comment: "TEST plain free-text note, no structured picks",
      attributeResponses: [{ attributeId, value: 12 }],
    });

    expect(assessment.comment).toContain("plain free-text note");
    expect(assessment.descriptorResponses).toHaveLength(0);
  });
});

describe("un segundo envío de la misma muestra por el mismo juez", () => {
  it("sigue diciendo `already_submitted`, y no deja una segunda evaluación", async () => {
    // Nadie cubría esto. Importa desde el 2026-09-06, cuando la escritura y su
    // AuditEvent pasaron a una transacción: el manejo del P2002 quedó atado al
    // `create` y sólo a él, en vez de al bloque entero. Esta prueba fija el
    // lado que NO debía cambiar — el juez que reenvía sigue viendo lo mismo.
    const primera = await submitAssessment(evaluatorUserAccountId, {
      blindSampleId: duplicadoBlindSampleId,
      comment: "TEST primera entrega",
      attributeResponses: [{ attributeId, value: 13 }],
    });

    await expect(
      submitAssessment(evaluatorUserAccountId, {
        blindSampleId: duplicadoBlindSampleId,
        comment: "TEST segunda entrega, no debe entrar",
        attributeResponses: [{ attributeId, value: 17 }],
      }),
    ).rejects.toThrow(/already_submitted/);

    // Y el rechazo no deja rastro: sigue habiendo UNA sola evaluación, la
    // primera. Sin esto, «lanzó el error» no distingue rechazar de escribir
    // igual y quejarse después.
    const todas = await prisma.assessment.findMany({
      where: { blindSampleId: duplicadoBlindSampleId, evaluatorUserAccountId },
    });
    expect(todas).toHaveLength(1);
    expect(todas[0]!.id).toBe(primera.id);
    expect(todas[0]!.comment).toContain("primera entrega");
  });
});
