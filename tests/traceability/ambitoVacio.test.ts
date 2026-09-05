/**
 * «No hay lotes» y «no puedes ver ninguno» son hechos distintos.
 *
 * **El defecto (quinta revisión, 2026-09-05).** `getLotList` y
 * `getActiveOperations` devolvían el mismo array vacío en los dos casos, así
 * que `/lots` decía **«Nada en curso ahora mismo»** a una cuenta sin
 * asignaciones — una afirmación sobre la finca, cuando puede haber
 * fermentaciones corriendo en ese momento.
 *
 * Importa más de lo que parece: es la **primera pantalla** de alguien recién
 * dado de alta, y 13 de 14 cuentas siguen sin poder entrar (P-C). El día que
 * Daniel dé acceso, esto es lo que verán.
 *
 * El repositorio ya sabía hacerlo bien en otro sitio: `Partner.noProjects` dice
 * «Aún no tienes proyectos asignados. Un administrador puede darte acceso».
 * Esto lleva esa forma a la superficie de operación.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { getLotList, getActiveOperations } from "../../lib/traceability/lots";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `ambito-${Date.now()}`;
let organizationId: string;
let plotId: string;
let sinAsignaciones: string;
let conAmbito: string;

async function cuenta(label: string) {
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  return (await prisma.userAccount.create({
    data: { personId: p.id, authProvider: "credentials", status: "active" },
  })).id;
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" } });
  organizationId = org.id;
  plotId = (await prisma.location.create({
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" } })).id;

  sinAsignaciones = await cuenta("SinAsignaciones");
  conAmbito = await cuenta("ConAmbito");

  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const sc = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } });
  await prisma.assignment.create({ data: { userAccountId: conAmbito, roleProfileId: perfil.id, scopeId: sc.id } });
});

afterAll(async () => {
  const ids = [sinAsignaciones, conAmbito];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: ids } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: plotId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("una lista vacía dice por qué está vacía", () => {
  it("sin asignaciones: la lista viene vacía Y marcada como falta de ámbito", async () => {
    const lots = await getLotList(sinAsignaciones);
    expect(lots.items).toEqual([]);
    expect(lots.sinAmbito, "la pantalla necesita poder decir «no puedes ver», no «no hay»").toBe(true);

    const ops = await getActiveOperations(sinAsignaciones);
    expect(ops.activeFermentationRuns).toEqual([]);
    expect(ops.sinAmbito).toBe(true);
  });

  /**
   * **El caso que hace que la bandera signifique algo.** Esta cuenta SÍ tiene
   * ámbito, y su lista está igualmente vacía porque en ese lote no hay nada
   * todavía. Si `sinAmbito` fuera un alias de `items.length === 0`, este test
   * fallaría — y con él, la pantalla diría a un operador con permisos que no
   * tiene acceso.
   */
  it("con ámbito pero sin lotes: vacía, y NO por falta de ámbito", async () => {
    const lots = await getLotList(conAmbito);
    expect(lots.items).toEqual([]);
    expect(lots.sinAmbito, "tiene permisos: el vacío es del mundo, no del acceso").toBe(false);

    const ops = await getActiveOperations(conAmbito);
    expect(ops.sinAmbito).toBe(false);
  });
});
