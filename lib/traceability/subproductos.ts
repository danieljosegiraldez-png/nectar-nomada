/**
 * Los lotes de subproducto del beneficio: la cascarilla que deja la trilla y la
 * pulpa que deja el despulpado.
 *
 * **Fino sobre la tabla, como `selection.ts` sobre `recordTransformation`.** No
 * es un mecanismo paralelo: valida lo que la base no puede y autoriza contra el
 * lote de origen, y nada más.
 *
 * Spec: docs/superpowers/specs/2026-09-16-reposo-trilla-y-subproductos-design.md §C
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import type { ByproductDestination, ByproductType } from "../../generated/prisma/client";

export class ByproductValidationError extends Error {}

export interface CrearSubproductoInput {
  readonly transformationId: string;
  readonly byproductType: ByproductType;
  readonly destination: ByproductDestination;
  /** Siempre en kg. Cero es válido; negativo no. */
  readonly massKg: number;
  readonly producedAtLocationId: string;
  readonly notes?: string | null;
}

export async function crearSubproducto(userAccountId: string, input: CrearSubproductoInput) {
  // **Cero es un dato, negativo es un error de captura.** Una trilla puede no
  // dejar cascarilla aprovechable —se mojó, se perdió, no se recogió— y eso hay
  // que poder escribirlo. Una masa negativa no significa nada en el mundo.
  if (!Number.isFinite(input.massKg) || input.massKg < 0) {
    throw new ByproductValidationError(`masa inválida: ${input.massKg}. Cero es válido; negativo no.`);
  }

  const transformacion = await prisma.lotTransformation.findUnique({
    where: { id: input.transformationId },
    select: {
      id: true,
      inputs: { select: { lot: { select: { projectId: true, locationId: true, classification: true, organizationId: true } } } },
    },
  });
  if (!transformacion) throw new TraceabilityAccessError("transformation_not_found");

  const lotes = transformacion.inputs.map((i) => i.lot);
  if (lotes.length === 0) throw new ByproductValidationError("la transformación no tiene lote de entrada");

  // Se autoriza contra los lotes de ENTRADA de la transformación, no contra la
  // ubicación de producción: el subproducto es material que salió de un lote
  // concreto, y quien no puede tocar ese lote no puede declarar lo que salió
  // de él. La ubicación dice dónde ocurrió, no de quién es el café.
  await requireLotAccess(userAccountId, "manage", lotes);

  const organizationId = lotes[0]!.organizationId;

  const lote = await prisma.byproductBatch.create({
    data: {
      transformationId: input.transformationId,
      byproductType: input.byproductType,
      destination: input.destination,
      massKg: input.massKg,
      producedAtLocationId: input.producedAtLocationId,
      organizationId,
      notes: input.notes ?? null,
      provenanceClass: "measured_fact",
      createdBy: userAccountId,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "byproduct_batch.create",
    sourceInterface: "traceability.service",
    entityType: "byproduct_batch",
    entityId: lote.id,
    after: lote,
  });

  return lote;
}
