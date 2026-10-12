/**
 * Lo que el paso NO nombra: ni equipo ni recipiente (Parte 2a, tarea 2; registro, D7).
 *
 * **La decisión** (Daniel, 2026-10-03, decisión 3): el paso no nombra equipo ni recipiente; declara las CAPACIDADES que
 * necesita (catálogo `capacidad`, que comprobará la 2c). «No se añaden cama africana, sacos ni bolsa al catálogo
 * `recipiente`», y el catálogo de intervenciones no gana actos: el acto es el tipo de paso (diseño §4.1 y §7).
 *
 * **Por qué una prueba y no sólo el diseño.** Añadir un valor a un catálogo es una línea en `lib/research/catalogs.ts` y una
 * resiembra, sin migración ni revisión de esquema: es justo lo que hace fácil que alguien, con buena intención, meta «cama
 * africana» en `recipiente` el día que un lote la use. Esta prueba fija los conjuntos de valores de hoy (2026-10-04):
 * añadir uno exige cambiar la prueba A CONCIENCIA, con la decisión de Daniel delante.
 *
 * Los valores de abajo son una SEGUNDA copia a propósito: comparar el catálogo consigo mismo no cazaría que alguien lo
 * amplíe. Los de `sustrato_anadido` son los tres de siempre: los cuatro alias de `doble_mosto` (registro I7) los siembra la
 * tarea 8 (PR-B), que cambia esa línea de la prueba en su commit. Hermética: compara constantes, sin base y sin red, como
 * `tests/traceability/catalogos-de-intervencion-existen.test.ts`, que mira otra propiedad: que las claves existan.
 */
import { describe, expect, it } from "vitest";
import { VARIABLE_CATALOGS } from "../../lib/research/catalogs";
import { CATALOGOS_DE_INTERVENCION } from "../../lib/traceability/lotProcess";

const RECIPIENTE = ["Tanque I", "Tanque II", "Tanque III", "Cooler I", "Cooler II", "GrainProBag"];

/** Los catálogos del formulario de intervenciones, en el orden de `CATALOGOS_DE_INTERVENCION`, con sus valores. */
const INTERVENCION: Record<string, string[]> = {
  condicion_oxigeno: ["abierto_aerobico", "anaerobico", "maceracion_carbonica", "anoxico"],
  manejo_temperatura: ["ambiente", "cold_hold_prefermentativo", "fermentacion_fria", "choque_termico", "choque_en_frio"],
  medio_lavado: ["agua_limpia", "mosto_propio", "mosto_de_otro_lote", "ninguno_natural"],
  metodo_inoculacion: ["direct pitch", "rehydrated", "spontaneous"],
  sustrato_anadido: ["ninguno", "co_fermentacion", "doble_mosto"],
  recipiente: RECIPIENTE,
  cereza_flotado: ["sin_flotadores", "<2%", "2_5%", "5_10%", "10_20%", "20_30%", ">30%"],
  cereza_seleccion: ["uniforme_alta", "uniforme_media", "heterogenea_leve", "heterogenea_alta", "mezcla_no_controlada"],
  levadura_cultivo: ["Sunrise Orange", "Deep Amber", "Cool Blue", "Green Origin", "MP72", "HDA54", "Spontaneous Wild"],
};

const valores = (clave: string) => VARIABLE_CATALOGS.find((c) => c.key === clave)?.values.map((v) => v.value);

describe("el paso no nombra equipo ni recipiente: los catálogos que lo dirían no crecen (decisión 3 de Daniel, 2026-10-03)", () => {
  it("control: el análisis ve los dos lados", () => {
    // Si `VARIABLE_CATALOGS` se renombrara o se vaciara, las comparaciones de abajo fallarían todas con un mensaje que no
    // dice por qué: ésta dice que no se está midiendo lo que se cree.
    expect(CATALOGOS_DE_INTERVENCION.length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(INTERVENCION)).toHaveLength(9);
    expect(valores("recipiente"), "recipiente no está sembrado").toBeDefined();
  });

  it("recipiente tiene sus seis valores de hoy y ninguno más: ni cama africana, ni sacos, ni bolsa", () => {
    expect(valores("recipiente")).toEqual(RECIPIENTE);
  });

  it("la lista de catálogos de intervención es la de hoy, en su orden: el acto es el tipo de paso, no un catálogo nuevo", () => {
    expect([...CATALOGOS_DE_INTERVENCION]).toEqual(Object.keys(INTERVENCION));
  });

  it.each(Object.keys(INTERVENCION))("el catálogo de intervención «%s» tiene exactamente sus valores de hoy", (clave) => {
    expect(valores(clave), `${clave}: añadir o quitar un valor exige cambiar esta prueba a conciencia`).toEqual(INTERVENCION[clave]);
  });
});
