/**
 * RO1 (docs/implementation/34_RO1_RESEARCH_OS.md §9). Real Postgres (Neon),
 * no mocks. Covers the ticket's ten verification scenarios using the real
 * §3a/§3b vocabulary (catalog-typed Recipiente/Levadura/Método de
 * inoculación/Grado de proceso, closed_enum Fuente de agua/Posición de
 * masa, numeric altura de masa, and the "Estudio de cerezas" categorical
 * attributes) — not placeholder values.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { ambitoDePlataforma } from "../helpers/ambitoDePlataforma";
import {
  createResearchProgram,
  createResearchQuestion,
  createHypothesis,
  createExperiment,
  declareControlTreatmentBatch,
  updateDeclaredLimitations,
  getExperimentDetail,
  ResearchValidationError,
} from "../../lib/research/programs";
import {
  createProtocol,
  createProtocolVersion,
  addVariableCatalogValue,
  updateVariableCatalogValueDefinition,
  setVariableCatalogValueAlias,
  ProtocolValidationError,
} from "../../lib/research/protocols";
import {
  createTreatmentBatch,
  addProcessingStage,
  recordWashMedium,
  completeProcessingStage,
  compareTreatmentBatchesByVariable,
  hasProcessingStage,
  getBedLevelContext,
  getTreatmentBatchDetail,
  recordProcessingStageObservation,
  ProcessingStageValidationError,
} from "../../lib/research/treatments";
import { createEvidence, createInterpretation, createConclusion, EvidenceValidationError } from "../../lib/research/evidence";
import { recordTransformation } from "../../lib/traceability/lots";
import { recordMeasurement } from "../../lib/traceability/measurements";
import { createSampleFromLot } from "../../lib/traceability/samples";
import { submitAssessment } from "../../lib/sensory/service";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { ResearchAccessError } from "../../lib/research/access";

const RUN_ID = `ro1-${Date.now()}`;

let projectId: string;
let organizationId: string;
let researchLeadUserAccountId: string;
let researchLeadScopeId: string;
// lot:manage/sample:manage (Farm Operator) is a separate authority from
// research:* (Research Lead) — recordTransformation/recordMeasurement/
// createSampleFromLot are lib/traceability/*.ts writes against the real
// coffee, not Research OS writes, so they're gated the same way every
// other traceability write in this codebase is.
let labOperatorUserAccountId: string;
let labOperatorScopeId: string;
let sourceLotId: string;
let researchProgramId: string;
let experimentId: string;
let protocolId: string;
let recipienteCatalogId: string;
let levaduraCatalogId: string;
let metodoCatalogId: string;
let gradoCatalogId: string;
let honeyColorCatalogId: string;
let seleccionCatalogId: string;
let posicionMasaVariableId: string;
let alturaMasaVariableId: string;
let recipienteVariableId: string;
let levaduraVariableId: string;

const outputLotIds: string[] = [];
const treatmentBatchIds: string[] = [];

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "roaster", name: `TEST Cafelino (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const project = await prisma.project.create({ data: { name: `TEST RO1 Project (${RUN_ID})`, status: "approved", classification: "internal" } });
  projectId = project.id;

  // Platform-scoped, not project-scoped: ResearchProgram/ResearchQuestion/
  // Hypothesis carry no projectId (§2 — a program isn't tied to one
  // project), so requireResearchAccess resolves them against the platform
  // target; a platform-scoped Assignment covers every narrower target too
  // (RBAC.md §3), so this single grant also covers the project-scoped
  // Experiment/Protocol/TreatmentBatch writes below.
  researchLeadUserAccountId = await createTestUserAccount("RO1ResearchLead");
  const researchLeadProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Research Lead" } });
  const scope = { id: await ambitoDePlataforma() };
  researchLeadScopeId = scope.id;
  await prisma.assignment.create({ data: { userAccountId: researchLeadUserAccountId, roleProfileId: researchLeadProfile.id, scopeId: scope.id } });

  labOperatorUserAccountId = await createTestUserAccount("RO1LabOperator");
  const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const labScope = { id: await ambitoDePlataforma() };
  labOperatorScopeId = labScope.id;
  await prisma.assignment.create({ data: { userAccountId: labOperatorUserAccountId, roleProfileId: farmOperatorProfile.id, scopeId: labScope.id } });

  const sourceLot = await prisma.lot.create({
    data: { lotCode: `${RUN_ID}-geisha10`, lotType: "green", organizationId, projectId },
  });
  sourceLotId = sourceLot.id;

  const catalogs = await prisma.variableCatalog.findMany({
    where: { key: { in: ["recipiente", "levadura_cultivo", "metodo_inoculacion", "grado_proceso", "honey_color", "cereza_seleccion"] } },
  });
  recipienteCatalogId = catalogs.find((c) => c.key === "recipiente")!.id;
  levaduraCatalogId = catalogs.find((c) => c.key === "levadura_cultivo")!.id;
  metodoCatalogId = catalogs.find((c) => c.key === "metodo_inoculacion")!.id;
  gradoCatalogId = catalogs.find((c) => c.key === "grado_proceso")!.id;
  honeyColorCatalogId = catalogs.find((c) => c.key === "honey_color")!.id;
  seleccionCatalogId = catalogs.find((c) => c.key === "cereza_seleccion")!.id;
});

afterAll(async () => {
  await prisma.evidence.deleteMany({ where: assertDefinedWhere({ treatmentBatchId: { in: treatmentBatchIds } }) });
  await prisma.processingStageObservation.deleteMany({
    where: assertDefinedWhere({ processingStage: { treatmentBatchId: { in: treatmentBatchIds } } }),
  });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ treatmentBatchId: { in: treatmentBatchIds } } as never) });
  await prisma.processingStage.deleteMany({ where: assertDefinedWhere({ treatmentBatchId: { in: treatmentBatchIds } }) });
  await prisma.treatmentBatchVariableValue.deleteMany({ where: assertDefinedWhere({ treatmentBatchId: { in: treatmentBatchIds } }) });
  await prisma.treatmentBatch.deleteMany({ where: assertDefinedWhere({ id: { in: treatmentBatchIds } }) });
  await prisma.protocolRequiredMeasurement.deleteMany({ where: assertDefinedWhere({ protocolVersion: { protocolId } }) });
  await prisma.protocolVariable.deleteMany({ where: assertDefinedWhere({ protocolVersion: { protocolId } }) });
  await prisma.protocolVersion.deleteMany({ where: assertDefinedWhere({ protocolId }) });
  await prisma.protocol.deleteMany({ where: assertDefinedWhere({ id: protocolId }) });
  await prisma.experiment.deleteMany({ where: assertDefinedWhere({ id: experimentId }) });
  await prisma.hypothesis.deleteMany({ where: assertDefinedWhere({ researchQuestion: { researchProgramId } }) });
  await prisma.researchQuestion.deleteMany({ where: assertDefinedWhere({ researchProgramId }) });
  await prisma.researchProgram.deleteMany({ where: assertDefinedWhere({ id: researchProgramId }) });

  await prisma.sample.deleteMany({ where: assertDefinedWhere({ sourceLotId: { in: [sourceLotId, ...outputLotIds] } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: [sourceLotId, ...outputLotIds] } }) });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: sourceLotId } } }, { outputs: { some: { lotId: { in: outputLotIds } } } }] }),
  });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: [sourceLotId, ...outputLotIds] } }) });

  // RO1.1 fix: this used to only clean up levaduraCatalogId, which let
  // §9.5's old TEST-scoped grado_proceso alias rows leak across every run
  // that ever executed this file (found and cleaned up live in Neon during
  // 35_RO1.1_HONEY_PORCENTAJE_CANONICO.md's own execution) -- every
  // catalog this file ever adds a TEST value to must be cleaned here.
  await prisma.variableCatalogValue.deleteMany({
    where: assertDefinedWhere({
      catalogId: { in: [levaduraCatalogId, gradoCatalogId, recipienteCatalogId] },
      value: { contains: RUN_ID },
    }),
  });

  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [researchLeadUserAccountId, labOperatorUserAccountId] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: [researchLeadScopeId, labOperatorScopeId] }, scopeType: { not: "platform" as const } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [researchLeadUserAccountId, labOperatorUserAccountId] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
});

describe("§9.1/§9.2 — create protocol with real §3a variables + §3b required measurements, version survives", () => {
  it("creates ResearchProgram -> ResearchQuestion -> Hypothesis -> Experiment -> Protocol", async () => {
    const program = await createResearchProgram(researchLeadUserAccountId, { name: `TEST PE post-harvest (${RUN_ID})` });
    researchProgramId = program.id;
    const question = await createResearchQuestion(researchLeadUserAccountId, researchProgramId, "TEST ¿el nivel de cama afecta el perfil sensorial?");
    const hypothesis = await createHypothesis(researchLeadUserAccountId, question.id, "TEST el nivel bajo en cuarto oscuro reduce defectos por luz");
    const experiment = await createExperiment(researchLeadUserAccountId, {
      researchProgramId,
      hypothesisId: hypothesis.id,
      projectId,
      name: `TEST PE-81/82 (${RUN_ID})`,
    });
    experimentId = experiment.id;

    const protocol = await createProtocol(researchLeadUserAccountId, {
      experimentId,
      name: `TEST PE-81 (${RUN_ID})`,
      externalIdentifier: `TEST-PE-81-${RUN_ID}`,
      identifierConvention: null,
    });
    protocolId = protocol.id;
    expect(protocol.externalIdentifier).toBe(`TEST-PE-81-${RUN_ID}`);
  });

  it("creates version 1 with §3a's real variables (catalog/closed_enum/numeric) and §3b's required measurements", async () => {
    const version = await createProtocolVersion(researchLeadUserAccountId, {
      protocolId,
      notes: "TEST version 1",
      variables: [
        { name: "Recipiente", valueType: "catalog", catalogId: recipienteCatalogId },
        { name: "Levadura / cultivo", valueType: "catalog", catalogId: levaduraCatalogId },
        { name: "Método de inoculación", valueType: "catalog", catalogId: metodoCatalogId },
        { name: "Grado de proceso", valueType: "catalog", catalogId: gradoCatalogId },
        // RO1.1 — a separate variable from Grado de proceso, not an alias
        // of any of its values. Percentage stays the canonical, comparable
        // axis; color is the producer's own label, recorded alongside it.
        { name: "Color de honey", valueType: "catalog", catalogId: honeyColorCatalogId },
        { name: "Fuente de agua", valueType: "closed_enum", enumValues: ["río", "quebrada", "pozo", "red"] },
        { name: "Posición de masa", valueType: "closed_enum", enumValues: ["vertical", "horizontal"] },
        { name: "Altura de masa", valueType: "numeric", unit: "cm" },
      ],
      requiredMeasurements: [
        { variable: "brix", atProcessingStage: "recepción_cereza" },
        { catalogId: seleccionCatalogId, atProcessingStage: "recepción_cereza" },
      ],
    });

    expect(version.version).toBe(1);
    expect(version.status).toBe("draft");
    expect(version.variables).toHaveLength(8);
    expect(version.requiredMeasurements).toHaveLength(2);

    posicionMasaVariableId = version.variables.find((v) => v.name === "Posición de masa")!.id;
    alturaMasaVariableId = version.variables.find((v) => v.name === "Altura de masa")!.id;
    recipienteVariableId = version.variables.find((v) => v.name === "Recipiente")!.id;
    levaduraVariableId = version.variables.find((v) => v.name === "Levadura / cultivo")!.id;
  });

  it("rejects a catalog-typed variable with no catalogId, and a closed_enum with no values", async () => {
    await expect(
      createProtocolVersion(researchLeadUserAccountId, {
        protocolId,
        variables: [{ name: "TEST bad catalog var", valueType: "catalog" }],
        requiredMeasurements: [],
      }),
    ).rejects.toThrow(ProtocolValidationError);
    await expect(
      createProtocolVersion(researchLeadUserAccountId, {
        protocolId,
        variables: [{ name: "TEST bad enum var", valueType: "closed_enum" }],
        requiredMeasurements: [],
      }),
    ).rejects.toThrow(ProtocolValidationError);
  });

  it("§9.2 — versioning again leaves version 1 fully intact and queryable", async () => {
    const versionBefore = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId, version: 1 }, include: { variables: true } });
    expect(versionBefore.variables).toHaveLength(8);

    await createProtocolVersion(researchLeadUserAccountId, {
      protocolId,
      variables: [{ name: "Posición de masa", valueType: "closed_enum", enumValues: ["vertical", "horizontal"] }],
      requiredMeasurements: [],
    });

    const versionAfter = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId, version: 1 }, include: { variables: true } });
    expect(versionAfter.status).toBe("draft");
    expect(versionAfter.variables).toHaveLength(8);
    const versionCount = await prisma.protocolVersion.count({ where: { protocolId } });
    expect(versionCount).toBe(2);
  });
});

describe("§9.3 — add a new yeast to the catalog without migration", () => {
  it("addVariableCatalogValue inserts a row into the already-existing table, no schema change", async () => {
    const beforeCount = await prisma.variableCatalogValue.count({ where: { catalogId: levaduraCatalogId } });
    const created = await addVariableCatalogValue(researchLeadUserAccountId, {
      catalogKey: "levadura_cultivo",
      value: `TEST New Yeast (${RUN_ID})`,
    });
    const afterCount = await prisma.variableCatalogValue.count({ where: { catalogId: levaduraCatalogId } });
    expect(afterCount).toBe(beforeCount + 1);
    expect(created.value).toBe(`TEST New Yeast (${RUN_ID})`);
  });
});

describe("§9.4 — add a definition to an existing catalog value, read where it's used", () => {
  it("updateVariableCatalogValueDefinition sets the definition, visible on the same row afterward", async () => {
    // A dedicated TEST-scoped value, not the real seeded MP72 row — the
    // mechanism under test doesn't care which row it targets, and this
    // keeps the test idempotent/repeatable without leaving "TEST" text on
    // shared, permanent catalog content.
    const testCultureValue = await addVariableCatalogValue(researchLeadUserAccountId, {
      catalogKey: "levadura_cultivo",
      value: `TEST Placeholder Culture (${RUN_ID})`,
    });
    expect(testCultureValue.definition).toBeNull();

    await updateVariableCatalogValueDefinition(
      researchLeadUserAccountId,
      testCultureValue.id,
      "TEST definition — coloniza pero no fermenta ni transforma; se lava y retira antes del proceso, distinto de una levadura de fermentación.",
    );

    const reread = await prisma.variableCatalogValue.findUniqueOrThrow({ where: { id: testCultureValue.id } });
    expect(reread.definition).toContain("coloniza pero no fermenta");
  });
});

describe("§9.5 — register an alias, confirm canonical resolution and cross-name comparability (RO1.1: not honey color/percentage)", () => {
  it("setVariableCatalogValueAlias still links/resolves two values within a catalog, using a neutral placeholder pair", async () => {
    // RO1.1 (35_RO1.1_HONEY_PORCENTAJE_CANONICO.md) corrected this test:
    // the original version aliased a throwaway "red honey" value to the
    // real "Semi Wash 50%" grado_proceso row to prove the mechanism —
    // exactly the pattern RO1.1 says never happens for real (industry
    // sources contradict each other on the color-to-percentage mapping,
    // §1). The alias mechanism itself stays valid for other cases, so it's
    // proven here with a neutral recipiente pair instead.
    const variantValue = await addVariableCatalogValue(researchLeadUserAccountId, {
      catalogKey: "recipiente",
      value: `TEST Recipiente Variant (${RUN_ID})`,
    });
    const canonicalValue = await prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId: recipienteCatalogId, value: "Tanque I" } });

    await setVariableCatalogValueAlias(researchLeadUserAccountId, variantValue.id, canonicalValue.id);
    const reread = await prisma.variableCatalogValue.findUniqueOrThrow({ where: { id: variantValue.id } });
    expect(reread.aliasOfId).toBe(canonicalValue.id);

    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId, version: 1 } });

    const batchNamedByVariant = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST named-by-variant (${RUN_ID})`,
      startedAt: new Date("2027-02-11T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [{ protocolVariableId: recipienteVariableId, catalogValueId: variantValue.id }],
    });
    treatmentBatchIds.push(batchNamedByVariant.id);

    const batchNamedByCanonical = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST named-by-canonical (${RUN_ID})`,
      startedAt: new Date("2027-02-11T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [{ protocolVariableId: recipienteVariableId, catalogValueId: canonicalValue.id }],
    });
    treatmentBatchIds.push(batchNamedByCanonical.id);

    const comparison = await compareTreatmentBatchesByVariable(researchLeadUserAccountId, batchNamedByVariant.id, batchNamedByCanonical.id);
    const recipienteComparison = comparison.find((c) => c.protocolVariableId === recipienteVariableId)!;
    expect(recipienteComparison.differs).toBe(false);
  });
});

describe("RO1.1 — honey: percentage is the canonical value, color is a producer label, never aliased to it", () => {
  let honeyColorVariableId: string;

  it("§3a-bis correction: 'Color de honey' is its own catalog-typed variable, independent of Grado de proceso", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId, version: 1 }, include: { variables: true } });
    const colorVariable = version.variables.find((v) => v.name === "Color de honey");
    expect(colorVariable).toBeDefined();
    expect(colorVariable!.catalogId).toBe(honeyColorCatalogId);
    honeyColorVariableId = colorVariable!.id;
  });

  it("§5.1 — two producers use the same color label with different measured percentages: they do not compare as equivalent", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId, version: 1 } });
    const gradoVariable = await prisma.protocolVariable.findFirstOrThrow({ where: { protocolVersionId: version.id, name: "Grado de proceso" } });
    const redHoney = await prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId: honeyColorCatalogId, value: "red honey" } });
    const semiWash50 = await prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId: gradoCatalogId, value: "Semi Wash 50%" } });
    const semiWash75 = await prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId: gradoCatalogId, value: "Semi Wash 75%" } });

    const producerA = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST honey producer A red (${RUN_ID})`,
      startedAt: new Date("2027-02-12T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [
        { protocolVariableId: gradoVariable.id, catalogValueId: semiWash50.id },
        { protocolVariableId: honeyColorVariableId, catalogValueId: redHoney.id },
      ],
    });
    treatmentBatchIds.push(producerA.id);

    const producerB = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST honey producer B red (${RUN_ID})`,
      startedAt: new Date("2027-02-12T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [
        { protocolVariableId: gradoVariable.id, catalogValueId: semiWash75.id },
        { protocolVariableId: honeyColorVariableId, catalogValueId: redHoney.id },
      ],
    });
    treatmentBatchIds.push(producerB.id);

    const comparison = await compareTreatmentBatchesByVariable(researchLeadUserAccountId, producerA.id, producerB.id);
    const gradoComparison = comparison.find((c) => c.protocolVariableId === gradoVariable.id)!;
    const colorComparison = comparison.find((c) => c.protocolVariableId === honeyColorVariableId)!;

    // Same producer-chosen label on both — if color were the comparison
    // axis this would wrongly read as "equivalent." It isn't the axis:
    // the canonical percentage is, and it correctly shows they differ.
    expect(colorComparison.differs).toBe(false);
    expect(gradoComparison.differs).toBe(true);
    expect(gradoComparison.valueA).not.toBe(gradoComparison.valueB);
  });

  it("§5.2 — a treatment can record the percentage with no color label at all; color is never required", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId, version: 1 } });
    const gradoVariable = await prisma.protocolVariable.findFirstOrThrow({ where: { protocolVersionId: version.id, name: "Grado de proceso" } });
    const semiWash50 = await prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId: gradoCatalogId, value: "Semi Wash 50%" } });

    const batch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST honey no-color-label (${RUN_ID})`,
      startedAt: new Date("2027-02-12T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [{ protocolVariableId: gradoVariable.id, catalogValueId: semiWash50.id }],
    });
    treatmentBatchIds.push(batch.id);

    const detail = await getTreatmentBatchDetail(researchLeadUserAccountId, batch.id);
    expect(detail.variableValues.some((v) => v.protocolVariableId === gradoVariable.id)).toBe(true);
    expect(detail.variableValues.some((v) => v.protocolVariableId === honeyColorVariableId)).toBe(false);
  });

  it("§5.3 — every honey color's definition warns the percentage equivalence varies by region/producer", async () => {
    const colors = await prisma.variableCatalogValue.findMany({ where: { catalogId: honeyColorCatalogId } });
    expect(colors).toHaveLength(4);
    expect(colors.map((c) => c.value).sort()).toEqual(["black honey", "red honey", "white honey", "yellow honey"]);
    for (const color of colors) {
      expect(color.definition).toBeTruthy();
      expect(color.definition).toContain("no una medición");
      expect(color.aliasOfId).toBeNull();
    }
  });

  it("§5.4 — no color<->percentage alias remains loaded anywhere in either catalog", async () => {
    const honeyColorValues = await prisma.variableCatalogValue.findMany({ where: { catalogId: honeyColorCatalogId } });
    const gradoValues = await prisma.variableCatalogValue.findMany({ where: { catalogId: gradoCatalogId } });
    for (const v of [...honeyColorValues, ...gradoValues]) {
      expect(v.aliasOfId).toBeNull();
    }
  });
});

describe("§9.6 — two treatments differing in exactly one variable, comparable", () => {
  let batchAId: string;
  let batchBId: string;

  it("executes PE-81 (vertical, 28cm) and PE-82 (horizontal, 14cm), everything else identical", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId, version: 1 } });

    const recipienteValue = await prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId: recipienteCatalogId, value: "Tanque I" } });
    const levaduraValue = await prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId: levaduraCatalogId, value: "MP72" } });

    const batchA = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST PE-81 (${RUN_ID})`,
      startedAt: new Date("2027-02-01T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [
        { protocolVariableId: recipienteVariableId, catalogValueId: recipienteValue.id },
        { protocolVariableId: levaduraVariableId, catalogValueId: levaduraValue.id },
        { protocolVariableId: posicionMasaVariableId, textValue: "vertical" },
        { protocolVariableId: alturaMasaVariableId, numericValue: 28 },
      ],
    });
    batchAId = batchA.id;
    treatmentBatchIds.push(batchAId);

    const batchB = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST PE-82 (${RUN_ID})`,
      startedAt: new Date("2027-02-01T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [
        { protocolVariableId: recipienteVariableId, catalogValueId: recipienteValue.id },
        { protocolVariableId: levaduraVariableId, catalogValueId: levaduraValue.id },
        { protocolVariableId: posicionMasaVariableId, textValue: "horizontal" },
        { protocolVariableId: alturaMasaVariableId, numericValue: 14 },
      ],
    });
    batchBId = batchB.id;
    treatmentBatchIds.push(batchBId);
  });

  it("compareTreatmentBatchesByVariable confirms position and height differ, recipiente/levadura don't", async () => {
    const comparison = await compareTreatmentBatchesByVariable(researchLeadUserAccountId, batchAId, batchBId);
    const posicion = comparison.find((c) => c.protocolVariableId === posicionMasaVariableId)!;
    const altura = comparison.find((c) => c.protocolVariableId === alturaMasaVariableId)!;
    const recipiente = comparison.find((c) => c.protocolVariableId === recipienteVariableId)!;
    const levadura = comparison.find((c) => c.protocolVariableId === levaduraVariableId)!;

    expect(posicion.differs).toBe(true);
    expect(posicion.valueA).toBe("vertical");
    expect(posicion.valueB).toBe("horizontal");
    expect(altura.differs).toBe(true);
    expect(altura.valueA).toBe(28);
    expect(altura.valueB).toBe(14);
    expect(recipiente.differs).toBe(false);
    expect(levadura.differs).toBe(false);
  });
});

describe("§9.7 — reproduce PE-98's real bifurcation: one lot split into washed 100/75/50", () => {
  it("splits one Geisha 10 lot into three outputs via the existing DAG mechanism, unmodified", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId, version: 1 } });
    const gradoWashed = await prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId: gradoCatalogId, value: "Washed" } });
    const gradoSemi75 = await prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId: gradoCatalogId, value: "Semi Wash 75%" } });
    const gradoSemi50 = await prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId: gradoCatalogId, value: "Semi Wash 50%" } });

    const { transformation } = await recordTransformation(labOperatorUserAccountId, {
      transformationType: "split",
      occurredAt: new Date("2027-02-05T08:00:00Z"),
      provenanceClass: "measured_fact",
      inputs: [{ lotId: sourceLotId, quantity: 100, unit: "kg" }],
      outputs: [
        { lotCode: `${RUN_ID}-PE-98-A`, lotType: "processing", quantity: 50, unit: "kg" },
        { lotCode: `${RUN_ID}-PE-98-B`, lotType: "processing", quantity: 30, unit: "kg" },
        { lotCode: `${RUN_ID}-PE-98-C`, lotType: "processing", quantity: 20, unit: "kg" },
      ],
    });

    const outputs = await prisma.lotTransformationOutput.findMany({ where: { transformationId: transformation.id }, include: { lot: true } });
    expect(outputs).toHaveLength(3);
    for (const o of outputs) outputLotIds.push(o.lotId);

    const gradoVariable = await prisma.protocolVariable.findFirstOrThrow({ where: { protocolVersionId: version.id, name: "Grado de proceso" } });

    const grades = [gradoWashed, gradoSemi75, gradoSemi50];
    for (const [index, lot] of outputs.entries()) {
      const batch = await createTreatmentBatch(researchLeadUserAccountId, {
        protocolVersionId: version.id,
        lotId: lot.lotId,
        batchLabel: `TEST PE-98-${["A", "B", "C"][index]} (${RUN_ID})`,
        startedAt: new Date("2027-02-05T09:00:00Z"),
        provenanceClass: "measured_fact",
        variableValues: [{ protocolVariableId: gradoVariable.id, catalogValueId: grades[index]!.id }],
      });
      treatmentBatchIds.push(batch.id);
    }

    const treatmentsForOutputs = await prisma.treatmentBatch.count({ where: { lotId: { in: outputs.map((o) => o.lotId) } } });
    expect(treatmentsForOutputs).toBe(3);
  });
});

describe("§9.8 — bed level interpreted against its own room, not as a bare number", () => {
  let solarRoomId: string;
  let darkRoomId: string;
  let batchId: string;
  let nivelCamaVariableId: string;

  it("sets up a solar room (3 levels, with light) and a dark room (6 levels, no light)", async () => {
    const solarRoom = await prisma.location.create({
      data: {
        locationType: "site",
        name: `TEST Cuarto Solar (${RUN_ID})`,
        organizationId,
        dryingRoomLightExposure: "with_light",
        dryingRoomBedLevelCount: 3,
      },
    });
    solarRoomId = solarRoom.id;
    const darkRoom = await prisma.location.create({
      data: {
        locationType: "site",
        name: `TEST Cuarto Oscuro (${RUN_ID})`,
        organizationId,
        dryingRoomLightExposure: "without_light",
        dryingRoomBedLevelCount: 6,
      },
    });
    darkRoomId = darkRoom.id;

    const version = await prisma.protocolVersion.findFirstOrThrow({
      where: { protocolId, version: 1 },
      include: { variables: true },
    });
    const nivelVersion = await createProtocolVersion(researchLeadUserAccountId, {
      protocolId,
      variables: [{ name: "Nivel de cama", valueType: "numeric" }],
      requiredMeasurements: [],
    });
    nivelCamaVariableId = nivelVersion.variables[0]!.id;

    const batch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: nivelVersion.id,
      lotId: sourceLotId,
      batchLabel: `TEST nivel de cama (${RUN_ID})`,
      startedAt: new Date("2027-02-06T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [{ protocolVariableId: nivelCamaVariableId, numericValue: 1 }],
    });
    batchId = batch.id;
    treatmentBatchIds.push(batchId);
  });

  it("resolves the same 'level 1' differently depending on which room's stage it's paired with", async () => {
    const solarStage = await addProcessingStage(researchLeadUserAccountId, {
      treatmentBatchId: batchId,
      name: "seco_solar",
      sequenceOrder: 0,
      startedAt: new Date("2027-02-06T09:00:00Z"),
      locationId: solarRoomId,
    });
    const darkStage = await addProcessingStage(researchLeadUserAccountId, {
      treatmentBatchId: batchId,
      name: "seco_oscuro",
      sequenceOrder: 1,
      startedAt: new Date("2027-02-06T09:00:00Z"),
      locationId: darkRoomId,
    });

    const solarContext = await getBedLevelContext(solarStage.id, nivelCamaVariableId);
    const darkContext = await getBedLevelContext(darkStage.id, nivelCamaVariableId);

    expect(solarContext).not.toBeNull();
    expect(darkContext).not.toBeNull();
    expect(solarContext!.level).toBe(1);
    expect(darkContext!.level).toBe(1);
    expect(solarContext!.lightExposure).toBe("with_light");
    expect(darkContext!.lightExposure).toBe("without_light");
    expect(solarContext!.bedLevelCount).toBe(3);
    expect(darkContext!.bedLevelCount).toBe(6);
  });

  afterAll(async () => {
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [solarRoomId, darkRoomId] } }) });
  });
});

describe("§9.9 — cold hold / fermentación derived from the DAG, not boolean fields", () => {
  let batchWithColdHoldId: string;
  let batchWithoutColdHoldId: string;

  it("records the 'cold hold -> fermentación controlada' and 'sin cold hold, natural' combinations as real ProcessingStage rows", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId, version: 1 } });

    const batchWithColdHold = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST cold-hold-fermentacion (${RUN_ID})`,
      startedAt: new Date("2027-02-07T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [],
    });
    batchWithColdHoldId = batchWithColdHold.id;
    treatmentBatchIds.push(batchWithColdHoldId);
    await addProcessingStage(researchLeadUserAccountId, { treatmentBatchId: batchWithColdHoldId, name: "cold_hold", sequenceOrder: 0, startedAt: new Date("2027-02-07T08:00:00Z") });
    await addProcessingStage(researchLeadUserAccountId, { treatmentBatchId: batchWithColdHoldId, name: "fermentacion_controlada", sequenceOrder: 1, startedAt: new Date("2027-02-07T10:00:00Z") });

    const batchWithoutColdHold = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST sin-cold-hold-natural (${RUN_ID})`,
      startedAt: new Date("2027-02-07T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [],
    });
    batchWithoutColdHoldId = batchWithoutColdHold.id;
    treatmentBatchIds.push(batchWithoutColdHoldId);
    await addProcessingStage(researchLeadUserAccountId, { treatmentBatchId: batchWithoutColdHoldId, name: "natural", sequenceOrder: 0, startedAt: new Date("2027-02-07T08:00:00Z") });
  });

  it("hasProcessingStage answers presence/absence by querying the DAG, no boolean columns exist", async () => {
    expect(await hasProcessingStage(batchWithColdHoldId, "cold_hold")).toBe(true);
    expect(await hasProcessingStage(batchWithColdHoldId, "fermentacion")).toBe(true);
    expect(await hasProcessingStage(batchWithoutColdHoldId, "cold_hold")).toBe(false);
    expect(await hasProcessingStage(batchWithoutColdHoldId, "fermentacion")).toBe(false);
  });
});

describe("§9.10 — declare a control treatment in an experiment, confirm the system distinguishes it", () => {
  it("declareControlTreatmentBatch marks a batch as the experiment's baseline", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId, version: 1 } });
    const controlBatch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST control batch (${RUN_ID})`,
      startedAt: new Date("2027-02-12T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [],
    });
    treatmentBatchIds.push(controlBatch.id);
    const otherBatch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST non-control batch (${RUN_ID})`,
      startedAt: new Date("2027-02-12T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [],
    });
    treatmentBatchIds.push(otherBatch.id);

    await declareControlTreatmentBatch(researchLeadUserAccountId, experimentId, controlBatch.id);

    const experiment = await prisma.experiment.findUniqueOrThrow({ where: { id: experimentId } });
    expect(experiment.controlTreatmentBatchId).toBe(controlBatch.id);
    expect(experiment.controlTreatmentBatchId).not.toBe(otherBatch.id);
  });

  it("rejects a control declaration for a treatment batch outside the experiment", async () => {
    const otherProtocol = await createProtocol(researchLeadUserAccountId, { name: `TEST unrelated protocol (${RUN_ID})` });
    const otherVersion = await createProtocolVersion(researchLeadUserAccountId, {
      protocolId: otherProtocol.id,
      variables: [{ name: "TEST unrelated var", valueType: "text" }],
      requiredMeasurements: [],
    });
    const unrelatedBatch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: otherVersion.id,
      lotId: sourceLotId,
      batchLabel: `TEST unrelated batch (${RUN_ID})`,
      startedAt: new Date("2027-02-12T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [],
    });
    treatmentBatchIds.push(unrelatedBatch.id);

    await expect(declareControlTreatmentBatch(researchLeadUserAccountId, experimentId, unrelatedBatch.id)).rejects.toThrow(
      ResearchValidationError,
    );

    await prisma.treatmentBatch.deleteMany({ where: assertDefinedWhere({ id: unrelatedBatch.id }) });
    await prisma.protocolVariable.deleteMany({ where: assertDefinedWhere({ protocolVersionId: otherVersion.id }) });
    await prisma.protocolVersion.deleteMany({ where: assertDefinedWhere({ id: otherVersion.id }) });
    await prisma.protocol.deleteMany({ where: assertDefinedWhere({ id: otherProtocol.id }) });
  });
});

describe("§9.11 — a comparative conclusion can never claim measured_fact", () => {
  let interpretationId: string;

  it("createConclusion rejects isComparative=true with provenanceClass=measured_fact", async () => {
    const interpretation = await createInterpretation(researchLeadUserAccountId, {
      experimentId,
      interpretationText: "TEST el tratamiento control-negativo mostró más inconsistencias que el protocolo con bioprotección",
    });
    interpretationId = interpretation.id;

    await expect(
      createConclusion(researchLeadUserAccountId, {
        interpretationId,
        conclusionText: "TEST el tratamiento con MP72 produce mejor taza que sin bioprotección",
        provenanceClass: "measured_fact",
        isComparative: true,
      }),
    ).rejects.toThrow(EvidenceValidationError);
  });

  it("accepts the same comparative conclusion as interpretation", async () => {
    const conclusion = await createConclusion(researchLeadUserAccountId, {
      interpretationId,
      conclusionText: "TEST el tratamiento con MP72 puntuó más alto que el control en esta única corrida",
      provenanceClass: "interpretation",
      isComparative: true,
    });
    expect(conclusion.provenanceClass).toBe("interpretation");
    expect(conclusion.isComparative).toBe(true);
  });

  afterAll(async () => {
    await prisma.researchRecommendation.deleteMany({ where: assertDefinedWhere({ conclusion: { interpretationId } }) });
    await prisma.conclusion.deleteMany({ where: assertDefinedWhere({ interpretationId }) });
    await prisma.interpretation.deleteMany({ where: assertDefinedWhere({ id: interpretationId }) });
  });
});

describe("§9.12 — declared method limits recorded against an experiment, read alongside results", () => {
  it("updateDeclaredLimitations stores the real stated limits and they read back with the experiment", async () => {
    const limitations =
      "TEST No medido todavía: β-glucosidasa, GC-MS, LC-MS, pH y °Brix comparativo pre/post, " +
      "microbiología cuantitativa, y cupping formal con panel calibrado.";
    await updateDeclaredLimitations(researchLeadUserAccountId, experimentId, limitations);

    const experiment = await getExperimentDetail(researchLeadUserAccountId, experimentId);
    expect(experiment.declaredLimitations).toBe(limitations);
  });
});

describe("§9.13 — a treatment carried to sample and real sensory score, zero new code", () => {
  let batchId: string;
  let sampleId: string;

  it("creates a Sample from the lot and links it to the batch via Evidence", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId, version: 1 } });
    const batch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST hasta-taza (${RUN_ID})`,
      startedAt: new Date("2027-02-08T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [],
    });
    batchId = batch.id;
    treatmentBatchIds.push(batchId);

    const { sample } = await createSampleFromLot(labOperatorUserAccountId, {
      sampleCode: `TEST-${RUN_ID}-cupping`,
      sampleType: "cupping",
      sourceLotId: sourceLotId,
      occurredAt: new Date("2027-02-09T08:00:00Z"),
      provenanceClass: "original_record",
    });
    sampleId = sample.id;

    await createEvidence(researchLeadUserAccountId, {
      treatmentBatchId: batchId,
      sampleId,
      provenanceClass: "direct_observation",
    });
  });

  it("getTreatmentBatchDetail surfaces the sensory linkage via getSensoryLinkageForSamples, unmodified", async () => {
    const protocolRow = await prisma.sensoryProtocol.create({ data: { domain: "coffee", name: `TEST RO1 Cupping (${RUN_ID})`, status: "active" } });
    const protocolVersion = await prisma.sensoryProtocolVersion.create({ data: { protocolId: protocolRow.id, version: 1, scoreMin: 0, scoreMax: 100, status: "active" } });
    const attribute = await prisma.sensoryAttribute.create({
      data: { protocolVersionId: protocolVersion.id, name: "TEST Aroma", displayOrder: 0, scaleMin: 0, scaleMax: 20 },
    });
    const session = await prisma.sensorySession.create({ data: { name: `TEST RO1 Session (${RUN_ID})`, protocolVersionId: protocolVersion.id, status: "in_progress", classification: "internal" } });
    const flight = await prisma.sensoryFlight.create({ data: { sessionId: session.id, name: `TEST RO1 Flight (${RUN_ID})`, sequenceOrder: 1 } });
    const blindSample = await prisma.sensoryBlindSample.create({ data: { flightId: flight.id, blindCode: `${RUN_ID}-BC` } });
    await prisma.sensoryBlindMapping.create({ data: { blindSampleId: blindSample.id, sampleId } });

    const judgeUserAccountId = await createTestUserAccount("RO1Judge");
    const judgeProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Sensory Judge" } });
    const judgeScope = await prisma.scope.create({ data: { scopeType: "session", scopeRefId: session.id } });
    await prisma.assignment.create({ data: { userAccountId: judgeUserAccountId, roleProfileId: judgeProfile.id, scopeId: judgeScope.id } });

    await submitAssessment(judgeUserAccountId, {
      blindSampleId: blindSample.id,
      overallScore: 87,
      comment: "TEST RO1 cupping note",
      attributeResponses: [{ attributeId: attribute.id, value: 15 }],
    });

    const detail = await getTreatmentBatchDetail(researchLeadUserAccountId, batchId);
    const linkage = detail.sensoryLinkage[sampleId];
    expect(linkage).toBeDefined();
    expect(linkage?.[0]?.sessionName).toBe(`TEST RO1 Session (${RUN_ID})`);

    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: judgeUserAccountId }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: judgeScope.id }) });
    await prisma.attributeResponse.deleteMany({ where: assertDefinedWhere({ attributeId: attribute.id }) });
    await prisma.assessment.deleteMany({ where: assertDefinedWhere({ blindSampleId: blindSample.id }) });
    await prisma.sensoryBlindMapping.deleteMany({ where: assertDefinedWhere({ blindSampleId: blindSample.id }) });
    await prisma.sensoryBlindSample.deleteMany({ where: assertDefinedWhere({ id: blindSample.id }) });
    await prisma.sensoryFlight.deleteMany({ where: assertDefinedWhere({ id: flight.id }) });
    await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: session.id }) });
    await prisma.sensoryAttribute.deleteMany({ where: assertDefinedWhere({ id: attribute.id }) });
    await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: protocolVersion.id }) });
    await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: protocolRow.id }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: judgeUserAccountId }) });
  });
});

describe("§9.14 — required measurements can't be silently omitted", () => {
  it("refuses to complete a stage missing its required Brix reading and catalog pick", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId, version: 1 } });
    const batch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST enforcement (${RUN_ID})`,
      startedAt: new Date("2027-02-10T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [],
    });
    treatmentBatchIds.push(batch.id);

    const stage = await addProcessingStage(researchLeadUserAccountId, {
      treatmentBatchId: batch.id,
      name: "recepción_cereza",
      sequenceOrder: 0,
      startedAt: new Date("2027-02-10T08:00:00Z"),
    });

    await expect(completeProcessingStage(researchLeadUserAccountId, stage.id, new Date())).rejects.toThrow(ProcessingStageValidationError);

    await recordMeasurement(labOperatorUserAccountId, {
      variable: "brix",
      value: 18.5,
      unit: "Bx",
      occurredAt: new Date("2027-02-10T08:30:00Z"),
      lotId: sourceLotId,
      treatmentBatchId: batch.id,
      processingStageId: stage.id,
      provenanceClass: "measured_fact",
    });

    await expect(completeProcessingStage(researchLeadUserAccountId, stage.id, new Date())).rejects.toThrow(ProcessingStageValidationError);

    const seleccionValue = await prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId: seleccionCatalogId, value: "uniforme_alta" } });
    await recordProcessingStageObservation(researchLeadUserAccountId, {
      processingStageId: stage.id,
      catalogValueId: seleccionValue.id,
      occurredAt: new Date("2027-02-10T08:35:00Z"),
      provenanceClass: "direct_observation",
    });

    const completed = await completeProcessingStage(researchLeadUserAccountId, stage.id, new Date());
    expect(completed.completedAt).not.toBeNull();
  });
});

describe("§9.15 — A7/F1/S1/R1 real data intact", () => {
  it("confirms real Cerro Azul, RoastSession, and SensoryDescriptor rows are unaffected", async () => {
    const cerroAzulLocations = await prisma.location.count({ where: { name: { contains: "Cerro Azul" } } });
    const sensoryDescriptors = await prisma.sensoryDescriptor.count();
    expect(cerroAzulLocations).toBeGreaterThan(0);
    expect(sensoryDescriptors).toBeGreaterThan(0);

    // The RoastSession count that used to sit here has been removed (ADR-086).
    // It asserted `count() > 0` under the heading "real data intact", and every
    // row it was counting was this suite's own leaked fixtures — so it proved
    // the residue existed, not that anything real survived. With production
    // cleaned (ADR-085) it failed honestly, which is how it was found.
    //
    // It is not replaced by an unchanged-across-the-run check: vitest runs
    // files in parallel and tests/traceability/roasting.test.ts creates and
    // deletes sessions throughout, so any global count of that table measures
    // another file's progress rather than this one's damage.
  });
});

/**
 * **El lote que `recordWashMedium` CITA tiene que estar en el proyecto ya
 * autorizado.** `PENDING_IMPLEMENTATIONS/005` — defecto confirmado por Daniel el
 * 2026-10-04, la hermana exacta del de `completeExternalCoffeeOrigin`.
 *
 * Autoriza `research:execute_protocol` sobre el proyecto del lote de tratamiento
 * y después leía el lote de `washMediumSourceLotId` **sólo para comprobar que
 * existe** —el valor se descartaba—. Con eso se podía citar **cualquier lote de la
 * base** como medio de lavado y escribir ese enlace en la etapa.
 *
 * **Por qué la regla es «el mismo proyecto» y no `lot:view`.** Medido el
 * 2026-10-04: el perfil `Research Lead` **no tiene ningún permiso de `lot`** —sólo
 * `research:*` y `classification:*`—, así que exigir `lot:view` rompería
 * `mosto_de_otro_lote`, que es una función deliberada, y obligaría a conceder un
 * permiso nuevo a los perfiles de investigación: eso es una decisión de Daniel,
 * no un arreglo. La regla del proyecto cierra «cualquier lote de la base» sin
 * tocar el modelo de permisos: la cita se queda dentro del ámbito sobre el que ya
 * te autorizaron.
 */
