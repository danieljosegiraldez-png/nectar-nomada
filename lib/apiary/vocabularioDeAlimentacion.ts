/**
 * Con qué se alimentó: el vocabulario del dueño, y la regla de que «otro» diga cuál.
 *
 * **Qué cierra.** Hasta hoy `feedingMaterial` era texto libre, con `"sugar syrup 1:1"` de
 * ejemplo en su propio comentario. Eso significa que **«con qué se alimentó esta temporada» no
 * era una consulta**: era leer a ojo lo que cada quien tecleó, en el idioma y la ortografía que
 * le salió. Es el mismo vacío que ADR-114 cerró para las irregularidades y ADR-119 para el
 * objetivo del tratamiento.
 *
 * **Los cinco valores son del dueño, literales**, dichos en el apiario el 2026-09-16: «azúcar
 * morena, blanca, melaza, miel de abeja y miel de caña». **No se añadió ninguno más**, ni
 * siquiera los que cualquier manual listaría —candy, sustituto de polen, jarabe invertido—:
 * un vocabulario con valores que en esta finca nadie usa enseña a bajar hasta «otro» y deja de
 * leerse. Cuando el dueño alimente con algo nuevo, se añade entonces.
 *
 * **En español, como `FeedingMethod`.** Su hermano en el mismo formulario ya lo está, y quien
 * lee esto está en el apiario con un guante puesto. `ColonyOriginType` está en inglés y no se
 * toca: cambiarlo sería un renombrado sin pedirlo.
 *
 * Puro, sin `lib/db` detrás, porque `ColonyEventQuickEntry` y `ManejoEnLoteForm` son
 * `"use client"` — importar `prisma` desde ahí arrastra el cliente al navegador y rompe el
 * build. Lo vigila `tests/arquitectura/cliente-sin-prisma.test.ts`.
 */
import type { FeedingMaterial } from "../../generated/prisma/client";

export class AlimentacionInvalida extends Error {}

/**
 * El orden es el que dijo el dueño, no alfabético ni por frecuencia: es el orden en el que él
 * piensa la lista, y por tanto el orden en el que la busca en un desplegable.
 */
export const MATERIALES_DE_ALIMENTACION = [
  "azucar_morena",
  "azucar_blanca",
  "melaza",
  "miel_de_abeja",
  "miel_de_cana",
  "otro",
] as const satisfies readonly FeedingMaterial[];

export type MaterialDeAlimentacion = (typeof MATERIALES_DE_ALIMENTACION)[number];

/**
 * El valor que obliga a decir cuál. Se nombra en vez de escribir `"otro"` suelto en los tres
 * sitios que lo comprueban, porque tres cadenas iguales son tres sitios donde olvidarse de uno.
 */
export const MATERIAL_QUE_EXIGE_CUAL: MaterialDeAlimentacion = "otro";

export function esMaterialDeAlimentacion(valor: unknown): valor is MaterialDeAlimentacion {
  return typeof valor === "string" && (MATERIALES_DE_ALIMENTACION as readonly string[]).includes(valor);
}

/**
 * La puerta de entrada: valida el par completo, no el campo suelto.
 *
 * **Recibe los DOS porque la regla es sobre los dos.** Un `otro` sin texto y un texto sin `otro`
 * son errores distintos, y validar `kind` por su cuenta no puede ver ninguno de los dos.
 *
 * - `kind` ausente ⇒ devuelve el par vacío. **No es un error**: alimentar sin declarar con qué
 *   es un registro incompleto, no uno inválido, y bloquearlo perdería la captura entera en
 *   campo. ADR-080: `null` es «sin registrar», y así se queda.
 * - `kind = otro` **exige** el texto. Un «otro» que no dice cuál no es información: es la
 *   respuesta vacía que ADR-125 persigue, disfrazada de dato.
 * - `kind` del vocabulario **admite** texto igualmente — «miel de caña, de la finca de al lado»
 *   es una precisión legítima, no una contradicción.
 */
export function exigeMaterialDeAlimentacion(
  kind: unknown,
  cual: unknown,
): { kind: MaterialDeAlimentacion | null; cual: string | null } {
  const texto = typeof cual === "string" ? cual.trim() : "";
  const cualFinal = texto === "" ? null : texto;

  const bruto = typeof kind === "string" ? kind.trim() : "";
  if (bruto === "") return { kind: null, cual: cualFinal };

  if (!esMaterialDeAlimentacion(bruto)) {
    throw new AlimentacionInvalida(`material_de_alimentacion_desconocido: ${bruto}`);
  }

  if (bruto === MATERIAL_QUE_EXIGE_CUAL && cualFinal === null) {
    throw new AlimentacionInvalida("otro_sin_decir_cual");
  }

  return { kind: bruto, cual: cualFinal };
}

/**
 * Cómo se lee un registro de alimentación en una línea, para el informe y la bitácora.
 *
 * **Se queda aquí y no en cada pantalla** porque el informe al cliente, la bitácora y la ficha
 * de la colonia enseñaban los tres el mismo campo con tres criterios distintos. Y contempla el
 * registro **anterior al vocabulario**: `kind` vacío con texto es lo que hay en las filas de
 * antes de hoy, y enseñarlas en blanco sería perder lo que sí se escribió.
 */
export function comoSeLeeElMaterial(
  kind: MaterialDeAlimentacion | null | undefined,
  cual: string | null | undefined,
  etiqueta: (k: MaterialDeAlimentacion) => string,
): string | null {
  const texto = typeof cual === "string" && cual.trim() !== "" ? cual.trim() : null;
  if (!kind) return texto;
  if (kind === MATERIAL_QUE_EXIGE_CUAL) return texto ?? etiqueta(kind);
  return texto ? `${etiqueta(kind)} (${texto})` : etiqueta(kind);
}
