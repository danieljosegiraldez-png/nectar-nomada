/**
 * El camino de cierre de un evento de colonia: completar y corregir.
 *
 * **Lo que cierra.** `PENDING_IMPLEMENTATIONS/011`: medido el 2026-09-13,
 * `lib/apiary/` **no tenía una sola función de actualización**, y por eso los dos
 * campos de etapa cierre del Anexo B §4 no podían existir sin ser columnas que nadie
 * pudiera rellenar.
 *
 * **La distinción que estas pruebas defienden** es la del diseño: completar un hecho
 * que siempre iba a llegar después **no lleva razón**; cambiar algo ya escrito **sí**.
 * Confundirlas tiene coste en las dos direcciones — pedir razón para el curso normal
 * del trabajo enseña a escribir «.» en el campo, y no pedirla para una corrección
 * deja reescribir evidencia sin rastro.
 *
 * **Ningún dato real ha pasado por aquí.** Los fixtures crean los tratamientos.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony, ApiaryAccessError } from "../../lib/apiary/hives";
import { recordColonyEvent } from "../../lib/apiary/colonyEvents";
import { CierreInvalido, completarCierreDeTratamiento, retirosPendientes } from "../../lib/apiary/cierreDeEvento";
import { leerEnmiendas } from "../../lib/traceability/enmiendas";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `cierre-${Date.now()}`;
const DIA = 24 * 60 * 60 * 1000;

/** Un día a medianoche UTC, como los guarda el campo de día. */
function dia(offsetDias: number): Date {
  const d = new Date(Date.now() + offsetDias * DIA);
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`);
}

describe("el cierre de un tratamiento", () => {
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

  async function nuevaColonia(sufijo: string) {
    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `C${sufijo}-${RUN_ID.slice(-4)}` });
    return (
      await createColony(userAccountId, {
        hiveId: hive.id,
        originType: "captured",
        startedAt: new Date("2026-01-01"),
        provenanceClass: "direct_observation",
      })
    ).id;
  }

  async function tratar(colonyId: string, extra: Record<string, unknown> = {}) {
    return recordColonyEvent(userAccountId, {
      colonyId,
      eventType: "treatment",
      occurredAt: new Date(Date.now() - 30 * DIA),
      treatmentProduct: "Apivar",
      treatmentBatchLabel: `L-${RUN_ID.slice(-4)}`,
      treatmentWithdrawalDays: 14,
      treatmentTarget: "varroa",
      treatmentRoute: "tira",
      ...extra,
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
    userAccountId = await crearCuenta("Cierre");
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

  it("COMPLETAR no pide razón: el retiro siempre iba a anotarse después", async () => {
    const c = await nuevaColonia("1");
    const t = await tratar(c);
    const { evento, esCorreccion } = await completarCierreDeTratamiento(userAccountId, {
      colonyEventId: t.id,
      removalDate: dia(-2),
    });
    expect(esCorreccion).toBe(false);
    expect(evento.treatmentRemovalDate?.toISOString()).toBe(dia(-2).toISOString());
  });

  it("CORREGIR sin razón se rechaza, y con razón entra", async () => {
    const c = await nuevaColonia("2");
    const t = await tratar(c);
    await completarCierreDeTratamiento(userAccountId, { colonyEventId: t.id, removalDate: dia(-5) });

    await expect(
      completarCierreDeTratamiento(userAccountId, { colonyEventId: t.id, removalDate: dia(-2) }),
    ).rejects.toThrow(/razon_requerida_para_corregir/);
    // Control positivo: con razón, el mismo cambio entra.
    const { esCorreccion } = await completarCierreDeTratamiento(userAccountId, {
      colonyEventId: t.id,
      removalDate: dia(-2),
      reason: "me equivoqué de día al copiar del cuaderno",
    });
    expect(esCorreccion).toBe(true);
  });

  it("EL RASTRO distingue completar de corregir, y guarda el valor anterior", async () => {
    const c = await nuevaColonia("3");
    const t = await tratar(c);
    await completarCierreDeTratamiento(userAccountId, { colonyEventId: t.id, removalDate: dia(-5) });
    await completarCierreDeTratamiento(userAccountId, {
      colonyEventId: t.id,
      removalDate: dia(-2),
      reason: "el cuaderno decía otra cosa",
    });

    // `leerEnmiendas` ya sabía leer esto: no hubo que tocarlo, porque el audit se
    // escribe con `entityType: "colony_event"`, que es lo que ya se escribía.
    const enmiendas = await leerEnmiendas([{ entityType: "colony_event", entityId: t.id }]);
    const operaciones = enmiendas.map((e) => e.operation);
    expect(operaciones).toContain("colony_event.close");
    expect(operaciones).toContain("colony_event.correct");

    const correccion = enmiendas.find((e) => e.operation === "colony_event.correct")!;
    expect(correccion.reason).toBe("el cuaderno decía otra cosa");
    // **La columna que hace legible el rastro:** esto se completó en la casa.
    expect(correccion.sourceInterface).toBe("apiary.close");
    // Y el valor anterior sigue ahí, que es lo que hace que enmendar no sea borrar.
    expect((correccion.before as { treatmentRemovalDate?: string }).treatmentRemovalDate).toBeTruthy();
  });

  it("retirar antes de aplicar se rechaza: es un dedazo, no un dato", async () => {
    const c = await nuevaColonia("4");
    const t = await tratar(c);
    await expect(
      completarCierreDeTratamiento(userAccountId, { colonyEventId: t.id, removalDate: dia(-40) }),
    ).rejects.toThrow(/retiro_antes_de_aplicar/);
    // Control positivo: el MISMO día de la aplicación sí vale — se puso y se quitó.
    const mismoDia = new Date(`${t.occurredAt.toISOString().slice(0, 10)}T00:00:00Z`);
    const { evento } = await completarCierreDeTratamiento(userAccountId, { colonyEventId: t.id, removalDate: mismoDia });
    expect(evento.treatmentRemovalDate?.toISOString()).toBe(mismoDia.toISOString());
  });

  it("una alimentación no tiene cierre, y quien no tiene acceso no cierra nada", async () => {
    const c = await nuevaColonia("5");
    const alimentacion = await recordColonyEvent(userAccountId, {
      colonyId: c,
      eventType: "feeding",
      feedingMaterial: "jarabe 1:1",
      coverageUntil: dia(20),
    });
    await expect(
      completarCierreDeTratamiento(userAccountId, { colonyEventId: alimentacion.id, removalDate: dia(0) }),
    ).rejects.toThrow(/no_es_un_tratamiento/);

    const t = await tratar(c);
    await expect(
      completarCierreDeTratamiento(sinAccesoUserAccountId, { colonyEventId: t.id, removalDate: dia(0) }),
    ).rejects.toThrow(ApiaryAccessError);
    expect((await prisma.colonyEvent.findUniqueOrThrow({ where: { id: t.id } })).treatmentRemovalDate).toBeNull();
  });

  it("llamar sin nada que completar se rechaza en vez de escribir un audit vacío", async () => {
    const c = await nuevaColonia("6");
    const t = await tratar(c);
    await expect(completarCierreDeTratamiento(userAccountId, { colonyEventId: t.id })).rejects.toThrow(CierreInvalido);
    expect(await prisma.auditEvent.count({ where: { entityId: t.id, operation: { contains: "close" } } })).toBe(0);
  });

  describe("el aviso de tiras sin retirar", () => {
    it("avisa de la tira vieja, y NO de la que ya se retiró", async () => {
      const pendiente = await nuevaColonia("7");
      const retirada = await nuevaColonia("8");
      await tratar(pendiente);
      const t2 = await tratar(retirada);
      await completarCierreDeTratamiento(userAccountId, { colonyEventId: t2.id, removalDate: dia(-1) });

      const filas = await retirosPendientes(locationId);
      expect(filas).toHaveLength(1);
      expect(filas[0]!.colonyId).toBe(pendiente);
      expect(filas[0]!.diasDesde).toBeGreaterThanOrEqual(30);
    });

    it("una vía SIN REGISTRAR no entra: nadie dijo que fuera una tira", async () => {
      // Convertir «no se registró» en «era una tira» sería una afirmación que nadie
      // hizo —ADR-080— y además llenaría el aviso de tratamientos viejos de antes de
      // que la columna existiera.
      const c = await nuevaColonia("9");
      await tratar(c, { treatmentRoute: null });
      expect(await retirosPendientes(locationId)).toEqual([]);
      // Control positivo: el mismo tratamiento CON vía de tira sí avisa.
      const otra = await nuevaColonia("10");
      await tratar(otra, { treatmentRoute: "tira" });
      expect(await retirosPendientes(locationId)).toHaveLength(1);
    });

    it("un goteo no avisa: no deja nada que retirar", async () => {
      const c = await nuevaColonia("11");
      await tratar(c, { treatmentRoute: "goteo" });
      expect(await retirosPendientes(locationId)).toEqual([]);
    });

    it("espera a que pase la carencia declarada, no la ventana por defecto", async () => {
      // Una tira puesta ayer con 60 días de carencia no se avisa; la ventana por
      // defecto de 14 la habría sacado, y avisar antes de tiempo enseña a ignorar.
      const c = await nuevaColonia("12");
      await tratar(c, { occurredAt: new Date(Date.now() - 20 * DIA), treatmentWithdrawalDays: 60 });
      expect(await retirosPendientes(locationId, new Date(), 14)).toEqual([]);
      // Control positivo: con 7 días de carencia, la misma fila SÍ avisa.
      const otra = await nuevaColonia("13");
      await tratar(otra, { occurredAt: new Date(Date.now() - 20 * DIA), treatmentWithdrawalDays: 7 });
      expect(await retirosPendientes(locationId, new Date(), 14)).toHaveLength(1);
    });
  });
});
