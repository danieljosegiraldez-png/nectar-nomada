/**
 * El fin de una colonia, anotado sin señal.
 *
 * **El hueco que cierra, medido el 2026-09-10:** la cola offline del apiario
 * aceptaba exactamente dos tipos, `inspection` y `colony_event`. El fin de una
 * colonia no estaba — y es justo el hecho que más se descubre en el campo: una
 * caja que aparece vacía. Había que volver con cobertura para poder anotarlo.
 *
 * **Y lo que estas pruebas defienden, que ninguna lectura del código puede
 * afirmar:** que reintentar un borrador cuya respuesta se perdió sea un
 * `duplicate` silencioso, y que «alguien llegó antes» sea un `rejected` que el
 * operador ve. Las dos llegan al servicio como el mismo error —
 * `colony_already_ended`— y confundirlas haría que se descartara un aviso real,
 * o que saltara una alarma por trabajo que sí se guardó.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { pushFieldEvents, type MutacionDeFinDeColonia } from "../../lib/sync/pushFieldEvents";
import { createHive, createColony } from "../../lib/apiary/hives";
import { CATALOGO_DE_CAUSA_DE_PERDIDA } from "../../lib/apiary/causaDePerdida";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `fin-offline-${Date.now()}`;
const PERDIDA = new Date("2026-09-08T10:00:00Z");

describe("un fin de colonia que llega por la cola", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let sinAccesoUserAccountId: string;
  let deviceId: string;
  const personIds: string[] = [];
  const colonyIds: string[] = [];
  let varroaId: string;

  async function crearCuenta(etiqueta: string) {
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN_ID})`, locale: "es" },
    });
    personIds.push(person.id);
    const cuenta = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    return cuenta.id;
  }

  async function nuevaColonia(i: number) {
    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `O${i}-${RUN_ID.slice(-4)}` });
    const colony = await createColony(userAccountId, {
      hiveId: hive.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
    colonyIds.push(colony.id);
    return colony;
  }

  function mutacion(colonyId: string, draftId: string, extra: Partial<MutacionDeFinDeColonia> = {}): MutacionDeFinDeColonia {
    return {
      kind: "colony_end",
      clientDraftId: draftId,
      colonyId,
      endedAt: PERDIDA,
      status: "dead",
      ...extra,
    };
  }

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;

    userAccountId = await crearCuenta("FinOffline");
    sinAccesoUserAccountId = await crearCuenta("SinAcceso");

    const project = await prisma.project.create({
      data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    projectId = project.id;

    const location = await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    });
    locationId = location.id;

    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });

    const device = await prisma.device.create({
      data: { label: `TEST PWA (${RUN_ID})`, platform: "pwa", createdBy: userAccountId },
    });
    deviceId = device.id;

    varroaId = (
      await prisma.variableCatalogValue.findFirstOrThrow({
        where: { value: "Varroa", catalog: { key: CATALOGO_DE_CAUSA_DE_PERDIDA } },
      })
    ).id;
  });

  afterAll(async () => {
    const cuentas = [userAccountId, sinAccesoUserAccountId];
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonyIds } }) });
    // La colocación es hija de la colmena y su FK es RESTRICT: sin esta línea el borrado
    // de abajo falla. `createHive` abre una desde el 2026-09-15 (ADR-135).
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.device.deleteMany({ where: assertDefinedWhere({ id: deviceId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("se aplica, con su causa y con la fecha DECLARADA", async () => {
    const c = await nuevaColonia(1);
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      mutacion(c.id, `${RUN_ID}-a`, { causas: [{ causeValueId: varroaId, provenanceClass: "hypothesis" }] }),
    ]);
    expect(r!.status).toBe("applied");

    const fila = await prisma.colony.findUniqueOrThrow({
      where: { id: c.id },
      include: { lossCauses: { include: { cause: { select: { value: true } } } } },
    });
    expect(fila.status).toBe("dead");
    // La fecha es la que declaró quien estuvo allí, no la de sincronizar.
    expect(fila.endedAt?.toISOString()).toBe(PERDIDA.toISOString());
    expect(fila.lossCauses).toHaveLength(1);
    expect(fila.lossCauses[0]!.cause.value).toBe("Varroa");
    expect(fila.lossCauses[0]!.provenanceClass).toBe("hypothesis");
    // Y queda la clave, que es lo que hace idempotente el reintento.
    expect(fila.endClientDraftId).toBe(`${RUN_ID}-a`);
  });

  it("EL MISMO borrador dos veces es `duplicate`, no un rechazo", async () => {
    // El caso real: la respuesta del primer envío se perdió y el teléfono
    // reintenta. Si esto dijera `rejected`, el operador vería una alarma por
    // trabajo que sí se guardó.
    const c = await nuevaColonia(2);
    const m = mutacion(c.id, `${RUN_ID}-b`);
    const [primero] = await pushFieldEvents(userAccountId, deviceId, [m]);
    const [segundo] = await pushFieldEvents(userAccountId, deviceId, [m]);
    expect(primero!.status).toBe("applied");
    expect(segundo!.status).toBe("duplicate");
    // Control: apuntan a la MISMA fila, no a dos.
    expect((segundo as { id: string }).id).toBe((primero as { id: string }).id);
    expect(await prisma.colonyLossCause.count({ where: { colonyId: c.id } })).toBe(0);
  });

  it("OTRO borrador sobre una colonia ya terminada es `rejected` — alguien llegó antes", async () => {
    // La otra mitad, y la razón de que la clave exista: sin ella esto y el caso
    // de arriba son indistinguibles.
    const c = await nuevaColonia(3);
    await pushFieldEvents(userAccountId, deviceId, [mutacion(c.id, `${RUN_ID}-c1`, { status: "absconded" })]);
    const [r] = await pushFieldEvents(userAccountId, deviceId, [mutacion(c.id, `${RUN_ID}-c2`)]);
    expect(r!.status).toBe("rejected");
    expect((r as { reason: string }).reason).toContain("already_ended");
    // Y el primer fin se mantiene: el segundo no lo sobreescribió.
    const fila = await prisma.colony.findUniqueOrThrow({ where: { id: c.id } });
    expect(fila.status).toBe("absconded");
    expect(fila.endClientDraftId).toBe(`${RUN_ID}-c1`);
  });

  it("sin acceso al sitio se rechaza, y la colonia no se toca", async () => {
    const c = await nuevaColonia(4);
    const [r] = await pushFieldEvents(sinAccesoUserAccountId, deviceId, [mutacion(c.id, `${RUN_ID}-d`)]);
    expect(r!.status).toBe("rejected");
    const fila = await prisma.colony.findUniqueOrThrow({ where: { id: c.id } });
    expect(fila.status).toBe("active");
    expect(fila.endedAt).toBeNull();
  });

  it("una clase de causa inventada se rechaza, no revienta el lote", async () => {
    // Importa que sea `rejected` y no una excepción: una excepción aquí abortaría
    // el lote entero y se llevaría por delante el trabajo bueno que venga detrás.
    const c = await nuevaColonia(5);
    const otra = await nuevaColonia(6);
    const resultados = await pushFieldEvents(userAccountId, deviceId, [
      mutacion(c.id, `${RUN_ID}-e1`, { causas: [{ causeValueId: varroaId, provenanceClass: "ai_suggestion" }] }),
      mutacion(otra.id, `${RUN_ID}-e2`),
    ]);
    expect(resultados[0]!.status).toBe("rejected");
    // Control positivo: la segunda SÍ se aplicó. Sin esto, «rechazó» no probaría
    // que el lote siguió vivo.
    expect(resultados[1]!.status).toBe("applied");
    expect((await prisma.colony.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("active");
  });
});
