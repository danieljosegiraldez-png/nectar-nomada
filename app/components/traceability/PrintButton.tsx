"use client";

import { useTranslations } from "next-intl";

/** T13: browser print-to-PDF is the whole mechanism (ADR-039) — no PDF generation library, no server-side rendering step. */
export function PrintButton() {
  const t = useTranslations("Traceability");
  return (
    <button type="button" className="nn-button" onClick={() => window.print()}>
      {t("printReportButton")}
    </button>
  );
}
