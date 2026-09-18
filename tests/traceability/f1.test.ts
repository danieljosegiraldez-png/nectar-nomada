/**
 * F1 (docs/implementation/30_F1_OPERACION_FINCA_ESQUEMA.md). Real Postgres
 * (Neon), no mocks — same discipline as every Traceability/Apiary test
 * suite. Covers §1-2 (Location attributes, microlots), §3/§5 (Specimen,
 * SpecimenObservation, trap lifecycle), §4 (PlantingEvent, LabourEntry/
 * MaterialConsumptionEntry location parent). RBAC covers `location`,
 * `specimen`, and `lot` resourceTypes, all granted by one location-scoped
 * Farm Operator Assignment (A1's own pattern) — Location carries no
 * projectId of its own, so a project-scoped Assignment does not reach it
 * (RBAC.md §3, exact-identity containment for leaf scopes).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import {
  createMicrolot,
  getAltitudeRange,
  LocationAccessError,
  LocationValidationError,
  updateLocationAttributes,
} from "../../lib/traceability/locations";
import {
  createSpecimen,
  getTrapCheckSeries,
  lecturaDeTrampaQueMotivo,
  recordSpecimenObservation,
  SpecimenAccessError,
  SpecimenValidationError,
} from "../../lib/traceability/specimens";
import { listPlantingEventsForLocation, PlantingEventValidationError, recordPlantingEvent } from "../../lib/traceability/plantingEvents";
import { LabourValidationError, recordLabourEntry, recordMaterialConsumptionEntry } from "../../lib/traceability/operations";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `f1-${Date.now()}`;

let organizationId: string;
let locationId: string; // TEST plot, location-scoped access only (mirrors Cerro Azul's own lots — no projectId)
let otherLocationId: string;

let authorizedUserAccountId: string; // Farm Operator, scope: locationId
let wrongLocationUserAccountId: string; // Farm Operator, scope: otherLocationId
let unauthorizedUserAccountId: string; // no Assignment at all

let microlotId: string;
let specimenPlantId: string;
let specimenTrapId: string;
const plantingEventIds: string[] = [];

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "en" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

async function assignFarmOperator(userAccountId: string, locationRefId: string) {
  const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationRefId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperatorProfile.id, scopeId: scope.id } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const location = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = location.id;

  const otherLocation = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Other Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  otherLocationId = otherLocation.id;

  authorizedUserAccountId = await createTestUserAccount("F1Operator");
  await assignFarmOperator(authorizedUserAccountId, locationId);

  wrongLocationUserAccountId = await createTestUserAccount("F1WrongLocationOperator");
  await assignFarmOperator(wrongLocationUserAccountId, otherLocationId);

  unauthorizedUserAccountId = await createTestUserAccount("F1Unauthorized");
});

afterAll(async () => {
  await prisma.specimenObservation.deleteMany({
    where: assertDefinedWhere({ specimenId: { in: [specimenPlantId, specimenTrapId].filter(Boolean) } }),
  });
  await prisma.specimen.deleteMany({ where: assertDefinedWhere({ id: { in: [specimenPlantId, specimenTrapId].filter(Boolean) } }) });
  await prisma.plantingEvent.deleteMany({ where: assertDefinedWhere({ id: { in: plantingEventIds } }) });
  await prisma.labourEntry.deleteMany({ where: assertDefinedWhere({ locationId: { in: [locationId, otherLocationId] } }) });
  await prisma.materialConsumptionEntry.deleteMany({ where: assertDefinedWhere({ locationId: { in: [locationId, otherLocationId] } }) });
  // Las jornadas de campo y lo que colgó de ellas. Van ANTES de las personas:
  // una `FieldSession` referencia a su operario, y borrar la persona primero
  // revienta la limpieza entera — que es exactamente lo que pasó al añadir
  // estas pruebas.
  const jornadasDePrueba = await prisma.fieldSession.findMany({
    where: { locationId: { in: [locationId, otherLocationId] } },
    select: { id: true },
  });
  const jornadaIds = jornadasDePrueba.map((j) => j.id);
  await prisma.materialConsumptionEntry.deleteMany({ where: assertDefinedWhere({ fieldSessionId: { in: jornadaIds } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: jornadaIds } }) });

  const userAccountIds = [authorizedUserAccountId, wrongLocationUserAccountId, unauthorizedUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [locationId, otherLocationId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });

  await prisma.location.deleteMany({ where: assertDefinedWhere({ parentLocationId: locationId } ) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [locationId, otherLocationId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("updateLocationAttributes", () => {
  it("rejects a user with no access to the location", async () => {
    await expect(
      updateLocationAttributes(wrongLocationUserAccountId, { locationId, sunExposure: "full_sun" }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("rejects altitudeMinM greater than altitudeMaxM", async () => {
    await expect(
      updateLocationAttributes(authorizedUserAccountId, { locationId, altitudeMinM: 700, altitudeMaxM: 600 }),
    ).rejects.toThrow(LocationValidationError);
  });

  it("records Cerro Azul's real general range (600-650m) plus sun/shade — the golden path", async () => {
    const updated = await updateLocationAttributes(authorizedUserAccountId, {
      locationId,
      sunExposure: "morning",
      shadePercentage: "pct_30",
      altitudeMinM: 600,
      altitudeMaxM: 650,
      slopeDescription: "moderate",
      // S1 §2 — antes esto decía "moderate, east-facing": la orientación
      // viajaba dentro de la prosa de la pendiente, donde ninguna consulta la
      // podía agrupar. Ahora es un valor propio y la pendiente vuelve a
      // describir sólo la pendiente.
      aspect: "east",
      soilType: "volcanic loam",
      plantSpacingMeters: 2,
      description: "TEST attribute note",
    });
    expect(updated.sunExposure).toBe("morning");
    expect(updated.shadePercentage).toBe("pct_30");
    expect(updated.altitudeMinM).toBe(600);
    expect(updated.altitudeMaxM).toBe(650);
    expect(updated.aspect).toBe("east");
    expect(getAltitudeRange(updated)).toBe(50);
  });

  it("deja la orientación sin registrar cuando nadie la ha mirado — null, no un rumbo por defecto", async () => {
    // ADR-080: «sin registrar» y «mira al norte» son hechos distintos. La
    // columna es nullable y no tiene default justamente por eso, y esta
    // aserción es lo que impide que alguien le ponga uno más adelante.
    const sinTocar = await prisma.location.create({
      data: { name: "TEST orientación sin registrar", locationType: "plot", createdBy: authorizedUserAccountId },
    });
    expect(sinTocar.aspect).toBeNull();
    await prisma.location.delete({ where: { id: sinTocar.id } });
  });

  it("acepta `flat` y `variable`, que no son rumbos", async () => {
    // Un lote plano no tiene orientación y uno que mira a tres lados tampoco
    // tiene una sola. Forzarlos a un punto cardinal inventaría el dato.
    const plano = await updateLocationAttributes(authorizedUserAccountId, { locationId, aspect: "flat" });
    expect(plano.aspect).toBe("flat");
    const varias = await updateLocationAttributes(authorizedUserAccountId, { locationId, aspect: "variable" });
    expect(varias.aspect).toBe("variable");
    // Se devuelve a `east` para que el test de PATCH de abajo siga midiendo lo
    // que dice medir, corra en el orden que corra dentro de este describe.
    await updateLocationAttributes(authorizedUserAccountId, { locationId, aspect: "east" });
  });

  it("is a PATCH — updating one field leaves previously-set fields untouched", async () => {
    const updated = await updateLocationAttributes(authorizedUserAccountId, { locationId, soilType: "volcanic loam, revised" });
    expect(updated.soilType).toBe("volcanic loam, revised");
    // sunExposure was set in the prior test and not passed here — must survive.
    expect(updated.sunExposure).toBe("morning");
    expect(updated.aspect).toBe("east");
    expect(updated.altitudeMinM).toBe(600);
  });
});

describe("getAltitudeRange", () => {
  it("returns null when either bound is missing — no invented single-value fallback", () => {
    expect(getAltitudeRange({ altitudeMinM: null, altitudeMaxM: 650 })).toBeNull();
    expect(getAltitudeRange({ altitudeMinM: 600, altitudeMaxM: null })).toBeNull();
  });

  it("returns raw arithmetic, not a candidate boolean against an invented threshold", () => {
    expect(getAltitudeRange({ altitudeMinM: 1300, altitudeMaxM: 1500 })).toBe(200);
  });
});

describe("createMicrolot", () => {
  it("rejects a user with no access to the parent location", async () => {
    await expect(
      createMicrolot(wrongLocationUserAccountId, {
        parentLocationId: locationId,
        name: `TEST Microlot (${RUN_ID})`,
        subdivisionReason: "altitude",
      }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("rejects an empty name", async () => {
    await expect(
      createMicrolot(authorizedUserAccountId, { parentLocationId: locationId, name: "  ", subdivisionReason: "altitude" }),
    ).rejects.toThrow(LocationValidationError);
  });

  it("creates a microlot inheriting locationType/organizationId from its parent, recording the subdivision reason", async () => {
    const microlot = await createMicrolot(authorizedUserAccountId, {
      parentLocationId: locationId,
      name: `TEST Microlot Alto (${RUN_ID})`,
      subdivisionReason: "altitude",
      subdivisionReasonNote: "upper third sits 100m higher than the lower third",
    });
    microlotId = microlot.id;
    expect(microlot.parentLocationId).toBe(locationId);
    expect(microlot.organizationId).toBe(organizationId);
    expect(microlot.locationType).toBe("plot");
    expect(microlot.subdivisionReason).toBe("altitude");

    const fetched = await prisma.location.findUniqueOrThrow({ where: { id: microlotId } });
    expect(fetched.parentLocationId).toBe(locationId);
  });
});

describe("createSpecimen", () => {
  it("rejects a user with no access to the location", async () => {
    await expect(
      createSpecimen(wrongLocationUserAccountId, { locationId, specimenType: "plant", commonName: "Caturra", provenanceClass: "direct_observation" }),
    ).rejects.toThrow(SpecimenAccessError);
  });

  it("rejects an empty commonName", async () => {
    await expect(
      createSpecimen(authorizedUserAccountId, { locationId, specimenType: "plant", commonName: "  ", provenanceClass: "direct_observation" }),
    ).rejects.toThrow(SpecimenValidationError);
  });

  it("creates a plant Specimen with a simple sector", async () => {
    const specimen = await createSpecimen(authorizedUserAccountId, {
      locationId,
      specimenType: "plant",
      commonName: "Caturra",
      varietalNote: "TEST varietal note",
      sectorSimple: "alto",
      provenanceClass: "direct_observation",
    });
    specimenPlantId = specimen.id;
    expect(specimen.specimenType).toBe("plant");
    expect(specimen.sectorSimple).toBe("alto");
    expect(specimen.status).toBe("active");
  });

  it("creates a Specimen with a grid position and no simple sector, and accepts both mechanisms together", async () => {
    const gridOnly = await createSpecimen(authorizedUserAccountId, {
      locationId,
      specimenType: "plant",
      commonName: "TEST grid-only plant",
      gridRow: 3,
      gridPosition: 12,
      provenanceClass: "direct_observation",
    });
    expect(gridOnly.sectorSimple).toBeNull();
    expect(gridOnly.gridRow).toBe(3);
    expect(gridOnly.gridPosition).toBe(12);

    const both = await createSpecimen(authorizedUserAccountId, {
      locationId,
      specimenType: "plant",
      commonName: "TEST both-mechanisms plant",
      sectorSimple: "medio",
      gridRow: 1,
      gridPosition: 1,
      provenanceClass: "direct_observation",
    });
    expect(both.sectorSimple).toBe("medio");
    expect(both.gridRow).toBe(1);

    await prisma.specimen.deleteMany({ where: assertDefinedWhere({ id: { in: [gridOnly.id, both.id] } }) });
  });

  it("creates a broca trap Specimen — specimenType discriminates it from a plant, not a null-out of plant fields", async () => {
    const trap = await createSpecimen(authorizedUserAccountId, {
      locationId,
      specimenType: "trap",
      commonName: "TEST Broca Trap 1",
      sectorSimple: "bajo",
      provenanceClass: "direct_observation",
    });
    specimenTrapId = trap.id;
    expect(trap.specimenType).toBe("trap");
    expect(trap.status).toBe("active");
  });
});

describe("recordSpecimenObservation — trap capture-count series and the active/removed/reinstalled cycle", () => {
  it("rejects a trap_check with no captureCount", async () => {
    await expect(
      recordSpecimenObservation(authorizedUserAccountId, {
        specimenId: specimenTrapId,
        observationType: "trap_check",
        observedAt: new Date("2027-02-01T08:00:00Z"),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(SpecimenValidationError);
  });

  it("rejects a user with no access to the specimen's location", async () => {
    await expect(
      recordSpecimenObservation(wrongLocationUserAccountId, {
        specimenId: specimenTrapId,
        observationType: "trap_check",
        observedAt: new Date("2027-02-01T08:00:00Z"),
        captureCount: 3,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(SpecimenAccessError);
  });

  it("records two dated trap_check readings and reads back the series in order", async () => {
    await recordSpecimenObservation(authorizedUserAccountId, {
      specimenId: specimenTrapId,
      observationType: "trap_check",
      observedAt: new Date("2027-02-01T08:00:00Z"),
      captureCount: 4,
      provenanceClass: "direct_observation",
    });
    await recordSpecimenObservation(authorizedUserAccountId, {
      specimenId: specimenTrapId,
      observationType: "trap_check",
      observedAt: new Date("2027-02-08T08:00:00Z"),
      captureCount: 11,
      provenanceClass: "direct_observation",
    });

    const series = await getTrapCheckSeries(authorizedUserAccountId, specimenTrapId);
    expect(series.length).toBe(2);
    expect(series[0]?.captureCount).toBe(4);
    expect(series[1]?.captureCount).toBe(11);
    expect(series[0]?.observedAt.getTime()).toBeLessThan(series[1]!.observedAt.getTime());
  });

  it("drives the active -> removed -> reinstalled cycle via observation rows, not a fourth status value", async () => {
    let specimen = await prisma.specimen.findUniqueOrThrow({ where: { id: specimenTrapId } });
    expect(specimen.status).toBe("active");

    await recordSpecimenObservation(authorizedUserAccountId, {
      specimenId: specimenTrapId,
      observationType: "removed",
      observedAt: new Date("2027-02-10T08:00:00Z"),
      notes: "TEST removed for cleaning",
      provenanceClass: "direct_observation",
    });
    specimen = await prisma.specimen.findUniqueOrThrow({ where: { id: specimenTrapId } });
    expect(specimen.status).toBe("removed");

    await recordSpecimenObservation(authorizedUserAccountId, {
      specimenId: specimenTrapId,
      observationType: "reinstalled",
      observedAt: new Date("2027-02-11T08:00:00Z"),
      provenanceClass: "direct_observation",
    });
    specimen = await prisma.specimen.findUniqueOrThrow({ where: { id: specimenTrapId } });
    expect(specimen.status).toBe("active");

    // A trap_check after reinstall must not itself change status.
    await recordSpecimenObservation(authorizedUserAccountId, {
      specimenId: specimenTrapId,
      observationType: "trap_check",
      observedAt: new Date("2027-02-15T08:00:00Z"),
      captureCount: 2,
      provenanceClass: "direct_observation",
    });
    specimen = await prisma.specimen.findUniqueOrThrow({ where: { id: specimenTrapId } });
    expect(specimen.status).toBe("active");
  });
});

describe("lecturaDeTrampaQueMotivo — Tarea 8 fitosanitario, spec §4.3", () => {
  let trampa: string;
  let lecturaMotivo: string;
  let lecturaSiguiente: string;

  beforeAll(async () => {
    const trap = await createSpecimen(authorizedUserAccountId, {
      locationId,
      specimenType: "trap",
      commonName: "TEST Trampa Manejo",
      provenanceClass: "direct_observation",
    });
    trampa = trap.id;
    const r1 = await recordSpecimenObservation(authorizedUserAccountId, {
      specimenId: trampa,
      observationType: "trap_check",
      observedAt: new Date("2027-03-01T08:00:00Z"),
      captureCount: 9,
      provenanceClass: "direct_observation",
    });
    lecturaMotivo = r1.id;
    const r2 = await recordSpecimenObservation(authorizedUserAccountId, {
      specimenId: trampa,
      observationType: "trap_check",
      observedAt: new Date("2027-03-08T08:00:00Z"),
      captureCount: 1,
      provenanceClass: "direct_observation",
    });
    lecturaSiguiente = r2.id;
  });

  afterAll(async () => {
    await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimenId: trampa }) });
    await prisma.specimen.deleteMany({ where: assertDefinedWhere({ id: trampa }) });
  });

  it("trae la lectura motivadora y la siguiente", async () => {
    const r = await lecturaDeTrampaQueMotivo(authorizedUserAccountId, lecturaMotivo);
    expect(r?.motivo.id).toBe(lecturaMotivo);
    expect(r?.motivo.captureCount).toBe(9);
    expect(r?.siguiente?.id).toBe(lecturaSiguiente);
  });

  it("sin lectura posterior: siguiente es null", async () => {
    const r = await lecturaDeTrampaQueMotivo(authorizedUserAccountId, lecturaSiguiente);
    expect(r?.siguiente).toBeNull();
  });

  it("observación inexistente: null, no un error", async () => {
    expect(await lecturaDeTrampaQueMotivo(authorizedUserAccountId, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("sin acceso a la ubicación de la trampa: SpecimenAccessError", async () => {
    await expect(lecturaDeTrampaQueMotivo(wrongLocationUserAccountId, lecturaMotivo)).rejects.toThrow(SpecimenAccessError);
  });
});

describe("recordPlantingEvent", () => {
  it("rejects a user with no access to the location", async () => {
    await expect(
      recordPlantingEvent(wrongLocationUserAccountId, {
        locationId,
        eventType: "received",
        quantity: 600,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects a non-positive quantity", async () => {
    await expect(
      recordPlantingEvent(authorizedUserAccountId, { locationId, eventType: "received", quantity: 0, provenanceClass: "direct_observation" }),
    ).rejects.toThrow(PlantingEventValidationError);
  });

  it("records the 600 Caturra seedlings received from Cafelino — the golden path", async () => {
    const event = await recordPlantingEvent(authorizedUserAccountId, {
      locationId,
      eventType: "received",
      varietal: "Caturra",
      quantity: 600,
      unit: "plantones",
      sourceOrganizationId: organizationId,
      occurredAt: new Date("2026-08-08T08:00:00Z"),
      provenanceClass: "direct_observation",
    });
    plantingEventIds.push(event.id);
    expect(event.varietal).toBe("Caturra");
    expect(event.quantity?.toString()).toBe("600");
    expect(event.unit).toBe("plantones");
    expect(event.sourceOrganizationId).toBe(organizationId);
  });

  it("records a separate 'planted' event and lists both in descending order", async () => {
    const plantedEvent = await recordPlantingEvent(authorizedUserAccountId, {
      locationId,
      eventType: "planted",
      varietal: "Caturra",
      quantity: 600,
      occurredAt: new Date("2026-08-09T08:00:00Z"),
      provenanceClass: "direct_observation",
    });
    plantingEventIds.push(plantedEvent.id);

    const events = await listPlantingEventsForLocation(authorizedUserAccountId, locationId);
    expect(events.length).toBe(2);
    expect(events[0]?.eventType).toBe("planted");
    expect(events[1]?.eventType).toBe("received");
  });
});

describe("recordLabourEntry — location parent (F1 §4)", () => {
  it("rejects when lotId is required but omitted for a non-location parent kind", async () => {
    await expect(
      recordLabourEntry(authorizedUserAccountId, {
        parent: { kind: "harvestEvent", harvestEventId: "nonexistent" },
        workerCount: 1,
        hours: 1,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(LabourValidationError);
  });

  it("rejects a user with no access to the location", async () => {
    await expect(
      recordLabourEntry(wrongLocationUserAccountId, {
        parent: { kind: "location", locationId },
        workerCount: 4,
        hours: 3,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("records 600 holes dug against a Location with no batch involved — the golden path", async () => {
    const entry = await recordLabourEntry(authorizedUserAccountId, {
      parent: { kind: "location", locationId },
      workerCount: 6,
      hours: 8,
      taskNote: "TEST 600 hoyos para siembra",
      provenanceClass: "direct_observation",
    });
    expect(entry.locationId).toBe(locationId);
    expect(entry.harvestEventId).toBeNull();
    expect(entry.receivingEventId).toBeNull();
    expect(entry.fermentationRunId).toBeNull();
    expect(entry.dryingRunId).toBeNull();
  });
});

describe("recordMaterialConsumptionEntry — location parent (F1 §4)", () => {
  it("rejects a user with no access to the location", async () => {
    await expect(
      recordMaterialConsumptionEntry(wrongLocationUserAccountId, {
        parent: { kind: "location", locationId },
        materialName: "Biochar",
        batchLabel: "TEST-BATCH-1",
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("records biochar applied directly to a plot, no batch involved", async () => {
    const entry = await recordMaterialConsumptionEntry(authorizedUserAccountId, {
      parent: { kind: "location", locationId },
      materialName: "Biochar",
      batchLabel: "TEST-BATCH-1",
      quantity: 50,
      unit: "kg",
      provenanceClass: "direct_observation",
    });
    expect(entry.locationId).toBe(locationId);
    expect(entry.fermentationRunId).toBeNull();
    expect(entry.dryingRunId).toBeNull();
  });
});

/**
 * **Los consumibles de una visita al apiario** — 2026-09-17.
 *
 * Daniel, contando una visita real: uniforme de apicultor, ahumador, aserrín y
 * hojas para el ahumador, encendedor, una lija de ebanistería y diez reductores
 * de piquera.
 *
 * Hasta hoy eso sólo se podía colgar de una UBICACIÓN, así que el sistema
 * podía decir «se gastó aserrín en el Apiario Finca Rosina» y no «en la visita
 * del martes». Y la visita es la unidad en la que se trabaja: una jornada tiene
 * su operario, su hora de inicio y su ventana de edición, y lo gastado forma
 * parte de ella igual que los jornales.
 *
 * `FieldSession` ya existía y **no tenía relación con los consumos**. Esto la
 * añade por la puerta que ya estaba: una variante más del padre discriminado,
 * no un mecanismo paralelo.
 */
