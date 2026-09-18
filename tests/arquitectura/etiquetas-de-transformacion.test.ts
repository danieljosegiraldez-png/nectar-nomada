/**
 * Cada tipo de transformación de lote tiene su etiqueta, en los dos idiomas.
 *
 * **Por qué existe.** La línea de tiempo del lote pinta `t(\`transformationType_${tipo}\`)` con
 * un molde de cadena, así que el compilador no ve la clave. `hulling` entró al enum con la trilla
 * y nadie le puso etiqueta: un lote trillado enseñaba la clave cruda. Se vio de paso el
 * 2026-09-18, construyendo los pasos de la miel, que añadieron dos tipos más.
 *
 * Lee el enum del ESQUEMA, no una lista escrita aquí: una lista propia derivaría igual que la
 * etiqueta que falta.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const esquema = readFileSync("prisma/schema.prisma", "utf8");

/** Los valores de un enum de Prisma, sin comentarios ni atributos. */
export function valoresDelEnum(fuente: string, nombre: string): string[] {
  const m = fuente.match(new RegExp(`^enum ${nombre} \\{([\\s\\S]*?)^\\}`, "m"));
  if (!m) return [];
  return m[1]!
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter((l) => l && !l.startsWith("@@"));
}

describe("las etiquetas de los tipos de transformación", () => {
  const tipos = valoresDelEnum(esquema, "LotTransformationType");

  it("CONTROL: el enum se lee, y trae los tipos que se sabe que tiene", () => {
    // Sin esto, un enum que no se encuentra da una lista vacía y la prueba de abajo pasa sin mirar.
    expect(tipos).toEqual(expect.arrayContaining(["split", "hulling", "honey_processing", "packaging"]));
    expect(tipos.length).toBeGreaterThanOrEqual(12);
  });

  it("CONTROL: el lector ignora comentarios y atributos", () => {
    expect(valoresDelEnum("enum X {\n  a\n  /// doc\n  b // nota\n\n  @@schema(\"s\")\n}\n", "X")).toEqual(["a", "b"]);
  });

  for (const idioma of ["es", "en"]) {
    it(`cada tipo tiene etiqueta en ${idioma}`, () => {
      const t = JSON.parse(readFileSync(`messages/${idioma}.json`, "utf8")).Traceability as Record<string, string>;
      const faltan = tipos.filter((tipo) => !t[`transformationType_${tipo}`]);
      expect(faltan, `sin etiqueta en ${idioma}`).toEqual([]);
    });
  }
});
