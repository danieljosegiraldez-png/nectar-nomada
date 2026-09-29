"use client";

import { CampoNumerico } from "../CampoNumerico";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { createRecipeVersionAction, type TraceabilityActionState } from "../../actions/traceability";
import type { VariableChoice } from "./RecipeForm";

const initialState: TraceabilityActionState = {};

export interface InitialTarget {
  variable: string;
  moment: "initial" | "during" | "final";
  /** De qué fase habla el objetivo: fermentación o secado (2026-09-27). */
  phase: "fermentation" | "drying";
  /** Cada cuántas horas medir. Sólo con `during`. */
  everyHours?: string;
  targetValue: string;
  minValue: string;
  maxValue: string;
  note: string;
}

/**
 * A new version of an existing recipe — ADR-102.
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
  expectedHours,
}: {
  recipeId: string;
  variables: VariableChoice[];
  initialTargets: InitialTarget[];
  /** El de la versión vigente, para que la nueva no nazca sin él por descuido. */
  expectedHours?: number | null;
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
      <div className="nn-field">
        <label htmlFor="version-expected">{t("recipeExpectedHoursLabel")}</label>
        <CampoNumerico id="version-expected" name="expectedHours" min={1} step={1} inputMode="numeric" defaultValue={expectedHours ?? ""} />
      </div>

      {rows.map((row, i) => {
        const b = boundsFor(row.variable);
        return (
          <div key={row.key} style={{ border: "1px solid var(--nn-border)", borderRadius: 6, padding: "0.75rem", marginBottom: "0.75rem" }}>
            <input type="hidden" name={`targets[${i}][variable]`} value={row.variable} />
            <input type="hidden" name={`targets[${i}][moment]`} value={row.moment} />
<input type="hidden" name={`targets[${i}][phase]`} value={row.phase} />
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
              <div className="nn-field" style={{ flex: "1 1 150px" }}>
                <label htmlFor={`vf-${row.key}`}>{t("recipePhaseLabel")}</label>
                <select id={`vf-${row.key}`} value={row.phase} onChange={(e) => update(row.key, { phase: e.target.value as InitialTarget["phase"] })}>
                  <option value="fermentation">{t("phase_fermentation")}</option>
                  <option value="drying">{t("phase_drying")}</option>
                </select>
              </div>
              <div className="nn-field" style={{ flex: "1 1 140px" }}>
                <label htmlFor={`vm-${row.key}`}>{t("recipeMomentLabel")}</label>
                <select id={`vm-${row.key}`} value={row.moment} onChange={(e) => {
                    const m = e.target.value as InitialTarget["moment"];
                    update(row.key, m === "during" ? { moment: m } : { moment: m, everyHours: "" });
                  }}>
                  <option value="initial">{t("moment_initial")}</option>
                  <option value="during">{t("moment_during")}</option>
                  <option value="final">{t("moment_final")}</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <div className="nn-field" style={{ flex: "1 1 120px" }}>
                <label htmlFor={`vt-${row.key}`}>{t("recipeTargetValueLabel")}</label>
                <CampoNumerico id={`vt-${row.key}`} name={`targets[${i}][targetValue]`} step="any"
                  min={b?.min} max={b?.max} value={row.targetValue}
                  onChange={(e) => update(row.key, { targetValue: e.target.value })} />
              </div>
              <div className="nn-field" style={{ flex: "1 1 120px" }}>
                <label htmlFor={`vmin-${row.key}`}>{t("recipeMinLabel")}</label>
                <CampoNumerico id={`vmin-${row.key}`} name={`targets[${i}][minValue]`} step="any"
                  min={b?.min} max={b?.max} value={row.minValue}
                  onChange={(e) => update(row.key, { minValue: e.target.value })} />
              </div>
              <div className="nn-field" style={{ flex: "1 1 120px" }}>
                <label htmlFor={`vmax-${row.key}`}>{t("recipeMaxLabel")}</label>
                <CampoNumerico id={`vmax-${row.key}`} name={`targets[${i}][maxValue]`} step="any"
                  min={b?.min} max={b?.max} value={row.maxValue}
                  onChange={(e) => update(row.key, { maxValue: e.target.value })} />
              </div>
            </div>

            <div className="nn-field">
              <label htmlFor={`vn-${row.key}`}>{t("recipeNoteLabel")}</label>
              {/* Sin esto, publicar una v2 le borraba el ritmo a la receta en
                  silencio. Lo cazó la revisión de Codex el 2026-09-13. */}
              {row.moment === "during" ? (
                <CampoNumerico
                  name={`targets[${i}][everyHours]`} min={1} step={1}
                  inputMode="numeric" aria-label={t("recipeEveryHoursLabel")}
                  placeholder={t("recipeEveryHoursLabel")}
                  value={row.everyHours ?? ""}
                  onChange={(e) => update(row.key, { everyHours: e.target.value })}
                />
              ) : null}
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
          setRows((rs) => [...rs, { key: nextKey, variable: "ph", moment: "during", phase: "fermentation" as const, targetValue: "", minValue: "", maxValue: "", everyHours: "", note: "" }]);
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
