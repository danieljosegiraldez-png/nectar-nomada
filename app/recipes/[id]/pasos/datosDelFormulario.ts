import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { catalogosDelEditor } from "../../../../lib/recetas/catalogosDelEditor";
import { pasosDeLaVersion } from "../../../../lib/recetas/pasos";
import { referenciasDelTipo, SINONIMOS_ENTRE_CATALOGOS, type ReferenciaDelPaquete } from "../../../../lib/recetas/referencias";
import { TIPOS_DE_PASO, type TipoDePaso } from "../../../../lib/recetas/vocabulario";
import { puedeAutoriaDeReceta } from "../../../../lib/recetas/autoria";
import { getRecipeForEditor, ProcessTargetError } from "../../../../lib/traceability/processTargets";
import { AMBIENTES_DE_SECADO } from "../../../../lib/traceability/secadoForm";
import { listVariableDefinitions } from "../../../../lib/traceability/units";

/**
 * Todo lo que las dos pantallas de un paso necesitan para pintar su formulario — Parte 2a, tarea 14 (2026-10-03; integrada el 2026-10-04).
 *
 * Las dos hacen lo mismo antes de pintar: cargar la receta (`getRecipeForEditor`: quien puede escribirla, o quien opera un lote suyo; Ruling C4), exigir que quien mira pueda ESCRIBIRLA
 * —`puedeAutoriaDeReceta`, la gemela de la regla que aplican los servicios: el permiso del Coffee Process Manager, V16— (404 si no: lo que no puedes hacer no se
 * muestra, ni se explica; Daniel, 2026-09-27), y exigir que haya un BORRADOR (una versión publicada no se edita: de vuelta a la receta). Después leen el
 * vocabulario, los pasos del borrador, las referencias del paquete y sus sinónimos (I7). Los rótulos de los tipos de paso y de los modos de secado se traducen aquí, en
 * el servidor: el formulario es de cliente y sólo tiene un espacio de textos.
 */
export async function cargarFormularioDePaso(userAccountId: string, recipeId: string) {
  let recipe;
  try {
    recipe = await getRecipeForEditor(userAccountId, recipeId);
  } catch (error) {
    if (error instanceof ProcessTargetError) redirect("/recipes");
    throw error;
  }
  if (!(await puedeAutoriaDeReceta(userAccountId, recipe.organizationId))) notFound();

  const borrador = recipe.versions.find((v) => v.status === "draft");
  if (!borrador) redirect(`/recipes/${recipe.id}`);

  const [t, ts, catalogos, pasos] = await Promise.all([
    getTranslations("Traceability"),
    getTranslations("Secado"),
    catalogosDelEditor(),
    pasosDeLaVersion(userAccountId, borrador.id),
  ]);

  // Sólo los valores del catálogo que el vocabulario conoce: un valor que ningún tipo del código nombra no se puede ofrecer.
  const conocidos: readonly string[] = TIPOS_DE_PASO;
  const tipos = catalogos.tipos
    .filter((v) => conocidos.includes(v.value))
    .map((v) => ({ id: v.id, tipo: v.value as TipoDePaso, etiqueta: t(`tipoPaso_${v.value}`) }));

  const referencias: Partial<Record<TipoDePaso, readonly ReferenciaDelPaquete[]>> = {};
  for (const tipo of TIPOS_DE_PASO) {
    const lista = referenciasDelTipo(tipo);
    if (lista.length > 0) referencias[tipo] = lista;
  }

  return {
    recipe,
    borrador,
    pasos,
    catalogos,
    tipos,
    modosDeSecado: AMBIENTES_DE_SECADO.map((a) => ({ valor: a as string, etiqueta: ts(`ambiente_${a}`) })),
    variables: listVariableDefinitions("proceso_de_cafe"),
    referencias,
    sinonimos: SINONIMOS_ENTRE_CATALOGOS,
  };
}
