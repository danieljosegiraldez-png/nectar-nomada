#!/usr/bin/env node
/**
 * ¿Puede la cola offline del apiario guardar después de que el teléfono haya
 * visto `/offline.html`? Se mide en un Chrome de verdad, no en un modelo.
 *
 * **El defecto (2026-10-12).** `public/offline.html` abría la base
 * `nectar-apiary-offline` en la versión 1 sin decir qué hacer si no existía, y
 * eso la CREABA vacía. Cuando después la cola (`lib/apiary/offlineQueue.ts`)
 * abría esa misma versión, su manejador de subida —el único sitio que crea el
 * almacén `drafts`— ya no corría, porque la versión 1 existía. Desde ahí todo
 * `queueDraft` fallaba con `NotFoundError` y la pantalla decía «No se pudo
 * guardar en este dispositivo», para siempre, hasta borrar la base a mano.
 *
 * **Por qué un navegador y no una prueba de vitest.** El defecto vive entero en
 * la semántica de versiones de IndexedDB —qué abre, qué crea, qué manejador
 * corre—, y el repositorio no tiene `fake-indexeddb` (añadirlo es una decisión
 * aparte, lo dice `tests/apiary/offlineQueue.test.ts`). Un sustituto escrito a
 * mano probaría lo que yo creo que hace IndexedDB, que es justo lo que estaba
 * mal. Esto corre el `offline.html` que sirve el servidor y el código REAL de la
 * cola —empaquetado desde `lib/` con el esbuild que ya trae `tsx`— en el mismo
 * origen, contra el motor de verdad.
 *
 * Es un diagnóstico, no CI, como el resto de esta carpeta. Lo que sí corre en CI
 * es `tests/arquitectura/indexeddb-declara-su-esquema.test.ts`, que vigila la
 * forma del defecto en la fuente.
 *
 * Uso (necesita `npm ci`, por el esbuild):
 *   npm run build && npx next start -p 3094      # en otra terminal
 *   node tools/browser-checks/indexeddb-sin-almacen.mjs http://localhost:3094
 *
 * Usa un perfil de Chrome desechable: no toca el navegador de nadie. Sale 1 si
 * algún escenario no da lo esperado, y 2 si la fila patrón no se cumple.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as espera } from "node:timers/promises";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const BASE = (process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:3094").replace(/\/$/, "");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const NOMBRE = "nectar-apiary-offline";
// Una página del mismo origen SIN scripts propios: desde aquí se inyecta la cola
// sin que `offline.html` toque la base por su cuenta.
const NEUTRA = `${BASE}/manifest.webmanifest`;

// --- La cola real, empaquetada desde la fuente -------------------------------
const { build } = await import("esbuild");
const paquete = await build({
  entryPoints: [join(RAIZ, "lib/apiary/offlineQueue.ts")],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "ColaDeApiario",
  platform: "browser",
  logLevel: "silent",
});
const COLA = paquete.outputFiles[0].text;

// --- Un cliente CDP mínimo sobre el WebSocket de Node 24 ---------------------
function conectar(url) {
  const ws = new WebSocket(url);
  let siguiente = 0;
  const pendientes = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    const p = m.id && pendientes.get(m.id);
    if (!p) return;
    pendientes.delete(m.id);
    m.error ? p.mal(new Error(m.error.message)) : p.ok(m.result);
  };
  const listo = new Promise((ok, mal) => {
    ws.onopen = ok;
    ws.onerror = () => mal(new Error(`no se pudo conectar a ${url}`));
  });
  const enviar = (method, params = {}) =>
    new Promise((ok, mal) => {
      const id = ++siguiente;
      pendientes.set(id, { ok, mal });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return listo.then(() => ({ enviar, cerrar: () => ws.close() }));
}

async function evaluar(cdp, expresion) {
  const r = await cdp.enviar("Runtime.evaluate", { expression: expresion, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

async function ir(cdp, url) {
  await cdp.enviar("Page.navigate", { url });
  for (let i = 0; i < 100; i++) {
    const listo = await evaluar(cdp, `document.readyState === "complete" && location.href === ${JSON.stringify(url)}`).catch(() => false);
    if (listo) return;
    await espera(100);
  }
  throw new Error(`no terminó de cargar: ${url}`);
}

// --- Lo que se mide dentro de la página --------------------------------------
// Mirar no puede crear: si la apertura tuviera que crear la base, se aborta, y
// eso se informa como «no existe» junto a lo que dijo `databases()`.
const ESTADO = `(async () => {
  const fila = (await indexedDB.databases()).find((d) => d.name === ${JSON.stringify(NOMBRE)});
  if (!fila) return { existe: false };
  const db = await new Promise((ok) => {
    const r = indexedDB.open(${JSON.stringify(NOMBRE)});
    r.onupgradeneeded = () => r.transaction.abort();
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ok(null);
  });
  if (!db) return { existe: false, listada: fila.version };
  const res = { existe: true, version: db.version, almacenes: [...db.objectStoreNames] };
  db.close();
  return res;
})()`;

const BORRAR = `new Promise((ok, mal) => {
  const r = indexedDB.deleteDatabase(${JSON.stringify(NOMBRE)});
  r.onsuccess = () => ok(true);
  r.onerror = () => mal(r.error);
  r.onblocked = () => mal(new Error("borrado bloqueado por otra conexión"));
})`;

// Lo que dejaba el `offline.html` viejo: la versión 1, sin ningún almacén.
const ROMPER = `new Promise((ok, mal) => {
  const r = indexedDB.open(${JSON.stringify(NOMBRE)}, 1);
  r.onsuccess = () => { r.result.close(); ok(true); };
  r.onerror = () => mal(r.error);
})`;

// Lo que hace una página cacheada de un build ANTERIOR: abrir la versión 1.
const ABRIR_V1 = `new Promise((ok) => {
  const r = indexedDB.open(${JSON.stringify(NOMBRE)}, 1);
  r.onsuccess = () => { r.result.close(); ok("abre"); };
  r.onerror = () => ok(r.error.name);
})`;

const ENCOLAR = `ColaDeApiario.queueDraft("inspection", {
  colonyId: "arnes-indexeddb", occurredAt: new Date().toISOString(), outcome: "nothing_unusual",
}).then(() => "guardado", (e) => (e && e.name) + ": " + (e && e.message))`;

async function contadorDeOffline(cdp) {
  await ir(cdp, `${BASE}/offline.html`);
  for (let i = 0; i < 50; i++) {
    const t = await evaluar(cdp, `document.getElementById("draft-count")?.textContent ?? "(sin contador)"`);
    if (t !== "—") return t;
    await espera(100);
  }
  return "— (no llegó a contar)";
}

async function inyectar(cdp) {
  await ir(cdp, NEUTRA);
  await evaluar(cdp, COLA);
}

const describir = (e) =>
  e.existe
    ? `v${e.version} [${e.almacenes.join(",") || "sin almacenes"}]`
    : e.listada === undefined
      ? "no existe"
      : `no existe (databases() la lista en v${e.listada})`;

// --- Chrome desechable -------------------------------------------------------
if (!existsSync(CHROME)) {
  console.error(`No hay Chrome en ${CHROME}. Pásalo con CHROME=<ruta>.`);
  process.exit(2);
}
const perfil = mkdtempSync(join(tmpdir(), "nn-idb-"));
const chrome = spawn(
  CHROME,
  ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${perfil}`, "--no-first-run", "--no-default-browser-check", "--remote-allow-origins=*", "about:blank"],
  { stdio: "ignore" },
);

let codigo = 0;
try {
  const archivoDePuerto = join(perfil, "DevToolsActivePort");
  for (let i = 0; i < 100 && !existsSync(archivoDePuerto); i++) await espera(100);
  const puerto = readFileSync(archivoDePuerto, "utf8").split("\n")[0];
  const paginas = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
  const cdp = await conectar(paginas.find((p) => p.type === "page").webSocketDebuggerUrl);

  // --- Fila patrón: si esto no se cumple, nada de lo de abajo mide ----------
  const html = await fetch(`${BASE}/offline.html`);
  const cuerpo = await html.text();
  await inyectar(cdp);
  const patron = {
    "offline.html": `${html.status}, ${cuerpo.length} bytes, contador ${cuerpo.includes('id="draft-count"') ? "presente" : "AUSENTE"}`,
    "cola empaquetada": `${COLA.length} bytes, queueDraft ${await evaluar(cdp, "typeof ColaDeApiario.queueDraft")}`,
    "indexedDB.databases": await evaluar(cdp, "typeof indexedDB.databases"),
    navegador: (await cdp.enviar("Browser.getVersion")).product,
  };
  console.log(`Base: ${BASE}`);
  for (const [k, v] of Object.entries(patron)) console.log(`  patrón · ${k}: ${v}`);
  if (html.status !== 200 || !cuerpo.includes('id="draft-count"') || !patron["cola empaquetada"].endsWith("function") || patron["indexedDB.databases"] !== "function") {
    console.error("ANULADA: la fila patrón no dice lo que debe.");
    process.exit(2);
  }

  const filas = [];
  const fila = (escenario, medido, esperado, ok) => {
    filas.push({ escenario, medido, esperado, ok });
    if (!ok) codigo = 1;
  };

  // 1. Un teléfono sin base abre /offline.html (sin señal y la URL sin guardar).
  await inyectar(cdp);
  await evaluar(cdp, BORRAR);
  const limpio = await evaluar(cdp, ESTADO);
  const cuenta1 = await contadorDeOffline(cdp);
  await ir(cdp, NEUTRA); // descargar offline.html suelta su conexión
  const tras1 = await evaluar(cdp, ESTADO);
  fila("1. offline.html sobre un aparato sin base", `antes: ${describir(limpio)}; contador «${cuenta1}»; después: ${describir(tras1)}`, "no la crea, contador «0»", !limpio.existe && !tras1.existe && cuenta1 === "0");

  // 2. Después, una inspección sin señal: el fallo que vio Daniel.
  await inyectar(cdp);
  const guardar2 = await evaluar(cdp, ENCOLAR);
  const tras2 = await evaluar(cdp, ESTADO);
  const cuenta2 = await contadorDeOffline(cdp);
  fila("2. …y luego se guarda una inspección", `queueDraft: ${guardar2}; base: ${describir(tras2)}; contador «${cuenta2}»`, "guardado, contador «1»", guardar2 === "guardado" && cuenta2 === "1");

  // 3. Un teléfono que YA quedó roto por el offline.html viejo.
  await inyectar(cdp);
  await evaluar(cdp, BORRAR);
  await evaluar(cdp, ROMPER);
  const roto = await evaluar(cdp, ESTADO);
  const fabricado = roto.existe && roto.version === 1 && roto.almacenes.length === 0;
  await inyectar(cdp);
  const guardar3 = await evaluar(cdp, ENCOLAR);
  const tras3 = await evaluar(cdp, ESTADO);
  const cuenta3 = await contadorDeOffline(cdp);
  fila(
    "3. un aparato ya roto se cura solo",
    `roto: ${describir(roto)}${fabricado ? "" : " (NO SE FABRICÓ: el escenario no mide)"}; queueDraft: ${guardar3}; base: ${describir(tras3)}; contador «${cuenta3}»`,
    "guardado, almacén drafts, contador «1»",
    fabricado && guardar3 === "guardado" && tras3.almacenes?.includes("drafts") && cuenta3 === "1",
  );

  // 4. Un teléfono sano: ni cambia de versión ni pierde lo que tenía. Si la
  // versión subiera, una página cacheada de un build anterior —que abre la
  // versión 1— dejaría de poder guardar: el mismo defecto, en los teléfonos sanos.
  await inyectar(cdp);
  await evaluar(cdp, BORRAR);
  const guardar4 = await evaluar(cdp, ENCOLAR);
  const tras4 = await evaluar(cdp, ESTADO);
  const viejo = await evaluar(cdp, ABRIR_V1);
  await inyectar(cdp); // otra carga de página, otra conexión
  const cuantos = await evaluar(cdp, "ColaDeApiario.listDrafts().then((l) => l.length)");
  fila(
    "4. una base sana sigue en v1 y conserva sus borradores",
    `queueDraft: ${guardar4}; base: ${describir(tras4)}; un build viejo (v1): ${viejo}; borradores al recargar: ${cuantos}`,
    "v1 [drafts], el build viejo abre, 1 borrador",
    guardar4 === "guardado" && tras4.version === 1 && viejo === "abre" && cuantos === 1,
  );

  for (const f of filas) {
    console.log(`\n${f.ok ? "✓" : "✗"} ${f.escenario}`);
    console.log(`    medido:   ${f.medido}`);
    console.log(`    esperado: ${f.esperado}`);
  }
  console.log(`\n${filas.filter((f) => f.ok).length}/${filas.length} escenarios como se esperaba.`);
  cdp.cerrar();
} finally {
  chrome.kill();
  await espera(300);
  rmSync(perfil, { recursive: true, force: true });
}
process.exit(codigo);
