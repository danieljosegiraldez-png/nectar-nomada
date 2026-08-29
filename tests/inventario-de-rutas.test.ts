import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * El control de higiene del router.
 *
 * Los fixtures negativos son la parte que importa, y uno de ellos es el que
 * pidió la revisión del plan: **una página que conserva la señal textual y
 * pierde el control efectivo**. Si el guardia la deja pasar, el guardia no
 * sirve — y quitar la cadena que el propio análisis busca sería una prueba
 * circular.
 *
 * Ningún fixture escribe dentro de `app/`: otras sesiones comparten este
 * checkout. Se le apunta al script a un árbol de mentira en un temporal.
 */

const raizRepo = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "rutas-"));

afterAll(() => {
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      /* reintentar: rendirse ante un recurso ocupado deja basura permanente */
    }
  }
});

function correr(args: string[]): { codigo: number; salida: string } {
  try {
    return {
      codigo: 0,
      salida: execFileSync("node", ["scripts/inventario-de-rutas.mjs", ...args], {
        cwd: raizRepo,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { codigo: e.status ?? 1, salida: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** Construye un árbol mínimo y devuelve los argumentos para apuntarle. */
function mundo(nombre: string, paginas: Record<string, string>, manifiesto: string): string[] {
  const raiz = join(dir, nombre);
  for (const [ruta, contenido] of Object.entries(paginas)) {
    const destino = join(raiz, "app", ruta === "/" ? "" : ruta);
    mkdirSync(destino, { recursive: true });
    writeFileSync(join(destino, "page.tsx"), contenido, "utf8");
  }
  mkdirSync(join(raiz, "scripts"), { recursive: true });
  writeFileSync(join(raiz, "scripts", "m.mjs"), manifiesto, "utf8");
  return ["--raiz", raiz, "--manifiesto", join(raiz, "scripts", "m.mjs")];
}

const GATEADA = `import { getCurrentUser } from "x";
export default async function P() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return null;
}`;

describe("el inventario del router", () => {
  it("el repositorio real está entero y sin contradicciones", () => {
    const { codigo, salida } = correr([]);
    expect(salida).toContain("50 entradas");
    expect(codigo, salida).toBe(0);
  });

  it("no usa la palabra «protegida» ni un ✓ global", () => {
    const { salida } = correr([]);
    expect(salida.toLowerCase()).not.toContain("protegida");
    expect(salida).not.toContain("✓");
    // Sí dice de cuántas se pronuncia.
    expect(salida).toMatch(/\d+ entradas/);
  });

  it("falla ante una ruta sin declarar, y la nombra", () => {
    const args = mundo(
      "sin-declarar",
      { "/": GATEADA, "/zzz-nueva": GATEADA },
      `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`
    );
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("SIN DECLARAR: /zzz-nueva");
  });

  it("falla si el manifiesto declara una ruta que ya no existe", () => {
    const args = mundo(
      "fantasma",
      { "/": GATEADA },
      `export const RUTAS = {
        "/": { clase: "requiere-sesion", razon: "x" },
        "/se-borro": { clase: "requiere-sesion", razon: "x" } };`
    );
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("DECLARADA PERO INEXISTENTE: /se-borro");
  });

  // El fixture no circular que pidió la revisión del plan.
  it("atrapa una página que conserva la señal en un comentario y pierde el control", () => {
    const señuelo = `// Esta página llama a getCurrentUser y hace redirect("/login").
/* getCurrentUser(); redirect("/login"); */
export default async function P() {
  return null; // …pero no hace ninguna de las dos cosas.
}`;
    const args = mundo(
      "senuelo",
      { "/": señuelo },
      `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`
    );
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("DISCREPA");
    expect(salida).toContain("no pide usuario y corta la respuesta");
  });

  it("atrapa una página declarada pública que en realidad exige sesión", () => {
    const args = mundo(
      "publica-que-gatea",
      { "/": GATEADA },
      `export const RUTAS = { "/": { clase: "publica-sin-datos", razon: "x" } };`
    );
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("DISCREPA");
  });

  it("para la corrida si aparece una acción servidor fuera de app/actions", () => {
    const args = mundo("use-server", { "/": GATEADA }, `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`);
    writeFileSync(join(dir, "use-server", "app", "suelta.ts"), `"use server";\nexport async function x() {}\n`, "utf8");
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("Acciones servidor fuera de app/actions/");
  });
});
