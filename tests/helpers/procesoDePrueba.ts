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
const esValor = (v: unknown) => v !== undefined && esHoja(v);
const OPERADORES_LOGICOS = new Set(["AND", "OR", "NOT"]);

/**
 * ¿Tiene el filtro alguna condición con valor definido, a cualquier profundidad? Es la guarda de
 * `borrarProcesosDeLotesDonde`, y se exporta para probarla DIRECTAMENTE con entradas hostiles.
 *
 * Medido el 2026-10-01 en `nectar_test_recetas` (104 lotes): casan con TODOS los lotes `{}`, `{ id: {} }`,
 * `{ id: undefined }`, `{ AND: [] }`, `{ NOT: [] }`, `{ AND: [{}] }`, `{ AND: {} }`, `{ NOT: {} }` y
 * `{ NOT: [{}] }`; no casan con ninguno `{ OR: [] }`, `{ OR: [{}] }` e `{ id: { in: [] } }`. Ninguna de
 * las del primer grupo cuenta como condición, ni las de `OR`, que no borrarían nada pero se rechazan por
 * conservadoras.
 *
 * **Una lista significa dos cosas, según la clave que la lleve.** Bajo `AND`/`OR`/`NOT` es una lista de
 * FILTROS: cuenta si alguno tiene condición, y una lista vacía no tiene ninguna (`[].every(...)` daría
 * `true` y dejaba pasar `{ AND: [] }`: así falló la ronda 1). Bajo cualquier otra clave (`in`, `notIn`…)
 * es una lista de VALORES: aunque esté vacía SÍ es una condición, porque `in: []` no casa con nada, y es lo
 * que queda en el `afterAll` cuando el `beforeAll` no llegó a crear ningún lote.
 *
 * No mide cuánto estrecha un filtro: `NOT` con una condición cuenta como condición.
 */
export function tieneCondicion(w: unknown): boolean {
  if (w === undefined) return false;
  if (esHoja(w)) return true;
  if (Array.isArray(w)) return w.every(esValor) || w.some(tieneCondicion);
  return Object.entries(w as Record<string, unknown>).some(([clave, v]) =>
    OPERADORES_LOGICOS.has(clave) && Array.isArray(v) ? v.some(tieneCondicion) : tieneCondicion(v),
  );
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
