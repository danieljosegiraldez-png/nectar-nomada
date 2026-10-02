import { describe, expect, it } from "vitest";
import {
  celdasDelRango,
  celdasEnComun,
  celdasEnComunConVarios,
  seSolapan,
  validarRango,
  type Rango,
} from "../../lib/territorio/rejilla";

/**
 * La aritmética de la rejilla, probada sin base ni navegador.
 *
 * **Lo que se prueba es lo que hace mentir a una rejilla:** el rango declarado a
 * medias, el invertido, el que no describe una celda, y el que no cabe. Los
 * cuatro son estados que el campo produce de verdad, y los cuatro tienen que
 * salir distinguibles — `null` los colapsaría en «no hay datos».
 */
const R = (rowFrom: number, rowTo: number, plantFrom: number, plantTo: number): Rango => ({
  rowFrom,
  rowTo,
  plantFrom,
  plantTo,
});
const rejilla = { rowCount: 10, plantsPerRow: 20 };

describe("validarRango", () => {
  it("acepta un rango que cabe — el control positivo", () => {
    expect(validarRango(R(3, 6, 10, 18), rejilla)).toBeNull();
  });

  /**
   * Ningún campo es un estado legítimo: el rango de la microparcela es opcional
   * (diseño D3). Media declaración NO lo es, y los dos casos tienen que salir
   * distintos o «opcional» se convierte en «cualquier cosa».
   */
  it("sin ningún campo es válido; a medias es a_medias", () => {
    expect(validarRango({}, rejilla)).toBeNull();
    expect(validarRango({ rowFrom: 3, rowTo: 6 }, rejilla)).toBe("a_medias");
    expect(validarRango({ rowFrom: 3, rowTo: 6, plantFrom: 10 }, rejilla)).toBe("a_medias");
  });

  it("al revés se distingue de fuera de rejilla", () => {
    expect(validarRango(R(6, 3, 10, 18), rejilla)).toBe("al_reves");
    expect(validarRango(R(3, 6, 18, 10), rejilla)).toBe("al_reves");
  });

  /**
   * **El caso que importa, y se ataja ANTES de comparar.** `NaN > x` es `false`,
   * así que un rango con `NaN` pasaría cualquier comprobación de límites y se
   * guardaría como válido. Una revisión independiente encontró exactamente eso en
   * una versión anterior de esta función: devolvía «válido» para cuatro `NaN`.
   *
   * El cero entra aquí y no en `fuera_de_rejilla`: las hileras se cuentan desde
   * 1, así que la hilera 0 no es una celda de ninguna rejilla, no una celda que
   * se salga de esta.
   */
  it("lo que no describe una celda se rechaza antes de comparar límites", () => {
    expect(validarRango(R(Number.NaN, 6, 10, 18), rejilla)).toBe("no_es_celda");
    expect(validarRango(R(3, 6, 10, Number.NaN), rejilla)).toBe("no_es_celda");
    expect(validarRango(R(Number.POSITIVE_INFINITY, 6, 10, 18), rejilla)).toBe("no_es_celda");
    expect(validarRango(R(3, 6, 10, 18.5), rejilla)).toBe("no_es_celda");
    expect(validarRango(R(0, 6, 10, 18), rejilla)).toBe("no_es_celda");
    expect(validarRango(R(-2, 6, 10, 18), rejilla)).toBe("no_es_celda");
  });

  /**
   * Y el control de que `no_es_celda` no se come el caso siguiente: un rango de
   * enteros perfectamente válidos que simplemente no cabe tiene que dar
   * `fuera_de_rejilla`, no `no_es_celda`.
   */
  it("fuera de la rejilla, y sin rejilla no hay rango posible", () => {
    expect(validarRango(R(3, 11, 10, 18), rejilla)).toBe("fuera_de_rejilla");
    expect(validarRango(R(3, 6, 10, 21), rejilla)).toBe("fuera_de_rejilla");
    expect(validarRango(R(3, 6, 10, 18), null)).toBe("fuera_de_rejilla");
  });
});

describe("celdasDelRango", () => {
  it("cuenta los dos extremos incluidos", () => {
    expect(celdasDelRango(R(3, 6, 10, 18))).toBe(4 * 9);
    expect(celdasDelRango(R(1, 1, 1, 1))).toBe(1);
  });
});

