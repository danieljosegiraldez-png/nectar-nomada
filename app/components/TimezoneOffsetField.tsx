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
 */
export function TimezoneOffsetField() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.value = String(new Date().getTimezoneOffset());
  }, []);
  return <input ref={ref} type="hidden" name={TZ_OFFSET_FIELD} defaultValue="" />;
}
