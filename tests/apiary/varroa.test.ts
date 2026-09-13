/**
 * El conteo de varroa, y la serie que el Anexo C pide.
 *
 * **Lo que cierra.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §2.5 pide cuatro
 * campos —método, abejas de muestra, ácaros contados, infestación derivada— y
 * **ninguno existía**. El Anexo C §2.1 nombra la serie que sin ellos no se podía
 * dibujar: *«Infestación de varroa | por conteo | umbral de tratamiento y si el
 * tratamiento sirvió»*.
 *
 * **Y lo que estas pruebas NO son, para que nadie lo cuente dos veces:** una red
 * para el día que lleguen los datos. Medido el 2026-09-11: **nadie ha contado
 * varroa todavía**. Los fixtures crean los conteos, así que el cálculo y las
 * reglas sí se ejercitan — pero ningún dato real los ha pasado.
 *
 * El caso hostil que más importa se prueba **llamando a la función pura
 * directamente**, que es lo que `CLAUDE.md` exige de cualquier cosa que se llame
 * guardia: `infestacionPorCiento` con muestra cero.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony } from "../../lib/apiary/hives";
import { recordColonyEvent } from "../../lib/apiary/colonyEvents";
import {
  infestacionPorCiento,
  registrarConteoDeVarroa,
  serieDeInfestacion,
  VarroaValidationError,
} from "../../lib/apiary/varroa";
import { ApiaryAccessError } from "../../lib/apiary/hives";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `varroa-${Date.now()}`;

describe("el conteo de varroa", () => {
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
    const cuenta = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    return cuenta.id;
  }

  async function nuevaColonia(i: number) {
    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `V${i}-${RUN_ID.slice(-4)}` });
    return createColony(userAccountId, {
      hiveId: hive.id,
      originType: "captured",
      startedAt: new Date("2026-01-01"),
      provenanceClass: "direct_observation",
    });
  }

  async function tratar(colonyId: string) {
    return recordColonyEvent(userAccountId, {
      colonyId,
      eventType: "treatment",
      treatmentTarget: "varroa",
      occurredAt: new Date("2026-05-01T08:00:00Z"),
      treatmentProduct: "Apivar",
      treatmentBatchLabel: `L-${RUN_ID.slice(-4)}`,
      treatmentWithdrawalDays: 14,
    });
  }

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;

    userAccountId = await crearCuenta("Varroa");
    sinAccesoUserAccountId = await crearCuenta("SinAcceso");

    const project = await prisma.project.create({
      data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    projectId = project.id;

    const location = await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    });
    locationId = location.id;

    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    scopeId = scope.id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
  });

  /** En `afterEach`: corre aunque la aserción falle, y así no quedan filas TEST. */
  afterEach(async () => {
    const colonias = await prisma.colony.findMany({ where: { hive: { locationId } }, select: { id: true } });
    const ids = colonias.map((c) => c.id);
    await prisma.auditEvent.deleteMany({
      where: assertDefinedWhere({ actorUserAccountId: { in: [userAccountId, sinAccesoUserAccountId] } }),
    });
    await prisma.varroaCount.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
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

  it("el porcentaje es ácaros por CIEN abejas, y una muestra vacía no vale cero", () => {
    // La entrada hostil, directa a la función pura. Devolver 0 con muestra vacía
    // afirmaría «no hay infestación», que es lo contrario de «no se sabe».
    expect(infestacionPorCiento(300, 9)).toBeCloseTo(3);
    expect(infestacionPorCiento(300, 0)).toBe(0);
    expect(() => infestacionPorCiento(0, 0)).toThrow(VarroaValidationError);
  });

  it("un conteo se guarda con su método, y el porcentaje NO se guarda", async () => {
    const c = await nuevaColonia(1);
    const conteo = await registrarConteoDeVarroa(userAccountId, {
      colonyId: c.id,
      method: "alcohol",
      sampleBees: 300,
      mitesCounted: 9,
      occurredAt: new Date("2026-04-01T09:00:00Z"),
    });
    expect(conteo.method).toBe("alcohol");
    expect(conteo.sampleBees).toBe(300);
    expect(conteo.mitesCounted).toBe(9);
    // Control: la fila no tiene ninguna columna de porcentaje. Si alguien la
    // añadiera, habría dos fuentes para el mismo número.
    expect(Object.keys(conteo)).not.toContain("infestacion");
    expect(conteo.provenanceClass).toBe("measured_fact");
  });

  it("una muestra de cero abejas se rechaza: sin denominador no hay conteo", async () => {
    const c = await nuevaColonia(2);
    await expect(
      registrarConteoDeVarroa(userAccountId, { colonyId: c.id, method: "alcohol", sampleBees: 0, mitesCounted: 0 }),
    ).rejects.toThrow(/sample_bees_invalid/);
    // Control positivo: con muestra, el mismo cero de ácaros entra — y es el
    // mejor resultado posible, no un hueco.
    const ok = await registrarConteoDeVarroa(userAccountId, {
      colonyId: c.id,
      method: "alcohol",
      sampleBees: 300,
      mitesCounted: 0,
    });
    expect(ok.mitesCounted).toBe(0);
  });

  it("más ácaros que abejas se rechaza: es un dedo de más, no un 400 %", async () => {
    const c = await nuevaColonia(3);
    await expect(
      registrarConteoDeVarroa(userAccountId, { colonyId: c.id, method: "bandeja", sampleBees: 100, mitesCounted: 400 }),
    ).rejects.toThrow(/mas_acaros_que_abejas/);
    // Control positivo: el caso límite —tantos ácaros como abejas— SÍ entra. Es
    // absurdo pero no imposible, y rechazarlo sería inventar una regla.
    const limite = await registrarConteoDeVarroa(userAccountId, {
      colonyId: c.id,
      method: "bandeja",
      sampleBees: 100,
      mitesCounted: 100,
    });
    expect(infestacionPorCiento(limite.sampleBees, limite.mitesCounted)).toBe(100);
  });

  it("sólo un TRATAMIENTO puede ser evaluado, y sólo de la MISMA colonia", async () => {
    const a = await nuevaColonia(4);
    const b = await nuevaColonia(5);
    const tratamientoDeA = await tratar(a.id);

    // El tratamiento de otra caja: atribuir su eficacia a ésta es peor que no
    // medirla.
    await expect(
      registrarConteoDeVarroa(userAccountId, {
        colonyId: b.id,
        method: "alcohol",
        sampleBees: 300,
        mitesCounted: 2,
        evaluatesColonyEventId: tratamientoDeA.id,
      }),
    ).rejects.toThrow(/tratamiento_de_otra_colonia/);

    // Un evento que no es tratamiento tampoco.
    const alimentacion = await recordColonyEvent(userAccountId, {
      colonyId: a.id,
      eventType: "feeding",
      feedingMaterial: "jarabe 1:1",
    });
    await expect(
      registrarConteoDeVarroa(userAccountId, {
        colonyId: a.id,
        method: "alcohol",
        sampleBees: 300,
        mitesCounted: 2,
        evaluatesColonyEventId: alimentacion.id,
      }),
    ).rejects.toThrow(/no_es_un_tratamiento/);

    // CONTROL POSITIVO: el tratamiento correcto de la colonia correcta SÍ entra.
    const ok = await registrarConteoDeVarroa(userAccountId, {
      colonyId: a.id,
      method: "alcohol",
      sampleBees: 300,
      mitesCounted: 2,
      evaluatesColonyEventId: tratamientoDeA.id,
    });
    expect(ok.evaluatesColonyEventId).toBe(tratamientoDeA.id);
  });

  it("evaluar un tratamiento es OPCIONAL — contar para decidir es el caso normal", async () => {
    const c = await nuevaColonia(6);
    const conteo = await registrarConteoDeVarroa(userAccountId, {
      colonyId: c.id,
      method: "azucar",
      sampleBees: 300,
      mitesCounted: 15,
    });
    expect(conteo.evaluatesColonyEventId).toBeNull();
  });

  it("LA SERIE DEL ANEXO C: ascendente, con su porcentaje derivado", async () => {
    // Tratar, volver a contar, comparar — el ciclo que el Anexo B §4 llama
    // «eficacia observada».
    const c = await nuevaColonia(7);
    const tratamiento = await tratar(c.id);
    await registrarConteoDeVarroa(userAccountId, {
      colonyId: c.id,
      method: "alcohol",
      sampleBees: 300,
      mitesCounted: 18,
      occurredAt: new Date("2026-04-20T09:00:00Z"),
    });
    await registrarConteoDeVarroa(userAccountId, {
      colonyId: c.id,
      method: "alcohol",
      sampleBees: 300,
      mitesCounted: 3,
      occurredAt: new Date("2026-06-01T09:00:00Z"),
      evaluatesColonyEventId: tratamiento.id,
    });

    const serie = await serieDeInfestacion(c.id);
    expect(serie).toHaveLength(2);
    // Ascendente: la primera es la más VIEJA. Al revés, cada pantalla tendría
    // que invertirla y la primera que se olvidara dibujaría la curva al revés.
    expect(serie[0]!.occurredAt.toISOString()).toBe("2026-04-20T09:00:00.000Z");
    expect(serie[0]!.infestacion).toBeCloseTo(6);
    expect(serie[1]!.infestacion).toBeCloseTo(1);
    // Y el segundo punto dice a qué tratamiento responde: eso es lo que cierra
    // el ciclo.
    expect(serie[1]!.evaluatesColonyEventId).toBe(tratamiento.id);
  });

  it("quien no tiene acceso al sitio no puede registrar un conteo", async () => {
    const c = await nuevaColonia(8);
    await expect(
      registrarConteoDeVarroa(sinAccesoUserAccountId, {
        colonyId: c.id,
        method: "alcohol",
        sampleBees: 300,
        mitesCounted: 1,
      }),
    ).rejects.toThrow(ApiaryAccessError);
    expect(await prisma.varroaCount.count({ where: { colonyId: c.id } })).toBe(0);
  });

  it("el mismo borrador dos veces no crea dos conteos", async () => {
    const c = await nuevaColonia(9);
    const entrada = {
      colonyId: c.id,
      method: "alcohol" as const,
      sampleBees: 300,
      mitesCounted: 4,
      clientDraftId: `${RUN_ID}-draft`,
    };
    const primero = await registrarConteoDeVarroa(userAccountId, entrada);
    const segundo = await registrarConteoDeVarroa(userAccountId, entrada);
    expect(segundo.id).toBe(primero.id);
    expect(await prisma.varroaCount.count({ where: { colonyId: c.id } })).toBe(1);
  });

  it("deja su AuditEvent, porque un conteo decide si se trata", async () => {
    const c = await nuevaColonia(10);
    const conteo = await registrarConteoDeVarroa(userAccountId, {
      colonyId: c.id,
      method: "bandeja",
      sampleBees: 200,
      mitesCounted: 6,
    });
    const evento = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: "varroa_count", entityId: conteo.id, operation: "varroa_count.create" },
    });
    expect((evento.after as { mitesCounted?: number }).mitesCounted).toBe(6);
  });
});
