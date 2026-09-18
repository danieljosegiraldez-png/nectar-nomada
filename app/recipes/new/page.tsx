import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { puedeEditarBeneficioEnOrganizacion } from "../../../lib/traceability/locations";
import { listRecipeOrganizations } from "../../../lib/traceability/processTargets";
import { listVariableDefinitions } from "../../../lib/traceability/units";
import { RecipeForm } from "../../components/traceability/RecipeForm";

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

  // Configurar una receta es configurar el beneficio (spec #370 §4.3): sólo se
  // ofrecen las organizaciones donde el servidor vaya a aceptar el guardado,
  // más la opción de receta compartida si pasa con `null` (Task 3, plan 3).
  const organizations = [];
  for (const org of allOrganizations) {
    if (await puedeEditarBeneficioEnOrganizacion(user.userAccountId, org.id)) organizations.push(org);
  }
  const permiteCompartida = await puedeEditarBeneficioEnOrganizacion(user.userAccountId, null);

  if (organizations.length === 0 && !permiteCompartida) {
    return (
      <div>
        <Link href="/recipes" className="nn-back-link">{t("recipesBackLink")}</Link>
        <h1>{t("recipeNewTitle")}</h1>
        <p className="nn-muted" role="alert">{t("recipeSinPermisoEditar")}</p>
      </div>
    );
  }

  const variables = listVariableDefinitions("proceso_de_cafe");

  return (
    <div>
      <Link href="/recipes" className="nn-back-link">{t("recipesBackLink")}</Link>
      <h1>{t("recipeNewTitle")}</h1>
      <p className="nn-muted">{t("recipeNewIntro")}</p>
      <RecipeForm organizations={organizations} variables={variables} permiteCompartida={permiteCompartida} />
    </div>
  );
}
