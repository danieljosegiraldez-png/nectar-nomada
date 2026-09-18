/**
 * La lectura derivada: versionada y recalculable — artefactos de colmena, Tarea 6.
 *
 * Del paquete Smart Hive, `PLATFORM_API.md`: «los resultados derivados son registros versionados
 * aparte que referencian el id del evento crudo. Los valores ausentes son nulos con su fallo,
 * nunca ceros. Recalibrar después no muta la evidencia original». La fórmula es la de su
 * `firmware/calibration.py`: kg = (raw_filtered − offset) / counts_per_kg.
 *
 * **Los coeficientes de estas pruebas son SINTÉTICOS**, como los del propio paquete («these
 * numbers are synthetic format examples, never device coefficients»): offset 600 y 4900 cuentas
 * por kilo, elegidos para que el crudo del ejemplo (245600) dé los 50 kg que el ejemplo declara.
 *
 * Grupo `base-sembrada`.
 */
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { ApiaryAccessError, crearApiario } from "../../lib/apiary/hives";
import { registrarNodo } from "../../lib/apiary/nodos";
import { ingerirObservacion } from "../../lib/sensores/ingesta";
import { derivarPeso, registrarCalibracion } from "../../lib/sensores/derivar";

const RUN = `der-${Date.now()}`;
// Los ejemplos reales del paquete, con OTRA identidad: `ingesta.test.ts` usa el device_id del
// fixture y los archivos corren en paralelo contra la misma base. Sólo cambia quién es el aparato;
// el cuerpo medido es el del paquete, sin tocar.
const DEVICE = "rp2040-00000000000000d6";
// `any` como el JSON.parse del que sale: el fixture se lee a mano.
const conIdentidad = (c: any) => ({ ...c, device_id: DEVICE, event_id: `${DEVICE}:${c.epoch}:${c.seq}` });
const cargaCompleta = conIdentidad(JSON.parse(readFileSync("tests/fixtures/telemetria/example-full.json", "utf8")));
const cargaOffline = conIdentidad(JSON.parse(readFileSync("tests/fixtures/telemetria/example-offline.json", "utf8")));
const NOTECARD = `dev:${RUN}`;

let organizationId: string;
let apiarioId: string;
let adminId: string;
let operario: string;
let scopeId: string;
let nodoId: string;
const personas: string[] = [];

async function cuenta(n: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN})`, locale: "es" } });
  personas.push(p.id);
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}

async function limpiarAparato() {
  const nodo = await prisma.hiveNode.findUnique({ where: { deviceId: DEVICE } });
  if (!nodo) return;
  await prisma.nodeDerivedReading.deleteMany({ where: assertDefinedWhere({ observation: { hiveNodeId: nodo.id } }) });
  await prisma.nodeCalibration.deleteMany({ where: assertDefinedWhere({ hiveNodeId: nodo.id }) });
  await prisma.nodeObservationConflict.deleteMany({ where: assertDefinedWhere({ deviceId: DEVICE }) });
  await prisma.nodeObservation.deleteMany({ where: assertDefinedWhere({ deviceId: DEVICE }) });
  await prisma.hiveFitting.deleteMany({ where: assertDefinedWhere({ hiveNodeId: nodo.id }) });
  await prisma.hiveNode.delete({ where: { id: nodo.id } });
}

beforeAll(async () => {
  organizationId = (
    await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Farm (${RUN})`, status: "approved", classification: "internal" } })
  ).id;
  adminId = await cuenta("Admin");
  operario = await cuenta("Operario");
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: adminId, roleProfileId: admin.id, scopeId: plataforma.id } });
  apiarioId = (await crearApiario(adminId, { name: `TEST Apiario (${RUN})`, organizationId })).id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: apiarioId } })).id;
  await prisma.assignment.create({ data: { userAccountId: operario, roleProfileId: perfil.id, scopeId } });
  await limpiarAparato();
  nodoId = (await registrarNodo(adminId, { deviceId: DEVICE, locationId: apiarioId, notecardUid: NOTECARD })).id;
}, 30000);

afterEach(async () => {
  await prisma.nodeDerivedReading.deleteMany({ where: assertDefinedWhere({ observation: { hiveNodeId: nodoId } }) });
  await prisma.nodeCalibration.deleteMany({ where: assertDefinedWhere({ hiveNodeId: nodoId }) });
  await prisma.nodeObservation.deleteMany({ where: assertDefinedWhere({ deviceId: DEVICE }) });
});

afterAll(async () => {
  await limpiarAparato();
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: apiarioId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
}, 30000);

const calibrar = (calibrationId: string, offset = 600, countsPerKg = 4900) =>
  registrarCalibracion(adminId, { hiveNodeId: nodoId, locationId: apiarioId, calibrationId, offset, countsPerKg, performedAt: new Date() });

