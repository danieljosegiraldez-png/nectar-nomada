/**
 * **El formulario de inspección ofrece las TRES respuestas del protocolo, no dos y un vacío.**
 * `PENDING_IMPLEMENTATIONS/010`, requisito 4.
 *
 * **La historia, porque explica por qué hace falta un guardia y no basta con el arreglo.** El
 * 2026-09-12, `queenSighted` era una **casilla**: sin marcar guardaba `false` —«miré y no estaba»—
 * cuando lo cierto era que nadie buscó la reina. Lo cazó
 * `tests/arquitectura/booleanos-de-tres-estados.test.ts`, y el arreglo la convirtió en un
 * desplegable con `si`, `no` y el vacío.
 *
 * **Y ahí se quedó a medias durante tres semanas, con un comentario que lo daba por hecho**: decía
 * «tres opciones y no una casilla: "no se buscó" tiene que poder decirse». Tres `<option>` había
 * —pero una era la vacía, que significa «no se contestó»—, así que «no se buscó» seguía sin poder
 * decirse. Un comentario que afirma la propiedad que falta es peor que ninguno.
 *
 * **Por qué un test de FUENTE.** El formulario es `"use client"` y guarda en IndexedDB, así que
 * montarlo aquí traería medio navegador; es el mismo motivo por el que
 * `booleanos-de-tres-estados.test.ts` y `donde-esta-la-inspeccion.test.ts` leen el archivo. Lo que
 * se vigila es la forma del desplegable, no el texto de sus rótulos —de eso se encargan los
 * mensajes— y **la lista no se escribe a mano aquí**: sale de `estadoDeColonia`, atada al enum del
 * esquema, así que si mañana el vocabulario crece este guardia lo sigue sin que nadie lo actualice.
 *
 * Hermético: lee un archivo. NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PATRONES_DE_CRIA, REINA_VISTA, TEMPERAMENTOS } from "../../lib/apiary/estadoDeColonia";

const RAIZ = join(__dirname, "..", "..");
const FORMULARIO = join(RAIZ, "app/components/apiary/InspectionForm.tsx");
const fuente = readFileSync(FORMULARIO, "utf8");

/**
 * El bloque `<select>…</select>` cuyo propio `id` contiene `insp-<trozo>-`, o `null`.
 *
 * **Recorre los bloques en vez de retroceder desde el id, y la primera versión hacía lo segundo —
 * mal.** El `id` aparece ANTES en el `<label htmlFor={...}>` que en el `<select>`, así que buscar
 * el id y luego el `<select` más cercano hacia atrás devolvía **el desplegable anterior**: pedirle
 * el de la reina daba el de la cría. Lo cazó la fila de control de abajo —«cada desplegable es el
 * suyo»—, no una lectura del ayudante.
 */
export function desplegable(src: string, trozo: string): string | null {
  const marca = `insp-${trozo}-`;
  let desde = 0;
  for (;;) {
    const abre = src.indexOf("<select", desde);
    if (abre < 0) return null;
    const cierra = src.indexOf("</select>", abre);
    if (cierra < 0) return null;
    const bloque = src.slice(abre, cierra);
    // El id tiene que estar en la etiqueta de apertura, no en cualquier parte del cuerpo.
    const apertura = bloque.slice(0, bloque.indexOf(">") + 1);
    if (apertura.includes(marca)) return bloque;
    desde = cierra + 1;
  }
}

