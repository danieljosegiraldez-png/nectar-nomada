/**
 * La autoría de recetas es del Coffee Process Manager — Parte 2a, tarea 3 (2026-10-04), decisión de Daniel V16.
 *
 * `exigeAutoriaDeReceta` (`lib/recetas/autoria.ts`) es la ÚNICA regla de quién escribe una receta, y calca el camino de
 * `exigeEditarBeneficioEnOrganizacion` con el permiso nuevo. Cada rechazo lleva al lado el caso válido que pasa, para que no
 * pase vacío; y el control que importa más está en la primera prueba: el Farm Manager SÍ pasa la guardia de ayer
 * (`edit_beneficio`), así que su rechazo de hoy es de la regla nueva y no de una cuenta sin acceso a nada.
 *
 * **Lo que cubre RBAC.md §9 para el perfil nuevo:** un caso positivo dentro de su ámbito, uno negativo fuera de él (otra finca,
 * una plantilla) y uno negativo contra una clasificación que no limpia (`confidential`).
 *
 * **Sin lotes.** La regla no necesita ninguno: una organización sin lotes se autoriza igual. Las tres puertas de
 * `processTargets.ts` pedían además `lot:manage` sobre un lote de la organización (y daban `organization_has_no_lots` si no había
 * ninguno); con V16 esa autoridad es otro perfil, y la última prueba lo fija.
 *
 * Cuentas: el Platform Admin sembrado y las que crea `fabricaDeCuentas`. Cada `it` crea su organización y sus ubicaciones y el
 * `afterEach` las borra, junto con las recetas de la corrida (por el prefijo `RUN`) y su auditoría. Base: la propia de la 2a,
 * **resembrada** (`npm run db:seed`) después de añadir el permiso al catálogo. Grupo `base-sembrada`.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { exigeAutoriaDeReceta, puedeAutoriaDeReceta } from "../../lib/recetas/autoria";
import { RecipeError } from "../../lib/recetas/errorDeReceta";
import { exigeEditarBeneficioEnOrganizacion } from "../../lib/traceability/locations";
import { crearRecetaEnBorrador } from "../../lib/recetas/versiones";
import { updateRecipeMetadata } from "../../lib/traceability/processTargets";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { fabricaDeCuentas } from "../helpers/cuentasDeAutoria";

const RUN = `autoria-${Date.now()}`;
const cuentas = fabricaDeCuentas("Autoria");

let admin: string;
const organizaciones: string[] = [];
/** En orden de creación (el padre antes que el hijo): se borran al revés. */
const ubicaciones: string[] = [];

const nombreDeReceta = () => `AUTORIA ${randomUUID().slice(0, 8)} ${RUN}`;

/** Rechaza con un `RecipeError` de ESE código: la clase y el mensaje, no sólo el mensaje. */
async function rechaza(promesa: Promise<unknown>, codigo = "sin_permiso_de_autoria") {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `esperaba RecipeError("${codigo}") y no lanzó nada`).not.toBeNull();
  expect(error, `esperaba RecipeError("${codigo}"), lanzó ${String(error)}`).toBeInstanceOf(RecipeError);
  expect((error as Error).message).toBe(codigo);
}

async function organizacion(): Promise<string> {
  const org = await prisma.organization.create({ data: { name: `AUTORIA Org ${randomUUID()} ${RUN}`, organizationType: "farm" } });
  organizaciones.push(org.id);
  return org.id;
}

async function ubicacion(organizationId: string | null, clasificacion: "internal" | "confidential", parentLocationId?: string) {
  const l = await prisma.location.create({
    data: {
      name: `AUTORIA Lugar ${randomUUID()} ${RUN}`,
      locationType: parentLocationId ? "plot" : "site",
      classification: clasificacion,
      organizationId,
      parentLocationId: parentLocationId ?? null,
    },
  });
  ubicaciones.push(l.id);
  return l;
}

