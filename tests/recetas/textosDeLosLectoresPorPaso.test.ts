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
 * **Ronda de arreglo del 2026-10-13 (revisión de la tarea 9, hallazgo 3).** La primera versión de esos tres textos tenía dos defectos de veracidad
 * (`docs/beneficio/21_rubrica_veracidad.md`): nombraba una pantalla con un término que la interfaz NO usa («el tablero del beneficio» / «the beneficio
 * board»: la pantalla se titula «Beneficio» / «Mill» y su panel «Qué pide atención ahora» / «What needs attention now»), y agrupaba lo que lee cada
 * tipo de corrida («la fermentación o el secado … se compara con las horas, el volteo, la humedad y las metas»): una fermentación NO lee volteo ni
 * humedad —el tablero lee de su paso `horasSugeridas` y las metas (`pasoSelect`)—; el secado lee horas, volteo, banda de humedad y metas
 * (`colaDeSecado`). Los textos de ahora nombran las pantallas con las etiquetas de la interfaz, que esta prueba LEE de `messages` y de las páginas, y
 * separan lo que lee cada tipo.
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

/** Las pantallas que el texto nombra, tal como la interfaz las rotula: se LEEN de `messages` y de las páginas, no se escriben aquí. */
const raiz = (idioma: "es" | "en") => JSON.parse(readFileSync(`messages/${idioma}.json`, "utf8")) as Record<string, Record<string, string>>;
const rotulos = (idioma: "es" | "en") => {
  const r = raiz(idioma);
  return { pantalla: r.SeccionBeneficio!.titulo!, panel: r.SeccionBeneficio!.tablero!, secado: r.Secado!.colaTitulo! };
};

/**
 * Separa un texto de receta en lo que dice de la fermentación y lo que dice del secado, o `null` si no los separa (las dos corridas juntas, con UNA lista de
 * lecturas: lo que hacía la primera versión). El corte es la frase del secado: «el secado, con …» / «a drying run, with …».
 */
function lecturasPorTipo(texto: string, idioma: "es" | "en"): { fermentacion: string; secado: string } | null {
  const partes = texto.split(idioma === "es" ? /el secado, con/ : /a drying run, with/);
  return partes.length === 2 ? { fermentacion: partes[0]!, secado: partes[1]! } : null;
}

const CLAVES = ["recipesIntro", "recetaEditor_publicadaIntro", "recetaEditor_metaCadaHorasAyuda"] as const;

const FRASES: Record<(typeof CLAVES)[number], { es: string; en: string }> = {
  recipesIntro: {
    es: "Una receta es una lista ordenada de pasos —despulpar, fermentar, lavar, secar…— con lo que se busca en cada uno. Se elige al abrir el proceso del lote. La fermentación que cumple uno de sus pasos se compara con las horas y las metas de ese paso; el secado, con las horas, el volteo, la humedad y las metas de ese paso.",
    en: "A recipe is an ordered list of steps —pulping, fermenting, washing, drying…— with what is sought in each. It is chosen when a lot's process is opened. A fermentation that fulfils one of its steps is compared with the hours and the targets of that step; a drying run, with the hours, the turning, the moisture and the targets of that step.",
  },
  recetaEditor_publicadaIntro: {
    es: "Versión publicada: no se edita. Las corridas que la usan quedan ligadas a esta versión; la fermentación que cumple uno de sus pasos se compara con las horas y las metas de ese paso, y el secado, con las horas, el volteo, la humedad y las metas de ese paso.",
    en: "Published version: it is not edited. Runs that use it stay tied to this version; a fermentation that fulfils one of its steps is compared with the hours and the targets of that step, and a drying run, with the hours, the turning, the moisture and the targets of that step.",
  },
  recetaEditor_metaCadaHorasAyuda: {
    es: "Opcional. Si el paso se cumple con una fermentación, la pantalla de Beneficio avisa en «Qué pide atención ahora» cuando toca una lectura; si se cumple con un secado, también lo avisa la pantalla de Secado; en los demás pasos sólo se guarda.",
    en: "Optional. If the step is fulfilled by a fermentation, the Mill screen warns under “What needs attention now” when a reading is due; if by a drying, the Drying screen warns too; in any other step it is only saved.",
  },
};

