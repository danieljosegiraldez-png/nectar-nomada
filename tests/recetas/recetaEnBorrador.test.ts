/**
 * La receta nueva, en borrador, y los vocabularios del editor — Parte 2a, tarea 14 (2026-10-03; integrada el 2026-10-04).
 *
 * `crearRecetaEnBorrador` es la puerta que le faltaba al editor: `createRecipeWithVersion` exigía al menos una meta con su fase
 * (`validateTargets`: `at_least_one_target_required`) y una receta con pasos no declara sus números en la versión sino en cada paso. Cada rechazo
 * lleva al lado el caso válido que pasa, para que no pase vacío.
 *
 * **Quién escribe (V16, Ruling A):** un Coffee Process Manager de plataforma (`gestor`, de `fabricaDeCuentas`), como `pasos.test.ts`. El Platform Admin
 * (`admin`) queda para lo que es del LOTE (`listRecipeVersionsForLot`, que pide `lot:manage`). Los permisos se prueban aparte, con un Farm Manager, un capataz y
 * un Process Manager de una finca propia: el Farm Manager lleva `edit_beneficio` y `lot:manage` de serie y aun así NO crea recetas. Nada aquí cuenta filas
 * globales, así que el alcance de plataforma de `gestor` no contamina ninguna cifra.
 *
 * **Limpieza:** `afterEach`/`afterAll`, por el prefijo `RUN` y en orden de claves ajenas, con `assertDefinedWhere`; nunca debajo de las aserciones. La auditoría
 * de una receta cuelga del id de la receta y la de una versión del de la versión. Las cuentas, **después** de las recetas que firmaron.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import type { Prisma } from "../../generated/prisma/client";
import { CATALOGOS_DEL_EDITOR, catalogosDelEditor } from "../../lib/recetas/catalogosDelEditor";
import { RecipeError } from "../../lib/recetas/errorDeReceta";
import { crearRecetaEnBorrador } from "../../lib/recetas/versiones";
import { TIPOS_DE_PASO } from "../../lib/recetas/vocabulario";
import { exigeEditarBeneficioEnOrganizacion } from "../../lib/traceability/locations";
import { listRecipeVersionsForLot } from "../../lib/traceability/processTargets";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { fabricaDeCuentas } from "../helpers/cuentasDeAutoria";

const RUN = `nueva-${Date.now()}`;
const cuentas = fabricaDeCuentas("Nueva");

let admin: string;
/** El que escribe las recetas: un Coffee Process Manager de plataforma (V16). */
let gestor: string;
let organizationId: string;
let lotId: string;
const organizaciones: string[] = [];
const lotes: string[] = [];
/** Cada receta que creó una prueba: el control de que la corrida sí creó cosas antes de afirmar que no queda nada. */
const creadas: string[] = [];

const nombre = (n: string) => `NUEVA ${n} ${RUN} ${randomUUID()}`;

async function crear(name: string, organizacion: string | null = organizationId, autor = gestor, description?: string | null) {
  const r = await crearRecetaEnBorrador(autor, { name, description, organizationId: organizacion });
  creadas.push(r.recipeId);
  return r;
}

/**
 * Borra todo lo de las recetas que cumplan `donde`, en orden de claves ajenas. Devuelve los ids, para contar después. Quien llama busca
 * también por ORGANIZACIÓN, no sólo por el nombre del RUN: una regresión que dejara pasar un nombre en blanco crearía una receta que el
 * nombre no encuentra y cuya organización (FK RESTRICT) ya no se podría borrar.
 */
async function borrarRecetas(donde: Prisma.ProcessRecipeWhereInput) {
  const recetaIds = (await prisma.processRecipe.findMany({ where: assertDefinedWhere(donde), select: { id: true } })).map((r) => r.id);
  const versionIds = (
    await prisma.processRecipeVersion.findMany({ where: assertDefinedWhere({ recipeId: { in: recetaIds } }), select: { id: true } })
  ).map((v) => v.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...recetaIds, ...versionIds] } }) });
  await prisma.processRecipeVersion.deleteMany({ where: assertDefinedWhere({ id: { in: versionIds } }) });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: { in: recetaIds } }) });
  return { recetaIds, versionIds };
}

