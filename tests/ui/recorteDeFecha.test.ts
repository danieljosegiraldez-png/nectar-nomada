/**
 * El recorte de fecha por precisión, extraído para poder probarlo.
 *
 * El fallo que cubre: `PlantingCohortForm` recalculaba la fecha desde la
 * cohorte ORIGINAL al cambiar la precisión, así que descartaba en silencio lo
 * que el usuario acababa de escribir. Lo señaló una revisión independiente.
 */
import { describe, expect, it } from "vitest";
import { recortarPorPrecision } from "../../lib/time/recortarPorPrecision";

describe("recortarPorPrecision", () => {
  it("recorta al año, al mes o al día", () => {
    expect(recortarPorPrecision("2020-06-10", "year")).toBe("2020");
    expect(recortarPorPrecision("2020-06-10", "month")).toBe("2020-06");
    expect(recortarPorPrecision("2020-06-10", "date")).toBe("2020-06-10");
  });

  it("conserva lo ESCRITO al bajar de precisión, no lo original", () => {
    // El caso exacto del hallazgo: el usuario escribió 2020-06-10 y pasa a mes.
    // Debe quedar 2020-06, no la fecha de la que partía el formulario.
    expect(recortarPorPrecision("2020-06-10", "month")).toBe("2020-06");
  });

  it("subir de precisión no inventa un día ni un mes", () => {
    // De año a día: no hay día que poner, así que se completa con el primero y
    // el usuario lo ve y lo corrige. Lo que NO se hace es volver al original.
    expect(recortarPorPrecision("2020", "date")).toBe("2020-01-01");
    expect(recortarPorPrecision("2020", "month")).toBe("2020-01");
  });

  it("una cadena vacía se queda vacía", () => {
    expect(recortarPorPrecision("", "month")).toBe("");
  });
});
