/**
 * De dónde sale un valor de carencia o reentrada que se enseña en pantalla —
 * Tarea 8, ronda de arreglos 1 (importante #1 de la revisión).
 *
 * **El defecto que esto cierra.** `LineaDeIntervencion` pintaba «— del
 * producto» cada vez que el material tenía un `defaultWithdrawalDays`, sin
 * mirar si el valor MOSTRADO en el campo era de verdad ese. En modo
 * `corregir`, con el material sin cambiar, el campo enseña el valor YA
 * DECLARADO en la línea original — que puede ser distinto del default del
 * material («indicada al registrar»)—, y el rótulo mentía. La misma pantalla,
 * en su sección de detalle, ya calculaba el origen bien; ahora los dos usan
 * esta única función, para que no puedan volver a discrepar (rúbrica de
 * veracidad, spec §4.3).
 *
 * Puro: no importa `prisma` ni React, para poder usarse igual desde un
 * componente cliente y desde una página de servidor.
 */
export type OrigenDeCarencia = "del_producto" | "indicada_al_registrar" | "no_declarada";

/**
 * @param valorMostrado El valor que el campo enseña AHORA MISMO — el mismo
 *   que se le pasó como `defaultValue`, nunca el estado interno de un input
 *   no controlado que el operario ya haya tocado.
 * @param valorDelProducto El `defaultWithdrawalDays`/`defaultReentryHours`
 *   del producto actualmente elegido en la línea.
 * @param esLaOriginal Si el material de la línea sigue siendo el mismo que
 *   traía al abrir el formulario (nunca cambiado, o recién corregido sin
 *   tocar el producto). Cuando es falso, el valor mostrado se acaba de
 *   precargar DEL producto, así que su origen es «del producto» aunque, por
 *   casualidad, no coincidiera con nada declarado antes.
 */
export function origenDeLaCarencia(
  valorMostrado: number | null,
  valorDelProducto: number | null,
  esLaOriginal: boolean,
): OrigenDeCarencia {
  if (valorMostrado == null) return "no_declarada";
  if (!esLaOriginal) return "del_producto";
  return valorMostrado === valorDelProducto ? "del_producto" : "indicada_al_registrar";
}
