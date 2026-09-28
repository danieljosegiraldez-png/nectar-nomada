import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { sitiosParaCrearInstalacion } from "../../../lib/traceability/instalaciones";
import { LocationAccessError } from "../../../lib/traceability/locations";
import { FormularioUbicacion } from "../FormularioUbicacion";

export const dynamic = "force-dynamic";
export default async function NuevaInstalacionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Secado");
  let sitios;
  try { sitios = await sitiosParaCrearInstalacion(user.userAccountId); }
  catch (error) {
    if (!(error instanceof LocationAccessError)) throw error;
    // Daniel, 2026-09-27: que el servicio niegue el acceso es falta de permiso — 404, sin explicar.
    notFound();
  }
  // Daniel, 2026-09-27: sin el permiso, esta pantalla no existe — 404, sin explicar.
  if (sitios.length === 0) notFound();
  return <div>
    <p><Link href="/instalaciones">← {t("volver")}</Link></p>
    <h1>{t("crearInstalacion")}</h1>
    <FormularioUbicacion tipo="drying_facility" padres={sitios} />
  </div>;
}
