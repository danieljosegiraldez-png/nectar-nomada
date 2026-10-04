/**
 * **Cada estado de verificación de un instrumento tiene su frase, en los dos idiomas.**
 *
 * Nace de un defecto real, encontrado el 2026-10-03 al escribir el guardia de
 * `PENDING_IMPLEMENTATIONS/019`: `app/beneficio/page.tsx` pedía la frase con el estado **pelado**
 * —`tEq("REVISION_VENCIDA")`— y esa clave no existe; se llama `verificacion_REVISION_VENCIDA`. Lo
 * que salía junto al nombre del instrumento era el nombre crudo de la clave que falta. Las otras
 * tres pantallas que pintan este mismo estado ya lo hacían bien.
 *
 * **Por qué no lo cazó ningún guardia, dicho por los guardias mismos:**
 *
 * - `claves-de-traduccion-existen.test.ts` sólo mira archivos con **un solo** espacio de nombres, y
 *   `app/beneficio/page.tsx` usa dos (`Beneficio` y `Equipos`): el archivo entero queda fuera.
 * - Ese mismo guardia excluye «por construcción» las claves armadas con plantilla, y dice que para
 *   ésas «el guardia es el tipo de la unión». **El tipo existía y nadie lo ató a los mensajes**, así
 *   que esa frase describía un guardia que no estaba escrito. Éste es ese guardia.
 * - `tsc` no ve cadenas y `vitest` tampoco: una clave que falta no rompe el build.
 *
 * **Y lo que ESTE archivo NO caza, dicho antes de que alguien cuente con él.** Vigila que las cinco
 * frases **existan**; no vigila que una pantalla las **pida bien**. Si alguien vuelve a escribir
 * `tEq(i.verificacion)` —la forma exacta del defecto— las claves siguen estando y estas pruebas
 * pasan. Medido con su flip-test: lo que cae entonces es
 * `tests/beneficio/pagina-del-tablero.test.ts`, en «y con uno que sí pide atención lo nombra», donde
 * el doble de `getTranslations` **revienta** ante una clave que falta. Ese es el guardia del
 * defecto; este es el guardia de que haya texto que pedir, que no estaba y hacía falta igual.
 *
 * Hermética: sólo lee archivos, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EstadoDeVerificacion } from "../../lib/equipos/verificacion";

const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as Record<string, Record<string, string>>;
const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as Record<string, Record<string, string>>;

/**
 * Los cinco valores de la unión, escritos a mano **a propósito**: una unión de TypeScript no existe
 * en tiempo de ejecución, así que no hay forma de recorrerla. El `satisfies` es lo que ata esta
 * lista al tipo — si alguien añade un estado y no lo pone aquí, `tsc` no dice nada, pero el último
 * `it` de este archivo sí: cuenta que sean cinco y que la unión no haya crecido sin avisar.
 */
const ESTADOS = [
  "VERIFICADO",
  "REVISION_VENCIDA",
  "VERIFICACION_FALLIDA",
  "SIN_VERIFICACION",
  "SIN_INSTRUMENTO",
] as const satisfies readonly EstadoDeVerificacion[];

const clave = (estado: string) => `verificacion_${estado}`;

describe("cada estado de verificación tiene su frase en los dos idiomas", () => {
  it(`las ${ESTADOS.length} claves existen en es.json`, () => {
    const faltan = ESTADOS.filter((e) => es.Equipos?.[clave(e)] === undefined);
    expect(faltan, `miradas ${ESTADOS.length} claves bajo «Equipos» de es.json`).toEqual([]);
  });

  it(`las ${ESTADOS.length} claves existen en en.json`, () => {
    const faltan = ESTADOS.filter((e) => en.Equipos?.[clave(e)] === undefined);
    expect(faltan, `miradas ${ESTADOS.length} claves bajo «Equipos» de en.json`).toEqual([]);
  });

  // **Y ninguna está vacía.** Una clave presente con `""` pasa un `=== undefined` y pinta un hueco.
  it("ninguna de las frases está vacía", () => {
    const vacias = ESTADOS.filter((e) => (es.Equipos?.[clave(e)] ?? "").trim() === "" || (en.Equipos?.[clave(e)] ?? "").trim() === "");
    expect(vacias).toEqual([]);
  });

  /**
   * **El control de que el detector mira donde debe**, no de que la página esté bien — eso lo
   * comprueba `pagina-del-tablero.test.ts`, ver la cabecera. Aquí sirve para que un cambio en el
   * nombre del espacio de nombres no deje las tres pruebas de arriba midiendo cero y pasando: si
   * `es.Equipos` dejara de existir, los cinco estados «faltarían» por la razón equivocada, y la
   * segunda aserción lo dice.
   */
  it("CONTROL: ninguna clave se llama con el estado pelado, y el espacio de nombres sí existe", () => {
    const peladas = ESTADOS.filter((e) => es.Equipos?.[e] === undefined);
    // Los cinco, porque ninguna clave se llama así: es lo que `tEq(i.verificacion)` pedía.
    expect(peladas).toHaveLength(ESTADOS.length);
    // Y el control de que estamos mirando el sitio bueno: el espacio de nombres existe y tiene algo.
    expect(Object.keys(es.Equipos ?? {}).length).toBeGreaterThan(0);
  });

  /**
   * La lista de arriba es a mano, así que puede quedarse corta cuando alguien añada un estado.
   * Esto lo cuenta contra el archivo del tipo: si la unión crece, esta prueba cae y nombra el sitio.
   */
  it("la unión no ha crecido sin que esta lista lo sepa", () => {
    const fuente = readFileSync("lib/equipos/verificacion.ts", "utf8");
    const bloque = /export type EstadoDeVerificacion =([\s\S]*?);/.exec(fuente)?.[1] ?? "";
    const enLaFuente = [...bloque.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]!);
    expect(enLaFuente.length, "el patrón tiene que encontrar la unión, no cero").toBeGreaterThan(0);
    expect([...enLaFuente].sort()).toEqual([...ESTADOS].sort());
  });
});
