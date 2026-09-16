import type { MaterialState } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import { prisma } from "../db";
import { EquipoError, puedeGestionarEquipo } from "./equipos";

/** Declara el nombre literal de la escala del aparato y su procedencia de calibración. */
export async function declararModoDeInstrumento(
  userAccountId: string,
  input: {
    equipmentId: string;
    label: string;
    materialState: MaterialState;
    rangeMin?: number | null;
    rangeMax?: number | null;
    calibrationOffset?: number | null;
    calibrationMode?: string | null;
    displayOrder?: number;
  },
) {
  if (!(await puedeGestionarEquipo(userAccountId, input.equipmentId))) throw new EquipoError("forbidden");
  const equipo = await prisma.equipment.findUniqueOrThrow({ where: { id: input.equipmentId } });
  if (equipo.kind !== "instrument") throw new EquipoError("solo_los_instrumentos_tienen_modos");
  if (!input.label.trim()) throw new EquipoError("label_required");
  for (const valor of [input.rangeMin, input.rangeMax, input.calibrationOffset]) {
    if (valor != null && !Number.isFinite(valor)) throw new EquipoError("valor_no_finito");
  }
  if (input.rangeMin != null && input.rangeMax != null && input.rangeMin > input.rangeMax) {
    throw new EquipoError("rango_invertido");
  }
  return prisma.$transaction(async (tx) => {
    const modo = await tx.instrumentMeasurementMode.create({
      data: { ...input, createdBy: userAccountId },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        entityType: "instrument_measurement_mode",
        entityId: modo.id,
        operation: "create",
        sourceInterface: "lib/equipos/modosDeInstrumento.ts",
        after: { ...input },
      },
      tx,
    );
    return modo;
  });
}
