/**
 * Los identificadores de un alta en lote, y su techo. **Puro: sin `prisma` detrás.**
 *
 * **Existe separado porque el formulario es `"use client"`.** `AltaEnLoteForm` calcula la vista
 * previa con la MISMA funcion que valida el servidor, para que lo que se ensena no pueda
 * divergir de lo que se crea; importarla de `altaEnLote.ts` arrastraria `lib/db` --y `pg`-- al
 * navegador y rompe el build. Es la misma division que `vocabularioDeTratamiento` /
 * `objetivoDelTratamiento`, y la vigila `tests/arquitectura/cliente-sin-prisma.test.ts`.
 */
export class AltaEnLoteInvalida extends Error {}

/**
 * El techo, y no es redondo por gusto: el dueño instala **cinco** por apiario y el plan más
 * grande de sus minutas son **diez**. Cincuenta deja sitio de sobra para un apiario grande y
 * convierte un cero de más al teclear —500— en un error visible en vez de en quinientas filas.
 */
export const MAXIMO_POR_LOTE = 50;

/**
 * Los identificadores que saldrían, sin tocar la base. Exportada **porque el guardia tiene que
 * poder llamarla con la entrada hostil**: probar el relleno de ceros a través de un formulario
 * y una transacción es probar otra cosa.
 *
 * **El prefijo se escribe tal cual ha de salir, separador incluido.** `"LN-"` da `LN-01`; `"LN"`
 * daría `LN01`. No se añade un guion por nuestra cuenta: el dueño ya tiene colmenas con su
 * propio esquema y adivinarle el separador es cómo se parte una numeración en dos familias.
 *
 * **El relleno va al ancho del número MÁS GRANDE del lote, con un mínimo de dos.** Así cinco
 * desde 1 dan `01…05` y ordenan bien como texto, que es como se ordenan en una lista.
 */
export function identificadoresDelLote(prefijo: string, desde: number, cuantas: number): string[] {
  const p = prefijo.trim();
  if (p === "") throw new AltaEnLoteInvalida("prefijo_vacio");
  if (!Number.isInteger(desde) || desde < 1) throw new AltaEnLoteInvalida("desde_invalido");
  if (!Number.isInteger(cuantas) || cuantas < 1) throw new AltaEnLoteInvalida("cuantas_invalido");
  if (cuantas > MAXIMO_POR_LOTE) throw new AltaEnLoteInvalida("cuantas_sobre_el_techo");

  const ultimo = desde + cuantas - 1;
  const ancho = Math.max(2, String(ultimo).length);
  const ids: string[] = [];
  for (let n = desde; n <= ultimo; n += 1) ids.push(`${p}${String(n).padStart(ancho, "0")}`);
  return ids;
}
