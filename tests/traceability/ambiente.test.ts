import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { AmbienteError, ambienteDeInstalacion, puedeRegistrarAmbienteEn, registrarLecturaDeAmbiente } from "../../lib/traceability/ambiente";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { PersonaNoPermitidaError } from "../../lib/people/quienLoHizo";

/**
 * Paso 4 del secado por bandeja (spec §4.5): la lectura de ambiente a mano.
 * Montaje propio y directo en la base: un sitio con su organización, una
 * instalación, un estante de 3 niveles × 2 puestos, una cama sin estante con
 * `rackLevel` 5 (el modelo anterior al 2a, que sigue siendo válido), y un
 * Farm Operator asignado al SITIO — `can()` sube por el árbol, así que eso le
 * da `sample:manage` sobre la instalación. `extrano` no tiene asignación.
 */
/**
 * Cada fila dice DE QUÉ CORRIDA es, no sólo que es de prueba.
 *
 * **El caso que lo obligó, medido el 2026-09-27.** La limpieza de este archivo está bien: corrido
 * contra una base propia recién migrada, 21 pruebas en verde y **delta cero** en las ocho tablas
 * que toca. Pero el 2026-09-21 una corrida **murió a mitad del `afterAll`** —la transacción de las
 * lecturas sí se aplicó, 0 lecturas quedaron, y todo lo posterior se quedó: 15 ubicaciones, 2
 * personas, 2 cuentas, 1 asignación y 1 organización, 18 filas en la base COMPARTIDA—.
 *
 * Con sólo `randomUUID()` esas 18 filas **no se podían atribuir a una corrida**: no es que no se
 * limpiaran, es que no se podían ni contar ni separar de las de otra vez. Un conjunto que el
 * instrumento no puede medir se lee como vacío.
 *
 * El `RUN` va **entre paréntesis y con la época en milisegundos**, igual que `a9-vs-…`, `fito-…` o
 * `t5-…`, para que la misma extracción que agrupa la deuda de la base compartida por corrida
 * reconozca también éstas. El `randomUUID` se queda: distingue dos entidades dentro de la misma
 * corrida sin depender de que sus etiquetas nunca se repitan.
 */
const RUN = `amb-${Date.now()}`;
const nombre = (e: string) => `TEST AMB ${e} (${RUN}-${randomUUID().slice(0, 8)})`;
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

/** El TIPO y el mensaje EXACTO: un error de Prisma cita código cercano y un
 *  `toThrow(cadena)` puede casar con un `throw` de otra rama (capacidadDeBandeja.test.ts, F3). */
async function rechazaCon(promesa: Promise<unknown>, mensaje: string) {
  const error = await promesa.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(AmbienteError);
  expect((error as AmbienteError).message).toBe(mensaje);
}
const hora = new Date("2026-09-21T15:00:00Z");

