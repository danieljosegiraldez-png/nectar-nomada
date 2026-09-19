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

/**
 * El inverso exacto de `parseLocalDateTime`: de un instante al reloj de pared
 * que hay que poner en un `datetime-local` **de este dispositivo**.
 *
 * **El fallo que esto arregla, y es de datos, no de pantalla.**
 * `MeasurementCorrectionForm` precargaba el campo con
 * `measurement.occurredAt.slice(0, 16)` — el reloj de pared en UTC. El campo es
 * `datetime-local` y el formulario manda `TZ_OFFSET_FIELD`, así que al guardar
 * el servidor re-interpretaba ese reloj como hora local. Demostrado el
 * 2026-09-05 con la ida y vuelta completa:
 *
 *     en la base              2026-09-05T16:31:00.000Z
 *     el campo mostraba       2026-09-05T16:31
 *     se volvía a guardar     2026-09-05T21:31:00.000Z   (+5 h)
 *
 * Abrir una corrección y guardar **sin tocar la hora** movía la medición cinco
 * horas. Cada vez. Sobre un registro de trazabilidad, y en silencio.
 *
 * **Por qué la zona del dispositivo y no la de la finca.** Este valor lo va a
 * releer `parseLocalDateTime` con el desfase que manda ESTE dispositivo. El
 * reloj de pared tiene que estar en esa misma zona o la vuelta no cierra —
 * aunque para MOSTRAR una fecha la zona correcta sea la del sitio
 * (`lib/time/mostrarInstante.ts`). Son dos preguntas distintas.
 *
 * **Sólo tiene sentido en el navegador.** En el servidor `getTimezoneOffset()`
 * devuelve el desfase del servidor —0 en producción—, que es justo el valor
 * equivocado. Quien lo use debe hacerlo en un efecto, como `TimezoneOffsetField`.
 */
export function paraCampoLocal(instante: Date): string {
  const desfase = instante.getTimezoneOffset();
  const comoSiFueraUtc = new Date(instante.getTime() - desfase * 60_000);
  return comoSiFueraUtc.toISOString().slice(0, 16);
}

/**
 * Qué instante precargar en un campo `datetime-local` — ronda final,
 * hallazgo 1. Puro: recibe «ahora» en vez de leer el reloj, para poder
 * probarse sin depender de cuándo corre la prueba ni del navegador.
 *
 * Un instante ya existente (una fila guardada, en ISO) se respeta tal cual;
 * su ausencia — un formulario "nuevo" — precarga con el instante actual.
 * `paraCampoLocal` sigue siendo quien convierte el resultado al reloj de
 * pared del DISPOSITIVO, y eso sólo puede hacerse en un efecto del cliente:
 * ver su cabecera y `TimezoneOffsetField`.
 */
export function instanteAPrecargar(existente: string | null, ahora: Date): Date {
  return existente ? new Date(existente) : ahora;
}

/** Un día que el POST trae y no existe en el calendario. */
export class FechaDeDiaInvalida extends Error {}

/**
 * Un campo de DÍA, no un instante: `<input type="date">` → medianoche UTC.
 *
 * **Por qué no lleva desfase de zona, y por qué eso NO es el fallo que
 * `parseLocalDateTime` arregla.** Una cadena ISO de sólo fecha se interpreta en
 * UTC por especificación, así que la ida y vuelta cierra con
 * `toISOString().slice(0, 10)`. Convertir un día a la zona del dispositivo lo
 * movería **un día hacia atrás**: sería introducir el fallo, no arreglarlo. La
 * distinción entera está en la cabecera de `lib/time/mostrarInstante.ts`, y se
 * decide mirando cómo se PARSEA el campo, no cómo se muestra.
 *
 * **Por qué vive aquí y no en una acción.** Esta lógica existía —correcta— dentro
 * de `app/actions/traceability.ts`, y de un archivo `"use server"` sólo se pueden
 * exportar funciones `async`: una clase de error rompe el build entero (69
 * errores desde una línea; está escrito en `CLAUDE.md`). Así que no se podía
 * compartir, y el 2026-09-11 eso costó un fallo real: `createHiveFormAction`
 * parseaba su `installedAt` —un `type="date"`— con el parser de INSTANTES, que
 * exige desfase y **lanza si falta**. El formulario no lo manda, así que crear
 * una colmena con fecha de instalación reventaba la página con un `digest`. De
 * los siete campos `type="date"` del proyecto, era el único parseado así.
 *
 * Ausente devuelve `null`. Que una fecha ausente sea un error o no lo decide
 * quien llama, no esto.
 */
export function fechaDeDia(raw: string | null | undefined, campo: string): Date | null {
  const limpio = String(raw ?? "").trim();
  if (!limpio) return null;
  const dia = limpio.slice(0, 10);
  const fecha = new Date(`${dia}T00:00:00Z`);
  // `new Date("2026-02-31T00:00:00Z")` **no falla**: normaliza al 3 de marzo. Un
  // día que no existe se convertiría en silencio en otro hecho histórico. El
  // `type="date"` del navegador lo evita, pero una llamada directa no pasa por
  // ahí — y el formulario no es la frontera (`SECURITY.md` §2).
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== dia) {
    throw new FechaDeDiaInvalida(`fecha_invalida:${campo}:${dia}`);
  }
  return fecha;
}
