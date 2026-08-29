#!/usr/bin/env node
/**
 * Qué contesta el despliegue a un visitante SIN sesión, contrastado contra lo
 * que `scripts/rutas-declaradas.mjs` declara para cada ruta.
 *
 * Se llamaba `rutas-protegidas.mjs`. La revisión del plan señaló que el nombre
 * es la afirmación: «protegida» y un ✓ verde se leen como una garantía de que
 * los datos están a salvo, y esto no demuestra eso. La frontera de autorización
 * es el servicio de RBAC (`SECURITY.md` §2). Esto observa **respuestas**.
 *
 * No envía credenciales, no intenta eludir nada y no toca la base de datos:
 * sólo GET anónimos.
 *
 * Uso: node tools/browser-checks/respuesta-anonima.mjs [base-url]
 */

const argManifiesto = (() => {
  const i = process.argv.indexOf("--manifiesto");
  return i === -1 ? null : process.argv[i + 1];
})();
// `--manifiesto` existe para poder flip-testear el veredicto contra un mundo
// donde una ruta declarada no existe: sin eso, «el 404 nunca cuenta como
// éxito» sería una afirmación sin prueba.
const { RUTAS } = await import(
  argManifiesto ? `file://${argManifiesto}` : new URL("../../scripts/rutas-declaradas.mjs", import.meta.url).href
);

const posicional = process.argv.slice(2).find((a) => a.startsWith("http"));
const BASE = (posicional ?? "https://nectar-nomada-package.vercel.app").replace(/\/$/, "");

/**
 * Respuestas aceptables por clase. Fuera de esta tabla, nada cuenta como
 * coincidencia — y el **404 es ambiguo a propósito**: puede significar «no
 * existe» tanto como «no te lo doy», así que no se cuenta como éxito. Leer un
 * fallo de despliegue como una protección es exactamente el informe que halaga.
 */
const ACEPTABLE = {
  "publica-discover": { ok: (r) => r.status === 200, espera: "200" },
  "publica-sin-datos": { ok: (r) => r.status === 200, espera: "200" },
  "requiere-sesion": {
    ok: (r) => (r.status >= 300 && r.status < 400 && /login|signin|auth/i.test(r.location)) || r.status === 401 || r.status === 403,
    espera: "3xx→/login, 401 o 403",
  },
};
const NO_COMPROBABLES = {
  "flujo-auth": "es el propio flujo de Auth.js; un GET anónimo no dice nada útil",
  firma: "sólo acepta POST firmado por Stripe",
};

async function ver(ruta) {
  const url = `${BASE}${ruta}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect: "manual" });
    const cuerpo = res.status < 300 ? await res.text() : "";
    return { url, status: res.status, location: res.headers.get("location") ?? "", bytes: cuerpo.length, ms: Date.now() - t0 };
  } catch (err) {
    return { url, status: 0, location: "", bytes: 0, ms: Date.now() - t0, error: String(err) };
  }
}

const fila = (r, v, d) =>
  console.log(`  ${v.padEnd(11)} ${String(r.status).padEnd(4)} ${String(r.bytes).padStart(7)}b ${String(r.ms).padStart(5)}ms  ${r.url}${r.location ? " → " + r.location : ""}${d ? "  — " + d : ""}`);

const todas = Object.entries(RUTAS);
const estaticas = todas.filter(([r, d]) => !r.includes("[") && ACEPTABLE[d.clase]);
const dinamicas = todas.filter(([r]) => r.includes("["));
const fuera = todas.filter(([r, d]) => !r.includes("[") && NO_COMPROBABLES[d.clase]);

console.log(`Respuesta anónima — ${BASE}`);
console.log(`${todas.length} rutas declaradas · ${estaticas.length} comprobables · ${dinamicas.length} dinámicas · ${fuera.length} fuera de alcance\n`);

// Fila patrón: /login tiene que ser 200. Si no, estamos midiendo otra cosa.
const patron = await ver("/login");
const patronOk = patron.status === 200 && patron.bytes > 500;
fila(patron, patronOk ? "PATRÓN OK" : "PATRÓN MAL", "/login debe ser 200 y no vacío");
if (!patronOk) {
  console.log("\n✗ La fila patrón no dice lo que debe. Corrida anulada: no leas las demás filas.");
  process.exit(2);
}
console.log("");

let coinciden = 0, contradicen = 0, ambiguas = 0, sinLeer = 0;
for (const [ruta, d] of estaticas) {
  const r = await ver(ruta);
  if (r.status === 0) { sinLeer++; fila(r, "SIN LEER", r.error); continue; }
  if (r.status === 404) { ambiguas++; fila(r, "AMBIGUA", "404: puede ser «no existe» o «no te lo doy». No cuenta como coincidencia"); continue; }
  if (ACEPTABLE[d.clase].ok(r)) { coinciden++; fila(r, "coincide", `${d.clase} · esperaba ${ACEPTABLE[d.clase].espera}`); }
  else { contradicen++; fila(r, "CONTRADICE", `declarada ${d.clase}, esperaba ${ACEPTABLE[d.clase].espera}`); }
}

console.log("");
console.log(`Coinciden ${coinciden} · contradicen ${contradicen} · ambiguas ${ambiguas} · sin leer ${sinLeer}`);
console.log(`Sin pronunciarse: ${dinamicas.length} dinámicas (no se inventan slugs) y ${fuera.length} fuera de alcance.`);
console.log("Esto observa respuestas, no demuestra que los datos estén protegidos:");
console.log("la frontera es el servicio de RBAC (SECURITY.md §2), no la ruta.");
// Una ambigua también sale distinto de cero: «el 404 nunca cuenta como éxito»
// no se cumplía si la corrida entera terminaba en 0 con una ambigua dentro.
if (ambiguas > 0) console.log(`\n${ambiguas} ambigua(s): la corrida no puede llamarse limpia.`);
process.exit(contradicen > 0 || sinLeer > 0 || ambiguas > 0 ? 1 : 0);
