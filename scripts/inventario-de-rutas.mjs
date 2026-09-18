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

const EXCLUIDOS = /^(node_modules|\.next|\.git|generated|coverage)(\/|$)/;
const todoElRepo = recorrer(RAIZ)
  .map((f) => f.slice(RAIZ.length))
  .filter((f) => !EXCLUIDOS.test(f) && /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));
const rutaDe = (f) => {
  const s = f.replace(/^app/, "").replace(/\/(page|route)\.[^/.]+$/, "");
  return s === "" ? "/" : s;
};

// ── Tripwires: superficies que este control no sabe inventariar ──────────────
// Medidas hoy como vacías. Si aparece una, el inventario dejaría de cubrir la
// superficie HTTP y callaría; por eso para la corrida en vez de seguir.
// Recorre el repositorio entero, no sólo app/: la afirmación es «fuera de
// app/actions», y limitarla a app/ la volvía falsa. Con los comentarios
// quitados, para que una mención en prosa no dispare el guardia.
const usaServer = todoElRepo.filter(
  (f) => !f.startsWith("app/actions/") && /^\s*["']use server["']/m.test(sinComentarios(readFileSync(join(RAIZ, f), "utf8")))
);
if (usaServer.length) fallo(`Acciones servidor fuera de app/actions/: ${usaServer.join(", ")}`);
for (const d of ["pages", "src/pages", "src/app"])
  if (existsSync(join(RAIZ, d))) fallo(`Existe ${d}/: hay un segundo router sin inventariar.`);
const grupos = archivos.filter((f) => /\/\([^)]+\)\//.test(f) || /\/@[^/]+\//.test(f));
if (grupos.length) fallo(`Route groups o parallel routes sin soporte: ${grupos.slice(0, 3).join(", ")}`);
const meta = archivos.filter(
  (f) => /\.tsx?$/.test(f) && /\bgenerateMetadata\b/.test(sinComentarios(readFileSync(join(RAIZ, f), "utf8")))
);
if (meta.length) fallo(`generateMetadata sin inventariar: ${meta.join(", ")}`);

// ── Inventario real ─────────────────────────────────────────────────────────
// Next enruta page/route con varias extensiones. Reconocer sólo `page.tsx` y
// `route.ts` dejaba invisible un `page.js` — ruta viva que ni este guardia ni
// `tsc` verían, porque el proyecto tiene `allowJs: false`. Ahora se reconocen
// las válidas y **cualquier extensión desconocida para el guardia para la
// corrida**, en vez de desaparecer.
const EXT_VALIDAS = /\/(page|route)\.(tsx|ts|jsx|js|mjs)$/;
const CUALQUIER_ENTRADA = /\/(page|route)\.[^/.]+$/;

for (const f of archivos) {
  if (CUALQUIER_ENTRADA.test(f) && !EXT_VALIDAS.test(f))
    fallo(`EXTENSIÓN DESCONOCIDA: ${f}. El guardia no sabe si Next la enruta; no la ignora en silencio.`);
}

const entradas = archivos
  .filter((f) => EXT_VALIDAS.test(f))
  .map((f) => ({ archivo: f, ruta: rutaDe(f), tipo: /\/route\./.test(f) ? "handler" : "página" }));

// `secreto-de-ruta` (2026-09-18, artefactos de colmena T7): una máquina que se autentica con un
// secreto portador compartido —la ruta de Notehub—, ni sesión ni firma. No se disfraza de `firma`.
const CLASES = ["publica-discover", "publica-sin-datos", "flujo-auth", "firma", "secreto-de-ruta", "requiere-sesion"];
const VERBOS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const porRuta = new Map(entradas.map((e) => [e.ruta, e.archivo]));

for (const [ruta, d] of Object.entries(RUTAS)) {
  if (!CLASES.includes(d?.clase)) fallo(`Clase desconocida para ${ruta}: ${d?.clase}`);
  if (!d?.razon || !String(d.razon).trim()) fallo(`Sin razón declarada para ${ruta}. La razón es el punto del manifiesto.`);

  // `metodos` es opcional y existe para que `respuesta-anonima.mjs` no juzgue
  // con un GET una ruta que no acepta GET. Pero una declaración que nadie
  // comprueba es la avería un nivel más arriba: si mañana alguien añade un
  // `export async function GET` y esto sigue diciendo ["POST"], el comprobador
  // dejaría de mirar esa ruta EN SILENCIO. Así que se contrasta con el código.
  if (d?.metodos !== undefined) {
    if (!Array.isArray(d.metodos) || d.metodos.length === 0)
      fallo(`\`metodos\` de ${ruta} debe ser un array no vacío.`);
    else {
      const malos = d.metodos.filter((m) => !VERBOS.includes(m));
      if (malos.length) fallo(`Método desconocido en ${ruta}: ${malos.join(", ")}`);
      const archivo = porRuta.get(ruta);
      if (!archivo) fallo(`${ruta} declara \`metodos\` y no tiene archivo en el router.`);
      else {
        const src = readFileSync(join(RAIZ, archivo), "utf8");
        const reales = VERBOS.filter((m) =>
          new RegExp(`^export\\s+(?:async\\s+)?(?:function\\s+${m}\\b|const\\s+${m}\\s*=)`, "m").test(src),
        );
        const dec = [...d.metodos].sort().join(",");
        const rea = [...reales].sort().join(",");
        if (rea && dec !== rea)
          fallo(
            `${ruta} declara metodos [${dec}] y su handler exporta [${rea}] (${archivo}). ` +
              `Si el código cambió, actualiza el manifiesto: si no, respuesta-anonima.mjs deja de mirarla en silencio.`,
          );
      }
    }
  }
}

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
  // `resolverPrincipal` (P4 §2) se añade al vocabulario porque hace lo mismo que
  // `getCurrentUser` desde el carril de tokens: devuelve null si nadie se
  // identificó, y las rutas que lo usan responden 401. Añadir un nombre aquí
  // sólo es legítimo cuando la función de verdad corta — un vocabulario que
  // crece con cualquier cosa deja de reconocer la pérdida del control, que es
  // lo único que este contraste sabe hacer.
  const pideUsuario = /getCurrentUser|resolverPrincipal|permissionKeysAnywhere|requirePermission|\bauth\(\)/.test(src);
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
    case "secreto-de-ruta":
      // Léxico, como `firma`: la ruta tiene que delegar en quien verifica el secreto.
      if (!/atenderIngesta|verificarSecretoDeRuta|timingSafeEqual/.test(src))
        fallo(`DISCREPA: ${e.ruta} se declara \`secreto-de-ruta\` pero no verifica ningún secreto (${e.archivo}).`);
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
    console.log("Todas las entradas del router reconocidas están declaradas, y **no se");
    console.log("detectaron las contradicciones textuales conocidas** entre código y");
    console.log("declaración. El contraste es léxico: no demuestra control efectivo, y");
    console.log("no dice nada sobre si los datos están protegidos — la frontera es el");
    console.log("servicio de RBAC (SECURITY.md §2), no la ruta.");
  }
}
process.exit(problemas.length ? 1 : 0);
