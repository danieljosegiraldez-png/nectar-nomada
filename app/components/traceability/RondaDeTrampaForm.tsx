"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordRoundTrapCheckFormAction, type TraceabilityActionState } from "../../actions/traceability";
import { TriStateField } from "./TriStateField";

const NIVELES = ["ninguno", "pocos", "algunos", "muchos"] as const;
const initialState: TraceabilityActionState = {};

/**
 * El formulario corto de la ronda — spec §4.2: seis campos, no diez.
 *
 * **Sin campo de procedencia ni de observador, ni siquiera oculto.** Ruling
 * del controlador, Tarea 10: un `<input type="hidden">` es falsificable
 * (SECURITY.md §2 — el formulario no es la frontera), así que
 * `recordRoundTrapCheckFormAction` fija los dos en el SERVIDOR —observación
 * directa, la persona vinculada a la cuenta de la sesión— y ni siquiera lee
 * esos nombres del `FormData`. `RevisionDeTrampaForm` —con procedencia,
 * calidad del dato y observador elegibles— vive en
 * `/plots/[id]/ajustes` (sección «trampas», Tarea 10 fix round 1), para
 * transcribir una revisión de notas de papel de un tercero; no en este
 * formulario, donde quien registra es siempre quien tiene la sesión
 * iniciada.
 *
 * `hoy` (`YYYY-MM-DD`) lo calcula el servidor con la zona de LA FINCA
 * (`diaDeHoy`, en `app/finca/trampas/ronda/page.tsx`): un `hoyLocalISO()` en
 * el cliente daría el día del dispositivo, que puede no ser el de la finca,
 * y desajustaría la hidratación. El campo sigue siendo un `type="date"`
 * editable — sólo cambia de dónde sale el valor por defecto.
 */
export function RondaDeTrampaForm({
  locationId,
  specimenId,
  hoy,
}: {
  locationId: string;
  specimenId: string;
  hoy: string;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(recordRoundTrapCheckFormAction, initialState);
  const id = (campo: string) => `ronda-${campo}-${specimenId}`;

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      <input type="hidden" name="specimenId" value={specimenId} />

      <div className="nn-field">
        <label htmlFor={id("observedAt")}>{t("trapCheckDate")}</label>
        <input id={id("observedAt")} type="date" name="observedAt" required defaultValue={hoy} />
      </div>

      <div className="nn-field">
        <label htmlFor={id("brocaLevel")}>{t("trapCheckLevel")}</label>
        <select id={id("brocaLevel")} name="brocaLevel" required defaultValue="">
          <option value="">{t("trapCheckLevelChoose")}</option>
          {NIVELES.map((n) => (
            <option key={n} value={n}>{t(`trapsLevel_${n}`)}</option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={id("captureCount")}>{t("trapCheckCount")}</label>
        <input
          id={id("captureCount")}
          type="number"
          name="captureCount"
          min="0"
          step="1"
          inputMode="numeric"
          placeholder={t("notRecorded")}
          // La rueda del ratón sobre un campo numérico con foco lo cambia: desde
          // vacío, un paso abajo deja 0, y «no se contó» pasa a «cero brocas»
          // sin que nadie lo vea (mismo guardia que `RevisionDeTrampaForm`,
          // en `/plots/[id]/ajustes`).
          onWheel={(e) => e.currentTarget.blur()}
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

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("trapCheckSave")}</button>
    </form>
  );
}
