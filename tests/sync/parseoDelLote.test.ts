/**
 * El PARSEO del lote de campo, que no tenía ninguna prueba — y el defecto que
 * eso dejó pasar.
 *
 * **Era mío.** A9.5 enseñó a `pushFieldEvents` a aplicar `colony_end` y a la cola
 * del apiario a mandarlo, y `tests/sync/finDeColoniaSinSenal.test.ts` lo comprobó
 * **llamando al servicio**. El parseo de la ruta no reconocía ese `kind`: caía al
 * camino de `FieldEvent`, que exige `fieldSessionId`, y devolvía **400 del lote
 * entero**. El cliente trata un 4xx de lote como fallo de transporte —y hace
 * bien— así que un solo borrador de fin de colonia dejaba la cola del apiario
 * **bloqueada indefinidamente**: ni él ni las inspecciones que tuviera detrás
 * volvían a subir.
 *
 * Dos pruebas en verde no podían verlo porque ninguna pasaba por el parseo, y no
 * podían: importar la ruta arrastra `next-auth`, que vitest no resuelve. De ahí
 * que el parseo viva ahora en `lib/sync/parsearMutaciones.ts`.
 *
 * **El guardia que lo hace no repetible** es el primer `it`: la lista de tipos no
 * está escrita a mano, sale de `mutacionDe` —la traducción del cliente— sobre los
 * `DraftKind` que la cola puede encolar. Un quinto tipo en el cliente sin rama en
 * el parseo hace caer esta prueba por su nombre.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { parsearMutaciones } from "../../lib/sync/parsearMutaciones";
import { pushFieldEvents } from "../../lib/sync/pushFieldEvents";
import { mutacionDe, type DraftKind, type DraftRecord } from "../../lib/apiary/offlineQueue";
import { createHive, createColony } from "../../lib/apiary/hives";
import { recordColonyEvent } from "../../lib/apiary/colonyEvents";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `lote-${Date.now()}`;

/** Los cuatro tipos que la cola del apiario puede encolar hoy. */
const TIPOS_DE_APIARIO: readonly DraftKind[] = ["inspection", "colonyEvent", "colonyEnd", "varroaCount"];

let organizationId: string;
let projectId: string;
let locationId: string;
let personId: string;
let userAccountId: string;
let scopeId: string;
let coloniaId: string;
let coloniaQueTerminaId: string;
let tratamientoId: string;
let deviceId: string;

/** Un borrador tal y como lo guarda IndexedDB, traducido por el cliente. */
function mutacionesDe(kinds: readonly DraftKind[], sufijo = ""): unknown[] {
  return kinds.map((kind) => {
    const payload: Record<string, unknown> = (
      {
        inspection: { colonyId: coloniaId, outcome: "nothing_unusual" },
        colonyEvent: { colonyId: coloniaId, eventType: "feeding", feedingMaterial: "jarabe 1:1" },
        colonyEnd: {
          colonyId: coloniaQueTerminaId,
          status: "dead",
          endedAt: "2026-06-10T00:00:00.000Z",
          reason: "caja vacía",
        },
        varroaCount: {
          colonyId: coloniaId,
          method: "alcohol",
          sampleBees: 300,
          mitesCounted: 9,
          evaluatesColonyEventId: tratamientoId,
        },
      } satisfies Record<DraftKind, Record<string, unknown>>
    )[kind];
    const draft: DraftRecord = {
      id: `${RUN_ID}-${kind}${sufijo}`,
      kind,
      payload: { ...payload, occurredAt: "2026-06-01T09:00:00.000Z" },
      createdAt: Date.parse("2026-06-01T09:00:00.000Z"),
      status: "pending",
    };
    // El JSON de ida y vuelta está a propósito: por HTTP las fechas llegan como
    // texto, y el parseo es justo lo que las vuelve fechas.
    return JSON.parse(JSON.stringify(mutacionDe(draft)));
  });
}

