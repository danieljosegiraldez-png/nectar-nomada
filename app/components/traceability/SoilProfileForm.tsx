"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  createSoilProfileAction,
  updateSoilProfileAction,
  type TraceabilityActionState,
} from "../../actions/traceability";
import { PROCEDENCIA_DE_REGISTRO_DE_CAMPO } from "../../../lib/traceability/procedencia";

const initialState: TraceabilityActionState = {};

// §6.1 — tres estados, no una casilla. «No se miró» y «se miró y no había» son
// hechos distintos, y el desplegable los mantiene distintos en la pantalla
// igual que el enum los mantiene distintos en la base.
const OBSERVACIONES = ["present", "absent", "not_observed"] as const;
const DATA_QUALITIES = ["verified", "provisional", "unconfirmed", "not_tested"] as const;

// Cuatro horizontes es lo que un perfil de 80–100 cm suele mostrar. Las filas
// vacías se descartan en la acción, así que sobrar no cuesta nada y quedarse
// corto obliga a describir peor.
const FILAS_DE_HORIZONTE = 4;

export interface SoilFeatureValues {
  id?: string;
  describedAt: string | null;
  pitDepthCm: number | null;
  rootingDepthCm: number | null;
  rootDistribution: string | null;
  mottling: string | null;
  greyColours: string | null;
  rootChannelConcretions: string | null;
  sourSmell: string | null;
  impedingLayerDepthCm: number | null;
  impedingLayerNote: string | null;
  provenanceClass: string;
  dataQuality: string | null;
  notes: string | null;
}

/**
 * La calicata: describir un perfil, o corregir la descripción.
 *
 * **Los horizontes sólo se piden al describir.** Al corregir no aparecen, y es
 * deliberado: reemplazarlos desde un formulario borraría en silencio una
 * descripción que costó cavar un hoyo. Corregir un horizonte es otra operación.
 *
 * Volver a describir el mismo bloque dentro de tres años **no es corregir**: es
 * una calicata nueva, y por eso el formulario de describir sigue disponible en
 * la página aunque ya haya perfiles.
 */
