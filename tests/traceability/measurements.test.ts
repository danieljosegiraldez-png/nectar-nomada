/**
 * Phase 1, ticket T3 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §34). Real Postgres (Neon), no mocks — same discipline as
 * tests/traceability/lots.test.ts and quantity.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, TraceabilityAccessError } from "../../lib/traceability/lots";
import { correctMeasurement, MeasurementValidationError, recordMeasurement } from "../../lib/traceability/measurements";
import { UnitValidationError } from "../../lib/traceability/units";
import { startFermentationRun } from "../../lib/traceability/fermentation";
import { startDryingRun } from "../../lib/traceability/drying";
import { moveLotToStorage } from "../../lib/traceability/storage";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `t3-${Date.now()}`;


let projectAId: string;
let projectBId: string;
let organizationId: string;
let storageLocationId: string;

let authorizedUserAccountId: string; // Farm Operator, scope: project A
let wrongProjectUserAccountId: string; // Farm Operator, scope: project B

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "en" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

async function assignFarmOperator(userAccountId: string, scope: { scopeType: "project"; scopeRefId: string }) {
  const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scopeRow = await prisma.scope.create({ data: scope });
  await prisma.assignment.create({
    data: { userAccountId, roleProfileId: farmOperatorProfile.id, scopeId: scopeRow.id },
  });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const projectA = await prisma.project.create({
    data: { name: `TEST Project A (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  projectAId = projectA.id;

  const projectB = await prisma.project.create({
    data: { name: `TEST Project B (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  projectBId = projectB.id;

  authorizedUserAccountId = await createTestUserAccount("AuthorizedOperator");
  await assignFarmOperator(authorizedUserAccountId, { scopeType: "project", scopeRefId: projectAId });

  wrongProjectUserAccountId = await createTestUserAccount("WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, { scopeType: "project", scopeRefId: projectBId });

  const storageLocation = await prisma.location.create({
    data: { locationType: "site", name: `TEST Warehouse (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  storageLocationId = storageLocation.id;
});

afterAll(async () => {
  const allTestLots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = allTestLots.map((l) => l.id);

  const fermentationRuns = await prisma.fermentationRun.findMany({ where: { transformations: { some: { inputs: { some: { lotId: { in: lotIds } } } } } } });
  const fermentationRunIds = fermentationRuns.map((r) => r.id);
  const dryingRuns = await prisma.dryingRun.findMany({ where: { transformations: { some: { inputs: { some: { lotId: { in: lotIds } } } } } } });
  const dryingRunIds = dryingRuns.map((r) => r.id);

  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ fermentationRunId: { in: fermentationRunIds } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ dryingRunId: { in: dryingRunIds } }) });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: fermentationRunIds } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: dryingRunIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });

  await prisma.assignment.deleteMany({
    where: assertDefinedWhere({ userAccountId: { in: [authorizedUserAccountId, wrongProjectUserAccountId] } }),
  });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }] }) });
  await prisma.userAccount.deleteMany({
    where: assertDefinedWhere({ id: { in: [authorizedUserAccountId, wrongProjectUserAccountId] } }),
  });
  await prisma.organizationMembership.deleteMany({
    where: assertDefinedWhere({ person: { displayName: { contains: RUN_ID } } }),
  });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: storageLocationId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("recordMeasurement — RBAC, validation, unit conversion", () => {
  it("allows a project-scoped Farm Operator to record a measurement on a lot in their project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-rbac-ok`,
      lotType: "cherry",
      organizationId,
      projectId: projectAId,
    });
    const measurement = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      variable: "brix",
      value: 22,
      unit: "Bx",
      occurredAt: new Date(),
      lotId: lot.id,
    });
    expect(measurement.value.toNumber()).toBe(22);
    expect(measurement.unit).toBe("Bx");
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-rbac-cross-project`,
      lotType: "cherry",
      organizationId,
      projectId: projectAId,
    });
    await expect(
      recordMeasurement(wrongProjectUserAccountId, {
        provenanceClass: "measured_fact",
        variable: "brix",
        value: 22,
        unit: "Bx",
        occurredAt: new Date(),
        lotId: lot.id,
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("requires at least one subject (lotId or sampleId)", async () => {
    await expect(
      recordMeasurement(authorizedUserAccountId, {
        provenanceClass: "measured_fact",
        variable: "brix",
        value: 22,
        unit: "Bx",
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(MeasurementValidationError);
  });

  it("normalizes a Fahrenheit temperature entry to the canonical Celsius value before storing", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-fahrenheit`,
      lotType: "processing",
      organizationId,
      projectId: projectAId,
    });
    const measurement = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      variable: "temperature",
      value: 98.6,
      unit: "F",
      occurredAt: new Date(),
      lotId: lot.id,
    });
    expect(measurement.unit).toBe("C");
    expect(measurement.value.toNumber()).toBeCloseTo(37, 5);
  });

  it("rejects an out-of-range value via the unit registry", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-out-of-range`,
      lotType: "processing",
      organizationId,
      projectId: projectAId,
    });
    await expect(
      recordMeasurement(authorizedUserAccountId, {
        provenanceClass: "measured_fact",
        variable: "ph",
        value: 20,
        unit: "pH",
        occurredAt: new Date(),
        lotId: lot.id,
      }),
    ).rejects.toThrow(UnitValidationError);
  });
});

describe("correctMeasurement — append-only correction chain", () => {
  it("writes a new row pointing at the original via correctsId, leaving the original untouched", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-correction`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });
    const original = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      variable: "moisture",
      value: 12,
      unit: "%",
      occurredAt: new Date("2026-01-01"),
      lotId: lot.id,
    });

    const correction = await correctMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      measurementId: original.id,
      value: 11.5,
      unit: "%",
      occurredAt: new Date("2026-01-01T01:00:00Z"),
      reason: "Scale was not tared before the original reading.",
    });

    expect(correction.correctsId).toBe(original.id);
    expect(correction.value.toNumber()).toBe(11.5);

    const originalReloaded = await prisma.measurement.findUniqueOrThrow({ where: { id: original.id } });
    expect(originalReloaded.value.toNumber()).toBe(12);
    expect(originalReloaded.correctsId).toBeNull();
  });

  it("no deja corregir dos veces la misma lectura: se corrige la vigente", async () => {
    // Dos correcciones de la misma original no se ordenan entre sí —ninguna
    // supersede a la otra— y dejarían dos valores compitiendo por ser el bueno,
    // que es lo que `correctsId` existe para evitar. Quien quiera enmendar una
    // corrección, corrige la corrección.
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-doble-correccion`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });
    const original = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      variable: "moisture",
      value: 12,
      unit: "%",
      occurredAt: new Date("2026-01-01"),
      lotId: lot.id,
    });
    const primera = await correctMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      measurementId: original.id,
      value: 11.5,
      unit: "%",
      occurredAt: new Date("2026-01-01T01:00:00Z"),
      reason: "La báscula no estaba tarada.",
    });

    await expect(
      correctMeasurement(authorizedUserAccountId, {
        provenanceClass: "measured_fact",
        measurementId: original.id,
        value: 10,
        unit: "%",
        occurredAt: new Date("2026-01-01T02:00:00Z"),
        reason: "Segundo intento sobre la misma original.",
      }),
    ).rejects.toThrow("measurement_already_corrected");

    // Y la cadena sí sigue: corregir la CORRECCIÓN es legítimo.
    const segunda = await correctMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      measurementId: primera.id,
      value: 11.2,
      unit: "%",
      occurredAt: new Date("2026-01-01T03:00:00Z"),
      reason: "Relectura con el instrumento calibrado.",
    });
    expect(segunda.correctsId).toBe(primera.id);
  });

  it("requires a non-empty reason", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-correction-no-reason`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });
    const original = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      variable: "moisture",
      value: 12,
      unit: "%",
      occurredAt: new Date(),
      lotId: lot.id,
    });

    await expect(
      correctMeasurement(authorizedUserAccountId, {
        provenanceClass: "measured_fact",
        measurementId: original.id,
        value: 11.5,
        unit: "%",
        occurredAt: new Date(),
        reason: "   ",
      }),
    ).rejects.toThrow(MeasurementValidationError);
  });
});

// T9.5 — the retrofit's two required tests: no silent direct_observation,
// and operatorPersonId genuinely independent of createdBy.
describe("T9.5 — provenance is chosen, never defaulted; observer independent of creator", () => {
  it("persists exactly the provenanceClass the caller chose, never a silent direct_observation", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-provenance-explicit`,
      lotType: "processing",
      organizationId,
      projectId: projectAId,
    });

    const labResult = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "scientific_evidence",
      variable: "ph",
      value: 4.2,
      unit: "pH",
      occurredAt: new Date(),
      lotId: lot.id,
    });
    expect(labResult.provenanceClass).toBe("scientific_evidence");

    const estimate = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "interpretation",
      variable: "moisture",
      value: 11,
      unit: "%",
      occurredAt: new Date(),
      lotId: lot.id,
    });
    expect(estimate.provenanceClass).toBe("interpretation");
    // Neither call named "direct_observation" and neither row landed there —
    // T1-T9's silent `?? "direct_observation"` fallback is gone; there is no
    // longer a code path that can produce that value except a caller asking
    // for it by name.
    expect(labResult.provenanceClass).not.toBe("direct_observation");
    expect(estimate.provenanceClass).not.toBe("direct_observation");
  });

  it("allows operatorPersonId (who observed) to differ from createdBy (who typed it in)", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-observer-divergence`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });

    // The field technician who actually took the reading at the drying
    // beds — a real Person, deliberately with no UserAccount of their own,
    // since this scenario is exactly "someone who isn't logged into the
    // platform did the observing."
    const fieldTechnician = await prisma.person.create({
      data: { givenName: "TEST", familyName: "FieldTechnician", displayName: `TEST FieldTechnician (${RUN_ID})`, locale: "es" },
    });
    await prisma.organizationMembership.create({ data: { personId: fieldTechnician.id, organizationId } });

    const measurement = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      variable: "moisture",
      value: 10.5,
      unit: "%",
      occurredAt: new Date(),
      lotId: lot.id,
      operatorPersonId: fieldTechnician.id,
    });

    const recordingUserAccount = await prisma.userAccount.findUniqueOrThrow({ where: { id: authorizedUserAccountId } });

    expect(measurement.operatorPersonId).toBe(fieldTechnician.id);
    expect(measurement.createdBy).toBe(authorizedUserAccountId);
    // The case T9.5 exists to make reachable: the person who observed and
    // the account that recorded it are two different people on one row.
    expect(measurement.operatorPersonId).not.toBe(recordingUserAccount.personId);
  });
});

// Pre-existing gap fix: FermentationRun/DryingRun/StorageAssignment have
// been real FKs on Measurement since T6/T7/T8, but recordMeasurement never
// accepted or set them until now — same "additional link alongside lotId"
// pattern as R1's roastSessionId.
describe("recordMeasurement — fermentationRunId/dryingRunId/storageAssignmentId links", () => {
  it("sets fermentationRunId alongside lotId and reads it back", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-fermentation-link`,
      lotType: "processing",
      organizationId,
      projectId: projectAId,
    });
    const { run } = await startFermentationRun(authorizedUserAccountId, {
      provenanceClass: "original_record",
      lotId: lot.id,
      startedAt: new Date("2026-01-02"),
      inoculated: false,
    });

    const measurement = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      variable: "temperature",
      value: 25,
      unit: "C",
      occurredAt: new Date("2026-01-02T12:00:00Z"),
      lotId: lot.id,
      fermentationRunId: run.id,
    });

    expect(measurement.fermentationRunId).toBe(run.id);
    const reloaded = await prisma.measurement.findUniqueOrThrow({ where: { id: measurement.id } });
    expect(reloaded.fermentationRunId).toBe(run.id);
    expect(reloaded.lotId).toBe(lot.id);
  });

  it("rejects fermentationRunId without lotId", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-fermentation-link-no-lot`,
      lotType: "processing",
      organizationId,
      projectId: projectAId,
    });
    const { run } = await startFermentationRun(authorizedUserAccountId, {
      provenanceClass: "original_record",
      lotId: lot.id,
      startedAt: new Date("2026-01-02"),
      inoculated: false,
    });

    await expect(
      recordMeasurement(authorizedUserAccountId, {
        provenanceClass: "measured_fact",
        variable: "temperature",
        value: 25,
        unit: "C",
        occurredAt: new Date(),
        fermentationRunId: run.id,
      }),
    ).rejects.toThrow(MeasurementValidationError);
  });

  it("sets dryingRunId alongside lotId and reads it back", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-drying-link`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });
    const { run } = await startDryingRun(authorizedUserAccountId, {
      provenanceClass: "original_record",
      lotId: lot.id,
      startedAt: new Date("2026-01-05"),
    });

    const measurement = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      variable: "moisture",
      value: 11.5,
      unit: "%",
      occurredAt: new Date("2026-01-05T12:00:00Z"),
      lotId: lot.id,
      dryingRunId: run.id,
    });

    expect(measurement.dryingRunId).toBe(run.id);
    const reloaded = await prisma.measurement.findUniqueOrThrow({ where: { id: measurement.id } });
    expect(reloaded.dryingRunId).toBe(run.id);
    expect(reloaded.lotId).toBe(lot.id);
  });

  it("rejects dryingRunId without lotId", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-drying-link-no-lot`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });
    const { run } = await startDryingRun(authorizedUserAccountId, {
      provenanceClass: "original_record",
      lotId: lot.id,
      startedAt: new Date("2026-01-05"),
    });

    await expect(
      recordMeasurement(authorizedUserAccountId, {
        provenanceClass: "measured_fact",
        variable: "moisture",
        value: 11.5,
        unit: "%",
        occurredAt: new Date(),
        dryingRunId: run.id,
      }),
    ).rejects.toThrow(MeasurementValidationError);
  });

  it("sets storageAssignmentId alongside lotId and reads it back", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-storage-link`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });
    const assignment = await moveLotToStorage(authorizedUserAccountId, {
      lotId: lot.id,
      locationId: storageLocationId,
      startedAt: new Date("2026-01-10"),
    });

    const measurement = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      variable: "relative_humidity",
      value: 60,
      unit: "%",
      occurredAt: new Date("2026-01-10T12:00:00Z"),
      lotId: lot.id,
      storageAssignmentId: assignment.id,
    });

    expect(measurement.storageAssignmentId).toBe(assignment.id);
    const reloaded = await prisma.measurement.findUniqueOrThrow({ where: { id: measurement.id } });
    expect(reloaded.storageAssignmentId).toBe(assignment.id);
    expect(reloaded.lotId).toBe(lot.id);
  });

  it("rejects storageAssignmentId without lotId", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-storage-link-no-lot`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });
    const assignment = await moveLotToStorage(authorizedUserAccountId, {
      lotId: lot.id,
      locationId: storageLocationId,
      startedAt: new Date("2026-01-10"),
    });

    await expect(
      recordMeasurement(authorizedUserAccountId, {
        provenanceClass: "measured_fact",
        variable: "relative_humidity",
        value: 60,
        unit: "%",
        occurredAt: new Date(),
        storageAssignmentId: assignment.id,
      }),
    ).rejects.toThrow(MeasurementValidationError);
  });
});

/**
 * La decisión de Daniel del 2026-09-15 sobre el café verde en una cama de secado:
 * **avisa y deja pasar**, como todo lo demás.
 *
 * El diseño llegó a proponer aquí la única puerta dura del plan —rechazar por
 * disparador, porque medir verde en secado es un imposible físico— y él la cerró
 * al revés. La razón vale más que el caso: la doctrina de «avisa, no descalifica»
 * NO admite excepciones por evidente que parezca, porque la puerta que se esquiva
 * enseña a esquivar todas. Es la misma lógica que ya está escrita en el esquema
 * para los instrumentos vencidos: *«bloquear se esquiva en el patio —el operario
 * apunta el número en papel— y entonces el sistema sabe MENOS»*.
 *
 * Y comprobar esto importa por una razón medible: hasta hoy
 * `measurement_review_flag` existía desde el 2026-09-14 y **no tenía un solo
 * escritor en el código** — cero coincidencias en `lib/` y `app/`, con control
 * positivo. Una tabla que nadie escribe es una promesa, no un mecanismo.
 */
