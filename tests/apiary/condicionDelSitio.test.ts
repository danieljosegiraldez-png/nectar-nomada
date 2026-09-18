/**
 * ADR-165 — el vocabulario de la condición del sitio, sin base. Se llama con la entrada hostil.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONDICIONES_DEL_SITIO, normalizarCondicionDelSitio } from "../../lib/apiary/condicionDelSitio";

describe("la condición del sitio", () => {
  it("es la lista del protocolo v2, en su orden", () => {
    const protocolo = JSON.parse(readFileSync("protocolos/apiario-campo-v2.json", "utf8"));
    const item = protocolo.activities.flatMap((a: { items: { key: string }[] }) => a.items).find((i: { key: string }) => i.key === "site_condition");
    expect([item.valueType, item.options]).toEqual(["multi_enum", [...CONDICIONES_DEL_SITIO]]);
  });

  it("devuelve el orden del protocolo, sin repetir", () => {
    expect(normalizarCondicionDelSitio(["pasto_alto", "hormigas", "hormigas"], null)).toEqual({
      conditions: ["hormigas", "pasto_alto"],
      otherNote: null,
    });
  });

  it("una lista vacía es «sin registrar»: null, y la columna no se toca", () => {
    expect(normalizarCondicionDelSitio([], null)).toBeNull();
    expect(normalizarCondicionDelSitio([], "  ")).toBeNull();
  });

  it("«sin novedad» va sola", () => {
    expect(() => normalizarCondicionDelSitio(["sin_novedad", "hormigas"], null)).toThrow(/sin_novedad_va_sola/);
    expect(normalizarCondicionDelSitio(["sin_novedad"], null)?.conditions).toEqual(["sin_novedad"]);
  });

  it("«otro» exige decir cuál; una nota sin «otro» se rechaza, también sin ninguna marca", () => {
    expect(() => normalizarCondicionDelSitio(["otro"], " ")).toThrow(/otro_sin_decir_cual/);
    expect(() => normalizarCondicionDelSitio(["hormigas"], "algo")).toThrow(/nota_sin_otro/);
    expect(() => normalizarCondicionDelSitio([], "algo")).toThrow(/nota_sin_otro/);
  });

  it("un valor fuera de la lista se rechaza con su nombre — también el «agua» de la v1", () => {
    expect(() => normalizarCondicionDelSitio(["agua"], null)).toThrow(/condicion_desconocida:agua/);
  });
});
