"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { activateProtocolVersionAction, type ResearchActionState } from "../../actions/research";

const initialState: ResearchActionState = {};

export function ActivateVersionForm({ protocolId, protocolVersionId }: { protocolId: string; protocolVersionId: string }) {
  const [state, formAction, pending] = useActionState(activateProtocolVersionAction, initialState);
  const t = useTranslations("Research");

  return (
    <form action={formAction} style={{ display: "inline" }}>
      <input type="hidden" name="protocolId" value={protocolId} />
      <input type="hidden" name="protocolVersionId" value={protocolVersionId} />
      {state.error ? <p className="nn-error">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending} style={{ fontSize: "0.85rem", padding: "0.25rem 0.6rem" }}>
        {t("activateButton")}
      </button>
    </form>
  );
}
