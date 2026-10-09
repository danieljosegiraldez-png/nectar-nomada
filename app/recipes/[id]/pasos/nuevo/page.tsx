import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { pasoEnBlanco } from "../../../../../lib/recetas/formularioDePaso";
import { FormularioDePaso } from "../../../../components/traceability/FormularioDePaso";
import { cargarFormularioDePaso } from "../datosDelFormulario";

export const dynamic = "force-dynamic";

/**
 * Añadir un paso a un borrador — diseño §6. Parte 2a, tarea 14 (2026-10-03). `?despues=<seq>` dice detrás de qué paso va; ausente o ilegible, al
 * principio. Sin permiso es un 404 (la página no existe para quien no puede usarla), y con la versión ya publicada vuelve a la receta.
 */
export default async function NuevoPasoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ despues?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [{ id }, { despues }] = await Promise.all([params, searchParams]);
  const datos = await cargarFormularioDePaso(user.userAccountId, id);
  const t = await getTranslations("Traceability");
  const despuesDeSeq = despues !== undefined && /^\d+$/.test(despues) ? Number(despues) : null;

  return (
    <div>
      <Link href={`/recipes/${datos.recipe.id}`} className="nn-back-link">
        {t("recetaEditor_volverALaReceta")}
      </Link>
      <h1>{t("recetaEditor_nuevoPasoTitle")}</h1>
      <p className="nn-detail-meta">
        <span>{t("recetaEditor_pasoDeLaReceta", { receta: datos.recipe.name, version: datos.borrador.version })}</span>
      </p>
      <p className="nn-muted">{t("recetaEditor_nuevoPasoIntro")}</p>
      <FormularioDePaso
        modo="agregar"
        recipeId={datos.recipe.id}
        recipeVersionId={datos.borrador.id}
        despuesDeSeq={despuesDeSeq}
        inicial={pasoEnBlanco()}
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
