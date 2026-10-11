/**
 * Quién ve la lista de recetas: la misma regla que crear una (Daniel, 2026-10-10;
 * `PENDING_IMPLEMENTATIONS/027`).
 *
 * **Los dos defectos que lo motivan, medidos el 2026-10-10** con la cuenta DEMO de socio:
 *
 * 1. `listRecipes` rechazaba con `requireLotAccess`, que lanza `TraceabilityAccessError`, y
 *    `app/recipes/page.tsx` sólo atrapa `ProcessTargetError` para mandar a `/lots`. El rechazo que la
 *    página prevé no lo atrapaba nadie: 500.
 * 2. Decidía el acceso con `lot:manage` sobre `prisma.lot.findFirst({ where: {} })`, el primer lote de
 *    **toda la base**, sin orden ni filtro. Quien gestionaba los lotes de su organización recibía el
 *    rechazo si ese lote era de otra.
 *
 * Ahora la decide `puedeCrearRecetaEnAlguna` —`edit_beneficio` en una organización con lotes, o en
 * plataforma para la receta compartida— y rechaza con `ProcessTargetError("no_recipe_access")`.
 *
 * **Las filas, y ninguna sobra:**
 *
 * - *Sin asignaciones* → `ProcessTargetError`. Con el código de antes era `TraceabilityAccessError`.
 * - *Farm Operator de la finca* (`lot:manage` sin `edit_beneficio`) → `ProcessTargetError`. Es la
 *   consecuencia de la regla elegida, y la fila que cae si alguien vuelve a decidir con `lot:manage`.
 * - *Farm Manager de la finca* (las dos) → ve la lista, y en ella la receta de su organización. Con el
 *   código de antes caía en una base donde el primer lote fuera de otra organización, que es lo normal en
 *   la base sembrada.
 * - *Control*: para cada cuenta, la lista y `puedeCrearRecetaEnAlguna` contestan lo mismo. Si divergieran,
 *   el enlace que el índice y `/lots` ofrecen volvería a prometer lo que la pantalla rechaza.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { listRecipes, ProcessTargetError, puedeCrearRecetaEnAlguna } from "../../lib/traceability/processTargets";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `recetas-${Date.now()}`;
const MARCA = `TEST ${RUN_ID}`;

let sinNada: string;
let operario: string;
let gerente: string;

async function cuenta(nombre: string, perfil?: string, sitioId?: string) {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: nombre, displayName: `${MARCA} ${nombre}`, locale: "es" },
  });
  const id = (await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })).id;
  if (perfil && sitioId) {
    const rol = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
    const scope =
      (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: sitioId } })) ??
      (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitioId } }));
    await prisma.assignment.create({ data: { userAccountId: id, roleProfileId: rol.id, scopeId: scope.id } });
  }
  return id;
}

beforeAll(async () => {
  const organizationId = await createTestOrganization(RUN_ID);
  const sitio = await prisma.location.create({
    data: { name: MARCA, locationType: "site", organizationId, status: "approved", classification: "internal" },
  });
  await prisma.lot.create({ data: { lotCode: `${RUN_ID}-lote`, lotType: "green", organizationId, locationId: sitio.id } });
  await prisma.processRecipe.create({ data: { name: MARCA, organizationId } });

  sinNada = await cuenta("SinNada");
  operario = await cuenta("Operario", "Farm Operator", sitio.id);
  gerente = await cuenta("Gerente", "Farm Manager", sitio.id);
}, 30000);

/** Todo se descubre por la marca, así que se limpia aunque el `beforeAll` muera a mitad. Estas lecturas no escriben auditoría. */
afterAll(async () => {
  const personas = await prisma.person.findMany({
    where: { displayName: { startsWith: MARCA } },
    select: { userAccount: { select: { id: true } } },
  });
  const cuentas = personas.flatMap((p) => (p.userAccount ? [p.userAccount.id] : []));
  const sitios = await prisma.location.findMany({ where: { name: MARCA }, select: { id: true } });
  if (cuentas.length) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  }
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { startsWith: MARCA } }) });
  // El `Scope` se borra DESPUÉS del `Assignment`, que lo referencia con RESTRICT.
  if (sitios.length) {
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeType: "location" as const, scopeRefId: { in: sitios.map((s) => s.id) } }) });
  }
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ name: MARCA }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ lotCode: { startsWith: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ name: MARCA }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

async function rechaza(promesa: Promise<unknown>) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ProcessTargetError);
  expect((error as Error).message).toBe("no_recipe_access");
}

describe("la lista de recetas usa la regla de crear recetas", () => {
  it("una cuenta sin asignaciones recibe ProcessTargetError, que la página convierte en volver a /lots", async () => {
    await rechaza(listRecipes(sinNada));
  });

  it("el Farm Operator de la finca, con lot:manage y sin edit_beneficio, tampoco la ve", async () => {
    await rechaza(listRecipes(operario));
  });

  it("el Farm Manager de la finca la ve, y en ella la receta de su organización", async () => {
    const recetas = await listRecipes(gerente);
    expect(recetas.map((r) => r.name)).toContain(MARCA);
  });

  it.each([
    ["sin asignaciones", () => sinNada, false],
    ["Farm Operator", () => operario, false],
    ["Farm Manager", () => gerente, true],
  ] as const)("control: para %s, la lista y puedeCrearRecetaEnAlguna contestan lo mismo", async (_nombre, quien, esperado) => {
    expect(await puedeCrearRecetaEnAlguna(quien())).toBe(esperado);
    const ve = await listRecipes(quien()).then(
      () => true,
      (e: unknown) => {
        if (e instanceof ProcessTargetError) return false;
        throw e;
      },
    );
    expect(ve).toBe(esperado);
  });
});
