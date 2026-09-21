import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

/**
 * Paso 4 del secado por bandeja (spec §4.5): la lectura de ambiente a mano.
 * Montaje propio y directo en la base: un sitio con su organización, una
 * instalación, un estante de 3 niveles × 2 puestos, una cama sin estante con
 * `rackLevel` 5 (el modelo anterior al 2a, que sigue siendo válido), y un
 * Farm Operator asignado al SITIO — `can()` sube por el árbol, así que eso le
 * da `sample:manage` sobre la instalación. `extrano` no tiene asignación.
 */
const nombre = (e: string) => `TEST AMB ${e}-${randomUUID().slice(0, 8)}`;
const personIds: string[] = [];
const accountIds: string[] = [];
const scopeIds: string[] = [];
const orgIds: string[] = [];
const locationIds: string[] = []; // en orden de creación; se borran al revés
const lecturaIds: string[] = [];

async function cuenta(etiqueta: string, sitioId?: string) {
  const person = await prisma.person.create({ data: { givenName: "TEST", familyName: etiqueta, displayName: nombre(etiqueta) } });
  personIds.push(person.id);
  const account = await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } });
  accountIds.push(account.id);
  if (sitioId) {
    const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitioId } });
    scopeIds.push(scope.id);
    await prisma.assignment.create({ data: { userAccountId: account.id, scopeId: scope.id, roleProfileId: roleProfile.id } });
  }
  return { userAccountId: account.id, personId: person.id };
}

async function lugar(data: Parameters<typeof prisma.location.create>[0]["data"]) {
  const l = await prisma.location.create({ data: { classification: "internal", ...data } as never });
  locationIds.push(l.id);
  return l;
}

type Montaje = {
  sitio: string; instalacion: string; otraInstalacion: string; estante: string; estanteAjeno: string;
  operario: { userAccountId: string; personId: string }; extrano: { userAccountId: string; personId: string };
};
let m: Montaje;

async function montaje(): Promise<Montaje> {
  const org = await prisma.organization.create({ data: { name: nombre("org"), organizationType: "farm" } });
  orgIds.push(org.id);
  const sitio = await lugar({ name: nombre("sitio"), locationType: "site", organizationId: org.id });
  const instalacion = await lugar({ name: nombre("cuarto"), locationType: "drying_facility", parentLocationId: sitio.id, organizationId: org.id, dryingEnvironment: "dark_room_climate_controlled" });
  const otraInstalacion = await lugar({ name: nombre("otro cuarto"), locationType: "drying_facility", parentLocationId: sitio.id, organizationId: org.id });
  const estante = await lugar({ name: nombre("estante"), locationType: "drying_rack", parentLocationId: instalacion.id, organizationId: org.id });
  for (let nivel = 1; nivel <= 3; nivel++) for (let puesto = 1; puesto <= 2; puesto++) {
    await lugar({ name: nombre(`N${nivel}P${puesto}`), locationType: "drying_bed", parentLocationId: estante.id, organizationId: org.id, rackLevel: nivel, rackSlot: puesto });
  }
  // Una cama colgada directamente de la instalación, con nivel y sin estante.
  await lugar({ name: nombre("cama N5"), locationType: "drying_bed", parentLocationId: instalacion.id, organizationId: org.id, rackLevel: 5 });
  const estanteAjeno = await lugar({ name: nombre("estante ajeno"), locationType: "drying_rack", parentLocationId: otraInstalacion.id, organizationId: org.id });
  await lugar({ name: nombre("ajeno N1P1"), locationType: "drying_bed", parentLocationId: estanteAjeno.id, organizationId: org.id, rackLevel: 1, rackSlot: 1 });
  return {
    sitio: sitio.id, instalacion: instalacion.id, otraInstalacion: otraInstalacion.id, estante: estante.id, estanteAjeno: estanteAjeno.id,
    operario: await cuenta("operario", sitio.id), extrano: await cuenta("extrano"),
  };
}

