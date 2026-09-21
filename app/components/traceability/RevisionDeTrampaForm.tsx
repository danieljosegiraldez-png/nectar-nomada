"use client";

import { OpcionesDePersona } from "../OpcionesDePersona";
import { CampoNumerico } from "../CampoNumerico";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordTrapCheckFormAction, type TraceabilityActionState } from "../../actions/traceability";
import { PROCEDENCIA_DE_REGISTRO_DE_CAMPO } from "../../../lib/traceability/procedencia";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";
import { TriStateField } from "./TriStateField";
import type { PersonOption } from "./FieldSessionForms";

// Misma lista local que `MarcarEnProduccionForm.tsx`.
const DATA_QUALITIES = ["verified", "provisional", "unconfirmed", "not_tested"] as const;
const NIVELES = ["ninguno", "pocos", "algunos", "muchos"] as const;

const initialState: TraceabilityActionState = {};

/**
 * Una visita a una trampa — F2 §4: lectura, otros insectos y mantenimiento en
 * un solo registro.
 *
 * **La escala es obligatoria y no trae valor por defecto**: una lectura
 * preseleccionada se guardaría aunque nadie mirara la tela. El número exacto es
 * opcional y vacío significa «no se contó», nunca 0 (ADR-080).
 *
 * «Otros insectos» y el mantenimiento (F1 fix-final, ADR-080) son los tres un
 * sí/no/sin registrar y no una casilla: una casilla sin marcar guardaría
 * «no se hizo», que es una afirmación distinta de «nadie lo preguntó» (ver
 * `TriStateField`).
 *
 * `people`/`selfPersonId` (F3 fix-final, spec §4.6) son las mismas props que
 * ya reciben `FieldSessionStartForm` y `LandPhotoUploadForm` en esta misma
 * pantalla (`app/plots/[id]/page.tsx`), de `getObserverCandidates`.
 */
export function RevisionDeTrampaForm({
  locationId,
  specimenId,
  people,
  selfPersonId,
}: {
  locationId: string;
  specimenId: string;
  people: ReadonlyArray<PersonOption>;
  selfPersonId: string | null;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(recordTrapCheckFormAction, initialState);
  const id = (campo: string) => `${campo}-${specimenId}`;
  // Igual que `photographedByLabel` en `LandPhotoUploadForm`: opcional, y el
  // valor inicial se normaliza contra la lista en vez de suponerlo.
  const propioEsElegible = people.some((p) => p.id === selfPersonId);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      <input type="hidden" name="specimenId" value={specimenId} />

      <div className="nn-field">
        <label htmlFor={id("observedAt")}>{t("trapCheckDate")}</label>
        <input id={id("observedAt")} type="date" name="observedAt" required />
      </div>

      <div className="nn-field">
        <label htmlFor={id("brocaLevel")}>{t("trapCheckLevel")}</label>
        <select id={id("brocaLevel")} name="brocaLevel" required defaultValue="">
          <option value="">{t("trapCheckLevelChoose")}</option>
          {NIVELES.map((n) => (
            <option key={n} value={n}>
              {t(`trapsLevel_${n}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={id("captureCount")}>{t("trapCheckCount")}</label>
        <CampoNumerico
          id={id("captureCount")}
          name="captureCount"
          min="0"
          step="1"
          inputMode="numeric"
          placeholder={t("notRecorded")}
        />
      </div>

      <TriStateField id={id("otherInsects")} name="otherInsects" label={t("trapCheckOthers")} />
      <div className="nn-field">
        <label htmlFor={id("otherInsectsNote")}>{t("trapCheckOthersNote")}</label>
        <input id={id("otherInsectsNote")} type="text" name="otherInsectsNote" placeholder={t("notRecorded")} />
      </div>

      <TriStateField id={id("cleaned")} name="cleaned" label={t("trapCheckCleaned")} />
      <TriStateField id={id("liquidChanged")} name="liquidChanged" label={t("trapCheckLiquid")} />
      <TriStateField id={id("lureRecharged")} name="lureRecharged" label={t("trapCheckLure")} />

      <div className="nn-field">
        <label htmlFor={id("observerPersonId")}>{t("trapCheckObserverLabel")}</label>
        <select
          id={id("observerPersonId")}
          name="observerPersonId"
          defaultValue={propioEsElegible ? (selfPersonId as string) : ""}
        >
          <option value="">{t("notRecorded")}</option>
          <OpcionesDePersona personas={people} selfPersonId={selfPersonId} />
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={id("notes")}>{t("notesLabel")}</label>
        <input id={id("notes")} type="text" name="notes" placeholder={t("notRecorded")} />
      </div>

      <div className="nn-field">
        <label htmlFor={id("provenance")}>{t("provenanceClassLabel")}</label>
        <select id={id("provenance")} name="provenanceClass" required defaultValue="">
          <option value="">{t("provenanceClassChoose")}</option>
          {PROCEDENCIA_DE_REGISTRO_DE_CAMPO.map((v) => (
            <option key={v} value={v}>
              {t(`provenanceClass_${v}` as "provenanceClass_original_record")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={id("dataQuality")}>{t("dataQualityLabel")}</label>
        <select id={id("dataQuality")} name="dataQuality" defaultValue="">
          <option value="">{t("notRecorded")}</option>
          {DATA_QUALITIES.map((v) => (
            <option key={v} value={v}>
              {t(`dataQuality_${v}` as "dataQuality_verified")}
            </option>
          ))}
        </select>
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <BotonQueNecesitaConexion pending={pending}>{t("trapCheckSave")}</BotonQueNecesitaConexion>
    </form>
  );
}
