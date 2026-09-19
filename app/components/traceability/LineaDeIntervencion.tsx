"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { origenDeLaCarencia } from "../../../lib/traceability/origenDeLaCarencia";
import { soltarFocoConLaRueda } from "../CampoNumerico";

export interface ProductoOption {
  id: string;
  name: string;
  defaultWithdrawalDays: number | null;
  defaultReentryHours: number | null;
  safetyNotes: string | null;
  storageConditions: string | null;
  lotes: readonly { id: string; batchLabel: string; expiresAt: Date | null }[];
}

export interface ValoresDeLinea {
  materialId: string;
  consumableLotId: string | null;
  quantity: number | null;
  unit: string | null;
  withdrawalDays: number | null;
  reentryHours: number | null;
}

/**
 * Una línea de producto del formulario de intervención — Tarea 8, spec §5.
 * Partido de `IntervencionForm` porque el formulario entero es grande, no
 * porque haga falta reutilizarlo en otro sitio.
 *
 * **Al elegir un producto** enseña sus `safetyNotes`/`storageConditions` y
 * PRECARGA carencia y reentrada con los valores del producto — visibles y
 * editables, nunca escritos por el servidor (brief, Restricciones globales).
 * El `key={materialId}` de los dos campos numéricos fuerza el remonte: sin
 * él, `defaultValue` no se actualiza sola al cambiar de producto porque React
 * sólo la lee una vez.
 */
export function LineaDeIntervencion({
  indice,
  valores,
  productos,
}: {
  indice: number;
  valores: ValoresDeLinea;
  productos: readonly ProductoOption[];
}) {
  const t = useTranslations("Traceability");
  const [materialId, setMaterialId] = useState(valores.materialId);
  const producto = productos.find((p) => p.id === materialId) ?? null;
  const esElProductoOriginal = materialId === valores.materialId;
  const hoy = new Date();

  // Ronda de arreglos 1 (importante #1): el valor que el campo enseña de
  // verdad —el mismo que se le pasa como `defaultValue` más abajo—, no «el
  // producto tiene un default». Con el material sin cambiar, ese valor es el
  // YA DECLARADO en la línea, que puede diferir del default del producto.
  const valorMostradoDeCarencia = esElProductoOriginal ? (valores.withdrawalDays ?? null) : (producto?.defaultWithdrawalDays ?? null);
  const valorMostradoDeReentrada = esElProductoOriginal ? (valores.reentryHours ?? null) : (producto?.defaultReentryHours ?? null);
  const origenDeCarencia = producto
    ? origenDeLaCarencia(valorMostradoDeCarencia, producto.defaultWithdrawalDays, esElProductoOriginal)
    : null;
  const origenDeReentrada = producto
    ? origenDeLaCarencia(valorMostradoDeReentrada, producto.defaultReentryHours, esElProductoOriginal)
    : null;
  const rotuloDeOrigen = (origen: ReturnType<typeof origenDeLaCarencia> | null) => {
    if (origen === "del_producto") return t("manejoOriginFromProduct");
    if (origen === "indicada_al_registrar") return t("manejoOriginDeclaredAtEntry");
    return null;
  };

  return (
    <fieldset className="nn-card" style={{ marginBottom: "0.75rem" }}>
      <legend>{t("manejoLineNumber", { n: indice + 1 })}</legend>

      <div className="nn-field">
        <label htmlFor={`linea-${indice}-material`}>{t("manejoProductLabel")}</label>
        <select
          id={`linea-${indice}-material`}
          name={`lineas[${indice}].materialId`}
          required
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
        >
          <option value="" disabled>
            {t("manejoProductChoose")}
          </option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {producto?.safetyNotes ? (
        <p className="nn-detail-meta">
          <strong>{t("manejoSafetyNotesLabel")}:</strong> {producto.safetyNotes}
        </p>
      ) : null}
      {producto?.storageConditions ? (
        <p className="nn-detail-meta">
          {t("manejoStorageConditionsLabel")}: {producto.storageConditions}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <div className="nn-field" style={{ flex: "1 1 120px" }}>
          <label htmlFor={`linea-${indice}-quantity`}>{t("manejoQuantityLabel")}</label>
          <input
            id={`linea-${indice}-quantity`}
            name={`lineas[${indice}].quantity`}
            type="number"
            step="0.001"
            min={0}
            defaultValue={valores.quantity ?? ""}
            onWheel={soltarFocoConLaRueda}
          />
        </div>
        <div className="nn-field" style={{ flex: "1 1 100px" }}>
          <label htmlFor={`linea-${indice}-unit`}>{t("manejoUnitLabel")}</label>
          <input id={`linea-${indice}-unit`} name={`lineas[${indice}].unit`} type="text" defaultValue={valores.unit ?? ""} />
        </div>
      </div>

      {producto && producto.lotes.length > 0 ? (
        <div className="nn-field">
          <label htmlFor={`linea-${indice}-lote`}>{t("manejoLotLabel")}</label>
          <select id={`linea-${indice}-lote`} name={`lineas[${indice}].consumableLotId`} defaultValue={valores.consumableLotId ?? ""}>
            <option value="">{t("manejoLotNone")}</option>
            {producto.lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.batchLabel}
                {l.expiresAt && l.expiresAt < hoy ? ` — ${t("manejoLotExpired")}` : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <div className="nn-field" style={{ flex: "1 1 160px" }}>
          <label htmlFor={`linea-${indice}-withdrawal`}>
            {t("manejoWithdrawalLabel")}
            {rotuloDeOrigen(origenDeCarencia) ? <span className="nn-muted"> — {rotuloDeOrigen(origenDeCarencia)}</span> : null}
          </label>
          <input
            key={`withdrawal-${materialId}`}
            id={`linea-${indice}-withdrawal`}
            name={`lineas[${indice}].withdrawalDays`}
            type="number"
            step={1}
            min={0}
            defaultValue={valorMostradoDeCarencia ?? ""}
            placeholder={producto && producto.defaultWithdrawalDays == null ? t("manejoProductDoesNotDeclare") : undefined}
            onWheel={soltarFocoConLaRueda}
          />
        </div>
        <div className="nn-field" style={{ flex: "1 1 160px" }}>
          <label htmlFor={`linea-${indice}-reentry`}>
            {t("manejoReentryLabel")}
            {rotuloDeOrigen(origenDeReentrada) ? <span className="nn-muted"> — {rotuloDeOrigen(origenDeReentrada)}</span> : null}
          </label>
          <input
            key={`reentry-${materialId}`}
            id={`linea-${indice}-reentry`}
            name={`lineas[${indice}].reentryHours`}
            type="number"
            step={1}
            min={0}
            defaultValue={valorMostradoDeReentrada ?? ""}
            placeholder={producto && producto.defaultReentryHours == null ? t("manejoProductDoesNotDeclare") : undefined}
            onWheel={soltarFocoConLaRueda}
          />
        </div>
      </div>
    </fieldset>
  );
}
