import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "../lib/auth/session";
import { logoutAction } from "./actions/auth";

export const metadata: Metadata = {
  title: "Néctar Nómada",
  description: "Territory, agriculture, fermentation, research, and craft — one platform.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="es">
      <body>
        <header className="nn-nav">
          <div className="nn-shell nn-nav-row">
            <Link href="/" className="nn-wordmark">
              Néctar Nómada
            </Link>
            <nav className="nn-nav-links">
              {user ? (
                <>
                  <Link href="/my-nectar">Mi Néctar</Link>
                  <form action={logoutAction}>
                    <button type="submit" className="nn-link-button">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login">Sign in</Link>
                  <Link href="/signup">Sign up</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="nn-shell nn-main">{children}</main>
      </body>
    </html>
  );
}
