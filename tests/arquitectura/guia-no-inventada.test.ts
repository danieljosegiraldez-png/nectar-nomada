/**
 * La guía de «Qué hace el operario» no se inventa, y no se queda muerta en un `.md`.
 *
 * **El hueco.** La matriz de `docs/beneficio/10_ph_fermentation.md` §1 tiene una columna «Qué hace
 * el operario» con las ocho celdas vacías: la columna «Acción del software» dice lo que hace el
 * PROGRAMA, y ninguna fuente del proyecto dice lo que hace la persona. **Las celdas las rellena
 * Daniel**, no quien edite el código. Hasta entonces la pantalla no dice qué hacer (rúbrica 21 §4:
 * una guía con falsa seguridad es peor que devolver la decisión al productor).
 *
 * **Lo que esto fija, en las dos direcciones:**
 * - documento → módulo: una celda RELLENA tiene que estar expuesta, literal, en
 *   `queHaceElOperario` de `riesgoDeEsperar`. Si no, la guía de Daniel se queda muerta en el `.md`
 *   y la pantalla sigue sin decirla, sin que nada avise.
 * - módulo → documento: `queHaceElOperario` sólo puede decir lo que la celda dice. Si no, alguien
 *   escribió guía en el código que Daniel no ha dicho: justo lo que la rúbrica prohíbe.
 *
 * **ALCANCE: siete filas de las ocho. La de `[6.50, 8.00]` queda fuera**: ADR-181 la retira y
 * `riesgoDeEsperar` devuelve `null` en todo su rango, así que su celda no se puede exponer nunca y
 * esta prueba no la mira. Una prueba lo comprueba: lo fuera de alcance es esa fila y sólo esa.
 *
 * **Mientras las ocho celdas estén vacías, el guardia pasa POR CONSTRUCCIÓN**: con el documento de
 * hoy no hay nada que pueda fallar. Por eso `revisar` es una función que recibe el documento, y los
 * controles de abajo se la dan ALTERADO en memoria —una celda rellena, una fila corta, una columna
 * que falta— y exigen que caiga. Sin ellos, este archivo sería un verde que no demuestra nada.
 * El texto con que se rellenan es una marca, no guía: aquí no se escribe ninguna.
 *
 * **Los controles parten del documento VACIADO y del módulo SIN guía, nunca de los reales.** Si
 * partieran de los reales, el día que Daniel rellene una celda y el módulo la recoja —el camino que
 * este archivo existe para dejar pasar— los controles dejarían de decir lo que dicen y el archivo
 * caería por el camino bueno. Medido con una celda rellena y expuesta: de 16 pruebas, 4 caían.
 *
 * Una celda cuenta como rellena si tiene cualquier cosa que no sea espacio, un guion incluido: lo
 * que Daniel escriba es respuesta suya y el módulo lo devuelve tal cual.
 *
 * Hermética: lee un archivo, no toca la base.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { riesgoDeEsperar, type Riesgo } from "../../lib/beneficio/riesgoDeEsperar";

const RAIZ = new URL("../..", import.meta.url).pathname;
const DOCUMENTO = readFileSync(join(RAIZ, "docs/beneficio/10_ph_fermentation.md"), "utf8");

const COLUMNA = "Qué hace el operario";
const MARCA = "MARCA DE PRUEBA, no es guía";
const RETIRADA = "[6.50, 8.00]";

const celdas = (linea: string) => linea.split("|").slice(1, -1).map((c) => c.trim());
const esCabecera = (linea: string) => /^\|\s*Banda\s*\|/.test(linea);
const sinTicks = (s: string) => s.replaceAll("`", "");

/** La tabla bajo la cabecera «Banda»: sus celdas por fila, sin la línea separadora. */
function matriz(documento: string): { cabecera: string[]; filas: string[][] } {
  const lineas = documento.split("\n");
  const i = lineas.findIndex(esCabecera);
  if (i < 0) return { cabecera: [], filas: [] };
  const filas: string[][] = [];
  for (const l of lineas.slice(i + 2)) {
    if (!l.startsWith("|")) break;
    filas.push(celdas(l));
  }
  return { cabecera: celdas(lineas[i] ?? ""), filas };
}

