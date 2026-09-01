"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  createBiocharBatchAction,
  updateBiocharBatchAction,
  type TraceabilityActionState,
} from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

const MOISTURE_CONDITIONS = ["green", "air_dried", "dried"] as const;
const COOLINGS = ["water_quench", "sealed_cooling", "open_cooling"] as const;
// ADR-038: un lote transcrito del cuaderno mientras se quemaba, uno visto por
// quien lo anota, y uno reconstruido de memoria son tres afirmaciones
// distintas. No hay opción por defecto, por eso el `required` y el hueco vacío.
const PROVENANCES = ["original_record", "direct_observation", "measured_fact"] as const;
const DATA_QUALITIES = ["verified", "provisional", "unconfirmed", "not_tested"] as const;

export interface BiocharBatchValues {
  id?: string;
  batchCode: string;
  producedAtLocationId: string;
  producedAt: string | null;
  feedstock: string | null;
  feedstockSource: string | null;
  moistureCondition: string | null;
  kilnDesign: string | null;
  peakTemperatureC: number | null;
  temperatureMethod: string | null;
  burnDurationMinutes: number | null;
  timeAtPeakMinutes: number | null;
  oxygenManagement: string | null;
  cooling: string | null;
  quenchWaterSource: string | null;
  particleSize: string | null;
  storageConditions: string | null;
  chargingMaterial: string | null;
  chargingRatio: string | null;
  coComposted: boolean | null;
  chargingDurationDays: number | null;
  analysisLaboratory: string | null;
  provenanceClass: string;
  dataQuality: string | null;
  notes: string | null;
}

export interface BiocharOption {
  id: string;
  name: string;
}

/**
 * El registro de lote de biochar — Tabla 6 del marco de investigación.
 *
 * Sirve para crear y para corregir: el mismo formulario, distinta acción. Una
 * corrección es una **edición** y no una fila nueva, porque un lote de biochar
 * registra lo que se hizo, no una lectura observada; el `AuditEvent` guarda el
 * antes (ver la cabecera de `lib/traceability/biocharBatches.ts`).
 *
 * **Casi todo es opcional y arranca vacío.** El Paso 2 del plan de acción es
 * escribir lo que Bob **ya hace**, no obligarle a medir lo que nunca midió. Una
 * casilla vacía dice «sin registrar», que es distinto de cero (ADR-080).
 *
 * Lo único obligatorio son el código —sin él no hay a qué atribuir un resultado
 * después—, dónde se produjo, y la procedencia.
 */
/**
 * La organización YA NO se elige: se deriva de la Location donde se produjo el
 * lote (`resolveOrganizationForLocation`). Lo pidió la revisión independiente
 * del 2026-09-01 — aceptarla del formulario dejaba que un lote quedara
 * producido en una finca y propiedad de otra organización, y el repositorio
 * tiene una regla explícita: el dueño de una Location se mira en
 * `core.location.organization_id`.
 */
