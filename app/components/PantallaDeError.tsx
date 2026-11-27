"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useTranslations } from "next-intl";

export interface PropsDeError {
  error: Error & { digest?: string };
  /** Vuelve a pedir los datos del segmento y a pintarlo (Next 16.3: `retry` es estable). */
  retry: () => void;
}

/**
 * Lo que ve el operario cuando una pantalla falla — R1 del plan farm-to-green (ADR-197).
 *
 * Antes no había ninguna: salía la pantalla técnica de Next, en inglés y sin salida. Ahora dice
 * qué pasó en español, deja reintentar y volver al inicio, y enseña el **código** que Next le da
 * al error (`digest`), que es lo que casa con el registro del servidor en Vercel.
 *
 * **No enseña `error.message`**: en producción Next lo sustituye por un texto genérico, y en
 * desarrollo puede traer detalles del servidor. Tampoco promete nada que no sepa —por ejemplo que
 * no se perdió nada—: puede haber fallado una escritura a medias.
 *
 * «Volver al inicio» lleva a `/` y no a la portada de la sección, por decisión de Daniel del
 * 2026-10-09: si la que falla es justo esa portada, el botón llevaría a la misma pantalla rota.
 */
export function PantallaDeError({ error, retry }: PropsDeError) {
  const t = useTranslations("Estados");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="nn-section" role="alert">
      <h1>{t("errorTitulo")}</h1>
      <p>{t("errorCuerpo")}</p>
      <p>
        <button type="button" className="nn-button" onClick={() => retry()}>
          {t("reintentar")}
        </button>{" "}
        <Link href="/" className="nn-button">
          {t("volverAlInicio")}
        </Link>
      </p>
      {error.digest ? <p className="nn-muted">{t("codigo", { digest: error.digest })}</p> : null}
    </section>
  );
}
