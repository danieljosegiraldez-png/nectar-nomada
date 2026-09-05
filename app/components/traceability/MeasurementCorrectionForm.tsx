"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { correctMeasurementFormAction, type TraceabilityActionState } from "../../actions/traceability";
import { TimezoneOffsetField } from "../TimezoneOffsetField";
import { paraCampoLocal } from "../../../lib/time/localDateTime";

const initialState: TraceabilityActionState = {};

/**
 * Mismo subconjunto que `MeasurementForm`: los diez valores completos incluyen
 * hipótesis y conclusión, que no son cómo se conoce una lectura de campo.
 */
const PROVENANCE_CLASSES = ["measured_fact", "direct_observation", "interpretation", "scientific_evidence"] as const;

export interface MeasurementToCorrect {
  id: string;
  variable: string;
  value: string;
  unit: string;
  /** ISO, para precargar el `datetime-local` sin inventar una hora nueva. */
  occurredAt: string;
  provenanceClass: string;
}

/**
 * Corregir una lectura.
 *
 * **No la edita: la supersede.** Se crea una medición nueva que apunta a la
 * original con `correctsId`, y la original se queda en el registro marcada como
 * reemplazada. Un valor observado sigue habiendo sido observado aunque se
 * apuntara mal, y borrarlo perdería que alguien leyó eso ese día — que es
 * justamente lo que hace falta para entender por qué se decidió lo que se
 * decidió.
 *
 * El motivo es obligatorio: sin él, «apunté 24 y era 42» y «el sensor estaba
 * descalibrado» dejan la misma corrección en la tabla y son cosas distintas.
 *
 * La fecha se precarga con la de la lectura original, no con «ahora». Corregir
 * a las seis de la tarde una lectura de las nueve de la mañana no la mueve a la
 * tarde, y un valor por defecto de «ahora» invitaría a dejarlo mal.
 */
export function MeasurementCorrectionForm({
  lotId,
  measurement,
}: {
  lotId: string;
  measurement: MeasurementToCorrect;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(correctMeasurementFormAction, initialState);
  const id = (campo: string) => `${campo}-${measurement.id}`;

  /**
   * El reloj de pared se escribe en el DOM al montar, no se renderiza en el
   * servidor: mismo motivo que `TimezoneOffsetField`. El valor depende de la
   * zona del DISPOSITIVO, y en el servidor sería la suya —0 en producción—.
   *
   * Antes esto era `defaultValue={measurement.occurredAt.slice(0, 16)}`, el
   * reloj de pared en UTC. Como el campo se re-interpreta con el desfase del
   * dispositivo, guardar sin tocar la hora adelantaba la medición cinco horas.
   * Ver `paraCampoLocal` para la ida y vuelta medida.
   */
  const refCuando = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (refCuando.current) refCuando.current.value = paraCampoLocal(new Date(measurement.occurredAt));
  }, [measurement.occurredAt]);

  return (
    <form action={formAction} className="nn-form">
      <TimezoneOffsetField />
      <input type="hidden" name="lotId" value={lotId} />
      <input type="hidden" name="measurementId" value={measurement.id} />
      {/* La variable no se corrige: cambiarla no sería la misma lectura, sería
          otra. Si la variable estaba mal, la lectura sobra y se registra la
          buena aparte. */}
      <p className="nn-muted">
        {t("correctionIntro", {
          variable: measurement.variable,
          value: measurement.value,
          unit: measurement.unit,
        })}
      </p>

      <div className="nn-field">
        <label htmlFor={id("value")}>{t("correctionValueLabel")}</label>
        <input
          id={id("value")}
          type="number"
          name="value"
          step="any"
          required
          inputMode="decimal"
          defaultValue={measurement.value}
        />
      </div>

      <div className="nn-field">
        <label htmlFor={id("unit")}>{t("unitLabel")}</label>
        {/* La unidad se preselecciona con la de la lectura original y se puede
            cambiar: el servicio normaliza a la canónica de esa variable, así
            que corregir de °F a °C es legítimo. */}
        <input id={id("unit")} type="text" name="unit" required defaultValue={measurement.unit} />
      </div>

      <div className="nn-field">
        <label htmlFor={id("occurredAt")}>{t("correctionOccurredAtLabel")}</label>
        <input
          id={id("occurredAt")}
          type="datetime-local"
          name="occurredAt"
          required
          ref={refCuando}
          defaultValue=""
        />
      </div>

      <div className="nn-field">
        <label htmlFor={id("provenanceClass")}>{t("provenanceClassLabel")}</label>
        <select id={id("provenanceClass")} name="provenanceClass" defaultValue={measurement.provenanceClass}>
          {PROVENANCE_CLASSES.map((p) => (
            <option key={p} value={p}>
              {t(`provenanceClass_${p}` as "provenanceClass_measured_fact")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={id("reason")}>{t("correctionReasonLabel")}</label>
        <input
          id={id("reason")}
          type="text"
          name="reason"
          required
          placeholder={t("correctionReasonPlaceholder")}
        />
      </div>

      <div className="nn-field">
        <label htmlFor={id("notes")}>{t("notesLabel")}</label>
        <textarea id={id("notes")} name="notes" rows={2} />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("correctionSubmitButton")}
      </button>
    </form>
  );
}
