/**
 * Phase 1, ticket T5 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §34). Real Postgres (Neon), no mocks — same discipline as the other
 * tests/traceability/*.test.ts files. DoD: "Sample correctly links back to
 * its source Lot."
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, TraceabilityAccessError } from "../../lib/traceability/lots";
import { computeCurrentQuantity, recordQuantityEvent } from "../../lib/traceability/quantity";
import { createSampleFromLot, retirarMuestra, SampleValidationError } from "../../lib/traceability/samples";
import { startDryingRun, endDryingRun } from "../../lib/traceability/drying";
import { recordRoastSession } from "../../lib/traceability/roasting";
import { cerrarProceso } from "../../lib/traceability/lotProcess";
import { registrarTrilla } from "../../lib/traceability/trilla";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `t5-${Date.now()}`;

let organizationId: string;

let projectAId: string;
let projectBId: string;

let authorizedUserAccountId: string; // Farm Operator, scope: project A
let wrongProjectUserAccountId: string; // Farm Operator, scope: project B
let unauthorizedUserAccountId: string; // no Assignment at all
let beneficioLocationId: string;

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
  organizationId = await createTestOrganization(RUN_ID);
  const projectA = await prisma.project.create({
    data: { name: `TEST Project A (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectAId = projectA.id;

  const projectB = await prisma.project.create({
    data: { name: `TEST Project B (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectBId = projectB.id;

  authorizedUserAccountId = await createTestUserAccount("AuthorizedOperator");
  await assignFarmOperator(authorizedUserAccountId, { scopeType: "project", scopeRefId: projectAId });

  wrongProjectUserAccountId = await createTestUserAccount("WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, { scopeType: "project", scopeRefId: projectBId });

  unauthorizedUserAccountId = await createTestUserAccount("Unauthorized");

  // La trilla exige un lugar de producción; sólo la usa la prueba del lote verde de abajo.
  beneficioLocationId = (
    await prisma.location.create({
      data: { name: `TEST Beneficio (${RUN_ID})`, locationType: "beneficio", organizationId, classification: "internal" },
    })
  ).id;
});

afterAll(async () => {
  const testLots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = testLots.map((l) => l.id);

  const transformacionesConSecado = await prisma.lotTransformation.findMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] }),
    select: { dryingRunId: true },
  });
  const dryingRunIds = [...new Set(transformacionesConSecado.map((t) => t.dryingRunId).filter((id): id is string => id != null))];

  // El tueste desde muestra (2026-10-04): `roast_session.source_sample_id` es ON DELETE SET NULL, así
  // que borrar la muestra NO falla — deja un tueste huérfano en la base COMPARTIDA, con su actor en
  // blanco. Se borra antes y por la muestra; su lote de salida ya entra por `lotIds`.
  const muestrasDelRun = await prisma.sample.findMany({
    where: assertDefinedWhere({ sampleCode: { startsWith: RUN_ID } }),
    select: { id: true },
  });
  await prisma.roastSession.deleteMany({
    where: assertDefinedWhere({ sourceSampleId: { in: muestrasDelRun.map((m) => m.id) } }),
  });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ sampleCode: { startsWith: RUN_ID } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.byproductBatch.deleteMany({
    where: assertDefinedWhere({ transformation: { OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] } }),
  });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] }),
  });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: dryingRunIds } }) });
  // Parte 1, R3: el proceso va antes que sus lotes (`lot_process.lot_id` es RESTRICT).
  await borrarProcesosDeLotesDonde({ id: { in: lotIds } });
  // Parte 1, R7 (tarea 9): las humedades de cierre, DESPUÉS de los procesos que las referencian (RESTRICT) y antes de los lotes.
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });
  if (beneficioLocationId) await prisma.location.deleteMany({ where: assertDefinedWhere({ id: beneficioLocationId }) });

  await prisma.assignment.deleteMany({
    where: assertDefinedWhere({ userAccountId: { in: [authorizedUserAccountId, wrongProjectUserAccountId] } }),
  });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }] }) });
  await prisma.userAccount.deleteMany({
    where: assertDefinedWhere({ id: { in: [authorizedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId] } }),
  });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
  await deleteTestOrganizations(RUN_ID);
});

describe("createSampleFromLot — lineage, RBAC, quantity accounting", () => {
  it("creates a Sample linked back to its source Lot via a sample_extraction transformation", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sample-ok`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });

    const { transformation, sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S001`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      quantity: 1.5,
      unit: "kg",
      occurredAt: new Date(),
    });

    expect(transformation.transformationType).toBe("sample_extraction");
    expect(sample.sourceLotId).toBe(lot.id);
    expect(sample.sourceTransformationId).toBe(transformation.id);
    // Same project/organization/location context as its source lot.
    expect(sample.projectId).toBe(projectAId);

    // The transformation's "output" is the Sample, not a second Lot row.
    const outputs = await prisma.lotTransformationOutput.findMany({ where: { transformationId: transformation.id } });
    expect(outputs).toHaveLength(0);
    const inputs = await prisma.lotTransformationInput.findMany({ where: { transformationId: transformation.id } });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.lotId).toBe(lot.id);
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sample-denied`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });

    await expect(
      createSampleFromLot(wrongProjectUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S002`,
        sampleType: "green_coffee",
        sourceLotId: lot.id,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("denies a user with no Assignment at all (T9 RBAC negative case, §31 — sample:manage's own version of T1's lot:manage test)", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sample-unauthorized`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });

    await expect(
      createSampleFromLot(unauthorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S006`,
        sampleType: "green_coffee",
        sourceLotId: lot.id,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects an unknown source lot", async () => {
    await expect(
      createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S003`,
        sampleType: "green_coffee",
        sourceLotId: "00000000-0000-0000-0000-000000000000",
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("reduces the source lot's current quantity by the sample amount extracted", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sample-quantity`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "received",
      quantity: 100,
      unit: "kg",
      occurredAt: new Date("2026-01-01"),
    });

    await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S004`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      quantity: 1.5,
      unit: "kg",
      occurredAt: new Date("2026-01-02"),
    });

    const quantity = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(quantity.quantity.toNumber()).toBe(98.5);

    const sampleRemovedEvents = await prisma.quantityEvent.findMany({
      where: { lotId: lot.id, eventType: "sample_removed" },
    });
    expect(sampleRemovedEvents).toHaveLength(1);
  });

  it("creates no QuantityEvent when no quantity is given for the sample (missing stays missing)", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-sample-no-quantity`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });

    await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S005`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });

    const events = await prisma.quantityEvent.findMany({ where: { lotId: lot.id } });
    expect(events).toHaveLength(0);
  });
});

describe("createSampleFromLot — la muestra verde de un lote YA verde (2026-09-25)", () => {
  /**
   * Hallazgo de la revisión adversarial: el formulario «Preparar muestra verde» falla SIEMPRE. Pide
   * la fase «reposo», que se calcula desde las corridas de secado del propio lote; un lote verde
   * nace de la trilla y nunca tiene corrida propia. La precondición de la trilla —pergamino o
   * cereza seca, los tipos que sólo salen de un secado terminado— ya garantiza el almacenamiento.
   */
  it("RECHAZA la muestra verde si el pergamino se creó a mano: trillar no demuestra secado", async () => {
    // Hallazgo de Codex sobre la primera versión de este arreglo: la trilla exige pergamino o cereza
    // seca, pero ese TIPO se escribe a mano. Un pergamino inventado, trillado, daba muestra verde.
    const pergamino = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-perg-a-mano`,
      lotType: "parchment",
      organizationId,
      projectId: projectAId,
      locationId: beneficioLocationId,
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact", lotId: pergamino.id, eventType: "received",
      quantity: 100, unit: "kg", occurredAt: new Date("2026-04-01"),
    });
    const { loteVerde } = await registrarTrilla(authorizedUserAccountId, {
      lotePergaminoId: pergamino.id, masaEntradaKg: 100,
      loteVerde: { lotCode: `${RUN_ID}-verde-a-mano`, masaKg: 80 },
      cascarillaKg: 18, mermaKg: 2, producedAtLocationId: beneficioLocationId,
      occurredAt: new Date("2026-04-10"), provenanceClass: "original_record",
    });
    await expect(
      createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S-verde-a-mano`,
        sampleType: "green_coffee",
        materialState: "GREEN",
        sourceLotId: loteVerde.id,
        occurredAt: new Date("2026-04-11"),
      }),
    ).rejects.toThrow(/green_sample_before_reposo/);
  }, 30000);

  it("acepta la muestra verde cuando el SECADO TERMINADO está en la ascendencia", async () => {
    // El camino real: se seca, el secado produce el pergamino, se trilla, y de ese verde sí.
    const enSecado = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-secando-real`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
      locationId: beneficioLocationId,
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact", lotId: enSecado.id, eventType: "received",
      quantity: 100, unit: "kg", occurredAt: new Date("2026-04-01"),
    });
    const proceso = await abrirProcesoDePrueba(authorizedUserAccountId, enSecado.id);
    const { run } = await startDryingRun(authorizedUserAccountId, {
      lotId: enSecado.id, startedAt: new Date("2026-04-02"), provenanceClass: "original_record",
    });
    await endDryingRun(authorizedUserAccountId, {
      dryingRunId: run.id,
      endedAt: new Date("2026-04-09"),
      endedOutcome: "target_reached",
      outputLotCode: `${RUN_ID}-perg-real`,
      outputLotType: "parchment",
      provenanceClass: "original_record",
    });
    const pergamino = await prisma.lot.findFirstOrThrow({ where: { lotCode: `${RUN_ID}-perg-real` } });
    // Parte 1, R7: con proceso, la muestra verde exige el proceso cerrado por humedad.
    const humedadDeCierre = await prisma.measurement.create({ data: {
      variable: "moisture", value: 11, unit: "%", occurredAt: new Date("2026-04-09T12:00:00Z"),
      lotId: pergamino.id, provenanceClass: "measured_fact",
    } });
    await cerrarProceso(authorizedUserAccountId, { lotProcessId: proceso.id, endedAt: new Date("2026-04-09T12:00:00Z"), closingMoistureMeasurementId: humedadDeCierre.id });
    const { loteVerde } = await registrarTrilla(authorizedUserAccountId, {
      lotePergaminoId: pergamino.id, masaEntradaKg: 80,
      loteVerde: { lotCode: `${RUN_ID}-verde-real`, masaKg: 64 },
      cascarillaKg: 14, mermaKg: 2, producedAtLocationId: beneficioLocationId,
      occurredAt: new Date("2026-04-10"), provenanceClass: "original_record",
    });
    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-verde-real`,
      sampleType: "green_coffee",
      materialState: "GREEN",
      sourceLotId: loteVerde.id,
      quantity: 0.3,
      unit: "kg",
      occurredAt: new Date("2026-04-11"),
    });
    expect(sample.materialState).toBe("GREEN");
  }, 40000);
});

