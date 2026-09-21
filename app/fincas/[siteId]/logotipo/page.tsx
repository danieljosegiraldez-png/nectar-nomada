import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { fincaParaLogotipo } from "../../../../lib/traceability/fincaLogo";
import { CambiarLogotipoForm } from "../../../components/traceability/CambiarLogotipoForm";

export const dynamic = "force-dynamic";

/**
 * Botones de finca y parcela (2026-09-21) — cambiar el logotipo de una finca.
 * El mismo permiso que atributos del lugar (`location:manage_attributes`), comprobado en el
 * servidor, no sólo ocultando el enlace: quien no lo tiene recibe 404, igual que el resto de
 * pantallas de finca que no le corresponden.
 */
export default async function LogotipoDeFincaPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sitio = await fincaParaLogotipo(user.userAccountId, siteId);
  if (!sitio) notFound();

  const t = await getTranslations("Fincas");
  return (
    <div>
      <Link href="/finca" className="nn-back-link">
        {t("volverAFinca")}
      </Link>
      <h1>{t("logotipoTitulo")}</h1>
      <p className="nn-muted">{t("logotipoIntro", { nombre: sitio.name })}</p>
      <CambiarLogotipoForm siteId={sitio.id} volverA="/finca" />
    </div>
  );
}
