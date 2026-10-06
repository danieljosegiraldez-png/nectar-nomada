/**
 * Versiones y plantillas de una receta con pasos — Parte 2a, tarea 4 (diseño §3.3 «copia», §3.1 y §3.4).
 *
 * El guardián del §8 («§3.3 copia»): una v1 con las cuatro colecciones NO vacías —pasos, adiciones, fines y metas, y
 * además requisitos— da una v2 con ids nuevos donde **cada `recipeStepId` de sus metas apunta a un paso de la v2**, y al
 * del MISMO orden. Su control: una v1 de antes de la 2a, sin pasos, sigue dando una v2 con sus fases (R8).
 *
 * **La v1 se escribe con `prisma` directo**, no con el servicio de pasos de la tarea 3: lo que se mide es la copia, y un
 * fixture que pasara por la validación de los pasos caería por otra cosa el día que esa validación cambie. Se crea en
 * borrador y se publica después, como haría la pantalla.
 *
 * **Las recetas viven lo que dura su `it`.** Una plantilla (sin organización) es visible para TODAS las organizaciones
 * mientras existe —el selector de recetas y el control de parecido de la Libre (tarea 10) la verían desde otros archivos
 * que corren a la vez—, así que cada `it` crea las suyas y el `afterEach` las borra.
 *
 * Cuentas (V16, 2026-10-04: escribir una receta es del Coffee Process Manager): el Platform Admin sembrado (como
 * `recipeVersions.test.ts`; aquí no se cuenta nada global) y las que crea `fabricaDeCuentas` —un Coffee Process Manager de la finca
 * de la organización propia del archivo (`gestor`), otro de plataforma (`gestorDePlataforma`, el de las plantillas), un Farm Manager
 * (`jefe`: lleva `edit_beneficio` y NO escribe recetas) y un Farm Operator (`capataz`)—. La regla no pide ningún lote, así que el
 * archivo no crea ninguno.
 *
 * Base: la propia de la 2a (`nectar_test_recetas_2a`). Grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { derivarReceta, nuevaVersionBorrador } from "../../lib/recetas/versiones";
import { RecipeError } from "../../lib/recetas/errorDeReceta";
import { createRecipeVersion } from "../../lib/traceability/processTargets";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { fabricaDeCuentas } from "../helpers/cuentasDeAutoria";

const RUN = `versiones-${Date.now()}`;
const cuentas = fabricaDeCuentas("Versiones");

let admin: string;
let orgId: string;
/** Coffee Process Manager de la finca de la organización del archivo: quien escribe sus recetas. */
let gestor: string;
/** Coffee Process Manager de plataforma: el único que escribe plantillas. */
let gestorDePlataforma: string;
/** Farm Manager de la finca: lleva `edit_beneficio` y `lot:manage` de serie, y NO escribe recetas (V16). */
let jefe: string;
let capataz: string;
const fijo = { locationIds: [] as string[] };
const tipo = { prefermentacion: "", fermentation: "", drying: "" };
let sustrato: string;
let capacidad: string;

async function valor(catalogo: string, value?: string): Promise<string> {
  const fila = await prisma.variableCatalogValue.findFirstOrThrow({
    where: value === undefined ? { catalog: { key: catalogo } } : { value, catalog: { key: catalogo } },
    orderBy: { displayOrder: "asc" },
    select: { id: true },
  });
  return fila.id;
}

/**
 * Una receta con su v1 PUBLICADA (o en borrador, si se pide). Siempre: una meta de versión (humedad final) y la fase de
 * secado. `esLibre` la marca como una receta Libre (§5.2). Con `conPasos`, además las cuatro colecciones: tres pasos, una adición, un fin, un requisito, dos metas de paso
 * con la MISMA variable y el MISMO momento en pasos distintos (§3.2), y la fase de fermentación que publicar habría
 * derivado (§3.1).
 */
