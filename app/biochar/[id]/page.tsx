import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getBiocharBatch, computeBatchAgingDays } from "../../../lib/traceability/biocharBatches";
import { LocationAccessError } from "../../../lib/traceability/locations";
import { BiocharBatchForm } from "../../components/traceability/BiocharBatchForm";
import { BiocharMeasurementForm } from "../../components/traceability/BiocharMeasurementForm";
import { listVariableDefinitions } from "../../../lib/traceability/units";

export const dynamic = "force-dynamic";

export default async function BiocharBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const t = await getTranslations("Traceability");

  let batch: Awaited<ReturnType<typeof getBiocharBatch>>;
  try {
    batch = await getBiocharBatch(user.userAccountId, id);
  } catch (error) {
    // Un lote inexistente y uno que este usuario no alcanza responden igual:
    // distinguirlos convierte la página en un detector de existencia.
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }

  // Derivado al leer, nunca guardado: las dos entradas se pueden corregir.
  const aging = computeBatchAgingDays(batch.producedAt, new Date());

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{batch.batchCode}</h1>
      <p className="nn-muted">
        {t("biocharProducedAtColumn")}: {batch.producedAtLocation.name} · {batch.organization.name}
      </p>
      <p className="nn-detail-meta">
        {t("biocharAgingLabel")}:{" "}
        {aging != null ? t("biocharAgingValue", { days: aging }) : <span className="nn-muted">{t("biocharAgingUnknown")}</span>}
      </p>

      <section className="nn-section">
        <h2>{t("biocharCharacterisationHeading")}</h2>
        <p className="nn-muted">{t("biocharCharacterisationIntro")}</p>

        {batch.measurements.length === 0 ? (
          <p className="nn-muted">{t("biocharNoMeasurements")}</p>
        ) : (
          <table className="nn-table">
            <thead>
              <tr>
                <th>{t("biocharVariableLabel")}</th>
                <th style={{ textAlign: "right" }}>{t("biocharValueLabel")}</th>
                <th>{t("biocharMeasuredOnLabel")}</th>
                <th>{t("provenanceClassLabel")}</th>
              </tr>
            </thead>
            <tbody>
              {batch.measurements.map((m) => (
                <tr key={m.id}>
                  <td>
                    {t(`variable_${m.variable}` as "variable_ph")}
                    {/* Una corrección se ve como corrección. La fila original
                        sigue ahí arriba con su valor: eso es lo que distingue
                        corregir de reescribir. */}
                    {m.correctsId ? <> · <span className="nn-muted">{t("biocharCorrectionTag")}</span></> : null}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                    {m.value.toString()} {m.unit}
                  </td>
                  <td>{m.occurredAt.toISOString().slice(0, 10)}</td>
                  <td>{t(`provenanceClass_${m.provenanceClass}` as "provenanceClass_measured_fact")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <BiocharMeasurementForm
          biocharBatchId={batch.id}
          variables={listVariableDefinitions("analisis_de_enmienda")}
        />
      </section>

      <section className="nn-section">
        <h2>{t("biocharEditHeading")}</h2>
        <BiocharBatchForm
          locations={[{ id: batch.producedAtLocation.id, name: batch.producedAtLocation.name }]}
          organizations={[{ id: batch.organization.id, name: batch.organization.name }]}
          values={{
            id: batch.id,
            batchCode: batch.batchCode,
            organizationId: batch.organizationId,
            producedAtLocationId: batch.producedAtLocationId,
            producedAt: batch.producedAt ? batch.producedAt.toISOString().slice(0, 10) : null,
            feedstock: batch.feedstock,
            feedstockSource: batch.feedstockSource,
            moistureCondition: batch.moistureCondition,
            kilnDesign: batch.kilnDesign,
            peakTemperatureC: batch.peakTemperatureC,
            temperatureMethod: batch.temperatureMethod,
            burnDurationMinutes: batch.burnDurationMinutes,
            timeAtPeakMinutes: batch.timeAtPeakMinutes,
            oxygenManagement: batch.oxygenManagement,
            cooling: batch.cooling,
            quenchWaterSource: batch.quenchWaterSource,
            particleSize: batch.particleSize,
            storageConditions: batch.storageConditions,
            chargingMaterial: batch.chargingMaterial,
            chargingRatio: batch.chargingRatio,
            coComposted: batch.coComposted,
            chargingDurationDays: batch.chargingDurationDays,
            analysisLaboratory: batch.analysisLaboratory,
            provenanceClass: batch.provenanceClass,
            dataQuality: batch.dataQuality,
            notes: batch.notes,
          }}
        />
      </section>

      <p>
        <Link href="/biochar">{t("biocharBackToList")}</Link>
      </p>
    </div>
  );
}
