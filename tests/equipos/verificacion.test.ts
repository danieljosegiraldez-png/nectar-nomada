import { describe, expect, it } from "vitest";

import {
  avisaFaltaDeRevision,
  confianzaPorVerificacion,
  dentroDeTolerancia,
  estadoDeVerificacion,
  peorConfianza,
  type EstadoDeVerificacion,
  type VerificacionDelInstrumento,
} from "../../lib/equipos/verificacion";

/**
 * La regla de Daniel sobre verificación de instrumentos, escrita donde una
 * regresión la toca.
 *
 * **Lo que más se vigila aquí es que el tiempo NO descalifique.** Es el punto
 * donde su decisión se aparta del documento de diseño y de `02_calibration.md`,
 * y es el que un refactor «de sentido común» rompería primero — porque «vencido»
 * suena a inválido, y aquí significa «se sigue usando, y se dice».
 *
 * Hermético: aritmética y fechas.
 */

const T0 = new Date("2026-03-14T06:00:00-05:00");
const h = (n: number) => new Date(T0.getTime() + n * 3_600_000);
const v = (hora: number, outcome: "pass" | "fail"): VerificacionDelInstrumento => ({
  occurredAt: h(hora),
  outcome,
});

const estado = (
  verificaciones: VerificacionDelInstrumento[],
  momentoH: number,
  horasDeAviso: number | null = null,
) => estadoDeVerificacion({ instrumentoDeclarado: true, verificaciones, horasDeAviso, momento: h(momentoH) });

describe("el contraste verifica; el reloj sólo avisa", () => {
  it("un contraste aprobado deja el instrumento verificado, sin plazo ninguno", () => {
    expect(estado([v(0, "pass")], 10)).toBe("VERIFICADO");
  });

  /**
   * **La prueba que más importa, y la que el documento de diseño habría escrito
   * al revés.** Con vigencia de calendario, mil horas después sería inválido.
   * Con la regla de Daniel, un instrumento sin plazo declarado no vence: lo que
   * lo verifica es haber pasado su contraste.
   */
  it("sin plazo declarado NO vence, por mucho tiempo que pase", () => {
    expect(estado([v(0, "pass")], 1000)).toBe("VERIFICADO");
  });

  it("con plazo declarado, pasado el plazo AVISA — y sigue siendo usable", () => {
    expect(estado([v(0, "pass")], 30, 24)).toBe("REVISION_VENCIDA");
    expect(
      confianzaPorVerificacion("REVISION_VENCIDA"),
      "vencido NO es UNCALIBRATED: UNCALIBRATED se excluye del cálculo, y él dijo que se sigue usando",
    ).not.toBe("UNCALIBRATED");
    expect(
      confianzaPorVerificacion("REVISION_VENCIDA"),
      "pero tampoco VALIDATED: sólo lo validado confirma una crítica",
    ).not.toBe("VALIDATED");
  });

  it("justo en el límite todavía está revisado — un instrumento no se estropea en la hora en punto", () => {
    expect(estado([v(0, "pass")], 24, 24)).toBe("VERIFICADO");
    expect(estado([v(0, "pass")], 24.01, 24)).toBe("REVISION_VENCIDA");
  });

  it("un contraste fallido descalifica, y eso sí excluye del cálculo", () => {
    expect(estado([v(0, "pass"), v(5, "fail")], 10)).toBe("VERIFICACION_FALLIDA");
    expect(confianzaPorVerificacion("VERIFICACION_FALLIDA")).toBe("UNCALIBRATED");
  });

  it("y un contraste bueno POSTERIOR al fallo lo rehabilita", () => {
    expect(estado([v(0, "pass"), v(5, "fail"), v(6, "pass")], 10)).toBe("VERIFICADO");
  });
});

describe("se juzga con lo que se sabía entonces, no con lo de hoy", () => {
  /**
   * Si las verificaciones posteriores contaran, el veredicto de una lectura vieja
   * cambiaría porque el mundo avanzó — y una lectura tomada antes de la primera
   * verificación parecería respaldada por ella.
   */
  it("una verificación posterior a la lectura no la respalda", () => {
    expect(estado([v(20, "pass")], 10)).toBe("SIN_VERIFICACION");
  });

  it("una hecha en el mismo instante sí cuenta", () => {
    expect(estado([v(10, "pass")], 10)).toBe("VERIFICADO");
  });

  /**
   * **El empate lo gana el fallo.** Sin esta regla, el veredicto de calidad de
   * dato dependería del orden en que las filas salieran de la base — que es un
   * detalle de almacenamiento decidiendo si una alerta puede dispararse.
   */
  it("con dos al mismo instante, manda el fallo", () => {
    expect(estado([v(5, "pass"), v(5, "fail")], 10)).toBe("VERIFICACION_FALLIDA");
    expect(estado([v(5, "fail"), v(5, "pass")], 10), "y no depende del orden de la lista").toBe(
      "VERIFICACION_FALLIDA",
    );
  });
});

