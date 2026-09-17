/**
 * Tablero de parcela — «entró en producción» como evento de siembra.
 *
 * Base real, datos con RUN_ID, mismo patrón de acceso que plantingCohorts.test.ts
 * (Farm Operator con scope de ubicación). Vive en su propio archivo y en el
 * grupo `base-sembrada`: plantingCohorts.test.ts está en `datos-reales` y no
 * corre en CI.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createPlantingCohort, getPlotDetail } from "../../lib/traceability/plantingCohorts";
import { recordEnteredProduction, PlantingEventValidationError } from "../../lib/traceability/plantingEvents";
import { LocationAccessError } from "../../lib/traceability/locations";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `produccion-${Date.now()}`;

let organizationId: string;
let plotId: string;
let otroPlotId: string;
let operadorId: string;
let ajenoId: string;
let caturraValueId: string;

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return account.id;
}

async function assignFarmOperator(userAccountId: string, locationRefId: string) {
  const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationRefId } })) ??
    (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationRefId } }));
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: profile.id, scopeId: scope.id } });
}

async function plot(name: string) {
  const location = await prisma.location.create({
    data: { locationType: "plot", name: `TEST ${name} (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  return location.id;
}

async function siembraActiva(locationId: string) {
  return createPlantingCohort(operadorId, {
    locationId,
    cultivarValueId: caturraValueId,
    plantedAt: new Date("2019-01-01"),
    plantedPrecision: "year",
    plantCount: 500,
    provenanceClass: "original_record",
  });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;
  plotId = await plot("Lote produccion");
  otroPlotId = await plot("Lote ajeno");
  operadorId = await createTestUserAccount("Operador");
  await assignFarmOperator(operadorId, plotId);
  ajenoId = await createTestUserAccount("Ajeno");
  await assignFarmOperator(ajenoId, otroPlotId);
  const caturra = await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value: "Caturra", catalog: { key: "cultivar" } },
  });
  caturraValueId = caturra.id;
});

afterAll(async () => {
  const locationIds = [plotId, otroPlotId];
  const eventos = await prisma.plantingEvent.findMany({ where: { locationId: { in: locationIds } }, select: { id: true } });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: eventos.map((e) => e.id) } }) });
  await prisma.plantingEvent.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
  const cohortes = await prisma.plantingCohort.findMany({ where: { locationId: { in: locationIds } }, select: { id: true } });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: cohortes.map((c) => c.id) } }) });
  await prisma.plantingCohort.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
  const userIds = [operadorId, ajenoId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: locationIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("recordEnteredProduction", () => {
  it("guarda el evento con la fecha y la precisión que se escribieron, leyendo la fila", async () => {
    const cohorte = await siembraActiva(plotId);
    const evento = await recordEnteredProduction(operadorId, {
      plantingCohortId: cohorte.id,
      occurredAt: new Date("2021-01-01T00:00:00Z"),
      occurredPrecision: "year",
      provenanceClass: "original_record",
      notes: "Primera cosecha contada",
    });

    const fila = await prisma.plantingEvent.findUniqueOrThrow({ where: { id: evento.id } });
    expect(fila.eventType).toBe("entered_production");
    expect(fila.plantingCohortId).toBe(cohorte.id);
    expect(fila.locationId).toBe(plotId);
    expect(fila.occurredAt.toISOString()).toBe("2021-01-01T00:00:00.000Z");
    // Sin la columna, «desde 2021» se leería como el 1 de enero exacto.
    expect(fila.occurredPrecision).toBe("year");
    expect(fila.notes).toBe("Primera cosecha contada");
  });

  it("escribe su AuditEvent", async () => {
    const cohorte = await siembraActiva(plotId);
    const evento = await recordEnteredProduction(operadorId, {
      plantingCohortId: cohorte.id,
      occurredAt: new Date("2022-06-01T00:00:00Z"),
      occurredPrecision: "month",
      provenanceClass: "direct_observation",
    });
    const audit = await prisma.auditEvent.findFirst({ where: { entityId: evento.id } });
    expect(audit?.operation).toBe("planting_event.entered_production");
  });

  it("rechaza a un operador que no tiene esa parcela", async () => {
    const cohorte = await siembraActiva(plotId);
    await expect(
      recordEnteredProduction(ajenoId, {
        plantingCohortId: cohorte.id,
        occurredAt: new Date("2021-01-01T00:00:00Z"),
        occurredPrecision: "year",
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("rechaza una fecha futura", async () => {
    const cohorte = await siembraActiva(plotId);
    await expect(
      recordEnteredProduction(
        operadorId,
        { plantingCohortId: cohorte.id, occurredAt: new Date("2026-09-20T00:00:00Z"), occurredPrecision: "date", provenanceClass: "direct_observation" },
        new Date("2026-09-16T12:00:00Z"),
      ),
    ).rejects.toThrow(new PlantingEventValidationError("production_date_in_future"));
  });

  it("rechaza una fecha inválida con production_date_invalid y no escribe ninguna fila", async () => {
    // Revisión final, I4: un año «99» da `new Date("99-01-01T00:00:00Z")`,
    // inválida. `NaN > ahora` es false, así que el guardia de futuro la dejaba
    // pasar y Prisma lanzaba un error que `friendlyError` no reconoce.
    const cohorte = await siembraActiva(plotId);
    const occurredAt = new Date("99-01-01T00:00:00Z");
    // Control: la entrada ES inválida. Si no lo fuera, la prueba no mediría nada.
    expect(Number.isNaN(occurredAt.getTime())).toBe(true);
    const filasAntes = await prisma.plantingEvent.count({ where: { plantingCohortId: cohorte.id } });
    await expect(
      recordEnteredProduction(operadorId, {
        plantingCohortId: cohorte.id,
        occurredAt,
        occurredPrecision: "year",
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(new PlantingEventValidationError("production_date_invalid"));
    const filasDespues = await prisma.plantingEvent.count({ where: { plantingCohortId: cohorte.id } });
    expect(filasDespues).toBe(filasAntes);
  });

  it("rechaza una siembra que no está activa", async () => {
    const cohorte = await siembraActiva(plotId);
    await prisma.plantingCohort.update({ where: { id: cohorte.id }, data: { status: "removed" } });
    await expect(
      recordEnteredProduction(operadorId, {
        plantingCohortId: cohorte.id,
        occurredAt: new Date("2021-01-01T00:00:00Z"),
        occurredPrecision: "year",
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(new PlantingEventValidationError("cohort_not_active"));
  });
});

describe("getPlotDetail — eventos de producción", () => {
  it("devuelve el evento de la siembra marcada y ninguno de la que no", async () => {
    const marcada = await siembraActiva(plotId);
    const sinMarcar = await siembraActiva(plotId);
    await recordEnteredProduction(operadorId, {
      plantingCohortId: marcada.id,
      occurredAt: new Date("2021-01-01T00:00:00Z"),
      occurredPrecision: "year",
      provenanceClass: "original_record",
      dataQuality: "unconfirmed",
    });
    // M2: un evento de OTRO tipo en la siembra sin marcar. `createPlantingCohort`
    // no escribe eventos, así que sin esta fila quitar el filtro
    // `eventType: "entered_production"` de getPlotDetail dejaba la prueba en verde.
    // Con ella, una siembra plantada y nunca marcada saldría «en producción».
    await prisma.plantingEvent.create({
      data: {
        locationId: plotId,
        plantingCohortId: sinMarcar.id,
        eventType: "planted",
        provenanceClass: "original_record",
      },
    });
    // Control: la fila existe, así que la ausencia de abajo mide algo.
    expect(await prisma.plantingEvent.count({ where: { plantingCohortId: sinMarcar.id, eventType: "planted" } })).toBe(1);

    const detalle = await getPlotDetail(operadorId, plotId);
    const deMarcada = detalle.eventosDeProduccion.filter((e) => e.plantingCohortId === marcada.id);
    expect(deMarcada).toHaveLength(1);
    expect(deMarcada[0]!.occurredPrecision).toBe("year");
    // R12: ajustes enseña cómo se sabe la fecha, así que tienen que llegar.
    expect(deMarcada[0]!.provenanceClass).toBe("original_record");
    expect(deMarcada[0]!.dataQuality).toBe("unconfirmed");
    expect(detalle.eventosDeProduccion.some((e) => e.plantingCohortId === sinMarcar.id)).toBe(false);
  });
});
