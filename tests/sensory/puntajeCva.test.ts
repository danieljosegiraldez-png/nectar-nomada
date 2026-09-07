/**
 * El puntaje afectivo del CVA, contra lo que dice la calculadora de la SCA.
 *
 * **Qué son estos números.** Seis lecturas tomadas el 2026-09-06 de
 * `sca.coffee/cuppingscore` —la calculadora pública de la propia SCA—, cada una
 * cambiando una entrada a la vez. No son la fórmula deducida de un PDF: cinco de
 * los siete que tenemos están cifrados. Son mediciones.
 *
 * **Lo que estas pruebas NO demuestran.** Que la fórmula sea la correcta hoy: si
 * la SCA la cambia mañana, seguirán pasando. Demuestran que nuestro cálculo
 * coincide con lo que se midió, y por eso la fecha está escrita.
 *
 * El primer caso es el control positivo de todos los demás: con los ocho al
 * mínimo la calculadora da 58,00, que es el único valor que ya se veía en
 * pantalla sin tocar nada.
 */
import { describe, expect, it } from "vitest";
import {
  ATRIBUTOS_CVA_AFECTIVO,
  PuntajeCvaInvalido,
  puntajeAfectivoCva,
} from "../../lib/sensory/puntajeCva";

/** Los ocho al mismo valor. */
function todos(v: number) {
  return ATRIBUTOS_CVA_AFECTIVO.map(() => v);
}

describe("puntajeAfectivoCva — las seis lecturas de la calculadora de la SCA", () => {
  const medido: ReadonlyArray<[string, { valores: number[]; nu: number; def: number }, number]> = [
    ["los ocho a 1", { valores: todos(1), nu: 0, def: 0 }, 58.0],
    ["sólo Fragrance a 9", { valores: [9, 1, 1, 1, 1, 1, 1, 1], nu: 0, def: 0 }, 63.25],
    ["los ocho a 9", { valores: todos(9), nu: 0, def: 0 }, 100.0],
    ["los ocho a 9 con 1 taza no uniforme", { valores: todos(9), nu: 1, def: 0 }, 98.0],
    ["los ocho a 9 con 1 no uniforme y 1 defectuosa", { valores: todos(9), nu: 1, def: 1 }, 94.0],
    ["los ocho a 9 con 5 y 5", { valores: todos(9), nu: 5, def: 5 }, 70.0],
    ["los ocho a 5", { valores: todos(5), nu: 0, def: 0 }, 79.0],
  ];

  for (const [nombre, entrada, esperado] of medido) {
    it(`${nombre} da ${esperado.toFixed(2)}`, () => {
      expect(
        puntajeAfectivoCva({
          valores: entrada.valores,
          tazasNoUniformes: entrada.nu,
          tazasDefectuosas: entrada.def,
        }),
      ).toBe(esperado);
    });
  }

  it("una taza no uniforme resta 2 y una defectuosa resta 4", () => {
    const base = puntajeAfectivoCva({ valores: todos(7), tazasNoUniformes: 0, tazasDefectuosas: 0 });
    const conNoUniforme = puntajeAfectivoCva({ valores: todos(7), tazasNoUniformes: 1, tazasDefectuosas: 0 });
    const conDefectuosa = puntajeAfectivoCva({ valores: todos(7), tazasNoUniformes: 0, tazasDefectuosas: 1 });
    expect(base - conNoUniforme).toBe(2);
    expect(base - conDefectuosa).toBe(4);
  });
});

describe("puntajeAfectivoCva — lo que rechaza", () => {
  it("rechaza un valor fuera de la escala 1–9", () => {
    // El caso real: un 90 donde iba un 9. Sin esta guarda sale 111,19 —un
    // número plausible en una tabla— porque el `max` del <input> es HTML y un
    // POST hecho a mano no lo ve.
    expect(() =>
      puntajeAfectivoCva({ valores: [90, 1, 1, 1, 1, 1, 1, 1], tazasNoUniformes: 0, tazasDefectuosas: 0 }),
    ).toThrow(PuntajeCvaInvalido);
  });

  it("rechaza un cero: la escala afectiva empieza en 1", () => {
    expect(() => puntajeAfectivoCva({ valores: todos(0), tazasNoUniformes: 0, tazasDefectuosas: 0 })).toThrow(
      PuntajeCvaInvalido,
    );
  });

  it("rechaza que falte un atributo", () => {
    expect(() =>
      puntajeAfectivoCva({ valores: [9, 9, 9, 9, 9, 9, 9], tazasNoUniformes: 0, tazasDefectuosas: 0 }),
    ).toThrow(/8 atributos; llegaron 7/);
  });

  it("rechaza más de cinco tazas", () => {
    expect(() => puntajeAfectivoCva({ valores: todos(9), tazasNoUniformes: 6, tazasDefectuosas: 0 })).toThrow(
      PuntajeCvaInvalido,
    );
  });

  it("rechaza medias tazas", () => {
    expect(() => puntajeAfectivoCva({ valores: todos(9), tazasNoUniformes: 0, tazasDefectuosas: 1.5 })).toThrow(
      PuntajeCvaInvalido,
    );
  });

  it("nombra el atributo que está mal, no el índice", () => {
    expect(() =>
      puntajeAfectivoCva({ valores: [9, 9, 9, 9, 9, 9, 9, 12], tazasNoUniformes: 0, tazasDefectuosas: 0 }),
    ).toThrow(/"Overall"/);
  });
});
