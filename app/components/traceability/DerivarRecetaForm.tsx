"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { derivarRecetaAction, type TraceabilityActionState } from "../../actions/traceability";
import { BotonDeEnvio } from "../BotonDeEnvio";

const initialState: TraceabilityActionState = {};

/**
 * Derivar una copia propia de una plantilla — diseño §3.4. Parte 2a, tarea 14 (2026-10-03). Las organizaciones que se ofrecen son sólo aquellas
 * donde el servidor va a aceptar la copia (`puedeAutoriaDeReceta`), y el servicio lo vuelve a comprobar: el `value` de un desplegable no es autorización.
 */
export function DerivarRecetaForm({
  plantillaVersionId,
  nombreSugerido,
  organizations,
}: {
  plantillaVersionId: string;
  nombreSugerido: string;
  organizations: { id: string; name: string }[];
}) {
  const t = useTranslations("Traceability");
  const [state, formAction] = useActionState(derivarRecetaAction, initialState);

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 520 }}>
      <input type="hidden" name="plantillaVersionId" value={plantillaVersionId} />
      <div className="nn-field">
        <label htmlFor="derivar-nombre">{t("recetaEditor_derivarNombre")}</label>
        <input id="derivar-nombre" name="nombre" required maxLength={120} defaultValue={nombreSugerido} />
      </div>
      <div className="nn-field">
        <label htmlFor="derivar-organizacion">{t("recipeOrganizationLabel")}</label>
        <select id="derivar-organizacion" name="organizationId" defaultValue={organizations[0]?.id ?? ""}>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <BotonDeEnvio className="nn-button">{t("recetaEditor_derivarBoton")}</BotonDeEnvio>
    </form>
  );
}
