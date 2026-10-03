"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CampoNumerico } from "../CampoNumerico";
import {
  guardarRangoDeMicroparcelaAction,
  type TraceabilityActionState,
} from "../../actions/traceability";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";

const initialState: TraceabilityActionState = {};

/**
 * Dónde está esta microparcela dentro de la numeración de su parcela (D3).
 *
 * **§6 del diseño del 2026-10-01, que lo pedía y nunca se construyó.** Y su ausencia no
 * era cosmética: la comparación con lo sembrado devuelve `sin_rango` para una microparcela
 * que no dice qué trozo ocupa —porque compararla contra la capacidad de su madre diría que
 * le faltan plantas por un suelo que no es suyo— y **ese estado no tenía salida**. El
 * sistema pedía un dato que ninguna pantalla podía dar.
 *
 * **Los cuatro juntos o ninguno**, que es el `CHECK` `location_rango_completo` de la base.
 * Vaciar los cuatro quita el rango; el servicio no toca lo que no se le manda, así que
 * guardar la rejilla de una parcela no borra el rango de nadie.
 *
 * **Vacío es «sin rango», nunca cero** (ADR-080): los campos arrancan en blanco cuando no
 * hay rango, y `defaultValue` devuelve exactamente lo guardado.
 */
export function RangoDeMicroparcelaForm({
  locationId,
  rango,
  rejillaDeLaMadre,
}: {
  locationId: string;
  rango: {
    rangeRowFrom: number | null;
    rangeRowTo: number | null;
    rangePlantFrom: number | null;
    rangePlantTo: number | null;
  };
  /** Para decir contra qué tablero se cuenta, sin que el operario tenga que buscarlo. */
  rejillaDeLaMadre: { rowCount: number; plantsPerRow: number };
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(guardarRangoDeMicroparcelaAction, initialState);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      <p className="nn-muted">
        {t("rangoMicroIntro", {
          filas: rejillaDeLaMadre.rowCount,
          columnas: rejillaDeLaMadre.plantsPerRow,
        })}
      </p>

      <div className="nn-field">
        <label htmlFor="rangeRowFrom">{t("rejillaDesdeHileraLabel")}</label>
        <CampoNumerico
          id="rangeRowFrom"
          name="rangeRowFrom"
          step="1"
          min="1"
          defaultValue={rango.rangeRowFrom ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      <div className="nn-field">
        <label htmlFor="rangeRowTo">{t("rejillaHastaHileraLabel")}</label>
        <CampoNumerico
          id="rangeRowTo"
          name="rangeRowTo"
          step="1"
          min="1"
          defaultValue={rango.rangeRowTo ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      <div className="nn-field">
        <label htmlFor="rangePlantFrom">{t("rejillaDesdePlantaLabel")}</label>
        <CampoNumerico
          id="rangePlantFrom"
          name="rangePlantFrom"
          step="1"
          min="1"
          defaultValue={rango.rangePlantFrom ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      <div className="nn-field">
        <label htmlFor="rangePlantTo">{t("rejillaHastaPlantaLabel")}</label>
        <CampoNumerico
          id="rangePlantTo"
          name="rangePlantTo"
          step="1"
          min="1"
          defaultValue={rango.rangePlantTo ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <BotonQueNecesitaConexion pending={pending}>{t("rangoMicroGuardarBoton")}</BotonQueNecesitaConexion>
    </form>
  );
}
