/**
 * A9.0 — la compuerta de una jornada de campo resuelve por el tipo del sitio.
 *
 * La propiedad que motiva todo el alcance: el **Apiary Colony Event Recorder**
 * —el residente entrenado que registra sin viajar— tiene `colony_event:manage`
 * pero **no** `location:manage_attributes`, así que con la compuerta anterior
 * no podía abrir una visita a su propio apiario. Y la mitad que no se ve: no
 * por eso puede abrir una jornada en una parcela de café.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { startFieldSession, endFieldSession, LocationAccessError } from "../../lib/traceability/fieldSessions";
import { recordInspection } from "../../lib/apiary/inspections";
import { pushFieldEvents } from "../../lib/sync/pushFieldEvents";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a90-${Date.now()}`;

let organizationId: string;
let projectId: string;
let apiarioId: string;
let parcelaId: string;
let operatorPersonId: string;
let registradorPorSitio: string;
let registradorPorProyecto: string;
let operarioDeFinca: string;
let colonyId: string;
let apicultorConManejo: string;
let deviceId: string;
let hiveId: string;

async function crearPersona(label: string) {
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  return p.id;
}

async function crearCuenta(label: string) {
  const personId = await crearPersona(label);
  const cuenta = await prisma.userAccount.create({
    data: { personId, authProvider: "credentials", status: "active" },
  });
  return cuenta.id;
}

async function asignar(userAccountId: string, perfil: string, scopeType: "location" | "project", scopeRefId: string) {
  const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  // `Scope` es único por (scopeType, scopeRefId): dos personas asignadas al
  // mismo sitio comparten fila, no crean una segunda.
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType, scopeRefId } })) ??
    (await prisma.scope.create({ data: { scopeType, scopeRefId } }));
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: profile.id, scopeId: scope.id } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Finca (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const project = await prisma.project.create({
    data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = project.id;

  const apiario = await prisma.location.create({
    data: { locationType: "apiary_site", name: `TEST Apiario (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  apiarioId = apiario.id;

  const parcela = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Parcela (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  parcelaId = parcela.id;

  // La colmena es lo que ata el apiario a un proyecto: `FieldSession` no lleva
  // proyecto, así que los candidatos de proyecto salen de aquí.
  const hive = await prisma.hive.create({
    data: { identifier: `${RUN_ID}-H1`, locationId: apiarioId, projectId, status: "active" },
  });
  hiveId = hive.id;
  const colony = await prisma.colony.create({
    data: { hiveId, status: "active", startedAt: new Date("2026-09-02T13:00:00Z"), originType: "purchased", provenanceClass: "original_record" },
  });
  colonyId = colony.id;

  operatorPersonId = await crearPersona("Apicultor");

  registradorPorSitio = await crearCuenta("RegistradorSitio");
  await asignar(registradorPorSitio, "Apiary Colony Event Recorder", "location", apiarioId);

  registradorPorProyecto = await crearCuenta("RegistradorProyecto");
  await asignar(registradorPorProyecto, "Apiary Colony Event Recorder", "project", projectId);

  operarioDeFinca = await crearCuenta("OperarioFinca");
  await asignar(operarioDeFinca, "Farm Operator", "location", parcelaId);

  // `recordInspection` exige `apiary:manage` A PROPÓSITO: §7 del informe de
  // agosto pide que el acceso a eventos de colonia nunca implique acceso a
  // inspección, y `lib/apiary/hives.ts` lo dice en su comentario. El
  // registrador entrenado abre la visita y registra eventos; para inspeccionar
  // hace falta esta otra autoridad.
  apicultorConManejo = await crearCuenta("ApicultorManejo");
  await asignar(apicultorConManejo, "Farm Operator", "location", apiarioId);

  const device = await prisma.device.create({
    data: { label: `TEST tel (${RUN_ID})`, platform: "pwa" },
  });
  deviceId = device.id;
});

afterAll(async () => {
  const locationIds = [apiarioId, parcelaId];
  const sesiones = await prisma.fieldSession.findMany({ where: { locationId: { in: locationIds } }, select: { id: true } });
  await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: { in: sesiones.map((s) => s.id) } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: sesiones.map((s) => s.id) } }) });
  await prisma.device.deleteMany({ where: assertDefinedWhere({ id: deviceId }) });
  await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ hiveId }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId: apiarioId }) });

  const cuentas = [registradorPorSitio, registradorPorProyecto, operarioDeFinca, apicultorConManejo];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [...locationIds, projectId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

const visita_ = (locationId: string) => ({
  locationId,
  operatorPersonId,
  startedAt: new Date("2026-09-02T13:00:00Z"),
  provenanceClass: "direct_observation" as const,
});

describe("A9.0 — quién abre una jornada, según dónde", () => {
  it("el registrador de eventos de colonia SÍ abre una visita en su apiario", async () => {
    // El caso que motiva el alcance. Antes de A9.0 esto lanzaba
    // `no_location_attribute_access`: el perfil no tiene ese permiso y no debe
    // tenerlo — es la autoridad para reescribir el terruño del sitio.
    const sesion = await startFieldSession(registradorPorSitio, visita_(apiarioId));
    expect(sesion.locationId).toBe(apiarioId);
  });

  it("también si su asignación es por PROYECTO y no por sitio", async () => {
    // `FieldSession` no lleva proyecto, así que sin resolver los proyectos de
    // las colmenas del apiario esta persona quedaría fuera en silencio.
    const sesion = await startFieldSession(registradorPorProyecto, visita_(apiarioId));
    expect(sesion.locationId).toBe(apiarioId);
  });

  it("pero NO abre una jornada en una parcela de café", async () => {
    // La mitad que no se ve. La compuerta se ensancha para el apiario, no para
    // todo: en un sitio que no es `apiary_site` sigue mandando
    // `location:manage_attributes`.
    await expect(startFieldSession(registradorPorSitio, visita_(parcelaId))).rejects.toThrow(LocationAccessError);
  });

  it("y el operario de finca sigue abriendo la suya, como antes", async () => {
    const sesion = await startFieldSession(operarioDeFinca, visita_(parcelaId));
    expect(sesion.locationId).toBe(parcelaId);
  });

  it("un sitio que no existe se rechaza, no se trata como público", async () => {
    await expect(
      startFieldSession(operarioDeFinca, visita_("00000000-0000-0000-0000-000000000000")),
    ).rejects.toThrow(LocationAccessError);
  });
});

describe("A9.2 — una visita agrupa lo que se registra durante ella", () => {
  async function inspeccionar(quien: string, nota: string) {
    return recordInspection(quien, { colonyId, outcome: "nothing_unusual", note: nota });
  }

  const eventoDe = (inspectionId: string) =>
    prisma.fieldEvent.findFirst({ where: { inspectionId }, select: { id: true, fieldSessionId: true } });

  it("una inspección hecha con la visita abierta queda dentro de ella", async () => {
    // El hecho que motiva el alcance: hoy una ida donde se revisan tres
    // colonias son tres `Inspection` y ningún registro del viaje.
    const visita = await startFieldSession(apicultorConManejo, visita_(apiarioId));
    const inspeccion = await inspeccionar(apicultorConManejo, `TEST dentro (${RUN_ID})`);

    const evento = await eventoDe(inspeccion.id);
    expect(evento, "la inspección no quedó ligada a la visita abierta").not.toBeNull();
    expect(evento!.fieldSessionId).toBe(visita.id);

    await endFieldSession(apicultorConManejo, { fieldSessionId: visita.id, endedAt: new Date() });
  });

  it("sin visita abierta, la inspección se registra igual y queda suelta", async () => {
    // La mitad que importa: el enganche no puede ser un requisito. Quien
    // registra sin haber abierto visita sigue registrando, como hoy.
    const inspeccion = await inspeccionar(apicultorConManejo, `TEST suelta (${RUN_ID})`);
    expect(inspeccion.id).toBeTruthy();
    expect(await eventoDe(inspeccion.id)).toBeNull();
  });

  it("no engancha a la visita de OTRA persona", async () => {
    // Enganchar el trabajo de alguien a la jornada ajena falsea quién fue, que
    // es justo lo que la visita existe para registrar.
    const visitaAjena = await startFieldSession(registradorPorProyecto, visita_(apiarioId));
    const inspeccion = await inspeccionar(apicultorConManejo, `TEST ajena (${RUN_ID})`);

    expect(await eventoDe(inspeccion.id)).toBeNull();
    await endFieldSession(registradorPorProyecto, { fieldSessionId: visitaAjena.id, endedAt: new Date() });
  });

  it("no engancha a una visita ya cerrada", async () => {
    const cerrada = await startFieldSession(apicultorConManejo, visita_(apiarioId));
    await endFieldSession(apicultorConManejo, { fieldSessionId: cerrada.id, endedAt: new Date() });

    const inspeccion = await inspeccionar(apicultorConManejo, `TEST cerrada (${RUN_ID})`);
    expect(await eventoDe(inspeccion.id)).toBeNull();
  });
});

describe("A9.5 — el lote acepta lo que se captura en el apiario", () => {
  it("una inspección empujada por lotes entra, y cae dentro de la visita abierta", async () => {
    // Es la mitad del servidor del colapso de las dos colas: hasta ahora el
    // lote sólo aceptaba `FieldEvent`, y una inspección no lo es.
    const visita = await startFieldSession(apicultorConManejo, visita_(apiarioId));
    const borrador = `${RUN_ID}-lote-1`;

    const [resultado] = await pushFieldEvents(apicultorConManejo, deviceId, [
      {
        kind: "inspection",
        clientDraftId: borrador,
        colonyId,
        occurredAt: new Date("2026-09-02T14:00:00Z"),
        outcome: "nothing_unusual",
        note: `TEST por lotes (${RUN_ID})`,
      },
    ]);

    expect(resultado!.status).toBe("applied");
    const inspeccion = await prisma.inspection.findUniqueOrThrow({ where: { clientDraftId: borrador } });

    // Y lo que hace que valga la pena: el enganche de A9.2 funciona igual
    // viniendo del lote. No hubo que repetir la regla en el camino nuevo.
    const evento = await prisma.fieldEvent.findFirst({ where: { inspectionId: inspeccion.id } });
    expect(evento, "la inspección del lote no quedó ligada a la visita").not.toBeNull();
    expect(evento!.fieldSessionId).toBe(visita.id);

    await endFieldSession(apicultorConManejo, { fieldSessionId: visita.id, endedAt: new Date() });
  });

  it("reenviar el mismo borrador dice `duplicate`, no crea una segunda", async () => {
    // Un reintento tras una respuesta perdida es lo normal sin señal: tiene que
    // ser inocuo Y decirlo, que es lo que el protocolo por lotes promete.
    const borrador = `${RUN_ID}-lote-2`;
    const mutacion = {
      kind: "inspection" as const,
      clientDraftId: borrador,
      colonyId,
      occurredAt: new Date("2026-09-02T15:00:00Z"),
      outcome: "nothing_unusual",
    };

    const [primera] = await pushFieldEvents(apicultorConManejo, deviceId, [mutacion]);
    const [segunda] = await pushFieldEvents(apicultorConManejo, deviceId, [mutacion]);

    expect(primera).toBeDefined();
    expect(segunda).toBeDefined();
    expect(primera!.status).toBe("applied");
    expect(segunda!.status).toBe("duplicate");
    // La misma fila, no una segunda con otro id: es lo que hace inocuo el
    // reintento.
    const idPrimera = primera!.status === "applied" ? primera!.id : null;
    const idSegunda = segunda!.status === "duplicate" ? segunda!.id : null;
    expect(idSegunda).toBe(idPrimera);

    const cuantas = await prisma.inspection.count({ where: { clientDraftId: borrador } });
    expect(cuantas).toBe(1);
  });

  it("sin permiso, el lote lo RECHAZA en vez de tragárselo", async () => {
    // Un rechazo del servidor se informa y el borrador se descarta; un error
    // inesperado se relanza. Confundirlos borraría trabajo de campo
    // presentándolo como dato inválido.
    const [resultado] = await pushFieldEvents(registradorPorSitio, deviceId, [
      {
        kind: "inspection",
        clientDraftId: `${RUN_ID}-lote-3`,
        colonyId,
        occurredAt: new Date("2026-09-02T16:00:00Z"),
        outcome: "nothing_unusual",
      },
    ]);
    expect(resultado!.status).toBe("rejected");
    expect(await prisma.inspection.count({ where: { clientDraftId: `${RUN_ID}-lote-3` } })).toBe(0);
  });
});
