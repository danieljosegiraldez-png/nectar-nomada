import { prisma } from "./db";
import type { Prisma } from "../generated/prisma/client";

/**
 * El cliente con el que escribir: el global, o el de una transacción abierta.
 *
 * `Prisma.TransactionClient` es el tipo que recibe el callback de
 * `$transaction`; acepta las mismas operaciones menos las que abrirían otra
 * transacción, que es exactamente la restricción que queremos.
 */
type EscritorDeAudit = Pick<Prisma.TransactionClient, "auditEvent"> | typeof prisma;

/**
 * SECURITY.md §6 — append-only audit trail. This is the only place in the
 * codebase that writes to `AuditEvent`; every module that needs an audit
 * record (Assignment changes, account status changes, future evidence
 * writes) calls this instead of writing the table directly, so the set of
 * "what always gets audited" stays enforced in one place.
 */
export interface AuditEventInput {
  actorUserAccountId: string | null;
  operation: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  sourceInterface: string;
}

/**
 * `tx` hace que la auditoría se confirme **con** la escritura que la produjo.
 *
 * Sin él, una escritura confirmada podía quedarse sin su `AuditEvent` si esta
 * llamada fallaba después del commit — lo señaló una revisión independiente el
 * 2026-08-31. Es opcional y por defecto usa el cliente global, así que las 89
 * llamadas existentes siguen comportándose igual; se adopta servicio por
 * servicio, no de golpe.
 *
 * **Pasar `tx` obliga a que el llamador NO abra otra transacción dentro**:
 * Prisma no anida transacciones interactivas. Un servicio que llame a otro que
 * abre la suya tiene que hacerlo fuera de la propia.
 */
export async function recordAuditEvent(input: AuditEventInput, tx?: EscritorDeAudit): Promise<void> {
  await (tx ?? prisma).auditEvent.create({
    data: {
      actorUserAccountId: input.actorUserAccountId,
      operation: input.operation,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before === undefined ? undefined : (input.before as object),
      after: input.after === undefined ? undefined : (input.after as object),
      reason: input.reason,
      sourceInterface: input.sourceInterface,
    },
  });
}