describe("el verde en una cama de secado avisa, y NO impide guardar", () => {
  async function medirEnSecado(materialState: "GREEN" | "PARCHMENT", sufijo: string) {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-marca-${sufijo}`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });
    const { run } = await startDryingRun(authorizedUserAccountId, {
      provenanceClass: "original_record",
      lotId: lot.id,
      startedAt: new Date("2026-03-01"),
    });
    const medicion = await recordMeasurement(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      variable: "moisture",
      value: 11,
      unit: "%",
      occurredAt: new Date("2026-03-05T12:00:00Z"),
      lotId: lot.id,
      dryingRunId: run.id,
      materialState,
    });
    return { lot, medicion };
  }

  /** La muestra que `recordMeasurement` crea al recibir un material bloquearía el
   *  borrado del lote en el `afterAll`, así que se limpia aquí. Va en `finally`
   *  para que corra aunque una aserción falle: la base es COMPARTIDA. */
  async function limpiar(lotId: string) {
    await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId }) });
    await prisma.sample.deleteMany({ where: assertDefinedWhere({ sourceLotId: lotId }) });
  }

  it("guarda la medición Y la marca con el motivo del desajuste de etapa", async () => {
    const { lot, medicion } = await medirEnSecado("GREEN", "verde");
    try {
      // Entró: eso es la mitad «deja pasar» de la decisión.
      expect(medicion.id).toBeTruthy();
      const guardada = await prisma.measurement.findUniqueOrThrow({ where: { id: medicion.id } });
      expect(Number(guardada.value)).toBe(11);

      // Y quedó señalada: la mitad «avisa».
      const marcas = await prisma.measurementReviewFlag.findMany({
        where: assertDefinedWhere({ measurementId: medicion.id }),
      });
      expect(marcas.map((m) => m.reason)).toContain("material_stage_mismatch");
      // Sin `InstrumentCheck` detrás — ésa es justo la razón por la que
      // `raisedByCheckId` tuvo que hacerse anulable: un desajuste de etapa no
      // tiene ninguna verificación de instrumento que lo levante.
      expect(marcas.find((m) => m.reason === "material_stage_mismatch")?.raisedByCheckId).toBeNull();
    } finally {
      await limpiar(lot.id);
    }
  });

  it("y el pergamino en secado entra SIN marca — el control positivo", async () => {
    // Sin esta mitad, un `recordMeasurement` que marcara TODA medición pasaría la
    // prueba de arriba igual de verde.
    const { lot, medicion } = await medirEnSecado("PARCHMENT", "pergamino");
    try {
      expect(medicion.id).toBeTruthy();
      const marcas = await prisma.measurementReviewFlag.count({
        where: assertDefinedWhere({ measurementId: medicion.id }),
      });
      expect(marcas).toBe(0);
    } finally {
      await limpiar(lot.id);
    }
  });
});
