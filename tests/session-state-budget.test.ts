import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * SESSION_STATE.md tiene que caber en una sola lectura.
 *
 * Esto es un test y no una regla escrita porque la regla se escribió y se
 * rompió dos veces en dos días, ambas por el commit que añadía una entrada.
 * Pasada aproximadamente la marca de los 25K tokens una lectura devuelve solo
 * el principio **y reporta éxito**: un archivo de estado de 1.264 líneas dejó
 * de llegar a las sesiones sin que nada, en ningún sitio, lo dijera.
 *
 * El script es la única fuente de los límites; este test no los repite, para
 * que no puedan discrepar. Su mensaje de fallo nombra la sección más vieja que
 * hay que mover a docs/SESSION_STATE_ARCHIVE.md.
 *
 * Flip-test hecho el 2026-08-28: contra un archivo sobredimensionado por líneas
 * y contra otro sobredimensionado solo por tokens, el script sale 1 en los dos
 * casos y nombra la sección correcta. Un guardia que no se ha visto fallar no
 * se ha probado.
 */
describe("SESSION_STATE.md", () => {
  it("cabe en una sola lectura", () => {
    let salida = "";
    let codigo = 0;
    try {
      salida = execFileSync("node", ["scripts/check-state-budget.mjs"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      codigo = e.status ?? 1;
      salida = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    expect(salida.trim()).not.toBe("");
    expect(codigo, salida).toBe(0);
  });
});
