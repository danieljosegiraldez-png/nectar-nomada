import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CODIGOS_DE_RECETA_TRADUCIDOS } from "../../lib/recetas/errorDeReceta";
import { sinComentarios } from "../helpers/sinComentarios";

/**
 * Cada código de error de receta que SE LANZA tiene su lugar en `CODIGOS_DE_RECETA_TRADUCIDOS` y su texto en los DOS idiomas — F2-7 de la revisión final del PR-A.
 *
 * **El agujero.** Las pruebas de `tests/recetas/mensajesDeReceta.test.ts` recorren la LISTA: comprueban que cada código de `CODIGOS_DE_RECETA_TRADUCIDOS` tenga texto. Un código
 * nuevo que alguien lance con `new RecipeError("inventado")` y no añada a la lista no lo ve nadie: `claveDeErrorDeReceta` devuelve `null`, `friendlyError` lo manda al genérico
 * («No se pudo guardar la receta: inventado») y todas las pruebas siguen en verde, porque ninguna miraba lo lanzado. Este guardia mira la FUENTE: extrae cada código lanzado y
 * exige las dos cosas —que esté en la lista y que tenga `Traceability.error_receta_<código>` en es y en en— y, al revés, que cada código de la lista se lance en algún sitio
 * (un texto que nadie puede provocar es una promesa muerta).
 *
 * **Descubre sus archivos.** Recorre todo `lib/` y `app/`; no enumera los cuatro de `lib/recetas`. `paso_de_otra_version` se lanza desde `lib/traceability/processTargets.ts`, y una lista
 * escrita a mano lo habría dejado fuera (`CLAUDE.md`: «un guardia puede vigilar UN ARCHIVO creyendo vigilar una clase»).
 *
 * **Dos formas de lanzar un código.** (1) `new RecipeError("código")`, con cualquiera de las tres comillas. (2) `new RecipeError(codigo)` con el código en una variable: son los
 * ayudantes de `lib/recetas/formularioDePaso.ts` (`numeroONulo`, `elegir`), que lanzan el que les pasa quien los llama. Para ésos el código es el último argumento, escrito en la
 * llamada: se extrae de ahí. Un ayudante NUEVO que lance con una variable no está declarado y el guardia lo denuncia por su nombre, en vez de dejar de ver sus códigos.
 *
 * **Lo que NO prueba, y se dice:** que la frase sea verdad, ni que cada acción llegue a `friendlyError` (eso es de `mensajesDeReceta.test.ts` y de `acciones-traducen-sus-errores`).
 * No es un analizador de TypeScript: un código armado con una plantilla (`` `rango_${x}` ``) o una concatenación no se puede leer, y se denuncia como «sin literal».
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = join(__dirname, "..", "..");

/** Los ayudantes que lanzan `new RecipeError(<variable>)` con el código que les pasa quien los llama (el último argumento). Declararlos aquí es lo que permite leerlos. */
const AYUDANTES_CON_CODIGO_EN_EL_ULTIMO_ARGUMENTO = ["numeroONulo", "elegir", "elegirONulo"];

/** Todos los `.ts` y `.tsx` de `dir`, DESCUBIERTOS y no enumerados. */
function fuentesDe(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...fuentesDe(ruta));
    else if (/\.tsx?$/.test(entrada)) salida.push(ruta);
  }
  return salida;
}

