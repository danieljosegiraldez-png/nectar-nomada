import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { puedeAutoriaDeReceta } from "../../../lib/recetas/autoria";
import { listRecipeOrganizations } from "../../../lib/traceability/processTargets";
import { RecetaNuevaForm } from "../../components/traceability/RecetaNuevaForm";

export const dynamic = "force-dynamic";

export default async function NewRecipePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, allOrganizations] = await Promise.all([
    getTranslations("Traceability"),
    listRecipeOrganizations(user.userAccountId),
  ]);

  // No organization this account can operate means nothing to attach a recipe
  // to. Refusing here beats rendering a form whose first field is empty.
  if (allOrganizations.length === 0) redirect("/recipes");

  // Escribir una receta es del Coffee Process Manager (V16, 2026-10-04: `exigeAutoriaDeReceta`, que ya no es `edit_beneficio`): sólo se
  // ofrecen las organizaciones donde el servidor vaya a aceptar el guardado, más la
  // opción de receta compartida si pasa con `null` (Task 3, plan 3).
  const organizations = [];
  for (const org of allOrganizations) {
    if (await puedeAutoriaDeReceta(user.userAccountId, org.id)) organizations.push(org);
  }
  const permiteCompartida = await puedeAutoriaDeReceta(user.userAccountId, null);

  // Daniel, 2026-09-27: sin el permiso de autoría de recetas en ninguna organización esta pantalla no existe —
  // 404, sin explicar. El enlace de `/recipes` ya no la ofrece; esto cubre la dirección escrita a mano.
  if (organizations.length === 0 && !permiteCompartida) notFound();

  return (
    <div>
      <Link href="/recipes" className="nn-back-link">{t("recipesBackLink")}</Link>
      <h1>{t("recipeNewTitle")}</h1>
      <p className="nn-muted">{t("recipeNewIntro")}</p>
      <RecetaNuevaForm organizations={organizations} permiteCompartida={permiteCompartida} />
    </div>
  );
}
