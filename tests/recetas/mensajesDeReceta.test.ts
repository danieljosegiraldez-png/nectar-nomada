/**
 * Cada código de error de la receta tiene su texto en español Y en inglés, y `friendlyError` lo da — Parte 2a, tarea 3
 * (2026-10-03).
 *
 * Gemela de `tests/traceability/mensajesDeProceso.test.ts`, y por lo mismo: sin esto, un `RecipeError` saldría por el genérico
 * de la receta con el código crudo («No se pudo guardar la receta: version_no_es_borrador»).
 *
 * **Hermética.** Importa sólo `lib/recetas/errorDeReceta.ts`, que no importa nada, y lee tres archivos (los dos JSON y la
 * fuente de la acción). La corre `scripts/ci.sh` en el carril sin base; no va en `scripts/pruebas-por-compuerta.txt`.
 *
 * **Lo que NO prueba:** que cada frase sea verdad en todos los sitios donde se lanza su código, ni que cada acción llegue a
 * `friendlyError` (hoy ninguna acción llama a `lib/recetas/pasos.ts`: llegan con el editor, tarea 14). La guardia de orden lee
 * la FUENTE sin comentarios: dice que las ramas existen en código y en qué orden, no que traduzcan.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CODIGOS_DE_RECETA_TRADUCIDOS, RecipeError, claveDeErrorDeReceta } from "../../lib/recetas/errorDeReceta";
import { CODIGOS_DE_META_TRADUCIDOS, ProcessTargetError, claveDeErrorDeMeta } from "../../lib/traceability/processTargets";

const RAIZ = new URL("../..", import.meta.url).pathname;
const traceability = (idioma: string) =>
  JSON.parse(readFileSync(join(RAIZ, `messages/${idioma}.json`), "utf8")).Traceability as Record<string, string>;
const es = traceability("es");
const en = traceability("en");

// Escritos a mano, a propósito: si alguien ENCOGE la lista de la fuente, las pruebas que la recorren mirarían menos códigos
// y seguirían en verde; ésta es la que lo ve.
const CODIGOS_DE_LA_TAREA_3 = [
  // Autoría (V16) y lectura.
  "sin_permiso_de_autoria",
  "organizacion_sin_lotes",
  // Borrador y publicar.
  "version_no_encontrada",
  "version_no_es_borrador",
  "version_sin_pasos",
  // La lista de pasos.
  "paso_no_encontrado",
  "posicion_invalida",
  // El paso y sus ejes.
  "tipo_de_paso_desconocido",
  "eje_no_aplica",
  "valor_de_otro_catalogo",
  "horas_invalidas",
  "fin_por_tiempo_sin_horas",
  "solo_en_secado",
  "porcentaje_fuera_de_rango",
  "mucilago_fuera_de_tramos",
  "rango_invalido",
  "adicion_invalida",
  "fin_invalido",
  "lectura_no_marcada",
  "meta_de_recepcion_no_se_vigila",
  // Metas por paso.
  "paso_de_otra_version",
];

// Tarea 4 (versiones y plantillas, diseño §3.3–§3.4): seis. Una lista aparte, con su propio control del número, para que añadir o
// quitar un código de una tarea no mueva la cuenta de la otra.
const CODIGOS_DE_LA_TAREA_4 = [
  "ya_hay_un_borrador",
  "no_es_plantilla",
  "version_no_publicada",
  "nombre_requerido",
  "nombre_repetido",
  "receta_libre_no_se_versiona",
];

/**
 * Los comentarios fuera, SALTANDO las cadenas. Copia de `sinComentarios` de `tests/traceability/mensajesDeProceso.test.ts`: no
 * se importa de allí porque ese archivo es una prueba y importarlo registraría sus `describe` aquí. Tiene su control abajo.
 */
