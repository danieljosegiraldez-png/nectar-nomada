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
 * muestra, ni se explica; Daniel, 2026-09-27), y encontrar la versión de la que habla. Después leen el vocabulario, los pasos de esa versión, las referencias del paquete y sus
 * sinónimos (I7). Los rótulos de los tipos de paso y de los modos de secado se traducen aquí, en el servidor: el formulario es de cliente y sólo tiene un espacio de textos.
 *
 * **Sin `stepId` (añadir) la versión es el BORRADOR**, y si no lo hay —una versión publicada no se edita— vuelve a la receta. **Con `stepId` (ver o editar) es la versión que TIENE ese
 * paso**, buscada sólo entre las de esta receta, el borrador primero (F1-2 de la revisión final de la Parte 2a): si es el borrador, el formulario se edita; si no (la publicada o una del
 * historial), `soloLectura` es verdadero y el formulario se pinta entero y deshabilitado, porque tras publicar los valores de un paso sólo existían en este formulario. La
 * autorización es la de siempre —no se amplía quién puede leer—; un paso que ninguna versión de la receta tiene vuelve a la receta.
 */
export async function cargarFormularioDePaso(userAccountId: string, recipeId: string, stepId?: string) {
  let recipe;
  try {
    recipe = await getRecipeForEditor(userAccountId, recipeId);
  } catch (error) {
    if (error instanceof ProcessTargetError) redirect("/recipes");
    throw error;
  }
  if (!(await puedeAutoriaDeReceta(userAccountId, recipe.organizationId))) notFound();

  let version: (typeof recipe.versions)[number] | undefined;
  let pasos: Awaited<ReturnType<typeof pasosDeLaVersion>> = [];
  if (stepId === undefined) {
    version = recipe.versions.find((v) => v.status === "draft");
    if (version) pasos = await pasosDeLaVersion(userAccountId, version.id);
  } else {
    // El borrador primero (es lo corriente: editar), y luego las demás, en el orden de la receta. Una a una: en cuanto una tiene el paso, no se leen más.
    const candidatas = [...recipe.versions].sort((a, b) => Number(b.status === "draft") - Number(a.status === "draft"));
    for (const candidata of candidatas) {
      const delasPasos = await pasosDeLaVersion(userAccountId, candidata.id);
      if (delasPasos.some((p) => p.id === stepId)) {
        version = candidata;
        pasos = delasPasos;
        break;
      }
    }
  }
  if (!version) redirect(`/recipes/${recipe.id}`);

  const [t, ts, catalogos] = await Promise.all([getTranslations("Traceability"), getTranslations("Secado"), catalogosDelEditor()]);

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
    /** La versión de la que habla la pantalla: el borrador al añadir; al ver o editar, la que tiene el paso. */
    version,
    /** Verdadero si esa versión ya no es un borrador: el formulario se ve y no se envía. */
    soloLectura: version.status !== "draft",
    pasos,
    catalogos,
    tipos,
    modosDeSecado: AMBIENTES_DE_SECADO.map((a) => ({ valor: a as string, etiqueta: ts(`ambiente_${a}`) })),
    variables: listVariableDefinitions("proceso_de_cafe"),
    referencias,
    sinonimos: SINONIMOS_ENTRE_CATALOGOS,
  };
}
