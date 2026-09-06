import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getLotSummary, TraceabilityAccessError } from "../../../../../lib/traceability/lots";
import { listRecipeVersionsForLot } from "../../../../../lib/traceability/processTargets";
import { RoastSessionForm } from "../../../../components/traceability/RoastSessionForm";

export const dynamic = "force-dynamic";

/**
 * R1 §4 — la pantalla que le faltaba al tueste.
 *
 * El servicio (`lib/traceability/roasting.ts`) estaba entero desde R1 y ninguna
 * pantalla lo llamaba: `recordRoastSession`, `listRoastSessions` y
 * `getRoastSessionDetail` no tenían un solo consumidor en `app/`. Por eso la
 * base tiene 0 tuestes — no faltaba el registro, faltaba por dónde entrar.
 *
 * Misma forma que secado y fermentación: se entra desde el lote, el guardia es
 * `getLotSummary`, y al terminar se vuelve al lote. Nada nuevo que aprender.
 */
export default async function NewRoastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");

  let lot;
  try {
    lot = await getLotSummary(user.userAccountId, id);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) notFound();
    throw error;
  }

  // Mismas versiones que ofrece la fermentación: aprobadas, y de esta
  // organización o compartidas. `listRecipeVersionsForLot` no es de fermentación
  // — filtra por eso y nada más—, así que sirve tal cual.
  const perfiles = (await listRecipeVersionsForLot(user.userAccountId, id)).map((v) => ({
    id: v.id,
    label: `${v.recipe.name} · v${v.version} · ${v.targets.length} ${t("targetsCountSuffix")}`,
  }));

  return (
    <div>
      <Link href={`/lots/${id}`} className="nn-back-link">
        {t("backToLot", { lotCode: lot.lotCode })}
      </Link>
      <h1>{t("recordRoastButton")}</h1>
      <p className="nn-muted">{t("recordRoastIntro")}</p>
      <RoastSessionForm lotId={id} perfiles={perfiles} />
    </div>
  );
}