describe("recordMaterialConsumptionEntry — parent jornada de campo", () => {
  it("cuelga el consumo de LA VISITA, no sólo del sitio", async () => {
    const jornada = await prisma.fieldSession.create({
      data: {
        locationId,
        operatorPersonId: (await prisma.userAccount.findUniqueOrThrow({
          where: { id: authorizedUserAccountId }, select: { personId: true },
        })).personId,
        startedAt: new Date(),
        provenanceClass: "direct_observation",
      },
    });
    const entry = await recordMaterialConsumptionEntry(authorizedUserAccountId, {
      parent: { kind: "fieldSession", fieldSessionId: jornada.id },
      materialName: "Aserrín para el ahumador",
      batchLabel: "sin lote",
      quantity: 1,
      unit: "saco",
      provenanceClass: "direct_observation",
    });
    expect(entry.fieldSessionId).toBe(jornada.id);
    // Y NO se cuelga además de la ubicación: un consumo con dos padres se
    // contaría dos veces el día que alguien sume por sitio y por jornada.
    expect(entry.locationId).toBeNull();
    expect(entry.fermentationRunId).toBeNull();
    expect(entry.dryingRunId).toBeNull();
  });

  it("rechaza a quien no alcanza la ubicación DE LA JORNADA", async () => {
    // El ámbito sale de dónde ocurrió la jornada, no de la jornada misma: una
    // visita no lleva permisos propios. Si esto cayera, cualquiera podría
    // declarar consumos en el apiario de otro con sólo saber el id.
    const jornada = await prisma.fieldSession.create({
      data: {
        locationId,
        operatorPersonId: (await prisma.userAccount.findUniqueOrThrow({
          where: { id: authorizedUserAccountId }, select: { personId: true },
        })).personId,
        startedAt: new Date(),
        provenanceClass: "direct_observation",
      },
    });
    await expect(
      recordMaterialConsumptionEntry(wrongLocationUserAccountId, {
        parent: { kind: "fieldSession", fieldSessionId: jornada.id },
        materialName: "Aserrín para el ahumador",
        batchLabel: "sin lote",
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("y una jornada que no existe se rechaza — el control de que se mira de verdad", async () => {
    await expect(
      recordMaterialConsumptionEntry(authorizedUserAccountId, {
        parent: { kind: "fieldSession", fieldSessionId: "00000000-0000-0000-0000-000000000000" },
        materialName: "Aserrín",
        batchLabel: "sin lote",
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });
});
