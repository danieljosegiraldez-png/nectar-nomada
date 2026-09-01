"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { recordHarvestSourcesFormAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

export interface SourcePlotOption {
  id: string;
  name: string;
  /** Cohortes vivas de ese lote. Vacío es normal: un bloque puede no tener siembra registrada. */
  cohorts: ReadonlyArray<{ id: string; label: string }>;
}

interface Row {
  key: number;
  locationId: string;
  cohortId: string;
  weight: string;
}

const num = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * De qué bloques salió esta cosecha.
 *
 * Esto es lo que convierte una cohorte en rendimiento: sin estas filas, la
 * cereza de febrero es un lote sin vínculo con los árboles que la dieron, y
 * kg/ha queda fuera de alcance por mucha hectárea que se registre.
 *
 * **La reconciliación en vivo es el punto del diseño, no adorno.** Nadie pesa
 * cada bloque en una báscula calibrada antes de volcarlo en la misma tolva, así
 * que la diferencia contra el peso declarado casi nunca es cero — y el sistema
 * la *informa*, nunca la rechaza (P1 §5). Verla mientras se escribe es lo que
 * distingue «faltan 5 kg de redondeo» de «me olvidé un bloque entero».
 *
 * Las cohortes de cada lote se filtran al elegirlo, porque una cohorte de otro
 * bloque afirmaría que esos árboles aportaron cereza. El servicio también lo
 * rechaza; esto sólo evita que se pueda intentar.
 */
export function HarvestSourcesForm({
  lotId,
  harvestEventId,
  plots,
  declaredTotalKg,
  alreadyRecordedKg,
}: {
  lotId: string;
  harvestEventId: string;
  plots: ReadonlyArray<SourcePlotOption>;
  declaredTotalKg: number | null;
  /** Suma de los aportes ya guardados. Los nuevos se suman encima. */
  alreadyRecordedKg: number | null;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(recordHarvestSourcesFormAction, initialState);
  const [rows, setRows] = useState<Row[]>([
    { key: 0, locationId: "", cohortId: "", weight: "" },
    { key: 1, locationId: "", cohortId: "", weight: "" },
    { key: 2, locationId: "", cohortId: "", weight: "" },
  ]);
  const [nextKey, setNextKey] = useState(3);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const nuevoTotal = (alreadyRecordedKg ?? 0) + rows.reduce((sum, r) => sum + num(r.weight), 0);
  const hayPesos = rows.some((r) => r.weight.trim().length > 0) || alreadyRecordedKg != null;
  const diferencia = declaredTotalKg != null && hayPesos ? declaredTotalKg - nuevoTotal : null;

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="lotId" value={lotId} />
      <input type="hidden" name="harvestEventId" value={harvestEventId} />

      <p className="nn-muted">{t("harvestSourcesIntro")}</p>

      {rows.map((row, i) => {
        const plot = plots.find((p) => p.id === row.locationId);
        return (
          <div key={row.key} className="nn-field">
            <label htmlFor={`sourceLocation.${i}`}>{t("sourcePlotLabel", { n: i + 1 })}</label>
            <select
              id={`sourceLocation.${i}`}
              name={`sourceLocation.${i}`}
              value={row.locationId}
              // Cambiar de lote limpia la cohorte: la que estaba elegida
              // pertenece al lote anterior y ya no es válida aquí.
              onChange={(e) => update(row.key, { locationId: e.target.value, cohortId: "" })}
            >
              <option value="">{t("sourcePlotNone")}</option>
              {plots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {plot && plot.cohorts.length > 0 ? (
              <>
                <label htmlFor={`sourceCohort.${i}`}>{t("sourceCohortLabel")}</label>
                <select
                  id={`sourceCohort.${i}`}
                  name={`sourceCohort.${i}`}
                  value={row.cohortId}
                  onChange={(e) => update(row.key, { cohortId: e.target.value })}
                >
                  <option value="">{t("sourceCohortNone")}</option>
                  {plot.cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            <label htmlFor={`sourceWeight.${i}`}>{t("sourceWeightLabel")}</label>
            <input
              id={`sourceWeight.${i}`}
              type="number"
              name={`sourceWeight.${i}`}
              step="0.001"
              min="0"
              inputMode="decimal"
              value={row.weight}
              onChange={(e) => update(row.key, { weight: e.target.value })}
              placeholder={t("sourceWeightUnweighed")}
            />

            {/* Etiqueta real, no sólo `placeholder`: el marcador desaparece
                al escribir y un lector de pantalla no sabría qué fila es. */}
            <label htmlFor={`sourceNotes.${i}`}>{t("sourceNotesLabel", { n: i + 1 })}</label>
            <input id={`sourceNotes.${i}`} type="text" name={`sourceNotes.${i}`} />

            <button
              type="button"
              className="nn-button-secondary"
              onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
              disabled={rows.length === 1}
            >
              {t("harvestSourceRemoveRow")}
            </button>
          </div>
        );
      })}

      <button
        type="button"
        className="nn-button-secondary"
        onClick={() => {
          setRows((prev) => [...prev, { key: nextKey, locationId: "", cohortId: "", weight: "" }]);
          setNextKey((k) => k + 1);
        }}
      >
        {t("harvestSourceAddRow")}
      </button>

      {/*
        La reconciliación. Sólo aparece cuando hay un peso declarado con el que
        comparar: sin él no hay diferencia que mostrar, y un cero ahí se leería
        como «cuadra» en vez de «no se sabe».
      */}
      {declaredTotalKg != null ? (
        <p role="status" aria-live="polite" style={{ fontVariantNumeric: "tabular-nums" }}>
          {t("harvestSourcesDeclared", { kg: declaredTotalKg })}
          {/*
            Mientras no haya ni un peso escrito no se enseña un total, porque
            «sumado de los bloques: 0 kg» se lee como que los bloques aportaron
            cero — y lo que pasa es que todavía no se sabe. La misma distinción
            que el resto del sistema mantiene (ADR-080).
          */}
          {hayPesos ? (
            <>
              {" · "}
              {t("harvestSourcesFromBlocks", { kg: Number(nuevoTotal.toFixed(3)) })}
              {diferencia != null ? (
                <>
                  {" · "}
                  <strong>{t("harvestSourcesDifference", { kg: Number(diferencia.toFixed(3)) })}</strong>
                </>
              ) : null}
            </>
          ) : (
            <>
              {" · "}
              <span className="nn-muted">{t("harvestSourcesNothingWeighedYet")}</span>
            </>
          )}
        </p>
      ) : (
        <p className="nn-muted">{t("harvestSourcesNoDeclaredWeight")}</p>
      )}

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("recordHarvestSourcesButton")}
      </button>
    </form>
  );
}
