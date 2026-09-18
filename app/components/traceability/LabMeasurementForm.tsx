"use client";

import { CampoNumerico } from "../CampoNumerico";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { recordLabMeasurementAction, type TraceabilityActionState } from "../../actions/traceability";
import { PROCEDENCIA_DE_ANALISIS } from "../../../lib/traceability/procedencia";

const initialState: TraceabilityActionState = {};


export interface VariableChoice {
  variable: string;
  canonicalUnit: string;
  min: number;
  max: number;
}

/**
 * Una lectura de laboratorio sobre un sujeto que no es café.
 *
 * Uno solo para los tres —lote de biochar, muestra de suelo, muestra foliar—
 * porque los tres hacen exactamente lo mismo: elegir un parámetro de su panel,
 * escribir un valor con unidad, y decir de dónde salió. Tres componentes casi
 * idénticos habrían divergido en el primer arreglo que sólo se aplicara a dos.
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
export type SujetoDeLaboratorio = "biocharBatchId" | "soilSampleId" | "foliarSampleId";

export function LabMeasurementForm({
  sujeto,
  sujetoId,
  variables,
  claveDeEnvio,
}: {
  // La genera el servidor al pintar la página, no el cliente: un `useState` con
  // `crypto.randomUUID()` daría un valor al renderizar en servidor y otro al
  // hidratar, que es un desajuste de hidratación.
  claveDeEnvio: string;
  sujeto: SujetoDeLaboratorio;
  sujetoId: string;
  variables: VariableChoice[];
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(recordLabMeasurementAction, initialState);
  const [variable, setVariable] = useState("");

  const elegida = variables.find((v) => v.variable === variable);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="claveDeEnvio" value={claveDeEnvio} />
      {/* El nombre del campo ES la clase de sujeto. La acción no adivina: lee
          exactamente el que llegó, y el servicio rechaza que llegue más de uno. */}
      <input type="hidden" name="sujeto" value={sujeto} />
      <input type="hidden" name="sujetoId" value={sujetoId} />

      <div className="nn-field">
        <label htmlFor={`variable-${sujetoId}`}>{t("biocharVariableLabel")}</label>
        <select
          id={`variable-${sujetoId}`}
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
        <label htmlFor={`value-${sujetoId}`}>{t("biocharValueLabel")}</label>
        <CampoNumerico
          id={`value-${sujetoId}`}
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
        <label htmlFor={`unit-${sujetoId}`}>{t("biocharUnitLabel")}</label>
        {/* `key` fuerza a React a recrear la casilla al cambiar de variable,
            que es lo que hace que `defaultValue` vuelva a aplicarse. Sin eso,
            la unidad de la variable anterior se quedaría puesta y se enviaría
            una lectura con la unidad de otra cosa. */}
        <input
          key={variable}
          id={`unit-${sujetoId}`}
          type="text"
          name="unit"
          required
          defaultValue={elegida?.canonicalUnit ?? ""}
        />
        <p className="nn-muted">{t("biocharUnitHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor={`occurredAt-${sujetoId}`}>{t("biocharMeasuredOnLabel")}</label>
        <input id={`occurredAt-${sujetoId}`} type="date" name="occurredAt" required />
      </div>

      <div className="nn-field">
        <label htmlFor={`provenanceClass-${sujetoId}`}>{t("provenanceClassLabel")}</label>
        <select id={`provenanceClass-${sujetoId}`} name="provenanceClass" required defaultValue="">
          <option value="">{t("provenanceClassChoose")}</option>
          {PROCEDENCIA_DE_ANALISIS.map((v) => (
            <option key={v} value={v}>
              {t(`provenanceClass_${v}` as "provenanceClass_measured_fact")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`sourceReference-${sujetoId}`}>{t("biocharSourceRefLabel")}</label>
        <input id={`sourceReference-${sujetoId}`} type="text" name="sourceReference" placeholder={t("notRecorded")} />
        <p className="nn-muted">{t("biocharSourceRefHelp")}</p>
      </div>

      <div className="nn-field">
        <label htmlFor={`measurementNotes-${sujetoId}`}>{t("notesLabel")}</label>
        <input id={`measurementNotes-${sujetoId}`} type="text" name="notes" placeholder={t("notRecorded")} />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("biocharRecordMeasurementButton")}
      </button>
    </form>
  );
}
