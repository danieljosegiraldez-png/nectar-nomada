import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { valoresDelFormulario } from "../../../../../lib/recetas/formularioDePaso";
import { FormularioDePaso } from "../../../../components/traceability/FormularioDePaso";
import { cargarFormularioDePaso } from "../datosDelFormulario";

export const dynamic = "force-dynamic";

/**
 * Editar un paso de un borrador — diseño §6. Parte 2a, tarea 14 (2026-10-03). Mismas condiciones que añadirlo (404 sin permiso, de vuelta a la receta si la
 * versión ya está publicada), y además un paso que ya no está —otra sesión lo quitó— vuelve a la receta en vez de pintar un formulario vacío.
 */
export default async function EditarPasoPage({ params }: { params: Promise<{ id: string; stepId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id, stepId } = await params;
  const datos = await cargarFormularioDePaso(user.userAccountId, id);
  const paso = datos.pasos.find((p) => p.id === stepId);
  if (!paso) redirect(`/recipes/${datos.recipe.id}`);
  const t = await getTranslations("Traceability");

  return (
    <div>
      <Link href={`/recipes/${datos.recipe.id}`} className="nn-back-link">
        {t("recetaEditor_volverALaReceta")}
      </Link>
      <h1>{t("recetaEditor_editarPasoTitle", { seq: paso.seq })}</h1>
      <p className="nn-detail-meta">
        <span>{t("recetaEditor_pasoDeLaReceta", { receta: datos.recipe.name, version: datos.borrador.version })}</span>
      </p>
      <FormularioDePaso
        modo="editar"
        recipeId={datos.recipe.id}
        recipeVersionId={datos.borrador.id}
        stepId={paso.id}
        inicial={valoresDelFormulario(paso)}
        tipos={datos.tipos}
        catalogos={datos.catalogos}
        modosDeSecado={datos.modosDeSecado}
        variables={datos.variables}
        referencias={datos.referencias}
        sinonimos={datos.sinonimos}
      />
    </div>
  );
}
