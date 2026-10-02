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
 * - módulo → PRODUCTOR: lo que el módulo expone tiene que LLEGAR a la pantalla. Exponerlo en la API y que
 *   `CurvaDeLote` no lo lea deja la guía muerta un paso más allá de donde este guardia miraba (la revisión
 *   de Codex lo construyó: Daniel rellena la celda de `[3.50, 3.80)`, alguien la copia a `FILAS_DE_PH` y al
 *   `return`, y la pantalla sigue mostrando sólo el riesgo). El último `describe` de este archivo renderiza
 *   la pantalla con una guía forzada y exige que salga, literal.
 *
 * **«Expuesto» es POR ENTRADA, no por pertenencia a un conjunto.** Una versión de `revisar` juntaba los textos
 * de cada banda en un `Set` y comprobaba `textos.has(guia)`: devolver la guía en TODA la banda y devolverla sólo
 * cuando `ph === 3.6` daban las dos `problemas: []` (Codex lo reprodujo). Eso demuestra EXISTENCIA de una
 * respuesta, no PROPAGACIÓN. Ahora se cuenta, por banda, en cuántas de las lecturas barridas sale cada texto, y
 * una guía que no sale en todas cae.
 *
 * **Siete filas se pueden exponer; la de `[6.50, 8.00]` NO, y por eso su celda rellena TAMBIÉN hace
 * caer el guardia**: ADR-181 la retira y `riesgoDeEsperar` devuelve `null` en todo su rango, así que
 * su celda no se puede exponer nunca. Una celda rellena ahí es guía muerta en el `.md`, justo lo que
 * este guardia impide, y callar sería el punto ciego. El mensaje dice que es un caso distinto: no
 * falta cablear el campo, falta una decisión —revisar la retirada— antes de escribir guía en esa fila.
 * Una prueba comprueba que lo inalcanzable es esa fila y sólo esa.
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
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { curvaDeLote } from "../../lib/beneficio/curvaDeLote";
import { riesgoDeEsperar, type Riesgo } from "../../lib/beneficio/riesgoDeEsperar";

/**
 * Una guía que se fuerza SÓLO dentro de la prueba del consumidor (último `describe`): con `null`, `riesgoDeEsperar` es el real,
 * sin tocar. Es la forma de probar que la pantalla lee `queHaceElOperario` hoy, con las ocho celdas vacías, sin escribir ninguna
 * guía en el documento ni en el módulo.
 */
