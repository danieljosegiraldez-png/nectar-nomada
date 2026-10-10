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
 * Cuentas (V16, 2026-10-04: escribir una receta es del Coffee Process Manager): el Platform Admin sembrado (aquí no se
 * cuenta nada global) y las que crea `fabricaDeCuentas` —un Coffee Process Manager de la finca
 * de la organización propia del archivo (`gestor`), otro de plataforma (`gestorDePlataforma`, el de las plantillas), un Farm Manager
 * (`jefe`: lleva `edit_beneficio` y NO escribe recetas), un Farm Operator (`capataz`) y el Coffee Process Manager de una SEGUNDA
 * organización (`gestorAjeno`, con su finca)—. La regla de autoría no pide ningún lote.
 *
 * **Ronda de arreglo de la tarea 4 (2026-10-06, H1–H4 del revisor).**
 * - **H1, la autoría sobre una receta de ORGANIZACIÓN tiene su rechazo** (Ruling INV): antes los únicos rechazos eran sobre una
 *   plantilla, y `if (organizationId === null) await exigeAutoriaDeReceta(…)` —autorizar sólo las plantillas— dejaba las 11 en verde.
 *   Ahora un Farm Manager y un capataz no versionan la receta de SU organización, y la segunda organización, con su propio gestor,
 *   no versiona la de la primera ni deriva una plantilla hacia ella (cada rechazo con su control que pasa).
 * - **H2, la copia «con todas sus columnas» está fijada:** la fixture da valor a las 22 columnas escalares de un paso (los siete ejes de
 *   catálogo, el mucílago, `modoSecado`…) y a las de cada hija (`desdeLecturaId` de un fin, `everyHours`, `note` y `unit` de una meta),
 *   y se compara la FILA ENTERA menos las columnas de identidad y de enlace (`entera`). Una columna que la copia deje de traer cae por
 *   su nombre, y una columna futura queda comparada sin tocar la comparación. Su control (`columnasSinValor`): una columna que la fixture
 *   deja en su valor por omisión no la ve ninguna comparación, y eso se dice en vez de leerse como «copiada».
 * - **H3, las tres reglas de la cabecera de `nuevaVersionBorrador`:** pedir desde el PROPIO borrador, el número es el más alto + 1, y se
 *   copia la versión ELEGIDA y no la última.
 * - **H4, la auditoría de derivar:** operación, motivo y actor del `process_recipe.create`.
 *
 * **La lectura de la fixture es de verdad** (`desdeLecturaId`, §5.3): una lectura de un lote de la organización, marcada como de cierre
 * de una corrida (`ProcessStepClosingReading`), que es lo único que `pasos.ts` acepta como origen de un fin. Una plantilla no cita ninguna
 * (la regla de la tarea 3: una plantilla no cita lecturas), así que sólo la receta de una organización la lleva. Es lo único de este
 * archivo que necesita un lote; la limpieza la descubre por `RUN`, no por las variables del `beforeAll`.
 *
 * Base: la propia de la 2a (`nectar_test_recetas_2a`). Grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { derivarReceta, nuevaVersionBorrador } from "../../lib/recetas/versiones";
import { RecipeError } from "../../lib/recetas/errorDeReceta";
import { getRecipeForEditor, listRecipeVersionsForLot } from "../../lib/traceability/processTargets";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { fabricaDeCuentas } from "../helpers/cuentasDeAutoria";

const RUN = `versiones-${Date.now()}`;
const cuentas = fabricaDeCuentas("Versiones");

