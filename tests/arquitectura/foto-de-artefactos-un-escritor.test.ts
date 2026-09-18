/**
 * La foto de artefactos en `Hive` tiene UN escritor — artefactos de colmena, Tarea 3.
 *
 * `queenExcluder`, `entranceReducer` y `screenedBottomBoard` son una caché de los
 * intervalos (`HiveFitting`), y sólo `lib/apiary/artefactos.ts` la escribe, a partir de
 * ellos. Una segunda puerta que los asigne a mano es una segunda fuente de verdad
 * disfrazada.
 *
 * **Por qué un guardia de fuente y no de ejecución.** El flip-test lo dijo: con el formulario
 * de la caja escribiendo el booleano OTRA VEZ junto al intervalo, las 21 pruebas de
 * `artefactos.test.ts` siguieron en verde — un segundo escritor que escribe lo mismo que el
 * primero es invisible en ejecución hasta el día que discrepan. Esto lo ve antes.
 *
 * Lo que NO ve, dicho: una asignación por clave calculada (`{ [campo]: v }`) fuera de
 * `artefactos.ts`, o un objeto armado en otro sitio y esparcido. Las dos formas son raras
 * aquí; la primera es justo la que usa el escritor legítimo.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CAMPOS = /\b(queenExcluder|entranceReducer|screenedBottomBoard)\s*:(?!\s*[:?])/;
const ESCRITOR = "lib/apiary/artefactos.ts";

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const r = join(dir, e);
    return statSync(r).isDirectory() ? archivos(r) : r.endsWith(".ts") ? [r] : [];
  });
}

/** Líneas que ASIGNAN uno de los tres campos. Las declaraciones de tipo (`campo?:`) no cuentan. */
export function asignaciones(fuente: string): string[] {
  return fuente
    .split("\n")
    .filter((l) => CAMPOS.test(l) && !/\b(queenExcluder|entranceReducer|screenedBottomBoard)\?\s*:/.test(l));
}

describe("la foto de artefactos tiene un solo escritor", () => {
  it("nadie en lib/ asigna esos tres campos, salvo artefactos.ts", () => {
    const fuera = archivos("lib")
      .filter((a) => a !== ESCRITOR)
      .flatMap((a) => asignaciones(readFileSync(a, "utf8")).map((l) => `${a}: ${l.trim()}`));
    expect(fuera, "un segundo escritor de la foto: abre o cierra el intervalo con artefactos.ts").toEqual([]);
  });

  it("el detector caza la asignación — el control, sin el cual el guardia mide cero", () => {
    expect(asignaciones("    ...(x ? { queenExcluder: input.queenExcluder } : {}),")).toHaveLength(1);
    expect(asignaciones("data: { entranceReducer: true }")).toHaveLength(1);
    // Y no confunde un tipo con una escritura.
    expect(asignaciones("  screenedBottomBoard?: boolean | null;")).toHaveLength(0);
    expect(archivos("lib").length, "no encontró archivos: el guardia no estaría mirando nada").toBeGreaterThan(100);
  });
});
