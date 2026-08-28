"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { recordSelectionFormAction } from "../../actions/traceability";

export interface CatalogOption {
  id: string;
  value: string;
}

interface RejectionRow {
  key: number;
  categoryId: string;
  lotCode: string;
  quantity: string;
}

/**
 * P3 §6 (44_P3_SELECTION.md). The screen that makes a selection recordable.
 *
 * The service layer shipped in #58 and nothing could reach it: an operation
 * with no form is an operation nobody performs, which is the gap every phase of
 * this plan has hit in turn.
 *
 * The running balance is the point of the design, not decoration. Mass balance
 * refuses nothing at write time — out of tolerance records and raises a
 * Deviation (ADR-094) — so the only moment an operator can act on a
 * discrepancy is *before* submitting, while the coffee is still in front of
 * them and the scale is still there. A number that appears afterwards, in a
 * report someone else reads, arrives too late to change anything.
 */
export function SelectionForm({
  lotId,
  lotType,
  currentQuantity,
  unit,
  methods,
  categories,
}: {
  lotId: string;
  lotType: string;
  /** The lot's computed balance, or null when it has never been weighed. */
  currentQuantity: number | null;
  unit: string;
  methods: readonly CatalogOption[];
  categories: readonly CatalogOption[];
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(recordSelectionFormAction, {} as { error?: string });

  // Pre-filled from the ledger when known, still editable: the scale at the
  // beneficio is the authority, not the previous record.
  const [inputQuantity, setInputQuantity] = useState(currentQuantity != null ? String(currentQuantity) : "");
  const [acceptedQuantity, setAcceptedQuantity] = useState("");
  const [declaredLoss, setDeclaredLoss] = useState("");
  const [rows, setRows] = useState<RejectionRow[]>([{ key: 0, categoryId: "", lotCode: "", quantity: "" }]);

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const input = num(inputQuantity);
  const accounted = num(acceptedQuantity) + rows.reduce((sum, r) => sum + num(r.quantity), 0) + num(declaredLoss);
  const unexplained = input - accounted;
  // Matches DEFAULT_MASS_BALANCE_TOLERANCE_PCT in lib/traceability/balance.ts.
  // Advisory only — the server recomputes against the organization's own
  // tolerance and is the authority. This is here so the operator sees it
  // coming, never so the client decides.
  const tolerance = Math.abs(input) * 0.02;
  const withinTolerance = Math.abs(unexplained) <= tolerance;
  const hasInput = input > 0;

  const addRow = () => setRows((r) => [...r, { key: (r.at(-1)?.key ?? 0) + 1, categoryId: "", lotCode: "", quantity: "" }]);
  const removeRow = (key: number) => setRows((r) => (r.length > 1 ? r.filter((x) => x.key !== key) : r));
  const updateRow = (key: number, patch: Partial<RejectionRow>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 560, marginTop: "0.5rem" }}>
      <p className="nn-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9em" }}>
        {t("selectionHint")}
      </p>

      <input type="hidden" name="lotId" value={lotId} />
      <input type="hidden" name="acceptedLotType" value={lotType} />
      <input type="hidden" name="unit" value={unit} />

      <div className="nn-field">
        <label htmlFor="sel-input">{t("selectionInputQuantityLabel", { unit })}</label>
        <input
          id="sel-input"
          name="inputQuantity"
          type="number"
          step="0.001"
          min="0"
          required
          value={inputQuantity}
          onChange={(e) => setInputQuantity(e.target.value)}
        />
        {currentQuantity == null ? (
          // ADR-080's distinction, surfaced: never weighed is not zero.
          <span className="nn-muted" style={{ fontSize: "0.85em" }}>{t("selectionNoLedgerHint")}</span>
        ) : null}
      </div>

      <div className="nn-field">
        <label htmlFor="sel-method">{t("selectionMethodLabel")}</label>
        <select id="sel-method" name="selectionMethod" defaultValue="">
          <option value="">—</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>{m.value}</option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="sel-equipment">{t("selectionEquipmentLabel")}</label>
        <input id="sel-equipment" name="equipmentNote" type="text" />
      </div>

      <fieldset style={{ border: "1px solid var(--nn-border, #ddd)", borderRadius: 4, padding: "0.75rem", marginBottom: "0.75rem" }}>
        <legend style={{ fontWeight: 600 }}>{t("selectionAcceptedHeading")}</legend>
        <div className="nn-field">
          <label htmlFor="sel-acc-code">{t("selectionAcceptedLotCodeLabel")}</label>
          <input id="sel-acc-code" name="acceptedLotCode" type="text" required />
        </div>
        <div className="nn-field">
          <label htmlFor="sel-acc-qty">{t("selectionAcceptedQuantityLabel", { unit })}</label>
          <input
            id="sel-acc-qty"
            name="acceptedQuantity"
            type="number"
            step="0.001"
            min="0"
            required
            value={acceptedQuantity}
            onChange={(e) => setAcceptedQuantity(e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset style={{ border: "1px solid var(--nn-border, #ddd)", borderRadius: 4, padding: "0.75rem", marginBottom: "0.75rem" }}>
        <legend style={{ fontWeight: 600 }}>{t("selectionRejectedHeading")}</legend>
        <p className="nn-muted" style={{ margin: "0 0 0.5rem", fontSize: "0.85em" }}>{t("selectionRejectedHint")}</p>
        {rows.map((row, i) => (
          <div key={row.key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 6rem auto", gap: "0.4rem", marginBottom: "0.4rem", alignItems: "end" }}>
            <div className="nn-field" style={{ marginBottom: 0 }}>
              <label htmlFor={`sel-rej-cat-${row.key}`}>{t("selectionRejectedCategoryLabel")}</label>
              <select
                id={`sel-rej-cat-${row.key}`}
                name={`rejectedCategory.${i}`}
                value={row.categoryId}
                onChange={(e) => updateRow(row.key, { categoryId: e.target.value })}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.value}</option>
                ))}
              </select>
            </div>
            <div className="nn-field" style={{ marginBottom: 0 }}>
              <label htmlFor={`sel-rej-code-${row.key}`}>{t("selectionRejectedLotCodeLabel")}</label>
              <input
                id={`sel-rej-code-${row.key}`}
                name={`rejectedLotCode.${i}`}
                type="text"
                value={row.lotCode}
                onChange={(e) => updateRow(row.key, { lotCode: e.target.value })}
              />
            </div>
            <div className="nn-field" style={{ marginBottom: 0 }}>
              <label htmlFor={`sel-rej-qty-${row.key}`}>{unit}</label>
              <input
                id={`sel-rej-qty-${row.key}`}
                name={`rejectedQuantity.${i}`}
                type="number"
                step="0.001"
                min="0"
                value={row.quantity}
                onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
              />
            </div>
            <button type="button" className="nn-button-secondary" onClick={() => removeRow(row.key)} disabled={rows.length === 1}>
              {t("selectionRemoveRow")}
            </button>
          </div>
        ))}
        <button type="button" className="nn-button-secondary" onClick={addRow}>{t("selectionAddRow")}</button>
      </fieldset>

      <div className="nn-field">
        <label htmlFor="sel-loss">{t("selectionDeclaredLossLabel", { unit })}</label>
        <input
          id="sel-loss"
          name="declaredLossQuantity"
          type="number"
          step="0.001"
          min="0"
          value={declaredLoss}
          onChange={(e) => setDeclaredLoss(e.target.value)}
        />
      </div>
      <div className="nn-field">
        <label htmlFor="sel-loss-reason">{t("selectionDeclaredLossReasonLabel")}</label>
        <input id="sel-loss-reason" name="declaredLossReason" type="text" />
      </div>

      {/*
        The running balance. Shown only once there is an input weight to
        reconcile against — before that it would read "0" and imply the books
        balance, which is a claim rather than a state.
      */}
      {hasInput ? (
        <p
          role="status"
          aria-live="polite"
          style={{
            margin: "0 0 0.75rem",
            padding: "0.5rem 0.75rem",
            borderRadius: 4,
            border: "1px solid",
            borderColor: withinTolerance ? "var(--nn-ok-border, #b7d7b0)" : "var(--nn-warn-border, #e0c07a)",
            background: withinTolerance ? "var(--nn-ok-bg, #f2f8f1)" : "var(--nn-warn-bg, #fdf6e6)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {t("selectionBalanceLine", {
            accounted: accounted.toFixed(3),
            input: input.toFixed(3),
            unexplained: unexplained.toFixed(3),
            unit,
          })}
          {!withinTolerance ? <> — <strong>{t("selectionOutOfTolerance")}</strong></> : null}
        </p>
      ) : null}

      <div className="nn-field">
        <label htmlFor="sel-notes">{t("notesLabel")}</label>
        <input id="sel-notes" name="notes" type="text" />
      </div>

      {state.error ? <p className="nn-error">{state.error}</p> : null}

      <button type="submit" disabled={pending}>
        {pending ? t("selectionSubmitting") : t("selectionSubmit")}
      </button>
    </form>
  );
}
