/**
 * Que la clasificación de pruebas por compuerta no se pudra.
 *
 * **El incidente (2026-09-05).** `scripts/ci.sh` nombraba a mano los archivos
 * que corría: **22 de 97**. De los 75 ausentes, **17 no necesitaban base de
 * datos** — fuera sin motivo, y nada lo decía. El síntoma que lo destapó fue
 * otro: una corrida local recogió 95 archivos habiendo 96, y la diferencia sólo
 * se notó porque la aritmética de otra tarea no cuadraba.
 *
 * Ahora `ci.sh` corre todo lo que no esté en `scripts/pruebas-por-compuerta.txt`
 * y `ci-con-base.sh` corre el grupo `base-sembrada`. Eso mueve el fallo al sitio
 * ruidoso —una prueba nueva que necesite base pone CI en rojo al no conectar—,
 * pero deja formas silenciosas de romperlo, y son las que caza este archivo:
 * borrar o renombrar un archivo clasificado deja una ruta muerta que no excluye
 * nada, y listar el mismo archivo en dos grupos lo haría correr dos veces o
 * ninguna, según quién lea primero.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const RAIZ = new URL("..", import.meta.url).pathname;
const LISTA = "scripts/pruebas-por-compuerta.txt";
const GRUPOS = ["base-sembrada", "datos-reales", "maquina"] as const;

/** Las rutas de cada grupo, leídas igual que las leen los dos scripts. */
function porGrupo(): Map<string, string[]> {
  const salida = new Map<string, string[]>();
  let actual: string | null = null;
  for (const linea of readFileSync(`${RAIZ}${LISTA}`, "utf8").split("\n")) {
    const marca = linea.match(/^#\s*@grupo:\s*(\S+)/);
    if (marca) {
      actual = marca[1]!;
      salida.set(actual, []);
      continue;
    }
    const ruta = linea.trim();
    if (!ruta || ruta.startsWith("#") || actual == null) continue;
    salida.get(actual)!.push(ruta);
  }
  return salida;
}

function archivosDePrueba(): string[] {
  return execFileSync("find", ["tests", "-name", "*.test.ts"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .sort();
}

const grupos = porGrupo();
const clasificadas = [...grupos.values()].flat();

describe("la clasificación de pruebas por compuerta", () => {
  it("declara exactamente los grupos que los scripts saben leer", () => {
    expect([...grupos.keys()].sort()).toEqual([...GRUPOS].sort());
  });

  it("no nombra ninguna ruta que ya no exista", () => {
    const muertas = clasificadas.filter((ruta) => !existsSync(`${RAIZ}${ruta}`));
    expect(muertas, `${LISTA} nombra archivos que no están en el árbol: renombrados o borrados`).toEqual([]);
  });

  it("no pone el mismo archivo en dos grupos", () => {
    const vistas = new Set<string>();
    const repetidas = clasificadas.filter((r) => (vistas.has(r) ? true : (vistas.add(r), false)));
    expect(repetidas).toEqual([]);
  });

  it("no clasifica nada que no sea un archivo de prueba", () => {
    const todas = new Set(archivosDePrueba());
    expect(clasificadas.filter((r) => !todas.has(r))).toEqual([]);
  });

  /**
   * Control positivo. Sin él, un `find` roto o una lista vacía harían pasar
   * todo lo de arriba sin comprobar nada: cero rutas muertas de cero rutas.
   */
  it("cubre una parte real de la suite, y deja correr la mayoría", () => {
    const todas = archivosDePrueba();
    expect(todas.length, "el descubrimiento de archivos de prueba está roto").toBeGreaterThan(50);
    expect(grupos.get("base-sembrada")!.length, "el grupo con base está vacío: ci-con-base.sh no correría nada").toBeGreaterThan(20);
    const sinBase = todas.filter((f) => !clasificadas.includes(f));
    expect(sinBase.length, "ci.sh se quedaría sin apenas pruebas que correr").toBeGreaterThan(30);
  });
});