/** Una organización con su finca (`internal`) — lo más habitual. */
async function organizacionConFinca() {
  const orgId = await organizacion();
  return { orgId, finca: await ubicacion(orgId, "internal") };
}

beforeAll(async () => {
  admin = (
    await prisma.assignment.findFirstOrThrow({
      where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
      select: { userAccountId: true },
    })
  ).userAccountId;
});

afterEach(async () => {
  // En orden de claves ajenas: las recetas (y su auditoría: la de una versión cuelga del id de la VERSIÓN) antes que las cuentas
  // que las firmaron; las ubicaciones, del hijo al padre, antes que sus organizaciones.
  const recetas = await prisma.processRecipe.findMany({ where: assertDefinedWhere({ name: { contains: RUN } }), select: { id: true } });
  const versiones = await prisma.processRecipeVersion.findMany({
    where: assertDefinedWhere({ recipeId: { in: recetas.map((r) => r.id) } }),
    select: { id: true },
  });
  await prisma.auditEvent.deleteMany({
    where: assertDefinedWhere({ entityId: { in: [...recetas.map((r) => r.id), ...versiones.map((v) => v.id)] } }),
  });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: { in: recetas.map((r) => r.id) } }) });
  await cuentas.limpiar();
  for (const id of [...ubicaciones].reverse()) await prisma.location.delete({ where: { id } });
  if (organizaciones.length) await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) });
  ubicaciones.length = 0;
  organizaciones.length = 0;
  expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } })).toBe(0);
});

describe("exigeAutoriaDeReceta: quién escribe las recetas de una organización", () => {
  it("el Coffee Process Manager de la finca pasa; el Farm Manager NO, aunque lleve edit_beneficio y lot:manage; ni el Farm Operator", async () => {
    const { orgId, finca } = await organizacionConFinca();
    const gestor = await cuentas.cuenta("Coffee Process Manager", { locationId: finca.id });
    const jefe = await cuentas.cuenta("Farm Manager", { locationId: finca.id });
    const capataz = await cuentas.cuenta("Farm Operator", { locationId: finca.id });
    // Control: el Farm Manager SÍ configura el beneficio —el permiso de ayer—, así que lo de abajo es la regla de hoy.
    await expect(exigeEditarBeneficioEnOrganizacion(jefe, orgId)).resolves.toBeUndefined();
    await expect(exigeAutoriaDeReceta(gestor, orgId)).resolves.toBeUndefined();
    await expect(exigeAutoriaDeReceta(admin, orgId)).resolves.toBeUndefined();
    await rechaza(exigeAutoriaDeReceta(jefe, orgId));
    await rechaza(exigeAutoriaDeReceta(capataz, orgId));
  });

  it("la concesión por persona abre el permiso a quien no lo lleva; quitárselo a un Process Manager lo cierra", async () => {
    const { orgId, finca } = await organizacionConFinca();
    const capataz = await cuentas.cuenta("Farm Operator", { locationId: finca.id });
    const gestor = await cuentas.cuenta("Coffee Process Manager", { locationId: finca.id });
    await rechaza(exigeAutoriaDeReceta(capataz, orgId));
    await cuentas.conceder(capataz, "lot", "approve_exception");
    await expect(exigeAutoriaDeReceta(capataz, orgId)).resolves.toBeUndefined();
    // Y el `deny` gana sobre el perfil.
    await expect(exigeAutoriaDeReceta(gestor, orgId)).resolves.toBeUndefined();
    await cuentas.quitar(gestor, "lot", "approve_exception");
    await rechaza(exigeAutoriaDeReceta(gestor, orgId));
  });

  it("fuera de su ámbito no: el Process Manager de la finca A no escribe en la organización B", async () => {
    const a = await organizacionConFinca();
    const b = await organizacionConFinca();
    const gestorDeA = await cuentas.cuenta("Coffee Process Manager", { locationId: a.finca.id });
    await expect(exigeAutoriaDeReceta(gestorDeA, a.orgId)).resolves.toBeUndefined();
    await rechaza(exigeAutoriaDeReceta(gestorDeA, b.orgId));
  });

  it("contra una clasificación que no limpia no: sobre una ubicación `confidential` no pasa; sobre una `internal`, sí", async () => {
    const orgConfidencial = await organizacion();
    const secreta = await ubicacion(orgConfidencial, "confidential");
    const gestorSecreto = await cuentas.cuenta("Coffee Process Manager", { locationId: secreta.id });
    await rechaza(exigeAutoriaDeReceta(gestorSecreto, orgConfidencial));
    // Control: la misma comprobación, con una ubicación `internal`.
    const normal = await organizacionConFinca();
    const gestorNormal = await cuentas.cuenta("Coffee Process Manager", { locationId: normal.finca.id });
    await expect(exigeAutoriaDeReceta(gestorNormal, normal.orgId)).resolves.toBeUndefined();
  });

  it("una parcela que hereda la organización (organizationId nulo) cuenta: el Process Manager asignado en ella pasa", async () => {
    const { orgId, finca } = await organizacionConFinca();
    const parcela = await ubicacion(null, "internal", finca.id);
    const gestorDeLaParcela = await cuentas.cuenta("Coffee Process Manager", { locationId: parcela.id });
    await expect(exigeAutoriaDeReceta(gestorDeLaParcela, orgId)).resolves.toBeUndefined();
  });

  it("una organización sin ninguna ubicación: sólo el alcance de plataforma pasa", async () => {
    const orgVacia = await organizacion();
    const otra = await organizacionConFinca();
    const gestorDeOtra = await cuentas.cuenta("Coffee Process Manager", { locationId: otra.finca.id });
    const gestorDePlataforma = await cuentas.cuenta("Coffee Process Manager", "plataforma");
    await rechaza(exigeAutoriaDeReceta(gestorDeOtra, orgVacia));
    await expect(exigeAutoriaDeReceta(gestorDePlataforma, orgVacia)).resolves.toBeUndefined();
  });
});

