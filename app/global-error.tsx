"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Cuando falla el propio marco de la aplicación (el layout raíz) — R1 del plan farm-to-green
 * (ADR-197).
 *
 * **Sustituye al layout raíz**, así que no tiene `NextIntlClientProvider` ni los estilos que el layout
 * importa: la documentación de Next 16 pide que este archivo traiga los suyos y su propio
 * `<html>`/`<body>`. Por eso los textos van fijos, en español y en inglés, en vez de traducidos.
 *
 * «Volver al inicio» es un `<a>` y no un `Link` **a propósito**: si falló el marco, una navegación
 * dentro de la aplicación puede volver a montar lo mismo que falló; una recarga completa empieza de
 * cero.
 */
export default function ErrorGlobal({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <main className="nn-shell">
          <section className="nn-section" role="alert">
            <h1>Algo falló al abrir la aplicación.</h1>
            <p lang="en">Something went wrong while opening the app.</p>
            <p>
              <button type="button" className="nn-button" onClick={() => retry()}>
                Reintentar · Retry
              </button>{" "}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- recarga completa a propósito: falló el marco, ver la cabecera */}
              <a href="/" className="nn-button">
                Volver al inicio · Back to start
              </a>
            </p>
            {error.digest ? <p className="nn-muted">Código del error · Error code: {error.digest}</p> : null}
          </section>
        </main>
      </body>
    </html>
  );
}
