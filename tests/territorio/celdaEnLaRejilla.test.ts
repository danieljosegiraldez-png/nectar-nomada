/**
 * ¿Cabe una celda en la rejilla de la parcela?
 *
 * **Sin un solo mock, a propósito.** La alternativa era probar `createSpecimen`
 * entero mockeando Prisma, `$transaction`, el RBAC y la auditoría; y una función que
 * sólo se puede probar a través de todo eso no está probada, está rodeada. El
 * predicado se exporta y se le pasa la entrada hostil directamente.
 *
 * La GARANTÍA la da el disparador `specimen_exigir_planton_en_la_rejilla`, probado
 * contra la base en `tests/territorio/plantonEnLaRejilla.test.ts`. Esto es la mitad
 * que da la FRASE: sin ella, un `P0001` crudo llega a la pantalla como un 500 — la
 * clase de fallo del PR #433.
 */
import { describe, expect, it } from "vitest";
import { celdaCabeEnLaRejilla } from "../../lib/territorio/rejilla";

const DIEZ_POR_VEINTE = { rowCount: 10, plantsPerRow: 20 };

describe("celdaCabeEnLaRejilla", () => {
  it("una celda del tablero cabe", () => {
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, 7, 12)).toBe(true);
  });

  it("los bordes caben: la primera y la última celda", () => {
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, 1, 1)).toBe(true);
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, 10, 20)).toBe(true);
  });

  it("una hilera más allá del tablero no cabe", () => {
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, 11, 1)).toBe(false);
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, 99, 1)).toBe(false);
  });

  it("una planta más allá del ancho no cabe", () => {
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, 1, 21)).toBe(false);
  });

  it("el cero y lo negativo no caben: las celdas se cuentan desde 1", () => {
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, 0, 1)).toBe(false);
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, 1, 0)).toBe(false);
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, -3, 1)).toBe(false);
  });

  /**
   * **Media coordenada cabe, y no es un olvido.**
   * `lib/traceability/jornadasDeCosecha.ts` imprime `${gridRow}-${gridPosition ?? "?"}`,
   * así que el repositorio ya tolera este caso, y el disparador de la base valida
   * cada número contra su propio límite. Esta función hace lo mismo.
   */
  it("media coordenada cabe, y la que está se valida igual", () => {
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, 5, null)).toBe(true);
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, null, 5)).toBe(true);
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, 99, null)).toBe(false);
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, null, 99)).toBe(false);
  });

  it("sin ninguna coordenada cabe: un plantón puede no estar situado", () => {
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, null, null)).toBe(true);
  });

  /**
   * **Un número que no es entero no cabe.** La base lo rechazaría al convertir a
   * `integer`, pero con un error crudo; aquí da la frase. Y 7,5 no es una celda.
   */
  it("un número que no es entero no cabe", () => {
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, 7.5, 1)).toBe(false);
    expect(celdaCabeEnLaRejilla(DIEZ_POR_VEINTE, Number.NaN, 1)).toBe(false);
  });
});
