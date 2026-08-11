"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordReceivingAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

interface Option {
  id: string;
  name: string;
}
interface LocationOption extends Option {
  organization: Option | null;
}

export function ReceivingForm({
  organizations,
  locations,
  projects,
}: {
  organizations: Option[];
  locations: LocationOption[];
  projects: Option[];
}) {
  const [state, formAction, pending] = useActionState(recordReceivingAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <div className="nn-field">
        <label htmlFor="r-lotCode">{t("lotCodeLabel")}</label>
        <input id="r-lotCode" name="lotCode" type="text" required />
      </div>
      <div className="nn-field">
        <label htmlFor="r-organizationId">{t("supplierLabel")}</label>
        <select id="r-organizationId" name="organizationId" required>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="r-locationId">{t("receivedAtLocationLabel")}</label>
        <select id="r-locationId" name="locationId" defaultValue="">
          <option value="">{t("noneOption")}</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.organization ? `${loc.name} (${loc.organization.name})` : loc.name}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="r-projectId">{t("projectLabel")}</label>
        <select id="r-projectId" name="projectId" defaultValue="">
          <option value="">{t("noneOption")}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="r-receivedAt">{t("receivedAtLabel")}</label>
        <input id="r-receivedAt" name="receivedAt" type="datetime-local" required />
      </div>
      <div className="nn-field">
        <label htmlFor="r-deliveryNote">{t("deliveryNoteLabel")}</label>
        <input id="r-deliveryNote" name="deliveryNote" type="text" />
      </div>
      <div className="nn-field">
        <label htmlFor="r-cherryWeightKg">{t("cherryWeightLabel")}</label>
        <input id="r-cherryWeightKg" name="cherryWeightKg" type="number" step="0.001" />
      </div>
      <div className="nn-field">
        <label htmlFor="r-condition">{t("conditionLabel")}</label>
        <input id="r-condition" name="condition" type="text" />
      </div>
      <div className="nn-field">
        <label htmlFor="r-notes">{t("notesLabel")}</label>
        <textarea id="r-notes" name="notes" rows={2} />
      </div>
      {state.error ? <p className="nn-error">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("recordReceivingButton")}
      </button>
    </form>
  );
}
