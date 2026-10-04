/**
 * The expected next action for a batch — ADR-096.
 *
 * Pure, like tests/navigation.test.ts: the interesting cases are cheap to
 * assert exhaustively and need no database.
 *
 * These assert what is *suggested*, never what is *allowed*. Every action
 * remains reachable regardless of what this returns — the page still renders
 * all of them — so a wrong answer here is a worse hint, not a blocked
 * operator. That distinction is the whole reason this was safe to build.
 */

import { describe, it, expect } from "vitest";
import { nextActionFor, sugerenciaOfrecida } from "../../lib/traceability/batchActions";
import type { LotType } from "../../generated/prisma/client";

describe("nextActionFor", () => {
  it("follows the sequence the product owner confirmed", () => {
    // P3: an unsorted cherry batch is waiting to be selected; one that has
    // already been through a selection is waiting to ferment. The third
    // argument defaults to `true`, so this original assertion still describes
    // ADR-096's behaviour for a caller that does not resolve lineage.
    expect(nextActionFor("cherry", false)).toBe("fermentation");
    expect(nextActionFor("cherry", false, true)).toBe("fermentation");
    expect(nextActionFor("cherry", false, false)).toBe("selection");
    // A run under way still outranks everything, sorted or not.
    expect(nextActionFor("cherry", true, false)).toBe("measurement");
    expect(nextActionFor("processing", false)).toBe("drying");
    expect(nextActionFor("drying", false)).toBe("storage");
    expect(nextActionFor("parchment", false)).toBe("storage");
    expect(nextActionFor("dry_cherry", false)).toBe("storage");
  });

  it("sends green and roasted coffee to be tasted", () => {
    expect(nextActionFor("green", false)).toBe("sample");
    expect(nextActionFor("roast", false)).toBe("sample");
  });

  it("asks for a measurement while a run is under way", () => {
    // Found by opening PE-96-A mid-fermentation: this returned null and the
    // page therefore said nothing, when the obvious answer was "take a
    // reading". A run in progress wants the same thing whatever the lot type.
    expect(nextActionFor("cherry", true)).toBe("measurement");
    expect(nextActionFor("processing", true)).toBe("measurement");
    expect(nextActionFor("drying", true)).toBe("measurement");
    expect(nextActionFor("green", true)).toBe("measurement");
  });

  it("suggests nothing for end states and non-coffee material", () => {
    // `null` is a real answer here, not a gap. A sample goes to sensory, not
    // to another stage; honey reaches Lot through A3 and never travels the
    // coffee sequence; `other` exists because the material did not fit a
    // stage, so inventing one for it would be inventing a fact.
    expect(nextActionFor("sample", false)).toBeNull();
    expect(nextActionFor("honey", false)).toBeNull();
    expect(nextActionFor("other", false)).toBeNull();
  });

  it("answers for every LotType in the schema, with no fallthrough", () => {
    // The guard that matters when a stage is added: this file is a switch over
    // the enum, and a new member must be a deliberate decision rather than an
    // accidental `undefined` reaching the page.
    const allTypes: LotType[] = ["cherry", "processing", "drying", "parchment", "dry_cherry", "green", "roast", "sample", "other", "honey"];
    for (const t of allTypes) {
      const result = nextActionFor(t, false);
      expect(result === null || typeof result === "string").toBe(true);
      expect(result).not.toBeUndefined();
    }
  });
});

/**
 * Tarea 9, ronda de arreglo 1 (2026-10-02). Desde la Parte 1 «Empezar fermentación» y «Empezar secado» sólo se ofrecen con un
 * proceso abierto, y «Selección» no se ofrece bajo uno. `nextActionFor` mira el tipo del lote y no lo sabe, así que la ficha
 * decía «Siguiente paso sugerido» sobre un botón que no estaba. La sugerencia sólo vale si la ficha ofrece esa acción.
 */
describe("sugerenciaOfrecida", () => {
  it("sólo sugiere una acción que la ficha ofrece en ese momento; si no la ofrece, ninguna", () => {
    // Una cereza ya seleccionada, sin proceso abierto: `nextActionFor` dice fermentar, y la ficha no ofrece ese botón.
    expect(nextActionFor("cherry", false, true)).toBe("fermentation");
    expect(sugerenciaOfrecida("fermentation", ["process", "storage", "sample", "report"])).toBeNull();
    // Una cereza sin seleccionar bajo un proceso abierto: dice seleccionar, y la selección no se ofrece bajo un proceso.
    expect(sugerenciaOfrecida("selection", ["fermentation", "drying", "process", "storage", "sample", "report"])).toBeNull();
    // Control: con el botón ofrecido, la sugerencia se queda.
    expect(sugerenciaOfrecida("fermentation", ["fermentation", "drying", "process", "storage", "sample", "report"])).toBe("fermentation");
    expect(sugerenciaOfrecida(null, ["report"])).toBeNull();
  });
});
