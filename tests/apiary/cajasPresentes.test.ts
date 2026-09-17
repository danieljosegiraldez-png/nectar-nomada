/**
 * ADR-150 — cajas presentes: lo que alguien contó contra lo que el sistema tiene colocado.
 *
 * **Lo que esto protege.** El Anexo E pregunta «Cajas presentes» y el mapa del protocolo la daba
 * por **sin sitio**, con la razón escrita: *«las cajas presentes se cuentan hoy desde `Hive`, no se
 * declaran. Contar y declarar son datos distintos: el segundo es lo que alguien vio.»*
 *
 * `HivePlacement` sabe cuántas cajas **colocó**; eso no es cuántas **hay**. Una caja puede irse sin
 * que nadie registre el traslado, y hasta hoy el sistema no podía ni notarlo.
 *
 * Puras: el guardia llama a la función con la entrada hostil. Lo que cruza a Postgres —que la
 * columna guarde el recuento— lo cubre `tests/traceability/` con el resto de la visita.
 */
import { describe, expect, it } from "vitest";
import {
  compararCajasPresentes,
  avisoDeCajas,
  CajasPresentesInvalido,
} from "../../lib/apiary/cajasPresentes";

describe("la comparación", () => {
  it("LO QUE EL ANEXO PIDE: cuando coinciden, lo dice sin inventar un aviso", () => {
    expect(compararCajasPresentes(10, 10)).toEqual({
      declaradas: 10,
      enSistema: 10,
      estado: "coinciden",
      diferencia: 0,
    });
    expect(avisoDeCajas(compararCajasPresentes(10, 10))).toBeNull();
  });

  it("EL CASO QUE LO MOTIVA: el apicultor cuenta 8 y el sistema tiene 10 — faltan dos", () => {
    const c = compararCajasPresentes(8, 10);
    expect(c.estado).toBe("divergen");
    expect(c.diferencia).toBe(-2);
    expect(avisoDeCajas(c)).toEqual({ faltan: 2 });
  });

  it("y al revés: cuenta 12 donde el sistema tiene 10 — sobran dos", () => {
    // Problema distinto del anterior: hay cajas que nadie registró, no cajas que se fueron. Por
    // eso la diferencia lleva signo y no valor absoluto.
    const c = compararCajasPresentes(12, 10);
    expect(c.diferencia).toBe(2);
    expect(avisoDeCajas(c)).toEqual({ sobran: 2 });
  });

  it("SIN RECUENTO no es «coinciden», y por eso el estado tiene tres valores", () => {
    // Un `divergen: boolean` diría `false` aquí, y `false` se lee como «coinciden». Es ADR-080
    // aplicado a un valor derivado: `null` es «sin registrar» y nada lo sustituye.
    const c = compararCajasPresentes(null, 10);
    expect(c.estado).toBe("sin_recuento");
    expect(c.declaradas).toBeNull();
    expect(c.diferencia).toBeNull();
    // Y la cuenta del sistema NO se tira: viaja igual, como en `polinizacion.ts`.
    expect(c.enSistema).toBe(10);
    expect(avisoDeCajas(c)).toBeNull();
  });

  it("`undefined` se trata igual que `null`: nadie contó", () => {
    expect(compararCajasPresentes(undefined, 3).estado).toBe("sin_recuento");
  });

  it("CERO DECLARADO es válido y NO es «sin recuento»", () => {
    // Un apiario vaciado se cuenta como cero, y ese cero es un dato. Confundirlo con «no conté»
    // perdería exactamente el caso más grave.
    const c = compararCajasPresentes(0, 4);
    expect(c.estado).toBe("divergen");
    expect(c.diferencia).toBe(-4);
    expect(avisoDeCajas(c)).toEqual({ faltan: 4 });
  });

  it("y cero en los dos lados coincide, sin aviso", () => {
    expect(compararCajasPresentes(0, 0).estado).toBe("coinciden");
  });
});

describe("lo que rechaza", () => {
  it("un recuento declarado que no puede ser un recuento", () => {
    expect(() => compararCajasPresentes(-1, 10)).toThrow(CajasPresentesInvalido);
    expect(() => compararCajasPresentes(2.5, 10)).toThrow(/recuento_declarado_invalido/);
    expect(() => compararCajasPresentes(Number.NaN, 10)).toThrow(/recuento_declarado_invalido/);
  });

  it("y una cuenta del sistema imposible, que sería un fallo nuestro y no del operario", () => {
    expect(() => compararCajasPresentes(5, -1)).toThrow(/cuenta_del_sistema_invalida/);
    expect(() => compararCajasPresentes(5, 1.5)).toThrow(/cuenta_del_sistema_invalida/);
  });
});
