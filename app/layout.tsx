import type { Metadata } from "next";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { getCurrentUser } from "../lib/auth/session";
import { permissionKeysAnywhere } from "../lib/rbac/service";
import { buildNavigation } from "../lib/navigation";
import { logoutAction } from "./actions/auth";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Néctar Nómada",
  description: "Territory, agriculture, fermentation, research, and craft — one platform.",
  // A5.5 — lets the operator routes be added to the home screen.
  manifest: "/manifest.webmanifest",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, locale, t] = await Promise.all([getCurrentUser(), getLocale(), getTranslations("Nav")]);

  // S2 §4 — "ningún elemento visible que el usuario no pueda usar." The
  // permission set is resolved once here rather than per link; see
  // permissionKeysAnywhere for why navigation asks a deliberately wider
  // question than authorization does, and why it must never answer one.
  const navEntries = user ? buildNavigation(await permissionKeysAnywhere(user.userAccountId)) : [];

  return (
    <html lang={locale}>
      <body>
        <ServiceWorkerRegistration />
        <NextIntlClientProvider>
          <header className="nn-nav">
            <div className="nn-shell nn-nav-row">
              <Link href="/" className="nn-wordmark">
                {t("brand")}
              </Link>
              <nav className="nn-nav-links" aria-label={t("primaryNavLabel")}>
                {user ? (
                  navEntries.map((entry) => (
                    <Link key={entry.href} href={entry.href}>
                      {t(entry.labelKey as "myNectar")}
                    </Link>
                  ))
                ) : (
                  <>
                    <Link href="/login">{t("signIn")}</Link>
                    <Link href="/signup">{t("signUp")}</Link>
                  </>
                )}
              </nav>
              {/* S2 §4 — sign out does not compete for navigation space, and
                  neither does the locale switcher. Both are account controls,
                  so they sit beside the destinations rather than among them. */}
              <div className="nn-nav-account">
                <LocaleSwitcher />
                {user ? (
                  <form action={logoutAction}>
                    <button type="submit" className="nn-link-button">
                      {t("signOut")}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </header>
          <main className="nn-shell nn-main">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
