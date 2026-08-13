"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createProtocolVersionAction, type ResearchActionState } from "../../actions/research";
import { ProtocolVersionFields } from "./ProtocolVersionFields";

const initialState: ResearchActionState = {};

interface CatalogOption {
  id: string;
  key: string;
  name: string;
}

export function ProtocolVersionForm({ protocolId, catalogs }: { protocolId: string; catalogs: CatalogOption[] }) {
  const [state, formAction, pending] = useActionState(createProtocolVersionAction, initialState);
  const t = useTranslations("Research");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 640 }}>
      <input type="hidden" name="protocolId" value={protocolId} />
      <ProtocolVersionFields catalogs={catalogs} />
      {state.error ? <p className="nn-error">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("createVersionButton")}
      </button>
    </form>
  );
}
