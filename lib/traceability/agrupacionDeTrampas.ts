/**
 * Las trampas de una finca agrupadas como se trabajan en el campo: **por parcela → sus
 * microparcelas → sus bloques**.
 *
 * Daniel, 2026-09-21, recorriendo `/finca/trampas` en producción: «its not a generalized
 * system, its just for each farm by microparcela o parcela in blocks». Hasta entonces la
 * pantalla era una tabla plana, una fila por trampa con la parcela y el bloque en columnas.
 *
 * Puro, sin `prisma`: lo decide sólo con lo que ya devuelve `getFincaTrampas`, y así se prueba
 * con entradas hechas a propósito —microparcelas huérfanas, parcelas sin trampas— en vez de a
 * través de un corpus que quizá no las tenga.
 */
import type { PlotBlockType } from "../../generated/prisma/client";

export interface LoteDeTrampas {
  id: string;
  name: string;
  /** La parcela que la contiene si es una microparcela; `null` si cuelga directamente del sitio. */
  parentPlotId: string | null;
}

export interface TrampaAgrupable {
  plotId: string;
  plotBlockId: string | null;
  bloque: { name: string; blockType: PlotBlockType | null } | null;
}

export interface GrupoDeBloque<T extends TrampaAgrupable> {
  plotBlockId: string | null;
  bloque: T["bloque"];
  trampas: T[];
}

export interface GrupoDeLote<T extends TrampaAgrupable> {
  lote: LoteDeTrampas;
  /** Las trampas de ESTE lote, por bloque. Las que no tienen bloque van en el último grupo. */
  bloques: GrupoDeBloque<T>[];
  microparcelas: GrupoDeLote<T>[];
}

function porBloque<T extends TrampaAgrupable>(trampas: T[]): GrupoDeBloque<T>[] {
  const grupos = new Map<string | null, GrupoDeBloque<T>>();
  for (const t of trampas) {
    const g: GrupoDeBloque<T> = grupos.get(t.plotBlockId) ?? { plotBlockId: t.plotBlockId, bloque: t.bloque, trampas: [] };
    g.trampas.push(t);
    grupos.set(t.plotBlockId, g);
  }
  // Por nombre de bloque, y las trampas sin bloque al final: son las que hay que ubicar.
  return [...grupos.values()].sort((a, b) => {
    if (!a.bloque) return 1;
    if (!b.bloque) return -1;
    return a.bloque.name.localeCompare(b.bloque.name);
  });
}

/**
 * Sólo salen los lotes con alguna trampa, propia o de sus microparcelas. Una microparcela cuya
 * parcela no está en la lista —quien mira puede ver la microparcela y no la parcela— sube a
 * parcela en vez de perderse. Conserva el orden de `lotes` y el de las trampas dentro de cada
 * bloque, que ya llegan ordenados.
 */
export function agruparTrampasPorParcela<T extends TrampaAgrupable>(
  lotes: readonly LoteDeTrampas[],
  trampas: readonly T[],
): GrupoDeLote<T>[] {
  const ids = new Set(lotes.map((l) => l.id));
  const trampasDe = new Map<string, T[]>();
  for (const t of trampas) trampasDe.set(t.plotId, [...(trampasDe.get(t.plotId) ?? []), t]);

  const grupo = (l: LoteDeTrampas): GrupoDeLote<T> => ({
    lote: l,
    bloques: porBloque(trampasDe.get(l.id) ?? []),
    microparcelas: lotes
      .filter((m) => m.parentPlotId === l.id)
      .map(grupo)
      .filter(tieneTrampas),
  });
  const tieneTrampas = (g: GrupoDeLote<T>): boolean => g.bloques.length > 0 || g.microparcelas.length > 0;

  return lotes
    .filter((l) => l.parentPlotId === null || !ids.has(l.parentPlotId))
    .map(grupo)
    .filter(tieneTrampas);
}
