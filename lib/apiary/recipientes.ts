/**
 * La pesada por recipiente — spec docs/superpowers/specs/2026-09-19-cera-y-pesada-por-recipiente-design.md §3.
 *
 * Daniel, 2026-09-19: la miel se pesa **por recipiente**, cada balde o tambor lleno (bruto) y su
 * peso vacío (tara). El neto no se guarda: es bruto − tara. **Si la cosecha tiene recipientes, su
 * peso ES la suma de los netos**, y entra en el libro del lote por el mismo camino que el peso a
 * mano (`asentarPesoDeCosechaEn`): se asienta sólo la diferencia.
 *
 * - Sobre un peso escrito a mano, el primer recipiente lo sustituye (pesar mejor no es corregir),
 *   con el peso anterior en el `before` del AuditEvent de la cosecha.
 * - Quitar el último recipiente **no borra el peso**: «ya no hay recipientes» no es «no salió miel».
 * - `Serializable`: dos recipientes anotados a la vez sumarían sobre un total viejo.
 *
 * Permiso: `apiary:manage` sobre la caja de la cosecha.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { asentarPesoDeCosechaEn } from "./cierreDeCosecha";
import type { Prisma } from "../../generated/prisma/client";

export class RecipienteInvalido extends Error {}

type Tx = Prisma.TransactionClient;

/** La cosecha con su caja, y el permiso ya comprobado. */
async function cosechaGestionable(userAccountId: string, apiaryHarvestEventId: string) {
  const cosecha = await prisma.apiaryHarvestEvent.findUnique({
    where: { id: apiaryHarvestEventId },
    select: { id: true, colony: { select: { hive: { select: { projectId: true, locationId: true } } } } },
  });
  if (!cosecha) throw new ApiaryAccessError("apiary_harvest_not_found");
  await requireApiaryAccess(userAccountId, "manage", [cosecha.colony.hive]);
  return cosecha;
}

function kilos(valor: number, codigo: string) {
  if (!Number.isFinite(valor)) throw new RecipienteInvalido(codigo);
  return valor;
}

/**
 * Suma los netos que quedan y, si queda alguno, fija con ellos el peso de la cosecha y asienta la
 * diferencia en el libro. Devuelve el total, o `null` si no quedan recipientes (el peso se queda).
 * Devuelve un cierre `async (tx) => …`, la forma que `tests/arquitectura/audit-atomico.test.ts`
 * reconoce como «dentro de una transacción» — se usa así: `await recalcularEn(…)(tx)`.
 */
const recalcularEn = (apiaryHarvestEventId: string, userAccountId: string, motivo: string | null) => async (tx: Tx) => {
  const antes = await tx.apiaryHarvestEvent.findUniqueOrThrow({ where: { id: apiaryHarvestEventId } });
  const recipientes = await tx.harvestContainer.findMany({ where: { apiaryHarvestEventId }, select: { grossKg: true, tareKg: true } });
  if (recipientes.length === 0) return null;
  // En gramos enteros para no acumular error de coma flotante en la suma.
  const gramos = recipientes.reduce((t, r) => t + Math.round(Number(r.grossKg) * 1000) - Math.round(Number(r.tareKg) * 1000), 0);
  const totalKg = gramos / 1000;
  await asentarPesoDeCosechaEn(tx, antes, totalKg, userAccountId);
  const despues = await tx.apiaryHarvestEvent.update({ where: { id: apiaryHarvestEventId }, data: { extractedWeightKg: totalKg } });
  await recordAuditEvent(
    {
      actorUserAccountId: userAccountId,
      operation: "apiary_harvest.weigh_containers",
      entityType: "apiary_harvest_event",
      entityId: apiaryHarvestEventId,
      before: antes,
      after: despues,
      reason: motivo ?? undefined,
      sourceInterface: "apiary.containers",
    },
    tx,
  );
  return totalKg;
};

export async function anotarRecipiente(
  userAccountId: string,
  input: { apiaryHarvestEventId: string; label: string; grossKg: number; tareKg: number },
) {
  const cosecha = await cosechaGestionable(userAccountId, input.apiaryHarvestEventId);
  const label = input.label.trim();
  if (!label) throw new RecipienteInvalido("etiqueta_requerida");
  const grossKg = kilos(input.grossKg, "pesos_imposibles");
  const tareKg = kilos(input.tareKg, "pesos_imposibles");
  if (tareKg < 0 || grossKg <= tareKg) throw new RecipienteInvalido("pesos_imposibles");

  try {
    return await prisma.$transaction(
      async (tx) => {
        const recipiente = await tx.harvestContainer.create({
          data: { apiaryHarvestEventId: cosecha.id, label, grossKg, tareKg, createdBy: userAccountId },
        });
        await recordAuditEvent(
          {
            actorUserAccountId: userAccountId,
            operation: "harvest_container.create",
            entityType: "harvest_container",
            entityId: recipiente.id,
            after: recipiente,
            sourceInterface: "apiary.containers",
          },
          tx,
        );
        const totalKg = (await recalcularEn(cosecha.id, userAccountId, null)(tx)) as number;
        return { recipiente, totalKg };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    // El choque de etiqueta lo decide la BASE (índice único): una comprobación previa tendría carrera.
    if (error instanceof Error && /Unique constraint/i.test(error.message)) throw new RecipienteInvalido("etiqueta_repetida");
    throw error;
  }
}

export async function quitarRecipiente(userAccountId: string, input: { containerId: string; reason: string }) {
  const motivo = input.reason.trim();
  if (!motivo) throw new RecipienteInvalido("quitar_sin_motivo");
  const antes = await prisma.harvestContainer.findUnique({ where: { id: input.containerId } });
  if (!antes) throw new RecipienteInvalido("recipiente_no_encontrado");
  await cosechaGestionable(userAccountId, antes.apiaryHarvestEventId);

  return prisma.$transaction(
    async (tx) => {
      await tx.harvestContainer.delete({ where: { id: antes.id } });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "harvest_container.delete",
          entityType: "harvest_container",
          entityId: antes.id,
          before: antes,
          reason: motivo,
          sourceInterface: "apiary.containers",
        },
        tx,
      );
      const totalKg = await recalcularEn(antes.apiaryHarvestEventId, userAccountId, motivo)(tx);
      return { totalKg };
    },
    { isolationLevel: "Serializable" },
  );
}