describe("RO1.2 — el medio de lavado no puede citar un lote de otro proyecto", () => {
  it("rechaza un lote fuente fuera del proyecto del lote de tratamiento", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId, version: 1 } });
    const catalogo = await prisma.variableCatalog.findFirstOrThrow({ where: { key: "medio_lavado" } });
    const mostoDeOtro = await prisma.variableCatalogValue.findFirstOrThrow({
      where: { catalogId: catalogo.id, value: "mosto_de_otro_lote" },
    });

    const batch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      batchLabel: `TEST mosto ajeno (${RUN_ID})`,
      startedAt: new Date("2027-03-01T08:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [],
    });
    treatmentBatchIds.push(batch.id);
    const stage = await addProcessingStage(researchLeadUserAccountId, {
      treatmentBatchId: batch.id,
      name: "lavado",
      sequenceOrder: 1,
      startedAt: new Date("2027-03-01T09:00:00Z"),
    });

    // Un lote de OTRO proyecto, que la cita no debe alcanzar.
    const otroProyecto = await prisma.project.create({
      data: { name: `TEST RO1 Otro Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    const ajeno = await prisma.lot.create({
      data: { lotCode: `${RUN_ID}-mosto-ajeno`, lotType: "processing", organizationId, projectId: otroProyecto.id },
    });

    await expect(
      recordWashMedium(researchLeadUserAccountId, {
        processingStageId: stage.id,
        washMediumCatalogValueId: mostoDeOtro.id,
        washMediumSourceLotId: ajeno.id,
      }),
    ).rejects.toThrow(ResearchAccessError);

    // No basta con que lance: el enlace no puede haber quedado escrito.
    const intacta = await prisma.processingStage.findUniqueOrThrow({ where: { id: stage.id } });
    expect(intacta.washMediumSourceLotId, "la etapa no puede quedar citando el lote ajeno").toBeNull();

    /**
     * **El control, y sin él lo de arriba no mide nada:** un rechazo podría venir
     * de que el investigador no pueda citar NINGÚN lote. Con uno de su propio
     * proyecto la cita tiene que funcionar.
     */
    const propio = await prisma.lot.create({
      data: { lotCode: `${RUN_ID}-mosto-propio-ctl`, lotType: "processing", organizationId, projectId },
    });
    const ok = await recordWashMedium(researchLeadUserAccountId, {
      processingStageId: stage.id,
      washMediumCatalogValueId: mostoDeOtro.id,
      washMediumSourceLotId: propio.id,
    });
    expect(ok.washMediumSourceLotId).toBe(propio.id);

    await prisma.processingStage.update({ where: { id: stage.id }, data: { washMediumSourceLotId: null } });
    await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: [ajeno.id, propio.id] } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: otroProyecto.id }) });
  });
});