/**
 * El guardia. `consultar` es la función pública del módulo (o una alterada, en los controles).
 * Devuelve qué falla, qué filas alcanzó y cuáles no: vacío en `problemas` es que pasa.
 */
function revisar(documento: string, consultar: (ph: number) => Riesgo | null) {
  const { cabecera, filas } = matriz(documento);
  const cBanda = cabecera.indexOf("Banda");
  const cGuia = cabecera.indexOf(COLUMNA);
  if (cBanda < 0 || cGuia < 0) {
    return {
      problemas: [`la tabla no tiene la columna «${cBanda < 0 ? "Banda" : COLUMNA}»`],
      alcanzadas: [] as string[],
      fueraDeAlcance: [] as string[],
    };
  }

  // Lo que el módulo expone, por banda, barriendo la API pública de −2 a 16 en milésimas (enteros,
  // para que el coma flotante no derive). Un texto vacío, `null` o ausente es «nada expuesto».
  const expuesto = new Map<string, Set<string>>();
  for (let i = -2000; i <= 16000; i++) {
    const r = consultar(i / 1000);
    if (!r) continue;
    const textos = expuesto.get(r.banda) ?? new Set<string>();
    if (r.queHaceElOperario) textos.add(r.queHaceElOperario);
    expuesto.set(r.banda, textos);
  }

  const problemas: string[] = [];
  const alcanzadas: string[] = [];
  const fueraDeAlcance: string[] = [];
  const delDocumento = new Set<string>();
  for (const fila of filas) {
    const banda = sinTicks(fila[cBanda] ?? "");
    delDocumento.add(banda);
    // Una fila corta NO es una celda vacía: sin esto, `fila[cGuia]` sería `undefined` y se leería
    // como «sin guía», que es el veredicto que halaga al guardia.
    if (fila.length !== cabecera.length) {
      problemas.push(`«${banda}»: la fila tiene ${fila.length} celdas y la cabecera ${cabecera.length}`);
      continue;
    }
    const textos = expuesto.get(banda);
    if (!textos) {
      fueraDeAlcance.push(banda);
      continue;
    }
    alcanzadas.push(banda);
    const guia = fila[cGuia] ?? "";
    if (guia !== "" && !textos.has(guia)) {
      problemas.push(
        `«${banda}»: la celda de «${COLUMNA}» está rellena y riesgoDeEsperar no la expone en queHaceElOperario (ponla, literal, en su fila de lib/beneficio/riesgoDeEsperar.ts y devuélvela)`,
      );
    }
    const ajenos = [...textos].filter((t) => t !== guia);
    if (ajenos.length > 0) {
      problemas.push(
        `«${banda}»: riesgoDeEsperar expone «${ajenos.join(" | ")}» y la celda ${guia === "" ? "está vacía" : "dice otra cosa"}: guía que Daniel no ha dicho`,
      );
    }
  }
  for (const [banda, textos] of expuesto) {
    if (!delDocumento.has(banda) && textos.size > 0) {
      problemas.push(`«${banda}»: riesgoDeEsperar expone guía para una banda que el documento no tiene`);
    }
  }
  return { problemas, alcanzadas, fueraDeAlcance };
}

/**
 * Una copia en memoria del documento con la fila de `banda` reescrita por `f` sobre sus partes
 * (las de `split("|")`; la celda de la columna es `partes[iGuia]`). Aborta si no toca UNA fila.
 */