async function receta(o: { organizationId: string | null; conPasos: boolean; status?: "approved" | "draft"; esLibre?: boolean }) {
  const r = await prisma.processRecipe.create({
    data: { name: `TEST VERS ${randomUUID().slice(0, 8)} ${RUN}`, organizationId: o.organizationId, status: "approved", esLibre: o.esLibre ?? false },
  });
  const v = await prisma.processRecipeVersion.create({
    data: { recipeId: r.id, version: 1, status: "draft", expectedHours: 300 },
  });
  await prisma.processTarget.create({
    data: { recipeVersionId: v.id, variable: "moisture", moment: "final", phase: "drying", unit: "%", minValue: 10, maxValue: 12, displayOrder: 0 },
  });
  await prisma.processRecipePhase.create({
    data: { recipeVersionId: v.id, phase: "drying", expectedHours: 240, turnEveryHours: 2, targetMoistureMinPct: 10, targetMoistureMaxPct: 12 },
  });
  if (o.conPasos) {
    const pre = await prisma.processRecipeStep.create({
      data: { recipeVersionId: v.id, seq: 1, stepTypeValueId: tipo.prefermentacion, intencion: "TEST fiebre en sacos", horasMin: 12, horasSugeridas: 24, horasMax: 36 },
    });
    const fer = await prisma.processRecipeStep.create({
      data: { recipeVersionId: v.id, seq: 2, stepTypeValueId: tipo.fermentation, intencion: "TEST fermentación en tanque", temperaturaMinC: 18, temperaturaMaxC: 22, finPorTiempo: true, reglaDeFin: "all" },
    });
    await prisma.processRecipeStep.create({
      data: { recipeVersionId: v.id, seq: 3, stepTypeValueId: tipo.drying, intencion: "TEST secado en cama", opcional: true, modoSecado: "african_bed_outdoor", volteoCadaHoras: 2, humedadMinPct: 10, humedadMaxPct: 12 },
    });
    await prisma.processRecipeStepAddition.create({ data: { stepId: fer.id, categoriaValueId: sustrato, cantidad: 2.5, unidad: "L", momento: "pre_green" } });
    await prisma.processRecipeStepEnd.create({ data: { stepId: fer.id, variable: "ph", operador: "lte", valor: 4.2, unidad: "pH" } });
    await prisma.processRecipeStepRequirement.create({ data: { stepId: fer.id, capacidadValueId: capacidad } });
    await prisma.processTarget.create({
      data: { recipeVersionId: v.id, recipeStepId: pre.id, variable: "ph", moment: "initial", phase: "fermentation", unit: "pH", targetValue: 5.2, displayOrder: 1 },
    });
    await prisma.processTarget.create({
      data: { recipeVersionId: v.id, recipeStepId: fer.id, variable: "ph", moment: "initial", phase: "fermentation", unit: "pH", targetValue: 4.9, displayOrder: 2 },
    });
    await prisma.processRecipePhase.create({ data: { recipeVersionId: v.id, phase: "fermentation", expectedHours: 24 } });
  }
  if ((o.status ?? "approved") === "approved") {
    await prisma.processRecipeVersion.update({ where: { id: v.id }, data: { status: "approved" } });
  }
  return { recipeId: r.id, versionId: v.id };
}

/** Lo que cuelga de una versión, leído por las claves escalares (los nombres de relación los elige la tarea 1). */
async function contenido(versionId: string) {
  const pasos = await prisma.processRecipeStep.findMany({ where: { recipeVersionId: versionId }, orderBy: { seq: "asc" } });
  const ids = pasos.map((p) => p.id);
  const adiciones = await prisma.processRecipeStepAddition.findMany({ where: { stepId: { in: ids } } });
  const fines = await prisma.processRecipeStepEnd.findMany({ where: { stepId: { in: ids } } });
  const requisitos = await prisma.processRecipeStepRequirement.findMany({ where: { stepId: { in: ids } } });
  const metas = await prisma.processTarget.findMany({ where: { recipeVersionId: versionId }, orderBy: { displayOrder: "asc" } });
  const fases = await prisma.processRecipePhase.findMany({ where: { recipeVersionId: versionId }, orderBy: { phase: "asc" } });
  return { pasos, adiciones, fines, requisitos, metas, fases, seqDe: new Map(pasos.map((p) => [p.id, p.seq])) };
}
type Contenido = Awaited<ReturnType<typeof contenido>>;

