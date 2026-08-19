"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordHarvestAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

interface Option {
  id: string;
  name: string;
}
interface LocationOption extends Option {
  organization: Option | null;
}

export function HarvestForm({
  organizations,
  locations,
  projects,
}: {
  organizations: Option[];
  locations: LocationOption[];
  projects: Option[];
}) {
  const [state, formAction, pending] = useActionState(recordHarvestAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <div className="nn-field">
        <label htmlFor="h-lotCode">{t("lotCodeLabel")}</label>
        <input id="h-lotCode" name="lotCode" type="text" required />
      </div>
      <div className="nn-field">
        <label htmlFor="h-organizationId">{t("organizationLabel")}</label>
        <select id="h-organizationId" name="organizationId" required>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="h-locationId">{t("plotLabel")}</label>
        <select id="h-locationId" name="locationId" required>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.organization ? `${loc.name} (${loc.organization.name})` : loc.name}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="h-projectId">{t("projectLabel")}</label>
        <select id="h-projectId" name="projectId" defaultValue="">
          <option value="">{t("noneOption")}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="h-harvestedAt">{t("harvestedAtLabel")}</label>
        <input id="h-harvestedAt" name="harvestedAt" type="datetime-local" required />
      </div>
      <div className="nn-field">
        <label htmlFor="h-cherryWeightKg">{t("cherryWeightLabel")}</label>
        <input id="h-cherryWeightKg" name="cherryWeightKg" type="number" inputMode="decimal" step="0.001" />
      </div>
      <div className="nn-field">
        <label htmlFor="h-brix">{t("brixLabel")}</label>
        <input id="h-brix" name="brix" type="number" inputMode="decimal" step="0.01" />
      </div>
      <div className="nn-field">
        <label htmlFor="h-condition">{t("conditionLabel")}</label>
        <input id="h-condition" name="condition" type="text" />
      </div>
      <div className="nn-field">
        <label htmlFor="h-notes">{t("notesLabel")}</label>
        <textarea id="h-notes" name="notes" rows={2} />
      </div>
      {state.error ? <p className="nn-error">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("recordHarvestButton")}
      </button>
    </form>
  );
}
