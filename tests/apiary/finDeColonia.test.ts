/**
 * Cuándo se perdió una colonia.
 *
 * **El hueco que esto cierra, medido el 2026-09-08:** `ColonyStatus` tenía
 * `dead` y `absconded` desde A1 y **ningún servicio los escribía jamás**. Lo que
 * estas pruebas afirman, y ninguna lectura del código puede afirmar, es que el
 * estado cambia de verdad, que queda con fecha, y —lo que más importa— que
 * **los conteos que sólo podían subir ahora bajan**.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  ApiaryAccessError,
  ColonyEndError,
  createColony,
  createHive,
  registrarFinDeColonia,
} from "../../lib/apiary/hives";
import { vitalesDeSitios } from "../../lib/apiary/vitalesDelSitio";
import { inmediatosDe } from "../../lib/apiary/bitacora";
import { leerEnmiendas } from "../../lib/traceability/enmiendas";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `fin-col-${Date.now()}`;
const AHORA = new Date("2026-09-09T12:00:00Z");

describe("el fin de una colonia", () => {
  let organizationId: string;
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

  async function nuevaColonia(indice: number) {
    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `F${indice}-${RUN_ID.slice(-4)}` });
    const colony = await createColony(userAccountId, {
      hiveId: hive.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
    colonyIds.push(colony.id);
    return colony;
  }

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;

    const yo = await crearCuenta("FinColonia");
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
  });

  afterAll(async () => {
    const cuentas = [userAccountId, sinAccesoUserAccountId];
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonyIds } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    // Assignment.scopeId es RESTRICT: el Scope sólo se puede borrar después.
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: [personId, sinAccesoPersonId] } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("una colonia nace activa y sin fecha de fin — el control positivo", async () => {
    const c = await nuevaColonia(0);
    expect(c.status).toBe("active");
    expect(c.endedAt).toBeNull();
  });

  it("registrar la pérdida cambia el estado Y deja la fecha", async () => {
    const c = await nuevaColonia(1);
    const despues = await registrarFinDeColonia(userAccountId, {
      colonyId: c.id,
      status: "dead",
      endedAt: new Date("2026-08-20T10:00:00Z"),
      reason: "sin reina desde julio",
    });
    expect(despues.status).toBe("dead");
    // La fecha es la declarada, NO la de registro: una pérdida se anota días
    // después y confundirlas haría mentir a la serie del año.
    expect(despues.endedAt?.toISOString()).toBe("2026-08-20T10:00:00.000Z");
  });

  it("EL CONTEO YA PUEDE BAJAR — que es lo que este cambio arregla", async () => {
    // Antes del 2026-09-08 `coloniasActivas` sólo podía subir, porque ningún
    // servicio escribía `dead`. Esta es la aserción que lo demuestra.
    const a = await nuevaColonia(2);
    const b = await nuevaColonia(3);
    const antes = (await vitalesDeSitios([locationId], AHORA)).get(locationId)!.coloniasActivas;

    await registrarFinDeColonia(userAccountId, { colonyId: a.id, status: "dead", endedAt: AHORA });
    const despues = (await vitalesDeSitios([locationId], AHORA)).get(locationId)!.coloniasActivas;

    expect(despues).toBe(antes - 1);
    // Control: la otra sigue activa, o sea que bajó por la que se perdió y no
    // porque el lector dejara de contar.
    const viva = await prisma.colony.findUniqueOrThrow({ where: { id: b.id } });
    expect(viva.status).toBe("active");
  });

  it("deja su AuditEvent con el antes, el después y el motivo", async () => {
    const c = await nuevaColonia(4);
    await registrarFinDeColonia(userAccountId, {
      colonyId: c.id,
      status: "absconded",
      endedAt: new Date("2026-07-01T08:00:00Z"),
      reason: "la caja apareció vacía",
    });
    const evento = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "colony", entityId: c.id, operation: "colony.end" },
    });
    expect(evento.reason).toBe("la caja apareció vacía");
    expect((evento.before as { status?: string }).status).toBe("active");
    expect((evento.after as { status?: string }).status).toBe("absconded");
  });

  it("la bitácora ya puede espejarlo — lo que A9.12 decía que no podía", async () => {
    const c = await nuevaColonia(5);
    await registrarFinDeColonia(userAccountId, { colonyId: c.id, status: "dead", endedAt: AHORA });
    const enmiendas = await leerEnmiendas([{ entityType: "colony", entityId: c.id }]);
    const mensajes = inmediatosDe(enmiendas, () => `/apiaries/${locationId}`);
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0]!.clase).toBe("inmediato");
    expect(mensajes[0]!.texto).toContain("perdió");
  });

  it("una colonia que ya terminó no se termina dos veces", async () => {
    const c = await nuevaColonia(6);
    await registrarFinDeColonia(userAccountId, { colonyId: c.id, status: "dead", endedAt: AHORA });
    await expect(
      registrarFinDeColonia(userAccountId, { colonyId: c.id, status: "absconded", endedAt: AHORA }),
    ).rejects.toThrow(ColonyEndError);
  });

  it("terminar antes de empezar se rechaza: es un reloj, no un registro", async () => {
    const c = await nuevaColonia(7);
    await expect(
      registrarFinDeColonia(userAccountId, { colonyId: c.id, status: "dead", endedAt: new Date("2025-01-01") }),
    ).rejects.toThrow(ColonyEndError);
    // Control positivo: la MISMA colonia sí acepta una fecha posterior. Sin
    // esto, «rechazó» no probaría que mira la fecha y no otra cosa.
    const ok = await registrarFinDeColonia(userAccountId, { colonyId: c.id, status: "dead", endedAt: AHORA });
    expect(ok.status).toBe("dead");
  });

  it("quien no tiene acceso al sitio no puede dar por perdida una colonia", async () => {
    const c = await nuevaColonia(8);
    await expect(
      registrarFinDeColonia(sinAccesoUserAccountId, { colonyId: c.id, status: "dead", endedAt: AHORA }),
    ).rejects.toThrow(ApiaryAccessError);
    // Y sigue viva: el rechazo no dejó a medias una escritura.
    const sinTocar = await prisma.colony.findUniqueOrThrow({ where: { id: c.id } });
    expect(sinTocar.status).toBe("active");
    expect(sinTocar.endedAt).toBeNull();
  });
});