const n = (d: { toString(): string } | null) => (d === null ? null : d.toString());
/** Cada paso por su orden y sus ejes: lo que la copia tiene que conservar. Los ids NO, a propósito. */
const forma = (c: Contenido) =>
  c.pasos.map((p) => [
    p.seq, p.stepTypeValueId, p.intencion, p.opcional, p.horasMin, p.horasSugeridas, p.horasMax,
    n(p.temperaturaMinC), n(p.temperaturaMaxC), p.modoSecado, p.volteoCadaHoras, n(p.humedadMinPct), n(p.humedadMaxPct),
    p.finPorTiempo, p.reglaDeFin,
  ]);
/**
 * Lo que cuelga de un paso, nombrado por el `seq` de SU paso en ESTA versión. Un `stepId` que no sea de esta versión sale
 * `null` en vez del número, y la comparación con el origen cae.
 */
const colgantes = (c: Contenido) => ({
  adiciones: c.adiciones.map((a) => JSON.stringify([c.seqDe.get(a.stepId), a.categoriaValueId, n(a.cantidad), a.unidad, a.momento])).sort(),
  fines: c.fines.map((f) => JSON.stringify([c.seqDe.get(f.stepId), f.variable, f.operador, n(f.valor), f.unidad])).sort(),
  requisitos: c.requisitos.map((r) => JSON.stringify([c.seqDe.get(r.stepId), r.capacidadValueId])).sort(),
  metasDePaso: c.metas
    .filter((m) => m.recipeStepId !== null)
    .map((m) => JSON.stringify([c.seqDe.get(m.recipeStepId!), m.variable, m.moment, m.phase, n(m.targetValue)]))
    .sort(),
  metasDeVersion: c.metas
    .filter((m) => m.recipeStepId === null)
    .map((m) => JSON.stringify([m.variable, m.moment, m.phase, n(m.minValue), n(m.maxValue)]))
    .sort(),
});

/** Todo lo que esta corrida escribió en recetas, por el prefijo de RUN: un rechazo que deje de rechazar no anota ids. */
async function borrarRecetasDeLaCorrida() {
  const recetas = await prisma.processRecipe.findMany({
    where: assertDefinedWhere({ name: { contains: RUN } }),
    select: { id: true, derivadaDeVersionId: true },
  });
  if (recetas.length === 0) return;
  const recipeIds = recetas.map((r) => r.id);
  const versionIds = (
    await prisma.processRecipeVersion.findMany({ where: assertDefinedWhere({ recipeId: { in: recipeIds } }), select: { id: true } })
  ).map((v) => v.id);
  const pasoIds = (
    await prisma.processRecipeStep.findMany({ where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }), select: { id: true } })
  ).map((p) => p.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...recipeIds, ...versionIds] } }) });
  // En orden de FK: las metas primero (la de paso apunta al paso por la FK compuesta), lo que cuelga del paso, los pasos,
  // las fases.
  await prisma.processTarget.deleteMany({ where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }) });
  await prisma.processRecipeStepRequirement.deleteMany({ where: assertDefinedWhere({ stepId: { in: pasoIds } }) });
  await prisma.processRecipeStepEnd.deleteMany({ where: assertDefinedWhere({ stepId: { in: pasoIds } }) });
  await prisma.processRecipeStepAddition.deleteMany({ where: assertDefinedWhere({ stepId: { in: pasoIds } }) });
  await prisma.processRecipeStep.deleteMany({ where: assertDefinedWhere({ id: { in: pasoIds } }) });
  await prisma.processRecipePhase.deleteMany({ where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }) });
  // Las derivadas antes que las plantillas: `derivada_de_version_id` es RESTRICT hacia la versión de la plantilla.
  const derivadas = recetas.filter((r) => r.derivadaDeVersionId !== null).map((r) => r.id);
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: { in: derivadas } }) });
  // Las demás; sus versiones, ya vacías, caen en cascada.
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ id: { in: recipeIds } }) });
}