/** Las frases que el PR-A dejó, ciertas sólo con él. Si una vuelve, el árbol de la tarea 9 vuelve a decir lo que ya no es cierto (la tercera) o a callar lo que sí (las otras). */
const VIEJAS_DEL_PR_A = [
  "Se guarda con el paso; todavía ninguna pantalla del lote lo usa para avisar de lecturas.",
  "Optional. It is saved with the step; no lot screen uses it yet to warn about readings.",
  "y las corridas que se empiezan después la heredan.",
  "and the runs started afterwards inherit it.",
  "Las corridas que la usan quedan ligadas a esta versión.",
  "Runs that use it stay tied to this version.",
];
/**
 * Lo que dijo la PRIMERA versión de la tarea 9 y la revisión halló imprecisa: la pantalla con un nombre que la interfaz no usa («tablero del beneficio» /
 * «beneficio board») y la fermentación y el secado juntos con las horas, el volteo, la humedad y las metas.
 */
const VIEJAS_DE_LA_PRIMERA_VERSION = [
  "el tablero del beneficio avisa cuando toca una lectura",
  "the beneficio board warns when a reading is due",
  "la fermentación o el secado que cumple uno de sus pasos se compara con las horas, el volteo, la humedad y las metas que declara ese paso.",
  "a fermentation or drying run that fulfils one of its steps is compared with the hours, the turning, the moisture and the targets that step declares.",
  "las que cumplen uno de sus pasos se comparan con las horas, el volteo, la humedad y las metas de ese paso.",
  "those that fulfil one of its steps are compared with the hours, the turning, the moisture and the targets of that step.",
];
const VIEJAS = [...VIEJAS_DEL_PR_A, ...VIEJAS_DE_LA_PRIMERA_VERSION];
const DETECTOR_DE_VIEJAS =
  /todavía ninguna pantalla|no lot screen|se empiezan después la heredan|started afterwards inherit|quedan ligadas a esta versión\.|stay tied to this version\.|tablero del beneficio|beneficio board|fermentación o el secado|fermentation or drying run|cumplen uno de sus pasos se comparan|fulfil one of its steps are compared/;

