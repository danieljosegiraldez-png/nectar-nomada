"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { listTrapPhotoDrafts, syncTrapPhotos, type SyncFotosSummary } from "../../../lib/sync/trapPhotoQueue";

/**
 * Tarea 12 — el contador y el botón para las fotos de la ronda, gemelo de
 * `FieldSyncControls` pero para la cola de `Blob`s (`lib/sync/trapPhotoQueue.ts`)
 * en vez de la de mutaciones JSON. Mismo criterio: sincronizar es explícito,
 * nunca automático — el operador tiene que saber cuándo salió lo suyo.
 */
export function SincronizarFotosDeRonda() {
  const t = useTranslations("Traceability");
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ultimo, setUltimo] = useState<SyncFotosSummary | null>(null);

  const recontar = useCallback(async () => {
    try {
      setPendientes((await listTrapPhotoDrafts()).length);
    } catch {
      // IndexedDB no disponible (navegación privada en algunos navegadores).
      // El operador pierde el contador, no la foto: `queueTrapPhoto` ya habría
      // fallado antes al guardar, y ahí sí se entera.
      setPendientes(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recontar();
  }, [recontar]);

  const sincronizar = async () => {
    setEnviando(true);
    try {
      setUltimo(await syncTrapPhotos());
    } finally {
      setEnviando(false);
      await recontar();
    }
  };

  if (pendientes === null || pendientes === 0) return null;

  return (
    <div className="nn-field-sync" role="group">
      <p>{t("trapPhotoSyncPending", { count: pendientes })}</p>
      <button type="button" className="nn-button" onClick={sincronizar} disabled={enviando}>
        {enviando ? t("fieldSyncWorking") : t("fieldSyncButton")}
      </button>
      {ultimo ? (
        <>
          <p role="status">{t("fieldSyncDone", { applied: ultimo.applied })}</p>
          {ultimo.rejected > 0 ? (
            <p className="nn-error" role="alert">
              {t("fieldSyncRejected", { count: ultimo.rejected })}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
