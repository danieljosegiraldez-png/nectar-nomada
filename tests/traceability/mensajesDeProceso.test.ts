/**
 * Cada código de error del proceso que tiene texto propio lo tiene en español Y en inglés — Parte 1, R2–R8, tarea 12
 * (2026-10-03; ronda de arreglo 1, 2026-10-03).
 *
 * **Por qué existe.** `friendlyError` (`app/actions/traceability.ts`) traducía todo `LotProcessError` con un mensaje
 * genérico que enseñaba el código crudo («No se pudo registrar el proceso: sin_proceso_abierto»). Las reglas de esta
 * parte lanzan códigos que el operario SÍ puede resolver —un café en bodega, un lote dividido, una mezcla—, y para eso
 * tiene que leer qué pasó. La lista es `CODIGOS_DE_PROCESO_TRADUCIDOS` (`lib/traceability/errorDeProceso.ts`); un código
 * que no esté en ella sigue saliendo por el genérico, a propósito.
 *
 * **Hermética.** Sólo importa dos módulos sin dependencias (`errorDeProceso.ts`, `topeDeLinaje.ts`) y lee tres archivos (los
 * dos JSON y la fuente de la acción); no toca `lib/db`, así que corre en el carril sin base de `scripts/ci.sh`. El patrón es
 * el de `tests/beneficio/mensajesDeAjustes.test.ts`.
 *
 * **Lo que NO prueba:** que cada frase sea verdad en todos los sitios donde se lanza su código (eso lo mide quien la escribe,
 * con un `grep` de dónde se lanza, y queda en el informe de la tarea), ni que cada acción llegue a `friendlyError`.
 * `friendlyError` no se exporta —su archivo es `"use server"`—, así que las pruebas de orden leen la FUENTE: dicen que las
 * ramas existen **en código** y en qué orden, no que traduzcan.
 *
 * **Las guardias de fuente miran el código SIN comentarios** (ronda de arreglo 1). Con `indexOf` sobre el archivo entero, una
 * llamada comentada, o una rama entera comentada, casaba con el texto del comentario y la guardia seguía verde.
 *
 * **Las palabras de `LO_QUE_EL_TEXTO_TIENE_QUE_DECIR` no son una guardia de estilo:** cada fila es un defecto de verdad que
 * la revisión encontró en el texto anterior (una frase falsa en uno de los caminos donde se lanza su código) y fija la palabra
 * que lo corrige, para que volver al texto viejo haga caer una prueba con el nombre de la clave. Una frase nueva que diga lo
 * mismo con otras palabras debe actualizar su fila: es el precio de que un texto falso no vuelva callado.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CODIGOS_DE_PROCESO_TRADUCIDOS, LotProcessError, claveDeErrorDeProceso } from "../../lib/traceability/errorDeProceso";
import { TOPE_DE_LINAJE } from "../../lib/traceability/topeDeLinaje";

const RAIZ = new URL("../..", import.meta.url).pathname;
const traceability = (idioma: string) =>
  JSON.parse(readFileSync(join(RAIZ, `messages/${idioma}.json`), "utf8")).Traceability as Record<string, string>;
const es = traceability("es");
const en = traceability("en");

// Los doce de diseño §3.3 más `process_already_open` («en este café») y `devolucion_antes_del_cierre`, que la tarea 8 añadió
// con la ronda de arreglo 1. Escritos aquí a mano, a propósito: si alguien ENCOGE la lista de la fuente, las demás pruebas
// recorrerían menos códigos y seguirían en verde; ésta es la que lo ve.
const CODIGOS_QUE_EL_DISENO_NOMBRA = [
  "sin_proceso_abierto",
  "lote_dividido",
  "lote_mezclado",
  "lote_en_bodega",
  "proceso_no_aplica_a_miel",
  "corridas_abiertas",
  "division_deja_remanente",
  "seleccion_bajo_proceso_abierto",
  "fusion_bajo_proceso_abierto",
  "receta_distinta_del_proceso",
  "lineage_too_deep",
  "motivo_otro_requiere_nota",
  "process_already_open",
  "devolucion_antes_del_cierre",
  // Ronda de arreglo 1 de la revisión final (2026-10-03): los códigos nuevos de las decisiones de Daniel del 2026-10-02 y de
  // la revisión final (diseño §3.3, «Nombres nuevos para que Daniel los revise»).
  "descendiente_en_bodega",
  "corrida_ya_abierta",
  "lote_consumido",
];

/**
 * Los comentarios fuera, SALTANDO las cadenas. Copia de `sinComentarios` de
 * `tests/arquitectura/proceso-por-el-resolvedor.test.ts` (tarea 10, ronda de arreglo 1): no se importa de allí porque ese
 * archivo es una prueba y importarlo registraría sus `describe` aquí. Un `/*` o un `//` dentro de una cadena —`"a // b"`— no
 * abre un comentario; las cadenas se conservan tal cual (comillas simples y dobles, que no cruzan de línea, y plantillas), y
 * `://` fuera de una cadena tampoco es un comentario. Tiene sus controles abajo («el quitacomentarios…»).
 */
