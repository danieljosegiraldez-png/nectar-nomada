"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateRecipeAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

/**
 * The recipe's label, and only its label — ADR-101.
 *
 * There is deliberately no target field here. Correcting a typo in a name
 * changes nothing about what any run was aiming for; changing a target changes
 * everything, and that is a new version (CLAUDE.md §3).
 */
export function RecipeMetadataForm({
  recipeId,
  name,
  description,
}: {
  recipeId: string;
  name: string;
  description: string;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(updateRecipeAction, initialState);

  return (
    <form className="nn-form" action={formAction} style={{ maxWidth: 520 }}>
      <input type="hidden" name="recipeId" value={recipeId} />
      <div className="nn-field">
        <label htmlFor="meta-name">{t("recipeNameLabel")}</label>
        <input id="meta-name" name="name" defaultValue={name} required maxLength={120} />
      </div>
      <div className="nn-field">
        <label htmlFor="meta-description">{t("recipeDescriptionLabel")}</label>
        <input id="meta-description" name="description" defaultValue={description} maxLength={300} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button-quiet" disabled={pending}>
        {pending ? t("recipeSavingButton") : t("recipeSaveNameButton")}
      </button>
    </form>
  );
}
