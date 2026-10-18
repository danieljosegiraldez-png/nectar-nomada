/**
 * La hora en que se guardó una página que el service worker sirve sin red — R2 del plan
 * farm-to-green (ADR-197). La escribe `marcarComoGuardada` (`public/sw.js`) en
 * `<meta name="nn-guardada-el">`, y la lee `AvisoDeVersionGuardada`.
 *
 * Vacía o mal formada no es una fecha: la página sigue siendo vieja, pero no se sabe de cuándo, y
 * el aviso lo dice así en vez de inventar una hora.
 */
export function leerGuardadaEl(contenido: string | null): Date | null {
  if (!contenido) return null;
  const fecha = new Date(contenido);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}
