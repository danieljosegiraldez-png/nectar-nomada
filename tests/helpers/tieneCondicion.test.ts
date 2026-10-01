/**
 * `tieneCondicion`, la guarda de `borrarProcesosDeLotesDonde` (`tests/helpers/procesoDePrueba.ts`).
 *
 * **Vive en un archivo propio, sin base, a propósito.** Antes se probaba dentro de
 * `aperturaDeProceso.test.ts`, que está en el grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`
 * porque necesita base: las pruebas puras de la guarda corrían sólo donde hay base, y el carril hermético
 * de CI (`scripts/ci.sh`: todo lo que NO está en esa lista) no las veía. Aquí no hay `prisma` ni `lib/db`
 * —ni en esta prueba ni en el módulo que prueba—, así que corren en los dos carriles.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { tieneCondicion } from "./tieneCondicion";

const RAIZ = new URL("../..", import.meta.url).pathname;
const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("tieneCondicion, la guarda del ayudante de limpieza (función pura: no toca la base)", () => {
  // Medido el 2026-10-01 en `nectar_test_recetas` (104 lotes), con `count` y sólo lectura
  // (`.superpowers/sdd/…/out/r2-formas-vacias.txt`, `…/r3-formas-negativas.txt` y `…/r4-formas.txt`):
  //   casan con TODOS los lotes:  {}, { id: {} }, { id: undefined }, { AND: [] }, { NOT: [] },
  //                               { AND: [{}] }, { AND: {} }, { NOT: {} }, { NOT: [{}] }
  //                               y TODA negación: { id: { notIn: [] } }, { id: { notIn: ['x'] } },
  //                               { NOT: { id: { in: [] } } }, { NOT: { id: 'x' } }, { id: { not: { in: [] } } },
  //                               { id: { not: 'x' } }, { organization: { isNot: … } }, { measurements: { none: … } }
  //                               y un modificador solo: { lotCode: { mode: 'insensitive' } }
  //                               y un OR con UNA rama que no estrecha: { OR: [{ id: { in: [real] } }, { NOT: … }] },
  //                               { OR: [{ id: { in: [] } }, { id: { notIn: [] } }] }
  //                               y `every`, que una relación vacía cumple: { lotProcesses: { every: … } }
  //                               ({ measurements: { every: … } }: 94, los lotes sin mediciones)
  //                               y una cadena vacía: { lotCode: { contains | startsWith | endsWith | gte | gt: '' } }
  //                               y `null` en un campo casi siempre nulo: { releasedAt: null }
  //   no casan con NINGUNO:       { OR: [] }, { OR: [{}] }, { id: { in: [] } }, { lotCode: '' }, { lotCode: { equals: '' } }
  // `{ AND: [] }` y `{ NOT: [] }` son los que la guarda de la ronda 1 dejaba pasar (una lista vacía contaba como
  // condición); `{ id: { notIn: [] } }`, `{ NOT: { id: { in: [] } } }` y `{ id: { not: { in: [] } } }`, los que dejaba
  // pasar la de la ronda 2 (lo que colgaba de una negación contaba); los OR con una rama abierta, `every`, `''` y
  // `null`, los que dejaba pasar la de la ronda 3. `{ OR: [] }`, `{ OR: [{}] }`, `{ lotCode: '' }` y `equals: ''` no
  // borrarían nada, pero se rechazan igual por conservadores. En la ronda 1 se creyó que `{ OR: [{}] }` casaba con
  // todos: es falso.
  //
  // **Por qué se prueba la función y NO el ayudante.** El ayudante hace un `deleteMany` real, y una prueba que lo
  // llamara con estos filtros dependería sólo de esta guarda para no borrar los procesos de todas las sesiones
  // en una base compartida: el día que alguien la rompa, la prueba que la vigila sería la que borra. La función
  // es pura; el cableado lo vigila la prueba de fuente de abajo.
  const sinCondicion: [string, unknown][] = [
    // Vacíos.
    ["{}", {}],
    ["{ id: {} }", { id: {} }],
    // `undefined` no es una condición: Prisma lo descarta y el filtro queda como `{}`. Aquí lo rechaza esta
    // guarda; en el ayudante salta ANTES de que `assertDefinedWhere` llegue a verlo.
    ["{ id: undefined }", { id: undefined }],
    ["{ AND: [] }", { AND: [] }],
    ["{ NOT: [] }", { NOT: [] }],
    ["{ OR: [] }", { OR: [] }],
    ["{ OR: [{}] }", { OR: [{}] }],
    ["{ AND: [{}] }", { AND: [{}] }],
    ["{ AND: [{}, { id: undefined }] }", { AND: [{}, { id: undefined }] }],
    ["{ AND: {} }", { AND: {} }],
    ["{ NOT: {} }", { NOT: {} }],
    ["{ NOT: [{}] }", { NOT: [{}] }],
    ["{ AND: [{ OR: [] }] }", { AND: [{ OR: [] }] }],
    ["{ lot: { AND: [] } } (anidado)", { lot: { AND: [] } }],
    ["{ lot: { NOT: [] } } (anidado)", { lot: { NOT: [] } }],
    ["{ lot: { id: undefined } } (anidado)", { lot: { id: undefined } }],
    ["{ id: { in: [undefined] } }", { id: { in: [undefined] } }],
    // Sólo negaciones: casan con TODO (medido, 104 de 104), tengan o no valores dentro. Aquí falló la ronda 2.
    ["{ id: { notIn: [] } }", { id: { notIn: [] } }],
    ["{ id: { notIn: ['x'] } }", { id: { notIn: ["x"] } }],
    ["{ NOT: { id: { in: [] } } }", { NOT: { id: { in: [] } } }],
    ["{ NOT: { id: 'x' } }", { NOT: { id: "x" } }],
    ["{ NOT: [{ id: 'x' }] }", { NOT: [{ id: "x" }] }],
    ["{ id: { not: { in: [] } } }", { id: { not: { in: [] } } }],
    ["{ id: { not: 'x' } }", { id: { not: "x" } }],
    ["{ organization: { isNot: { id: 'x' } } }", { organization: { isNot: { id: "x" } } }],
    ["{ measurements: { none: { id: 'x' } } }", { measurements: { none: { id: "x" } } }],
    // Una negación sola, escondida bajo otra clave o dentro de una lista de filtros.
    ["{ AND: [{ NOT: { id: 'x' } }] }", { AND: [{ NOT: { id: "x" } }] }],
    ["{ OR: [{ id: { notIn: ['x'] } }] }", { OR: [{ id: { notIn: ["x"] } }] }],
    ["{ lot: { NOT: { id: 'x' } } } (anidado)", { lot: { NOT: { id: "x" } } }],
    ["{ AND: { NOT: { id: 'x' } } }", { AND: { NOT: { id: "x" } } }],
    ["{ NOT: { id: { in: ['x'] } }, AND: [] } (negación y una lista vacía)", { NOT: { id: { in: ["x"] } }, AND: [] }],
    // Un modificador no restringe nada: sin un valor al que modificar, el filtro es `{}`.
    ["{ lotCode: { mode: 'insensitive' } }", { lotCode: { mode: "insensitive" } }],
    // OR casa con la UNIÓN de sus ramas: basta una rama que no estreche para abrirlo todo. Aquí falló la ronda 3,
    // que trataba OR como AND y daba por buena la primera de estas como control positivo (medido: 104 de 104).
    ["{ OR: [{ id: 'x' }, { NOT: { id: 'y' } }] } (una rama negada)", { OR: [{ id: "x" }, { NOT: { id: "y" } }] }],
    ["{ OR: [{ id: { in: [] } }, { id: { notIn: [] } }] }", { OR: [{ id: { in: [] } }, { id: { notIn: [] } }] }],
    ["{ OR: [{ id: 'x' }, {}] } (una rama vacía)", { OR: [{ id: "x" }, {}] }],
    ["{ OR: [{ id: 'x' }, { AND: [] }] } (una rama vacía)", { OR: [{ id: "x" }, { AND: [] }] }],
    ["{ OR: [{ id: 'x' }, { lotProcesses: { every: { id: 'y' } } }] }", { OR: [{ id: "x" }, { lotProcesses: { every: { id: "y" } } }] }],
    ["{ OR: [{ id: 'x' }, { lotCode: { startsWith: '' } }] }", { OR: [{ id: "x" }, { lotCode: { startsWith: "" } }] }],
    ["{ AND: [{ OR: [{ id: 'x' }, { NOT: { id: 'y' } }] }] } (OR bajo AND)", { AND: [{ OR: [{ id: "x" }, { NOT: { id: "y" } }] }] }],
    ["{ lot: { OR: [{ id: 'x' }, { NOT: { id: 'y' } }] } } (anidado)", { lot: { OR: [{ id: "x" }, { NOT: { id: "y" } }] } }],
    // `every` es un cuantificador vacuo: una relación sin filas lo cumple (medido: 104 de 104 y 94 de 104).
    ["{ lotProcesses: { every: { id: 'x' } } }", { lotProcesses: { every: { id: "x" } } }],
    ["{ measurements: { every: { id: 'x' } } }", { measurements: { every: { id: "x" } } }],
    // Una cadena vacía no es una restricción: el accidente realista es un prefijo vaciado por una variable vacía.
    ["{ lotCode: { contains: '' } }", { lotCode: { contains: "" } }],
    ["{ lotCode: { startsWith: '' } } (un prefijo vaciado por una variable vacía)", { lotCode: { startsWith: "" } }],
    ["{ lotCode: { endsWith: '' } }", { lotCode: { endsWith: "" } }],
    ["{ lotCode: { contains: '', mode: 'insensitive' } }", { lotCode: { contains: "", mode: "insensitive" } }],
    ["{ lotCode: { gte: '' } }", { lotCode: { gte: "" } }],
    ["{ lotCode: { equals: '' } } (casa con 0: se rechaza por conservadora)", { lotCode: { equals: "" } }],
    ["{ lotCode: '' } (casa con 0: se rechaza por conservadora)", { lotCode: "" }],
    ["{ lot: { lotCode: { startsWith: '' } } } (anidado)", { lot: { lotCode: { startsWith: "" } } }],
    // `null` tampoco: en un campo que casi siempre es nulo casa con casi todo (medido: 104 de 104).
    ["{ releasedAt: null }", { releasedAt: null }],
    ["{ greenGradeNote: { equals: null } }", { greenGradeNote: { equals: null } }],
    ["{ project: { is: null } } (casa con 3: se rechaza por conservadora)", { project: { is: null } }],
  ];
  it.each(sinCondicion)("rechaza %s: no es una condición", (_etiqueta, filtro) => {
    expect(tieneCondicion(filtro)).toBe(false);
  });

  // Controles positivos: sin ellos, una función que devolviera siempre `false` pasaría todo lo de arriba.
  const conCondicion: [string, unknown][] = [
    ["{ id: 'x' }", { id: "x" }],
    ["{ id: { in: ['x'] } }", { id: { in: ["x"] } }],
    ["{ lotCode: { startsWith: 'TEST' } }", { lotCode: { startsWith: "TEST" } }],
    ["{ AND: [{ id: 'x' }] }", { AND: [{ id: "x" }] }],
    ["{ OR: [{ id: 'x' }] }", { OR: [{ id: "x" }] }],
    ["{ AND: [], id: 'x' } (una lista vacía junto a una condición real)", { AND: [], id: "x" }],
    ["{ lot: { id: 'x' } } (anidado)", { lot: { id: "x" } }],
    // `in: []` SÍ es una condición: no casa con nada, y es lo que queda en el `afterAll` cuando el `beforeAll`
    // no llegó a crear ningún lote. Si la guarda lo rechazara, esa limpieza lanzaría y abandonaría las líneas
    // siguientes (un `afterAll` es una cadena).
    ["{ id: { in: [] } } (lista de valores vacía)", { id: { in: [] } }],
    // Una condición positiva Y además negaciones SÍ vale BAJO AND (las claves de un objeto son un AND): lo positivo
    // estrecha y lo negado sólo recorta. Bajo OR es al revés: ver las hostiles de OR arriba.
    ["{ id: { in: ['x'] }, NOT: { lotCode: 'y' } } (positiva y una negación)", { id: { in: ["x"] }, NOT: { lotCode: "y" } }],
    ["{ id: { in: ['x'], notIn: ['y'] } } (en la misma clave)", { id: { in: ["x"], notIn: ["y"] } }],
    ["{ id: 'x', NOT: [] } (positiva y una negación vacía)", { id: "x", NOT: [] }],
    ["{ lot: { id: 'x', NOT: { lotCode: 'y' } } } (anidado)", { lot: { id: "x", NOT: { lotCode: "y" } } }],
    // OR vale cuando TODAS sus ramas estrechan; y un OR que no estrecha no estropea a una positiva de al lado (AND).
    ["{ OR: [{ id: 'x' }, { lotCode: { startsWith: 'TEST' } }] } (todas las ramas positivas)", { OR: [{ id: "x" }, { lotCode: { startsWith: "TEST" } }] }],
    ["{ id: 'x', OR: [{ NOT: { id: 'y' } }] } (OR sin positiva junto a una positiva)", { id: "x", OR: [{ NOT: { id: "y" } }] }],
    // `every` no cuenta, `some` sí: pide al menos una fila relacionada que case (medido: 0 de 104 con un id inexistente).
    ["{ measurements: { some: { id: 'x' } } }", { measurements: { some: { id: "x" } } }],
    // Un `null` junto a una positiva no la tapa.
    ["{ id: 'x', releasedAt: null } (null junto a una positiva)", { id: "x", releasedAt: null }],
    ["{ lotCode: { contains: 'TEST', mode: 'insensitive' } } (el modificador acompaña a un valor)", { lotCode: { contains: "TEST", mode: "insensitive" } }],
  ];
  it.each(conCondicion)("acepta %s: sí es una condición", (_etiqueta, filtro) => {
    expect(tieneCondicion(filtro)).toBe(true);
  });
});

describe("el ayudante de limpieza llama a esa guarda antes de cualquier borrado (prueba de FUENTE)", () => {
  // La guarda de arriba no sirve si el ayudante deja de llamarla, la llama después de borrar, o usa otra copia.
  // Se lee el archivo en vez de ejecutar el ayudante con filtros hostiles (ver la nota del bloque anterior).
  const fuente = readFileSync(`${RAIZ}tests/helpers/procesoDePrueba.ts`, "utf8");

  /** El cuerpo de `export async function <nombre>(…) {…}`, cerrado por llaves y no por indentación. */
  function cuerpoDe(texto: string, nombre: string): string {
    const ini = texto.indexOf(`export async function ${nombre}(`);
    if (ini < 0) return "";
    let i = texto.indexOf("(", ini);
    for (let nivel = 0; i < texto.length; i++) {
      if (texto[i] === "(") nivel++;
      else if (texto[i] === ")" && --nivel === 0) break;
    }
    const abre = texto.indexOf("{", i);
    let nivel = 0;
    for (let j = abre; j < texto.length; j++) {
      if (texto[j] === "{") nivel++;
      else if (texto[j] === "}" && --nivel === 0) return texto.slice(abre, j + 1);
    }
    return "";
  }

  const cuerpo = sinComentarios(cuerpoDe(fuente, "borrarProcesosDeLotesDonde"));
  const primerBorrado = cuerpo.search(/\.deleteMany\(/);
  const guarda = /if\s*\(\s*!\s*tieneCondicion\(\s*lot\s*\)\s*\)\s*\{?\s*throw\s+new\s+UnsafeWhereClauseError\(/.exec(cuerpo);

  it("el análisis encuentra el cuerpo del ayudante y sus dos borrados (control del propio análisis)", () => {
    expect(cuerpo.length, "no se encontró el cuerpo de borrarProcesosDeLotesDonde").toBeGreaterThan(50);
    expect(cuerpo.match(/\.deleteMany\(/g) ?? [], "el ayudante hace dos deleteMany: devoluciones y procesos").toHaveLength(2);
    expect(primerBorrado).toBeGreaterThan(0);
  });

  it("lanza UnsafeWhereClauseError si !tieneCondicion(lot), y lo hace ANTES de su primer deleteMany", () => {
    expect(guarda, "el ayudante no llama a `if (!tieneCondicion(lot)) throw new UnsafeWhereClauseError(…)`").not.toBeNull();
    expect(guarda!.index, "la guarda va después del primer deleteMany").toBeLessThan(primerBorrado);
  });

  it("la guarda es la de este módulo, no una copia propia del ayudante", () => {
    const codigo = sinComentarios(fuente);
    expect(codigo, "el ayudante no importa tieneCondicion de ./tieneCondicion").toMatch(
      /import\s*\{[^}]*\btieneCondicion\b[^}]*\}\s*from\s*["']\.\/tieneCondicion["']/,
    );
    expect(codigo, "el ayudante define su propia tieneCondicion: la prueba de arriba probaría otra").not.toMatch(
      /(function\s+tieneCondicion\b|(const|let|var)\s+tieneCondicion\b)/,
    );
  });
});

describe("el módulo de la guarda no importa nada en tiempo de ejecución (es lo que lo deja correr sin base)", () => {
  const modulo = sinComentarios(readFileSync(`${RAIZ}tests/helpers/tieneCondicion.ts`, "utf8"));

  it("el análisis ve el módulo y su función (control del propio análisis)", () => {
    expect(modulo, "no se encontró `export function tieneCondicion` en el módulo").toMatch(/export\s+function\s+tieneCondicion\s*\(/);
  });

  it("no hay ningún import ni require que no sea `import type`", () => {
    const importes =
      modulo.match(/^\s*import\b(?!\s+type\b)[^\n]*|^\s*export\s*(?:\*|\{[^}]*\})\s*from\b[^\n]*|\brequire\s*\(|\bimport\s*\(/gm) ?? [];
    expect(importes, "el módulo importa algo en tiempo de ejecución: ya no es puro ni corre en el carril hermético").toEqual([]);
  });
});
