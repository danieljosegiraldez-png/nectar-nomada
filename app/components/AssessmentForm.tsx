"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { submitAssessmentAction, type SensoryActionState } from "../actions/sensory";

interface AttributeOption {
  id: string;
  name: string;
  scaleMin: number;
  scaleMax: number;
}

const initialState: SensoryActionState = {};

export function AssessmentForm({
  sessionId,
  blindSampleId,
  scoreMin,
  scoreMax,
  attributes,
}: {
  sessionId: string;
  blindSampleId: string;
  scoreMin: number;
  scoreMax: number;
  attributes: AttributeOption[];
}) {
  const [state, formAction, pending] = useActionState(submitAssessmentAction, initialState);
  const t = useTranslations("Sensory");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 420 }}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="blindSampleId" value={blindSampleId} />

      <div className="nn-field">
        <label htmlFor={`overallScore-${blindSampleId}`}>{t("overallScoreLabel", { min: scoreMin, max: scoreMax })}</label>
        <input
          id={`overallScore-${blindSampleId}`}
          name="overallScore"
          type="number" inputMode="decimal"
          step="0.25"
          min={scoreMin}
          max={scoreMax}
        />
      </div>

      {attributes.map((attribute) => (
        <div className="nn-field" key={attribute.id}>
          <input type="hidden" name="attributeId" value={attribute.id} />
          <label htmlFor={`attr-${blindSampleId}-${attribute.id}`}>
            {attribute.name} ({attribute.scaleMin}–{attribute.scaleMax})
          </label>
          <input
            id={`attr-${blindSampleId}-${attribute.id}`}
            name={`attr_${attribute.id}`}
            type="number" inputMode="decimal"
            step="0.25"
            min={attribute.scaleMin}
            max={attribute.scaleMax}
          />
        </div>
      ))}

      <div className="nn-field">
        <label htmlFor={`comment-${blindSampleId}`}>{t("commentLabel")}</label>
        <textarea id={`comment-${blindSampleId}`} name="comment" rows={3} />
      </div>

      {state.error ? <p className="nn-error">{state.error}</p> : null}

      <button type="submit" className="nn-button" disabled={pending}>
        {t("submitAssessmentButton")}
      </button>
    </form>
  );
}
