/**
 * El estado de la colonia (Anexo B §2.2) y el aviso de enjambrazón que lo
 * justifica.
 *
 * **Lo que cierra.** Siete campos que el dueño pide con su motivo al lado y que
 * **no existían**, y el que subraya: *«Celdas reales → aviso de enjambrazón antes
 * de perder la colonia. Directamente relevante al ausentamiento de Toabré»*.
 *
 * **Y lo que estas pruebas NO son.** Medido el 2026-09-12: hay **1 inspección**
 * en la copia local y sus columnas de estado están vacías, así que ningún dato
 * real ha pasado por aquí. Los fixtures crean las inspecciones, de modo que las
 * reglas sí se ejercitan — pero esto es una red para el día que lleguen, no
 * prueba de que hayan llegado.
 *
 * Las reglas puras se prueban **llamando a la función con la entrada hostil**,
 * que es lo que `CLAUDE.md` exige de cualquier cosa que vaya a llamarse guardia.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony } from "../../lib/apiary/hives";
import { recordInspection } from "../../lib/apiary/inspections";
import { avisosDeEnjambrazon } from "../../lib/apiary/avisoDeEnjambrazon";
import {
  EstadoDeColoniaInvalido,
  exigeCeldasReales,
  exigeEnteroContado,
  exigeEtapasDeCria,
} from "../../lib/apiary/estadoDeColonia";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `estado-${Date.now()}`;

describe("las reglas puras del estado de la colonia", () => {
  it("cero es una respuesta legítima; un negativo y un decimal no", () => {
    // Cero cuadros cubiertos describe una caja que se está muriendo, y es justo
    // lo que hay que poder decir. Un `!valor` lo habría rechazado.
    expect(exigeEnteroContado(0, "cuadros")).toBe(0);
    expect(exigeEnteroContado("", "cuadros")).toBeNull();
    expect(exigeEnteroContado(null, "cuadros")).toBeNull();
    expect(exigeEnteroContado("7", "cuadros")).toBe(7);
    expect(() => exigeEnteroContado(-1, "cuadros")).toThrow(EstadoDeColoniaInvalido);
    expect(() => exigeEnteroContado(2.5, "cuadros")).toThrow(EstadoDeColoniaInvalido);
  });

  it("las etapas de cría se deduplican y salen en el orden del protocolo", () => {
    // Al revés, dos inspecciones iguales se verían distintas según el orden en
    // que se pulsaron las casillas.
    expect(exigeEtapasDeCria(["pupa", "huevo", "huevo"])).toEqual(["huevo", "pupa"]);
    expect(exigeEtapasDeCria([])).toEqual([]);
    expect(exigeEtapasDeCria(null)).toEqual([]);
    expect(() => exigeEtapasDeCria(["huevo", "telepatia"])).toThrow(/etapa_de_cria_desconocido/);
  });

  it("«no hay celdas» con un número mayor que cero se RECHAZA: es una contradicción escrita", () => {
    expect(() => exigeCeldasReales("no_hay", 3)).toThrow(/no_hay_celdas_pero_trae_cuantas/);
    // Y el límite: `no_hay` con cero es consistente, así que entra.
    expect(exigeCeldasReales("no_hay", 0)).toEqual({ kind: "no_hay", count: 0 });
  });

  it("un número sin tipo se rechaza; un tipo sin número es el caso NORMAL", () => {
    expect(() => exigeCeldasReales("", 4)).toThrow(/celdas_sin_tipo/);
    // Se vieron celdas de enjambrazón y nadie las contó: con la caja abierta y
    // las manos ocupadas es lo que pasa, y rechazarlo perdería el aviso entero.
    expect(exigeCeldasReales("enjambrazon", "")).toEqual({ kind: "enjambrazon", count: null });
    expect(exigeCeldasReales("", "")).toEqual({ kind: null, count: null });
  });
});

describe("el estado de la colonia, escrito", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let scopeId: string;
  const personIds: string[] = [];
  let colonyId: string;

  async function nuevaColonia(sufijo: string) {
    const hive = await createHive(userAccountId, {
      projectId,
      locationId,
      identifier: `E${sufijo}-${RUN_ID.slice(-4)}`,
    });
    const colony = await createColony(userAccountId, {
      hiveId: hive.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
    return colony.id;
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
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Estado", displayName: `TEST Estado (${RUN_ID})`, locale: "es" },
    });
    personIds.push(person.id);
    userAccountId = (
      await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })
    ).id;
    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    scopeId = scope.id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
    colonyId = await nuevaColonia("0");
  });

  /** En `afterEach`, que corre aunque una aserción falle. */
  afterEach(async () => {
    const colonias = await prisma.colony.findMany({ where: { hive: { locationId } }, select: { id: true } });
    const ids = colonias.map((c) => c.id);
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: userAccountId }) });
    await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
  });

  afterAll(async () => {
    const colonias = await prisma.colony.findMany({ where: { hive: { locationId } }, select: { id: true } });
    const ids = colonias.map((c) => c.id);
    await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
    // La colocación es hija de la colmena y su FK es RESTRICT: sin esta línea el borrado
    // de abajo falla. `createHive` abre una desde el 2026-09-15 (ADR-135).
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("los siete campos se guardan, y el nivel de reserva convive con el sitio", async () => {
    const insp = await recordInspection(userAccountId, {
      colonyId,
      outcome: "issue_observed",
      population: "apiñada",
      beeCoveredFrames: 8,
      broodStages: ["huevo", "operculada"],
      queenCellKind: "enjambrazon",
      queenCellCount: 3,
      honeyStoresLevel: "alta",
      honeyNextToBrood: true,
      pollenStoresLevel: "baja",
      pollenNextToBrood: false,
      droneBroodPresent: true,
    });
    const fila = await prisma.inspection.findUniqueOrThrow({ where: { id: insp.id } });
    expect(fila.population).toBe("apiñada");
    expect(fila.beeCoveredFrames).toBe(8);
    expect(fila.broodStages).toEqual(["huevo", "operculada"]);
    expect(fila.queenCellKind).toBe("enjambrazon");
    expect(fila.queenCellCount).toBe(3);
    // **La decisión del dueño, comprobada:** «alta» Y «junto a la cría» a la vez.
    // Con los cuatro valores del Anexo en una sola lista esto era indecible.
    expect(fila.honeyStoresLevel).toBe("alta");
    expect(fila.honeyNextToBrood).toBe(true);
    expect(fila.pollenStoresLevel).toBe("baja");
    expect(fila.pollenNextToBrood).toBe(false);
    expect(fila.droneBroodPresent).toBe(true);
  });

  it("no registrar nada es legítimo: una inspección rápida no rellena sola", async () => {
    const insp = await recordInspection(userAccountId, { colonyId, outcome: "nothing_unusual" });
    const fila = await prisma.inspection.findUniqueOrThrow({ where: { id: insp.id } });
    expect(fila.population).toBeNull();
    expect(fila.queenCellKind).toBeNull();
    expect(fila.honeyStoresLevel).toBeNull();
    // Nada de `false` por omisión: ADR-080, la ausencia no se vuelve afirmación.
    expect(fila.droneBroodPresent).toBeNull();
    expect(fila.broodStages).toEqual([]);
  });

  it("el SERVICIO rechaza un vocabulario inventado, no sólo el formulario", async () => {
    // La frontera es el servicio: el aparato manda cadenas y un desplegable
    // manipulado no debe poder escribir. Es la lección de ADR-112.
    await expect(
      recordInspection(userAccountId, { colonyId, outcome: "issue_observed", population: "telepatia" }),
    ).rejects.toThrow(/poblacion_desconocido/);
    await expect(
      recordInspection(userAccountId, { colonyId, outcome: "issue_observed", honeyStoresLevel: "junto_a_cria" }),
    ).rejects.toThrow(/nivel_de_reserva_desconocido/);
    // Control positivo: el valor bueno SÍ entra por el mismo camino.
    const ok = await recordInspection(userAccountId, {
      colonyId,
      outcome: "issue_observed",
      population: "normal",
      honeyStoresLevel: "media",
    });
    expect(ok.population).toBe("normal");
  });

  it("y rechaza la contradicción de celdas, con la inspección sin escribir", async () => {
    await expect(
      recordInspection(userAccountId, { colonyId, outcome: "issue_observed", queenCellKind: "no_hay", queenCellCount: 5 }),
    ).rejects.toThrow(/no_hay_celdas_pero_trae_cuantas/);
    expect(await prisma.inspection.count({ where: { colonyId } })).toBe(0);
  });

  describe("EL AVISO DE ENJAMBRAZÓN", () => {
    const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const HACE_TRES_DIAS = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const desde = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    it("emergencia y enjambrazón avisan; reemplazo NO", async () => {
      const otra = await nuevaColonia("1");
      await recordInspection(userAccountId, {
        colonyId,
        outcome: "issue_observed",
        occurredAt: AYER,
        queenCellKind: "enjambrazon",
        queenCellCount: 4,
      });
      await recordInspection(userAccountId, {
        colonyId: otra,
        outcome: "issue_observed",
        occurredAt: AYER,
        queenCellKind: "reemplazo",
      });

      const avisos = await avisosDeEnjambrazon(locationId, desde);
      // Una colonia que cambia de reina por su cuenta no se está yendo: meterla
      // aquí llenaría el aviso de casos que no piden nada.
      expect(avisos.map((a) => a.colonyId)).toEqual([colonyId]);
      expect(avisos[0]!.kind).toBe("enjambrazon");
      expect(avisos[0]!.count).toBe(4);
      expect(avisos[0]!.diasDesde).toBeGreaterThanOrEqual(1);
    });

    it("una inspección que MIRA y dice «no hay» apaga el aviso", async () => {
      await recordInspection(userAccountId, {
        colonyId,
        outcome: "issue_observed",
        occurredAt: HACE_TRES_DIAS,
        queenCellKind: "enjambrazon",
      });
      expect(await avisosDeEnjambrazon(locationId, desde)).toHaveLength(1);

      await recordInspection(userAccountId, {
        colonyId,
        outcome: "nothing_unusual",
        occurredAt: AYER,
        queenCellKind: "no_hay",
      });
      expect(await avisosDeEnjambrazon(locationId, desde)).toEqual([]);
    });

    it("LA REGLA QUE IMPORTA: una inspección que NO miró no apaga el aviso", async () => {
      // Tratar «no se registró» como «ya no hay» convertiría una ausencia en una
      // afirmación —ADR-080— y apagaría el aviso justo cuando alguien pasó
      // rápido sin abrir la caja. Es el caso que pierde la colonia.
      await recordInspection(userAccountId, {
        colonyId,
        outcome: "issue_observed",
        occurredAt: HACE_TRES_DIAS,
        queenCellKind: "enjambrazon",
      });
      await recordInspection(userAccountId, { colonyId, outcome: "nothing_unusual", occurredAt: AYER });

      const avisos = await avisosDeEnjambrazon(locationId, desde);
      expect(avisos).toHaveLength(1);
      // Y la fecha que trae es la de la inspección que LO DIJO, no la de la
      // visita posterior que no miró.
      expect(avisos[0]!.occurredAt.toISOString().slice(0, 10)).toBe(HACE_TRES_DIAS.toISOString().slice(0, 10));
    });

    it("fuera de la ventana no avisa, y dentro sí — con la misma fila", async () => {
      await recordInspection(userAccountId, {
        colonyId,
        outcome: "issue_observed",
        occurredAt: HACE_TRES_DIAS,
        queenCellKind: "emergencia",
      });
      // Control positivo primero: la ventana ancha SÍ la ve. Sin esto, el cero de
      // abajo no probaría nada — podría ser que la fila no existiera.
      expect(await avisosDeEnjambrazon(locationId, desde)).toHaveLength(1);
      const soloHoy = new Date(Date.now() - 12 * 60 * 60 * 1000);
      expect(await avisosDeEnjambrazon(locationId, soloHoy)).toEqual([]);
    });

    it("trae el identificador de la colmena, que es lo que se lee en el campo", async () => {
      await recordInspection(userAccountId, {
        colonyId,
        outcome: "issue_observed",
        occurredAt: AYER,
        queenCellKind: "enjambrazon",
      });
      const avisos = await avisosDeEnjambrazon(locationId, desde);
      expect(avisos[0]!.hiveIdentifier).toContain(`E0-${RUN_ID.slice(-4)}`);
    });
  });
});
