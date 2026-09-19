/**
 * Qué parámetro de `?bloque=`/`?material=` es válido para precargar el
 * formulario de manejo — PR B tarea 5, decisión del controlador #3. El aviso
 * de lectura alta arma la URL con `enlaceDeRegistrarAplicacion`
 * (`pendienteDeLaParcela.ts`), pero un bloque o material de OTRA parcela u
 * organización puede llegar igual: enlaces viejos, copiados a mano, o una
 * regla de una finca distinta. La pantalla valida contra la lista que ya
 * cargó para esta parcela — nunca contra la base directamente, eso ya lo hace
 * `validarReferencias` al guardar.
 *
 * Un parámetro que no está en la lista se ignora EN SILENCIO: no se pinta
 * ningún error por una precarga que no cuajó (brief, decisión #3).
 *
 * Pura: sin `prisma`, para poder probarla sin base.
 */
export function idValidoEnLista(id: string | undefined, opciones: readonly { id: string }[]): string | null {
  if (!id) return null;
  return opciones.some((o) => o.id === id) ? id : null;
}
