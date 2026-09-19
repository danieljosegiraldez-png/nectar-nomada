"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  listTrapPhotoDrafts,
  syncTrapPhotos,
  TRAP_PHOTO_DRAFTS_CHANGED_EVENT,
  type SyncFotosSummary,
} from "../../../lib/sync/trapPhotoQueue";
import { FIELD_EVENTS_SYNCED_EVENT } from "../../../lib/sync/offlineQueue";

/**
 * Tarea 12 — el contador y el botón para las fotos de la ronda, gemelo de
 * `FieldSyncControls` pero para la cola de `Blob`s (`lib/sync/trapPhotoQueue.ts`)
 * en vez de la de mutaciones JSON. Mismo criterio: sincronizar es explícito,
 * nunca automático — el operador tiene que saber cuándo salió lo suyo.
 *
 * **A4 fix-final — el contador escucha DOS eventos, no ninguno.** Antes sólo
 * se recontaba al montar o tras pulsar su PROPIO botón: una foto nueva
 * encolada desde `RondaDeTrampaForm`, o un reintento automático que fallaba,
 * quedaban invisibles hasta que la página se recargara (revisión final, I5).
 *
 * - `TRAP_PHOTO_DRAFTS_CHANGED_EVENT` — su PROPIA cola cambió (se encoló una
 *   foto, se subió, o un intento falló). Sólo recuenta.
 * - `FIELD_EVENTS_SYNCED_EVENT` — la cola de REVISIONES se sincronizó, en
 *   cualquier parte de la página (el botón de `FieldSyncControls`, o el
 *   envío inmediato de `RondaDeTrampaForm` con señal). Además de recontar,
 *   dispara su PROPIA sincronización: sin esto, sincronizar las revisiones
 *   desde el botón genérico no reintentaba ninguna foto pendiente.
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

  const sincronizar = useCallback(async () => {
    setEnviando(true);
    try {
      setUltimo(await syncTrapPhotos());
    } finally {
      setEnviando(false);
      await recontar();
    }
  }, [recontar]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recontar();

    const cambioDeCola = () => void recontar();
    const sePudoSincronizarRevisiones = () => void sincronizar();
    window.addEventListener(TRAP_PHOTO_DRAFTS_CHANGED_EVENT, cambioDeCola);
    window.addEventListener(FIELD_EVENTS_SYNCED_EVENT, sePudoSincronizarRevisiones);
    return () => {
      window.removeEventListener(TRAP_PHOTO_DRAFTS_CHANGED_EVENT, cambioDeCola);
      window.removeEventListener(FIELD_EVENTS_SYNCED_EVENT, sePudoSincronizarRevisiones);
    };
  }, [recontar, sincronizar]);

  if (pendientes === null || pendientes === 0) return null;

  return (
    <div className="nn-field-sync" role="group">
      <p>{t("trapPhotoSyncPending", { count: pendientes })}</p>
      <button type="button" className="nn-button" onClick={sincronizar} disabled={enviando}>
        {enviando ? t("fieldSyncWorking") : t("fieldSyncButton")}
      </button>
      {ultimo ? (
        <>
          {/* A13 fix-final — textos propios de FOTO, no de «anotación»: estas
              claves reemplazan a `fieldSyncDone`/`fieldSyncRejected`, que
              hablaban de notas de texto y confundían a quien acababa de
              subir una fotografía. */}
          <p role="status">{t("trapPhotoSyncDone", { applied: ultimo.applied })}</p>
          {ultimo.rejected > 0 ? (
            <p className="nn-error" role="alert">
              {t("trapPhotoSyncRejected", { count: ultimo.rejected })}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
