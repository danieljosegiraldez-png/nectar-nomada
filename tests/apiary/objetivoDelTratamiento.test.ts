/**
 * Contra qué se trató, y el reporte que lo hace agrupable.
 *
 * **Lo que cierra.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §4 marca «Objetivo»
 * **obligatorio** —el último de esa columna que seguía sin existir— y dice para
 * qué: *«eficacia por objetivo; hoy no se puede agrupar»*. Medido el 2026-09-13:
 * **0 tratamientos en la copia local**, así que exigirlo no deja ninguna fila
 * existente en falso; y **14 pruebas en 8 archivos cayeron** al exigirlo, que es la
 * prueba de que la exigencia muerde de verdad.
 *
 * **Ningún dato real ha pasado por aquí.** Los fixtures crean los tratamientos.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony } from "../../lib/apiary/hives";
import { recordColonyEvent, ColonyEventValidationError } from "../../lib/apiary/colonyEvents";
import {
  OBJETIVOS_DE_TRATAMIENTO,
  TratamientoInvalido,
  VIAS_QUE_DEJAN_MATERIAL,
  tratamientosPorObjetivo,
} from "../../lib/apiary/objetivoDelTratamiento";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `objetivo-${Date.now()}`;
const DIA = 24 * 60 * 60 * 1000;

describe("el objetivo de un tratamiento", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let scopeId: string;
  let personId: string;
  let colonyId: string;

  async function nuevaColonia(sufijo: string) {
    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `T${sufijo}-${RUN_ID.slice(-4)}` });
    return (
      await createColony(userAccountId, {
        hiveId: hive.id,
        originType: "captured",
        startedAt: new Date("2026-01-01"),
        provenanceClass: "direct_observation",
      })
    ).id;
  }

  async function tratar(colonyId: string, target: string, extra: Record<string, unknown> = {}) {
    return recordColonyEvent(userAccountId, {
      colonyId,
      eventType: "treatment",
      treatmentProduct: "Apivar",
      treatmentBatchLabel: `L-${RUN_ID.slice(-4)}`,
      treatmentWithdrawalDays: 14,
      treatmentTarget: target,
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
    personId = (
      await prisma.person.create({
        data: { givenName: "TEST", familyName: "Objetivo", displayName: `TEST Objetivo (${RUN_ID})`, locale: "es" },
      })
    ).id;
    userAccountId = (
      await prisma.userAccount.create({ data: { personId, authProvider: "credentials", status: "active" } })
    ).id;
    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    scopeId = scope.id;
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
    colonyId = await nuevaColonia("0");
  });

  afterEach(async () => {
    const colonias = await prisma.colony.findMany({ where: { hive: { locationId } }, select: { id: true } });
    const ids = colonias.map((c) => c.id);
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: userAccountId }) });
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
  });

  afterAll(async () => {
    const colonias = await prisma.colony.findMany({ where: { hive: { locationId } }, select: { id: true } });
    const ids = colonias.map((c) => c.id);
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("UN TRATAMIENTO SIN OBJETIVO NO ENTRA, y la fila no se escribe", async () => {
    // La exigencia que el Anexo pide. Nadie va a volver a preguntarle al que
    // aplicó, así que una fila sin objetivo deja la pregunta sin responder para
    // siempre.
    await expect(
      recordColonyEvent(userAccountId, {
        colonyId,
        eventType: "treatment",
        treatmentProduct: "Apivar",
        treatmentBatchLabel: "L-1",
        treatmentWithdrawalDays: 14,
      }),
    ).rejects.toThrow(/treatment_target_required/);
    expect(await prisma.colonyEvent.count({ where: { colonyId } })).toBe(0);
  });

  it("y un objetivo inventado tampoco; el bueno sí", async () => {
    await expect(tratar(colonyId, "telepatia")).rejects.toThrow(TratamientoInvalido);
    // Control positivo por el mismo camino: el valor del protocolo entra.
    const ok = await tratar(colonyId, "polilla_cera", { treatmentRoute: "tira" });
    expect(ok.treatmentTarget).toBe("polilla_cera");
    expect(ok.treatmentRoute).toBe("tira");
  });

  it("ni el objetivo ni la vía tienen sentido fuera de un tratamiento", async () => {
    // Una alimentación «contra varroa» sería un dato que nadie podría leer.
    await expect(
      recordColonyEvent(userAccountId, {
        colonyId,
        eventType: "feeding",
        feedingMaterial: "jarabe 1:1",
        treatmentTarget: "varroa",
      }),
    ).rejects.toThrow(ColonyEventValidationError);
    await expect(
      recordColonyEvent(userAccountId, {
        colonyId,
        eventType: "feeding",
        feedingMaterial: "jarabe 1:1",
        treatmentRoute: "tira",
      }),
    ).rejects.toThrow(/objetivo_o_via_solo_en_tratamiento/);
  });

  it("la vía es OPCIONAL: se trata sin registrar cómo", async () => {
    const sinVia = await tratar(colonyId, "varroa");
    expect(sinVia.treatmentRoute).toBeNull();
  });

  describe("el reporte por objetivo", () => {
    const desde = new Date(Date.now() - 365 * DIA);
    const hasta = new Date(Date.now() + DIA);

    it("cuenta colonias DISTINTAS, no aplicaciones", async () => {
      // Tres aplicaciones a la misma caja son un problema de esa caja, no tres
      // cajas con problema. Misma decisión que `coloniasPorIrregularidad`.
      await tratar(colonyId, "varroa", { occurredAt: new Date(Date.now() - 30 * DIA) });
      await tratar(colonyId, "varroa", { occurredAt: new Date(Date.now() - 20 * DIA) });
      const otra = await nuevaColonia("1");
      await tratar(otra, "varroa", { occurredAt: new Date(Date.now() - 10 * DIA) });

      const filas = await tratamientosPorObjetivo(locationId, desde, hasta);
      const varroa = filas.find((f) => f.target === "varroa")!;
      expect(varroa.tratamientos).toBe(3);
      expect(varroa.colonias).toBe(2);
    });

    it("devuelve LOS CINCO objetivos, también los que valen cero", async () => {
      await tratar(colonyId, "hormigas", { occurredAt: new Date(Date.now() - 5 * DIA) });
      const filas = await tratamientosPorObjetivo(locationId, desde, hasta);
      // «No se trató contra polilla» y «nadie registró tratamientos contra
      // polilla» no son lo mismo, y una fila ausente los confunde.
      expect(filas.map((f) => f.target)).toEqual([...OBJETIVOS_DE_TRATAMIENTO]);
      expect(filas.find((f) => f.target === "polilla_cera")!.tratamientos).toBe(0);
      expect(filas.find((f) => f.target === "hormigas")!.tratamientos).toBe(1);
    });

    it("respeta la ventana, con su control positivo", async () => {
      await tratar(colonyId, "varroa", { occurredAt: new Date(Date.now() - 200 * DIA) });
      // Primero el control: con la ventana ancha SÍ se ve. Sin esto, el cero de
      // abajo podría ser que la fila no existiera.
      expect((await tratamientosPorObjetivo(locationId, desde, hasta)).find((f) => f.target === "varroa")!.tratamientos).toBe(1);
      const ventanaCorta = new Date(Date.now() - 30 * DIA);
      expect(
        (await tratamientosPorObjetivo(locationId, ventanaCorta, hasta)).find((f) => f.target === "varroa")!.tratamientos,
      ).toBe(0);
    });
  });

  it("las vías que dejan material son sólo las que el dueño nombró", () => {
    // El Anexo dice «las tiras que no se retiran generan resistencia», y nada más.
    // `cebo` también deja material, pero añadirlo sería deducirlo: queda como
    // pregunta suya en ADR-119 en vez de colarse como si lo hubiera dicho.
    expect([...VIAS_QUE_DEJAN_MATERIAL]).toEqual(["tira"]);
  });
});
