import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { detalleInstalacion } from "../../../lib/traceability/instalaciones";
import { LocationAccessError, puedeEditarBeneficioEn } from "../../../lib/traceability/locations";
import { SecadoFormError } from "../../../lib/traceability/secadoForm";
import { FormularioUbicacion } from "../FormularioUbicacion";

export const dynamic = "force-dynamic";
export default async function InstalacionPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Secado");
  const { id } = await params;
  const { ok } = await searchParams;
  let instalacion;
  try { instalacion = await detalleInstalacion(user.userAccountId, id); }
  catch (error) {
    if (error instanceof SecadoFormError) notFound();
    if (!(error instanceof LocationAccessError)) throw error;
    return <div><h1>{t("instalaciones")}</h1><p role="alert">{t("error_sin_acceso")}</p><Link href="/instalaciones">{t("volver")}</Link></div>;
  }
  const puedeEditar = await puedeEditarBeneficioEn(user.userAccountId, id);
  return <div>
    <p><Link href="/instalaciones">← {t("volver")}</Link></p>
    <p>{instalacion.sitio?.name ?? t("sitioNoVisible")} → {instalacion.name}</p>
    <h1>{instalacion.name}</h1>
    {ok === "guardado" && <p role="status">{t("guardado")}</p>}
    {!puedeEditar && <p role="alert">{t("sinPermisoEditar")}</p>}
    {puedeEditar && <FormularioUbicacion key={JSON.stringify(instalacion)} tipo="drying_facility" existente={instalacion} />}
    <h2>{t("camas")}</h2>
    {!instalacion.camas.length && <p>{t("sinCamas")}</p>}
    {instalacion.camas.map((c) => <section key={JSON.stringify(c)}>
      <h3>{c.name}</h3>
      {puedeEditar && <FormularioUbicacion tipo="drying_bed" existente={c} />}
    </section>)}
    {puedeEditar && <><h2>{t("crearCama")}</h2><FormularioUbicacion tipo="drying_bed" parentLocationId={id} /></>}
    <p><Link href="/inspecciones/nueva">{t("inspeccionTitulo")}</Link></p>
  </div>;
}