describe("una plantilla (sin organización) sólo se escribe con alcance de plataforma", () => {
  it("el Process Manager de plataforma y el Platform Admin pasan; el de finca y el Farm Manager no", async () => {
    const { finca } = await organizacionConFinca();
    const gestorDePlataforma = await cuentas.cuenta("Coffee Process Manager", "plataforma");
    const gestorDeFinca = await cuentas.cuenta("Coffee Process Manager", { locationId: finca.id });
    const jefe = await cuentas.cuenta("Farm Manager", { locationId: finca.id });
    await expect(exigeAutoriaDeReceta(gestorDePlataforma, null)).resolves.toBeUndefined();
    await expect(exigeAutoriaDeReceta(admin, null)).resolves.toBeUndefined();
    await rechaza(exigeAutoriaDeReceta(gestorDeFinca, null));
    await rechaza(exigeAutoriaDeReceta(jefe, null));
  });
});

describe("puedeAutoriaDeReceta: la gemela que pregunta", () => {
  it("dice sí y no con la misma regla, y sólo se traga la negativa del permiso", async () => {
    const { orgId, finca } = await organizacionConFinca();
    const gestor = await cuentas.cuenta("Coffee Process Manager", { locationId: finca.id });
    const jefe = await cuentas.cuenta("Farm Manager", { locationId: finca.id });
    expect(await puedeAutoriaDeReceta(gestor, orgId)).toBe(true);
    expect(await puedeAutoriaDeReceta(jefe, orgId)).toBe(false);
    // Una sola fuente (Ruling C4: la tarea 14 la usa para abrir las tres lecturas de las pantallas): la gemela contesta lo mismo que la
    // regla que exige, también para una plantilla (organización nula, sólo con alcance de plataforma) y para el Platform Admin.
    const gestorDePlataforma = await cuentas.cuenta("Coffee Process Manager", "plataforma");
    expect(await puedeAutoriaDeReceta(gestorDePlataforma, null)).toBe(true);
    expect(await puedeAutoriaDeReceta(gestor, null), "el Process Manager de una finca no escribe plantillas").toBe(false);
    expect(await puedeAutoriaDeReceta(admin, orgId)).toBe(true);
    // Un id que no es de ninguna organización no es «no puede»: es un id malo, y se relanza.
    await expect(puedeAutoriaDeReceta(gestor, "esto-no-es-un-uuid")).rejects.toThrow();
  });
});

