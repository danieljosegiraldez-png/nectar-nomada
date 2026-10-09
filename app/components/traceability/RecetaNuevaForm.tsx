"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { crearRecetaAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

/**
 * Una receta nueva: un nombre, una descripción y a qué organización pertenece — Parte 2a, tarea 14 (2026-10-03). Ya no pide metas: la receta nace
 * en borrador y sin pasos (`crearRecetaEnBorrador`), y los pasos —con sus metas— se escriben en el editor.
 */
export function RecetaNuevaForm({
  organizations,
  permiteCompartida,
}: {
  organizations: { id: string; name: string }[];
  /** Ofrece la opción de receta compartida (`organizationId` nulo) sólo si el servidor la va a aceptar: `puedeAutoriaDeReceta(user, null)`. */
  permiteCompartida?: boolean;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(crearRecetaAction, initialState);

  return (
    <form className="nn-form" action={formAction} style={{ maxWidth: 520 }}>
      <div className="nn-field">
        <label htmlFor="recipe-name">{t("recipeNameLabel")}</label>
        <input id="recipe-name" name="name" required maxLength={120} placeholder={t("recetaEditor_nombrePlaceholder")} />
      </div>
      <div className="nn-field">
        <label htmlFor="recipe-description">{t("recipeDescriptionLabel")}</label>
        <input id="recipe-description" name="description" maxLength={300} />
      </div>
      <div className="nn-field">
        <label htmlFor="recipe-org">{t("recipeOrganizationLabel")}</label>
        <select id="recipe-org" name="organizationId" defaultValue={organizations[0]?.id ?? ""}>
          {permiteCompartida && <option value="">{t("recipeSharedOption")}</option>}
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
      <button type="submit" className="nn-button" disabled={pending}>
        {pending ? t("recipeSavingButton") : t("recipeCreateButton")}
      </button>
    </form>
  );
}
