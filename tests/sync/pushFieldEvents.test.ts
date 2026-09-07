/**
 * P4, primera rebanada (46_P4_API_Y_SINCRONIZACION.md §11–§12). Postgres real,
 * fixtures acotadas por RUN_ID, sin mocks — misma forma que
 * `tests/traceability/fieldSessions.test.ts`, del que depende.
 *
 * **Lo que estos tests defienden, dicho una vez:** que reintentar un push cuya
 * respuesta se perdió no duplique trabajo de campo, y que un rechazo del
 * servidor no se confunda con una caída de red. Las dos cosas se pueden romper
 * sin que nada más falle, y las dos se notarían tarde y mal.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { startFieldSession, endFieldSession, recordFieldEvent } from "../../lib/traceability/fieldSessions";
import { pushFieldEvents, DeviceError, type MutacionDeEvento } from "../../lib/sync/pushFieldEvents";
import { registerDevice, DeviceValidationError } from "../../lib/sync/devices";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `p4-${Date.now()}`;

let organizationId: string;
let plotId: string;
let operatorPersonId: string;
let userAccountId: string;
let deviceId: string;
let revokedDeviceId: string;
let observacionKindId: string;

async function createTestPerson(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  return person.id;
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const plot = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  plotId = plot.id;

  operatorPersonId = await createTestPerson("Picker");
  const managerPersonId = await createTestPerson("Manager");
  const account = await prisma.userAccount.create({
    data: { personId: managerPersonId, authProvider: "credentials", status: "active" },
  });
  userAccountId = account.id;

  const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: profile.id, scopeId: scope.id } });

  observacionKindId = (
    await prisma.variableCatalogValue.findFirstOrThrow({
      where: { value: "observacion", catalog: { key: "event_kind" } },
    })
  ).id;

  const device = await prisma.device.create({
    data: { label: `TEST PWA (${RUN_ID})`, platform: "pwa", createdBy: userAccountId },
  });
  deviceId = device.id;

  const revoked = await prisma.device.create({
    data: { label: `TEST revoked (${RUN_ID})`, platform: "pwa", createdBy: userAccountId, revokedAt: new Date() },
  });
  revokedDeviceId = revoked.id;
});

afterAll(async () => {
  const sessions = await prisma.fieldSession.findMany({ where: { locationId: plotId }, select: { id: true } });
  const sessionIds = sessions.map((s) => s.id);
  await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: { in: sessionIds } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: sessionIds } }) });
  await prisma.device.deleteMany({ where: assertDefinedWhere({ id: { in: [deviceId, revokedDeviceId] } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: plotId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

async function abrirJornada(startedAt = new Date("2026-08-28T07:00:00Z")) {
  return startFieldSession(userAccountId, {
    locationId: plotId,
    operatorPersonId,
    startedAt,
    provenanceClass: "direct_observation",
  });
}

// A9.5 — `PushMutation` pasó a ser una unión etiquetada, así que este ayudante
// nombra la variante que construye: `Partial<union>` es una unión de parciales
// y no se puede esparcir sobre una variante concreta.
function mutacion(sessionId: string, draftId: string, extra: Partial<MutacionDeEvento> = {}): MutacionDeEvento {
  return {
    clientDraftId: draftId,
    fieldSessionId: sessionId,
    eventKindValueId: observacionKindId,
    occurredAt: new Date("2026-08-28T07:30:00Z"),
    notes: "anotado en el bloque",
    ...extra,
  };
}

describe("push por lotes de eventos de campo", () => {
  it("aplica una mutación nueva y la ata al dispositivo que la mandó", async () => {
    const session = await abrirJornada();
    const [r] = await pushFieldEvents(userAccountId, deviceId, [mutacion(session.id, `${RUN_ID}-a`)]);

    expect(r).toMatchObject({ status: "applied", clientDraftId: `${RUN_ID}-a` });
    const fila = await prisma.fieldEvent.findUniqueOrThrow({ where: { clientDraftId: `${RUN_ID}-a` } });
    expect(fila.deviceId).toBe(deviceId);
    expect(fila.provenanceClass).toBe("direct_observation");
  });

  /**
   * EL test de la rebanada: el criterio de aceptación del ticket §11 dice
   * «repetir el push no crea una segunda fila». Se comprueba por conteo, no
   * porque la segunda llamada devuelva algo con buena pinta.
   */
  it("repetir el mismo lote no crea una segunda fila, y lo dice", async () => {
    const session = await abrirJornada();
    const draft = `${RUN_ID}-repetido`;
    const lote = [mutacion(session.id, draft)];

    const primera = await pushFieldEvents(userAccountId, deviceId, lote);
    const segunda = await pushFieldEvents(userAccountId, deviceId, lote);

    expect(primera[0]!.status).toBe("applied");
    expect(segunda[0]!.status).toBe("duplicate");
    expect((segunda[0] as { id: string }).id).toBe((primera[0] as { id: string }).id);

    const filas = await prisma.fieldEvent.count({ where: { clientDraftId: draft } });
    expect(filas, "un reintento no debe duplicar trabajo de campo").toBe(1);
  });

  it("no audita dos veces el mismo hecho", async () => {
    const session = await abrirJornada();
    const draft = `${RUN_ID}-audit`;
    const lote = [mutacion(session.id, draft)];

    await pushFieldEvents(userAccountId, deviceId, lote);
    const evento = await prisma.fieldEvent.findUniqueOrThrow({ where: { clientDraftId: draft } });
    await pushFieldEvents(userAccountId, deviceId, lote);

    const audits = await prisma.auditEvent.count({
      where: { entityType: "field_event", entityId: evento.id },
    });
    expect(audits, "el hecho pasó una vez; auditarlo dos lo cuenta dos veces").toBe(1);
  });

  /**
   * Un rechazo es terminal y NO detiene el lote. Si lo detuviera, una anotación
   * mala del principio de la jornada dejaría sin sincronizar todo lo que vino
   * después, que es trabajo bueno.
   */
  /**
   * El servicio tiene que ser idempotente POR SU CUENTA, no sólo detrás del
   * pre-chequeo del push. `recordFieldEvent` lo llama también el formulario
   * web, y un día lo llamará otro camino de sincronización; una idempotencia
   * que sólo vive en la capa de arriba se pierde en cuanto alguien entra por
   * otra puerta. Este test entra por la puerta de abajo a propósito.
   */
  it("el servicio es idempotente por sí mismo, sin el pre-chequeo del push", async () => {
    const session = await abrirJornada();
    const draft = `${RUN_ID}-servicio`;
    const entrada = {
      fieldSessionId: session.id,
      eventKindValueId: observacionKindId,
      occurredAt: new Date("2026-08-28T07:30:00Z"),
      provenanceClass: "direct_observation" as const,
      clientDraftId: draft,
    };

    const primero = await recordFieldEvent(userAccountId, entrada);
    const segundo = await recordFieldEvent(userAccountId, entrada);

    expect(segundo.id).toBe(primero.id);
    expect(await prisma.fieldEvent.count({ where: { clientDraftId: draft } })).toBe(1);
  });

  it("un rechazo no aborta el lote: las demás mutaciones se aplican igual", async () => {
    const session = await abrirJornada();
    const cerrada = await abrirJornada(new Date("2026-08-27T07:00:00Z"));
    await endFieldSession(userAccountId, {
      fieldSessionId: cerrada.id,
      endedAt: new Date("2026-08-27T09:00:00Z"),
    });

    const resultados = await pushFieldEvents(userAccountId, deviceId, [
      mutacion(session.id, `${RUN_ID}-b1`),
      // Fechado DESPUÉS del cierre de su jornada: el servidor corre y se niega.
      mutacion(cerrada.id, `${RUN_ID}-b2`, { occurredAt: new Date("2026-08-27T10:00:00Z") }),
      mutacion(session.id, `${RUN_ID}-b3`),
    ]);

    expect(resultados.map((r) => r.status)).toEqual(["applied", "rejected", "applied"]);
    expect((resultados[1] as { reason: string }).reason).toBe("event_after_session_end");
    expect(await prisma.fieldEvent.count({ where: { clientDraftId: `${RUN_ID}-b3` } })).toBe(1);
  });

  it("un dispositivo revocado no escribe nada, y el lote entero se niega", async () => {
    const session = await abrirJornada();
    const draft = `${RUN_ID}-revocado`;

    await expect(
      pushFieldEvents(userAccountId, revokedDeviceId, [mutacion(session.id, draft)]),
    ).rejects.toThrow(DeviceError);

    expect(await prisma.fieldEvent.count({ where: { clientDraftId: draft } })).toBe(0);
  });

  it("marca lastSeenAt sólo después de escribir", async () => {
    const antes = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });
    const session = await abrirJornada();
    await pushFieldEvents(userAccountId, deviceId, [mutacion(session.id, `${RUN_ID}-visto`)]);
    const despues = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } });

    expect(despues.lastSeenAt).not.toBeNull();
    if (antes.lastSeenAt) expect(despues.lastSeenAt!.getTime()).toBeGreaterThan(antes.lastSeenAt.getTime());
  });
});

