import { describe, expect, it } from "vitest";

import { faseDelLote } from "../../lib/beneficio/reposo";

/**
 * **El defecto más caro que encontró la auditoría del plan, y estaba escondido
 * a plena vista.**
 *
 * `app/lots/[id]/page.tsx` calculaba la fase así:
 *
 *     activeFermentation ? … : activeDrying ? … : null
 *
 * y **el reposo es justamente lo que pasa cuando no hay ninguna de las dos.**
 * Con esa condición, `faseAbierta` sería `null`, el motor no se llamaría nunca
 * y ningún día de reposo llegaría a la pantalla. Ensanchar el tipo compila y
 * deja la función invisible.
 *
 * Estas pruebas son el guardia de esa condición.
 */
const AHORA = new Date("2026-06-01T00:00:00Z");
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000);

describe("qué fase corre en un lote", () => {
  it("con fermentación abierta, fermentación — aunque haya un secado viejo", () => {
    const f = faseDelLote({
      fermentacionAbierta: { startedAt: haceDias(2) },
      secadoAbierto: null,
      ultimoSecadoTerminado: { endedAt: haceDias(90), endedOutcome: "target_reached" },
    });
    expect(f?.tipo).toBe("fermentacion");
  });

  it("con secado abierto, secado", () => {
    const f = faseDelLote({
      fermentacionAbierta: null,
      secadoAbierto: { startedAt: haceDias(5) },
      ultimoSecadoTerminado: null,
    });
    expect(f?.tipo).toBe("secado");
  });

  it("SIN fase abierta pero con un secado que llegó a objetivo: REPOSO", () => {
    // El guardia. Si alguien vuelve a dejar la condición en
    // `fermentacion ?? secado ?? null`, esta cae.
    const f = faseDelLote({
      fermentacionAbierta: null,
      secadoAbierto: null,
      ultimoSecadoTerminado: { endedAt: haceDias(41), endedOutcome: "target_reached" },
    });
    expect(f?.tipo).toBe("reposo");
    expect(f?.iniciadaEn).toEqual(haceDias(41));
  });

  it("y NO reposa si el último secado se abandonó", () => {
    const f = faseDelLote({
      fermentacionAbierta: null,
      secadoAbierto: null,
      ultimoSecadoTerminado: { endedAt: haceDias(41), endedOutcome: "abandoned" },
    });
    expect(f).toBeNull();
  });

  it("ni si el secado terminó sin declarar desenlace — los históricos no reposan", () => {
    // Todos los secados cerrados antes del 2026-09-16 tienen `endedOutcome`
    // nulo. No se les inventa un reposo: el motor lo dirá con su limitación.
    const f = faseDelLote({
      fermentacionAbierta: null,
      secadoAbierto: null,
      ultimoSecadoTerminado: { endedAt: haceDias(41), endedOutcome: null },
    });
    expect(f).toBeNull();
  });

  it("sin nada de nada, null — el control de que no inventa una fase", () => {
    const f = faseDelLote({ fermentacionAbierta: null, secadoAbierto: null, ultimoSecadoTerminado: null });
    expect(f).toBeNull();
  });
});