describe("registrar una lectura de ambiente", () => {
  it("rechaza como operador a una persona ajena a la finca", async () => {
    await expect(registrarLecturaDeAmbiente(m.operario.userAccountId, {
      facilityLocationId: m.instalacion,
      occurredAt: hora,
      cielo: "cloudy",
      operatorPersonId: m.extrano.personId,
    })).rejects.toBeInstanceOf(PersonaNoPermitidaError);
  });
  it("en °F se guarda en °C con un decimal y conserva la unidad tecleada; con medida, measured_fact", async () => {
    const { id } = await registrarLecturaDeAmbiente(m.operario.userAccountId, {
      facilityLocationId: m.instalacion, occurredAt: hora, temperatura: { valor: 75.2, unidad: "F" }, humedadRelativaPct: 61.5,
      operatorPersonId: m.operario.personId,
    });
    lecturaIds.push(id);
    const fila = await prisma.dryingAmbientReading.findUniqueOrThrow({ where: { id } });
    expect(Number(fila.airTemperatureC)).toBe(24);
    expect(fila.temperatureEntryUnit).toBe("F");
    expect(Number(fila.relativeHumidityPct)).toBe(61.5);
    expect(fila.provenanceClass).toBe("measured_fact");
    expect(fila.sourceType).toBe("manual");
  });
  it("sólo cielo y ventilación: direct_observation", async () => {
    const { id } = await registrarLecturaDeAmbiente(m.operario.userAccountId, {
      facilityLocationId: m.instalacion, occurredAt: hora, cielo: "rain", ventilacion: "closed", notaVentilacion: "  lona bajada  ",
    });
    lecturaIds.push(id);
    const fila = await prisma.dryingAmbientReading.findUniqueOrThrow({ where: { id } });
    expect(fila.provenanceClass).toBe("direct_observation");
    expect(fila.ventilationNote).toBe("lona bajada");
  });
  it("vacía, nota sin valor, °C con dos decimales, fuera de rango y punto ajeno se rechazan con su motivo", async () => {
    const u = m.operario.userAccountId;
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, occurredAt: hora }), "lectura_vacia");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, occurredAt: hora, humedadRelativaPct: 60, notaCielo: "bruma" }), "nota_sin_valor");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, occurredAt: hora, temperatura: { valor: 24.35, unidad: "C" } }), "datos_invalidos");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, occurredAt: hora, temperatura: { valor: 95, unidad: "C" } }), "fuera_de_rango");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, occurredAt: hora, humedadRelativaPct: 101 }), "fuera_de_rango");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, rackLocationId: m.estanteAjeno, occurredAt: hora, humedadRelativaPct: 60 }), "punto_invalido");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, rackLocationId: m.estante, rackLevel: 4, occurredAt: hora, humedadRelativaPct: 60 }), "punto_invalido");
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.estante, occurredAt: hora, humedadRelativaPct: 60 }), "instalacion_invalida");
  });
  it("sin sample:manage sobre la instalación no registra ni ve; control: el operario sí", async () => {
    const intento = registrarLecturaDeAmbiente(m.extrano.userAccountId, { facilityLocationId: m.instalacion, occurredAt: hora, humedadRelativaPct: 60 });
    await expect(intento).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(ambienteDeInstalacion(m.extrano.userAccountId, m.instalacion)).rejects.toBeInstanceOf(TraceabilityAccessError);
    expect(await puedeRegistrarAmbienteEn(m.extrano.userAccountId, m.instalacion)).toBe(false);
    expect(await puedeRegistrarAmbienteEn(m.operario.userAccountId, m.instalacion)).toBe(true);
  });
  it("corregir: exige razón, supersede la original y la vigente pasa a ser la corrección", async () => {
    const u = m.operario.userAccountId;
    const { id: original } = await registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, rackLocationId: m.estante, rackLevel: 2, occurredAt: hora, temperatura: { valor: 42, unidad: "C" } });
    lecturaIds.push(original);
    await rechazaCon(registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, rackLocationId: m.estante, rackLevel: 2, occurredAt: hora, temperatura: { valor: 24, unidad: "C" }, supersedesId: original }), "datos_invalidos");
    const { id: correccion } = await registrarLecturaDeAmbiente(u, {
      facilityLocationId: m.instalacion, rackLocationId: m.estante, rackLevel: 2, occurredAt: hora,
      temperatura: { valor: 24, unidad: "C" }, supersedesId: original, correctionReason: "tecleé 42 por 24",
    });
    lecturaIds.push(correccion);
    const { vigentes, recientes } = await ambienteDeInstalacion(u, m.instalacion);
    const delNivel2 = vigentes.filter((v) => v.rackId === m.estante && v.rackLevel === 2);
    expect(delNivel2.map((v) => v.id)).toEqual([correccion]);
    expect(delNivel2[0]?.airTemperatureC).toBe(24);
    // La sustitución se ESCRIBE, no sólo gana por ser más nueva: sin el
    // `supersededAt`, la original seguiría viva y saldría en `recientes`
    // (revisión de Codex de las tareas 2 y 3).
    const [filaOriginal, filaCorreccion] = await Promise.all([
      prisma.dryingAmbientReading.findUniqueOrThrow({ where: { id: original } }),
      prisma.dryingAmbientReading.findUniqueOrThrow({ where: { id: correccion } }),
    ]);
    expect(filaOriginal.supersededAt).not.toBeNull();
    expect(filaCorreccion.supersedesId).toBe(original);
    expect(filaCorreccion.correctionReason).toBe("tecleé 42 por 24");
    expect(recientes.map((r) => r.id)).not.toContain(original);
  });
  it("vigentes: una por punto, la más reciente de cada uno; recientes, las últimas de todos", async () => {
    const u = m.operario.userAccountId;
    const registra = async (h: string, punto: { rackLocationId?: string; rackLevel?: number }) => {
      const { id } = await registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, occurredAt: new Date(h), humedadRelativaPct: 60, ...punto });
      lecturaIds.push(id);
      return id;
    };
    await registra("2026-09-22T06:00:00Z", { rackLocationId: m.estante, rackLevel: 1 });
    const nueva = await registra("2026-09-22T09:00:00Z", { rackLocationId: m.estante, rackLevel: 1 });
    const { vigentes, recientes } = await ambienteDeInstalacion(u, m.instalacion);
    expect(vigentes.filter((v) => v.rackId === m.estante && v.rackLevel === 1).map((v) => v.id)).toEqual([nueva]);
    expect(recientes[0]?.id).toBe(nueva);
    expect(recientes.length).toBeLessThanOrEqual(20);
  });
  it("recientes: con 21 lecturas nuevas salen exactamente las 20 más recientes, en orden", async () => {
    // Veintiuna lecturas posteriores a todas las de las pruebas anteriores, una por
    // minuto: la más vieja de ellas es la que tiene que quedar fuera. Sin este
    // caso, «como mucho 20» pasaba igual quitando el `take` (revisión de Codex).
    const u = m.operario.userAccountId;
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      const occurredAt = new Date(Date.UTC(2026, 8, 23, 8, i));
      const { id } = await registrarLecturaDeAmbiente(u, { facilityLocationId: m.instalacion, occurredAt, humedadRelativaPct: 60 });
      lecturaIds.push(id);
      ids.push(id);
    }
    const { recientes } = await ambienteDeInstalacion(u, m.instalacion);
    expect(recientes.map((r) => r.id)).toEqual(ids.slice(1).reverse());
  });
});
