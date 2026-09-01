#!/usr/bin/env node
// Falla si SESSION_STATE.md deja de caber en una sola lectura.
//
// Por qué existe como test y no como regla escrita: la regla se escribió y se
// rompió dos veces en dos días, ambas por el commit que añadía una entrada.
// Pasada ~25K tokens una lectura devuelve solo el principio **y reporta éxito**;
// un archivo de estado de 1.264 líneas dejó de llegar a las sesiones sin que
// nada lo dijera.
//
// Uso: node scripts/check-state-budget.mjs [ruta]
//   La ruta opcional existe para el flip-test y para los fixtures negativos del
//   test: correrlo contra un archivo que ya viole el presupuesto y comprobar
//   que el veredicto cambia.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const MAX_LINEAS = 400;
const MAX_TOKENS = 20000;

// `caracteres / 3` es una ESTIMACIÓN, no una cota. En español con markdown la
// relación real ronda 3,5–4 caracteres por token, así que dividir entre 3
// sobreestima, que es el lado seguro. Pero no es una garantía: texto con
// identificadores densos, datos aleatorios o símbolos poco comunes puede
// tokenizar muy por encima.
const CHARS_POR_TOKEN = 3;

// Por eso hay además un techo duro de bytes, independiente de la estimación.
// 45.000 bytes está deliberadamente por debajo de los 60.000 que darían 20.000
// tokens a 3 caracteres cada uno: el margen es una elección, no una medida del
// cargador real. Si algún día alguien mide la capacidad de verdad, este número
// se sustituye por esa medida y se dice de dónde salió.
const MAX_BYTES = 45000;

const ruta = process.argv[2] ?? "SESSION_STATE.md";

let texto;
try {
  texto = readFileSync(ruta, "utf8");
} catch {
  console.error(`✗ ${ruta} no existe. Es el entregable de cada sesión, no un extra.`);
  process.exit(1);
}

const lineas = texto.split("\n").length;
const bytes = Buffer.byteLength(texto, "utf8");
const tokens = Math.ceil(texto.length / CHARS_POR_TOKEN);

const excesos = [];
if (lineas > MAX_LINEAS) excesos.push(["líneas", lineas, MAX_LINEAS]);
if (tokens > MAX_TOKENS) excesos.push(["tokens (estimados)", tokens, MAX_TOKENS]);
if (bytes > MAX_BYTES) excesos.push(["bytes", bytes, MAX_BYTES]);

// Secciones archivables: encabezados `### AAAA-MM-DD …`, de la más vieja a la
// más nueva. Se busca por fecha y no por posición para que un orden roto no
// produzca un consejo falso.
function seccionesFechadas(src) {
  const lineasSrc = src.split("\n");
  const marcas = [];
  lineasSrc.forEach((l, i) => {
    const m = /^### (\d{4}-\d{2}-\d{2})(.*)$/.exec(l);
    if (m) marcas.push({ fecha: m[1], titulo: l.trim(), inicio: i });
  });
  // Una sección fechada termina en el SIGUIENTE encabezado de cualquier nivel
  // hasta `###`, no en la siguiente entrada fechada. Antes terminaba en la
  // siguiente fecha, así que la última entrada se tragaba toda la prosa que
  // venía después y el consejo decía "mueve esta sección" queriendo decir
  // "mueve el resto del archivo".
  const siguienteEncabezado = (desde) => {
    for (let i = desde; i < lineasSrc.length; i++) {
      if (/^#{1,3} /.test(lineasSrc[i])) return i;
    }
    return lineasSrc.length;
  };
  return marcas
    .map((m) => {
      const fin = siguienteEncabezado(m.inicio + 1);
      const cuerpo = lineasSrc.slice(m.inicio, fin).join("\n");
      return {
        ...m,
        lineas: fin - m.inicio,
        chars: cuerpo.length,
        bytes: Buffer.byteLength(cuerpo, "utf8"),
      };
    })
    // Con la MISMA fecha, `localeCompare` devuelve 0 y el orden del documento
    // decide — y decide al revés. §2 va «más nuevo primero», así que entre
    // empatadas la más vieja es la que está **más abajo**. Sin este desempate el
    // aviso nombraba la entrada recién escrita como «la más vieja»: pasó el
    // 2026-08-31, cuando cinco entradas compartían fecha. Buscar por fecha no
    // basta si la fecha no discrimina.
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || b.inicio - a.inicio);
}

