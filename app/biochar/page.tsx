import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { listBiocharBatches } from "../../lib/traceability/biocharBatches";
import { BiocharBatchForm } from "../components/traceability/BiocharBatchForm";

export const dynamic = "force-dynamic";

/**
 * Los lotes de biochar, y el formulario para registrar uno.
 *
 * Ruta propia y no una sección de `/plots/[id]` porque un lote no es de una
 * parcela: se quema en un sitio —la finca, el beneficio— y puede aplicarse
 * después en varios bloques. Colgarlo de una parcela habría hecho que el
 * primer lote registrado se quedara casado con la primera parcela.
 */
export default async function BiocharPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  const { batches, locations, organizations } = await listBiocharBatches(user.userAccountId);

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("biocharTitle")}</h1>
      <p className="nn-muted">{t("biocharIntro")}</p>

      <section className="nn-section">
        {batches.length === 0 ? (
          <p className="nn-muted">{t("biocharNone")}</p>
        ) : (
          <div className="nn-grid">
            {batches.map((b) => (
              <Link key={b.id} href={`/biochar/${b.id}`} className="nn-card">
                <h3>{b.batchCode}</h3>
                <p className="nn-muted">
                  {t("biocharProducedAtColumn")}: {b.producedAtLocation.name}
                </p>
                <dl className="nn-detail-meta">
                  {/* Cada campo ausente se dice, en vez de omitirse: una ficha
                      con tres líneas y una con ocho no deben parecer el mismo
                      lote mejor o peor documentado por accidente. */}
                  <p>
                    {t("biocharProducedOnLabel")}:{" "}
                    {b.producedAt ? b.producedAt.toISOString().slice(0, 10) : <span className="nn-muted">{t("biocharNotRecordedYet")}</span>}
                  </p>
                  <p>
                    {t("biocharFeedstockLabel")}:{" "}
                    {b.feedstock ?? <span className="nn-muted">{t("biocharNotRecordedYet")}</span>}
                  </p>
                  <p>
                    {t("biocharPeakTempLabel")}:{" "}
                    {b.peakTemperatureC != null ? `${b.peakTemperatureC} °C` : <span className="nn-muted">{t("biocharNotRecordedYet")}</span>}
                  </p>
                </dl>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("biocharNewHeading")}</h2>
        <BiocharBatchForm
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
          values={{
            batchCode: "",
            producedAtLocationId: "",
            producedAt: null,
            feedstock: null,
            feedstockSource: null,
            moistureCondition: null,
            kilnDesign: null,
            peakTemperatureC: null,
            temperatureMethod: null,
            burnDurationMinutes: null,
            timeAtPeakMinutes: null,
            oxygenManagement: null,
            cooling: null,
            quenchWaterSource: null,
            particleSize: null,
            storageConditions: null,
            chargingMaterial: null,
            chargingRatio: null,
            coComposted: null,
            chargingDurationDays: null,
            analysisLaboratory: null,
            provenanceClass: "",
            dataQuality: null,
            notes: null,
          }}
        />
      </section>
    </div>
  );
}
