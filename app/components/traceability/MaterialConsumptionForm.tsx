"use client";

import { CampoNumerico } from "../CampoNumerico";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordMaterialConsumptionEntryFormAction, type TraceabilityActionState } from "../../actions/traceability";
import type { MaterialConsumptionParent } from "../../../lib/traceability/operations";
import { BotonDeEnvio } from "../BotonDeEnvio";

/**
 * T12.6 (§3). Golden path: Material, Batch label (the one irrecoverable
 * identity fact — placed first in visual priority), Quantity, Unit
 * (pre-filled "kg", a confirm-tap rather than a type-tap in the common
 * case), Record. No provenanceClass picker — fixed to direct_observation
 * at the action layer, matching every call site here except Measurement's
 * genuinely ambiguous one.
 */
export function MaterialConsumptionForm({
  lotId,
  parent,
  claveDeEnvio,
}: {
  lotId: string;
  // La rutina de cuidado cuelga su propio consumo desde `lib/rutinas/rutinas.ts`,
  // nunca desde este formulario del lote.
  parent: Exclude<MaterialConsumptionParent, { kind: "careRoutineEvent" }>;
  // La genera el servidor al pintar la página, no el cliente: un `useState` con
  // `crypto.randomUUID()` daría un valor al renderizar en servidor y otro al
  // hidratar, que es un desajuste de hidratación.
  claveDeEnvio: string;
}) {
  const t = useTranslations("Traceability");
  // Ver `LabourEntryForm`: la acción devuelve estado y aquí se pinta.
  const [state, formAction] = useActionState(
    recordMaterialConsumptionEntryFormAction,
    {} as TraceabilityActionState,
  );

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 420, marginTop: "0.5rem" }}>
      <input type="hidden" name="claveDeEnvio" value={claveDeEnvio} />
      {/*
        ADR-097. This form recorded zero entries in production, and the reason
        was one label: the package's lot number was called "Lote/batch",
        which spends both of the words V1 reserved — "Lote" is a plot of land,
        "Batch" is harvested coffee — on a third thing entirely. On a batch
        page, a field called "Lote/batch" reads as "which batch is this?".
        The hint says what the section is for, because the fields alone
        did not.
      */}
      <p className="nn-muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9em" }}>
        {t("materialConsumptionHint")}
      </p>
      <input type="hidden" name="lotId" value={lotId} />
      <input type="hidden" name="parentKind" value={parent.kind} />
      <input
        type="hidden"
        name="parentId"
        value={
          parent.kind === "fermentationRun"
            ? parent.fermentationRunId
            : parent.kind === "dryingRun"
              ? parent.dryingRunId
              : parent.kind === "fieldSession"
                ? parent.fieldSessionId
                : parent.locationId
        }
      />
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
          <CampoNumerico id={`consumption-quantity-${parent.kind}`} name="quantity" inputMode="decimal" step="0.001" />
        </div>
        <div className="nn-field" style={{ flex: "1 1 80px" }}>
          <label htmlFor={`consumption-unit-${parent.kind}`}>{t("unitLabel")}</label>
          <input id={`consumption-unit-${parent.kind}`} name="unit" type="text" defaultValue="kg" />
        </div>
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <BotonDeEnvio className="nn-button">
        {t("recordConsumptionButton")}
      </BotonDeEnvio>
    </form>
  );
}
