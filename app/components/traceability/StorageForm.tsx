"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordStorageMoveAction, type TraceabilityActionState } from "../../actions/traceability";
import { ordenarParaAlmacenar } from "../../../lib/traceability/ordenarParaAlmacenar";

const initialState: TraceabilityActionState = {};

interface Option {
  id: string;
  name: string;
}
interface LocationOption extends Option {
  organization: Option | null;
  locationType: string;
}

export function StorageForm({
  lotId,
  locations,
  claveDeEnvio,
}: {
  lotId: string;
  locations: LocationOption[];
  // La genera el servidor al pintar la página, no el cliente: un `useState` con
  // `crypto.randomUUID()` daría un valor al renderizar en servidor y otro al
  // hidratar, que es un desajuste de hidratación.
  claveDeEnvio: string;
}) {
  const [state, formAction, pending] = useActionState(recordStorageMoveAction, initialState);
  const t = useTranslations("Traceability");
  const { bodegas, otros } = ordenarParaAlmacenar(locations);
  const opcion = (loc: LocationOption) => (
    <option key={loc.id} value={loc.id}>
      {loc.organization ? `${loc.name} (${loc.organization.name})` : loc.name}
    </option>
  );

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <input type="hidden" name="claveDeEnvio" value={claveDeEnvio} />
      <div className="nn-field">
        <label htmlFor="s-locationId">{t("storageLocationLabel")}</label>
        <select id="s-locationId" name="locationId" required>
          {bodegas.length ? <optgroup label={t("storageGroupBodegas")}>{bodegas.map(opcion)}</optgroup> : null}
          <optgroup label={t("storageGroupOtros")}>{otros.map(opcion)}</optgroup>
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="s-containerNote">{t("containerNoteLabel")}</label>
        <input id="s-containerNote" name="containerNote" type="text" placeholder="Bag #14" />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("moveStorageButton")}
      </button>
    </form>
  );
}
