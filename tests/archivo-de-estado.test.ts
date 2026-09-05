import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

/** Escribe un par estado/archivo en un directorio temporal y devuelve sus rutas. */
function par(estado: string, archivo: string): [string, string] {
  const dir = mkdtempSync(join(tmpdir(), "nn-archivo-"));
  const rutaEstado = join(dir, "estado.md");
  const rutaArchivo = join(dir, "archivo.md");
  writeFileSync(rutaEstado, estado, "utf8");
  writeFileSync(rutaArchivo, archivo, "utf8");
  return [rutaEstado, rutaArchivo];
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
});