beforeAll(async () => {
  organizationId = (
    await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    })
  ).id;
  projectId = (
    await prisma.project.create({ data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" } })
  ).id;
  locationId = (
    await prisma.location.create({
      data: {
        locationType: "apiary_site",
        name: `TEST Sitio (${RUN_ID})`,
        organizationId,
        status: "approved",
        classification: "internal",
      },
    })
  ).id;
  personId = (
    await prisma.person.create({
      data: { givenName: "TEST", familyName: "Lote", displayName: `TEST Lote (${RUN_ID})`, locale: "es" },
    })
  ).id;
  userAccountId = (
    await prisma.userAccount.create({ data: { personId, authProvider: "credentials", status: "active" } })
  ).id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
  scopeId = scope.id;
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });

  const colmena = await createHive(userAccountId, { projectId, locationId, identifier: `L1-${RUN_ID.slice(-4)}` });
  coloniaId = (
    await createColony(userAccountId, {
      hiveId: colmena.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    })
  ).id;
  const otra = await createHive(userAccountId, { projectId, locationId, identifier: `L2-${RUN_ID.slice(-4)}` });
  coloniaQueTerminaId = (
    await createColony(userAccountId, {
      hiveId: otra.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    })
  ).id;
  tratamientoId = (
    await recordColonyEvent(userAccountId, {
      colonyId: coloniaId,
      eventType: "treatment",
      occurredAt: new Date("2026-05-01T08:00:00Z"),
      treatmentProduct: "Apivar",
      treatmentBatchLabel: `L-${RUN_ID.slice(-4)}`,
      treatmentWithdrawalDays: 14,
    })
  ).id;

  deviceId = (
    await prisma.device.create({
      data: { label: `TEST ${RUN_ID}`, platform: "pwa", createdBy: userAccountId },
    })
  ).id;
});

