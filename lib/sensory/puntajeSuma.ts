/**
 * El puntaje total como suma directa de los atributos.
 *
 * **Por qué existe (2026-09-07).** La rúbrica de competencia de miel
 * (`BEVERAGE_SENSORY_PROTOCOLS.md` §3) reparte 100 puntos entre seis criterios
 * ponderados —20+20+15+10+15+20— y su total ES la suma. Sin esto habría que
 * teclearlo a mano, que es justo lo que se acaba de quitar del café: dos jueces
 * con los mismos seis criterios podían escribir totales distintos.
 *
 * **Y por qué es una fórmula propia y no «la del CVA sin coeficiente».** La del
 * CVA transforma la suma (0,65625·Σ + 52,75) y penaliza tazas. Ésta no
 * transforma nada. Meterlas en la misma función con banderas haría que un
 * cambio en una se leyera como un cambio en la otra.
 */

/** La clave que un protocolo pone en `scoreFormula` para pedir este cálculo. */
export const FORMULA_SUMA_DE_ATRIBUTOS = "attribute_sum_v1";

export class PuntajeSumaInvalido extends Error {}

export interface AtributoParaSumar {
  name: string;
  scaleMin: number;
  scaleMax: number;
  value: number;
}

/**
 * Devuelve la suma, o lanza si algún valor se sale de la escala de SU atributo.
 *
 * Cada atributo tiene su propio techo —apariencia vale 10 y sabor 20—, así que
 * el rango se comprueba uno por uno. Un 20 en apariencia dobla su peso y el
 * total sigue pareciendo un número normal.
 */
export function puntajeSumaDeAtributos(atributos: ReadonlyArray<AtributoParaSumar>): number {
  if (atributos.length === 0) {
    throw new PuntajeSumaInvalido("No hay ningún atributo que sumar.");
  }
  let total = 0;
  for (const a of atributos) {
    if (!Number.isFinite(a.value) || a.value < a.scaleMin || a.value > a.scaleMax) {
      throw new PuntajeSumaInvalido(`"${a.name}" vale ${a.value}; su escala va de ${a.scaleMin} a ${a.scaleMax}.`);
    }
    total += a.value;
  }
  return Math.round(total * 100) / 100;
}
