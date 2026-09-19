"use client";

import { CampoNumerico } from "../CampoNumerico";
import { useTranslations } from "next-intl";
import { recordApiaryHarvestFormAction } from "../../actions/apiary";
import { BotonDeEnvio } from "../BotonDeEnvio";

/**
 * A3's Harvest/extraction -> HoneyBatch UI. Online-only, same reasoning
 * as NewHiveForm/NewColonyForm — a harvest is a once-per-batch action,
 * not the high-frequency field write A0 was built for. On success the
 * server action redirects straight to /lots/[id] — the existing Lot
 * Detail page, reused verbatim (§2).
 */
export function HarvestForm({ colonyId, alzas = [] }: { colonyId: string; alzas?: { id: string; code: string }[] }) {
  const t = useTranslations("Apiary");

  return (
    <form action={recordApiaryHarvestFormAction} className="nn-form" style={{ maxWidth: 420 }}>
      <input type="hidden" name="colonyId" value={colonyId} />
      <div className="nn-field">
        <label htmlFor="harvest-lot-code">{t("lotCodeLabel")}</label>
        <input id="harvest-lot-code" name="lotCode" type="text" required />
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div className="nn-field" style={{ flex: 1 }}>
          <label htmlFor="harvest-weight">{t("extractedWeightKgLabel")}</label>
          <CampoNumerico id="harvest-weight" name="extractedWeightKg" inputMode="decimal" step="0.01" min="0" />
        </div>
        <div className="nn-field" style={{ flex: 1 }}>
          <label htmlFor="harvest-frames">{t("framesHarvestedLabel")}</label>
          <CampoNumerico id="harvest-frames" name="framesHarvested" inputMode="numeric" step="1" min="0" />
        </div>
      </div>
      {/* Spec 2026-09-18 §4.3 — sólo las alzas con marca que esta caja lleva hoy. */}
      {alzas.length > 0 ? (
        <fieldset className="nn-field">
          <legend>{t("alzasCosechadas")}</legend>
          <p className="nn-muted">{t("alzasCosechadasAyuda")}</p>
          {alzas.map((a) => (
            <label key={a.id} style={{ display: "block" }}>
              <input type="checkbox" name="hiveSuperIds" value={a.id} /> {a.code}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="nn-field">
        <label htmlFor="harvest-notes">{t("notesLabel")}</label>
        <textarea id="harvest-notes" name="notes" rows={2} />
      </div>
      <BotonDeEnvio className="nn-button">
        {t("recordHarvestButton")}
      </BotonDeEnvio>
    </form>
  );
}
