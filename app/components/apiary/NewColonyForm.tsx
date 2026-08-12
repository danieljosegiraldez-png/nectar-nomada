"use client";

import { useTranslations } from "next-intl";
import { createColonyFormAction } from "../../actions/apiary";

const ORIGIN_TYPES = ["purchased", "captured", "split", "other"] as const;

/** Online-only — same reasoning as NewHiveForm. */
export function NewColonyForm({ apiaryId, hiveId }: { apiaryId: string; hiveId: string }) {
  const t = useTranslations("Apiary");

  return (
    <form action={createColonyFormAction} className="nn-form" style={{ maxWidth: 420 }}>
      <input type="hidden" name="apiaryId" value={apiaryId} />
      <input type="hidden" name="hiveId" value={hiveId} />
      <div className="nn-field">
        <label htmlFor="colony-origin-type">{t("originTypeLabel")}</label>
        <select id="colony-origin-type" name="originType" defaultValue="purchased" required>
          {ORIGIN_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`originType_${type}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="colony-origin-note">{t("originNoteLabel")}</label>
        <input id="colony-origin-note" name="originNote" type="text" placeholder={t("originNotePlaceholder")} />
      </div>
      <button type="submit" className="nn-button">
        {t("createColonyButton")}
      </button>
    </form>
  );
}