if (excesos.length > 0) {
  console.error(`✗ ${ruta} excede el presupuesto de una lectura.`);
  for (const [nombre, valor, tope] of [
    ["líneas", lineas, MAX_LINEAS],
    ["tokens", tokens, MAX_TOKENS],
    ["bytes", bytes, MAX_BYTES],
  ]) {
    const mal = valor > tope;
    console.error(`    ${nombre.padEnd(7)}: ${valor} / ${tope}${mal ? "  ← excedido" : ""}`);
  }

  const secciones = seccionesFechadas(texto);
  console.error("");
  if (secciones.length === 0) {
    console.error("  No hay entradas `### AAAA-MM-DD` que archivar: el exceso está en");
    console.error("  prosa, decisiones o bloqueos. Hay que recortar, no archivar.");
  } else {
    // Cuántas hay que mover para volver bajo TODOS los topes. Nombrar una sola
    // sección cuando hacen falta tres deja el archivo igual de roto después de
    // seguir la instrucción al pie de la letra.
    let l = lineas, c = texto.length, b = bytes, n = 0;
    const aMover = [];
    for (const s of secciones) {
      if (l <= MAX_LINEAS && Math.ceil(c / CHARS_POR_TOKEN) <= MAX_TOKENS && b <= MAX_BYTES) break;
      l -= s.lineas;
      c -= s.chars;
      b -= s.bytes;
      aMover.push(s);
      n++;
    }
    const bastan = l <= MAX_LINEAS && Math.ceil(c / CHARS_POR_TOKEN) <= MAX_TOKENS && b <= MAX_BYTES;
    console.error(
      `  Mover ${n} sección(es) a docs/SESSION_STATE_ARCHIVE.md (al final, la más vieja primero):`
    );
    for (const s of aMover) console.error(`      ${s.titulo}`);
    if (!bastan) {
      console.error("");
      console.error("  Aun archivando TODAS las entradas fechadas sigue sin caber:");
      console.error("  el exceso está en la prosa, no en el historial. Recortar.");
    }
  }
  console.error("");
  console.error(`  No subir el límite. El límite es la lectura, no la preferencia.`);
  process.exit(1);
}

console.log(
  `✓ ${basename(ruta)} cabe en una lectura: ${lineas}/${MAX_LINEAS} líneas, ` +
    `~${tokens}/${MAX_TOKENS} tokens, ${bytes}/${MAX_BYTES} bytes.`
);

/**
 * Aviso al 80 %, sin fallar.
 *
 * El guardia sólo se quejaba al 100 %, y el 2026-08-31 hubo que archivar dos
 * veces en un día: con varias sesiones escribiendo, este archivo crece del
 * orden de cien líneas diarias. Descubrirlo al chocar con el techo significa
 * archivar con prisa, que es cuando se tira algo que todavía dirigía trabajo.
 *
 * **No falla a propósito.** Un aviso que rompe la compuerta a los pocos días de
 * cada archivado enseña a ignorar la compuerta entera, y entonces tampoco se
 * lee el fallo de verdad al 100 %.
 */
const AVISO = 0.8;
const cerca = [
  ["líneas", lineas, MAX_LINEAS],
  ["tokens", tokens, MAX_TOKENS],
  ["bytes", bytes, MAX_BYTES],
].filter(([, v, tope]) => v / tope >= AVISO);

if (cerca.length > 0) {
  const peor = cerca.sort((a, b) => b[1] / b[2] - a[1] / a[2])[0];
  console.log("");
  console.log(`⚠  Al ${Math.round((peor[1] / peor[2]) * 100)} % del presupuesto en ${peor[0]}.`);
  const secciones = seccionesFechadas(texto);
  if (secciones.length > 0) {
    console.log(`   Archiva ya la más vieja, sin prisa, en vez de al chocar con el techo:`);
    console.log(`       ${secciones[0].titulo}`);
    console.log(`   Va a docs/SESSION_STATE_ARCHIVE.md, la más vieja primero.`);
  } else {
    console.log(`   No hay entradas fechadas que archivar: el peso está en la prosa.`);
  }
}
