import { describe, expect, it } from "vitest";
import { caminoDe, escalaDeAmbiente, escalasDe, LIENZO, type PuntoEnElTiempo } from "../../lib/beneficio/graficaDeSecado";

/**
 * La escala de la gráfica, probada sin base ni navegador.
 *
 * **Lo que se prueba es lo que rompe una gráfica de verdad:** ningún dato, un solo punto, todos
 * los valores iguales. Los tres producen una división por cero, y una división por cero en una
 * escala **no falla en rojo**: sale `Infinity` o `NaN`, la coordenada se va del lienzo y la línea
 * se pinta pegada al borde como si fuera un dato. Nadie lo nota hasta que alguien mide contra la
 * pantalla.
 */
const T = (s: string) => new Date(s);
const p = (s: string, valor: number): PuntoEnElTiempo => ({ cuando: T(s), valor });

const base = {
  humedad: [] as PuntoEnElTiempo[],
  humedadRelativa: [] as PuntoEnElTiempo[],
  rango: null,
  desde: T("2026-09-01T00:00:00Z"),
  hasta: T("2026-09-05T00:00:00Z"),
};

describe("la escala de la gráfica de secado", () => {
  it("sitúa el principio y el final dentro del lienzo, y el medio en el medio", () => {
    const e = escalasDe({ ...base, humedad: [p("2026-09-01T00:00:00Z", 10), p("2026-09-05T00:00:00Z", 20)] });
    expect(e.x).not.toBeNull();
    expect(e.x!(T("2026-09-01T00:00:00Z"))).toBeCloseTo(LIENZO.margen.izq, 1);
    expect(e.x!(T("2026-09-05T00:00:00Z"))).toBeCloseTo(LIENZO.ancho - LIENZO.margen.der, 1);
    const medio = e.x!(T("2026-09-03T00:00:00Z"));
    expect(medio).toBeGreaterThan(LIENZO.margen.izq);
    expect(medio).toBeLessThan(LIENZO.ancho - LIENZO.margen.der);
  });

  it("un valor más alto queda MÁS ARRIBA, que en SVG es una Y menor", () => {
    const e = escalasDe({ ...base, humedad: [p("2026-09-01T00:00:00Z", 10), p("2026-09-02T00:00:00Z", 20)] });
    expect(e.y!(20)).toBeLessThan(e.y!(10));
  });

  it("sin ningún dato no inventa una escala: devuelve null en vez de NaN", () => {
    const e = escalasDe(base);
    expect(e.y, "sin valores no hay escala vertical").toBeNull();
    // El eje X sí existe: la ventana de tiempo la da la corrida, no los datos.
    expect(e.x).not.toBeNull();
  });

  it("un instante sin duración no da escala horizontal", () => {
    const t = T("2026-09-01T00:00:00Z");
    const e = escalasDe({ ...base, desde: t, hasta: t, humedad: [p("2026-09-01T00:00:00Z", 10)] });
    expect(e.x, "desde == hasta: dividir daría Infinity").toBeNull();
  });

  /**
   * El caso que más engaña: UN punto, o varios todos iguales. `max - min` es 0 y la división
   * silenciosa devuelve `Infinity`. Aquí se exige que el resultado sea un número real y quede
   * DENTRO del lienzo — no basta con que «no lance».
   */
  it("un solo valor no se sale del lienzo ni devuelve NaN", () => {
    const e = escalasDe({ ...base, humedad: [p("2026-09-02T00:00:00Z", 14.8)] });
    const y = e.y!(14.8);
    expect(Number.isFinite(y), "Infinity o NaN se pintarían pegados al borde").toBe(true);
    expect(y).toBeGreaterThanOrEqual(LIENZO.margen.arriba);
    expect(y).toBeLessThanOrEqual(LIENZO.alto - LIENZO.margen.abajo);
  });

  it("todos los valores iguales tampoco rompen la escala", () => {
    const e = escalasDe({
      ...base,
      humedad: [p("2026-09-01T00:00:00Z", 12), p("2026-09-03T00:00:00Z", 12), p("2026-09-04T00:00:00Z", 12)],
    });
    for (const v of [12]) expect(Number.isFinite(e.y!(v))).toBe(true);
  });

  it("el rango de la receta entra en la escala aunque no haya lecturas dentro", () => {
    const e = escalasDe({ ...base, humedad: [p("2026-09-02T00:00:00Z", 18)], rango: { min: 10, max: 12 } });
    // Si el rango no contara, la banda se saldría por abajo y se vería como un borde.
    expect(e.minY).toBeLessThanOrEqual(10);
    expect(e.maxY).toBeGreaterThanOrEqual(18);
  });
});

