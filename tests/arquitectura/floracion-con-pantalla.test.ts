import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **La floración tiene por dónde entrar** — F1, 2026-10-08.
 *
 * `registrarFloracion` existió desde el 2026-10-01 sin ninguna pantalla que la llamara, y con ella
 * el aviso de polinizadores de `/manejo/nuevo`: construido, probado y **inalcanzable**, porque nadie
 * podía anotar una floración para que avisara. Ninguna prueba lo vio — las del servicio llaman al
 * servicio, que funcionaba. Lo que faltaba era una puerta.
 *
 * Esto exige las dos puertas de F1: que alguna acción de `app/` llame a `registrarFloracion` y a
 * `cerrarFloracion`, y que alguna página enlace a la de registrar. **Descubre los archivos, no los
 * enumera**, con su control positivo: si el recorrido dejara de encontrar acciones, «ninguna llama»
 * se leería igual que «no miré».
 *
 * **Lo que NO comprueba:** que la puerta funcione. Eso lo dicen las pruebas del servicio y las del
 * lector del formulario; esto sólo caza que la puerta desaparezca.
 *
 * Hermético: lee archivos, no toca la base.
 */
const RAIZ = new URL("../..", import.meta.url).pathname;

function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta));
    else if (/\.tsx?$/.test(entrada)) salida.push(ruta);
  }
  return salida;
}

const deApp = fuentes(join(RAIZ, "app")).map((ruta) => ({ ruta: relative(RAIZ, ruta), src: readFileSync(ruta, "utf8") }));
const acciones = deApp.filter((f) => /^\s*["']use server["'];/m.test(f.src));
const llaman = (funcion: string) => acciones.filter((f) => new RegExp(`\\b${funcion}\\(`).test(f.src)).map((f) => f.ruta);

describe("la floración tiene por dónde entrar", () => {
  it("control: el recorrido encuentra las acciones de la casa", () => {
    expect(acciones.length, "si esto sale bajo, el recorrido no mira donde debe").toBeGreaterThan(10);
  });

  it("alguna acción llama a `registrarFloracion`", () => {
    expect(llaman("registrarFloracion")).not.toEqual([]);
  });

  it("alguna acción llama a `cerrarFloracion`", () => {
    expect(llaman("cerrarFloracion")).not.toEqual([]);
  });

  it("alguna página enlaza a la de registrar", () => {
    const enlazan = deApp.filter((f) => f.ruta.endsWith("page.tsx") && f.src.includes("/floracion/nueva`")).map((f) => f.ruta);
    expect(enlazan).not.toEqual([]);
  });
});
