/**
 * Cajas presentes: lo que alguien contó contra lo que el sistema tiene colocado.
 *
 * **Qué cierra.** El Anexo E pregunta «Cajas presentes» en la etapa de campo, y hasta hoy el mapa
 * del protocolo la daba por **sin sitio** con esta nota: *«Las cajas presentes se cuentan hoy desde
 * `Hive`, no se declaran. Contar y declarar son datos distintos: el segundo es lo que alguien
 * vio.»* Este módulo es esa distinción hecha código.
 *
 * ## Por qué declarar algo que el sistema ya cuenta
 *
 * `HivePlacement` sabe cuántas cajas **colocó** en un sitio. Eso no es lo mismo que cuántas
 * **hay**: una caja puede irse —robada, movida por un vecino, prestada— sin que nadie registre el
 * traslado. Cuando los dos números no coinciden, eso no es ruido: es una caja que se fue sin
 * registrarse, o un recuento mal hecho. **Las dos cosas hay que mirarlas, y hoy el sistema no
 * puede ni notarlo.**
 *
 * ## Y aquí NINGUNO de los dos manda, a diferencia de las colonias
 *
 * Para colonias vivas la regla está en `polinizacion.ts` y es explícita: **el declarado manda**,
 * porque el sistema no sabe cuáles murieron —una colonia muere sin que nadie lo apunte—. Para
 * cajas no vale esa regla: `HivePlacement` **sí** es un registro deliberado, así que ninguno de
 * los dos es obviamente mejor. Elegir uno escondería la señal.
 *
 * Así que la salida de esto **no es un número: es la comparación**. Igual que allí, «el que no
 * manda NO se tira»: los dos viajan hasta la pantalla.
 *
 * ## El estado es de tres valores y no un booleano
 *
 * Un `divergen: boolean` mentiría cuando nadie contó: `false` se lee como «coinciden» y significa
 * «no lo sé». Es exactamente ADR-080 aplicado a un valor derivado — `null` es «sin registrar», y
 * un cero o un falso no lo sustituyen.
 *
 * Puro, sin `prisma`: quien lea las filas se las pasa. Así el guardia puede llamarlo con la
 * entrada hostil sin levantar una base.
 */

/** Los tres estados posibles, y ninguno se puede confundir con otro. */
export type EstadoDeCajas = "sin_recuento" | "coinciden" | "divergen";

export interface ComparacionDeCajas {
  /** Lo que alguien contó al visitar. `null` = nadie contó. */
  declaradas: number | null;
  /** Lo que `HivePlacement` dice que hay colocado. Siempre un número: el sistema siempre sabe. */
  enSistema: number;
  estado: EstadoDeCajas;
  /**
   * `declaradas - enSistema`, o `null` si nadie contó.
   *
   * **Con signo a propósito.** Un `-2` es «faltan dos de las que tenemos registradas» y un `+2`
   * es «hay dos que no están en el sistema»; son problemas distintos y un valor absoluto los
   * confundiría en el mismo aviso.
   */
  diferencia: number | null;
}

export class CajasPresentesInvalido extends Error {}

export function compararCajasPresentes(declaradas: number | null | undefined, enSistema: number): ComparacionDeCajas {
  if (!Number.isInteger(enSistema) || enSistema < 0) {
    throw new CajasPresentesInvalido(`cuenta_del_sistema_invalida: ${enSistema}`);
  }
  if (declaradas == null) {
    return { declaradas: null, enSistema, estado: "sin_recuento", diferencia: null };
  }
  if (!Number.isInteger(declaradas) || declaradas < 0) {
    // **Cero es válido y no se rechaza**: un apiario vaciado se cuenta como cero, y ese cero es
    // un dato. Lo que se rechaza es lo que no puede ser un recuento.
    throw new CajasPresentesInvalido(`recuento_declarado_invalido: ${declaradas}`);
  }
  const diferencia = declaradas - enSistema;
  return {
    declaradas,
    enSistema,
    estado: diferencia === 0 ? "coinciden" : "divergen",
    diferencia,
  };
}

/**
 * Cómo se lee la divergencia en una línea, para el informe y la ficha del sitio.
 *
 * Devuelve `null` cuando no hay nada que decir —nadie contó, o coinciden— para que la pantalla
 * no pinte una fila vacía. **Un «coinciden» explícito sería ruido**: lo interesante es la
 * diferencia, y decir «todo bien» en cada visita entrena a no leerlo.
 */
export function avisoDeCajas(c: ComparacionDeCajas): { faltan: number } | { sobran: number } | null {
  if (c.estado !== "divergen" || c.diferencia === null) return null;
  return c.diferencia < 0 ? { faltan: -c.diferencia } : { sobran: c.diferencia };
}
