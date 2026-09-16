import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { sitiosParaInstalaciones } from "../../../lib/traceability/instalaciones";
import { LocationAccessError } from "../../../lib/traceability/locations";
import { FormularioUbicacion } from "../FormularioUbicacion";

export const dynamic = "force-dynamic";
export default async function NuevaInstalacionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Secado");
  let sitios;
  try { sitios = await sitiosParaInstalaciones(user.userAccountId); }
  catch (error) {
    if (!(error instanceof LocationAccessError)) throw error;
    return <div><h1>{t("crearInstalacion")}</h1><p role="alert">{t("error_sin_acceso")}</p><Link href="/instalaciones">{t("volver")}</Link></div>;
  }
  return <div>
    <p><Link href="/instalaciones">← {t("volver")}</Link></p>
    <h1>{t("crearInstalacion")}</h1>
    <FormularioUbicacion tipo="drying_facility" padres={sitios} />
  </div>;
}
