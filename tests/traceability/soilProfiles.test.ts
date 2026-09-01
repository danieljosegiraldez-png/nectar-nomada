/**
 * S1 (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2, semanas 3–6). La
 * calicata. Postgres real, sin mocks.
 *
 * RBAC: `location:manage_attributes` contra el bloque descrito, concedido por
 * una Assignment de Farm Operator con ámbito de location — mismo patrón que F1,
 * las cohortes de siembra y el lote de biochar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { LocationAccessError } from "../../lib/traceability/locations";
import {
  addSoilHorizon,
  computeAnaerobicSignals,
  createSoilProfile,
  listSoilProfilesForLocation,
  SoilProfileValidationError,
  updateSoilProfile,
} from "../../lib/traceability/soilProfiles";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `calicata-${Date.now()}`;

let organizationId: string;
let locationId: string;
let otherLocationId: string;
let authorizedUserAccountId: string;
let wrongLocationUserAccountId: string;
let perfilId: string;

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
    data: { locationType: "plot", name: `TEST Lote calicata (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = plot.id;

  const other = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Otro lote (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  otherLocationId = other.id;

  authorizedUserAccountId = await createTestUserAccount("CalicataOperator");
  await assignFarmOperator(authorizedUserAccountId, locationId);

  wrongLocationUserAccountId = await createTestUserAccount("CalicataWrongPlot");
  await assignFarmOperator(wrongLocationUserAccountId, otherLocationId);
});

afterAll(async () => {
  // Los horizontes caen por CASCADE con su perfil, pero se borran explícitamente
  // para que este cleanup no dependa de una regla del esquema: si mañana el
  // CASCADE cambia, aquí no se acumula basura en silencio.
  const perfiles = await prisma.soilProfile.findMany({
    where: assertDefinedWhere({ locationId: { in: [locationId, otherLocationId] } }),
    select: { id: true },
  });
  await prisma.soilHorizon.deleteMany({
    where: assertDefinedWhere({ soilProfileId: { in: perfiles.map((p) => p.id) } }),
  });
  await prisma.soilProfile.deleteMany({
    where: assertDefinedWhere({ locationId: { in: [locationId, otherLocationId] } }),
  });

  const userAccountIds = [authorizedUserAccountId, wrongLocationUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [locationId, otherLocationId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [locationId, otherLocationId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("createSoilProfile", () => {
  it("rechaza a quien no alcanza el bloque", async () => {
    await expect(
      createSoilProfile(wrongLocationUserAccountId, {
        locationId,
        describedAt: new Date("2026-04-15T00:00:00Z"),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("rechaza raíces más hondas que el propio hoyo", async () => {
    // No se pudo ver a 90 cm lo que se miró desde un hoyo de 60.
    await expect(
      createSoilProfile(authorizedUserAccountId, {
        locationId,
        describedAt: new Date("2026-04-15T00:00:00Z"),
        provenanceClass: "direct_observation",
        pitDepthCm: 60,
        rootingDepthCm: 90,
      }),
    ).rejects.toThrow(SoilProfileValidationError);
  });

  it("rechaza un horizonte que empieza más abajo de donde acaba", async () => {
    await expect(
      createSoilProfile(authorizedUserAccountId, {
        locationId,
        describedAt: new Date("2026-04-15T00:00:00Z"),
        provenanceClass: "direct_observation",
        horizons: [{ ordinal: 1, topCm: 40, bottomCm: 10 }],
      }),
    ).rejects.toThrow(SoilProfileValidationError);
  });

  it("rechaza dos horizontes con el mismo ordinal", async () => {
    await expect(
      createSoilProfile(authorizedUserAccountId, {
        locationId,
        describedAt: new Date("2026-04-15T00:00:00Z"),
        provenanceClass: "direct_observation",
        horizons: [{ ordinal: 1 }, { ordinal: 1 }],
      }),
    ).rejects.toThrow(SoilProfileValidationError);
  });

  it("acepta una calicata que topó con roca a los 40 cm", async () => {
    // Es un hecho, y de los informativos: rechazarla obligaría a mentir en la
    // casilla para poder guardar.
    const somera = await createSoilProfile(authorizedUserAccountId, {
      locationId,
      describedAt: new Date("2026-04-10T00:00:00Z"),
      provenanceClass: "direct_observation",
      pitDepthCm: 40,
      rootingDepthCm: 35,
      notes: "Roca a los 40 cm; no se pudo seguir",
    });
    expect(somera.pitDepthCm).toBe(40);
  });

  it("describe el perfil con sus horizontes — el camino bueno", async () => {
    const perfil = await createSoilProfile(authorizedUserAccountId, {
      locationId,
      describedAt: new Date("2026-04-15T00:00:00Z"),
      provenanceClass: "direct_observation",
      pitDepthCm: 95,
      rootingDepthCm: 45,
      rootDistribution: "Densa en los primeros 20 cm, casi nula bajo los 45",
      mottling: "present",
      greyColours: "present",
      rootChannelConcretions: "absent",
      sourSmell: "not_observed",
      impedingLayerDepthCm: 50,
      impedingLayerNote: "Arcilla compacta, difícil de penetrar con el cuchillo",
      dataQuality: "provisional",
      horizons: [
        { ordinal: 1, topCm: 0, bottomCm: 20, designation: "A", colour: "Pardo oscuro", structure: "Granular", textureByFeel: "Franco arcilloso" },
        { ordinal: 2, topCm: 20, bottomCm: 50, designation: "Bt", colour: "Pardo rojizo", structure: "Bloques subangulares", textureByFeel: "Arcilloso" },
        { ordinal: 3, topCm: 50, bottomCm: 95, designation: "Btg", colour: "Gris con moteado ocre", structure: "Masiva", textureByFeel: "Arcilloso" },
      ],
    });
    perfilId = perfil.id;

    expect(perfil.horizons).toHaveLength(3);
    expect(perfil.horizons[0]?.designation).toBe("A");
    expect(perfil.horizons[2]?.bottomCm).toBe(95);
    expect(perfil.sourSmell).toBe("not_observed");
  });

  // Comprueba que quedó auditada, no la atomicidad — cuando nada falla las dos
  // filas existen igual aunque el audit vaya por su cuenta. Eso lo cubre
  // `tests/arquitectura/audit-atomico.test.ts`, leyendo la fuente.
  it("deja el AuditEvent de la operación", async () => {
    const evento = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({ entityType: "soil_profile", entityId: perfilId, operation: "soil_profile.create" }),
    });
    expect(evento).not.toBeNull();
  });

  it("un perfil sin horizontes es legítimo", async () => {
    // Describir sólo la profundidad de raíces y las señales de anaerobiosis es
    // ya la mitad del valor del Paso 4. Exigir horizontes empujaría a
    // inventarlos.
    const perfil = await createSoilProfile(authorizedUserAccountId, {
      locationId,
      describedAt: new Date("2026-04-16T00:00:00Z"),
      provenanceClass: "direct_observation",
    });
    expect(perfil.horizons).toHaveLength(0);
    expect(perfil.rootingDepthCm).toBeNull();
  });
});

describe("updateSoilProfile", () => {
  it("rechaza a quien no alcanza el bloque", async () => {
    await expect(
      updateSoilProfile(wrongLocationUserAccountId, { soilProfileId: perfilId, notes: "no" }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("es un PATCH y guarda el ANTES en el audit", async () => {
    const corregido = await updateSoilProfile(authorizedUserAccountId, {
      soilProfileId: perfilId,
      // La libreta decía 55, se tecleó 45. El suelo no cambió.
      rootingDepthCm: 55,
    });
    expect(corregido.rootingDepthCm).toBe(55);
    expect(corregido.pitDepthCm).toBe(95);
    expect(corregido.mottling).toBe("present");

    const evento = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({ entityType: "soil_profile", entityId: perfilId, operation: "soil_profile.update" }),
      orderBy: { occurredAt: "desc" },
    });
    expect((evento?.before as { rootingDepthCm?: number } | null)?.rootingDepthCm).toBe(45);
  });

  it("valida contra el valor que QUEDARÁ, no contra el que llega", async () => {
    // Sólo se manda la profundidad de raíces; el hoyo guardado es 95. Comparar
    // contra el campo ausente no diría nada.
    await expect(
      updateSoilProfile(authorizedUserAccountId, { soilProfileId: perfilId, rootingDepthCm: 200 }),
    ).rejects.toThrow(SoilProfileValidationError);
  });

  it("no toca los horizontes", async () => {
    // Reemplazarlos desde un PATCH borraría en silencio una descripción que
    // costó cavar un hoyo.
    const corregido = await updateSoilProfile(authorizedUserAccountId, {
      soilProfileId: perfilId,
      notes: "Revisado con Bob",
    });
    expect(corregido.horizons).toHaveLength(3);
  });
});

describe("addSoilHorizon", () => {
  it("rechaza a quien no alcanza el bloque", async () => {
    await expect(
      addSoilHorizon(wrongLocationUserAccountId, perfilId, { ordinal: 4 }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("rechaza un ordinal que ya existe en ese perfil", async () => {
    await expect(
      addSoilHorizon(authorizedUserAccountId, perfilId, { ordinal: 2 }),
    ).rejects.toThrow(SoilProfileValidationError);
  });

  it("añade un horizonte que se describió después", async () => {
    const h = await addSoilHorizon(authorizedUserAccountId, perfilId, {
      ordinal: 4,
      topCm: 95,
      bottomCm: 110,
      designation: "C",
      notes: "Se profundizó el hoyo al día siguiente",
    });
    expect(h.ordinal).toBe(4);
  });
});

describe("listSoilProfilesForLocation", () => {
  it("rechaza un bloque ajeno", async () => {
    await expect(
      listSoilProfilesForLocation(wrongLocationUserAccountId, locationId),
    ).rejects.toThrow(LocationAccessError);
  });

  it("devuelve TODAS las calicatas, no sólo la última", async () => {
    // Repetir la descripción existe para ver el cambio; una lista que esconde
    // las viejas lo impide.
    // Una cuarta calicata: con tres, un `take: 3` no se distinguiría de
    // «devuelve todas».
    await createSoilProfile(authorizedUserAccountId, {
      locationId,
      describedAt: new Date("2026-04-25T00:00:00Z"),
      provenanceClass: "direct_observation",
      rootingDepthCm: 50,
    });

    const perfiles = await listSoilProfilesForLocation(authorizedUserAccountId, locationId);
    // Conjunto exacto: con `>= 3`, añadir `take: 3` a la consulta pasaba
    // inadvertido y la función dejaba de devolver «todas» a partir de la cuarta.
    const todosLosPerfiles = new Set(
      (await prisma.soilProfile.findMany({ where: { locationId }, select: { id: true } })).map((p) => p.id),
    );
    expect(todosLosPerfiles.size).toBeGreaterThan(3);
    expect(new Set(perfiles.map((p) => p.id))).toEqual(todosLosPerfiles);
    // Más reciente primero.
    expect(perfiles[0]!.describedAt.getTime()).toBeGreaterThanOrEqual(perfiles[1]!.describedAt.getTime());
  });
});

describe("computeAnaerobicSignals", () => {
  it("cuenta las presentes sobre las registradas", () => {
    expect(
      computeAnaerobicSignals({
        mottling: "present",
        greyColours: "present",
        rootChannelConcretions: "absent",
        sourSmell: "not_observed",
      }),
    ).toEqual({ present: 2, observed: 3, anyPresent: true });
  });

  it("con ninguna registrada devuelve null, NO false", () => {
    // Contestar «no hay señales» a una pregunta que nadie hizo es lo que
    // mandaría a la finca a fertilizar un problema de aire (§6.1).
    expect(
      computeAnaerobicSignals({
        mottling: null,
        greyColours: null,
        rootChannelConcretions: "not_observed",
        sourSmell: null,
      }),
    ).toEqual({ present: 0, observed: 0, anyPresent: null });
  });

  it("todas miradas y ninguna presente es false, que sí es una respuesta", () => {
    expect(
      computeAnaerobicSignals({
        mottling: "absent",
        greyColours: "absent",
        rootChannelConcretions: "absent",
        sourSmell: "absent",
      }),
    ).toEqual({ present: 0, observed: 4, anyPresent: false });
  });
});
