"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { crearParcelaAction, type FincasActionState } from "../../actions/fincas";

const inicial: FincasActionState = {};

/**
 * Una parcela nueva en la finca elegida (spec fincas y parcelas §3.3): nombre y, si se sabe, el
 * área. Sol, sombra, altitud y suelo se completan después en la ficha de la parcela.
 */
export function NuevaParcelaForm({ siteId }: { siteId: string }) {
  const t = useTranslations("Fincas");
  const [state, formAction, pending] = useActionState(crearParcelaAction, inicial);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="siteId" value={siteId} />
      <div className="nn-field">
        <label htmlFor="parcela-nombre">{t("nombreParcela")}</label>
        <input id="parcela-nombre" name="nombre" type="text" required maxLength={120} />
      </div>
      <div className="nn-field">
        <label htmlFor="parcela-area">{t("areaHectareas")}</label>
        <input id="parcela-area" name="areaHectareas" type="text" inputMode="decimal" />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {state.ok ? <p role="status">{t("parcelaCreada")}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("crearParcelaBoton")}</button>
    </form>
  );
}
