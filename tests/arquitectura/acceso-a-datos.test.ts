import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { execFileSync } from "node:child_process";

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

/**
 * Recibe un cliente de transacción por parámetro. `lib/traceability/balance.ts`
 * no importa ningún cliente y aun así puede consultar cualquier cosa con el
 * `tx` que le pasan: la comprobación de imports no lo veía.
 */
const recibeTransaccion = (s: string) =>
  /\bPrisma\.TransactionClient\b/.test(s) || /\bTransactionClient\b/.test(s);

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

  it("nadie recibe un cliente de transacción sin estar inventariado", () => {
    const reales = TODOS.filter((f) => f !== "lib/db.ts" && recibeTransaccion(leer(f))).sort();
    const permitidos = [...listado(allowlist.reciben_transaccion)].sort();
    expect(
      reales.filter((f) => !permitidos.includes(f)),
      "Recibe una transacción abierta y puede consultar cualquier cosa sin importar un cliente. " +
        "Justifícalo en la allowlist o pásale sólo los datos que necesita."
    ).toEqual([]);
    expect(permitidos.filter((f) => !reales.includes(f)), "ya no recibe transacción: bórralo").toEqual([]);
  });

  it("cada quien recibe transacción explica por qué", () => {
    for (const e of allowlist.reciben_transaccion) expect(e.razon?.trim(), e.archivo).toBeTruthy();
  });

  it("app/** no crece: hoy son cinco y están justificados", () => {
    const enApp = allowlist.importan_cliente_total.filter((e) => e.archivo.startsWith("app/"));
    expect(enApp.length, "si sube, alguien añadió acceso crudo desde una página o acción").toBeLessThanOrEqual(5);
    for (const e of enApp) expect(e.razon, e.archivo).toMatch(/\S/);
  });
});

/**
 * El inventario deja de sólo informar.
 *
 * `scripts/inventario-de-acceso.mjs` clasifica cada operación que toca la base
 * según cómo autoriza. Hasta ahora era un informe: una operación nueva que
 * ningún patrón explicara aparecía en una salida que nadie corre.
 *
 * Aquí falla. Las tres excepciones de hoy están inventariadas con su razón, y
 * la cuarta hay que justificarla o arreglarla — que es exactamente la decisión
 * que no se quiere tomar en silencio.
 */
describe("inventario de acceso: ninguna operación sin explicar", () => {
  const salida = execFileSync("node", ["scripts/inventario-de-acceso.mjs", "--json"], {
    cwd: new URL("../..", import.meta.url).pathname,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const ops = JSON.parse(salida) as { archivo: string; nombre: string; clase: string }[];
  const sinPatron = ops.filter((o) =>
    ["SIN CLASIFICAR", "recibe principal, sin guardia visible"].includes(o.clase)
  );

  it("las que ningún patrón explica están inventariadas", () => {
    const permitidas = new Set(
      allowlist.operaciones_sin_patron.map((e) => `${e.archivo}:${e.operacion}`)
    );
    const nuevas = sinPatron
      .map((o) => `${o.archivo}:${o.nombre}`)
      .filter((k) => !permitidas.has(k));
    expect(
      nuevas,
      "Operación nueva que ningún patrón de autorización explica. Mírala: si está " +
        "bien, justifícala en docs/arquitectura/acceso-a-datos.allowlist.json; si no, arréglala."
    ).toEqual([]);
  });

  it("el inventario de excepciones no nombra operaciones que ya se explican", () => {
    const reales = new Set(sinPatron.map((o) => `${o.archivo}:${o.nombre}`));
    const sobran = allowlist.operaciones_sin_patron
      .map((e) => `${e.archivo}:${e.operacion}`)
      .filter((k) => !reales.has(k));
    expect(sobran, "ya tienen patrón reconocible: bórralas del inventario").toEqual([]);
  });

  it("cada excepción explica por qué", () => {
    for (const e of allowlist.operaciones_sin_patron) {
      expect(e.razon?.trim(), `${e.archivo}:${e.operacion}`).toBeTruthy();
    }
  });
});

/**
 * El conjunto que «depende del llamador» deja de ser una foto.
 *
 * Estas operaciones no reciben principal: su autorización, si existe, está en
 * quien las llama, y sólo un humano puede decir si ese llamador basta. Se
 * verificaron una a una el 2026-08-31 — y hasta hoy nada detectaba que el
 * conjunto cambiara. Una operación nueva caía en este cajón y nadie la volvía
 * a mirar.
 *
 * Comprobado por mutación el 2026-08-31: añadir una consulta sin guardia a un
 * archivo **ya inventariado** pasaba la compuerta en verde. Con esto, falla.
 */
describe("depende del llamador: el conjunto está fijado, no fotografiado", () => {
  const inventario = JSON.parse(
    execFileSync("node", ["scripts/inventario-de-acceso.mjs", "--json"], {
      cwd: new URL("../..", import.meta.url).pathname,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
  ) as { archivo: string; nombre: string; clase: string }[];
  const dependientes = inventario
    .filter((o) => o.clase.startsWith("depende del llamador"))
    .map((o) => `${o.archivo}:${o.nombre}`);
  const fijadas = new Set(
    allowlist.dependen_del_llamador.map((e) => `${e.archivo}:${e.operacion}`)
  );

  it("ninguna operación nueva entra sin que alguien mire a su llamador", () => {
    expect(
      dependientes.filter((k) => !fijadas.has(k)),
      "Operación nueva sin principal. Mira quién la llama: si ese llamador " +
        "autoriza, anótalo en dependen_del_llamador; si no, ponle guardia."
    ).toEqual([]);
  });

  it("no quedan fijadas operaciones que ya no dependen del llamador", () => {
    const vivas = new Set(dependientes);
    expect(
      [...fijadas].filter((k) => !vivas.has(k)),
      "ya no dependen del llamador: bórralas de dependen_del_llamador"
    ).toEqual([]);
  });

  it("cada una dice por qué su llamador basta, y desde cuándo", () => {
    for (const e of allowlist.dependen_del_llamador) {
      expect(e.razon?.trim(), `${e.archivo}:${e.operacion}`).toBeTruthy();
      expect(e.verificado, `${e.archivo}:${e.operacion}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
