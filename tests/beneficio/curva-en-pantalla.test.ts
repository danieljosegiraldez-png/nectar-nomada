/**
 * Lo que la pantalla hace con la curva: una lectura que se salió de la receta SE MUESTRA, y la URL
 * no puede tumbar la página.
 *
 * **Lo que estas pruebas existen para impedir:** `curvaDeLote` no recorta a propósito, y el `<svg>`
 * que la pinta recortaría por su cuenta. Aquí se prueba la parte que no necesita un navegador: que
 * `colocarPuntos` devuelve, para una lectura fuera de la banda, un punto marcado como tal y con una
 * `y` finita dentro del `viewBox` ampliado — nunca `NaN`, que compara `false` con todo y se lee
 * como «no hay nada fuera».
 *
 * Hermética: sin base, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { describe, expect, it } from "vitest";
import { curvaDeLote, type ObjetivoDeCurva } from "../../lib/beneficio/curvaDeLote";
import {
  colocarPuntos,
  juicioDeBanda,
  leerCurvaPedida,
  margenVertical,
} from "../../lib/beneficio/curvaEnPantalla";

const t = (h: number) => new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00.000Z`);
const BANDA = { momento: "during", minValue: 4.0, maxValue: 5.0, targetValue: 4.5 } as const;
const ID = "3f2b6c1e-8a44-4d0e-9b57-0c1d2e3f4a5b";

describe("colocarPuntos", () => {
  it("una lectura fuera de la banda se marca, y una dentro no", () => {
    const c = curvaDeLote({
      lecturas: [
        { occurredAt: t(8), value: 4.5 }, // dentro
        { occurredAt: t(12), value: 5.1 }, // apenas por encima
        { occurredAt: t(16), value: 3.9 }, // apenas por debajo
      ],
      objetivos: [BANDA], ancho: 480, alto: 200,
    });
    const p = colocarPuntos(c);
    // Control: los tres puntos están. Sin él, «ninguno fuera» podría ser «no pinté nada».
    expect(p).toHaveLength(3);
    expect(p.map((x) => x.fueraDeBanda)).toEqual([false, true, true]);
    // Cabe en el margen: se dibuja en su sitio VERDADERO, no anclado.
    expect(p[1]!.fuera).toBeNull();
    expect(p[1]!.y).toBe(c.puntos[1]!.y);
    expect(p[1]!.y).toBeLessThan(0);
    expect(p[2]!.y).toBeGreaterThan(200);
  });

  /**
   * El caso que el navegador destapó: con una banda ESTRECHA (pH 4,0–4,6), una lectura corriente
   * como 4,8 —un tercio de banda por encima— quedaba anclada en el borde con el margen del 20 %.
   * Una desviación de ese tamaño se dibuja donde está, no se marca como «no cabe».
   */
  it("una banda estrecha no ancla las desviaciones corrientes: 4,8 y 3,8 sobre 4,0–4,6 se dibujan en su sitio", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(8), value: 4.3 }, { occurredAt: t(12), value: 4.8 }, { occurredAt: t(16), value: 3.8 }],
      objetivos: [{ momento: "during", minValue: 4.0, maxValue: 4.6, targetValue: 4.3 }], ancho: 480, alto: 200,
    });
    // Control: de verdad quedan fuera del lienzo (`y < 0`, `y > alto`); si no, la prueba no dice nada.
    expect(c.puntos[1]!.y).toBeLessThan(0);
    expect(c.puntos[2]!.y).toBeGreaterThan(200);
    const p = colocarPuntos(c);
    expect(p.map((x) => x.fuera)).toEqual([null, null, null]);
    expect(p[1]!.y).toBe(c.puntos[1]!.y);
    expect(p[2]!.y).toBe(c.puntos[2]!.y);
  });

  it("una lectura que no cabe ni en el margen se ancla en el borde y se marca, no desaparece", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(8), value: 4.5 }, { occurredAt: t(12), value: 55 }, { occurredAt: t(16), value: -40 }],
      objetivos: [BANDA], ancho: 480, alto: 200,
    });
    const m = margenVertical(200);
    const p = colocarPuntos(c);
    expect(p).toHaveLength(3);
    // La y real de la curva está MUY fuera: la prueba no vale si el caso no es extremo.
    expect(c.puntos[1]!.y).toBeLessThan(-m * 10);
    expect(Number.isFinite(p[1]!.y) && Number.isFinite(p[2]!.y)).toBe(true);
    expect(p[1]).toMatchObject({ fuera: "arriba", y: -m, fueraDeBanda: true });
    expect(p[2]).toMatchObject({ fuera: "abajo", y: 200 + m, fueraDeBanda: true });
    expect(p[0]).toMatchObject({ fuera: null, fueraDeBanda: false });
  });

  it("sin banda no se juzga ninguna lectura: fueraDeBanda es null, no false", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(8), value: 4.5 }, { occurredAt: t(12), value: 9 }],
      objetivos: [], ancho: 480, alto: 200,
    });
    expect(c.banda.tipo).toBe("sin_objetivo_declarado");
    const p = colocarPuntos(c);
    expect(p).toHaveLength(2);
    // `false` diría «dentro de la banda» de una banda que no existe.
    expect(p.map((x) => x.fueraDeBanda)).toEqual([null, null]);
  });

  it("con la receta al revés (min > max) no hay banda que juzgar: ninguna lectura se marca dentro ni fuera", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(8), value: 4.5 }, { occurredAt: t(12), value: 6 }],
      objetivos: [{ momento: "during", minValue: 5.0, maxValue: 4.0, targetValue: null }], ancho: 480, alto: 200,
    });
    expect(c.banda.tipo).toBe("banda_al_reves"); // control: es ESTE caso, no «sin objetivo»
    const p = colocarPuntos(c);
    expect(p).toHaveLength(2);
    // `null`, no `false`/`true`: con la banda espejada «dentro» y «fuera» no significan nada.
    expect(p.map((x) => x.fueraDeBanda)).toEqual([null, null]);
  });
});

