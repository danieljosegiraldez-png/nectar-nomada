"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { anotarMermaAction, anularMermaAction, type RecepcionActionState } from "../../actions/recepcionDeCereza";
import { TimezoneOffsetField } from "../TimezoneOffsetField";
import { CampoNumerico } from "../CampoNumerico";
import { ahoraEnElCampo } from "../traceability/AnotarEntregaForm";

const inicial: RecepcionActionState = {};

/**
 * Anotar merma sobre una recepción: cereza que entró y no va a llegar a ningún lote. El motivo es
 * obligatorio porque una merma sin motivo es indistinguible de un error de báscula una semana
 * después.
 */
export function MermaForm({ recepcionId, disponibleKg }: { recepcionId: string; disponibleKg: number }) {
  const t = useTranslations("Recepcion");
  const [state, formAction, pending] = useActionState(anotarMermaAction, inicial);
  const id = (c: string) => `merma-${c}-${recepcionId}`;
  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="recepcionId" value={recepcionId} />
      <TimezoneOffsetField />
      <div className="nn-field">
        <label htmlFor={id("kg")}>{t("mermaKg")}</label>
        <CampoNumerico id={id("kg")} name="kg" required min={0} max={disponibleKg} step={0.001} />
      </div>
      <div className="nn-field">
        <label htmlFor={id("motivo")}>{t("mermaMotivo")}</label>
        <input id={id("motivo")} name="motivo" type="text" required maxLength={500} />
      </div>
      <div className="nn-field">
        <label htmlFor={id("cuando")}>{t("mermaCuando")}</label>
        <input id={id("cuando")} name="anotadaAt" type="datetime-local" required ref={ahoraEnElCampo} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {state.ok ? <p role="status">{t("mermaAnotada")}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("mermaBoton")}</button>
    </form>
  );
}

/** Anular una merma mal anotada: el kilo vuelve al disponible. */
export function AnularMermaForm({ mermaId }: { mermaId: string }) {
  const t = useTranslations("Recepcion");
  const [state, formAction, pending] = useActionState(anularMermaAction, inicial);
  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="mermaId" value={mermaId} />
      <div className="nn-field">
        <label htmlFor={`anular-merma-${mermaId}`}>{t("motivoAnulacion")}</label>
        <input id={`anular-merma-${mermaId}`} name="motivo" type="text" required maxLength={500} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("anularBoton")}</button>
    </form>
  );
}