let admin: string;
let orgId: string;
/** Una SEGUNDA organización, con su finca y su propio Coffee Process Manager (H1): nada de ella alcanza la receta de la primera. */
let orgId2: string;
/** Coffee Process Manager de la finca de la organización del archivo: quien escribe sus recetas. */
let gestor: string;
/** Coffee Process Manager de plataforma: el único que escribe plantillas. */
let gestorDePlataforma: string;
/** Coffee Process Manager de la finca de la SEGUNDA organización: escribe las suyas y ninguna de la primera. */
let gestorAjeno: string;
/** Farm Manager de la finca: lleva `edit_beneficio` y `lot:manage` de serie, y NO escribe recetas (V16). */
let jefe: string;
let capataz: string;
const tipo = { prefermentacion: "", fermentation: "", washing: "", drying: "" };
let sustrato: string;
let capacidad: string;
/** Un valor sembrado de cada catálogo de eje (tarea 2), para que ningún eje de un paso quede en blanco en la fixture. */
const eje = { estadoFruto: "", oxigeno: "", temperatura: "", fuenteMicrobiana: "", fisico: "", medio: "" };
/** La lectura de cierre que cita un fin de la receta de una organización: marcada, de un lote de `orgId` (ver la cabecera). */
let lecturaId: string;

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
 * secado. `esLibre` la marca como una receta Libre (§5.2). Con `conPasos`, además las cuatro colecciones y los requisitos, **con
 * TODAS las columnas de cada fila con valor** (H2: lo que la copia no trae no se ve comparando dos filas en blanco): cuatro pasos —la
 * fiebre, la fermentación, el lavado y el secado—, cada eje en un tipo que `EJES_POR_TIPO_DE_PASO` lo admite (la fiebre: estado del
 * fruto y oxígeno; la fermentación: temperatura con su rango, fuente microbiana y físico; el lavado: estado del fruto, el mucílago
 * que QUEDA —un tramo distinto de 0— y el medio; el secado: el modo); una adición, un fin, un requisito, tres metas de paso —dos con
 * la MISMA variable y el MISMO momento en pasos distintos (§3.2), y una `during` con su ritmo y su nota— y la fase de fermentación
 * que publicar habría derivado (§3.1). **El fin cita la lectura de cierre** (`lecturaId`) sólo en la receta de una organización: una
 * plantilla no cita lecturas (tarea 3).
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
      data: {
        recipeVersionId: v.id, seq: 1, stepTypeValueId: tipo.prefermentacion, intencion: "TEST fiebre en sacos", horasMin: 12, horasSugeridas: 24, horasMax: 36,
        estadoFrutoValueId: eje.estadoFruto, oxigenoValueId: eje.oxigeno,
      },
    });
    const fer = await prisma.processRecipeStep.create({
      data: {
        recipeVersionId: v.id, seq: 2, stepTypeValueId: tipo.fermentation, intencion: "TEST fermentación en tanque", temperaturaMinC: 18, temperaturaMaxC: 22, finPorTiempo: true, reglaDeFin: "all",
        temperaturaValueId: eje.temperatura, fuenteMicrobianaValueId: eje.fuenteMicrobiana, fisicoValueId: eje.fisico,
      },
    });
    await prisma.processRecipeStep.create({
      data: {
        recipeVersionId: v.id, seq: 3, stepTypeValueId: tipo.washing, intencion: "TEST lavado con parte del mucílago",
        estadoFrutoValueId: eje.estadoFruto, mucilagoObjetivo: 50, medioValueId: eje.medio,
      },
    });
    await prisma.processRecipeStep.create({
      data: { recipeVersionId: v.id, seq: 4, stepTypeValueId: tipo.drying, intencion: "TEST secado en cama", opcional: true, modoSecado: "african_bed_outdoor", volteoCadaHoras: 2, humedadMinPct: 10, humedadMaxPct: 12 },
    });
    await prisma.processRecipeStepAddition.create({ data: { stepId: fer.id, categoriaValueId: sustrato, cantidad: 2.5, unidad: "L", momento: "pre_green" } });
    await prisma.processRecipeStepEnd.create({
      data: { stepId: fer.id, variable: "ph", operador: "lte", valor: 4.2, unidad: "pH", desdeLecturaId: o.organizationId === null ? null : lecturaId },
    });
    await prisma.processRecipeStepRequirement.create({ data: { stepId: fer.id, capacidadValueId: capacidad } });
    await prisma.processTarget.create({
      data: { recipeVersionId: v.id, recipeStepId: pre.id, variable: "ph", moment: "initial", phase: "fermentation", unit: "pH", targetValue: 5.2, displayOrder: 1 },
    });
    await prisma.processTarget.create({
      data: { recipeVersionId: v.id, recipeStepId: fer.id, variable: "ph", moment: "initial", phase: "fermentation", unit: "pH", targetValue: 4.9, displayOrder: 2 },
    });
    // Una meta `during` es la única que lleva ritmo (`everyHours`): el servicio rechaza uno en una inicial o final.
    await prisma.processTarget.create({
      data: {
        recipeVersionId: v.id, recipeStepId: fer.id, variable: "ph", moment: "during", phase: "fermentation", unit: "pH", minValue: 3.8, maxValue: 4.6,
        everyHours: 6, note: "TEST medir cada 6 h", displayOrder: 3,
      },
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
/**
 * Lo único que una copia NO conserva igual: la identidad de la fila y su enlace a otra (ids nuevos, versión nueva, paso nuevo) y
 * las marcas de tiempo. Todo lo demás tiene que salir igual (H2).
 */
const NO_SE_COMPARA = ["id", "recipeVersionId", "recipeStepId", "stepId", "createdAt", "updatedAt"];
/**
 * La fila ENTERA menos esas columnas, por JSON (un Decimal y una fecha se comparan por su valor, no por el objeto). Una columna que se
 * añada mañana a una tabla copiada queda dentro de la comparación sin tocar esta función.
 */
const entera = (fila: object): Record<string, unknown> => {
  const copia: Record<string, unknown> = { ...fila };
  for (const clave of NO_SE_COMPARA) delete copia[clave];
  return JSON.parse(JSON.stringify(copia)) as Record<string, unknown>;
};
/** Cada paso por su orden, con todas sus columnas: lo que la copia tiene que conservar. Los ids NO, a propósito. */
const forma = (c: Contenido) => c.pasos.map(entera);
/**
 * Lo que cuelga de un paso, fila entera y nombrado por el `seq` de SU paso en ESTA versión (`paso`). Un `stepId` que no sea de esta
 * versión sale `null` en vez del número, y la comparación con el origen cae.
 */
const colgantes = (c: Contenido) => {
  const delPaso = (stepId: string, fila: object) => JSON.stringify({ paso: c.seqDe.get(stepId) ?? null, ...entera(fila) });
  return {
    adiciones: c.adiciones.map((a) => delPaso(a.stepId, a)).sort(),
    fines: c.fines.map((f) => delPaso(f.stepId, f)).sort(),
    requisitos: c.requisitos.map((r) => delPaso(r.stepId, r)).sort(),
    metasDePaso: c.metas.filter((m) => m.recipeStepId !== null).map((m) => delPaso(m.recipeStepId!, m)).sort(),
    metasDeVersion: c.metas.filter((m) => m.recipeStepId === null).map((m) => JSON.stringify(entera(m))).sort(),
  };
};
/**
 * Lo que una columna vale si nadie la escribe: nulo para toda columna anulable; éstas son las de las que no lo son. Una columna
 * «llena» es la que alguna fila tiene en otro valor.
 */
const POR_OMISION: Record<string, unknown> = { opcional: false, finPorTiempo: false, reglaDeFin: "first", displayOrder: 0 };
/**
 * Las columnas de las tablas que se copian que NINGUNA fila de la versión llena. Control de la comparación de fila entera: una columna en
 * blanco por los dos lados sale «igual» aunque la copia la pierda, y eso es una comparación que no mide esa columna. Si una tabla gana una
 * columna, este control la nombra hasta que la fixture le dé un valor; no se lee como «copiada».
 */
const columnasSinValor = (c: Contenido): string[] =>
  Object.entries({ paso: c.pasos, adicion: c.adiciones, fin: c.fines, requisito: c.requisitos, meta: c.metas }).flatMap(([tabla, filas]) => {
    const enteras = filas.map(entera);
    return Object.keys(enteras[0] ?? {})
      .filter((col) => !enteras.some((f) => f[col] !== null && f[col] !== POR_OMISION[col]))
      .map((col) => `${tabla}.${col}`);
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
  // Una corrida que usa una versión de la corrida (la de «cuántas corridas usa cada versión»), antes que su versión: la clave de la corrida
  // es `SET NULL`, así que borrar la receta no falla, y la corrida se quedaría huérfana de su versión hasta el `afterAll`. Se descubre por
  // la versión, no por una variable de la prueba.
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ processRecipeVersionId: { in: versionIds } }) });
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

