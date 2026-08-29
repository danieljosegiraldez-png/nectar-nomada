#!/usr/bin/env node
// Demuestra que el CLAUDE.md original sigue intacto dentro del actual.
//
// La PR afirmaba "byte a byte" y la evidencia era el diff. Un diff es evidencia
// fuerte, pero no es la comprobación; esto sí lo es, y se puede repetir.
//
// Uso: node scripts/check-claude-md-intact.mjs [ref]   (por defecto HEAD~1)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ref = process.argv[2] ?? "HEAD~1";

let original;
try {
  original = execFileSync("git", ["show", `${ref}:CLAUDE.md`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch {
  console.error(`✗ No pude leer CLAUDE.md en ${ref}.`);
  process.exit(2);
}

const actual = readFileSync("CLAUDE.md", "utf8");
const i = actual.indexOf(original);

const bytes = (s) => Buffer.byteLength(s, "utf8");

if (i === -1) {
  console.error(`✗ El CLAUDE.md de ${ref} NO aparece verbatim dentro del actual.`);
  console.error(`    original: ${original.split("\n").length} líneas, ${bytes(original)} bytes`);
  console.error(`    actual:   ${actual.split("\n").length} líneas, ${bytes(actual)} bytes`);
  console.error("  Alguna línea del documento original se modificó.");
  process.exit(1);
}

const cabecera = actual.slice(0, i);
const pie = actual.slice(i + original.length);
console.log(`✓ El CLAUDE.md de ${ref} aparece verbatim dentro del actual.`);
console.log(`    original:  ${original.split("\n").length} líneas, ${bytes(original)} bytes`);
console.log(`    cabecera:  ${bytes(cabecera)} bytes añadidos antes`);
console.log(`    pie:       ${bytes(pie)} bytes añadidos después`);
console.log(`    ninguna línea del documento original fue modificada.`);