/** El texto de la llamada que abre en `desde` (justo después del `(`), hasta su `)`, partido por las comas de primer nivel. Respeta cadenas y plantillas. */
function argumentosDe(fuente: string, desde: number): string[] {
  const argumentos: string[] = [];
  let actual = "";
  let profundidad = 0;
  let i = desde;
  while (i < fuente.length) {
    const c = fuente[i]!;
    if (c === '"' || c === "'" || c === "`") {
      const comilla = c;
      actual += c;
      i += 1;
      while (i < fuente.length && fuente[i] !== comilla) {
        if (fuente[i] === "\\") {
          actual += fuente[i]! + (fuente[i + 1] ?? "");
          i += 2;
          continue;
        }
        actual += fuente[i];
        i += 1;
      }
      actual += comilla;
      i += 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") profundidad += 1;
    if (c === ")" || c === "]" || c === "}") {
      if (profundidad === 0) break;
      profundidad -= 1;
    }
    if (c === "," && profundidad === 0) {
      argumentos.push(actual.trim());
      actual = "";
    } else actual += c;
    i += 1;
  }
  if (actual.trim() !== "") argumentos.push(actual.trim());
  return argumentos;
}

/** Si `texto` es UNA cadena literal sin interpolación, su contenido; si no, null. */
function literal(texto: string): string | null {
  const m = /^(["'`])([A-Za-z0-9_]+)\1$/.exec(texto.trim());
  return m ? m[2]! : null;
}

/**
 * La misma fuente con el CONTENIDO de cada cadena tapado (las comillas se quedan; cada carácter de dentro pasa a `·`, menos los saltos de línea): las posiciones no cambian. Sirve para buscar
 * `new RecipeError(` sólo donde es código: un texto que lo cite dentro de una cadena no lanza nada. El argumento se lee después de la fuente SIN tapar, en la misma posición.
 */
function conLasCadenasTapadas(fuente: string): string {
  let salida = "";
  let comilla: string | null = null;
  for (let i = 0; i < fuente.length; i++) {
    const c = fuente[i]!;
    if (comilla === null) {
      salida += c;
      if (c === '"' || c === "'" || c === "`") comilla = c;
    } else if (c === "\\") {
      salida += "··";
      i += 1;
    } else if (c === comilla) {
      salida += c;
      comilla = null;
    } else if (c === "\n") {
      // Como en `sinComentarios`: una cadena con `"` o `'` no sobrevive a un salto de línea (era un apóstrofo de prosa o una expresión regular); sólo la plantilla puede ocupar varias.
      salida += c;
      if (comilla !== "`") comilla = null;
    } else {
      salida += "·";
    }
  }
  return salida;
}

/** El nombre de la función `function nombre(` más cercana ANTES de `posicion`, o null. */
function funcionQueContiene(fuente: string, posicion: number): string | null {
  let nombre: string | null = null;
  for (const m of fuente.slice(0, posicion).matchAll(/\bfunction\s+([A-Za-z0-9_]+)\s*[<(]/g)) nombre = m[1]!;
  return nombre;
}

/** Los códigos que lanza `fuente` y los sitios donde se lanza con algo que no se puede leer. */
function codigosLanzadosPor(fuente: string): { codigos: string[]; sinLiteral: string[] } {
  const limpia = sinComentarios(fuente);
  const tapada = conLasCadenasTapadas(limpia);
  const codigos: string[] = [];
  const sinLiteral: string[] = [];
  for (const m of tapada.matchAll(/new\s+RecipeError\s*\(/g)) {
    const [primero] = argumentosDe(limpia, m.index! + m[0].length);
    const codigo = literal(primero ?? "");
    if (codigo !== null) {
      codigos.push(codigo);
      continue;
    }
    const funcion = funcionQueContiene(tapada, m.index!);
    if (!funcion || !AYUDANTES_CON_CODIGO_EN_EL_ULTIMO_ARGUMENTO.includes(funcion)) {
      sinLiteral.push(`${funcion ?? "(fuera de una función)"}: new RecipeError(${primero ?? ""})`);
    }
  }
  // Los códigos que llegan por el último argumento de la llamada a un ayudante.
  for (const ayudante of AYUDANTES_CON_CODIGO_EN_EL_ULTIMO_ARGUMENTO) {
    for (const m of tapada.matchAll(new RegExp(`(?<![A-Za-z0-9_])${ayudante}\\s*\\(`, "g"))) {
      // La propia declaración (`function numeroONulo(`) no es una llamada.
      if (/function\s+$/.test(tapada.slice(0, m.index!))) continue;
      const argumentos = argumentosDe(limpia, m.index! + m[0].length);
      const codigo = literal(argumentos[argumentos.length - 1] ?? "");
      // Dentro de otro ayudante se pasa la variable `codigo` tal cual (`elegirONulo` llama a `elegir(..., codigo)`): no es un código nuevo.
      if (codigo !== null) codigos.push(codigo);
    }
  }
  return { codigos, sinLiteral };
}

const ARCHIVOS = [...fuentesDe(join(RAIZ, "lib")), ...fuentesDe(join(RAIZ, "app"))];
const LANZADOS = new Map<string, string[]>();
const SIN_LITERAL: string[] = [];
for (const archivo of ARCHIVOS) {
  const { codigos, sinLiteral } = codigosLanzadosPor(readFileSync(archivo, "utf8"));
  for (const c of codigos) LANZADOS.set(c, [...(LANZADOS.get(c) ?? []), relative(RAIZ, archivo)]);
  for (const s of sinLiteral) SIN_LITERAL.push(`${relative(RAIZ, archivo)} — ${s}`);
}

const traceability = (idioma: string) =>
  JSON.parse(readFileSync(join(RAIZ, `messages/${idioma}.json`), "utf8")).Traceability as Record<string, unknown>;
const es = traceability("es");
const en = traceability("en");

describe("el extractor de códigos lanzados (con entradas hostiles escritas a mano)", () => {
  it("lee un código con comillas dobles, simples o acento grave, y partido en varias líneas", () => {
    const { codigos } = codigosLanzadosPor(`throw new RecipeError("con_dobles");
      throw new RecipeError('con_simples');
      throw new RecipeError(\`con_acento_grave\`);
      throw new RecipeError(
        "partido_en_lineas",
      );`);
    expect(codigos).toEqual(["con_dobles", "con_simples", "con_acento_grave", "partido_en_lineas"]);
  });

  it("un código inventado en un texto cualquiera se encuentra, y es lo que hace fallar al guardia", () => {
    const { codigos } = codigosLanzadosPor('function f() { if (x) throw new RecipeError("inventado_en_la_prueba"); }');
    expect(codigos).toEqual(["inventado_en_la_prueba"]);
    // Y el guardia lo rechazaría: no está en la lista.
    expect((CODIGOS_DE_RECETA_TRADUCIDOS as readonly string[]).includes("inventado_en_la_prueba")).toBe(false);
  });

  it("lo que está en un comentario o dentro de una cadena no se lanza", () => {
    const { codigos } = codigosLanzadosPor(`// throw new RecipeError("solo_comentado");
      /* new RecipeError("en_un_bloque") */
      const doc = 'new RecipeError("dentro_de_una_cadena")';`);
    expect(codigos).toEqual([]);
  });

  it("un código armado con una plantilla o una variable fuera de un ayudante declarado se denuncia, no se ignora", () => {
    const { codigos, sinLiteral } = codigosLanzadosPor(`function ayudanteNuevo(c: string) { throw new RecipeError(c); }
      function otro(n: number) { throw new RecipeError(\`rango_\${n}\`); }`);
    expect(codigos).toEqual([]);
    expect(sinLiteral).toEqual(["ayudanteNuevo: new RecipeError(c)", "otro: new RecipeError(`rango_${n}`)"]);
  });

  it("un ayudante declarado pasa su código en el último argumento: se lee de la llamada, con cadenas y plantillas por medio", () => {
    const { codigos, sinLiteral } = codigosLanzadosPor(`function numeroONulo(formData: FormData, campo: string, codigo: string) { if (!ok) throw new RecipeError(codigo); }
      const a = numeroONulo(formData, \`adiciones[\${i}][cantidad]\`, "adicion_invalida");
      const b = elegir(formData, "modo", [1, 2, (3)], 'valor_de_otro_catalogo');
      const c = elegirONulo(formData, "regla", REGLAS, "fin_invalido") ?? "first";`);
    expect(sinLiteral).toEqual([]);
    expect(codigos).toEqual(["adicion_invalida", "valor_de_otro_catalogo", "fin_invalido"]);
  });

  it("el último argumento de una llamada a un ayudante que NO es un literal (la variable `codigo` de otro ayudante) no cuenta como código", () => {
    const { codigos } = codigosLanzadosPor("function elegirONulo() { return elegir(formData, campo, validos, codigo); }");
    expect(codigos).toEqual([]);
  });
});

describe("cada código de receta que se lanza está en la lista y tiene su texto en es y en", () => {
  it("control: el extractor encuentra los códigos de verdad, en varios archivos (si dejara de casar, «todos tienen texto» se leería igual que «no miré»)", () => {
    expect(ARCHIVOS.length, "control: recorrió lib/ y app/").toBeGreaterThan(200);
    expect(LANZADOS.size).toBeGreaterThanOrEqual(21);
    const archivos = new Set([...LANZADOS.values()].flat());
    expect([...archivos].sort()).toEqual(
      expect.arrayContaining([
        "lib/recetas/autoria.ts",
        "lib/recetas/formularioDePaso.ts",
        "lib/recetas/pasos.ts",
        "lib/recetas/versiones.ts",
        // De OTRO directorio: lo que demuestra que el descubrimiento sirve.
        "lib/traceability/processTargets.ts",
      ]),
    );
    // Uno por cada forma de lanzar: literal, y por un ayudante de formulario.
    expect(LANZADOS.get("sin_permiso_de_autoria")).toContain("lib/recetas/autoria.ts");
    expect(LANZADOS.get("horas_invalidas")).toContain("lib/recetas/formularioDePaso.ts");
  });

  it("ningún código se lanza con algo que no se pueda leer, fuera de los ayudantes declarados", () => {
    expect(SIN_LITERAL).toEqual([]);
  });

  it("cada código lanzado está en CODIGOS_DE_RECETA_TRADUCIDOS", () => {
    const traducidos = CODIGOS_DE_RECETA_TRADUCIDOS as readonly string[];
    const sinLista = [...LANZADOS.entries()].filter(([codigo]) => !traducidos.includes(codigo)).map(([codigo, donde]) => `${codigo} (${[...new Set(donde)].join(", ")})`);
    expect(sinLista, "códigos lanzados que `claveDeErrorDeReceta` no conoce: saldrían por el genérico con el código crudo").toEqual([]);
  });

  it("cada código lanzado tiene `Traceability.error_receta_<código>` en es y en en", () => {
    const faltan: string[] = [];
    for (const codigo of LANZADOS.keys()) {
      for (const [idioma, textos] of [["es", es], ["en", en]] as const) {
        const texto = textos[`error_receta_${codigo}`];
        if (typeof texto !== "string" || texto.trim() === "") faltan.push(`${idioma}:error_receta_${codigo}`);
      }
    }
    expect(faltan).toEqual([]);
  });

  it("y al revés: cada código de la lista se lanza en algún sitio (un texto que nadie puede provocar es una promesa muerta)", () => {
    const sobran = (CODIGOS_DE_RECETA_TRADUCIDOS as readonly string[]).filter((codigo) => !LANZADOS.has(codigo));
    expect(sobran).toEqual([]);
  });
});
