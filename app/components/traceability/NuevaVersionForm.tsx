"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { nuevaVersionBorradorAction, type TraceabilityActionState } from "../../actions/traceability";
import { BotonDeEnvio } from "../BotonDeEnvio";

const initialState: TraceabilityActionState = {};

/** Empezar la versión siguiente de una receta publicada — diseño §3.3. Parte 2a, tarea 14 (2026-10-03). Nace borrador, con una copia de los pasos. */
export function NuevaVersionForm({ recipeId, desdeVersionId }: { recipeId: string; desdeVersionId: string }) {
  const t = useTranslations("Traceability");
  const [state, formAction] = useActionState(nuevaVersionBorradorAction, initialState);

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 560 }}>
      <input type="hidden" name="recipeId" value={recipeId} />
      <input type="hidden" name="desdeVersionId" value={desdeVersionId} />
      <p className="nn-muted">{t("recetaEditor_nuevaVersionIntro")}</p>
      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <BotonDeEnvio className="nn-button">{t("recetaEditor_nuevaVersionBoton")}</BotonDeEnvio>
    </form>
  );
}
