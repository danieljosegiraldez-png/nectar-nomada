/**
 * Un solo término para el vacío — y la distinción que el Anexo E no hace.
 *
 * **Qué cierra.** `48_A9_ANEXO_E_PANTALLAS_Y_FORMULARIOS.md` §6: *«Un solo término
 * para el vacío en toda la app. "Sin registrar" describe un dato que nadie anotó, no
 * una opción que alguien elige: sácalo de las listas desplegables y déjalo solo como
 * estado. Elimina "— elegir —".»*
 *
 * ## Tres familias, no dos — y es el hallazgo de esta rebanada
 *
 * El dueño contó los términos y pidió uno. Medidos el 2026-09-13, el módulo apícola
 * tenía **nueve** grafías en 22 opciones vacías. Pero **dos de las nueve no son
 * vacío**: son respuestas que casualmente guardan `null`.
 *
 * | familia | qué significa la opción vacía | cómo se escribe |
 * |---|---|---|
 * | `vacio` | nadie lo anotó | **sin texto**, y `Sin registrar` aparece donde se LEE |
 * | `placeholder` | campo obligatorio sin elegir todavía | **sin texto** y `disabled` |
 * | `respuesta` | una afirmación deliberada que vale «ninguno» | **conserva sus palabras** |
 *
 * Colapsar las nueve a un término habría borrado las dos de `respuesta`:
 * «No — cuento para decidir» dice que ese conteo **no evalúa ningún tratamiento** —y
 * su propio comentario lo declara el caso normal—, y el «—» de las causas de pérdida
 * dice que **esa causa no participó**. Las dos son cosas que alguien afirma; que el
 * valor guardado sea `null` es un detalle de almacenamiento, no su significado.
 *
 * **Por eso la lista de abajo es explícita y no una heurística.** Un detector que
 * adivinara por la forma del texto clasificaría «—» como decoración y se lo comería.
 * Añadir una opción vacía de familia `respuesta` obliga a escribirla aquí, que es el
 * sitio nombrado donde aterriza el veredicto.
 */

/** Si un valor cuenta como anotado o no. */
export type EstadoDelDato = "registrado" | "sin_registrar";

/**
 * La clave de i18n del **único** término del vacío. Se usa donde el valor se LEE,
 * nunca como etiqueta de una `<option>`.
 */
export const CLAVE_DEL_VACIO = "sinRegistrar";

/**
 * Las opciones vacías del módulo apícola que **conservan sus palabras** porque las
 * palabras son la respuesta. Cualquier otra opción vacía de apiario va sin texto.
 *
 * Se declara por clave de i18n y no por texto: el texto se traduce, la clave no.
 */
export const CLAVES_DE_RESPUESTA_QUE_VALE_NINGUNO = [
  /** «No — cuento para decidir»: este conteo no mide la eficacia de ningún tratamiento. */
  "varroaEvaluatesNone",
  /** «—»: esta causa candidata no participó en la pérdida. */
  "colonyEndCauseNo",
  /** «Ninguno»: el apiario no pertenece a ningún proyecto. `projectId` es anulable. */
  "noProjectOption",
  /** «— sin registrar —»: la razón de la limpieza no se anotó (ADR-080). La razón es opcional,
   *  y el vacío es exactamente eso: no se sabe, que no es ninguna de las razones. */
  "limpiezaRazonSinRegistrar",
  /**
   * «Sin lugar declarado»: el sitio de abejas no cuelga de ninguna finca ni parcela.
   *
   * Es una respuesta y no un hueco a rellenar: hasta el 2026-09-16 `crearApiario` **no
   * aceptaba padre**, así que un sitio suelto es el estado normal de todo lo creado desde la
   * aplicación. Y seguirá siéndolo: un apiario en terreno prestado puede no tener finca
   * dentro del sistema, y declararle una inventada sería peor que dejarlo suelto (ADR-145).
   */
  "sitioPadreNinguno",
  /**
   * «— sin decir —»: no se dijo con qué refractómetro se leyó la miel (ADR-160). El aparato es
   * opcional a propósito —bloquear la lectura por no nombrarlo perdería el dato—, y el vacío
   * es exactamente eso: no se sabe, que no es ninguno de los aparatos de la lista.
   */
  "refractometroAparatoSinDecir",
] as const satisfies readonly string[];

export type ClaveDeRespuestaQueValeNinguno = (typeof CLAVES_DE_RESPUESTA_QUE_VALE_NINGUNO)[number];

export function esRespuestaQueValeNinguno(clave: string): clave is ClaveDeRespuestaQueValeNinguno {
  return (CLAVES_DE_RESPUESTA_QUE_VALE_NINGUNO as readonly string[]).includes(clave);
}

/**
 * Si un valor está anotado o no.
 *
 * **Cero y `false` están ANOTADOS**, y es la mitad que importa. Cero kilos extraídos
 * es haber abierto la caja y no encontrar miel; `false` en un tres-estados es haber
 * mirado y no haber visto. Tratarlos como vacío es convertir una observación en una
 * ausencia — el reverso exacto de ADR-080, que prohíbe lo contrario.
 *
 * **`NaN` no está anotado.** Es la única forma numérica que no dice nada, y se
 * afirma aquí a propósito: una comparación con `NaN` siempre sale `false`, así que
 * dejarlo pasar como «registrado» produciría el veredicto que halaga a quien lo mide.
 *
 * Una lista vacía tampoco está anotada: ninguna lectura es ninguna lectura.
 */
export function estadoDelDato(valor: unknown): EstadoDelDato {
  if (valor === null || valor === undefined) return "sin_registrar";
  if (typeof valor === "string") return valor.trim() === "" ? "sin_registrar" : "registrado";
  if (typeof valor === "number") return Number.isNaN(valor) ? "sin_registrar" : "registrado";
  if (Array.isArray(valor)) return valor.length === 0 ? "sin_registrar" : "registrado";
  return "registrado";
}

/** Atajo de lectura: `true` cuando hay que enseñar «Sin registrar» en vez del valor. */
export function sinRegistrar(valor: unknown): boolean {
  return estadoDelDato(valor) === "sin_registrar";
}
