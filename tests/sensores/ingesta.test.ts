/**
 * La observación cruda: inmutable e idempotente — artefactos de colmena, Tarea 5.
 *
 * Spec: docs/superpowers/specs/2026-09-17-artefactos-de-colmena-design.md §B.2–B.3 y §6.
 * Fixtures: los dos ejemplos REALES del paquete Smart Hive (`tests/fixtures/telemetria/`).
 *
 * Grupo `base-sembrada`.
 */
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearApiario, createHive } from "../../lib/apiary/hives";
import { retirarArtefacto } from "../../lib/apiary/artefactos";
import { instalarNodo, registrarNodo } from "../../lib/apiary/nodos";
import { ingerirObservacion, ObservacionEnConflicto, ObservacionRechazada } from "../../lib/sensores/ingesta";

const RUN = `ing-${Date.now()}`;
const cargaCompleta = JSON.parse(readFileSync("tests/fixtures/telemetria/example-full.json", "utf8"));
const cargaOffline = JSON.parse(readFileSync("tests/fixtures/telemetria/example-offline.json", "utf8"));
const DEVICE = cargaCompleta.device_id as string; // «rp2040-0011223344556677», del paquete
const segundos = (d: Date) => Math.floor(d.getTime() / 1000);
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);

let organizationId: string;
let apiarioId: string;
let adminId: string;
let nodoId: string;
const NOTECARD = `dev:${RUN}`;
const ruta = { notecardUid: NOTECARD };
const cajas: string[] = [];
const personas: string[] = [];

