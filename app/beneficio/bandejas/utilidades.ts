import { BandejaConfigError, PIE_EN_CM } from "../../../lib/equipos/bandejas";
import { PesajeError } from "../../../lib/traceability/capacidadDeBandeja";
import { LocationAccessError } from "../../../lib/traceability/locations";
import { TraceabilityAccessError } from "../../../lib/traceability/lots";

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
 * `BandejaConfigError`, `PesajeError`, `LocationAccessError` y
 * `TraceabilityAccessError` a su clave `error_<código>` de `Bandejas`.
 *
 * Sólo hay 6 claves `error_` (contadas al final de la tarea): las cuatro de
 * `BandejaConfigError` y las dos propias de `PesajeError` —su
 * `datos_invalidos` reutiliza la de `BandejaConfigError`—. `LocationAccessError`
 * y `TraceabilityAccessError` no traen las suyas propias: la persona que topa
 * con `no_beneficio_edit_access`, `location_not_found` o `no_lot_access` no
 * puede hacer nada distinto de lo que ya dice `sin_acceso`, así que colapsan
 * ahí en vez de sumar una séptima clave.
 */
export function mensajeDeBandeja(error: unknown): string {
  if (error instanceof BandejaConfigError) return error.message;
  if (error instanceof PesajeError) return error.message;
  if (error instanceof LocationAccessError) return "sin_acceso";
  if (error instanceof TraceabilityAccessError) return "sin_acceso";
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
