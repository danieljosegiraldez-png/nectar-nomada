import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getLotSummary, TraceabilityAccessError } from "../../../../../lib/traceability/lots";
import { computeCurrentQuantity } from "../../../../../lib/traceability/quantity";
import { codigosYaDerivadosDe, getSelectionCatalogs } from "../../../../../lib/traceability/selection";
import { GreenGradingForm } from "../../../../components/traceability/GreenGradingForm";

export const dynamic = "force-dynamic";

export default async function NewGreenSelectionPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (lot.lotType !== "green") notFound();

  const [quantity, catalogs, usedCodes] = await Promise.all([
    computeCurrentQuantity(user.userAccountId, id),
    getSelectionCatalogs(),
    codigosYaDerivadosDe(id),
  ]);

  return (
    <div>
      <Link href={`/lots/${id}`} className="nn-back-link">{t("backToLot", { lotCode: lot.lotCode })}</Link>
      <h1>{t("greenGradingTitle")}</h1>
      <p className="nn-muted">{t("greenGradingIntro")}</p>
      <GreenGradingForm
        lotId={id}
        lotCode={lot.lotCode}
        usedCodes={usedCodes}
        currentQuantityKg={quantity.recorded && quantity.unit === "kg" ? Number(quantity.quantity) : null}
        categories={catalogs.categories}
      />
    </div>
  );
}
