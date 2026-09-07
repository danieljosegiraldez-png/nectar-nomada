/**
 * A9.9 (D6) — el compromiso de polinización y su cociente.
 *
 * El caso central es la aritmética que el dueño escribió: **17 ha a 4-6
 * colmenas/ha son 68-102 colonias contra las 3 que hay.** Si esta prueba deja
 * de dar 65-99 de déficit, o el cociente deja de ser 3/17, algo se rompió en el
 * único número que sostiene esa conversación con el cliente.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createColony, createHive, ApiaryAccessError } from "../../lib/apiary/hives";
import {
  PolinizacionValidationError,
  crearCompromisoDePolinizacion,
  densidadDePolinizacion,
} from "../../lib/apiary/polinizacion";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a99-pol-${Date.now()}`;
const AHORA = new Date("2026-09-07T12:00:00Z");

describe("A9.9 — el compromiso y el cociente", () => {
  let organizationId: string;
  let clienteId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let sinAccesoUserAccountId: string;
  let personId: string;
  let sinAccesoPersonId: string;
  const colonyIds: string[] = [];

  async function crearCuenta(etiqueta: string) {
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN_ID})`, locale: "es" },
    });
    const cuenta = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    return { personId: person.id, userAccountId: cuenta.id };
  }

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;

    // El cliente es una Organization canónica, no un nombre repetido.
    const cliente = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Cliente (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    clienteId = cliente.id;

    const yo = await crearCuenta("Polinizacion");
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
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperator.id, scopeId: scope.id } });

    // Las TRES colonias que hay, que es el numerador del caso real.
    for (let i = 0; i < 3; i++) {
      const hive = await createHive(userAccountId, { projectId, locationId, identifier: `P${i}-${RUN_ID.slice(-4)}` });
      const colony = await createColony(userAccountId, {
        hiveId: hive.id,
        originType: "purchased",
        startedAt: new Date("2026-01-01"),
        provenanceClass: "direct_observation",
      });
      colonyIds.push(colony.id);
    }
  });

  afterAll(async () => {
    await prisma.pollinationCommitment.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonyIds } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [userAccountId, sinAccesoUserAccountId] } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: [personId, sinAccesoPersonId] } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: [organizationId, clienteId] } }) });
  });

  it("sin compromiso no hay cifra — y eso NO es un déficit de cero", async () => {
    // Control positivo de todo lo que sigue: si esto no saliera vacío, las
    // aserciones de abajo no probarían que el compromiso es lo que las causa.
    expect(await densidadDePolinizacion(locationId, AHORA)).toEqual([]);
  });

  it("17 ha a 4-6 colmenas/ha contra 3 colonias: el déficit es 65-99", async () => {
    await crearCompromisoDePolinizacion(userAccountId, {
      locationId,
      clientOrganizationId: clienteId,
      committedHectares: 17,
      targetHivesPerHectareMin: 4,
      targetHivesPerHectareMax: 6,
      contractReference: `CONTRATO-${RUN_ID.slice(-4)}`,
      startsAt: new Date("2026-08-01"),
      endsAt: new Date("2026-12-31"),
    });

    const filas = await densidadDePolinizacion(locationId, AHORA);
    // Que sea UNA importa: si salieran dos, las cifras de abajo estarían
    // mirando un compromiso que no es el que acabo de crear.
    expect(filas).toHaveLength(1);
    const p = filas[0]!;
    expect(p.colonias).toBe(3);
    expect(p.hectareasComprometidas).toBe(17);
    // 17 × 4 = 68 y 17 × 6 = 102. Menos las 3 que hay: 65 y 99.
    expect(p.deficitParaMin).toBe(65);
    expect(p.deficitParaMax).toBe(99);
    expect(p.densidad).toBeCloseTo(3 / 17, 6);
    // La fuente viaja con la cifra: hoy es el conteo del SISTEMA, no el de la
    // visita, y D6 avisa de que los dos divergen.
    expect(p.fuenteDelConteo).toBe("sistema");
  });

  it("un compromiso vencido deja de gritar", async () => {
    const vencido = await crearCompromisoDePolinizacion(userAccountId, {
      locationId,
      clientOrganizationId: clienteId,
      committedHectares: 40,
      targetHivesPerHectareMin: 5,
      targetHivesPerHectareMax: 5,
      startsAt: new Date("2025-01-01"),
      endsAt: new Date("2025-12-31"),
    });
    const vigentes = await densidadDePolinizacion(locationId, AHORA);
    expect(vigentes.map((v) => v.compromisoId)).not.toContain(vencido.id);
    // Control: el mismo compromiso SÍ sale si se pregunta dentro de su ventana.
    const enSuMomento = await densidadDePolinizacion(locationId, new Date("2025-06-01"));
    expect(enSuMomento.map((v) => v.compromisoId)).toContain(vencido.id);
    await prisma.pollinationCommitment.deleteMany({ where: assertDefinedWhere({ id: vencido.id }) });
  });

  it("el déficit redondea hacia arriba, porque media colonia no existe", async () => {
    // 3,5 ha × 4 = 14 exactas; × 6 = 21. Con 0,5 más: 16 y 24 → 15,4 sube a 16.
    const c = await crearCompromisoDePolinizacion(userAccountId, {
      locationId,
      clientOrganizationId: clienteId,
      committedHectares: 3.85,
      targetHivesPerHectareMin: 4,
      targetHivesPerHectareMax: 4,
      startsAt: new Date("2026-08-01"),
    });
    const fila = (await densidadDePolinizacion(locationId, AHORA)).find((v) => v.compromisoId === c.id)!;
    // 3,85 × 4 = 15,4 → 16 cajas pobladas, menos las 3 que hay = 13.
    expect(fila.deficitParaMin).toBe(13);
    await prisma.pollinationCommitment.deleteMany({ where: assertDefinedWhere({ id: c.id }) });
  });

  it("rechaza un rango invertido, hectáreas no positivas y una ventana al revés", async () => {
    const base = {
      locationId,
      clientOrganizationId: clienteId,
      committedHectares: 10,
      targetHivesPerHectareMin: 4,
      targetHivesPerHectareMax: 6,
      startsAt: new Date("2026-08-01"),
    };
    await expect(
      crearCompromisoDePolinizacion(userAccountId, { ...base, targetHivesPerHectareMin: 8 }),
    ).rejects.toThrow(PolinizacionValidationError);
    await expect(
      crearCompromisoDePolinizacion(userAccountId, { ...base, committedHectares: 0 }),
    ).rejects.toThrow(PolinizacionValidationError);
    await expect(
      crearCompromisoDePolinizacion(userAccountId, { ...base, endsAt: new Date("2026-01-01") }),
    ).rejects.toThrow(PolinizacionValidationError);
    // Control positivo: lo VÁLIDO sí entra. Sin esto, «rechazó» no prueba que la
    // compuerta mire lo que dice mirar.
    const ok = await crearCompromisoDePolinizacion(userAccountId, base);
    expect(ok.id).toBeTruthy();
    await prisma.pollinationCommitment.deleteMany({ where: assertDefinedWhere({ id: ok.id }) });
  });

  it("quien no tiene acceso al sitio no puede comprometer sus colonias", async () => {
    await expect(
      crearCompromisoDePolinizacion(sinAccesoUserAccountId, {
        locationId,
        clientOrganizationId: clienteId,
        committedHectares: 17,
        targetHivesPerHectareMin: 4,
        targetHivesPerHectareMax: 6,
        startsAt: new Date("2026-08-01"),
      }),
    ).rejects.toThrow(ApiaryAccessError);
  });

  it("crear un compromiso deja su AuditEvent", async () => {
    const c = await crearCompromisoDePolinizacion(userAccountId, {
      locationId,
      clientOrganizationId: clienteId,
      committedHectares: 5,
      targetHivesPerHectareMin: 2,
      targetHivesPerHectareMax: 3,
      startsAt: new Date("2026-08-01"),
    });
    const evento = await prisma.auditEvent.findFirst({
      where: { entityType: "pollination_commitment", entityId: c.id },
      select: { operation: true, actorUserAccountId: true },
    });
    expect(evento?.operation).toBe("pollination_commitment.create");
    expect(evento?.actorUserAccountId).toBe(userAccountId);
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: c.id }) });
    await prisma.pollinationCommitment.deleteMany({ where: assertDefinedWhere({ id: c.id }) });
  });
});