describe("los textos que la lectura por paso deja ciertos", () => {
  it("los tres están en español y en inglés, con la frase de la tarea 9", () => {
    for (const clave of CLAVES) {
      expect(es[clave], `es: ${clave}`).toBe(FRASES[clave].es);
      expect(en[clave], `en: ${clave}`).toBe(FRASES[clave].en);
    }
    // Control: la prueba mira tres claves, y cada una existe en los dos idiomas (no hay una sola con texto en un idioma y sin él en el otro).
    expect(CLAVES.map((c) => [Boolean(es[c]), Boolean(en[c])])).toEqual([[true, true], [true, true], [true, true]]);
  });

  it("ninguno conserva una frase vieja: ni la del PR-A que la tarea 9 dejó falsa o corta, ni la primera versión de la tarea 9 (pantalla mal nombrada, tipos de corrida juntos)", () => {
    // Control del detector: encuentra las doce frases viejas (seis del PR-A y seis de la primera versión de la tarea 9). Sin esto, «ninguno la conserva» no
    // distinguiría un detector que no casa con nada.
    expect(VIEJAS.length).toBe(12);
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

  it("separan lo que lee cada tipo de corrida: la fermentación, horas y metas (`pasoSelect` del tablero); el secado, horas, volteo, humedad y metas (`colaDeSecado`)", () => {
    const SOLO_LO_LEE_EL_SECADO = /volteo|humedad|turning|moisture/i;
    for (const clave of ["recipesIntro", "recetaEditor_publicadaIntro"] as const) {
      for (const [idioma, mensajes] of [["es", es], ["en", en]] as const) {
        const partes = lecturasPorTipo(mensajes[clave]!, idioma);
        expect(partes, `${idioma}: ${clave} no separa lo que lee cada tipo de corrida`).not.toBeNull();
        const { fermentacion, secado } = partes!;
        // La fermentación lee de su paso las horas y las metas: ni el volteo ni la humedad (son del secado).
        expect(fermentacion, `${idioma}: ${clave} le promete a la fermentación lo que sólo lee el secado`).not.toMatch(SOLO_LO_LEE_EL_SECADO);
        expect(fermentacion, `${idioma}: ${clave} calla las horas de la fermentación`).toMatch(/horas|hours/);
        expect(fermentacion, `${idioma}: ${clave} calla las metas de la fermentación`).toMatch(/metas|targets/);
        // El secado lee las cuatro.
        for (const lee of [/horas|hours/, /volteo|turning/, /humedad|moisture/, /metas|targets/]) {
          expect(secado, `${idioma}: ${clave} calla algo de lo que lee el secado (${lee})`).toMatch(lee);
        }
      }
    }
    // Controles del detector. (1) Las frases de la primera versión, que juntaban las dos corridas con una sola lista, NO se separan: el detector las
    // marca. (2) Un texto que sí separa pero le promete el volteo a la fermentación sí se separa, y su parte de fermentación es la que el detector rechaza.
    const juntas = VIEJAS_DE_LA_PRIMERA_VERSION.filter((v) => /volteo|turning/.test(v));
    expect(juntas.length).toBe(4);
    for (const vieja of juntas) {
      expect(lecturasPorTipo(vieja, "es"), `«${vieja}» no debía separarse (es)`).toBeNull();
      expect(lecturasPorTipo(vieja, "en"), `«${vieja}» no debía separarse (en)`).toBeNull();
    }
    const prometeDeMas = lecturasPorTipo("La fermentación se compara con las horas, el volteo y las metas; el secado, con las horas, el volteo, la humedad y las metas.", "es");
    expect(prometeDeMas).not.toBeNull();
    expect(prometeDeMas!.fermentacion).toMatch(SOLO_LO_LEE_EL_SECADO);
    const prometeDeMasEn = lecturasPorTipo("A fermentation is compared with the hours, the moisture and the targets; a drying run, with the hours, the turning, the moisture and the targets.", "en");
    expect(prometeDeMasEn).not.toBeNull();
    expect(prometeDeMasEn!.fermentacion).toMatch(SOLO_LO_LEE_EL_SECADO);
  });

  it("la ayuda nombra las pantallas con los rótulos de la interfaz —«Beneficio» y su panel «Qué pide atención ahora», y «Secado»—, leídos de los mensajes y de las páginas, no «tablero» ni «board»", () => {
    // Qué rótulo pinta cada pantalla lo dicen las páginas, no esta prueba: la clave del <h1> de /beneficio y de /beneficio/secado, y la del <h2> del panel.
    const beneficio = readFileSync("app/beneficio/page.tsx", "utf8");
    const secadoPagina = readFileSync("app/beneficio/secado/page.tsx", "utf8");
    expect(beneficio).toContain('getTranslations("SeccionBeneficio")');
    expect(beneficio).toContain('<h1>{t("titulo")}</h1>');
    expect(beneficio).toContain('<h2 id="tablero-beneficio">{t("tablero")}</h2>');
    expect(secadoPagina).toContain('getTranslations("Secado")');
    expect(secadoPagina).toContain('<h1>{t("colaTitulo")}</h1>');

    const ayuda = "recetaEditor_metaCadaHorasAyuda" as const;
    const r = { es: rotulos("es"), en: rotulos("en") };
    // Control: los seis rótulos existen. Sin esto, un rótulo ausente daría «undefined» en la frase esperada y la comparación de abajo no diría nada.
    for (const idioma of ["es", "en"] as const) for (const rotulo of Object.values(r[idioma])) expect(rotulo.length, `${idioma}: falta un rótulo de la interfaz`).toBeGreaterThan(0);
    expect(es[ayuda]).toContain(`la pantalla de ${r.es.pantalla} avisa en «${r.es.panel}»`);
    expect(es[ayuda]).toContain(`la pantalla de ${r.es.secado}`);
    expect(en[ayuda]).toContain(`the ${r.en.pantalla} screen warns under “${r.en.panel}”`);
    expect(en[ayuda]).toContain(`the ${r.en.secado} screen`);
    // La interfaz no tiene ninguna pantalla ni panel llamado «tablero» o «board», y la primera versión de la tarea 9 sí lo decía.
    const NO_EXISTE_EN_LA_INTERFAZ = /tablero|\bboard\b/i;
    expect(es[ayuda]).not.toMatch(NO_EXISTE_EN_LA_INTERFAZ);
    expect(en[ayuda]).not.toMatch(NO_EXISTE_EN_LA_INTERFAZ);
    expect(VIEJAS_DE_LA_PRIMERA_VERSION[0]).toMatch(NO_EXISTE_EN_LA_INTERFAZ);
    expect(VIEJAS_DE_LA_PRIMERA_VERSION[1]).toMatch(NO_EXISTE_EN_LA_INTERFAZ);
  });
});