describe("seSolapan y celdasEnComun", () => {
  /**
   * **Dos rangos se solapan sólo si se solapan sus DOS dimensiones.** La misma
   * banda de hileras con plantas disjuntas no es solape: son dos trozos
   * distintos de las mismas hileras, y un detector que mirara una sola dimensión
   * rechazaría bloques legítimos — que es peor que no tener detector, porque
   * enseña a ignorarlo.
   */
  it("hace falta que se solapen las dos dimensiones", () => {
    expect(seSolapan(R(1, 5, 1, 5), R(4, 8, 4, 8))).toBe(true);
    expect(seSolapan(R(1, 5, 1, 5), R(1, 5, 6, 9))).toBe(false);
    expect(seSolapan(R(1, 5, 1, 5), R(6, 9, 1, 5))).toBe(false);
  });

  it("es simétrico: el orden de los dos rangos no cambia la respuesta", () => {
    const a = R(1, 5, 1, 5);
    const b = R(4, 8, 4, 8);
    expect(seSolapan(a, b)).toBe(seSolapan(b, a));
    expect(celdasEnComun(a, b)).toBe(celdasEnComun(b, a));
  });

  /**
   * **La UNIÓN, no la suma de intersecciones.** Lo encontró una revisión
   * independiente el 2026-10-02 en `anadirRangoAlBloque`, que sumaba
   * `celdasEnComun` sobre los rangos del vecino: con `1–5` y `4–8` de las mismas
   * plantas contra un rango nuevo `1–5`, informaba **70 celdas donde hay 50**.
   *
   * Un número inflado en un aviso es peor que ningún aviso: el agrónomo decide
   * sobre él.
   *
   * Y el control dice por qué no se vio: **con un vecino de un solo rango, la
   * suma y la unión coinciden**, que es lo que tenían todas las pruebas.
   */
  it("con VARIOS rangos cuenta la unión, no la suma", () => {
    const nuevo = R(1, 5, 1, 10);
    const vecinoQueSePisa = [R(1, 5, 1, 10), R(4, 8, 1, 10)];
    const suma = vecinoQueSePisa.reduce((s, r) => s + celdasEnComun(r, nuevo), 0);
    expect(suma, "la suma de intersecciones es el defecto").toBe(70);
    expect(celdasEnComunConVarios(vecinoQueSePisa, nuevo), "la unión es la verdad").toBe(50);
  });

  it("el control: con UN solo rango, suma y unión coinciden", () => {
    const nuevo = R(1, 5, 1, 10);
    const uno = [R(1, 5, 1, 10)];
    expect(celdasEnComunConVarios(uno, nuevo)).toBe(celdasEnComun(uno[0]!, nuevo));
    expect(celdasEnComunConVarios(uno, nuevo)).toBe(50);
  });

  it("y con rangos DISJUNTOS la unión sí es la suma", () => {
    const nuevo = R(1, 10, 1, 10);
    const disjuntos = [R(1, 3, 1, 10), R(7, 9, 1, 10)];
    expect(celdasEnComunConVarios(disjuntos, nuevo)).toBe(3 * 10 + 3 * 10);
  });

  it("ninguno que toque da 0", () => {
    expect(celdasEnComunConVarios([R(6, 9, 1, 5)], R(1, 5, 1, 5))).toBe(0);
    expect(celdasEnComunConVarios([], R(1, 5, 1, 5))).toBe(0);
  });

  /** Solape parcial en las dos dimensiones, que es donde una banda mal partida falla. */
  it("solape parcial en las dos dimensiones", () => {
    // 2–4 × 3–6 y 3–6 × 5–8, contra 1–10 × 1–10:
    //   bandas 2, 3–4, 5–6 → 1×4 + 2×6 + 2×4 = 4 + 12 + 8 = 24
    expect(celdasEnComunConVarios([R(2, 4, 3, 6), R(3, 6, 5, 8)], R(1, 10, 1, 10))).toBe(24);
  });

  it("cuenta las celdas comunes, y 0 cuando no se tocan", () => {
    expect(celdasEnComun(R(1, 5, 1, 5), R(4, 8, 4, 8))).toBe(2 * 2);
    expect(celdasEnComun(R(1, 5, 1, 5), R(1, 5, 6, 9))).toBe(0);
    expect(celdasEnComun(R(1, 5, 1, 5), R(1, 5, 1, 5))).toBe(25);
  });
});