/**
 * La lectura de cierre de la fixture y lo que la sostiene, DESCUBIERTO por el prefijo de RUN y no heredado de las variables del
 * `beforeAll` (si éste murió antes de asignarlas, igual se limpia). Va DESPUÉS de las recetas —el fin cita la lectura con `RESTRICT`—:
 * primero la marca, la corrida, la lectura y por último el lote.
 */
async function borrarLaLecturaDeLaCorrida() {
  const lotes = (await prisma.lot.findMany({ where: assertDefinedWhere({ lotCode: { startsWith: RUN } }), select: { id: true } })).map((l) => l.id);
  const corridas = (
    await prisma.fermentationRun.findMany({ where: assertDefinedWhere({ vesselNote: { contains: RUN } }), select: { id: true } })
  ).map((c) => c.id);
  const lecturas = (
    await prisma.measurement.findMany({ where: assertDefinedWhere({ lotId: { in: lotes } }), select: { id: true } })
  ).map((m) => m.id);
  await prisma.processStepClosingReading.deleteMany({ where: assertDefinedWhere({ measurementId: { in: lecturas } }) });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: corridas } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: lecturas } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
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
  gestor = await cuentas.cuenta("Coffee Process Manager", { locationId: finca.id });
  gestorDePlataforma = await cuentas.cuenta("Coffee Process Manager", "plataforma");
  jefe = await cuentas.cuenta("Farm Manager", { locationId: finca.id });
  capataz = await cuentas.cuenta("Farm Operator", { locationId: finca.id });
  // La segunda organización (H1): su finca y su gestor. Los nombres llevan RUN, y el `afterAll` las descubre por él.
  const org2 = await prisma.organization.create({ data: { name: `TEST VERS Org2 ${RUN}`, organizationType: "farm" } });
  orgId2 = org2.id;
  const finca2 = await prisma.location.create({
    data: { name: `TEST VERS Finca2 ${RUN}`, locationType: "site", classification: "internal", organizationId: orgId2 },
  });
  gestorAjeno = await cuentas.cuenta("Coffee Process Manager", { locationId: finca2.id });

  tipo.prefermentacion = await valor("tipo_paso", "prefermentacion");
  tipo.fermentation = await valor("tipo_paso", "fermentation");
  tipo.washing = await valor("tipo_paso", "washing");
  tipo.drying = await valor("tipo_paso", "drying");
  sustrato = await valor("sustrato_anadido", "doble_mosto");
  // El catálogo `capacidad` lo siembra la tarea 2; aquí sirve cualquiera de sus valores.
  capacidad = await valor("capacidad");
  // Un valor real de cada catálogo de eje, de los que siembra la tarea 2 (no el primero de cada uno: ése suele ser el «ninguno»).
  eje.estadoFruto = await valor("estado_cereza", "despulpada");
  eje.oxigeno = await valor("condicion_oxigeno", "anaerobico");
  eje.temperatura = await valor("manejo_temperatura", "cold_hold_prefermentativo");
  eje.fuenteMicrobiana = await valor("fuente_microbiana", "levadura_inoculada");
  eje.fisico = await valor("fisico", "agitacion");
  eje.medio = await valor("medio_lavado", "mosto_propio");

  // La lectura de cierre que cita un fin (§5.3), «por el camino que el código exige» (`lib/recetas/pasos.ts`): una lectura de un lote de
  // la organización de la receta, marcada como la que cerró una corrida. Los nombres llevan RUN para que la limpieza la encuentre.
  const lote = await prisma.lot.create({ data: { lotCode: `${RUN}-LOTE`, lotType: "cherry", organizationId: orgId, classification: "internal" } });
  const corrida = await prisma.fermentationRun.create({ data: { startedAt: new Date("2026-03-02T12:00:00Z"), vesselNote: `TEST VERS ${RUN}` } });
  const lectura = await prisma.measurement.create({
    data: { variable: "ph", value: 4.1, unit: "pH", occurredAt: new Date("2026-03-02T12:00:00Z"), lotId: lote.id, provenanceClass: "measured_fact" },
  });
  await prisma.processStepClosingReading.create({ data: { measurementId: lectura.id, fermentationRunId: corrida.id } });
  lecturaId = lectura.id;
});

