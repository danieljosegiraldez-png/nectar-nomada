/**
 * El punto de entrada `POST /v1/ingest/notehub` — artefactos de colmena, Tarea 7.
 *
 * Los códigos son los que fija el paquete Smart Hive (`PLATFORM_API.md`). Se prueba
 * `atenderIngesta`, que es la ruta entera salvo el `export`: `app/.../route.ts` sólo le pasa el
 * secreto del entorno.
 *
 * Grupo `base-sembrada`.
 */
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearApiario } from "../../lib/apiary/hives";
import { registrarNodo } from "../../lib/apiary/nodos";
import { atenderIngesta, LIMITE_DE_CUERPO, verificarSecretoDeRuta } from "../../lib/sensores/rutaDeIngesta";

const RUN = `rti-${Date.now()}`;
const SECRETO = `secreto-de-prueba-${RUN}`;
const NOTECARD = `dev:${RUN}`;
// El ejemplo real del paquete, con otra identidad para no chocar con las pruebas en paralelo.
const DEVICE = "rp2040-00000000000000e7";
const fixture = JSON.parse(readFileSync("tests/fixtures/telemetria/example-full.json", "utf8"));
const carga = { ...fixture, device_id: DEVICE, event_id: `${DEVICE}:${fixture.epoch}:${fixture.seq}` };

let organizationId: string;
let apiarioId: string;
let adminId: string;
let personaId: string;

const post = (sobre: unknown, auth: string | null = `Bearer ${SECRETO}`, secreto: string | null = SECRETO) =>
  atenderIngesta(
    new Request("https://ejemplo.invalid/api/v1/ingest/notehub", {
      method: "POST",
      headers: auth ? { authorization: auth, "content-type": "application/json" } : { "content-type": "application/json" },
      body: typeof sobre === "string" ? sobre : JSON.stringify(sobre),
    }),
    secreto,
  );
const sobre = (body: unknown) => ({ notecard_uid: NOTECARD, notehub_event_uid: `ev-${RUN}`, received_at: 1789516805, body });

beforeAll(async () => {
  organizationId = (
    await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Farm (${RUN})`, status: "approved", classification: "internal" } })
  ).id;
  personaId = (await prisma.person.create({ data: { givenName: "TEST", familyName: "Admin", displayName: `TEST Admin (${RUN})`, locale: "es" } })).id;
  adminId = (await prisma.userAccount.create({ data: { personId: personaId, authProvider: "credentials", status: "active" } })).id;
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: adminId, roleProfileId: admin.id, scopeId: plataforma.id } });
  apiarioId = (await crearApiario(adminId, { name: `TEST Apiario (${RUN})`, organizationId })).id;
  await limpiar();
  await registrarNodo(adminId, { deviceId: DEVICE, locationId: apiarioId, notecardUid: NOTECARD });
}, 30000);

async function limpiar() {
  await prisma.nodeObservationConflict.deleteMany({ where: assertDefinedWhere({ deviceId: DEVICE }) });
  await prisma.nodeObservation.deleteMany({ where: assertDefinedWhere({ deviceId: DEVICE }) });
}

afterEach(limpiar);

afterAll(async () => {
  await limpiar();
  await prisma.hiveNode.deleteMany({ where: assertDefinedWhere({ deviceId: DEVICE }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: adminId }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: adminId }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: apiarioId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: adminId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personaId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
}, 30000);

describe("la ruta de ingesta", () => {
  it("sin credencial: 401 — y con credencial equivocada, también", async () => {
    expect((await post(sobre(carga), null)).status).toBe(401);
    expect((await post(sobre(carga), "Bearer otra-cosa")).status).toBe(401);
    expect(await prisma.nodeObservation.count({ where: { deviceId: DEVICE } })).toBe(0);
  });

  it("CERRADA POR DEFECTO: sin secreto configurado, nadie entra — ni con un Bearer vacío", async () => {
    // Una ruta de ingestión abierta sería peor que ninguna.
    expect((await post(sobre(carga), `Bearer ${SECRETO}`, null)).status).toBe(401);
    expect((await post(sobre(carga), "Bearer ", "")).status).toBe(401);
    expect(verificarSecretoDeRuta("Bearer x", undefined)).toBe(false);
  });

  it("cuerpo mayor de 16 KiB: 413", async () => {
    const enorme = JSON.stringify(sobre({ ...carga, relleno: "x".repeat(LIMITE_DE_CUERPO) }));
    expect((await post(enorme)).status).toBe(413);
  });

  it("carga malformada: 400", async () => {
    expect((await post("{no es json")).status).toBe(400);
    expect((await post({ roto: true })).status).toBe(400);
    expect((await post(sobre({ roto: true }))).status).toBe(400);
  });

  it("un notecard que no está en el registro: 403", async () => {
    expect((await post({ ...sobre(carga), notecard_uid: "dev:inventado" })).status).toBe(403);
  });

  it("válida y nueva: 202 — y el dato está en la base", async () => {
    const r = await post(sobre(carga));
    expect(r.status).toBe(202);
    const { id } = (await r.json()) as { id: string };
    expect((await prisma.nodeObservation.findUniqueOrThrow({ where: { id } })).deviceId).toBe(DEVICE);
  });

  it("duplicado exacto: 200", async () => {
    await post(sobre(carga));
    const r = await post(sobre(carga));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { duplicado: boolean }).duplicado).toBe(true);
  });

  it("mismo id, contenido distinto: 409", async () => {
    await post(sobre(carga));
    const alterada = { ...carga, missed_samples: 3 };
    expect((await post(sobre(alterada))).status).toBe(409);
  });
});