async function rechaza(promesa: Promise<unknown>, codigo: string) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `esperaba RecipeError("${codigo}") y no lanzó nada`).not.toBeNull();
  expect(error, `esperaba RecipeError("${codigo}"), lanzó ${String(error)}`).toBeInstanceOf(RecipeError);
  expect((error as Error).message).toBe(codigo);
}

beforeAll(async () => {
  admin = (
    await prisma.assignment.findFirstOrThrow({
      where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
      select: { userAccountId: true },
    })
  ).userAccountId;
  gestor = await cuentas.cuenta("Coffee Process Manager", "plataforma");
  const org = await prisma.organization.create({ data: { name: `NUEVA Org ${RUN}`, organizationType: "farm" } });
  organizationId = org.id;
  organizaciones.push(org.id);
  const lot = await prisma.lot.create({
    data: { lotCode: `NUEVA-${RUN}`, lotType: "cherry", organizationId, classification: "internal" },
  });
  lotId = lot.id;
  lotes.push(lot.id);
});

afterAll(async () => {
  const ids = await borrarRecetas({ OR: [{ name: { contains: RUN } }, { organizationId: { in: organizaciones } }] });
  // Las cuentas, DESPUÉS de las recetas que firmaron.
  await cuentas.limpiar();
  if (lotes.length) await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  if (organizaciones.length) {
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) });
  }
  // Lo que quede es basura de ESTA corrida. El control: la corrida sí creó recetas; si no, los ceros de abajo no miran nada.
  expect(creadas.length).toBeGreaterThan(0);
  expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } })).toBe(0);
  expect(await prisma.processRecipeVersion.count({ where: { id: { in: ids.versionIds } } })).toBe(0);
  expect(await prisma.auditEvent.count({ where: { entityId: { in: [...ids.recetaIds, ...ids.versionIds] } } })).toBe(0);
});

describe("crearRecetaEnBorrador", () => {
  afterEach(async () => {
    await borrarRecetas({ OR: [{ name: { contains: RUN } }, { organizationId: { in: organizaciones } }] });
  });

  it("crea la receta de la organización con su versión 1 en borrador, sin pasos ni metas, y el selector no la ofrece", async () => {
    const n = nombre("completa");
    const { recipeId, versionId } = await crear(`  ${n}  `, organizationId, gestor, "  una descripción  ");
    const receta = await prisma.processRecipe.findUniqueOrThrow({ where: { id: recipeId } });
    expect(receta).toMatchObject({ name: n, description: "una descripción", organizationId, esLibre: false, createdBy: gestor });
    const versiones = await prisma.processRecipeVersion.findMany({ where: { recipeId } });
    expect(versiones.map((v) => [v.id, v.version, v.status])).toEqual([[versionId, 1, "draft"]]);
    expect(await prisma.processRecipeStep.count({ where: { recipeVersionId: versionId } })).toBe(0);
    expect(await prisma.processTarget.count({ where: { recipeVersionId: versionId } })).toBe(0);

    // El selector de abrir un proceso sólo ofrece versiones publicadas: un borrador es alguien decidiendo todavía qué dice.
    const ofrecidas = async () => (await listRecipeVersionsForLot(admin, lotId)).map((v) => v.id);
    expect(await ofrecidas()).not.toContain(versionId);
    // Control: la MISMA versión, publicada, sí se ofrece (sin esto, «no se ofrece» podría ser un selector que no ve nada).
    await prisma.processRecipeVersion.update({ where: { id: versionId }, data: { status: "approved" } });
    expect(await ofrecidas()).toContain(versionId);
  });

  it("el nombre es obligatorio y no se repite en la organización; una descripción vacía queda en nulo", async () => {
    await rechaza(crearRecetaEnBorrador(gestor, { name: "   ", organizationId }), "nombre_requerido");
    const n = nombre("repetida");
    const { recipeId } = await crear(n, organizationId, gestor, "   ");
    expect((await prisma.processRecipe.findUniqueOrThrow({ where: { id: recipeId } })).description).toBeNull();
    await rechaza(crearRecetaEnBorrador(gestor, { name: n, organizationId }), "nombre_repetido");
    // Control: otro nombre en la misma organización entra, y el mismo en otra organización también (la unicidad es por organización).
    await crear(nombre("otra"), organizationId);
    const otra = await prisma.organization.create({ data: { name: `NUEVA Otra ${RUN} ${randomUUID()}`, organizationType: "farm" } });
    organizaciones.push(otra.id);
    await crear(n, otra.id);
  });

  it("la autoría no pide ningún lote: el Process Manager de plataforma crea en una organización sin lotes ni ubicaciones", async () => {
    const sinLotes = await prisma.organization.create({ data: { name: `NUEVA SinLotes ${RUN} ${randomUUID()}`, organizationType: "farm" } });
    organizaciones.push(sinLotes.id);
    expect(await prisma.lot.count({ where: { organizationId: sinLotes.id } }), "control: la organización no tiene lotes").toBe(0);
    const { recipeId } = await crear(nombre("sin lotes"), sinLotes.id);
    expect((await prisma.processRecipe.findUniqueOrThrow({ where: { id: recipeId } })).organizationId).toBe(sinLotes.id);
  });

  it("audita la creación con la receta y la versión que nacieron", async () => {
    const { recipeId, versionId } = await crear(nombre("auditada"));
    const evento = await prisma.auditEvent.findFirst({ where: { entityId: recipeId, operation: "process_recipe.create" } });
    expect(evento, "no hay fila de auditoría de la creación").not.toBeNull();
    expect(evento).toMatchObject({ actorUserAccountId: gestor, entityType: "process_recipe", sourceInterface: "recetas.versiones" });
    expect((evento!.after as { versionId?: string } | null)?.versionId).toBe(versionId);
  });
});

