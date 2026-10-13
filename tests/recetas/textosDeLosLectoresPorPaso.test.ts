/**
 * Los tres textos que la lectura por paso deja ciertos — Parte 2a, tarea 9 (2026-10-13).
 *
 * **Por qué existe.** El PR-A reescribió tres textos de interfaz para que dijeran sólo lo cierto con él (rondas H1 de la 14 y F1-3 del cierre):
 * `recipesIntro` y `recetaEditor_publicadaIntro` ya no decían que «lo que se registre se une a sus pasos» ni que las corridas «siguen
 * comparándose contra estos pasos», y `recetaEditor_metaCadaHorasAyuda` decía que «todavía ninguna pantalla del lote» usaba el ritmo de una
 * meta de paso para avisar de lecturas. Eran ciertos porque la cola de secado, el tablero y «objetivo contra real» leían sólo las metas de
 * la VERSIÓN. Desde esta tarea leen el PASO de la corrida (`tests/recetas/lectoresPorPaso.test.ts`), así que el tercero pasó a ser FALSO y los
 * otros dos se quedaron cortos. Se reescriben aquí, mínimos, con lo que esos tres lectores hacen de verdad: horas, volteo, humedad y metas.
 *
 * **Lo que NO se reescribe aquí** y queda para las tareas que lo hacen cierto: los tres textos de la recepción (`recetaEditor_metasDeRecepcionAyuda`,
 * `error_receta_meta_de_recepcion_no_se_vigila` y la definición sembrada de `tipo_paso.reception`), que dependen de los avisos de recepción
 * (tarea 12), y lo que diga la pantalla que deja ELEGIR el paso al empezar una corrida (tarea 13).
 *
 * **Qué fija.** (1) La frase exacta de cada texto en los dos idiomas. (2) Que ninguno conserve la frase que ya no es cierta, con el control de que el
 * detector sí encuentra las frases viejas. (3) Que lo que el texto de la ayuda dice de los tipos de paso —«si el paso se cumple con una fermentación…,
 * con un secado…, en los demás sólo se guarda»— es lo que dice el vocabulario: sólo los tipos que cumple una corrida de fermentación o de secado tienen
 * fase (`FASE_DEL_TIPO`), que es lo que los lectores filtran. (4) Que no nombren lo que esos lectores NO leen.
 *
 * Hermética: lee `messages/*.json` y el vocabulario puro; no toca la base.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FASE_DEL_TIPO, TIPOS_DE_PASO, TIPOS_POR_REGISTRO } from "../../lib/recetas/vocabulario";

const traceability = (idioma: "es" | "en") => JSON.parse(readFileSync(`messages/${idioma}.json`, "utf8")).Traceability as Record<string, string>;
const es = traceability("es");
const en = traceability("en");

const CLAVES = ["recipesIntro", "recetaEditor_publicadaIntro", "recetaEditor_metaCadaHorasAyuda"] as const;

const FRASES: Record<(typeof CLAVES)[number], { es: string; en: string }> = {
  recipesIntro: {
    es: "Una receta es una lista ordenada de pasos —despulpar, fermentar, lavar, secar…— con lo que se busca en cada uno. Se elige al abrir el proceso del lote, y la fermentación o el secado que cumple uno de sus pasos se compara con las horas, el volteo, la humedad y las metas que declara ese paso.",
    en: "A recipe is an ordered list of steps —pulping, fermenting, washing, drying…— with what is sought in each. It is chosen when a lot's process is opened, and a fermentation or drying run that fulfils one of its steps is compared with the hours, the turning, the moisture and the targets that step declares.",
  },
  recetaEditor_publicadaIntro: {
    es: "Versión publicada: no se edita. Las corridas que la usan quedan ligadas a esta versión; las que cumplen uno de sus pasos se comparan con las horas, el volteo, la humedad y las metas de ese paso.",
    en: "Published version: it is not edited. Runs that use it stay tied to this version; those that fulfil one of its steps are compared with the hours, the turning, the moisture and the targets of that step.",
  },
  recetaEditor_metaCadaHorasAyuda: {
    es: "Opcional. Si el paso se cumple con una fermentación, el tablero del beneficio avisa cuando toca una lectura; si se cumple con un secado, también lo avisa la pantalla de Secado; en los demás pasos sólo se guarda.",
    en: "Optional. If the step is fulfilled by a fermentation, the beneficio board warns when a reading is due; if by a drying, the Drying screen warns too; in any other step it is only saved.",
  },
};

/** Las frases que el PR-A dejó, ciertas sólo con él. Si una vuelve, el árbol de la tarea 9 vuelve a decir lo que ya no es cierto (la tercera) o a callar lo que sí (las otras). */
const VIEJAS = [
  "Se guarda con el paso; todavía ninguna pantalla del lote lo usa para avisar de lecturas.",
  "Optional. It is saved with the step; no lot screen uses it yet to warn about readings.",
  "y las corridas que se empiezan después la heredan.",
  "and the runs started afterwards inherit it.",
  "Las corridas que la usan quedan ligadas a esta versión.",
  "Runs that use it stay tied to this version.",
];
const DETECTOR_DE_VIEJAS = /todavía ninguna pantalla|no lot screen|se empiezan después la heredan|started afterwards inherit|quedan ligadas a esta versión\.|stay tied to this version\./;

