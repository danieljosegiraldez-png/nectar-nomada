/**
 * La línea de seis etapas del proceso: qué cuenta cada una, y cuál NO se registra.
 *
 * **Lo que estas pruebas existen para impedir.** Un cero y un «sin registro» no son lo mismo: un
 * cero dice «no hay nada ahí», y la flotación no puede decir eso porque el esquema no la anota
 * (medido el 2026-09-30 contra `prisma/schema.prisma`: sus únicas menciones son un umbral del
 * pedido y parte de un veredicto, no un acto registrado por lote). Si la columna pintara `0`, el
 * operario leería que no hay café flotando cuando lo que pasa es que el sistema no lo sabe. Un
 * refactor mecánico aplasta esa diferencia sin avisar, de ahí la primera prueba.
 *
 * Hermética: sin base, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { describe, expect, it } from "vitest";
import { lineaDeEtapas } from "../../lib/beneficio/lineaDeEtapas";

describe("lineaDeEtapas", () => {
  it("la flotación dice «sin registro», nunca 0: nadie la anota", () => {
    const etapas = lineaDeEtapas({
      recepcion: 0,
      seleccion: 0,
      proceso: 0,
      secado: 0,
      almacen: 0,
      pidenDecision: {},
    });
    const flot = etapas.find((e) => e.clave === "flotacion")!;
    expect(flot.estado.tipo).toBe("sin_registro");
    // Y el control que hace que esto signifique algo: una etapa que SÍ se registra y está
    // vacía dice `cuenta` con 0. Sin él, «sin_registro» podría ser lo que devuelve siempre.
    const rec = etapas.find((e) => e.clave === "recepcion")!;
    expect(rec.estado).toEqual({ tipo: "cuenta", lotes: 0, pidenDecision: 0 });
  });

  it("las seis van en el orden del proceso, no alfabético", () => {
    const etapas = lineaDeEtapas({
      recepcion: 1,
      seleccion: 1,
      proceso: 1,
      secado: 1,
      almacen: 1,
      pidenDecision: {},
    });
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
    const etapas = lineaDeEtapas({
      recepcion: 5,
      seleccion: 2,
      proceso: 3,
      secado: 1,
      almacen: 0,
      pidenDecision: { proceso: 2 },
    });
    const porClave = new Map(etapas.map((e) => [e.clave, e.estado]));
    expect(porClave.get("proceso")).toEqual({ tipo: "cuenta", lotes: 3, pidenDecision: 2 });
    expect(porClave.get("secado")).toEqual({ tipo: "cuenta", lotes: 1, pidenDecision: 0 });
  });
});