describe("crearRecetaEnBorrador — la autoría es del Coffee Process Manager (V16), no de quien tiene edit_beneficio", () => {
  const cuentasDeFinca = fabricaDeCuentas("NuevaFinca");
  const lugares: string[] = [];
  const orgsDeFinca: string[] = [];

  afterEach(async () => {
    // En orden de claves ajenas: las recetas (y su auditoría) antes que las cuentas que las firmaron; asignaciones antes que sus
    // ámbitos (la fábrica los borra en ese orden); la finca antes que su organización.
    await borrarRecetas({ OR: [{ name: { contains: RUN } }, { organizationId: { in: [...organizaciones, ...orgsDeFinca] } }] });
    await cuentasDeFinca.limpiar();
    if (lugares.length) await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: lugares } }) });
    if (orgsDeFinca.length) await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgsDeFinca } }) });
    for (const lista of [lugares, orgsDeFinca]) lista.length = 0;
  });

  /** Una organización con su finca: quien está asignado en la finca está dentro de la organización. No hace falta ningún lote. */
  async function finca() {
    const org = await prisma.organization.create({ data: { name: `NUEVA Finca ${RUN} ${randomUUID()}`, organizationType: "farm" } });
    orgsDeFinca.push(org.id);
    const lugar = await prisma.location.create({
      data: { name: `TEST-NUEVA-${randomUUID()}`, locationType: "site", classification: "internal", organizationId: org.id },
    });
    lugares.push(lugar.id);
    return { org, lugar };
  }

  it("un Farm Manager NO crea una receta de su organización —edit_beneficio no basta—, ni un capataz; el Process Manager de la finca sí", async () => {
    const { org, lugar } = await finca();
    const jefe = await cuentasDeFinca.cuenta("Farm Manager", { locationId: lugar.id });
    const capataz = await cuentasDeFinca.cuenta("Farm Operator", { locationId: lugar.id });
    const gestorDeFinca = await cuentasDeFinca.cuenta("Coffee Process Manager", { locationId: lugar.id });
    // Control: el jefe SÍ pasa la guardia de ayer (`edit_beneficio` en la organización), así que su rechazo de abajo es de la regla nueva y no el
    // de una cuenta sin acceso a nada.
    await expect(exigeEditarBeneficioEnOrganizacion(jefe, org.id)).resolves.toBeUndefined();
    const rechazada = nombre("rechazada");
    await rechaza(crearRecetaEnBorrador(jefe, { name: rechazada, organizationId: org.id }), "sin_permiso_de_autoria");
    await rechaza(crearRecetaEnBorrador(capataz, { name: rechazada, organizationId: org.id }), "sin_permiso_de_autoria");
    expect(await prisma.processRecipe.count({ where: { name: rechazada } }), "un rechazo no deja nada").toBe(0);
    const { recipeId } = await crear(nombre("del gestor"), org.id, gestorDeFinca);
    expect((await prisma.processRecipe.findUniqueOrThrow({ where: { id: recipeId } })).createdBy).toBe(gestorDeFinca);
  });

  it("una plantilla (sin organización) sólo se crea con alcance de plataforma: ni el Farm Manager ni el Process Manager de una finca", async () => {
    const { lugar } = await finca();
    const jefe = await cuentasDeFinca.cuenta("Farm Manager", { locationId: lugar.id });
    const gestorDeFinca = await cuentasDeFinca.cuenta("Coffee Process Manager", { locationId: lugar.id });
    for (const quien of [jefe, gestorDeFinca]) {
      await rechaza(crearRecetaEnBorrador(quien, { name: nombre("plantilla ajena"), organizationId: null }), "sin_permiso_de_autoria");
    }
    // Control: con alcance de plataforma, sí, y nace sin organización.
    const { recipeId } = await crear(nombre("plantilla"), null, gestor);
    expect((await prisma.processRecipe.findUniqueOrThrow({ where: { id: recipeId } })).organizationId).toBeNull();
  });
});

