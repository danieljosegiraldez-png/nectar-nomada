/**
 * Abrir un proceso en una prueba, y limpiarlo.
 *
 * **Por qué existe** (Parte 1, R3): desde esta parte no se empieza una fermentación ni un secado sin
 * un proceso abierto que cubra al lote. Treinta llamadas en diez archivos de prueba empezaban
 * corridas sin proceso. En vez de copiar treinta veces el armado de un proceso, una línea.
 *
 * **Usa los valores REALES del catálogo** (`Washed`, `despulpada`): la base de pruebas está sembrada
 * (`npm run db:seed`), así que existen y no hay valores de prueba que limpiar.
 *
 * Por convención de la casa, la limpieza la llama el archivo de la prueba, no el ayudante.
 */
import { prisma } from "../../lib/db";
import { abrirProceso } from "../../lib/traceability/lotProcess";
import type { Prisma } from "../../generated/prisma/client";
import { assertDefinedWhere, UnsafeWhereClauseError } from "./assertDefinedWhere";
import { tieneCondicion } from "./tieneCondicion";

async function valorDeCatalogo(catalogo: string, valor: string): Promise<string> {
  return (
    await prisma.variableCatalogValue.findFirstOrThrow({
      where: { value: valor, catalog: { key: catalogo } },
      select: { id: true },
    })
  ).id;
}

export async function abrirProcesoDePrueba(
  userAccountId: string,
  lotId: string,
  extra: { startedAt?: Date; targetMoisturePct?: number; processRecipeVersionId?: string | null } = {},
) {
  return abrirProceso(userAccountId, {
    lotId,
    intent: "TEST: proceso abierto para poder empezar corridas (Parte 1, R3)",
    targetMoisturePct: extra.targetMoisturePct ?? 11.5,
    startedAt: extra.startedAt ?? new Date("2020-01-01T00:00:00Z"),
    provenanceClass: "original_record",
    processGradeValueId: await valorDeCatalogo("grado_proceso", "Washed"),
    cherryStateValueId: await valorDeCatalogo("estado_cereza", "despulpada"),
    processRecipeVersionId: extra.processRecipeVersionId ?? null,
  });
}

/**
 * Borra los procesos de los lotes que cumplan `lot`, y antes sus devoluciones a secado. Va ANTES de
 * borrar esos lotes: `lot_process.lot_id` es RESTRICT. Se le pasa el mismo `where` con el que el
 * archivo borra sus lotes.
 *
 * **Rechaza un filtro de lote sin una restricción positiva** (`tieneCondicion`, en `./tieneCondicion`, que
 * explica qué cuenta y qué no). `assertDefinedWhere` sólo exige que el `where` de arriba no esté vacío
 * —aquí siempre trae el `OR`— y que no haya `undefined`; no ve que el `lot` de dentro sea `{}` ni que sólo
 * lleve negaciones, y cualquiera de las dos casa con todos los lotes y borraba todos los procesos de la base.
 */
export async function borrarProcesosDeLotesDonde(lot: Prisma.LotWhereInput): Promise<void> {
  if (!tieneCondicion(lot)) {
    throw new UnsafeWhereClauseError(
      "borrarProcesosDeLotesDonde: el filtro de lote no tiene ninguna condición definida — casaría con TODOS los lotes y borraría TODOS los procesos de la base",
    );
  }
  // Los eventos de auditoría de un proceso (`lot_process.open`, `…close`…) cuelgan del PROCESO por su `entityId`, y la
  // base no los borra con él ni con su usuario (el actor es SET NULL): sin esto quedaban huérfanos, y la tarea 4 sumó
  // 26 aperturas por corrida de la suite (ronda de arreglo 1, 2026-10-01; medidos 1306 en `nectar_test_recetas`). Se
  // borran por los ids de los procesos que ESTA llamada va a borrar —filtro positivo: `entityType` y `entityId in`—, y
  // sin procesos no se toca nada.
  const procesos = await prisma.lotProcess.findMany({ where: assertDefinedWhere({ lot }), select: { id: true } });
  const ids = procesos.map((p) => p.id);
  if (ids.length > 0) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "lot_process", entityId: { in: ids } }) });
  }
  await prisma.lotProcessReturn.deleteMany({
    where: assertDefinedWhere({ OR: [{ closedLotProcess: { lot } }, { continuationLotProcess: { lot } }] }),
  });
  await prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ lot }) });
}
