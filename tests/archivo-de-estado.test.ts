import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Una sección archivada existe **una vez**, y en **un solo sitio**.
 *
 * El 2026-08-31 dos sesiones archivaron la misma sección a la vez. Los dos
 * commits la insertaron en posiciones distintas de
 * `docs/SESSION_STATE_ARCHIVE.md`, así que git **no vio texto solapado**, la
 * fusión salió limpia, y el archivo quedó con la sección **dos veces**.
 *
 * **Qué cambió el 2026-09-05, y por qué importa.** Estas tres comprobaciones
 * vivían aquí dentro, en TypeScript. Ese día se estrenó el carril ligero de CI
 * para cambios de sólo documentación —el 57 % de las PR— y ese carril no corre
 * vitest: el guardia del archivo histórico dejaba de correr exactamente en los
 * cambios que tocan el archivo histórico. Ahora la lógica vive en
 * `scripts/check-archivo-de-estado.mjs`, que no importa nada y corre en los dos
 * carriles; este archivo pasó a comprobar que ese guardia **discrimina**.
 *
 * Una definición, dos consumidores. Dos definiciones habrían derivado, que es
 * como la prueba de P-A acabó diciendo «cerrada» durante días.
 */

const guardia = "scripts/check-archivo-de-estado.mjs";

function correr(estado: string, archivo: string): { codigo: number; salida: string } {
  try {
    const salida = execFileSync("node", [guardia, estado, archivo], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { codigo: 0, salida };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { codigo: err.status ?? -1, salida: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const temporales: string[] = [];

/** Escribe un par estado/archivo en un directorio temporal y devuelve sus rutas. */
function par(estado: string, archivo: string): [string, string] {
  const dir = mkdtempSync(join(tmpdir(), "nn-archivo-"));
  temporales.push(dir);
  const rutaEstado = join(dir, "estado.md");
  const rutaArchivo = join(dir, "archivo.md");
  writeFileSync(rutaEstado, estado, "utf8");
  writeFileSync(rutaArchivo, archivo, "utf8");
  return [rutaEstado, rutaArchivo];
}

/**
 * `CLAUDE.md`: «si una suite usa directorios temporales, limpiarlos con
 * reintentos; atrapar un error de recurso ocupado convierte una carrera perdida
 * en basura permanente».
 *
 * La primera versión no limpiaba nada y dejaba un directorio por fixture en
 * cada corrida —cinco por PR y por iteración local—. El disco de esta máquina
 * ya llegó al 100 % una vez, y el primer síntoma fue un `npm ci` que fallaba
 * sin razón aparente.
 *
 * `force` para que un directorio ya borrado no rompa la limpieza, y `maxRetries`
 * para el recurso ocupado. Si aun así falla, se avisa y NO se lanza: perder la
 * limpieza no debe teñir de rojo una suite que pasó.
 */
afterAll(() => {
  for (const dir of temporales) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch (error) {
      console.warn(`no se pudo limpiar ${dir}: ${(error as Error).message}`);
    }
  }
});

/** Un estado que no existe: la ruta apunta a un directorio temporal vacío. */
function ausente(): string {
  return join(mkdtempSync(join(tmpdir(), "nn-archivo-")), "no-existe.md");
}

const ESTADO_SANO = "# Estado\n\n### 2026-09-01 · Una\n\n### 2026-09-02 · Dos\n";
const ARCHIVO_SANO = "# Hist\n\n### 2026-08-01 · Vieja\n";

describe("el guardia del archivo histórico", () => {
  it("acepta los archivos reales del repositorio", () => {
    const { codigo, salida } = correr("SESSION_STATE.md", "docs/SESSION_STATE_ARCHIVE.md");
    expect(codigo, salida).toBe(0);
  });

  it("acepta un par sano", () => {
    const { codigo, salida } = correr(...par(ESTADO_SANO, ARCHIVO_SANO));
    expect(codigo, salida).toBe(0);
  });

  // Los tres de abajo son el flip-test: cada mutación golpea UNA propiedad, y
  // se comprueba además que el mensaje nombra la correcta. Sin esto último, un
  // guardia que fallara siempre pasaría estos tres tests.

  it("rechaza una sección repetida en el histórico", () => {
    const [e, a] = par(ESTADO_SANO, "# Hist\n\n### 2026-08-01 · Vieja\n\ntexto\n\n### 2026-08-01 · Vieja\n");
    const { codigo, salida } = correr(e, a);
    expect(codigo, salida).toBe(1);
    expect(salida).toMatch(/repetida/);
  });

  it("rechaza una sección que está a la vez en el estado y en el histórico", () => {
    const [e, a] = par(ESTADO_SANO, "# Hist\n\n### 2026-09-01 · Una\n");
    const { codigo, salida } = correr(e, a);
    expect(codigo, salida).toBe(1);
    expect(salida).toMatch(/a la vez/);
  });

  it("rechaza una sección del estado sin fecha, que el archivador no sabría cortar", () => {
    const [e, a] = par("# Estado\n\n### Un subtitulo cualquiera\n", ARCHIVO_SANO);
    const { codigo, salida } = correr(e, a);
    expect(codigo, salida).toBe(1);
    expect(salida).toMatch(/no sabrá cortar/);
  });

  /**
   * **El agujero que tuvo este guardia hasta el 2026-09-05.** `titulos()`
   * devolvía `[]` ante cualquier error de lectura, así que un estado ausente o
   * mal nombrado dejaba las comprobaciones 2 y 3 sin nada que mirar — y el
   * mensaje de éxito **afirmaba** «ninguna compartida con el estado» sin
   * haberlo comprobado. Salía 0.
   *
   * Es la misma forma que la cabecera del guardia cita: la prueba de P-A que
   * leyó una línea ausente como una línea buena. Reaparecida dentro del guardia
   * escrito para evitarla.
   */
  it("un estado que no existe es un fallo, no un verde", () => {
    const [, a] = par(ESTADO_SANO, ARCHIVO_SANO);
    const { codigo, salida } = correr(ausente(), a);
    expect(codigo, salida).toBe(1);
    expect(salida).toMatch(/no se pudo leer/);
    expect(salida, "no puede afirmar nada sobre lo que no leyó").not.toMatch(/está sano/);
  });

  /**
   * La otra mitad, y sin ella la de arriba se «arreglaría» exigiendo que los dos
   * ficheros existan: el histórico SÍ puede no haberse creado todavía, y eso era
   * la intención del comentario original.
   */
  it("un histórico que no existe sigue siendo legítimo", () => {
    const [e] = par(ESTADO_SANO, ARCHIVO_SANO);
    const { codigo, salida } = correr(e, ausente());
    expect(codigo, salida).toBe(0);
  });

  it("cuenta secciones repetidas, no copias sobrantes", () => {
    const tresVeces = "# Hist\n\n### 2026-08-01 · V\n\ntexto\n\n### 2026-08-01 · V\n\nmás\n\n### 2026-08-01 · V\n";
    const { codigo, salida } = correr(...par(ESTADO_SANO, tresVeces));
    expect(codigo, salida).toBe(1);
    expect(salida, "una sección tres veces es UNA repetida, no dos").toMatch(/tiene 1 sección/);
  });
});
