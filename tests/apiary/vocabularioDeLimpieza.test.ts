/**
 * ADR-159 — el vocabulario de la limpieza de la caja. Pura: se llama con la entrada hostil.
 */
import { describe, expect, it } from "vitest";
import {
  ACTOS_DE_LIMPIEZA,
  ACTOS_QUE_EXIGEN_CAJA_VACIA,
  exigeCajaVacia,
  exigeLimpieza,
  LimpiezaInvalida,
} from "../../lib/apiary/vocabularioDeLimpieza";

describe("los actos", () => {
  it("un acto del vocabulario pasa, y un repetido se guarda una sola vez", () => {
    expect(exigeLimpieza({ acts: ["raspado", "flameado", "raspado"] }).acts).toEqual(["raspado", "flameado"]);
  });

  it("sin ningún acto se rechaza", () => {
    expect(() => exigeLimpieza({ acts: [] })).toThrow(/sin_actos/);
  });

  it("un acto inventado se rechaza", () => {
    expect(() => exigeLimpieza({ acts: ["lavado"] })).toThrow(/acto_desconocido/);
  });

  it("«otro» EXIGE decir cuál — y en blanco no cuenta", () => {
    expect(() => exigeLimpieza({ acts: ["otro"] })).toThrow(/otro_sin_decir_cual/);
    expect(() => exigeLimpieza({ acts: ["otro"], actOtherNote: "   " })).toThrow(/otro_sin_decir_cual/);
    expect(exigeLimpieza({ acts: ["otro"], actOtherNote: "lavado a presión" }).acts).toEqual(["otro"]);
  });
});

describe("la razón", () => {
  it("es opcional: sin razón no es error, es «sin registrar»", () => {
    expect(exigeLimpieza({ acts: ["raspado"] }).reason).toBeNull();
    expect(exigeLimpieza({ acts: ["raspado"], reason: "  " }).reason).toBeNull();
  });

  it("una razón inventada se rechaza, y «otro» exige decir cuál", () => {
    expect(() => exigeLimpieza({ acts: ["raspado"], reason: "capricho" })).toThrow(/razon_desconocida/);
    expect(() => exigeLimpieza({ acts: ["raspado"], reason: "otro" })).toThrow(/razon_otro_sin_decir_cual/);
    expect(exigeLimpieza({ acts: ["raspado"], reason: "otro", reasonOtherNote: "traslado" }).reason).toBe("otro");
  });
});

describe("qué actos exigen la caja vacía", () => {
  it("LOS DESTRUCTIVOS la exigen: no se flamea ni se hierve una caja con abejas", () => {
    for (const a of ["raspado", "flameado", "inmersion_sosa", "aclarado", "secado_al_sol"] as const) {
      expect(exigeCajaVacia([a]), a).toBe(true);
    }
  });

  it("LA EXCEPCIÓN: renovar cera se hace CON la colonia dentro, así que no la exige", () => {
    expect(exigeCajaVacia(["renovacion_de_cera"])).toBe(false);
  });

  it("y «otro» tampoco: no se sabe qué es, y bloquearlo sería decidir por el apicultor", () => {
    expect(exigeCajaVacia(["otro"])).toBe(false);
  });

  it("basta UNO destructivo en la mezcla para exigirla", () => {
    expect(exigeCajaVacia(["renovacion_de_cera", "flameado"])).toBe(true);
  });

  it("todo acto del vocabulario está clasificado: ni sobra ni falta ninguno", () => {
    // Si alguien añade un acto al enum, esta línea le obliga a decidir si exige caja vacía, en
    // vez de que herede un «no» por omisión.
    const noLaExigen = ACTOS_DE_LIMPIEZA.filter((a) => !ACTOS_QUE_EXIGEN_CAJA_VACIA.has(a));
    expect(noLaExigen.sort()).toEqual(["otro", "renovacion_de_cera"]);
  });
});

it("el error es del tipo propio, no un Error genérico", () => {
  expect(() => exigeLimpieza({ acts: [] })).toThrow(LimpiezaInvalida);
});
