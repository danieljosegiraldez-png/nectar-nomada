import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { mostrarFecha } from "../../../lib/time/mostrarInstante";
import { getCurrentUser } from "../../../lib/auth/session";
import { pasosDeLaVersion } from "../../../lib/recetas/pasos";
import { puedeAutoriaDeReceta } from "../../../lib/recetas/autoria";
import { getRecipeForEditor, listRecipeOrganizations, ProcessTargetError } from "../../../lib/traceability/processTargets";
import { AccionesDelPaso } from "../../components/traceability/AccionesDelPaso";
import { DerivarRecetaForm } from "../../components/traceability/DerivarRecetaForm";
import { NuevaVersionForm } from "../../components/traceability/NuevaVersionForm";
import { PublicarVersionForm } from "../../components/traceability/PublicarVersionForm";
import { RecipeMetadataForm } from "../../components/traceability/RecipeMetadataForm";

export const dynamic = "force-dynamic";

type PasoDeLaPagina = Awaited<ReturnType<typeof pasosDeLaVersion>>[number];

/**
 * Una receta como lista de pasos — diseño §6. Parte 2a, tarea 14 (2026-10-03; integrada el 2026-10-04).
 *
 * Arriba, la versión vigente (la más alta): en un BORRADOR, y sólo con el permiso de autoría, se añaden, mueven, quitan y editan pasos y se publica (con al menos un
 * paso: el servicio lo exige y el botón no se ofrece sin uno); una versión publicada no se edita, y sólo ofrece empezar la siguiente. Una plantilla (sin organización) se
 * deriva a una organización propia. Abajo, el historial con los pasos de cada versión anterior. Las metas de versión de antes de los pasos se enseñan siempre, sin controles.
 *
 * **Lo que no puedes hacer no se muestra, y no se explica** (Daniel, 2026-09-27): sin `puedeAutorar` no hay controles ni una frase que los disculpe. Pregunta con
 * `puedeAutoriaDeReceta`, la gemela de la regla que aplican los servicios (V16: el permiso del Coffee Process Manager; `edit_beneficio` ya no basta). **Una receta Libre
 * se ve y no se toca** —es lo que ocurrió en un proceso (§5.2), se CONVIERTE en receta (§5.3, tarea 11)—, ni para quien puede escribir recetas.
 */
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

  // Un `const` y no un `let` + `try`: los cierres de más abajo (`renderPaso`, `metasDeVersion`) leen `recipe`, y un `let` sin tipo capturado por un cierre es un
  // error de tipos implícito (TS7034).
  const recipe = await getRecipeForEditor(user.userAccountId, id).catch((error: unknown) => {
    if (error instanceof ProcessTargetError) redirect("/recipes");
    throw error;
  });

  const [t, query, autoria] = await Promise.all([
    getTranslations("Traceability"),
    searchParams,
    puedeAutoriaDeReceta(user.userAccountId, recipe.organizationId),
  ]);
  const puedeAutorar = autoria && !recipe.esLibre;
  const pasosPorVersion = new Map<string, PasoDeLaPagina[]>(
    await Promise.all(recipe.versions.map(async (v) => [v.id, await pasosDeLaVersion(user.userAccountId, v.id)] as const)),
  );

  const current = recipe.versions[0];
  const esBorrador = current?.status === "draft";
  const editable = esBorrador && puedeAutorar;
  const publicada = recipe.versions.find((v) => v.status === "approved");
  const pasosActuales = current ? (pasosPorVersion.get(current.id) ?? []) : [];

  // Derivar: sólo una plantilla PUBLICADA, y sólo a las organizaciones donde el servidor va a aceptar la copia.
  const organizacionesParaDerivar: { id: string; name: string }[] = [];
  if (recipe.organizationId === null && publicada) {
    for (const org of await listRecipeOrganizations(user.userAccountId)) {
      if (await puedeAutoriaDeReceta(user.userAccountId, org.id)) organizacionesParaDerivar.push(org);
    }
  }

  // Las 34 variables de este panel tienen texto en los dos idiomas (`tests/recetas/etiquetasDeVariables.test.ts` lo exige).
  const etiquetaDeVariable = (variable: string): string => t(`variable_${variable}` as "variable_ph");
  const metasDeVersion = (v: (typeof recipe.versions)[number]) => v.targets.filter((tg) => tg.recipeStepId === null);
  const renderMeta = (tg: (typeof recipe.versions)[number]["targets"][number]) => (
    <li key={tg.id}>
      {etiquetaDeVariable(tg.variable)}
      {" · "}
      {t(`moment_${tg.moment}`)}
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
  );

  const renderPaso = (p: PasoDeLaPagina, total: number, conControles: boolean) => (
    <li key={p.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "0.75rem" }}>
      <h3 style={{ margin: 0 }}>
        {p.seq}. {t(`tipoPaso_${p.tipo}`)}
        {p.opcional ? (
          <span className="nn-badge" style={{ marginLeft: "0.5rem" }}>
            {t("recetaEditor_opcional")}
          </span>
        ) : null}
      </h3>
      {p.intencion ? <p className="nn-muted">{p.intencion}</p> : null}
      <p className="nn-detail-meta">
        {p.horasSugeridas !== null ? <span>{t("recetaEditor_horasSugeridas", { horas: p.horasSugeridas })}</span> : null}
        {p.metas.length > 0 ? <span>{t("recetaEditor_metasDelPaso", { count: p.metas.length })}</span> : null}
        {p.fines.length > 0 || p.finPorTiempo ? (
          <span>{t("recetaEditor_finesDelPaso", { count: p.fines.length + (p.finPorTiempo ? 1 : 0) })}</span>
        ) : null}
        {p.adiciones.length > 0 ? <span>{t("recetaEditor_adicionesDelPaso", { count: p.adiciones.length })}</span> : null}
      </p>
      {conControles ? (
        <div>
          <Link href={`/recipes/${recipe.id}/pasos/${p.id}`}>{t("recetaEditor_editarPaso")}</Link>
          <AccionesDelPaso recipeId={recipe.id} stepId={p.id} seq={p.seq} total={total} />
        </div>
      ) : null}
    </li>
  );

  return (
    <div>
      <Link href="/recipes" className="nn-back-link">{t("recipesBackLink")}</Link>
      <h1>{recipe.name}</h1>
      <p className="nn-detail-meta">
        <span>{recipe.organization ? recipe.organization.name : t("recetaEditor_plantilla")}</span>
        <span>{t("recipeVersionCount", { count: recipe.versions.length })}</span>
        {current ? <span>{t("recipeCurrentVersion", { version: current.version })}</span> : null}
      </p>

      {query.ok === "renamed" ? <p className="nn-ok" role="status">{t("recipeRenamedOk")}</p> : null}
      {query.ok === "receta_creada" ? <p className="nn-ok" role="status">{t("recetaEditor_okRecetaCreada")}</p> : null}
      {query.ok === "paso_agregado" ? <p className="nn-ok" role="status">{t("recetaEditor_okPasoAgregado")}</p> : null}
      {query.ok === "paso_guardado" ? <p className="nn-ok" role="status">{t("recetaEditor_okPasoGuardado")}</p> : null}
      {query.ok === "version_publicada" ? <p className="nn-ok" role="status">{t("recetaEditor_okVersionPublicada")}</p> : null}
      {query.ok === "borrador_creado" ? <p className="nn-ok" role="status">{t("recetaEditor_okBorradorCreado")}</p> : null}
      {query.ok === "receta_derivada" ? <p className="nn-ok" role="status">{t("recetaEditor_okRecetaDerivada")}</p> : null}
      {query.ok === "convertida" ? <p className="nn-ok" role="status">{t("recetaEditor_okConvertida")}</p> : null}

      {puedeAutorar ? (
        <section className="nn-section">
          <h2>{t("recipeMetadataHeading")}</h2>
          <p className="nn-muted">{t("recipeMetadataIntro")}</p>
          <RecipeMetadataForm recipeId={recipe.id} name={recipe.name} description={recipe.description ?? ""} />
        </section>
      ) : null}

      {current ? (
        <section className="nn-section">
          <h2>
            {t("recetaEditor_pasosHeading", { version: current.version })}
            <span className="nn-badge" style={{ marginLeft: "0.5rem" }}>
              {esBorrador ? t("recetaEditor_borrador") : t("recetaEditor_publicada")}
            </span>
            {recipe.esLibre ? (
              <span className="nn-badge" style={{ marginLeft: "0.5rem" }}>
                {t("recetaEditor_libre")}
              </span>
            ) : null}
          </h2>
          {editable ? <p className="nn-muted">{t("recetaEditor_borradorIntro")}</p> : null}
          {!esBorrador ? <p className="nn-muted">{t("recetaEditor_publicadaIntro")}</p> : null}

          {pasosActuales.length === 0 ? (
            <p className="nn-muted">{t("recetaEditor_sinPasos")}</p>
          ) : (
            <ol style={{ listStyle: "none", padding: 0 }}>{pasosActuales.map((p) => renderPaso(p, pasosActuales.length, editable))}</ol>
          )}

          {metasDeVersion(current).length > 0 ? (
            <>
              <h3>{t("recetaEditor_metasDeVersionHeading")}</h3>
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>{metasDeVersion(current).map(renderMeta)}</ul>
            </>
          ) : null}

          {editable ? (
            <p>
              <Link
                href={`/recipes/${recipe.id}/pasos/nuevo${pasosActuales.length > 0 ? `?despues=${pasosActuales[pasosActuales.length - 1]!.seq}` : ""}`}
                className="nn-button"
                style={{ display: "inline-block", textDecoration: "none" }}
              >
                {t("recetaEditor_anadirPaso")}
              </Link>
            </p>
          ) : null}
          {editable && pasosActuales.length > 0 ? <PublicarVersionForm recipeId={recipe.id} recipeVersionId={current.id} /> : null}
        </section>
      ) : null}

      {/* Una Libre es lo que ocurrió en un lote (diseño §5.2): no tiene «versión siguiente» —el selector no la ofrecería nunca—, se CONVIERTE en receta (§5.3). `puedeAutorar` ya es falso para ella. */}
      {current && !esBorrador && puedeAutorar ? (
        <section className="nn-section">
          <h2>{t("recetaEditor_nuevaVersionHeading")}</h2>
          <NuevaVersionForm recipeId={recipe.id} desdeVersionId={current.id} />
        </section>
      ) : null}

      {publicada && organizacionesParaDerivar.length > 0 ? (
        <section className="nn-section">
          <h2>{t("recetaEditor_derivarHeading")}</h2>
          <p className="nn-muted">{t("recetaEditor_derivarIntro")}</p>
          <DerivarRecetaForm plantillaVersionId={publicada.id} nombreSugerido={recipe.name} organizations={organizacionesParaDerivar} />
        </section>
      ) : null}

      {recipe.versions.length > 1 ? (
        <section className="nn-section">
          <h2>{t("recipeHistoryHeading")}</h2>
          <p className="nn-muted">{t("recipeHistoryIntro")}</p>
          {recipe.versions.slice(1).map((v) => {
            const pasos = pasosPorVersion.get(v.id) ?? [];
            const metas = metasDeVersion(v);
            return (
              <div key={v.id} className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0 }}>
                  {t("recipeVersionLabel", { version: v.version })} · {v.status === "draft" ? t("recetaEditor_borrador") : t("recetaEditor_publicada")}
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
                {pasos.length > 0 ? (
                  <details>
                    <summary>{t("recetaEditor_verPasos", { count: pasos.length })}</summary>
                    <ol style={{ listStyle: "none", padding: 0 }}>{pasos.map((p) => renderPaso(p, pasos.length, false))}</ol>
                  </details>
                ) : null}
                {metas.length > 0 ? <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>{metas.map(renderMeta)}</ul> : null}
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
