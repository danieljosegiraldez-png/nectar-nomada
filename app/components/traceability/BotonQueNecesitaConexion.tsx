"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSinConexion } from "./useSinConexion";

/**
 * El botón de enviar de lo que NO se encola sin señal: corregir y editar
 * (spec §6.1). Sin conexión se desactiva y dice por qué, en vez de dejar que el
 * envío falle. Nada se descarta en silencio.
 */
export function BotonQueNecesitaConexion({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  const t = useTranslations("Traceability");
  const sinConexion = useSinConexion();
  return (
    <>
      <button type="submit" className="nn-button" disabled={disabled || sinConexion}>
        {children}
      </button>
      {sinConexion ? (
        <p className="nn-muted" role="status">
          {t("plotDashboardNeedsConnection")}
        </p>
      ) : null}
    </>
  );
}
