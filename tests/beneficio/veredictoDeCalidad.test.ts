/**
 * El veredicto de la calidad pedida — spec de la recepción a los lotes §3.4, plan Tarea 2.
 * Hermética.
 */
import { describe, expect, it } from "vitest";
import { evaluarCalidad, type EntradaDelVeredicto } from "../../lib/beneficio/veredictoDeCalidad";

const base: EntradaDelVeredicto = {
  masas: { insumoKg: 100, aceptadoKg: 80, verdeKg: 10, flotesKg: 10, selecciones: 1 },
  limites: { minMaduroPct: 75, maxVerdePct: 12, maxFlotesPct: 12 },
  condiciones: [null],
  huboFlotacion: false,
  balanceDescuadrado: false,
};

describe("el veredicto", () => {
  it("80 aceptado, 10 verde y 10 flotes contra ≥ 75 / ≤ 12 / ≤ 12 cumple", () => {
    const v = evaluarCalidad(base);
    expect(v.juicio).toBe("CUMPLE");
    expect(v.motivo).toBeNull();
    expect(v.maduroPct).toBe(80);
  });

  it("con 20 de verde no cumple, y el motivo nombra el verde", () => {
    const v = evaluarCalidad({ ...base, masas: { ...base.masas, aceptadoKg: 70, verdeKg: 20 } });
    expect(v.juicio).toBe("NO_CUMPLE");
    expect(v.motivo).toMatch(/verde/);
  });

  it("el borde: 74,996 de 100 con mínimo 75 % NO cumple", () => {
    // Redondeando el porcentaje (75,00 %) cumpliría. Se compara en gramos enteros a propósito.
    const v = evaluarCalidad({ ...base, masas: { insumoKg: 100, aceptadoKg: 74.996, verdeKg: 0, flotesKg: 0, selecciones: 1 } });
    expect(v.maduroPct).toBe(75);
    expect(v.juicio).toBe("NO_CUMPLE");
  });

  it("sin pedido, no atribuible", () => {
    expect(evaluarCalidad({ ...base, limites: null }).juicio).toBe("NO_ATRIBUIBLE");
  });

  it("condiciones distintas: incomparable; iguales: juzga", () => {
    expect(evaluarCalidad({ ...base, condiciones: ["WET", "DRAINED"] }).juicio).toBe("INCOMPARABLE_WEIGHING_CONDITION");
    expect(evaluarCalidad({ ...base, condiciones: ["WET", "WET"] }).juicio).toBe("CUMPLE");
  });

  it("con flotación, una selección sin declarar deja el veredicto sin juicio; sin flotación, juzga", () => {
    expect(evaluarCalidad({ ...base, huboFlotacion: true, condiciones: [null] }).juicio).toBe("CONDICION_SIN_DECLARAR");
    expect(evaluarCalidad({ ...base, huboFlotacion: false, condiciones: [null] }).juicio).toBe("CUMPLE");
  });

  it("el balance descuadrado gana a todo lo demás", () => {
    const v = evaluarCalidad({ ...base, balanceDescuadrado: true, limites: null, condiciones: ["WET", "DRY"] });
    expect(v.juicio).toBe("BALANCE_DESCUADRADO");
  });

  it("un límite que el pedido no fijó no se juzga", () => {
    const v = evaluarCalidad({
      ...base,
      masas: { insumoKg: 100, aceptadoKg: 50, verdeKg: 10, flotesKg: 10, selecciones: 1 },
      limites: { minMaduroPct: null, maxVerdePct: 12, maxFlotesPct: 12 },
    });
    expect(v.juicio).toBe("CUMPLE");
    expect(v.maduroPct).toBe(50);
  });

  it("los porcentajes se muestran con dos decimales", () => {
    const v = evaluarCalidad({ ...base, masas: { insumoKg: 3, aceptadoKg: 1, verdeKg: 1, flotesKg: 1, selecciones: 1 } });
    expect(v.maduroPct).toBe(33.33);
  });
});
