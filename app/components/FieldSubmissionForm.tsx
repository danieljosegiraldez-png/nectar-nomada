"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createFieldSubmissionAction, type PartnerActionState } from "../actions/partner";

const initialState: PartnerActionState = {};

export function FieldSubmissionForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createFieldSubmissionAction, initialState);
  const t = useTranslations("Partner");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480, marginTop: "1rem" }}>
      <input type="hidden" name="projectId" value={projectId} />
      <div className="nn-field">
        <label htmlFor="title">{t("submissionTitleLabel")}</label>
        <input id="title" name="title" type="text" required />
      </div>
      <div className="nn-field">
        <label htmlFor="notes">{t("submissionNotesLabel")}</label>
        <textarea id="notes" name="notes" rows={4} required />
      </div>
      {state.error ? <p className="nn-error">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("submitButton")}
      </button>
    </form>
  );
}
