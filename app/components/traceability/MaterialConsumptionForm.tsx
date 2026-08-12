"use client";

import { useTranslations } from "next-intl";
import { recordMaterialConsumptionEntryFormAction } from "../../actions/traceability";
import type { MaterialConsumptionParent } from "../../../lib/traceability/operations";

/**
 * T12.6 (§3). Golden path: Material, Batch label (the one irrecoverable
 * identity fact — placed first in visual priority), Quantity, Unit
 * (pre-filled "kg", a confirm-tap rather than a type-tap in the common
 * case), Record. No provenanceClass picker — fixed to direct_observation
 * at the action layer, matching every call site here except Measurement's
 * genuinely ambiguous one.
 */
export function MaterialConsumptionForm({ lotId, parent }: { lotId: string; parent: MaterialConsumptionParent }) {
  const t = useTranslations("Traceability");

  return (
    <form action={recordMaterialConsumptionEntryFormAction} className="nn-form" style={{ maxWidth: 420, marginTop: "0.5rem" }}>
      <input type="hidden" name="lotId" value={lotId} />
      <input type="hidden" name="parentKind" value={parent.kind} />
      <input type="hidden" name="parentId" value={parent.kind === "fermentationRun" ? parent.fermentationRunId : parent.dryingRunId} />
      <div className="nn-field">
        <label htmlFor={`consumption-batch-${parent.kind}`}>{t("batchLabelLabel")}</label>
        <input id={`consumption-batch-${parent.kind}`} name="batchLabel" type="text" required />
      </div>
      <div className="nn-field">
        <label htmlFor={`consumption-material-${parent.kind}`}>{t("materialNameLabel")}</label>
        <input id={`consumption-material-${parent.kind}`} name="materialName" type="text" required />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <div className="nn-field" style={{ flex: "1 1 100px" }}>
          <label htmlFor={`consumption-quantity-${parent.kind}`}>{t("quantityLabel")}</label>
          <input id={`consumption-quantity-${parent.kind}`} name="quantity" type="number" inputMode="decimal" step="0.001" />
        </div>
        <div className="nn-field" style={{ flex: "1 1 80px" }}>
          <label htmlFor={`consumption-unit-${parent.kind}`}>{t("unitLabel")}</label>
          <input id={`consumption-unit-${parent.kind}`} name="unit" type="text" defaultValue="kg" />
        </div>
      </div>
      <button type="submit" className="nn-button">
        {t("recordConsumptionButton")}
      </button>
    </form>
  );
}
