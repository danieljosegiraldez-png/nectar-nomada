/**
 * Convertir lo que escribe un operador en un instante real.
 *
 * **El fallo que esto arregla.** Un `<input type="datetime-local">` entrega una
 * hora de reloj de pared sin zona: `"2026-03-12T07:30"`. Pasarla a `new Date()`
 * la interpreta en la zona **del servidor**. En desarrollo eso no se nota
 * —navegador y servidor comparten zona, y el error se cancela— pero en
 * producción el servidor corre en UTC: un operador en Panamá que escribe las
 * 07:30 quedaba registrado a las 02:30. Cinco horas, en el campo, donde
 * `occurredAt` ES el dato.
 *
 * Lo encontró una revisión independiente el 2026-08-31. Antes se había mirado
 * el mismo síntoma —«escribí 07:30 y la pantalla dice 12:30»— y se había
 * diagnosticado como una convención de mostrar en UTC. No lo era.
 *
 * **La solución.** El único que sabe en qué zona está el operador es su
 * dispositivo, así que el formulario manda su desfase junto a la hora y aquí se
 * combinan. `getTimezoneOffset()` devuelve minutos a RESTAR de la hora local
 * para llegar a UTC (Panamá, UTC−5, devuelve 300), que es justo lo que hay que
 * sumar al reloj de pared leído como si fuera UTC.
 */
export class LocalDateTimeError extends Error {}

/** Nombre del campo oculto que cada formulario con fecha debe incluir. */
export const TZ_OFFSET_FIELD = "tzOffsetMinutes";

/**
 * `wallClock` es el valor crudo del input; `offsetMinutes` el del campo oculto.
 *
 * Si falta el desfase **se falla en vez de adivinar**. Suponer UTC guardaría un
 * instante equivocado con aspecto de correcto, que es exactamente el fallo del
 * que venimos; y suponer la zona del servidor lo reintroduce tal cual.
 */
export function parseLocalDateTime(wallClock: string, offsetMinutes: string | null): Date {
  const limpio = wallClock.trim();
  if (!limpio) throw new LocalDateTimeError("datetime_required");

  if (offsetMinutes == null || offsetMinutes.trim() === "") {
    throw new LocalDateTimeError("timezone_offset_missing");
  }
  const offset = Number(offsetMinutes);
  // ±14 h es el rango real de zonas horarias del mundo; fuera de eso el valor
  // no viene de `getTimezoneOffset` y no se usa.
  if (!Number.isFinite(offset) || Math.abs(offset) > 14 * 60) {
    throw new LocalDateTimeError("timezone_offset_invalid");
  }

  // Se lee el reloj de pared COMO SI fuera UTC y se corrige con el desfase.
  const comoSiFueraUtc = new Date(`${limpio}${limpio.length === 16 ? ":00" : ""}Z`);
  if (Number.isNaN(comoSiFueraUtc.getTime())) throw new LocalDateTimeError("datetime_invalid");

  return new Date(comoSiFueraUtc.getTime() + offset * 60_000);
}

/** Igual, pero un campo vacío es legítimo y devuelve `null`. */
export function parseOptionalLocalDateTime(wallClock: string, offsetMinutes: string | null): Date | null {
  return wallClock.trim() ? parseLocalDateTime(wallClock, offsetMinutes) : null;
}
