"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { recortarPorPrecision } from "../../../lib/time/recortarPorPrecision";
import {
  createPlantingCohortFormAction,
  updatePlantingCohortFormAction,
  type TraceabilityActionState,
} from "../../actions/traceability";
import { PROCEDENCIA_DE_SIEMBRA } from "../../../lib/traceability/procedencia";
import { queueFieldEvent } from "../../../lib/sync/offlineQueue";
import { construirPayloadDeSiembra } from "../../../lib/sync/parcelaPayload";

const initialState: TraceabilityActionState = {};

/**
 * El vocabulario de ADR-038 recortado a lo que puede ser una siembra. Los diez
 * valores completos incluyen hipótesis, conclusión y sugerencia de IA, que
 * pertenecen a otras capas y no a «cuántas matas hay en este bloque».
 */
const DATA_QUALITIES = ["verified", "provisional", "unconfirmed"] as const;
const PRECISIONS = ["year", "month", "date"] as const;

export interface CultivarOption {
  id: string;
  value: string;
  impliesUnknownIdentity: boolean;
}

export interface EditableCohort {
  id: string;
  cultivarValueId: string | null;
  plantCount: number | null;
  plantedAt: string | null;
  plantedPrecision: string | null;
  dataQuality: string | null;
  notes: string | null;
}

/**
 * Registrar una siembra, o corregir una ya registrada.
 *
 * Un solo componente para las dos cosas porque son el mismo formulario con un
 * campo de diferencia. Crear exige `provenanceClass` —de dónde sale el dato, sin
 * valor por defecto (ADR-038)— y corregir exige `reason`, porque «conté mal» y
 * «se murieron cuarenta matas» dejan la misma cifra en la columna y son hechos
 * distintos.
 *
 * **Corregir no es renovar.** Renovar declararía que esos árboles salieron del
 * suelo. Esto sólo arregla lo que estaba escrito, y el valor anterior queda en
 * `AuditEvent`, que es append-only.
 *
 * La fecha se pide con su precisión al lado. Un productor casi siempre sabe el
 * año y casi nunca el día; obligar a una fecha completa fabricaría el día, que
 * es justo el error que `plantedPrecision` existe para impedir.
 */
