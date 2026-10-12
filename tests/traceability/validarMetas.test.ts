/**
 * Las reglas de una meta, sin base — Parte 2a, tarea 14 (2026-10-04, Parte E).
 *
 * `validateTargets` (`lib/traceability/processTargets.ts`) es donde viven las reglas de cualquier meta —la de una versión y la de un paso—, y hasta esta tarea sólo se
 * probaban a través de `createRecipeWithVersion` (`recipeAuthoring.test.ts`), que se borró con ella. Esta prueba las llama de frente: la ve `scripts/ci.sh` (es
 * hermética: no toca la base), y cada rechazo lleva al lado el caso válido que pasa, para que no pase vacío. Las reglas de una meta DE PASO (`paso_de_otra_version`,
 * la clave por paso, `NaN`) las prueba `tests/recetas/pasos.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { MAX_HORAS } from "../../lib/recetas/vocabulario";
import { ProcessTargetError, validateTargets } from "../../lib/traceability/processTargets";

type Meta = Parameters<typeof validateTargets>[0][number];

/** Una meta válida: el pH final de la fermentación. */
const PH: Meta = { variable: "ph", moment: "final", phase: "fermentation", unit: "pH", targetValue: 3.8 };
const meta = (cambio: Partial<Meta> = {}): Meta => ({ ...PH, ...cambio });

/** El código de `ProcessTargetError` con que rechaza, o `null` si acepta. Cualquier otro error se relanza. */
function codigo(metas: Meta[]): string | null {
  try {
    validateTargets(metas);
    return null;
  } catch (error) {
    if (error instanceof ProcessTargetError) return error.message;
    throw error;
  }
}

describe("validateTargets — las reglas de una meta", () => {
  it("control: una meta válida pasa, también en los extremos físicos de su variable", () => {
    expect(codigo([meta()])).toBeNull();
    expect(codigo([meta({ targetValue: 0 })])).toBeNull();
    expect(codigo([meta({ targetValue: 14 })])).toBeNull();
  });

  it("una meta sin ningún número es una instrucción de medir, no un objetivo; con un solo extremo ya tiene número", () => {
    expect(codigo([meta({ targetValue: undefined })])).toBe("target_needs_a_number");
    expect(codigo([meta({ targetValue: undefined, minValue: 3.5 })])).toBeNull();
  });

  it("un rango invertido se rechaza; el mismo, al derecho, pasa", () => {
    const rango = (minValue: number, maxValue: number) => meta({ targetValue: undefined, moment: "during", minValue, maxValue });
    expect(codigo([rango(5, 4)])).toBe("range_inverted");
    expect(codigo([rango(4, 5)])).toBeNull();
  });

  it("una variable que no está en el registro, o una unidad que no es la suya, se rechaza: una meta de pH no se guarda en Brix", () => {
    expect(codigo([meta({ variable: "vibes", unit: "x" })])).toBe("unknown_variable");
    expect(codigo([meta({ unit: "Bx" })])).toBe("wrong_unit_for_variable");
    expect(codigo([meta({ variable: "brix", unit: "Bx", targetValue: 22 })])).toBeNull();
  });

  it("un valor fuera de los límites físicos de la variable se rechaza, por arriba y por abajo (un pH de 15 es un error de dedo, no una preferencia)", () => {
    expect(codigo([meta({ targetValue: 15 })])).toBe("target_out_of_physical_range");
    expect(codigo([meta({ targetValue: -1 })])).toBe("target_out_of_physical_range");
    expect(codigo([meta({ targetValue: undefined, moment: "during", minValue: 3, maxValue: 15 })])).toBe("target_out_of_physical_range");
    expect(codigo([meta({ targetValue: 14 })])).toBeNull();
  });

  it("el ritmo de medición sólo tiene sentido mientras algo dura (`during`) y es un entero de horas mayor que cero", () => {
    expect(codigo([meta({ moment: "final", everyHours: 6 })])).toBe("cadence_only_while_running");
    expect(codigo([meta({ moment: "initial", everyHours: 6 })])).toBe("cadence_only_while_running");
    for (const malo of [0, -3, 1.5]) {
      expect(codigo([meta({ moment: "during", everyHours: malo })]), `con ${malo} h`).toBe("cadence_must_be_positive_hours");
    }
    expect(codigo([meta({ moment: "during", everyHours: 6 })])).toBeNull();
  });

  it("el ritmo tiene tope: MAX_HORAS pasa y una hora más se rechaza con el mismo código, también un entero que la columna INTEGER no guarda (F1-11)", () => {
    expect(MAX_HORAS, "control: el tope de la receta").toBe(100000);
    expect(codigo([meta({ moment: "during", everyHours: MAX_HORAS })])).toBeNull();
    for (const malo of [MAX_HORAS + 1, 2 ** 31, Number.MAX_SAFE_INTEGER]) {
      expect(codigo([meta({ moment: "during", everyHours: malo })]), `con ${malo} h`).toBe("cadence_must_be_positive_hours");
    }
    // Control: el extremo de abajo sigue siendo 1.
    expect(codigo([meta({ moment: "during", everyHours: 1 })])).toBeNull();
    expect(codigo([meta({ moment: "during", everyHours: 0 })])).toBe("cadence_must_be_positive_hours");
  });

  it("la misma variable y el mismo momento dos veces se rechazan; en otra fase no es un duplicado (son dos cosas distintas)", () => {
    expect(codigo([meta(), meta()])).toBe("duplicate_variable_and_moment");
    const humedad = (phase: "fermentation" | "drying") =>
      meta({ variable: "moisture", unit: "%", targetValue: 11, phase });
    expect(codigo([humedad("fermentation"), humedad("drying")])).toBeNull();
  });

  it("una meta de la versión sin fase se rechaza, como desde el 2026-09-27; con su fase, pasa", () => {
    expect(codigo([meta({ phase: undefined })])).toBe("phase_required");
    expect(codigo([meta({ phase: "drying", variable: "moisture", unit: "%", targetValue: 11 })])).toBeNull();
  });
});
