/**
 * Qué lectura de ambiente vale para un punto (spec §4.5). Sin base: la usan la
 * página y, cuando exista el 2b, la vista de cada bandeja.
 *
 * La regla entera es la igualdad de abajo. «Nunca se interpola un valor para
 * el nivel de la bandeja a partir de otros niveles»: un punto sin lectura
 * propia devuelve null, y quien pinta dice «sin lectura de este nivel». Ni la
 * general ni la del nivel de al lado ocupan su sitio.
 */
export type PuntoDeAmbiente = { rackId: string | null; rackLevel: number | null };
export type LecturaVigente = PuntoDeAmbiente & {
  id: string; occurredAt: Date; airTemperatureC: number | null; relativeHumidityPct: number | null;
  skyCondition: string | null; ventilation: string | null; sourceType: string;
};

/**
 * Una del registro, que SÍ puede estar reemplazada — `vigentes` no, porque una
 * reemplazada no es la condición actual de ningún punto.
 *
 * `reemplazada` es un objeto o null, no dos campos sueltos: así «reemplazada
 * sin saber por qué» no se puede representar por accidente. El motivo llega
 * null sólo si alguien escribió la corrección por fuera del servicio, que lo
 * exige; el `motivo` de la propia fila reemplazada es null siempre, porque el
 * motivo se guarda en la fila NUEVA.
 */
export type LecturaReciente = LecturaVigente & {
  reemplazada: { en: Date; motivo: string | null } | null;
  /**
   * Lo que no se enseña pero hace falta para PRECARGAR una corrección. Una
   * corrección es una fila nueva: lo que el formulario no reenvíe se pierde en
   * silencio, así que arreglar una temperatura sin esto se llevaría por delante
   * las notas y la persona que tomó la muestra.
   */
  notaCielo: string | null;
  notaVentilacion: string | null;
  operadorPersonId: string | null;
};

export function lecturaDelPunto<T extends LecturaVigente>(vigentes: T[], punto: PuntoDeAmbiente): T | null {
  let mejor: T | null = null;
  for (const l of vigentes) {
    if (l.rackId !== punto.rackId || l.rackLevel !== punto.rackLevel) continue;
    if (!mejor || l.occurredAt > mejor.occurredAt) mejor = l;
  }
  return mejor;
}

/** Cuánto hace. Sin umbral de «vieja»: no hay ninguno aprobado, así que se dice siempre. */
export function edad(ocurrio: Date, ahora: Date): { unidad: "min" | "h" | "d"; n: number } {
  const min = Math.max(0, Math.floor((ahora.getTime() - ocurrio.getTime()) / 60_000));
  if (min < 60) return { unidad: "min", n: min };
  const h = Math.floor(min / 60);
  if (h < 48) return { unidad: "h", n: h };
  return { unidad: "d", n: Math.floor(h / 24) };
}
