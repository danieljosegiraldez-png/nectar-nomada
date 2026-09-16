/**
 * Anexo E §5 -- "Al cerrarla: resumen de lo registrado, lo que quedo pendiente".
 *
 * Medido sobre `main` antes de escribir: `resumenDeVisita` existia desde A9.1 y aparecia en
 * **cero** pantallas, y de "lo que quedo pendiente" no habia nada. Las dos mitades de la
 * frase faltaban en la pantalla donde se cierra.
 *
 * Lo que estas pruebas fijan es la pregunta del oficio: **abriste cuatro de diez, cuales seis
 * se quedaron**.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createColony, createHive } from "../../lib/apiary/hives";
import { recordInspection } from "../../lib/apiary/inspections";
import { recordColonyEvent } from "../../lib/apiary/colonyEvents";
import { pendientesDeLaVisita } from "../../lib/apiary/pendienteDeLaVisita";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `pend-${Date.now()}`;
const AHORA = new Date("2026-09-15T20:00:00Z");

describe("Anexo E §5 -- lo que quedo pendiente al cerrar", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let personId: string;
  let fieldSessionId: string;
  let cajas: { id: string; identifier: string; colonyId: string | null }[] = [];

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.create({
        data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
      })
    ).id;
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Pend", displayName: `TEST Pend (${RUN_ID})`, locale: "es" },
    });
    personId = person.id;
    userAccountId = (
      await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } })
    ).id;
    projectId = (
      await prisma.project.create({ data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" } })
    ).id;
    locationId = (
      await prisma.location.create({
        data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
      })
    ).id;
    const farmOperator = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperator.id, scopeId: scope.id } });

    // Cuatro cajas: tres con colonia viva y una vacia.
    for (let i = 0; i < 4; i++) {
      const hive = await createHive(userAccountId, { projectId, locationId, identifier: `P${i}-${RUN_ID.slice(-5)}` });
      let colonyId: string | null = null;
      if (i < 3) {
        colonyId = (
          await createColony(userAccountId, {
            hiveId: hive.id,
            originType: "captured",
            startedAt: new Date("2026-01-01"),
            provenanceClass: "direct_observation",
          })
        ).id;
      }
      cajas.push({ id: hive.id, identifier: hive.identifier, colonyId });
    }

    // La jornada abierta. Los eventos se ligan solos a ella (A9.2).
    fieldSessionId = (
      await prisma.fieldSession.create({
        data: {
          locationId,
          operatorPersonId: personId,
          startedAt: AHORA,
          status: "draft",
          provenanceClass: "original_record",
          createdBy: userAccountId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    const colonias = await prisma.colony.findMany({ where: assertDefinedWhere({ hive: { locationId } }), select: { id: true } });
    const ids = colonias.map((c) => c.id);
    await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId }) });
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
    await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId: { in: ids } }) });
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
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

  it("sin ningun evento, TODAS las cajas del sitio estan sin tocar", async () => {
    const p = (await pendientesDeLaVisita(fieldSessionId, AHORA))!;
    expect(p.sinTocar).toHaveLength(4);
    expect(p.tocadas).toBe(0);
    // Y distingue las pobladas: tres con colonia viva, una caja vacia.
    expect(p.sinTocarPobladas).toBe(3);
  });

  it("LA PREGUNTA DEL OFICIO: una inspeccion quita SU caja de la lista y deja las demas", async () => {
    await recordInspection(userAccountId, {
      colonyId: cajas[0]!.colonyId!,
      occurredAt: AHORA,
      outcome: "nothing_unusual",
    });
    const p = (await pendientesDeLaVisita(fieldSessionId, AHORA))!;
    expect(p.tocadas).toBe(1);
    expect(p.sinTocar.map((c) => c.identifier)).not.toContain(cajas[0]!.identifier);
    expect(p.sinTocar).toHaveLength(3);
    expect(p.sinTocarPobladas).toBe(2);
  });

  it("un evento de colonia cuenta igual que una inspeccion: son tres caminos, no uno", async () => {
    // Si el lector mirara solo `inspectionId`, una caja alimentada seguiria saliendo como
    // sin tocar y el cierre reclamaria trabajo ya hecho.
    await recordColonyEvent(userAccountId, {
      colonyId: cajas[1]!.colonyId!,
      eventType: "feeding",
      occurredAt: AHORA,
      feedingMaterial: "jarabe 1:1",
    });
    const p = (await pendientesDeLaVisita(fieldSessionId, AHORA))!;
    expect(p.tocadas).toBe(2);
    expect(p.sinTocar.map((c) => c.identifier)).not.toContain(cajas[1]!.identifier);
  });

  it("la caja vacia sigue apareciendo, y marcada como no poblada", async () => {
    // No se esconde: el apiario tiene cuatro cajas y decir tres mentiria. Pero la cifra que
    // decide si te vas es la de las pobladas.
    const p = (await pendientesDeLaVisita(fieldSessionId, AHORA))!;
    const vacia = p.sinTocar.find((c) => c.identifier === cajas[3]!.identifier);
    expect(vacia, "la caja vacia esta en la lista").toBeTruthy();
    expect(vacia!.poblada).toBe(false);
  });

  it("una jornada que no existe devuelve null, no una lista vacia", async () => {
    // Vacio significaria "no quedo nada pendiente", que es una afirmacion sobre una visita
    // que no existe.
    expect(await pendientesDeLaVisita("00000000-0000-0000-0000-000000000000", AHORA)).toBeNull();
  });

  it("los eventos de OTRA jornada del mismo sitio no cuentan como tocadas", async () => {
    // El control que separa "esta visita" de "este sitio": sin el filtro por jornada, una
    // visita anterior haria creer que ya abriste todo hoy.
    const otra = await prisma.fieldSession.create({
      data: {
        locationId,
        operatorPersonId: personId,
        startedAt: new Date("2026-09-01T10:00:00Z"),
        status: "draft",
        provenanceClass: "original_record",
        createdBy: userAccountId,
      },
    });
    const p = (await pendientesDeLaVisita(otra.id, AHORA))!;
    expect(p.tocadas, "en la otra jornada no se ha tocado nada").toBe(0);
    expect(p.sinTocar).toHaveLength(4);
    // Y control positivo de que la primera SI tiene dos tocadas, o esto no medira nada.
    expect((await pendientesDeLaVisita(fieldSessionId, AHORA))!.tocadas).toBe(2);
    await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: otra.id }) });
    await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: otra.id }) });
  });
});