let guiaForzada: string | null = null;
vi.mock("../../lib/beneficio/riesgoDeEsperar", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/beneficio/riesgoDeEsperar")>();
  return {
    ...real,
    riesgoDeEsperar: (variable: string, valor: number, perfil: string | null) => {
      const r = real.riesgoDeEsperar(variable, valor, perfil);
      return r && guiaForzada !== null ? { ...r, queHaceElOperario: guiaForzada } : r;
    },
  };
});
// El simulacro de `next-intl/server` de `pantalla-del-tablero.test.ts`: `messages/es.json` y formato ICU real.
vi.mock("next-intl/server", async () => {
  const { IntlMessageFormat } = await import("intl-messageformat");
  const mensajes = (await import("../../messages/es.json")).default.SeccionBeneficio as Record<string, string>;
  return {
    getTranslations: async () => (clave: string, valores?: Record<string, unknown>) => {
      const m = mensajes[clave];
      if (m === undefined) throw new Error(`falta la clave «${clave}» en messages/es.json`);
      return String(new IntlMessageFormat(m, "es").format(valores as never));
    },
  };
});

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
  // **Por ENTRADA:** de cada banda se guarda cuántas lecturas del barrido cayeron en ella y en cuántas salió
  // cada texto, no un conjunto de textos (un conjunto da por cubierta una banda donde la guía sale en un solo pH).
  const expuesto = new Map<string, { entradas: number; porTexto: Map<string, number>; primeraSinGuia: number | null }>();
  for (let i = -2000; i <= 16000; i++) {
    const ph = i / 1000;
    const r = consultar(ph);
    if (!r) continue;
    const e = expuesto.get(r.banda) ?? { entradas: 0, porTexto: new Map<string, number>(), primeraSinGuia: null };
    e.entradas++;
    if (r.queHaceElOperario) e.porTexto.set(r.queHaceElOperario, (e.porTexto.get(r.queHaceElOperario) ?? 0) + 1);
    else if (e.primeraSinGuia === null) e.primeraSinGuia = ph;
    expuesto.set(r.banda, e);
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
    const e = expuesto.get(banda);
    if (!e) {
      fueraDeAlcance.push(banda);
      // Ninguna lectura de pH llega a esta fila: no hay dónde exponer su celda. Rellena, es guía
      // muerta, y arreglarlo no es cablear el campo.
      if ((fila[cGuia] ?? "") !== "") {
        problemas.push(
          `«${banda}»: la celda de «${COLUMNA}» está rellena y esta fila es INALCANZABLE: la retira ADR-181 (\`retiradaPor\` en lib/beneficio/riesgoDeEsperar.ts) y riesgoDeEsperar devuelve null en todo su rango, así que ninguna pantalla puede decir lo que escribas aquí. No es un olvido de código sino una decisión pendiente: escribir guía en esta fila exige revisar antes la retirada, y no basta con cablear queHaceElOperario`,
        );
      }
      continue;
    }
    alcanzadas.push(banda);
    const guia = fila[cGuia] ?? "";
    const enCuantas = e.porTexto.get(guia) ?? 0;
    if (guia !== "" && enCuantas === 0) {
      problemas.push(
        `«${banda}»: la celda de «${COLUMNA}» está rellena y riesgoDeEsperar no la expone en queHaceElOperario. Hay que tocar DOS sitios de lib/beneficio/riesgoDeEsperar.ts: (1) poner el texto, literal, en su fila de FILAS_DE_PH, y (2) cambiar el return de riesgoDeEsperar para que lo propague (hoy sólo devuelve banda y riesgo)`,
      );
    } else if (guia !== "" && enCuantas < e.entradas) {
      // Existe una respuesta con la guía, pero no en TODA la banda: es la «cubierta por pertenencia» que este guardia no acepta.
      problemas.push(
        `«${banda}»: la celda de «${COLUMNA}» está rellena y riesgoDeEsperar la expone sólo en ${enCuantas} de las ${e.entradas} lecturas de pH de esa banda (la primera sin guía: pH ${e.primeraSinGuia}): una guía que sale para unos valores de la banda y no para otros no está propagada, y lo que ve el productor dependería del pH`,
      );
    }
    const ajenos = [...e.porTexto.keys()].filter((t) => t !== guia);
    if (ajenos.length > 0) {
      problemas.push(
        `«${banda}»: riesgoDeEsperar expone «${ajenos.join(" | ")}» y la celda ${guia === "" ? "está vacía" : "dice otra cosa"}: guía que Daniel no ha dicho`,
      );
    }
  }
  for (const [banda, e] of expuesto) {
    if (!delDocumento.has(banda) && e.porTexto.size > 0) {
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

// La matriz es la del perfil `WASHED_STANDARD` (el título de §1): con otro perfil `riesgoDeEsperar` calla y este guardia no vería ninguna fila.
const consultarReal = (ph: number) => riesgoDeEsperar("ph", ph, "WASHED_STANDARD");

/** El módulo real SIN `queHaceElOperario`, pase lo que pase en el real: la base de los controles. */
const sinGuia = (ph: number): Riesgo | null => {
  const r = consultarReal(ph);
  return r && { perfil: r.perfil, banda: r.banda, riesgo: r.riesgo };
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
    // En un `beforeAll` y no al declararlo: si el documento pierde la columna, `vaciada` lanza, y
    // lanzar al recoger el archivo da «no tests» (algo que no cargó) en vez de pruebas que caen por nombre.
    let vacio = "";
    beforeAll(() => {
      vacio = vaciada(DOCUMENTO);
    });

    it("la base de los controles: documento vaciado y módulo sin guía pasan, con siete filas alcanzadas", () => {
      const r = revisar(vacio, sinGuia);
      expect(r.problemas).toEqual([]);
      expect(r.alcanzadas).toHaveLength(7);
      expect(r.fueraDeAlcance).toEqual([RETIRADA]);
      const m = matriz(vacio);
      expect(m.filas.every((f) => f[m.cabecera.indexOf(COLUMNA)] === "")).toBe(true);
    });

    it.each(real.alcanzadas)("celda rellena y no expuesta, fila «%s»: cae y dice cuál", (banda) => {
      const doc = conGuia(vacio, banda, MARCA);
      expect(doc).not.toBe(vacio);
      const { problemas } = revisar(doc, sinGuia);
      expect(problemas).toHaveLength(1);
      expect(problemas[0]).toContain(`«${banda}»`);
    });

    it("la fila retirada, rellena: cae, y el mensaje dice que es una decisión pendiente y no un olvido", () => {
      const doc = conGuia(vacio, RETIRADA, MARCA);
      expect(doc).not.toBe(vacio);
      const r = revisar(doc, sinGuia);
      expect(r.fueraDeAlcance).toEqual([RETIRADA]);
      expect(r.problemas).toHaveLength(1);
      expect(r.problemas[0]).toContain(`«${RETIRADA}»`);
      expect(r.problemas[0]).toContain("ADR-181");
      expect(r.problemas[0]).toContain("devuelve null en todo su rango");
      expect(r.problemas[0]).toContain("decisión pendiente");
      expect(r.problemas[0]).toContain("revisar antes la retirada");
    });

    it("el mensaje de una celda alcanzable sin exponer nombra los DOS sitios que hay que cambiar", () => {
      const { problemas } = revisar(conGuia(vacio, "[4.50, 5.20)", MARCA), sinGuia);
      expect(problemas).toHaveLength(1);
      expect(problemas[0]).toContain("FILAS_DE_PH");
      expect(problemas[0]).toContain("return de riesgoDeEsperar");
    });

    it("celda rellena Y expuesta, literal: NO cae (es el camino bueno)", () => {
      const doc = conGuia(vacio, "[4.50, 5.20)", MARCA);
      expect(doc).not.toBe(vacio);
      expect(revisar(doc, exponiendo({ "[4.50, 5.20)": MARCA })).problemas).toEqual([]);
    });

    // **Por entrada, no por pertenencia.** La mutación que Codex reprodujo en memoria: rellenar `[3.50, 3.80)` y comparar
    // devolver la guía en TODA la banda contra devolverla sólo cuando `ph === 3.6`. Con un `Set` por banda las dos daban `[]`.
    const BANDA_DEL_3_6 = "[3.50, 3.80)";
    const exponiendoDonde =
      (banda: string, texto: string, cuando: (ph: number) => boolean) =>
      (ph: number): Riesgo | null => {
        const r = sinGuia(ph);
        return r && r.banda === banda && cuando(ph) ? { ...r, queHaceElOperario: texto } : r;
      };

    it("la guía expuesta en TODA la banda no cae; expuesta sólo cuando ph === 3.6 SÍ cae y dice en cuántas lecturas", () => {
      const doc = conGuia(vacio, BANDA_DEL_3_6, MARCA);
      expect(doc).not.toBe(vacio);
      // Control positivo: en toda la banda, pasa. Sin él, «cae» de abajo podría ser «cae siempre».
      expect(revisar(doc, exponiendoDonde(BANDA_DEL_3_6, MARCA, () => true)).problemas).toEqual([]);
      // La mutación de Codex: sólo en 3,6.
      const { problemas } = revisar(doc, exponiendoDonde(BANDA_DEL_3_6, MARCA, (ph) => ph === 3.6));
      expect(problemas).toHaveLength(1);
      expect(problemas[0]).toContain(`«${BANDA_DEL_3_6}»`);
      expect(problemas[0]).toContain("sólo en 1 de las");
      expect(problemas[0]).toContain("la primera sin guía");
    });

    it("la guía que falta sólo en el primer pH de la banda, o sólo en el último, también cae", () => {
      const doc = conGuia(vacio, BANDA_DEL_3_6, MARCA);
      // El borde inferior es de la banda (3.50) y el superior ya es de la siguiente (3.799 es el último milésimo de ésta).
      for (const [nombre, omite] of [["el primero (3.5)", (ph: number) => ph !== 3.5], ["el último (3.799)", (ph: number) => ph !== 3.799]] as const) {
        const { problemas } = revisar(doc, exponiendoDonde(BANDA_DEL_3_6, MARCA, omite));
        expect(problemas, `falta sólo en ${nombre}`).toHaveLength(1);
        expect(problemas[0]).toContain("sólo en");
      }
    });

    it("las siete celdas alcanzables rellenas y expuestas, literal: NO cae", () => {
      const textos = Object.fromEntries(real.alcanzadas.map((b) => [b, `${MARCA} / ${b}`]));
      const doc = real.alcanzadas.reduce((d, b) => conGuia(d, b, `${MARCA} / ${b}`), vacio);
      expect(doc).not.toBe(vacio);
      expect(revisar(doc, exponiendo(textos)).problemas).toEqual([]);
    });

    it("las ocho rellenas y las siete alcanzables expuestas: cae sólo por la retirada", () => {
      const textos = Object.fromEntries(real.alcanzadas.map((b) => [b, `${MARCA} / ${b}`]));
      const doc = [...real.alcanzadas, RETIRADA].reduce((d, b) => conGuia(d, b, `${MARCA} / ${b}`), vacio);
      const { problemas } = revisar(doc, exponiendo(textos));
      expect(problemas).toHaveLength(1);
      expect(problemas[0]).toContain(`«${RETIRADA}»`);
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

/**
 * **El consumidor: la pantalla pinta lo que `riesgoDeEsperar` expone.**
 *
 * Todo lo de arriba mide documento ↔ módulo. Esto mide módulo → productor: se fuerza una guía en lo que devuelve
 * `riesgoDeEsperar` (con las ocho celdas vacías no hay otra manera de ver el camino) y se renderiza `CurvaDeLote`
 * como la función de servidor `async` que es. **Es una prueba de CONDUCTA, no de fuente:** no busca el token
 * `queHaceElOperario` en el archivo del componente —un componente que lo declara o lo extrae y no lo pinta lo
 * satisfaría—, sino que la frase **salga en el HTML**. La mutación que la hace caer quita la rama que la pinta.
 *
 * Alcance, dicho: sólo las bandas que la pantalla PINTA (`BANDAS_QUE_SE_PINTAN`): `[5.20, 6.50)`, `[4.50, 5.20)`,
 * `[3.50, 3.80)`, `[3.30, 3.50)` y `< 3.30`. En las otras dos alcanzables —`[3.80, 4.50)` y «fuera de `[2.50, 8.00]`»— el
 * bloque calla a propósito (falsa seguridad y avería del sensor), así que la guía que Daniel escribiera ahí no llegaría a
 * nadie: eso no lo mide este guardia, y está dicho en el informe de la oleada.
 */
describe("el consumidor: CurvaDeLote pinta queHaceElOperario cuando riesgoDeEsperar lo expone", () => {
  const ID = "3f2b6c1e-8a44-4d0e-9b57-0c1d2e3f4a5b";
  const aTexto = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  /** Un pH de cada banda que la pantalla pinta, con su banda (control de que se llega a la que se dice). */
  const PINTADAS = [
    { valor: 6.0, banda: "[5.20, 6.50)" },
    { valor: 5.0, banda: "[4.50, 5.20)" },
    { valor: 3.7, banda: "[3.50, 3.80)" },
    { valor: 3.4, banda: "[3.30, 3.50)" },
    { valor: 3.0, banda: "< 3.30" },
  ] as const;

  async function pintar(valor: number): Promise<string> {
    const { CurvaDeLote } = await import("../../app/components/beneficio/CurvaDeLote");
    const curva = curvaDeLote({
      lecturas: [{ occurredAt: new Date("2026-03-10T10:00:00.000Z"), value: valor }],
      objetivo: { minValue: 4.0, maxValue: 4.6, targetValue: 4.3 },
      ancho: 480,
      alto: 200,
    });
    return renderToStaticMarkup(
      await CurvaDeLote({ pedida: { lotId: ID, variable: "ph" }, curva, codigoDelLote: "G-1", perfilDelLote: "WASHED_STANDARD" }),
    );
  }
  const parrafoDeGuia = (html: string) => /<p[^>]*nn-curva-riesgo-guia[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? null;

  it("control: sin guía forzada, el bloque está y NO hay párrafo de guía (hoy las ocho celdas están vacías)", async () => {
    for (const f of PINTADAS) {
      expect(consultarReal(f.valor)?.banda, `pH ${f.valor}`).toBe(f.banda); // llega a la banda que se dice
      const html = await pintar(f.valor);
      expect(aTexto(html), `pH ${f.valor}: el bloque debe estar`).toContain("Criterio de Néctar Nómada");
      expect(parrafoDeGuia(html), `pH ${f.valor}`).toBeNull();
      expect(aTexto(html), `pH ${f.valor}`).not.toContain(MARCA);
    }
  });

  it.each(PINTADAS)("pH $valor ($banda): la guía que expone el módulo SALE en la pantalla, literal", async ({ valor }) => {
    guiaForzada = MARCA;
    try {
      const html = await pintar(valor);
      expect(aTexto(html), "el bloque sigue estando").toContain("Criterio de Néctar Nómada");
      const parrafo = parrafoDeGuia(html);
      expect(parrafo, "debe haber un párrafo de guía").not.toBeNull();
      expect(aTexto(parrafo!)).toBe(MARCA);
      // Y sólo una vez: la guía no se duplica ni se cuela en la cita ni en el <details>.
      expect(aTexto(html).split(MARCA).length - 1).toBe(1);
    } finally {
      guiaForzada = null;
    }
    // MUTACIÓN: quitar `{guia ? <p …>{conEnfasis(guia)}</p> : null}` de `CurvaDeLote.tsx` (dejando `const guia` y el campo expuesto) → cae.
  });

  it("una guía vacía o sólo de espacios no escribe nada: «sin registro» no es una frase", async () => {
    for (const vacia of ["", "   "]) {
      guiaForzada = vacia;
      try {
        const html = await pintar(3.7);
        expect(parrafoDeGuia(html), JSON.stringify(vacia)).toBeNull();
        expect(aTexto(html)).toContain("Criterio de Néctar Nómada"); // el bloque sí
      } finally {
        guiaForzada = null;
      }
    }
  });
});
