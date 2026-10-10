"use client";

import { useEffect } from "react";
import { alinearConLaCuenta } from "../../lib/offline/paginasGuardadas";

/**
 * A5.5. Registers /public/sw.js at root scope. Silently no-ops where
 * unsupported (older browsers, non-secure contexts) — this is additive
 * hardening for field connectivity, never a requirement to use the app.
 *
 * `cuenta` es la huella de la cuenta que vio el servidor en esta carga, o
 * `null` sin sesión. Con ella se borran las páginas guardadas para otra cuenta
 * o para nadie: es lo que cubre la sesión que caduca sin pulsar «cerrar
 * sesión». Ver `lib/offline/paginasGuardadas.ts`.
 */
export function ServiceWorkerRegistration({ cuenta }: { cuenta: string | null }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No-op: offline support degrades gracefully, online use is unaffected.
    });
  }, []);

  useEffect(() => {
    alinearConLaCuenta(cuenta).catch(() => {
      // Sin CacheStorage no hay páginas guardadas que borrar.
    });
  }, [cuenta]);

  return null;
}
