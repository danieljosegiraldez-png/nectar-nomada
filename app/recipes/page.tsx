import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { listRecipes, ProcessTargetError, puedeCrearRecetaEnAlguna } from "../../lib/traceability/processTargets";

export const dynamic = "force-dynamic";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let recipes;
  try {
    recipes = await listRecipes(user.userAccountId);
  } catch (error) {
    // Someone who cannot manage any batch has no business here, and the nav
    // does not offer it to them — but the page refuses regardless
    // (SECURITY.md §2).
    if (error instanceof ProcessTargetError) redirect("/lots");
    throw error;
  }

  const [t, params] = await Promise.all([getTranslations("Traceability"), searchParams]);
  const puedeCrearReceta = await puedeCrearRecetaEnAlguna(user.userAccountId);

  return (
    <div>
      <span className="nn-badge">{t("recipesBadge")}</span>
      <h1>{t("recipesTitle")}</h1>
      <p className="nn-muted">{t("recipesIntro")}</p>

      {params.ok ? <p className="nn-ok" role="status">{t("recipeCreatedOk")}</p> : null}

      <p style={{ marginTop: "1rem" }}>
        {/* Daniel, 2026-09-27: lo que no puedes hacer no se muestra, y no se explica. Se
            pregunta con el MISMO predicado del destino, para que el enlace no pueda prometer
            lo que la otra pantalla niega. */}
        {puedeCrearReceta ? (
          <Link href="/recipes/new" className="nn-button" style={{ display: "inline-block", textDecoration: "none" }}>
            {t("recipeNewButton")}
          </Link>
        ) : null}
      </p>

      <section className="nn-section">
        {recipes.length === 0 ? (
          <p className="nn-muted">{t("recipesEmpty")}</p>
        ) : (
          recipes.map((r) => {
            const latest = r.versions[0];
            return (
              <div key={r.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0 }}>
                  <Link href={`/recipes/${r.id}`}>{r.name}</Link>
                </h3>
                <p className="nn-detail-meta">
                  {r.organization ? <span>{r.organization.name}</span> : null}
                  <span>{t("recipeVersionCount", { count: r.versions.length })}</span>
                </p>
                {r.description ? <p className="nn-muted">{r.description}</p> : null}

                {latest ? (
                  <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
                    {latest.targets.map((tg) => (
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
                ) : null}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
