/**
 * La receta «DEMO Lavado» que siembra `prisma/seed.ts` — Parte 2a, tareas 5b y 7 (2026-10-12; Ruling T05b-3 del controlador).
 *
 * **Por qué existe.** Desde la receta obligatoria (5b) la demo abre sus dos procesos con una receta, y desde el guardián (7) sus dos
 * corridas cumplen un paso de ella. La FORMA de esa receta —cuatro pasos, sin una sola cifra, con el tramo de mucílago 0 sólo en el
 * lavado, sin metas ni fases— la escribe `seedDemoTraceabilityChain` a mano y hasta hoy sólo la guardaba un SQL que corrió quien hizo
 * la 5b. Una cifra puesta en la demo sería un número que nadie dio (CLAUDE.md §54): esta prueba es lo que la vigila.
 *
 * **Lee la base SEMBRADA**, no crea nada: no hay nada que limpiar. Necesita la semilla con `SEED_DEMO_CONTENT=true` y de DESPUÉS de la
 * tarea 5b/7 (`scripts/ci-con-base.sh` siembra con las cuatro banderas sobre una base nueva, y ahí pasa). **Una base sembrada con una
 * semilla anterior** —aquí, `nectar_test_recetas_2a_b`, que se sembró en la tarea 0— tiene la cadena DEMO pero sin receta y con sus
 * procesos cerrados sin ella, porque la semilla no vuelve a escribir una cadena que ya existe: el control de abajo cae con el mensaje que lo
 * dice, y la salida es sembrar una base nueva (o la `nn_flip_*` de la tarea).
 *
 * **Cada afirmación lleva su control:** la receta existe y es UNA (si no, todo lo de abajo se leería sobre nada) y los dos procesos de la
 * demo la usan; sin eso, «sin cifras» sería la ausencia de una receta que no está.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "../../lib/db";

const NOMBRE = "DEMO Lavado";
const SIN_SEMILLA =
  "la base no tiene «DEMO Lavado» publicada con sus dos procesos: se sembró sin SEED_DEMO_CONTENT=true o con una semilla anterior a la tarea 5b; siembra una base NUEVA (scripts/ci-con-base.sh)";

/** Las columnas de un paso que NO son una cifra ni un eje declarado: identidad, orden, el tramo de mucílago y los valores por defecto de la base. */
const COLUMNAS_QUE_NO_SON_UN_EJE = new Set(["id", "recipeVersionId", "seq", "stepTypeValueId", "mucilagoObjetivo", "opcional", "finPorTiempo", "reglaDeFin"]);

async function laDemo() {
  const recetas = await prisma.processRecipe.findMany({
    where: { name: NOMBRE },
    select: { id: true, organizationId: true, versions: { select: { id: true, version: true, status: true } } },
  });
  expect(recetas.length, SIN_SEMILLA).toBe(1);
  const receta = recetas[0]!;
  expect(receta.versions.map((v) => `${v.version}:${v.status}`), `«${NOMBRE}» debe tener una sola versión, la 1, publicada`).toEqual(["1:approved"]);
  const version = receta.versions[0]!;
  const pasos = await prisma.processRecipeStep.findMany({
    where: { recipeVersionId: version.id },
    orderBy: { seq: "asc" },
    include: { stepTypeValue: { select: { value: true } } },
  });
  const procesos = await prisma.lotProcess.findMany({ where: { processRecipeVersionId: version.id }, select: { id: true } });
  return { receta, version, pasos, procesos };
}

