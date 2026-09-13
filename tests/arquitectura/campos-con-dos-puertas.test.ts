/**
 * **Un campo nuevo tiene que llegar por TODAS las puertas que lo escriben.**
 *
 * ## El incidente que lo motiva (2026-09-13)
 *
 * Se añadieron `everyHours` y `expectedHours` a la receta con su validación y su
 * migración, y **ninguna pantalla podía escribirlos**. Cerrado eso, quedó el
 * fallo de verdad, que encontró la revisión independiente de Codex y no yo:
 * **hay DOS caminos que escriben objetivos de receta** —crear receta y crear
 * VERSIÓN— y sólo se cerró uno. `createRecipeVersion` no persistía `everyHours`
 * ni aceptaba `expectedHours`, así que **publicar la v2 le borraba el ritmo a la
 * receta en silencio**: la versión vigente quedaba sin él aunque la v1 lo
 * tuviera, y nada lo decía.
 *
 * Es pérdida de dato sin aviso en el núcleo de trazabilidad. El patrón —añadir
 * un campo y cerrar sólo una de sus puertas— ya se había cometido dos veces el
 * mismo día. Una promesa de tener cuidado no lo caza; esto sí.
 *
 * ## Cómo mide
 *
 * Lee los campos que `CreateRecipeInput` declara para un objetivo y exige que
 * **cada uno aparezca en los cinco sitios** que tienen que conocerlo. No
 * comprueba que estén bien usados —eso es lo que hacen las pruebas del
 * servicio— sino que **ninguno se quede fuera de un camino**, que es el fallo
 * que se ha repetido.
 *
 * ## Su control positivo, sin el cual no valdría nada
 *
 * Un guardia que lee la fuente con expresiones regulares falla en silencio
 * cuando la forma del archivo cambia: deja de encontrar campos, no encuentra
 * incumplimientos, y **pasa en verde sin haber mirado nada**. Es exactamente la
 * trampa que `CLAUDE.md` documenta con el detector que se quedó ciego por la
 * indentación. Por eso la primera prueba afirma **cuántos campos encontró** y
 * nombra los que espera: si el parseo se rompe, cae ahí y no en un vacío.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const leer = (r: string) => readFileSync(join(RAIZ, r), "utf8");

const SERVICIO = "lib/traceability/processTargets.ts";
const ACCION = "app/actions/traceability.ts";
const FORMULARIO_RECETA = "app/components/traceability/RecipeForm.tsx";
const FORMULARIO_VERSION = "app/components/traceability/RecipeVersionForm.tsx";

/** Los campos que `CreateRecipeInput` declara dentro de `targets`. */
function camposDeObjetivo(): string[] {
  const src = leer(SERVICIO);
  const i = src.indexOf("export interface CreateRecipeInput");
  if (i < 0) throw new Error(`No encuentro CreateRecipeInput en ${SERVICIO}`);
  const desdeTargets = src.slice(src.indexOf("targets: ReadonlyArray<{", i));
  const cuerpo = desdeTargets.slice(0, desdeTargets.indexOf("}>;"));
  return [...cuerpo.matchAll(/^\s{4}([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map((m) => m[1]!);
}

/**
 * Los dos bloques que construyen filas de `ProcessTarget`. Se localizan por la
 * función que los contiene y NO por el archivo entero: un campo mencionado en un
 * comentario a cien líneas de distancia contaría como presente, y el guardia
 * pasaría sobre un camino que no lo escribe.
 */
function bloqueDeCreacion(nombreFuncion: string): string {
  const src = leer(SERVICIO);
  const i = src.indexOf(`export async function ${nombreFuncion}`);
  if (i < 0) throw new Error(`No encuentro ${nombreFuncion} en ${SERVICIO}`);
  const j = src.indexOf("targets: {", i);
  if (j < 0) throw new Error(`${nombreFuncion} no construye targets`);
  return src.slice(j, src.indexOf("displayOrder", j) + 40);
}

describe("un campo de receta llega por todas las puertas que lo escriben", () => {
  /**
   * **El control positivo del propio análisis.** Si el parseo se rompe, esta
   * prueba cae — en vez de dejar que las demás pasen sobre una lista vacía.
   */
  it("el parseo encuentra los campos que se sabe que existen", () => {
    const campos = camposDeObjetivo();
    expect(campos.length, `parseó ${campos.length} campos: ${campos.join(", ")}`).toBeGreaterThanOrEqual(7);
    for (const esperado of ["variable", "moment", "unit", "targetValue", "minValue", "maxValue", "everyHours"]) {
      expect(campos, `falta ${esperado} — el parseo está ciego`).toContain(esperado);
    }
  });

  it("la acción parsea todos los campos del formulario", () => {
    const src = leer(ACCION);
    const i = src.indexOf("function parseTargetRows");
    expect(i, "no encuentro parseTargetRows").toBeGreaterThan(-1);
    const bloque = src.slice(i, src.indexOf("return targets;", i));
    const faltan = camposDeObjetivo().filter((c) => !bloque.includes(`targets[\${i}][${c}]`));
    expect(faltan, `parseTargetRows no lee: ${faltan.join(", ")}`).toEqual([]);
  });

  it("LOS DOS servicios que escriben objetivos persisten todos los campos", () => {
    // El segundo es el que faltaba, y su ausencia borraba el ritmo al publicar
    // una versión nueva. Se comprueban los dos a la vez, a propósito.
    for (const fn of ["createRecipeWithVersion", "createRecipeVersion"]) {
      const bloque = bloqueDeCreacion(fn);
      const faltan = camposDeObjetivo().filter((c) => !new RegExp(`\\b${c}:`).test(bloque));
      expect(faltan, `${fn} no persiste: ${faltan.join(", ")}`).toEqual([]);
    }
  });

  it("LOS DOS formularios que crean objetivos mandan todos los campos", () => {
    for (const f of [FORMULARIO_RECETA, FORMULARIO_VERSION]) {
      const src = leer(f);
      const faltan = camposDeObjetivo().filter((c) => !src.includes(`[${c}]`));
      expect(faltan, `${f} no manda: ${faltan.join(", ")}`).toEqual([]);
    }
  });

  /**
   * `expectedHours` vive en la VERSIÓN, no en el objetivo, y tiene sus propias
   * cuatro puertas. Se comprueba aparte porque su recorrido es otro — y porque
   * fue exactamente la mitad que se quedó fuera.
   */
  it("la duración esperada llega por sus cuatro puertas", () => {
    const sitios: [string, string][] = [
      [SERVICIO, "el servicio"],
      [ACCION, "la acción"],
      [FORMULARIO_RECETA, "el formulario de receta"],
      [FORMULARIO_VERSION, "el formulario de versión"],
    ];
    const faltan = sitios.filter(([ruta]) => !leer(ruta).includes("expectedHours")).map(([, q]) => q);
    expect(faltan, `expectedHours no llega a: ${faltan.join(", ")}`).toEqual([]);
  });
});
