import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getLotSummary, TraceabilityAccessError } from "../../../../../lib/traceability/lots";
import { coberturaDelLote, puedeAbrirProceso, LotProcessError } from "../../../../../lib/traceability/lotProcess";
import { FermentationForm } from "../../../../components/traceability/FermentationForm";

export const dynamic = "force-dynamic";

export default async function NewFermentationPage({ params }: { params: Promise<{ id: string }> }) {
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

  // Parte 1, R4 (tarea 9, 2026-10-02): la receta de la corrida es la del proceso que CUBRE al lote, y el formulario la
  // enseña sólo para leer. Antes se le pasaba siempre `null` y decía «el proceso de este lote no tiene receta» aunque la
  // tuviera. Ahora sólo lo dice cuando el proceso abierto de verdad no la tiene.
  //
  // Sin proceso abierto no se ofrece el formulario (R3: el servicio rechazaría con `sin_proceso_abierto`), y se dice por
  // qué, con las mismas frases que la ficha y la página del proceso. Un `LotProcessError` al cargar —un linaje de más de 64
  // generaciones— se dice también: no es un 404 ni un 500.
  let aviso: string | null = null;
  let recetaDelProceso: string | null = null;
  try {
    const cobertura = await coberturaDelLote(user.userAccountId, id);
    if (cobertura.estado === "abierto") {
      recetaDelProceso = cobertura.vigente?.recetaConVersion ?? null;
    } else {
      const puede = await puedeAbrirProceso(user.userAccountId, id);
      aviso = puede.puede ? t("startRunNeedsOpenProcess") : t(`processCannotOpen_${puede.motivo}`);
    }
  } catch (error) {
    if (!(error instanceof LotProcessError)) throw error;
    aviso = error.message === "lineage_too_deep" ? t("processLineageTooDeep") : t("processLoadFailed", { detail: error.message });
  }

  return (
    <div>
      <Link href={`/lots/${id}`} className="nn-back-link">
        {t("backToLot", { lotCode: lot.lotCode })}
      </Link>
      <h1>{t("startFermentationButton")}</h1>
      {aviso !== null ? (
        <p className="nn-muted">
          <Link href={`/lots/${id}/process`}>{aviso}</Link>
        </p>
      ) : (
        <FermentationForm lotId={id} recetaDelProceso={recetaDelProceso} />
      )}
    </div>
  );
}
