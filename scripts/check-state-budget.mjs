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
//   La ruta opcional existe para el flip-test: correrlo contra un archivo que
//   ya viole el presupuesto y comprobar que el veredicto cambia.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const MAX_LINEAS = 400;
const MAX_TOKENS = 20000;
// Conservador a propósito: en español con markdown la relación real ronda
// 3,5–4 caracteres por token. Usar 3 sobreestima, que es el lado seguro.
const CHARS_POR_TOKEN = 3;

const ruta = process.argv[2] ?? "SESSION_STATE.md";

let texto;
try {
  texto = readFileSync(ruta, "utf8");
} catch {
  console.error(`✗ ${ruta} no existe. Es el entregable de cada sesión, no un extra.`);
  process.exit(1);
}

const lineas = texto.split("\n").length;
const tokens = Math.ceil(texto.length / CHARS_POR_TOKEN);
const excedeLineas = lineas > MAX_LINEAS;
const excedeTokens = tokens > MAX_TOKENS;

// La sección más vieja archivable: el encabezado `### AAAA-MM-DD …` con la
// fecha menor. El archivo va de más nuevo a más viejo, pero se busca por fecha
// y no por posición para que un orden roto no produzca un consejo falso.
function seccionMasVieja(src) {
  const encabezados = [...src.matchAll(/^### (\d{4}-\d{2}-\d{2})(.*)$/gm)];
  if (encabezados.length === 0) return null;
  return encabezados
    .map((m) => ({ fecha: m[1], titulo: `### ${m[1]}${m[2]}`.trim() }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
}

if (excedeLineas || excedeTokens) {
  console.error(`✗ ${ruta} excede el presupuesto de una lectura.`);
  console.error(`    líneas: ${lineas} / ${MAX_LINEAS}${excedeLineas ? "  ← excedido" : ""}`);
  console.error(`    tokens: ~${tokens} / ${MAX_TOKENS}${excedeTokens ? "  ← excedido" : ""}`);
  const vieja = seccionMasVieja(texto);
  if (vieja) {
    console.error("");
    console.error(`  Mover esta sección a docs/SESSION_STATE_ARCHIVE.md (al final, la más vieja primero):`);
    console.error(`      ${vieja.titulo}`);
  } else {
    console.error("");
    console.error(`  No hay entradas \`### AAAA-MM-DD\` que archivar: recortar la prosa.`);
  }
  console.error("");
  console.error(`  No subir el límite. El límite es la lectura, no la preferencia.`);
  process.exit(1);
}

console.log(
  `✓ ${basename(ruta)} cabe en una lectura: ${lineas}/${MAX_LINEAS} líneas, ~${tokens}/${MAX_TOKENS} tokens.`
);