afterEach(borrarRecetasDeLaCorrida);

afterAll(async () => {
  await borrarRecetasDeLaCorrida();
  // La lectura y su lote, después de las recetas que la citan; las cuentas, DESPUÉS de las recetas que firmaron. Todo se descubre por
  // RUN: un `beforeAll` que muriera antes de asignar una variable dejaría igual la basura que ya creó.
  await borrarLaLecturaDeLaCorrida();
  await cuentas.limpiar();
  await prisma.location.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN } }) });

  expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } })).toBe(0);
  expect(await prisma.lot.count({ where: { lotCode: { startsWith: RUN } } })).toBe(0);
  expect(await prisma.fermentationRun.count({ where: { vesselNote: { contains: RUN } } })).toBe(0);
  expect(await prisma.location.count({ where: { name: { contains: RUN } } })).toBe(0);
  expect(await prisma.organization.count({ where: { name: { contains: RUN } } })).toBe(0);
});

describe("§3.3 copia — la versión nueva nace en borrador y trae todo, remapeado a sus pasos", () => {
  it("una v1 con las cuatro colecciones da una v2 con ids nuevos, y cada meta de paso apunta a un paso de la v2", async () => {
    const v1 = await receta({ organizationId: orgId, conPasos: true });
    const antes = await contenido(v1.versionId);
    // Fila patrón: la v1 tiene de verdad las cuatro colecciones (y requisitos y fases). Sin esto, «la v2 trae lo mismo»
    // pasaría comparando dos vacíos.
    expect([antes.pasos.length, antes.adiciones.length, antes.fines.length, antes.requisitos.length, antes.metas.length, antes.fases.length])
      .toEqual([4, 1, 1, 1, 4, 2]);
    // Y de verdad con TODAS sus columnas (H2): una que la fixture deja en blanco no la ve la comparación de fila entera de abajo.
    expect(columnasSinValor(antes), "columnas que la fixture deja en su valor por omisión: la copia podría perderlas sin que nada caiga").toEqual([]);
    // El fin cita una lectura MARCADA como de cierre (§5.3), no un id cualquiera.
    expect(antes.fines.map((f) => f.desdeLecturaId)).toEqual([lecturaId]);
    expect(await prisma.processStepClosingReading.count({ where: { measurementId: lecturaId } }), "la lectura está marcada").toBe(1);

    const v2 = await nuevaVersionBorrador(gestor, v1.versionId);

    const fila = await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: v2.id } });
    expect([fila.recipeId, fila.version, fila.status, fila.expectedHours]).toEqual([v1.recipeId, 2, "draft", 300]);
    expect(v2.version).toBe(2);

    const despues = await contenido(v2.id);
    const idsV1 = new Set(antes.pasos.map((p) => p.id));
    expect(despues.pasos.filter((p) => idsV1.has(p.id))).toEqual([]);
    // La fila ENTERA de cada paso y de cada hija, menos su identidad y su enlace (H2): una columna que la copia deje de traer cae aquí.
    expect(forma(despues)).toEqual(forma(antes));
    expect(colgantes(despues)).toEqual(colgantes(antes));
    expect(despues.fines.map((f) => f.desdeLecturaId), "la v2 cita la misma lectura de cierre").toEqual([lecturaId]);

    // El centro del guardián: cada meta de paso de la v2 apunta a un paso DE LA v2.
    const idsV2 = new Set(despues.pasos.map((p) => p.id));
    const metasDePaso = despues.metas.filter((m) => m.recipeStepId !== null);
    expect(metasDePaso).toHaveLength(3);
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

  it("pedir una versión nueva desde el PROPIO borrador se rechaza (H3): ese borrador ES el de la receta, y se sigue editando", async () => {
    // Una receta cuya v1 todavía es borrador: es su único borrador, y es de donde se pide. Si «el borrador abierto» se contara sin
    // él mismo, esto saldría con una v2 y la receta tendría dos borradores.
    const r = await receta({ organizationId: orgId, conPasos: true, status: "draft" });
    await expect(nuevaVersionBorrador(gestor, r.versionId)).rejects.toThrow(new RecipeError("ya_hay_un_borrador"));
    expect(await prisma.processRecipeVersion.count({ where: { recipeId: r.recipeId } }), "no dejó una versión").toBe(1);
    // Control: publicada esa misma v1, la misma petición sale. Lo que la paraba era el borrador, no la receta ni la cuenta.
    await prisma.processRecipeVersion.update({ where: { id: r.versionId }, data: { status: "approved" } });
    await expect(nuevaVersionBorrador(gestor, r.versionId)).resolves.toMatchObject({ version: 2 });
  });
});

