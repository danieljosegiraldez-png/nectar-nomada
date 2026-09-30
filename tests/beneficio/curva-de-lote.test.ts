/**
 * La curva de un lote contra su banda: la banda sale de un dato, la Y crece hacia abajo, y una
 * sola lectura no produce `NaN`.
 *
 * Los números están hechos a mano para que un error de escala se vea. `NaN` comparado con lo que
 * sea da `false`, así que las pruebas de degenerados afirman sobre `Number.isNaN` ANTES de
 * comparar, y luego sobre el valor exacto.
 *
 * Hermética: sin base, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { describe, expect, it } from "vitest";
import { curvaDeLote } from "../../lib/beneficio/curvaDeLote";

const t = (h: number) => new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00.000Z`);
const BANDA = { minValue: 4.0, maxValue: 5.0, targetValue: 4.5 };

describe("curvaDeLote", () => {
  it("sin ProcessTarget no hay banda, y lo dice", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }, { occurredAt: t(14), value: 4.2 }],
      objetivo: null, ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "sin_objetivo_declarado" });
    // Control: los puntos SÍ se dibujan. Sin él, «sin banda» podría ser «no dibujé nada».
    expect(c.puntos).toHaveLength(2);
  });

  it("un objetivo sin min ni max no dibuja banda: media banda es una banda inventada", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }],
      objetivo: { minValue: null, maxValue: null, targetValue: 4.5 },
      ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "sin_objetivo_declarado" });
  });

  it("con sólo uno de los dos extremos tampoco hay banda", () => {
    const soloMin = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }],
      objetivo: { minValue: 4.0, maxValue: null, targetValue: 4.5 }, ancho: 300, alto: 120,
    });
    const soloMax = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }],
      objetivo: { minValue: null, maxValue: 5.0, targetValue: 4.5 }, ancho: 300, alto: 120,
    });
    expect(soloMin.banda).toEqual({ tipo: "sin_objetivo_declarado" });
    expect(soloMax.banda).toEqual({ tipo: "sin_objetivo_declarado" });
  });

  it("escala el tiempo al ancho y el valor al alto, con el eje Y al derecho", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 5.0 }, { occurredAt: t(14), value: 4.0 }],
      objetivo: BANDA, ancho: 300, alto: 120,
    });
    expect(c.puntos[0]).toEqual({ x: 0, y: 0 });     // la primera lectura, valor máximo → arriba
    expect(c.puntos[1]).toEqual({ x: 300, y: 120 }); // la última, valor mínimo → abajo
    // El lienzo se devuelve tal cual: el `<svg>` los usa para su `viewBox`. Distintos a propósito.
    expect(c.ancho).toBe(300);
    expect(c.alto).toBe(120);
    // En SVG la Y crece hacia ABAJO. Si esta prueba no existiera, la curva saldría del revés
    // y seguiría pareciendo una curva.
  });

  it("un valor a mitad de la banda y de la hora cae en el centro, y las tres escalas son lineales", () => {
    const c = curvaDeLote({
      lecturas: [
        { occurredAt: t(10), value: 4.75 },
        { occurredAt: t(11), value: 4.5 },  // 1 h de 4: x = 75
        { occurredAt: t(14), value: 4.0 },
      ],
      objetivo: BANDA, ancho: 300, alto: 120,
    });
    expect(c.puntos[0]).toEqual({ x: 0, y: 30 });   // 4,75 → un cuarto desde arriba
    expect(c.puntos[1]).toEqual({ x: 75, y: 60 });  // la hora 11 NO es la mitad del tiempo
    expect(c.puntos[2]).toEqual({ x: 300, y: 120 });
  });

  it("la banda y el objetivo salen en coordenadas de valor: máximo arriba, mínimo abajo", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(14), value: 4.5 }],
      objetivo: { minValue: 4.0, maxValue: 5.0, targetValue: 4.25 }, ancho: 300, alto: 120,
    });
    // El objetivo 4,25 está a un cuarto del mínimo: 120 - 30 = 90.
    expect(c.banda).toEqual({ tipo: "banda", yMin: 120, yMax: 0, yObjetivo: 90 });
  });

  it("una banda sin targetValue no inventa objetivo", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }],
      objetivo: { minValue: 4.0, maxValue: 5.0, targetValue: null }, ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "banda", yMin: 120, yMax: 0, yObjetivo: null });
  });

  it("el orden de llegada de las lecturas no cambia la curva", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(14), value: 4.0 }, { occurredAt: t(10), value: 5.0 }],
      objetivo: BANDA, ancho: 300, alto: 120,
    });
    expect(c.puntos).toEqual([{ x: 0, y: 0 }, { x: 300, y: 120 }]);
  });

  it("una lectura fuera de la banda queda fuera del lienzo, sin recortar", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 5.5 }, { occurredAt: t(14), value: 3.5 }],
      objetivo: BANDA, ancho: 300, alto: 120,
    });
    expect(c.puntos[0]).toEqual({ x: 0, y: -60 });
    expect(c.puntos[1]).toEqual({ x: 300, y: 180 });
  });

  it("sin banda, el eje Y escala al mínimo y máximo de los propios datos", () => {
    // Ni el mínimo (4,0) ni el máximo (5,0) son la primera ni la última lectura: si lo fueran,
    // una escala tomada del primer o del último valor daría lo mismo y la prueba no la vería.
    const c = curvaDeLote({
      lecturas: [
        { occurredAt: t(10), value: 4.5 },
        { occurredAt: t(12), value: 5.0 },  // máximo de los datos
        { occurredAt: t(13), value: 4.0 },  // mínimo de los datos
        { occurredAt: t(14), value: 4.25 },
      ],
      objetivo: null, ancho: 300, alto: 120,
    });
    expect(c.puntos).toEqual([
      { x: 0, y: 60 },
      { x: 150, y: 0 },    // máximo → arriba
      { x: 225, y: 120 },  // mínimo → abajo
      { x: 300, y: 90 },
    ]);
  });

  it("un cero es un valor legítimo de receta, no un hueco: la banda con minValue 0 se dibuja", () => {
    // Humedad o Brix pueden empezar en 0. Un `||` en vez de `??` leería ese 0 como «ausente» y
    // haría desaparecer la banda, que es justo la banda perdida que el diseño prohíbe.
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 6 }, { occurredAt: t(14), value: 0 }],
      objetivo: { minValue: 0, maxValue: 12, targetValue: 0 }, ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "banda", yMin: 120, yMax: 0, yObjetivo: 120 });
    expect(c.puntos).toEqual([{ x: 0, y: 60 }, { x: 300, y: 120 }]);
  });

  it("un maxValue 0 también es un valor: la banda de −4 a 0 se dibuja", () => {
    // El gemelo del cero de arriba, del otro extremo: sin él, un `||` sólo en `maxValue`
    // sobrevive, porque la prueba anterior tiene un máximo de 12.
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: -1 }, { occurredAt: t(14), value: -3 }],
      objetivo: { minValue: -4, maxValue: 0, targetValue: -2 }, ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "banda", yMin: 120, yMax: 0, yObjetivo: 60 });
    expect(c.puntos).toEqual([{ x: 0, y: 30 }, { x: 300, y: 90 }]);
  });

  it("una sola lectura no produce NaN", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }],
      objetivo: BANDA, ancho: 300, alto: 120,
    });
    // Afirmar que NO es NaN ANTES de comparar: `NaN > x` es false y halaga cualquier hipótesis.
    expect(Number.isNaN(c.puntos[0]!.x)).toBe(false);
    expect(Number.isNaN(c.puntos[0]!.y)).toBe(false);
    // Media anchura: no hay recorrido que lo ponga en un extremo. 4,5 es el centro de la banda.
    expect(c.puntos[0]).toEqual({ x: 150, y: 60 });
  });

  it("una sola lectura sin banda va a media altura, no a NaN ni a un extremo", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }],
      objetivo: null, ancho: 300, alto: 120,
    });
    expect(Number.isNaN(c.puntos[0]!.x)).toBe(false);
    expect(Number.isNaN(c.puntos[0]!.y)).toBe(false);
    expect(c.puntos[0]).toEqual({ x: 150, y: 60 });
  });

  it("todas las lecturas iguales, sin banda, van a media altura y se reparten en el tiempo", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }, { occurredAt: t(14), value: 4.8 }],
      objetivo: null, ancho: 300, alto: 120,
    });
    for (const p of c.puntos) {
      expect(Number.isNaN(p.x)).toBe(false);
      expect(Number.isNaN(p.y)).toBe(false);
    }
    expect(c.puntos).toEqual([{ x: 0, y: 60 }, { x: 300, y: 60 }]);
  });

  it("dos lecturas a la misma hora no dividen entre cero en la X", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 5.0 }, { occurredAt: t(10), value: 4.0 }],
      objetivo: BANDA, ancho: 300, alto: 120,
    });
    expect(c.puntos.map((p) => Number.isNaN(p.x))).toEqual([false, false]);
    expect(c.puntos).toEqual([{ x: 150, y: 0 }, { x: 150, y: 120 }]);
  });

  it("una banda de ancho cero (min = max) no produce NaN", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(14), value: 4.7 }],
      objetivo: { minValue: 4.5, maxValue: 4.5, targetValue: 4.5 }, ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "banda", yMin: 60, yMax: 60, yObjetivo: 60 });
    expect(c.puntos.map((p) => Number.isNaN(p.y))).toEqual([false, false]);
  });

  it("sin lecturas devuelve una curva vacía, no un error", () => {
    const c = curvaDeLote({ lecturas: [], objetivo: BANDA, ancho: 300, alto: 120 });
    expect(c.puntos).toEqual([]);
    expect(c.banda.tipo).toBe("banda");
    expect(c.ancho).toBe(300);
    expect(c.alto).toBe(120);
  });
});
