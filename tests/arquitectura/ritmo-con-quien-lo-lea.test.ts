import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **Una función que calcula la cola de trabajo tiene que tener quien la pinte.**
 *
 * ## El hueco que lo motiva, medido el 2026-09-27
 *
 * `lib/traceability/ritmo.ts` se escribió el 2026-09-13 tras una auditoría de Daniel sobre la
 * pantalla de lotes —su frase está en la cabecera de ese archivo: «la lista es una cola de trabajo,
 * no un inventario»—. Calcula tres cosas que nadie más calcula: si un lote **va tarde**, cuántas
 * **lecturas debe** por su ritmo declarado, y un **puntaje de urgencia** para ordenar.
 *
 * Dos semanas después, buscando sus dos símbolos exportados en todo el repositorio, los únicos
 * resultados estaban en `tests/traceability/ritmo.test.ts`. **La cola estaba calculada, probada, y
 * sin pintar en ninguna pantalla.** Nada se rompió: simplemente el trabajo no llegó a nadie, y
 * ninguna compuerta podía notarlo porque sus pruebas pasaban.
 *
 * ## Por qué un guardia y no una promesa
 *
 * Es el mismo patrón que `campos-con-dos-puertas`: un cálculo que existe y una puerta que no se
 * cerró. La diferencia es que aquí no hay pérdida de dato, hay **trabajo invisible** — y eso no se
 * nota nunca solo, porque no produce ningún síntoma.
 *
 * ## Su límite, dicho
 *
 * Comprueba que EXISTE un consumidor fuera de `tests/`, no que lo use bien. Que el estado y el orden
 * de la cola sean correctos lo sostienen las pruebas de `tests/beneficio/colaDeSecado.test.ts`.
 */

/** Los símbolos que no deben quedarse sin consumidor, y por qué importa cada uno. */
const CALCULOS_SIN_LOS_QUE_LA_COLA_NO_EXISTE = [
  { simbolo: "estadoDeRitmo", quePasaSiNadieLoLlama: "nadie sabe si un lote va tarde ni cuántas lecturas debe" },
  { simbolo: "puntajeDeUrgencia", quePasaSiNadieLoLlama: "la cola no se puede ordenar por urgencia" },
] as const;

/**
 * Los archivos que IMPORTAN ese símbolo desde `ritmo.ts`.
 *
 * **Se mira el import y no el nombre, y eso lo enseñó un flip-test fallido** (2026-09-27). La primera
 * versión de este guardia buscaba el nombre del símbolo en `lib`, `app` y `scripts`. Mutando la cola
 * para que NO usara `ritmo.ts` —dejando dos constantes locales con los mismos nombres— el guardia
 * siguió en verde: encontraba los nombres, que era lo único que medía. Un comentario que los
 * mencionara habría bastado igual.
 *
 * Exigir el import cierra las dos: una constante local no importa nada, y un comentario tampoco.
 */
function consumidoresDe(simbolo: string): string[] {
  let archivos: string[];
  try {
    archivos = execFileSync("git", ["grep", "-l", "-F", "traceability/ritmo", "--", "lib", "app", "scripts"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => f.length > 0 && !f.endsWith("lib/traceability/ritmo.ts"));
  } catch {
    // `git grep` sale con 1 cuando no encuentra nada, y eso aquí es el fallo que se busca.
    return [];
  }

  return archivos.filter((archivo) => {
    const fuente = readFileSync(archivo, "utf8");
    // La línea de import que trae el símbolo, sin contar un `import type`: un tipo no llama a nada.
    const lineas = fuente.split("\n").filter((l) => l.includes("traceability/ritmo") && l.includes("import"));
    return lineas.some((l) => {
      const soloTipos = /import\s+type\s*\{/.test(l);
      const traeElSimbolo = new RegExp(`(^|[{,\\s])${simbolo}\\s*(,|\\}|$)`).test(l);
      const comoTipo = new RegExp(`type\\s+${simbolo}\\b`).test(l);
      return traeElSimbolo && !soloTipos && !comoTipo;
    });
  });
}

describe("el ritmo de la cola tiene quien lo lea", () => {
  /**
   * El control positivo, sin el cual este guardia no valdría nada: si el `git grep` no encuentra un
   * símbolo que SÍ está, la prueba pasaría en verde midiendo el vacío. Se busca uno que el propio
   * archivo del ritmo exporta y que este guardia cita, así que tiene que aparecer.
   */
  it("el buscador encuentra el archivo que define el símbolo", () => {
    const enElRepositorio = execFileSync("git", ["grep", "-l", "-F", "estadoDeRitmo", "--", "lib"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => f.length > 0);
    expect(enElRepositorio, "el buscador no ve ni el archivo que define el símbolo").toContain(
      "lib/traceability/ritmo.ts",
    );
  });

  for (const { simbolo, quePasaSiNadieLoLlama } of CALCULOS_SIN_LOS_QUE_LA_COLA_NO_EXISTE) {
    it(`${simbolo} se usa fuera de sus pruebas`, () => {
      const consumidores = consumidoresDe(simbolo);
      expect(
        consumidores,
        `${simbolo} sólo lo llaman sus pruebas: ${quePasaSiNadieLoLlama}`,
      ).not.toEqual([]);
    });
  }
});
