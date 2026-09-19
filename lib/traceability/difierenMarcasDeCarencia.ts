/**
 * Si la foto de carencia de una cosecha (`HarvestWithdrawalFlag`, escrita al
 * cosechar) sigue diciendo lo mismo que el cálculo de HOY sobre las
 * intervenciones vigentes a esa fecha — Tarea 8, ronda de arreglos 1
 * (importante #2, hueco de spec §3.4 confirmado por el controlador).
 *
 * **El hueco que esto cierra.** La página del lote sólo mostraba el aviso «la
 * aplicación se corrigió después» dentro de la caja de carencia, y esa caja
 * sólo se pintaba si la FOTO tenía al menos una marca. Una cosecha que se
 * hizo sin ninguna carencia vigente, y que DESPUÉS una corrección deja en
 * carencia a esa misma fecha, no tenía dónde decirlo: cero marcas en la foto
 * apagaba la caja entera, aviso incluido. La comparación es la misma con foto
 * vacía o no — así que se saca aparte y se llama siempre.
 *
 * Puro: compara dos listas, sin importar el orden en que llegaron.
 */
export interface MarcaDeCarencia {
  readonly interventionId: string;
  readonly diasQueFaltaban: number | null;
}

const ordenar = (xs: readonly MarcaDeCarencia[]) => [...xs].sort((a, b) => a.interventionId.localeCompare(b.interventionId));

export function difierenMarcasDeCarencia(foto: readonly MarcaDeCarencia[], calculoDeHoy: readonly MarcaDeCarencia[]): boolean {
  return JSON.stringify(ordenar(foto)) !== JSON.stringify(ordenar(calculoDeHoy));
}