describe("createSampleFromLot — la cantidad no puede inventar ni gastar de más (2026-09-25)", () => {
  /**
   * Hallazgo de la revisión adversarial del 2026-09-25: `createSampleFromLot` escribía el evento
   * `sample_removed` sin mirar el saldo, mientras `applyInputDecrements` sí lo exige para toda
   * transformación parcial. Se podía sacar más de lo que hay. La cantidad negativa ya la rechazaba
   * la base —`CHECK (quantity >= 0)` desde agosto—, con un error opaco; lo que aporta el guardia ahí
   * es una frase legible, no cerrar un agujero (corrección de Codex, 2026-09-25).
   */
  async function loteCon(kg: number, sufijo: string) {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-saldo-${sufijo}`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "received",
      quantity: kg,
      unit: "kg",
      occurredAt: new Date("2026-01-01"),
    });
    return lot;
  }

  it("rechaza una cantidad negativa, que restada al saldo lo aumentaría", async () => {
    const lot = await loteCon(10, "negativa");
    await expect(
      createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S-neg`,
        sampleType: "green_coffee",
        sourceLotId: lot.id,
        quantity: -5,
        unit: "kg",
        occurredAt: new Date("2026-01-02"),
      }),
    ).rejects.toThrow(/sample_quantity_must_be_positive/);
    // Control: el saldo quedó intacto, no aumentado.
    const q = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(q.quantity.toNumber()).toBe(10);
  });

  it("rechaza sacar más de lo disponible", async () => {
    const lot = await loteCon(10, "excede");
    await expect(
      createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S-exc`,
        sampleType: "green_coffee",
        sourceLotId: lot.id,
        quantity: 25,
        unit: "kg",
        occurredAt: new Date("2026-01-02"),
      }),
    ).rejects.toThrow(/sample_exceeds_available/);
    const q = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(q.quantity.toNumber()).toBe(10);
  });

  it("rechaza una unidad distinta a la del libro del lote", async () => {
    const lot = await loteCon(10, "unidad");
    await expect(
      createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S-uni`,
        sampleType: "green_coffee",
        sourceLotId: lot.id,
        quantity: 1,
        unit: "g",
        occurredAt: new Date("2026-01-02"),
      }),
    ).rejects.toThrow(/sample_mixed_units/);
  });

  it("tres decimales exactos SÍ entran: la comprobación pregunta al decimal, no a la coma flotante", async () => {
    // Codex ejecutó mi primera versión: `65536.001` se rechazaba por un residuo de 7,45e-9.
    const lot = await loteCon(10, "tresdec");
    await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-tresdec`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      quantity: 1.001,
      unit: "kg",
      occurredAt: new Date("2026-01-02"),
    });
    const q = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(q.quantity.toNumber()).toBe(8.999);
  });

  it("control positivo: lo que cabe en el saldo sí entra, y el saldo baja", async () => {
    const lot = await loteCon(10, "cabe");
    await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-cabe`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      quantity: 2,
      unit: "kg",
      occurredAt: new Date("2026-01-02"),
    });
    const q = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(q.quantity.toNumber()).toBe(8);
  });

  it("sin libro, DOS muestras con cantidad entran las dos y no se inventa un saldo negativo", async () => {
    // Hallazgo 1 de Codex sobre el primer arreglo: escribir el asiento sobre un lote sin libro
    // convertía «nunca se pesó» en «pesado y en negativo», y la segunda muestra legítima quedaba
    // rechazada. `applyInputDecrements` omite el asiento en ese caso; aquí se hace igual.
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-saldo-sin-libro-dos`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });
    for (const n of [1, 2]) {
      await createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S-sinlibro-${n}`,
        sampleType: "green_coffee",
        sourceLotId: lot.id,
        quantity: 2,
        unit: "kg",
        occurredAt: new Date("2026-01-0" + n),
      });
    }
    const q = await computeCurrentQuantity(authorizedUserAccountId, lot.id);
    expect(q.recorded).toBe(false);
    const eventos = await prisma.quantityEvent.findMany({ where: { lotId: lot.id } });
    expect(eventos).toHaveLength(0);
    // Y lo declarado no se pierde: vive en la entrada de la transformación.
    const entradas = await prisma.lotTransformationInput.findMany({ where: { lotId: lot.id } });
    expect(entradas.map((e) => Number(e.quantity))).toEqual([2, 2]);
  });

  it("rechaza una cantidad que la columna redondearía a cero", async () => {
    const lot = await loteCon(10, "precision");
    await expect(
      createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S-prec`,
        sampleType: "green_coffee",
        sourceLotId: lot.id,
        quantity: 0.0004,
        unit: "kg",
        occurredAt: new Date("2026-01-02"),
      }),
    ).rejects.toThrow(/sample_quantity_precision/);
  });

  it("un lote sin libro de cantidades no se puede comparar, y la muestra sin cantidad pasa igual", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-saldo-sin-libro`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });
    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-sin-libro`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      occurredAt: new Date("2026-01-02"),
    });
    expect(sample.id).toBeTruthy();
  });
});

describe("createSampleFromLot — la muestra verde exige almacenamiento (2026-09-18)", () => {
  it("rechaza una muestra verde si el lote nunca terminó de secar", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-verde-sin-secar`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });

    await expect(
      createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S-verde-1`,
        sampleType: "green_coffee",
        materialState: "GREEN",
        sourceLotId: lot.id,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(SampleValidationError);
  });

  it("rechaza una muestra verde si el secado está en curso", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-verde-secando`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });
    await abrirProcesoDePrueba(authorizedUserAccountId, lot.id);
    await startDryingRun(authorizedUserAccountId, {
      lotId: lot.id,
      startedAt: new Date(),
      provenanceClass: "original_record",
    });

    await expect(
      createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S-verde-2`,
        sampleType: "green_coffee",
        materialState: "GREEN",
        sourceLotId: lot.id,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(SampleValidationError);
  });

  it("acepta una muestra verde cuando el secado terminó con humedad objetivo", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-verde-reposo`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });
    const proceso = await abrirProcesoDePrueba(authorizedUserAccountId, lot.id);
    const { run } = await startDryingRun(authorizedUserAccountId, {
      lotId: lot.id,
      startedAt: new Date(Date.now() - 86_400_000),
      provenanceClass: "original_record",
    });
    const finDelSecado = new Date();
    const { outputLot } = await endDryingRun(authorizedUserAccountId, {
      dryingRunId: run.id,
      endedAt: finDelSecado,
      endedOutcome: "target_reached",
      outputLotCode: `${RUN_ID}-verde-reposo-salida`,
      outputLotType: "parchment",
      provenanceClass: "original_record",
    });
    // Parte 1, R7: con proceso, la muestra verde exige el proceso cerrado por humedad.
    const cierre = new Date(finDelSecado.getTime() + 60_000);
    const humedadDeCierre = await prisma.measurement.create({ data: {
      variable: "moisture", value: 11, unit: "%", occurredAt: cierre,
      lotId: outputLot.id, provenanceClass: "measured_fact",
    } });
    await cerrarProceso(authorizedUserAccountId, { lotProcessId: proceso.id, endedAt: cierre, closingMoistureMeasurementId: humedadDeCierre.id });

    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-verde-3`,
      sampleType: "green_coffee",
      materialState: "GREEN",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });

    expect(sample.materialState).toBe("GREEN");
  });

  it("control: una muestra de proceso (no verde) NO exige almacenamiento", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-proceso-sin-secar`,
      lotType: "processing",
      organizationId,
      projectId: projectAId,
    });

    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-proceso-1`,
      sampleType: "ph_check",
      materialState: "MUCILAGE_HONEY",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });

    expect(sample.materialState).toBe("MUCILAGE_HONEY");
  });
});

describe("retirarMuestra", () => {
  it("marca retiredAt y escribe su AuditEvent en la misma transacción", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-para-retirar`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });
    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-retiro-1`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });

    const cuando = new Date();
    const retirada = await retirarMuestra(authorizedUserAccountId, sample.id, cuando, "TEST: motivo de prueba");

    expect(retirada.retiredAt?.toISOString()).toBe(cuando.toISOString());

    const evento = await prisma.auditEvent.findFirst({
      where: { entityType: "sample", entityId: sample.id, operation: "sample.retire" },
      orderBy: { occurredAt: "desc" },
    });
    expect(evento?.reason).toBe("TEST: motivo de prueba");
    expect(evento?.actorUserAccountId).toBe(authorizedUserAccountId);
  });

  it("rechaza retirar dos veces la misma muestra", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-doble-retiro`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });
    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-retiro-2`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });
    await retirarMuestra(authorizedUserAccountId, sample.id, new Date(), "TEST: primer retiro");

    await expect(
      retirarMuestra(authorizedUserAccountId, sample.id, new Date(), "TEST: segundo retiro"),
    ).rejects.toThrow(SampleValidationError);
  });

  it("deniega retirar una muestra fuera del ámbito del operador", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-retiro-ajeno`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });
    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-retiro-3`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });

    await expect(
      retirarMuestra(wrongProjectUserAccountId, sample.id, new Date(), "TEST: intento ajeno"),
    ).rejects.toThrow(TraceabilityAccessError);
  });
});

/**
 * El tueste desde muestra, 2026-10-04.
 *
 * El formulario de la muestra YA pregunta cuánto se extrajo —`quantityGrams`, que
 * `createSampleAction` convierte a kg y pasa como `quantity`— y eso se escribía en el libro del
 * lote (`QuantityEvent`) y en el `LotTransformationInput`. Pero el tueste de muestra lee la
 * INSTANTÁNEA de la fila de la muestra (`massAtExtraction` / `massUnitAtExtraction`), que quedaba
 * nula: toda muestra creada por la pantalla fallaba con `sample_mass_in_kg_required`, y
 * `listGreenSamplesForRoast` la ofrecía igual porque conserva las de masa desconocida. Se
 * escribía en un sitio y se leía de otro.
 *
 * La instantánea no es redundante con el libro, y por eso se congela en vez de recalcularse: su
 * comentario en `prisma/schema.prisma` dice para qué está —«que nadie lea el 11 % de hoy creyendo
 * que es el 18 % de entonces»—. El saldo del lote cambia con cada movimiento posterior; la
 * columna dice lo que salió aquel día.
 */
describe("createSampleFromLot — la masa extraída se congela en la muestra (2026-10-04)", () => {
  /** La receta del lote verde con almacenamiento, la misma que usa la prueba de 2026-09-18. */
  async function loteVerdeConAlmacenamiento(sufijo: string) {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-${sufijo}`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });
    const proceso = await abrirProcesoDePrueba(authorizedUserAccountId, lot.id);
    const { run } = await startDryingRun(authorizedUserAccountId, {
      lotId: lot.id,
      startedAt: new Date(Date.now() - 86_400_000),
      provenanceClass: "original_record",
    });
    const finDelSecado = new Date();
    const { outputLot } = await endDryingRun(authorizedUserAccountId, {
      dryingRunId: run.id,
      endedAt: finDelSecado,
      endedOutcome: "target_reached",
      outputLotCode: `${RUN_ID}-${sufijo}-seco`,
      outputLotType: "parchment",
      provenanceClass: "original_record",
    });
    const cierre = new Date(finDelSecado.getTime() + 60_000);
    const humedadDeCierre = await prisma.measurement.create({
      data: {
        variable: "moisture",
        value: 11,
        unit: "%",
        occurredAt: cierre,
        lotId: outputLot.id,
        provenanceClass: "measured_fact",
      },
    });
    await cerrarProceso(authorizedUserAccountId, {
      lotProcessId: proceso.id,
      endedAt: cierre,
      closingMoistureMeasurementId: humedadDeCierre.id,
    });
    return lot;
  }

  it("la cantidad extraída queda en massAtExtraction, con su unidad", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-masa-congelada`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });
    await recordQuantityEvent(authorizedUserAccountId, {
      provenanceClass: "measured_fact",
      lotId: lot.id,
      eventType: "received",
      quantity: 100,
      unit: "kg",
      occurredAt: new Date("2026-01-01"),
    });

    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-masa-1`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      quantity: 1.5,
      unit: "kg",
      occurredAt: new Date("2026-01-02"),
    });

    expect(Number(sample.massAtExtraction)).toBe(1.5);
    expect(sample.massUnitAtExtraction).toBe("kg");
  });

  it("control: una masa declarada en otra unidad GANA sobre la derivada", async () => {
    // El servicio ya aceptaba estas dos columnas, y algún día las manda otro camino —una
    // importación, una corrección—. Derivar por encima de lo declarado cambiaría 300 g por
    // 0,3 kg: el mismo café con otra cifra y otra unidad. Y el control discrimina de verdad,
    // porque si la derivación pisara lo declarado aquí saldría 0,3 / "kg".
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-masa-declarada`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });

    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-masa-2`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      quantity: 0.3,
      unit: "kg",
      massAtExtraction: 300,
      massUnitAtExtraction: "g",
      occurredAt: new Date("2026-01-02"),
    });

    expect(Number(sample.massAtExtraction)).toBe(300);
    expect(sample.massUnitAtExtraction).toBe("g");
  });

  it("control negativo: sin cantidad las dos columnas quedan en NULL, no en cero", async () => {
    // «Missing must remain missing» (§3 de la especificación). Un cero diría que se sacó nada,
    // que no es lo mismo que no haberlo pesado — y el tueste leería «0 kg disponibles» en vez
    // de «no se sabe».
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-masa-ausente`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });

    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-masa-3`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      occurredAt: new Date("2026-01-02"),
    });

    expect(sample.massAtExtraction).toBeNull();
    expect(sample.massUnitAtExtraction).toBeNull();
  });

  it("un tueste de muestra entra con una muestra recién creada, y sigue rechazando la que no tiene masa", async () => {
    const lot = await loteVerdeConAlmacenamiento("tueste-desde-muestra");

    const { sample: conMasa } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-tueste-con-masa`,
      sampleType: "green_coffee",
      materialState: "GREEN",
      sourceLotId: lot.id,
      quantity: 0.35,
      unit: "kg",
      occurredAt: new Date(),
    });

    // Este lote no tiene libro de cantidades, así que no se escribe ningún asiento. La
    // instantánea no puede depender de que el saldo exista: lo que se sacó se sacó, lo registre
    // el libro o no.
    expect(await prisma.quantityEvent.count({ where: { lotId: lot.id } })).toBe(0);
    expect(Number(conMasa.massAtExtraction)).toBe(0.35);

    const { roastSession } = await recordRoastSession(authorizedUserAccountId, {
      lotId: lot.id,
      sourceSampleId: conMasa.id,
      purpose: "sample",
      outputLotCode: `${RUN_ID}-tostado`,
      startedAt: new Date(),
      chargeWeightKg: 0.2,
      provenanceClass: "original_record",
    });
    expect(roastSession.sourceSampleId).toBe(conMasa.id);

    // El control que hace que la mitad de arriba signifique algo: el guardia sigue vivo. Si el
    // arreglo hubiera sido quitarlo, esta mitad pasaría también y la prueba no distinguiría
    // «la masa se congela» de «ya no se exige masa».
    const { sample: sinMasa } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-tueste-sin-masa`,
      sampleType: "green_coffee",
      materialState: "GREEN",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });
    await expect(
      recordRoastSession(authorizedUserAccountId, {
        lotId: lot.id,
        sourceSampleId: sinMasa.id,
        purpose: "sample",
        outputLotCode: `${RUN_ID}-tostado-sin-masa`,
        startedAt: new Date(),
        chargeWeightKg: 0.2,
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow("sample_mass_in_kg_required");
  });
});
