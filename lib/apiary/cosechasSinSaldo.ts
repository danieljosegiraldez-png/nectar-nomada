/**
 * Las cosechas pesadas cuyo lote no tiene saldo, y el acto de asentarlo — ADR-166.
 *
 * **De dónde sale el hueco.** Hasta ADR-161 (2026-09-18), el peso de la extracción sólo entraba
 * en el libro del lote si se escribía AL COSECHAR. Completado en el cierre —lo normal: se pesa al
 * extraer— quedaba en `extractedWeightKg` y el lote de miel **sin ningún asiento**, así que nada
 * de lo que se le hiciera después (procesar, envasar, dividir) tenía contra qué cuadrar. ADR-161
 * arregló las cosechas nuevas; las de antes siguen así.
 *
 * **Por qué no un script contra producción.** Esta sesión no escribe en la base de producción.
 * Lo asienta Daniel, cosecha por cosecha, desde la ficha del apiario: cada asiento queda con
 * quién lo hizo y cuándo, que un script por lotes no diría.
 *
 * **Qué cuenta como «sin saldo»: ningún asiento en el libro del lote, de ningún tipo.** Un lote
 * con cualquier asiento —aunque sea un ajuste— ya tiene historia, y sumarle el peso encima podría
 * contarlo dos veces. Ése no se ofrece: se mira a mano.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";

export class SaldoDeCosechaInvalido extends Error {}

export interface CosechaSinSaldo {
  id: string;
  occurredAt: Date;
  extractedWeightKg: number;
  lotId: string;
  lotCode: string;
  hiveId: string;
  hiveIdentifier: string;
}

/**
 * Las cosechas del apiario con peso escrito y lote sin ningún asiento, de la más vieja a la más
 * nueva.
 *
 * **No autoriza y no pide principal**: su único llamador es la ficha del apiario, que la invoca
 * DESPUÉS de que `getApiaryDetail` autorice —y lanza sin permiso—, con el id ya concedido.
 */
export async function cosechasSinSaldo(apiaryId: string): Promise<CosechaSinSaldo[]> {
  const filas = await prisma.apiaryHarvestEvent.findMany({
    where: {
      extractedWeightKg: { not: null },
      colony: { hive: { locationId: apiaryId } },
      resultingLot: { quantityEvents: { none: {} } },
    },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      occurredAt: true,
      extractedWeightKg: true,
      resultingLot: { select: { id: true, lotCode: true } },
      colony: { select: { hive: { select: { id: true, identifier: true } } } },
    },
  });
  return filas.map((f) => ({
    id: f.id,
    occurredAt: f.occurredAt,
    extractedWeightKg: Number(f.extractedWeightKg),
    lotId: f.resultingLot.id,
    lotCode: f.resultingLot.lotCode,
    hiveId: f.colony.hive.id,
    hiveIdentifier: f.colony.hive.identifier,
  }));
}

/**
 * Asienta en el libro del lote el peso que la cosecha ya tiene escrito. **No se teclea ningún
 * número**: se asienta el que está, así que no puede introducir uno distinto.
 *
 * El asiento es `received`, con la fecha de la COSECHA —cuando entró la miel— y la procedencia de
 * la cosecha, igual que el que ADR-161 escribe al cerrar. La comprobación de «sin asientos» se
 * repite DENTRO de la transacción, en `Serializable`: dos pulsaciones a la vez no asientan dos
 * veces.
 */
export async function asentarPesoDeCosecha(userAccountId: string, apiaryHarvestEventId: string) {
  const cosecha = await prisma.apiaryHarvestEvent.findUnique({
    where: { id: apiaryHarvestEventId },
    include: { colony: { include: { hive: true } } },
  });
  if (!cosecha) throw new ApiaryAccessError("apiary_harvest_not_found");
  await requireApiaryAccess(userAccountId, "manage", [
    { projectId: cosecha.colony.hive.projectId, locationId: cosecha.colony.hive.locationId },
  ]);
  if (cosecha.extractedWeightKg === null) throw new SaldoDeCosechaInvalido("cosecha_sin_peso");

  return prisma.$transaction(
    async (tx) => {
      const asientos = await tx.quantityEvent.count({ where: { lotId: cosecha.resultingLotId } });
      if (asientos > 0) throw new SaldoDeCosechaInvalido("el_lote_ya_tiene_saldo");
      const asiento = await tx.quantityEvent.create({
        data: {
          lotId: cosecha.resultingLotId,
          eventType: "received",
          quantity: cosecha.extractedWeightKg!,
          unit: "kg",
          occurredAt: cosecha.occurredAt,
          createdBy: userAccountId,
          provenanceClass: cosecha.provenanceClass,
          sourceReference: `apiary_harvest_event:${cosecha.id}`,
        },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "apiary_harvest.backfill_ledger",
          entityType: "quantity_event",
          entityId: asiento.id,
          after: asiento,
          reason: "la cosecha se pesó en el cierre antes de ADR-161 y su lote quedó sin saldo",
          sourceInterface: "apiary.cosechasSinSaldo",
        },
        tx,
      );
      return asiento;
    },
    { isolationLevel: "Serializable" },
  );
}
