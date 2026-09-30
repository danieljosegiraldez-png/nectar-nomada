"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { declararDestinoDeFincaAction, type FincasActionState } from "../../actions/fincas";
import { BotonDeEnvio } from "../BotonDeEnvio";

const inicial: FincasActionState = {};

/**
 * Declarar —o quitar— el beneficio al que esta finca envía su cereza (ADR-194).
 *
 * **La opción de quitarlo es la primera y está nombrada**, no un hueco en blanco: una finca cuya
 * cereza se compra y se traslada no envía a ningún beneficio propio, y eso es una respuesta, no un
 * dato que falte. Un `<option value="">` sin texto se lee como «todavía no he elegido».
 */
export function DestinoDeFincaForm({
  siteId,
  actual,
  beneficios,
}: {
  siteId: string;
  actual: string;
  beneficios: { id: string; name: string }[];
}) {
  const t = useTranslations("Fincas");
  const [state, formAction, pending] = useActionState(declararDestinoDeFincaAction, inicial);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="siteId" value={siteId} />
      <div className="nn-field">
        <label htmlFor="finca-destino">{t("destinoEtiqueta")}</label>
        <select id="finca-destino" name="beneficioId" defaultValue={actual}>
          <option value="">{t("destinoQuitar")}</option>
          {beneficios.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
      {state.error ? <p className="nn-error">{state.error}</p> : null}
      {state.ok ? <p className="nn-muted">{t("destinoGuardado")}</p> : null}
      <BotonDeEnvio disabled={pending}>{t("destinoGuardar")}</BotonDeEnvio>
    </form>
  );
}
