/**
 * La configuración de la caja (Anexo B §2.4) y lo que hace comparable a «cuadros
 * cubiertos de abeja».
 *
 * **Por qué esta rebanada.** `beeCoveredFrames` existe desde ADR-117, y el Anexo lo
 * pide porque es *«la medida cuantitativa de fuerza, comparable entre visitas y entre
 * sitios»*. **No lo era**: ocho cuadros cubiertos dicen una cosa en una caja de ocho y
 * otra en una de diez. `framesPerBox` es ese denominador.
 *
 * **La regla que estas pruebas defienden:** sin denominador, la ocupación es `null` y
 * se dice que el número no se puede comparar. Devolver 0, o suponer diez cuadros por
 * caja, convertiría una ausencia en afirmación (ADR-080) y —peor— haría comparables
 * cosas que no lo son.
 *
 * **Ningún dato real ha pasado por aquí.** Los fixtures crean las colmenas.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony, ApiaryAccessError } from "../../lib/apiary/hives";
import { recordInspection } from "../../lib/apiary/inspections";
import {
  ConfiguracionInvalida,
  actualizarConfiguracionDeCaja,
  fuerzaDeColonia,
} from "../../lib/apiary/configuracionDeCaja";
import { leerEnmiendas } from "../../lib/traceability/enmiendas";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `caja-${Date.now()}`;

describe("la fuerza de una colonia, con y sin denominador", () => {
  it("SIN cuadros por caja no es comparable, y se dice", () => {
    // La entrada hostil, directa a la función pura.
    const sinDenominador = fuerzaDeColonia(8, { broodBoxes: 2, supers: 1, framesPerBox: null });
    expect(sinDenominador.capacidad).toBeNull();
    expect(sinDenominador.ocupacion).toBeNull();
    // Y el número que SÍ se declaró sigue estando: no se pierde por no ser comparable.
    expect(sinDenominador.cuadrosCubiertos).toBe(8);
  });

  it("con denominador, la ocupación es la fracción de la caja", () => {
    // Control positivo del anterior: dos cámaras de diez más un alza son 30 cuadros.
    const f = fuerzaDeColonia(15, { broodBoxes: 2, supers: 1, framesPerBox: 10 });
    expect(f.capacidad).toBe(30);
    expect(f.ocupacion).toBeCloseTo(50);
  });

  it("una caja sin cajas declaradas tampoco es comparable", () => {
    // Cuadros por caja sin saber cuántas cajas hay no da capacidad. Multiplicar por
    // cero daría 0 y una división por cero daría `Infinity`, que se pintaría como un
    // número y sería peor que decir «no se sabe».
    const f = fuerzaDeColonia(5, { broodBoxes: null, supers: null, framesPerBox: 10 });
    expect(f.capacidad).toBeNull();
    expect(f.ocupacion).toBeNull();
    // Pero una cámara y cero alzas SÍ: lo no declarado cuenta como cero cajas.
    const g = fuerzaDeColonia(5, { broodBoxes: 1, supers: null, framesPerBox: 10 });
    expect(g.capacidad).toBe(10);
    expect(g.ocupacion).toBeCloseTo(50);
  });

  it("una caja más que llena no se recorta: 12 de 10 es un dato, no un error", () => {
    // Pasa de verdad —abeja en el alza sin cuadros propios— y recortarlo a 100 %
    // esconderá justo la caja que hay que dividir.
    const f = fuerzaDeColonia(12, { broodBoxes: 1, supers: 0, framesPerBox: 10 });
    expect(f.ocupacion).toBeCloseTo(120);
  });
});

describe("cambiar la configuración de una caja", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let sinAccesoUserAccountId: string;
  let scopeId: string;
  const personIds: string[] = [];

  async function crearCuenta(etiqueta: string) {
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN_ID})`, locale: "es" },
    });
    personIds.push(person.id);
    return (await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })).id;
  }

  async function nuevaColmena(sufijo: string) {
    return createHive(userAccountId, { projectId, locationId, identifier: `K${sufijo}-${RUN_ID.slice(-4)}` });
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
    userAccountId = await crearCuenta("Caja");
    sinAccesoUserAccountId = await crearCuenta("SinAcceso");
    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    scopeId = scope.id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
  });

  afterEach(async () => {
    const colonias = await prisma.colony.findMany({ where: { hive: { locationId } }, select: { id: true } });
    const ids = colonias.map((c) => c.id);
    await prisma.auditEvent.deleteMany({
      where: assertDefinedWhere({ actorUserAccountId: { in: [userAccountId, sinAccesoUserAccountId] } }),
    });
    await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
  });

  afterAll(async () => {
    const cuentas = [userAccountId, sinAccesoUserAccountId];
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("los siete campos se guardan, y el alimentador reusa el vocabulario", async () => {
    const h = await nuevaColmena("1");
    const despues = await actualizarConfiguracionDeCaja(userAccountId, {
      hiveId: h.id,
      broodBoxes: 2,
      supers: 1,
      framesPerBox: 10,
      queenExcluder: true,
      feederType: "bolsa_sobre_cabezales",
      entranceReducer: false,
      screenedBottomBoard: true,
    });
    expect(despues.broodBoxes).toBe(2);
    expect(despues.supers).toBe(1);
    expect(despues.framesPerBox).toBe(10);
    expect(despues.queenExcluder).toBe(true);
    expect(despues.feederType).toBe("bolsa_sobre_cabezales");
    expect(despues.entranceReducer).toBe(false);
    expect(despues.screenedBottomBoard).toBe(true);
  });

  it("SÓLO LO QUE VIENE se toca: registrar la diferencia es lo que el Anexo pide", async () => {
    const h = await nuevaColmena("2");
    await actualizarConfiguracionDeCaja(userAccountId, { hiveId: h.id, broodBoxes: 1, framesPerBox: 8 });
    // Se añade un alza y nada más. Lo demás no se pierde.
    const despues = await actualizarConfiguracionDeCaja(userAccountId, { hiveId: h.id, supers: 1 });
    expect(despues.supers).toBe(1);
    expect(despues.broodBoxes).toBe(1);
    expect(despues.framesPerBox).toBe(8);
  });

  it("cero alzas es legítimo; cero cuadros por caja no es una caja", async () => {
    const h = await nuevaColmena("3");
    const conCero = await actualizarConfiguracionDeCaja(userAccountId, { hiveId: h.id, supers: 0 });
    expect(conCero.supers).toBe(0);
    await expect(
      actualizarConfiguracionDeCaja(userAccountId, { hiveId: h.id, framesPerBox: 0 }),
    ).rejects.toThrow(/cuadros_por_caja_invalido/);
    await expect(
      actualizarConfiguracionDeCaja(userAccountId, { hiveId: h.id, broodBoxes: -1 }),
    ).rejects.toThrow(ConfiguracionInvalida);
  });

  it("un alimentador inventado se rechaza, y una llamada vacía también", async () => {
    const h = await nuevaColmena("4");
    await expect(
      actualizarConfiguracionDeCaja(userAccountId, { hiveId: h.id, feederType: "telepatia" }),
    ).rejects.toThrow(/metodo_de_alimentacion_desconocido/);
    // Una llamada sin cambios escribiría un audit que dice que no pasó nada.
    await expect(actualizarConfiguracionDeCaja(userAccountId, { hiveId: h.id })).rejects.toThrow(/nada_que_cambiar/);
    expect(await prisma.auditEvent.count({ where: { entityId: h.id, operation: "hive.configure" } })).toBe(0);
  });

  it("EL HISTORIAL sale gratis: `leerEnmiendas` ya sabía leerlo", async () => {
    const h = await nuevaColmena("5");
    await actualizarConfiguracionDeCaja(userAccountId, { hiveId: h.id, broodBoxes: 1, framesPerBox: 10 });
    await actualizarConfiguracionDeCaja(userAccountId, {
      hiveId: h.id,
      supers: 1,
      reason: "le puse un alza porque la cámara estaba apiñada",
    });

    const historial = await leerEnmiendas([{ entityType: "hive", entityId: h.id }]);
    expect(historial).toHaveLength(2);
    expect(historial.every((e) => e.operation === "hive.configure")).toBe(true);
    // El `before` guarda cómo estaba la caja antes, que es lo que hace legible el
    // cambio: sin él, «tiene un alza» no dice cuándo dejó de no tenerla.
    const conAlza = historial.find((e) => e.reason?.includes("apiñada"))!;
    expect((conAlza.before as { supers?: number | null }).supers).toBeNull();
    expect((conAlza.after as { supers?: number | null }).supers).toBe(1);
  });

  it("la razón es opcional, porque cambiar la caja NO es corregir", async () => {
    // A diferencia de ADR-121: añadir un alza es un hecho del mundo y el cambio ES el
    // evento. Exigir razón para el curso normal del trabajo enseñaría a escribir «.».
    const h = await nuevaColmena("6");
    const despues = await actualizarConfiguracionDeCaja(userAccountId, { hiveId: h.id, supers: 2 });
    expect(despues.supers).toBe(2);
    const historial = await leerEnmiendas([{ entityType: "hive", entityId: h.id }]);
    expect(historial[0]!.reason).toBeNull();
  });

  it("quien no tiene acceso al sitio no cambia la caja", async () => {
    const h = await nuevaColmena("7");
    await expect(
      actualizarConfiguracionDeCaja(sinAccesoUserAccountId, { hiveId: h.id, supers: 3 }),
    ).rejects.toThrow(ApiaryAccessError);
    expect((await prisma.hive.findUniqueOrThrow({ where: { id: h.id } })).supers).toBeNull();
  });

  it("de punta a punta: una inspección pasa a ser comparable cuando la caja se declara", async () => {
    const h = await nuevaColmena("8");
    const colony = await createColony(userAccountId, {
      hiveId: h.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
    await recordInspection(userAccountId, { colonyId: colony.id, outcome: "issue_observed", beeCoveredFrames: 8 });

    // Antes de declarar la caja: el número existe y NO es comparable.
    const sinCaja = await prisma.hive.findUniqueOrThrow({ where: { id: h.id } });
    expect(fuerzaDeColonia(8, sinCaja).ocupacion).toBeNull();

    // Después: el mismo 8 pasa a significar algo.
    const conCaja = await actualizarConfiguracionDeCaja(userAccountId, {
      hiveId: h.id,
      broodBoxes: 1,
      supers: 0,
      framesPerBox: 10,
    });
    expect(fuerzaDeColonia(8, conCaja).ocupacion).toBeCloseTo(80);
  });
});
