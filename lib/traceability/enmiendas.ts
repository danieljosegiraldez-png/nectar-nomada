import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";

/**
 * A9.3 (D3) — leer el rastro de cambios de una entidad, una vez y bien.
 *
 * **Por qué existe.** Hasta el 2026-09-07 el único lector de `AuditEvent` en
 * pantalla consultaba `entityType: "Lot"` y **nadie escribe nunca esa cadena**:
 * las 95 escrituras usan `snake_case`. El panel «Historial» de un lote
 * afirmaba «este lote no tiene historial» con una consulta que no podía acertar
 * (`PENDING_IMPLEMENTATIONS/009`). Escribir un segundo lector encima del mismo
 * error habría heredado el fallo, así que se escribe uno y se usa.
 *
 * **Y por qué no basta con una cadena.** Los hechos de un lote no se auditan
 * bajo un solo `entityType`: `lot_transformation`, `lot_roast_profile`,
 * `quantity_event`, `measurement` y `harvest_event` son todos hechos DE ese
 * lote. Un lector por una cadena enseñaría un quinto de su historia y parecería
 * completo, que es peor que enseñar cero.
 *
 * `@@index([entityType, entityId])` hace barata la consulta por cada par.
 */
export interface Enmienda {
  id: string;
  occurredAt: Date;
  operation: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  sourceInterface: string;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
}

/**
 * Lee el rastro de una entidad y, opcionalmente, el de los hechos que le
 * cuelgan. `sujetos` es una lista de pares porque un lote y su cosecha son
 * `entityType` distintos y la misma historia.
 *
 * **No comprueba permisos a propósito.** Se llama desde servicios que ya
 * resolvieron el acceso a la entidad —`getLotDetail` lo hace antes—, y
 * añadirle una compuerta propia daría dos sitios donde decidir lo mismo. Por
 * eso no recibe `userAccountId`: para que no parezca que autoriza.
 */
export async function leerEnmiendas(
  sujetos: ReadonlyArray<{ entityType: string; entityId: string }>,
  opciones: { limite?: number } = {},
): Promise<Enmienda[]> {
  if (sujetos.length === 0) return [];
  return prisma.auditEvent.findMany({
    where: { OR: sujetos.map((s) => ({ entityType: s.entityType, entityId: s.entityId })) },
    orderBy: { occurredAt: "desc" },
    take: opciones.limite ?? 50,
    select: {
      id: true,
      occurredAt: true,
      operation: true,
      entityType: true,
      entityId: true,
      reason: true,
      sourceInterface: true,
      before: true,
      after: true,
    },
  });
}
