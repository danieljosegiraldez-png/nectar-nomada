import { prisma } from "./db";

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

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  await prisma.auditEvent.create({
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
