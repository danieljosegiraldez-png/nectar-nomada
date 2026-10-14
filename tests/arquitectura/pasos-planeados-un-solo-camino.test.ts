/**
 * `escribirPasosPlaneados` y `crearRecetaLibreEnTx` tienen UN llamador cada una, y el tope de pasos de una Libre, UNA declaración — Parte 2a,
 * tarea 10 (revisión adversaria del 2026-10-05, R6 y R14; ampliado con `crearRecetaLibreEnTx` por el Ruling INV).
 *
 * ## Por qué
 * `escribirPasosPlaneados` (`lib/recetas/pasos.ts`) escribe los pasos de una versión SIN pasar por la regla de autoría de recetas: no
 * la necesita, porque una Libre se define al abrir un proceso, y abrir es `lot:manage` (V13; diseño §5.2). Pero está EXPORTADA, y una
 * exportada sin autoría es un camino que cualquiera puede importar mañana para escribir pasos donde no le toca (V16). Por dentro la
 * defiende lo que comprueba —que la versión sea de una receta Libre y no tenga pasos—; por fuera, esto: la fija a su único llamador,
 * `crearRecetaLibreEnTx` (`lib/recetas/libre.ts`).
 *
 * `crearRecetaLibreEnTx` (`lib/recetas/libre.ts`) crea una receta PUBLICADA en la organización que se le pase, y tampoco autoriza: recibe
 * el `tx` de `abrirProceso` (`lib/traceability/lotProcess.ts`), que ya pidió `lot:manage` sobre el lote y bloqueó su linaje. Su allowlist
 * decía «su único llamador es `abrirProceso`», y eso, escrito solo, es una protección por comentario (Ruling INV): quien la importara desde
 * otra parte crearía recetas en cualquier organización. Este guardia es lo que hace verdad esa frase. Quien necesite crear una receta de
 * otra manera tiene `crearRecetaEnBorrador` (`lib/recetas/versiones.ts`), con su autoría.
 *
 * Es el molde de `listarProcesosDeLote` en `proceso-por-el-resolvedor.test.ts`: la excepción es del archivo que define y de quien se nombra
 * aquí, no de quien llegue después.
 *
 * Con el tope es la misma idea y un número: la pantalla de abrir (`libreDelFormulario`, tarea 13) y el servicio
 * (`validarPasosPlaneados`) tienen que leer el MISMO `MAX_PASOS_PLANEADOS`. Se declara en `lib/recetas/parecido.ts` y en ningún otro
 * sitio —la pantalla lo re-exporta—: dos declaraciones iguales hoy son dos números distintos mañana.
 *
 * ## Qué mira, dicho con precisión
 * Todo `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` y `.cjs` de `lib/`, `app/`, `scripts/` y `prisma/`, con los comentarios fuera: ¿nombra el
 * símbolo? Una llamada, una importación, un alias y una re-exportación lo nombran; un comentario no. Las pruebas (`tests/`) no cuentan: llamarlas
 * desde una prueba no abre ningún camino de producción.
 *
 * ## Qué NO mira (límites conocidos, fijados abajo con su caso `false`)
 * El nombre armado en tiempo de ejecución (`pasos["escribir" + "PasosPlaneados"]`). Y el recorrido de comentarios no es un lexer de
 * TypeScript: una expresión regular literal con comillas puede esconderle texto hasta el fin de la línea.
 *
 * Hermético: sólo lee archivos, no toca la base.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { sinComentarios } from "../helpers/sinComentarios";

const RAIZ = join(__dirname, "..", "..");
const SIMBOLO = "escribirPasosPlaneados";
const QUIEN_LA_DEFINE = "lib/recetas/pasos.ts";
const SU_UNICO_LLAMADOR = "lib/recetas/libre.ts";
const OTRO_SIMBOLO = "crearRecetaLibreEnTx";
const QUIEN_DEFINE_LA_OTRA = "lib/recetas/libre.ts";
const SU_UNICO_LLAMADOR_TAMBIEN = "lib/traceability/lotProcess.ts";
const DONDE_SE_DECLARA_EL_TOPE = "lib/recetas/parecido.ts";
const CARPETAS = ["lib", "app", "scripts", "prisma"];
const EXTENSIONES = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/** ¿Nombra `simbolo` el CÓDIGO de `fuente` (no un comentario)? Una llamada, una importación, un alias o una re-exportación lo nombran. */
export function nombra(fuente: string, simbolo: string): boolean {
  return new RegExp(`\\b${simbolo}\\b`).test(sinComentarios(fuente));
}

/** ¿Declara `fuente` —en código— una constante `MAX_PASOS_PLANEADOS`? Importarla, re-exportarla o usarla no es declararla. */
export function declaraElTope(fuente: string): boolean {
  return /\bconst\s+MAX_PASOS_PLANEADOS\b/.test(sinComentarios(fuente));
}

function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre.startsWith(".")) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta));
    else if (EXTENSIONES.test(nombre)) salida.push(relative(RAIZ, ruta));
  }
  return salida;
}

const TODAS = CARPETAS.flatMap((c) => fuentes(join(RAIZ, c)));
const leer = (f: string) => readFileSync(join(RAIZ, f), "utf8");

