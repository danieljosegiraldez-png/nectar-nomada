"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  listFieldEventDrafts,
  syncFieldEvents,
  FIELD_DRAFTS_CHANGED_EVENT,
  type SyncSummary,
} from "../../../lib/sync/offlineQueue";

/**
 * P4 §11 — lo que el operador ve de la cola: cuánto falta por enviar, un botón
 * para enviarlo, y qué pasó.
 *
 * **Explícito, no automático.** Sincronizar al recuperar señal parece amable y
 * no lo es: el operador no sabría cuándo salió lo suyo ni por qué algo se marcó
 * en error, y un push que empieza solo mientras camina fuera de cobertura se
 * queda a medias sin que nadie lo pida. A5/A0 ya lo decidió así para apiario
 * («explicit sync now, no automatic conflict resolution») y aquí vale igual.
 *
 * Un rechazo se enseña aparte de un envío bueno porque son cosas distintas:
 * lo enviado desaparece de la cola, lo rechazado se queda y **no se reintenta
 * solo**. Reintentar algo que el servidor ya evaluó y negó no lo va a arreglar,
 * y esconder eso detrás de un contador que baja sería mentir sobre lo que pasó.
 */
export function FieldSyncControls() {
  const t = useTranslations("Traceability");
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ultimo, setUltimo] = useState<SyncSummary | null>(null);
  // Inicializador perezoso, no un efecto: `navigator.onLine` se lee de forma
  // síncrona en el cliente al montar, así que para el PRIMER valor no hay nada
  // a lo que suscribirse — sólo para los siguientes, que es lo que hacen los
  // oyentes de abajo.
  //
  // Comprobado con `window` y no con `navigator`: Node 21+ define un
  // `navigator` global parcial SIN `.onLine`, así que `typeof navigator !==
  // "undefined"` también es cierto durante el render de servidor y esto se
  // evaluaría a `undefined` allí — un desajuste de hidratación real, ya
  // encontrado y documentado en `OfflineSyncIndicator`. `window` no tiene ese
  // polyfill.
  const [sinConexion, setSinConexion] = useState(() =>
    typeof window !== "undefined" ? !navigator.onLine : false,
  );

  const recontar = useCallback(async () => {
    try {
      setPendientes((await listFieldEventDrafts()).length);
    } catch {
      // IndexedDB no disponible (navegación privada en algunos navegadores).
      // El operador pierde el contador, no los datos: el formulario ya habría
      // fallado antes al guardar, y ahí sí se entera.
      setPendientes(null);
    }
  }, []);

  useEffect(() => {
    // IndexedDB no tiene API de suscripción a la que escuchar en lugar de
    // esto: leer y poner el estado al montar es la forma correcta aquí, no el
    // antipatrón de «pedir datos en un efecto» contra el que la regla protege
    // — no hay sistema externo al que suscribirse para el valor inicial, y los
    // oyentes de abajo son esa suscripción para todos los demás. Mismo caso y
    // misma excepción que `OfflineSyncIndicator`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recontar();

    const conectado = () => setSinConexion(false);
    const desconectado = () => setSinConexion(true);
    const cambiaronLosBorradores = () => void recontar();
    window.addEventListener("online", conectado);
    window.addEventListener("offline", desconectado);
    window.addEventListener(FIELD_DRAFTS_CHANGED_EVENT, cambiaronLosBorradores);
    return () => {
      window.removeEventListener("online", conectado);
      window.removeEventListener("offline", desconectado);
      window.removeEventListener(FIELD_DRAFTS_CHANGED_EVENT, cambiaronLosBorradores);
    };
  }, [recontar]);

  const sincronizar = async () => {
    setEnviando(true);
    try {
      setUltimo(await syncFieldEvents());
    } catch {
      // El fetch lanzó: la petición no llegó. Nada se pierde y nada se marca
      // como error — se vuelve a intentar cuando el operador lo pida.
      setSinConexion(true);
    } finally {
      setEnviando(false);
      await recontar();
    }
  };

  if (pendientes === null) return null;

  return (
    <div className="nn-field-sync" role="group">
      <p>{t("fieldSyncPending", { count: pendientes })}</p>
      {sinConexion ? <p className="nn-note">{t("fieldSyncOffline")}</p> : null}
      <button type="button" className="nn-button" onClick={sincronizar} disabled={enviando || pendientes === 0}>
        {enviando ? t("fieldSyncWorking") : t("fieldSyncButton")}
      </button>
      {ultimo ? (
        <>
          {/* Un servidor caído NO es un rechazo, y decirlo así al operador
              sería mentirle sobre su propio trabajo: nadie llegó a mirarlo.
              Por eso este caso excluye el resumen de enviados en vez de
              acompañarlo — no hay nada que resumir. */}
          {ultimo.serverUnavailable ? (
            <p className="nn-note" role="status">
              {t("fieldSyncUnavailable")}
            </p>
          ) : (
            <>
              <p role="status">{t("fieldSyncDone", { applied: ultimo.applied })}</p>
              {ultimo.rejected > 0 ? (
                <p className="nn-error" role="alert">
                  {t("fieldSyncRejected", { count: ultimo.rejected })}
                </p>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
