import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { valoresDelFormulario } from "../../../../../lib/recetas/formularioDePaso";
import { FormularioDePaso } from "../../../../components/traceability/FormularioDePaso";
import { cargarFormularioDePaso } from "../datosDelFormulario";

export const dynamic = "force-dynamic";

/**
 * Editar un paso de un borrador, o VERLO si su versión ya no lo es — diseño §6. Parte 2a, tarea 14 (2026-10-03). Mismas condiciones que añadirlo (404 sin permiso), y además un paso
 * que ya no está —otra sesión lo quitó— vuelve a la receta en vez de pintar un formulario vacío. **El paso de una versión publicada o del historial se abre de sólo lectura**
 * (F1-2 de la revisión final de la Parte 2a): el mismo formulario, entero y deshabilitado y sin botón de guardar, con la misma autorización que antes (no se amplía quién puede leer).
 */
export default async function EditarPasoPage({ params }: { params: Promise<{ id: string; stepId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id, stepId } = await params;
  const datos = await cargarFormularioDePaso(user.userAccountId, id, stepId);
  const paso = datos.pasos.find((p) => p.id === stepId);
  if (!paso) redirect(`/recipes/${datos.recipe.id}`);
  const t = await getTranslations("Traceability");

  return (
    <div>
      <Link href={`/recipes/${datos.recipe.id}`} className="nn-back-link">
        {t("recetaEditor_volverALaReceta")}
      </Link>
      <h1>{datos.soloLectura ? t("recetaEditor_verPasoTitle", { seq: paso.seq }) : t("recetaEditor_editarPasoTitle", { seq: paso.seq })}</h1>
      <p className="nn-detail-meta">
        <span>
          {datos.soloLectura
            ? t("recetaEditor_pasoDeLaVersionPublicada", { receta: datos.recipe.name, version: datos.version.version })
            : t("recetaEditor_pasoDeLaReceta", { receta: datos.recipe.name, version: datos.version.version })}
        </span>
      </p>
      {datos.soloLectura ? <p className="nn-muted">{t("recetaEditor_publicadaIntro")}</p> : null}
      <FormularioDePaso
        modo="editar"
        recipeId={datos.recipe.id}
        recipeVersionId={datos.version.id}
        soloLectura={datos.soloLectura}
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
