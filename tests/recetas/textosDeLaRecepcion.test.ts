/**
 * Los tres textos de la recepción que los avisos dejan ciertos — Parte 2a, tarea 12 (2026-10-16).
 *
 * **Por qué existe.** El PR-A reescribió tres textos para que dijeran sólo lo cierto con él (rondas F1-4 y F1-3 del cierre): la ayuda de las metas de
 * un paso `reception` (`recetaEditor_metasDeRecepcionAyuda`), el error de una meta que no cabe (`error_receta_meta_de_recepcion_no_se_vigila`) y la
 * definición sembrada de `tipo_paso.reception`. Los tres evitaban la palabra «compara» porque NADA leía la meta: «Ningún registro del proceso la
 * cumple» y punto. Desde esta tarea `avisosDeRecepcion` (`lib/recetas/recepcion.ts`) compara cada recepción de cereza de la ascendencia del lote con la
 * banda de Brix de ese paso, y dice cuando la receta no declara el paso o el paso no trae banda (PE-77/78). Los textos se reescriben, mínimos, con lo que
 * esa lectura hace de verdad y con lo que NO hace (docs/beneficio/21_rubrica_veracidad.md).
 *
 * **Lo que dicen, y de dónde sale cada afirmación.**
 * - «Sólo se compara el Brix»: el módulo selecciona de la recepción `id`, `recibidaAt` y `brix`, y nada más; masa, mezcla de madurez, flotadores y
 *   temperatura no se leen. Esta prueba LEE la fuente del módulo y lo comprueba, para que un texto que dice «sólo el Brix» no sobreviva a un módulo que
 *   empiece a leer otra columna.
 * - «El Mínimo y el Máximo que pongas», «un Objetivo sin ninguno de los dos no es una banda»: son los rótulos de la interfaz (`recipeMinLabel`,
 *   `recipeMaxLabel`, `recipeTargetValueLabel`, que se LEEN de `messages`), y el módulo sólo toma como banda una meta con al menos un límite.
 * - «El aviso lo dice»: la lista de tipos del módulo trae `paso_de_recepcion_sin_banda`.
 * - «Avisa sin bloquear»: ningún texto promete rechazar, impedir ni exigir nada.
 *
 * **Lo que NO dicen, a propósito y comprobado:** dónde se ve el aviso. Esa pantalla es de la tarea 13 (`avisosParaLaPagina`); nombrarla aquí sería
 * afirmar algo que este árbol todavía no construye. Cuando la 13 la entregue, estos tres textos pueden nombrarla y esta prueba cambia con ellos.
 *
 * **Qué fija.** (1) La frase exacta de cada texto, en los dos idiomas (la definición sembrada sólo está en español: los catálogos no se traducen).
 * (2) Que ninguno sea el del PR-A, con el control de que el detector sí distingue el viejo del nuevo. (3) Que lo que afirman lo sostiene el módulo.
 * (4) Que no prometan de más: ni bloquear, ni una pantalla, ni comparar lo que el módulo no lee.
 *
 * Hermética: lee `messages/*.json`, el catálogo y la fuente del módulo (como texto, sin importarlo: importarlo traería la base); no toca la base.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VARIABLE_CATALOGS } from "../../lib/research/catalogs";

const traceability = (idioma: "es" | "en") => JSON.parse(readFileSync(`messages/${idioma}.json`, "utf8")).Traceability as Record<string, string>;
const es = traceability("es");
const en = traceability("en");
const definicion = VARIABLE_CATALOGS.find((c) => c.key === "tipo_paso")?.values.find((v) => v.value === "reception")?.definition ?? "";
const modulo = readFileSync("lib/recetas/recepcion.ts", "utf8");

const CLAVES = ["recetaEditor_metasDeRecepcionAyuda", "error_receta_meta_de_recepcion_no_se_vigila"] as const;

const FRASES: Record<(typeof CLAVES)[number], { es: string; en: string }> = {
  recetaEditor_metasDeRecepcionAyuda: {
    es: "En una recepción la meta es el Brix al llegar, y es una sola. Cada recepción de la que viene el lote se compara con el Mínimo y el Máximo que pongas; un Objetivo sin ninguno de los dos no es una banda, y el aviso lo dice. De la recepción sólo se compara el Brix, y la comparación avisa sin bloquear.",
    en: "In a reception the target is the Brix on arrival, and there is only one. Each reception the lot comes from is compared with the Minimum and Maximum you set; a Target with neither is not a band, and the notice says so. Only the Brix of a reception is compared, and the comparison warns without blocking.",
  },
  error_receta_meta_de_recepcion_no_se_vigila: {
    es: "En un paso de recepción sólo cabe la meta de Brix inicial, porque es lo único de la recepción que se compara.",
    en: "A reception step only takes the initial Brix target, because it is the only thing about a reception that is compared.",
  },
};

const DEFINICION =
  "Recepción de la cereza: masa, °Brix, mezcla de madurez, flotadores y temperatura al llegar (paquete, R6 §7.2). Ningún registro del proceso la cumple. De todo eso la receta sólo compara el Brix: cada recepción de la que viene el lote contra el Mínimo y el Máximo de la meta de Brix inicial de este paso. La masa, la mezcla de madurez, los flotadores y la temperatura no se comparan con nada.";

/** Los textos que el PR-A dejó, ciertos sólo con él: nada leía la meta de una recepción. */
const DEL_PR_A = {
  ayuda: { es: "En una recepción la meta es el Brix al llegar, y es una sola.", en: "In a reception the target is the Brix on arrival, and there is only one." },
  error: {
    es: "En un paso de recepción sólo cabe la meta de Brix inicial.",
    en: "A reception step only takes the initial Brix target.",
  },
  definicion:
    "Recepción de la cereza: masa, °Brix, mezcla de madurez, flotadores y temperatura al llegar (paquete, R6 §7.2). Ningún registro del proceso la cumple.",
};

