import { describe, expect, it } from "vitest";
import {
  classifyDraftAge,
  STALE_PURGE_DAYS,
  STALE_WARNING_DAYS,
} from "../../lib/apiary/offlineQueue";

/**
 * A5.5 §4. `purgeStaleDrafts` deletes a beekeeper's unsynced field work — an
 * inspection recorded with no signal, gone. That deletion is deliberate (the
 * mitigation for a lost or stolen device holding partner-classified drafts in
 * plaintext IndexedDB), but until now the rule deciding it had no tests: it was
 * entangled with IndexedDB calls that cannot run in Node, and the repository
 * has no `fake-indexeddb` or DOM environment.
 *
 * The rule is now a pure function, so the boundaries can be pinned without a
 * browser. What still has no coverage — and should be said rather than implied
 * — is everything that touches IndexedDB: `queueDraft`, `listDrafts`,
 * `discardDraft`, `syncAll`, and the storage-driving half of
 * `purgeStaleDrafts`. Those need a shim, which is a separate decision.
 */
const DAY = 24 * 60 * 60 * 1000;
const AHORA = 1_700_000_000_000;
const conEdad = (dias: number) => classifyDraftAge(AHORA - dias * DAY, AHORA);

describe("classifyDraftAge: qué se conserva, qué se avisa y qué se borra", () => {
  /**
   * El invariante que hace humana a la regla: **se avisa antes de borrar**. Si
   * el umbral de aviso fuera igual o mayor que el de purga, el borrado llegaría
   * sin que nadie hubiera visto una advertencia — y lo que se pierde es trabajo
   * de campo que no está en ningún otro sitio.
   */
  it("el aviso llega antes que la purga", () => {
    expect(STALE_WARNING_DAYS).toBeLessThan(STALE_PURGE_DAYS);
    expect(STALE_WARNING_DAYS).toBeGreaterThan(0);
  });

  it("un borrador recién escrito se conserva", () => {
    expect(conEdad(0)).toBe("keep");
    expect(conEdad(1)).toBe("keep");
  });

  it("justo antes del aviso se conserva; justo en el aviso, avisa", () => {
    expect(conEdad(STALE_WARNING_DAYS - 0.01)).toBe("keep");
    expect(conEdad(STALE_WARNING_DAYS)).toBe("warn");
  });

  it("justo antes de la purga avisa; justo en la purga, purga", () => {
    expect(conEdad(STALE_PURGE_DAYS - 0.01)).toBe("warn");
    expect(conEdad(STALE_PURGE_DAYS)).toBe("purge");
  });

  it("pasada la purga sigue siendo purga, no aviso", () => {
    expect(conEdad(STALE_PURGE_DAYS + 100)).toBe("purge");
  });

  /**
   * Un teléfono con el reloj adelantado —o un borrador escrito en otro huso—
   * daría una edad negativa. Que eso **no** borre nada es la diferencia entre
   * un reloj torcido y una inspección perdida.
   */
  it("una fecha en el futuro no borra: el reloj torcido no destruye trabajo", () => {
    expect(conEdad(-1)).toBe("keep");
    expect(conEdad(-400)).toBe("keep");
  });

  it("no hay ninguna edad que caiga fuera de los tres veredictos", () => {
    for (let d = -30; d <= 60; d += 0.25) {
      expect(["keep", "warn", "purge"]).toContain(conEdad(d));
    }
  });
});
