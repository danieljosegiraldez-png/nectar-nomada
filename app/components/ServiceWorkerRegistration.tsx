"use client";

import { useEffect } from "react";
import { alinearConLaCuenta } from "../../lib/offline/paginasGuardadas";
import { apuntarCuentaDelNavegador } from "../../lib/offline/cuentaDelNavegador";

/**
 * A5.5. Registers /public/sw.js at root scope. Silently no-ops where
 * unsupported (older browsers, non-secure contexts) — this is additive
 * hardening for field connectivity, never a requirement to use the app.
 *
 * `cuenta` es la huella de la cuenta que vio el servidor en esta carga, o
 * `null` sin sesión. Con ella se borran las páginas guardadas para otra cuenta
 * o para nadie: es lo que cubre la sesión que caduca sin pulsar «cerrar
 * sesión». Ver `lib/offline/paginasGuardadas.ts`.
 *
 * `generadaEn` es la hora del servidor a la que se generó esta página. Con ella se apunta, además,
 * de quién son los borradores que se anoten desde aquí (ADR-199): ver
 * `lib/offline/cuentaDelNavegador.ts`.
 */
export function ServiceWorkerRegistration({ cuenta, generadaEn }: { cuenta: string | null; generadaEn: number }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No-op: offline support degrades gracefully, online use is unaffected.
    });
  }, []);

  useEffect(() => {
    // ADR-199 — primero la cuenta de los borradores, que es síncrona y no depende de CacheStorage: si
    // borrar las páginas falla, los borradores siguen sabiendo de quién son.
    apuntarCuentaDelNavegador({ cuenta, generadaEn });
    alinearConLaCuenta(cuenta).catch(() => {
      // Sin CacheStorage no hay páginas guardadas que borrar.
    });
  }, [cuenta, generadaEn]);

  return null;
}
