"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CampoNumerico } from "../CampoNumerico";
import { anotarGastoDeVisitaFormAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

/**
 * **Anotar lo gastado en una visita** —aserrín y hojas para el ahumador, un encendedor, una lija—.
 * Lo pidió Daniel el 2026-09-17 contando una visita real; el padre `fieldSession` existía en el
 * servicio y ninguna pantalla lo escribía (ADR-200, defectos que se arreglan sin preguntar).
 *
 * **La unidad es texto libre y no trae nada puesto**: un encendedor o una lija se cuentan en piezas,
 * que la lista de la alimentación no tiene, y un «kg» precargado es justo el defecto que la lista
 * cerrada de la alimentación vino a quitar. Con cantidad, la acción la exige.
 *
 * La clave de envío la genera la página en cada pintado: tras guardar, `revalidatePath` vuelve a
 * pintar la página y trae una nueva, así que anotar dos gastos seguidos son dos filas, y dos toques
 * del mismo botón, una.
 */
export function GastoDeVisitaForm({ fieldSessionId, claveDeEnvio }: { fieldSessionId: string; claveDeEnvio: string }) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(anotarGastoDeVisitaFormAction, initialState);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="fieldSessionId" value={fieldSessionId} />
      <input type="hidden" name="claveDeEnvio" value={claveDeEnvio} />
      <div className="nn-field">
        <label htmlFor="gasto-material">{t("gastoMaterialLabel")}</label>
        <input id="gasto-material" name="materialName" type="text" required />
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div className="nn-field" style={{ flex: 1 }}>
          <label htmlFor="gasto-cantidad">{t("gastoCantidadLabel")}</label>
          <CampoNumerico id="gasto-cantidad" name="quantity" step="0.001" min="0" inputMode="decimal" />
        </div>
        <div className="nn-field" style={{ flex: 1 }}>
          <label htmlFor="gasto-unidad">{t("gastoUnidadLabel")}</label>
          <input id="gasto-unidad" name="unit" type="text" />
        </div>
      </div>
      <div className="nn-field">
        <label htmlFor="gasto-envase">{t("gastoEnvaseLabel")}</label>
        <input id="gasto-envase" name="batchLabel" type="text" required />
        <p className="nn-detail-meta">{t("gastoEnvaseAyuda")}</p>
      </div>
      <div className="nn-field">
        <label htmlFor="gasto-nota">{t("gastoNotaLabel")}</label>
        <input id="gasto-nota" name="notes" type="text" />
      </div>
      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("gastoBoton")}
      </button>
    </form>
  );
}
