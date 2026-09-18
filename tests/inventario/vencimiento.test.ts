/**
 * El estado de vencimiento de un frasco — botiquín, Tarea 3. Puro y hermético.
 *
 * **`hoy` es un DÍA, no un instante**, y el plan decía lo contrario. A las 19:00
 * del 16 en Panamá ya es día 17 en UTC: comparar instantes haría que un frasco
 * que vence el 17 saliera «vencido» cinco horas antes. El día lo calcula
 * `diaDeHoy(ahora, zona)`, que ya existe y cuya documentación describe este caso:
 * «puede llegar un día tarde, nunca uno antes».
 *
 * `expiresAt` es un campo de DÍA —viene de un `type="date"` y se guarda como
 * medianoche UTC—, así que su día es `toISOString().slice(0, 10)`.
 */
import { describe, expect, it } from "vitest";

import { estadoDeVencimiento } from "../../lib/inventario/vencimiento";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const hoy = "2026-09-17";

describe("el estado de vencimiento", () => {
  it("sin fecha dice SIN_FECHA, no VIGENTE", () => {
    // Lo desconocido no se convierte en bueno.
    expect(estadoDeVencimiento({ expiresAt: null, avisarDiasAntes: 30, hoy })).toEqual({ estado: "SIN_FECHA" });
  });

  it("ya pasada dice VENCIDO, con los días desde que venció", () => {
    expect(estadoDeVencimiento({ expiresAt: d("2026-09-10"), avisarDiasAntes: 30, hoy }))
      .toEqual({ estado: "VENCIDO", dias: 7 });
  });

  it("el día EXACTO del vencimiento ya es VENCIDO, con cero días", () => {
    // El borde. Un medicamento que «vence el 17» no se usa el 17.
    expect(estadoDeVencimiento({ expiresAt: d("2026-09-17"), avisarDiasAntes: 30, hoy }))
      .toEqual({ estado: "VENCIDO", dias: 0 });
  });

  it("dentro del plazo de aviso dice POR_VENCER, con los días que faltan", () => {
    expect(estadoDeVencimiento({ expiresAt: d("2026-10-07"), avisarDiasAntes: 30, hoy }))
      .toEqual({ estado: "POR_VENCER", dias: 20 });
  });

  it("el último día del plazo todavía avisa; uno después, no", () => {
    // El otro borde. Con aviso a 30 días, vencer a 30 días avisa y a 31 no.
    expect(estadoDeVencimiento({ expiresAt: d("2026-10-17"), avisarDiasAntes: 30, hoy }).estado).toBe("POR_VENCER");
    expect(estadoDeVencimiento({ expiresAt: d("2026-10-18"), avisarDiasAntes: 30, hoy }).estado).toBe("VIGENTE");
  });

  it("fuera del plazo dice VIGENTE", () => {
    expect(estadoDeVencimiento({ expiresAt: d("2027-01-01"), avisarDiasAntes: 30, hoy })).toEqual({ estado: "VIGENTE" });
  });

  it("sin plazo de aviso, lo que VA a vencer no avisa — pero lo VENCIDO sí", () => {
    // Decisión 1 del plan: nulo calla el aviso PREVIO. Un vencido no es un
    // recordatorio, es un hecho, y en un medicamento es el que no puede callar.
    expect(estadoDeVencimiento({ expiresAt: d("2026-09-20"), avisarDiasAntes: null, hoy }).estado).toBe("VIGENTE");
    expect(estadoDeVencimiento({ expiresAt: d("2026-09-10"), avisarDiasAntes: null, hoy }).estado).toBe("VENCIDO");
  });

  it("aviso CERO significa avisar sólo el día que vence — que ya es vencido", () => {
    // Cero no es nulo. Con cero, mañana es VIGENTE y hoy es VENCIDO.
    expect(estadoDeVencimiento({ expiresAt: d("2026-09-18"), avisarDiasAntes: 0, hoy }).estado).toBe("VIGENTE");
    expect(estadoDeVencimiento({ expiresAt: d("2026-09-17"), avisarDiasAntes: 0, hoy }).estado).toBe("VENCIDO");
  });

  it("cruza meses y años sin perder días", () => {
    // 2026-12-20 → 2027-01-05 son 16 días. Una resta mal hecha por mes lo rompe.
    expect(estadoDeVencimiento({ expiresAt: d("2027-01-05"), avisarDiasAntes: 30, hoy: "2026-12-20" }))
      .toEqual({ estado: "POR_VENCER", dias: 16 });
  });

  it("un día mal escrito se rechaza en vez de inventar un estado", () => {
    expect(() => estadoDeVencimiento({ expiresAt: d("2026-09-10"), avisarDiasAntes: 30, hoy: "17/09/2026" })).toThrow();
  });
});
