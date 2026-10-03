/**
 * La forma declarada de una parcela, contada en celdas.
 *
 * **Por qué existe** (D8/D9, 2026-10-02): el diseño del 2026-10-01 daba por supuesto
 * que un lote es un rectángulo perfecto, y sobre ese supuesto la pantalla afirmaba
 * «caben 200 y hay 150: una diferencia de 50» en un lote al que le falta una esquina,
 * donde la diferencia real es 20. La rejilla pasa a ser el **tablero de direcciones**;
 * cuáles de sus celdas están plantadas lo dice la forma, que es opcional.
 *
 * **Archivo propio y no dentro de `plotBlocks.ts`**, que ya creció 262 líneas el mismo
 * día. Lo que vive aquí es otra responsabilidad: cuánto hay plantado, no qué bloque
 * cubre qué.
 *
 * **No tiene geometría propia, y eso es el hallazgo.** `celdasEnComunConVarios` de
 * `lib/territorio/rejilla.ts` calcula **|unión(rangos) ∩ otro|** por compresión de
 * coordenadas. Lo único que cambia es qué se le pasa como `otro`: el tablero entero da
 * la capacidad del lote, el rango de una microparcela da la suya, y lo que sobra de un
 * trozo son sus celdas sin plantar. La función ya está probada contra el defecto que
 * la motivó —sumaba intersecciones y decía 70 donde hay 50—, así que reusarla trae esa
 * prueba con ella.
 */
import { celdasEnComunConVarios, type Rango } from "../territorio/rejilla";

/** El tablero entero, como un rango, para pasárselo como ámbito. */
export function tableroDe(rejilla: { rowCount: number; plantsPerRow: number }): Rango {
  return { rowFrom: 1, rowTo: rejilla.rowCount, plantFrom: 1, plantTo: rejilla.plantsPerRow };
}

const celdasDe = (r: Rango) => (r.rowTo - r.rowFrom + 1) * (r.plantTo - r.plantFrom + 1);

/**
 * Cuántas celdas **plantadas** hay dentro de `ambito`.
 *
 * `ambito` es el tablero entero para una parcela, o el rango de la microparcela cuando
 * lo declaró (D3, §7.1 del diseño).
 *
 * **Sin forma declarada devuelve 0**, y quien pregunta distingue ese caso antes de
 * afirmar una capacidad: no devuelve el tablero entero, porque «no se sabe» no es
 * «está lleno» igual que no es «está vacío» (ADR-080).
 */
export function celdasDeLaForma(forma: readonly Rango[], ambito: Rango): number {
  if (forma.length === 0) return 0;
  return celdasEnComunConVarios(forma, ambito);
}

/**
 * Cuántas celdas de `trozo` caen donde la forma dice que **no** hay planta.
 *
 * Es lo que D11 convierte en aviso: el trozo se guarda, y se dice cuántas celdas sin
 * plantar incluye. Una trampa en un claro es su sitio natural.
 *
 * **Sin forma declarada devuelve 0, no `|trozo|`.** Si devolviera el total, cada
 * parcela sin forma avisaría de que todo está sin plantar — y eso convertiría un
 * «no medido» en una afirmación.
 */
export function celdasSinPlantar(forma: readonly Rango[], trozo: Rango): number {
  if (forma.length === 0) return 0;
  return celdasDe(trozo) - celdasEnComunConVarios(forma, trozo);
}
