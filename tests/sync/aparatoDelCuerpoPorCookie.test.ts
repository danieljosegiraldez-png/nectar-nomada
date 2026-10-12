/**
 * P4 §7 — por COOKIE, el aparato que nombra el cuerpo de una foto se valida
 * igual que el de un lote de `field-events`.
 *
 * **El defecto, medido el 2026-10-11.** Por cookie no hay aparato propio
 * (`Principal.deviceId === null`), así que el `deviceId` del cuerpo es
 * opcional y es el que queda en `FieldEvent.deviceId`. `field-events` lo pasa
 * por `pushFieldEvents`, que lo busca y niega uno desconocido o revocado.
 * `field-media` no lo consultaba: un aparato revocado quedaba como autor de la
 * foto con un 200, y un id que no existe reventaba contra
 * `field_event_device_id_fkey` y salía como 500 — que el cliente lee como «no
 * llegué» y reintenta para siempre.
 *
 * **«Como field-events» es la decisión, y por eso hay una prueba que compara
 * las dos rutas.** Decisión de Daniel del 2026-10-11, entre validar así, ignorar
 * el `deviceId` por cookie, exigir además que el aparato sea de la cuenta, o
 * dejarlo. Consecuencia que se eligió a sabiendas: un aparato vivo registrado
 * por OTRA cuenta sigue pasando, en las dos rutas. Exigir que sea propio
 * rompería la PWA en un navegador compartido —`ensureDeviceId` guarda el id en
 * `localStorage` sin atarlo a la persona— y, si algún día se decide, se decide
 * para las dos rutas a la vez: la comparación cae si una cambia sola.
 *
 * Se entra por el POST de la ruta y no por el servicio por la misma razón que
 * `aparatoDelToken.test.ts`: lo que se vigila es qué responde la ruta. Sólo se
 * sustituye `lib/auth/session`, que arrastra `next-auth`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const cookie = vi.hoisted(() => ({ usuario: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: cookie.usuario }));

import { prisma } from "../../lib/db";
import { hashPassword } from "../../lib/auth/password";
import { registrarAparato } from "../../lib/sync/deviceTokens";
import { POST as postEventos } from "../../app/api/v1/sync/field-events/route";
import { POST as postMedios } from "../../app/api/v1/sync/field-media/route";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

process.env.AUTH_SECRET ??= "secreto-de-pruebas-p5-no-usado-en-ningun-despliegue";

const RUN_ID = `p4cookie-${Date.now()}`;
const CLAVE = "clave-de-prueba-larga-y-tonta";
const FINALIZAR = "/api/v1/sync/field-media?paso=finalizar";

let cuentaA: string;
let correoA: string;
let correoB: string;
let sesionId: string;
let kindId: string;

// `registrarAparato` pasa el correo a minúsculas antes de buscarlo, así que se
// guarda ya en minúsculas o el alta no encuentra a la persona.
async function persona(n: string) {
  const correo = `${RUN_ID}-${n}@example.invalid`.toLowerCase();
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN_ID})`, locale: "es", email: correo } });
  const c = await prisma.userAccount.create({
    data: { personId: p.id, authProvider: "credentials", status: "active", passwordHash: await hashPassword(CLAVE) } });
  return { correo, cuentaId: c.id, personaId: p.id };
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" } });
  const plotId = (await prisma.location.create({
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId: org.id, status: "approved",
            classification: "internal" } })).id;
  const a = await persona("A");
  const b = await persona("B");
  cuentaA = a.cuentaId;
  correoA = a.correo;
  correoB = b.correo;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } });
  await prisma.assignment.create({ data: { userAccountId: cuentaA, roleProfileId: perfil.id, scopeId: scope.id } });
  sesionId = (await prisma.fieldSession.create({
    data: { locationId: plotId, operatorPersonId: a.personaId, startedAt: new Date("2026-08-28T07:00:00Z"),
            provenanceClass: "direct_observation", createdBy: cuentaA } })).id;
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
  // Y por su clave, que lleva el RUN_ID: un Asset sin su evento —justo lo que
  // las pruebas de rechazo vigilan— no lo encuentra el borrado de arriba.
  await prisma.asset.deleteMany({ where: assertDefinedWhere({ storageKey: { contains: RUN_ID } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: sesIds } }) });
  await prisma.device.deleteMany({ where: assertDefinedWhere({ label: { contains: RUN_ID } }) });
  // Lo que escribieron las rutas lo firmó la cuenta de la corrida; borrar la
  // cuenta antes dejaría esas filas con el actor a NULL (`ON DELETE SET NULL`).
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentaIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentaIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: locIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentaIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas.map((p) => p.id) } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgs.map((o) => o.id) } }) });
});

const alta = (correo: string, n: string) =>
  registrarAparato({ email: correo, password: CLAVE, label: `TEST ${n} ${RUN_ID}`, platform: "android" });

const revocado = async (n: string) => {
  const x = await alta(correoA, n);
  await prisma.device.update({ where: { id: x.device.id }, data: { revokedAt: new Date() } });
  return x.device.id;
};

// Sin cabecera Authorization: `resolverPrincipal` cae a la cookie.
const porCookie = async (post: (r: Request) => Promise<Response>, ruta: string, cuerpo: unknown) => {
  cookie.usuario.mockResolvedValueOnce({ userAccountId: cuentaA });
  return post(new Request(`http://localhost${ruta}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }));
};

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

const lote = (deviceId: string, n: string) => ({
  deviceId,
  mutations: [{ clientDraftId: `${RUN_ID}-${n}`, fieldSessionId: sesionId, eventKindValueId: kindId,
                occurredAt: "2026-08-28T07:30:00Z" }],
});

const filasDe = (n: string) => prisma.fieldEvent.findMany({
  where: { clientDraftId: `${RUN_ID}-${n}` }, select: { deviceId: true } });
const assetsDe = (n: string) => prisma.asset.count({ where: { storageKey: foto(undefined, n).storageKey } });

describe("field-media por cookie: el aparato del cuerpo se valida como en field-events", () => {
  it("control: con un aparato propio y vivo, la foto queda a su nombre", async () => {
    const vivo = (await alta(correoA, "vivo")).device.id;
    const res = await porCookie(postMedios, FINALIZAR, foto(vivo, "vivo"));
    expect(res.status).toBe(200);
    expect(await filasDe("vivo")).toEqual([{ deviceId: vivo }]);
  });

  it("un aparato revocado no queda como autor de la foto", async () => {
    const res = await porCookie(postMedios, FINALIZAR, foto(await revocado("rev"), "rev"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("device_revoked");
    expect(await filasDe("rev"), "ni FieldEvent").toEqual([]);
    expect(await assetsDe("rev"), "ni Asset").toBe(0);
  });

  // Antes: la clave foránea reventaba dentro de la transacción y la ruta lo
  // relanzaba. Un 500 el cliente lo reintenta para siempre; un 403, no.
  it("un aparato que no existe es un 403 que se explica, no un 500", async () => {
    const res = await porCookie(postMedios, FINALIZAR, foto(randomUUID(), "inex"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("device_not_found");
    expect(await filasDe("inex"), "ni FieldEvent").toEqual([]);
    expect(await assetsDe("inex"), "ni Asset").toBe(0);
  });

  it("sin deviceId en el cuerpo sigue pasando: por cookie el aparato es opcional", async () => {
    const res = await porCookie(postMedios, FINALIZAR, foto(undefined, "sin"));
    expect(res.status).toBe(200);
    expect(await filasDe("sin")).toEqual([{ deviceId: null }]);
  });

  it("para los mismos cuatro aparatos, field-media y field-events dan el mismo veredicto", async () => {
    const vivo = (await alta(correoA, "cmp-vivo")).device.id;
    const ajeno = (await alta(correoB, "cmp-ajeno")).device.id;
    const casos: [string, string][] = [
      ["propio vivo", vivo],
      ["revocado", await revocado("cmp-rev")],
      ["inexistente", randomUUID()],
      ["de otra cuenta, vivo", ajeno],
    ];
    type Veredicto = { status: number; error: string | null };
    const veredicto = async (res: Response): Promise<Veredicto> =>
      ({ status: res.status, error: (await res.json()).error ?? null });

    const medios: Veredicto[] = [];
    const eventos: Veredicto[] = [];
    for (const [i, [, id]] of casos.entries()) {
      medios.push(await veredicto(await porCookie(postMedios, FINALIZAR, foto(id, `cmp-m${i}`))));
      eventos.push(await veredicto(await porCookie(postEventos, "/api/v1/sync/field-events", lote(id, `cmp-e${i}`))));
    }
    // Lo que quedó escrito, no sólo lo que se contestó: field-events responde 200
    // aunque rechace la mutación por dentro, así que el estado solo no dice que
    // la ruta escribiera.
    const escritoPorMedios = await Promise.all(casos.map((_, i) => filasDe(`cmp-m${i}`)));
    const escritoPorEventos = await Promise.all(casos.map((_, i) => filasDe(`cmp-e${i}`)));

    // Fila patrón: sin ella, dos rutas que fallaran igual por el arnés también
    // «coincidirían». field-events tiene que dar exactamente esto.
    expect(eventos).toEqual([
      { status: 200, error: null },
      { status: 403, error: "device_revoked" },
      { status: 403, error: "device_not_found" },
      { status: 200, error: null },
    ]);
    expect(escritoPorEventos).toEqual([[{ deviceId: vivo }], [], [], [{ deviceId: ajeno }]]);

    const porCaso = (vs: unknown[]) => Object.fromEntries(casos.map(([n], i) => [n, vs[i]]));
    expect(porCaso(medios)).toEqual(porCaso(eventos));
    expect(porCaso(escritoPorMedios)).toEqual(porCaso(escritoPorEventos));
  });
});
