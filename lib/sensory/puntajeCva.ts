/**
 * El puntaje afectivo del Coffee Value Assessment de la SCA, calculado.
 *
 * **De dónde salen estos números (2026-09-06).** No de los PDF del estándar:
 * cinco de los siete que tenemos vienen cifrados y el del Fine Robusta es un
 * escaneo sin texto. Salen de MEDIR la calculadora pública que la propia SCA
 * publica en `sca.coffee/cuppingscore`, cambiando una entrada a la vez y
 * leyendo el resultado:
 *
 * | Entrada                          | La calculadora | Esta función |
 * |----------------------------------|----------------|--------------|
 * | los ocho a 1                     |  58,00         |  58,00       |
 * | sólo Fragrance a 9               |  63,25         |  63,25       |
 * | los ocho a 9                     | 100,00         | 100,00       |
 * | los ocho a 9, 1 taza no uniforme |  98,00         |  98,00       |
 * | los ocho a 9, 5 y 5              |  70,00         |  70,00       |
 * | los ocho a 5                     |  79,00         |  79,00       |
 *
 * Las seis están reproducidas como pruebas. Si algún día la SCA cambia la
 * fórmula, esas pruebas seguirán pasando —describen lo medido, no la verdad—,
 * así que la fecha de la medición está escrita aquí a propósito.
 *
 * **Por qué se calcula y no se teclea.** El `overallScore` de `Assessment` lo
 * escribía a mano quien cataba. Dos personas que dan los mismos ocho atributos
 * pueden teclear totales distintos, y entonces comparar dos lotes no compara
 * nada. Bajo un protocolo con `scoreFormula`, el total deja de ser una opinión
 * más y pasa a ser una consecuencia de las ocho que sí lo son.
 *
 * **Esto es sólo la sección afectiva.** La descriptiva del CVA —los descriptores
 * CATA y sus intensidades— vive en el SCA-103, que está cifrado. No se inventa.
 */

/** Los ocho atributos afectivos, en el orden en que los pide el formulario. */
export const ATRIBUTOS_CVA_AFECTIVO = [
  "Fragrance",
  "Aroma",
  "Flavor",
  "Aftertaste",
  "Acidity",
  "Mouthfeel",
  "Sweetness",
  "Overall",
] as const;

export type AtributoCvaAfectivo = (typeof ATRIBUTOS_CVA_AFECTIVO)[number];

/** La clave que un protocolo pone en `scoreFormula` para pedir este cálculo. */
export const FORMULA_CVA_AFECTIVO = "cva_affective_v1";

export const ESCALA_ATRIBUTO_MIN = 1;
export const ESCALA_ATRIBUTO_MAX = 9;
export const TAZAS_MAX = 5;

/** 100 − 52,75 = 47,25 puntos repartidos entre los 72 posibles: 47,25 / 72. */
const COEFICIENTE = 0.65625;
const CONSTANTE = 52.75;
const PENALIZACION_NO_UNIFORME = 2;
const PENALIZACION_DEFECTUOSA = 4;

export class PuntajeCvaInvalido extends Error {}

export interface EntradaPuntajeCva {
  /** Los ocho valores, en el orden de `ATRIBUTOS_CVA_AFECTIVO`. */
  valores: readonly number[];
  tazasNoUniformes: number;
  tazasDefectuosas: number;
}

function exige(condicion: unknown, mensaje: string): asserts condicion {
  if (!condicion) throw new PuntajeCvaInvalido(mensaje);
}

/**
 * Devuelve el puntaje afectivo redondeado a dos decimales, o lanza.
 *
 * Valida los rangos en vez de confiar en ellos. El formulario ya pone `min` y
 * `max` en los `<input>`, pero eso es HTML: un POST hecho a mano se los salta, y
 * un 90 donde iba un 9 produce un puntaje de 111,19 que nadie mira dos veces
 * porque es sólo un número más en una tabla.
 */
export function puntajeAfectivoCva(entrada: EntradaPuntajeCva): number {
  const { valores, tazasNoUniformes, tazasDefectuosas } = entrada;

  exige(
    valores.length === ATRIBUTOS_CVA_AFECTIVO.length,
    `El puntaje afectivo necesita los ${ATRIBUTOS_CVA_AFECTIVO.length} atributos; llegaron ${valores.length}.`,
  );

  for (const [i, v] of valores.entries()) {
    exige(
      Number.isFinite(v) && v >= ESCALA_ATRIBUTO_MIN && v <= ESCALA_ATRIBUTO_MAX,
      `"${ATRIBUTOS_CVA_AFECTIVO[i]}" vale ${v}; la escala va de ${ESCALA_ATRIBUTO_MIN} a ${ESCALA_ATRIBUTO_MAX}.`,
    );
  }

  for (const [nombre, tazas] of [
    ["no uniformes", tazasNoUniformes],
    ["defectuosas", tazasDefectuosas],
  ] as const) {
    exige(
      Number.isInteger(tazas) && tazas >= 0 && tazas <= TAZAS_MAX,
      `Las tazas ${nombre} son ${tazas}; debe ser un entero de 0 a ${TAZAS_MAX}.`,
    );
  }

  const suma = valores.reduce((total, v) => total + v, 0);
  const bruto =
    COEFICIENTE * suma +
    CONSTANTE -
    PENALIZACION_NO_UNIFORME * tazasNoUniformes -
    PENALIZACION_DEFECTUOSA * tazasDefectuosas;

  // Dos decimales, que es lo que enseña la calculadora de la SCA y lo que cabe
  // en `Decimal(5,2)` de `assessment.overall_score`.
  return Math.round(bruto * 100) / 100;
}
