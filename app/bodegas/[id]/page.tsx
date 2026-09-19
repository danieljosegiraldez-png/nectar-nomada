import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AvisoDeRutina } from "../../components/rutinas/AvisoDeRutina";
import { RutinasDeLugar } from "../../components/rutinas/RutinasDeLugar";
import { getCurrentUser } from "../../../lib/auth/session";
import { BodegaError, detalleBodega } from "../../../lib/traceability/bodegas";
import { LocationAccessError } from "../../../lib/traceability/locations";

export const dynamic = "force-dynamic";
export default async function BodegaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const [t, tEq, { ok, error }] = await Promise.all([
    getTranslations("Bodegas"),
    getTranslations("Equipos"),
    searchParams,
  ]);
  let bodega;
  try {
    bodega = await detalleBodega(user.userAccountId, id);
  } catch (e) {
    if (e instanceof BodegaError) notFound();
    if (!(e instanceof LocationAccessError)) throw e;
    return (
      <div>
        <h1>{t("titulo")}</h1>
        <p role="alert">{t("sinPermiso")}</p>
      </div>
    );
  }
  return (
    <div>
      <p>
        <Link href="/bodegas">← {t("titulo")}</Link>
      </p>
      <p>{bodega.padre?.name ?? t("padreNoVisible")} → {bodega.name}</p>
      <h1>{bodega.name}</h1>
      {ok === "creada" && (
        <p className="nn-ok" role="status">
          {t("creada")}
        </p>
      )}
      <AvisoDeRutina ok={ok} error={error} t={tEq} />
      <RutinasDeLugar userAccountId={user.userAccountId} locationId={id} />
    </div>
  );
}
