#!/usr/bin/env node
// ¿Las rutas privilegiadas exigen sesión en el artefacto DESPLEGADO?
//
// Esto es una revisión de corrección de autorización, no una búsqueda de
// exploits: ¿la regla que el código declara es la que el edge hace cumplir?
// La suite comprueba el guardia en el código; esto comprueba qué contesta el
// servidor a alguien sin cookie.
//
// No envía credenciales, no intenta eludir nada, y no toca la base de datos:
// solo hace GET anónimos y mira el estado y el destino de la redirección.
//
// Uso: node tools/browser-checks/rutas-protegidas.mjs [base-url]

const BASE = (process.argv[2] ?? "https://nectar-nomada-package.vercel.app").replace(/\/$/, "");

// Rutas que NO deben servir contenido a un visitante anónimo.
//
// **Esto es una MUESTRA, no una enumeración.** No se deriva de `app/`, así que
// un ✓ aquí no demuestra que el conjunto de caminos que llegan al estado
// privilegiado esté completo: demuestra que estos ocho están cubiertos. Derivar
// la lista del router es trabajo aparte, anotado en PENDING_IMPLEMENTATIONS.
const PROTEGIDAS = ["/admin/users", "/lots", "/plots", "/recipes", "/research", "/sensory", "/partner", "/apiaries"];
// Rutas públicas por diseño: si estas fallan, la fila patrón lo dirá.
const PUBLICAS = ["/", "/login", "/discover"];

async function ver(ruta) {
  const url = `${BASE}${ruta}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect: "manual" });
    const cuerpo = res.status < 300 ? await res.text() : "";
    return {
      url, status: res.status,
      location: res.headers.get("location") ?? "",
      bytes: cuerpo.length, ms: Date.now() - t0, cuerpo,
    };
  } catch (err) {
    return { url, status: 0, location: "", bytes: 0, ms: Date.now() - t0, cuerpo: "", error: String(err) };
  }
}

function fila(r, veredicto, detalle) {
  console.log(
    `  ${veredicto.padEnd(11)} ${String(r.status).padEnd(4)} ${String(r.bytes).padStart(7)}b ${String(r.ms).padStart(5)}ms  ${r.url}${r.location ? " → " + r.location : ""}${detalle ? "  — " + detalle : ""}`
  );
}

console.log(`Autorización en el artefacto vivo — ${BASE}\n`);

// --- Fila patrón: la aplicación responde y /login es alcanzable. ---
const patron = await ver("/login");
const patronOk = patron.status === 200 && patron.bytes > 500;
fila(patron, patronOk ? "PATRÓN OK" : "PATRÓN MAL", "/login debe ser 200 y no vacío");
if (!patronOk) {
  console.log("\n✗ La fila patrón no dice lo que debe. Corrida anulada: no leas las demás filas.");
  process.exit(2);
}
console.log("");

let leidas = 0, problemas = 0;
const sinLeer = [];

for (const ruta of PUBLICAS) {
  const r = await ver(ruta);
  if (r.status === 0) { sinLeer.push(ruta); fila(r, "SIN LEER", r.error); continue; }
  leidas++;
  fila(r, r.status === 200 ? "pública" : "revisar", `pública por diseño (${r.status})`);
}
console.log("");
for (const ruta of PROTEGIDAS) {
  const r = await ver(ruta);
  if (r.status === 0) { sinLeer.push(ruta); fila(r, "SIN LEER", r.error); continue; }
  leidas++;
  // Aceptable: redirección a login, 401, 403, o 404 (la ruta puede no existir).
  const protegida =
    (r.status >= 300 && r.status < 400 && /login|signin|auth/i.test(r.location)) ||
    [401, 403, 404].includes(r.status);
  if (protegida) {
    fila(r, "protegida", r.location ? "redirige a autenticación" : `HTTP ${r.status}`);
  } else {
    problemas++;
    fila(r, "PROBLEMA", `sirve ${r.bytes} bytes a un visitante anónimo (HTTP ${r.status})`);
  }
}

console.log("");
if (problemas) {
  console.log(`✗ ${problemas} ruta(s) privilegiada(s) responden a un visitante sin sesión. Revisar el guardia, no el cliente.`);
  process.exit(1);
}
console.log(`✓ Ninguna de las ${leidas} rutas leídas sirve contenido privilegiado en anónimo.`);
console.log(`  Es una muestra de ${PROTEGIDAS.length}, no la enumeración de todas las rutas privilegiadas.`);
if (sinLeer.length) {
  console.log(`  Sin pronunciarse sobre ${sinLeer.length}: ${sinLeer.join(", ")}`);
  process.exit(1);
}
