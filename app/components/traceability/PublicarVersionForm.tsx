"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { publicarVersionAction, type TraceabilityActionState } from "../../actions/traceability";
import { BotonDeEnvio } from "../BotonDeEnvio";

const initialState: TraceabilityActionState = {};

/**
 * Publicar el borrador — diseño §3.3. Parte 2a, tarea 14 (2026-10-03). Lo que se dice antes del botón es lo que cambia al pulsarlo: la versión se
 * fija, ya no se edita, y es la que se podrá elegir al abrir un proceso. Cambiarla después es otra versión.
 */
export function PublicarVersionForm({ recipeId, recipeVersionId }: { recipeId: string; recipeVersionId: string }) {
  const t = useTranslations("Traceability");
  const [state, formAction] = useActionState(publicarVersionAction, initialState);

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 560 }}>
      <input type="hidden" name="recipeId" value={recipeId} />
      <input type="hidden" name="recipeVersionId" value={recipeVersionId} />
      <p className="nn-muted">{t("recetaEditor_publicarAviso")}</p>
      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <BotonDeEnvio className="nn-button">{t("recetaEditor_publicar")}</BotonDeEnvio>
    </form>
  );
}
