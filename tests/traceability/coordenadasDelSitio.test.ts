/**
 * Un sitio aprende dónde está de las visitas que se abrieron en él.
 *
 * Las dos funciones puras se prueban contra aritmética conocida —una distancia
 * que se puede comprobar a mano, una mediana que ignora un valor absurdo— y la
 * escritura contra Postgres, que es lo único que puede afirmar que la compuerta
 * cierra y que el `AuditEvent` queda.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { LocationAccessError } from "../../lib/traceability/locations";
import {
  CoordenadasValidationError,
  confirmarCoordenadasDelSitio,
  coordenadasPropuestas,
  mediana,
  metrosEntre,
} from "../../lib/traceability/coordenadasDelSitio";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `coord-${Date.now()}`;

// Toabré, Coclé — el orden de magnitud real, no coordenadas inventadas como
// hechos: son el punto de partida sintético de un fixture, y nada las publica.
const BASE = { latitude: 8.5, longitude: -80.5 };

describe("la aritmética, contra números comprobables a mano", () => {
  it("un grado de latitud son unos 111 km", () => {
    const m = metrosEntre({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
    expect(m).toBeGreaterThan(110_000);
    expect(m).toBeLessThan(112_000);
  });

  it("la misma coordenada dista cero", () => {
    expect(metrosEntre(BASE, BASE)).toBe(0);
  });

  it("la mediana ignora una lectura absurda; el promedio no", () => {
    // Tres lecturas del sitio y una del teléfono que fijó posición en la
    // carretera. La mediana se queda en el sitio.
    const valores = [8.5001, 8.5002, 8.5003, 9.9];
    expect(mediana(valores)).toBeCloseTo((8.5002 + 8.5003) / 2, 7);
    // Control: el promedio SÍ se va, que es la razón de no usarlo.
    const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
    expect(promedio).toBeGreaterThan(8.8);
  });

  it("con número impar toma el central de verdad", () => {
    expect(mediana([3, 1, 2])).toBe(2);
  });
});

describe("proponer y confirmar, contra Postgres", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let sinAccesoUserAccountId: string;
  let personId: string;
  let sinAccesoPersonId: string;

  async function crearCuenta(etiqueta: string) {
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN_ID})`, locale: "es" },
    });
    const cuenta = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    return { personId: person.id, userAccountId: cuenta.id };
  }

  async function abrirVisita(latitude: number | null, longitude: number | null, accuracyM: number | null) {
    return prisma.fieldSession.create({
      data: {
        locationId,
        operatorPersonId: personId,
        startedAt: new Date(),
        startLatitude: latitude,
        startLongitude: longitude,
        startAccuracyM: accuracyM,
        provenanceClass: "direct_observation",
      },
    });
  }

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;

    const yo = await crearCuenta("Coordenadas");
    personId = yo.personId;
    userAccountId = yo.userAccountId;
    const otro = await crearCuenta("SinAcceso");
    sinAccesoPersonId = otro.personId;
    sinAccesoUserAccountId = otro.userAccountId;

    const project = await prisma.project.create({
      data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    projectId = project.id;

    const location = await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    });
    locationId = location.id;

    const farmOperator = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperator.id, scopeId: scope.id } });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: locationId }) });
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [userAccountId, sinAccesoUserAccountId] } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: [personId, sinAccesoPersonId] } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("sin visitas no propone nada — y eso no es una coordenada cero", async () => {
    // Control positivo de todo lo que sigue: si esto ya propusiera algo, las
    // aserciones de abajo no probarían que las visitas son lo que lo causa.
    const p = await coordenadasPropuestas(locationId);
    expect(p.muestras).toBe(0);
    expect(p.propuesta).toBeNull();
    expect(p.yaDeclaradas).toBeNull();
    expect(p.dispersionM).toBeNull();
  });

  it("una visita SIN GPS no cuenta como muestra", async () => {
    const sinGps = await abrirVisita(null, null, null);
    const p = await coordenadasPropuestas(locationId);
    expect(p.muestras).toBe(0);
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: sinGps.id }) });
  });

  it("tres visitas proponen la mediana, con su dispersión y su mejor precisión", async () => {
    await abrirVisita(BASE.latitude + 0.00001, BASE.longitude, 12);
    await abrirVisita(BASE.latitude + 0.00002, BASE.longitude, 5);
    await abrirVisita(BASE.latitude + 0.00003, BASE.longitude, 30);

    const p = await coordenadasPropuestas(locationId);
    expect(p.muestras).toBe(3);
    expect(p.propuesta!.latitude).toBeCloseTo(BASE.latitude + 0.00002, 9);
    // La lectura más lejana está a ~1,1 m de la mediana: un grado son 111 km.
    expect(p.dispersionM).toBeGreaterThan(0.5);
    expect(p.dispersionM).toBeLessThan(3);
    // La precisión la declara el aparato; se toma la mejor, no se promedia.
    expect(p.mejorPrecisionM).toBe(5);
    expect(p.distanciaALoDeclaradoM).toBeNull();
  });

  it("una lectura de la carretera se ve en la dispersión, no en la propuesta", async () => {
    const lejos = await abrirVisita(BASE.latitude + 0.03, BASE.longitude, 40);
    const p = await coordenadasPropuestas(locationId);
    // Cuatro muestras: la mediana sigue pegada al sitio...
    expect(p.muestras).toBe(4);
    expect(p.propuesta!.latitude).toBeLessThan(BASE.latitude + 0.001);
    // ...y la dispersión lo grita: kilómetros, no metros.
    expect(p.dispersionM).toBeGreaterThan(3_000);
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: lejos.id }) });
  });

  it("confirmar escribe el sitio y deja su AuditEvent con el antes y el después", async () => {
    const p = await coordenadasPropuestas(locationId);
    const despues = await confirmarCoordenadasDelSitio(userAccountId, {
      locationId,
      latitude: p.propuesta!.latitude,
      longitude: p.propuesta!.longitude,
      reason: "confirmado con tres visitas",
    });
    expect(despues.latitude).toBeCloseTo(p.propuesta!.latitude, 9);

    const evento = await prisma.auditEvent.findFirst({
      where: { entityType: "location", entityId: locationId, operation: "location.declare_coordinates" },
      select: { before: true, after: true, reason: true, actorUserAccountId: true },
    });
    expect(evento?.actorUserAccountId).toBe(userAccountId);
    expect(evento?.reason).toBe("confirmado con tres visitas");
    // El ANTES tiene que decir que no había nada. Sin eso, el rastro no
    // distingue «se declaró por primera vez» de «se corrigió».
    expect((evento?.before as { latitude: number | null }).latitude).toBeNull();
    expect((evento?.after as { latitude: number | null }).latitude).not.toBeNull();
  });

  it("ya declarado, la propuesta dice a qué distancia está de lo declarado", async () => {
    const p = await coordenadasPropuestas(locationId);
    expect(p.yaDeclaradas).not.toBeNull();
    // Se confirmó exactamente la propuesta, así que la distancia es ~0.
    expect(p.distanciaALoDeclaradoM).toBeLessThan(0.01);
  });

  it("rechaza coordenadas fuera del sistema de referencia", async () => {
    await expect(
      confirmarCoordenadasDelSitio(userAccountId, { locationId, latitude: 91, longitude: 0 }),
    ).rejects.toThrow(CoordenadasValidationError);
    await expect(
      confirmarCoordenadasDelSitio(userAccountId, { locationId, latitude: 0, longitude: -181 }),
    ).rejects.toThrow(CoordenadasValidationError);
    // Control positivo: lo válido SÍ entra. Sin esto, «rechazó» no prueba que
    // la comprobación mire lo que dice mirar.
    const ok = await confirmarCoordenadasDelSitio(userAccountId, { locationId, latitude: -33.4, longitude: 151.2 });
    expect(ok.latitude).toBeCloseTo(-33.4, 9);
  });

  it("quien no tiene acceso al sitio no puede declarar dónde está", async () => {
    await expect(
      confirmarCoordenadasDelSitio(sinAccesoUserAccountId, { locationId, latitude: 8.5, longitude: -80.5 }),
    ).rejects.toThrow(LocationAccessError);
  });
});