describe("qué versión se copia y qué número lleva (H3)", () => {
  it("con la v1 y la v2 publicadas, pedir una desde la v1 da la v3 con el contenido de la v1 —no el de la v2— y sus horas esperadas", async () => {
    const v1 = await receta({ organizationId: orgId, conPasos: true });
    const c1 = await contenido(v1.versionId);
    // La v2, publicada y DISTINTA de la v1 en lo que la copia lee: un paso (su intención y su tope de horas) y las horas esperadas.
    const v2 = await nuevaVersionBorrador(gestor, v1.versionId);
    await prisma.processRecipeStep.updateMany({
      where: { recipeVersionId: v2.id, seq: 1 },
      data: { intencion: "TEST la v2 dice otra cosa", horasMax: 48 },
    });
    await prisma.processRecipeVersion.update({ where: { id: v2.id }, data: { status: "approved", expectedHours: 111 } });
    const c2 = await contenido(v2.id);
    // Control: la v1 y la v2 se distinguen. Sin esto, «la v3 sale de la v1» y «sale de la v2» darían lo mismo.
    expect(forma(c2)).not.toEqual(forma(c1));

    const v3 = await nuevaVersionBorrador(gestor, v1.versionId);
    // El número: el siguiente al MÁS ALTO (la v2), no el siguiente al de la versión que se copia (la v1 daría 2, que ya existe).
    expect(v3.version).toBe(3);
    const fila = await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: v3.id } });
    expect([fila.recipeId, fila.version, fila.status, fila.expectedHours]).toEqual([v1.recipeId, 3, "draft", 300]);
    // El contenido: el de la versión ELEGIDA.
    const c3 = await contenido(v3.id);
    expect(forma(c3)).toEqual(forma(c1));
    expect(colgantes(c3)).toEqual(colgantes(c1));
    // Y la v2, que sirvió de control, no se tocó.
    expect(forma(await contenido(v2.id))).toEqual(forma(c2));
  });
});

