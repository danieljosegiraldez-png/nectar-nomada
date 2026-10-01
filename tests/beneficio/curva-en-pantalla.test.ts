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
import { curvaDeLote } from "../../lib/beneficio/curvaDeLote";
import {
  colocarPuntos,
  leerCurvaPedida,
  margenVertical,
} from "../../lib/beneficio/curvaEnPantalla";

const t = (h: number) => new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00.000Z`);
const BANDA = { minValue: 4.0, maxValue: 5.0, targetValue: 4.5 };
const ID = "3f2b6c1e-8a44-4d0e-9b57-0c1d2e3f4a5b";

describe("colocarPuntos", () => {
  it("una lectura fuera de la banda se marca, y una dentro no", () => {
    const c = curvaDeLote({
      lecturas: [
        { occurredAt: t(8), value: 4.5 }, // dentro
        { occurredAt: t(12), value: 5.1 }, // apenas por encima
        { occurredAt: t(16), value: 3.9 }, // apenas por debajo
      ],
      objetivo: BANDA, ancho: 480, alto: 200,
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
      objetivo: { minValue: 4.0, maxValue: 4.6, targetValue: 4.3 }, ancho: 480, alto: 200,
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
      objetivo: BANDA, ancho: 480, alto: 200,
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
      objetivo: null, ancho: 480, alto: 200,
    });
    expect(c.banda.tipo).toBe("sin_objetivo_declarado");
    const p = colocarPuntos(c);
    expect(p).toHaveLength(2);
    // `false` diría «dentro de la banda» de una banda que no existe.
    expect(p.map((x) => x.fueraDeBanda)).toEqual([null, null]);
  });

  it("con la receta al revés (min > max) también se juzga con los extremos ordenados", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(8), value: 4.5 }, { occurredAt: t(12), value: 6 }],
      objetivo: { minValue: 5.0, maxValue: 4.0, targetValue: null }, ancho: 480, alto: 200,
    });
    const p = colocarPuntos(c);
    expect(p).toHaveLength(2);
    expect(p[0]!.fueraDeBanda).toBe(false);
    expect(p[1]!.fueraDeBanda).toBe(true);
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
