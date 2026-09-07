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
    // El número está FIJADO a propósito: es el disparador que hace que una ruta
    // nueva se vea. 52 → 54 el 2026-09-01, con /biochar y /biochar/[id]
    // declaradas en el manifiesto en el mismo cambio. 61 → 62 el 2026-09-06,
    // con /lots/[id]/roast/new — la pantalla que le faltaba al tueste, cuyo
    // servicio existía desde R1 sin un solo consumidor. 62 → 63 el mismo día,
    // con /sensory/new: hasta entonces `sensorySession.create` sólo existía en
    // la semilla, así que nadie podía empezar una cata. 63 → 64 el 2026-09-07,
    // con /field-sessions/[id]/report — el reporte de visita de A9.6, que se
    // renderiza desde el snapshot congelado y no desde la visita. 64 → 65 el
    // mismo día, con /apiaries/[id]/etiquetas — la hoja de calcomanías QR, que
    // es lo que hace que abrir la caja N-01 sea apuntar la cámara.
    // 65 → 66 el mismo día, con /lots/[id]/process — el proceso del lote, la
    // única pantalla desde la que se declara el % H al que se va a almacenar.
    expect(salida).toContain("66 entradas");
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

  // Los tripwires que la revisión de la compuerta 5 señaló sin flip-test.
  it("no ignora en silencio un page.js: extensión que Next enruta y tsc no ve", () => {
    const raiz = join(dir, "page-js");
    mkdirSync(join(raiz, "app", "nueva"), { recursive: true });
    writeFileSync(join(raiz, "app", "nueva", "page.js"), "export default function P(){return null}", "utf8");
    mkdirSync(join(raiz, "app"), { recursive: true });
    writeFileSync(join(raiz, "app", "page.tsx"), GATEADA, "utf8");
    mkdirSync(join(raiz, "scripts"), { recursive: true });
    writeFileSync(join(raiz, "scripts", "m.mjs"), `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`, "utf8");
    const { codigo, salida } = correr(["--raiz", raiz, "--manifiesto", join(raiz, "scripts", "m.mjs")]);
    expect(codigo).toBe(1);
    expect(salida).toContain("SIN DECLARAR: /nueva");
  });

  it("para la corrida ante una extensión de entrada que no reconoce", () => {
    const raiz = join(dir, "ext-rara");
    mkdirSync(join(raiz, "app", "rara"), { recursive: true });
    writeFileSync(join(raiz, "app", "rara", "page.mts"), "export default function P(){return null}", "utf8");
    writeFileSync(join(raiz, "app", "page.tsx"), GATEADA, "utf8");
    mkdirSync(join(raiz, "scripts"), { recursive: true });
    writeFileSync(join(raiz, "scripts", "m.mjs"), `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`, "utf8");
    const { codigo, salida } = correr(["--raiz", raiz, "--manifiesto", join(raiz, "scripts", "m.mjs")]);
    expect(codigo).toBe(1);
    expect(salida).toContain("EXTENSIÓN DESCONOCIDA");
  });

  it("para la corrida ante un segundo router (pages/ o src/pages/)", () => {
    const args = mundo("segundo-router", { "/": GATEADA }, `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`);
    mkdirSync(join(dir, "segundo-router", "src", "pages"), { recursive: true });
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("src/pages/");
  });

  it("para la corrida ante generateMetadata, y no ante su mención en un comentario", () => {
    const args = mundo(
      "meta",
      { "/": GATEADA, "/con-meta": `export async function generateMetadata(){return {}}\n${GATEADA}` },
      `export const RUTAS = {
        "/": { clase: "requiere-sesion", razon: "x" },
        "/con-meta": { clase: "requiere-sesion", razon: "x" } };`
    );
    expect(correr(args).salida).toContain("generateMetadata");

    const soloComentario = mundo(
      "meta-comentario",
      { "/": `// aquí NO hay generateMetadata, sólo se nombra\n${GATEADA}` },
      `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`
    );
    const r = correr(soloComentario);
    expect(r.codigo, r.salida).toBe(0);
  });

  it("exige una razón declarada para cada ruta", () => {
    const args = mundo("sin-razon", { "/": GATEADA }, `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "  " } };`);
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("Sin razón declarada");
  });

  it("para la corrida si aparece una acción servidor fuera de app/actions", () => {
    const args = mundo("use-server", { "/": GATEADA }, `export const RUTAS = { "/": { clase: "requiere-sesion", razon: "x" } };`);
    writeFileSync(join(dir, "use-server", "app", "suelta.ts"), `"use server";\nexport async function x() {}\n`, "utf8");
    const { codigo, salida } = correr(args);
    expect(codigo).toBe(1);
    expect(salida).toContain("Acciones servidor fuera de app/actions/");
  });
});