describe("la lectura derivada", () => {
  it("los kilos salen del crudo con la calibración, y apuntan a su evento", async () => {
    const { id: observationId } = await ingerirObservacion(cargaCompleta, { notecardUid: NOTECARD });
    const cal = await calibrar(`SYN-${RUN}-a`);
    const d = await derivarPeso(adminId, observationId, { calibracionId: cal.id, version: 1 });
    expect(d.observationId).toBe(observationId);
    expect(d.value).toBeCloseTo(50, 3); // (245600 − 600) / 4900
    expect(d.unit).toBe("kg");
    expect(d.algorithm).toBe("hx711-lineal");
    expect(d.calibrationId).toBe(cal.id);
  }, 20000);

  it("recalcular NO toca la observación — y conviven las versiones y las calibraciones", async () => {
    // La regla 4 del paquete. Misma regla que `ProcessRecipeVersion`: no se edita, se versiona.
    const { id: observationId } = await ingerirObservacion(cargaCompleta, { notecardUid: NOTECARD });
    const antes = await prisma.nodeObservation.findUniqueOrThrow({ where: { id: observationId } });
    const a = await calibrar(`SYN-${RUN}-b1`);
    const b = await calibrar(`SYN-${RUN}-b2`, 1000, 5000); // una recalibración
    const v1 = await derivarPeso(adminId, observationId, { calibracionId: a.id, version: 1 });
    await derivarPeso(adminId, observationId, { calibracionId: a.id, version: 2 });
    const otra = await derivarPeso(adminId, observationId, { calibracionId: b.id, version: 1 });
    const despues = await prisma.nodeObservation.findUniqueOrThrow({ where: { id: observationId } });
    expect(despues.payload).toEqual(antes.payload);
    expect(await prisma.nodeDerivedReading.count({ where: { observationId } })).toBe(3);
    expect(otra.value).toBeCloseTo(48.92, 2); // (245600 − 1000) / 5000
    expect(v1.value).toBeCloseTo(50, 3);
  }, 20000);

  it("derivar dos veces lo mismo devuelve la misma lectura, no una copia", async () => {
    const { id: observationId } = await ingerirObservacion(cargaCompleta, { notecardUid: NOTECARD });
    const cal = await calibrar(`SYN-${RUN}-c`);
    const x = await derivarPeso(adminId, observationId, { calibracionId: cal.id, version: 1 });
    const y = await derivarPeso(adminId, observationId, { calibracionId: cal.id, version: 1 });
    expect(y.id).toBe(x.id);
  }, 20000);

  it("un sensor sin lectura NO produce un cero: no produce nada, y lo dice", async () => {
    // El ejemplo offline del paquete trae `weight: null`.
    const { id: observationId } = await ingerirObservacion(cargaOffline, { notecardUid: NOTECARD });
    const cal = await calibrar(`SYN-${RUN}-d`);
    const d = await derivarPeso(adminId, observationId, { calibracionId: cal.id, version: 1 });
    expect(d.value).toBeNull();
    expect(d.limitations).toContain("SENSOR_EN_FALLO");
  }, 20000);

  it("una ventana inestable da el número CON su limitación — no se esconde ni se inventa", async () => {
    const inestable = {
      ...cargaCompleta,
      faults: [...cargaCompleta.faults, "WEIGHT_WINDOW_UNSTABLE"],
      observations: { ...cargaCompleta.observations, weight: { ...cargaCompleta.observations.weight, spread_kg: 0.5 } },
    };
    const { id: observationId } = await ingerirObservacion(inestable, { notecardUid: NOTECARD });
    const cal = await calibrar(`SYN-${RUN}-e`);
    const d = await derivarPeso(adminId, observationId, { calibracionId: cal.id, version: 1 });
    expect(d.value).toBeCloseTo(50, 3);
    expect(d.limitations).toContain("VENTANA_INESTABLE");
  }, 20000);

  it("la calibración es de ESE nodo, y sus coeficientes absurdos se rechazan como en el firmware", async () => {
    await expect(calibrar(`SYN-${RUN}-f`, 600, 0.5)).rejects.toThrow(/CAL_INVALID/);
    await expect(calibrar(`SYN-${RUN}-g`, Number.NaN, 4900)).rejects.toThrow(/CAL_INVALID/);
    const cal = await calibrar(`SYN-${RUN}-h`);
    // Un calibrationID repetido en el mismo nodo no se reescribe: recalibrar es un registro NUEVO.
    await expect(calibrar(`SYN-${RUN}-h`, 1, 4900)).rejects.toThrow(/calibracion_ya_registrada/);
    await expect(prisma.nodeCalibration.update({ where: { id: cal.id }, data: { offset: 1 } })).rejects.toThrow(/inmutable/);
  }, 20000);

  it("sin hive_node:manage no se calibra ni se deriva — y el control positivo", async () => {
    const { id: observationId } = await ingerirObservacion(cargaCompleta, { notecardUid: NOTECARD });
    await expect(
      registrarCalibracion(operario, { hiveNodeId: nodoId, locationId: apiarioId, calibrationId: `SYN-${RUN}-i`, offset: 600, countsPerKg: 4900, performedAt: new Date() }),
    ).rejects.toThrow(ApiaryAccessError);
    const cal = await calibrar(`SYN-${RUN}-j`);
    await expect(derivarPeso(operario, observationId, { calibracionId: cal.id, version: 1 })).rejects.toThrow(ApiaryAccessError);
    await expect(derivarPeso(adminId, observationId, { calibracionId: cal.id, version: 1 })).resolves.toBeTruthy();
  }, 20000);
});
