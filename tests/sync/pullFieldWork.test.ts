/**
 * P4 §5 (46_P4_API_Y_SINCRONIZACION.md). Postgres real, fixtures por RUN_ID.
 *
 * **Lo que estos tests defienden:** que un aparato no descargue trabajo de una
 * finca que no es suya, y que un cursor no se salte filas. Las dos cosas fallan
 * en silencio — la primera es una fuga, la segunda es trabajo de campo que
 * nadie vuelve a ver— y ninguna produce una excepción.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { startFieldSession, endFieldSession, recordFieldEvent } from "../../lib/traceability/fieldSessions";
import { pullFieldWork, CURSOR_VACIO } from "../../lib/sync/pullFieldWork";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `p4pull-${Date.now()}`;

let organizationId: string;
let plotMio: string;
let plotAjeno: string;
let personId: string;
let userAccountId: string;
let kindId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = org.id;

  const mk = async (etiqueta: string) =>
    (await prisma.location.create({
      data: { locationType: "plot", name: `TEST ${etiqueta} (${RUN_ID})`, organizationId,
              status: "approved", classification: "internal" },
    })).id;
  plotMio = await mk("Mio");
  plotAjeno = await mk("Ajeno");

  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Op", displayName: `TEST Op (${RUN_ID})`, locale: "es" },
  });
  personId = persona.id;
  const cuenta = await prisma.userAccount.create({
    data: { personId, authProvider: "credentials", status: "active" },
  });
  userAccountId = cuenta.id;

  // Alcance SÓLO sobre plotMio. plotAjeno existe y es del mismo tipo y
  // clasificación: si apareciera en el pull sería por falta de filtro, no por
  // ser distinto de alguna otra forma.
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotMio } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });

  kindId = (
    await prisma.variableCatalogValue.findFirstOrThrow({
      where: { value: "observacion", catalog: { key: "event_kind" } },
    })
  ).id;
});

afterAll(async () => {
  const ids = [plotMio, plotAjeno];
  const ses = await prisma.fieldSession.findMany({ where: { locationId: { in: ids } }, select: { id: true } });
  const sesIds = ses.map((s) => s.id);
  await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: { in: sesIds } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: sesIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: ids } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

const abrir = (locationId: string, startedAt = new Date("2026-08-28T07:00:00Z")) =>
  startFieldSession(userAccountId, { locationId, operatorPersonId: personId, startedAt,
                                     provenanceClass: "direct_observation" });

describe("pull por cursor", () => {
  /**
   * LA propiedad de seguridad. El aparato no pide un ámbito: lo resuelve el
   * servidor. Una jornada del lote ajeno existe, tiene la misma pinta, y no
   * debe salir.
   */
  it("no descarga trabajo de una Location fuera del alcance del operador", async () => {
    const mia = await abrir(plotMio);
    // El ajeno se crea saltándose el servicio a propósito: `startFieldSession`
    // exigiría permiso, y lo que se prueba aquí es el filtro del PULL, no el
    // de la escritura.
    const ajena = await prisma.fieldSession.create({
      data: { locationId: plotAjeno, operatorPersonId: personId, startedAt: new Date("2026-08-28T07:00:00Z"),
              provenanceClass: "direct_observation", createdBy: userAccountId },
    });

    const r = await pullFieldWork(userAccountId);
    const ids = r.sessions.map((s) => s.id);

    expect(ids, "la jornada del lote propio tiene que venir").toContain(mia.id);
    expect(ids, "la del lote ajeno NO").not.toContain(ajena.id);
    expect(r.locations.map((l) => l.id)).toEqual([plotMio]);
  });

  /**
   * La razón entera de que `FieldSession` lleve `updatedAt`. Sin él esta
   * jornada no volvería a aparecer nunca y el aparato la mostraría abierta para
   * siempre.
   */
  it("una jornada que se cierra vuelve a salir después del cursor", async () => {
    const s = await abrir(plotMio, new Date("2026-08-29T07:00:00Z"));
    const primera = await pullFieldWork(userAccountId);
    expect(primera.sessions.map((x) => x.id)).toContain(s.id);

    // Nada nuevo: el cursor está al día.
    const vacia = await pullFieldWork(userAccountId, primera.cursor);
    expect(vacia.sessions.map((x) => x.id)).not.toContain(s.id);

    await endFieldSession(userAccountId, { fieldSessionId: s.id, endedAt: new Date("2026-08-29T09:00:00Z") });

    const tercera = await pullFieldWork(userAccountId, primera.cursor);
    const vuelta = tercera.sessions.find((x) => x.id === s.id);
    expect(vuelta, "cerrarla la modifica: tiene que volver a cruzar el cursor").toBeDefined();
    expect(vuelta!.endedAt).not.toBeNull();
  });

  /**
   * El caso que un cursor sólo por marca de tiempo se salta: dos filas con el
   * MISMO instante. Sin el id como desempate, la segunda página empieza después
   * de una marca que ambas comparten y una de las dos no se descarga nunca.
   */
  it("dos filas con la misma marca de tiempo no se saltan", async () => {
    const s = await abrir(plotMio, new Date("2026-08-30T07:00:00Z"));
    const a = await recordFieldEvent(userAccountId, {
      fieldSessionId: s.id, eventKindValueId: kindId,
      occurredAt: new Date("2026-08-30T07:30:00Z"), provenanceClass: "direct_observation", notes: "A" });
    const b = await recordFieldEvent(userAccountId, {
      fieldSessionId: s.id, eventKindValueId: kindId,
      occurredAt: new Date("2026-08-30T07:31:00Z"), provenanceClass: "direct_observation", notes: "B" });

    // Se fuerza el empate, que es difícil de provocar y trivial de encontrarse.
    const mismoInstante = new Date("2026-08-30T08:00:00.000Z");
    await prisma.$executeRawUnsafe(
      `UPDATE "traceability"."field_event" SET created_at = $1 WHERE id IN ($2::uuid, $3::uuid)`,
      mismoInstante, a.id, b.id,
    );

    const p1 = await pullFieldWork(userAccountId, CURSOR_VACIO, 1);
    const p2 = await pullFieldWork(userAccountId, p1.cursor, 1);
    const vistos = [...p1.events, ...p2.events].map((e) => e.id);

    expect(vistos, "las dos tienen que aparecer, una por página").toContain(a.id);
    expect(vistos).toContain(b.id);
    expect(new Set(vistos).size, "y ninguna dos veces").toBe(vistos.length);
  });

  it("el cursor no avanza donde no hubo filas", async () => {
    const r = await pullFieldWork(userAccountId);
    const soloEventos = await pullFieldWork(userAccountId, { ...r.cursor, eventCreatedAt: null, eventId: null });
    // La mitad de sesiones venía al día y no trae nada; su posición se conserva
    // en vez de volverse null y hacer que todo se re-descargue.
    expect(soloEventos.cursor.sessionUpdatedAt).toBe(r.cursor.sessionUpdatedAt);
    expect(soloEventos.cursor.sessionId).toBe(r.cursor.sessionId);
  });

  it("sin ámbito no se descarga nada, y el cursor se devuelve intacto", async () => {
    const otra = await prisma.person.create({
      data: { givenName: "TEST", familyName: "SinAmbito", displayName: `TEST SinAmbito (${RUN_ID})`, locale: "es" },
    });
    const cuenta = await prisma.userAccount.create({
      data: { personId: otra.id, authProvider: "credentials", status: "active" },
    });
    const cursorPrevio = { sessionUpdatedAt: "2026-01-01T00:00:00.000Z", sessionId: "x",
                           eventCreatedAt: null, eventId: null };
    const r = await pullFieldWork(cuenta.id, cursorPrevio);

    expect(r.locations).toEqual([]);
    expect(r.sessions).toEqual([]);
    expect(r.events).toEqual([]);
    expect(r.cursor, "sin ámbito el cursor no se toca").toEqual(cursorPrevio);

    await prisma.userAccount.deleteMany({ where: { id: cuenta.id } });
    await prisma.person.deleteMany({ where: { id: otra.id } });
  });

  it("hasMore dice la verdad cuando hay más de una página", async () => {
    const r = await pullFieldWork(userAccountId, CURSOR_VACIO, 1);
    expect(r.hasMore).toBe(true);
    expect(r.sessions.length).toBeLessThanOrEqual(1);
  });

  it("el vocabulario de tipos de evento viaja entero", async () => {
    const r = await pullFieldWork(userAccountId);
    expect(r.eventKinds.length).toBeGreaterThan(0);
    expect(r.eventKinds.map((k) => k.value)).toContain("observacion");
  });
});