function sinComentarios(fuente: string): string {
  return fuente.replace(
    /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`)|\/\*[\s\S]*?\*\/|(?<!:)\/\/.*$/gm,
    (_coincidencia, cadena?: string) => cadena ?? "",
  );
}

const CODIGO_DE_LA_ACCION = sinComentarios(readFileSync(join(RAIZ, "app", "actions", "traceability.ts"), "utf8"));

/** Dónde está `ancla` en el CÓDIGO de la acción; exige que aparezca exactamente una vez (un señuelo no puede satisfacer el orden). */
function unaVez(ancla: string): number {
  const veces = CODIGO_DE_LA_ACCION.split(ancla).length - 1;
  expect(veces, `«${ancla}» tiene que aparecer exactamente una vez en el código (sin comentarios) de la acción`).toBe(1);
  return CODIGO_DE_LA_ACCION.indexOf(ancla);
}

/** Dónde está la PRIMERA aparición de `ancla` (las ramas genéricas se repiten por clase: `t("error_sample", …)` va dos veces). */
function primera(ancla: string): number {
  const donde = CODIGO_DE_LA_ACCION.indexOf(ancla);
  expect(donde, `control: «${ancla}» sigue existiendo en el código de la acción`).toBeGreaterThan(-1);
  return donde;
}

describe("los códigos del proceso tienen su texto en es y en", () => {
  it("control: la lista no está vacía y trae todos los códigos que el diseño nombra", () => {
    expect(CODIGOS_DE_PROCESO_TRADUCIDOS.length).toBeGreaterThanOrEqual(CODIGOS_QUE_EL_DISENO_NOMBRA.length);
    expect([...CODIGOS_DE_PROCESO_TRADUCIDOS]).toEqual(expect.arrayContaining(CODIGOS_QUE_EL_DISENO_NOMBRA));
  });
  it("cada código tiene `Traceability.error_proceso_<código>` en los dos idiomas", () => {
    const faltan: string[] = [];
    for (const c of CODIGOS_DE_PROCESO_TRADUCIDOS) {
      const clave = `error_proceso_${c}`;
      if (!es[clave]) faltan.push(`es:${clave}`);
      if (!en[clave]) faltan.push(`en:${clave}`);
    }
    expect(faltan).toEqual([]);
  });
  it("cada código da su clave; otro código u otra clase, ninguna", () => {
    for (const c of CODIGOS_DE_PROCESO_TRADUCIDOS) {
      expect(claveDeErrorDeProceso(new LotProcessError(c))).toBe(`error_proceso_${c}`);
    }
    expect(claveDeErrorDeProceso(new LotProcessError("process_not_found"))).toBeNull();
    expect(claveDeErrorDeProceso(new Error("sin_proceso_abierto"))).toBeNull();
  });
});

describe("friendlyError: el orden de sus ramas (guardias de fuente, sobre el código sin comentarios)", () => {
  it("el quitacomentarios: quita el texto comentado, con `//` y con `/* */`, y conserva una cadena que lleva `//`", () => {
    expect(sinComentarios("a(); // const claveDeProceso = claveDeErrorDeProceso(error);\nb();")).not.toContain("claveDeErrorDeProceso");
    expect(sinComentarios("a(); /* if (claveDeProceso) return t(claveDeProceso */ b();")).not.toContain("claveDeProceso");
    expect(sinComentarios('t("a // b"); // c')).toBe('t("a // b"); ');
  });
  it("friendlyError consulta claveDeErrorDeProceso y devuelve su texto ANTES de la rama genérica del proceso", () => {
    // Las TRES cosas, en código vivo y en este orden: la llamada, el `return` que da el texto, y la rama genérica. Con sólo la
    // llamada, borrar el `return`, ponerlo detrás de la genérica o comentar la llamada dejaba la guardia verde.
    const llamada = unaVez("const claveDeProceso = claveDeErrorDeProceso(error);");
    const devuelve = unaVez("if (claveDeProceso) return t(claveDeProceso");
    const generica = unaVez('if (error instanceof LotProcessError) return t("error_lot_process",');
    expect(llamada, "la llamada va antes del `return` que da el texto").toBeLessThan(devuelve);
    expect(devuelve, "el `return` que da el texto va antes de la rama genérica").toBeLessThan(generica);
  });
  it("friendlyError dice `lote_dividido` de las mediciones y de las muestras con el texto del proceso, ANTES de sus ramas genéricas", () => {
    // R6.6 lanza `lote_dividido` también desde `recordMeasurement` y `createSampleFromLot`, con SUS clases
    // (`MeasurementValidationError`, `SampleValidationError`): `claveDeErrorDeProceso` sólo mira `LotProcessError`.
    // Todo sobre el código SIN comentarios: la rama entera comentada ya no casa.
    const marca = unaVez('error.message === "lote_dividido"');
    const inicioDeLaRama = CODIGO_DE_LA_ACCION.lastIndexOf("if (", marca);
    const condicion = CODIGO_DE_LA_ACCION.slice(inicioDeLaRama, marca);
    expect(condicion, "la rama debe cubrir las mediciones").toContain("instanceof MeasurementValidationError");
    expect(condicion, "la rama debe cubrir las muestras").toContain("instanceof SampleFromLotValidationError");
    const cuerpo = CODIGO_DE_LA_ACCION.slice(marca, marca + 160);
    expect(cuerpo, "la rama debe devolver el texto del proceso").toContain('t("error_proceso_lote_dividido")');
    // Controles: las dos ramas genéricas siguen existiendo, y ésta va antes de ambas (`friendlyError` las mira en orden).
    const genericaDeMedicion = primera('t("error_measurement",');
    const genericaDeMuestra = primera('t("error_sample",');
    expect(marca).toBeLessThan(genericaDeMedicion);
    expect(marca).toBeLessThan(genericaDeMuestra);
  });
});

