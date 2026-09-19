/**
 * El ayudante de husos, puro y sin base. Entra en el conjunto hermético de CI
 * porque el fallo que arregla —una hora que cambia según dónde corra el
 * servidor— es invisible en desarrollo, donde navegador y servidor comparten
 * zona y el error se cancela.
 */
import { describe, expect, it } from "vitest";
import {
  parseLocalDateTime,
  parseOptionalLocalDateTime,
  instanteAPrecargar,
  LocalDateTimeError,
} from "../../lib/time/localDateTime";

describe("parseLocalDateTime", () => {
  it("una hora de Panamá se guarda como el instante correcto", () => {
    // getTimezoneOffset() en UTC-5 devuelve 300.
    expect(parseLocalDateTime("2026-03-12T07:30", "300").toISOString()).toBe("2026-03-12T12:30:00.000Z");
  });

  it("la misma hora en UTC se guarda distinta, que es el punto", () => {
    expect(parseLocalDateTime("2026-03-12T07:30", "0").toISOString()).toBe("2026-03-12T07:30:00.000Z");
  });

  it("y al este de Greenwich el desfase es negativo", () => {
    // Madrid en verano, UTC+2 -> -120.
    expect(parseLocalDateTime("2026-07-01T14:00", "-120").toISOString()).toBe("2026-07-01T12:00:00.000Z");
  });

  it("acepta el formato con segundos que algunos navegadores mandan", () => {
    expect(parseLocalDateTime("2026-03-12T07:30:45", "300").toISOString()).toBe("2026-03-12T12:30:45.000Z");
  });

  it("SIN desfase falla, en vez de suponer una zona", () => {
    // Suponer UTC guardaría un instante equivocado con aspecto de correcto:
    // exactamente el fallo del que viene todo esto.
    expect(() => parseLocalDateTime("2026-03-12T07:30", null)).toThrow(LocalDateTimeError);
    expect(() => parseLocalDateTime("2026-03-12T07:30", "")).toThrow("timezone_offset_missing");
  });

  it("rechaza un desfase que no puede venir de un navegador", () => {
    expect(() => parseLocalDateTime("2026-03-12T07:30", "9999")).toThrow("timezone_offset_invalid");
    expect(() => parseLocalDateTime("2026-03-12T07:30", "no-es-un-numero")).toThrow("timezone_offset_invalid");
  });

  it("rechaza una fecha vacía o ilegible", () => {
    expect(() => parseLocalDateTime("", "300")).toThrow("datetime_required");
    expect(() => parseLocalDateTime("no-es-una-fecha", "300")).toThrow("datetime_invalid");
  });

  it("la variante opcional acepta el vacío y devuelve null", () => {
    expect(parseOptionalLocalDateTime("", "300")).toBeNull();
    expect(parseOptionalLocalDateTime("2026-03-12T07:30", "300")?.toISOString()).toBe("2026-03-12T12:30:00.000Z");
  });
});

/**
 * Ronda final, hallazgo 1: qué instante precarga un formulario que puede
 * "registrar" (sin valor previo) o "corregir" (con uno). Puro — recibe "ahora"
 * en vez de leerlo, así que no depende de cuándo corre la prueba.
 *
 * Lo que esto NO prueba, y por qué no se puede aquí: que `IntervencionForm`
 * escriba el resultado en el DOM en un efecto, y que lo haga con el desfase
 * del DISPOSITIVO y no el del servidor. Eso exige un navegador de verdad —dos
 * "zonas" distintas para servidor y cliente— y no hay arnés de componentes en
 * este repositorio (`grep` de `app/components` en `tests/` no da resultados).
 * Esta función es la parte que SÍ se puede aislar del fallo; el resto quedó
 * verificado por lectura contra el patrón ya probado de
 * `MeasurementCorrectionForm`/`TimezoneOffsetField`.
 */
describe("instanteAPrecargar", () => {
  const ahora = new Date("2026-09-18T12:00:00.000Z");

  it("con un instante existente, lo respeta tal cual — nunca lo reemplaza por «ahora»", () => {
    expect(instanteAPrecargar("2026-01-01T07:30:00.000Z", ahora)).toEqual(new Date("2026-01-01T07:30:00.000Z"));
  });

  it("sin instante (nulo), precarga con «ahora»", () => {
    expect(instanteAPrecargar(null, ahora)).toEqual(ahora);
  });
});