describe("el formulario de inspección y las tres respuestas de la reina", () => {
  it("el archivo se leyó de verdad", () => {
    // Fila patrón: sin esto, un archivo movido dejaría todo lo de abajo pasando sobre una cadena
    // vacía — `indexOf` daría -1, `desplegable` daría null, y un `not.toContain` sobre null pasa.
    expect(fuente.length).toBeGreaterThan(1000);
    expect(fuente).toContain("InspectionForm");
  });

  it("la reina se pregunta con un desplegable, no con una casilla", () => {
    const sel = desplegable(fuente, "queen");
    expect(sel, "no encontré el desplegable de la reina").not.toBeNull();
    expect(sel!).toContain("<option");
  });

  /**
   * **El corazón del guardia, y son dos mitades porque un test de fuente no ve los valores.**
   *
   * La primera versión buscaba `vista`, `no_vista` y `no_se_busco` **en el texto del archivo** y
   * fallaba: las opciones se generan con `REINA_VISTA.map(...)`, así que los valores no están en el
   * código — están en la lista importada. Un test de fuente sólo puede ver el **cableado**.
   *
   * Así que se vigilan las dos cosas que pueden romperse por separado: que el desplegable recorra
   * **esa** lista (aquí), y que la lista tenga **esos** valores (abajo). Partido así es más fuerte
   * que la coincidencia de texto que intentaba: ésta sólo habría funcionado con literales
   * incrustados, que es justo lo que este formulario no hace.
   */
  it("el desplegable de la reina recorre REINA_VISTA, no una lista escrita a mano", () => {
    const sel = desplegable(fuente, "queen")!;
    expect(sel).toContain("REINA_VISTA.map(");
  });

  it("y REINA_VISTA son las tres del protocolo, con `no_se_busco` entre ellas", () => {
    expect([...REINA_VISTA]).toEqual(["vista", "no_vista", "no_se_busco"]);
  });

  /**
   * **Y las dos que había NO pueden volver.** `si` y `no` eran el vocabulario de un booleano; si
   * reaparecen, el desplegable volvió a colapsar tres estados en dos.
   */
  it("y no vuelve a ofrecer `si`/`no`, que es el vocabulario de un booleano", () => {
    const sel = desplegable(fuente, "queen")!;
    expect(sel).not.toContain('value="si"');
    expect(sel).not.toContain('value="no"');
  });

  it("el vacío sigue existiendo: «no se contestó» tiene que poder decirse", () => {
    const sel = desplegable(fuente, "queen")!;
    expect(sel).toContain('<option value="" />');
  });

  /**
   * **`triEstado` colapsa tres estados en dos**, y era el paso que perdía el dato. Se queda en el
   * archivo para los cuatro booleanos de verdad —«junto a la cría» de miel y polen, la cría de
   * zángano y los de la caja—, pero la reina ya no pasa por él.
   */
  it("la reina ya no pasa por `triEstado`", () => {
    expect(fuente).not.toContain("queenSighted: triEstado(");
    // Control: `triEstado` SIGUE usándose, para los booleanos que de verdad lo son. Sin esta fila,
    // el `not.toContain` de arriba pasaría también si alguien borrara la función entera.
    expect(fuente).toContain("triEstado(");
  });
});

describe("el patrón de cría y el temperamento dejan de ser texto libre", () => {
  it("los dos se preguntan con un desplegable", () => {
    for (const trozo of ["brood", "temperament"]) {
      const sel = desplegable(fuente, trozo);
      expect(sel, `${trozo} no es un desplegable`).not.toBeNull();
    }
  });

  it("y cada uno recorre SU lista", () => {
    expect(desplegable(fuente, "brood")!).toContain("PATRONES_DE_CRIA.map(");
    expect(desplegable(fuente, "temperament")!).toContain("TEMPERAMENTOS.map(");
  });

  it("con los cinco y los tres valores del dueño", () => {
    expect([...PATRONES_DE_CRIA]).toEqual(["compacto", "salteado", "apretado", "promedio", "nulo"]);
    expect([...TEMPERAMENTOS]).toEqual(["mansa", "normal", "defensiva"]);
  });

  // **El control que lo hace medir.** Si `desplegable` devolviera trozos equivocados, las dos de
  // arriba podrían pasar por casualidad. Esto exige que cada uno sea el suyo: el de la cría no
  // puede contener un valor que sólo es del temperamento.
  it("CONTROL: cada desplegable es el suyo y no el del vecino", () => {
    // Por el cableado y no por los valores, por el mismo motivo de arriba. Es el control que cazó
    // el fallo del ayudante: pedirle el de la reina devolvía el de la cría, porque el `id` aparece
    // antes en el `<label htmlFor>` que en el `<select>`.
    expect(desplegable(fuente, "brood")!).not.toContain("TEMPERAMENTOS.map(");
    expect(desplegable(fuente, "temperament")!).not.toContain("PATRONES_DE_CRIA.map(");
    expect(desplegable(fuente, "queen")!).not.toContain("PATRONES_DE_CRIA.map(");
    // Y uno que no existe da null, para que `desplegable` no devuelva cualquier cosa.
    expect(desplegable(fuente, "no-existe-este-campo")).toBeNull();
  });
});