describe("leerCurvaPedida", () => {
  it("lee el lote y la variable", () => {
    expect(leerCurvaPedida({ lote: ID, variable: "brix" })).toEqual({ lotId: ID, variable: "brix" });
  });

  it("sin lote no hay curva", () => {
    expect(leerCurvaPedida({})).toBeNull();
    expect(leerCurvaPedida({ variable: "ph" })).toBeNull();
  });

  it("un lote que no es uuid no llega a la base: Postgres lo rechazaría con un error", () => {
    expect(leerCurvaPedida({ lote: "no-soy-un-uuid" })).toBeNull();
    expect(leerCurvaPedida({ lote: `${ID}'; drop table lot;--` })).toBeNull();
  });

  it("un parámetro repetido llega como arreglo y se ignora, no se adivina", () => {
    expect(leerCurvaPedida({ lote: [ID, ID] })).toBeNull();
  });

  it("una variable desconocida cae en pH, y una conocida se respeta", () => {
    expect(leerCurvaPedida({ lote: ID, variable: "temperatura" })?.variable).toBe("ph");
    expect(leerCurvaPedida({ lote: ID, variable: ["brix", "ph"] })?.variable).toBe("ph");
    // Control: no es que siempre devuelva pH.
    expect(leerCurvaPedida({ lote: ID, variable: "moisture" })?.variable).toBe("moisture");
  });
});

