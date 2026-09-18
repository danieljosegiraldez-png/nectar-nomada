/**
 * ADR-145 — el meliponario como tipo de sitio propio, y el predicado que lo hace posible.
 *
 * Decision del dueno, 2026-09-16: *"diria tener meliponiarios y tener apiarios separado aunque
 * el apicultor tiene acceso a ambas si se configura asi"*, y *"pueden haber apiarios por lote
 * de finca rosina y tambien bajo beneficio las nubes, serian distintos sitios"*.
 *
 * La parte pura va sin base. Lo demas necesita Postgres y por eso este archivo esta en el
 * grupo `base-sembrada`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  TIPOS_DE_SITIO_DE_ABEJAS,
  TipoDeSitioInvalido,
  esSitioDeAbejas,
  exigeTipoDeSitioDeAbejas,
} from "../../lib/apiary/sitioDeAbejas";
import { crearApiario, createHive, createColony, getApiaryList } from "../../lib/apiary/hives";
import { destinosCandidatos, trasladarColmenas, TrasladoInvalido } from "../../lib/apiary/traslado";
import { rutaDelSitio } from "../../lib/navigation";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `mel-${Date.now()}`;

describe("la familia de sitios de abejas", () => {
  it("son dos: apiario y meliponario", () => {
    expect([...TIPOS_DE_SITIO_DE_ABEJAS]).toEqual(["apiary_site", "meliponary"]);
  });

  it("el predicado acepta los dos y rechaza todo lo demas", () => {
    expect(esSitioDeAbejas("apiary_site")).toBe(true);
    expect(esSitioDeAbejas("meliponary")).toBe(true);
    for (const otro of ["plot", "micro_plot", "site", "locality", "province", "country"]) {
      expect(esSitioDeAbejas(otro), otro).toBe(false);
    }
    // Ni `null` ni `undefined` cuelan: un tipo ausente no es un sitio de abejas.
    expect(esSitioDeAbejas(null)).toBe(false);
    expect(esSitioDeAbejas(undefined)).toBe(false);
  });

  it("un meliponario se enruta a la pantalla de apiarios, no a la de parcelas", () => {
    // Si esto se olvidara, un meliponario mandaria al cafetal — el mismo defecto que ADR-132
    // arreglo para las jornadas.
    expect(rutaDelSitio("meliponary", "loc-1")).toBe("/apiaries/loc-1");
    expect(rutaDelSitio("apiary_site", "loc-1")).toBe("/apiaries/loc-1");
    expect(rutaDelSitio("plot", "loc-1")).toBe("/plots/loc-1");
  });

  it("la frontera rechaza un tipo que no es de la familia, y dice cual", () => {
    // Llega como CADENA del formulario: un `as never` dejaria crear un "apiario" cuyo tipo es
    // `plot` (ADR-112).
    expect(exigeTipoDeSitioDeAbejas("meliponary")).toBe("meliponary");
    expect(() => exigeTipoDeSitioDeAbejas("plot")).toThrow(TipoDeSitioInvalido);
    expect(() => exigeTipoDeSitioDeAbejas("plot")).toThrow(/plot/);
    expect(() => exigeTipoDeSitioDeAbejas("")).toThrow(/vacio/);
  });
});

describe("ADR-145 contra Postgres", () => {
  let organizationId: string;
  let projectId: string;
  let userAccountId: string;
  let personId: string;
  let fincaId: string;
  let loteId: string;
  let apiarioId: string;
  let meliponarioId: string;
  let lectorId: string | undefined;
  const lectorScopes: string[] = [];

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
      })
    ).id;
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Mel", displayName: `TEST Mel (${RUN_ID})`, locale: "es" },
    });
    personId = person.id;
    userAccountId = (
      await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })
    ).id;
    projectId = (
      await prisma.project.create({ data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" } })
    ).id;
    // Una finca con un lote dentro: la geografia del cafe donde el dueno quiere colgar cajas.
    fincaId = (
      await prisma.location.create({
        data: { locationType: "site", name: `TEST Finca (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
      })
    ).id;
    loteId = (
      await prisma.location.create({
        data: {
          locationType: "plot",
          name: `TEST Lote (${RUN_ID})`,
          organizationId,
          parentLocationId: fincaId,
          status: "approved",
          classification: "internal",
        },
      })
    ).id;

    // Ambito de plataforma: `crearApiario` lo exige.
    //
    // **Se REUSA el que hay, no se crea uno.** El ambito de plataforma es una fila compartida
    // por toda la suite, y mi primera version la creaba y la borraba en la limpieza: Postgres
    // rechazo el borrado por la clave ajena de otra asignacion, que es lo unico que evito
    // llevarme el ambito de otras pruebas de la base compartida.
    const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
    const scope =
      (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
      (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: admin.id, scopeId: scope.id } });
  });

  afterAll(async () => {
    const sitios = [apiarioId, meliponarioId, loteId, fincaId].filter(Boolean);
    const colonias = await prisma.colony.findMany({
      where: assertDefinedWhere({ hive: { locationId: { in: sitios } } }),
      select: { id: true },
    });
    if (colonias.length) {
      await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias.map((c) => c.id) } }) });
    }
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId: { in: sitios } } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId: { in: sitios } }) });
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "location", entityId: { in: sitios } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [apiarioId, meliponarioId].filter(Boolean) } }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: loteId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: fincaId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    if (lectorId) {
      await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: lectorId }) });
      await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: lectorId }) });
    }
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: lectorScopes } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: `TEST MelLector (${RUN_ID})` }) });
    // El ambito de plataforma NO se borra: es compartido y no es mio.
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("LO QUE EL DUENO PIDIO: un meliponario que cuelga de un lote de cafe", async () => {
    const sitio = await crearApiario(userAccountId, {
      name: `TEST Meliponario Lote (${RUN_ID})`,
      organizationId,
      tipo: "meliponary",
      parentLocationId: loteId,
    });
    meliponarioId = sitio.id;
    const guardado = await prisma.location.findUniqueOrThrow({ where: { id: sitio.id } });
    expect(guardado.locationType).toBe("meliponary");
    expect(guardado.parentLocationId, "cuelga del lote, no huerfano").toBe(loteId);
  });

  it("y un apiario normal sigue naciendo apiario, sin elegir nada", async () => {
    // Quien no elija tipo crea lo que creaba antes: el cambio es aditivo.
    const sitio = await crearApiario(userAccountId, {
      name: `TEST Apiario (${RUN_ID})`,
      organizationId,
      parentLocationId: fincaId,
    });
    apiarioId = sitio.id;
    expect((await prisma.location.findUniqueOrThrow({ where: { id: sitio.id } })).locationType).toBe("apiary_site");
  });

  it("los dos salen en la lista de apiarios", async () => {
    // Lee un lector con ámbito SOLO sobre los dos sitios, no el admin que los creó: con ámbito
    // de plataforma la lista es la de toda la base compartida, cortada en 200 por nombre, y los
    // propios se salían el día que otros dejaran 200 sitios que ordenan antes
    // (PENDING_IMPLEMENTATIONS/012). Así además la aserción puede ser exacta.
    const persona = await prisma.person.create({
      data: { givenName: "TEST", familyName: "MelLector", displayName: `TEST MelLector (${RUN_ID})`, locale: "es" },
    });
    lectorId = (
      await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })
    ).id;
    const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    for (const sitio of [apiarioId, meliponarioId]) {
      const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitio } });
      lectorScopes.push(scope.id);
      await prisma.assignment.create({ data: { userAccountId: lectorId, roleProfileId: farm.id, scopeId: scope.id } });
    }

    const { items } = await getApiaryList(lectorId);
    expect(items.map((i) => i.id).sort()).toEqual([apiarioId, meliponarioId].sort());
  });

  it("NO se puede trasladar de un apiario a un meliponario, ni al reves", async () => {
    // Una colonia de Apis en una caja de melipona no existe. El predicado dice «aqui viven
    // colmenas»; esto dice «de las tuyas».
    const hive = await createHive(userAccountId, { projectId, locationId: apiarioId, identifier: `M-${RUN_ID.slice(-5)}` });
    await createColony(userAccountId, {
      hiveId: hive.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
    await expect(
      trasladarColmenas(userAccountId, {
        hiveIds: [hive.id],
        destinationLocationId: meliponarioId,
        occurredAt: new Date("2026-09-16T12:00:00Z"),
        // Un motivo del catalogo: la validacion del motivo corre ANTES que la del destino, y
        // con uno inventado la prueba fallaba por el motivo y no por lo que afirma.
        reason: "consolidacion",
      }),
    ).rejects.toThrow(/destino_de_otro_tipo_de_sitio/);
  });

  it("y los destinos que se OFRECEN son del mismo tipo que el origen", async () => {
    // Pintar un destino que el servicio va a rechazar es peor que no pintarlo.
    const desdeApiario = await destinosCandidatos(organizationId, apiarioId, new Date("2026-09-16T12:00:00Z"));
    expect(desdeApiario.map((d) => d.locationId)).not.toContain(meliponarioId);
    const desdeMeliponario = await destinosCandidatos(organizationId, meliponarioId, new Date("2026-09-16T12:00:00Z"));
    expect(desdeMeliponario.map((d) => d.locationId)).not.toContain(apiarioId);
  });

  it("un lugar que no es sitio de abejas no ofrece destinos, y no adivina apiario", async () => {
    expect(await destinosCandidatos(organizationId, loteId, new Date("2026-09-16T12:00:00Z"))).toEqual([]);
  });
});
