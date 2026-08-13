import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { listVariableCatalogs } from "../../../lib/research/protocols";
import { ProtocolForm } from "../../components/research/ProtocolForm";

export const dynamic = "force-dynamic";

export default async function NewProtocolPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Research");
  const catalogs = await listVariableCatalogs(user.userAccountId);

  return (
    <div>
      <Link href="/research" className="nn-back-link">
        {t("backToResearch")}
      </Link>
      <h1>{t("createProtocolHeading")}</h1>
      <ProtocolForm catalogs={catalogs} />
    </div>
  );
}
