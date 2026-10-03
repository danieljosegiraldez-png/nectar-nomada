/**
 * Cada código de error del proceso que tiene texto propio lo tiene en español Y en inglés — Parte 1, R2–R8, tarea 12
 * (2026-10-03).
 *
 * **Por qué existe.** `friendlyError` (`app/actions/traceability.ts`) traducía todo `LotProcessError` con un mensaje
 * genérico que enseñaba el código crudo («No se pudo registrar el proceso: sin_proceso_abierto»). Las reglas de esta
 * parte lanzan códigos que el operario SÍ puede resolver —un café en bodega, un lote dividido, una mezcla—, y para eso
 * tiene que leer qué pasó. La lista es `CODIGOS_DE_PROCESO_TRADUCIDOS` (`lib/traceability/errorDeProceso.ts`); un código
 * que no esté en ella sigue saliendo por el genérico, a propósito.
 *
 * **Hermética.** Sólo importa un módulo sin dependencias y lee tres archivos (los dos JSON y la fuente de la acción);
 * no toca `lib/db`, así que corre en el carril sin base de `scripts/ci.sh`. El patrón es el de
 * `tests/beneficio/mensajesDeAjustes.test.ts`.
 *
 * **Lo que NO prueba:** el texto de cada frase (eso es decisión de quien lo escribe), ni que cada acción llegue a
 * `friendlyError`. `friendlyError` no se exporta —su archivo es `"use server"`—, así que las dos últimas pruebas leen la
 * FUENTE: dicen que las ramas existen y en qué orden, no que traduzcan.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CODIGOS_DE_PROCESO_TRADUCIDOS, LotProcessError, claveDeErrorDeProceso } from "../../lib/traceability/errorDeProceso";

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
];

const FUENTE_DE_LA_ACCION = readFileSync(join(RAIZ, "app", "actions", "traceability.ts"), "utf8");

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
  it("friendlyError la consulta ANTES de la rama genérica del proceso (guardia de fuente)", () => {
    const especifica = FUENTE_DE_LA_ACCION.indexOf("claveDeErrorDeProceso(error)");
    const generica = FUENTE_DE_LA_ACCION.indexOf('t("error_lot_process"');
    expect(especifica, "friendlyError no llama a claveDeErrorDeProceso").toBeGreaterThan(-1);
    expect(generica, "control: la rama genérica sigue existiendo").toBeGreaterThan(-1);
    expect(especifica).toBeLessThan(generica);
  });
  it("friendlyError dice `lote_dividido` de las mediciones y de las muestras con el texto del proceso, ANTES de sus ramas genéricas (guardia de fuente)", () => {
    // R6.6 lanza `lote_dividido` también desde `recordMeasurement` y `createSampleFromLot`, con SUS clases
    // (`MeasurementValidationError`, `SampleValidationError`): `claveDeErrorDeProceso` sólo mira `LotProcessError`.
    const marca = FUENTE_DE_LA_ACCION.indexOf('error.message === "lote_dividido"');
    expect(marca, "friendlyError no tiene la rama de `lote_dividido` de mediciones y muestras").toBeGreaterThan(-1);
    const inicioDeLaRama = FUENTE_DE_LA_ACCION.lastIndexOf("if (", marca);
    const condicion = FUENTE_DE_LA_ACCION.slice(inicioDeLaRama, marca);
    expect(condicion, "la rama debe cubrir las mediciones").toContain("instanceof MeasurementValidationError");
    expect(condicion, "la rama debe cubrir las muestras").toContain("instanceof SampleFromLotValidationError");
    const cuerpo = FUENTE_DE_LA_ACCION.slice(marca, marca + 160);
    expect(cuerpo, "la rama debe devolver el texto del proceso").toContain('t("error_proceso_lote_dividido")');
    // Controles: las dos ramas genéricas siguen existiendo, y ésta va antes de ambas (`friendlyError` las mira en orden).
    const genericaDeMedicion = FUENTE_DE_LA_ACCION.indexOf('t("error_measurement"');
    const genericaDeMuestra = FUENTE_DE_LA_ACCION.indexOf('t("error_sample"');
    expect(genericaDeMedicion, "control: la rama genérica de mediciones sigue existiendo").toBeGreaterThan(-1);
    expect(genericaDeMuestra, "control: la rama genérica de muestras sigue existiendo").toBeGreaterThan(-1);
    expect(marca).toBeLessThan(genericaDeMedicion);
    expect(marca).toBeLessThan(genericaDeMuestra);
  });
});
