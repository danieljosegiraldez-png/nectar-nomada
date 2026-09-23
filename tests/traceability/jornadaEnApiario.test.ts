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
import {
  startFieldSession,
  endFieldSession,
  completarVisita,
  HORAS_DE_VENTANA_DE_CIERRE,
  LocationAccessError,
  FieldSessionValidationError,
} from "../../lib/traceability/fieldSessions";
import { recordInspection } from "../../lib/apiary/inspections";
import { recordColonyEvent } from "../../lib/apiary/colonyEvents";
import { pushFieldEvents } from "../../lib/sync/pushFieldEvents";
import {
  emitirReporteDeVisita,
  leerReporteDeVisita,
  publicarReporteConEnlace,
  abrirReportePorEnlace,
  revocarEnlace,
  ReporteError,
  enlacesPublicadosDeVisita,
} from "../../lib/traceability/reporteDeVisita";
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
  // `exigirPersonaPermitida` sólo deja figurar a quien pertenece a la finca del
  // registro (o al equipo Néctar Nómada); sin esto el operador queda fuera.
  await prisma.organizationMembership.create({ data: { personId: operatorPersonId, organizationId } });

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
  // La prueba del informe registra un tratamiento, y la FK de `colony_event` es RESTRICT:
  // sin esta linea el borrado de la colonia falla y el archivo entero sale en rojo con
  // las 37 pruebas en verde.
  await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ hiveId }) });
  // La colocación es hija de la colmena y su FK es RESTRICT: sin esta línea el borrado
  // de abajo falla. `createHive` abre una desde el 2026-09-15 (ADR-135).
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId: apiarioId } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId: apiarioId }) });

  // **Acotado a las visitas de ESTA prueba.** Antes decía sólo
  // `{ subjectEntityType: "field_session" }`, sin `RUN_ID` ni nada que lo
  // atara aquí: cogía TODOS los informes de visita de la base y los borraba
  // con sus versiones y publicaciones. `assertDefinedWhere` no puede verlo
  // —el `where` del borrado está perfectamente definido—; lo que estaba mal
  // era la SELECCIÓN. Medido el 2026-09-15 sembrando un informe ajeno antes
  // de correrla: desaparecía, y la prueba pasaba 35/35 mientras tanto.
  const idsDeSesion = sesiones.map((s) => s.id);
  const reportes = await prisma.report.findMany({
    where: { subjectEntityType: "field_session", subjectEntityId: { in: idsDeSesion } },
    select: { id: true },
  });
  const versiones = await prisma.reportVersion.findMany({ where: { reportId: { in: reportes.map((r) => r.id) } }, select: { id: true } });
  await prisma.reportPublication.deleteMany({ where: assertDefinedWhere({ reportVersionId: { in: versiones.map((v) => v.id) } }) });
  await prisma.reportVersion.deleteMany({ where: assertDefinedWhere({ reportId: { in: reportes.map((r) => r.id) } }) });
  await prisma.report.deleteMany({ where: assertDefinedWhere({ id: { in: reportes.map((r) => r.id) } }) });

  const cuentas = [registradorPorSitio, registradorPorProyecto, operarioDeFinca, apicultorConManejo];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [...locationIds, projectId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.organizationMembership.deleteMany({ where: assertDefinedWhere({ personId: operatorPersonId }) });
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

describe("A9.3 — el cierre deja rastro, y se distingue del campo", () => {
  it("completar una visita la marca, fija la ventana y audita como CIERRE", async () => {
    // La exigencia del dueño no era una tabla: era que lo capturado frente a la
    // caja no se sobreescriba en silencio al completarlo en la casa.
    const visita = await startFieldSession(apicultorConManejo, visita_(apiarioId));
    const antes = Date.now();

    const cerrada = await completarVisita(apicultorConManejo, {
      fieldSessionId: visita.id,
      notes: `TEST cerrado en el carro (${RUN_ID})`,
      reason: "completado fuera de campo",
    });

    expect(cerrada.status).toBe("completed");
    expect(cerrada.completedAt).not.toBeNull();
    // La ventana son 48 h desde que se terminó de escribir, no desde que se
    // salió del sitio.
    const ventana = cerrada.editWindowExpiresAt!.getTime() - cerrada.completedAt!.getTime();
    expect(Math.round(ventana / 3600_000)).toBe(HORAS_DE_VENTANA_DE_CIERRE);
    expect(cerrada.completedAt!.getTime()).toBeGreaterThanOrEqual(antes - 1000);

    // Y lo que hace innecesaria la entidad nueva: la MISMA columna distingue
    // quién escribió qué y desde dónde.
    const evento = await prisma.auditEvent.findFirst({
      where: { entityId: visita.id, operation: "field_session.complete" },
      orderBy: { occurredAt: "desc" },
    });
    expect(evento, "completar no dejó AuditEvent").not.toBeNull();
    expect(evento!.sourceInterface).toBe("traceability.close");
    expect(evento!.reason).toBe("completado fuera de campo");
    expect(evento!.before, "sin `before` no se puede saber qué se cambió").not.toBeNull();

    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ id: evento!.id }) });
  });

  it("pasada la ventana ya no se edita: se enmienda", async () => {
    const visita = await startFieldSession(apicultorConManejo, visita_(apiarioId));
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id });

    // Se envejece la ventana a mano en vez de esperar 48 horas.
    await prisma.fieldSession.update({
      where: { id: visita.id },
      data: { editWindowExpiresAt: new Date(Date.now() - 1000) },
    });

    await expect(completarVisita(apicultorConManejo, { fieldSessionId: visita.id, notes: "tarde" })).rejects.toThrow(
      FieldSessionValidationError,
    );
  });

  it("una visita bloqueada no se toca, y lo dice distinto de la ventana", async () => {
    // Cerrada por decisión y cerrada por plazo son dos cosas, y quien lo lea
    // necesita saber cuál de las dos.
    const visita = await startFieldSession(apicultorConManejo, visita_(apiarioId));
    await prisma.fieldSession.update({ where: { id: visita.id }, data: { status: "locked" } });

    await expect(completarVisita(apicultorConManejo, { fieldSessionId: visita.id })).rejects.toThrow(
      /session_locked/,
    );
  });

  it("quien no puede abrir la visita tampoco puede cerrarla", async () => {
    const visita = await startFieldSession(apicultorConManejo, visita_(apiarioId));
    await expect(completarVisita(operarioDeFinca, { fieldSessionId: visita.id })).rejects.toThrow(LocationAccessError);
  });
});

