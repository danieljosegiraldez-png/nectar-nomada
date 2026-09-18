/**
 * ADR-161 — el vocabulario de procesar miel, sin base. Se llama con la entrada hostil.
 */
import { describe, expect, it } from "vitest";
import { ACTOS_DE_PROCESO_DE_MIEL, kilos, normalizarActosDeMiel } from "../../lib/apiary/vocabularioDeMiel";

describe("el vocabulario de procesar miel", () => {
  it("devuelve los actos en el orden del vocabulario, sin repetir, no en el que llegaron", () => {
    expect(normalizarActosDeMiel(["decantacion_maduracion", "colado", "colado"], null)).toEqual({
      acts: ["colado", "decantacion_maduracion"],
      otherNote: null,
    });
  });

  it("ningún acto se rechaza", () => {
    expect(() => normalizarActosDeMiel([], null)).toThrow(/sin_actos/);
  });

  it("un acto que no está en la lista se rechaza con su valor", () => {
    expect(() => normalizarActosDeMiel(["pasteurizado"], null)).toThrow(/acto_desconocido:pasteurizado/);
  });

  it("«otro» EXIGE decir cuál, y un espacio en blanco no cuenta", () => {
    expect(() => normalizarActosDeMiel(["otro"], "   ")).toThrow(/otro_sin_decir_cual/);
    expect(normalizarActosDeMiel(["otro"], " cristalización guiada ")).toEqual({
      acts: ["otro"],
      otherNote: "cristalización guiada",
    });
  });

  it("una nota de «otro» sin «otro» marcado se rechaza: describiría un acto no declarado", () => {
    expect(() => normalizarActosDeMiel(["colado"], "algo")).toThrow(/nota_sin_otro/);
  });

  it("el vocabulario es el que Daniel eligió, con su salida", () => {
    expect([...ACTOS_DE_PROCESO_DE_MIEL]).toEqual(["colado", "filtrado", "decantacion_maduracion", "homogenizado", "otro"]);
  });

  it("kilos: vacío es null —no se pesó—, nunca cero; cero escrito sí es cero", () => {
    expect(kilos("", "x")).toBeNull();
    expect(kilos("  ", "x")).toBeNull();
    expect(kilos(null, "x")).toBeNull();
    expect(kilos("0", "x")).toBe(0);
    expect(kilos("12.5", "x")).toBe(12.5);
  });

  it("kilos: negativo o no numérico se rechaza con el nombre del campo", () => {
    expect(() => kilos("-1", "entrada")).toThrow(/kilos_invalidos:entrada/);
    expect(() => kilos("doce", "salida")).toThrow(/kilos_invalidos:salida/);
  });
});
