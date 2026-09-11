/**
 * La carencia de un tratamiento, y la cosecha que cae dentro de ella.
 *
 * **El hueco que cierra.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §4 marca el
 * período de carencia como **obligatorio** y como **no existente**, y dice la
 * consecuencia: *«decide cuándo se puede cosechar. Sin él, una cosecha puede
 * violar la carencia sin que el sistema lo sepa.»*
 *
 * **Lo que estas pruebas son, dicho sin adornos: una RED PARA EL DÍA QUE
 * LLEGUEN LOS DATOS, no un guardia sobre datos que existan.** Medido el
 * 2026-09-11 antes de construir: **0 eventos de tratamiento y 0 cosechas de
 * apiario** en la base. Los fixtures de abajo crean los dos, así que la
 * transformación sí se ejercita — pero nadie ha tratado ni cosechado de verdad,
 * y eso hay que escribirlo aquí para que nadie cuente esta cobertura dos veces.
 *
 * La decisión que defienden, del dueño el 2026-09-11: **la cosecha se registra
 * siempre**, marcada con los días que faltaban. Si la miel ya se extrajo,
 * impedir el registro no la devuelve al panal.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony } from "../../lib/apiary/hives";
import { recordColonyEvent, ColonyEventValidationError } from "../../lib/apiary/colonyEvents";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { carenciasVigentes, diasPendientes } from "../../lib/apiary/carencia";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `car-${Date.now()}`;
const MS_POR_DIA = 86_400_000;
const APLICADO = new Date("2026-06-01T08:00:00Z");

describe("la carencia de un tratamiento", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let scopeId: string;
  const personIds: string[] = [];
  let nLote = 0;

  async function nuevaColonia(i: number) {
    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `C${i}-${RUN_ID.slice(-4)}` });
    return createColony(userAccountId, {
      hiveId: hive.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
  }

  async function tratar(colonyId: string, dias: number, cuando = APLICADO, producto = "Apivar") {
    return recordColonyEvent(userAccountId, {
      colonyId,
      eventType: "treatment",
      occurredAt: cuando,
      treatmentProduct: producto,
      treatmentBatchLabel: `L-${RUN_ID.slice(-4)}`,
      treatmentWithdrawalDays: dias,
    });
  }

  async function cosechar(colonyId: string, cuando: Date) {
    return recordApiaryHarvest(userAccountId, {
      lotCode: `MIEL-${RUN_ID.slice(-4)}-${++nLote}`,
      colonyId,
      occurredAt: cuando,
      provenanceClass: "direct_observation",
    });
  }

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;

    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Carencia", displayName: `TEST Car (${RUN_ID})`, locale: "es" },
    });
    personIds.push(person.id);
    const cuenta = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    userAccountId = cuenta.id;

    const project = await prisma.project.create({
      data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    projectId = project.id;

    // `organizationId` hace falta: `recordApiaryHarvest` se niega a inventar de
    // quién es el lote de miel si el sitio no nombra a su dueño.
    const location = await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    });
    locationId = location.id;

    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    scopeId = scope.id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
  });

  /**
   * En `afterEach`, no al final de cada cuerpo: una aserción que falla se salta
   * lo que venga detrás, y la FK siguiente aborta el `afterAll` entero dejando
   * filas TEST en la base compartida. Es el defecto que `CLAUDE.md` registra.
   */
  afterEach(async () => {
    const colonias = await prisma.colony.findMany({ where: { hive: { locationId } }, select: { id: true } });
    const ids = colonias.map((c) => c.id);
    const cosechas = await prisma.apiaryHarvestEvent.findMany({
      where: assertDefinedWhere({ colonyId: { in: ids } }),
      select: { id: true, resultingLotId: true },
    });
    const lotes = cosechas.map((c) => c.resultingLotId);
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: userAccountId }) });
    await prisma.apiaryHarvestEvent.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
    await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
    await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
  });

  afterAll(async () => {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    // Después del Assignment, que lo referencia con RESTRICT.
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("un tratamiento SIN carencia declarada se rechaza", async () => {
    const c = await nuevaColonia(1);
    await expect(
      recordColonyEvent(userAccountId, {
        colonyId: c.id,
        eventType: "treatment",
        treatmentProduct: "Apivar",
        treatmentBatchLabel: "L-1",
      }),
    ).rejects.toThrow(/treatment_withdrawal_days_required/);
    // Control positivo: la MISMA llamada con la carencia puesta entra. Sin esto,
    // «rechazó» no probaría que mira ese campo y no otro.
    const ok = await tratar(c.id, 14);
    expect(ok.treatmentWithdrawalDays).toBe(14);
  });

  it("CERO días es una respuesta legítima, no un hueco", async () => {
    // Hay productos sin carencia. Un `!input.treatmentWithdrawalDays` habría
    // rechazado el cero y obligado a mentir poniendo un 1.
    const c = await nuevaColonia(2);
    const ev = await tratar(c.id, 0);
    expect(ev.treatmentWithdrawalDays).toBe(0);
    // Y no impone carencia ninguna.
    expect(await carenciasVigentes(c.id, new Date(APLICADO.getTime() + 1000))).toEqual([]);
  });

  it("días negativos o fraccionarios se rechazan", async () => {
    const c = await nuevaColonia(3);
    await expect(tratar(c.id, -1)).rejects.toThrow(ColonyEventValidationError);
    await expect(tratar(c.id, 2.5)).rejects.toThrow(ColonyEventValidationError);
  });

  it("la carencia está vigente dentro de la ventana y deja de estarlo al cumplirse", async () => {
    const c = await nuevaColonia(4);
    await tratar(c.id, 10);
    const dentro = await carenciasVigentes(c.id, new Date(APLICADO.getTime() + 3 * MS_POR_DIA));
    expect(dentro).toHaveLength(1);
    expect(dentro[0]!.diasQueFaltan).toBe(7);
    // El instante EXACTO en que se cumple ya es libre: `libreDesde <= fecha`.
    const justoAlCumplirse = await carenciasVigentes(c.id, new Date(APLICADO.getTime() + 10 * MS_POR_DIA));
    expect(justoAlCumplirse).toEqual([]);
  });

  it("medio día pendiente sigue siendo un día, no cero", async () => {
    // Con `Math.floor` esto daría 0 en las últimas horas — que es justo cuando
    // alguien va a cosechar creyendo que ya puede.
    const c = await nuevaColonia(5);
    await tratar(c.id, 10);
    const casi = await carenciasVigentes(c.id, new Date(APLICADO.getTime() + 9.5 * MS_POR_DIA));
    expect(casi[0]!.diasQueFaltan).toBe(1);
  });

  it("un tratamiento POSTERIOR a la cosecha no le impone carencia", async () => {
    // Una cosecha se registra días después. Sin el filtro por fecha, un
    // tratamiento de la semana pasada marcaría una cosecha del mes pasado.
    const c = await nuevaColonia(6);
    await tratar(c.id, 30, new Date("2026-07-01T08:00:00Z"));
    expect(await carenciasVigentes(c.id, new Date("2026-06-15T08:00:00Z"))).toEqual([]);
    // Control positivo: después del tratamiento sí lo ve.
    expect(await carenciasVigentes(c.id, new Date("2026-07-10T08:00:00Z"))).toHaveLength(1);
  });

  it("dos productos dan dos carencias, y la marca es la MÁS LARGA — no la suma", async () => {
    // Las carencias corren en paralelo; sumarlas inventaría una espera que
    // ningún producto exige.
    const c = await nuevaColonia(7);
    await tratar(c.id, 10, APLICADO, "Apivar");
    await tratar(c.id, 21, APLICADO, "Ácido oxálico");
    const vigentes = await carenciasVigentes(c.id, new Date(APLICADO.getTime() + MS_POR_DIA));
    expect(vigentes).toHaveLength(2);
    expect(diasPendientes(vigentes)).toBe(20);
  });

  it("LA COSECHA SE REGISTRA IGUAL, marcada con los días que faltaban", async () => {
    // La decisión del dueño, y la razón: impedir el registro no devuelve la miel
    // al panal.
    const c = await nuevaColonia(8);
    await tratar(c.id, 10);
    const cuando = new Date(APLICADO.getTime() + 4 * MS_POR_DIA);
    const { harvestEvent, carencias } = await cosechar(c.id, cuando);
    expect(harvestEvent.withinWithdrawalDays).toBe(6);
    // Y el aviso puede nombrar el producto, que es lo que lo hace útil.
    expect(carencias[0]!.producto).toBe("Apivar");
    // Control positivo: la fila existe de verdad en la base, con su marca.
    const enLaBase = await prisma.apiaryHarvestEvent.findUniqueOrThrow({ where: { id: harvestEvent.id } });
    expect(enLaBase.withinWithdrawalDays).toBe(6);
  });

  it("una cosecha fuera de la carencia queda sin marca: `null`, no cero", async () => {
    // `null` y `0` dirían cosas distintas: cero sería «se cosechó el día exacto
    // en que se cumplía», y eso no es lo que pasó.
    const c = await nuevaColonia(9);
    await tratar(c.id, 10);
    const { harvestEvent } = await cosechar(c.id, new Date(APLICADO.getTime() + 20 * MS_POR_DIA));
    expect(harvestEvent.withinWithdrawalDays).toBeNull();
  });

  it("sin ningún tratamiento, la cosecha tampoco lleva marca", async () => {
    const c = await nuevaColonia(10);
    const { harvestEvent, carencias } = await cosechar(c.id, APLICADO);
    expect(harvestEvent.withinWithdrawalDays).toBeNull();
    expect(carencias).toEqual([]);
  });
});
