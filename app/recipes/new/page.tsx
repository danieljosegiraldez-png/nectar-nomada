import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { listRecipeOrganizations } from "../../../lib/traceability/processTargets";
import { listVariableDefinitions } from "../../../lib/traceability/units";
import { RecipeForm } from "../../components/traceability/RecipeForm";

export const dynamic = "force-dynamic";

export default async function NewRecipePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, organizations] = await Promise.all([
    getTranslations("Traceability"),
    listRecipeOrganizations(user.userAccountId),
  ]);

  // No organization this account can operate means nothing to attach a recipe
  // to. Refusing here beats rendering a form whose first field is empty.
  if (organizations.length === 0) redirect("/recipes");

  const variables = listVariableDefinitions();

  return (
    <div>
      <Link href="/recipes" className="nn-back-link">{t("recipesBackLink")}</Link>
      <h1>{t("recipeNewTitle")}</h1>
      <p className="nn-muted">{t("recipeNewIntro")}</p>
      <RecipeForm organizations={organizations} variables={variables} />
    </div>
  );
}
