"use client";

import { useActionState, useId } from "react";
import { useTranslations } from "next-intl";
import { cerrarFloracionFormAction } from "../../actions/floracion";
import type { TraceabilityActionState } from "../../actions/traceability";

const inicial: TraceabilityActionState = {};

/**
 * «Terminó» — cierra una floración abierta desde la portada de la parcela (F1). Pide el día en que
 * cayeron las flores, que no puede ser antes del inicio (el servicio lo rechaza igual).
 *
 * `portadaId` es la parcela desde la que se pulsa: si la floración es de una microparcela, se vuelve
 * a la portada de la madre, que es donde estaba quien la cerró.
 */
export function CerrarFloracionForm({
  plotBloomId,
  portadaId,
  inicio,
  hoy,
}: {
  plotBloomId: string;
  portadaId: string;
  /** El día de inicio, `AAAA-MM-DD`: el fin no puede ser anterior. */
  inicio: string;
  hoy: string;
}) {
  const t = useTranslations("Traceability");
  const id = useId();
  const [state, formAction, pending] = useActionState(cerrarFloracionFormAction, inicial);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="plotBloomId" value={plotBloomId} />
      <input type="hidden" name="portadaId" value={portadaId} />
      <div className="nn-field">
        <label htmlFor={`${id}-fin`}>{t("floracionTerminoFecha")}</label>
        <input id={`${id}-fin`} type="date" name="endsAt" required defaultValue={hoy} min={inicio} />
      </div>
      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("floracionTermino")}
      </button>
    </form>
  );
}
