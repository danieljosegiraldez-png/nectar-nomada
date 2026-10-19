"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { registrarValoracionDeInspeccionAction } from "../../actions/apiary";

/**
 * **La valoración del técnico sobre una colonia**, una por inspección, en la visita ya cerrada. Es
 * el único campo de cierre de la inspección (Anexo E; ADR-154), y se escribe aparte de la nota de
 * campo, que es la que se tomó con el guante puesto.
 *
 * **El campo es controlado, a propósito.** React 19 devuelve a su valor inicial los campos NO
 * controlados de un formulario al terminar la acción (`CLAUDE.md`, «un formulario rechazado se
 * vacía»). Aquí eso tiraría un párrafo escrito si el servidor lo rechaza. Con el texto en el estado
 * del componente, un rechazo deja lo escrito donde estaba.
 */
export function ValoracionDeInspeccionForm({
  fieldSessionId,
  inspectionId,
  guardada,
  caja,
}: {
  fieldSessionId: string;
  inspectionId: string;
  guardada: string | null;
  /** El identificador de la caja, para el rótulo: con varias colmenas hay varios campos. */
  caja: string;
}) {
  const t = useTranslations("Apiary");
  const [state, formAction, pending] = useActionState(registrarValoracionDeInspeccionAction, {});
  const [texto, setTexto] = useState(guardada ?? "");
  const id = `valoracion-${inspectionId}`;

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="fieldSessionId" value={fieldSessionId} />
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <div className="nn-field">
        <label htmlFor={id}>{t("valoracionLabel", { caja })}</label>
        <textarea id={id} name="assessment" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>
      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="nn-detail-meta">{t("valoracionGuardada")}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("valoracionGuardar")}
      </button>
    </form>
  );
}
