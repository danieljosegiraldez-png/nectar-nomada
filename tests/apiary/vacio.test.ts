/**
 * El vocabulario del vacío: la regla de qué cuenta como anotado.
 *
 * **Lo que estas pruebas defienden** es la mitad contraintuitiva: **cero y `false`
 * están anotados**. Un peso de cero kilos es haber abierto la caja y no encontrar
 * miel; un `false` en un tres-estados es haber mirado y no haber visto. Si
 * `estadoDelDato` los diera por vacíos, las pantallas enseñarían «Sin registrar»
 * sobre observaciones que alguien hizo — y ése es el mismo error que ADR-080
 * prohíbe, leído del revés.
 *
 * La función es pura y exportada a propósito: se prueba con la entrada hostil sin
 * construir una colmena.
 */
import { describe, expect, it } from "vitest";
import {
  CLAVE_DEL_VACIO,
  CLAVES_DE_RESPUESTA_QUE_VALE_NINGUNO,
  esRespuestaQueValeNinguno,
  estadoDelDato,
  sinRegistrar,
} from "../../lib/apiary/vacio";

describe("el vocabulario del vacío", () => {
  it("cero y false están ANOTADOS — es la mitad que importa", () => {
    expect(estadoDelDato(0)).toBe("registrado");
    expect(estadoDelDato(false)).toBe("registrado");
    expect(estadoDelDato(0n as unknown)).toBe("registrado");
    // Y el atajo de lectura no los esconde.
    expect(sinRegistrar(0)).toBe(false);
    expect(sinRegistrar(false)).toBe(false);
  });

  it("nada, cadena vacía y sólo espacios no están anotados", () => {
    expect(estadoDelDato(null)).toBe("sin_registrar");
    expect(estadoDelDato(undefined)).toBe("sin_registrar");
    expect(estadoDelDato("")).toBe("sin_registrar");
    expect(estadoDelDato("   ")).toBe("sin_registrar");
    expect(estadoDelDato("\n\t")).toBe("sin_registrar");
  });

  it("NaN no está anotado, y se afirma antes de compararlo con nada", () => {
    // Una comparación con NaN siempre sale falsa, así que un NaN que se cuele como
    // «registrado» produce el veredicto que halaga a quien mide. Se corta aquí.
    expect(estadoDelDato(Number.NaN)).toBe("sin_registrar");
    expect(estadoDelDato(Number("no es un número"))).toBe("sin_registrar");
    // Control: los otros dos valores raros de coma flotante SÍ son números medidos.
    expect(estadoDelDato(Number.POSITIVE_INFINITY)).toBe("registrado");
    expect(estadoDelDato(-0)).toBe("registrado");
  });

  it("una lista vacía no está anotada; con una lectura, sí", () => {
    expect(estadoDelDato([])).toBe("sin_registrar");
    expect(estadoDelDato([{ valor: 17.5 }])).toBe("registrado");
  });

  it("un objeto o una fecha cuentan como anotados", () => {
    expect(estadoDelDato(new Date("2026-09-13"))).toBe("registrado");
    expect(estadoDelDato({})).toBe("registrado");
  });

  it("la lista de respuestas que valen «ninguno» es explícita y no adivina", () => {
    expect(esRespuestaQueValeNinguno("varroaEvaluatesNone")).toBe(true);
    expect(esRespuestaQueValeNinguno("colonyEndCauseNo")).toBe(true);
    // Control negativo: las de familia `vacio` NO están, y por eso van sin texto.
    expect(esRespuestaQueValeNinguno("triNoRegistrado")).toBe(false);
    expect(esRespuestaQueValeNinguno("treatmentTargetUnset")).toBe(false);
    expect(esRespuestaQueValeNinguno(CLAVE_DEL_VACIO)).toBe(false);
    // Y no hay duplicados: una clave declarada dos veces esconde un desacuerdo.
    expect(new Set(CLAVES_DE_RESPUESTA_QUE_VALE_NINGUNO).size).toBe(
      CLAVES_DE_RESPUESTA_QUE_VALE_NINGUNO.length,
    );
  });
});
