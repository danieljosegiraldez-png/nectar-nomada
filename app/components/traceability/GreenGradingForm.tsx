"use client";

import { SISTEMAS_DE_MALLA } from "../../../lib/traceability/vocabularioDeMalla";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { recordGreenGradingAction, type TraceabilityActionState } from "../../actions/traceability";
import { codigosDerivados } from "../../../lib/traceability/codigosDerivados";
import { CampoNumerico } from "../CampoNumerico";
import { TimezoneOffsetField } from "../TimezoneOffsetField";

type Status = "measured" | "supplier_declared" | "qualitative" | "unknown";
type Fraction = { key: number; code: string; quantity: string; status: Status; min: string; max: string };
type Defect = { key: number; code: string; quantity: string; category: string };
type Category = { id: string; value: string };

export function GreenGradingForm({ lotId, lotCode, usedCodes, currentQuantityKg, categories }: {
  lotId: string;
  lotCode: string;
  usedCodes: readonly string[];
  currentQuantityKg: number | null;
  categories: readonly Category[];
}) {
  const t = useTranslations("Traceability");
  const [state, action, pending] = useActionState(recordGreenGradingAction, {} as TraceabilityActionState);
  const nextCode = (local: readonly string[]) => codigosDerivados(lotCode, 1, [...usedCodes, ...local.filter(Boolean)])[0] ?? "";
  const [input, setInput] = useState(currentQuantityKg == null ? "" : String(currentQuantityKg));
  const [loss, setLoss] = useState("");
  const [fractions, setFractions] = useState<Fraction[]>([
    { key: 0, code: nextCode([]), quantity: "", status: "measured", min: "", max: "" },
  ]);
  const [defects, setDefects] = useState<Defect[]>([]);

  const numeric = (value: string) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const accounted = fractions.reduce((sum, row) => sum + numeric(row.quantity), 0)
    + defects.reduce((sum, row) => sum + numeric(row.quantity), 0) + numeric(loss);
  const unexplained = numeric(input) - accounted;
  const hasInput = numeric(input) > 0;
  const withinTolerance = Math.abs(unexplained) <= numeric(input) * 0.02;
  const allCodes = () => [...fractions.map((row) => row.code), ...defects.map((row) => row.code)];

  const addFraction = () => setFractions((rows) => [...rows, {
    key: (rows.at(-1)?.key ?? -1) + 1,
    code: nextCode(allCodes()), quantity: "", status: "measured", min: "", max: "",
  }]);
  const updateFraction = (key: number, patch: Partial<Fraction>) =>
    setFractions((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  const addDefect = () => setDefects((rows) => [...rows, {
    key: (rows.at(-1)?.key ?? -1) + 1, code: nextCode(allCodes()), quantity: "", category: "",
  }]);
  const updateDefect = (key: number, patch: Partial<Defect>) =>
    setDefects((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));

  return (
    <form action={action} className="nn-form nn-green-grading-form">
      <TimezoneOffsetField />
      <input type="hidden" name="lotId" value={lotId} />

      <div className="nn-green-grading-lead">
        <div className="nn-field">
          <label htmlFor="gg-date">{t("greenGradingDate")}</label>
          <input id="gg-date" name="occurredAt" type="datetime-local" required />
        </div>
        <div className="nn-field">
          <label htmlFor="gg-input">{t("greenGradingInputKg")}</label>
          <CampoNumerico id="gg-input" name="inputQuantityKg" step="0.001" min="0" required value={input} onChange={(e) => setInput(e.target.value)} />
          {currentQuantityKg == null ? <span className="nn-muted">{t("greenGradingNoLedger")}</span> : null}
        </div>
      </div>

      <fieldset className="nn-green-grading-group">
        <legend>{t("greenGradingFractions")}</legend>
        <p className="nn-muted">{t("greenGradingFractionsHint")}</p>
        {fractions.map((row, index) => (
          <div className="nn-green-fraction" key={row.key}>
            <div className="nn-green-fraction-heading">
              <strong>{t("greenGradingFraction", { number: index + 1 })}</strong>
              {fractions.length > 1 ? <button type="button" className="nn-link-button" onClick={() => setFractions((rows) => rows.filter((item) => item.key !== row.key))}>{t("selectionRemoveRow")}</button> : null}
            </div>
            <div className="nn-green-grading-grid">
              <div className="nn-field"><label htmlFor={`gg-code-${row.key}`}>{t("greenGradingLotCode")}</label><input id={`gg-code-${row.key}`} name={`fractionLotCode.${index}`} required value={row.code} onChange={(e) => updateFraction(row.key, { code: e.target.value })} /></div>
              <div className="nn-field"><label htmlFor={`gg-qty-${row.key}`}>{t("greenGradingFractionKg")}</label><CampoNumerico id={`gg-qty-${row.key}`} name={`fractionQuantity.${index}`} step="0.001" min="0" required value={row.quantity} onChange={(e) => updateFraction(row.key, { quantity: e.target.value })} /></div>
              <div className="nn-field"><label htmlFor={`gg-status-${row.key}`}>{t("greenGradingDataStatus")}</label><select id={`gg-status-${row.key}`} name={`fractionScreenStatus.${index}`} value={row.status} onChange={(e) => updateFraction(row.key, { status: e.target.value as Status })}>{(["measured", "supplier_declared", "qualitative", "unknown"] as const).map((value) => <option key={value} value={value}>{t(`greenGradingStatus_${value}`)}</option>)}</select></div>
            </div>
            {row.status !== "unknown" ? (
              <div className="nn-green-grading-grid">
                <div className="nn-field"><label htmlFor={`gg-min-${row.key}`}>{t("greenGradingScreenMin")}</label><CampoNumerico id={`gg-min-${row.key}`} name={`fractionScreenMin.${index}`} min="1" max="30" step="1" value={row.min} onChange={(e) => updateFraction(row.key, { min: e.target.value })} /></div>
                <div className="nn-field"><label htmlFor={`gg-max-${row.key}`}>{t("greenGradingScreenMax")}</label><CampoNumerico id={`gg-max-${row.key}`} name={`fractionScreenMax.${index}`} min="1" max="30" step="1" value={row.max} onChange={(e) => updateFraction(row.key, { max: e.target.value })} /></div>
                <div className="nn-field">
                  <label htmlFor={`gg-system-${row.key}`}>{t("greenGradingScreenSystem")}</label>
                  {/* Lista fija (decisión de Daniel, 2026-09-25): con texto libre, dos fracciones del
                      mismo lote no se agrupaban nunca. «Otro» obliga a escribir cuál en la nota. */}
                  <select id={`gg-system-${row.key}`} name={`fractionScreenSystem.${index}`} defaultValue="redonda_internacional">
                    {SISTEMAS_DE_MALLA.map((s) => (
                      <option key={s} value={s}>
                        {t(`greenGradingScreenSystem_${s}` as "greenGradingScreenSystem_redonda_internacional")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
            <details>
              <summary>{t("greenGradingOptionalDetails")}</summary>
              <div className="nn-green-grading-grid nn-details-body">
                <div className="nn-field"><label htmlFor={`gg-uniformity-${row.key}`}>{t("greenGradingUniformity")}</label><CampoNumerico id={`gg-uniformity-${row.key}`} name={`fractionUniformityPct.${index}`} min="0" max="100" step="0.1" /></div>
                <div className="nn-field nn-green-wide"><label htmlFor={`gg-note-${row.key}`}>{t("greenGradingGradeNote")}</label><input id={`gg-note-${row.key}`} name={`fractionGradeNote.${index}`} /></div>
              </div>
            </details>
          </div>
        ))}
        <button type="button" className="nn-button-secondary" onClick={addFraction}>{t("greenGradingAddFraction")}</button>
      </fieldset>

      <details className="nn-green-grading-group">
        <summary>{t("greenGradingDefectsAndLoss")}</summary>
        <div className="nn-details-body">
          {defects.map((row, index) => (
            <div className="nn-green-grading-grid" key={row.key}>
              <div className="nn-field"><label htmlFor={`gg-def-category-${row.key}`}>{t("selectionRejectedCategoryLabel")}</label><select id={`gg-def-category-${row.key}`} name={`defectCategory.${index}`} required value={row.category} onChange={(e) => updateDefect(row.key, { category: e.target.value })}><option value="" disabled>—</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.value}</option>)}</select></div>
              <div className="nn-field"><label htmlFor={`gg-def-code-${row.key}`}>{t("greenGradingLotCode")}</label><input id={`gg-def-code-${row.key}`} name={`defectLotCode.${index}`} required value={row.code} onChange={(e) => updateDefect(row.key, { code: e.target.value })} /></div>
              <div className="nn-field"><label htmlFor={`gg-def-qty-${row.key}`}>{t("greenGradingDefectKg")}</label><CampoNumerico id={`gg-def-qty-${row.key}`} name={`defectQuantity.${index}`} step="0.001" min="0" required value={row.quantity} onChange={(e) => updateDefect(row.key, { quantity: e.target.value })} /></div>
              <button type="button" className="nn-link-button nn-green-remove" onClick={() => setDefects((rows) => rows.filter((item) => item.key !== row.key))}>{t("selectionRemoveRow")}</button>
            </div>
          ))}
          <button type="button" className="nn-button-secondary" onClick={addDefect}>{t("greenGradingAddDefect")}</button>
          <div className="nn-field"><label htmlFor="gg-loss">{t("greenGradingLossKg")}</label><CampoNumerico id="gg-loss" name="declaredLossKg" step="0.001" min="0" value={loss} onChange={(e) => setLoss(e.target.value)} /></div>
        </div>
      </details>

      {hasInput ? <p className={withinTolerance ? "nn-green-balance nn-green-balance-ok" : "nn-green-balance nn-green-balance-warning"} role="status" aria-live="polite">{t("greenGradingBalance", { accounted: accounted.toFixed(3), input: numeric(input).toFixed(3), unexplained: unexplained.toFixed(3) })}{!withinTolerance ? <> <strong>{t("selectionOutOfTolerance")}</strong></> : null}</p> : null}

      <details>
        <summary>{t("greenGradingTraceabilityDetails")}</summary>
        <div className="nn-details-body">
          <div className="nn-field"><label htmlFor="gg-source">{t("greenGradingSourceReference")}</label><input id="gg-source" name="sourceReference" /></div>
          <div className="nn-field"><label htmlFor="gg-notes">{t("notesLabel")}</label><textarea id="gg-notes" name="notes" rows={3} /></div>
        </div>
      </details>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{pending ? t("greenGradingSaving") : t("greenGradingSubmit")}</button>
    </form>
  );
}
