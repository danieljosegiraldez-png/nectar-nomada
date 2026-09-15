import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Las alertas que ya dicen **qué pasa si no** tienen que decir también **qué
 * hacer** — hallazgo **P-002** del eje pedagógico.
 *
 * `docs/beneficio/22_rubrica_pedagogica.md` §1: *«Todo punto que puede emitir una
 * alerta alcanza Nivel 3»*, y Nivel 3 es *«dice qué hacer ahora y qué pasa si
 * no»*. El antipatrón 1 es la mitad que falta: *«"pH estancado" y nada más. El
 * operador queda con un problema nombrado y ninguna acción.»*
 *
 * ## El alcance es deliberado, y conviene decirlo aquí
 *
 * Este guardia cubre **tres** estados: los que ya nombraban la consecuencia y sólo
 * les faltaba la acción. **Las otras siete alertas siguen en Nivel 2** y están
 * listadas en `auditoria/informes/eje_pedagogico_fases_1_y_2.md`. No se incluyen
 * porque redactarles el Nivel 3 entero exige saber qué se hace en ESTE beneficio
 * —`D-P-01`—, y escribirlo sin preguntar sería inventarle un procedimiento al
 * productor, que es el antipatrón 5.
 *
 * Un guardia con alcance corto y **dicho** es honesto; uno con alcance corto y
 * callado enseña que el resto está cubierto.
 *
 * ## Y por qué no comprueba una cadena concreta
 *
 * Comprobar que el texto contiene exactamente la frase que yo escribí sería
 * tautológico: se compararía el código consigo mismo. Lo que se exige es la
 * **forma** — que aparezca una instrucción de comprobar— y que **no** aparezca
 * una orden sobre el destino del lote, que es lo que
 * `todo-estado-tiene-texto.test.ts` ya prohíbe por el otro lado.
 *
 * Hermético: lee dos archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const mensajes = (idioma: string) =>
  JSON.parse(readFileSync(join(RAIZ, `messages/${idioma}.json`), "utf8")).Beneficio as Record<string, string>;

/** Los tres que ya decían la consecuencia. Ver el informe para los otros siete. */
const CON_CONSECUENCIA = ["STALLED_ROT_HAZARD", "STALLED_MOLD_HAZARD", "RATE_TOO_FAST"] as const;

/**
 * Formas de instruir una comprobación **sin decidir por quien está frente al
 * tanque**. Deliberadamente no incluye `lava`, `detén` ni `para`: ésos los
 * rechaza el otro guardia, y con razón.
 */
const INSTRUYE: Record<string, RegExp> = {
  es: /\b(revisa|mira|comprueba|contrasta|conviene|antes de decidir)\b/i,
  en: /\b(check|look at|compare|worth|before deciding)\b/i,
};

describe("una alerta que nombra el riesgo también dice qué mirar", () => {
  /**
   * **El control positivo del propio análisis.** Si las claves cambiaran de
   * nombre, las comprobaciones de abajo pasarían sobre `undefined` sin mirar un
   * solo texto — que es la forma exacta de guardia vacío que esta casa persigue.
   */
  it.each(["es", "en"])("%s tiene texto para los tres estados que este guardia cubre", (idioma) => {
    const m = mensajes(idioma);
    for (const e of CON_CONSECUENCIA) {
      expect(m[`estado_${e}`], `falta estado_${e} en ${idioma}`).toBeTruthy();
    }
  });

  it.each(["es", "en"])("%s: los tres instruyen una comprobación", (idioma) => {
    const m = mensajes(idioma);
    const mudos = CON_CONSECUENCIA.filter((e) => !INSTRUYE[idioma]!.test(m[`estado_${e}`] ?? ""));
    expect(
      mudos,
      `nombran el riesgo y no dicen qué mirar — antipatrón 1: ${mudos.join(", ")}`,
    ).toEqual([]);
  });

  /**
   * La otra mitad del Nivel 3 no se pierde al añadir la primera: el texto tiene
   * que seguir diciendo **qué pasa si no**, que es lo que ya tenía.
   */
  it.each(["es", "en"])("%s: y siguen nombrando el riesgo", (idioma) => {
    const m = mensajes(idioma);
    const riesgo: Record<string, RegExp> = {
      es: /\b(riesgo|pudrición|moho|sella|falso)\b/i,
      en: /\b(risk|rot|mould|mold|seal|false)\b/i,
    };
    const sinRiesgo = CON_CONSECUENCIA.filter((e) => !riesgo[idioma]!.test(m[`estado_${e}`] ?? ""));
    expect(sinRiesgo, `perdieron el «qué pasa si no»: ${sinRiesgo.join(", ")}`).toEqual([]);
  });

  /**
   * **Y no se cruza la línea del otro guardia.** Añadir una acción es donde más
   * fácil se cuela un imperativo que decide el destino del lote — el antipatrón 7,
   * «falsa autoridad». Esto lo comprueba aquí además de allí, porque el riesgo
   * nace justamente de este cambio.
   */
  it("ninguno de los tres ordena lavar, detener ni parar el lote", () => {
    const m = mensajes("es");
    const ordena = /\b(lave|lava|lavar de inmediato|detenga|detén|pare|para el lote|suspenda)\b/i;
    const culpables = CON_CONSECUENCIA.filter((e) => ordena.test(m[`estado_${e}`] ?? ""));
    expect(culpables, `deciden por el operario: ${culpables.join(", ")}`).toEqual([]);
  });
});