describe("A9.6 — el reporte se congela, no se re-consulta", () => {
  it("una visita sin completar no se puede reportar", async () => {
    // Un reporte de algo que aún puede cambiar quedaría congelado igual, y con
    // el mismo número. El cierre de A9.3 es su precondición.
    const visita = await startFieldSession(apicultorConManejo, visita_(apiarioId));
    await expect(emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id })).rejects.toThrow(ReporteError);
  });

  it("emitido, el contenido queda congelado y no cambia al cambiar los datos", async () => {
    // Es la propiedad entera de D7: el documento que el cliente descargue en
    // marzo y el que descargue en septiembre son el mismo.
    // Hora propia: las demás pruebas dejan visitas abiertas con la misma hora
    // declarada, y sin esto «la visita abierta» dependía del desempate.
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-03T13:00:00Z"),
    });
    await recordInspection(apicultorConManejo, { colonyId, outcome: "nothing_unusual", note: `TEST rep (${RUN_ID})` });
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id, notes: "notas originales" });

    const { version, snapshot } = await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });
    expect(version.version).toBe(1);
    expect(snapshot.registros.length).toBe(1);
    expect(snapshot.visita.notas).toBe("notas originales");

    // Se cambian los datos vivos DESPUÉS de emitir.
    await prisma.fieldSession.update({ where: { id: visita.id }, data: { notes: "corregido despues" } });

    const guardado = await prisma.reportVersion.findUniqueOrThrow({ where: { id: version.id } });
    const congelado = guardado.renderedSnapshot as unknown as { visita: { notas: string } };
    expect(congelado.visita.notas, "el snapshot siguió a los datos vivos: no está congelado").toBe("notas originales");
  });

  it("EL INFORME NOMBRA LA COLMENA Y QUÉ SE HIZO, no sólo la clase del registro", async () => {
    // Hasta el 2026-09-15 cada línea del informe al cliente decía «inspección · inspeccion ·
    // operador» y nada más: ni de qué caja hablaba ni qué se le hizo. Un informe técnico que
    // no nombra la colmena es un listado de tipos de fila.
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-04T13:00:00Z"),
    });
    await recordInspection(apicultorConManejo, { colonyId, outcome: "issue_observed" });
    await recordColonyEvent(apicultorConManejo, {
      colonyId,
      eventType: "treatment",
      treatmentProduct: "Apivar",
      treatmentBatchLabel: `L-${RUN_ID.slice(-4)}`,
      treatmentWithdrawalDays: 14,
      treatmentTarget: "varroa",
    });
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id });

    const { snapshot } = await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });
    const colmena = `${RUN_ID}-H1`;
    expect(snapshot.registros.length).toBeGreaterThanOrEqual(2);
    // Las dos líneas nombran la caja.
    expect(snapshot.registros.every((r) => r.colmena === colmena)).toBe(true);
    // Y cada una dice lo suyo: el resultado de la inspección y el producto del tratamiento.
    const detalles = snapshot.registros.map((r) => r.detalle);
    expect(detalles).toContain("issue_observed");
    expect(detalles).toContain("Apivar");
  });

  it("un informe emitido ANTES de este cambio se sigue leyendo, sin los dos campos nuevos", async () => {
    // El snapshot es inmutable y no se reescribe hacia atrás, así que los campos nuevos
    // FALTAN en lo ya emitido. El tipo los declara opcionales por eso: un campo obligatorio
    // haría creer a TypeScript que esas filas lo traen.
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-05T13:00:00Z"),
    });
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id });
    const { version } = await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });

    // Se reescribe el snapshot guardado como lo escribía la versión anterior: sin `colmena`
    // ni `detalle`. Es el estado real de todo lo emitido hasta hoy.
    const guardado = await prisma.reportVersion.findUniqueOrThrow({ where: { id: version.id } });
    const viejo = guardado.renderedSnapshot as unknown as { registros: Record<string, unknown>[] };
    for (const r of viejo.registros) {
      delete r.colmena;
      delete r.detalle;
    }
    await prisma.reportVersion.update({ where: { id: version.id }, data: { renderedSnapshot: viejo as object } });

    const leido = await leerReporteDeVisita(apicultorConManejo, visita.id);
    expect(leido, "el reporte se lee igual").toBeTruthy();
    for (const r of leido!.snapshot.registros) {
      expect(r.colmena).toBeUndefined();
      expect(r.detalle).toBeUndefined();
    }
  });

  it("LA VISITA GUARDA A QUÉ SE FUE, y lo valida en la frontera", async () => {
    // Era la única pregunta obligatoria DE PATIO del protocolo sin dónde guardarse (ADR-140).
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-06T13:00:00Z"),
      purposes: ["tratamiento", "inspeccion"],
    });
    const guardada = await prisma.fieldSession.findUniqueOrThrow({ where: { id: visita.id } });
    // En el orden del catálogo, no en el que llegaron.
    expect(guardada.purposes).toEqual(["inspeccion", "tratamiento"]);
  });

  it("una visita sin propósitos los deja VACÍOS, que es «sin registrar» y no «sin propósito»", async () => {
    // Es el estado de todas las visitas anteriores a este campo, y de la cola offline de un
    // dispositivo que todavía no lo manda. Exigirlo aquí las rompería.
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-07T13:00:00Z"),
    });
    const guardada = await prisma.fieldSession.findUniqueOrThrow({ where: { id: visita.id } });
    expect(guardada.purposes).toEqual([]);
  });

  it("pero un propósito inventado se rechaza, no se guarda", async () => {
    await expect(
      startFieldSession(apicultorConManejo, {
        ...visita_(apiarioId),
        startedAt: new Date("2026-09-08T13:00:00Z"),
        purposes: ["trasiego"],
      }),
    ).rejects.toThrow(/trasiego/);
  });

  it("LAS TRES DE CASA se guardan al completar, y la recomendación llega al informe", async () => {
    // Son las que convierten una visita en un informe técnico (ADR-142). `stage: close`: el
    // §7 dice que no se piden en el patio, y el cierre es el formulario de la casa.
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-09T13:00:00Z"),
      purposes: ["diagnostico"],
    });
    await completarVisita(apicultorConManejo, {
      fieldSessionId: visita.id,
      travelCostUsd: 42.5,
      probableCause: "Sequía y poca floración en el lindero norte.",
      recommendation: "Alimentar cada diez días hasta que abra el nance.",
    });
    const guardada = await prisma.fieldSession.findUniqueOrThrow({ where: { id: visita.id } });
    expect(guardada.travelCostUsd?.toString()).toBe("42.5");
    expect(guardada.probableCause).toMatch(/Sequía/);

    const { snapshot } = await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });
    expect(snapshot.recomendacion).toMatch(/nance/);
    expect(snapshot.causaProbable).toMatch(/Sequía/);
  });

  it("LOS VIÁTICOS NO VIAJAN AL INFORME salvo que el contrato los pida", async () => {
    // La regla ya existía antes de que el campo existiera: `incluyeCostos` nace en `false`.
    // Lo que no se congela no se puede filtrar mal después.
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-10T13:00:00Z"),
    });
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id, travelCostUsd: 80 });

    const callado = await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });
    expect(callado.snapshot.viaticosUsd, "no se congela por defecto").toBeNull();

    // Control positivo: pidiéndolos, sí viajan. Sin esta mitad, el `null` de arriba lo
    // cumpliría igual un campo que nunca se rellena.
    const pedido = await emitirReporteDeVisita(apicultorConManejo, {
      fieldSessionId: visita.id,
      incluirCostos: true,
    });
    expect(pedido.snapshot.viaticosUsd).toBe("80");
  });

  it("cero viáticos es un dato, y un viático negativo se rechaza", async () => {
    // Una visita a Cerro Azul en carro propio puede costar cero de verdad; `null` es «no se
    // anotó». Y no existe un viático de menos ocho dólares.
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-11T13:00:00Z"),
    });
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id, travelCostUsd: 0 });
    const guardada = await prisma.fieldSession.findUniqueOrThrow({ where: { id: visita.id } });
    expect(guardada.travelCostUsd?.toString()).toBe("0");

    await expect(
      completarVisita(apicultorConManejo, { fieldSessionId: visita.id, travelCostUsd: -8 }),
    ).rejects.toThrow(/travel_cost_invalid/);
  });

  it("emitir otra vez crea una VERSIÓN nueva, no pisa la anterior", async () => {
    const visita = await startFieldSession(apicultorConManejo, visita_(apiarioId));
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id });

    const primera = await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });
    const segunda = await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });

    expect(segunda.version.version).toBe(primera.version.version + 1);
    expect(segunda.reporte.id).toBe(primera.reporte.id);
    const cuantas = await prisma.reportVersion.count({ where: { reportId: primera.reporte.id } });
    expect(cuantas).toBe(2);
  });

  it("los costos NO entran al snapshot salvo que el contrato lo pida", async () => {
    // Lo que no se congela no se puede filtrar mal después. Es más seguro que
    // esconderlos al renderizar.
    const visita = await startFieldSession(apicultorConManejo, visita_(apiarioId));
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id });

    const porDefecto = await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });
    const q = porDefecto.version.generationQuery as unknown as { incluyeCostos: boolean };
    expect(q.incluyeCostos).toBe(false);
  });

  it("quien no puede ver la visita no puede emitir su reporte", async () => {
    const visita = await startFieldSession(apicultorConManejo, visita_(apiarioId));
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id });
    await expect(emitirReporteDeVisita(operarioDeFinca, { fieldSessionId: visita.id })).rejects.toThrow(
      LocationAccessError,
    );
  });
});

