/**
 * P4 §9 — el operador de un aparato **no autoriza nada**.
 *
 * Decisión del dueño, 2026-09-05: los aparatos son **personales**, uno por
 * persona. Eso cierra §9 sin tabla de roster: `Device.operatorPersonId`, el
 * campo único que ya existe, basta.
 *
 * Lo que queda es el guardia. §9 dice que un PIN verificado sin red es
 * atribución y no autenticación, y que **nunca** debe desbloquear permisos. Con
 * aparatos personales el PIN ni siquiera hace falta — pero la propiedad que
 * había que proteger sigue siendo la misma, y ahora tiene tests: **ni el
 * `operatorPersonId` del aparato ni el de la mutación conceden acceso**. La
 * autorización es siempre la cuenta que sincroniza, contra la Location.
 *
 * Sin esto, la forma de romperlo es tentadora y silenciosa: alguien lee
 * «el aparato está registrado a Kenneth» y lo usa para decidir qué puede
 * escribir. Estos dos casos fallan el día que alguien lo haga.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { pushFieldEvents } from "../../lib/sync/pushFieldEvents";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `p4dev-${Date.now()}`;
let organizationId: string;
let plotMio: string;
let plotAjeno: string;
let personaDelAparato: string;
let otraPersona: string;
let userAccountId: string;
let deviceId: string;
let sesionMia: string;
let sesionAjena: string;
let kindId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" } });
  organizationId = org.id;
  const mk = async (n: string) => (await prisma.location.create({
    data: { locationType: "plot", name: `TEST ${n} (${RUN_ID})`, organizationId, status: "approved", classification: "internal" } })).id;
  plotMio = await mk("Mio");
  plotAjeno = await mk("Ajeno");

  const persona = async (n: string) => (await prisma.person.create({
    data: { givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN_ID})`, locale: "es" } })).id;
  personaDelAparato = await persona("DuenoDelAparato");
  otraPersona = await persona("OtroOperador");
  await prisma.organizationMembership.createMany({
    data: [personaDelAparato, otraPersona].map((personId) => ({ personId, organizationId })),
  });

  const cuenta = await prisma.userAccount.create({
    data: { personId: personaDelAparato, authProvider: "credentials", status: "active" } });
  userAccountId = cuenta.id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const sc = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotMio } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: sc.id } });

  // Aparato PERSONAL: registrado a su dueño, que es la decisión de §9.
  deviceId = (await prisma.device.create({
    data: { label: `TEST personal (${RUN_ID})`, platform: "pwa",
            operatorPersonId: personaDelAparato, createdBy: userAccountId } })).id;

  const ses = async (loc: string) => (await prisma.fieldSession.create({
    data: { locationId: loc, operatorPersonId: personaDelAparato, startedAt: new Date("2026-08-28T07:00:00Z"),
            provenanceClass: "direct_observation", createdBy: userAccountId } })).id;
  sesionMia = await ses(plotMio);
  sesionAjena = await ses(plotAjeno);

  kindId = (await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value: "observacion", catalog: { key: "event_kind" } } })).id;
});

afterAll(async () => {
  const ids = [plotMio, plotAjeno];
  const ses = await prisma.fieldSession.findMany({ where: { locationId: { in: ids } }, select: { id: true } });
  const sesIds = ses.map((s) => s.id);
  await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: { in: sesIds } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: sesIds } }) });
  await prisma.device.deleteMany({ where: assertDefinedWhere({ id: deviceId }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: ids } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
  await prisma.organizationMembership.deleteMany({ where: assertDefinedWhere({ personId: { in: [personaDelAparato, otraPersona] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

const mut = (sesion: string, n: string, operatorPersonId?: string) => ({
  clientDraftId: `${RUN_ID}-${n}`,
  fieldSessionId: sesion,
  eventKindValueId: kindId,
  occurredAt: new Date("2026-08-28T07:30:00Z"),
  ...(operatorPersonId ? { operatorPersonId } : {}),
});

describe("el operador de un aparato no es una llave", () => {
  /**
   * Atribuir a otra Persona de la misma finca sigue siendo independiente del
   * dueño del aparato: quien hace el trabajo normalmente NO tiene cuenta.
   */
  it("atribuir a alguien de la finca distinto del dueño del aparato funciona", async () => {
    const [r] = await pushFieldEvents(userAccountId, deviceId, [mut(sesionMia, "otro", otraPersona)]);
    expect(r!.status).toBe("applied");
    const fila = await prisma.fieldEvent.findUniqueOrThrow({ where: { clientDraftId: `${RUN_ID}-otro` } });
    expect(fila.operatorPersonId).toBe(otraPersona);
    expect(fila.deviceId).toBe(deviceId);
  });

  /**
   * **El guardia.** El aparato está registrado a una Persona real y la jornada
   * también lleva su nombre — y aun así el lote ajeno se niega, porque la
   * autorización es de la CUENTA contra la Location, no del aparato ni de la
   * atribución.
   */
  it("el aparato registrado no abre una Location que la cuenta no tiene", async () => {
    const [r] = await pushFieldEvents(userAccountId, deviceId, [mut(sesionAjena, "ajeno")]);
    expect(r!.status).toBe("rejected");
    expect(await prisma.fieldEvent.count({ where: { clientDraftId: `${RUN_ID}-ajeno` } })).toBe(0);
  });

  it("ni atribuyéndolo al dueño del aparato: sigue siendo la cuenta quien decide", async () => {
    const [r] = await pushFieldEvents(userAccountId, deviceId, [mut(sesionAjena, "ajeno2", personaDelAparato)]);
    expect(r!.status).toBe("rejected");
    expect(await prisma.fieldEvent.count({ where: { clientDraftId: `${RUN_ID}-ajeno2` } })).toBe(0);
  });
});
