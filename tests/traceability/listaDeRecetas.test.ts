/**
 * Quién ve la lista de recetas: la misma regla que crear una (Daniel, 2026-10-10;
 * `PENDING_IMPLEMENTATIONS/027`). Y el «lote cualquiera» que esa regla llevaba dentro.
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
 * **Y el defecto 2 seguía vivo en otros cinco sitios** (decisión de Daniel, el mismo día: arreglarlos).
 * `listRecipeOrganizations` —de la que depende la regla nueva—, el detalle, crear, renombrar y crear
 * versión miraban `findFirst` sin orden: el primer lote de la organización, o el de toda la base para una
 * receta compartida. Por eso el fixture tiene DOS sitios en la misma organización, con el lote del A
 * creado primero, y un Farm Manager sólo del B: es la cuenta a la que el primer lote no le pertenece.
 *
 * **Las filas, y ninguna sobra:**
 *
 * - *Sin asignaciones* → `ProcessTargetError`. Con el código de antes era `TraceabilityAccessError`.
 * - *Farm Operator del sitio A* (`lot:manage` sin `edit_beneficio`) → `ProcessTargetError`. Es la
 *   consecuencia de la regla elegida, y la fila que cae si alguien vuelve a decidir con `lot:manage`.
 * - *Farm Manager del sitio A* → ve la lista, y en ella la receta de su organización.
 * - *Farm Manager del sitio B* → ve la lista, abre la receta de su organización y la compartida, y puede
 *   renombrar la suya. Con el primer lote, las cuatro caían.
 * - *Control negativo*: el mismo Farm Manager del B **no** abre la receta de otra organización. Sin esta
 *   fila, un ayudante que dijera que sí a todo pasaría las de arriba.
 * - *Control*: para cada cuenta, la lista y `puedeCrearRecetaEnAlguna` contestan lo mismo. Si divergieran,
 *   el enlace que el índice y `/lots` ofrecen volvería a prometer lo que la pantalla rechaza.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import {
  getRecipeForEditor,
  listRecipeOrganizations,
  listRecipes,
  ProcessTargetError,
  puedeCrearRecetaEnAlguna,
  updateRecipeMetadata,
} from "../../lib/traceability/processTargets";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `recetas-${Date.now()}`;
const MARCA = `TEST ${RUN_ID}`;

let organizationId: string;
let sinNada: string;
let operario: string;
let gerente: string;
let gerenteB: string;
let propia: string;
let compartida: string;
let ajena: string;

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

async function sitioConLote(orgId: string, sufijo: string) {
  const sitio = await prisma.location.create({
    data: { name: `${MARCA} ${sufijo}`, locationType: "site", organizationId: orgId, status: "approved", classification: "internal" },
  });
  await prisma.lot.create({ data: { lotCode: `${RUN_ID}-${sufijo}`, lotType: "green", organizationId: orgId, locationId: sitio.id } });
  return sitio.id;
}

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  // El orden importa: el lote del A se crea ANTES, así que es el que un `findFirst` sin orden devuelve.
  const sitioA = await sitioConLote(organizationId, "A");
  const sitioB = await sitioConLote(organizationId, "B");
  propia = (await prisma.processRecipe.create({ data: { name: MARCA, organizationId } })).id;
  compartida = (await prisma.processRecipe.create({ data: { name: `${MARCA} compartida`, organizationId: null } })).id;

  const otra = await createTestOrganization(`${RUN_ID}-otra`);
  await sitioConLote(otra, "otra");
  ajena = (await prisma.processRecipe.create({ data: { name: `${MARCA} ajena`, organizationId: otra } })).id;

  sinNada = await cuenta("SinNada");
  operario = await cuenta("Operario", "Farm Operator", sitioA);
  gerente = await cuenta("Gerente", "Farm Manager", sitioA);
  gerenteB = await cuenta("GerenteB", "Farm Manager", sitioB);
}, 30000);

/** Todo se descubre por la marca, así que se limpia aunque el `beforeAll` muera a mitad. */
afterAll(async () => {
  const personas = await prisma.person.findMany({
    where: { displayName: { startsWith: MARCA } },
    select: { userAccount: { select: { id: true } } },
  });
  const cuentas = personas.flatMap((p) => (p.userAccount ? [p.userAccount.id] : []));
  const sitios = await prisma.location.findMany({ where: { name: { startsWith: MARCA } }, select: { id: true } });
  const recetas = await prisma.processRecipe.findMany({ where: { name: { startsWith: MARCA } }, select: { id: true } });
  // El renombrado escribe auditoría. Va ANTES que la cuenta: su actor es `SET NULL`, y borrar la cuenta
  // primero dejaría filas huérfanas sin fallar.
  if (recetas.length) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "process_recipe", entityId: { in: recetas.map((r) => r.id) } }) });
  }
  if (cuentas.length) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  }
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { startsWith: MARCA } }) });
  // El `Scope` se borra DESPUÉS del `Assignment`, que lo referencia con RESTRICT.
  if (sitios.length) {
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeType: "location" as const, scopeRefId: { in: sitios.map((s) => s.id) } }) });
  }
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ name: { startsWith: MARCA } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ lotCode: { startsWith: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ name: { startsWith: MARCA } }) });
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
    ["Farm Manager del sitio B", () => gerenteB, true],
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

describe("las recetas preguntan por un lote que la cuenta gestione, no por el primero", () => {
  it("el Farm Manager del sitio B tiene su organización entre las de crear recetas", async () => {
    expect((await listRecipeOrganizations(gerenteB)).map((o) => o.id)).toContain(organizationId);
  });

  it("y ve la lista, con la receta de su organización", async () => {
    expect((await listRecipes(gerenteB)).map((r) => r.id)).toContain(propia);
  });

  it("abre la receta de su organización", async () => {
    expect((await getRecipeForEditor(gerenteB, propia)).id).toBe(propia);
  });

  it("abre la receta compartida, que antes dependía del primer lote de toda la base", async () => {
    expect((await getRecipeForEditor(gerenteB, compartida)).id).toBe(compartida);
  });

  it("y puede renombrar la suya: la escritura pasa por el mismo ayudante", async () => {
    await updateRecipeMetadata(gerenteB, propia, { name: MARCA });
  });

  it("control negativo: NO abre la receta de otra organización, donde no gestiona ningún lote", async () => {
    await expect(getRecipeForEditor(gerenteB, ajena)).rejects.toBeInstanceOf(TraceabilityAccessError);
  });
});
