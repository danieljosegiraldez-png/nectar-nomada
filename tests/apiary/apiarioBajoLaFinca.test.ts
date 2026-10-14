/**
 * Un ámbito sobre la finca alcanza al apiario que cuelga de ella — también en la LISTA.
 *
 * `can()` sube por los ancestros del recurso desde ADR-144 (`conAncestros`, lib/rbac/service.ts),
 * así que `requireApiaryAccess` deja abrir un apiario cuyo padre es la finca. Pero
 * `resolveApiaryVisibility` armaba `locationIds` con los ids EXACTOS de los ámbitos y
 * `getApiaryList` filtraba `{ id: { in: locationIds } }`: la ficha autorizaba y `/apiaries` no lo
 * enseñaba. Es el mismo desfase que la lista de lotes arregló el 2026-09-25 con
 * `conDescendientes` (tests/traceability/fincas.test.ts).
 *
 * La finca HERMANA es el control: un ámbito baja, no se ensancha.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  ApiaryAccessError,
  getApiaryDetail,
  getApiaryList,
  getManageableApiaryProjects,
  lugaresParaSitioDeAbejas,
  organizacionesParaApiario,
  requireApiaryAccess,
} from "../../lib/apiary/hives";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `apfinca-${Date.now()}`;

let operario: string;
/** Cuelga directamente de la finca. */
let apiario: string;
/** Cuelga de una parcela de la finca: dos niveles por debajo del ámbito. */
let apiarioEnParcela: string;
/** Cuelga de la finca hermana, que no está en ningún ámbito del operario. */
let apiarioDeLaHermana: string;

async function lugar(data: { locationType: "site" | "plot" | "apiary_site"; name: string; organizationId: string; parentLocationId?: string }) {
  return (await prisma.location.create({
    data: { ...data, name: `TEST ${data.name} (${RUN})`, status: "approved", classification: "internal" },
  })).id;
}

beforeAll(async () => {
  const organizationId = (await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN})`, status: "approved", classification: "internal" },
  })).id;
  const finca = await lugar({ locationType: "site", name: "Finca", organizationId });
  const parcela = await lugar({ locationType: "plot", name: "Parcela", organizationId, parentLocationId: finca });
  const hermana = await lugar({ locationType: "site", name: "Finca hermana", organizationId });
  apiario = await lugar({ locationType: "apiary_site", name: "Apiario de la finca", organizationId, parentLocationId: finca });
  apiarioEnParcela = await lugar({ locationType: "apiary_site", name: "Apiario de la parcela", organizationId, parentLocationId: parcela });
  apiarioDeLaHermana = await lugar({ locationType: "apiary_site", name: "Apiario de la hermana", organizationId, parentLocationId: hermana });

  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Operario", displayName: `TEST Operario (${RUN})`, locale: "es" },
  });
  operario = (await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })).id;
  // `Farm Operator` concede `apiary:view` (lib/rbac/catalog.ts). El ámbito es la FINCA, no el apiario.
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: finca } });
  const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: operario, roleProfileId: rp.id, scopeId: scope.id } });
});

afterAll(async () => {
  // Todo se descubre por el RUN, no por las variables: si el `beforeAll` murió a mitad, éstas
  // están sin asignar y la limpieza tiene que correr igual.
  const personas = (await prisma.person.findMany({ where: { displayName: { contains: RUN } }, select: { id: true } })).map((p) => p.id);
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  let lugares = (await prisma.location.findMany({ where: { name: { contains: RUN } }, select: { id: true } })).map((l) => l.id);

  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: lugares } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  // Hojas primero: un hijo cuyo padre se borra antes queda con el padre en null.
  for (let vuelta = 0; lugares.length && vuelta < 5; vuelta++) {
    const padres = new Set(
      (await prisma.location.findMany({ where: { id: { in: lugares } }, select: { parentLocationId: true } }))
        .map((l) => l.parentLocationId)
        .filter((x): x is string => !!x),
    );
    const hojas = lugares.filter((id) => !padres.has(id));
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: hojas } }) });
    lugares = lugares.filter((id) => padres.has(id));
  }
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN } }) });
});

describe("un ámbito sobre la finca alcanza a sus apiarios, en la ficha y en la lista (ADR-144)", () => {
  it("la ficha: requireApiaryAccess deja abrir los apiarios que cuelgan de la finca, y no el de la hermana", async () => {
    await expect(requireApiaryAccess(operario, "view", [{ locationId: apiario }])).resolves.toBeUndefined();
    await expect(requireApiaryAccess(operario, "view", [{ locationId: apiarioEnParcela }])).resolves.toBeUndefined();
    await expect(requireApiaryAccess(operario, "view", [{ locationId: apiarioDeLaHermana }])).rejects.toThrow(ApiaryAccessError);
    // Lo que de verdad llama `/apiaries/[id]`: la misma puerta, con el sitio y sus colmenas de candidatos.
    expect((await getApiaryDetail(operario, apiario)).id).toBe(apiario);
    await expect(getApiaryDetail(operario, apiarioDeLaHermana)).rejects.toThrow(ApiaryAccessError);
  });

  it("la lista: getApiaryList trae los apiarios que cuelgan de la finca, y no el de la hermana", async () => {
    const lista = await getApiaryList(operario);
    const ids = lista.items.map((a) => a.id);
    expect(ids, "el apiario hijo de la finca").toContain(apiario);
    expect(ids, "el apiario de una parcela de la finca").toContain(apiarioEnParcela);
    expect(ids, "el apiario de la finca hermana NO: baja, no se ensancha").not.toContain(apiarioDeLaHermana);
    expect(lista.sinAmbito).toBe(false);
  });

  /**
   * Las otras cuatro lectoras de `resolveApiaryVisibility` no usan `locationIds`: tres miran sólo
   * `mode === "all"` y la cuarta sólo `projectIds`. Bajar a los descendientes no puede volver
   * «plataforma» un ámbito de finca — esto lo fija, para que nadie lo tenga que volver a leer.
   */
  it("bajar no ensancha: un ámbito de finca sigue sin poder crear apiarios ni elegir proyecto", async () => {
    expect(await organizacionesParaApiario(operario)).toEqual([]);
    expect(await lugaresParaSitioDeAbejas(operario)).toEqual([]);
    expect(await getManageableApiaryProjects(operario)).toEqual([]);
  });
});