describe("el camino de una línea", () => {
  it("dibuja con dos puntos o más, y NO con uno", () => {
    const dos = { ...base, humedad: [p("2026-09-01T00:00:00Z", 22), p("2026-09-03T00:00:00Z", 15)] };
    const e = escalasDe(dos);
    const d = caminoDe(dos.humedad, e);
    expect(d).not.toBeNull();
    expect(d!.startsWith("M ")).toBe(true);
    expect(d).toContain("L ");

    // Un punto no es una línea: dibujarlo daría un camino de un solo `M`, invisible y engañoso.
    expect(caminoDe([p("2026-09-01T00:00:00Z", 22)], e)).toBeNull();
  });

  it("descarta los valores que no son números en vez de escribir NaN en el SVG", () => {
    const datos = { ...base, humedad: [p("2026-09-01T00:00:00Z", 22), p("2026-09-03T00:00:00Z", 15)] };
    const e = escalasDe(datos);
    const conBasura = [...datos.humedad, p("2026-09-04T00:00:00Z", Number.NaN)];
    const d = caminoDe(conBasura, e);
    expect(d, "un NaN en el atributo `d` hace que el navegador tire la línea entera").not.toContain("NaN");
  });

  it("sin escala no devuelve camino", () => {
    const t = T("2026-09-01T00:00:00Z");
    const sinEje = escalasDe({ ...base, desde: t, hasta: t });
    expect(caminoDe([p("2026-09-01T00:00:00Z", 1), p("2026-09-01T00:00:00Z", 2)], sinEje)).toBeNull();
  });
});

/**
 * **El guardia de esta pieza, y sale de un defecto medido, no de una simetría.**
 *
 * La humedad relativa del cuarto se mide en `%` igual que la del grano, así que la primera versión
 * las puso en el mismo eje. Renderizando el SVG de verdad se vio lo que costaba: con la HR dentro
 * (55–78 %) la curva del grano (12–42 %) usaba **96 px de 220 — el 44 %**; fuera, **204 — el 93 %**.
 *
 * Por eso las dos aserciones no son una sola: la primera dice que la HR no entra, y **la segunda
 * dice cuánto del lienzo queda para el grano**. Sin la segunda, meter la HR de vuelta con un rango
 * que quepa dentro del del grano pasaría el guardia sin que nadie notara el aplastamiento.
 */
describe("el eje del grano es del grano", () => {
  const conAmbiente = {
    ...base,
    humedad: [p("2026-09-01T00:00:00Z", 42), p("2026-09-04T00:00:00Z", 12)],
    humedadRelativa: [p("2026-09-01T00:00:00Z", 78), p("2026-09-04T00:00:00Z", 55)],
  };

  it("la humedad del CUARTO no estira el eje de la humedad del GRANO", () => {
    const e = escalasDe(conAmbiente);
    expect(e.maxY, "un 78 % de aire en el eje del grano lo estira hasta 78").toBe(42);
    expect(e.minY).toBe(12);
  });

  it("y por eso la curva del grano usa casi todo el alto del lienzo", () => {
    const e = escalasDe(conAmbiente);
    const util = LIENZO.alto - LIENZO.margen.arriba - LIENZO.margen.abajo;
    const usado = Math.abs(e.y!(12) - e.y!(42));
    expect(usado / util, `con el aire dentro esto cae al 44 %; usado=${usado} de ${util}`).toBeGreaterThan(0.9);
  });
});

describe("la escala propia de una serie de ambiente", () => {
  const serie = [p("2026-09-01T00:00:00Z", 78), p("2026-09-04T00:00:00Z", 55)];

  it("se estira sobre SUS propios extremos, no sobre los del grano", () => {
    const base2 = escalasDe({ ...base, humedad: [p("2026-09-01T00:00:00Z", 42), p("2026-09-04T00:00:00Z", 12)] });
    const a = escalaDeAmbiente(serie, base2);
    expect(a.minY).toBe(55);
    expect(a.maxY).toBe(78);
    // Y cae DENTRO del lienzo: con la escala del grano, un 78 se saldría por arriba.
    expect(a.y!(78)).toBeCloseTo(LIENZO.margen.arriba, 1);
    expect(a.y!(55)).toBeCloseTo(LIENZO.alto - LIENZO.margen.abajo, 1);
    expect(base2.y!(78), "control: contra el eje del grano el mismo 78 queda FUERA, por arriba")
      .toBeLessThan(LIENZO.margen.arriba);
  });

  it("conserva el eje de tiempo de la gráfica: es el mismo secado", () => {
    const base2 = escalasDe({ ...base, humedad: [p("2026-09-01T00:00:00Z", 20)] });
    const a = escalaDeAmbiente(serie, base2);
    expect(a.x!(T("2026-09-01T00:00:00Z"))).toBeCloseTo(base2.x!(T("2026-09-01T00:00:00Z")), 5);
  });

  it("sin lecturas no inventa escala, y una sola no se sale del lienzo", () => {
    const base2 = escalasDe({ ...base, humedad: [p("2026-09-01T00:00:00Z", 20)] });
    expect(escalaDeAmbiente([], base2).y).toBeNull();
    const una = escalaDeAmbiente([p("2026-09-02T00:00:00Z", 61)], base2);
    expect(Number.isFinite(una.y!(61)), "un rango de cero daría Infinity").toBe(true);
    expect(una.y!(61)).toBeGreaterThanOrEqual(LIENZO.margen.arriba);
    expect(una.y!(61)).toBeLessThanOrEqual(LIENZO.alto - LIENZO.margen.abajo);
  });
});