describe("escribirPasosPlaneados y crearRecetaLibreEnTx tienen un solo llamador cada una, y el tope de pasos de una Libre una sola declaración", () => {
  it("el detector ve la llamada, la importación, el alias y la re-exportación, y no el comentario ni un nombre parecido (control del propio análisis)", () => {
    expect(nombra("const pasos = await escribirPasosPlaneados(tx, id, planeados);", SIMBOLO)).toBe(true);
    expect(nombra('import { escribirPasosPlaneados } from "./pasos";', SIMBOLO)).toBe(true);
    expect(nombra('import { escribirPasosPlaneados as escribir } from "./pasos";', SIMBOLO)).toBe(true);
    expect(nombra('export { escribirPasosPlaneados } from "./pasos";', SIMBOLO)).toBe(true);
    expect(nombra("const f = modulo.escribirPasosPlaneados;", SIMBOLO)).toBe(true);
    expect(nombra("// la llama `escribirPasosPlaneados(tx, id, p)`", SIMBOLO)).toBe(false);
    expect(nombra("/* escribirPasosPlaneados */ const x = 1;", SIMBOLO)).toBe(false);
    expect(nombra("validarPasosPlaneados(pasos); escribirPasosPlaneadosOtra();", SIMBOLO)).toBe(false);
    // Límite conocido, fijado: el nombre armado en tiempo de ejecución no se ve.
    expect(nombra('pasos["escribir" + "PasosPlaneados"](tx, id, p);', SIMBOLO)).toBe(false);
    // El mismo detector, con el otro nombre.
    expect(nombra("const creada = await crearRecetaLibreEnTx(tx, userAccountId, datos);", OTRO_SIMBOLO)).toBe(true);
    expect(nombra("// la crea `crearRecetaLibreEnTx`", OTRO_SIMBOLO)).toBe(false);
  });

  it("el detector del tope ve `export const` y `const`, y no la re-exportación, la importación, el uso ni el comentario", () => {
    expect(declaraElTope("export const MAX_PASOS_PLANEADOS = 100;")).toBe(true);
    expect(declaraElTope("const MAX_PASOS_PLANEADOS: number = 5;")).toBe(true);
    expect(declaraElTope('export { MAX_PASOS_PLANEADOS } from "./parecido";')).toBe(false);
    expect(declaraElTope('import { MAX_PASOS_PLANEADOS } from "./parecido";')).toBe(false);
    expect(declaraElTope("for (let i = 0; i < MAX_PASOS_PLANEADOS; i++) {}")).toBe(false);
    expect(declaraElTope("// export const MAX_PASOS_PLANEADOS = 100;")).toBe(false);
  });

  it("mira el repositorio de verdad: más de 100 archivos, y quien las define, su llamador y la declaración del tope se ven a sí mismos", () => {
    expect(TODAS.length).toBeGreaterThan(100);
    expect(nombra(leer(QUIEN_LA_DEFINE), SIMBOLO), `${QUIEN_LA_DEFINE} ya no define ${SIMBOLO}`).toBe(true);
    expect(nombra(leer(SU_UNICO_LLAMADOR), SIMBOLO), `${SU_UNICO_LLAMADOR} ya no llama a ${SIMBOLO}`).toBe(true);
    expect(nombra(leer(QUIEN_DEFINE_LA_OTRA), OTRO_SIMBOLO), `${QUIEN_DEFINE_LA_OTRA} ya no define ${OTRO_SIMBOLO}`).toBe(true);
    expect(nombra(leer(SU_UNICO_LLAMADOR_TAMBIEN), OTRO_SIMBOLO), `${SU_UNICO_LLAMADOR_TAMBIEN} ya no llama a ${OTRO_SIMBOLO}`).toBe(true);
    expect(declaraElTope(leer(DONDE_SE_DECLARA_EL_TOPE)), `${DONDE_SE_DECLARA_EL_TOPE} ya no declara MAX_PASOS_PLANEADOS`).toBe(true);
  });

  it("sólo lib/recetas/pasos.ts la define y sólo lib/recetas/libre.ts la nombra", () => {
    const nombran = TODAS.filter((f) => nombra(leer(f), SIMBOLO)).sort();
    expect(
      nombran,
      `${SIMBOLO} aparece en ${nombran.join(", ")}: es una puerta que escribe pasos sin la regla de autoría, y sólo la llama ${SU_UNICO_LLAMADOR}`,
    ).toEqual([SU_UNICO_LLAMADOR, QUIEN_LA_DEFINE].sort());
  });

  it("sólo lib/recetas/libre.ts define crearRecetaLibreEnTx y sólo lib/traceability/lotProcess.ts la nombra", () => {
    const nombran = TODAS.filter((f) => nombra(leer(f), OTRO_SIMBOLO)).sort();
    expect(
      nombran,
      `${OTRO_SIMBOLO} aparece en ${nombran.join(", ")}: crea una receta publicada en la organización que se le pase sin pedir la autoría, y sólo la llama ${SU_UNICO_LLAMADOR_TAMBIEN}, que ya autorizó el lote`,
    ).toEqual([QUIEN_DEFINE_LA_OTRA, SU_UNICO_LLAMADOR_TAMBIEN].sort());
  });

  it("MAX_PASOS_PLANEADOS se declara una sola vez, en lib/recetas/parecido.ts: la pantalla lo re-exporta", () => {
    const declaran = TODAS.filter((f) => declaraElTope(leer(f))).sort();
    expect(declaran, `se declara en ${declaran.join(", ")}: dos números iguales hoy son dos distintos mañana`).toEqual([DONDE_SE_DECLARA_EL_TOPE]);
  });
});