describe("la puerta de processTargets.ts que queda, updateRecipeMetadata, pasa por la regla", () => {
  it("updateRecipeMetadata: el Farm Manager no; el Process Manager sí", async () => {
    const { orgId, finca } = await organizacionConFinca();
    const gestor = await cuentas.cuenta("Coffee Process Manager", { locationId: finca.id });
    const jefe = await cuentas.cuenta("Farm Manager", { locationId: finca.id });
    const nombre = nombreDeReceta();
    const creada = await crearRecetaEnBorrador(gestor, { name: nombre, organizationId: orgId });
    await rechaza(updateRecipeMetadata(jefe, creada.recipeId, { name: nombre, description: "cambio del jefe" }));
    await expect(updateRecipeMetadata(gestor, creada.recipeId, { name: nombre, description: "cambio del gestor" })).resolves.toBeDefined();
    // El rechazo no tocó nada: la descripción es la del gestor, y la del jefe no entró.
    expect((await prisma.processRecipe.findUniqueOrThrow({ where: { id: creada.recipeId } })).description).toBe("cambio del gestor");
  });

  // Lo que protegía `recipeVersions.test.ts` (ADR-102) antes de que la Parte E la borrara con el servicio que la usaba: un nombre es una etiqueta y se
  // edita; lo que una corrida persiguió, no. Y el cambio deja su huella con las dos caras, para que se pueda ver qué decía antes.
  it("renombrar cambia la etiqueta y no toca ninguna versión ni sus metas, y se audita con el nombre de antes y el de después", async () => {
    const { orgId, finca } = await organizacionConFinca();
    const gestor = await cuentas.cuenta("Coffee Process Manager", { locationId: finca.id });
    const antes = nombreDeReceta();
    const despues = nombreDeReceta();
    const { recipeId, versionId } = await crearRecetaEnBorrador(gestor, { name: antes, organizationId: orgId });
    // Una versión publicada con una meta, como la que una corrida ya persigue: lo que un renombre no puede reescribir.
    await prisma.processTarget.create({
      data: { recipeVersionId: versionId, variable: "ph", moment: "final", phase: "fermentation", unit: "pH", targetValue: 3.8 },
    });
    await prisma.processRecipeVersion.update({ where: { id: versionId }, data: { status: "approved" } });
    const versiones = async () =>
      JSON.stringify(await prisma.processRecipeVersion.findMany({ where: { recipeId }, include: { targets: true }, orderBy: { version: "asc" } }));
    const versionesAntes = await versiones();
    expect(versionesAntes, "control: la versión trae su meta y está publicada").toContain('"status":"approved"');
    expect(versionesAntes).toContain('"variable":"ph"');

    await updateRecipeMetadata(gestor, recipeId, { name: despues, description: "corregido" });

    expect((await prisma.processRecipe.findUniqueOrThrow({ where: { id: recipeId } })).name, "control: el nombre sí cambió").toBe(despues);
    expect(await versiones(), "renombrar no toca la versión ni su meta").toBe(versionesAntes);
    const evento = await prisma.auditEvent.findFirst({
      where: { entityId: recipeId, operation: "process_recipe.update" },
      orderBy: { occurredAt: "desc" },
    });
    expect(evento, "no hay fila de auditoría del renombre").not.toBeNull();
    expect((evento!.before as { name?: string } | null)?.name, "la auditoría no guarda el nombre de antes").toBe(antes);
    expect((evento!.after as { name?: string } | null)?.name, "la auditoría no guarda el nombre de después").toBe(despues);
  });
});