export function SoilProfileForm({
  locationId,
  values,
}: {
  locationId: string;
  values: SoilFeatureValues;
}) {
  const t = useTranslations("Traceability");
  const corrigiendo = values.id != null;
  const [state, formAction, pending] = useActionState(
    corrigiendo ? updateSoilProfileAction : createSoilProfileAction,
    initialState,
  );

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      {corrigiendo ? <input type="hidden" name="soilProfileId" value={values.id} /> : null}

      <div className="nn-field">
        <label htmlFor={`describedAt-${values.id ?? "nuevo"}`}>{t("soilDescribedAtLabel")}</label>
        <input
          id={`describedAt-${values.id ?? "nuevo"}`}
          type="date"
          name="describedAt"
          required
          defaultValue={values.describedAt ?? ""}
        />
      </div>

      <div className="nn-field">
        <label htmlFor={`pitDepthCm-${values.id ?? "nuevo"}`}>{t("soilPitDepthLabel")}</label>
        <input
          id={`pitDepthCm-${values.id ?? "nuevo"}`}
          type="number"
          name="pitDepthCm"
          step="1"
          min="0"
          inputMode="numeric"
          defaultValue={values.pitDepthCm ?? ""}
          placeholder={t("notRecorded")}
        />
        <p className="nn-muted">{t("soilPitDepthHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor={`rootingDepthCm-${values.id ?? "nuevo"}`}>{t("soilRootingDepthLabel")}</label>
        <input
          id={`rootingDepthCm-${values.id ?? "nuevo"}`}
          type="number"
          name="rootingDepthCm"
          step="1"
          min="0"
          inputMode="numeric"
          defaultValue={values.rootingDepthCm ?? ""}
          placeholder={t("notRecorded")}
        />
        <p className="nn-muted">{t("soilRootingDepthHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor={`rootDistribution-${values.id ?? "nuevo"}`}>{t("soilRootDistributionLabel")}</label>
        <input
          id={`rootDistribution-${values.id ?? "nuevo"}`}
          type="text"
          name="rootDistribution"
          defaultValue={values.rootDistribution ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      <h3>{t("soilAnaerobicHeading")}</h3>
      <p className="nn-muted">{t("soilAnaerobicIntro")}</p>

      {(
        [
          ["mottling", values.mottling],
          ["greyColours", values.greyColours],
          ["rootChannelConcretions", values.rootChannelConcretions],
          ["sourSmell", values.sourSmell],
        ] as const
      ).map(([campo, valor]) => (
        <div className="nn-field" key={campo}>
          <label htmlFor={`${campo}-${values.id ?? "nuevo"}`}>
            {t(`soilFeature_${campo}` as "soilFeature_mottling")}
          </label>
          <select id={`${campo}-${values.id ?? "nuevo"}`} name={campo} defaultValue={valor ?? ""}>
            <option value="">{t("notRecorded")}</option>
            {OBSERVACIONES.map((o) => (
              <option key={o} value={o}>
                {t(`soilObservation_${o}` as "soilObservation_present")}
              </option>
            ))}
          </select>
        </div>
      ))}

      <div className="nn-field">
        <label htmlFor={`impedingLayerDepthCm-${values.id ?? "nuevo"}`}>{t("soilImpedingDepthLabel")}</label>
        <input
          id={`impedingLayerDepthCm-${values.id ?? "nuevo"}`}
          type="number"
          name="impedingLayerDepthCm"
          step="1"
          min="0"
          inputMode="numeric"
          defaultValue={values.impedingLayerDepthCm ?? ""}
          placeholder={t("notRecorded")}
        />
        <p className="nn-muted">{t("soilImpedingDepthHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor={`impedingLayerNote-${values.id ?? "nuevo"}`}>{t("soilImpedingNoteLabel")}</label>
        <input
          id={`impedingLayerNote-${values.id ?? "nuevo"}`}
          type="text"
          name="impedingLayerNote"
          defaultValue={values.impedingLayerNote ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      {corrigiendo ? null : (
        <>
          <h3>{t("soilHorizonsHeading")}</h3>
          <p className="nn-muted">{t("soilHorizonsIntro")}</p>
          {Array.from({ length: FILAS_DE_HORIZONTE }, (_, i) => (
            <fieldset key={i} className="nn-field">
              <legend>{t("soilHorizonNumber", { n: i + 1 })}</legend>
              {/* El campo que hace que la fila exista para `maxIndiceDeFilas`.
                  El ordinal real lo asigna la acción por posición entre las
                  filas NO vacías, así que dejar la segunda en blanco y llenar
                  la tercera no deja un hueco en la secuencia. */}
              <input type="hidden" name={`horizonOrdinal.${i}`} value={i + 1} />
              <input type="number" name={`horizonTopCm.${i}`} step="1" min="0" placeholder={t("soilHorizonTopPlaceholder")} />
              <input type="number" name={`horizonBottomCm.${i}`} step="1" min="0" placeholder={t("soilHorizonBottomPlaceholder")} />
              <input type="text" name={`horizonDesignation.${i}`} placeholder={t("soilHorizonDesignationPlaceholder")} />
              <input type="text" name={`horizonColour.${i}`} placeholder={t("soilHorizonColourPlaceholder")} />
              <input type="text" name={`horizonStructure.${i}`} placeholder={t("soilHorizonStructurePlaceholder")} />
              <input type="text" name={`horizonTexture.${i}`} placeholder={t("soilHorizonTexturePlaceholder")} />
            </fieldset>
          ))}
        </>
      )}

      <div className="nn-field">
        <label htmlFor={`provenanceClass-${values.id ?? "nuevo"}`}>{t("provenanceClassLabel")}</label>
        <select
          id={`provenanceClass-${values.id ?? "nuevo"}`}
          name="provenanceClass"
          required
          defaultValue={values.provenanceClass}
        >
          <option value="">{t("provenanceClassChoose")}</option>
          {PROCEDENCIA_DE_REGISTRO_DE_CAMPO.map((v) => (
            <option key={v} value={v}>
              {t(`provenanceClass_${v}` as "provenanceClass_direct_observation")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`dataQuality-${values.id ?? "nuevo"}`}>{t("dataQualityLabel")}</label>
        <select id={`dataQuality-${values.id ?? "nuevo"}`} name="dataQuality" defaultValue={values.dataQuality ?? ""}>
          <option value="">{t("notRecorded")}</option>
          {DATA_QUALITIES.map((v) => (
            <option key={v} value={v}>
              {t(`dataQuality_${v}` as "dataQuality_verified")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`soilNotes-${values.id ?? "nuevo"}`}>{t("notesLabel")}</label>
        <textarea
          id={`soilNotes-${values.id ?? "nuevo"}`}
          name="notes"
          rows={3}
          defaultValue={values.notes ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {corrigiendo ? t("soilSaveButton") : t("soilDescribeButton")}
      </button>
    </form>
  );
}
