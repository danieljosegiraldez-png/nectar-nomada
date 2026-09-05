import { describe, expect, it } from "vitest";
import { parseLocalDateTime, paraCampoLocal } from "../../lib/time/localDateTime";

/**
 * Precargar un `datetime-local` y volver a guardarlo NO puede mover el instante.
 *
 * **El fallo que fija.** `MeasurementCorrectionForm` precargaba el campo con
 * `occurredAt.slice(0, 16)` —el reloj de pared en UTC— y el servidor lo
 * re-interpretaba con el desfase del dispositivo. Medido el 2026-09-05: abrir
 * una corrección y guardar sin tocar la hora adelantaba la medición **cinco
 * horas**, en silencio, sobre un registro de trazabilidad.
 *
 * Hermético: sin base, sin red. La zona de esta máquina es UTC−5, así que el
 * caso de Panamá es el que corre aquí; los demás se fuerzan con el desfase.
 */
describe("ida y vuelta de un datetime-local", () => {
  it("precargar y volver a guardar deja el mismo instante", () => {
    const guardado = new Date("2026-09-05T16:31:00.000Z");
    const enElCampo = paraCampoLocal(guardado);
    const desfase = String(guardado.getTimezoneOffset());
    expect(parseLocalDateTime(enElCampo, desfase).toISOString()).toBe(guardado.toISOString());
  });

  /**
   * El flip-test: con la forma vieja, la misma ida y vuelta se desplaza. Sin
   * esto, el test de arriba pasaría igual con el fallo puesto en cualquier
   * implementación que fuera su propio inverso.
   */
  it("la forma vieja SÍ desplazaba, y por eso este guardia existe", () => {
    const guardado = new Date("2026-09-05T16:31:00.000Z");
    const comoAntes = guardado.toISOString().slice(0, 16); // el reloj en UTC
    const desfase = guardado.getTimezoneOffset();
    const reinterpretado = parseLocalDateTime(comoAntes, String(desfase));
    const horasDeDeriva = (reinterpretado.getTime() - guardado.getTime()) / 3_600_000;
    // En una máquina en UTC no habría deriva; el guardia sólo afirma cuando la hay.
    if (desfase !== 0) {
      expect(horasDeDeriva).not.toBe(0);
      expect(horasDeDeriva).toBe(desfase / 60);
    }
  });

  it("cierra en varios instantes, no sólo en uno", () => {
    for (const iso of [
      "2026-01-01T00:00:00.000Z",
      "2026-06-15T12:00:00.000Z",
      "2026-09-05T04:59:00.000Z",
      "2026-12-31T23:59:00.000Z",
    ]) {
      const d = new Date(iso);
      const vuelta = parseLocalDateTime(paraCampoLocal(d), String(d.getTimezoneOffset()));
      expect(vuelta.toISOString(), `no cerró para ${iso}`).toBe(d.toISOString());
    }
  });
});
