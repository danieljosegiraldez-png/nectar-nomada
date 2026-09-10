import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  exigeProcedencia,
  ProcedenciaInvalida,
  PROCEDENCIA_DE_MEDICION,
  PROCEDENCIA_DE_REGISTRO_DE_CAMPO,
  PROCEDENCIA_DE_SIEMBRA,
  PROCEDENCIA_DE_ANALISIS,
  PROCEDENCIA_DE_BIOCHAR,
} from "../../lib/traceability/procedencia";

/**
 * Lo que el servidor acepta como procedencia es lo que la pantalla ofrece.
 *
 * **El defecto, medido el 2026-09-08.** El enum `ProvenanceClass` tiene diez
 * valores; los formularios ofrecen cinco. En `app/actions/traceability.ts` la
 * cadena del formulario entraba en el enum con `as never` en **once** sitios:
 * un envío con `provenanceClass=ai_suggestion` sobre un formulario que ofrece
 * dos opciones **se guardaba**, porque `ai_suggestion` es un valor válido del
 * enum. Eso hace falsa justo la distinción que `CLAUDE.md` §3 pone primero.
 *
 * `as never` no convierte nada: apaga al compilador. Por eso el guardia mira la
 * fuente — es la misma forma que `use-server-solo-async` y el de doble toque.
 *
 * **Lo que NO prueba:** que los conjuntos sean los correctos. Que una medición
 * pueda declararse `interpretation` y una calicata no, es una decisión de
 * producto anotada en `SESSION_STATE.md` §3. Esto comprueba que están
 * declarados y que el servidor no acepta más de lo que se pinta.
 */
const RAIZ = new URL("../..", import.meta.url).pathname;

function acciones(): string[] {
  return execFileSync("find", ["app/actions", "-name", "*.ts"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .sort();
}

describe("la procedencia que acepta el servidor", () => {
  it("ninguna acción mete la cadena del formulario en el enum con `as never`", () => {
    const culpables: string[] = [];
    for (const archivo of acciones()) {
      const fuente = readFileSync(`${RAIZ}${archivo}`, "utf8");
      for (const [i, linea] of fuente.split("\n").entries()) {
        if (linea.includes("provenanceClass") && linea.includes("as never")) {
          culpables.push(`${archivo}:${i + 1}`);
        }
      }
    }
    expect(culpables, `estas líneas dejan pasar los diez valores del enum: ${culpables.join(", ")}`).toEqual([]);
  });

  /**
   * El control positivo del anterior: sin esto, un detector que no encontrara
   * nunca nada —porque busca mal, o mira donde no es— pasaría igual de verde.
   */
  it("y el detector encuentra algo cuando lo hay", () => {
    const linea = `      provenanceClass: String(formData.get("provenanceClass") ?? "") as never,`;
    expect(linea.includes("provenanceClass") && linea.includes("as never")).toBe(true);
    // Y comprueba que de verdad lee archivos: hay acciones que mirar.
    expect(acciones().length).toBeGreaterThan(5);
  });

  it("todos los conjuntos declarados tienen valores, y ninguno repite", () => {
    for (const conjunto of [
      PROCEDENCIA_DE_MEDICION,
      PROCEDENCIA_DE_REGISTRO_DE_CAMPO,
      PROCEDENCIA_DE_SIEMBRA,
      PROCEDENCIA_DE_ANALISIS,
      PROCEDENCIA_DE_BIOCHAR,
    ]) {
      expect(conjunto.length).toBeGreaterThan(0);
      expect(new Set(conjunto).size, `${conjunto.join(",")} repite un valor`).toBe(conjunto.length);
    }
  });
});

describe("exigeProcedencia", () => {
  it("devuelve la que la pantalla ofrecía", () => {
    expect(exigeProcedencia("direct_observation", PROCEDENCIA_DE_REGISTRO_DE_CAMPO)).toBe("direct_observation");
  });

  /**
   * El caso que motiva todo esto: un valor **real del enum** que esa pantalla
   * no ofrece. Antes se guardaba; ahora sale con una frase que lo nombra.
   */
  it("rechaza un valor del enum que esa pantalla no ofrece", () => {
    expect(() => exigeProcedencia("ai_suggestion", PROCEDENCIA_DE_REGISTRO_DE_CAMPO)).toThrow(
      /provenance_not_offered:ai_suggestion/,
    );
    // Y el mismo valor SÍ pasa donde la pantalla lo ofrece — el control de que
    // no está rechazando por ser quien es, sino por dónde se envió.
    expect(exigeProcedencia("interpretation", PROCEDENCIA_DE_MEDICION)).toBe("interpretation");
    expect(() => exigeProcedencia("interpretation", PROCEDENCIA_DE_ANALISIS)).toThrow(/not_offered/);
  });

  it("rechaza el vacío y el nulo: los seis selects son `required`", () => {
    for (const v of ["", "   ", null]) {
      expect(() => exigeProcedencia(v, PROCEDENCIA_DE_MEDICION)).toThrow(new ProcedenciaInvalida("provenance_required"));
    }
  });

  it("rechaza algo que ni siquiera es del enum", () => {
    expect(() => exigeProcedencia("lo_que_sea", PROCEDENCIA_DE_SIEMBRA)).toThrow(/not_offered:lo_que_sea/);
  });

  it("no recorta ni normaliza: devuelve el valor del enum, no la cadena recibida", () => {
    const r = exigeProcedencia("  measured_fact  ", PROCEDENCIA_DE_BIOCHAR);
    expect(r).toBe("measured_fact");
  });
});