beforeAll(async () => {
  admin = (
    await prisma.assignment.findFirstOrThrow({
      where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
      select: { userAccountId: true },
    })
  ).userAccountId;

  const org = await prisma.organization.create({ data: { name: `TEST VERS Org ${RUN}`, organizationType: "farm" } });
  orgId = org.id;
  const finca = await prisma.location.create({
    data: { name: `TEST VERS Finca ${RUN}`, locationType: "site", classification: "internal", organizationId: orgId },
  });
  fijo.locationIds.push(finca.id);
  gestor = await cuentas.cuenta("Coffee Process Manager", { locationId: finca.id });
  gestorDePlataforma = await cuentas.cuenta("Coffee Process Manager", "plataforma");
  jefe = await cuentas.cuenta("Farm Manager", { locationId: finca.id });
  capataz = await cuentas.cuenta("Farm Operator", { locationId: finca.id });

  tipo.prefermentacion = await valor("tipo_paso", "prefermentacion");
  tipo.fermentation = await valor("tipo_paso", "fermentation");
  tipo.drying = await valor("tipo_paso", "drying");
  sustrato = await valor("sustrato_anadido", "doble_mosto");
  // El catálogo `capacidad` lo siembra la tarea 2; aquí sirve cualquiera de sus valores.
  capacidad = await valor("capacidad");
});

afterEach(borrarRecetasDeLaCorrida);

afterAll(async () => {
  await borrarRecetasDeLaCorrida();
  // Las cuentas, DESPUÉS de las recetas que firmaron.
  await cuentas.limpiar();
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: fijo.locationIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });

  expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } })).toBe(0);
  expect(await prisma.organization.count({ where: { name: { contains: RUN } } })).toBe(0);
});

describe("§3.3 copia — la versión nueva nace en borrador y trae todo, remapeado a sus pasos", () => {
  it("una v1 con las cuatro colecciones da una v2 con ids nuevos, y cada meta de paso apunta a un paso de la v2", async () => {
    const v1 = await receta({ organizationId: orgId, conPasos: true });
    const antes = await contenido(v1.versionId);
    // Fila patrón: la v1 tiene de verdad las cuatro colecciones (y requisitos y fases). Sin esto, «la v2 trae lo mismo»
    // pasaría comparando dos vacíos.
    expect([antes.pasos.length, antes.adiciones.length, antes.fines.length, antes.requisitos.length, antes.metas.length, antes.fases.length])
      .toEqual([3, 1, 1, 1, 3, 2]);

    const v2 = await nuevaVersionBorrador(gestor, v1.versionId);

    const fila = await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: v2.id } });
    expect([fila.recipeId, fila.version, fila.status, fila.expectedHours]).toEqual([v1.recipeId, 2, "draft", 300]);
    expect(v2.version).toBe(2);

    const despues = await contenido(v2.id);
    const idsV1 = new Set(antes.pasos.map((p) => p.id));
    expect(despues.pasos.filter((p) => idsV1.has(p.id))).toEqual([]);
    expect(forma(despues)).toEqual(forma(antes));
    expect(colgantes(despues)).toEqual(colgantes(antes));

    // El centro del guardián: cada meta de paso de la v2 apunta a un paso DE LA v2.
    const idsV2 = new Set(despues.pasos.map((p) => p.id));
    const metasDePaso = despues.metas.filter((m) => m.recipeStepId !== null);
    expect(metasDePaso).toHaveLength(2);
    for (const m of metasDePaso) expect(idsV2.has(m.recipeStepId!), `meta ${m.variable}/${m.moment} → ${m.recipeStepId}`).toBe(true);

    // §3.1: con pasos, las fases las deriva `publicarVersion`; la copia no las trae. Control: la v1 conserva las suyas.
    expect(despues.fases).toEqual([]);
    const v1Despues = await contenido(v1.versionId);
    expect(v1Despues.fases).toHaveLength(2);
    expect(v1Despues.pasos.map((p) => p.id)).toEqual(antes.pasos.map((p) => p.id));
    expect(colgantes(v1Despues)).toEqual(colgantes(antes));

    const evento = await prisma.auditEvent.findFirstOrThrow({ where: { entityId: v2.id, operation: "process_recipe_version.create" } });
    expect(evento.reason).toBe("borrador_desde_version_1");
  });

  it("una v1 sin pasos (de antes de la 2a) da una v2 con sus fases y su meta, como hacía R8", async () => {
    const v1 = await receta({ organizationId: orgId, conPasos: false });
    const v2 = await nuevaVersionBorrador(gestor, v1.versionId);
    const d = await contenido(v2.id);
    expect(d.pasos).toEqual([]);
    expect(d.fases.map((f) => [f.phase, f.expectedHours, f.turnEveryHours, n(f.targetMoistureMinPct), n(f.targetMoistureMaxPct)]))
      .toEqual([["drying", 240, 2, "10", "12"]]);
    expect(colgantes(d).metasDeVersion).toHaveLength(1);
    expect(colgantes(d).metasDeVersion).toEqual(colgantes(await contenido(v1.versionId)).metasDeVersion);
  });
});