export function PlantingCohortForm({
  locationId,
  cultivars,
  cohort,
}: {
  locationId: string;
  cultivars: ReadonlyArray<CultivarOption>;
  /** Presente = corregir esta cohorte. Ausente = registrar una siembra nueva. */
  cohort?: EditableCohort;
}) {
  const t = useTranslations("Traceability");
  const editando = cohort != null;
  const [state, formAction, pending] = useActionState(
    editando ? updatePlantingCohortFormAction : createPlantingCohortFormAction,
    initialState,
  );
  const [encolado, setEncolado] = useState(false);
  const [errorLocal, setErrorLocal] = useState(false);
  const [precision, setPrecision] = useState(cohort?.plantedPrecision ?? "year");

  // El tipo de campo sigue a la precisión elegida, así que un año no ofrece
  // siquiera un selector de día.
  const inputType = precision === "date" ? "date" : precision === "month" ? "month" : "number";

  // **Controlado, no `defaultValue`.** Antes la fecha era un input no
  // controlado cuyo `defaultValue` se recalculaba desde la cohorte ORIGINAL
  // cada vez que cambiaba la precisión. Caso que lo rompía: el usuario cambia
  // 2019-05-12 por 2020-06-10, luego pasa la precisión a «mes», y el campo
  // volvía a 2019-05 — descartando lo que acababa de escribir, sin avisar.
  // Lo señaló una revisión independiente.
  const [fecha, setFecha] = useState(
    cohort?.plantedAt == null ? "" : recortarPorPrecision(cohort.plantedAt, cohort.plantedPrecision ?? "year"),
  );

  // Cambiar de precisión recorta lo ESCRITO, no lo original. Pasar de día a mes
  // pierde el día —es inevitable, la precisión menor no lo admite— pero
  // conserva el año y el mes que el usuario eligió.
  const cambiarPrecision = (nueva: string) => {
    setPrecision(nueva);
    setFecha((actual) => recortarPorPrecision(actual, nueva));
  };

  /**
   * P4 §11 — sólo la siembra NUEVA se encola sin señal. Corregir una cohorte
   * existente sigue el camino normal siempre: corregir sin señal exigiría
   * resolver conflictos que el spec deja fuera de alcance a propósito
   * (Task 5, CORRECCIÓN 3).
   */
  const alEnviar = async (e: React.FormEvent<HTMLFormElement>) => {
    if (editando) return; // corregir sigue el camino normal siempre
    if (typeof navigator !== "undefined" && navigator.onLine) return; // camino normal
    e.preventDefault();
    const form = e.currentTarget;
    try {
      await queueFieldEvent({ ...construirPayloadDeSiembra(new FormData(form), locationId) });
      form.reset();
      setEncolado(true);
      setErrorLocal(false);
    } catch {
      setEncolado(false);
      setErrorLocal(true);
    }
  };

  return (
    <form action={formAction} onSubmit={alEnviar} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      {editando ? <input type="hidden" name="cohortId" value={cohort.id} /> : null}

      <p className="nn-muted">{editando ? t("cohortEditIntro") : t("cohortCreateIntro")}</p>

      <div className="nn-field">
        <label htmlFor={`cultivarValueId-${cohort?.id ?? "new"}`}>{t("cultivarLabel")}</label>
        <select
          id={`cultivarValueId-${cohort?.id ?? "new"}`}
          name="cultivarValueId"
          defaultValue={cohort?.cultivarValueId ?? ""}
        >
          <option value="">{t("cultivarUnknownOption")}</option>
          {cultivars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.value}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`plantCount-${cohort?.id ?? "new"}`}>{t("plantCountLabel")}</label>
        <input
          id={`plantCount-${cohort?.id ?? "new"}`}
          type="number"
          name="plantCount"
          min="0"
          step="1"
          inputMode="numeric"
          defaultValue={cohort?.plantCount ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      <div className="nn-field">
        <label htmlFor={`plantedPrecision-${cohort?.id ?? "new"}`}>{t("plantedPrecisionLabel")}</label>
        <select
          id={`plantedPrecision-${cohort?.id ?? "new"}`}
          name="plantedPrecision"
          value={precision}
          onChange={(e) => cambiarPrecision(e.target.value)}
        >
          {PRECISIONS.map((p) => (
            <option key={p} value={p}>
              {t(`plantedPrecision_${p}` as "plantedPrecision_year")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`plantedAt-${cohort?.id ?? "new"}`}>{t("plantedLabel")}</label>
        <input
          id={`plantedAt-${cohort?.id ?? "new"}`}
          type={inputType}
          name="plantedAt"
          {...(inputType === "number" ? { min: 1900, max: 2200, step: 1, inputMode: "numeric" as const } : {})}
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          placeholder={t("plantedUnknown")}
        />
      </div>

      {!editando ? (
        <div className="nn-field">
          <label htmlFor="provenanceClass">{t("provenanceClassLabel")}</label>
          {/* Sin opción vacía y sin `defaultValue` implícito: ADR-038 dice que
              esto no tiene valor por defecto, así que la primera opción es una
              elección visible y no una que se cuela. */}
          <select id="provenanceClass" name="provenanceClass" required defaultValue="">
            <option value="" disabled>
              {t("provenanceClassChoose")}
            </option>
            {PROCEDENCIA_DE_SIEMBRA.map((p) => (
              <option key={p} value={p}>
                {t(`provenanceClass_${p}` as "provenanceClass_direct_observation")}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="nn-field">
        <label htmlFor={`dataQuality-${cohort?.id ?? "new"}`}>{t("dataQualityLabel")}</label>
        <select
          id={`dataQuality-${cohort?.id ?? "new"}`}
          name="dataQuality"
          defaultValue={cohort?.dataQuality ?? ""}
        >
          {/* Vacío es un estado real y el más común: «no hay motivo para
              dudarlo», que no es lo mismo que «verificado». */}
          <option value="">{t("dataQualityNone")}</option>
          {DATA_QUALITIES.map((q) => (
            <option key={q} value={q}>
              {t(`dataQuality_${q}` as "dataQuality_provisional")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`notes-${cohort?.id ?? "new"}`}>{t("notesLabel")}</label>
        <textarea id={`notes-${cohort?.id ?? "new"}`} name="notes" rows={2} defaultValue={cohort?.notes ?? ""} />
      </div>

      {editando ? (
        <div className="nn-field">
          <label htmlFor={`reason-${cohort.id}`}>{t("cohortReasonLabel")}</label>
          <input id={`reason-${cohort.id}`} type="text" name="reason" required placeholder={t("cohortReasonPlaceholder")} />
        </div>
      ) : null}

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {encolado ? (
        <p className="nn-note" role="status">
          {t("fieldEventQueuedOffline")}
        </p>
      ) : null}
      {errorLocal ? (
        <p className="nn-error" role="alert">
          {t("fieldEventQueueFailed")}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {editando ? t("cohortSaveEditButton") : t("cohortCreateButton")}
      </button>
    </form>
  );
}
