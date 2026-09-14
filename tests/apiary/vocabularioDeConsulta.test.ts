/**
 * El vocabulario de la consulta a vecinos: la cadencia mensual y sus cuatro estados.
 *
 * **Lo que estas pruebas defienden** es la distinción que el Anexo E §4 necesita para que
 * «el sistema lo reclama solo» no se convierta en un aviso que todos ignoran:
 * **`sin_consultar` no es `vencida`**. Un apiario recién creado no ha incumplido nada, y
 * si gritara el primer día nadie volvería a mirar este aviso.
 *
 * Todo puro: se prueba con la entrada hostil sin construir un apiario.
 */
import { describe, expect, it } from "vitest";
import {
  ConsultaInvalida,
  DIAS_DE_AVISO_DE_CONSULTA,
  DIAS_DE_CADENCIA_DE_CONSULTA,
  RESULTADOS_DE_CONSULTA,
  clasificarConsulta,
  diasHastaLaProximaConsulta,
  exigeResultadoDeConsulta,
} from "../../lib/apiary/vocabularioDeConsulta";

const AHORA = new Date("2026-09-14T12:00:00Z");
const DIA = 86_400_000;
const haceDias = (n: number) => new Date(AHORA.getTime() - n * DIA);

describe("el vocabulario de la consulta a vecinos", () => {
  it("nunca consultado NO es vencido — es la distinción que hace útil el aviso", () => {
    expect(clasificarConsulta(null, AHORA)).toBe("sin_consultar");
    expect(clasificarConsulta(undefined, AHORA)).toBe("sin_consultar");
    // Control positivo del contraste: con una consulta vieja SÍ sale vencida.
    expect(clasificarConsulta(haceDias(40), AHORA)).toBe("vencida");
  });

  it("los cuatro estados, en los bordes exactos de la cadencia", () => {
    expect(clasificarConsulta(haceDias(0), AHORA)).toBe("al_dia");
    expect(clasificarConsulta(haceDias(22), AHORA)).toBe("al_dia");
    // 30 − 7 = 23: a partir de ahí entra en la antelación del aviso.
    expect(clasificarConsulta(haceDias(23), AHORA)).toBe("por_vencer");
    expect(clasificarConsulta(haceDias(29), AHORA)).toBe("por_vencer");
    // El día 30 se cumple el mes: vence.
    expect(clasificarConsulta(haceDias(30), AHORA)).toBe("vencida");
    expect(clasificarConsulta(haceDias(365), AHORA)).toBe("vencida");
  });

  it("los días que faltan son negativos cuando ya venció, y por cuánto", () => {
    expect(diasHastaLaProximaConsulta(haceDias(0), AHORA)).toBe(DIAS_DE_CADENCIA_DE_CONSULTA);
    expect(diasHastaLaProximaConsulta(haceDias(28), AHORA)).toBe(2);
    expect(diasHastaLaProximaConsulta(haceDias(30), AHORA)).toBe(0);
    expect(diasHastaLaProximaConsulta(haceDias(35), AHORA)).toBe(-5);
  });

  it("una consulta en el FUTURO no se trata como vencida", () => {
    // Puede pasar al corregir una fecha, y el resultado tiene que ser inocuo y no un
    // «vencida» que mande a alguien a repetir el protocolo.
    const manana = new Date(AHORA.getTime() + DIA);
    expect(clasificarConsulta(manana, AHORA)).toBe("al_dia");
    expect(diasHastaLaProximaConsulta(manana, AHORA)).toBe(DIAS_DE_CADENCIA_DE_CONSULTA + 1);
  });

  it("la cadencia y la antelación son parámetros, no números escondidos", () => {
    // Con una cadencia de 7 días, una consulta de hace 8 está vencida aunque con la
    // cadencia real estaría al día. Es lo que permite probar el borde sin viajar en el
    // tiempo, y lo que dejaría cambiar la cadencia sin reescribir la función.
    expect(clasificarConsulta(haceDias(8), AHORA, 2, 7)).toBe("vencida");
    expect(clasificarConsulta(haceDias(8), AHORA)).toBe("al_dia");
    expect(DIAS_DE_CADENCIA_DE_CONSULTA).toBe(30);
    expect(DIAS_DE_AVISO_DE_CONSULTA).toBe(7);
  });

  it("los tres resultados son cerrados y no adivinan", () => {
    expect([...RESULTADOS_DE_CONSULTA]).toEqual([
      "sin_aplicacion_prevista",
      "aplicacion_prevista",
      "no_se_pudo_consultar",
    ]);
    expect(exigeResultadoDeConsulta("no_se_pudo_consultar")).toBe("no_se_pudo_consultar");
    expect(() => exigeResultadoDeConsulta("")).toThrow(ConsultaInvalida);
    expect(() => exigeResultadoDeConsulta(null)).toThrow(ConsultaInvalida);
    expect(() => exigeResultadoDeConsulta("Aplicacion_Prevista")).toThrow(ConsultaInvalida);
    // Y el que más importa: «no hay aplicación» no se puede colar como ausencia.
    expect(() => exigeResultadoDeConsulta(undefined)).toThrow(/resultado_de_consulta_desconocido/);
  });
});
