/**
 * La aritmética de precisión de siembra: año/mes/día → `Date` a medianoche UTC.
 *
 * **Por qué existe.** Ronda de arreglo 1 sobre Task 5 (cola offline de
 * captura de parcela). `parsePlantedAt` en `app/actions/traceability.ts` —el
 * camino CON señal— y `construirFechaDeSiembra` en
 * `lib/sync/parcelaPayload.ts` —el camino SIN señal— calculaban la MISMA
 * regla de negocio por separado: qué fecha significa
 * `plantedPrecision: "year"`, qué significa `"month"`. Atadas sólo por un
 * comentario en prosa, sin ninguna prueba que comparara las dos, era fiel hoy
 * y podía divergir en silencio el día que alguien cambiara un lado sin el
 * otro.
 *
 * **Por qué un archivo `"use server"` puede importar esto.** La restricción
 * de que un archivo `"use server"` sólo exporte funciones `async` es sobre lo
 * que EXPORTA, no sobre lo que IMPORTA — el mismo patrón que ya usa
 * `fechaDeDia`, aquí al lado: la lógica vive en `lib/time/`, y
 * `app/actions/traceability.ts` la importa (como `fechaDeDiaCompartida`) en
 * vez de reimplementarla.
 *
 * **La regla, sin validar el calendario.** Un año suelto («2019») es el 1 de
 * enero de ese año. Un mes suelto («2019-05») es el día 1 de ese mes.
 * Cualquier otra precisión —`"date"`, o un valor que no se reconoce— recorta
 * a los primeros 10 caracteres, que es lo que da un `<input type="date">` o
 * el campo ya recortado por `recortarPorPrecision`. A propósito **no** valida
 * que el día exista en el calendario, a diferencia de `fechaDeDia`:
 * `parsePlantedAt` nunca lo hizo, y añadir esa validación aquí cambiaría el
 * comportamiento del camino con señal, que no es lo que esta ronda de
 * arreglo pide.
 */
export type PrecisionDeSiembra = "year" | "month" | "date";

export interface FechaConPrecision {
  fecha: Date;
  precision: PrecisionDeSiembra;
}

export function calcularFechaConPrecision(raw: string, precisionCruda: string): FechaConPrecision {
  if (precisionCruda === "year") {
    return { fecha: new Date(`${raw.slice(0, 4)}-01-01T00:00:00Z`), precision: "year" };
  }
  if (precisionCruda === "month") {
    return { fecha: new Date(`${raw.slice(0, 7)}-01T00:00:00Z`), precision: "month" };
  }
  return { fecha: new Date(`${raw.slice(0, 10)}T00:00:00Z`), precision: "date" };
}
