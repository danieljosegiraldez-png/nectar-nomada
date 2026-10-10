/**
 * P4 §2 — el aparato que escribe es el del token, no el que diga el cuerpo.
 *
 * **El defecto, visto el 2026-10-09.** Las dos rutas de escritura del carril de
 * sincronización tomaban el `deviceId` del CUERPO de la petición, y el del token
 * (`Principal.deviceId`) se construía y no se leía en ninguna parte. Con el
 * access todavía vigente de un aparato REVOCADO —hasta una hora— bastaba mandar
 * en el cuerpo el id de otro aparato vivo: `pushFieldEvents` comprobaba
 * `revokedAt` sobre ése, la revocación no mordía, y la fila quedaba atribuida a
 * un aparato que no la capturó.
 *
 * **Por qué se llama a la ruta y no al servicio.** El servicio estaba bien:
 * comprueba el aparato que le dan. Lo que fallaba es QUÉ aparato le da la ruta,
 * así que la única prueba que lo ve es la que entra por la ruta con un Bearer de
 * verdad. `lib/auth/session` se sustituye porque arrastra `next-auth`, que
 * vitest no resuelve (lo cuenta la cabecera de `deviceTokens.test.ts`); el
 * carril del Bearer no pasa por él, así que ése es el real.
 *
 * **Cada rechazo tiene al lado su control que sí escribe** —mismo arnés, el
 * aparato que toca—, porque un 403 que también saliera con el aparato correcto
 * diría que el arnés no llega a escribir, no que la ruta compare.
 *
 * **Y la segunda mitad, vista el 2026-10-10: el aparato revocado con su PROPIO
 * id.** Con el cuerpo ya atado al token, `field-media` (los dos pasos) y
 * `POST /api/v1/devices` seguían escribiendo con el access vigente de un aparato
 * revocado: 200 con una foto nueva, y 201 con otro aparato dado de alta. Sus
 * servicios no miran `revokedAt` —`pushFieldEvents` sí—, y el último `describe`
 * lo vigila con el mismo arnés.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const cookie = vi.hoisted(() => ({ usuario: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: cookie.usuario }));

import { prisma } from "../../lib/db";
import { hashPassword } from "../../lib/auth/password";
import { objectStorageProvider } from "../../lib/integrations/storage";
import { registrarAparato } from "../../lib/sync/deviceTokens";
import { POST as postAparatos } from "../../app/api/v1/devices/route";
import { POST as postEventos } from "../../app/api/v1/sync/field-events/route";
import { POST as postMedios } from "../../app/api/v1/sync/field-media/route";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

process.env.AUTH_SECRET ??= "secreto-de-pruebas-p5-no-usado-en-ningun-despliegue";

const RUN_ID = `p5dev-${Date.now()}`;
const CORREO = `${RUN_ID}@example.invalid`;
const CLAVE = "clave-de-prueba-larga-y-tonta";

let userAccountId: string;
let sesionId: string;
let kindId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" } });
  const plotId = (await prisma.location.create({
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId: org.id, status: "approved",
            classification: "internal" } })).id;
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Dev", displayName: `TEST Dev (${RUN_ID})`, locale: "es", email: CORREO } });
  userAccountId = (await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active",
            passwordHash: await hashPassword(CLAVE) } })).id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
  sesionId = (await prisma.fieldSession.create({
    data: { locationId: plotId, operatorPersonId: persona.id, startedAt: new Date("2026-08-28T07:00:00Z"),
            provenanceClass: "direct_observation", createdBy: userAccountId } })).id;
  kindId = (await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value: "observacion", catalog: { key: "event_kind" } } })).id;
});

// La limpieza DESCUBRE lo que borra por el RUN_ID, no lo hereda de variables del
// `beforeAll`: si éste muere a mitad, una corrida a medias se limpia igual.
afterAll(async () => {
  const orgs = await prisma.organization.findMany({ where: { name: { contains: RUN_ID } }, select: { id: true } });
  const locs = await prisma.location.findMany({ where: { name: { contains: RUN_ID } }, select: { id: true } });
  const personas = await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } });
  const cuentas = await prisma.userAccount.findMany({
    where: { personId: { in: personas.map((p) => p.id) } }, select: { id: true } });
  const locIds = locs.map((l) => l.id);
  const cuentaIds = cuentas.map((c) => c.id);
  const sesiones = await prisma.fieldSession.findMany({ where: { locationId: { in: locIds } }, select: { id: true } });
  const sesIds = sesiones.map((s) => s.id);
  const eventos = await prisma.fieldEvent.findMany({ where: { fieldSessionId: { in: sesIds } }, select: { assetId: true } });
  const assetIds = eventos.map((e) => e.assetId).filter((x): x is string => x != null);

  await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: { in: sesIds } }) });
  await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: { in: assetIds } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: sesIds } }) });
  await prisma.device.deleteMany({ where: assertDefinedWhere({ label: { contains: RUN_ID } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentaIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: locIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentaIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas.map((p) => p.id) } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgs.map((o) => o.id) } }) });
});

const alta = (n: string) =>
  registrarAparato({ email: CORREO, password: CLAVE, label: `TEST ${n} ${RUN_ID}`, platform: "android" });

const revocar = (deviceId: string) => prisma.device.update({ where: { id: deviceId }, data: { revokedAt: new Date() } });

const peticion = (ruta: string, cuerpo: unknown, token?: string) =>
  new Request(`http://localhost${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(cuerpo),
  });

const lote = (deviceId: string, n: string) => ({
  deviceId,
  mutations: [{
    clientDraftId: `${RUN_ID}-${n}`, fieldSessionId: sesionId, eventKindValueId: kindId,
    occurredAt: "2026-08-28T07:30:00Z",
  }],
});

const foto = (deviceId: string | undefined, n: string) => ({
  fieldSessionId: sesionId,
  storageKey: `nectar-originals/field/${sesionId}/${RUN_ID}-${n}.jpg`,
  mimeType: "image/jpeg",
  sizeBytes: 1234,
  originalFilename: "foto.jpg",
  clientDraftId: `${RUN_ID}-${n}`,
  occurredAt: "2026-08-28T07:30:00Z",
  ...(deviceId === undefined ? {} : { deviceId }),
});

const filasDe = (n: string) => prisma.fieldEvent.findMany({
  where: { clientDraftId: `${RUN_ID}-${n}` }, select: { deviceId: true } });

describe("field-events: el aparato del lote es el del token", () => {
  it("control: con el token de un aparato vivo y su propio id, el lote se aplica a su nombre", async () => {
    const y = await alta("y-ev-ok");
    const res = await postEventos(peticion("/api/v1/sync/field-events", lote(y.device.id, "ev-ok"), y.accessToken));
    expect(res.status).toBe(200);
    expect((await res.json()).results[0].status).toBe("applied");
    expect(await filasDe("ev-ok")).toEqual([{ deviceId: y.device.id }]);
  });

  it("un token de aparato REVOCADO no escribe aunque el cuerpo nombre a otro aparato vivo", async () => {
    const x = await alta("x-ev-revocado");
    const y = await alta("y-ev-revocado");
    await revocar(x.device.id);

    const res = await postEventos(peticion("/api/v1/sync/field-events", lote(y.device.id, "ev-revocado"), x.accessToken));
    expect(res.status).toBe(403);
    expect(await filasDe("ev-revocado"), "ni una fila del aparato revocado").toEqual([]);
  });

  it("un token vivo no puede atribuir el lote a otro aparato", async () => {
    const x = await alta("x-ev-ajeno");
    const y = await alta("y-ev-ajeno");
    const res = await postEventos(peticion("/api/v1/sync/field-events", lote(y.device.id, "ev-ajeno"), x.accessToken));
    expect(res.status).toBe(403);
    expect(await filasDe("ev-ajeno")).toEqual([]);
  });

  it("el carril de la cookie no cambia: sin token, vale el aparato del cuerpo", async () => {
    const y = await alta("y-ev-cookie");
    cookie.usuario.mockResolvedValueOnce({ userAccountId });
    const res = await postEventos(peticion("/api/v1/sync/field-events", lote(y.device.id, "ev-cookie")));
    expect(res.status).toBe(200);
    expect(await filasDe("ev-cookie")).toEqual([{ deviceId: y.device.id }]);
  });
});

describe("field-media: la foto finalizada es del aparato del token", () => {
  const RUTA = "/api/v1/sync/field-media?paso=finalizar";

  it("control: con el token y su propio id, la foto queda atribuida a ese aparato", async () => {
    const y = await alta("y-med-ok");
    const res = await postMedios(peticion(RUTA, foto(y.device.id, "med-ok"), y.accessToken));
    expect(res.status).toBe(200);
    expect(await filasDe("med-ok")).toEqual([{ deviceId: y.device.id }]);
  });

  it("un token no puede atribuir la foto a otro aparato", async () => {
    const x = await alta("x-med-ajeno");
    const y = await alta("y-med-ajeno");
    const res = await postMedios(peticion(RUTA, foto(y.device.id, "med-ajeno"), x.accessToken));
    expect(res.status).toBe(403);
    expect(await filasDe("med-ajeno")).toEqual([]);
  });

  it("con token, un cuerpo sin deviceId tampoco pasa: el aparato se dice y tiene que casar", async () => {
    const x = await alta("x-med-sin");
    const res = await postMedios(peticion(RUTA, foto(undefined, "med-sin"), x.accessToken));
    expect(res.status).toBe(403);
    expect(await filasDe("med-sin")).toEqual([]);
  });

  it("el carril de la cookie no cambia: sin token, el deviceId del cuerpo sigue siendo opcional", async () => {
    cookie.usuario.mockResolvedValueOnce({ userAccountId });
    const res = await postMedios(peticion(RUTA, foto(undefined, "med-cookie")));
    expect(res.status).toBe(200);
    expect(await filasDe("med-cookie")).toEqual([{ deviceId: null }]);
  });
});

// El 403 se afirma con su `error` porque la ruta de medios tiene OTROS 403
// —`device_mismatch`, el de la ubicación—, y uno cualquiera pasaría por éste.
describe("un aparato revocado no escribe por ninguna ruta, aunque su access siga vigente", () => {
  const SOLICITAR = "/api/v1/sync/field-media?paso=solicitar";
  const FINALIZAR = "/api/v1/sync/field-media?paso=finalizar";
  const subida = () => ({ fieldSessionId: sesionId, originalFilename: "foto.jpg", contentType: "image/jpeg" });
  const firmar = () =>
    vi.spyOn(objectStorageProvider, "putObject").mockResolvedValue({ uploadUrl: "https://firmada.test/put" });
  const aparatosConEtiqueta = (etiqueta: string) => prisma.device.count({ where: { label: `TEST ${etiqueta} ${RUN_ID}` } });

  afterEach(() => vi.restoreAllMocks());

  // Su control es el de arriba: «con el token y su propio id, la foto queda atribuida».
  it("field-media, finalizar: la foto con el propio id del aparato revocado no se crea", async () => {
    const x = await alta("x-med-revocado");
    await revocar(x.device.id);
    const res = await postMedios(peticion(FINALIZAR, foto(x.device.id, "med-revocado"), x.accessToken));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("device_revoked");
    expect(await filasDe("med-revocado"), "ni FieldEvent ni Asset").toEqual([]);
  });

  it("control: field-media, solicitar con un aparato vivo firma la URL", async () => {
    const espia = firmar();
    const y = await alta("y-sol-ok");
    const res = await postMedios(peticion(SOLICITAR, subida(), y.accessToken));
    expect(res.status).toBe(200);
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it("field-media, solicitar: un aparato revocado no obtiene URL firmada", async () => {
    const espia = firmar();
    const x = await alta("x-sol-revocado");
    await revocar(x.device.id);
    const res = await postMedios(peticion(SOLICITAR, subida(), x.accessToken));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("device_revoked");
    expect(espia).not.toHaveBeenCalled();
  });

  it("control: POST /devices con el token de un aparato vivo da de alta otro", async () => {
    const y = await alta("y-dev-ok");
    const res = await postAparatos(peticion("/api/v1/devices",
      { label: `TEST nuevo-ok ${RUN_ID}`, platform: "android" }, y.accessToken));
    expect(res.status).toBe(201);
    expect(await aparatosConEtiqueta("nuevo-ok")).toBe(1);
  });

  it("POST /devices: un aparato revocado no da de alta otro", async () => {
    const x = await alta("x-dev-revocado");
    await revocar(x.device.id);
    const res = await postAparatos(peticion("/api/v1/devices",
      { label: `TEST nuevo-revocado ${RUN_ID}`, platform: "android" }, x.accessToken));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("device_revoked");
    expect(await aparatosConEtiqueta("nuevo-revocado")).toBe(0);
  });
});