describe("A9.6 — la página del reporte lee el snapshot, no la visita", () => {
  it("devuelve lo congelado aunque la visita haya cambiado después", async () => {
    // Si esto leyera la visita, el documento cambiaría bajo los pies del
    // cliente y el número de reporte dejaría de significar nada.
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-04T13:00:00Z"),
    });
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id, notes: "lo que se entregó" });
    await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });

    await prisma.fieldSession.update({ where: { id: visita.id }, data: { notes: "cambiado despues" } });

    const leido = await leerReporteDeVisita(apicultorConManejo, visita.id);
    expect(leido, "no devolvió el reporte emitido").not.toBeNull();
    expect(leido!.snapshot.visita.notas).toBe("lo que se entregó");
    expect(leido!.version).toBe(1);
  });

  it("una visita sin reporte devuelve null, que no es lo mismo que uno vacío", async () => {
    // La página lo dice en vez de enseñar un documento en blanco que
    // parecería un reporte real.
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-05T13:00:00Z"),
    });
    expect(await leerReporteDeVisita(apicultorConManejo, visita.id)).toBeNull();
  });

  it("devuelve siempre la ÚLTIMA versión emitida", async () => {
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-06T13:00:00Z"),
    });
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id, notes: "primera" });
    await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });
    await prisma.fieldSession.update({ where: { id: visita.id }, data: { notes: "segunda" } });
    await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });

    const leido = await leerReporteDeVisita(apicultorConManejo, visita.id);
    expect(leido!.version).toBe(2);
    expect(leido!.snapshot.visita.notas).toBe("segunda");
  });

  it("quien no puede ver la visita tampoco lee su reporte", async () => {
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-07T13:00:00Z"),
    });
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id });
    await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });
    await expect(leerReporteDeVisita(operarioDeFinca, visita.id)).rejects.toThrow(LocationAccessError);
  });
});

