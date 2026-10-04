import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getLotSummary, getManageableContext, TraceabilityAccessError } from "../../../../../lib/traceability/lots";
import { HullingForm } from "../../../../components/traceability/HullingForm";

export const dynamic = "force-dynamic";

export default async function NewHullingPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (!["parchment", "dry_cherry"].includes(lot.lotType)) notFound();

  const context = await getManageableContext(user.userAccountId);
  return (
    <div>
      <Link href={`/lots/${id}`} className="nn-back-link">{t("backToLot", { lotCode: lot.lotCode })}</Link>
      <h1>{t("hullingTitle")}</h1>
      <p className="nn-muted">{t("hullingIntro")}</p>
      {context.sinAmbito ? (
        <p className="nn-error" role="alert">{t("sinAmbitoGestionBody")}</p>
      ) : (
        <HullingForm lotId={lot.id} locations={context.locations} defaultLocationId={lot.locationId} />
      )}
    </div>
  );
}
