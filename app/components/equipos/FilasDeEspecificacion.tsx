"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CampoNumerico } from "../CampoNumerico";

/**
 * Filas de especificación del alta de un modelo instrumento (spec de
 * catálogos §3.1-3.2). Cada fila manda `spec_quantity_i`, `spec_unit_i` y
 * cuatro números con el mismo sufijo — leídos así por
 * `crearModeloFormAction` (app/actions/modelos.ts).
 *
 * **Sólo el número de filas es estado.** Los valores viven en el DOM del
 * propio `<form>`, como cualquier campo no controlado; añadir una fila no
 * puede perder lo que ya se escribió en las anteriores.
 */
export function FilasDeEspecificacion() {
  const t = useTranslations("Equipos");
  const [filas, setFilas] = useState(1);

  return (
    <div>
      {Array.from({ length: filas }, (_, i) => (
        <fieldset key={i} className="nn-field" style={{ marginBottom: "0.75rem" }}>
          <label>
            {t("specMagnitud")}
            <input type="text" name={`spec_quantity_${i}`} maxLength={40} />
          </label>
          <label>
            {t("specUnidad")}
            <input type="text" name={`spec_unit_${i}`} maxLength={12} />
          </label>
          <label>
            {t("specMin")}
            <CampoNumerico step="any" name={`spec_rangeMin_${i}`} />
          </label>
          <label>
            {t("specMax")}
            <CampoNumerico step="any" name={`spec_rangeMax_${i}`} />
          </label>
          <label>
            {t("specResolucion")}
            <CampoNumerico step="any" name={`spec_resolution_${i}`} />
          </label>
          <label>
            {t("specPrecision")}
            <CampoNumerico step="any" name={`spec_accuracyAbs_${i}`} />
          </label>
        </fieldset>
      ))}
      <button type="button" className="nn-button" onClick={() => setFilas((n) => n + 1)}>
        {t("specAnadir")}
      </button>
    </div>
  );
}
