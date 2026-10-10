import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { puedeAutoriaDeReceta } from "../../lib/recetas/autoria";
import { listRecipes, puedeCrearRecetaEnAlguna } from "../../lib/traceability/processTargets";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Quien no opera ningún lote ni puede escribir recetas recibe aquí el rechazo de `listRecipes` (`TraceabilityAccessError`) y la pantalla no lo atrapa: ve la
  // página de error. Ningún menú le ofrece el enlace, pero la pantalla se niega igual (SECURITY.md §2). Tampoco hay nada que atrapar de otra clase:
  // `listRecipes` no lanza `ProcessTargetError` (sus únicos rechazos son los de acceso a lotes), así que lo que lance sube tal cual.
  const recipes = await listRecipes(user.userAccountId);

  const t = await getTranslations("Traceability");
  const puedeCrearReceta = await puedeCrearRecetaEnAlguna(user.userAccountId);
  // Una receta «Libre» es lo que ocurrió en UN lote (diseño §5.2), no un catálogo: no se lista. Si se convierte en receta de la organización
  // (§5.3), la copia sí es una receta y sale aquí, en borrador. `listRecipes` ya no las trae (R8: es filtro del servicio); esta línea es la segunda red, y por eso su
  // prueba le da una lista con una Libre dentro: el servicio no se la daría.
  const visibles = recipes.filter((r) => !r.esLibre);
  // F2-0 (ronda 2 de la revisión final del PR-A): el borrador es de quien puede escribir la receta, como en el detalle (F1-6) —que pregunta con esta misma
  // `puedeAutoriaDeReceta` por la organización de la receta—: a los demás la lista ni lo pinta ni lo cuenta, para que las dos pantallas no se contradigan («2
  // versión(es)» aquí y «1» allí). Una pregunta por organización, no por receta; una plantilla se pregunta con organización nula.
  const puedeAutorar = new Map<string | null, boolean>();
  for (const { organizationId } of visibles) {
    if (!puedeAutorar.has(organizationId)) puedeAutorar.set(organizationId, await puedeAutoriaDeReceta(user.userAccountId, organizationId));
  }

  return (
    <div>
      <span className="nn-badge">{t("recipesBadge")}</span>
      <h1>{t("recipesTitle")}</h1>
      <p className="nn-muted">{t("recipesIntro")}</p>

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
        {visibles.length === 0 ? (
          // F1-8: «crea una, añádele pasos y publícala» explica un acto que sólo hace quien puede crear recetas; a los demás, sólo que no hay ninguna.
          <p className="nn-muted">{puedeCrearReceta ? t("recipesEmpty") : t("recipesEmptyLector")}</p>
        ) : (
          visibles.map((r) => {
            const versiones = puedeAutorar.get(r.organizationId) ? r.versions : r.versions.filter((v) => v.status !== "draft");
            const publicada = versiones.find((v) => v.status === "approved");
            const borrador = versiones.find((v) => v.status === "draft");
            return (
              <div key={r.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0 }}>
                  <Link href={`/recipes/${r.id}`}>{r.name}</Link>
                </h3>
                <p className="nn-detail-meta">
                  <span>{r.organization ? r.organization.name : t("recetaEditor_plantilla")}</span>
                  <span>{t("recipeVersionCount", { count: versiones.length })}</span>
                  <span>
                    {publicada ? t("recetaEditor_listaPublicada", { version: publicada.version }) : t("recetaEditor_listaSinPublicar")}
                  </span>
                  {borrador ? <span>{t("recetaEditor_listaBorrador", { version: borrador.version })}</span> : null}
                </p>
                {r.description ? <p className="nn-muted">{r.description}</p> : null}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
