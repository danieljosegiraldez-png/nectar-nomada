/**
 * Los vocabularios que el editor de recetas ofrece en sus desplegables — Parte 2a, tarea 14 (2026-10-03).
 *
 * Una lectura por todos los catálogos del paso en una sola consulta (el valor de cada eje es un valor de catálogo: diseño §3 y §7).
 * Sólo trae el valor CANÓNICO: un alias (`aliasOfId` no nulo) es otro nombre del mismo valor y ofrecerlo dejaría elegir dos veces la
 * misma cosa. El orden es el de la semilla (`displayOrder`, y el valor para desempatar): el de `TIPOS_DE_PASO` en `tipo_paso`.
 *
 * **No recibe principal y no autoriza.** Es vocabulario, no dato de nadie, y quien lo llama —las pantallas del editor— ya pasó por
 * `getRecipeForEditor` y por `puedeAutoriaDeReceta` antes de pedirlo (por eso el inventario la cuenta «depende del
 * llamador»). Devuelve `definition` para que la pantalla la enseñe: `despulpada_con_mucilago` no se explica solo.
 */
import { prisma } from "../db";

/** Qué catálogo alimenta cada desplegable del paso. */
export const CATALOGOS_DEL_EDITOR = {
  tipos: "tipo_paso",
  estadoFruto: "estado_cereza",
  oxigeno: "condicion_oxigeno",
  temperatura: "manejo_temperatura",
  fuenteMicrobiana: "fuente_microbiana",
  medio: "medio_lavado",
  fisico: "fisico",
  sustrato: "sustrato_anadido",
  levadura: "levadura_cultivo",
  capacidad: "capacidad",
} as const;

export interface ValorDeCatalogo {
  id: string;
  value: string;
  definition: string | null;
}

export type CatalogosDelEditor = Record<keyof typeof CATALOGOS_DEL_EDITOR, ValorDeCatalogo[]>;

export async function catalogosDelEditor(): Promise<CatalogosDelEditor> {
  const filas = await prisma.variableCatalogValue.findMany({
    where: { catalog: { key: { in: Object.values(CATALOGOS_DEL_EDITOR) } }, aliasOfId: null },
    orderBy: [{ displayOrder: "asc" }, { value: "asc" }],
    select: { id: true, value: true, definition: true, catalog: { select: { key: true } } },
  });

  const familias = Object.keys(CATALOGOS_DEL_EDITOR) as (keyof typeof CATALOGOS_DEL_EDITOR)[];
  const salida = Object.fromEntries(familias.map((f) => [f, [] as ValorDeCatalogo[]])) as CatalogosDelEditor;
  const familiaDe = new Map<string, keyof typeof CATALOGOS_DEL_EDITOR>(
    familias.map((f) => [CATALOGOS_DEL_EDITOR[f], f] as const),
  );
  for (const fila of filas) {
    const familia = familiaDe.get(fila.catalog.key);
    if (familia) salida[familia].push({ id: fila.id, value: fila.value, definition: fila.definition });
  }
  return salida;
}