function editarFila(documento: string, banda: string, f: (partes: string[], iGuia: number) => void): string {
  const lineas = documento.split("\n");
  const i = lineas.findIndex(esCabecera);
  const cabecera = celdas(lineas[i] ?? "");
  const cBanda = cabecera.indexOf("Banda");
  const cGuia = cabecera.indexOf(COLUMNA);
  if (i < 0 || cBanda < 0 || cGuia < 0) throw new Error(`editarFila: el documento no tiene la tabla o la columna «${COLUMNA}»`);
  let tocadas = 0;
  for (let j = i + 2; j < lineas.length && (lineas[j] ?? "").startsWith("|"); j++) {
    const partes = (lineas[j] ?? "").split("|");
    if (sinTicks((partes[cBanda + 1] ?? "").trim()) === banda) {
      f(partes, cGuia + 1);
      lineas[j] = partes.join("|");
      tocadas++;
    }
  }
  if (tocadas !== 1) throw new Error(`editarFila tocó ${tocadas} filas de «${banda}», no 1`);
  return lineas.join("\n");
}

const conGuia = (documento: string, banda: string, texto: string) =>
  editarFila(documento, banda, (p, i) => {
    p[i] = texto === "" ? " " : ` ${texto} `;
  });

/** Quita la última celda de la fila: queda más corta que la cabecera. */
const sinUltimaCelda = (documento: string, banda: string) =>
  editarFila(documento, banda, (p) => {
    p.splice(p.length - 2, 1);
  });

/** El documento real con TODAS las celdas de la columna vacías: la base de los controles. */
function vaciada(documento: string): string {
  const { cabecera, filas } = matriz(documento);
  const cBanda = cabecera.indexOf("Banda");
  return filas.reduce((doc, f) => conGuia(doc, sinTicks(f[cBanda] ?? ""), ""), documento);
}

const consultarReal = (ph: number) => riesgoDeEsperar("ph", ph);

/** El módulo real SIN `queHaceElOperario`, pase lo que pase en el real: la base de los controles. */
const sinGuia = (ph: number): Riesgo | null => {
  const r = riesgoDeEsperar("ph", ph);
  return r && { banda: r.banda, riesgo: r.riesgo };
};

/** `sinGuia` con `queHaceElOperario` añadido a las bandas que se digan. */
const exponiendo =
  (textos: Record<string, string | null>) =>
  (ph: number): Riesgo | null => {
    const r = sinGuia(ph);
    return r && r.banda in textos ? { ...r, queHaceElOperario: textos[r.banda] } : r;
  };