describe("alta de dispositivo", () => {
  it("registra un aparato y lo deja utilizable para el push", async () => {
    const device = await registerDevice(userAccountId, { label: `TEST alta (${RUN_ID})`, platform: "pwa" });
    expect(device.platform).toBe("pwa");

    const session = await abrirJornada();
    const [r] = await pushFieldEvents(userAccountId, device.id, [mutacion(session.id, `${RUN_ID}-alta`)]);
    expect(r!.status).toBe("applied");

    await prisma.fieldEvent.deleteMany({ where: { clientDraftId: `${RUN_ID}-alta` } });
    await prisma.device.deleteMany({ where: { id: device.id } });
  });

  it("rechaza una plataforma que la puerta no acepta, aunque el esquema la aguante", async () => {
    await expect(
      registerDevice(userAccountId, { label: "x", platform: "comodoro-64" }),
    ).rejects.toThrow(DeviceValidationError);
  });

  it("rechaza una etiqueta vacía: un inventario de aparatos sin nombre no se puede leer", async () => {
    await expect(registerDevice(userAccountId, { label: "   ", platform: "pwa" })).rejects.toThrow(
      DeviceValidationError,
    );
  });

  it("rechaza una Persona que no existe en vez de reventar contra la clave foránea", async () => {
    await expect(
      registerDevice(userAccountId, {
        label: "x",
        platform: "pwa",
        operatorPersonId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toThrow(DeviceValidationError);
  });
});
