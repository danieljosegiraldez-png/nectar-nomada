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

/**
 * Las opciones de un `<select>` cuando el valor YA GUARDADO puede no estar en
 * la lista que esta cuenta puede listar — ronda final de arreglos, hallazgo 4:
 * `productosFitosanitariosSiPuede` devuelve `[]` sin `lot:view` sobre la
 * finca, y `ReglaDeTrampasForm` precarga `suggestedMaterialId` con el producto
 * de la regla. Un `<select>` cuyas opciones no incluyen el valor de
 * `defaultValue` cae en la primera («ninguno»): guardar sin tocar el selector
 * mandaría el campo vacío, y el servicio lo leería como «quitar el producto».
 *
 * No poder LISTAR un producto no es lo mismo que decidir QUITARLO: si el
 * actual no aparece en `opciones`, se añade al final para que el `<select>`
 * pueda seguir representándolo tal cual, sin haber sido listado.
 *
 * Pura: sin `prisma`, para poder probarla sin base.
 */
export function opcionesConActual<T extends { id: string }>(opciones: readonly T[], actual: T | null): readonly T[] {
  if (actual == null) return opciones;
  return opciones.some((o) => o.id === actual.id) ? opciones : [...opciones, actual];
}
