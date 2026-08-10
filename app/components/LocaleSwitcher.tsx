"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setLocaleAction } from "../actions/locale";
import { locales, type AppLocale } from "../../i18n/config";

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("LocaleSwitcher");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(next: AppLocale) {
    if (next === locale || isPending) return;
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  }

  return (
    <div className="nn-locale-switcher" aria-label={t("label")} role="group">
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          className={`nn-locale-option${l === locale ? " nn-locale-option-active" : ""}`}
          onClick={() => handleChange(l)}
          disabled={isPending}
          aria-pressed={l === locale}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
