import { describe, expect, it } from "vitest";
import {
  classifyDraftAge,
  STALE_PURGE_DAYS,
  STALE_WARNING_DAYS,
  mutacionDe,
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

/**
 * A9.5 — la traducción de un borrador local a la mutación del lote.
 *
 * Se prueba ésta y no `syncAll` porque `syncAll` sigue tocando IndexedDB y este
 * repositorio sigue sin shim; lo que se hizo fue sacar la parte pura fuera, que
 * es donde un error se multiplica: si la traducción se equivoca, se equivoca en
 * todos los registros de la tanda y sin decirlo.
 */
describe("A9.5 — un borrador se traduce a la mutación del lote", () => {
  const borrador = (extra: Record<string, unknown> = {}) => ({
    id: "draft-1",
    kind: "inspection" as const,
    payload: { colonyId: "col-1", outcome: "nothing_unusual", ...extra },
    createdAt: Date.parse("2026-09-02T14:00:00Z"),
    status: "pending" as const,
  });

  it("lleva la clase, el identificador del borrador y la carga", () => {
    const m = mutacionDe(borrador());
    expect(m.kind).toBe("inspection");
    expect(m.clientDraftId).toBe("draft-1");
    expect(m.colonyId).toBe("col-1");
    expect(m.outcome).toBe("nothing_unusual");
  });

  it("un evento de colonia viaja con la clave que el servidor espera", () => {
    // El almacén local dice `colonyEvent` y el protocolo dice `colony_event`.
    // Son dos vocabularios y la traducción es justo esto.
    const m = mutacionDe({ ...borrador(), kind: "colonyEvent" as const });
    expect(m.kind).toBe("colony_event");
  });

  it("un FIN de colonia viaja como `colony_end`, no disfrazado de evento", () => {
    // **La prueba que el ternario anterior habría suspendido.** Hasta el
    // 2026-09-10 esta traducción era `kind === "inspection" ? … : "colony_event"`,
    // así que cualquier tipo nuevo llegaba al servidor como evento de colonia y
    // se rechazaba por un campo que falta, no por lo que era.
    const m = mutacionDe({ ...borrador(), kind: "colonyEnd" as const });
    expect(m.kind).toBe("colony_end");
  });

  it("los tres tipos de borrador tienen nombre propio en el protocolo", () => {
    // Sin esto, un cuarto tipo podría compartir el nombre de otro y el fallo
    // sería silencioso: el servidor aplicaría la mutación equivocada.
    const nombres = (["inspection", "colonyEvent", "colonyEnd"] as const).map(
      (kind) => mutacionDe({ ...borrador(), kind }).kind,
    );
    expect(new Set(nombres).size).toBe(3);
    expect(nombres).toEqual(["inspection", "colony_event", "colony_end"]);
  });

  it("sin hora propia usa la de CREACIÓN del borrador, no la de sincronizar", () => {
    // Es lo que impide fechar una inspección el día que hubo señal. Una visita
    // capturada el 2 de septiembre y sincronizada el 5 sigue siendo del 2.
    const m = mutacionDe(borrador());
    expect(m.occurredAt).toBe(new Date(Date.parse("2026-09-02T14:00:00Z")).toISOString());
  });

  it("y si el borrador trajo su hora, esa manda", () => {
    const m = mutacionDe(borrador({ occurredAt: "2026-09-02T09:15:00.000Z" }));
    expect(m.occurredAt).toBe("2026-09-02T09:15:00.000Z");
  });
});