describe("una receta tiene a lo sumo un borrador", () => {
  it("con un borrador abierto, pedir otro se rechaza", async () => {
    const v1 = await receta({ organizationId: orgId, conPasos: true });
    // Control: el primero sale.
    await expect(nuevaVersionBorrador(gestor, v1.versionId)).resolves.toMatchObject({ version: 2 });
    await expect(nuevaVersionBorrador(gestor, v1.versionId)).rejects.toThrow(new RecipeError("ya_hay_un_borrador"));
    expect(await prisma.processRecipeVersion.count({ where: { recipeId: v1.recipeId } })).toBe(2);
  });

  it("dos peticiones a la vez: sale una, y la otra dice ya_hay_un_borrador (no un P2002)", async () => {
    const v1 = await receta({ organizationId: orgId, conPasos: true });
    const res = await Promise.allSettled([nuevaVersionBorrador(gestor, v1.versionId), nuevaVersionBorrador(gestor, v1.versionId)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rechazos = res.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rechazos).toHaveLength(1);
    expect(rechazos[0]!.reason).toBeInstanceOf(RecipeError);
    expect((rechazos[0]!.reason as Error).message).toBe("ya_hay_un_borrador");
  }, 20000);
});

describe("una receta Libre no se versiona (I14, diseño §5.2–§5.3)", () => {
  it("nuevaVersionBorrador sobre una Libre se rechaza (receta_libre_no_se_versiona) y no deja una versión; sobre una receta común, sale", async () => {
    // Una Libre es lo que ocurrió en un proceso, escrito antes de ejecutarse: no se supersede con una versión, se CONVIERTE en una
    // receta de la organización (§5.3, tarea 11). Una v2 de una Libre sería una receta editable que nadie nombró.
    const libre = await receta({ organizationId: orgId, conPasos: true, esLibre: true });
    await expect(nuevaVersionBorrador(gestor, libre.versionId)).rejects.toThrow(new RecipeError("receta_libre_no_se_versiona"));
    expect(await prisma.processRecipeVersion.count({ where: { recipeId: libre.recipeId } }), "no dejó una versión").toBe(1);
    // Control: la misma receta, sin la marca, sale.
    const comun = await receta({ organizationId: orgId, conPasos: true, esLibre: false });
    await expect(nuevaVersionBorrador(gestor, comun.versionId)).resolves.toMatchObject({ version: 2 });
  });
});

describe("plantillas (§3.4): sólo se versionan con alcance de plataforma; una organización deriva su copia", () => {
  it("ni un Process Manager de finca ni un Farm Manager versionan una plantilla; uno de plataforma sí, y el Platform Admin", async () => {
    const p = await receta({ organizationId: null, conPasos: true });
    await expect(nuevaVersionBorrador(gestor, p.versionId)).rejects.toThrow(new RecipeError("sin_permiso_de_autoria"));
    await expect(nuevaVersionBorrador(jefe, p.versionId)).rejects.toThrow(new RecipeError("sin_permiso_de_autoria"));
    // Control: con alcance de plataforma, sí; el primero crea la v2 y el Platform Admin pide otra sobre la misma plantilla, que ya
    // tiene su borrador (`ya_hay_un_borrador`): la prueba de que la autoría pasó, y que lo que lo para después es otra regla.
    await expect(nuevaVersionBorrador(gestorDePlataforma, p.versionId)).resolves.toMatchObject({ version: 2 });
    await expect(nuevaVersionBorrador(admin, p.versionId)).rejects.toThrow(new RecipeError("ya_hay_un_borrador"));
  });

  it("derivar copia la plantilla a la organización, en borrador, con derivadaDeVersionId; ni un capataz ni un Farm Manager derivan", async () => {
    const p = await receta({ organizationId: null, conPasos: true });
    const nombre = `TEST VERS derivada ${RUN}`;
    // Ni el capataz ni el Farm Manager de la finca escriben recetas (V16: el jefe lleva `edit_beneficio` y no basta); el Coffee
    // Process Manager de la misma finca sí: es el control.
    for (const sinPermiso of [capataz, jefe]) {
      await expect(derivarReceta(sinPermiso, { plantillaVersionId: p.versionId, organizationId: orgId, nombre })).rejects.toThrow(
        new RecipeError("sin_permiso_de_autoria"),
      );
    }
    expect(await prisma.processRecipe.count({ where: { name: nombre } }), "los rechazos no dejaron receta").toBe(0);

    const d = await derivarReceta(gestor, { plantillaVersionId: p.versionId, organizationId: orgId, nombre });

    const r = await prisma.processRecipe.findUniqueOrThrow({ where: { id: d.recipeId } });
    expect([r.organizationId, r.derivadaDeVersionId, r.esLibre, r.name]).toEqual([orgId, p.versionId, false, nombre]);
    const v = await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: d.versionId } });
    expect([v.recipeId, v.version, v.status, v.expectedHours]).toEqual([d.recipeId, 1, "draft", 300]);

    const dePlantilla = await contenido(p.versionId);
    const derivada = await contenido(d.versionId);
    expect(forma(derivada)).toEqual(forma(dePlantilla));
    expect(colgantes(derivada)).toEqual(colgantes(dePlantilla));
    const ids = new Set(derivada.pasos.map((x) => x.id));
    const metasDePaso = derivada.metas.filter((m) => m.recipeStepId !== null);
    expect(metasDePaso).toHaveLength(2);
    for (const m of metasDePaso) expect(ids.has(m.recipeStepId!)).toBe(true);
    expect(derivada.fases).toEqual([]);
    // La plantilla no gana versiones.
    expect(await prisma.processRecipeVersion.count({ where: { recipeId: p.recipeId } })).toBe(1);
  });

  it("sólo se deriva de una plantilla publicada", async () => {
    const deOrganizacion = await receta({ organizationId: orgId, conPasos: true });
    const enBorrador = await receta({ organizationId: null, conPasos: true, status: "draft" });
    const publicada = await receta({ organizationId: null, conPasos: false });
    const pide = (plantillaVersionId: string, nombre: string) =>
      derivarReceta(gestor, { plantillaVersionId, organizationId: orgId, nombre: `${nombre} ${RUN}` });
    await expect(pide(deOrganizacion.versionId, "TEST VERS de organizacion")).rejects.toThrow(new RecipeError("no_es_plantilla"));
    await expect(pide(enBorrador.versionId, "TEST VERS de borrador")).rejects.toThrow(new RecipeError("version_no_publicada"));
    // Control: de una publicada, sale.
    await expect(pide(publicada.versionId, "TEST VERS de publicada")).resolves.toBeDefined();
  });

  it("el nombre es obligatorio y no se repite en la organización", async () => {
    const p = await receta({ organizationId: null, conPasos: false });
    const nombre = `TEST VERS repetida ${RUN}`;
    await expect(derivarReceta(gestor, { plantillaVersionId: p.versionId, organizationId: orgId, nombre: "   " })).rejects.toThrow(
      new RecipeError("nombre_requerido"),
    );
    // Control: el primero con ese nombre sale; el segundo choca con `@@unique([organizationId, name])` y sale con nombre.
    await expect(derivarReceta(gestor, { plantillaVersionId: p.versionId, organizationId: orgId, nombre })).resolves.toBeDefined();
    await expect(derivarReceta(gestor, { plantillaVersionId: p.versionId, organizationId: orgId, nombre })).rejects.toThrow(
      new RecipeError("nombre_repetido"),
    );
    expect(await prisma.processRecipe.count({ where: { name: nombre } })).toBe(1);
  });

  it("una versión que no existe se rechaza con nombre, en las dos puertas", async () => {
    const real = await receta({ organizationId: null, conPasos: false });
    await expect(nuevaVersionBorrador(admin, randomUUID())).rejects.toThrow(new RecipeError("version_no_encontrada"));
    await expect(
      derivarReceta(gestor, { plantillaVersionId: randomUUID(), organizationId: orgId, nombre: `TEST VERS fantasma ${RUN}` }),
    ).rejects.toThrow(new RecipeError("version_no_encontrada"));
    // Control: con un id real, las dos salen.
    await expect(nuevaVersionBorrador(gestorDePlataforma, real.versionId)).resolves.toBeDefined();
    await expect(
      derivarReceta(gestor, { plantillaVersionId: real.versionId, organizationId: orgId, nombre: `TEST VERS real ${RUN}` }),
    ).resolves.toBeDefined();
  });
});

