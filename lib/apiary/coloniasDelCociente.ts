/**
 * Cuántas colonias entran en el cociente de polinización: **la cifra que alguien contó al salir
 * del sitio, si la hay, y si no la del sistema** (D6: el conteo del sistema «es el conteo del
 * sistema, no el de la visita»).
 *
 * **Vive sola, y pura, para que la regla se escriba una vez.** La usan la ficha del apiario
 * (`densidadDePolinizacion`) y el aviso de floración del tablero (`vitalesDeSitios`). Si cada uno
 * la escribiera por su cuenta, un día la ficha diría «faltan 5» y el tablero avisaría con otra
 * cuenta del mismo sitio. Y no puede vivir en `polinizacion.ts`: ese módulo ya importa
 * `vitalesDelSitio.ts`, y al revés sería un ciclo.
 */
export function coloniasDelCociente(declaradas: number | null, delSistema: number): number {
  return declaradas ?? delSistema;
}