function sinComentarios(fuente: string): string {
  return fuente.replace(
    /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`)|\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm,
    (_coincidencia, cadena?: string) => cadena ?? "",
  );
}

const CODIGO_DE_LA_ACCION = sinComentarios(readFileSync(join(RAIZ, "app", "actions", "traceability.ts"), "utf8"));

/** Dónde está `ancla` en el CÓDIGO de la acción; exige que aparezca exactamente una vez. */
function unaVez(ancla: string): number {
  const veces = CODIGO_DE_LA_ACCION.split(ancla).length - 1;
  expect(veces, `«${ancla}» tiene que aparecer exactamente una vez en el código (sin comentarios) de la acción`).toBe(1);
  return CODIGO_DE_LA_ACCION.indexOf(ancla);
}

describe("los códigos de la receta tienen su texto en es y en", () => {
  it("control: la lista trae los veintiún códigos de la tarea 3", () => {
    expect(CODIGOS_DE_LA_TAREA_3.length).toBe(21);
    expect([...CODIGOS_DE_RECETA_TRADUCIDOS]).toEqual(expect.arrayContaining(CODIGOS_DE_LA_TAREA_3));
  });

  it("control: la lista trae los seis códigos de la tarea 4", () => {
    expect(CODIGOS_DE_LA_TAREA_4.length).toBe(6);
    expect([...CODIGOS_DE_RECETA_TRADUCIDOS]).toEqual(expect.arrayContaining(CODIGOS_DE_LA_TAREA_4));
  });

  it("cada código tiene `Traceability.error_receta_<código>` en los dos idiomas", () => {
    const faltan: string[] = [];
    for (const c of CODIGOS_DE_RECETA_TRADUCIDOS) {
      const clave = `error_receta_${c}`;
      if (!es[clave]) faltan.push(`es:${clave}`);
      if (!en[clave]) faltan.push(`en:${clave}`);
    }
    expect(faltan).toEqual([]);
  });

  it("cada código da su clave; otro código u otra clase, ninguna", () => {
    for (const c of CODIGOS_DE_RECETA_TRADUCIDOS) {
      expect(claveDeErrorDeReceta(new RecipeError(c))).toBe(`error_receta_${c}`);
    }
    expect(claveDeErrorDeReceta(new RecipeError("codigo_que_no_existe"))).toBeNull();
    expect(claveDeErrorDeReceta(new Error("version_no_es_borrador"))).toBeNull();
  });

  it("el texto de una meta que no cabe en una recepción dice lo que cabe y no promete que se vigile o se compare (F1-4)", () => {
    // La comparación de la recepción con las recepciones del lote es del PR-B: con sólo el PR-A la meta se guarda y nada la lee.
    const ESPERADO: [string, string, string][] = [
      ["es", es.error_receta_meta_de_recepcion_no_se_vigila ?? "", "En un paso de recepción sólo cabe la meta de Brix inicial."],
      ["en", en.error_receta_meta_de_recepcion_no_se_vigila ?? "", "A reception step only takes the initial Brix target."],
    ];
    for (const [idioma, texto, frase] of ESPERADO) {
      expect(texto, `${idioma}: error_receta_meta_de_recepcion_no_se_vigila`).toBe(frase);
      expect(texto, `${idioma}: no promete`).not.toMatch(/vigila|compara|watched|compared|never/i);
    }
  });

  it("ningún texto deja el código crudo a la vista", () => {
    for (const c of CODIGOS_DE_RECETA_TRADUCIDOS) {
      for (const [idioma, textos] of [
        ["es", es],
        ["en", en],
      ] as const) {
        const texto = textos[`error_receta_${c}`] ?? "";
        expect(texto, `${idioma}: error_receta_${c} existe`).not.toBe("");
        expect(texto, `${idioma}: error_receta_${c} no enseña «${c}»`).not.toContain(c);
      }
    }
  });
});

/**
 * Las reglas de una meta de paso (`validateTargets`) lanzan `ProcessTargetError`, y `friendlyError` los mandaba al genérico con el código crudo en inglés («No se pudo guardar la
 * receta: target_needs_a_number») — F1-7 de la revisión final de la Parte 2a. Los textos buenos ya existían (`error_target_needs_a_number`…), sin uso; faltaban los de las dos cadencias.
 * Los dos que NO entran, y por qué: `at_least_one_target_required` y `phase_required` los lanza `validateTargets` ante lo que el editor no manda (el paso llama con al menos una meta, y una meta
 * de paso no declara fase).
 */
describe("los códigos de una meta de paso tienen su texto en es y en, y friendlyError los da (F1-7)", () => {
  const SIN_ENTRADA: Record<string, string> = {
    at_least_one_target_required: "validarPaso sólo llama a validateTargets con al menos una meta",
    phase_required: "una meta de paso lleva `recipeStepId` y no declara fase: sólo la de una versión la exige",
  };
  // Escritos a mano, a propósito: si alguien ENCOGE la lista de la fuente, las pruebas que la recorren mirarían menos códigos y seguirían en verde.
  const LOS_OCHO = [
    "target_needs_a_number",
    "range_inverted",
    "unknown_variable",
    "wrong_unit_for_variable",
    "target_out_of_physical_range",
    "cadence_only_while_running",
    "cadence_must_be_positive_hours",
    "duplicate_variable_and_moment",
  ];

  /** Los códigos que lanza `validateTargets`, leídos de SU fuente (sin comentarios): desde su firma hasta el siguiente `export`. */
  function codigosQueLanzaValidateTargets(): string[] {
    const fuente = sinComentarios(readFileSync(join(RAIZ, "lib", "traceability", "processTargets.ts"), "utf8"));
    const inicio = fuente.indexOf("export function validateTargets(");
    expect(inicio, "control: validateTargets sigue en processTargets.ts").toBeGreaterThan(-1);
    const fin = fuente.indexOf("\nexport ", inicio + 1);
    const cuerpo = fuente.slice(inicio, fin === -1 ? undefined : fin);
    return [...new Set([...cuerpo.matchAll(/new ProcessTargetError\("([a-z_]+)"\)/g)].map((m) => m[1]!))];
  }

  it("control: la lista trae los ocho códigos que el editor puede provocar", () => {
    expect(LOS_OCHO.length).toBe(8);
    expect([...CODIGOS_DE_META_TRADUCIDOS].sort()).toEqual([...LOS_OCHO].sort());
  });

  it("la lista cubre los códigos que lanza validateTargets: cada uno está en la lista o tiene su razón para no estarlo, y ninguno a medias", () => {
    const lanzados = codigosQueLanzaValidateTargets();
    expect(lanzados.length, "control: el detector encontró los diez códigos").toBe(10);
    const sinLista = lanzados.filter((c) => !(CODIGOS_DE_META_TRADUCIDOS as readonly string[]).includes(c) && !(c in SIN_ENTRADA));
    expect(sinLista, "códigos de validateTargets sin texto ni razón").toEqual([]);
    // Y lo contrario: la lista no nombra un código que validateTargets ya no lanza, ni uno que a la vez se declara sin entrada.
    const sobran = [...CODIGOS_DE_META_TRADUCIDOS].filter((c) => !lanzados.includes(c) || c in SIN_ENTRADA);
    expect(sobran).toEqual([]);
    expect(Object.keys(SIN_ENTRADA).filter((c) => !lanzados.includes(c)), "una razón para un código que ya no se lanza").toEqual([]);
  });

  it("cada código de la lista tiene `Traceability.error_<código>` en los dos idiomas, sin dejar el código crudo a la vista", () => {
    const mal: string[] = [];
    for (const c of CODIGOS_DE_META_TRADUCIDOS) {
      for (const [idioma, textos] of [["es", es], ["en", en]] as const) {
        const texto = textos[`error_${c}`] ?? "";
        if (texto === "") mal.push(`${idioma}:error_${c} falta`);
        else if (texto.includes(c)) mal.push(`${idioma}:error_${c} enseña el código`);
      }
    }
    expect(mal).toEqual([]);
  });

  it("claveDeErrorDeMeta da la clave de un ProcessTargetError de la lista; otro código u otra clase, ninguna", () => {
    for (const c of CODIGOS_DE_META_TRADUCIDOS) expect(claveDeErrorDeMeta(new ProcessTargetError(c))).toBe(`error_${c}`);
    expect(claveDeErrorDeMeta(new ProcessTargetError("recipe_not_found"))).toBeNull();
    expect(claveDeErrorDeMeta(new Error("range_inverted"))).toBeNull();
    expect(claveDeErrorDeMeta(new RecipeError("range_inverted"))).toBeNull();
  });

  it("las dos cadencias dicen lo que hay que corregir: el ritmo sólo es de una meta «durante», y es un entero de horas con tope", () => {
    expect(es.error_cadence_only_while_running).toMatch(/durante/);
    expect(es.error_cadence_must_be_positive_hours).toMatch(/entero/);
    expect(es.error_cadence_must_be_positive_hours).toContain("100000");
    expect(en.error_cadence_only_while_running).toMatch(/during/i);
    expect(en.error_cadence_must_be_positive_hours).toContain("100000");
  });

  it("friendlyError consulta claveDeErrorDeMeta y devuelve su texto ANTES del genérico de ProcessTargetError", () => {
    const llamada = unaVez("const claveDeMeta = claveDeErrorDeMeta(error);");
    const devuelve = unaVez("if (claveDeMeta) return t(claveDeMeta");
    const generica = unaVez('if (error instanceof ProcessTargetError) return t("error_process_target",');
    expect(llamada).toBeLessThan(devuelve);
    expect(devuelve, "el `return` que da el texto va antes del genérico").toBeLessThan(generica);
  });
});

describe("friendlyError: la rama de la receta (guardia de fuente, sobre el código sin comentarios)", () => {
  it("el quitacomentarios quita el texto comentado y conserva una cadena que lleva `//`", () => {
    expect(sinComentarios("a(); // const claveDeReceta = claveDeErrorDeReceta(error);\nb();")).not.toContain("claveDeErrorDeReceta");
    expect(sinComentarios("a(); /* if (claveDeReceta) return t(claveDeReceta */ b();")).not.toContain("claveDeReceta");
    expect(sinComentarios('t("a // b"); // c')).toBe('t("a // b"); ');
  });

  it("friendlyError consulta claveDeErrorDeReceta y devuelve su texto ANTES del genérico de RecipeError", () => {
    // Las TRES cosas, en código vivo y en este orden: la llamada, el `return` que da el texto, y el genérico de la clase.
    const llamada = unaVez("const claveDeReceta = claveDeErrorDeReceta(error);");
    const devuelve = unaVez("if (claveDeReceta) return t(claveDeReceta");
    const generica = unaVez('if (error instanceof RecipeError) return t("error_process_target",');
    expect(llamada, "la llamada va antes del `return` que da el texto").toBeLessThan(devuelve);
    expect(devuelve, "el `return` que da el texto va antes del genérico").toBeLessThan(generica);
  });
});
