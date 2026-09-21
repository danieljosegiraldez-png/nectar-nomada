/**
 * Valida el destino opcional `volverA` que las páginas de captura de la
 * parcela mandan para volver a su pestaña tras guardar con éxito (Tarea 6,
 * fix round 1 — antes, guardar dejaba a quien capturaba en la misma URL del
 * formulario, sin confirmación visible, hasta pulsar «Volver» a mano).
 *
 * **Sólo se acepta una ruta que empiece por `/plots/<locationId>` EXACTO** —
 * el mismo `locationId` que la escritura que se acaba de hacer, y nada más
 * antes de un `?` o del final de la cadena. `startsWith` a secas no basta:
 * `/plots/abc123` también empieza por `/plots/abc`, así que un id que sea
 * prefijo de otro colaría. Cualquier otro valor —otra parcela, una URL
 * absoluta, una URL protocol-relative (`//evil.example.com/...`), o un valor
 * vacío— se rechaza en silencio: no es un error del usuario, es la frontera
 * contra una redirección abierta. Sin `volverA` válido, el llamador se
 * comporta exactamente como antes de esta tarea.
 */
export function volverAValido(volverA: string | null | undefined, locationId: string): string | null {
  if (!volverA) return null;
  const prefijo = `/plots/${locationId}`;
  if (volverA === prefijo || volverA.startsWith(`${prefijo}?`)) return volverA;
  return null;
}
