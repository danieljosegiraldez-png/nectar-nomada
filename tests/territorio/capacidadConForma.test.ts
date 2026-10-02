/**
 * La capacidad con forma declarada, y las celdas sin plantar de un trozo.
 *
 * Hermética: aritmética pura, sin base. Carril de `scripts/ci.sh`.
 *
 * **Sin una línea de geometría nueva.** `celdasEnComunConVarios` de
 * `lib/territorio/rejilla.ts` ya calcula **|unión(rangos) ∩ otro|** por compresión de
 * coordenadas; lo único que cambia es qué se le pasa como `otro`. El tablero entero da
 * la capacidad del lote; el rango de una microparcela, la suya.
 *
 * **El control que importa en este archivo** es un caso donde la suma de las
 * intersecciones y la unión NO coinciden. Con trozos que no se pisan los dos números
 * son iguales y la prueba no mediría nada — y eso fue un defecto real: el informe de
 * solape de la tarea 5 sumaba intersecciones y decía 70 donde hay 50.
 */
import { describe, expect, it } from "vitest";
import { celdasDeLaForma, celdasSinPlantar, tableroDe } from "../../lib/traceability/formaDeLaParcela";

const TABLERO = tableroDe({ rowCount: 10, plantsPerRow: 20 });

describe("tableroDe", () => {
  it("convierte la rejilla en el rango que la cubre entera", () => {
    expect(TABLERO).toEqual({ rowFrom: 1, rowTo: 10, plantFrom: 1, plantTo: 20 });
  });
});

describe("celdasDeLaForma", () => {
  /**
   * **Sin forma declarada da 0, y quien pregunta decide qué hacer con eso.** No
   * devuelve el tablero entero: «no se sabe» no es «está lleno» (ADR-080), igual que
   * no es «está vacío». El estado `sin_forma` de la tarea 3 es quien lo interpreta.
   */
  it("sin forma declarada da 0", () => {
    expect(celdasDeLaForma([], TABLERO)).toBe(0);
  });

  it("un trozo que cubre el tablero entero da el tablero entero", () => {
    expect(celdasDeLaForma([{ rowFrom: 1, rowTo: 10, plantFrom: 1, plantTo: 20 }], TABLERO)).toBe(200);
  });

  it("la esquina cortada del diseño da 176, no 200", () => {
    const forma = [
      { rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 }, // 140
      { rowFrom: 8, rowTo: 10, plantFrom: 1, plantTo: 12 }, //  36
    ];
    expect(celdasDeLaForma(forma, TABLERO)).toBe(176);
  });

  /**
   * **El control que discrimina.** Dos trozos que SE PISAN: la suma daría 140+100=240
   * y la unión son 180. Sin este caso, sumar intersecciones pasaría la prueba — que es
   * exactamente el defecto que ya ocurrió una vez.
   */
  it("dos trozos que se pisan cuentan la UNIÓN, no la suma", () => {
    const forma = [
      { rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 }, // 140
      { rowFrom: 5, rowTo: 9, plantFrom: 1, plantTo: 20 }, // 100, de las que 60 se pisan
    ];
    expect(celdasDeLaForma(forma, TABLERO)).toBe(180);
    expect(celdasDeLaForma(forma, TABLERO), "la suma seria 240").not.toBe(240);
  });

  it("acotada al rango de una microparcela, da sólo lo plantado dentro de él", () => {
    const forma = [{ rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 }];
    const micro = { rowFrom: 5, rowTo: 10, plantFrom: 1, plantTo: 20 };
    expect(celdasDeLaForma(forma, micro)).toBe(60); // hileras 5-7 × 20 plantas
  });

  it("una microparcela enteramente fuera de la forma no tiene capacidad", () => {
    const forma = [{ rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 }];
    const micro = { rowFrom: 9, rowTo: 10, plantFrom: 1, plantTo: 20 };
    expect(celdasDeLaForma(forma, micro)).toBe(0);
  });

  /** Un hueco en medio de una hilera: la roca del diseño, descrita con dos trozos. */
  it("un hueco en medio se describe con dos trozos y se cuenta bien", () => {
    const forma = [
      { rowFrom: 5, rowTo: 5, plantFrom: 1, plantTo: 7 },
      { rowFrom: 5, rowTo: 5, plantFrom: 13, plantTo: 20 },
    ];
    expect(celdasDeLaForma(forma, TABLERO)).toBe(15); // 7 + 8, y las 5 del hueco fuera
  });
});

describe("celdasSinPlantar", () => {
  it("un trozo enteramente dentro de la forma no tiene ninguna", () => {
    const forma = [{ rowFrom: 1, rowTo: 10, plantFrom: 1, plantTo: 20 }];
    expect(celdasSinPlantar(forma, { rowFrom: 2, rowTo: 3, plantFrom: 2, plantTo: 5 })).toBe(0);
  });

  it("un trozo en el claro las cuenta todas", () => {
    const forma = [{ rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 }];
    expect(celdasSinPlantar(forma, { rowFrom: 9, rowTo: 10, plantFrom: 1, plantTo: 5 })).toBe(10);
  });

  it("un trozo a medias cuenta sólo la parte de fuera", () => {
    const forma = [{ rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 }];
    // El trozo cubre hileras 6-9 × plantas 1-10 = 40 celdas; dentro de la forma
    // quedan las hileras 6 y 7 (20 celdas), así que fuera hay 20.
    expect(celdasSinPlantar(forma, { rowFrom: 6, rowTo: 9, plantFrom: 1, plantTo: 10 })).toBe(20);
  });

  /**
   * **Sin forma declarada devuelve 0, NO el trozo entero.** Si devolviera el total,
   * cada parcela sin forma avisaría de que todo está sin plantar — y «no se sabe» no es
   * «está vacío» (ADR-080). Esta es la aserción que hay que leer dos veces.
   */
  it("sin forma declarada no hay celdas sin plantar: no se sabe, y no se inventa", () => {
    expect(celdasSinPlantar([], { rowFrom: 1, rowTo: 2, plantFrom: 1, plantTo: 2 })).toBe(0);
  });
});
