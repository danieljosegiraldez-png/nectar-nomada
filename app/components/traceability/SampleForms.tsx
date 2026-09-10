"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  createSoilSampleAction,
  createFoliarSampleAction,
  type TraceabilityActionState,
} from "../../actions/traceability";
import { TriStateField } from "./TriStateField";
import { PROCEDENCIA_DE_REGISTRO_DE_CAMPO } from "../../../lib/traceability/procedencia";

const initialState: TraceabilityActionState = {};

// §7.1 — «tercio superior, medio o inferior». La lista la da el marco.
const CANOPY_POSITIONS = ["upper", "middle", "lower"] as const;
const DATA_QUALITIES = ["verified", "provisional", "unconfirmed", "not_tested"] as const;

/**
 * Registrar una muestra de suelo enviada al laboratorio.
 *
 * **La muestra, no el resultado.** Los valores de la Tabla 3 se registran
 * después, sobre esta fila, con el formulario de lecturas de laboratorio. Que
 * sean dos pasos no es burocracia: una muestra sale al laboratorio semanas
 * antes de que vuelva un número, y forzarlos juntos obligaría a inventar
 * resultados para poder guardar la muestra.
 */
export function SoilSampleForm({ locationId }: { locationId: string }) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(createSoilSampleAction, initialState);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />

      <div className="nn-field">
        <label htmlFor="soilSampleCode">{t("sampleCodeLabel")}</label>
        <input id="soilSampleCode" type="text" name="sampleCode" required />
      </div>

      <div className="nn-field">
        <label htmlFor="soilSampledAt">{t("sampleSampledAtLabel")}</label>
        <input id="soilSampledAt" type="date" name="sampledAt" required />
      </div>

      <div className="nn-field">
        <label htmlFor="soilTreatmentPlot">{t("sampleTreatmentPlotLabel")}</label>
        <input id="soilTreatmentPlot" type="text" name="treatmentPlotLabel" placeholder={t("notRecorded")} />
        <p className="nn-muted">{t("sampleTreatmentPlotHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="samplingPointLabel">{t("sampleSamplingPointLabel")}</label>
        <input id="samplingPointLabel" type="text" name="samplingPointLabel" placeholder={t("notRecorded")} />
        <p className="nn-muted">{t("sampleSamplingPointHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="depthTopCm">{t("sampleDepthLabel")}</label>
        <input id="depthTopCm" type="number" name="depthTopCm" step="1" min="0" placeholder={t("sampleDepthTopPlaceholder")} aria-label={t("sampleDepthTopPlaceholder")} />
        <input id="depthBottomCm" type="number" name="depthBottomCm" step="1" min="0" placeholder={t("sampleDepthBottomPlaceholder")} aria-label={t("sampleDepthBottomPlaceholder")} />
        <p className="nn-muted">{t("sampleDepthHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="subSampleCount">{t("sampleSubSamplesLabel")}</label>
        <input id="subSampleCount" type="number" name="subSampleCount" step="1" min="1" placeholder={t("notRecorded")} />
        <p className="nn-muted">{t("sampleSubSamplesHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="soilLaboratory">{t("sampleLaboratoryLabel")}</label>
        <input id="soilLaboratory" type="text" name="laboratory" placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        <label htmlFor="extractionMethod">{t("sampleExtractionLabel")}</label>
        <input id="extractionMethod" type="text" name="extractionMethod" placeholder={t("notRecorded")} />
        <p className="nn-muted">{t("sampleExtractionHelp")}</p>
      </div>

      <ProvenanceFields prefijo="soil" />

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("sampleSoilSaveButton")}
      </button>
    </form>
  );
}

/**
 * Registrar una muestra foliar.
 *
 * Los cuatro campos de protocolo —par de hojas, posición en el dosel, estado
 * fenológico y si la rama llevaba fruto— no son adorno. §7.1: sin ellos «la
 * comparación entre años no significa nada y las diferencias entre tratamientos
 * quedan ahogadas por el ruido del muestreo». La ficha del lote dice cuáles
 * faltan en cada muestra, en vez de dejar que un dato incomparable parezca uno
 * bueno.
 */
export function FoliarSampleForm({ locationId }: { locationId: string }) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(createFoliarSampleAction, initialState);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />

      <div className="nn-field">
        <label htmlFor="foliarSampleCode">{t("sampleCodeLabel")}</label>
        <input id="foliarSampleCode" type="text" name="sampleCode" required />
      </div>

      <div className="nn-field">
        <label htmlFor="foliarSampledAt">{t("sampleSampledAtLabel")}</label>
        <input id="foliarSampledAt" type="date" name="sampledAt" required />
      </div>

      <div className="nn-field">
        <label htmlFor="foliarTreatmentPlot">{t("sampleTreatmentPlotLabel")}</label>
        <input id="foliarTreatmentPlot" type="text" name="treatmentPlotLabel" placeholder={t("notRecorded")} />
      </div>

      <h4>{t("sampleProtocolHeading")}</h4>
      <p className="nn-muted">{t("sampleProtocolIntro")}</p>

      <div className="nn-field">
        <label htmlFor="leafPairPosition">{t("sampleLeafPairLabel")}</label>
        <input id="leafPairPosition" type="number" name="leafPairPosition" step="1" min="1" placeholder={t("notRecorded")} />
        <p className="nn-muted">{t("sampleLeafPairHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="canopyPosition">{t("sampleCanopyLabel")}</label>
        <select id="canopyPosition" name="canopyPosition" defaultValue="">
          <option value="">{t("notRecorded")}</option>
          {CANOPY_POSITIONS.map((v) => (
            <option key={v} value={v}>{t(`canopyPosition_${v}` as "canopyPosition_upper")}</option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="phenologicalStage">{t("samplePhenologyLabel")}</label>
        <input id="phenologicalStage" type="text" name="phenologicalStage" placeholder={t("notRecorded")} />
        <p className="nn-muted">{t("samplePhenologyHelp")}</p>
      </div>

      <TriStateField
        id="branchBearingFruit"
        name="branchBearingFruit"
        label={t("sampleBearingLabel")}
      />

      <div className="nn-field">
        <label htmlFor="treeAgeYears">{t("sampleTreeAgeLabel")}</label>
        <input id="treeAgeYears" type="number" name="treeAgeYears" step="1" min="0" placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        <label htmlFor="foliarCultivar">{t("sampleCultivarLabel")}</label>
        <input id="foliarCultivar" type="text" name="cultivar" placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        <label htmlFor="foliarLaboratory">{t("sampleLaboratoryLabel")}</label>
        <input id="foliarLaboratory" type="text" name="laboratory" placeholder={t("notRecorded")} />
      </div>

      <ProvenanceFields prefijo="foliar" />

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("sampleFoliarSaveButton")}
      </button>
    </form>
  );
}

/** Procedencia y calidad del dato, idénticas en los dos formularios. */
function ProvenanceFields({ prefijo }: { prefijo: string }) {
  const t = useTranslations("Traceability");
  return (
    <>
      <div className="nn-field">
        <label htmlFor={`${prefijo}Provenance`}>{t("provenanceClassLabel")}</label>
        <select id={`${prefijo}Provenance`} name="provenanceClass" required defaultValue="">
          <option value="">{t("provenanceClassChoose")}</option>
          {PROCEDENCIA_DE_REGISTRO_DE_CAMPO.map((v) => (
            <option key={v} value={v}>{t(`provenanceClass_${v}` as "provenanceClass_original_record")}</option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor={`${prefijo}DataQuality`}>{t("dataQualityLabel")}</label>
        <select id={`${prefijo}DataQuality`} name="dataQuality" defaultValue="">
          <option value="">{t("notRecorded")}</option>
          {DATA_QUALITIES.map((v) => (
            <option key={v} value={v}>{t(`dataQuality_${v}` as "dataQuality_verified")}</option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor={`${prefijo}Notes`}>{t("notesLabel")}</label>
        <input id={`${prefijo}Notes`} type="text" name="notes" placeholder={t("notRecorded")} />
      </div>
    </>
  );
}
