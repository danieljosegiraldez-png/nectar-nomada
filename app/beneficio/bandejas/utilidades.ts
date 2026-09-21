import { BandejaConfigError, PIE_EN_CM } from "../../../lib/equipos/bandejas";
import { PesajeError } from "../../../lib/traceability/capacidadDeBandeja";
import { LocationAccessError } from "../../../lib/traceability/locations";
import { TraceabilityAccessError } from "../../../lib/traceability/lots";
import { LocalDateTimeError } from "../../../lib/time/localDateTime";

/**
 * Helpers puros de la pantalla de bandejas: no tocan la base ni la sesión, así
 * que se prueban sin arrancar nada (`CLAUDE.md`, «sospechar del instrumento»).
 *
 * Viven aparte de `app/actions/bandejas.ts` porque ese archivo es `"use server"`
 * y de ahí sólo se pueden exportar funciones `async`
 * (`tests/arquitectura/use-server-solo-async.test.ts`): éstas son síncronas a
 * propósito, igual que `app/beneficio/ajustes/mensajes.ts`.
 */

/**
 * `BandejaConfigError`, `PesajeError`, `LocationAccessError`,
 * `TraceabilityAccessError` y `LocalDateTimeError` a su clave `error_<código>`
 * de `Bandejas`.
 *
 * Sólo hay 6 claves `error_` (contadas al final de la tarea): las cuatro de
 * `BandejaConfigError` y las dos propias de `PesajeError` —su
 * `datos_invalidos` reutiliza la de `BandejaConfigError`—. `LocationAccessError`
 * y `TraceabilityAccessError` no traen las suyas propias: la persona que topa
 * con `no_beneficio_edit_access`, `location_not_found` o `no_lot_access` no
 * puede hacer nada distinto de lo que ya dice `sin_acceso`, así que colapsan
 * ahí en vez de sumar una séptima clave.
 *
 * **Fix round 1 (hallazgo del revisor).** `registrarPesajeAction` llama a
 * `parseLocalDateTime` dentro de su `try`, y esta función no sabía traducir su
 * `LocalDateTimeError` — un `tzOffsetMinutes` ausente o inválido (JS
 * bloqueado, un POST crudo) se relanzaba sin traducir y salía de la acción
 * como página de error de Next.js en vez de un mensaje. Se colapsa a
 * `datos_invalidos`, la misma clave que ya usan `BandejaConfigError`/
 * `PesajeError` para «falta algo o no es válido» — es exactamente esa
 * situación, no una nueva. `app/actions/inspecciones.ts` y
 * `app/actions/traceability.ts` ya guardan este mismo caso.
 */
export function mensajeDeBandeja(error: unknown): string {
  if (error instanceof BandejaConfigError) return error.message;
  if (error instanceof PesajeError) return error.message;
  if (error instanceof LocationAccessError) return "sin_acceso";
  if (error instanceof TraceabilityAccessError) return "sin_acceso";
  if (error instanceof LocalDateTimeError) return "datos_invalidos";
  throw error;
}

/**
 * La medida de un tipo de bandeja en la unidad con la que se tecleó.
 *
 * `00_conventions` §1: la unidad canónica es cm, y es lo único que se guarda;
 * la tecleada (`entryUnit`) se conserva sólo para poder mostrarla tal cual se
 * escribió, en vez de forzar a leer un 4×2 pies como 122×61 cm.
 */
export function medidaEnUnidad(widthCm: number, lengthCm: number, entryUnit: "ft" | "cm") {
  const factor = entryUnit === "ft" ? PIE_EN_CM : 1;
  const redondear = (cm: number) => Math.round((cm / factor) * 100) / 100;
  return { ancho: redondear(widthCm), largo: redondear(lengthCm), unidad: entryUnit };
}

/**
 * Un número con el separador decimal del idioma que pide la petición
 * (revisión final del plan 2a, A6: coma en `es`, punto en `en`), a un número
 * fijo de decimales. Pura y hermética — no toca la sesión ni la base, así que
 * se prueba sola.
 */
export function formatearNumero(n: number, decimales: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(n);
}

/**
 * De 3 a 4 profundidades en cm del formulario de pesaje. La cuarta es
 * opcional: un campo vacío se omite, nunca se manda como cero. La validación
 * de cuántas hacen falta y si son números positivos la hace `registrarPesaje`
 * — esto sólo lee lo que el formulario trae.
 */
export function leerProfundidades(form: FormData): number[] {
  return [1, 2, 3, 4]
    .map((n) => String(form.get(`profundidad${n}`) ?? "").trim())
    .filter((v) => v !== "")
    .map(Number);
}