/**
 * Por clave, lo que el texto TIENE que decir y lo que NO puede decir, en cada idioma. Cada fila nace de un defecto medido
 * contra los sitios donde se lanza el código (`lib/` y `app/`, ronda de arreglo 1); `por` dice cuál.
 */
interface Exigencia {
  readonly por: string;
  readonly es: { debe?: RegExp[]; noDebe?: RegExp[] };
  readonly en: { debe?: RegExp[]; noDebe?: RegExp[] };
}

// Ninguno de los dos códigos tiene hoy puerta en `app/` (`recordStageChangeFormAction` sólo manda `stage_change`): su texto
// no puede mandar al operario a una pantalla, un botón o un formulario concretos que no existen.
const SIN_PANTALLA_ES = /págin|pantalla|bot[oó]n|formulario/i;
const SIN_PANTALLA_EN = /\bpage\b|screen|button|\bform\b/i;

const LO_QUE_EL_TEXTO_TIENE_QUE_DECIR: Record<string, Exigencia> = {
  corrida_ya_abierta: {
    por: "Una corrida consume su lote entero (R7): el texto dice qué hacer —terminar la que hay— y dónde sigue el café.",
    es: { debe: [/termin/i, /lote que salga/i] },
    en: { debe: [/\bend\b/i, /lot that comes out/i] },
  },
  lote_consumido: {
    por: "La cereza cuya fermentación terminó (R7): la siguiente corrida empieza en el lote que salió; el texto lo dice.",
    es: { debe: [/lote que salió/i] },
    en: { debe: [/lot that came out/i] },
  },
  descendiente_en_bodega: {
    por:
      "Decisión de Daniel del 2026-10-02: para procesar lo que queda, PRIMERO se divide, y lo guardado conserva su proceso. El texto dice " +
      "qué hacer (dividir), y también llega por la devolución a secado de un lote cuyo descendiente está en bodega.",
    es: { debe: [/divid/i, /bodega/i, /secado/i] },
    en: { debe: [/split/i, /storage/i, /drying/i] },
  },
  seleccion_bajo_proceso_abierto: {
    por:
      "También llega por la clasificación de verde (`recordGreenGrading` pide una `selection` sobre un verde que el proceso abierto aún cubre, " +
      "ya trillado): «primero se selecciona y después se abre» era falso ahí; lo que hay que hacer es CERRAR el proceso.",
    es: { debe: [/cerr/i], noDebe: [/después se abre/i] },
    en: { debe: [/clos/i], noDebe: [/then open the process/i] },
  },
  lineage_too_deep: {
    por: "Dice qué hacer, como la página (`processLineageTooDeep`): sin un cierre el operario no sabe si reintentar.",
    es: { debe: [/a mano/i] },
    en: { debe: [/by hand/i] },
  },
  lote_mezclado: {
    por:
      "Se lanza también al mover a bodega (`exigeSecadoTerminado`), donde no hay ningún proceso que abrir: el texto tiene que decir que el " +
      "lote no entra en bodega. Y «sus partes» chocaba con las partes de la división del texto de al lado.",
    es: { debe: [/bodega/i], noDebe: [/\bpartes\b/i] },
    en: { debe: [/storage/i], noDebe: [/\bparts\b/i] },
  },
  lote_dividido: {
    por:
      "Se lanza también cuando el lote está CUBIERTO por un proceso cerrado como `divided` sin haber sido la entrada de la división " +
      "(`lotProcess.ts`, `exigeSecadoTerminado` y `procesoQueDevolver`): «este lote se dividió» sólo era verdad en uno de los dos casos. " +
      "Y el inglés de la página para lo mismo dice «split», no «divided».",
    es: { debe: [/divisi/i, /proceso/i] },
    en: { debe: [/split/i, /process/i], noDebe: [/divided/i] },
  },
  lote_en_bodega: {
    por: "El inglés no tenía verbo («For a moisture defect, “Back to drying”, on the process page…»).",
    es: {},
    en: { debe: [/\buse\b/i] },
  },
  devolucion_antes_del_cierre: {
    por:
      "Ninguna pantalla edita la fecha de cierre ni la de entrada en bodega, y el formulario de devolver no tiene campo de fecha " +
      "(`devolverASecadoAction` pasa `new Date()`): «revisa esas fechas» prometía una edición que no existe. Dice qué pasó y a quién acudir.",
    es: { debe: [/posterior/i, /administra/i], noDebe: [/revisa esas fechas/i] },
    en: { debe: [/later/i, /manages/i], noDebe: [/cannot be dated/i, /check those dates/i] },
  },
  division_deja_remanente: {
    por:
      "Se lanza por tres faltas (cero partes, saldo del lote que se divide sobre la tolerancia, y OTRO lote cubierto con saldo) y ninguna tiene " +
      "puerta en `app/`: «Dividir reparte el lote entero» sólo describía las dos primeras. Habla del proceso, y no manda a ninguna pantalla.",
    es: { debe: [/proceso/i], noDebe: [SIN_PANTALLA_ES] },
    en: { debe: [/process/i], noDebe: [SIN_PANTALLA_EN] },
  },
  fusion_bajo_proceso_abierto: {
    por:
      "Se lanza por tres operaciones (fusionar, mezclar, y una DIVISIÓN con varias entradas) y ninguna tiene puerta en `app/`: «No se fusiona» sólo " +
      "describía las dos primeras. No manda a ninguna pantalla.",
    es: { debe: [/divisi/i], noDebe: [SIN_PANTALLA_ES] },
    en: { debe: [/split/i], noDebe: [SIN_PANTALLA_EN] },
  },
};

