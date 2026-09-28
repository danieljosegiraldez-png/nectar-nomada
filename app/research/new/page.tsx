import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { listVariableCatalogs } from "../../../lib/research/protocols";
import { puedeVerInvestigacion } from "../../../lib/research/access";
import { ProtocolForm } from "../../components/research/ProtocolForm";

export const dynamic = "force-dynamic";

export default async function NewProtocolPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Research");
  // Daniel, 2026-09-27: sin acceso a investigación esta pantalla no existe — 404, sin explicar.
  // **Y antes daba un 500**: `listVariableCatalogs` llama a `requireResearchAccess`, que lanza
  // `ResearchAccessError`, y esta página no lo atrapaba. Se pregunta ANTES, con el predicado que
  // delega en el mismo guardia, así que las dos respuestas no pueden divergir.
  if (!(await puedeVerInvestigacion(user.userAccountId))) notFound();
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
