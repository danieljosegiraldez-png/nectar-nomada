/**
 * El cierre de una cosecha de miel — y la prueba de que la humedad **ya funcionaba**.
 *
 * **Lo que cierra.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §5, la última fila del Anexo
 * B sin construir. «Tipo de miel» no existía; «humedad» estaba marcada **parcial**.
 *
 * **Y la afirmación que este archivo tiene que sostener, no repetir:** que «parcial» no
 * describía un mecanismo a medias. `Measurement` admite `lotId`, una cosecha de apiario
 * crea un `Lot`, `PANEL_DEL_SUJETO` no restringe `lotId`, y `LotType` ya tiene `honey`.
 * O sea: **se podía registrar la humedad de un lote de miel antes de esta rebanada**.
 * El último `it` lo demuestra llamando a `recordMeasurement` — si algo de este cambio
 * hubiera sido necesario para eso, esa prueba fallaría al quitarlo.
 *
 * Lo que faltaba era **encontrarla**: leerla junto a la cosecha, que es lo que hacen
 * `humedadDeLaMiel` y `cosechasDeColonia`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony, ApiaryAccessError } from "../../lib/apiary/hives";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { recordMeasurement } from "../../lib/traceability/measurements";
import {
  CierreDeCosechaInvalido,
  completarCierreDeCosecha,
  cosechasDeColonia,
  humedadDeLaMiel,
} from "../../lib/apiary/cierreDeCosecha";
import { leerEnmiendas } from "../../lib/traceability/enmiendas";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `cosecha-${Date.now()}`;

describe("el cierre de una cosecha de miel", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let sinAccesoUserAccountId: string;
  let scopeId: string;
  let personId: string;
  const personIds: string[] = [];
  let colonyId: string;

  async function crearCuenta(etiqueta: string) {
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: etiqueta, displayName: `TEST ${etiqueta} (${RUN_ID})`, locale: "es" },
    });
    personIds.push(person.id);
    return { personId: person.id, cuenta: (await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })).id };
  }

  /**
   * `recordApiaryHarvest` exige `lotCode` y devuelve `{ harvestEvent, lot, carencias }`.
   * Lo tuve mal en la primera versión y lo dijo el typecheck, no una corrida.
   */
  let n = 0;
  async function cosechar(extra: Record<string, unknown> = {}) {
    n += 1;
    const { harvestEvent } = await recordApiaryHarvest(userAccountId, {
      colonyId,
      lotCode: `MIEL-${RUN_ID.slice(-6)}-${n}`,
      occurredAt: new Date("2026-08-01T09:00:00Z"),
      framesHarvested: 6,
      provenanceClass: "direct_observation",
      ...extra,
    });
    return harvestEvent;
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
    const principal = await crearCuenta("Cosecha");
    userAccountId = principal.cuenta;
    personId = principal.personId;
    sinAccesoUserAccountId = (await crearCuenta("SinAcceso")).cuenta;
    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    scopeId = scope.id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });

    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `M-${RUN_ID.slice(-4)}` });
    colonyId = (
      await createColony(userAccountId, {
        hiveId: hive.id,
        originType: "captured",
        startedAt: new Date("2026-01-01"),
        provenanceClass: "direct_observation",
      })
    ).id;
  });

  afterEach(async () => {
    const cosechas = await prisma.apiaryHarvestEvent.findMany({ where: { colonyId }, select: { id: true, resultingLotId: true } });
    const lotes = cosechas.map((c) => c.resultingLotId);
    await prisma.auditEvent.deleteMany({
      where: assertDefinedWhere({ actorUserAccountId: { in: [userAccountId, sinAccesoUserAccountId] } }),
    });
    await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
    await prisma.apiaryHarvestEvent.deleteMany({ where: assertDefinedWhere({ colonyId }) });
    await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
    await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  });

  afterAll(async () => {
    const colonias = await prisma.colony.findMany({ where: { hive: { locationId } }, select: { id: true } });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias.map((c) => c.id) } }) });
    // La colocación es hija de la colmena y su FK es RESTRICT: sin esta línea el borrado
    // de abajo falla. `createHive` abre una desde el 2026-09-15 (ADR-135).
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [userAccountId, sinAccesoUserAccountId] } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("el tipo de miel y el peso se completan después, sin razón", async () => {
    const c = await cosechar();
    const { cosecha, esCorreccion } = await completarCierreDeCosecha(userAccountId, {
      apiaryHarvestEventId: c.id,
      honeyType: "monofloral_declarada",
      extractedWeightKg: 12.5,
    });
    expect(esCorreccion).toBe(false);
    expect(cosecha.honeyType).toBe("monofloral_declarada");
    expect(Number(cosecha.extractedWeightKg)).toBeCloseTo(12.5);
  });

  it("cambiar algo ya escrito exige razón, y la operación de audit lo dice", async () => {
    const c = await cosechar();
    await completarCierreDeCosecha(userAccountId, { apiaryHarvestEventId: c.id, honeyType: "multifloral" });
    await expect(
      completarCierreDeCosecha(userAccountId, { apiaryHarvestEventId: c.id, honeyType: "mielato" }),
    ).rejects.toThrow(/razon_requerida_para_corregir/);

    const { esCorreccion } = await completarCierreDeCosecha(userAccountId, {
      apiaryHarvestEventId: c.id,
      honeyType: "mielato",
      reason: "el polen decía otra cosa",
    });
    expect(esCorreccion).toBe(true);

    const rastro = await leerEnmiendas([{ entityType: "apiary_harvest_event", entityId: c.id }]);
    expect(rastro.map((e) => e.operation)).toContain("apiary_harvest.close");
    expect(rastro.map((e) => e.operation)).toContain("apiary_harvest.correct");
    // Y se ve que se completó en la casa, no en el apiario.
    expect(rastro[0]!.sourceInterface).toBe("apiary.close");
  });

  it("cero kilos es un dato legítimo; un negativo y un tipo inventado no", async () => {
    // Se abrió la caja y no había miel: eso es un resultado, no un hueco.
    const c = await cosechar();
    const cero = await completarCierreDeCosecha(userAccountId, { apiaryHarvestEventId: c.id, extractedWeightKg: 0 });
    expect(Number(cero.cosecha.extractedWeightKg)).toBe(0);

    await expect(
      completarCierreDeCosecha(userAccountId, { apiaryHarvestEventId: c.id, extractedWeightKg: -1, reason: "x" }),
    ).rejects.toThrow(/peso_invalido/);
    await expect(
      completarCierreDeCosecha(userAccountId, { apiaryHarvestEventId: c.id, honeyType: "de_unicornio" }),
    ).rejects.toThrow(/tipo_de_miel_desconocido/);
  });

  it("una llamada vacía se rechaza, y quien no tiene acceso no cierra nada", async () => {
    const c = await cosechar();
    await expect(
      completarCierreDeCosecha(userAccountId, { apiaryHarvestEventId: c.id }),
    ).rejects.toThrow(CierreDeCosechaInvalido);
    await expect(
      completarCierreDeCosecha(sinAccesoUserAccountId, { apiaryHarvestEventId: c.id, honeyType: "multifloral" }),
    ).rejects.toThrow(ApiaryAccessError);
    expect((await prisma.apiaryHarvestEvent.findUniqueOrThrow({ where: { id: c.id } })).honeyType).toBeNull();
  });

  it("LA AFIRMACIÓN DE ESTA REBANADA: la humedad de la miel ya se podía registrar", async () => {
    // Se llama a `recordMeasurement` **sin que nada de este cambio participe**: el
    // sujeto es el `Lot` que la cosecha creó, y la variable es la que ya existía. Si
    // hubiera hecho falta una columna nueva, un dominio nuevo o una variable nueva,
    // esta prueba no pasaría — y el Anexo tendría razón al llamarlo «parcial».
    const c = await cosechar();
    await recordMeasurement(userAccountId, {
      lotId: c.resultingLotId,
      variable: "moisture",
      value: 17.5,
      unit: "%",
      occurredAt: new Date("2026-08-02T10:00:00Z"),
      provenanceClass: "measured_fact",
      operatorPersonId: personId,
    });

    // Y lo que esta rebanada SÍ añade: que se encuentre junto a la cosecha.
    const humedad = await humedadDeLaMiel(c.resultingLotId);
    expect(humedad).toHaveLength(1);
    expect(humedad[0]!.valor).toBeCloseTo(17.5);
    expect(humedad[0]!.unidad).toBe("%");
  });

  it("la lista de cosechas trae su cierre y su humedad, y antes no existía ninguna lista", async () => {
    const c = await cosechar();
    await completarCierreDeCosecha(userAccountId, { apiaryHarvestEventId: c.id, honeyType: "multifloral", extractedWeightKg: 9 });
    await recordMeasurement(userAccountId, {
      lotId: c.resultingLotId,
      variable: "moisture",
      value: 18.2,
      unit: "%",
      occurredAt: new Date("2026-08-03T10:00:00Z"),
      provenanceClass: "measured_fact",
      operatorPersonId: personId,
    });

    const filas = await cosechasDeColonia(colonyId);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.honeyType).toBe("multifloral");
    expect(filas[0]!.extractedWeightKg).toBeCloseTo(9);
    expect(filas[0]!.humedad[0]!.valor).toBeCloseTo(18.2);
    // Control positivo de que la humedad viene del LOTE y no de la cosecha: la fila de
    // cosecha no tiene ninguna columna de humedad.
    expect(Object.keys(filas[0]!)).not.toContain("moisturePct");
  });
});
