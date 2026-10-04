/**
 * Qué frase pinta la ficha para cada estado de la densidad.
 *
 * **Pura y sin renderizar**, igual que `claveDeLaComparacion` y por el mismo motivo:
 * este repositorio no tiene infraestructura para renderizar componentes —cero
 * `.test.tsx`, ni `jsdom`, ni `testing-library`— y sus guardias de pantalla leen la
 * fuente. Lo que sí se puede probar aquí, y es lo que importa: que **cada estado tenga
 * su frase** y que **ninguno pase un número que no puede afirmar**.
 */
import { describe, expect, it } from "vitest";
import { claveDeLaDensidad } from "../../lib/traceability/densidadPorMarco";

describe("claveDeLaDensidad", () => {
  it("cada estado tiene SU clave, y todas son distintas", () => {
    const claves = [
      claveDeLaDensidad({ status: "sin_marco" }).clave,
      claveDeLaDensidad({ status: "sin_forma", disenada: 2222 }).clave,
      claveDeLaDensidad({
        status: "conteo_incompleto",
        disenada: 2222,
        celdas: 176,
        cohortesSinConteo: 2,
      }).clave,
      claveDeLaDensidad({
        status: "ok",
        disenada: 2222,
        celdas: 176,
        areaHectareas: 0.0792,
        real: 1894,
        plantasContadas: 150,
      }).clave,
    ];
    expect(new Set(claves).size, "dos estados con la misma frase son un estado perdido").toBe(4);
  });

  /** Sin los dos metros no hay NINGÚN número que pasar, ni la diseñada. */
  it("sin_marco no pasa ningún número", () => {
    expect(claveDeLaDensidad({ status: "sin_marco" }).params).toEqual({});
  });

  /**
   * **`sin_forma` pasa la diseñada y SÓLO la diseñada.** El marco la da sin necesitar la
   * forma; la real y el área sí la necesitan, y pasarlas aquí sería inventarlas.
   */
  it("sin_forma pasa la diseñada y nada más", () => {
    const r = claveDeLaDensidad({ status: "sin_forma", disenada: 2222 });
    expect(r.params).toEqual({ disenada: 2222 });
    expect(r.params, "la real necesita el área, que necesita la forma").not.toHaveProperty("real");
    expect(r.params).not.toHaveProperty("hectareas");
  });

  /**
   * **`conteo_incompleto` no pasa `real`, y es la mitad que importa.** Una densidad
   * calculada sobre un conteo incompleto es un número que parece cierto; si llegara a la
   * plantilla, un descuido de redacción lo pintaría.
   */
  it("conteo_incompleto dice cuántas faltan por contar y NO pasa la real", () => {
    const r = claveDeLaDensidad({
      status: "conteo_incompleto",
      disenada: 2222,
      celdas: 176,
      cohortesSinConteo: 2,
    });
    expect(r.params).toMatchObject({ disenada: 2222, sinContar: 2 });
    expect(r.params).not.toHaveProperty("real");
  });

  it("ok pasa las tres cifras: diseñada, real y hectáreas", () => {
    const r = claveDeLaDensidad({
      status: "ok",
      disenada: 2222,
      celdas: 176,
      areaHectareas: 0.0792,
      real: 1894.2,
      plantasContadas: 150,
    });
    expect(r.params).toMatchObject({ disenada: 2222, hectareas: 0.0792 });
    expect(r.params.real, "la real se redondea: 1894,2 plantas/ha no es una medición").toBe(1894);
  });

  /**
   * **El control de que la real se redondea y no se trunca.** 1894,6 es 1895, no 1894.
   * Un truncado sistemático sesga la cifra siempre hacia abajo.
   */
  it("la real se redondea, no se trunca", () => {
    const r = claveDeLaDensidad({
      status: "ok",
      disenada: 2222,
      celdas: 176,
      areaHectareas: 0.0792,
      real: 1894.6,
      plantasContadas: 150,
    });
    expect(r.params.real).toBe(1895);
  });
});
