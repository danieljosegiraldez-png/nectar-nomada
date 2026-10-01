/**
 * La línea de seis etapas del proceso: qué cuenta cada una, y cuáles NO se registran.
 *
 * **Lo que estas pruebas existen para impedir.** Un cero y un «sin registro» no son lo mismo: un
 * cero dice «no hay nada ahí», y tres etapas no pueden decir eso (decisión de Daniel del
 * 2026-09-30, ADR-195):
 * - la **flotación** es un método de una selección (`LotTransformation.selectionMethodValue`,
 *   medido el 2026-09-30 contra `prisma/schema.prisma`), no una etapa: un método pasado no dice
 *   cuánto hay ahora;
 * - la **recepción** y la **selección** son actos pasados, sin fin: contarlas da un acumulado
 *   —cuántos lotes pasaron alguna vez—, mientras proceso, secado y almacén cuentan lo que hay
 *   ahora. Con una temporada encima, «Recepción 847 · Secado 3».
 * Si una de las tres pintara `0` o un acumulado, el operario leería que no hay café ahí o que hay
 * mucho, cuando lo que pasa es que el sistema no lo sabe. Un refactor mecánico aplasta esa
 * diferencia sin avisar, de ahí la primera prueba.
 *
 * Hermética: sin base, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { describe, expect, it } from "vitest";
import { lineaDeEtapas } from "../../lib/beneficio/lineaDeEtapas";

describe("lineaDeEtapas", () => {
  it("recepción, flotación y selección dicen «sin registro», nunca 0; las otras tres cuentan", () => {
    const etapas = lineaDeEtapas({ proceso: 0, secado: 0, almacen: 0, pidenDecision: {} });
    const porClave = new Map(etapas.map((e) => [e.clave, e.estado]));
    for (const clave of ["recepcion", "flotacion", "seleccion"] as const) {
      expect(porClave.get(clave), clave).toEqual({ tipo: "sin_registro" });
    }
    // Y el control que hace que esto signifique algo: las tres que SÍ se registran y están
    // vacías dicen `cuenta` con 0. Sin él, «dicen sin_registro» pasaría igual si TODA la línea
    // lo dijera.
    for (const clave of ["proceso", "secado", "almacen"] as const) {
      expect(porClave.get(clave), clave).toEqual({ tipo: "cuenta", lotes: 0, pidenDecision: 0 });
    }
    expect(etapas.filter((e) => e.estado.tipo === "sin_registro")).toHaveLength(3);
    expect(etapas.filter((e) => e.estado.tipo === "cuenta")).toHaveLength(3);
  });

  it("las seis van en el orden del proceso, no alfabético", () => {
    const etapas = lineaDeEtapas({ proceso: 1, secado: 1, almacen: 1, pidenDecision: {} });
    expect(etapas.map((e) => e.clave)).toEqual([
      "recepcion",
      "flotacion",
      "seleccion",
      "proceso",
      "secado",
      "almacen",
    ]);
  });

  it("pidenDecision viaja por etapa, y 0 donde no hay nada que decidir", () => {
    // §4.5: «Una etapa sólo se colorea cuando algo en ella pide atención». La función no pinta,
    // pero sí dice cuántos lotes piden decisión, para que la pantalla coloree sólo esos.
    const etapas = lineaDeEtapas({ proceso: 3, secado: 1, almacen: 4, pidenDecision: { proceso: 2 } });
    const porClave = new Map(etapas.map((e) => [e.clave, e.estado]));
    expect(porClave.get("proceso")).toEqual({ tipo: "cuenta", lotes: 3, pidenDecision: 2 });
    expect(porClave.get("secado")).toEqual({ tipo: "cuenta", lotes: 1, pidenDecision: 0 });
    // Las seis posiciones a la vez, con tres cuentas distintas entre sí: intercambiar dos
    // entradas del mapeo (proceso por almacén) pasaba las aserciones de arriba en verde.
    // `almacen` es 4 y no 0 para que el `?? 0` de la función no enmascare un mapeo perdido.
    expect(etapas.map((e) => (e.estado.tipo === "cuenta" ? e.estado.lotes : null))).toEqual([
      null,
      null,
      null,
      3,
      1,
      4,
    ]);
  });

  it("una `pidenDecision` dirigida a una etapa sin registro no la convierte en cuenta", () => {
    // Una cola de atención podría traer una clave de recepción o selección. Sin cuenta que
    // acompañe, la etapa sigue diciendo que no hay registro; no aparece un «0 lotes · 2 piden».
    const etapas = lineaDeEtapas({
      proceso: 0,
      secado: 0,
      almacen: 0,
      pidenDecision: { recepcion: 2, flotacion: 2, seleccion: 2 },
    });
    expect(etapas.slice(0, 3).map((e) => e.estado)).toEqual([
      { tipo: "sin_registro" },
      { tipo: "sin_registro" },
      { tipo: "sin_registro" },
    ]);
  });
});
