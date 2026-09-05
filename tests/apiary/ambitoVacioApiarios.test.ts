/**
 * «No hay apiarios» y «no puedes ver ninguno» tampoco son el mismo hecho.
 *
 * La segunda revisión de páginas (2026-09-05) arregló esto en `/lots` y dejó
 * anotados «seis sitios más». Medidos uno a uno el mismo día, **eran uno**:
 * `lotWhereFromVisibility` y `sampleWhereFromVisibility` son ayudantes que
 * devuelven un `where`; `lotMatchesVisibility` es un predicado donde `false` es
 * la respuesta correcta; `getActiveOperations` ya se había arreglado;
 * `buildProducerExport` **lanza** `ExportAccessError` en vez de exportar un
 * vacío; y `NewHiveForm` ya comprueba `projects.length > 0`. El único real es
 * `getApiaryList`, cuya pantalla decía «Todavía no hay apiarios» a quien
 * simplemente no tiene asignaciones.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { getApiaryList } from "../../lib/apiary/hives";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `apiario-${Date.now()}`;
let organizationId: string;
let apiaryId: string;
let scopeId: string;
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
  organizationId = (await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  })).id;
  apiaryId = (await prisma.location.create({
    data: { locationType: "apiary_site", name: `TEST Apiary (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  })).id;

  sinAsignaciones = await cuenta("SinAsignaciones");
  conAmbito = await cuenta("ConAmbito");

  // `Farm Operator` concede `apiary:view` — comprobado contra la base.
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: apiaryId } })).id;
  const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: conAmbito, roleProfileId: rp.id, scopeId } });
});

afterAll(async () => {
  const ids = [sinAsignaciones, conAmbito];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: ids } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: apiaryId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: apiaryId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("una lista de apiarios vacía dice por qué está vacía", () => {
  it("sin asignaciones: vacía Y marcada como falta de ámbito", async () => {
    const lista = await getApiaryList(sinAsignaciones);
    expect(lista.items).toEqual([]);
    expect(lista.sinAmbito, "la pantalla necesita poder decir «no puedes ver», no «no hay»").toBe(true);
  });

  /**
   * **El caso que hace que la bandera signifique algo.** Esta cuenta ve el
   * apiario de verdad. Si `sinAmbito` fuera un alias de `items.length === 0`,
   * este test fallaría — y con él, la pantalla diría a un operador con permisos
   * que no tiene acceso.
   */
  it("con ámbito: ve el apiario, y NO falta ámbito", async () => {
    const lista = await getApiaryList(conAmbito);
    expect(lista.items.map((a) => a.id), "control positivo: el apiario existe y esta cuenta lo alcanza").toContain(apiaryId);
    expect(lista.sinAmbito).toBe(false);
  });
});
