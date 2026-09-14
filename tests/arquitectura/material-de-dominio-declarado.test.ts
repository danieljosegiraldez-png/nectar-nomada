import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Todo archivo de `docs/dominio/` dice de dónde salió.
 *
 * **Por qué existe.** El 2026-09-13 entraron tres guías de proceso —pH, Brix y
 * subproductos— redactadas por un modelo a partir de indicaciones de Daniel y
 * **sin revisar por él**. Traen matrices de umbrales con pinta de norma
 * («Especificación Técnica · Documentación de Ingeniería v2.5»), código, y
 * frases como *«PELIGRO: lave el café de inmediato»*.
 *
 * Material así es útil y es exactamente lo que `CLAUDE.md` §3 manda no
 * confundir: lo medido, lo observado, lo interpretado y lo sugerido por una IA
 * no pesan igual. El riesgo no es que alguien mienta — es que **el rótulo se
 * pierda**. Dentro de dos meses, una matriz sin cabecera es indistinguible de
 * un umbral que el dueño respalda, y el código se apoya en los dos por igual.
 *
 * El `README.md` de esa carpeta dice la regla en prosa. **La prosa se lee y se
 * razona alrededor**, así que aquí está con dientes.
 *
 * **Qué NO comprueba, y hay que decirlo para que nadie lo cuente dos veces:**
 * que el estado declarado sea CIERTO. Eso no lo puede ver un test — sólo lo
 * sabe quien trajo el archivo. Lo que sí garantiza es que *haya* un estado, que
 * sea uno de los tres admitidos, y que nadie ascienda un borrador a material
 * del dueño sin tocar esta línea, que se lee en el diff.
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const CARPETA = join(RAIZ, "docs/dominio");

/** Los tres de la tabla del README, y ninguno más. */
const ESTADOS = ["material del dueño", "borrador · pendiente de revisión", "referencia externa"] as const;

const documentos = () => readdirSync(CARPETA).filter((f) => f.endsWith(".md") && f !== "README.md");

describe("el material de dominio dice de dónde salió", () => {
  /**
   * **Control positivo del propio barrido.** Un `readdirSync` sobre una carpeta
   * que se renombró no falla: devuelve error, pero un filtro que no casa
   * devuelve lista vacía, y `it.each([])` **no ejecuta ningún caso** — el
   * guardia quedaría verde sin haber mirado un solo archivo. Es la comprobación
   * negativa vacía que `CLAUDE.md` prohíbe, con la cara de un runner contento.
   */
  it("encuentra los documentos que se sabe que están", () => {
    const docs = documentos();
    expect(docs.length, `documentos encontrados: ${docs.join(", ") || "NINGUNO"}`).toBeGreaterThanOrEqual(3);
    expect(readFileSync(join(CARPETA, "README.md"), "utf8")).toContain("Material de dominio");
  });

  it.each(documentos())("%s declara su procedencia", (nombre) => {
    const fuente = readFileSync(join(CARPETA, nombre), "utf8");

    // La cabecera va ARRIBA: una procedencia enterrada a media página no la lee
    // nadie, y quien cite el archivo lo habrá hecho antes de llegar.
    const cabecera = fuente.slice(0, 2000);
    expect(cabecera, `${nombre}: no abre con un bloque PROCEDENCIA`).toContain("PROCEDENCIA");

    const declarados = ESTADOS.filter((e) => cabecera.includes(`estado    : ${e}`));
    expect(
      declarados,
      `${nombre}: el estado tiene que ser exactamente uno de [${ESTADOS.join(" · ")}], ` +
        `escrito como \`estado    : <el estado>\`. Ver docs/dominio/README.md.`,
    ).toHaveLength(1);

    // Un borrador sin revisar tiene que decir en su cara que nada automático se
    // apoya en él. Es la mitad que de verdad protege: el estado solo se lee como
    // metadato, la prohibición se lee como advertencia.
    if (declarados[0] === "borrador · pendiente de revisión") {
      expect(
        cabecera,
        `${nombre}: es un borrador sin revisar y no dice qué NO puede hacer`,
      ).toMatch(/qué NO\s+: nada automático/);
    }
  });
});
