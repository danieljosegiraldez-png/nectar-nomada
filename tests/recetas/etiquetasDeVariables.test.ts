/**
 * Toda variable del panel «proceso de café» tiene texto en los dos idiomas — Parte 2a, tarea 14 (2026-10-04).
 *
 * El editor de recetas rotula las variables de las metas de un paso con `variable_<x>`. Hasta esta tarea 28 de las 34 del panel no tenían texto
 * (`next-intl` habría pintado `Traceability.variable_cold_hold_plateau_duration`); se medió que ninguna tiene nombre de catálogo, así que el guion del paso 22
 * las escribe. Esta prueba exige que **toda** variable del panel lo tenga, en español y en inglés, y que ninguno sea una cadena vacía: la variable nueva que alguien
 * añada a `PANELES` (`units.ts`) sin su texto rompe aquí y no en una pantalla. Hermética: lee los mensajes y el registro de variables, no toca la base.
 */
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { listVariableDefinitions } from "../../lib/traceability/units";

const textos = (mensajes: unknown) => (mensajes as { Traceability: Record<string, string> }).Traceability;

describe("el panel «proceso de café»: cada variable tiene su texto", () => {
  const variables = listVariableDefinitions("proceso_de_cafe").map((v) => v.variable);

  it("control: el panel trae sus variables, entre ellas las seis que ya tenían texto antes de esta tarea", () => {
    expect(variables.length).toBeGreaterThanOrEqual(34);
    for (const v of ["temperature", "ph", "brix", "relative_humidity", "moisture", "water_activity"]) expect(variables).toContain(v);
  });

  it.each([
    ["es", es],
    ["en", en],
  ] as const)("%s: ninguna variable del panel se queda sin texto, ni con el texto vacío", (idioma, mensajes) => {
    const t = textos(mensajes);
    const sin = variables.filter((v) => !t[`variable_${v}`]);
    expect(sin, `variables del panel sin texto en ${idioma}: ${sin.join(", ")}`).toEqual([]);
  });
});
