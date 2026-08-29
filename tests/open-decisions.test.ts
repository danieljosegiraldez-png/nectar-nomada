import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * El mecanismo de decisiones sigue entero.
 *
 * NO se mete `npm run decisiones` dentro de `npm run verify`: dos de las
 * pruebas salen a la red, y una compuerta que se pone roja por una wifi mala
 * enseña a ignorar una línea roja. Lo que sí se puede comprobar sin red es que
 * el mecanismo no se ha podrido: que cada decisión declarada recibe un
 * veredicto, y que ninguna prueba está rota.
 */
const raiz = new URL("..", import.meta.url).pathname;

function correr(): { codigo: number; salida: string } {
  try {
    return {
      codigo: 0,
      salida: execFileSync("bash", ["scripts/open-decisions.sh"], {
        cwd: raiz,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        // Sin red: una compuerta que se pone roja por una wifi mala enseña a
        // ignorar una línea roja.
        env: { ...process.env, OD_SIN_RED: "1" },
      }),
    };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { codigo: e.status ?? 1, salida: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("scripts/open-decisions.sh", () => {
  const { codigo, salida } = correr();

  it("no tiene ninguna prueba rota", () => {
    // Salida 3 significa que alguna prueba salió con un código que no es un
    // veredicto — una errata, un binario que falta. Eso NO es "cerrada".
    expect(salida).toMatch(/rotas=0/);
    expect(codigo, salida).toBe(0);
  });

  it("da un veredicto a cada decisión declarada", () => {
    const script = readFileSync(`${raiz}scripts/open-decisions.sh`, "utf8");
    const declaradas = (script.match(/^probar "/gm) ?? []).length;
    expect(declaradas).toBeGreaterThan(0);

    const m = /TOTAL abiertas=(\d+) cerradas=(\d+) indeterminadas=(\d+) rotas=(\d+)/.exec(salida);
    expect(m, salida).not.toBeNull();
    const total = Number(m![1]) + Number(m![2]) + Number(m![3]) + Number(m![4]);
    expect(total, `declaradas=${declaradas}, con veredicto=${total}`).toBe(declaradas);
  });
});
