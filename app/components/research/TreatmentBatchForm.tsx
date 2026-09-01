"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createTreatmentBatchAction, type ResearchActionState } from "../../actions/research";
import { TimezoneOffsetField } from "../TimezoneOffsetField";

const initialState: ResearchActionState = {};

interface CatalogValueOption {
  id: string;
  value: string;
  impliesUnknownIdentity: boolean;
}
interface ProtocolVariable {
  id: string;
  name: string;
  valueType: string;
  unit: string | null;
  enumValues: string[];
  catalog: { values: CatalogValueOption[] } | null;
}
interface LotOption {
  id: string;
  lotCode: string;
}

const PROVENANCE_CLASSES = [
  "measured_fact",
  "original_record",
  "direct_observation",
  "scientific_evidence",
  "manufacturer_specification",
  "interpretation",
  "hypothesis",
];

const DATA_QUALITY_LEVELS = ["verified", "verified_with_limitation", "provisional", "unconfirmed"];

/**
 * §3a — a variable's valueType picks which input this row renders:
 * text/numeric/boolean (free), catalog (a select of that variable's
 * VariableCatalogValue rows — "Spontaneous Wild" surfaces a dataQuality
 * picker alongside it, per the schema's own no-silent-default rule), or
 * closed_enum (a select of the frozen enumValues the version declared).
 */
export function TreatmentBatchForm({
  protocolVersionId,
  variables,
  lots,
}: {
  protocolVersionId: string;
  variables: ProtocolVariable[];
  lots: LotOption[];
}) {
  const [state, formAction, pending] = useActionState(createTreatmentBatchAction, initialState);
  const t = useTranslations("Research");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 640 }}>
      <TimezoneOffsetField />
      <input type="hidden" name="protocolVersionId" value={protocolVersionId} />
      <div className="nn-field">
        <label htmlFor="batchLabel">{t("batchLabelLabel")}</label>
        <input id="batchLabel" name="batchLabel" type="text" required />
      </div>
      <div className="nn-field">
        <label htmlFor="lotId">{t("lotLabel")}</label>
        <select id="lotId" name="lotId" defaultValue="">
          <option value="">{t("noLotLabel")}</option>
          {lots.map((lot) => (
            <option key={lot.id} value={lot.id}>
              {lot.lotCode}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="startedAt">{t("startedAtLabel")}</label>
        <input id="startedAt" name="startedAt" type="datetime-local" required />
      </div>
      <div className="nn-field">
        <label htmlFor="provenanceClass">{t("provenanceClassLabel")}</label>
        <select id="provenanceClass" name="provenanceClass" defaultValue="measured_fact">
          {PROVENANCE_CLASSES.map((pc) => (
            <option key={pc} value={pc}>
              {pc}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="notes">{t("notesLabel")}</label>
        <textarea id="notes" name="notes" rows={2} />
      </div>

      <h3>{t("variablesHeading")}</h3>
      {variables.map((variable, i) => (
        <div key={variable.id} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <input type="hidden" name={`vv_id_${i}`} value={variable.id} />
          <input type="hidden" name={`vv_type_${i}`} value={variable.valueType} />
          <span style={{ flex: 1 }}>
            {variable.name}
            {variable.unit ? ` (${variable.unit})` : ""}
          </span>
          {variable.valueType === "boolean" ? (
            <select name={`vv_value_${i}`} defaultValue="" style={{ flex: 1 }}>
              <option value="">—</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : variable.valueType === "catalog" ? (
            <>
              <select name={`vv_value_${i}`} defaultValue="" style={{ flex: 1 }}>
                <option value="">—</option>
                {(variable.catalog?.values ?? []).map((cv) => (
                  <option key={cv.id} value={cv.id}>
                    {cv.value}
                    {cv.impliesUnknownIdentity ? " (origen desconocido)" : ""}
                  </option>
                ))}
              </select>
              <select name={`vv_data_quality_${i}`} defaultValue="" style={{ flex: 1 }}>
                <option value="">data quality —</option>
                {DATA_QUALITY_LEVELS.map((dq) => (
                  <option key={dq} value={dq}>
                    {dq}
                  </option>
                ))}
              </select>
            </>
          ) : variable.valueType === "closed_enum" ? (
            <select name={`vv_value_${i}`} defaultValue="" style={{ flex: 1 }}>
              <option value="">—</option>
              {variable.enumValues.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={`vv_value_${i}`}
              type={variable.valueType === "numeric" ? "number" : "text"}
              step={variable.valueType === "numeric" ? "any" : undefined}
              style={{ flex: 1 }}
            />
          )}
        </div>
      ))}

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("createTreatmentButton")}
      </button>
    </form>
  );
}