describe("catalogosDelEditor", () => {
  afterEach(async () => {
    await prisma.variableCatalogValue.deleteMany({ where: assertDefinedWhere({ value: { contains: RUN } }) });
  });

  it("trae los diez vocabularios con valores, cada uno de SU catálogo, y los tipos en el orden de TIPOS_DE_PASO", async () => {
    const c = await catalogosDelEditor();
    const familias = Object.keys(CATALOGOS_DEL_EDITOR) as (keyof typeof CATALOGOS_DEL_EDITOR)[];
    expect(familias, "control: son diez").toHaveLength(10);
    for (const familia of familias) {
      expect(c[familia].length, `«${familia}» vacío: ¿está sembrado el catálogo «${CATALOGOS_DEL_EDITOR[familia]}»?`).toBeGreaterThan(0);
    }
    expect(c.tipos.map((v) => v.value)).toEqual([...TIPOS_DE_PASO]);
    expect(c.tipos.every((v) => typeof v.definition === "string" && v.definition.length > 0), "cada tipo trae su definición").toBe(true);

    const filas = await prisma.variableCatalogValue.findMany({
      where: { id: { in: familias.flatMap((f) => c[f].map((v) => v.id)) } },
      select: { id: true, catalog: { select: { key: true } } },
    });
    const catalogoDe = new Map(filas.map((f) => [f.id, f.catalog.key]));
    for (const familia of familias) {
      for (const v of c[familia]) expect(catalogoDe.get(v.id), `${familia}/${v.value}`).toBe(CATALOGOS_DEL_EDITOR[familia]);
    }
  });

  it("no ofrece un alias: sólo el valor canónico", async () => {
    const catalogo = await prisma.variableCatalog.findUniqueOrThrow({ where: { key: "capacidad" }, select: { id: true } });
    const canonico = await prisma.variableCatalogValue.findFirstOrThrow({
      where: { catalogId: catalogo.id, aliasOfId: null },
      orderBy: { displayOrder: "asc" },
      select: { id: true, value: true },
    });
    const alias = `TEST alias ${RUN}`;
    await prisma.variableCatalogValue.create({ data: { catalogId: catalogo.id, value: alias, aliasOfId: canonico.id } });
    const valores = (await catalogosDelEditor()).capacidad.map((v) => v.value);
    expect(valores).not.toContain(alias);
    // Control: el canónico al que apunta sí sale (sin esto, «no sale» podría ser una lista que no trae nada).
    expect(valores).toContain(canonico.value);
  });
});
