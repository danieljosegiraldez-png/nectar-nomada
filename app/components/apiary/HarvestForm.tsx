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
export function HarvestForm({ colonyId }: { colonyId: string }) {
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
