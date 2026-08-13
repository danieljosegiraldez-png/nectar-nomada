import type { Metadata } from "next";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { getCurrentUser } from "../lib/auth/session";
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
              <nav className="nn-nav-links">
                {user ? (
                  <>
                    <Link href="/my-nectar">{t("myNectar")}</Link>
                    <Link href="/partner">{t("partnerWorkspace")}</Link>
                    <Link href="/lots">{t("lots")}</Link>
                    <Link href="/plots">{t("plots")}</Link>
                    <Link href="/apiaries">{t("apiaries")}</Link>
                    <Link href="/research">{t("research")}</Link>
                    <Link href="/sensory">{t("sensory")}</Link>
                    <Link href="/ai">{t("ai")}</Link>
                    <Link href="/competitions">{t("competitions")}</Link>
                    <Link href="/calibration">{t("calibration")}</Link>
                    <form action={logoutAction}>
                      <button type="submit" className="nn-link-button">
                        {t("signOut")}
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <Link href="/login">{t("signIn")}</Link>
                    <Link href="/signup">{t("signUp")}</Link>
                  </>
                )}
                <LocaleSwitcher />
              </nav>
            </div>
          </header>
          <main className="nn-shell nn-main">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