describe("la autoría de una receta de ORGANIZACIÓN: la escribe el Coffee Process Manager de esa organización (V16, Ruling INV, H1)", () => {
  it("ni un Farm Manager ni un capataz versionan la receta de su propia organización; el Coffee Process Manager sí", async () => {
    const r = await receta({ organizationId: orgId, conPasos: false });
    // El jefe lleva `edit_beneficio` y `lot:manage`, y el capataz opera lotes: ninguno de los dos escribe recetas.
    for (const sinPermiso of [jefe, capataz]) {
      await expect(nuevaVersionBorrador(sinPermiso, r.versionId)).rejects.toThrow(new RecipeError("sin_permiso_de_autoria"));
    }
    expect(await prisma.processRecipeVersion.count({ where: { recipeId: r.recipeId } }), "los rechazos no dejaron una versión").toBe(1);
    // Control: el gestor de esa misma finca, sobre la misma receta, sale. Lo que paraba a los otros dos era la autoría.
    await expect(nuevaVersionBorrador(gestor, r.versionId)).resolves.toMatchObject({ version: 2 });
  });

  it("el Coffee Process Manager de OTRA organización no versiona la receta de la primera ni deriva una plantilla hacia ella; sí hacia la suya", async () => {
    const mia = await receta({ organizationId: orgId, conPasos: false });
    await expect(nuevaVersionBorrador(gestorAjeno, mia.versionId)).rejects.toThrow(new RecipeError("sin_permiso_de_autoria"));
    expect(await prisma.processRecipeVersion.count({ where: { recipeId: mia.recipeId } }), "no dejó una versión").toBe(1);

    const plantilla = await receta({ organizationId: null, conPasos: false });
    const nombre = `TEST VERS derivada ajena ${RUN}`;
    const recetasAntes = await prisma.processRecipe.count({ where: { name: { contains: RUN } } });
    await expect(
      derivarReceta(gestorAjeno, { plantillaVersionId: plantilla.versionId, organizationId: orgId, nombre }),
    ).rejects.toThrow(new RecipeError("sin_permiso_de_autoria"));
    expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } }), "el rechazo no dejó una receta nueva").toBe(recetasAntes);
    expect(await prisma.processRecipe.count({ where: { organizationId: orgId, name: nombre } })).toBe(0);

    // Control: el mismo gestor, la misma plantilla y el mismo nombre, hacia SU organización, sale. Y el gestor de la primera no escribe
    // en la segunda: la regla corre en las dos direcciones.
    const suya = await derivarReceta(gestorAjeno, { plantillaVersionId: plantilla.versionId, organizationId: orgId2, nombre });
    const fila = await prisma.processRecipe.findUniqueOrThrow({ where: { id: suya.recipeId } });
    expect([fila.organizationId, fila.derivadaDeVersionId, fila.name]).toEqual([orgId2, plantilla.versionId, nombre]);
    await expect(
      derivarReceta(gestor, { plantillaVersionId: plantilla.versionId, organizationId: orgId2, nombre: `${nombre} otra` }),
    ).rejects.toThrow(new RecipeError("sin_permiso_de_autoria"));
  });
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

  it("F2-1 (E) — la autoría se pregunta ANTES de decir que es Libre: quien no puede escribir recetas recibe sin_permiso_de_autoria y no se entera de cuáles lo son", async () => {
    // El comentario de `nuevaVersionBorrador` lo promete («después de la autoría: quien no puede escribir recetas no se entera de cuáles son Libres») y permutar las dos líneas dejaba todo
    // en verde: la prueba de arriba sólo la intenta el gestor, que pasa la autoría con cualquier orden. Aquí la intentan quienes NO la tienen, sobre la Libre y sobre una común.
    const libre = await receta({ organizationId: orgId, conPasos: false, esLibre: true });
    const comun = await receta({ organizationId: orgId, conPasos: false, esLibre: false });
    for (const sinPermiso of [jefe, capataz]) {
      await expect(nuevaVersionBorrador(sinPermiso, libre.versionId), "sobre la Libre").rejects.toThrow(new RecipeError("sin_permiso_de_autoria"));
      await expect(nuevaVersionBorrador(sinPermiso, comun.versionId), "sobre la común").rejects.toThrow(new RecipeError("sin_permiso_de_autoria"));
    }
    // Control: quien SÍ puede escribir recetas recibe el otro código sobre la Libre, y la común sale. Lo que paraba a los otros dos era la autoría, no la marca.
    await expect(nuevaVersionBorrador(gestor, libre.versionId)).rejects.toThrow(new RecipeError("receta_libre_no_se_versiona"));
    await expect(nuevaVersionBorrador(gestor, comun.versionId)).resolves.toMatchObject({ version: 2 });
    expect(await prisma.processRecipeVersion.count({ where: { recipeId: libre.recipeId } }), "la Libre sigue con su única versión").toBe(1);
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

    // La auditoría (H4): UN evento colgado de la receta derivada, con su operación, el motivo que dice de qué versión de la plantilla
    // salió —lo que se busca después— y quién la derivó. Se lee por el id de la receta, no por la operación, para que una operación
    // cambiada cuente su valor en vez de «no encontrado».
    const eventos = await prisma.auditEvent.findMany({ where: { entityId: d.recipeId } });
    expect(eventos.map((e) => [e.operation, e.reason, e.actorUserAccountId])).toEqual([
      ["process_recipe.create", `derivada_de_version_${p.versionId}`, gestor],
    ]);

    const dePlantilla = await contenido(p.versionId);
    const derivada = await contenido(d.versionId);
    expect(forma(derivada)).toEqual(forma(dePlantilla));
    expect(colgantes(derivada)).toEqual(colgantes(dePlantilla));
    const ids = new Set(derivada.pasos.map((x) => x.id));
    const metasDePaso = derivada.metas.filter((m) => m.recipeStepId !== null);
    expect(metasDePaso).toHaveLength(3);
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

  // F2-1 (F). El comentario de `derivarReceta` dice que pide la autoría «ANTES de leer la plantilla», y permutar el orden dejaba las pruebas en verde: las de arriba derivan con el
  // gestor, que la tiene. Quien NO la tiene no debe enterarse de si la versión existe, de si es de una organización o de si está en borrador. Un caso por cada rechazo de la lectura,
  // para que cada permutación (la autoría detrás de uno, de dos o de los tres) tumbe su caso por su nombre.
  it.each([
    ["una versión que no existe", "version_no_encontrada"],
    ["la versión de una receta de organización", "no_es_plantilla"],
    ["una plantilla en borrador", "version_no_publicada"],
  ] as const)("F2-1 (F) — derivar %s: quien no puede escribir recetas recibe sin_permiso_de_autoria; el Coffee Process Manager, %s", async (que, codigo) => {
    const plantillaVersionId = {
      "una versión que no existe": randomUUID(),
      "la versión de una receta de organización": (await receta({ organizationId: orgId, conPasos: false })).versionId,
      "una plantilla en borrador": (await receta({ organizationId: null, conPasos: false, status: "draft" })).versionId,
    }[que];
    const nombre = `TEST VERS sin lectura ${RUN}`;
    for (const sinPermiso of [jefe, capataz]) {
      await expect(derivarReceta(sinPermiso, { plantillaVersionId, organizationId: orgId, nombre })).rejects.toThrow(new RecipeError("sin_permiso_de_autoria"));
    }
    // Control: el gestor de esa finca, con la misma versión y el mismo nombre, recibe el código de la plantilla. Lo que paraba a los otros dos era la autoría.
    await expect(derivarReceta(gestor, { plantillaVersionId, organizationId: orgId, nombre })).rejects.toThrow(new RecipeError(codigo));
    expect(await prisma.processRecipe.count({ where: { name: nombre } }), "los rechazos no dejaron receta").toBe(0);
  });

  it("una organización en blanco no se deriva —ni a «ninguna»—: sin permiso de autoría, también con alcance de plataforma, y nunca un error de uuid (F1-11)", async () => {
    // El formulario manda `organizationId` vacío cuando el desplegable no se llenó. Una cadena vacía llegaba al `uuid` de la base como un error crudo, y `null` —que para la
    // autoría es «una plantilla»— lo habría dejado pasar a quien escribe plantillas y creado una copia que es otra plantilla.
    const p = await receta({ organizationId: null, conPasos: false });
    const nombre = `TEST VERS sin organizacion ${RUN}`;
    for (const quien of [gestor, gestorDePlataforma]) {
      for (const blanco of [null, ""]) {
        await expect(derivarReceta(quien, { plantillaVersionId: p.versionId, organizationId: blanco, nombre }), `${quien === gestor ? "gestor" : "plataforma"} con ${JSON.stringify(blanco)}`).rejects.toThrow(
          new RecipeError("sin_permiso_de_autoria"),
        );
      }
    }
    expect(await prisma.processRecipe.count({ where: { name: nombre } }), "los rechazos no dejaron receta").toBe(0);
    // Control: con la organización, el mismo gestor deriva.
    await expect(derivarReceta(gestor, { plantillaVersionId: p.versionId, organizationId: orgId, nombre })).resolves.toBeDefined();
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

/**
 * Lo que protegía `recipeVersions.test.ts` (ADR-102) y que la Parte E de la tarea 14 no podía dejar caer con el servicio que esa prueba usaba
 * (`createRecipeVersion`): son dos lecturas que siguen vivas, y las dos se leían sólo ahí. La versión nueva se pide ahora con
 * `nuevaVersionBorrador`; las lecturas son las mismas.
 */
describe("dos lecturas de las versiones que nadie más probaba (ADR-102)", () => {
  it("a un proceso nuevo se le ofrece sólo la versión PUBLICADA más nueva de cada receta: un borrador no esconde a la v1, y una v2 publicada sí", async () => {
    const lote = await prisma.lot.findFirstOrThrow({ where: { lotCode: `${RUN}-LOTE` }, select: { id: true } });
    const v1 = await receta({ organizationId: orgId, conPasos: false });
    const v2 = await nuevaVersionBorrador(gestor, v1.versionId);
    // Sólo las versiones de ESTA receta: las plantillas de otros archivos pueden salir en la misma lista.
    const ofrecidas = async () =>
      (await listRecipeVersionsForLot(admin, lote.id)).filter((v) => v.recipeId === v1.recipeId).map((v) => v.version);
    expect(await ofrecidas(), "con la v2 en borrador, sigue la v1").toEqual([1]);
    await prisma.processRecipeVersion.update({ where: { id: v2.id }, data: { status: "approved" } });
    // Antes de la Parte 2a «devolvía todas las aprobadas, que era lo mismo porque sólo había una»: con dos publicadas, ofrecer las dos
    // le pide al operario saber cuál es la vigente.
    expect(await ofrecidas(), "publicada la v2, sólo ella").toEqual([2]);
  });

  it("el editor cuenta cuántas corridas usa cada versión, para poder negarse a tratar como borrador una que ya se usó", async () => {
    const v1 = await receta({ organizationId: orgId, conPasos: false });
    const v2 = await nuevaVersionBorrador(gestor, v1.versionId);
    await prisma.fermentationRun.create({
      data: { startedAt: new Date(), vesselNote: `TEST VERS ${RUN} corrida`, processRecipeVersionId: v1.versionId },
    });
    const editor = await getRecipeForEditor(admin, v1.recipeId);
    const corridasDe = (numero: number) => editor.versions.find((v) => v.version === numero)?._count.fermentationRuns;
    expect(editor.versions.map((v) => v.id).sort(), "control: el editor trae las dos versiones").toEqual([v1.versionId, v2.id].sort());
    expect(corridasDe(1), "la v1 la usa una corrida").toBe(1);
    expect(corridasDe(2), "la v2 no la usa ninguna").toBe(0);
  });
});

