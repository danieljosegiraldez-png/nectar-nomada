/**
 * Anexo E §3 — lo que cada tarjeta del inventario tiene que decir.
 *
 * El Anexo pone el inventario primero *«porque decide la acción del día»*, y la tarjeta
 * enseñaba el identificador, el estado de la caja y si había colonia. Faltaban las dos líneas
 * con las que se decide algo: **de dónde vino** y **cuándo se abrió por última vez**.
 *
 * La parte pura va sin base. La lectura sí la necesita, y por eso este archivo está en el
 * grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createColony, createHive } from "../../lib/apiary/hives";
import { recordInspection } from "../../lib/apiary/inspections";
import { origenesDeColonia } from "../../lib/apiary/origenDeColonia";
import { atencionPorPoblacion, vitalesDeColmenas } from "../../lib/apiary/vitalesDeColmena";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a9e3-col-${Date.now()}`;
const MS_POR_DIA = 86_400_000;
const AHORA = new Date("2026-09-15T12:00:00Z");

describe("Anexo E §3 — el ⚠ de la tarjeta sale de lo observado", () => {
  it("avisa con población baja, y con nada más", () => {
    expect(atencionPorPoblacion("baja")).toBe(true);
    expect(atencionPorPoblacion("normal")).toBe(false);
    expect(atencionPorPoblacion("apiñada")).toBe(false);
  });

  it("no observar la población NO es observarla baja", () => {
    // El campo es opcional a propósito (ADR-080): una inspección rápida que sólo mira si la
    // caja sigue viva es legítima. Avisar por el hueco enseñaría a ignorar el aviso.
    expect(atencionPorPoblacion(null)).toBe(false);
  });
});

describe("Anexo E §3 — los vitales de cada caja, contra Postgres", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let personId: string;
  let conInspecciones: string;
  let sinInspeccionar: string;
  let cajaVacia: string;
  let coloniaMuertaId: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;

    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Colmena", displayName: `TEST Colmena (${RUN_ID})`, locale: "es" },
    });
    personId = person.id;
    const userAccount = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    userAccountId = userAccount.id;

    const project = await prisma.project.create({
      data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    projectId = project.id;

    const location = await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    });
    locationId = location.id;

    const farmOperator = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperator.id, scopeId: scope.id } });

    // El origen agrupable sale del catálogo, no de una cadena inventada aquí: es el dato con
    // el que D6 quiere comparar un pie contra otro.
    const parita = (await origenesDeColonia()).find((v) => v.value === "Parita, Chitré");
    expect(parita, "el catálogo de origen tiene que traer Parita — control de la semilla").toBeTruthy();

    const h1 = await createHive(userAccountId, { projectId, locationId, identifier: `E3A-${RUN_ID.slice(-4)}` });
    conInspecciones = h1.id;
    const c1 = await createColony(userAccountId, {
      hiveId: h1.id,
      originType: "purchased",
      originSourceValueId: parita!.id,
      startedAt: new Date("2026-09-02T11:00:00Z"),
      provenanceClass: "direct_observation",
    });
    // Dos inspecciones: la vieja dice «normal», la reciente dice «baja». La tarjeta tiene que
    // enseñar la RECIENTE, que es la única que puede decidir la acción de hoy.
    await recordInspection(userAccountId, {
      colonyId: c1.id,
      occurredAt: new Date(AHORA.getTime() - 40 * MS_POR_DIA),
      outcome: "nothing_unusual",
      population: "normal",
    });
    await recordInspection(userAccountId, {
      colonyId: c1.id,
      occurredAt: new Date(AHORA.getTime() - 11 * MS_POR_DIA),
      outcome: "issue_observed",
      population: "baja",
    });

    const h2 = await createHive(userAccountId, { projectId, locationId, identifier: `E3B-${RUN_ID.slice(-4)}` });
    sinInspeccionar = h2.id;
    await createColony(userAccountId, {
      hiveId: h2.id,
      originType: "captured",
      startedAt: new Date("2026-08-01T11:00:00Z"),
      provenanceClass: "direct_observation",
    });

    // Una caja vacía con historia: la colonia que tuvo se acabó, y tenía inspecciones.
    const h3 = await createHive(userAccountId, { projectId, locationId, identifier: `E3C-${RUN_ID.slice(-4)}` });
    cajaVacia = h3.id;
    const c3 = await createColony(userAccountId, {
      hiveId: h3.id,
      originType: "purchased", // era "split": las divisiones ahora nacen con dividirColonia (spec 2026-09-18 §3); el origen no importa aquí
      startedAt: new Date("2026-03-01T11:00:00Z"),
      provenanceClass: "direct_observation",
    });
    coloniaMuertaId = c3.id;
    await recordInspection(userAccountId, {
      colonyId: c3.id,
      occurredAt: new Date(AHORA.getTime() - 3 * MS_POR_DIA),
      outcome: "issue_observed",
      population: "baja",
    });
    await prisma.colony.update({
      where: { id: c3.id },
      data: { status: "dead", endedAt: new Date(AHORA.getTime() - 2 * MS_POR_DIA) },
    });
  });

  afterAll(async () => {
    const colonias = await prisma.colony.findMany({ where: assertDefinedWhere({ hive: { locationId } }), select: { id: true } });
    const colonyIds = colonias.map((c) => c.id);
    if (colonyIds.length > 0) {
      await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId: { in: colonyIds } }) });
      await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonyIds } }) });
    }
    // La colocación es hija de la colmena y su FK es RESTRICT: sin esta línea el borrado
    // de abajo falla. `createHive` abre una desde el 2026-09-15 (ADR-135).
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

  it("lee la inspección MÁS RECIENTE, sus días y su población", async () => {
    const v = (await vitalesDeColmenas([conInspecciones], AHORA)).get(conInspecciones)!;
    expect(v.diasDesdeInspeccion).toBe(11);
    expect(v.poblacion).toBe("baja");
    expect(v.necesitaAtencion).toBe(true);
    // Control de que no está leyendo la vieja, que decía «normal» hace 40 días.
    expect(v.poblacion).not.toBe("normal");
  });

  it("trae el origen agrupable del catálogo y desde cuándo está la colonia en la caja", async () => {
    const v = (await vitalesDeColmenas([conInspecciones], AHORA)).get(conInspecciones)!;
    expect(v.origenFuente).toBe("Parita, Chitré");
    expect(v.origenTipo).toBe("purchased");
    expect(v.coloniaDesde?.toISOString().slice(0, 10)).toBe("2026-09-02");
  });

  it("una colmena sin inspecciones dice «sin registrar», que no es «hace mucho» ni es cero", async () => {
    const v = (await vitalesDeColmenas([sinInspeccionar], AHORA)).get(sinInspeccionar)!;
    expect(v.ultimaInspeccion).toBeNull();
    expect(v.diasDesdeInspeccion).toBeNull();
    expect(v.poblacion).toBeNull();
    expect(v.necesitaAtencion).toBe(false);
    // Y a la vez sabe lo que sí tiene fila: la colonia está ahí, sin origen de catálogo.
    expect(v.origenTipo).toBe("captured");
    expect(v.origenFuente).toBeNull();
  });

  it("una caja vacía no hereda la inspección de la colonia que se murió", async () => {
    // Es el caso de NN-0041 y NN-0042 en Finca Rosina: cajas con patas y tapa, sin colonia.
    // Sin el filtro `endedAt: null`, la tarjeta diría «inspección hace 3 d» de una colonia
    // que ya no existe, y un ⚠ de población baja sobre una caja donde no hay abejas.
    const v = (await vitalesDeColmenas([cajaVacia], AHORA)).get(cajaVacia)!;
    expect(v.origenTipo).toBeNull();
    expect(v.coloniaDesde).toBeNull();
    expect(v.diasDesdeInspeccion).toBeNull();
    expect(v.necesitaAtencion).toBe(false);
    // Control positivo de que esa inspección EXISTE y es reciente: si no, la prueba de arriba
    // pasaría por no haber nada que heredar.
    const ultima = await prisma.inspection.findFirst({
      where: assertDefinedWhere({ colonyId: coloniaMuertaId }),
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true, population: true },
    });
    expect(ultima?.population).toBe("baja");
    expect(ultima!.occurredAt.getTime()).toBeGreaterThan(AHORA.getTime() - 4 * MS_POR_DIA);
  });

  it("devuelve una entrada por cada id pedido, en un solo par de consultas", async () => {
    const m = await vitalesDeColmenas([conInspecciones, sinInspeccionar, cajaVacia], AHORA);
    expect([...m.keys()].sort()).toEqual([conInspecciones, sinInspeccionar, cajaVacia].sort());
    // La mezcla es lo que hace útil al lector: tres cajas del mismo sitio con tres estados.
    expect(m.get(conInspecciones)!.necesitaAtencion).toBe(true);
    expect(m.get(sinInspeccionar)!.diasDesdeInspeccion).toBeNull();
    expect(m.get(cajaVacia)!.origenTipo).toBeNull();
  });

  it("sin ids no consulta nada", async () => {
    expect((await vitalesDeColmenas([], AHORA)).size).toBe(0);
  });
});
