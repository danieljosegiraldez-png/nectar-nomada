import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Dos entradas del menú no pueden llamarse igual, y dos en concreto no pueden
 * volver a llamarse como se llamaban.
 *
 * **El fallo, medido el 2026-09-08.** En español el menú ofrecía «Lotes» para
 * `/plots` —parcelas de terreno— y **«Batches»** para `/lots` —lotes de café—.
 * Quien buscara sus lotes de café pulsaba «Lotes» y veía terreno. La causa está
 * a la vista en el texto que quedó: `plotsIntro` decía «Lotes de terreno», así
 * que quien lo escribió usó «lote» para la parcela y, sin palabra libre para el
 * café, tiró del inglés. Y «batch» ya estaba ocupada: `BiocharBatch` y
 * `TreatmentBatch` son entidades reales del esquema.
 *
 * **Ninguna de las 1531 pruebas lo habría cazado**, ni su vuelta: nadie mira
 * estas cadenas. De ahí este archivo.
 *
 * **Lo que NO prueba, y hay que decirlo:** que las etiquetas sean las
 * correctas. `plots` puede decir «Apiarios» y esto pasa igual. Comprueba dos
 * cosas mecánicas —que no se repitan, y que no vuelvan las dos palabras que ya
 * costaron— no que el vocabulario sea bueno. Eso lo dice una persona usando la
 * aplicación, y es como se encontró.
 *
 * Hermético: sólo lee JSON, así que corre en `scripts/ci.sh`.
 */
const RAIZ = new URL("../..", import.meta.url).pathname;
const nav = (loc: string) =>
  JSON.parse(readFileSync(join(RAIZ, `messages/${loc}.json`), "utf8")).Nav as Record<string, string>;

describe("el vocabulario del menú", () => {
  for (const loc of ["es", "en"] as const) {
    it(`${loc}: ninguna entrada del menú se llama igual que otra`, () => {
      const porEtiqueta = new Map<string, string[]>();
      for (const [clave, etiqueta] of Object.entries(nav(loc))) {
        porEtiqueta.set(etiqueta, [...(porEtiqueta.get(etiqueta) ?? []), clave]);
      }
      const repetidas = [...porEtiqueta.entries()].filter(([, claves]) => claves.length > 1);
      expect(repetidas, `etiquetas repetidas en ${loc}: ${JSON.stringify(repetidas)}`).toEqual([]);
    });
  }

  /**
   * La red estrecha sobre el fallo concreto. Es deliberadamente literal: no
   * pretende definir el vocabulario, sólo impedir que vuelvan las dos palabras
   * que ya mandaron a la gente a la pantalla equivocada.
   */
  it("«Lotes» es la de café, no la de terreno", () => {
    expect(nav("es").plots, "/plots son parcelas de terreno; «Lotes» manda a buscar café ahí").not.toBe("Lotes");
    expect(nav("es").lots, "/lots son los lotes de café, y en español se dicen así").toBe("Lotes");
  });

  it("«Batches» no vuelve: la palabra ya es de BiocharBatch y TreatmentBatch", () => {
    expect(nav("es").lots).not.toBe("Batches");
    expect(nav("en").lots).not.toBe("Batches");
  });
});