describe("juicioDeBanda: qué se puede afirmar", () => {
  const lec = (...v: number[]) => v.map((value, i) => ({ occurredAt: t(8 + i), value }));
  // Toma UN objetivo y lo envuelve: estas pruebas hablan de un solo objetivo cada una, y la lista
  // la ejercita `elegirObjetivo` en `curva-de-lote.test.ts`. `null` = la receta no declara nada.
  const juzgar = (lecturas: ReturnType<typeof lec>, objetivo: ObjetivoDeCurva | null) => {
    const c = curvaDeLote({ lecturas, objetivos: objetivo === null ? [] : [objetivo], ancho: 480, alto: 200 });
    return juicioDeBanda(c, colocarPuntos(c));
  };

  it("con banda y lecturas, cuenta las de fuera (y 0 sí es un resultado)", () => {
    expect(juzgar(lec(4.3, 5.1, 3.9), BANDA)).toEqual({ tipo: "juzgada", alcance: "trayectoria", fuera: 2, total: 3 });
    expect(juzgar(lec(4.2, 4.4), BANDA)).toEqual({ tipo: "juzgada", alcance: "trayectoria", fuera: 0, total: 2 });
  });

  it("con banda y CERO lecturas no hay juicio: un cero no es «todas dentro»", () => {
    expect(juzgar([], BANDA)).toEqual({ tipo: "sin_lecturas" });
  });

  it("con la banda de ancho cero no hay juicio, aunque la lectura sea 9,9 contra 4,5", () => {
    const c = curvaDeLote({
      lecturas: lec(4.5, 9.9), objetivos: [{ momento: "during", minValue: 4.5, maxValue: 4.5, targetValue: 4.5 }], ancho: 480, alto: 200,
    });
    // Control: la geometría YA NO es la que engañaba (todo a media altura): 4,5 abajo y 9,9 arriba, contra
    // sus datos. Por eso el juicio no puede venir de la `y` —aquí 9,9 estaría «arriba» del todo— sino del tipo de banda.
    expect(c.puntos.map((p) => p.y)).toEqual([200, 0]);
    expect(juicioDeBanda(c, colocarPuntos(c))).toEqual({ tipo: "banda_de_ancho_cero" });
    // Y colocarPuntos tampoco dice `false` («dentro»): `null`.
    expect(colocarPuntos(c).map((p) => p.fueraDeBanda)).toEqual([null, null]);
  });

  it("una banda al revés NO es de ancho cero y NO se juzga: se niega, con lecturas y sin ellas (hallazgo 2)", () => {
    const alReves = { momento: "during", minValue: 5.0, maxValue: 4.0, targetValue: null } as const;
    expect(juzgar(lec(4.5, 6), alReves)).toEqual({ tipo: "banda_al_reves" });
    expect(juzgar([], alReves)).toEqual({ tipo: "banda_al_reves" });
    // Control: la MISMA receta bien puesta (4,0–5,0) con las MISMAS lecturas sí se juzga. Sin esta
    // fila, «banda_al_reves» podría salir siempre y las dos de arriba también pasarían.
    expect(juzgar(lec(4.5, 6), { momento: "during", minValue: 4.0, maxValue: 5.0, targetValue: null })).toEqual({
      tipo: "juzgada", alcance: "trayectoria", fuera: 1, total: 2,
    });
  });

  it("sin banda, ni con lecturas ni sin ellas, no se juzga", () => {
    expect(juzgar(lec(4.5, 9), null)).toEqual({ tipo: "sin_banda" });
    expect(juzgar([], null)).toEqual({ tipo: "sin_banda" });
  });
});

/**
 * **El guardia de `PENDING_IMPLEMENTATIONS/017`: un objetivo de un solo momento juzga UNA lectura.**
 *
 * El caso que lo motivó es el de la ficha, con números: una fermentación cuyo pH baja de 6,5 a 4,3
 * **por diseño**, y una receta que declara sólo la meta FINAL (4,0–4,6). Antes la pantalla contaba
 * «2 lecturas fuera del rango de la receta» sobre un lote que va exactamente como debe.
 *
 * **Cada caso lleva su control, y el control TIENE que salir distinto.** Las mismas tres lecturas
 * con un objetivo `during` sí se juzgan las tres: si las dos cifras coincidieran, esta prueba no
 * mediría nada — que es la forma en la que un control deja de serlo.
 */
