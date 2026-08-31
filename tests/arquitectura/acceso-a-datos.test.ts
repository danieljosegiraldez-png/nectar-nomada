import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import allowlist from "../../docs/arquitectura/acceso-a-datos.allowlist.json";

/**
 * Un acceso crudo nuevo a la base no aparece en silencio.
 *
 * **Lo que prueba:** que el conjunto de archivos que construyen o importan un
 * cliente de base de datos es exactamente el inventariado en
 * `docs/arquitectura/acceso-a-datos.allowlist.json`. Añadir uno es un acto
 * deliberado, con una razón escrita y visible en el diff.
 *
 * **Lo que NO prueba, y hay que decirlo:** que la autorización sea *correcta*.
 * Un `requireLotAccess` con el permiso equivocado pasa igual. Tampoco mira
 * *operaciones*: un archivo ya inventariado puede añadir cien consultas sin que
 * esto lo note. Y no sigue `$transaction` ni `Prisma.TransactionClient`, que
 * propagan acceso por otra vía (28 usos hoy).
 *
 * Sustituye a un plan que habría tocado 51 archivos con un `AuthzContext`
 * universal. La revisión de la compuerta 2 lo rechazó: «el coste no vale la
 * garantía obtenida», y tenía razón — entre otras cosas porque mi medición se
 * había saltado un segundo cliente entero (`aiPrisma`), al buscar `prisma.` en
 * minúscula.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const IGNORA = /node_modules|\.next|generated|\.git/;

function archivos(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(RAIZ, dir))) {
    const rel = `${dir}/${e}`;
    if (IGNORA.test(rel)) continue;
    if (statSync(join(RAIZ, rel)).isDirectory()) archivos(rel, out);
    else if (/\.tsx?$/.test(rel)) out.push(rel);
  }
  return out;
}

const TODOS = [...archivos("app"), ...archivos("lib")];
const leer = (f: string) => readFileSync(join(RAIZ, f), "utf8");

/** Construye un cliente: `import { PrismaClient }` seguido de `new PrismaClient`. */
const construyeCliente = (s: string) =>
  /import\s*\{[^}]*\bPrismaClient\b[^}]*\}/.test(s) && /new\s+PrismaClient\s*\(/.test(s);

/**
 * Resuelve a qué archivo apunta cada `from "…"`, en vez de buscar la cadena.
 *
 * `lib/ai/service.ts` importa `"./db"`, que **no contiene** «ai/db»: una versión
 * anterior de este test buscaba el texto y por eso daba por bueno que nadie
 * tocaba el cliente restringido. Un patrón detecta un vocabulario; resolver la
 * ruta detecta el destino, que es la propiedad que importa.
 */
function destinos(archivo: string, src: string): string[] {
  const dir = archivo.split("/").slice(0, -1).join("/");
  const out: string[] = [];
  for (const m of src.matchAll(/from\s+"([^"]+)"/g)) {
    const esp = m[1];
    if (!esp) continue;
    let r: string;
    if (esp.startsWith("@/")) r = esp.slice(2);
    else if (esp.startsWith(".")) {
      const partes = [...dir.split("/"), ...esp.split("/")];
      const pila: string[] = [];
      for (const x of partes) {
        if (x === "." || x === "") continue;
        if (x === "..") pila.pop();
        else pila.push(x);
      }
      r = pila.join("/");
    } else continue;
    out.push(r.replace(/\.tsx?$/, ""));
  }
  return out;
}

const importaClienteTotal = (f: string, s: string) =>
  f !== "lib/db.ts" && destinos(f, s).includes("lib/db");

const importaClienteAi = (f: string, s: string) =>
  f !== "lib/ai/db.ts" && destinos(f, s).includes("lib/ai/db");

const listado = (xs: { archivo: string }[]) => new Set(xs.map((x) => x.archivo));

describe("acceso a datos: el inventario manda", () => {
  it("los clientes de base de datos son exactamente los inventariados", () => {
    const reales = TODOS.filter((f) => construyeCliente(leer(f))).sort();
    const esperados = [...listado(allowlist.clientes)].sort();
    expect(reales).toEqual(esperados);
  });

  it("cada cliente inventariado explica por qué existe", () => {
    for (const c of allowlist.clientes) expect(c.razon?.trim(), c.archivo).toBeTruthy();
  });

  it("nadie importa el cliente total sin estar inventariado", () => {
    const reales = TODOS.filter((f) => importaClienteTotal(f, leer(f)));
    const permitidos = listado(allowlist.importan_cliente_total);
    const nuevos = reales.filter((f) => !permitidos.has(f));
    expect(
      nuevos,
      `Acceso crudo nuevo. Justifícalo en docs/arquitectura/acceso-a-datos.allowlist.json ` +
        `o usa un servicio de dominio: ${nuevos.join(", ")}`
    ).toEqual([]);
  });

  it("el inventario no nombra archivos que ya no existen", () => {
    const reales = new Set(TODOS.filter((f) => importaClienteTotal(f, leer(f))));
    const fantasmas = [...listado(allowlist.importan_cliente_total)].filter((f) => !reales.has(f));
    expect(fantasmas, `Ya no importan el cliente: bórralos del inventario`).toEqual([]);
  });

  it("cada entrada del inventario tiene una razón escrita", () => {
    const sinRazon = allowlist.importan_cliente_total.filter((e) => !e.razon?.trim());
    expect(sinRazon.map((e) => e.archivo)).toEqual([]);
  });

  it("sólo lib/ai/service.ts toca el cliente atado al rol ai_service", () => {
    const reales = TODOS.filter((f) => importaClienteAi(f, leer(f))).sort();
    expect(reales).toEqual([...listado(allowlist.importan_cliente_ai)].sort());
  });

  it("app/** no crece: hoy son cinco y están justificados", () => {
    const enApp = allowlist.importan_cliente_total.filter((e) => e.archivo.startsWith("app/"));
    expect(enApp.length, "si sube, alguien añadió acceso crudo desde una página o acción").toBeLessThanOrEqual(5);
    for (const e of enApp) expect(e.razon, e.archivo).toMatch(/\S/);
  });
});
