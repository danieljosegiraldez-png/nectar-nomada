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
 * sea uno de los admitidos, y que nadie ascienda un borrador a material del
 * dueño sin tocar esta línea, que se lee en el diff.
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const CARPETA = join(RAIZ, "docs/dominio");

/**
 * Los estados **se leen de la tabla del README**, no se copian aquí.
 *
 * **`reemplazado · no normativo` entró el 2026-09-19** con ADR-181: tres guías de café
 * —pH, Brix y subproductos— las reemplazaron `docs/beneficio/10`, `11` y `12`, que lo dicen
 * en su propia cabecera («Reemplaza: v2.5 / v2.0»). Un documento reemplazado no vuelve a
 * borrador ni asciende a material del dueño: es historia, y su cabecera nombra al sucesor.
 *
 * Ese día el estado entró en la tabla del README y en tres guías, pero NO en la lista literal
 * que había aquí, y `main` quedó rojo dos días. El #452 añadió el cuarto literal; esto quita la
 * segunda fuente, que era la causa: con una lista copiada, el próximo estado nuevo vuelve a
 * romper `main` del mismo modo. Ahora añadir un estado a la tabla lo habilita, y usar uno que la
 * tabla no declara sigue estando prohibido.
 */
function estadosDeLaTabla(): string[] {
  const readme = readFileSync(join(CARPETA, "README.md"), "utf8");
  return [...readme.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]!);
}
const ESTADOS = estadosDeLaTabla();

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

    // **Control positivo del lector de la tabla.** Si el README cambia de formato y la expresión
    // deja de casar, `ESTADOS` sale vacío y el guardia acusaría a TODOS los archivos —ruidoso,
    // pero indistinguible de un fallo real—. Esta línea dice cuál de las dos cosas pasó.
    expect(ESTADOS.length, `estados leídos del README: ${ESTADOS.join(" · ") || "NINGUNO"}`).toBeGreaterThanOrEqual(3);
    expect(ESTADOS, "la tabla del README tiene que declarar el estado base").toContain("material del dueño");
    expect(ESTADOS, "la regla del sucesor, más abajo, depende de este estado").toContain("reemplazado · no normativo");
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
    // Un reemplazado nombra a su sucesor: sin eso, «reemplazado» es una etiqueta
    // que esconde el documento en vez de encaminar a quien lo busca.
    if (declarados[0] === "reemplazado · no normativo") {
      expect(
        cabecera,
        `${nombre}: dice que está reemplazado y no nombra por qué documento`,
      ).toMatch(/reemplazo\s+:/);
    }

    if (declarados[0] === "borrador · pendiente de revisión") {
      expect(
        cabecera,
        `${nombre}: es un borrador sin revisar y no dice qué NO puede hacer`,
      ).toMatch(/qué NO\s+: nada automático/);
    }
  });
});
