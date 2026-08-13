"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createProtocolAction, type ResearchActionState } from "../../actions/research";
import { ProtocolVersionFields } from "./ProtocolVersionFields";

const initialState: ResearchActionState = {};

interface CatalogOption {
  id: string;
  key: string;
  name: string;
}

export function ProtocolForm({ catalogs }: { catalogs: CatalogOption[] }) {
  const [state, formAction, pending] = useActionState(createProtocolAction, initialState);
  const t = useTranslations("Research");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 640 }}>
      <div className="nn-field">
        <label htmlFor="name">{t("protocolNameLabel")}</label>
        <input id="name" name="name" type="text" required />
      </div>
      <div className="nn-field">
        <label htmlFor="externalIdentifier">{t("externalIdentifierLabel")}</label>
        <input id="externalIdentifier" name="externalIdentifier" type="text" placeholder="PE-89" />
        <p className="nn-muted" style={{ fontSize: "0.85rem" }}>{t("externalIdentifierHint")}</p>
      </div>
      <div className="nn-field">
        <label htmlFor="identifierConvention">{t("identifierConventionLabel")}</label>
        <input id="identifierConvention" name="identifierConvention" type="text" />
      </div>
      <div className="nn-field">
        <label htmlFor="description">{t("descriptionLabel")}</label>
        <textarea id="description" name="description" rows={3} />
      </div>

      <ProtocolVersionFields catalogs={catalogs} />

      {state.error ? <p className="nn-error">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("createProtocolButton")}
      </button>
    </form>
  );
}
