import { Prisma, type PlotBlockType } from "../../generated/prisma/client";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLocationAttributeAccess } from "./locations";

export class PlotBlockValidationError extends Error {}

const TIPOS_DE_BLOQUE: readonly PlotBlockType[] = ["microparcela", "trampa", "experimental"];

export interface CreatePlotBlockInput {
  locationId: string;
  name: string;
  blockType: PlotBlockType;
  description?: string | null;
  notes?: string | null;
}

/** F2 §3 extendido — un bloque es una zona con nombre y tipo dentro de una parcela. */
export async function createPlotBlock(userAccountId: string, input: CreatePlotBlockInput) {
  const name = input.name.trim();
  if (!name) throw new PlotBlockValidationError("block_name_required");
  if (!TIPOS_DE_BLOQUE.includes(input.blockType)) {
    throw new PlotBlockValidationError("block_type_required");
  }

  await requireLocationAttributeAccess(userAccountId, input.locationId);

  try {
    return await prisma.$transaction(async (tx) => {
      const bloque = await tx.plotBlock.create({
        data: {
          locationId: input.locationId,
          name,
          blockType: input.blockType,
          description: input.description ?? null,
          notes: input.notes ?? null,
          createdBy: userAccountId,
        },
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

export interface SetPlotBlockTypeInput {
  plotBlockId: string;
  blockType: PlotBlockType;
  description?: string | null;
}

/**
 * Ajustes pide elegir el tipo de un bloque que ya existía antes de esta migración
 * (ADR-080: nació NULL, no se le supuso uno). También sirve para cambiar el tipo de
 * un bloque que ya lo tenía, o para poner/quitar la descripción: no hay ninguna regla
 * que lo restrinja a "sólo una vez".
 */
export async function setPlotBlockType(userAccountId: string, input: SetPlotBlockTypeInput) {
  if (!TIPOS_DE_BLOQUE.includes(input.blockType)) {
    throw new PlotBlockValidationError("block_type_required");
  }
  const existing = await prisma.plotBlock.findUnique({ where: { id: input.plotBlockId } });
  if (!existing) throw new PlotBlockValidationError("block_not_found");
  await requireLocationAttributeAccess(userAccountId, existing.locationId);

  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.plotBlock.update({
      where: { id: input.plotBlockId },
      data: {
        blockType: input.blockType,
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "plot_block.set_type",
        entityType: "plot_block",
        entityId: actualizado.id,
        before: existing,
        after: actualizado,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return actualizado;
  });
}

export async function listPlotBlocks(userAccountId: string, locationId: string) {
  await requireLocationAttributeAccess(userAccountId, locationId);
  return prisma.plotBlock.findMany({ where: { locationId }, orderBy: { name: "asc" } });
}

/**
 * El prefijo que muestra el TIPO de un bloque, no la palabra «Bloque» a secas — así
 * desaparece «Bloque Bloque Norte»: antes el prefijo se sumaba a un nombre que ya lo
 * llevaba escrito. Pura: el llamador hace `clave ? t(clave, { name }) : block.name`.
 */
export function claveDeTituloDeBloque(
  blockType: PlotBlockType | null,
): "blockTitleMicroparcela" | "blockTitleTrampa" | "blockTitleExperimental" | null {
  if (blockType === "microparcela") return "blockTitleMicroparcela";
  if (blockType === "trampa") return "blockTitleTrampa";
  if (blockType === "experimental") return "blockTitleExperimental";
  return null;
}
