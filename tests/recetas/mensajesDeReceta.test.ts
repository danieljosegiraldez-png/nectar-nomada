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
