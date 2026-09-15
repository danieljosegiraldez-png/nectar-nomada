"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { aplicarManejoEnLoteFormAction } from "../../actions/apiary";
// De los módulos PUROS: importar `colonyEvents.ts` arrastraría `prisma` —y `pg`— al paquete
// del navegador. Lo vigila `cliente-sin-prisma`.
import { METODOS_DE_ALIMENTACION } from "../../../lib/apiary/alimentacion";
import { OBJETIVOS_DE_TRATAMIENTO, VIAS_DE_TRATAMIENTO } from "../../../lib/apiary/vocabularioDeTratamiento";
import { Ayuda } from "./Ayuda";
import { BotonDeEnvio } from "../BotonDeEnvio";

export interface ColmenaDelLote {
  hiveId: string;
  identifier: string;
  /** La colonia viva de esa caja. `null` = caja sin abejas: no puede recibir nada. */
  colonyId: string | null;
}

/**
 * Aplicar el mismo manejo a varias colmenas de una vez — ADR-136.
 *
 * **Lo pidió el dueño así:** *«poder seleccionar todas las colmenas para aplicar que se hizo
 * algo que hice igual a todas, y no tener que hacer siempre una por una»*. Es el principio
 * que el Anexo E §8 ya había escrito para el traslado —*«selección múltiple con atajos,
 * porque nadie toca veinte casillas con guante»*— aplicado al manejo del día.
 *
 * **Sólo alimentación y tratamiento, y la línea la traza el esquema:** los dos son
 * `original_record` —algo que hiciste—, mientras la observación al paso es
 * `direct_observation`. Diez registros de una acción son diez hechos ciertos; diez
 * observaciones sacadas de una mirada, no. La inspección no aparece aquí por lo mismo: el
 * Anexo la marca «(por colmena)».
 *
 * **Las cajas sin colonia se ven y no se pueden marcar.** Esconderlas diría que el apiario
 * tiene menos cajas de las que tiene; dejarlas marcables dejaría alimentar madera. Son doce
 * de las veintiocho reales, entre Finca Rosina y Toabré Finca 1.
 *
 * **El conteo de lo seleccionado se enseña antes de confirmar**, igual que el traslado: es
 * el único control contra aplicar a nueve creyendo que fueron diez.
 */
