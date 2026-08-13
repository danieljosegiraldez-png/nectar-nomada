"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { recordLabourEntryFormAction } from "../../actions/traceability";
import type { LabourEntryParent } from "../../../lib/traceability/operations";

interface ObserverOption {
  id: string;
  displayName: string;
}
interface OrganizationOption {
  id: string;
  name: string;
}

/**
 * T12.6 (docs/implementation/20_CAPTURE_OR_LOSE_IT_REPORT.md §3). Golden
 * path: tap People, type a number; tap Hours, type a number; tap Record —
 * two field-taps and one submit-tap. Task note and "Reported by" are left
 * at their defaults (blank; self). Always optional to open — never
 * blocks the form it sits alongside (startFermentationAction,
 * endFermentationFormAction, etc.).
 */
export function LabourEntryForm({
  lotId,
  parent,
  observers,
  selfPersonId,
  organizations,
}: {
  lotId: string;
  parent: LabourEntryParent;
  observers: ObserverOption[];
  selfPersonId: string | null;
  organizations: OrganizationOption[];
}) {
  const t = useTranslations("Traceability");
  const [showInKind, setShowInKind] = useState(false);

  return (
    <form action={recordLabourEntryFormAction} className="nn-form" style={{ maxWidth: 420, marginTop: "0.5rem" }}>
      <input type="hidden" name="lotId" value={lotId} />
      <input type="hidden" name="parentKind" value={parent.kind} />
      <input
        type="hidden"
        name="parentId"
        value={
          parent.kind === "harvestEvent"
            ? parent.harvestEventId
            : parent.kind === "receivingEvent"
              ? parent.receivingEventId
              : parent.kind === "fermentationRun"
                ? parent.fermentationRunId
                : parent.kind === "dryingRun"
                  ? parent.dryingRunId
                  : parent.locationId
        }
      />
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <div className="nn-field" style={{ flex: "1 1 100px" }}>
          <label htmlFor={`labour-workers-${parent.kind}`}>{t("workerCountLabel")}</label>
          <input id={`labour-workers-${parent.kind}`} name="workerCount" type="number" inputMode="numeric" min={1} step={1} required />
        </div>
        <div className="nn-field" style={{ flex: "1 1 100px" }}>
          <label htmlFor={`labour-hours-${parent.kind}`}>{t("hoursLabel")}</label>
          <input id={`labour-hours-${parent.kind}`} name="hours" type="number" inputMode="decimal" min={0.25} step={0.25} required />
        </div>
      </div>
      <div className="nn-field">
        <label htmlFor={`labour-task-${parent.kind}`}>{t("taskNoteLabel")}</label>
        <input id={`labour-task-${parent.kind}`} name="taskNote" type="text" placeholder={t("taskNotePlaceholder")} />
      </div>
      {observers.length > 0 ? (
        <div className="nn-field">
          <label htmlFor={`labour-observer-${parent.kind}`}>{t("reportedByLabel")}</label>
          <select id={`labour-observer-${parent.kind}`} name="operatorPersonId" defaultValue={selfPersonId ?? ""}>
            {observers.map((person) => (
              <option key={person.id} value={person.id}>
                {person.id === selfPersonId ? t("observerSelfOption", { name: person.displayName }) : person.displayName}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="nn-field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
        <input
          id={`labour-inkind-toggle-${parent.kind}`}
          type="checkbox"
          style={{ width: "auto" }}
          checked={showInKind}
          onChange={(e) => setShowInKind(e.target.checked)}
        />
        <label htmlFor={`labour-inkind-toggle-${parent.kind}`} style={{ margin: 0 }}>
          {t("providedInKindToggle")}
        </label>
      </div>
      {showInKind && organizations.length > 0 ? (
        <div className="nn-field">
          <label htmlFor={`labour-org-${parent.kind}`}>{t("providedByOrganizationLabel")}</label>
          <select id={`labour-org-${parent.kind}`} name="providedByOrganizationId" defaultValue="">
            <option value="" disabled>
              {t("providedByOrganizationPlaceholder")}
            </option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <button type="submit" className="nn-button">
        {t("recordLabourButton")}
      </button>
    </form>
  );
}
