import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getManageableContext } from "../../../lib/traceability/lots";
import { HarvestForm } from "../../components/traceability/HarvestForm";
import { ReceivingForm } from "../../components/traceability/ReceivingForm";

export const dynamic = "force-dynamic";

export default async function NewLotPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  const context = await getManageableContext(user.userAccountId);

  return (
    <div>
      <Link href="/lots" className="nn-back-link">
        {t("backToLots")}
      </Link>
      <h1>{t("createLotButton")}</h1>
      <p className="nn-muted">{t("createLotIntro")}</p>

      <section className="nn-section">
        <h2>{t("harvestHeading")}</h2>
        <HarvestForm organizations={context.organizations} locations={context.locations} projects={context.projects} />
      </section>

      <section className="nn-section">
        <h2>{t("receivingHeading")}</h2>
        <ReceivingForm organizations={context.organizations} locations={context.locations} projects={context.projects} />
      </section>
    </div>
  );
}
