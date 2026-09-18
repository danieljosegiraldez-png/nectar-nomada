/**
 * ADR-160 — el refractómetro de miel, contra Postgres.
 *
 * **Lo que sólo se puede afirmar con la base:** que la lectura cae sobre el LOTE de la cosecha
 * (la miel es un `Lot`, A3 — y el lote es lo que la sigue al dividirse, envasarse o
 * muestrearse), que el Brix de miel entra sólo sobre un lote de miel, y que el aparato que se
 * nombra de verdad puede leer esa escala sobre miel y en ese rango.
 *
 * Grupo `base-sembrada`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony } from "../../lib/apiary/hives";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { recordMeasurement } from "../../lib/traceability/measurements";
import {
  cosechasDeColonia,
  registrarLecturaDeRefractometro,
} from "../../lib/apiary/cierreDeCosecha";
import { declararModoDeInstrumento } from "../../lib/equipos/modosDeInstrumento";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `refr-${Date.now()}`;
const DIA = new Date("2026-09-10T00:00:00Z");

describe("el refractómetro de miel", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let adminUserAccountId: string;
  let scopeId: string;
  const personIds: string[] = [];
  let colonyId: string;
  /** El de MIELES: Brix 58–90 y H% 12–27, los dos sobre miel de abeja. */
  let deMiel: { id: string; brix: string; agua: string };
  /** El del BENEFICIO: Brix 0–32 sobre cereza. Otro aparato (Daniel, 2026-09-17). */
  let delBeneficio: { id: string; brix: string };
  const lotesSueltos: string[] = [];

  async function crearCuenta(etiqueta: string) {
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN_ID})`, locale: "es" },
    });
    personIds.push(person.id);
    return (await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })).id;
  }

  let n = 0;
  async function cosechar() {
    n += 1;
    const { harvestEvent } = await recordApiaryHarvest(userAccountId, {
      colonyId,
      lotCode: `MIEL-${RUN_ID.slice(-6)}-${n}`,
      occurredAt: new Date("2026-09-01T09:00:00Z"),
      framesHarvested: 6,
      provenanceClass: "direct_observation",
    });
    return harvestEvent;
  }

  async function instrumento(nombre: string, modos: { label: string; materialState: "BEE_HONEY" | "CHERRY"; variable: string; rangeMin: number; rangeMax: number }[]) {
    const e = await prisma.equipment.create({
      data: { name: `TEST ${nombre} (${RUN_ID})`, kind: "instrument", organizationId, projectId, provenanceClass: "original_record" },
    });
    const ids: Record<string, string> = {};
    for (const m of modos) ids[m.variable] = (await prisma.instrumentMeasurementMode.create({ data: { equipmentId: e.id, ...m } })).id;
    return { id: e.id, ids };
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
        data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
      })
    ).id;
    userAccountId = await crearCuenta("Refr");
    adminUserAccountId = await crearCuenta("RefrAdmin");
    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    scopeId = (await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } })).id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId } });
    // El ámbito de plataforma se REUSA, nunca se crea ni se borra: es compartido.
    const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
    const plataforma =
      (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
      (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
    await prisma.assignment.create({ data: { userAccountId: adminUserAccountId, roleProfileId: admin.id, scopeId: plataforma.id } });

    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `R-${RUN_ID.slice(-4)}` });
    colonyId = (
      await createColony(userAccountId, {
        hiveId: hive.id,
        originType: "captured",
        startedAt: new Date("2026-01-01"),
        provenanceClass: "direct_observation",
      })
    ).id;

    const m = await instrumento("Refractómetro de mieles", [
      { label: "Brix miel", materialState: "BEE_HONEY", variable: "brix", rangeMin: 58, rangeMax: 90 },
      { label: "H% miel", materialState: "BEE_HONEY", variable: "moisture", rangeMin: 12, rangeMax: 27 },
    ]);
    deMiel = { id: m.id, brix: m.ids.brix!, agua: m.ids.moisture! };
    const b = await instrumento("Refractómetro del beneficio", [
      { label: "Brix mosto", materialState: "CHERRY", variable: "brix", rangeMin: 0, rangeMax: 32 },
    ]);
    delBeneficio = { id: b.id, brix: b.ids.brix! };
  });

  afterEach(async () => {
    // En `afterEach`: una aserción que falla no se salta el borrado (la fuga de polinizacion).
    const cosechas = await prisma.apiaryHarvestEvent.findMany({ where: { colonyId }, select: { resultingLotId: true } });
    const lotes = [...cosechas.map((c) => c.resultingLotId), ...lotesSueltos];
    const medidas = await prisma.measurement.findMany({ where: assertDefinedWhere({ lotId: { in: lotes } }), select: { id: true } });
    await prisma.measurementReviewFlag.deleteMany({ where: assertDefinedWhere({ measurementId: { in: medidas.map((x) => x.id) } }) });
    await prisma.auditEvent.deleteMany({
      where: assertDefinedWhere({ actorUserAccountId: { in: [userAccountId, adminUserAccountId] } }),
    });
    await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
    await prisma.apiaryHarvestEvent.deleteMany({ where: assertDefinedWhere({ colonyId }) });
    await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
    await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  });

  afterAll(async () => {
    await prisma.equipment.deleteMany({ where: assertDefinedWhere({ id: { in: [deMiel.id, delBeneficio.id] } }) });
    await prisma.instrumentMeasurementMode.deleteMany({ where: assertDefinedWhere({ equipment: { organizationId } }) });
    await prisma.equipment.deleteMany({ where: assertDefinedWhere({ organizationId }) });
    const colonias = await prisma.colony.findMany({ where: { hive: { locationId } }, select: { id: true } });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias.map((c) => c.id) } }) });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [userAccountId, adminUserAccountId] } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [userAccountId, adminUserAccountId] } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("LO QUE EL DUEÑO PIDIÓ: Brix y H% de una cosecha, sobre SU LOTE, cada uno firmado por su modo", async () => {
    const c = await cosechar();
    await registrarLecturaDeRefractometro(userAccountId, {
      apiaryHarvestEventId: c.id,
      occurredAt: DIA,
      brix: 81.2,
      aguaPct: 17.1,
      instrumentId: deMiel.id,
      provenanceClass: "measured_fact",
    });
    // Se lee de LAS FILAS, no del valor devuelto.
    const filas = await prisma.measurement.findMany({ where: { lotId: c.resultingLotId }, orderBy: { variable: "asc" } });
    expect(filas.map((f) => [f.variable, Number(f.value), f.instrumentModeId])).toEqual([
      ["brix", 81.2, deMiel.brix],
      ["moisture", 17.1, deMiel.agua],
    ]);
    expect(filas.every((f) => f.instrumentId === deMiel.id)).toBe(true);
  });

  it("EL H% NO SE INVENTA: si sólo se leyó el Brix, sólo hay Brix", async () => {
    // La tabla de Chataway da el agua desde el Brix, pero eso sería un cálculo vestido de lectura.
    const c = await cosechar();
    await registrarLecturaDeRefractometro(userAccountId, {
      apiaryHarvestEventId: c.id, occurredAt: DIA, brix: 80, instrumentId: deMiel.id, provenanceClass: "measured_fact",
    });
    const filas = await prisma.measurement.findMany({ where: { lotId: c.resultingLotId } });
    expect(filas.map((f) => f.variable)).toEqual(["brix"]);
  });

  it("SIN APARATO la lectura se guarda igual: bloquearla perdería el dato (ADR-080)", async () => {
    const c = await cosechar();
    await registrarLecturaDeRefractometro(userAccountId, {
      apiaryHarvestEventId: c.id, occurredAt: DIA, aguaPct: 18.4, provenanceClass: "measured_fact",
    });
    const fila = await prisma.measurement.findFirstOrThrow({ where: { lotId: c.resultingLotId } });
    expect([fila.variable, Number(fila.value), fila.instrumentId]).toEqual(["moisture", 18.4, null]);
  });

  it("FUERA DEL RANGO del aparato se rechaza, y NO queda escrita ni la escala que sí cabía", async () => {
    const c = await cosechar();
    await expect(
      registrarLecturaDeRefractometro(userAccountId, {
        apiaryHarvestEventId: c.id, occurredAt: DIA, brix: 95, aguaPct: 17, instrumentId: deMiel.id, provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow(/fuera_del_rango:brix/);
    expect(await prisma.measurement.count({ where: { lotId: c.resultingLotId } })).toBe(0);
  });

  it("EL REFRACTÓMETRO DEL BENEFICIO NO ES EL DE MIELES: no tiene modo sobre miel", async () => {
    const c = await cosechar();
    await expect(
      registrarLecturaDeRefractometro(userAccountId, {
        apiaryHarvestEventId: c.id, occurredAt: DIA, brix: 80, instrumentId: delBeneficio.id, provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow(/el_instrumento_no_lee:brix/);
  });

  it("UNA LECTURA POR COSECHA: la segunda se rechaza — se corrige la que hay", async () => {
    const c = await cosechar();
    const base = { apiaryHarvestEventId: c.id, occurredAt: DIA, provenanceClass: "measured_fact" as const };
    await registrarLecturaDeRefractometro(userAccountId, { ...base, brix: 80 });
    await expect(registrarLecturaDeRefractometro(userAccountId, { ...base, brix: 81 })).rejects.toThrow(/ya_hay_lectura:brix/);
    expect(await prisma.measurement.count({ where: { lotId: c.resultingLotId } })).toBe(1);
  });

  it("EL BRIX DE MIEL entra sobre un lote de miel, y el límite del café sigue en pie sobre los demás", async () => {
    // El `brix` del registro va de 0 a 40 (mosto de café: un 180 es un 18 mal tecleado). Se
    // ensancha SÓLO sobre miel. El control: el mismo 81 sobre un lote de cereza sigue fuera.
    const c = await cosechar();
    await recordMeasurement(userAccountId, {
      lotId: c.resultingLotId, variable: "brix", value: 81, unit: "Bx", occurredAt: DIA, provenanceClass: "measured_fact",
    });
    const cereza = await prisma.lot.create({
      data: { lotCode: `CER-${RUN_ID}`, lotType: "cherry", organizationId, projectId, locationId },
    });
    lotesSueltos.push(cereza.id);
    await expect(
      recordMeasurement(userAccountId, {
        lotId: cereza.id, variable: "brix", value: 81, unit: "Bx", occurredAt: DIA, provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow(/out_of_range:brix/);
  });

  it("UN MODO QUE LEE H% NO FIRMA UN BRIX", async () => {
    const c = await cosechar();
    await expect(
      recordMeasurement(userAccountId, {
        lotId: c.resultingLotId, variable: "brix", value: 80, unit: "Bx", occurredAt: DIA,
        instrumentId: deMiel.id, instrumentModeId: deMiel.agua, provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow(/instrument_mode_variable_mismatch:moisture:brix/);
  });

  it("FUERA DEL RANGO DEL MODO, también por la puerta general de mediciones", async () => {
    // La puerta de la cosecha comprueba el rango antes de escribir; ésta es la otra puerta, la
    // del lote, que cualquier pantalla de medición usa. Lo destapó un flip-test: quitar este
    // rechazo no tumbaba ninguna prueba.
    const c = await cosechar();
    await expect(
      recordMeasurement(userAccountId, {
        lotId: c.resultingLotId, variable: "brix", value: 95, unit: "Bx", occurredAt: DIA,
        instrumentId: deMiel.id, instrumentModeId: deMiel.brix, provenanceClass: "measured_fact",
      }),
    ).rejects.toThrow(/fuera_del_rango_del_modo/);
    expect(await prisma.measurement.count({ where: { lotId: c.resultingLotId } })).toBe(0);
  });

  it("LA MIEL NO HAY QUE DECLARARLA: un modo de cereza usado sobre un lote de miel deja su marca", async () => {
    // Sin inferir el material del tipo de lote, esta lectura no levantaría ninguna marca y
    // quedaría como una medición sana hecha con la escala equivocada.
    const c = await cosechar();
    const m = await recordMeasurement(userAccountId, {
      lotId: c.resultingLotId, variable: "brix", value: 20, unit: "Bx", occurredAt: DIA,
      instrumentId: delBeneficio.id, instrumentModeId: delBeneficio.brix, provenanceClass: "measured_fact",
    });
    const marcas = await prisma.measurementReviewFlag.findMany({ where: { measurementId: m.id } });
    expect(marcas.map((x) => x.reason)).toEqual(["mode_material_mismatch"]);
    // Y no se inventó una muestra para declararlo.
    expect(m.sampleId).toBeNull();
  });

  it("la lista de cosechas separa el Brix de la humedad", async () => {
    const c = await cosechar();
    await registrarLecturaDeRefractometro(userAccountId, {
      apiaryHarvestEventId: c.id, occurredAt: DIA, brix: 82, aguaPct: 16.5, provenanceClass: "measured_fact",
    });
    const [fila] = (await cosechasDeColonia(colonyId)).filter((x) => x.id === c.id);
    expect(fila!.brix.map((x) => x.valor)).toEqual([82]);
    expect(fila!.humedad.map((x) => x.valor)).toEqual([16.5]);
  });

  it("un modo no puede declarar una variable que no existe", async () => {
    await expect(
      declararModoDeInstrumento(adminUserAccountId, {
        equipmentId: deMiel.id, label: "inventado", materialState: "BEE_HONEY", variable: "dulzor",
      }),
    ).rejects.toThrow(/variable_desconocida/);
    expect(await prisma.instrumentMeasurementMode.count({ where: { equipmentId: deMiel.id, label: "inventado" } })).toBe(0);
  });
});
