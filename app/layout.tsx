import type { Metadata } from "next";
import { Bodoni_Moda, Archivo } from "next/font/google";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { getCurrentUser } from "../lib/auth/session";
import { permissionKeysAnywhere } from "../lib/rbac/service";
import { buildNavigation } from "../lib/navigation";
import { JornadaAbiertaBanner } from "./components/JornadaAbiertaBanner";
import { logoutAction } from "./actions/auth";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";
import { BotonDeEnvio } from "./components/BotonDeEnvio";

/**
 * Las dos familias de la marca, las mismas que sirve el sitio público
 * (`nectarnomada-web`). SIL OFL, y `next/font` las aloja en nuestro origen:
 * ninguna petición a fonts.googleapis.com en tiempo de ejecución.
 *
 * Bodoni Moda es un serif de alto contraste: va SOLO en encabezados. En texto
 * pequeño y al sol se lee peor que una grotesca, y este OS se usa en el campo.
 */
const fuenteDisplay = Bodoni_Moda({
  subsets: ["latin"],
  display: "swap",
  variable: "--nn-fuente-display",
});

const fuenteTexto = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--nn-fuente-texto",
});

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
    <html lang={locale} className={`${fuenteTexto.variable} ${fuenteDisplay.variable}`}>
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
                  so they sit beside the destinations rather than among them.
                  **Y desde el 2026-10-04 van COLAPSADOS, decisión de Daniel.**
                  Medido a 375 px: el ancho útil es 343 px, la marca pide 132 y
                  este grupo 251 (la píldora ES/EN 99 + «Cerrar sesión» 136), así
                  que marca + cuenta son 383 y desbordan por 40. El comentario del
                  CSS ya lo había medido y por eso la cabecera se apilaba en tres
                  filas: 138 px, el 17 % de la pantalla, en TODAS las pantallas.
                  Una fila no se consigue recolocando — hay que encoger este
                  grupo, que es lo que hace el `<details>`.

                  `<details>` y no un desplegable con estado: es el patrón que la
                  casa ya usa para colapsar (`app/components/apiary/Ayuda.tsx`), no
                  necesita JavaScript, y el teclado y el lector de pantalla lo
                  entienden sin que nadie escriba `aria-expanded`.

                  El MISMO mecanismo en móvil y en escritorio, a propósito: dos
                  caminos para lo mismo es la clase de cosa que se desincroniza el
                  día que alguien toca uno. */}
              <details className="nn-nav-cuenta">
                <summary aria-label={t("accountMenuLabel")}>{t("accountMenuShort")}</summary>
                <div className="nn-nav-cuenta-panel">
                  <LocaleSwitcher />
                  {user ? (
                    <form action={logoutAction}>
                      <BotonDeEnvio className="nn-link-button">
                        {t("signOut")}
                      </BotonDeEnvio>
                    </form>
                  ) : null}
                </div>
              </details>
            </div>
          </header>
          {/* Anexo E §5 — «Una jornada abierta es visible en todas las pantallas hasta
              que se cierra.» Va aquí y no en cada página porque «todas» incluye las que
              nadie ha escrito todavía. */}
          {user ? <JornadaAbiertaBanner userAccountId={user.userAccountId} /> : null}
          <main className="nn-shell nn-main">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