/** Un INSERT que no pasa por el servicio: es lo que prueba que la regla vive en la base. */
async function insertarCruda(datos: Record<string, unknown>) {
  const fila = await prisma.dryingAmbientReading.create({ data: {
    facilityLocationId: m.instalacion, occurredAt: new Date("2026-09-21T14:00:00Z"),
    airTemperatureC: 24, temperatureEntryUnit: "C", provenanceClass: "measured_fact",
    ...datos,
  } as never });
  lecturaIds.push(fila.id);
  return fila;
}

beforeAll(async () => { m = await montaje(); });

afterAll(async () => {
  // Las lecturas no se borran salvo por la puerta de pruebas, igual que los pesajes.
  // Primero las correcciones (apuntan a su original con RESTRICT).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL nn.limpieza_de_pruebas = 'on'`;
    await tx.dryingAmbientReading.deleteMany({ where: assertDefinedWhere({ facilityLocationId: { in: locationIds }, supersedesId: { not: null } }) });
    await tx.dryingAmbientReading.deleteMany({ where: assertDefinedWhere({ facilityLocationId: { in: locationIds } }) });
  });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: accountIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: accountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: accountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
  for (const id of [...locationIds].reverse()) await prisma.location.delete({ where: { id } });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgIds } }) });
});

describe("las reglas de la lectura de ambiente viven en la base", () => {
  it("control positivo: una lectura general válida entra", async () => {
    const fila = await insertarCruda({});
    expect(fila.sourceType).toBe("manual");
  });
  it("una lectura sin ninguna de las cuatro cosas se rechaza; con sólo el cielo, entra", async () => {
    await expect(insertarCruda({ airTemperatureC: null, temperatureEntryUnit: null })).rejects.toThrow(/drying_ambient_reading_algo_medido/);
    await expect(insertarCruda({ airTemperatureC: null, temperatureEntryUnit: null, skyCondition: "cloudy", provenanceClass: "direct_observation" })).resolves.toBeTruthy();
  });
  it("temperatura fuera de -10..80 °C y HR fuera de 0..100 se rechazan; los bordes entran", async () => {
    await expect(insertarCruda({ airTemperatureC: 80.1 })).rejects.toThrow(/drying_ambient_reading_temperatura_en_rango/);
    await expect(insertarCruda({ relativeHumidityPct: 100.1 })).rejects.toThrow(/drying_ambient_reading_hr_en_rango/);
    await expect(insertarCruda({ airTemperatureC: 80, relativeHumidityPct: 100 })).resolves.toBeTruthy();
  });
  it("temperatura sin unidad tecleada, o unidad sin temperatura, se rechaza", async () => {
    await expect(insertarCruda({ temperatureEntryUnit: null })).rejects.toThrow(/drying_ambient_reading_unidad_con_temperatura/);
    await expect(insertarCruda({ airTemperatureC: null, relativeHumidityPct: 60 })).rejects.toThrow(/drying_ambient_reading_unidad_con_temperatura/);
    await expect(insertarCruda({ temperatureEntryUnit: "K" })).rejects.toThrow(/drying_ambient_reading_unidad_con_temperatura/);
    await expect(insertarCruda({ temperatureEntryUnit: "F" })).resolves.toBeTruthy();
  });
  it("una nota sin su valor de catálogo se rechaza: la nota nunca va en su lugar", async () => {
    await expect(insertarCruda({ skyNote: "bruma" })).rejects.toThrow(/drying_ambient_reading_nota_de_cielo_con_valor/);
    await expect(insertarCruda({ ventilationNote: "puerta" })).rejects.toThrow(/drying_ambient_reading_nota_de_ventilacion_con_valor/);
    await expect(insertarCruda({ skyCondition: "partly_cloudy", skyNote: "bruma", ventilation: "semi_open", ventilationNote: "puerta" })).resolves.toBeTruthy();
  });
  it("sólo measured_fact o direct_observation", async () => {
    await expect(insertarCruda({ provenanceClass: "hypothesis" })).rejects.toThrow(/drying_ambient_reading_procedencia/);
  });
  it("el lugar tiene que ser una instalación de secado", async () => {
    await expect(insertarCruda({ facilityLocationId: m.sitio })).rejects.toThrow(/no es una instalacion de secado/);
  });
  it("el estante tiene que ser de ESA instalación", async () => {
    await expect(insertarCruda({ rackLocationId: m.estanteAjeno })).rejects.toThrow(/no es un estante de esta instalacion/);
    await expect(insertarCruda({ rackLocationId: m.estante })).resolves.toBeTruthy();
  });
  it("el nivel tiene que existir: en el estante si lo hay, en la instalación si no", async () => {
    await expect(insertarCruda({ rackLocationId: m.estante, rackLevel: 4 })).rejects.toThrow(/ese nivel no existe/);
    await expect(insertarCruda({ rackLocationId: m.estante, rackLevel: 3 })).resolves.toBeTruthy();
    await expect(insertarCruda({ rackLevel: 7 })).rejects.toThrow(/ese nivel no existe/);
    await expect(insertarCruda({ rackLevel: 5 })).resolves.toBeTruthy();  // la cama sin estante
    await expect(insertarCruda({ rackLevel: 3 })).resolves.toBeTruthy();  // nivel 3 del estante, sin nombrar estante
    await expect(insertarCruda({ rackLevel: 0 })).rejects.toThrow(/drying_ambient_reading_nivel_positivo/);
  });
  it("no se edita; sólo se marca superseded una vez", async () => {
    const fila = await insertarCruda({});
    await expect(prisma.dryingAmbientReading.update({ where: { id: fila.id }, data: { airTemperatureC: 30 } })).rejects.toThrow(/no se edita/);
    await expect(prisma.dryingAmbientReading.update({ where: { id: fila.id }, data: { supersededAt: new Date() } })).resolves.toBeTruthy();
  });
  it("no se borra fuera de la puerta de pruebas", async () => {
    const fila = await insertarCruda({});
    await expect(prisma.dryingAmbientReading.delete({ where: { id: fila.id } })).rejects.toThrow(/no se borra/);
  });
  it("una corrección exige razón, de la misma instalación, y un original tiene a lo sumo un sustituto", async () => {
    const original = await insertarCruda({});
    await expect(insertarCruda({ supersedesId: original.id })).rejects.toThrow(/drying_ambient_reading_correccion_con_razon/);
    await expect(insertarCruda({ supersedesId: original.id, correctionReason: "x", facilityLocationId: m.otraInstalacion })).rejects.toThrow(/misma instalacion/);
    await expect(insertarCruda({ supersedesId: original.id, correctionReason: "tecleé 42 por 24" })).resolves.toBeTruthy();
    await expect(insertarCruda({ supersedesId: original.id, correctionReason: "otra vez" })).rejects.toThrow(/drying_ambient_reading_supersedes_unico|Unique constraint/);
  });
  it("una instalación con lecturas no cambia de tipo ni de padre", async () => {
    // Instalaciones SIN hijos a propósito: sobre una con estantes, el disparador
    // `location_arbol_de_estante` (2a) responde antes —«Una instalacion con
    // estantes no cambia de tipo»— y esta sonda mediría la regla de otro.
    const sola = await lugar({ name: nombre("sola"), locationType: "drying_facility", parentLocationId: m.sitio });
    const control = await lugar({ name: nombre("control"), locationType: "drying_facility", parentLocationId: m.sitio });
    await insertarCruda({ facilityLocationId: sola.id });
    // Control positivo primero: los mismos dos UPDATE, sobre la que NO tiene lecturas, entran.
    await prisma.location.update({ where: { id: control.id }, data: { locationType: "drying_bed" } });
    await prisma.location.update({ where: { id: control.id }, data: { locationType: "drying_facility" } });
    await prisma.location.update({ where: { id: control.id }, data: { parentLocationId: null } });
    await prisma.location.update({ where: { id: control.id }, data: { parentLocationId: m.sitio } });
    await expect(prisma.location.update({ where: { id: sola.id }, data: { locationType: "drying_bed" } })).rejects.toThrow(/tiene lecturas de ambiente/);
    await expect(prisma.location.update({ where: { id: sola.id }, data: { parentLocationId: null } })).rejects.toThrow(/tiene lecturas de ambiente/);
  });
});
