"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { crearMicroparcelaAction, type FincasActionState } from "../../actions/fincas";
import { MOTIVOS_DE_SUBDIVISION } from "../../../lib/traceability/motivosDeSubdivision";

const inicial: FincasActionState = {};

/**
 * Una microparcela dentro de esta parcela (spec fincas y parcelas §3.3): un pedazo que se maneja
 * aparte por altitud, sombra, pendiente u otro motivo, que se nombra.
 */
export function NuevaMicroparcelaForm({ parentLocationId }: { parentLocationId: string }) {
  const t = useTranslations("Fincas");
  const [state, formAction, pending] = useActionState(crearMicroparcelaAction, inicial);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="parentLocationId" value={parentLocationId} />
      <div className="nn-field">
        <label htmlFor="micro-nombre">{t("nombreMicroparcela")}</label>
        <input id="micro-nombre" name="nombre" type="text" required maxLength={120} />
      </div>
      <div className="nn-field">
        <label htmlFor="micro-motivo">{t("motivo")}</label>
        <select id="micro-motivo" name="motivo" required defaultValue="">
          <option value="" disabled />
          {MOTIVOS_DE_SUBDIVISION.map((m) => (
            <option key={m} value={m}>
              {t(`motivo_${m}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="micro-nota">{t("motivoNota")}</label>
        <input id="micro-nota" name="nota" type="text" />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {state.ok ? <p role="status">{t("microparcelaCreada")}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("crearMicroparcelaBoton")}</button>
    </form>
  );
}
