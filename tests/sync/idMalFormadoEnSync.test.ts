/**
 * En el carril de sincronización, un id que no sirve es un NO del servidor, no
 * un 500 — y en un lote, el no es de esa mutación, no del lote entero.
 *
 * **El defecto, medido el 2026-10-14** con una sonda por el `POST` real de las
 * tres rutas, por cookie, contra una base desechable con `main` en `4b6e1148`:
 * nueve casos acababan en una excepción que la ruta no atrapaba —o sea, 500—.
 *
 * - Un id que no es UUID (`deviceId`, `fieldSessionId`, `eventKindValueId`,
 *   `operatorPersonId`) llegaba a una columna `@db.Uuid`, y Postgres lo rechazaba
 *   con `P2007`. Es lo que #696 cerró en las páginas con `lib/validation/uuid.ts`.
 * - Un `operatorPersonId` válido de una persona AJENA a la finca —y también uno
 *   basura, que `exigirPersonaPermitida` ya trata como ajeno— lanzaba
 *   `PersonaNoPermitidaError`, que ni la ruta de medios ni el lote atrapaban.
 *
 * **Por qué el lote importa más.** Un 500 dice «no llegué» y la cola lo
 * reintenta: una sola mutación mala tumbaba las buenas que la acompañaban y
 * volvía el lote un veneno que no salía nunca. Por eso los casos del lote van
 * MEZCLADOS con una buena, que es su control: tiene que quedar `applied`.
 *
 * Se entra por las rutas reales con la sesión de la cookie, como
 * `aparatoDelToken.test.ts`: `lib/auth/session` se sustituye porque arrastra
 * `next-auth`. El lote de apiario se llama al servicio, `pushFieldEvents`, que es
 * lo que la ruta invoca.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const cookie = vi.hoisted(() => ({ usuario: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: cookie.usuario }));

import { prisma } from "../../lib/db";
import { objectStorageProvider } from "../../lib/integrations/storage";
import { createColony, createHive } from "../../lib/apiary/hives";
import { pushFieldEvents } from "../../lib/sync/pushFieldEvents";
import { POST as postAparatos } from "../../app/api/v1/devices/route";
import { POST as postEventos } from "../../app/api/v1/sync/field-events/route";
import { POST as postMedios } from "../../app/api/v1/sync/field-media/route";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `p5idmal-${Date.now()}`;
const MALO = "no-es-un-uuid";

let userAccountId: string;
let sesionId: string;
let kindId: string;
let aparatoId: string;
let ajenaId: string;
let projectId: string;
let apiarioId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" } });
  const plotId = (await prisma.location.create({
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId: org.id, status: "approved",
            classification: "internal" } })).id;
  apiarioId = (await prisma.location.create({
    data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId: org.id, status: "approved",
            classification: "internal" } })).id;
  projectId = (await prisma.project.create({
    data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" } })).id;
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "IdMal", displayName: `TEST IdMal (${RUN_ID})`, locale: "es" } });
  // Una persona real que no es de esta finca ni del equipo: `exigirPersonaPermitida` la rechaza.
  ajenaId = (await prisma.person.create({
    data: { givenName: "TEST", familyName: "Ajena", displayName: `TEST Ajena (${RUN_ID})`, locale: "es" } })).id;
  userAccountId = (await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active" } })).id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  for (const s of [{ scopeType: "location" as const, scopeRefId: plotId }, { scopeType: "project" as const, scopeRefId: projectId }]) {
    const scope = await prisma.scope.create({ data: s });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
  }
  sesionId = (await prisma.fieldSession.create({
    data: { locationId: plotId, operatorPersonId: persona.id, startedAt: new Date("2026-08-28T07:00:00Z"),
            provenanceClass: "direct_observation", createdBy: userAccountId } })).id;
  kindId = (await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value: "observacion", catalog: { key: "event_kind" } } })).id;
  aparatoId = (await prisma.device.create({
    data: { label: `TEST aparato ${RUN_ID}`, platform: "android", createdBy: userAccountId } })).id;
});

afterEach(() => vi.restoreAllMocks());

// La limpieza DESCUBRE lo que borra por el RUN_ID: un `beforeAll` que murió a
// mitad se limpia igual. La auditoría va antes que las cuentas, o borrar la
// cuenta la deja con el actor a NULL (`ON DELETE SET NULL`).
afterAll(async () => {
  const orgs = await prisma.organization.findMany({ where: { name: { contains: RUN_ID } }, select: { id: true } });
  const locs = await prisma.location.findMany({ where: { name: { contains: RUN_ID } }, select: { id: true } });
  const proyectos = await prisma.project.findMany({ where: { name: { contains: RUN_ID } }, select: { id: true } });
  const personas = await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } });
  const cuentas = await prisma.userAccount.findMany({ where: { personId: { in: personas.map((p) => p.id) } }, select: { id: true } });
  const locIds = locs.map((l) => l.id);
  const cuentaIds = cuentas.map((c) => c.id);
  const sesIds = (await prisma.fieldSession.findMany({ where: { locationId: { in: locIds } }, select: { id: true } })).map((s) => s.id);
  const assetIds = (await prisma.fieldEvent.findMany({ where: { fieldSessionId: { in: sesIds } }, select: { assetId: true } }))
    .map((e) => e.assetId).filter((x): x is string => x != null);
  const colonias = (await prisma.colony.findMany({ where: { hive: { locationId: { in: locIds } } }, select: { id: true } })).map((c) => c.id);

  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentaIds } }) });
  await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId: { in: colonias } }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias } }) });
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId: { in: locIds } } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId: { in: locIds } }) });
  await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: { in: sesIds } }) });
  await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: { in: assetIds } }) });
  await prisma.asset.deleteMany({ where: assertDefinedWhere({ storageKey: { contains: RUN_ID } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: sesIds } }) });
  await prisma.device.deleteMany({ where: assertDefinedWhere({ label: { contains: RUN_ID } }) });
  const scopes = await prisma.assignment.findMany({ where: { userAccountId: { in: cuentaIds } }, select: { scopeId: true } });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentaIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes.map((s) => s.scopeId) } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentaIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas.map((p) => p.id) } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: proyectos.map((p) => p.id) } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgs.map((o) => o.id) } }) });
});

const peticion = (ruta: string, cuerpo: unknown) => {
  cookie.usuario.mockResolvedValueOnce({ userAccountId });
  return new Request(`http://localhost${ruta}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
};

const mutacion = (n: string, extra: Record<string, unknown> = {}) => ({
  clientDraftId: `${RUN_ID}-${n}`, fieldSessionId: sesionId, eventKindValueId: kindId,
  occurredAt: "2026-08-28T07:30:00Z", ...extra });

const foto = (n: string, extra: Record<string, unknown> = {}) => ({
  fieldSessionId: sesionId, storageKey: `nectar-originals/field/${sesionId}/${RUN_ID}-${n}.jpg`, mimeType: "image/jpeg",
  sizeBytes: 1234, originalFilename: "foto.jpg", clientDraftId: `${RUN_ID}-${n}`, occurredAt: "2026-08-28T07:30:00Z",
  ...extra });

const FINALIZAR = "/api/v1/sync/field-media?paso=finalizar";
const SOLICITAR = "/api/v1/sync/field-media?paso=solicitar";
const eventosDe = (n: string) => prisma.fieldEvent.count({ where: { clientDraftId: `${RUN_ID}-${n}` } });
const assetsDe = (n: string) => prisma.asset.count({ where: { storageKey: { contains: `${RUN_ID}-${n}` } } });

describe("un id del cuerpo que no es UUID es un no del servidor, no un 500", () => {
  it("field-events: un deviceId basura niega el lote con device_not_found", async () => {
    const res = await postEventos(peticion("/api/v1/sync/field-events", { deviceId: MALO, mutations: [mutacion("ev-dev")] }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("device_not_found");
    expect(await eventosDe("ev-dev")).toBe(0);
  });

  it("control: field-media finaliza una foto con el aparato real", async () => {
    const res = await postMedios(peticion(FINALIZAR, foto("med-ok", { deviceId: aparatoId })));
    expect(res.status).toBe(200);
    expect(await eventosDe("med-ok")).toBe(1);
  });

  it("field-media finalizar: deviceId, fieldSessionId u operatorPersonId basura dicen qué no existe", async () => {
    for (const [campo, error] of [["deviceId", "device_not_found"], ["fieldSessionId", "session_not_found"],
                                  ["operatorPersonId", "operator_not_found"]] as const) {
      const n = `med-${campo}`;
      const res = await postMedios(peticion(FINALIZAR, foto(n, { [campo]: MALO })));
      expect(res.status, campo).toBe(403);
      expect((await res.json()).error, campo).toBe(error);
      expect(await eventosDe(n), campo).toBe(0);
      expect(await assetsDe(n), campo).toBe(0);
    }
  });

  it("field-media solicitar: un fieldSessionId basura no firma ninguna subida", async () => {
    const firmar = vi.spyOn(objectStorageProvider, "putObject").mockResolvedValue({ uploadUrl: "https://firmada.test/put" });
    const res = await postMedios(peticion(SOLICITAR, { fieldSessionId: MALO, originalFilename: "f.jpg", contentType: "image/jpeg" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("session_not_found");
    expect(firmar).not.toHaveBeenCalled();
  });

  it("POST /devices: un operatorPersonId basura es operator_not_found, y el real sí da de alta", async () => {
    const malo = await postAparatos(peticion("/api/v1/devices", { label: `TEST op-malo ${RUN_ID}`, platform: "android", operatorPersonId: MALO }));
    expect(malo.status).toBe(400);
    expect((await malo.json()).error).toBe("operator_not_found");
    expect(await prisma.device.count({ where: { label: `TEST op-malo ${RUN_ID}` } })).toBe(0);

    const bueno = await postAparatos(peticion("/api/v1/devices", { label: `TEST op-ok ${RUN_ID}`, platform: "android", operatorPersonId: ajenaId }));
    expect(bueno.status).toBe(201);
  });
});

describe("en el lote, la mutación mala se rechaza sola y las buenas se aplican", () => {
  it("field-events: ids basura y un operador ajeno, mezclados con una buena", async () => {
    const res = await postEventos(peticion("/api/v1/sync/field-events", { deviceId: aparatoId, mutations: [
      mutacion("lote-buena"),
      mutacion("lote-ses", { fieldSessionId: MALO }),
      mutacion("lote-kind", { eventKindValueId: MALO }),
      mutacion("lote-op-basura", { operatorPersonId: MALO }),
      mutacion("lote-op-ajena", { operatorPersonId: ajenaId }),
    ] }));
    expect(res.status).toBe(200);
    const porBorrador = Object.fromEntries(((await res.json()).results as { clientDraftId: string; status: string; reason?: string }[])
      .map((r) => [r.clientDraftId.replace(`${RUN_ID}-`, ""), r.reason ?? r.status]));
    expect(porBorrador).toEqual({
      "lote-buena": "applied",
      "lote-ses": "session_not_found",
      "lote-kind": "event_kind_not_found",
      "lote-op-basura": "persona_no_permitida",
      "lote-op-ajena": "persona_no_permitida",
    });
    expect(await eventosDe("lote-buena")).toBe(1);
    expect(await eventosDe("lote-op-ajena")).toBe(0);
  });

  it("field-media finalizar: un operador real pero ajeno es persona_no_permitida, no un 500", async () => {
    const res = await postMedios(peticion(FINALIZAR, foto("med-ajena", { operatorPersonId: ajenaId })));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("persona_no_permitida");
    expect(await eventosDe("med-ajena")).toBe(0);
    expect(await assetsDe("med-ajena")).toBe(0);
  });

  it("apiario: una inspección con un operador ajeno se rechaza sola", async () => {
    const hive = await createHive(userAccountId, { projectId, locationId: apiarioId, identifier: `H-${RUN_ID.slice(-6)}` });
    const colony = await createColony(userAccountId, {
      hiveId: hive.id, originType: "captured", startedAt: new Date("2026-01-01"), provenanceClass: "direct_observation" });
    const inspeccion = (n: string, extra: Record<string, unknown> = {}) => ({
      kind: "inspection" as const, clientDraftId: `${RUN_ID}-${n}`, colonyId: colony.id,
      occurredAt: new Date("2026-03-10T09:00:00Z"), outcome: "nothing_unusual" as const, ...extra });
    const resultados = await pushFieldEvents(userAccountId, aparatoId, [
      inspeccion("api-buena"),
      inspeccion("api-ajena", { operatorPersonId: ajenaId }),
    ] as never);
    expect(resultados.map((r) => ("reason" in r && r.reason) || r.status)).toEqual(["applied", "persona_no_permitida"]);
    expect(await prisma.inspection.count({ where: { clientDraftId: `${RUN_ID}-api-ajena` } })).toBe(0);
  });
});