afterAll(async () => {
  const colonias = [coloniaId, coloniaQueTerminaId];
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: userAccountId }) });
  await prisma.varroaCount.deleteMany({ where: assertDefinedWhere({ colonyId: { in: colonias } }) });
  await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId: { in: colonias } }) });
  await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId: { in: colonias } }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
  await prisma.device.deleteMany({ where: assertDefinedWhere({ id: deviceId }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("el parseo del lote de campo", () => {
  it("EL GUARDIA: los cuatro tipos que el cliente encola los reconoce el parseo", () => {
    // Lo que el defecto original habría suspendido. Ninguno puede caer al camino
    // de `FieldEvent`: ahí falta `fieldSessionId` y el lote ENTERO se va con 400.
    const parseo = parsearMutaciones(mutacionesDe(TIPOS_DE_APIARIO));
    expect(parseo.ok, `el parseo rechazó el lote: ${JSON.stringify(parseo)}`).toBe(true);
    if (!parseo.ok) return;
    expect(parseo.mutations).toHaveLength(4);
    expect(parseo.mutations.map((m) => m.kind)).toEqual([
      "inspection",
      "colony_event",
      "colony_end",
      "varroa_count",
    ]);
  });

  it("y el parseo SÍ rechaza cuando hay que rechazar", () => {
    // Control positivo del anterior: un parseo que dijera `ok` a todo pasaría el
    // guardia igual de verde.
    expect(parsearMutaciones([{ kind: "telepatia", clientDraftId: "x", colonyId: "y" }])).toMatchObject({
      ok: false,
      error: "mutation_missing_ids",
    });
    expect(parsearMutaciones([{ kind: "varroa_count", clientDraftId: "x" }])).toMatchObject({
      ok: false,
      error: "mutation_malformed",
    });
  });

  it("las fechas vuelven a ser fechas, y el fin de colonia por su PROPIO campo", () => {
    const parseo = parsearMutaciones(mutacionesDe(["colonyEnd", "varroaCount"]));
    expect(parseo.ok).toBe(true);
    if (!parseo.ok) return;
    const [fin, conteo] = parseo.mutations;
    // `endedAt` es cuándo se perdió la colonia, no cuándo se anotó. Parsearlo
    // como `occurredAt` habría fechado la pérdida el 1 de junio.
    expect((fin as { endedAt: Date }).endedAt.toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect((conteo as { occurredAt: Date }).occurredAt.toISOString()).toBe("2026-06-01T09:00:00.000Z");
  });

  it("el lote completo se aplica de punta a punta y escribe lo que dice", async () => {
    const parseo = parsearMutaciones(mutacionesDe(TIPOS_DE_APIARIO));
    expect(parseo.ok).toBe(true);
    if (!parseo.ok) return;
    const results = await pushFieldEvents(userAccountId, deviceId, parseo.mutations);
    expect(
      results.map((r) => r.status),
      `alguna mutación no se aplicó: ${JSON.stringify(results)}`,
    ).toEqual(["applied", "applied", "applied", "applied"]);

    // Control positivo: un `applied` que no escribiera fila pasaría lo de arriba.
    const conteo = await prisma.varroaCount.findUniqueOrThrow({
      where: { clientDraftId: `${RUN_ID}-varroaCount` },
    });
    expect(conteo.method).toBe("alcohol");
    expect(conteo.sampleBees).toBe(300);
    expect(conteo.mitesCounted).toBe(9);
    expect(conteo.evaluatesColonyEventId).toBe(tratamientoId);
    // Y el fin de colonia, que es el que el parseo no reconocía, con su fecha.
    const terminada = await prisma.colony.findUniqueOrThrow({ where: { id: coloniaQueTerminaId } });
    expect(terminada.status).toBe("dead");
    expect(terminada.endedAt?.toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect(await prisma.inspection.count({ where: { colonyId: coloniaId } })).toBe(1);

    // Reenviar el mismo lote no duplica nada: es lo que pasa cuando la respuesta
    // se pierde y el cliente reintenta.
    const reenvio = parsearMutaciones(mutacionesDe(TIPOS_DE_APIARIO));
    expect(reenvio.ok).toBe(true);
    if (!reenvio.ok) return;
    const otraVez = await pushFieldEvents(userAccountId, deviceId, reenvio.mutations);
    expect(otraVez.map((r) => r.status)).toEqual(["duplicate", "duplicate", "duplicate", "duplicate"]);
    expect(await prisma.varroaCount.count({ where: { colonyId: coloniaId } })).toBe(1);
  });

  it("«ALCANZA HASTA» LLEGA COMO DÍA, no como texto ni como instante", () => {
    // Anexo B §3. Es un `type="date"`, así que tiene que quedar a medianoche UTC.
    // Dejarlo pasar como cadena haría que Prisma lo interpretara por su cuenta, y
    // parsearlo como instante lo movería un día según la zona — que es exactamente
    // el fallo que tumbó la creación de colmenas el 2026-09-11.
    const parseo = parsearMutaciones([
      {
        kind: "colony_event",
        clientDraftId: `${RUN_ID}-alimento`,
        colonyId: coloniaId,
        occurredAt: "2026-09-13T09:00:00.000Z",
        eventType: "feeding",
        feedingMaterial: "jarabe 1:1",
        coverageUntil: "2026-09-30T00:00:00.000Z",
      },
    ]);
    expect(parseo.ok).toBe(true);
    if (!parseo.ok) return;
    const m = parseo.mutations[0] as { coverageUntil: Date | null };
    expect(m.coverageUntil).toBeInstanceOf(Date);
    expect(m.coverageUntil!.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("y un «alcanza hasta» que no es un día rechaza el lote en vez de inventarlo", () => {
    // `fechaDeDia` falla en vez de suponer. Un `new Date("hace dos semanas")` da
    // `Invalid Date`, y escribirlo sería guardar basura con cara de fecha.
    expect(
      parsearMutaciones([
        {
          kind: "colony_event",
          clientDraftId: `${RUN_ID}-malo`,
          colonyId: coloniaId,
          occurredAt: "2026-09-13T09:00:00.000Z",
          eventType: "feeding",
          coverageUntil: "hace dos semanas",
        },
      ]),
    ).toMatchObject({ ok: false, error: "mutation_malformed" });
  });

  it("un conteo con el método mal escrito se rechaza SOLO, sin tumbar el lote", async () => {
    // La propiedad que importa del protocolo: un dato malo no puede bloquear al
    // resto de la cola. Un `kind` no reconocido hacía exactamente eso.
    const parseo = parsearMutaciones([
      {
        kind: "varroa_count",
        clientDraftId: `${RUN_ID}-metodo-malo`,
        colonyId: coloniaId,
        occurredAt: "2026-06-02T09:00:00.000Z",
        method: "telepatia",
        sampleBees: 300,
        mitesCounted: 1,
      },
      {
        kind: "varroa_count",
        clientDraftId: `${RUN_ID}-bueno-detras`,
        colonyId: coloniaId,
        occurredAt: "2026-06-03T09:00:00.000Z",
        method: "bandeja",
        sampleBees: 200,
        mitesCounted: 2,
      },
    ]);
    expect(parseo.ok).toBe(true);
    if (!parseo.ok) return;
    const results = await pushFieldEvents(userAccountId, deviceId, parseo.mutations);
    expect(results[0]).toMatchObject({ status: "rejected", reason: "metodo_desconocido" });
    // El bueno que venía detrás SÍ entró: eso distingue un rechazo por mutación
    // de un 400 de lote.
    expect(results[1]!.status).toBe("applied");
  });
});