export function ManejoEnLoteForm({ apiaryId, colmenas, hoy }: { apiaryId: string; colmenas: ColmenaDelLote[]; hoy: string }) {
  const t = useTranslations("Apiary");
  const pobladas = colmenas.filter((c) => c.colonyId !== null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [tipo, setTipo] = useState<"feeding" | "treatment">("feeding");

  function alternar(id: string) {
    setSeleccion((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <form action={aplicarManejoEnLoteFormAction} className="nn-form">
      <input type="hidden" name="apiaryId" value={apiaryId} />

      <fieldset>
        <legend>{t("loteColmenasLegend")}</legend>
        <div className="nn-atajos">
          <button
            type="button"
            className="nn-link-button"
            onClick={() => setSeleccion(pobladas.map((c) => c.colonyId!))}
          >
            {t("loteTodasLasPobladas", { count: pobladas.length })}
          </button>
          <button type="button" className="nn-link-button" onClick={() => setSeleccion([])}>
            {t("loteNinguna")}
          </button>
        </div>
        <ul className="nn-seleccion">
          {colmenas.map((c) => (
            <li key={c.hiveId}>
              <label htmlFor={`lote-${c.hiveId}`}>
                <input
                  id={`lote-${c.hiveId}`}
                  type="checkbox"
                  name="colonyIds"
                  value={c.colonyId ?? ""}
                  disabled={c.colonyId === null}
                  checked={c.colonyId !== null && seleccion.includes(c.colonyId)}
                  onChange={() => c.colonyId && alternar(c.colonyId)}
                />{" "}
                {c.identifier}
                {c.colonyId === null ? ` · ${t("loteSinColonia")}` : ""}
              </label>
            </li>
          ))}
        </ul>
        {/* El control contra aplicar a nueve creyendo que fueron diez. */}
        <p className="nn-detail-meta">{t("loteSeleccionadas", { count: seleccion.length })}</p>
      </fieldset>

      <div className="nn-field">
        <label htmlFor="lote-tipo">{t("loteTipoLabel")}</label>
        <select
          id="lote-tipo"
          name="eventType"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as "feeding" | "treatment")}
          required
        >
          <option value="feeding">{t("colonyEventType_feeding")}</option>
          <option value="treatment">{t("colonyEventType_treatment")}</option>
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="lote-fecha">{t("loteFechaLabel")}</label>
        <input id="lote-fecha" type="date" name="occurredAt" defaultValue={hoy} required />
      </div>

      {tipo === "feeding" ? (
        <>
          <div className="nn-field">
            <label htmlFor="lote-material">{t("feedingMaterialLabel")}</label>
            <input id="lote-material" name="feedingMaterial" type="text" />
          </div>
          <div className="nn-field">
            <label htmlFor="lote-cantidad">{t("feedingQuantityLabel")}</label>
            <input id="lote-cantidad" name="feedingQuantity" type="number" step="0.001" min="0" inputMode="decimal" />
          </div>
          <div className="nn-field">
            <label htmlFor="lote-unidad">{t("unitLabel")}</label>
            <input id="lote-unidad" name="feedingUnit" type="text" />
          </div>
          <div className="nn-field">
            <label htmlFor="lote-metodo">{t("feedingMethodLabel")}</label>
            <select id="lote-metodo" name="feedingMethod" defaultValue="">
              <option value="" disabled />
              {METODOS_DE_ALIMENTACION.map((m) => (
                <option key={m} value={m}>
                  {t(`feedingMethod_${m}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="nn-field">
            <label htmlFor="lote-cobertura">{t("coverageUntilLabel")}</label>
            {/* La razón de que el lote sea MÁS correcto que una por una: esta fecha dispara
                el aviso de la próxima visita, y tecleada diez veces se desvía. */}
            <input id="lote-cobertura" type="date" name="coverageUntil" />
            <Ayuda resumen={t("coverageUntilLabel")}>{t("loteCoberturaAyuda")}</Ayuda>
          </div>
        </>
      ) : (
        <>
          <div className="nn-field">
            <label htmlFor="lote-producto">{t("treatmentProductLabel")}</label>
            <input id="lote-producto" name="treatmentProduct" type="text" />
          </div>
          <div className="nn-field">
            <label htmlFor="lote-etiqueta">{t("treatmentBatchLabelLabel")}</label>
            <input id="lote-etiqueta" name="treatmentBatchLabel" type="text" required />
          </div>
          <div className="nn-field">
            <label htmlFor="lote-objetivo">{t("treatmentTargetLabel")}</label>
            <select id="lote-objetivo" name="treatmentTarget" defaultValue="" required>
              <option value="" disabled />
              {OBJETIVOS_DE_TRATAMIENTO.map((o) => (
                <option key={o} value={o}>
                  {t(`treatmentTarget_${o}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="nn-field">
            <label htmlFor="lote-via">{t("treatmentRouteLabel")}</label>
            <select id="lote-via" name="treatmentRoute" defaultValue="">
              <option value="" disabled />
              {VIAS_DE_TRATAMIENTO.map((v) => (
                <option key={v} value={v}>
                  {t(`treatmentRoute_${v}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="nn-field">
            <label htmlFor="lote-carencia">{t("treatmentWithdrawalDaysLabel")}</label>
            {/* Obligatoria, y cero es legítimo: hay productos sin carencia. */}
            <input id="lote-carencia" name="treatmentWithdrawalDays" type="number" step="1" min="0" required />
          </div>
          <div className="nn-field">
            <label htmlFor="lote-dosis">{t("treatmentDoseLabel")}</label>
            <input id="lote-dosis" name="treatmentDose" type="number" step="0.001" min="0" inputMode="decimal" />
          </div>
          <div className="nn-field">
            <label htmlFor="lote-dosis-unidad">{t("unitLabel")}</label>
            <input id="lote-dosis-unidad" name="treatmentDoseUnit" type="text" />
          </div>
        </>
      )}

      <div className="nn-field">
        <label htmlFor="lote-nota">{t("noteLabel")}</label>
        <textarea id="lote-nota" name="note" rows={2} />
      </div>

      <BotonDeEnvio disabled={seleccion.length === 0}>{t("loteAplicarBoton")}</BotonDeEnvio>
    </form>
  );
}
