"use client";

import { useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { leerGuardadaEl } from "../../lib/sync/versionGuardada";

const sinSuscripcion = () => () => {};
/** El contenido de la marca, `""` si va vacía, o `null` si la página no vino guardada. */
const marcaDeLaPagina = () => document.querySelector('meta[name="nn-guardada-el"]')?.getAttribute("content") ?? null;
const sinMarcaEnElServidor = () => null;

/**
 * «Sin conexión: esto es lo que se guardó el …» — R2 del plan farm-to-green (ADR-197), 2026-10-09.
 *
 * Sin red, el service worker sirve la última versión guardada de cada ruta de operador (beneficio,
 * lotes, parcelas, apiarios, jornadas) y le pone una marca (`marcarComoGuardada`, `public/sw.js`).
 * Esto la lee y lo dice arriba de la pantalla. Con red no hay marca y no se pinta nada. Daniel
 * eligió el 2026-10-09 que salga en TODA página guardada y no sólo en el beneficio: el mecanismo es
 * el mismo, y antes todas enseñaban datos viejos sin decirlo.
 *
 * La hora se pinta en la zona del teléfono: es cuándo se guardó en ESTE aparato.
 */
export function AvisoDeVersionGuardada() {
  const t = useTranslations("SinConexion");
  const locale = useLocale();
  const marca = useSyncExternalStore(sinSuscripcion, marcaDeLaPagina, sinMarcaEnElServidor);
  if (marca === null) return null;

  const cuando = leerGuardadaEl(marca);
  const texto = cuando
    ? t("versionGuardada", {
        cuando: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(cuando),
      })
    : t("versionGuardadaSinHora");
  return (
    <p className="nn-notice nn-notice-viejo" role="status">
      {texto}
    </p>
  );
}
