import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLocationAttributeAccess } from "./locations";

export class PlotBlockValidationError extends Error {}

export interface CreatePlotBlockInput {
  locationId: string;
  name: string;
  notes?: string | null;
}

/** F2 §3 — un bloque es una zona con nombre dentro de una parcela. */
export async function createPlotBlock(userAccountId: string, input: CreatePlotBlockInput) {
  const name = input.name.trim();
  if (!name) throw new PlotBlockValidationError("block_name_required");

  await requireLocationAttributeAccess(userAccountId, input.locationId);

  try {
    return await prisma.$transaction(async (tx) => {
      const bloque = await tx.plotBlock.create({
        data: { locationId: input.locationId, name, notes: input.notes ?? null, createdBy: userAccountId },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "plot_block.create",
          entityType: "plot_block",
          entityId: bloque.id,
          after: bloque,
          sourceInterface: "traceability.service",
        },
        tx,
      );
      return bloque;
    });
  } catch (error) {
    // El unique de la base es la red: dos operadores a la vez no crean el mismo bloque.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PlotBlockValidationError("block_name_taken");
    }
    throw error;
  }
}

export async function listPlotBlocks(userAccountId: string, locationId: string) {
  await requireLocationAttributeAccess(userAccountId, locationId);
  return prisma.plotBlock.findMany({ where: { locationId }, orderBy: { name: "asc" } });
}
