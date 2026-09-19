"use client";

import { CampoNumerico } from "../CampoNumerico";
import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  createSoilSampleAction,
  createFoliarSampleAction,
  type TraceabilityActionState,
} from "../../actions/traceability";
import { TriStateField } from "./TriStateField";
import { PROCEDENCIA_DE_REGISTRO_DE_CAMPO } from "../../../lib/traceability/procedencia";
import { queueFieldEvent } from "../../../lib/sync/offlineQueue";
import { construirPayloadDeMuestraDeSuelo, construirPayloadDeMuestraFoliar } from "../../../lib/sync/parcelaPayload";

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
export function SoilSampleForm({
  locationId,
  volverA,
}: {
  locationId: string;
  /** Fix round 1 (Tarea 6): sólo lo pasa `/plots/[id]/muestras/nueva` —
   * con esto, guardar vuelve a la pestaña Muestras. */
  volverA?: string;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(createSoilSampleAction, initialState);
  const [encolado, setEncolado] = useState(false);
  const [errorLocal, setErrorLocal] = useState(false);
  const [encolando, setEncolando] = useState(false);
  // El pestillo contra el doble toque sin señal. Ref y no sólo estado: el
  // estado apaga el botón en el render siguiente, y el segundo toque cabe ahí.
  const yaEncolando = useRef(false);

  /**
   * P4 §11 — sin señal, la muestra se guarda en la cola local en vez de
   * perderse. Mismo patrón que `FieldEventForm` en `FieldSessionForms.tsx`:
   * se decide por `navigator.onLine`, no intentando la petición primero, y el
   * `try` no es decorativo — tras `preventDefault()` la Server Action ya está
   * cancelada, así que un fallo al encolar dejaría la anotación en ninguna
   * parte y ésa es la única copia que existe.
   *
   * **Y ese mismo `preventDefault()` es lo que deja el botón sin protección:**
   * la Server Action no corre, así que el `pending` de `useActionState` no se
   * pone a `true` nunca y `disabled={pending}` no apaga nada. Dos toques serían
   * dos borradores con UUID distintos, o sea dos muestras. Aquí el
   * `@@unique([locationId, sampleCode])` las cazaría a posteriori —y desde este
   * mismo trabajo, con un `rejected` legible en vez de un 500—, pero eso es la
   * red, no la protección.
   */
  const alEnviar = async (e: React.FormEvent<HTMLFormElement>) => {
    if (typeof navigator !== "undefined" && navigator.onLine) return; // camino normal
    e.preventDefault();
    if (yaEncolando.current) return;
    yaEncolando.current = true;
    setEncolando(true);
    const form = e.currentTarget;
    try {
      await queueFieldEvent({ ...construirPayloadDeMuestraDeSuelo(new FormData(form), locationId) });
      form.reset();
      setEncolado(true);
      setErrorLocal(false);
    } catch {
      setEncolado(false);
      setErrorLocal(true);
    } finally {
      // Se suelta pase lo que pase: si encolar falló, el operador tiene que
      // poder volver a intentarlo — ésa es la única copia que existe.
      yaEncolando.current = false;
      setEncolando(false);
    }
  };

  return (
    <form action={formAction} onSubmit={alEnviar} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      {volverA ? <input type="hidden" name="volverA" value={volverA} /> : null}

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
        <CampoNumerico id="depthTopCm" name="depthTopCm" step="1" min="0" placeholder={t("sampleDepthTopPlaceholder")} aria-label={t("sampleDepthTopPlaceholder")} />
        <CampoNumerico id="depthBottomCm" name="depthBottomCm" step="1" min="0" placeholder={t("sampleDepthBottomPlaceholder")} aria-label={t("sampleDepthBottomPlaceholder")} />
        <p className="nn-muted">{t("sampleDepthHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="subSampleCount">{t("sampleSubSamplesLabel")}</label>
        <CampoNumerico id="subSampleCount" name="subSampleCount" step="1" min="1" placeholder={t("notRecorded")} />
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
      {encolado ? (
        <p className="nn-note" role="status">
          {t("fieldEventQueuedOffline")}
        </p>
      ) : null}
      {errorLocal ? (
        <p className="nn-error" role="alert">
          {t("fieldEventQueueFailed")}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending || encolando}>
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
export function FoliarSampleForm({
  locationId,
  volverA,
}: {
  locationId: string;
  /** Fix round 1 (Tarea 6): sólo lo pasa `/plots/[id]/muestras/nueva` —
   * con esto, guardar vuelve a la pestaña Muestras. */
  volverA?: string;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(createFoliarSampleAction, initialState);
  const [encolado, setEncolado] = useState(false);
  const [errorLocal, setErrorLocal] = useState(false);
  const [encolando, setEncolando] = useState(false);
  const yaEncolando = useRef(false);

  /** Mismo patrón que `SoilSampleForm` arriba, pestillo incluido. */
  const alEnviar = async (e: React.FormEvent<HTMLFormElement>) => {
    if (typeof navigator !== "undefined" && navigator.onLine) return; // camino normal
    e.preventDefault();
    if (yaEncolando.current) return;
    yaEncolando.current = true;
    setEncolando(true);
    const form = e.currentTarget;
    try {
      await queueFieldEvent({ ...construirPayloadDeMuestraFoliar(new FormData(form), locationId) });
      form.reset();
      setEncolado(true);
      setErrorLocal(false);
    } catch {
      setEncolado(false);
      setErrorLocal(true);
    } finally {
      yaEncolando.current = false;
      setEncolando(false);
    }
  };

  return (
    <form action={formAction} onSubmit={alEnviar} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      {volverA ? <input type="hidden" name="volverA" value={volverA} /> : null}

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
        <CampoNumerico id="leafPairPosition" name="leafPairPosition" step="1" min="1" placeholder={t("notRecorded")} />
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
        <CampoNumerico id="treeAgeYears" name="treeAgeYears" step="1" min="0" placeholder={t("notRecorded")} />
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
      {encolado ? (
        <p className="nn-note" role="status">
          {t("fieldEventQueuedOffline")}
        </p>
      ) : null}
      {errorLocal ? (
        <p className="nn-error" role="alert">
          {t("fieldEventQueueFailed")}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending || encolando}>
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
