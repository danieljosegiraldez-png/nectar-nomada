"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { addProcessingStageAction, completeProcessingStageAction, type ResearchActionState } from "../../actions/research";

const initialState: ResearchActionState = {};

export function AddProcessingStageForm({ treatmentBatchId, nextSequenceOrder }: { treatmentBatchId: string; nextSequenceOrder: number }) {
  const [state, formAction, pending] = useActionState(addProcessingStageAction, initialState);
  const t = useTranslations("Research");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="treatmentBatchId" value={treatmentBatchId} />
      <input type="hidden" name="sequenceOrder" value={nextSequenceOrder} />
      <div className="nn-field">
        <label htmlFor="stageName">{t("stageNameLabel")}</label>
        <input id="stageName" name="name" type="text" required />
      </div>
      <div className="nn-field">
        <label htmlFor="stageStartedAt">{t("startedAtLabel")}</label>
        <input id="stageStartedAt" name="startedAt" type="datetime-local" required />
      </div>
      <div className="nn-field">
        <label htmlFor="stageNotes">{t("notesLabel")}</label>
        <textarea id="stageNotes" name="notes" rows={2} />
      </div>
      {state.error ? <p className="nn-error">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("addStageButton")}
      </button>
    </form>
  );
}

export function CompleteProcessingStageForm({ treatmentBatchId, processingStageId }: { treatmentBatchId: string; processingStageId: string }) {
  const [state, formAction, pending] = useActionState(completeProcessingStageAction, initialState);
  const t = useTranslations("Research");

  return (
    <form action={formAction} style={{ display: "inline" }}>
      <input type="hidden" name="treatmentBatchId" value={treatmentBatchId} />
      <input type="hidden" name="processingStageId" value={processingStageId} />
      {state.error ? <p className="nn-error">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending} style={{ fontSize: "0.85rem", padding: "0.25rem 0.6rem" }}>
        {t("completeStageButton")}
      </button>
    </form>
  );
}
