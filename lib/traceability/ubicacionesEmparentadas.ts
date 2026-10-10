/**
 * La ubicación, sus ascendientes y sus descendientes — spec fitosanitario §3.3.
 *
 * Para la carencia: una cosecha de la parcela madre puede llevar café de la
 * microparcela tratada, y al revés. Un HERMANO no.
 *
 * Copia de `conAncestros` (`lib/rbac/service.ts`) el tope de profundidad y la
 * guarda de vistos: nada en el esquema impide un `parentLocationId` en ciclo.
 * **No autoriza**: quien la llama ya pasó la compuerta.
 *
 * Con `{ soloDescendientes: true }` devuelve la ubicación y sus descendientes,
 * **sin ascendientes** — ADR-196, el enrollado del rendimiento y los
 * especímenes va hacia abajo. Sin la opción, el comportamiento de siempre.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";

const PROFUNDIDAD_MAXIMA_DE_UBICACION = 12;

export async function ubicacionesEmparentadas(
  locationId: string,
  db: Prisma.TransactionClient = prisma,
  opciones?: { soloDescendientes?: boolean },
): Promise<string[]> {
  const vistos = new Set<string>([locationId]);

  // **La dirección importa y es una decisión, no un detalle (ADR-196).** Para la
  // carencia hacen falta las dos: una cosecha de la parcela madre puede llevar
  // café de la microparcela tratada, y al revés. Para el rendimiento, las
  // cohortes, los eventos de producción y los especímenes, NO: una ficha de
  // microparcela que mostrara las cosechas de su madre contaría dos veces el
  // mismo café. Por eso es una opción y no el comportamiento por omisión — los
  // cuatro llamadores de hoy no cambian.
  if (!opciones?.soloDescendientes) {
    let actual: string | null = locationId;
    for (let i = 0; i < PROFUNDIDAD_MAXIMA_DE_UBICACION && actual; i += 1) {
      const fila: { parentLocationId: string | null } | null = await db.location.findUnique({
        where: { id: actual }, select: { parentLocationId: true },
      });
      const padre: string | null = fila?.parentLocationId ?? null;
      if (!padre || vistos.has(padre)) break;
      vistos.add(padre);
      actual = padre;
    }
  }

  let frontera = [locationId];
  for (let i = 0; i < PROFUNDIDAD_MAXIMA_DE_UBICACION && frontera.length > 0; i += 1) {
    const hijos = await db.location.findMany({ where: { parentLocationId: { in: frontera } }, select: { id: true } });
    frontera = hijos.map((h) => h.id).filter((id) => !vistos.has(id));
    for (const id of frontera) vistos.add(id);
  }
  return [...vistos];
}