export function BiocharBatchForm({
  values,
  locations,
}: {
  values: BiocharBatchValues;
  locations: BiocharOption[];
}) {
  const t = useTranslations("Traceability");
  const editando = values.id != null;
  const [state, formAction, pending] = useActionState(
    editando ? updateBiocharBatchAction : createBiocharBatchAction,
    initialState,
  );

  return (
    <form action={formAction} className="nn-form">
      {editando ? <input type="hidden" name="biocharBatchId" value={values.id} /> : null}

      <div className="nn-field">
        <label htmlFor="batchCode">{t("biocharCodeLabel")}</label>
        <input
          id="batchCode"
          type="text"
          name="batchCode"
          required
          defaultValue={values.batchCode}
          placeholder="LN-BC-2026-001"
        />
        <p className="nn-muted">{t("biocharCodeHelp")}</p>
      </div>

      {/* Al corregir no se cambian de sitio ni de dueño: eso no es una
          corrección, es otro lote. Van como campos ocultos para que el PATCH
          no los pierda. */}
      {editando ? (
        <>
          <input type="hidden" name="producedAtLocationId" value={values.producedAtLocationId} />
        </>
      ) : (
        <>

          <div className="nn-field">
            <label htmlFor="producedAtLocationId">{t("biocharProducedAtLabel")}</label>
            <select id="producedAtLocationId" name="producedAtLocationId" required defaultValue={values.producedAtLocationId}>
              <option value="">{t("biocharProducedAtChoose")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <p className="nn-muted">{t("biocharProducedAtHelp")}</p>
          </div>
        </>
      )}

      <div className="nn-field">
        <label htmlFor="producedAt">{t("biocharProducedOnLabel")}</label>
        <input id="producedAt" type="date" name="producedAt" defaultValue={values.producedAt ?? ""} />
        <p className="nn-muted">{t("biocharProducedOnHelp")}</p>
      </div>

      <h3>{t("biocharFeedstockHeading")}</h3>

      <div className="nn-field">
        <label htmlFor="feedstock">{t("biocharFeedstockLabel")}</label>
        <input id="feedstock" type="text" name="feedstock" defaultValue={values.feedstock ?? ""} placeholder={t("notRecorded")} />
        <p className="nn-muted">{t("biocharFeedstockHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="feedstockSource">{t("biocharFeedstockSourceLabel")}</label>
        <input id="feedstockSource" type="text" name="feedstockSource" defaultValue={values.feedstockSource ?? ""} placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        <label htmlFor="moistureCondition">{t("biocharMoistureLabel")}</label>
        <select id="moistureCondition" name="moistureCondition" defaultValue={values.moistureCondition ?? ""}>
          <option value="">{t("notRecorded")}</option>
          {MOISTURE_CONDITIONS.map((v) => (
            <option key={v} value={v}>{t(`biocharMoisture_${v}` as "biocharMoisture_green")}</option>
          ))}
        </select>
      </div>

      <h3>{t("biocharThermalHeading")}</h3>

      <div className="nn-field">
        <label htmlFor="kilnDesign">{t("biocharKilnLabel")}</label>
        <input id="kilnDesign" type="text" name="kilnDesign" defaultValue={values.kilnDesign ?? ""} placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        <label htmlFor="peakTemperatureC">{t("biocharPeakTempLabel")}</label>
        <input
          id="peakTemperatureC"
          type="number"
          name="peakTemperatureC"
          step="1"
          min="0"
          inputMode="numeric"
          defaultValue={values.peakTemperatureC ?? ""}
          placeholder={t("notRecorded")}
        />
        {/* §9.2 del marco: por encima de 750 °C sube la suma de los 16 HAP del
            US EPA frente al rango 450-600 °C. Es una advertencia, no un
            límite: el servicio acepta el valor igual, porque rechazar un hecho
            registrado porque incomoda es cómo un sistema empieza a mentir. */}
        <p className="nn-muted">{t("biocharPeakTempHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="temperatureMethod">{t("biocharTempMethodLabel")}</label>
        <input id="temperatureMethod" type="text" name="temperatureMethod" defaultValue={values.temperatureMethod ?? ""} placeholder={t("notRecorded")} />
        <p className="nn-muted">{t("biocharTempMethodHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="burnDurationMinutes">{t("biocharBurnDurationLabel")}</label>
        <input id="burnDurationMinutes" type="number" name="burnDurationMinutes" step="1" min="0" inputMode="numeric" defaultValue={values.burnDurationMinutes ?? ""} placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        <label htmlFor="timeAtPeakMinutes">{t("biocharTimeAtPeakLabel")}</label>
        <input id="timeAtPeakMinutes" type="number" name="timeAtPeakMinutes" step="1" min="0" inputMode="numeric" defaultValue={values.timeAtPeakMinutes ?? ""} placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        <label htmlFor="oxygenManagement">{t("biocharOxygenLabel")}</label>
        <input id="oxygenManagement" type="text" name="oxygenManagement" defaultValue={values.oxygenManagement ?? ""} placeholder={t("notRecorded")} />
        <p className="nn-muted">{t("biocharOxygenHelp")}</p>
      </div>

      <h3>{t("biocharCoolingHeading")}</h3>

      <div className="nn-field">
        <label htmlFor="cooling">{t("biocharCoolingLabel")}</label>
        <select id="cooling" name="cooling" defaultValue={values.cooling ?? ""}>
          <option value="">{t("notRecorded")}</option>
          {COOLINGS.map((v) => (
            <option key={v} value={v}>{t(`biocharCooling_${v}` as "biocharCooling_water_quench")}</option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="quenchWaterSource">{t("biocharQuenchWaterLabel")}</label>
        <input id="quenchWaterSource" type="text" name="quenchWaterSource" defaultValue={values.quenchWaterSource ?? ""} placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        <label htmlFor="particleSize">{t("biocharParticleSizeLabel")}</label>
        <input id="particleSize" type="text" name="particleSize" defaultValue={values.particleSize ?? ""} placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        <label htmlFor="storageConditions">{t("biocharStorageLabel")}</label>
        <input id="storageConditions" type="text" name="storageConditions" defaultValue={values.storageConditions ?? ""} placeholder={t("notRecorded")} />
        <p className="nn-muted">{t("biocharStorageHelp")}</p>
      </div>

      <h3>{t("biocharChargingHeading")}</h3>
      <p className="nn-muted">{t("biocharChargingIntro")}</p>

      <div className="nn-field">
        <label htmlFor="chargingMaterial">{t("biocharChargingMaterialLabel")}</label>
        <input id="chargingMaterial" type="text" name="chargingMaterial" defaultValue={values.chargingMaterial ?? ""} placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        <label htmlFor="chargingRatio">{t("biocharChargingRatioLabel")}</label>
        <input id="chargingRatio" type="text" name="chargingRatio" defaultValue={values.chargingRatio ?? ""} placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        {/* El campo oculto declara que la casilla estuvo en el formulario. Sin
            él, «no marcada» y «no registrada» llegan idénticas al servidor —
            las dos como ausencia— y desmarcarla al corregir no borraría nada. */}
        <input type="hidden" name="coCompostedPresent" value="1" />
        <label htmlFor="coComposted">
          <input id="coComposted" type="checkbox" name="coComposted" defaultChecked={values.coComposted === true} />{" "}
          {t("biocharCoCompostedLabel")}
        </label>
      </div>

      <div className="nn-field">
        <label htmlFor="chargingDurationDays">{t("biocharChargingDaysLabel")}</label>
        <input id="chargingDurationDays" type="number" name="chargingDurationDays" step="1" min="0" inputMode="numeric" defaultValue={values.chargingDurationDays ?? ""} placeholder={t("notRecorded")} />
      </div>

      <h3>{t("biocharRecordHeading")}</h3>

      <div className="nn-field">
        <label htmlFor="analysisLaboratory">{t("biocharLabLabel")}</label>
        <input id="analysisLaboratory" type="text" name="analysisLaboratory" defaultValue={values.analysisLaboratory ?? ""} placeholder={t("notRecorded")} />
        <p className="nn-muted">{t("biocharLabHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="provenanceClass">{t("provenanceClassLabel")}</label>
        <select id="provenanceClass" name="provenanceClass" required defaultValue={values.provenanceClass}>
          <option value="">{t("provenanceClassChoose")}</option>
          {PROVENANCES.map((v) => (
            <option key={v} value={v}>{t(`provenanceClass_${v}` as "provenanceClass_original_record")}</option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="dataQuality">{t("dataQualityLabel")}</label>
        <select id="dataQuality" name="dataQuality" defaultValue={values.dataQuality ?? ""}>
          <option value="">{t("notRecorded")}</option>
          {DATA_QUALITIES.map((v) => (
            <option key={v} value={v}>{t(`dataQuality_${v}` as "dataQuality_verified")}</option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="notes">{t("notesLabel")}</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={values.notes ?? ""} placeholder={t("notRecorded")} />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {editando ? t("biocharSaveButton") : t("biocharCreateButton")}
      </button>
    </form>
  );
}
