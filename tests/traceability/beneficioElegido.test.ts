/**
 * Qué beneficio mira una pantalla y cuándo hay que preguntar — la misma regla que las fincas
 * (Daniel, 2026-09-21). Hermética: `resolverBeneficio` no toca la base.
 */
import { describe, expect, it } from "vitest";
import { resolverBeneficio } from "../../lib/traceability/beneficioElegido";

const A = { id: "a", name: "Las Nubes" };
const B = { id: "b", name: "Cafelino" };

describe("elegir el beneficio", () => {
  it("con uno solo entra directo, sin preguntar, aunque la cookie diga otra cosa", () => {
    expect(resolverBeneficio([A], undefined)).toEqual({ elegido: A, debeElegir: false });
    expect(resolverBeneficio([A], "otro")).toEqual({ elegido: A, debeElegir: false });
  });

  it("con varios y ninguno elegido, pregunta", () => {
    expect(resolverBeneficio([A, B], undefined)).toEqual({ elegido: null, debeElegir: true });
  });

  it("con varios y una cookie de uno de los suyos, ése", () => {
    expect(resolverBeneficio([A, B], "b")).toEqual({ elegido: B, debeElegir: false });
  });

  it("una cookie que no es de los suyos no autoriza nada: se ignora y se pregunta", () => {
    expect(resolverBeneficio([A, B], "ajeno")).toEqual({ elegido: null, debeElegir: true });
  });

  it("sin ninguno, ni se elige ni se pregunta", () => {
    expect(resolverBeneficio([], "a")).toEqual({ elegido: null, debeElegir: false });
  });
});