describe("A9.6 — el enlace que abre el cliente sin cuenta", () => {
  async function visitaConReporte(dia: string) {
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date(`2026-09-${dia}T13:00:00Z`),
    });
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id, notes: `entregado ${dia}` });
    await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });
    return visita;
  }

  /**
   * **El camino de la PANTALLA, que es el que estaba roto.**
   *
   * Hasta el 2026-09-10 el boton «Cerrar jornada» llamaba a `endFieldSession`
   * —que pone `endedAt`, cuando se salio del sitio— y **nada** llamaba a
   * `completarVisita`, que es lo unico que pone `status: "completed"`. Como
   * `emitirReporteDeVisita` exige eso, el boton de emitir contestaba «cierra la
   * visita» **justo despues de cerrarla**, sin salida posible desde la
   * aplicacion.
   *
   * No lo cazo ninguna prueba porque todas construian la visita con
   * `completarVisita` directamente — el servicio que la pantalla NO usaba. Esta
   * recorre la secuencia tal cual la hace una persona.
   */
  it("cerrar la jornada NO basta para emitir: hace falta completarla", async () => {
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-14T13:00:00Z"),
    });

    // Lo que hace el botón «Cerrar jornada».
    await endFieldSession(apicultorConManejo, {
      fieldSessionId: visita.id,
      endedAt: new Date("2026-09-14T17:00:00Z"),
    });
    const trasCerrar = await prisma.fieldSession.findUniqueOrThrow({ where: { id: visita.id } });
    expect(trasCerrar.endedAt, "cerrar sí pone endedAt").not.toBeNull();
    expect(trasCerrar.status, "…y deja el estado en borrador").toBe("draft");

    await expect(
      emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id }),
      "emitir tras sólo cerrar debe seguir negándose: es la regla, no el fallo",
    ).rejects.toThrow(/visita_sin_completar/);

    // Y lo que hace el botón «Completar visita», que hasta hoy no existía.
    await completarVisita(apicultorConManejo, {
      fieldSessionId: visita.id,
      coloniesAliveCount: 4,
      nextVisitDueAt: new Date("2026-10-14T00:00:00Z"),
      reason: "completada en la casa",
    });
    const trasCompletar = await prisma.fieldSession.findUniqueOrThrow({ where: { id: visita.id } });
    expect(trasCompletar.status).toBe("completed");
    expect(trasCompletar.coloniesAliveCount).toBe(4);

    // Ahora sí. Es el control positivo: sin él, un `emitir` que fallara SIEMPRE
    // pasaría la aserción de arriba y nadie lo diría.
    const emitido = await emitirReporteDeVisita(apicultorConManejo, { fieldSessionId: visita.id });
    expect(emitido, "completada, el informe sí sale").toBeTruthy();
  });

  it("con el enlace se abre el reporte, SIN sesión y sin RBAC", async () => {
    const visita = await visitaConReporte("10");
    const { token } = await publicarReporteConEnlace(apicultorConManejo, { fieldSessionId: visita.id });

    const abierto = await abrirReportePorEnlace(token);
    expect(abierto, "el enlace no abrió el reporte").not.toBeNull();
    expect(abierto!.snapshot.visita.notas).toBe("entregado 10");
  });

  it("el token NO queda en claro en la base", async () => {
    // Lo que queda es su hash. Quien lea la base no puede usar el enlace, que
    // es la misma razon escrita en `lib/sync/deviceTokens.ts`.
    const visita = await visitaConReporte("11");
    const { token, publicacionId } = await publicarReporteConEnlace(apicultorConManejo, { fieldSessionId: visita.id });

    const fila = await prisma.reportPublication.findUniqueOrThrow({ where: { id: publicacionId } });
    expect(fila.linkTokenHash).not.toBe(token);
    expect(fila.linkTokenHash).toMatch(/^[0-9a-f]{64}$/);

    // Y tampoco en el rastro: un audit que guarde la llave es una segunda copia
    // de la llave.
    const audit = await prisma.auditEvent.findFirst({
      where: { entityId: publicacionId, operation: "report_publication.create" },
    });
    expect(JSON.stringify(audit)).not.toContain(token);
  });

  /**
   * **El lector que faltaba para poder revocar.** `revocarEnlace` necesita el
   * id de la publicación y nada lo devolvía a una pantalla, así que se podía
   * entregar un enlace y no había forma de cortarlo desde la aplicación —
   * justo lo que el comentario de `ReportPublication` dice que pesa más que
   * ahorrar una consulta.
   */
  it("lista los enlaces entregados, con el revocado marcado y sin el token", async () => {
    const visita = await visitaConReporte("12");
    const vivo = await publicarReporteConEnlace(apicultorConManejo, { fieldSessionId: visita.id });
    const cortado = await publicarReporteConEnlace(apicultorConManejo, { fieldSessionId: visita.id });
    await revocarEnlace(apicultorConManejo, cortado.publicacionId);

    const lista = await enlacesPublicadosDeVisita(apicultorConManejo, visita.id);
    expect(lista.length, "los dos enlaces, el vivo y el cortado").toBe(2);

    const vivoEnLista = lista.find((e) => e.id === vivo.publicacionId);
    const cortadoEnLista = lista.find((e) => e.id === cortado.publicacionId);
    expect(vivoEnLista?.revokedAt, "el vivo no está revocado").toBeNull();
    expect(cortadoEnLista?.revokedAt, "el cortado sí, y no se borra de la lista").not.toBeNull();

    // **El token no sale, ni hasheado.** La pantalla revoca por id; devolver la
    // cerradura no le sirve de nada y la enseñaría sin razón.
    expect(JSON.stringify(lista)).not.toContain(vivo.token);
    expect(JSON.stringify(lista)).not.toContain("linkTokenHash");
  });

  it("y quien no puede ver la visita tampoco puede listar sus enlaces", async () => {
    const visita = await visitaConReporte("13");
    await publicarReporteConEnlace(apicultorConManejo, { fieldSessionId: visita.id });
    await expect(enlacesPublicadosDeVisita(operarioDeFinca, visita.id)).rejects.toThrow(LocationAccessError);
  });

  it("un token inventado no abre nada, y no dice por qué", async () => {
    expect(await abrirReportePorEnlace("no-es-un-token")).toBeNull();
    expect(await abrirReportePorEnlace("x".repeat(43))).toBeNull();
  });

  it("caducado deja de abrir", async () => {
    const visita = await visitaConReporte("12");
    const { token, publicacionId } = await publicarReporteConEnlace(apicultorConManejo, { fieldSessionId: visita.id });
    await prisma.reportPublication.update({
      where: { id: publicacionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await abrirReportePorEnlace(token)).toBeNull();
  });

  it("revocado deja de abrir, y por eso el token se guarda", async () => {
    // Es la razón entera de guardarlo en vez de firmarlo: poder cortarlo.
    const visita = await visitaConReporte("13");
    const { token, publicacionId } = await publicarReporteConEnlace(apicultorConManejo, { fieldSessionId: visita.id });
    expect(await abrirReportePorEnlace(token)).not.toBeNull();

    await revocarEnlace(apicultorConManejo, publicacionId);
    expect(await abrirReportePorEnlace(token)).toBeNull();
  });

  it("no se publica un reporte que no se ha emitido", async () => {
    const visita = await startFieldSession(apicultorConManejo, {
      ...visita_(apiarioId),
      startedAt: new Date("2026-09-14T13:00:00Z"),
    });
    await completarVisita(apicultorConManejo, { fieldSessionId: visita.id });
    await expect(publicarReporteConEnlace(apicultorConManejo, { fieldSessionId: visita.id })).rejects.toThrow(
      ReporteError,
    );
  });

  it("quien no puede ver la visita no puede publicarla ni revocarla", async () => {
    const visita = await visitaConReporte("15");
    await expect(publicarReporteConEnlace(operarioDeFinca, { fieldSessionId: visita.id })).rejects.toThrow(
      LocationAccessError,
    );
    const { publicacionId } = await publicarReporteConEnlace(apicultorConManejo, { fieldSessionId: visita.id });
    await expect(revocarEnlace(operarioDeFinca, publicacionId)).rejects.toThrow(LocationAccessError);
  });
});
