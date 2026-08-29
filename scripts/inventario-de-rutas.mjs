#!/usr/bin/env node
/**
 * Control de higiene del router.
 *
 * **Qué prueba:** que toda entrada del router está declarada en
 * `scripts/rutas-declaradas.mjs`, y que el código no contradice lo declarado.
 *
 * **Qué NO prueba:** que los datos estén protegidos. La frontera de
 * autorización es el servicio único de RBAC (`SECURITY.md` §2), no la ruta.
 * `proxy.ts` sólo gatea `/my-nectar` y su propio comentario dice que es una
 * conveniencia de interfaz, no la frontera. Por eso aquí no se usa la palabra
 * «protegida», no hay un ✓ global, y los totales dicen de cuántas se pronuncian.
 *
 * **Límite conocido, escrito para que nadie lo descubra creyendo otra cosa:**
 * el contraste es sintáctico sobre el archivo con los comentarios quitados.
 * Atrapa una señal que quedó sólo en un comentario. **No** atrapa una rama
 * muerta (`if (false) redirect(...)`) ni una comprobación cuyo resultado no
 * controla la respuesta. Lo que sostiene la afirmación es la declaración, no
 * este análisis.
 *
 * Uso: node scripts/inventario-de-rutas.mjs [--json]
 *      node scripts/inventario-de-rutas.mjs --raiz <dir> --manifiesto <archivo>
 *
 * Las dos últimas existen para los fixtures negativos del test: se le apunta a
 * un árbol de mentira en un directorio temporal, de modo que ninguna prueba
 * escribe dentro de `app/`. Otras sesiones comparten este checkout.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i === -1 ? null : process.argv[i + 1];
};

const RAIZ = arg("--raiz") ? arg("--raiz").replace(/\/?$/, "/") : new URL("..", import.meta.url).pathname;
const rutaManifiesto = arg("--manifiesto") ?? new URL("./rutas-declaradas.mjs", import.meta.url).href;
const { RUTAS } = await import(rutaManifiesto.startsWith("file:") ? rutaManifiesto : `file://${rutaManifiesto}`);
const problemas = [];
const fallo = (m) => problemas.push(m);

function recorrer(dir, salida = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) recorrer(p, salida);
    else salida.push(p);
  }
  return salida;
}

const sinComentarios = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const archivos = recorrer(join(RAIZ, "app")).map((f) => f.slice(RAIZ.length));
const rutaDe = (f) => {
  const s = f.replace(/^app/, "").replace(/\/(page|route)\.tsx?$/, "");
  return s === "" ? "/" : s;
};

// ── Tripwires: superficies que este control no sabe inventariar ──────────────
// Medidas hoy como vacías. Si aparece una, el inventario dejaría de cubrir la
// superficie HTTP y callaría; por eso para la corrida en vez de seguir.
const usaServer = archivos.filter(
  (f) => /\.tsx?$/.test(f) && !f.startsWith("app/actions/") && /["']use server["']/.test(readFileSync(join(RAIZ, f), "utf8"))
);
if (usaServer.length) fallo(`Acciones servidor fuera de app/actions/: ${usaServer.join(", ")}`);
if (existsSync(join(RAIZ, "pages"))) fallo("Existe un directorio pages/: hay un segundo router sin inventariar.");
const grupos = archivos.filter((f) => /\/\([^)]+\)\//.test(f) || /\/@[^/]+\//.test(f));
if (grupos.length) fallo(`Route groups o parallel routes sin soporte: ${grupos.slice(0, 3).join(", ")}`);
const meta = archivos.filter((f) => /\.tsx?$/.test(f) && /generateMetadata/.test(readFileSync(join(RAIZ, f), "utf8")));
if (meta.length) fallo(`generateMetadata sin inventariar: ${meta.join(", ")}`);

// ── Inventario real ─────────────────────────────────────────────────────────
const entradas = archivos
  .filter((f) => /\/(page\.tsx|route\.ts)$/.test(f))
  .map((f) => ({ archivo: f, ruta: rutaDe(f), tipo: f.endsWith("route.ts") ? "handler" : "página" }));

const declaradas = new Set(Object.keys(RUTAS));
const reales = new Set(entradas.map((e) => e.ruta));

for (const e of entradas) {
  if (!declaradas.has(e.ruta)) fallo(`SIN DECLARAR: ${e.ruta} (${e.archivo}). Decláralo en scripts/rutas-declaradas.mjs.`);
}
for (const r of declaradas) {
  if (!reales.has(r)) fallo(`DECLARADA PERO INEXISTENTE: ${r}. Bórrala del manifiesto.`);
}

// ── Contraste: el código no debe contradecir lo declarado ───────────────────
const conteo = {};
for (const e of entradas) {
  const d = RUTAS[e.ruta];
  if (!d) continue;
  conteo[d.clase] = (conteo[d.clase] ?? 0) + 1;
  const src = sinComentarios(readFileSync(join(RAIZ, e.archivo), "utf8"));
  const pideUsuario = /getCurrentUser|permissionKeysAnywhere|requirePermission|\bauth\(\)/.test(src);
  const cortaLaRespuesta = /redirect\("\/login"\)|requirePermission|status:\s*40[13]|new Response\([^)]*40[13]/.test(src);
  const leePublico = /lib\/discover|discover\/service/.test(src);
  const leeDatos = /prisma\.|lib\/discover|discover\/service/.test(src);

  switch (d.clase) {
    case "requiere-sesion":
      if (!(pideUsuario && cortaLaRespuesta))
        fallo(`DISCREPA: ${e.ruta} se declara \`requiere-sesion\` pero el archivo no pide usuario y corta la respuesta (${e.archivo}).`);
      break;
    case "publica-discover":
      if (!leePublico)
        fallo(`DISCREPA: ${e.ruta} se declara \`publica-discover\` pero no lee por lib/discover/service (${e.archivo}).`);
      if (pideUsuario && cortaLaRespuesta)
        fallo(`DISCREPA: ${e.ruta} se declara pública pero exige sesión (${e.archivo}).`);
      break;
    case "publica-sin-datos":
      if (leeDatos)
        fallo(`DISCREPA: ${e.ruta} se declara \`publica-sin-datos\` pero lee datos (${e.archivo}).`);
      // Lo encontró el propio test: declararla pública mientras exige sesión es
      // una contradicción, y una de las dos cosas está mal.
      if (pideUsuario && cortaLaRespuesta)
        fallo(`DISCREPA: ${e.ruta} se declara pública pero exige sesión (${e.archivo}).`);
      break;
    case "firma":
      if (!/signature|constructEvent/i.test(src))
        fallo(`DISCREPA: ${e.ruta} se declara \`firma\` pero no verifica ninguna (${e.archivo}).`);
      break;
    case "flujo-auth":
      break;
    default:
      fallo(`Clase desconocida en el manifiesto para ${e.ruta}: ${d.clase}`);
  }
}

// ── Informe ─────────────────────────────────────────────────────────────────
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ entradas, conteo, problemas }, null, 2));
} else {
  console.log(`Inventario del router — ${entradas.length} entradas (${entradas.filter((e) => e.tipo === "página").length} páginas, ${entradas.filter((e) => e.tipo === "handler").length} handlers)`);
  for (const [clase, n] of Object.entries(conteo).sort()) console.log(`  ${String(n).padStart(3)}  ${clase}`);
  console.log("");
  if (problemas.length) {
    for (const p of problemas) console.error(`  ✗ ${p}`);
    console.error("");
    console.error(`${problemas.length} discrepancia(s) entre lo declarado y el código.`);
  } else {
    console.log("Todas las entradas del router están declaradas, y el código no contradice");
    console.log("la declaración. Esto NO dice que los datos estén protegidos: la frontera");
    console.log("es el servicio de RBAC (SECURITY.md §2), no la ruta.");
  }
}
process.exit(problemas.length ? 1 : 0);