describe("los textos corregidos por falsedad dicen lo que la revisión pidió", () => {
  it("control: la tabla no está vacía y todas sus claves son códigos traducidos", () => {
    const claves = Object.keys(LO_QUE_EL_TEXTO_TIENE_QUE_DECIR);
    expect(claves.length).toBeGreaterThanOrEqual(8);
    expect(claves.filter((c) => !(CODIGOS_DE_PROCESO_TRADUCIDOS as readonly string[]).includes(c))).toEqual([]);
  });
  it.each(Object.entries(LO_QUE_EL_TEXTO_TIENE_QUE_DECIR))("`error_proceso_%s` dice lo que debe y no dice lo que no", (codigo, exigencia) => {
    for (const [idioma, textos, reglas] of [
      ["es", es, exigencia.es],
      ["en", en, exigencia.en],
    ] as const) {
      const texto = textos[`error_proceso_${codigo}`] ?? "";
      expect(texto, `${idioma}: el texto existe`).not.toBe("");
      for (const r of reglas.debe ?? []) expect(texto, `${idioma}: debe casar ${r} — ${exigencia.por}`).toMatch(r);
      for (const r of reglas.noDebe ?? []) expect(texto, `${idioma}: no debe casar ${r} — ${exigencia.por}`).not.toMatch(r);
    }
  });
});

describe("el tope del linaje que dicen los textos es el que el sistema recorre", () => {
  it("control: el tope es el 64 de R1", () => {
    // Si alguien lo cambia a propósito, se cambia aquí y en los cuatro textos de abajo, y esta línea es el aviso.
    expect(TOPE_DE_LINAJE).toBe(64);
  });
  // `error_proceso_lineage_too_deep` (la acción) y `processLineageTooDeep` (las páginas) escribían «(64 generaciones)» a mano; el
  // tope vive en `topeDeLinaje.ts`, que no importa nada, justo para que esta prueba hermética pueda leerlo.
  it.each(["error_proceso_lineage_too_deep", "processLineageTooDeep"])("`%s` dice el tope, en es y en en", (clave) => {
    expect(es[clave], `es:${clave} existe`).toBeTruthy();
    expect(en[clave], `en:${clave} existe`).toBeTruthy();
    expect(es[clave], `es:${clave} dice ${TOPE_DE_LINAJE}`).toContain(String(TOPE_DE_LINAJE));
    expect(en[clave], `en:${clave} dice ${TOPE_DE_LINAJE}`).toContain(String(TOPE_DE_LINAJE));
  });
});
