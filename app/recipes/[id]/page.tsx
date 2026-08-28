import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getRecipeForEditor, ProcessTargetError } from "../../../lib/traceability/processTargets";
import { listVariableDefinitions } from "../../../lib/traceability/units";
import { RecipeMetadataForm } from "../../components/traceability/RecipeMetadataForm";
import { RecipeVersionForm } from "../../components/traceability/RecipeVersionForm";

export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  let recipe;
  try {
    recipe = await getRecipeForEditor(user.userAccountId, id);
  } catch (error) {
    if (error instanceof ProcessTargetError) redirect("/recipes");
    throw error;
  }

  const [t, query] = await Promise.all([getTranslations("Traceability"), searchParams]);
  const variables = listVariableDefinitions();

  const current = recipe.versions[0];
  // Prefilled from the current version: creating v2 almost always means
  // changing one number, not retyping eight targets (ADR-102).
  const initialTargets = (current?.targets ?? []).map((tg) => ({
    variable: tg.variable,
    moment: tg.moment as "initial" | "during" | "final",
    targetValue: tg.targetValue?.toString() ?? "",
    minValue: tg.minValue?.toString() ?? "",
    maxValue: tg.maxValue?.toString() ?? "",
    note: tg.note ?? "",
  }));

  return (
    <div>
      <Link href="/recipes" className="nn-back-link">{t("recipesBackLink")}</Link>
      <h1>{recipe.name}</h1>
      <p className="nn-detail-meta">
        {recipe.organization ? <span>{recipe.organization.name}</span> : null}
        <span>{t("recipeVersionCount", { count: recipe.versions.length })}</span>
        {current ? <span>{t("recipeCurrentVersion", { version: current.version })}</span> : null}
      </p>

      {query.ok === "renamed" ? <p className="nn-ok" role="status">{t("recipeRenamedOk")}</p> : null}
      {query.ok === "versioned" ? <p className="nn-ok" role="status">{t("recipeVersionedOk")}</p> : null}

      <section className="nn-section">
        <h2>{t("recipeMetadataHeading")}</h2>
        {/* Only the label. Targets are what runs were operated against, so
            changing those is a new version and never an edit (ADR-102). */}
        <p className="nn-muted">{t("recipeMetadataIntro")}</p>
        <RecipeMetadataForm
          recipeId={recipe.id}
          name={recipe.name}
          description={recipe.description ?? ""}
        />
      </section>

      <section className="nn-section">
        <h2>{t("recipeNewVersionHeading")}</h2>
        <p className="nn-muted">{t("recipeNewVersionIntro")}</p>
        <RecipeVersionForm recipeId={recipe.id} variables={variables} initialTargets={initialTargets} />
      </section>

      <section className="nn-section">
        <h2>{t("recipeHistoryHeading")}</h2>
        <p className="nn-muted">{t("recipeHistoryIntro")}</p>
        {recipe.versions.map((v) => (
          <div key={v.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>
              {t("recipeVersionLabel", { version: v.version })}
              {v.id === current?.id ? ` · ${t("recipeCurrentBadge")}` : ""}
            </h3>
            <p className="nn-detail-meta">
              <span>{v.createdAt.toISOString().slice(0, 10)}</span>
              {/* The fact that makes version preservation legible: a version
                  with runs attached is history, not scratch. */}
              <span>
                {v._count.fermentationRuns === 0
                  ? t("recipeVersionUnused")
                  : t("recipeVersionUsedBy", { count: v._count.fermentationRuns })}
              </span>
            </p>
            {v.notes ? <p className="nn-muted">{v.notes}</p> : null}
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
              {v.targets.map((tg) => (
                <li key={tg.id}>
                  {t(`variable_${tg.variable}` as "variable_ph", { fallback: tg.variable })}
                  {" · "}
                  {t(`moment_${tg.moment}` as "moment_initial")}
                  {" · "}
                  {tg.targetValue !== null
                    ? `${tg.targetValue.toString()} ${tg.unit}`
                    : t("targetsRange", {
                        min: tg.minValue?.toString() ?? "—",
                        max: tg.maxValue?.toString() ?? "—",
                        unit: tg.unit,
                      })}
                  {tg.note ? ` — ${tg.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
