import { prisma } from "../../lib/db";

/**
 * Borra los vínculos lote↔recepción de unas recepciones, sólo para limpiar una corrida.
 *
 * El disparador `lote_desde_recepcion_inmutable` rechaza `DELETE` a propósito: el origen de un lote
 * no se reescribe. Apagarlo con `ALTER TABLE … DISABLE TRIGGER` lo apagaría **para todas las
 * sesiones** —la base de pruebas es compartida— y toma un lock exclusivo de la tabla.
 * `session_replication_role` es de sesión, y con `SET LOCAL` dentro de la transacción vuelve solo
 * al confirmar, así que la ventana sin guardia es esta transacción y nada más.
 */
export async function borrarVinculosDeLote(recepcionIds: readonly string[]) {
  if (recepcionIds.length === 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");
    await tx.loteDesdeRecepcion.deleteMany({ where: { recepcionId: { in: [...recepcionIds] } } });
  });
}
