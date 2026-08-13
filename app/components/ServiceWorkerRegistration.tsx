"use client";

import { useEffect } from "react";

/**
 * A5.5. Registers /public/sw.js at root scope. Silently no-ops where
 * unsupported (older browsers, non-secure contexts) — this is additive
 * hardening for field connectivity, never a requirement to use the app.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No-op: offline support degrades gracefully, online use is unaffected.
    });
  }, []);

  return null;
}
