"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordStorageMoveAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

interface Option {
  id: string;
  name: string;
}
interface LocationOption extends Option {
  organization: Option | null;
}

export function StorageForm({ lotId, locations }: { lotId: string; locations: LocationOption[] }) {
  const [state, formAction, pending] = useActionState(recordStorageMoveAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="s-locationId">{t("storageLocationLabel")}</label>
        <select id="s-locationId" name="locationId" required>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.organization ? `${loc.name} (${loc.organization.name})` : loc.name}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="s-containerNote">{t("containerNoteLabel")}</label>
        <input id="s-containerNote" name="containerNote" type="text" placeholder="Bag #14" />
      </div>
      {state.error ? <p className="nn-error">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("moveStorageButton")}
      </button>
    </form>
  );
}
