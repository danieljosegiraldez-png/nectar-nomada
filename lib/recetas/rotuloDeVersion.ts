/**
 * El rótulo de una versión de receta en los selectores — Parte 2a, revisión final del PR-A (F1-5, 2026-10-10).
 *
 * Los tres selectores de receta (el proceso del lote, el perfil de tueste de la ficha y `roast/new`) rotulaban «<receta> · vN · <n> objetivos» con `n` = las metas de la
 * VERSIÓN, las que no cuelgan de un paso. Una receta creada en el editor lleva sus metas en los pasos, así que toda salía «0 objetivos» aunque tuviera cinco pasos. Ahora dice
 * «<n> pasos» cuando la versión tiene pasos (`listRecipeVersionsForLot` ya trae `_count.steps`) y «<n> objetivos» sólo cuando no los tiene: una receta de antes de los pasos.
 *
 * Pura y sin dependencias, para que la prueba (`tests/recetas/rotuloDeVersion.test.ts`) la llame con las dos formas sin una pantalla de por medio; y para que los tres selectores
 * compartan UNA cuenta (esa prueba lee sus fuentes y exige que la llamen).
 */
export interface VersionParaRotular {
  version: number;
  recipe: { name: string };
  /** Las metas de la versión (las que no cuelgan de ningún paso). */
  targets: readonly unknown[];
  _count: { steps: number };
}

/** Los dos textos que el rótulo usa, de `Traceability`; `t` de `next-intl` los cumple tal cual. */
export type TraductorDelRotulo = (clave: "recipeStepsCount" | "targetsCountSuffix", valores?: { count: number }) => string;

export function rotuloDeVersion(v: VersionParaRotular, t: TraductorDelRotulo): string {
  const cuenta = v._count.steps > 0 ? t("recipeStepsCount", { count: v._count.steps }) : `${v.targets.length} ${t("targetsCountSuffix")}`;
  return `${v.recipe.name} · v${v.version} · ${cuenta}`;
}