/**
 * Los textos VIGENTES —los de `messages` y el catálogo, no las frases de arriba—, con su idioma, para las comprobaciones que valen igual para todos. Las frases
 * exactas las fija la primera prueba; las demás miran lo que de verdad está escrito, de modo que un texto cambiado sin cambiar la frase de arriba no pueda
 * esconder una promesa de más (el flip de la tarea 12 lo enseñó: con las frases en este arreglo, tres mutaciones del texto vigente no hacían caer estas pruebas).
 */
const TEXTOS: ReadonlyArray<readonly [string, string]> = [
  ["ayuda es", es.recetaEditor_metasDeRecepcionAyuda ?? ""],
  ["ayuda en", en.recetaEditor_metasDeRecepcionAyuda ?? ""],
  ["error es", es.error_receta_meta_de_recepcion_no_se_vigila ?? ""],
  ["error en", en.error_receta_meta_de_recepcion_no_se_vigila ?? ""],
  ["definición es", definicion],
];

describe("los tres textos de la recepción dicen lo que los avisos hacen", () => {
  it("la frase exacta de cada uno, en los dos idiomas", () => {
    for (const clave of CLAVES) {
      expect(es[clave], `es: ${clave}`).toBe(FRASES[clave].es);
      expect(en[clave], `en: ${clave}`).toBe(FRASES[clave].en);
    }
    expect(definicion, "la definición sembrada de tipo_paso.reception").toBe(DEFINICION);
  });

  it("ninguno es ya el del PR-A: el detector distingue el viejo del nuevo, y los tres siguen más allá de él", () => {
    // Control del detector: cada texto del PR-A es uno de ellos mismo, y no es el nuevo.
    for (const [viejo, nuevo] of [
      [DEL_PR_A.ayuda.es, es.recetaEditor_metasDeRecepcionAyuda],
      [DEL_PR_A.ayuda.en, en.recetaEditor_metasDeRecepcionAyuda],
      [DEL_PR_A.error.es, es.error_receta_meta_de_recepcion_no_se_vigila],
      [DEL_PR_A.error.en, en.error_receta_meta_de_recepcion_no_se_vigila],
      [DEL_PR_A.definicion, definicion],
    ] as const) {
      expect(nuevo, "el texto vigente no es el del PR-A").not.toBe(viejo);
      expect(nuevo!.length, "dice más que el del PR-A: lo que se compara").toBeGreaterThan(viejo.length);
      expect(nuevo!.startsWith(viejo.replace(/\.$/, "")), "conserva lo que ya era cierto").toBe(true);
    }
    // Y el del PR-A, tal cual, no contiene lo que ahora se afirma: sin esto, «no es el viejo» no distinguiría nada.
    for (const viejo of [DEL_PR_A.ayuda.es, DEL_PR_A.error.es, DEL_PR_A.definicion]) expect(viejo).not.toMatch(/compara/);
    for (const viejo of [DEL_PR_A.ayuda.en, DEL_PR_A.error.en]) expect(viejo).not.toMatch(/compared/);
  });

  it("dicen que se compara y que sólo se compara el Brix, en los dos idiomas", () => {
    for (const [nombre, texto] of TEXTOS) {
      expect(texto, nombre).toMatch(/Brix/);
      expect(texto, nombre).toMatch(/compara|compared/);
    }
    expect(es.recetaEditor_metasDeRecepcionAyuda).toMatch(/sólo se compara el Brix/);
    expect(en.recetaEditor_metasDeRecepcionAyuda).toMatch(/Only the Brix of a reception is compared/);
    expect(definicion).toMatch(/sólo compara el Brix/);
  });

  it("lo que dicen de la lectura lo sostiene el módulo: de la recepción sólo lee id, fecha y Brix, y sólo toma como banda una meta con límite", () => {
    // Control: la fuente se leyó y es la del módulo.
    expect(modulo, "se leyó la fuente de lib/recetas/recepcion.ts").toMatch(/export async function avisosDeRecepcion/);
    // De la recepción, sólo estas tres columnas. Si el módulo empieza a leer otra (el neto, la temperatura…), «sólo se compara el Brix» deja de ser cierto.
    expect(modulo).toContain("recepcion: { select: { id: true, recibidaAt: true, brix: true } }");
    // La banda: la meta `brix` de momento `initial`, con al menos un límite.
    expect(modulo).toContain('variable: "brix", moment: "initial", OR: [{ minValue: { not: null } }, { maxValue: { not: null } }]');
    // «El aviso lo dice»: el tipo de aviso del paso sin banda existe en la lista del módulo.
    const lista = /export const TIPOS_DE_AVISO_DE_RECEPCION = \[([^\]]*)\] as const/.exec(modulo)?.[1] ?? "";
    expect(lista, "control: se leyó la lista de tipos").toContain("brix_fuera_de_la_banda");
    expect(lista).toContain("paso_de_recepcion_sin_banda");
  });

  it("los rótulos que el texto nombra son los de la interfaz", () => {
    expect(es.recipeMinLabel).toBe("Mínimo");
    expect(es.recipeMaxLabel).toBe("Máximo");
    expect(es.recipeTargetValueLabel).toBe("Objetivo");
    expect(en.recipeMinLabel).toBe("Minimum");
    expect(en.recipeMaxLabel).toBe("Maximum");
    expect(en.recipeTargetValueLabel).toBe("Target");
    for (const texto of [es.recetaEditor_metasDeRecepcionAyuda!, definicion]) {
      expect(texto).toContain(es.recipeMinLabel!);
      expect(texto).toContain(es.recipeMaxLabel!);
    }
    expect(es.recetaEditor_metasDeRecepcionAyuda).toContain(es.recipeTargetValueLabel!);
    expect(en.recetaEditor_metasDeRecepcionAyuda).toContain(en.recipeMinLabel!);
    expect(en.recetaEditor_metasDeRecepcionAyuda).toContain(en.recipeMaxLabel!);
    expect(en.recetaEditor_metasDeRecepcionAyuda).toContain(en.recipeTargetValueLabel!);
  });

  it("no prometen de más: ni bloquear, ni una pantalla que la tarea 13 todavía no entrega, ni comparar lo que el módulo no lee", () => {
    for (const [nombre, texto] of TEXTOS) {
      // Bloquear sólo aparece negado.
      expect(texto.replace(/sin bloquear|without blocking/g, ""), `${nombre}: no promete bloquear`).not.toMatch(/bloque|block/i);
      expect(texto, `${nombre}: no promete rechazar, impedir ni exigir`).not.toMatch(/rechaz|impid|obliga|exige|reject|prevent|require/i);
      // La pantalla donde se vea el aviso es de la tarea 13.
      expect(texto, `${nombre}: no nombra una pantalla`).not.toMatch(/pantalla|ficha|tablero|Beneficio|Secado|screen|board|\bMill\b|\bDrying\b/i);
    }
    // La masa, la mezcla de madurez, los flotadores y la temperatura sólo aparecen para decir que NO se comparan.
    const resto = definicion.slice(definicion.indexOf("De todo eso"));
    expect(resto).toMatch(/La masa, la mezcla de madurez, los flotadores y la temperatura no se comparan con nada\.$/);
    const sinElResto = resto.replace(/La masa, la mezcla de madurez, los flotadores y la temperatura no se comparan con nada\.$/, "");
    expect(sinElResto, "fuera de esa frase no se nombra ninguna de las otras cuatro cosas").not.toMatch(/masa|madurez|flotadores|temperatura/);
    // Control de la comprobación: sobre la parte que SÍ nombra las cuatro, el detector las encuentra.
    expect(resto).toMatch(/masa/);
  });
});