describe("R8 extendido — la puerta vieja (`createRecipeVersion`) tampoco pierde los pasos", () => {
  it("createRecipeVersion copia los pasos con sus metas remapeadas, deja las metas de versión al llamador y no copia las fases", async () => {
    const v1 = await receta({ organizationId: orgId, conPasos: true });
    const antes = await contenido(v1.versionId);
    const v2 = await createRecipeVersion(gestor, v1.recipeId, [
      { variable: "moisture", moment: "final", phase: "drying" as const, unit: "%", minValue: 10.5, maxValue: 11.5 },
    ]);
    const d = await contenido(v2.id);
    expect(forma(d)).toEqual(forma(antes));
    const cd = colgantes(d);
    const ca = colgantes(antes);
    expect([cd.adiciones, cd.fines, cd.requisitos, cd.metasDePaso]).toEqual([ca.adiciones, ca.fines, ca.requisitos, ca.metasDePaso]);
    const ids = new Set(d.pasos.map((p) => p.id));
    for (const m of d.metas.filter((x) => x.recipeStepId !== null)) expect(ids.has(m.recipeStepId!)).toBe(true);
    // Las de versión son las que mandó el llamador, no las de la v1.
    expect(cd.metasDeVersion).toEqual([JSON.stringify(["moisture", "final", "drying", "10.5", "11.5"])]);
    // §3.1: con pasos, ninguna fase.
    expect(d.fases).toEqual([]);
    // Lo que devuelve es la versión releída, con lo copiado: dos metas de paso y la de versión.
    expect(v2.targets).toHaveLength(3);
  });
});
