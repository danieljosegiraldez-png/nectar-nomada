"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createRecipeVersionAction, type TraceabilityActionState } from "../../actions/traceability";
import type { VariableChoice } from "./RecipeForm";

const initialState: TraceabilityActionState = {};

export interface InitialTarget {
  variable: string;
  moment: "initial" | "during" | "final";
  targetValue: string;
  minValue: string;
  maxValue: string;
  note: string;
}

/**
 * A new version of an existing recipe — ADR-101.
 *
 * **Prefilled from the current version, deliberately.** Creating version 2
 * almost always means changing one number, not retyping eight targets. Making
 * the operator start from an empty form would be the reason they edit the
 * database instead, or give up and let the recipe drift out of date — which is
 * the failure the version table exists to prevent.
 *
 * The prefill is a starting point, not a diff: what is submitted becomes the
 * new version in full, and the old one is untouched.
 */
export function RecipeVersionForm({
  recipeId,
  variables,
  initialTargets,
}: {
  recipeId: string;
  variables: VariableChoice[];
  initialTargets: InitialTarget[];
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(createRecipeVersionAction, initialState);
  const [rows, setRows] = useState(initialTargets.map((r, i) => ({ ...r, key: i + 1 })));
  const [nextKey, setNextKey] = useState(initialTargets.length + 1);

  const unitFor = (v: string) => variables.find((x) => x.variable === v)?.canonicalUnit ?? "";
  const boundsFor = (v: string) => variables.find((x) => x.variable === v);
  const update = (key: number, patch: Partial<InitialTarget>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form className="nn-form" action={formAction} style={{ maxWidth: 720 }}>
      <input type="hidden" name="recipeId" value={recipeId} />

      <div className="nn-field">
        <label htmlFor="version-notes">{t("recipeVersionNotesLabel")}</label>
        <input id="version-notes" name="notes" maxLength={300} placeholder={t("recipeVersionNotesPlaceholder")} />
      </div>

      {rows.map((row, i) => {
        const b = boundsFor(row.variable);
        return (
          <div key={row.key} style={{ border: "1px solid var(--nn-border)", borderRadius: 6, padding: "0.75rem", marginBottom: "0.75rem" }}>
            <input type="hidden" name={`targets[${i}][variable]`} value={row.variable} />
            <input type="hidden" name={`targets[${i}][moment]`} value={row.moment} />
            <input type="hidden" name={`targets[${i}][unit]`} value={unitFor(row.variable)} />

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <div className="nn-field" style={{ flex: "1 1 180px" }}>
                <label htmlFor={`vv-${row.key}`}>{t("recipeVariableLabel")}</label>
                <select id={`vv-${row.key}`} value={row.variable} onChange={(e) => update(row.key, { variable: e.target.value })}>
                  {variables.map((v) => (
                    <option key={v.variable} value={v.variable}>
                      {t(`variable_${v.variable}` as "variable_ph", { fallback: v.variable })} ({v.canonicalUnit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="nn-field" style={{ flex: "1 1 140px" }}>
                <label htmlFor={`vm-${row.key}`}>{t("recipeMomentLabel")}</label>
                <select id={`vm-${row.key}`} value={row.moment} onChange={(e) => update(row.key, { moment: e.target.value as InitialTarget["moment"] })}>
                  <option value="initial">{t("moment_initial")}</option>
                  <option value="during">{t("moment_during")}</option>
                  <option value="final">{t("moment_final")}</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <div className="nn-field" style={{ flex: "1 1 120px" }}>
                <label htmlFor={`vt-${row.key}`}>{t("recipeTargetValueLabel")}</label>
                <input id={`vt-${row.key}`} name={`targets[${i}][targetValue]`} type="number" step="any"
                  min={b?.min} max={b?.max} value={row.targetValue}
                  onChange={(e) => update(row.key, { targetValue: e.target.value })} />
              </div>
              <div className="nn-field" style={{ flex: "1 1 120px" }}>
                <label htmlFor={`vmin-${row.key}`}>{t("recipeMinLabel")}</label>
                <input id={`vmin-${row.key}`} name={`targets[${i}][minValue]`} type="number" step="any"
                  min={b?.min} max={b?.max} value={row.minValue}
                  onChange={(e) => update(row.key, { minValue: e.target.value })} />
              </div>
              <div className="nn-field" style={{ flex: "1 1 120px" }}>
                <label htmlFor={`vmax-${row.key}`}>{t("recipeMaxLabel")}</label>
                <input id={`vmax-${row.key}`} name={`targets[${i}][maxValue]`} type="number" step="any"
                  min={b?.min} max={b?.max} value={row.maxValue}
                  onChange={(e) => update(row.key, { maxValue: e.target.value })} />
              </div>
            </div>

            <div className="nn-field">
              <label htmlFor={`vn-${row.key}`}>{t("recipeNoteLabel")}</label>
              <input id={`vn-${row.key}`} name={`targets[${i}][note]`} maxLength={200}
                value={row.note} onChange={(e) => update(row.key, { note: e.target.value })} />
            </div>

            {rows.length > 1 ? (
              <button type="button" className="nn-button-quiet" style={{ marginTop: "0.5rem" }}
                onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}>
                {t("recipeRemoveTarget")}
              </button>
            ) : null}
          </div>
        );
      })}

      <button type="button" className="nn-button-quiet"
        onClick={() => {
          setRows((rs) => [...rs, { key: nextKey, variable: "ph", moment: "during", targetValue: "", minValue: "", maxValue: "", note: "" }]);
          setNextKey((k) => k + 1);
        }}>
        {t("recipeAddTarget")}
      </button>

      {state.error ? <p className="nn-error" role="alert" style={{ marginTop: "1rem" }}>{state.error}</p> : null}

      <button type="submit" className="nn-button" disabled={pending} style={{ marginTop: "1rem" }}>
        {pending ? t("recipeSavingButton") : t("recipeCreateVersionButton")}
      </button>
    </form>
  );
}
