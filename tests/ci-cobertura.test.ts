/**
 * Que la lista de exclusiones de CI no se pudra.
 *
 * **El incidente (2026-09-05).** `scripts/ci.sh` nombraba a mano los archivos
 * de prueba que corría: **22 de 97**. De los 75 ausentes, **17 no necesitaban
 * base de datos** — estaban fuera sin motivo, y nada lo decía. El síntoma que
 * lo destapó fue otro: una corrida local recogió 95 archivos habiendo 96, y la
 * diferencia sólo se notó porque la aritmética de otra tarea no cuadraba.
 *
 * Ahora `ci.sh` corre todo salvo lo excluido. Eso mueve el fallo al sitio
 * ruidoso —una prueba nueva que necesite base pone CI en rojo— pero deja una
 * forma silenciosa de romperlo: **borrar o renombrar un archivo excluido**.
 * La ruta muerta se queda en la lista y no excluye nada; si más tarde nace otro
 * archivo con ese nombre, entra excluido sin que nadie lo decida. Eso es lo que
 * caza este test.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const RAIZ = new URL("..", import.meta.url).pathname;
const LISTA = "scripts/tests-fuera-de-ci.txt";

function excluidas(): string[] {
  return readFileSync(`${RAIZ}${LISTA}`, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

function archivosDePrueba(): string[] {
  return execFileSync("find", ["tests", "-name", "*.test.ts"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .sort();
}

describe("la lista de exclusiones de CI", () => {
  it("no nombra ninguna ruta que ya no exista", () => {
    const muertas = excluidas().filter((ruta) => !existsSync(`${RAIZ}${ruta}`));
    expect(muertas, `${LISTA} nombra archivos que no están en el árbol: renombrados o borrados`).toEqual([]);
  });

  /**
   * Control positivo. Sin esto, un `find` roto o una lista vacía harían pasar
   * el test de arriba sin comprobar nada: cero rutas muertas de cero rutas.
   */
  it("cubre una parte real de la suite, y deja correr la mayoría", () => {
    const todas = archivosDePrueba();
    const fuera = excluidas();
    expect(todas.length, "el descubrimiento de archivos de prueba está roto").toBeGreaterThan(50);
    expect(fuera.length, "la lista de exclusiones está vacía: no se estaría excluyendo nada").toBeGreaterThan(10);
    const dentro = todas.filter((f) => !fuera.includes(f));
    expect(dentro.length, "CI se quedaría sin apenas pruebas que correr").toBeGreaterThan(30);
  });

  it("no excluye nada que no sea un archivo de prueba", () => {
    const todas = new Set(archivosDePrueba());
    const intrusas = excluidas().filter((r) => !todas.has(r));
    expect(intrusas, "hay rutas en la lista que el descubrimiento no considera pruebas").toEqual([]);
  });
});
