/**
 * Las marcas de los ejes de la curva de un lote: el eje Y sale de la BANDA cuando la hay y de los
 * datos cuando no, y el eje X cuenta HORAS desde la primera lectura, no fechas.
 *
 * Los números están hechos a mano. `NaN` comparado con lo que sea da `false`, así que la prueba
 * de la lectura suelta afirma sobre `Number.isNaN`, nunca con una comparación.
 *
 * Hermética: sin base, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { describe, expect, it } from "vitest";
import { ejesDeLaCurva } from "../../lib/beneficio/ejesDeLaCurva";

const t = (h: number) => new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00Z`);

describe("ejesDeLaCurva", () => {
  it("con banda, el eje Y rotula sus extremos y el centro", () => {
    const e = ejesDeLaCurva({
      lecturas: [{ occurredAt: new Date("2026-03-10T10:00:00Z"), value: 4.3 }],
      banda: { min: 4.0, max: 4.6 }, ancho: 300, alto: 120,
    });
    expect(e.y).toEqual([
      { pos: 0, texto: "4.6" },
      { pos: 60, texto: "4.3" },
      { pos: 120, texto: "4.0" },
    ]);
  });

  it("sin banda, el eje Y rotula el mínimo y el máximo de los datos", () => {
    const e = ejesDeLaCurva({
      lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(14), value: 4.1 }],
      banda: null, ancho: 300, alto: 120,
    });
    expect(e.y[0]).toEqual({ pos: 0, texto: "4.5" });
    expect(e.y[e.y.length - 1]).toEqual({ pos: 120, texto: "4.1" });
  });

  it("el eje X rotula horas desde la primera lectura, no fechas", () => {
    const e = ejesDeLaCurva({
      lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(18), value: 4.1 }],
      banda: null, ancho: 300, alto: 120,
    });
    expect(e.x).toEqual([{ pos: 0, texto: "0 h" }, { pos: 300, texto: "8 h" }]);
  });

  it("una sola lectura no produce NaN ni un eje X de 0 h a 0 h", () => {
    const e = ejesDeLaCurva({
      lecturas: [{ occurredAt: new Date("2026-03-10T10:00:00Z"), value: 4.3 }],
      banda: null, ancho: 300, alto: 120,
    });
    expect(e.x).toHaveLength(1);
    expect(Number.isNaN(e.x[0]!.pos)).toBe(false);
    for (const m of e.y) expect(Number.isNaN(m.pos)).toBe(false);
    // Y los VALORES, no sólo que no sean NaN: `0` tampoco es NaN, y sin esto una marca en 0, o tres
    // marcas iguales, pasaban. La marca cae donde `curvaDeLote` pone ese punto: a media anchura y a
    // media altura (300 / 2 y 120 / 2), una sola por eje.
    expect(e.x).toEqual([{ pos: 150, texto: "0 h" }]);
    expect(e.y).toEqual([{ pos: 60, texto: "4.3" }]);
  });

  // Las cuatro de abajo no vienen del encargo: guardan decisiones que el módulo toma por su
  // cuenta para que sus números coincidan con los de `curvaDeLote`.

  it("una banda al revés o de ancho cero no escala el eje: la curva tampoco la usa", () => {
    const lecturas = [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(14), value: 4.1 }];
    for (const banda of [{ min: 4.6, max: 4.0 }, { min: 4.3, max: 4.3 }]) {
      const e = ejesDeLaCurva({ lecturas, banda, ancho: 300, alto: 120 });
      expect(e.y[0]).toEqual({ pos: 0, texto: "4.5" });
      expect(e.y[e.y.length - 1]).toEqual({ pos: 120, texto: "4.1" });
    }
  });

  it("las lecturas llegan en cualquier orden y el eje X cuenta igual", () => {
    const e = ejesDeLaCurva({
      lecturas: [{ occurredAt: t(18), value: 4.1 }, { occurredAt: t(10), value: 4.5 }],
      banda: null, ancho: 300, alto: 120,
    });
    expect(e.x).toEqual([{ pos: 0, texto: "0 h" }, { pos: 300, texto: "8 h" }]);
  });

  it("sin lecturas no hay marcas de datos, ni un Infinity rotulado", () => {
    const sinBanda = ejesDeLaCurva({ lecturas: [], banda: null, ancho: 300, alto: 120 });
    expect(sinBanda).toEqual({ x: [], y: [] });
    // Con banda el eje Y sigue diciendo a qué valor está: no depende de que haya lecturas.
    const conBanda = ejesDeLaCurva({ lecturas: [], banda: { min: 4.0, max: 4.6 }, ancho: 300, alto: 120 });
    expect(conBanda.x).toEqual([]);
    expect(conBanda.y.map((m) => m.texto)).toEqual(["4.6", "4.3", "4.0"]);
  });

  it("los extremos de la banda no se redondean a un decimal: 4.05 no se rotula 4.1", () => {
    const e = ejesDeLaCurva({
      lecturas: [{ occurredAt: t(10), value: 4.3 }],
      banda: { min: 4.05, max: 4.55 }, ancho: 300, alto: 120,
    });
    expect(e.y.map((m) => m.texto)).toEqual(["4.55", "4.3", "4.05"]);
  });
});
