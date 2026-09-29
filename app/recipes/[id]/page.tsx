import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { mostrarFecha } from "../../../lib/time/mostrarInstante";
import { getCurrentUser } from "../../../lib/auth/session";
import { puedeEditarBeneficioEnOrganizacion } from "../../../lib/traceability/locations";
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

  const [t, query, puedeEditar] = await Promise.all([
    getTranslations("Traceability"),
    searchParams,
    puedeEditarBeneficioEnOrganizacion(user.userAccountId, recipe.organizationId),
  ]);
  const variables = listVariableDefinitions("proceso_de_cafe");

  const current = recipe.versions[0];
  // Prefilled from the current version: creating v2 almost always means
  // changing one number, not retyping eight targets (ADR-102).
  const initialTargets = (current?.targets ?? []).map((tg) => ({
    variable: tg.variable,
    moment: tg.moment as "initial" | "during" | "final",
    // Un objetivo heredado puede no decir de qué fase habla —la migración del 2026-09-27 sólo
    // rellenó los que pudo demostrar— y al publicar la v2 hay que elegir una. Se propone
    // fermentación, que es lo que toda receta anterior describía, y el selector queda a la vista
    // para corregirlo. Lo que NO se hace es escribir nulo otra vez: la versión nueva sí declara.
    phase: (tg.phase ?? "fermentation") as "fermentation" | "drying",
    targetValue: tg.targetValue?.toString() ?? "",
    minValue: tg.minValue?.toString() ?? "",
    maxValue: tg.maxValue?.toString() ?? "",
    everyHours: tg.everyHours?.toString() ?? "",
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
        {puedeEditar ? (
          <>
            {/* Only the label. Targets are what runs were operated against, so
                changing those is a new version and never an edit (ADR-102). */}
            <p className="nn-muted">{t("recipeMetadataIntro")}</p>
            <RecipeMetadataForm
              recipeId={recipe.id}
              name={recipe.name}
              description={recipe.description ?? ""}
            />
          </>
        ) : (
          <p className="nn-muted" role="alert">{t("recipeSinPermisoEditar")}</p>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("recipeNewVersionHeading")}</h2>
        {puedeEditar ? (
          <>
            <p className="nn-muted">{t("recipeNewVersionIntro")}</p>
            <RecipeVersionForm
              recipeId={recipe.id}
              variables={variables}
              initialTargets={initialTargets}
              expectedHours={current?.expectedHours ?? null}
            />
          </>
        ) : (
          <p className="nn-muted" role="alert">{t("recipeSinPermisoEditar")}</p>
        )}
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
              {/* Sello automático: un INSTANTE, no un campo de día. Una receta creada a
    las 19:00 se fechaba el día siguiente. Sin Location a mano, cae en el
    respaldo del formateador. */}
              <span>{mostrarFecha(v.createdAt, null)}</span>
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