describe("juicioDeBanda — el momento del objetivo decide a cuántas lecturas alcanza", () => {
  const BAJANDO = [
    { occurredAt: t(8), value: 6.5 },
    { occurredAt: t(12), value: 5.0 },
    { occurredAt: t(16), value: 4.3 },
  ];
  const META = { minValue: 4.0, maxValue: 4.6, targetValue: 4.3 } as const;
  const juzgar = (momento: "initial" | "during" | "final", lecturas = BAJANDO) => {
    const c = curvaDeLote({ lecturas, objetivos: [{ momento, ...META }], ancho: 480, alto: 200 });
    return { juicio: juicioDeBanda(c, colocarPuntos(c)), marcas: colocarPuntos(c).map((p) => p.fueraDeBanda) };
  };

  it("con meta FINAL sólo se juzga la última, y cumple: cero fuera de UNA juzgada", () => {
    expect(juzgar("final").juicio).toEqual({ tipo: "juzgada", alcance: "al_final", fuera: 0, total: 1 });
    // Las intermedias no se juzgan: `null`, no `false`. `false` diría «dentro» de una banda que no las mira.
    expect(juzgar("final").marcas).toEqual([null, null, false]);
  });

  it("CONTROL: las MISMAS lecturas con meta `during` sí dan dos fuera de tres", () => {
    expect(juzgar("during").juicio).toEqual({ tipo: "juzgada", alcance: "trayectoria", fuera: 2, total: 3 });
    expect(juzgar("during").marcas).toEqual([true, true, false]);
  });

  it("con meta INICIAL sólo se juzga la primera —el caso de lavado y natural—, y ésa sí se salió", () => {
    expect(juzgar("initial").juicio).toEqual({ tipo: "juzgada", alcance: "al_inicio", fuera: 1, total: 1 });
    expect(juzgar("initial").marcas).toEqual([true, null, null]);
  });

  it("una ÚLTIMA lectura fuera de la meta final SÍ se marca: no juzgar a las intermedias no es callar", () => {
    // El control que pide la ficha de 017. Sin él, «0 fuera» podría salir siempre y las pruebas de
    // arriba pasarían con una implementación que no juzga nada.
    const noLlega = [
      { occurredAt: t(8), value: 6.5 },
      { occurredAt: t(12), value: 5.0 },
      { occurredAt: t(16), value: 4.9 }, // por encima del máximo 4,6
    ];
    expect(juzgar("final", noLlega).juicio).toEqual({ tipo: "juzgada", alcance: "al_final", fuera: 1, total: 1 });
    expect(juzgar("final", noLlega).marcas).toEqual([null, null, true]);
  });

  it("una sola lectura contra una meta inicial se juzga entera: una lectura, una juzgada", () => {
    const una = [{ occurredAt: t(8), value: 4.3 }];
    expect(juzgar("initial", una).juicio).toEqual({ tipo: "juzgada", alcance: "al_inicio", fuera: 0, total: 1 });
  });

  it("un empate en el extremo no se juzga, y lo dice: no se inventa cuál era la última", () => {
    const empatadas = [
      { occurredAt: t(8), value: 6.5 },
      { occurredAt: t(16), value: 4.3 },
      { occurredAt: t(16), value: 9.9 },
    ];
    expect(juzgar("final", empatadas).juicio).toEqual({ tipo: "extremo_ambiguo", alcance: "al_final" });
    expect(juzgar("final", empatadas).marcas).toEqual([null, null, null]);
    // Control doble: con `initial` el mínimo de ESE MISMO conjunto no está empatado, así que sí se juzga;
    // y con `during` también. Sin estas dos filas, «extremo_ambiguo» podría salir siempre.
    expect(juzgar("initial", empatadas).juicio).toEqual({ tipo: "juzgada", alcance: "al_inicio", fuera: 1, total: 1 });
    // 6,5 y 9,9 se salen; 4,3 cae dentro de [4,0 – 4,6]. Los tres números a mano, para que un
    // error de banda se vea en vez de esconderse en un total.
    expect(juzgar("during", empatadas).juicio).toEqual({ tipo: "juzgada", alcance: "trayectoria", fuera: 2, total: 3 });
  });

  it("sin lecturas no hay juicio en ningún momento: un cero no es «cumple»", () => {
    for (const m of ["initial", "during", "final"] as const) {
      expect(juzgar(m, []).juicio).toEqual({ tipo: "sin_lecturas" });
    }
  });
});
