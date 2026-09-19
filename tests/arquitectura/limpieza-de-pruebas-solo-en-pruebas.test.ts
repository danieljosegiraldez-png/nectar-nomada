import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La puerta que deja borrar un `DryingTrayWeighing` en las pruebas (Tarea 4
 * del plan 2a de secado; migración `20260918191500_pesaje_de_bandeja`) exige
 * el ajuste de sesión `nn.limpieza_de_pruebas`, puesto SÓLO dentro de la
 * transacción de limpieza que el brief prescribe (paso 3). Este guardia es
 * hermético —no toca la base— y comprueba que la aplicación NO lo pone en
 * ningún sitio de `lib/` ni `app/`, que es lo único que abriría la puerta
 * fuera de una prueba.
 *
 * Tres partes, cada una cerrando la puerta por la que la anterior podría
 * pasar vacía (segunda pasada de Codex del plan 2a):
 * 1. la función detectora se prueba primero sobre un texto sintético que
 *    contiene la cadena y TIENE que encontrarla;
 * 2. se recorren `lib/` y `app/` y se afirma cuántos archivos se leyeron
 *    (> 100), para que un recorrido que no leyó nada no pueda decir «cero»;
 * 3. sobre esos archivos, cero apariciones.
 *
 * No se usa `tests/` como control: este propio archivo contiene la cadena y
 * se encontraría a sí mismo.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const IGNORA = /node_modules|\.next|generated|\.git/;
const CADENA = "nn.limpieza_de_pruebas";

function apariciones(texto: string): number {
  return texto.split(CADENA).length - 1;
}

function archivos(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(RAIZ, dir))) {
    const rel = `${dir}/${e}`;
    if (IGNORA.test(rel)) continue;
    if (statSync(join(RAIZ, rel)).isDirectory()) archivos(rel, out);
    else if (/\.tsx?$/.test(rel)) out.push(rel);
  }
  return out;
}

describe("limpieza de pruebas: sólo en las pruebas", () => {
  it("la función detectora encuentra la cadena en un texto sintético que la contiene", () => {
    expect(apariciones(`await tx.$executeRaw\`SET LOCAL ${CADENA} = 'on'\`;`)).toBe(1);
    expect(apariciones("nada que ver aquí")).toBe(0);
  });

  it("recorre lib/ y app/ y lee más de 100 archivos", () => {
    const objetivo = [...archivos("lib"), ...archivos("app")];
    expect(objetivo.length).toBeGreaterThan(100);
  });

  it("ningún archivo de lib/ ni app/ pone el ajuste de sesión de limpieza", () => {
    const objetivo = [...archivos("lib"), ...archivos("app")];
    const conCadena = objetivo.filter((f) => apariciones(readFileSync(join(RAIZ, f), "utf8")) > 0);
    expect(conCadena, `Sólo la transacción de limpieza de las pruebas pone este ajuste: ${conCadena.join(", ")}`).toEqual([]);
  });
});