describe("la receta «DEMO Lavado» de la semilla", () => {
  it("existe UNA, publicada en su versión 1, y los dos procesos de la demo la usan (el control de lo de abajo)", async () => {
    const { procesos } = await laDemo();
    expect(procesos.length, SIN_SEMILLA).toBe(2);
    // Ninguno de los procesos de la demo está sin receta: son los dos que abre la semilla, y los dos con ésta.
    const sinReceta = await prisma.lotProcess.count({ where: { processRecipeVersionId: null, lot: { lotCode: { startsWith: "DCL-2027-" } } } });
    expect(sinReceta).toBe(0);
  });

  it("lleva cuatro pasos —despulpado, fermentación, lavado, secado—, sin una sola cifra ni eje, y el tramo de mucílago 0 sólo en el lavado", async () => {
    const { pasos } = await laDemo();
    expect(pasos.map((p) => p.stepTypeValue.value), `los pasos de «${NOMBRE}» no son, en este orden, despulpado, fermentación, lavado y secado`).toEqual([
      "pulping", "fermentation", "washing", "drying",
    ]);
    expect(pasos.map((p) => p.seq)).toEqual([1, 2, 3, 4]);
    // Sin cifras: toda columna que no sea identidad, orden, mucílago o un valor por defecto es nula. Una columna nueva que acepte una
    // cifra queda cubierta sin tocar esta prueba.
    for (const p of pasos) {
      const declaradas = Object.entries(p)
        .filter(([columna, valor]) => !COLUMNAS_QUE_NO_SON_UN_EJE.has(columna) && columna !== "stepTypeValue" && valor !== null)
        .map(([columna]) => columna);
      expect(declaradas, `el paso ${p.seq} (${p.stepTypeValue.value}) declara algo que nadie dio`).toEqual([]);
      expect(p.opcional).toBe(false);
      expect(p.finPorTiempo).toBe(false);
    }
    // El 0 es el NOMBRE del grado (Lavado), no una medida: sólo el lavado lo lleva.
    expect(pasos.map((p) => p.mucilagoObjetivo)).toEqual([null, null, 0, null]);
  });

  it("no lleva adiciones, fines, requisitos, metas ni fases: la demo no declara ningún número", async () => {
    const { version, pasos } = await laDemo();
    const ids = pasos.map((p) => p.id);
    expect(ids.length, `«${NOMBRE}» no tiene sus cuatro pasos`).toBe(4);
    expect(await prisma.processRecipeStepAddition.count({ where: { stepId: { in: ids } } })).toBe(0);
    expect(await prisma.processRecipeStepEnd.count({ where: { stepId: { in: ids } } })).toBe(0);
    expect(await prisma.processRecipeStepRequirement.count({ where: { stepId: { in: ids } } })).toBe(0);
    expect(await prisma.processTarget.count({ where: { recipeVersionId: version.id } })).toBe(0);
    expect(await prisma.processRecipePhase.count({ where: { recipeVersionId: version.id } })).toBe(0);
  });

  it("las dos corridas de cada proceso de la demo cumplen su paso de la receta: la fermentación el «fermentation», el secado el «drying», sin motivo de desviación", async () => {
    const { pasos, procesos } = await laDemo();
    const paso = (tipo: string) => pasos.find((p) => p.stepTypeValue.value === tipo);
    const fermentacion = paso("fermentation");
    const secado = paso("drying");
    expect(fermentacion && secado, `«${NOMBRE}» no tiene el paso de fermentación o el de secado que cumplen las corridas de la demo`).toBeTruthy();
    const ids = procesos.map((p) => p.id);
    expect(ids.length, SIN_SEMILLA).toBe(2);

    const fermentaciones = await prisma.fermentationRun.findMany({ where: { lotProcessId: { in: ids } } });
    const secados = await prisma.dryingRun.findMany({ where: { lotProcessId: { in: ids } } });
    // Control: hay una de cada por proceso; si no, el «todas cumplen» de abajo no dice nada.
    expect(fermentaciones.length).toBe(2);
    expect(secados.length).toBe(2);
    for (const f of fermentaciones) {
      expect([f.recipeStepId, f.stepTypeValueId, f.motivoDesviacion]).toEqual([fermentacion!.id, fermentacion!.stepTypeValueId, null]);
    }
    for (const s of secados) {
      expect([s.recipeStepId, s.stepTypeValueId, s.motivoDesviacion]).toEqual([secado!.id, secado!.stepTypeValueId, null]);
    }
  });
});
