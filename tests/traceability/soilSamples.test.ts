/**
 * S1 (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2, semanas 6–10). La
 * muestra de suelo y la foliar, y sus resultados como `Measurement`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { LocationAccessError } from "../../lib/traceability/locations";
import {
  camposDeProtocoloQueFaltan,
  createFoliarSample,
  createSoilSample,
  listSamplesForLocation,
  SampleValidationError,
} from "../../lib/traceability/soilSamples";
import {
  correctMeasurement,
  MeasurementValidationError,
  recordMeasurement,
} from "../../lib/traceability/measurements";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `muestras-${Date.now()}`;

let organizationId: string;
let locationId: string;
let otherLocationId: string;
let authorizedUserAccountId: string;
let wrongLocationUserAccountId: string;
let soilSampleId: string;
let foliarSampleId: string;
let medicionId: string;

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

async function assignFarmOperator(userAccountId: string, locationRefId: string) {
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationRefId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const plot = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Lote muestras (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = plot.id;
  const other = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Otro lote (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  otherLocationId = other.id;

  authorizedUserAccountId = await createTestUserAccount("MuestrasOperator");
  await assignFarmOperator(authorizedUserAccountId, locationId);
  wrongLocationUserAccountId = await createTestUserAccount("MuestrasWrongPlot");
  await assignFarmOperator(wrongLocationUserAccountId, otherLocationId);
});

afterAll(async () => {
  const suelos = await prisma.soilSample.findMany({
    where: assertDefinedWhere({ locationId: { in: [locationId, otherLocationId] } }),
    select: { id: true },
  });
  const foliares = await prisma.foliarSample.findMany({
    where: assertDefinedWhere({ locationId: { in: [locationId, otherLocationId] } }),
    select: { id: true },
  });
  // Las correcciones apuntan a su original con `correctsId`, así que se borran
  // primero las que corrigen y después las corregidas.
  await prisma.measurement.deleteMany({
    where: assertDefinedWhere({
      OR: [
        { soilSampleId: { in: suelos.map((s) => s.id) } },
        { foliarSampleId: { in: foliares.map((f) => f.id) } },
      ],
      NOT: { correctsId: null },
    }),
  });
  await prisma.measurement.deleteMany({
    where: assertDefinedWhere({
      OR: [
        { soilSampleId: { in: suelos.map((s) => s.id) } },
        { foliarSampleId: { in: foliares.map((f) => f.id) } },
      ],
    }),
  });
  await prisma.soilSample.deleteMany({ where: assertDefinedWhere({ locationId: { in: [locationId, otherLocationId] } }) });
  await prisma.foliarSample.deleteMany({ where: assertDefinedWhere({ locationId: { in: [locationId, otherLocationId] } }) });

  const userAccountIds = [authorizedUserAccountId, wrongLocationUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [locationId, otherLocationId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [locationId, otherLocationId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("createSoilSample", () => {
  it("rechaza a quien no alcanza el bloque", async () => {
    await expect(
      createSoilSample(wrongLocationUserAccountId, {
        locationId,
        sampleCode: "SS-001",
        sampledAt: new Date("2026-05-02T00:00:00Z"),
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("rechaza una banda de profundidad al revés", async () => {
    await expect(
      createSoilSample(authorizedUserAccountId, {
        locationId,
        sampleCode: "SS-mala",
        sampledAt: new Date("2026-05-02T00:00:00Z"),
        provenanceClass: "original_record",
        depthTopCm: 40,
        depthBottomCm: 20,
      }),
    ).rejects.toThrow(SampleValidationError);
  });

  it("rechaza un compuesto de cero submuestras", async () => {
    // Cero submuestras no es un compuesto pobre: es un error de tecleo.
    await expect(
      createSoilSample(authorizedUserAccountId, {
        locationId,
        sampleCode: "SS-cero",
        sampledAt: new Date("2026-05-02T00:00:00Z"),
        provenanceClass: "original_record",
        subSampleCount: 0,
      }),
    ).rejects.toThrow(SampleValidationError);
  });

  it("acepta un compuesto de 8 submuestras aunque el marco pida 10–15", async () => {
    // Un compuesto de 8 es un compuesto peor, no un dato falso. Rechazarlo
    // obligaría a mentir en la casilla.
    const m = await createSoilSample(authorizedUserAccountId, {
      locationId,
      sampleCode: "SS-008",
      sampledAt: new Date("2026-05-02T00:00:00Z"),
      provenanceClass: "original_record",
      subSampleCount: 8,
    });
    expect(m.subSampleCount).toBe(8);
  });

  it("registra la muestra completa del Paso 6 — el camino bueno", async () => {
    const m = await createSoilSample(authorizedUserAccountId, {
      locationId,
      sampleCode: "  LN-SS-2026-001  ",
      sampledAt: new Date("2026-05-02T00:00:00Z"),
      provenanceClass: "original_record",
      treatmentPlotLabel: "T0-rep1",
      samplingPointLabel: "Punto A, estaca amarilla",
      depthTopCm: 0,
      depthBottomCm: 20,
      subSampleCount: 12,
      laboratory: "IDIAP Clayton",
      extractionMethod: "Mehlich-3",
      dataQuality: "provisional",
    });
    soilSampleId = m.id;
    expect(m.sampleCode).toBe("LN-SS-2026-001");
    expect(m.extractionMethod).toBe("Mehlich-3");
    expect(m.subSampleCount).toBe(12);
  });

  it("dos muestras del mismo bloque no comparten código", async () => {
    await expect(
      createSoilSample(authorizedUserAccountId, {
        locationId,
        sampleCode: "LN-SS-2026-001",
        sampledAt: new Date("2026-05-03T00:00:00Z"),
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow();
  });
});

describe("createFoliarSample", () => {
  it("rechaza a quien no alcanza el bloque", async () => {
    await expect(
      createFoliarSample(wrongLocationUserAccountId, {
        locationId,
        sampleCode: "FS-001",
        sampledAt: new Date("2026-05-02T00:00:00Z"),
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("rechaza un par de hojas cero", async () => {
    await expect(
      createFoliarSample(authorizedUserAccountId, {
        locationId,
        sampleCode: "FS-cero",
        sampledAt: new Date("2026-05-02T00:00:00Z"),
        provenanceClass: "original_record",
        leafPairPosition: 0,
      }),
    ).rejects.toThrow(SampleValidationError);
  });

  it("registra la muestra con su protocolo completo", async () => {
    const m = await createFoliarSample(authorizedUserAccountId, {
      locationId,
      sampleCode: "LN-FS-2026-001",
      sampledAt: new Date("2026-05-02T00:00:00Z"),
      provenanceClass: "original_record",
      leafPairPosition: 3,
      canopyPosition: "middle",
      treeAgeYears: 6,
      cultivar: "Catuaí",
      phenologicalStage: "Prefloración",
      branchBearingFruit: true,
      laboratory: "IDIAP Clayton",
    });
    foliarSampleId = m.id;
    expect(m.canopyPosition).toBe("middle");
    expect(m.branchBearingFruit).toBe(true);
    expect(camposDeProtocoloQueFaltan(m)).toEqual([]);
  });

  it("acepta una muestra sin protocolo, y dice qué le falta", async () => {
    // §7.1: un análisis foliar sin protocolo es INCOMPARABLE, no inválido.
    // Rechazarlo perdería el dato; callarlo lo haría parecer bueno.
    const m = await createFoliarSample(authorizedUserAccountId, {
      locationId,
      sampleCode: "LN-FS-2026-002",
      sampledAt: new Date("2026-05-02T00:00:00Z"),
      provenanceClass: "original_record",
      leafPairPosition: 3,
    });
    expect(camposDeProtocoloQueFaltan(m)).toEqual([
      "canopyPosition",
      "phenologicalStage",
      "branchBearingFruit",
    ]);
  });

  it("«no llevaba fruto» y «no se registró» no son lo mismo", () => {
    const base = { leafPairPosition: 3, canopyPosition: "upper" as const, phenologicalStage: "Prefloración" };
    expect(camposDeProtocoloQueFaltan({ ...base, branchBearingFruit: false })).toEqual([]);
    expect(camposDeProtocoloQueFaltan({ ...base, branchBearingFruit: null })).toEqual(["branchBearingFruit"]);
  });
});

describe("Measurement sobre muestras de suelo y foliares", () => {
  it("rechaza a quien no alcanza el bloque de la muestra", async () => {
    await expect(
      recordMeasurement(wrongLocationUserAccountId, {
        soilSampleId,
        variable: "exchangeable_aluminium",
        value: 1.2,
        unit: "cmol/kg",
        occurredAt: new Date("2026-06-01T00:00:00Z"),
        provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow();
  });

  it("el sujeto es exclusivo también entre dos que no son café", async () => {
    // Una lectura no es a la vez de una muestra de suelo y de una foliar. Con
    // un solo sujeto no-café esto no se podía probar; con tres, sí.
    await expect(
      recordMeasurement(authorizedUserAccountId, {
        soilSampleId,
        foliarSampleId,
        variable: "phosphorus",
        value: 12,
        unit: "mg/kg",
        occurredAt: new Date("2026-06-01T00:00:00Z"),
        provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow(MeasurementValidationError);
  });

  it("registra aluminio intercambiable en cmol/kg", async () => {
    const m = await recordMeasurement(authorizedUserAccountId, {
      soilSampleId,
      variable: "exchangeable_aluminium",
      value: 1.2,
      unit: "cmol/kg",
      occurredAt: new Date("2026-06-01T00:00:00Z"),
      provenanceClass: "measured_fact",
      sourceReference: "IDIAP informe 2026-0518",
    });
    medicionId = m.id;
    expect(m.soilSampleId).toBe(soilSampleId);
    expect(m.lotId).toBeNull();
    expect(Number(m.value)).toBe(1.2);
  });

  it("meq/100 g es la misma unidad que cmol/kg, no una conversión", async () => {
    const m = await recordMeasurement(authorizedUserAccountId, {
      soilSampleId,
      variable: "effective_cec",
      value: 8.5,
      unit: "meq/100g",
      occurredAt: new Date("2026-06-01T00:00:00Z"),
      provenanceClass: "measured_fact",
    });
    expect(Number(m.value)).toBe(8.5);
    expect(m.unit).toBe("cmol/kg");
  });

  it("el análisis foliar entra en g/kg y se guarda en la unidad canónica", async () => {
    // §7.2 da los rangos de suficiencia en g/kg. 24,4 g/kg de potasio son
    // 24.400 mg/kg — la conversión que si no hace el sistema se hace a mano.
    const m = await recordMeasurement(authorizedUserAccountId, {
      foliarSampleId,
      variable: "potassium",
      value: 24.4,
      unit: "g/kg",
      occurredAt: new Date("2026-06-01T00:00:00Z"),
      provenanceClass: "measured_fact",
    });
    expect(Number(m.value)).toBe(24400);
    expect(m.unit).toBe("mg/kg");
    expect(m.foliarSampleId).toBe(foliarSampleId);
  });

  it("la corrección conserva el sujeto de suelo", async () => {
    const c = await correctMeasurement(authorizedUserAccountId, {
      measurementId: medicionId,
      value: 1.4,
      unit: "cmol/kg",
      occurredAt: new Date("2026-06-01T00:00:00Z"),
      reason: "El informe decía 1,4",
      provenanceClass: "measured_fact",
    });
    expect(c.soilSampleId).toBe(soilSampleId);
    const original = await prisma.measurement.findUnique({ where: { id: medicionId } });
    expect(Number(original?.value)).toBe(1.2);
  });
});

describe("listSamplesForLocation", () => {
  it("rechaza un bloque ajeno", async () => {
    await expect(listSamplesForLocation(wrongLocationUserAccountId, locationId)).rejects.toThrow(
      LocationAccessError,
    );
  });

  it("devuelve las dos clases de muestra con sus resultados", async () => {
    const { soil, foliar } = await listSamplesForLocation(authorizedUserAccountId, locationId);
    expect(soil.length).toBeGreaterThanOrEqual(2);
    expect(foliar.length).toBeGreaterThanOrEqual(2);
    const conResultados = soil.find((s) => s.id === soilSampleId);
    // Tres: el aluminio, la CIC efectiva y la corrección del aluminio. La
    // original NO se esconde: corregir no reescribe.
    expect(conResultados?.measurements.length).toBe(3);
  });
});
