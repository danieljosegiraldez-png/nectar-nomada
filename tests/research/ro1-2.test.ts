/**
 * RO1.2 (docs/implementation/36_RO1.2_METODOS_FERMENTACION.md §5). Real
 * Postgres (Neon), no mocks — same discipline as tests/research/ro1.test.ts.
 * Covers all 11 of §5's verification scenarios using the real §1/§2/§2b
 * vocabulary this ticket built: the 6 new orthogonal-dimension catalogs
 * (condicion_oxigeno, manejo_temperatura, fuente_microbiana, sustrato_
 * anadido, estado_cereza, medio_lavado), grado_proceso's new "Honey" value
 * (reused, not duplicated, for §1's "Flujo de proceso" dimension),
 * recordWashMedium, and recordProcessSensoryObservation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createResearchProgram, createResearchQuestion, createHypothesis, createExperiment } from "../../lib/research/programs";
import { createProtocol, createProtocolVersion } from "../../lib/research/protocols";
import {
  createTreatmentBatch,
  addProcessingStage,
  recordWashMedium,
  recordProcessSensoryObservation,
  WashMediumValidationError,
} from "../../lib/research/treatments";
import { createEvidence, createEvidenceClaim, createInterpretation } from "../../lib/research/evidence";
import { recordTransformation } from "../../lib/traceability/lots";
import { recordMeasurement } from "../../lib/traceability/measurements";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `ro1-2-${Date.now()}`;

let projectId: string;
let organizationId: string;
let researchLeadUserAccountId: string;
let researchLeadScopeId: string;
let labOperatorUserAccountId: string;
let labOperatorScopeId: string;
let sourceLotId: string;
let researchProgramId: string;
let experimentId: string;
let protocolId: string;

let gradoCatalogId: string;
let condicionOxigenoCatalogId: string;
let manejoTemperaturaCatalogId: string;
let fuenteMicrobianaCatalogId: string;
let levaduraCatalogId: string;
let medioLavadoCatalogId: string;

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

  const project = await prisma.project.create({ data: { name: `TEST RO1.2 Project (${RUN_ID})`, status: "approved", classification: "internal" } });
  projectId = project.id;

  researchLeadUserAccountId = await createTestUserAccount("RO12ResearchLead");
  const researchLeadProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Research Lead" } });
  const scope = await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } });
  researchLeadScopeId = scope.id;
  await prisma.assignment.create({ data: { userAccountId: researchLeadUserAccountId, roleProfileId: researchLeadProfile.id, scopeId: scope.id } });

  labOperatorUserAccountId = await createTestUserAccount("RO12LabOperator");
  const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const labScope = await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } });
  labOperatorScopeId = labScope.id;
  await prisma.assignment.create({ data: { userAccountId: labOperatorUserAccountId, roleProfileId: farmOperatorProfile.id, scopeId: labScope.id } });

  const sourceLot = await prisma.lot.create({
    data: { lotCode: `${RUN_ID}-cherry`, lotType: "cherry", organizationId, projectId },
  });
  sourceLotId = sourceLot.id;

  const catalogs = await prisma.variableCatalog.findMany({
    where: { key: { in: ["grado_proceso", "condicion_oxigeno", "manejo_temperatura", "fuente_microbiana", "levadura_cultivo", "medio_lavado"] } },
  });
  gradoCatalogId = catalogs.find((c) => c.key === "grado_proceso")!.id;
  condicionOxigenoCatalogId = catalogs.find((c) => c.key === "condicion_oxigeno")!.id;
  manejoTemperaturaCatalogId = catalogs.find((c) => c.key === "manejo_temperatura")!.id;
  fuenteMicrobianaCatalogId = catalogs.find((c) => c.key === "fuente_microbiana")!.id;
  levaduraCatalogId = catalogs.find((c) => c.key === "levadura_cultivo")!.id;
  medioLavadoCatalogId = catalogs.find((c) => c.key === "medio_lavado")!.id;

  const program = await createResearchProgram(researchLeadUserAccountId, { name: `TEST RO1.2 fermentation methods (${RUN_ID})` });
  researchProgramId = program.id;
  const question = await createResearchQuestion(researchLeadUserAccountId, researchProgramId, "TEST ¿cómo interactúan las dimensiones de fermentación?");
  const hypothesis = await createHypothesis(researchLeadUserAccountId, question.id, "TEST las dimensiones son independientes entre sí");
  const experiment = await createExperiment(researchLeadUserAccountId, {
    researchProgramId,
    hypothesisId: hypothesis.id,
    projectId,
    name: `TEST RO1.2 experiment (${RUN_ID})`,
  });
  experimentId = experiment.id;

  const protocol = await createProtocol(researchLeadUserAccountId, {
    experimentId,
    name: `TEST RO1.2 protocol (${RUN_ID})`,
    externalIdentifier: null,
    identifierConvention: null,
  });
  protocolId = protocol.id;

  await createProtocolVersion(researchLeadUserAccountId, {
    protocolId,
    notes: "TEST version 1",
    variables: [
      { name: "Flujo de proceso", valueType: "catalog", catalogId: gradoCatalogId },
      { name: "Condición de oxígeno", valueType: "catalog", catalogId: condicionOxigenoCatalogId },
      { name: "Manejo de temperatura", valueType: "catalog", catalogId: manejoTemperaturaCatalogId },
      { name: "Fuente microbiana", valueType: "catalog", catalogId: fuenteMicrobianaCatalogId },
      { name: "Levadura / cultivo", valueType: "catalog", catalogId: levaduraCatalogId },
    ],
    requiredMeasurements: [],
  });
});

afterAll(async () => {
  await prisma.evidence.deleteMany({ where: assertDefinedWhere({ treatmentBatchId: { in: treatmentBatchIds } }) });
  await prisma.evidence.deleteMany({
    where: assertDefinedWhere({ processSensoryObservation: { processingStage: { treatmentBatchId: { in: treatmentBatchIds } } } }),
  });
  await prisma.processSensoryObservation.deleteMany({ where: assertDefinedWhere({ processingStage: { treatmentBatchId: { in: treatmentBatchIds } } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ treatmentBatchId: { in: treatmentBatchIds } } as never) });
  await prisma.processingStage.deleteMany({ where: assertDefinedWhere({ treatmentBatchId: { in: treatmentBatchIds } }) });
  await prisma.treatmentBatchVariableValue.deleteMany({ where: assertDefinedWhere({ treatmentBatchId: { in: treatmentBatchIds } }) });
  await prisma.treatmentBatch.deleteMany({ where: assertDefinedWhere({ id: { in: treatmentBatchIds } }) });
  await prisma.protocolVariable.deleteMany({ where: assertDefinedWhere({ protocolVersion: { protocolId } }) });
  await prisma.protocolVersion.deleteMany({ where: assertDefinedWhere({ protocolId }) });
  await prisma.protocol.deleteMany({ where: assertDefinedWhere({ id: protocolId }) });
  await prisma.interpretation.deleteMany({ where: assertDefinedWhere({ experimentId }) });
  await prisma.experiment.deleteMany({ where: assertDefinedWhere({ id: experimentId }) });
  await prisma.hypothesis.deleteMany({ where: assertDefinedWhere({ researchQuestion: { researchProgramId } }) });
  await prisma.researchQuestion.deleteMany({ where: assertDefinedWhere({ researchProgramId }) });
  await prisma.researchProgram.deleteMany({ where: assertDefinedWhere({ id: researchProgramId }) });

  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: [sourceLotId, ...outputLotIds] } }) });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: sourceLotId } } }, { outputs: { some: { lotId: { in: outputLotIds } } } }] }),
  });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: [sourceLotId, ...outputLotIds] } }) });

  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [researchLeadUserAccountId, labOperatorUserAccountId] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: [researchLeadScopeId, labOperatorScopeId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [researchLeadUserAccountId, labOperatorUserAccountId] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
});

async function variableId(protocolVersionId: string, name: string) {
  const v = await prisma.protocolVariable.findFirstOrThrow({ where: { protocolVersionId, name } });
  return v.id;
}

async function catalogValueId(catalogId: string, value: string) {
  const v = await prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId, value } });
  return v.id;
}

describe("§5.1 — a treatment combines four independent dimensions at once", () => {
  it("records flujo natural + anaeróbico + choque térmico + levadura inoculada on one TreatmentBatch", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId }, include: { variables: true } });
    const [natural, anaerobico, choqueTermico, levaduraInoculada, mp72] = await Promise.all([
      catalogValueId(gradoCatalogId, "Natural"),
      catalogValueId(condicionOxigenoCatalogId, "anaerobico"),
      catalogValueId(manejoTemperaturaCatalogId, "choque_termico"),
      catalogValueId(fuenteMicrobianaCatalogId, "levadura_inoculada"),
      catalogValueId(levaduraCatalogId, "MP72"),
    ]);

    const batch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      projectId,
      batchLabel: `TEST four-dimensions-at-once (${RUN_ID})`,
      startedAt: new Date(),
      provenanceClass: "measured_fact",
      variableValues: [
        { protocolVariableId: await variableId(version.id, "Flujo de proceso"), catalogValueId: natural },
        { protocolVariableId: await variableId(version.id, "Condición de oxígeno"), catalogValueId: anaerobico },
        { protocolVariableId: await variableId(version.id, "Manejo de temperatura"), catalogValueId: choqueTermico },
        { protocolVariableId: await variableId(version.id, "Fuente microbiana"), catalogValueId: levaduraInoculada },
        { protocolVariableId: await variableId(version.id, "Levadura / cultivo"), catalogValueId: mp72 },
      ],
    });
    treatmentBatchIds.push(batch.id);

    const values = await prisma.treatmentBatchVariableValue.findMany({
      where: { treatmentBatchId: batch.id },
      include: { protocolVariable: true, catalogValue: true },
    });
    expect(values).toHaveLength(5);
    const byVariable = new Map(values.map((v) => [v.protocolVariable.name, v.catalogValue?.value]));
    expect(byVariable.get("Flujo de proceso")).toBe("Natural");
    expect(byVariable.get("Condición de oxígeno")).toBe("anaerobico");
    expect(byVariable.get("Manejo de temperatura")).toBe("choque_termico");
    expect(byVariable.get("Fuente microbiana")).toBe("levadura_inoculada");
  });
});

describe("§5.2 — cereza entera anaeróbica sumergida -> despulpado -> honey is a chained DAG, not a compound value", () => {
  it("each stage of the real product-owner scenario is its own Lot/TreatmentBatch, linked by transformation, not one row with a composite label", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId } });
    const [anaerobico, entera] = await Promise.all([
      catalogValueId(condicionOxigenoCatalogId, "anaerobico"),
      catalogValueId((await prisma.variableCatalog.findUniqueOrThrow({ where: { key: "estado_cereza" } })).id, "entera"),
    ]);

    // Stage 1: whole-cherry anaerobic immersion, on the source lot itself.
    const stage1Batch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      projectId,
      batchLabel: `TEST cereza-entera-anaerobica-sumergida (${RUN_ID})`,
      startedAt: new Date(),
      provenanceClass: "measured_fact",
      variableValues: [{ protocolVariableId: await variableId(version.id, "Condición de oxígeno"), catalogValueId: anaerobico }],
    });
    treatmentBatchIds.push(stage1Batch.id);

    // Despulpado: a real LotTransformation (stage_change), producing a new
    // Lot — the DAG expressing the sequence, per §2's own "Multi-etapa...
    // no crees un valor de catálogo" instruction.
    const { outputLots } = await recordTransformation(labOperatorUserAccountId, {
      transformationType: "stage_change",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: sourceLotId }],
      outputs: [{ lotCode: `${RUN_ID}-despulpado`, lotType: "processing" }],
    });
    const despulpadoLotId = outputLots[0]!.id;
    outputLotIds.push(despulpadoLotId);

    // Stage 2: honey flow, on the despulpado output lot — a second,
    // independent TreatmentBatch, not a field appended to stage 1.
    const honey = await catalogValueId(gradoCatalogId, "Honey");
    const stage2Batch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: despulpadoLotId,
      projectId,
      batchLabel: `TEST honey-tras-despulpado (${RUN_ID})`,
      startedAt: new Date(),
      provenanceClass: "measured_fact",
      variableValues: [{ protocolVariableId: await variableId(version.id, "Flujo de proceso"), catalogValueId: honey }],
    });
    treatmentBatchIds.push(stage2Batch.id);

    // Confirm chained, not compound: two distinct TreatmentBatch rows, each
    // with exactly one dimension value, linked by a real LotTransformation
    // between their lots — no single row carries "anaerobico+honey" as one
    // composite string.
    const lineage = await prisma.lotTransformation.findFirst({
      where: { inputs: { some: { lotId: sourceLotId } }, outputs: { some: { lotId: despulpadoLotId } } },
    });
    expect(lineage).not.toBeNull();
    expect(lineage!.transformationType).toBe("stage_change");

    const stage1Values = await prisma.treatmentBatchVariableValue.findMany({ where: { treatmentBatchId: stage1Batch.id } });
    const stage2Values = await prisma.treatmentBatchVariableValue.findMany({ where: { treatmentBatchId: stage2Batch.id } });
    expect(stage1Values).toHaveLength(1);
    expect(stage2Values).toHaveLength(1);
    expect(stage1Batch.lotId).toBe(sourceLotId);
    expect(stage2Batch.lotId).toBe(despulpadoLotId);
  });
});

describe("§5.3 — querying \"all anaerobic treatments\" returns natural, honey, and washed flows alike", () => {
  it("finds anaerobic-tagged batches across different Flujo de proceso values", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId } });
    const [anaerobico, natural, washed] = await Promise.all([
      catalogValueId(condicionOxigenoCatalogId, "anaerobico"),
      catalogValueId(gradoCatalogId, "Natural"),
      catalogValueId(gradoCatalogId, "Washed"),
    ]);
    const honey = await catalogValueId(gradoCatalogId, "Honey");
    const flujoVariableId = await variableId(version.id, "Flujo de proceso");
    const condicionVariableId = await variableId(version.id, "Condición de oxígeno");

    const createdBatches = await Promise.all(
      [natural, honey, washed].map((flujo, i) =>
        createTreatmentBatch(researchLeadUserAccountId, {
          protocolVersionId: version.id,
          lotId: sourceLotId,
          projectId,
          batchLabel: `TEST anaerobic-query-${i} (${RUN_ID})`,
          startedAt: new Date(),
          provenanceClass: "measured_fact",
          variableValues: [
            { protocolVariableId: flujoVariableId, catalogValueId: flujo },
            { protocolVariableId: condicionVariableId, catalogValueId: anaerobico },
          ],
        }),
      ),
    );
    treatmentBatchIds.push(...createdBatches.map((b) => b.id));

    const anaerobicBatches = await prisma.treatmentBatch.findMany({
      where: {
        id: { in: createdBatches.map((b) => b.id) },
        variableValues: { some: { protocolVariableId: condicionVariableId, catalogValueId: anaerobico } },
      },
      include: { variableValues: { include: { protocolVariable: true, catalogValue: true } } },
    });

    expect(anaerobicBatches).toHaveLength(3);
    const flujosFound = anaerobicBatches.map(
      (b) => b.variableValues.find((v) => v.protocolVariable.name === "Flujo de proceso")!.catalogValue!.value,
    );
    expect(new Set(flujosFound)).toEqual(new Set(["Natural", "Honey", "Washed"]));
  });
});

describe("§5.4 — a CryoBloom cold hold treatment reads back complete with every §2 field", () => {
  it("records all cold-hold measurements and reads them back", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId } });
    const coldHold = await catalogValueId(manejoTemperaturaCatalogId, "cold_hold_prefermentativo");

    const batch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      projectId,
      batchLabel: `TEST cryobloom-cold-hold (${RUN_ID})`,
      startedAt: new Date(),
      provenanceClass: "measured_fact",
      variableValues: [{ protocolVariableId: await variableId(version.id, "Manejo de temperatura"), catalogValueId: coldHold }],
    });
    treatmentBatchIds.push(batch.id);

    const stage = await addProcessingStage(researchLeadUserAccountId, {
      treatmentBatchId: batch.id,
      name: "cold_hold",
      sequenceOrder: 1,
      startedAt: new Date(),
    });

    const readings: Array<{ variable: import("../../lib/traceability/units").MeasurementVariable; value: number; unit: string }> = [
      { variable: "cold_hold_initial_temperature", value: 18, unit: "C" },
      { variable: "cold_hold_target_temperature_min", value: 2, unit: "C" },
      { variable: "cold_hold_target_temperature_max", value: 4, unit: "C" },
      { variable: "cold_hold_descent_rate", value: 12, unit: "min/C" },
      { variable: "cold_hold_plateau_duration", value: 18, unit: "h" },
      // Real CryoBloom reference card figure: 1 g/kg base + 30% adjustment.
      { variable: "bioprotective_yeast_dose", value: 1.3, unit: "g/kg" },
      { variable: "rehydration_time", value: 20, unit: "min" },
      { variable: "cold_hold_pre_seal_temperature", value: 3, unit: "C" },
      { variable: "cold_hold_arrival_temperature", value: 5, unit: "C" },
      { variable: "cold_hold_post_rinse_temperature", value: 19, unit: "C" },
    ];
    for (const reading of readings) {
      await recordMeasurement(labOperatorUserAccountId, {
        ...reading,
        occurredAt: new Date(),
        lotId: sourceLotId,
        treatmentBatchId: batch.id,
        processingStageId: stage.id,
        provenanceClass: "measured_fact",
      });
    }

    const stored = await prisma.measurement.findMany({ where: { processingStageId: stage.id } });
    expect(stored).toHaveLength(readings.length);
    const byVariable = new Map(stored.map((m) => [m.variable, m.value.toNumber()]));
    for (const reading of readings) {
      expect(byVariable.get(reading.variable)).toBe(reading.value);
    }
  });
});

describe("§5.5 — anaeróbico and maceración carbónica are not aliases of one another", () => {
  it("both exist as separate, non-aliased VariableCatalogValue rows with distinguishing definitions", async () => {
    const [anaerobico, carbonica] = await Promise.all([
      prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId: condicionOxigenoCatalogId, value: "anaerobico" } }),
      prisma.variableCatalogValue.findFirstOrThrow({ where: { catalogId: condicionOxigenoCatalogId, value: "maceracion_carbonica" } }),
    ]);
    expect(anaerobico.aliasOfId).toBeNull();
    expect(carbonica.aliasOfId).toBeNull();
    expect(anaerobico.id).not.toBe(carbonica.id);
    expect(anaerobico.definition).toBeTruthy();
    expect(carbonica.definition).toBeTruthy();
    expect(anaerobico.definition).not.toBe(carbonica.definition);
  });
});

describe("§5.6 — a wash records both absolute volume and the water-to-coffee ratio, both legible", () => {
  it("records water_volume_washing and water_to_coffee_ratio and reads both back distinctly", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId } });
    const batch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      projectId,
      batchLabel: `TEST water-volume-and-ratio (${RUN_ID})`,
      startedAt: new Date(),
      provenanceClass: "measured_fact",
      variableValues: [],
    });
    treatmentBatchIds.push(batch.id);

    await recordMeasurement(labOperatorUserAccountId, {
      variable: "water_volume_washing",
      value: 40,
      unit: "L",
      occurredAt: new Date(),
      lotId: sourceLotId,
      treatmentBatchId: batch.id,
      provenanceClass: "measured_fact",
    });
    await recordMeasurement(labOperatorUserAccountId, {
      variable: "water_to_coffee_ratio",
      value: 1.6,
      unit: "L/kg",
      occurredAt: new Date(),
      lotId: sourceLotId,
      treatmentBatchId: batch.id,
      provenanceClass: "measured_fact",
    });

    const stored = await prisma.measurement.findMany({ where: { treatmentBatchId: batch.id } });
    expect(stored).toHaveLength(2);
    const byVariable = new Map(stored.map((m) => [m.variable, m.value.toNumber()]));
    expect(byVariable.get("water_volume_washing")).toBe(40);
    expect(byVariable.get("water_to_coffee_ratio")).toBe(1.6);
  });
});

describe("§5.7 — a lot washed with its own mosto and one washed with another lot's mosto are distinguished, including which lot", () => {
  it("recordWashMedium requires a source lot for mosto_de_otro_lote and forbids one for mosto_propio", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId } });

    const [propioBatch, otroLoteBatch, thirdPartyLot] = await Promise.all([
      createTreatmentBatch(researchLeadUserAccountId, {
        protocolVersionId: version.id,
        lotId: sourceLotId,
        projectId,
        batchLabel: `TEST mosto-propio (${RUN_ID})`,
        startedAt: new Date(),
        provenanceClass: "measured_fact",
        variableValues: [],
      }),
      createTreatmentBatch(researchLeadUserAccountId, {
        protocolVersionId: version.id,
        lotId: sourceLotId,
        projectId,
        batchLabel: `TEST mosto-de-otro-lote (${RUN_ID})`,
        startedAt: new Date(),
        provenanceClass: "measured_fact",
        variableValues: [],
      }),
      prisma.lot.create({ data: { lotCode: `${RUN_ID}-mosto-source`, lotType: "processing", organizationId, projectId } }),
    ]);
    treatmentBatchIds.push(propioBatch.id, otroLoteBatch.id);
    outputLotIds.push(thirdPartyLot.id);

    const propioStage = await addProcessingStage(researchLeadUserAccountId, {
      treatmentBatchId: propioBatch.id,
      name: "lavado",
      sequenceOrder: 1,
      startedAt: new Date(),
    });
    const otroLoteStage = await addProcessingStage(researchLeadUserAccountId, {
      treatmentBatchId: otroLoteBatch.id,
      name: "lavado",
      sequenceOrder: 1,
      startedAt: new Date(),
    });

    const [mostoPropio, mostoDeOtroLote] = await Promise.all([
      catalogValueId(medioLavadoCatalogId, "mosto_propio"),
      catalogValueId(medioLavadoCatalogId, "mosto_de_otro_lote"),
    ]);

    await recordWashMedium(researchLeadUserAccountId, { processingStageId: propioStage.id, washMediumCatalogValueId: mostoPropio });
    await recordWashMedium(researchLeadUserAccountId, {
      processingStageId: otroLoteStage.id,
      washMediumCatalogValueId: mostoDeOtroLote,
      washMediumSourceLotId: thirdPartyLot.id,
    });

    const [propioResult, otroLoteResult] = await Promise.all([
      prisma.processingStage.findUniqueOrThrow({ where: { id: propioStage.id } }),
      prisma.processingStage.findUniqueOrThrow({ where: { id: otroLoteStage.id } }),
    ]);
    expect(propioResult.washMediumCatalogValueId).toBe(mostoPropio);
    expect(propioResult.washMediumSourceLotId).toBeNull();
    expect(otroLoteResult.washMediumCatalogValueId).toBe(mostoDeOtroLote);
    expect(otroLoteResult.washMediumSourceLotId).toBe(thirdPartyLot.id);

    // Structural guard rails: mosto_de_otro_lote demands a source lot;
    // mosto_propio forbids one lingering (would misrepresent provenance).
    await expect(
      recordWashMedium(researchLeadUserAccountId, { processingStageId: otroLoteStage.id, washMediumCatalogValueId: mostoDeOtroLote }),
    ).rejects.toThrow(WashMediumValidationError);
    await expect(
      recordWashMedium(researchLeadUserAccountId, {
        processingStageId: propioStage.id,
        washMediumCatalogValueId: mostoPropio,
        washMediumSourceLotId: thirdPartyLot.id,
      }),
    ).rejects.toThrow(WashMediumValidationError);
  });
});

describe("§5.8 — two process-sensory observations on the same fermentation at different moments read back as a series", () => {
  it("records observations at 12h and 36h and both are retrievable, ordered by observedAt", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId } });
    const batch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      projectId,
      batchLabel: `TEST sensory-series (${RUN_ID})`,
      startedAt: new Date("2026-08-01T00:00:00Z"),
      provenanceClass: "measured_fact",
      variableValues: [],
    });
    treatmentBatchIds.push(batch.id);
    const stage = await addProcessingStage(researchLeadUserAccountId, {
      treatmentBatchId: batch.id,
      name: "fermentacion",
      sequenceOrder: 1,
      startedAt: new Date("2026-08-01T00:00:00Z"),
    });

    const obs12h = await recordProcessSensoryObservation(researchLeadUserAccountId, {
      processingStageId: stage.id,
      observedAt: new Date("2026-08-01T12:00:00Z"),
      medium: "mosto",
      freeTextDescriptor: "huele a guarapo",
      provenanceClass: "direct_observation",
    });
    const obs36h = await recordProcessSensoryObservation(researchLeadUserAccountId, {
      processingStageId: stage.id,
      observedAt: new Date("2026-08-02T12:00:00Z"),
      medium: "mosto",
      freeTextDescriptor: "está como piña pasada",
      provenanceClass: "direct_observation",
    });

    const series = await prisma.processSensoryObservation.findMany({
      where: { processingStageId: stage.id },
      orderBy: { observedAt: "asc" },
    });
    expect(series).toHaveLength(2);
    expect(series[0]!.id).toBe(obs12h.id);
    expect(series[1]!.id).toBe(obs36h.id);
    expect(series[0]!.freeTextDescriptor).toBe("huele a guarapo");
    expect(series[1]!.freeTextDescriptor).toBe("está como piña pasada");
  });
});

describe("§5.9 — a field-language observation with no structured descriptor is valid on its own", () => {
  it("accepts freeTextDescriptor with structuredDescriptorId left unset", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId } });
    const batch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      projectId,
      batchLabel: `TEST field-language-only (${RUN_ID})`,
      startedAt: new Date(),
      provenanceClass: "measured_fact",
      variableValues: [],
    });
    treatmentBatchIds.push(batch.id);
    const stage = await addProcessingStage(researchLeadUserAccountId, {
      treatmentBatchId: batch.id,
      name: "fermentacion",
      sequenceOrder: 1,
      startedAt: new Date(),
    });

    const observation = await recordProcessSensoryObservation(researchLeadUserAccountId, {
      processingStageId: stage.id,
      observedAt: new Date(),
      medium: "cereza",
      freeTextDescriptor: "huele a vinagre suave",
      provenanceClass: "direct_observation",
    });

    expect(observation.structuredDescriptorId).toBeNull();
    expect(observation.freeTextDescriptor).toBe("huele a vinagre suave");
  });
});

describe("§5.10 — an inference about microbial activity is recorded as a real Interpretation, separate from the observation", () => {
  it("chains ProcessSensoryObservation -> Evidence -> EvidenceClaim -> Interpretation", async () => {
    const version = await prisma.protocolVersion.findFirstOrThrow({ where: { protocolId } });
    const batch = await createTreatmentBatch(researchLeadUserAccountId, {
      protocolVersionId: version.id,
      lotId: sourceLotId,
      projectId,
      batchLabel: `TEST observation-to-interpretation (${RUN_ID})`,
      startedAt: new Date(),
      provenanceClass: "measured_fact",
      variableValues: [],
    });
    treatmentBatchIds.push(batch.id);
    const stage = await addProcessingStage(researchLeadUserAccountId, {
      treatmentBatchId: batch.id,
      name: "fermentacion",
      sequenceOrder: 1,
      startedAt: new Date(),
    });

    const observation = await recordProcessSensoryObservation(researchLeadUserAccountId, {
      processingStageId: stage.id,
      observedAt: new Date(),
      medium: "mosto",
      freeTextDescriptor: "notas a éster frutal marcadas",
      provenanceClass: "direct_observation",
    });
    // The observation itself carries no inference field — confirmed by its
    // own shape (no such column exists on the model at all, verified at
    // the schema level; here, confirm the *chain* is what carries it).
    expect((observation as unknown as { inference?: unknown }).inference).toBeUndefined();

    const evidence = await createEvidence(researchLeadUserAccountId, {
      processSensoryObservationId: observation.id,
      provenanceClass: "direct_observation",
    });
    const claim = await createEvidenceClaim(researchLeadUserAccountId, evidence.id, "TEST ésteres frutales marcados en el mosto a las 12h");
    const interpretation = await createInterpretation(researchLeadUserAccountId, {
      experimentId,
      evidenceClaimId: claim.id,
      interpretationText: "TEST posible actividad de levadura no-Saccharomyces, sin confirmación por microbiología cuantitativa",
    });

    expect(evidence.processSensoryObservationId).toBe(observation.id);
    expect(interpretation.evidenceClaimId).toBe(claim.id);

    const reloadedEvidence = await prisma.evidence.findUniqueOrThrow({ where: { id: evidence.id } });
    expect(reloadedEvidence.processSensoryObservationId).toBe(observation.id);
  });
});

describe("§5.11 — real A7/F1/S1/R1/RO1 data stays intact", () => {
  // "Real batches missing a terrain lot" is deliberately NOT asserted here
  // as a repeatable count (unlike ro1.test.ts's own suite-wide checks): run
  // concurrently with every other RUN_ID-scoped test file, their own
  // in-flight, not-yet-cleaned-up fixtures (e.g. S1's deliberately-
  // locationless receiving-event lots) make a live "must equal 0" assertion
  // flaky by construction, not a real regression. V1's own verification
  // (docs/implementation/38_V1_VOCABULARIO_LOTE_BATCH.md, its report and
  // README entry) already covers this count via a standalone script run in
  // isolation — the correct way to answer a point-in-time "how many," per
  // this ticket's own §6 instruction to report the number, not assert it
  // as an invariant.
  it("real (non-TEST) Locations, Organizations, and VariableCatalogs are unaffected by this run", async () => {
    const lostOrigin = await prisma.organization.findFirst({ where: { name: "Lost Origin" } });
    expect(lostOrigin).not.toBeNull();

    // A `roastSession.count() > 0` assertion stood here and was removed for the
    // reason given in tests/research/ro1.test.ts §9.15 (ADR-086): the rows it
    // counted were leaked test fixtures, so it never measured real data.
    // `Lost Origin` above and the catalog count below are anchored on records
    // that genuinely exist in production.
    const catalogCount = await prisma.variableCatalog.count();
    expect(catalogCount).toBeGreaterThanOrEqual(20);
  });
});