describe("los textos que la lectura por paso deja ciertos", () => {
  it("los tres están en español y en inglés, con la frase de la tarea 9", () => {
    for (const clave of CLAVES) {
      expect(es[clave], `es: ${clave}`).toBe(FRASES[clave].es);
      expect(en[clave], `en: ${clave}`).toBe(FRASES[clave].en);
    }
    // Control: la prueba mira tres claves, y cada una existe en los dos idiomas (no hay una sola con texto en un idioma y sin él en el otro).
    expect(CLAVES.map((c) => [Boolean(es[c]), Boolean(en[c])])).toEqual([[true, true], [true, true], [true, true]]);
  });

  it("ninguno conserva la frase del PR-A que la tarea 9 dejó falsa o corta", () => {
    // Control del detector: encuentra las seis frases viejas. Sin esto, «ninguno la conserva» no distinguiría un detector que no casa con nada.
    for (const vieja of VIEJAS) expect(vieja, `el detector no casa con la frase vieja «${vieja}»`).toMatch(DETECTOR_DE_VIEJAS);
    for (const clave of CLAVES) {
      expect(es[clave], `es: ${clave}`).not.toMatch(DETECTOR_DE_VIEJAS);
      expect(en[clave], `en: ${clave}`).not.toMatch(DETECTOR_DE_VIEJAS);
    }
  });

  it("lo que la ayuda dice de los tipos de paso es lo que dice el vocabulario: sólo los que cumple una fermentación o un secado tienen fase, y el resto sólo se guarda", () => {
    const cumplidosPorFermentacion = TIPOS_POR_REGISTRO.fermentationRun;
    const cumplidosPorSecado = TIPOS_POR_REGISTRO.dryingRun;
    // Control: ambos conjuntos existen; sin ellos los recorridos de abajo no mirarían nada.
    expect(cumplidosPorFermentacion.length).toBeGreaterThan(0);
    expect(cumplidosPorSecado.length).toBeGreaterThan(0);
    for (const tipo of cumplidosPorFermentacion) expect(FASE_DEL_TIPO[tipo], `${tipo} lo cumple una fermentación`).toBe("fermentation");
    for (const tipo of cumplidosPorSecado) expect(FASE_DEL_TIPO[tipo], `${tipo} lo cumple un secado`).toBe("drying");
    // El resto: ningún tipo que no cumpla una corrida lleva fase, así que la meta de uno de esos pasos (`phase` nula) no la lee ningún lector.
    const sinCorrida = TIPOS_DE_PASO.filter((t) => !cumplidosPorFermentacion.includes(t) && !cumplidosPorSecado.includes(t));
    expect(sinCorrida.length).toBeGreaterThan(0);
    for (const tipo of sinCorrida) expect(FASE_DEL_TIPO[tipo], `${tipo} no lo cumple una corrida: sólo se guarda`).toBeUndefined();
    // Y los que cumple una intervención (lavado, despulpado, inoculación…) están entre ésos: no tienen fase.
    for (const registro of ["lotProcessIntervention", "fermentationIntervention"] as const) {
      for (const tipo of TIPOS_POR_REGISTRO[registro]) expect(FASE_DEL_TIPO[tipo], `${tipo} lo cumple ${registro}`).toBeUndefined();
    }
  });

  it("no nombran lo que esos lectores no leen: ni temperatura, ni mucílago, ni capacidades, ni condiciones de fin, ni adiciones", () => {
    const NO_SE_LEE_POR_PASO = /temperatura|mucílago|capacidad|condici[oó]n de fin|adici[oó]n|temperature|mucilage|capacit|end condition|addition/i;
    for (const clave of CLAVES) {
      expect(es[clave], `es: ${clave}`).not.toMatch(NO_SE_LEE_POR_PASO);
      expect(en[clave], `en: ${clave}`).not.toMatch(NO_SE_LEE_POR_PASO);
    }
    // Control: el detector casa con una frase que sí promete esas cosas.
    expect("se compara con la temperatura, el mucílago y las condiciones de fin del paso").toMatch(NO_SE_LEE_POR_PASO);
    expect("is compared with the temperature and the mucilage of the step").toMatch(NO_SE_LEE_POR_PASO);
  });
});
