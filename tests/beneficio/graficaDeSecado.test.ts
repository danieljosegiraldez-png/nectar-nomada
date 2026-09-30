import { describe, expect, it } from "vitest";
import { caminoDe, escalasDe, LIENZO, type PuntoEnElTiempo } from "../../lib/beneficio/graficaDeSecado";

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
    const dos = { ...base, humedadRelativa: [p("2026-09-01T00:00:00Z", 60), p("2026-09-03T00:00:00Z", 55)] };
    const e = escalasDe(dos);
    const d = caminoDe(dos.humedadRelativa, e);
    expect(d).not.toBeNull();
    expect(d!.startsWith("M ")).toBe(true);
    expect(d).toContain("L ");

    // Un punto no es una línea: dibujarlo daría un camino de un solo `M`, invisible y engañoso.
    expect(caminoDe([p("2026-09-01T00:00:00Z", 60)], e)).toBeNull();
  });

  it("descarta los valores que no son números en vez de escribir NaN en el SVG", () => {
    const datos = { ...base, humedadRelativa: [p("2026-09-01T00:00:00Z", 60), p("2026-09-03T00:00:00Z", 55)] };
    const e = escalasDe(datos);
    const conBasura = [...datos.humedadRelativa, p("2026-09-04T00:00:00Z", Number.NaN)];
    const d = caminoDe(conBasura, e);
    expect(d, "un NaN en el atributo `d` hace que el navegador tire la línea entera").not.toContain("NaN");
  });

  it("sin escala no devuelve camino", () => {
    const t = T("2026-09-01T00:00:00Z");
    const sinEje = escalasDe({ ...base, desde: t, hasta: t });
    expect(caminoDe([p("2026-09-01T00:00:00Z", 1), p("2026-09-01T00:00:00Z", 2)], sinEje)).toBeNull();
  });
});
