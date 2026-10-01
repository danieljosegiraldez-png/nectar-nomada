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

const esHoja = (v: unknown) => v === null || typeof v !== "object" || v instanceof Date;

/**
 * ¿Tiene el filtro alguna condición con valor definido, a cualquier profundidad? `{}`, `{ id: {} }` y
 * `{ OR: [{}] }` casan con TODOS los lotes. Una lista de valores, aunque esté vacía, SÍ es una
 * condición: `in: []` no casa con nada, y es lo que queda cuando el `beforeAll` no llegó a crear nada.
 */
function tieneCondicion(w: unknown): boolean {
  if (Array.isArray(w)) return w.every(esHoja) || w.some(tieneCondicion);
  if (esHoja(w)) return w !== undefined;
  return Object.values(w as Record<string, unknown>).some(tieneCondicion);
}

/**
 * Borra los procesos de los lotes que cumplan `lot`, y antes sus devoluciones a secado. Va ANTES de
 * borrar esos lotes: `lot_process.lot_id` es RESTRICT. Se le pasa el mismo `where` con el que el
 * archivo borra sus lotes.
 *
 * **Rechaza un filtro de lote sin condición.** `assertDefinedWhere` sólo exige que el `where` de arriba
 * no esté vacío —aquí siempre trae el `OR`— y que no haya `undefined`; no ve que el `lot` de dentro
 * sea `{}`, y `{ lot: {} }` borraba todos los procesos de la base.
 */
export async function borrarProcesosDeLotesDonde(lot: Prisma.LotWhereInput): Promise<void> {
  if (!tieneCondicion(lot)) {
    throw new UnsafeWhereClauseError(
      "borrarProcesosDeLotesDonde: el filtro de lote no tiene ninguna condición definida — casaría con TODOS los lotes y borraría TODOS los procesos de la base",
    );
  }
  await prisma.lotProcessReturn.deleteMany({
    where: assertDefinedWhere({ OR: [{ closedLotProcess: { lot } }, { continuationLotProcess: { lot } }] }),
  });
  await prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ lot }) });
}
