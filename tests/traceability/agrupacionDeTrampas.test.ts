/**
 * Las trampas de una finca, agrupadas por parcela → sus microparcelas → sus bloques.
 *
 * Daniel, 2026-09-21, recorriendo `/finca/trampas` en producción: «its not a generalized
 * system, its just for each farm by microparcela o parcela in blocks». Función pura, así que
 * se prueba con entradas hechas a propósito para romperla, no a través de un corpus que quizá
 * no tenga microparcelas.
 */
import { describe, expect, it } from "vitest";
import { agruparTrampasPorParcela } from "../../lib/traceability/agrupacionDeTrampas";

const lote = (id: string, name: string, parentPlotId: string | null = null) => ({ id, name, parentPlotId });
const trampa = (id: string, plotId: string, bloque: string | null) => ({
  id,
  plotId,
  plotBlockId: bloque ? `b-${bloque}` : null,
  bloque: bloque ? { name: bloque, blockType: null } : null,
});

describe("agrupar las trampas de una finca", () => {
  it("UNA MICROPARCELA VA DENTRO DE SU PARCELA, no suelta como si fuera otra parcela", () => {
    const grupos = agruparTrampasPorParcela(
      [lote("p1", "La Loma"), lote("m1", "La Loma — micro norte", "p1")],
      [trampa("t1", "p1", "Bloque A"), trampa("t2", "m1", "Bloque B")],
    );
    expect(grupos.map((g) => g.lote.id)).toEqual(["p1"]);
    expect(grupos[0]!.microparcelas.map((m) => m.lote.id)).toEqual(["m1"]);
    expect(grupos[0]!.microparcelas[0]!.bloques[0]!.trampas.map((t) => t.id)).toEqual(["t2"]);
  });

  it("DENTRO DE CADA PARCELA, las trampas van por bloque; las que no tienen bloque, al final", () => {
    const [g] = agruparTrampasPorParcela(
      [lote("p1", "La Loma")],
      [trampa("t1", "p1", null), trampa("t2", "p1", "Bloque B"), trampa("t3", "p1", "Bloque A"), trampa("t4", "p1", "Bloque B")],
    );
    expect(g!.bloques.map((b) => b.bloque?.name ?? null)).toEqual(["Bloque A", "Bloque B", null]);
    expect(g!.bloques[1]!.trampas.map((t) => t.id)).toEqual(["t2", "t4"]); // conserva el orden recibido
  });

  it("UNA PARCELA SIN TRAMPAS NO SALE; una que sólo tiene trampas en su microparcela, sí", () => {
    const grupos = agruparTrampasPorParcela(
      [lote("p1", "Sin trampas"), lote("p2", "Con micro"), lote("m2", "Micro", "p2")],
      [trampa("t1", "m2", "Bloque A")],
    );
    expect(grupos.map((g) => g.lote.id)).toEqual(["p2"]);
    expect(grupos[0]!.bloques).toEqual([]); // la parcela en sí no tiene ninguna
    expect(grupos[0]!.microparcelas.map((m) => m.lote.id)).toEqual(["m2"]);
  });

  it("UNA MICROPARCELA CUYO PADRE NO ESTÁ EN LA LISTA sube a parcela, no se pierde", () => {
    // Pasa cuando quien mira puede ver la microparcela pero no la parcela que la contiene.
    const grupos = agruparTrampasPorParcela([lote("m1", "Micro huérfana", "p-invisible")], [trampa("t1", "m1", "Bloque A")]);
    expect(grupos.map((g) => g.lote.id)).toEqual(["m1"]);
  });

  it("NINGUNA TRAMPA SE PIERDE NI SE DUPLICA al agrupar", () => {
    const trampas = [trampa("t1", "p1", "A"), trampa("t2", "m1", null), trampa("t3", "p2", "B"), trampa("t4", "m1", "A")];
    const grupos = agruparTrampasPorParcela([lote("p1", "Uno"), lote("m1", "Uno micro", "p1"), lote("p2", "Dos")], trampas);
    const todas = grupos.flatMap((g) => [...g.bloques, ...g.microparcelas.flatMap((m) => m.bloques)]).flatMap((b) => b.trampas);
    expect(todas.map((t) => t.id).sort()).toEqual(["t1", "t2", "t3", "t4"]);
  });
});