describe("no saber con qué se midió no es saber que estaba mal", () => {
  /**
   * **Sin esto, desplegar esto apagaría la pantalla entera.** Hoy ninguna lectura
   * declara instrumento; tratar ese hueco como avería excluiría todas del cálculo
   * y el patio vería un tablero en blanco — una regresión disfrazada de rigor.
   */
  it("una lectura sin instrumento declarado no impone confianza ninguna", () => {
    expect(
      estadoDeVerificacion({ instrumentoDeclarado: false, verificaciones: [], horasDeAviso: null, momento: h(10) }),
    ).toBe("SIN_INSTRUMENTO");
    expect(confianzaPorVerificacion("SIN_INSTRUMENTO")).toBeNull();
  });

  it("pero un instrumento declarado y JAMÁS verificado sí queda fuera del cálculo", () => {
    expect(estado([], 10)).toBe("SIN_VERIFICACION");
    expect(confianzaPorVerificacion("SIN_VERIFICACION")).toBe("UNCALIBRATED");
  });
});

describe("la confianza no se promedia: manda la peor", () => {
  it("una lectura impecable con instrumento fallido sigue sin poder confirmar", () => {
    expect(peorConfianza("VALIDATED", "UNCALIBRATED")).toBe("UNCALIBRATED");
  });

  it("y una corregida con instrumento impecable sigue siendo corregida", () => {
    expect(peorConfianza("UNCALIBRATED", "VALIDATED")).toBe("UNCALIBRATED");
  });

  it("es conmutativa, o el resultado dependería del orden de los argumentos", () => {
    const valores = ["VALIDATED", "REVISION_VENCIDA", "RETROSPECTIVE", "UNCALIBRATED"] as const;
    for (const a of valores) {
      for (const b of valores) {
        expect(peorConfianza(a, b), `${a} vs ${b}`).toBe(peorConfianza(b, a));
      }
    }
  });

  /**
   * Control del propio análisis: si alguien añade un valor a `DataConfidence` y
   * olvida la escala, el desconocido NO debe pasar por bueno.
   */
  it("un valor fuera de la escala no gana", () => {
    // @ts-expect-error — a propósito: se prueba el camino del valor desconocido.
    expect(peorConfianza("INVENTADO", "UNCALIBRATED")).toBe("UNCALIBRATED");
  });
});

describe("el aviso llega a la pantalla, que es la otra mitad de la decisión", () => {
  it.each([
    ["REVISION_VENCIDA", true],
    ["VERIFICACION_FALLIDA", true],
    ["SIN_VERIFICACION", true],
    ["VERIFICADO", false],
    ["SIN_INSTRUMENTO", false],
  ] as [EstadoDeVerificacion, boolean][])("%s avisa: %s", (e, esperado) => {
    expect(avisaFaltaDeRevision(e)).toBe(esperado);
  });
});

describe("la tolerancia es absoluta, y el agua a 0 °Bx es la razón", () => {
  /**
   * El primer patrón que Daniel nombró es agua destilada a **0 °Bx**. Con
   * tolerancia relativa, cualquier porcentaje de cero es cero y ese contraste no
   * podría pasar NUNCA — y el síntoma sería «este refractómetro nunca se
   * verifica», que se lee como avería del aparato en vez de error del criterio.
   */
  it("el agua a 0 °Bx pasa con desviación dentro de tolerancia", () => {
    expect(dentroDeTolerancia(0.1, 0, 0.2)).toBe(true);
    expect(dentroDeTolerancia(-0.1, 0, 0.2)).toBe(true);
    expect(dentroDeTolerancia(0.3, 0, 0.2)).toBe(false);
  });

  it("el tampón de pH 4.01 igual", () => {
    expect(dentroDeTolerancia(4.04, 4.01, 0.05)).toBe(true);
    expect(dentroDeTolerancia(4.09, 4.01, 0.05)).toBe(false);
  });

  it("justo en el límite pasa", () => {
    expect(dentroDeTolerancia(0.2, 0, 0.2)).toBe(true);
  });

  it("y un valor imposible no pasa por bueno en vez de estallar", () => {
    expect(dentroDeTolerancia(Number.NaN, 0, 0.2)).toBe(false);
    expect(dentroDeTolerancia(0, Number.NaN, 0.2)).toBe(false);
  });
});
