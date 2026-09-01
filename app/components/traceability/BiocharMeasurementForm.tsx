"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { recordBiocharMeasurementAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

const PROVENANCES = ["measured_fact", "original_record"] as const;

export interface VariableChoice {
  variable: string;
  canonicalUnit: string;
  min: number;
  max: number;
}

/**
 * Una lectura de la Tabla 7 sobre un lote de biochar.
 *
 * La lista de variables **no está escrita aquí**: viene del registro canónico
 * de `lib/traceability/units.ts`, filtrado al dominio de análisis de enmienda.
 * Copiarla habría creado una cuarta lista que tiene que decir lo mismo que las
 * otras tres, y ésa es justo la clase de duplicado que el guardia de valores
 * enumerados existe para atrapar.
 *
 * La unidad se rellena sola con la canónica de la variable elegida, y sigue
 * siendo editable: un informe puede venir en `%` donde el canónico es `mg/kg`,
 * y el servicio convierte. Lo que no se hace es **suponer** la unidad — un
 * número sin unidad no es una medición.
 */
export function BiocharMeasurementForm({
  biocharBatchId,
  variables,
}: {
  biocharBatchId: string;
  variables: VariableChoice[];
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(recordBiocharMeasurementAction, initialState);
  const [variable, setVariable] = useState("");

  const elegida = variables.find((v) => v.variable === variable);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="biocharBatchId" value={biocharBatchId} />

      <div className="nn-field">
        <label htmlFor="variable">{t("biocharVariableLabel")}</label>
        <select
          id="variable"
          name="variable"
          required
          value={variable}
          onChange={(e) => setVariable(e.target.value)}
        >
          <option value="">{t("biocharVariableChoose")}</option>
          {variables.map((v) => (
            <option key={v.variable} value={v.variable}>
              {t(`variable_${v.variable}` as "variable_ph")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="value">{t("biocharValueLabel")}</label>
        <input
          id="value"
          type="number"
          name="value"
          step="any"
          required
          inputMode="decimal"
          // Los límites del registro viajan a la casilla, así que un pH 15 se
          // ve mal antes de enviarse. El servicio lo rechaza igual: esto es
          // comodidad, no la frontera.
          min={elegida?.min}
          max={elegida?.max}
        />
      </div>

      <div className="nn-field">
        <label htmlFor="unit">{t("biocharUnitLabel")}</label>
        {/* `key` fuerza a React a recrear la casilla al cambiar de variable,
            que es lo que hace que `defaultValue` vuelva a aplicarse. Sin eso,
            la unidad de la variable anterior se quedaría puesta y se enviaría
            una lectura con la unidad de otra cosa. */}
        <input
          key={variable}
          id="unit"
          type="text"
          name="unit"
          required
          defaultValue={elegida?.canonicalUnit ?? ""}
        />
        <p className="nn-muted">{t("biocharUnitHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="occurredAt">{t("biocharMeasuredOnLabel")}</label>
        <input id="occurredAt" type="date" name="occurredAt" />
      </div>

      <div className="nn-field">
        <label htmlFor="provenanceClass">{t("provenanceClassLabel")}</label>
        <select id="provenanceClass" name="provenanceClass" required defaultValue="">
          <option value="">{t("provenanceClassChoose")}</option>
          {PROVENANCES.map((v) => (
            <option key={v} value={v}>
              {t(`provenanceClass_${v}` as "provenanceClass_measured_fact")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="sourceReference">{t("biocharSourceRefLabel")}</label>
        <input id="sourceReference" type="text" name="sourceReference" placeholder={t("notRecorded")} />
        <p className="nn-muted">{t("biocharSourceRefHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor="measurementNotes">{t("notesLabel")}</label>
        <input id="measurementNotes" type="text" name="notes" placeholder={t("notRecorded")} />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("biocharRecordMeasurementButton")}
      </button>
    </form>
  );
}
