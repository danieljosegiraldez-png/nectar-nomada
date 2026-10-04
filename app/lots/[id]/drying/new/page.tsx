import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getLotSummary, TraceabilityAccessError } from "../../../../../lib/traceability/lots";
import { puedeAbrirProceso, puedeEmpezarCorrida, LotProcessError } from "../../../../../lib/traceability/lotProcess";
import { DryingForm } from "../../../../components/traceability/DryingForm";

export const dynamic = "force-dynamic";

export default async function NewDryingPage({ params }: { params: Promise<{ id: string }> }) {
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

  // Revisión final (ronda de arreglo 1, 2026-10-03): no se ofrece el formulario donde `startDryingRun` lo rechazaría. Antes esta
  // página no miraba nada. Pregunta `puedeEmpezarCorrida`, la MISMA función que corre el servicio, y dice por qué con las mismas
  // frases que la ficha y el formulario de fermentación.
  let aviso: string | null = null;
  try {
    const empezar = await puedeEmpezarCorrida(user.userAccountId, lot.id);
    if (!empezar.puede && empezar.motivo === "sin_proceso_abierto") {
      const puede = await puedeAbrirProceso(user.userAccountId, lot.id);
      aviso = puede.puede ? t("startRunNeedsOpenProcess") : t(`processCannotOpen_${puede.motivo}`);
    } else if (!empezar.puede) {
      aviso = empezar.motivo === "lineage_too_deep" ? t("processLineageTooDeep") : t(`error_proceso_${empezar.motivo}`);
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
      <h1>{t("startDryingButton")}</h1>
      {aviso !== null ? (
        <p className="nn-muted">
          <Link href={`/lots/${lot.id}/process`}>{aviso}</Link>
        </p>
      ) : (
        <DryingForm lotId={lot.id} />
      )}
    </div>
  );
}
