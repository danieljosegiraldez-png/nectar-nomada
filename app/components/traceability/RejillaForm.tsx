"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CampoNumerico } from "../CampoNumerico";
import { guardarRejillaAction, type TraceabilityActionState } from "../../actions/traceability";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";

const initialState: TraceabilityActionState = {};

/**
 * Las cuatro esquinas desde las que se puede empezar a numerar. El catálogo es
 * el del enum `GridOrigin` y no una lista escrita a mano: si Daniel quiere otra,
 * es una línea del enum y su migración.
 */
const ORIGENES = ["noroeste", "noreste", "suroeste", "sureste"] as const;

/**
 * Numerar una parcela: desde qué esquina, cuántas hileras, cuántas plantas por
 * hilera y cuánto separan las hileras.
 *
 * **Los cuatro juntos o ninguno**, y eso no es capricho del formulario: el
 * `CHECK` de la base es `num_nonnulls(...) IN (0, 4)`. El servicio da el mensaje
 * antes de llegar ahí; aquí sólo se dice en la ayuda, para que nadie descubra la
 * regla chocándose con ella.
 *
 * **Vacío es «sin numerar», nunca cero.** Una parcela sin rejilla no es una
 * parcela de cero hileras — ADR-080 — y por eso los campos arrancan en blanco y
 * `defaultValue` devuelve exactamente lo guardado.
 *
 * Los números van en `<CampoNumerico>`: en Chrome, girar la rueda sobre un
 * `<input type="number">` con foco cambia su valor, y en un formulario de campo
 * eso convierte «no se midió» en otro número sin que nadie lo vea.
 */
export function RejillaForm({
  locationId,
  rejilla,
}: {
  locationId: string;
  rejilla: {
    gridOrigin: string | null;
    rowCount: number | null;
    plantsPerRow: number | null;
    rowSpacingMeters: string | null;
  };
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(guardarRejillaAction, initialState);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      <p className="nn-muted">{t("rejillaIntro")}</p>

      <div className="nn-field">
        <label htmlFor="gridOrigin">{t("rejillaOrigenLabel")}</label>
        <select id="gridOrigin" name="gridOrigin" defaultValue={rejilla.gridOrigin ?? ""}>
          <option value="">{t("notRecorded")}</option>
          {ORIGENES.map((o) => (
            <option key={o} value={o}>
              {t(`rejillaOrigen_${o}` as "rejillaOrigen_noroeste")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="rowCount">{t("rejillaHilerasLabel")}</label>
        <CampoNumerico
          id="rowCount"
          name="rowCount"
          step="1"
          min="1"
          defaultValue={rejilla.rowCount ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      <div className="nn-field">
        <label htmlFor="plantsPerRow">{t("rejillaPlantasPorHileraLabel")}</label>
        <CampoNumerico
          id="plantsPerRow"
          name="plantsPerRow"
          step="1"
          min="1"
          defaultValue={rejilla.plantsPerRow ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      <div className="nn-field">
        <label htmlFor="rowSpacingMeters">{t("rejillaSeparacionLabel")}</label>
        <CampoNumerico
          id="rowSpacingMeters"
          name="rowSpacingMeters"
          step="0.01"
          min="0"
          defaultValue={rejilla.rowSpacingMeters ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <BotonQueNecesitaConexion pending={pending}>{t("rejillaGuardarBoton")}</BotonQueNecesitaConexion>
    </form>
  );
}
