/**
 * Anexo E §5 -- "Al cerrarla: resumen de lo registrado, lo que quedo pendiente".
 *
 * Medido sobre `main` antes de escribir: `resumenDeVisita` existia desde A9.1 y aparecia en
 * **cero** pantallas, y de "lo que quedo pendiente" no habia nada. Las dos mitades de la
 * frase faltaban en la pantalla donde se cierra.
 *
 * Lo que estas pruebas fijan es la pregunta del oficio: **abriste cuatro de diez, cuales seis
 * se quedaron**.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createColony, createHive } from "../../lib/apiary/hives";
import { recordInspection } from "../../lib/apiary/inspections";
import { recordColonyEvent } from "../../lib/apiary/colonyEvents";
import { registrarConteoDeVarroa } from "../../lib/apiary/varroa";
import { pendientesDeLaVisita } from "../../lib/apiary/pendienteDeLaVisita";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `pend-${Date.now()}`;
const AHORA = new Date("2026-09-15T20:00:00Z");

describe("Anexo E §5 -- lo que quedo pendiente al cerrar", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let personId: string;
  let fieldSessionId: string;
  let cajas: { id: string; identifier: string; colonyId: string | null }[] = [];

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
      })
    ).id;
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Pend", displayName: `TEST Pend (${RUN_ID})`, locale: "es" },
    });
    personId = person.id;
    userAccountId = (
      await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })
    ).id;
    projectId = (
      await prisma.project.create({ data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" } })
    ).id;
    locationId = (
      await prisma.location.create({
        data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
      })
    ).id;
    const farmOperator = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperator.id, scopeId: scope.id } });

    // Cuatro cajas: tres con colonia viva y una vacia.
    for (let i = 0; i < 4; i++) {
      const hive = await createHive(userAccountId, { projectId, locationId, identifier: `P${i}-${RUN_ID.slice(-5)}` });
      let colonyId: string | null = null;
      if (i < 3) {
        colonyId = (
          await createColony(userAccountId, {
            hiveId: hive.id,
            originType: "captured",
            startedAt: new Date("2026-01-01"),
            provenanceClass: "direct_observation",
          })
        ).id;
      }
      cajas.push({ id: hive.id, identifier: hive.identifier, colonyId });
    }

    // La jornada abierta. Los eventos se ligan solos a ella (A9.2).
    fieldSessionId = (
      await prisma.fieldSession.create({
        data: {
          locationId,
          operatorPersonId: personId,
          startedAt: AHORA,
          status: "draft",
          provenanceClass: "original_record",
          createdBy: userAccountId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    const colonias = await prisma.colony.findMany({ where: assertDefinedWhere({ hive: { locationId } }), select: { id: true } });
    const ids = colonias.map((c) => c.id);
    await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId }) });
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
    await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("sin ningun evento, TODAS las cajas del sitio estan sin tocar", async () => {
    const p = (await pendientesDeLaVisita(fieldSessionId, AHORA))!;
    expect(p.sinTocar).toHaveLength(4);
    expect(p.tocadas).toBe(0);
    // Y distingue las pobladas: tres con colonia viva, una caja vacia.
    expect(p.sinTocarPobladas).toBe(3);
  });

  it("LA PREGUNTA DEL OFICIO: una inspeccion quita SU caja de la lista y deja las demas", async () => {
    await recordInspection(userAccountId, {
      colonyId: cajas[0]!.colonyId!,
      occurredAt: AHORA,
      outcome: "nothing_unusual",
    });
    const p = (await pendientesDeLaVisita(fieldSessionId, AHORA))!;
    expect(p.tocadas).toBe(1);
    expect(p.sinTocar.map((c) => c.identifier)).not.toContain(cajas[0]!.identifier);
    expect(p.sinTocar).toHaveLength(3);
    expect(p.sinTocarPobladas).toBe(2);
  });

  it("un evento de colonia cuenta igual que una inspeccion: son tres caminos, no uno", async () => {
    // Si el lector mirara solo `inspectionId`, una caja alimentada seguiria saliendo como
    // sin tocar y el cierre reclamaria trabajo ya hecho.
    await recordColonyEvent(userAccountId, {
      colonyId: cajas[1]!.colonyId!,
      eventType: "feeding",
      occurredAt: AHORA,
      feedingMaterial: "jarabe 1:1",
    });
    const p = (await pendientesDeLaVisita(fieldSessionId, AHORA))!;
    expect(p.tocadas).toBe(2);
    expect(p.sinTocar.map((c) => c.identifier)).not.toContain(cajas[1]!.identifier);
  });

  it("la caja vacia sigue apareciendo, y marcada como no poblada", async () => {
    // No se esconde: el apiario tiene cuatro cajas y decir tres mentiria. Pero la cifra que
    // decide si te vas es la de las pobladas.
    const p = (await pendientesDeLaVisita(fieldSessionId, AHORA))!;
    const vacia = p.sinTocar.find((c) => c.identifier === cajas[3]!.identifier);
    expect(vacia, "la caja vacia esta en la lista").toBeTruthy();
    expect(vacia!.poblada).toBe(false);
  });

  it("una jornada que no existe devuelve null, no una lista vacia", async () => {
    // Vacio significaria "no quedo nada pendiente", que es una afirmacion sobre una visita
    // que no existe.
    expect(await pendientesDeLaVisita("00000000-0000-0000-0000-000000000000", AHORA)).toBeNull();
  });

  it("los eventos de OTRA jornada del mismo sitio no cuentan como tocadas", async () => {
    // El control que separa "esta visita" de "este sitio": sin el filtro por jornada, una
    // visita anterior haria creer que ya abriste todo hoy.
    const otra = await prisma.fieldSession.create({
      data: {
        locationId,
        operatorPersonId: personId,
        startedAt: new Date("2026-09-01T10:00:00Z"),
        status: "draft",
        provenanceClass: "original_record",
        createdBy: userAccountId,
      },
    });
    const p = (await pendientesDeLaVisita(otra.id, AHORA))!;
    expect(p.tocadas, "en la otra jornada no se ha tocado nada").toBe(0);
    expect(p.sinTocar).toHaveLength(4);
    // Y control positivo de que la primera SI tiene dos tocadas, o esto no medira nada.
    expect((await pendientesDeLaVisita(fieldSessionId, AHORA))!.tocadas).toBe(2);
    await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: otra.id }) });
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: otra.id }) });
  });
});


/**
 * Una visita PASADA se mide con las cajas que habia ENTONCES, no con las de hoy.
 *
 * **Ningun dato real ejercita esto, y por eso el fixture lo fabrica.** Medido el 2026-10-08 sobre
 * la base compartida: 9 colmenas, 9 colocaciones vigentes, **0 traslados historicos**. Una prueba
 * que recorriera los datos de la casa pasaria con la lectura vieja y con la nueva — seria una red
 * para el dia que lleguen, no un guardia. Los cuatro casos de abajo se construyen a mano.
 *
 * El estado se escribe con `prisma` y no con `trasladarColmenas`, porque lo que se prueba es la
 * LECTURA; pero es exactamente el estado que ese servicio produce (`traslado.ts:196-210`): cierra
 * la colocacion vigente con `endedAt`, abre otra en el destino, y actualiza `hive.locationId`.
 */
