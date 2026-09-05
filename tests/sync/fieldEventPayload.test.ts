import { describe, expect, it } from "vitest";
import { construirEventoEncolado } from "../../lib/sync/fieldEventPayload";
import { TZ_OFFSET_FIELD } from "../../lib/time/localDateTime";

/**
 * P4 §11 — el payload que la cola guarda.
 *
 * **Por qué existe este archivo.** La primera versión leía el desfase horario
 * de un campo llamado `"timezoneOffsetMinutes"`, inventado; el real es
 * `TZ_OFFSET_FIELD` = `"tzOffsetMinutes"`. `parseLocalDateTime` lanzaba, y como
 * el `onSubmit` ya había cancelado la Server Action, la anotación se perdía en
 * silencio mientras la pantalla decía «guardado en este dispositivo».
 *
 * Sólo pasaba SIN SEÑAL — justo cuando no hay nada más que salve al operador— y
 * ningún test lo vio porque el cableado del cliente no tenía ninguno. Lo cazó
 * recorrer el modo avión en un navegador. Esto es lo que lo habría cazado antes.
 *
 * Hermético: `FormData` existe en Node, así que aquí no hace falta ni DOM ni
 * IndexedDB ni `fetch`.
 */
const form = (campos: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
};

const BASE = {
  eventKindValueId: "kind-1",
  occurredAt: "2026-08-28T07:30",
  [TZ_OFFSET_FIELD]: "300", // UTC-5, Panamá
};

describe("construirEventoEncolado", () => {
  /**
   * El caso que se rompió. Se ata al NOMBRE por su constante: si alguien
   * renombra el campo, este test sigue siendo cierto; si alguien vuelve a
   * escribir el nombre a mano en el cliente, deja de serlo.
   */
  it("lee el desfase horario del campo que el formulario escribe de verdad", () => {
    const p = construirEventoEncolado(form(BASE), "s1");
    // 07:30 de pared con desfase 300 (UTC-5) es 12:30Z.
    expect(p.occurredAt).toBe("2026-08-28T12:30:00.000Z");
  });

  /**
   * Control positivo del test de arriba: con el nombre inventado que tenía el
   * cliente, esto revienta. Sin esta mitad, el test anterior pasaría igual
   * aunque el código volviera a leer el campo equivocado por casualidad.
   */
  it("sin ese campo NO adivina una zona: lanza", () => {
    const fd = form({ eventKindValueId: "kind-1", occurredAt: "2026-08-28T07:30" });
    fd.set("timezoneOffsetMinutes", "300"); // el nombre inventado, presente
    expect(() => construirEventoEncolado(fd, "s1")).toThrow();
  });

  it("el mismo reloj de pared con otro desfase es otro instante", () => {
    const a = construirEventoEncolado(form({ ...BASE, [TZ_OFFSET_FIELD]: "300" }), "s1");
    const b = construirEventoEncolado(form({ ...BASE, [TZ_OFFSET_FIELD]: "0" }), "s1");
    expect(a.occurredAt).not.toBe(b.occurredAt);
  });

  it("los campos vacíos son null, no cadenas vacías", () => {
    const p = construirEventoEncolado(form({ ...BASE, notes: "   ", operatorPersonId: "" }), "s1");
    expect(p.notes).toBeNull();
    expect(p.operatorPersonId).toBeNull();
  });

  /**
   * Sin pulsar el botón de ubicación las tres coordenadas van nulas, y eso el
   * servicio lo acepta: media coordenada es lo que rechaza, no ninguna.
   */
  it("sin coordenadas manda las tres nulas, que es lo que el servicio admite", () => {
    const p = construirEventoEncolado(form(BASE), "s1");
    expect(p.position).toEqual({ latitude: null, longitude: null, accuracyM: null });
  });

  it("con coordenadas las manda como números", () => {
    const p = construirEventoEncolado(
      form({ ...BASE, latitude: "8.5", longitude: "-80.1", accuracyM: "12" }), "s1");
    expect(p.position).toEqual({ latitude: 8.5, longitude: -80.1, accuracyM: 12 });
  });

  it("recordedAt es el reloj del aparato, distinto de cuándo pasó", () => {
    const ahora = new Date("2026-08-28T14:00:00.000Z");
    const p = construirEventoEncolado(form(BASE), "s1", ahora);
    expect(p.recordedAt).toBe("2026-08-28T14:00:00.000Z");
    expect(p.recordedAt).not.toBe(p.occurredAt);
  });
});
