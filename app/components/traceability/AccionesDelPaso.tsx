"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { moverPasoAction, quitarPasoAction, type TraceabilityActionState } from "../../actions/traceability";
import { BotonDeEnvio } from "../BotonDeEnvio";

const initialState: TraceabilityActionState = {};

/**
 * Subir, bajar y quitar un paso de un borrador — diseño §6. Parte 2a, tarea 14 (2026-10-03).
 *
 * Tres formularios pequeños en vez de uno con tres botones: cada uno manda sólo lo suyo, y «subir» y «bajar» comparten la acción
 * (`moverPasoAction`) con distinto `aSeq`. Ninguno redirige: al volver, la página se refresca y la lista cambiada es la confirmación.
 * El primero no sube y el último no baja, y esos botones **no se pintan**: un botón que no se puede usar no se ofrece.
 */
export function AccionesDelPaso({
  recipeId,
  stepId,
  seq,
  total,
}: {
  recipeId: string;
  stepId: string;
  seq: number;
  total: number;
}) {
  const t = useTranslations("Traceability");
  const [estadoMover, mover] = useActionState(moverPasoAction, initialState);
  const [estadoQuitar, quitar] = useActionState(quitarPasoAction, initialState);
  const error = estadoMover.error ?? estadoQuitar.error;

  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.5rem" }}>
      {seq > 1 ? (
        <form action={mover}>
          <input type="hidden" name="recipeId" value={recipeId} />
          <input type="hidden" name="stepId" value={stepId} />
          <input type="hidden" name="aSeq" value={seq - 1} />
          <BotonDeEnvio className="nn-button-quiet">{t("recetaEditor_subir")}</BotonDeEnvio>
        </form>
      ) : null}
      {seq < total ? (
        <form action={mover}>
          <input type="hidden" name="recipeId" value={recipeId} />
          <input type="hidden" name="stepId" value={stepId} />
          <input type="hidden" name="aSeq" value={seq + 1} />
          <BotonDeEnvio className="nn-button-quiet">{t("recetaEditor_bajar")}</BotonDeEnvio>
        </form>
      ) : null}
      <form action={quitar}>
        <input type="hidden" name="recipeId" value={recipeId} />
        <input type="hidden" name="stepId" value={stepId} />
        <BotonDeEnvio className="nn-button-quiet">{t("recetaEditor_quitarPaso")}</BotonDeEnvio>
      </form>
      {error ? (
        <p className="nn-error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
