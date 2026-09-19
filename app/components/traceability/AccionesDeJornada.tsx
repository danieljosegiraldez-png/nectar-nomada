"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { anularEntregaAction, cerrarJornadaAction, type JornadaActionState } from "../../actions/jornadasDeCosecha";

const inicial: JornadaActionState = {};

/** Anular una entrega enviada: no se edita, se anula con motivo (spec §3.4). */
export function AnularEntregaForm({ entregaId, jornadaId }: { entregaId: string; jornadaId: string }) {
  const t = useTranslations("Jornadas");
  const [state, formAction, pending] = useActionState(anularEntregaAction, inicial);
  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="entregaId" value={entregaId} />
      <input type="hidden" name="jornadaId" value={jornadaId} />
      <div className="nn-field">
        <label htmlFor={`anular-${entregaId}`}>{t("motivo")}</label>
        <input id={`anular-${entregaId}`} name="motivo" type="text" required maxLength={500} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("anularBoton")}</button>
    </form>
  );
}

/** Cerrar la jornada: ya no admite entregas nuevas. */
export function CerrarJornadaForm({ jornadaId }: { jornadaId: string }) {
  const t = useTranslations("Jornadas");
  const [state, formAction, pending] = useActionState(cerrarJornadaAction, inicial);
  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="jornadaId" value={jornadaId} />
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("cerrarBoton")}</button>
    </form>
  );
}
