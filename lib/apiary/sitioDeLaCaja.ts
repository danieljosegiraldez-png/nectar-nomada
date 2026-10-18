import { mostrarFecha, ZONA_POR_DEFECTO } from "../time/mostrarInstante";

/**
 * **En qué sitio estaba una caja un día.** La regla que decidió Daniel el 2026-10-08 (V-H2 de la
 * revisión del Apiario), escrita una sola vez:
 *
 * - el traslado es de **día** (ADR-112): `trasladarColmenas` cierra la colocación de origen y abre
 *   la de destino a medianoche UTC del día que se teclea;
 * - **la caja sigue en el origen todo ese día y cuenta en el destino desde el siguiente**. De las
 *   colocaciones que tocan el día, manda la más antigua;
 * - el día de un instante se mide **en la zona del sitio**, `ZONA_POR_DEFECTO` si no la declara.
 *
 * Hasta entonces convivían dos lecturas: `apiarioDeColmenaEn` contaba la caja en el destino el día
 * del traslado («el intervalo es semiabierto»), cosa que no salía de ningún ADR, y el tablero de
 * sitios ni siquiera miraba las colocaciones.
 *
 * Pura, sin `prisma`: quien la usa trae las colocaciones. Sin colocación que toque el día devuelve
 * `null` —«no consta»—, y es quien llama el que decide qué hacer con eso.
 */

export interface Colocacion {
  locationId: string;
  startedAt: Date;
  endedAt: Date | null;
}

const DIA_MS = 24 * 3600_000;

/** El día de `instante` en la zona del sitio, como campo de día: medianoche UTC. */
export function diaDelSitio(instante: Date, zona: string | null | undefined): Date {
  return new Date(`${mostrarFecha(instante, zona ?? ZONA_POR_DEFECTO)}T00:00:00.000Z`);
}

/** El `where` de Prisma con las colocaciones que tocan ese día: la misma condición que `sitioEnElDia`. */
export function tocaElDia(dia: Date) {
  return { startedAt: { lt: new Date(dia.getTime() + DIA_MS) }, OR: [{ endedAt: null }, { endedAt: { gte: dia } }] };
}

/** El sitio de la colocación más antigua que toca el día, o `null` si ninguna lo toca. */
export function sitioEnElDia(colocaciones: readonly Colocacion[], dia: Date): string | null {
  const fin = dia.getTime() + DIA_MS;
  let mejor: Colocacion | null = null;
  for (const c of colocaciones) {
    if (c.startedAt.getTime() >= fin) continue;
    if (c.endedAt != null && c.endedAt.getTime() < dia.getTime()) continue;
    if (!mejor || c.startedAt < mejor.startedAt) mejor = c;
  }
  return mejor?.locationId ?? null;
}
