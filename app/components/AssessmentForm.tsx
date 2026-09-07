"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { submitAssessmentAction, type SensoryActionState } from "../actions/sensory";
import { FORMULA_CVA_AFECTIVO, TAZAS_MAX } from "../../lib/sensory/puntajeCva";

interface AttributeOption {
  id: string;
  name: string;
  scaleMin: number;
  scaleMax: number;
}

const initialState: SensoryActionState = {};

/** 1…n, para los desplegables de escala y de tazas. */
function rango(desde: number, hasta: number): number[] {
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
}

export function AssessmentForm({
  sessionId,
  blindSampleId,
  scoreMin,
  scoreMax,
  scoreFormula,
  attributes,
}: {
  sessionId: string;
  blindSampleId: string;
  scoreMin: number;
  scoreMax: number;
  /** Null = el total lo teclea quien cata. Ver lib/sensory/puntajeCva.ts. */
  scoreFormula: string | null;
  attributes: AttributeOption[];
}) {
  const [state, formAction, pending] = useActionState(submitAssessmentAction, initialState);
  const t = useTranslations("Sensory");

  // Bajo un protocolo que calcula el total, pedirlo además sería pedir dos
  // veces lo mismo y dejar que las dos respuestas se contradigan.
  const totalCalculado = scoreFormula !== null;
  const esCva = scoreFormula === FORMULA_CVA_AFECTIVO;

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 420 }}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="blindSampleId" value={blindSampleId} />

      {totalCalculado ? (
        <p className="nn-muted">{t("scoreComputedHint")}</p>
      ) : (
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
      )}

      {attributes.map((attribute) => (
        <div className="nn-field" key={attribute.id}>
          <input type="hidden" name="attributeId" value={attribute.id} />
          <label htmlFor={`attr-${blindSampleId}-${attribute.id}`}>
            {attribute.name} ({attribute.scaleMin}–{attribute.scaleMax})
          </label>
          {esCva ? (
            // Un desplegable y no un número: la escala afectiva del CVA es de
            // nueve peldaños con nombre, no un continuo, y `step="0.25"` sobre
            // ella invita a un 7,25 que el estándar no define.
            <select id={`attr-${blindSampleId}-${attribute.id}`} name={`attr_${attribute.id}`} defaultValue="">
              <option value="">—</option>
              {rango(attribute.scaleMin, attribute.scaleMax).map((v) => (
                <option key={v} value={v}>
                  {v} · {t(`cvaScale_${v}` as "cvaScale_1")}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`attr-${blindSampleId}-${attribute.id}`}
              name={`attr_${attribute.id}`}
              type="number" inputMode="decimal"
              step="0.25"
              min={attribute.scaleMin}
              max={attribute.scaleMax}
            />
          )}
        </div>
      ))}

      {esCva ? (
        <>
          {(
            [
              ["nonUniformCups", t("nonUniformCupsLabel")],
              ["defectiveCups", t("defectiveCupsLabel")],
            ] as const
          ).map(([name, etiqueta]) => (
            <div className="nn-field" key={name}>
              <label htmlFor={`${name}-${blindSampleId}`}>{etiqueta}</label>
              <select id={`${name}-${blindSampleId}`} name={name} defaultValue="0">
                {rango(0, TAZAS_MAX).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </>
      ) : null}

      <div className="nn-field">
        <label htmlFor={`comment-${blindSampleId}`}>{t("commentLabel")}</label>
        <textarea id={`comment-${blindSampleId}`} name="comment" rows={3} />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}

      <button type="submit" className="nn-button" disabled={pending}>
        {t("submitAssessmentButton")}
      </button>
    </form>
  );
}
