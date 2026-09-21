import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { listarInstalaciones } from "../../lib/traceability/instalaciones";
import { LocationAccessError } from "../../lib/traceability/locations";

export const dynamic = "force-dynamic";
function sombra(t: (k: string, v?: Record<string, string>) => string, grado: string | null, nota: string | null) {
  if (!grado && !nota) return null;
  return t("sombraValor", { grado: grado ? t(`sombra_${grado}`) : t("noDeclarado"), nota: nota ?? "" });
}
export default async function InstalacionesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Secado");
  let instalaciones;
  try { instalaciones = await listarInstalaciones(user.userAccountId); }
  catch (error) {
    if (!(error instanceof LocationAccessError)) throw error;
    return <div><h1>{t("instalaciones")}</h1><p role="alert">{t("error_sin_acceso")}</p></div>;
  }
  return <div>
    <p><Link href="/lots">← {t("lotes")}</Link></p>
    <h1>{t("instalaciones")}</h1>
    <p>{t("instalacionesIntro")}</p>
    <p><Link href="/instalaciones/nueva">{t("crearInstalacion")}</Link> · <Link href="/inspecciones/nueva">{t("inspeccionTitulo")}</Link></p>
    {!instalaciones.length && <p>{t("sinInstalaciones")}</p>}
    <ul>{instalaciones.map((i) => <li key={i.id}>
      {i.sitio?.name ?? t("sitioNoVisible")} → <Link href={`/instalaciones/${i.id}`}>{i.name}</Link>
      <p className="nn-muted">{i.dryingEnvironment ? t(`ambiente_${i.dryingEnvironment}`) : t("noDeclarado")}{sombra(t, i.shadePercentage, i.shadeDescription) ? ` · ${sombra(t, i.shadePercentage, i.shadeDescription)}` : ""}</p>
      <ul>{i.camas.map((c) => {
        const camaSombra = sombra(t, c.shadePercentage, c.shadeDescription) ?? (i.shadePercentage || i.shadeDescription ? `${sombra(t, i.shadePercentage, i.shadeDescription)} (${t("sombraDeLaInstalacion")})` : null);
        return <li key={c.id}>{c.name} · {c.rackLevel == null ? t("rackNoDeclarado") : t("rackValor", { nivel: c.rackLevel })}
          {camaSombra ? ` · ${camaSombra}` : ""}
        </li>;
      })}</ul>
    </li>)}</ul>
  </div>;
}