describe("la visita pasada ve las cajas de entonces", () => {
  const R = `plc-${Date.now()}`;
  const VISITA = new Date("2026-05-10T14:00:00Z");
  const ANTES = new Date("2026-01-01T00:00:00Z");
  const DESPUES = new Date("2026-08-01T00:00:00Z");

  let organizationId: string;
  let sitio: string;
  let otroSitio: string;
  let personId: string;
  let userAccountId: string;
  let visitaId: string;
  const ident: Record<string, string> = {};

  /** Una caja con su colocacion, puesta a mano para poder fechar la historia. */
  async function caja(clave: string, locationIdActual: string, colocaciones: { locationId: string; startedAt: Date; endedAt?: Date }[]) {
    const identifier = `${clave}-${R.slice(-6)}`;
    const h = await prisma.hive.create({
      data: { identifier, locationId: locationIdActual, status: "active", installedAt: ANTES },
    });
    for (const c of colocaciones) {
      await prisma.hivePlacement.create({
        data: { hiveId: h.id, locationId: c.locationId, startedAt: c.startedAt, endedAt: c.endedAt ?? null },
      });
    }
    ident[clave] = identifier;
    return h.id;
  }

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST Farm (${R})`, status: "approved", classification: "internal" },
      })
    ).id;
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Plc", displayName: `TEST Plc (${R})`, locale: "es" },
    });
    personId = person.id;
    userAccountId = (
      await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })
    ).id;
    const sitioDe = async (n: string) =>
      (
        await prisma.location.create({
          data: { locationType: "apiary_site", name: `TEST ${n} (${R})`, organizationId, status: "approved", classification: "internal" },
        })
      ).id;
    sitio = await sitioDe("Sitio");
    otroSitio = await sitioDe("Otro");

    // 1. EL DEFECTO: estaba aqui el dia de la visita y se la llevaron DESPUES.
    await caja("ida", otroSitio, [
      { locationId: sitio, startedAt: ANTES, endedAt: DESPUES },
      { locationId: otroSitio, startedAt: DESPUES },
    ]);
    // 2. Al reves: ese dia estaba en OTRO sitio y la trajeron despues.
    await caja("venida", sitio, [
      { locationId: otroSitio, startedAt: ANTES, endedAt: DESPUES },
      { locationId: sitio, startedAt: DESPUES },
    ]);
    // 3. Sin ninguna colocacion — el estado medido de las diez de Las Nubes.
    await caja("huerfana", sitio, []);
    // 4. Control positivo: una caja normal, aqui desde antes y sin moverse.
    await caja("quieta", sitio, [{ locationId: sitio, startedAt: ANTES }]);

    visitaId = (
      await prisma.fieldSession.create({
        data: {
          locationId: sitio,
          operatorPersonId: personId,
          startedAt: VISITA,
          status: "draft",
          provenanceClass: "original_record",
          createdBy: userAccountId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    // Descubre lo que tiene que borrar por el RUN, no lo hereda: una corrida que muera a medias
    // se limpia igual.
    const colmenas = await prisma.hive.findMany({
      where: assertDefinedWhere({ identifier: { contains: R.slice(-6) } }),
      select: { id: true },
    });
    const ids = colmenas.map((h) => h.id);
    await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSession: { location: { name: { contains: R } } } }) });
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ location: { name: { contains: R } } }) });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: ids } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ name: { contains: R } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("la caja que se llevaron DESPUES sigue contando en esa visita", async () => {
    // Con la lectura vieja —`hive.locationId`— esta caja apunta hoy al otro sitio, asi que
    // desaparecia de una visita en la que SI estaba. Es el defecto que esto cierra.
    const p = (await pendientesDeLaVisita(visitaId, VISITA))!;
    expect(p.sinTocar.map((c) => c.identifier)).toContain(ident.ida);
  });

  it("la caja que trajeron DESPUES no cuenta en esa visita", async () => {
    // La otra mitad, y sin ella la primera se podria pasar devolviendo todas las cajas del mundo.
    const p = (await pendientesDeLaVisita(visitaId, VISITA))!;
    expect(p.sinTocar.map((c) => c.identifier)).not.toContain(ident.venida);
  });

  it("una caja SIN ninguna colocacion no desaparece", async () => {
    // El estado medido de las diez de Apiario Las Nubes. Si una consulta mirara solo
    // colocaciones, estas diez se irian de la lista de cierre sin que nada fallara.
    const p = (await pendientesDeLaVisita(visitaId, VISITA))!;
    expect(p.sinTocar.map((c) => c.identifier)).toContain(ident.huerfana);
  });

  it("y la cuenta entera: tres de cuatro, no cuatro ni dos", async () => {
    // Control positivo del conjunto. Las tres aserciones de arriba se podrian pasar devolviendo
    // de mas; esta fija el numero exacto y nombra a la caja quieta, que es la que nadie discute.
    const p = (await pendientesDeLaVisita(visitaId, VISITA))!;
    expect(p.sinTocar.map((c) => c.identifier).sort()).toEqual([ident.huerfana, ident.ida, ident.quieta].sort());
    expect(p.tocadas).toBe(0);
  });
});


/**
 * **El pendiente sale del PROPÓSITO de la visita** — V-3 de la revisión del Apiario, con la regla
 * que decidió Daniel el 2026-10-08 (V-10): cada propósito pide su registro. Inspección pide una
 * inspección (vale «nada fuera de lo normal»); alimentación, tratamiento y cosecha, su manejo;
 * diagnóstico, una inspección o un conteo de varroa; montaje, nada por caja. Con varios
 * propósitos, el pendiente de cada uno, y el total de colonias contado una vez.
 *
 * Hasta entonces era un solo conjunto de «tocadas»: una visita de inspección en la que sólo se
 * alimentó daba la caja por atendida, y un conteo de varroa no contaba para nada.
 *
 * Cuatro cajas, una por caso: A inspeccionada, B alimentada, C con SÓLO conteo de varroa, D vacía.
 * Los propósitos se cambian entre pruebas sobre la misma visita: lo que se mide es la lectura.
 */
describe("el pendiente sale del propósito de la visita", () => {
  const R = `prop-${Date.now()}`;
  const DIA = new Date("2026-09-16T14:00:00Z");
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let personId: string;
  let visitaId: string;
  const caja: Record<"A" | "B" | "C" | "D", { id: string; identifier: string; colonyId: string | null }> = {} as never;

  const conPropositos = (purposes: ("inspeccion" | "alimentacion" | "tratamiento" | "cosecha" | "montaje" | "diagnostico")[]) =>
    prisma.fieldSession.update({ where: { id: visitaId }, data: { purposes } });
  const faltan = (p: Awaited<ReturnType<typeof pendientesDeLaVisita>>, proposito: string) =>
    p!.porProposito?.find((x) => x.proposito === proposito)?.faltan.map((c) => c.identifier).sort();
  const ids = (...k: ("A" | "B" | "C" | "D")[]) => k.map((x) => caja[x].identifier).sort();

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST Farm (${R})`, status: "approved", classification: "internal" },
      })
    ).id;
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Prop", displayName: `TEST Prop (${R})`, locale: "es" },
    });
    personId = person.id;
    userAccountId = (
      await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })
    ).id;
    projectId = (
      await prisma.project.create({ data: { name: `TEST Proyecto (${R})`, status: "approved", classification: "internal" } })
    ).id;
    locationId = (
      await prisma.location.create({
        data: { locationType: "apiary_site", name: `TEST Sitio (${R})`, organizationId, status: "approved", classification: "internal" },
      })
    ).id;
    const farmOperator = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperator.id, scopeId: scope.id } });

    for (const k of ["A", "B", "C", "D"] as const) {
      const hive = await createHive(userAccountId, { projectId, locationId, identifier: `${k}-${R.slice(-6)}` });
      const colonyId =
        k === "D"
          ? null
          : (
              await createColony(userAccountId, {
                hiveId: hive.id,
                originType: "captured",
                startedAt: new Date("2026-01-01"),
                provenanceClass: "direct_observation",
              })
            ).id;
      caja[k] = { id: hive.id, identifier: hive.identifier, colonyId };
    }

    visitaId = (
      await prisma.fieldSession.create({
        data: { locationId, operatorPersonId: personId, startedAt: DIA, status: "draft", provenanceClass: "original_record", createdBy: userAccountId },
      })
    ).id;
    // Los registros se ligan solos a la visita abierta (A9.2), como en el campo.
    await recordInspection(userAccountId, { colonyId: caja.A.colonyId!, outcome: "nothing_unusual", occurredAt: DIA });
    await recordColonyEvent(userAccountId, { colonyId: caja.B.colonyId!, eventType: "feeding", occurredAt: DIA, feedingMaterial: "jarabe 1:1" });
    await registrarConteoDeVarroa(userAccountId, { colonyId: caja.C.colonyId!, occurredAt: DIA, method: "alcohol", sampleBees: 300, mitesCounted: 3 });
    // Control de que los tres quedaron DENTRO de la visita: sin esto, «falta» podría significar
    // «el registro se fue a otra visita».
    expect(await prisma.fieldEvent.count({ where: { fieldSessionId: visitaId } })).toBe(3);
  });

  afterAll(async () => {
    const colonias = await prisma.colony.findMany({ where: assertDefinedWhere({ hive: { locationId } }), select: { id: true } });
    const cids = colonias.map((c) => c.id);
    await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSession: { locationId } }) });
    await prisma.varroaCount.deleteMany({ where: assertDefinedWhere({ colonyId: { in: cids } }) });
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId: { in: cids } }) });
    await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId: { in: cids } }) });
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: cids } }) });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("una visita de INSPECCIÓN en la que sólo se alimentó deja la caja pendiente de inspección", async () => {
    await conPropositos(["inspeccion"]);
    const p = await pendientesDeLaVisita(visitaId, DIA);
    // B se alimentó y C sólo tuvo varroa: a ninguna de las dos se le hizo la inspección que se vino a hacer.
    expect(faltan(p, "inspeccion")).toEqual(ids("B", "C", "D"));
    expect(p!.porProposito?.find((x) => x.proposito === "inspeccion")?.faltanPobladas).toBe(2);
  });

  it("una de ALIMENTACIÓN pide la alimentación, no una inspección", async () => {
    await conPropositos(["alimentacion"]);
    expect(faltan(await pendientesDeLaVisita(visitaId, DIA), "alimentacion")).toEqual(ids("A", "C", "D"));
  });

  it("una de DIAGNÓSTICO se da por atendida con una inspección O con un conteo de varroa", async () => {
    await conPropositos(["diagnostico"]);
    expect(faltan(await pendientesDeLaVisita(visitaId, DIA), "diagnostico")).toEqual(ids("B", "D"));
  });

  it("una de MONTAJE no deja pendientes por caja", async () => {
    await conPropositos(["montaje"]);
    expect(faltan(await pendientesDeLaVisita(visitaId, DIA), "montaje")).toEqual([]);
  });

  it("con DOS propósitos sale el pendiente de cada uno, y el total cuenta cada caja una vez", async () => {
    await conPropositos(["inspeccion", "alimentacion"]);
    const p = await pendientesDeLaVisita(visitaId, DIA);
    expect(faltan(p, "inspeccion")).toEqual(ids("B", "C", "D"));
    expect(faltan(p, "alimentacion")).toEqual(ids("A", "C", "D"));
    expect(p!.total).toBe(4);
    expect(p!.porActividad).toEqual({ inspeccion: 1, alimentacion: 1, tratamiento: 0, cosecha: 0, varroa: 1, otro: 0 });
    expect(p!.sinActividad).toBe(1);
  });

  it("una visita SIN propósito (las de antes) sigue como siempre, y ahora la varroa también cuenta", async () => {
    await conPropositos([]);
    const p = await pendientesDeLaVisita(visitaId, DIA);
    expect(p!.porProposito, "sin propósito no hay pendiente por propósito: se usa el de siempre").toBeNull();
    // C sólo tuvo un conteo de varroa: antes salía como «sin tocar».
    expect(p!.sinTocar.map((c) => c.identifier)).toEqual(ids("D"));
    expect(p!.tocadas).toBe(3);
  });
});