describe("la guía «Qué hace el operario» de 10_ph_fermentation.md §1", () => {
  const { cabecera, filas } = matriz(DOCUMENTO);
  const real = revisar(DOCUMENTO, consultarReal);

  it("control positivo: se leyó la tabla, la columna existe y las ocho filas la traen entera", () => {
    // Sin esto, «sin problemas» pasaría con CERO filas leídas: una tabla no encontrada es una lista
    // vacía y comparar nada con nada es verde.
    expect(cabecera, "cabecera de la tabla no encontrada").toContain("Banda");
    expect(cabecera, `columnas leídas: ${cabecera.join(" | ")}`).toContain(COLUMNA);
    expect(filas, `filas leídas: ${filas.map((f) => f[0]).join(" | ")}`).toHaveLength(8);
    expect(filas.filter((f) => f.length !== cabecera.length)).toEqual([]);
    expect(sinTicks(filas[0]?.[0] ?? "")).toBe(RETIRADA);
  });

  it("alcance: cubre siete filas, y la única fuera de su alcance es la que ADR-181 retira", () => {
    // Si alguien devuelve la fila retirada, o hace inalcanzable otra, esta aserción cae: lo que el
    // comentario de arriba declara tiene que seguir siendo cierto.
    expect(real.alcanzadas, `alcanzadas: ${real.alcanzadas.join(" | ")}`).toHaveLength(7);
    expect(real.fueraDeAlcance).toEqual([RETIRADA]);
  });

  it("una celda rellena está expuesta por riesgoDeEsperar, y lo expuesto es lo que dice la celda", () => {
    expect(real.problemas).toEqual([]);
  });

  describe("controles: con el documento alterado en memoria, el guardia SÍ cae", () => {
    // **Parten del documento VACIADO y del módulo SIN guía, no del real.** Si partieran del real,
    // el día que Daniel rellene una celda y el módulo la recoja —que es justo el camino que este
    // archivo quiere dejar pasar— los controles dejarían de ser lo que dicen y el archivo caería
    // por el camino bueno. Lo que pase en el documento y en el módulo reales sólo lo mide la
    // prueba de arriba.
    const vacio = vaciada(DOCUMENTO);

    it("la base de los controles: documento vaciado y módulo sin guía pasan, con siete filas alcanzadas", () => {
      const r = revisar(vacio, sinGuia);
      expect(r.problemas).toEqual([]);
      expect(r.alcanzadas).toHaveLength(7);
      expect(r.fueraDeAlcance).toEqual([RETIRADA]);
      expect(matriz(vacio).filas.every((f) => f[matriz(vacio).cabecera.indexOf(COLUMNA)] === "")).toBe(true);
    });

    it.each(real.alcanzadas)("celda rellena y no expuesta, fila «%s»: cae y dice cuál", (banda) => {
      const doc = conGuia(vacio, banda, MARCA);
      expect(doc).not.toBe(vacio);
      const { problemas } = revisar(doc, sinGuia);
      expect(problemas).toHaveLength(1);
      expect(problemas[0]).toContain(`«${banda}»`);
    });

    it("la fila retirada, rellena: NO cae, y es el límite que el comentario declara", () => {
      const doc = conGuia(vacio, RETIRADA, MARCA);
      expect(doc).not.toBe(vacio);
      const r = revisar(doc, sinGuia);
      expect(r.problemas).toEqual([]);
      expect(r.fueraDeAlcance).toEqual([RETIRADA]);
    });

    it("celda rellena Y expuesta, literal: NO cae (es el camino bueno)", () => {
      const doc = conGuia(vacio, "[4.50, 5.20)", MARCA);
      expect(doc).not.toBe(vacio);
      expect(revisar(doc, exponiendo({ "[4.50, 5.20)": MARCA })).problemas).toEqual([]);
    });

    it("las ocho celdas rellenas y las siete alcanzables expuestas, literal: NO cae", () => {
      const textos = Object.fromEntries(real.alcanzadas.map((b) => [b, `${MARCA} / ${b}`]));
      const doc = [...real.alcanzadas, RETIRADA].reduce((d, b) => conGuia(d, b, `${MARCA} / ${b}`), vacio);
      expect(doc).not.toBe(vacio);
      expect(revisar(doc, exponiendo(textos)).problemas).toEqual([]);
    });

    it("el módulo expone guía y la celda está vacía: cae", () => {
      const { problemas } = revisar(vacio, exponiendo({ "[4.50, 5.20)": MARCA }));
      expect(problemas).toHaveLength(1);
      expect(problemas[0]).toContain("[4.50, 5.20)");
      expect(problemas[0]).toContain("que Daniel no ha dicho");
    });

    it("el módulo expone otra cosa que la celda: cae", () => {
      const doc = conGuia(vacio, "[4.50, 5.20)", MARCA);
      const { problemas } = revisar(doc, exponiendo({ "[4.50, 5.20)": `${MARCA} (y algo más)` }));
      // Dos problemas, y los dos reales: la celda no está expuesta, y lo expuesto no es la celda.
      expect(problemas).toHaveLength(2);
    });

    it("una fila con menos celdas que la cabecera cae, no se lee como celda vacía", () => {
      const doc = sinUltimaCelda(vacio, "< 3.30");
      expect(doc).not.toBe(vacio);
      const { problemas } = revisar(doc, sinGuia);
      expect(problemas).toHaveLength(1);
      expect(problemas[0]).toContain("< 3.30");
    });

    it("sin la columna cae, no pasa vacío", () => {
      const doc = vacio.replace(`| ${COLUMNA} |`, "| Otra cosa |");
      expect(doc).not.toBe(vacio);
      const { problemas } = revisar(doc, sinGuia);
      expect(problemas).toHaveLength(1);
      expect(problemas[0]).toContain(COLUMNA);
    });
  });
});
