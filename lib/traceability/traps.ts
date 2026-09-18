import { Prisma } from "../../generated/prisma/client";
import type { DataQuality, ProvenanceClass } from "../../generated/prisma/client";
import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import type { ScopeTarget } from "../rbac/types";

export class TrapAccessError extends Error {}
export class TrapValidationError extends Error {}

/**
 * F2 §4 — misma compuerta que `specimens.ts`: `specimen:manage`, no la de la
 * parcela (`location:manage_attributes`), porque dar de alta una trampa es
 * gestionar un Specimen, no configurar la parcela.
 */
async function requireTrapAccess(userAccountId: string, locationId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { classification: true, parentLocationId: true },
  });
  if (!location) throw new TrapAccessError("location_not_found");

  const target: ScopeTarget = { scopeType: "location", scopeRefId: locationId };
  if (!(await can(userAccountId, "manage", "specimen", target, location.classification))) {
    throw new TrapAccessError("no_specimen_access");
  }
  return location;
}

export interface CreateTrapInput {
  locationId: string;
  plotBlockId?: string | null;
  installedAt: Date;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
}

/**
 * F2 §4 — alta de una trampa, una por una. El número lo pone el sistema,
 * correlativo por finca, y el operador lo rotula en la botella.
 *
 * La finca es `parentLocationId` y no la organización: los lotes reales de
 * Finca Rosina tienen `organization_id` NULL (medido en la Tarea 2), así que
 * el padre en la jerarquía de `Location` es la finca.
 *
 * `createSpecimen` no se reutiliza: necesita el número correlativo y la
 * finca, que esa función no conoce.
 */
export async function createTrap(userAccountId: string, input: CreateTrapInput) {
  if (Number.isNaN(input.installedAt.getTime())) throw new TrapValidationError("installed_at_invalid");
  if (input.installedAt.getTime() > Date.now()) throw new TrapValidationError("installed_at_in_future");

  const location = await requireTrapAccess(userAccountId, input.locationId);
  const farmLocationId = location.parentLocationId ?? input.locationId;

  if (input.plotBlockId) {
    const bloque = await prisma.plotBlock.findUnique({
      where: { id: input.plotBlockId },
      select: { locationId: true },
    });
    if (!bloque || bloque.locationId !== input.locationId) {
      throw new TrapValidationError("block_not_in_plot");
    }
  }

  // Dos altas a la vez chocan contra @@unique([farmLocationId, trapNumber]):
  // se vuelve a leer el máximo y se reintenta. El unique es la verdad, no la
  // lectura que la precede.
  for (let intento = 0; intento < 5; intento++) {
    const ultimo = await prisma.specimen.aggregate({
      where: { farmLocationId, specimenType: "trap" },
      _max: { trapNumber: true },
    });
    const numero = (ultimo._max.trapNumber ?? 0) + 1;
    try {
      return await prisma.$transaction(async (tx) => {
        const trampa = await tx.specimen.create({
          data: {
            locationId: input.locationId,
            specimenType: "trap",
            commonName: `Trampa ${numero}`,
            plotBlockId: input.plotBlockId ?? null,
            farmLocationId,
            trapNumber: numero,
            notes: input.notes ?? null,
            provenanceClass: input.provenanceClass,
            dataQuality: input.dataQuality ?? null,
            createdBy: userAccountId,
          },
        });
        const instalacion = await tx.specimenObservation.create({
          data: {
            specimenId: trampa.id,
            observationType: "installed",
            observedAt: input.installedAt,
            provenanceClass: input.provenanceClass,
            dataQuality: input.dataQuality ?? null,
            createdBy: userAccountId,
          },
        });
        await recordAuditEvent(
          {
            actorUserAccountId: userAccountId,
            operation: "specimen.create_trap",
            entityType: "specimen",
            entityId: trampa.id,
            after: { trampa, instalacion },
            sourceInterface: "traceability.service",
          },
          tx,
        );
        return trampa;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new TrapValidationError("trap_number_race");
}