/**
 * **El día del traslado, la caja sigue en el ORIGEN** — V-4 de la revisión del Apiario, con la regla
 * que decidió Daniel el 2026-10-08 (V-H2): el traslado es de día (ADR-112), la caja cuenta en el
 * origen todo ese día y en el destino desde el siguiente.
 *
 * #685 midió la visita pasada por la colocación que cubre el INSTANTE de inicio. Un traslado cierra
 * la colocación de origen a medianoche UTC del día, así que una visita al origen esa misma mañana
 * ya no veía la caja, y una al destino sí. El día se mide en la zona del sitio (Panamá si no tiene).
 */
describe("el día del traslado la caja sigue en el origen", () => {
  const R = `tras-${Date.now()}`;
  const ANTES = new Date("2026-01-01T00:00:00Z");
  /** Campo de día: medianoche UTC del 20 de mayo, como lo guarda `trasladarColmenas`. */
  const DIA_DEL_TRASLADO = new Date("2026-05-20T00:00:00Z");
  let organizationId: string;
  let origen: string;
  let destino: string;
  let personId: string;
  let userAccountId: string;
  let identificador: string;

  async function visita(locationId: string, startedAt: Date) {
    return (
      await prisma.fieldSession.create({
        data: { locationId, operatorPersonId: personId, startedAt, status: "draft", provenanceClass: "original_record", createdBy: userAccountId },
      })
    ).id;
  }
  const laVe = async (locationId: string, startedAt: Date) =>
    (await pendientesDeLaVisita(await visita(locationId, startedAt), startedAt))!.sinTocar.map((c) => c.identifier).includes(identificador);

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST Farm (${R})`, status: "approved", classification: "internal" },
      })
    ).id;
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Tras", displayName: `TEST Tras (${R})`, locale: "es" },
    });
    personId = person.id;
    userAccountId = (
      await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })
    ).id;
    const sitioDe = async (n: string) =>
      (
        await prisma.location.create({
          data: { locationType: "apiary_site", name: `TEST ${n} (${R})`, organizationId, status: "approved", classification: "internal" },
        })
      ).id;
    origen = await sitioDe("Origen");
    destino = await sitioDe("Destino");
    // El estado que deja `trasladarColmenas` (`traslado.ts:196-210`): la colocación del origen se
    // cierra en el día del traslado, la del destino se abre ese mismo día, y la caja apunta allí.
    identificador = `M-${R.slice(-6)}`;
    const h = await prisma.hive.create({ data: { identifier: identificador, locationId: destino, status: "active", installedAt: ANTES } });
    await prisma.hivePlacement.create({ data: { hiveId: h.id, locationId: origen, startedAt: ANTES, endedAt: DIA_DEL_TRASLADO } });
    await prisma.hivePlacement.create({ data: { hiveId: h.id, locationId: destino, startedAt: DIA_DEL_TRASLADO } });
  });

  afterAll(async () => {
    const colmenas = await prisma.hive.findMany({ where: assertDefinedWhere({ identifier: { contains: R.slice(-6) } }), select: { id: true } });
    const hids = colmenas.map((h) => h.id);
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ location: { name: { contains: R } } }) });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: hids } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: hids } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ name: { contains: R } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("la mañana del traslado, la visita al ORIGEN la cuenta", async () => {
    expect(await laVe(origen, new Date("2026-05-20T14:00:00Z"))).toBe(true);
  });

  it("y la visita al DESTINO ese mismo día no la cuenta todavía", async () => {
    expect(await laVe(destino, new Date("2026-05-20T14:00:00Z"))).toBe(false);
  });

  it("a las 22:00 de Panamá sigue en el origen, aunque en UTC ya sea el día siguiente", async () => {
    // 03:00 UTC del 21 son las 22:00 del 20 en Panamá. Medir el día en UTC la mandaría al destino.
    expect(await laVe(origen, new Date("2026-05-21T03:00:00Z"))).toBe(true);
  });

  it("al día siguiente ya cuenta en el destino, y no en el origen", async () => {
    // Control de las tres de arriba: sin él, una lectura que la dejara para siempre en el origen las pasaría.
    expect(await laVe(destino, new Date("2026-05-21T14:00:00Z"))).toBe(true);
    expect(await laVe(origen, new Date("2026-05-21T14:00:00Z"))).toBe(false);
  });
});
