import type { Metadata } from "next";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { getCurrentUser } from "../lib/auth/session";
import { logoutAction } from "./actions/auth";
import { LocaleSwitcher } from "./components/LocaleSwitcher";

export const metadata: Metadata = {
  title: "Néctar Nómada",
  description: "Territory, agriculture, fermentation, research, and craft — one platform.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, locale, t] = await Promise.all([getCurrentUser(), getLocale(), getTranslations("Nav")]);

  return (
    <html lang={locale}>
      <body>
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
