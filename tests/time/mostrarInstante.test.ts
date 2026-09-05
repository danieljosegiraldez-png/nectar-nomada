import { describe, expect, it } from "vitest";
import { mostrarInstante, ZONA_POR_DEFECTO } from "../../lib/time/mostrarInstante";

/**
 * Hermético: sin base de datos, sin red, sin reloj del sistema.
 *
 * Los dos primeros casos son los que se midieron a mano el 2026-09-05
 * recorriendo la aplicación en un móvil, con sus cifras exactas. El resto
 * existe porque una función de husos que sólo se prueba con un valor pasa
 * igual estando rota.
 */
describe("mostrarInstante", () => {
  it("el caso medido: la jornada de las 07:30 no puede leerse 12:30", () => {
    // Lo que la base guarda para un 07:30 de Panamá.
    const guardado = new Date("2026-09-05T12:30:00.000Z");
    expect(guardado.toISOString().slice(0, 16).replace("T", " ")).toBe("2026-09-05 12:30");
    expect(mostrarInstante(guardado, "America/Panama")).toBe("2026-09-05 07:30");
  });

  it("el otro caso medido: el evento de las 11:31 no puede leerse 16:31", () => {
    const guardado = new Date("2026-09-05T16:31:00.000Z");
    expect(mostrarInstante(guardado, "America/Panama")).toBe("2026-09-05 11:31");
  });

  it("sin zona declarada cae en la de la finca, no en UTC", () => {
    const guardado = new Date("2026-09-05T16:31:00.000Z");
    expect(mostrarInstante(guardado, null)).toBe("2026-09-05 11:31");
    expect(mostrarInstante(guardado, undefined)).toBe("2026-09-05 11:31");
    expect(ZONA_POR_DEFECTO).toBe("America/Panama");
  });

  /**
   * El control positivo. Sin esto, una función que devolviera siempre la hora de
   * Panamá pasaría los tres tests de arriba — y sería igual de incorrecta que
   * una que devuelve siempre UTC, sólo que en otra zona.
   */
  it("respeta la zona que se le pide, no una fija", () => {
    const guardado = new Date("2026-09-05T16:31:00.000Z");
    expect(mostrarInstante(guardado, "UTC")).toBe("2026-09-05 16:31");
    expect(mostrarInstante(guardado, "Europe/Madrid")).toBe("2026-09-05 18:31");
    expect(mostrarInstante(guardado, "Asia/Tokyo")).toBe("2026-09-06 01:31");
  });

  it("cruza el día hacia atrás sin perder la fecha", () => {
    // 01:30 UTC es el día anterior a las 20:30 en Panamá.
    const guardado = new Date("2026-09-05T01:30:00.000Z");
    expect(mostrarInstante(guardado, "America/Panama")).toBe("2026-09-04 20:30");
  });

  it("mantiene el formato de dos dígitos y sin segundos", () => {
    const guardado = new Date("2026-01-02T09:05:07.000Z");
    expect(mostrarInstante(guardado, "UTC")).toBe("2026-01-02 09:05");
  });
});
