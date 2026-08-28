"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createRecipeAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

export interface VariableChoice {
  variable: string;
  canonicalUnit: string;
  min: number;
  max: number;
}

interface TargetRow {
  key: number;
  variable: string;
  moment: "initial" | "during" | "final";
  targetValue: string;
  minValue: string;
  maxValue: string;
  note: string;
}

/**
 * Authoring a recipe and its first version — ADR-100.
 *
 * A client component because the number of targets is not known in advance:
 * "Lavado tradicional" declares three, a cold-hold protocol declares eight,
 * and a form that fixed the count would decide the domain on the operator's
 * behalf.
 *
 * The unit is **not** an input. It is read from the variable's own definition
 * in units.ts, so a pH target cannot be recorded in Brix. That removes the one
 * field an operator would most plausibly get wrong and the comparison table
 * would then silently misreport.
 */
export function RecipeForm({
  organizations,
  variables,
}: {
  organizations: { id: string; name: string }[];
  variables: VariableChoice[];
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(createRecipeAction, initialState);

  const [rows, setRows] = useState<TargetRow[]>([
    { key: 1, variable: "ph", moment: "final", targetValue: "", minValue: "", maxValue: "", note: "" },
  ]);
  const [nextKey, setNextKey] = useState(2);

  const unitFor = (variable: string) =>
    variables.find((v) => v.variable === variable)?.canonicalUnit ?? "";
  const boundsFor = (variable: string) => variables.find((v) => v.variable === variable);

  const update = (key: number, patch: Partial<TargetRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form className="nn-form" action={formAction} style={{ maxWidth: 720 }}>
      <div className="nn-field">
        <label htmlFor="recipe-name">{t("recipeNameLabel")}</label>
        <input id="recipe-name" name="name" required maxLength={120} placeholder="Lavado tradicional" />
      </div>

      <div className="nn-field">
        <label htmlFor="recipe-description">{t("recipeDescriptionLabel")}</label>
        <input id="recipe-description" name="description" maxLength={300} />
      </div>

      <div className="nn-field">
        <label htmlFor="recipe-org">{t("recipeOrganizationLabel")}</label>
        <select id="recipe-org" name="organizationId" defaultValue={organizations[0]?.id ?? ""}>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>

      <h3 style={{ marginTop: "1.5rem", marginBottom: "0.25rem" }}>{t("recipeTargetsHeading")}</h3>
      <p className="nn-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9em" }}>
        {t("recipeTargetsIntro")}
      </p>

      {rows.map((row, i) => {
        const b = boundsFor(row.variable);
        return (
          <div
            key={row.key}
            style={{
              border: "1px solid var(--nn-border)",
              borderRadius: 6,
              padding: "0.75rem",
              marginBottom: "0.75rem",
            }}
          >
            <input type="hidden" name={`targets[${i}][variable]`} value={row.variable} />
            <input type="hidden" name={`targets[${i}][moment]`} value={row.moment} />
            {/* The unit travels with the variable rather than being typed. */}
            <input type="hidden" name={`targets[${i}][unit]`} value={unitFor(row.variable)} />

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <div className="nn-field" style={{ flex: "1 1 180px" }}>
                <label htmlFor={`v-${row.key}`}>{t("recipeVariableLabel")}</label>
                <select
                  id={`v-${row.key}`}
                  value={row.variable}
                  onChange={(e) => update(row.key, { variable: e.target.value })}
                >
                  {variables.map((v) => (
                    <option key={v.variable} value={v.variable}>
                      {t(`variable_${v.variable}` as "variable_ph", { fallback: v.variable })} ({v.canonicalUnit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="nn-field" style={{ flex: "1 1 140px" }}>
                <label htmlFor={`m-${row.key}`}>{t("recipeMomentLabel")}</label>
                <select
                  id={`m-${row.key}`}
                  value={row.moment}
                  onChange={(e) => update(row.key, { moment: e.target.value as TargetRow["moment"] })}
                >
                  <option value="initial">{t("moment_initial")}</option>
                  <option value="during">{t("moment_during")}</option>
                  <option value="final">{t("moment_final")}</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <div className="nn-field" style={{ flex: "1 1 120px" }}>
                <label htmlFor={`t-${row.key}`}>{t("recipeTargetValueLabel")}</label>
                <input
                  id={`t-${row.key}`} name={`targets[${i}][targetValue]`} type="number" step="any"
                  min={b?.min} max={b?.max} value={row.targetValue}
                  onChange={(e) => update(row.key, { targetValue: e.target.value })}
                />
              </div>
              <div className="nn-field" style={{ flex: "1 1 120px" }}>
                <label htmlFor={`min-${row.key}`}>{t("recipeMinLabel")}</label>
                <input
                  id={`min-${row.key}`} name={`targets[${i}][minValue]`} type="number" step="any"
                  min={b?.min} max={b?.max} value={row.minValue}
                  onChange={(e) => update(row.key, { minValue: e.target.value })}
                />
              </div>
              <div className="nn-field" style={{ flex: "1 1 120px" }}>
                <label htmlFor={`max-${row.key}`}>{t("recipeMaxLabel")}</label>
                <input
                  id={`max-${row.key}`} name={`targets[${i}][maxValue]`} type="number" step="any"
                  min={b?.min} max={b?.max} value={row.maxValue}
                  onChange={(e) => update(row.key, { maxValue: e.target.value })}
                />
              </div>
            </div>

            <div className="nn-field">
              <label htmlFor={`n-${row.key}`}>{t("recipeNoteLabel")}</label>
              <input
                id={`n-${row.key}`} name={`targets[${i}][note]`} maxLength={200}
                value={row.note} onChange={(e) => update(row.key, { note: e.target.value })}
              />
            </div>

            {b ? (
              <p className="nn-muted" style={{ margin: 0, fontSize: "0.85em" }}>
                {t("recipeBoundsHint", { min: b.min, max: b.max, unit: b.canonicalUnit })}
              </p>
            ) : null}

            {/* The last row cannot be removed: a recipe with no targets
                declares nothing, and the service refuses it anyway. */}
            {rows.length > 1 ? (
              <button
                type="button" className="nn-button-quiet" style={{ marginTop: "0.5rem" }}
                onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
              >
                {t("recipeRemoveTarget")}
              </button>
            ) : null}
          </div>
        );
      })}

      <button
        type="button" className="nn-button-quiet"
        onClick={() => {
          setRows((rs) => [
            ...rs,
            { key: nextKey, variable: "ph", moment: "during", targetValue: "", minValue: "", maxValue: "", note: "" },
          ]);
          setNextKey((k) => k + 1);
        }}
      >
        {t("recipeAddTarget")}
      </button>

      {state.error ? (
        <p className="nn-error" role="alert" style={{ marginTop: "1rem" }}>{state.error}</p>
      ) : null}

      <button type="submit" className="nn-button" disabled={pending} style={{ marginTop: "1rem" }}>
        {pending ? t("recipeSavingButton") : t("recipeCreateButton")}
      </button>
    </form>
  );
}
