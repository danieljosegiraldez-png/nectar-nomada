"use client";

import { useEffect, useRef } from "react";
import { TZ_OFFSET_FIELD } from "../../lib/time/localDateTime";

/**
 * El desfase horario del dispositivo, para que el servidor sepa qué instante
 * significa el reloj de pared que escribió el operador.
 *
 * **Se escribe en el DOM, no en el estado de React.** Un componente cliente
 * también se renderiza en el servidor para el HTML inicial, y ahí
 * `getTimezoneOffset()` devolvería el desfase del servidor —0 en producción—
 * que es exactamente el valor equivocado. Así que el campo sale vacío del
 * servidor y lo rellena el navegador al montar.
 *
 * Actualizar un nodo del DOM es para lo que sirve un efecto; meterlo en estado
 * provocaría un render en cascada por un valor que nunca cambia y que nada más
 * lee (`react-hooks/set-state-in-effect` lo señala, con razón).
 *
 * Si por lo que sea llegara vacío, `parseLocalDateTime` **falla** en vez de
 * suponer una zona: guardar un instante equivocado con aspecto de correcto es
 * el fallo del que viene todo esto.
 *
 * **El efecto corre en CADA render, y el array de dependencias vacío que tenía
 * era un defecto medido el 2026-09-29.** Escribir en el `.value` de un nodo es
 * escribir por detrás de React; cuando el formulario se vuelve a renderizar
 * —al cambiar la variable de una medición, el instrumento, el material— React
 * reaplica el `defaultValue=""` y **se lleva el valor**. Con `[]` no volvía a
 * escribirse nunca, así que el campo quedaba vacío para siempre y el guardado
 * moría con `timezone_offset_missing`.
 *
 * Medido en la pantalla del lote: `300` al cargar, `(VACÍO)` en cuanto cambia
 * la variable, mientras los otros cuatro formularios de la misma página —que no
 * re-renderizan— seguían con `300`. Esa comparación es la que lo delató; con un
 * solo formulario a la vista se lee como «el campo no se rellena».
 *
 * Sin `[]` el efecto se reaplica tras cada render, que es exactamente lo que
 * hace falta: el coste es una asignación a un nodo del DOM, y a cambio el valor
 * no puede desaparecer. Lo vigila
 * `tests/arquitectura/desfase-horario-sobrevive-al-render.test.ts`.
 */
export function TimezoneOffsetField() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.value = String(new Date().getTimezoneOffset());
  });
  return <input ref={ref} type="hidden" name={TZ_OFFSET_FIELD} defaultValue="" />;
}
