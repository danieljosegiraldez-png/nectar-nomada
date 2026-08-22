/**
 * Phase 1, ticket T8 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §17, §34). Simpler than T6/T7: storage doesn't change a Lot's identity,
 * so there's no bracketing stage_change LotTransformation pair — just a
 * direct lotId FK on StorageAssignment.
 *
 * Location history is preserved by never updating endedAt retroactively
 * past the truth: moving a lot's storage location closes the prior open
 * assignment (endedAt set once, at the actual move time) and creates a
 * *new* StorageAssignment row, rather than mutating locationId in place.
 */
import { prisma } from "../db";
import { requireLotAccess, TraceabilityAccessError } from "./lots";

export interface MoveLotToStorageInput {
  lotId: string;
  locationId: string;
  containerNote?: string | null;
  startedAt: Date;
}

export async function moveLotToStorage(userAccountId: string, input: MoveLotToStorageInput) {
  const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);

  return prisma.$transaction(async (tx) => {
    const openAssignment = await tx.storageAssignment.findFirst({
      where: { lotId: input.lotId, endedAt: null },
    });
    if (openAssignment) {
      await tx.storageAssignment.update({
        where: { id: openAssignment.id },
        data: { endedAt: input.startedAt },
      });
    }

    return tx.storageAssignment.create({
      data: {
        lotId: input.lotId,
        locationId: input.locationId,
        containerNote: input.containerNote ?? null,
        startedAt: input.startedAt,
        createdBy: userAccountId,
      },
    });
  });
}

export async function getCurrentStorageAssignment(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);

  return prisma.storageAssignment.findFirst({ where: { lotId, endedAt: null } });
}
