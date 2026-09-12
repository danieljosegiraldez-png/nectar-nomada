/**
 * El guardia de lo que la pantalla de medición decide mostrar.
 *
 * **Por qué importa que esto tenga prueba propia.** El formulario pregunta la
 * unidad SÓLO cuando hay más de una. Si esta función devolviera siempre una,
 * la unidad desaparecería de la temperatura y una lectura en Fahrenheit se
 * guardaría como Celsius — un error de 32 grados con aspecto de dato bueno. Y
 * si devolviera siempre varias, volvería el campo que Daniel pidió quitar.
 */
import { describe, it, expect } from "vitest";
import { unidadesAceptadas } from "../../lib/traceability/units";

describe("unidadesAceptadas", () => {
  it("las cinco variables del formulario que admiten UNA sola", () => {
    expect(unidadesAceptadas("ph")).toEqual(["pH"]);
    expect(unidadesAceptadas("brix")).toEqual(["Bx"]);
    expect(unidadesAceptadas("relative_humidity")).toEqual(["%"]);
    expect(unidadesAceptadas("moisture")).toEqual(["%"]);
    expect(unidadesAceptadas("water_activity")).toEqual(["aw"]);
  });

  /**
   * Control positivo: si todas devolvieran una, la prueba de arriba pasaría sin
   * demostrar nada. La temperatura TIENE que salir distinta.
   */
  it("la temperatura sí ofrece elección, y la canónica va primero", () => {
    const u = unidadesAceptadas("temperature");
    expect(u.length).toBeGreaterThan(1);
    expect(u[0]).toBe("C");
    expect(u).toContain("F");
  });

  it("la canónica va primero también donde hay cuatro", () => {
    const u = unidadesAceptadas("potassium");
    expect(u[0]).toBe("mg/kg");
    expect(u.length).toBe(4);
  });

  it("una variable desconocida devuelve vacío en vez de reventar la pantalla", () => {
    expect(unidadesAceptadas("no_existe")).toEqual([]);
    expect(unidadesAceptadas("")).toEqual([]);
  });

  it("no repite la canónica", () => {
    for (const v of ["temperature", "ph", "potassium", "moisture"]) {
      const u = unidadesAceptadas(v);
      expect(new Set(u).size, `${v} repite una unidad`).toBe(u.length);
    }
  });
});
