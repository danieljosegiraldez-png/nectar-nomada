"use client";

import { useEffect, useState } from "react";

/**
 * Si el aparato dice que no hay señal. Es el mismo patrón que
 * `FieldSyncControls` y `OfflineSyncIndicator`: inicializador perezoso con
 * `navigator.onLine`, y escucha de `online`/`offline`.
 *
 * **Límite conocido y no resuelto aquí:** con señal débil `navigator.onLine`
 * puede ser `true` sin conexión real (decisión abierta, PR #345).
 */
export function useSinConexion(): boolean {
  const [sinConexion, setSinConexion] = useState(() =>
    typeof window !== "undefined" ? !navigator.onLine : false,
  );
  useEffect(() => {
    const alVolver = () => setSinConexion(false);
    const alPerder = () => setSinConexion(true);
    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alPerder);
    return () => {
      window.removeEventListener("online", alVolver);
      window.removeEventListener("offline", alPerder);
    };
  }, []);
  return sinConexion;
}