beforeAll(async () => {
  organizationId = (
    await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Farm (${RUN})`, status: "approved", classification: "internal" } })
  ).id;
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: "Admin", displayName: `TEST Admin (${RUN})`, locale: "es" } });
  personas.push(p.id);
  adminId = (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: adminId, roleProfileId: admin.id, scopeId: plataforma.id } });
  apiarioId = (await crearApiario(adminId, { name: `TEST Apiario (${RUN})`, organizationId })).id;
  // El device_id del fixture es fijo: si una corrida anterior lo dejó, se limpia antes.
  await limpiarAparato();
  nodoId = (await registrarNodo(adminId, { deviceId: DEVICE, locationId: apiarioId, notecardUid: NOTECARD })).id;
}, 30000);

async function limpiarAparato() {
  const nodo = await prisma.hiveNode.findUnique({ where: { deviceId: DEVICE } });
  await prisma.nodeObservationConflict.deleteMany({ where: assertDefinedWhere({ deviceId: DEVICE }) });
  await prisma.nodeObservation.deleteMany({ where: assertDefinedWhere({ deviceId: DEVICE }) });
  if (nodo) {
    await prisma.hiveFitting.deleteMany({ where: assertDefinedWhere({ hiveNodeId: nodo.id }) });
    await prisma.hiveNode.delete({ where: { id: nodo.id } });
  }
}

async function caja() {
  const c = await createHive(adminId, { identifier: `${RUN}-${cajas.length}`, locationId: apiarioId });
  cajas.push(c.id);
  return c.id;
}

afterEach(async () => {
  await prisma.nodeObservationConflict.deleteMany({ where: assertDefinedWhere({ deviceId: DEVICE }) });
  await prisma.nodeObservation.deleteMany({ where: assertDefinedWhere({ deviceId: DEVICE }) });
  await prisma.hiveFitting.deleteMany({ where: assertDefinedWhere({ hiveNodeId: nodoId }) });
});

afterAll(async () => {
  await limpiarAparato();
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: cajas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: apiarioId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
}, 30000);

describe("la observación cruda", () => {
  it("acepta el ejemplo completo del paquete y guarda el crudo entero", async () => {
    const r = await ingerirObservacion(cargaCompleta, ruta);
    expect(r.duplicado).toBe(false);
    const o = await prisma.nodeObservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(o.payload).toEqual(cargaCompleta); // el crudo, tal cual llegó
    expect(o.deviceId).toBe(DEVICE);
    expect(o.hiveNodeId).toBe(nodoId);
    expect(o.observedAt?.toISOString()).toBe(new Date(cargaCompleta.ts * 1000).toISOString());
    expect(o.faults).toEqual(["SYNTHETIC_VALUES_NOT_A_CALIBRATION_VECTOR"]);
  }, 20000);

  it("el MISMO evento dos veces es un duplicado, no un error", async () => {
    // El paquete: «un acuse perdido puede producir un duplicado; se requiere ingestión
    // idempotente. Duplicado exacto = 200».
    await ingerirObservacion(cargaCompleta, ruta);
    const segunda = await ingerirObservacion(structuredClone(cargaCompleta), ruta);
    expect(segunda.duplicado).toBe(true);
    expect(await prisma.nodeObservation.count({ where: { deviceId: DEVICE } })).toBe(1);
  }, 20000);

  it("mismo id con contenido DISTINTO se pone en cuarentena, no se pisa", async () => {
    // Los dos ejemplos del paquete son justo este caso: mismo device/epoch/seq, otro cuerpo.
    const r = await ingerirObservacion(cargaCompleta, ruta);
    await expect(ingerirObservacion(cargaOffline, ruta)).rejects.toThrow(ObservacionEnConflicto);
    const o = await prisma.nodeObservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(o.payload).toEqual(cargaCompleta); // el primero, intacto
    const q = await prisma.nodeObservationConflict.findFirstOrThrow({ where: { deviceId: DEVICE } });
    expect(q.payload).toEqual(cargaOffline); // el segundo, guardado para que alguien lo mire
    expect(q.existingObservationId).toBe(r.id);
  }, 20000);

  it("time_quality «unknown» deja el tiempo DESCONOCIDO — no lo rellena con el de llegada", async () => {
    // La regla literal del paquete, y el ejemplo offline existe justo para esto. Si esta prueba
    // cae, alguien sustituyó el tiempo de medición por el de ingestión y el dato pasó a mentir.
    const r = await ingerirObservacion(cargaOffline, ruta);
    const o = await prisma.nodeObservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(o.observedAt).toBeNull();
    expect(o.receivedAt).not.toBeNull();
    expect(o.timeQuality).toBe("unknown");
    // Y sin hora no se puede saber en qué colmena estaba: se dice, no se adivina.
    expect(o.hiveId).toBeNull();
  }, 20000);

  it("resuelve la colmena DEL MOMENTO de la medición, no la de ahora", async () => {
    // La razón por la que el intervalo de la Tarea 1 es requisito de ésta.
    const [a, b] = [await caja(), await caja()];
    const f = await instalarNodo(adminId, { hiveId: a, hiveNodeId: nodoId, installedAt: hace(60) });
    await retirarArtefacto(adminId, { fittingId: f.id, removedAt: hace(30) });
    await instalarNodo(adminId, { hiveId: b, hiveNodeId: nodoId, installedAt: hace(29) });
    const r = await ingerirObservacion({ ...cargaCompleta, ts: segundos(hace(45)) }, ruta);
    const o = await prisma.nodeObservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(o.hiveId).toBe(a); // la de hace 45 días, no la de hoy
  }, 20000);

  it("una ruta cuyo notecard no está en el registro se rechaza — y no deja nada", async () => {
    await expect(ingerirObservacion(cargaCompleta, { notecardUid: "dev:inventado" })).rejects.toThrow(/aparato_no_registrado/);
    expect(await prisma.nodeObservation.count({ where: { deviceId: DEVICE } })).toBe(0);
  }, 20000);

  it("la identidad NO sale del cuerpo: un device_id ajeno en la carga no cuela", async () => {
    // El traspaso del paquete: «autenticar usando el registro y la identidad de la ruta, no
    // las etiquetas de la carga». Cualquiera que sepa un id podría escribirlo en el cuerpo.
    await expect(
      ingerirObservacion({ ...cargaCompleta, device_id: "rp2040-ffffffffffffffff", event_id: `rp2040-ffffffffffffffff:${cargaCompleta.epoch}:7` }, ruta),
    ).rejects.toThrow(/identidad_no_coincide/);
  }, 20000);

  it("un event_id que no casa con device/epoch/seq se rechaza", async () => {
    await expect(ingerirObservacion({ ...cargaCompleta, event_id: `${DEVICE}:${cargaCompleta.epoch}:8` }, ruta)).rejects.toThrow(
      /event_id_no_casa/,
    );
  }, 20000);

  it("una carga malformada se rechaza por esquema, antes de tocar la base", async () => {
    await expect(ingerirObservacion({ roto: true }, ruta)).rejects.toThrow(ObservacionRechazada);
    await expect(ingerirObservacion({ ...cargaCompleta, schema: "otro/9" }, ruta)).rejects.toThrow(/esquema/);
    await expect(ingerirObservacion({ ...cargaCompleta, seq: -1 }, ruta)).rejects.toThrow(/seq/);
    // additionalProperties: false en el esquema del paquete.
    await expect(ingerirObservacion({ ...cargaCompleta, extra: 1 }, ruta)).rejects.toThrow(/extra/);
    expect(await prisma.nodeObservation.count({ where: { deviceId: DEVICE } })).toBe(0);
  }, 20000);

  it("la BASE no deja reescribir una observación: el crudo es inmutable", async () => {
    const r = await ingerirObservacion(cargaCompleta, ruta);
    await expect(prisma.nodeObservation.update({ where: { id: r.id }, data: { missedSamples: 99 } })).rejects.toThrow(/inmutable/);
  }, 20000);
});
