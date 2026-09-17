"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updatePlotAttributesAction, type TraceabilityActionState } from "../../actions/traceability";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";

const initialState: TraceabilityActionState = {};

const SUN_EXPOSURES = ["full_sun", "morning", "afternoon", "both"] as const;
const SHADE_BRACKETS = ["pct_20", "pct_30", "pct_50", "pct_70", "pct_90"] as const;
// S1 §2 — rosa de los vientos, más las dos salidas que un terreno real
// necesita: `flat` (sin pendiente, así que sin orientación) y `variable`
// (varias dentro del mismo bloque). Van al final, después de los ocho
// rumbos, porque no son direcciones.
const ASPECTS = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
  "flat",
  "variable",
] as const;

export interface PlotAttributes {
  areaHectares: string | null;
  plantSpacingMeters: string | null;
  altitudeMinM: number | null;
  altitudeMaxM: number | null;
  sunExposure: string | null;
  shadePercentage: string | null;
  slopeDescription: string | null;
  aspect: string | null;
  soilType: string | null;
}

/**
 * Editing a block's ground conditions.
 *
 * Every field is optional and starts blank when nothing is recorded. A
 * producer knows their hectares long before anyone measures a slope, and
 * being made to fill eight boxes to record one is how a form like this ends
 * up unused.
 *
 * **Blank means "not recorded", never zero.** The action sends `null` for an
 * empty box, and `defaultValue` echoes back exactly what is stored, so an
 * unmeasured area stays empty rather than showing `0` — which the density
 * calculation would read as a non-positive area instead of a missing one.
 * Those are different facts (ADR-080).
 *
 * Numeric inputs are typed as numbers so a phone raises a numeric keypad,
 * which is where this actually gets filled in.
 */
export function PlotAttributesForm({
  locationId,
  attributes,
}: {
  locationId: string;
  attributes: PlotAttributes;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(updatePlotAttributesAction, initialState);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      <p className="nn-muted">{t("plotAttributesIntro")}</p>

      <div className="nn-field">
        <label htmlFor="areaHectares">{t("areaLabel")}</label>
        <input
          id="areaHectares"
          type="number"
          name="areaHectares"
          step="0.0001"
          min="0"
          inputMode="decimal"
          defaultValue={attributes.areaHectares ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      <div className="nn-field">
        <label htmlFor="plantSpacingMeters">{t("spacingLabel")}</label>
        <input
          id="plantSpacingMeters"
          type="number"
          name="plantSpacingMeters"
          step="0.01"
          min="0"
          inputMode="decimal"
          defaultValue={attributes.plantSpacingMeters ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      <div className="nn-field">
        <label htmlFor="altitudeMinM">{t("altitudeMinLabel")}</label>
        <input
          id="altitudeMinM"
          type="number"
          name="altitudeMinM"
          step="1"
          inputMode="numeric"
          defaultValue={attributes.altitudeMinM ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      <div className="nn-field">
        <label htmlFor="altitudeMaxM">{t("altitudeMaxLabel")}</label>
        <input
          id="altitudeMaxM"
          type="number"
          name="altitudeMaxM"
          step="1"
          inputMode="numeric"
          defaultValue={attributes.altitudeMaxM ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      <div className="nn-field">
        <label htmlFor="sunExposure">{t("sunExposureLabel")}</label>
        <select id="sunExposure" name="sunExposure" defaultValue={attributes.sunExposure ?? ""}>
          <option value="">{t("notRecorded")}</option>
          {SUN_EXPOSURES.map((value) => (
            <option key={value} value={value}>
              {t(`sunExposure_${value}` as "sunExposure_full_sun")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="shadePercentage">{t("shadePercentageLabel")}</label>
        <select id="shadePercentage" name="shadePercentage" defaultValue={attributes.shadePercentage ?? ""}>
          <option value="">{t("notRecorded")}</option>
          {SHADE_BRACKETS.map((value) => (
            <option key={value} value={value}>
              {t(`shadePercentage_${value}` as "shadePercentage_pct_20")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="slopeDescription">{t("slopeLabel")}</label>
        <input
          id="slopeDescription"
          type="text"
          name="slopeDescription"
          defaultValue={attributes.slopeDescription ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      {/* Pegado a la pendiente, que es la otra mitad del mismo hecho. Y con
          «Sin registrar» como opción real: un lote cuya orientación nadie ha
          mirado no es un lote que mire al norte. */}
      <div className="nn-field">
        <label htmlFor="aspect">{t("aspectLabel")}</label>
        <select id="aspect" name="aspect" defaultValue={attributes.aspect ?? ""}>
          <option value="">{t("notRecorded")}</option>
          {ASPECTS.map((value) => (
            <option key={value} value={value}>
              {t(`aspect_${value}` as "aspect_north")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="soilType">{t("soilTypeLabel")}</label>
        <input
          id="soilType"
          type="text"
          name="soilType"
          defaultValue={attributes.soilType ?? ""}
          placeholder={t("notRecorded")}
        />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <BotonQueNecesitaConexion disabled={pending}>{t("savePlotAttributesButton")}</BotonQueNecesitaConexion>
    </form>
  );
}
