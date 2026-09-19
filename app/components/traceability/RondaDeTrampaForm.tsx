"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { TriStateField } from "./TriStateField";
import {
  queueFieldEvent,
  syncFieldEvents,
  listFieldEventDrafts,
  discardFieldEventDraft,
  estadoDeBorrador,
  FIELD_EVENTS_SYNCED_EVENT,
  type FieldEventDraft,
  type EstadoDeBorrador,
} from "../../../lib/sync/offlineQueue";
import { construirPayloadDeRevisionDeTrampa, generarClaveDeRevision } from "../../../lib/sync/parcelaPayload";
import { queueTrapPhoto, syncTrapPhotos } from "../../../lib/sync/trapPhotoQueue";
import { claveI18nDeRevisionRechazada } from "../../../lib/traceability/pendienteDeTrampas";

const NIVELES = ["ninguno", "pocos", "algunos", "muchos"] as const;

/** El `clientDraftId` de un borrador de la ronda, tal como lo guardó
 * `construirPayloadDeRevisionDeTrampa` en su `payload`. */
function claveDelBorrador(d: FieldEventDraft): string | null {
  const v = (d.payload as { clientDraftId?: unknown }).clientDraftId;
  return typeof v === "string" ? v : null;
}

/**
 * El formulario corto de la ronda — spec §4.2: seis campos, no diez.
 *
 * **Sin campo de procedencia ni de observador, ni siquiera oculto.** Ruling
 * del controlador, Tarea 10: un `<input type="hidden">` es falsificable
 * (SECURITY.md §2 — el formulario no es la frontera), así que el servidor
 * fija los dos SIEMPRE al aplicar la mutación (`aplicarRevisionDeTrampa`,
 * `lib/sync/pushFieldEvents.ts`) —observación directa, la persona vinculada
 * a la cuenta del dispositivo que empujó el lote—, y ni siquiera se ofrece
 * un campo para forjar. `RevisionDeTrampaForm` —con procedencia, calidad del
 * dato y observador elegibles— vive en `/plots/[id]/ajustes` (sección
 * «trampas»), para transcribir una revisión de notas de papel de un
 * tercero; no en este formulario, donde quien registra es siempre quien
 * tiene la sesión iniciada.
 *
 * `hoy` (`YYYY-MM-DD`) lo calcula el servidor con la zona de LA FINCA
 * (`diaDeHoy`, en `app/finca/trampas/ronda/page.tsx`): un `hoyLocalISO()` en
 * el cliente daría el día del dispositivo, que puede no ser el de la finca,
 * y desajustaría la hidratación. El campo sigue siendo un `type="date"`
 * editable — sólo cambia de dónde sale el valor por defecto.
 *
 * **Fix final A1+A2 — un solo camino, primero la cola, y SIEMPRE.** `alEnviar`
 * SIEMPRE hace `preventDefault()` y encola la revisión con `queueFieldEvent`
 * — nunca hay envío nativo del formulario, así que la foto nunca puede viajar
 * en su cuerpo (C1/I3 de la revisión final). La clave de idempotencia
 * (`generarClaveDeRevision`) es la misma que ve el servidor sin importar si
 * había cobertura al pulsar «Registrar».
 *
 * **A3 — la foto se intenta encolar ANTES que la revisión.** Si
 * `queueTrapPhoto` falla, ni se limpia el formulario ni se da la revisión
 * por hecha.
 *
 * **Fix final (re-revisión, "New Breakage") — la tarjeta distingue TRES
 * estados del último borrador de esta trampa, no dos.** Antes,
 * `pendienteDeEnvio` sólo miraba si el `clientDraftId` seguía en
 * `listFieldEventDrafts()`: un rechazo TERMINAL del servidor
 * (`observer_self_missing`, una trampa retirada, la clave de A9 reutilizada
 * con otra trampa, un campo malformado) deja el borrador en la cola con
 * `status: "error"` — sigue "existiendo", así que se leía como "todavía
 * pendiente, sólo falta señal" para siempre, que es lo opuesto de la verdad.
 *
 * Los tres estados —`estadoDeBorrador`, en `lib/sync/offlineQueue.ts`— son
 * `"pendiente"` (en cola, sin confirmar), `"rechazada"` (el servidor la
 * negó: se muestra el motivo, con un botón «Descartar» que borra ESE
 * borrador como acción explícita del operario) y `"sincronizada"` (ya no
 * está en la cola: aplicada o duplicada). Una rechazada NUNCA se lee como
 * «revisada hoy» (regla 3 del ruling): sólo `"pendiente"` y `"sincronizada"`
 * usan ese texto.
 *
 * **Se reconcilia al montar**, no sólo tras el propio envío: el borrador
 * sobrevive a un cierre de pestaña (IndexedDB), así que si la página se
 * recarga con una revisión pendiente o rechazada de ESTA trampa, la tarjeta
 * tiene que seguir mostrándola — si no, un rechazo real se volvería
 * invisible en vez de sólo "pendiente para siempre". Y se re-comprueba en
 * cualquier `FIELD_EVENTS_SYNCED_EVENT` de la página (el botón genérico de
 * `FieldSyncControls`, no sólo el envío inmediato de este formulario).
 */
export function RondaDeTrampaForm({
  locationId,
  specimenId,
  hoy,
}: {
  locationId: string;
  specimenId: string;
  hoy: string;
}) {
  const t = useTranslations("Traceability");
  const id = (campo: string) => `ronda-${campo}-${specimenId}`;

  const [estado, setEstado] = useState<EstadoDeBorrador | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState(false);
  const [errorFoto, setErrorFoto] = useState(false);
  const [encolando, setEncolando] = useState(false);
  // Tarea 12 — la foto elegida, si hay una. Sólo estado local: no viaja por
  // `FormData` hacia `construirPayloadDeRevisionDeTrampa` (que no la lee), va
  // por su propia cola (`queueTrapPhoto`) en `alEnviar`.
  const [foto, setFoto] = useState<File | null>(null);
  // El pestillo evita que dos toques de «Registrar» antes de que termine el
  // primer `alEnviar` encolen dos revisiones.
  const yaEncolando = useRef(false);
  // El id LOCAL (IndexedDB) del borrador que la tarjeta muestra ahora — el
  // que `discardFieldEventDraft` necesita, distinto del `clientDraftId`.
  const draftIdRef = useRef<string | null>(null);
  const claveRef = useRef<string | null>(null);

  const actualizarDesdeBorrador = useCallback((borrador: FieldEventDraft | null) => {
    draftIdRef.current = borrador?.id ?? null;
    claveRef.current = borrador ? claveDelBorrador(borrador) : null;
    setEstado(estadoDeBorrador(borrador));
    setMotivoRechazo(borrador?.errorMessage ?? null);
  }, []);

  // Re-lee el borrador de ESTA clave (si ya se envió una vez) o, si aún no se
  // ha enviado nada en esta sesión del componente, el ÚLTIMO borrador de
  // ESTA trampa que quede en la cola — para sobrevivir a un remonte/recarga.
  const recomprobar = useCallback(async () => {
    try {
      const drafts = await listFieldEventDrafts();
      const clave = claveRef.current;
      const borrador = clave
        ? drafts.find((d) => claveDelBorrador(d) === clave) ?? null
        : drafts.filter((d) => (d.payload as { specimenId?: unknown }).specimenId === specimenId).at(-1) ?? null;
      actualizarDesdeBorrador(borrador);
    } catch {
      // IndexedDB no disponible (navegación privada). La tarjeta se queda
      // como estaba; el error real, si lo hay, ya se vio al encolar.
    }
  }, [specimenId, actualizarDesdeBorrador]);

  useEffect(() => {
    void recomprobar();
    const alSincronizar = () => void recomprobar();
    window.addEventListener(FIELD_EVENTS_SYNCED_EVENT, alSincronizar);
    return () => window.removeEventListener(FIELD_EVENTS_SYNCED_EVENT, alSincronizar);
  }, [recomprobar]);

  const alEnviar = async (e: React.FormEvent<HTMLFormElement>) => {
    // SIEMPRE: nunca hay envío nativo del formulario — ver el docstring.
    e.preventDefault();
    if (yaEncolando.current) return;
    yaEncolando.current = true;
    setEncolando(true);

    const form = e.currentTarget;
    // Fresca en CADA intento de guardado real. Es el punto donde la Tarea 12
    // se engancha: `clave` es la clave de ESTE envío, viva mientras dure este
    // `alEnviar`, y la misma que verá la foto y la revisión.
    const clave = generarClaveDeRevision();

    try {
      // A3 — la foto primero: si falla, no se toca la cola de la revisión ni
      // se limpia el formulario.
      if (foto) {
        try {
          await queueTrapPhoto({ locationId, revisionClientDraftId: clave, file: foto });
        } catch {
          setErrorFoto(true);
          return;
        }
      }

      const borrador = await queueFieldEvent({
        ...construirPayloadDeRevisionDeTrampa(new FormData(form), specimenId, locationId, clave),
      });
      form.reset();
      setFoto(null);
      setErrorFoto(false);
      setErrorLocal(false);
      actualizarDesdeBorrador(borrador);

      // A2 — con señal, sincronizar enseguida, no esperar al botón de
      // `FieldSyncControls`. El evento que dispara `syncFieldEvents` también
      // hace que `recomprobar` corra (vía el listener de arriba); este
      // `.then` es sólo para no depender de esa vuelta si algo la retrasa.
      if (typeof navigator !== "undefined" && navigator.onLine) {
        void syncFieldEvents()
          .then(() => recomprobar())
          .catch(() => {
            // El fetch no llegó: sigue pendiente, tal cual estaba.
          });
        if (foto) void syncTrapPhotos().catch(() => {});
      }
    } catch {
      setEstado(null);
      setErrorLocal(true);
    } finally {
      yaEncolando.current = false;
      setEncolando(false);
    }
  };

  const descartar = async () => {
    const draftId = draftIdRef.current;
    if (draftId) {
      try {
        await discardFieldEventDraft(draftId);
      } catch {
        // Sin IndexedDB no hay nada que descartar; se deja como estaba.
        return;
      }
    }
    draftIdRef.current = null;
    claveRef.current = null;
    setEstado(null);
    setMotivoRechazo(null);
  };

  return (
    <form onSubmit={alEnviar} className="nn-form">
      <div className="nn-field">
        <label htmlFor={id("observedAt")}>{t("trapCheckDate")}</label>
        <input id={id("observedAt")} type="date" name="observedAt" required defaultValue={hoy} />
      </div>

      <div className="nn-field">
        <label htmlFor={id("brocaLevel")}>{t("trapCheckLevel")}</label>
        <select id={id("brocaLevel")} name="brocaLevel" required defaultValue="">
          <option value="">{t("trapCheckLevelChoose")}</option>
          {NIVELES.map((n) => (
            <option key={n} value={n}>{t(`trapsLevel_${n}`)}</option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={id("captureCount")}>{t("trapCheckCount")}</label>
        <input
          id={id("captureCount")}
          type="number"
          name="captureCount"
          min="0"
          step="1"
          inputMode="numeric"
          placeholder={t("notRecorded")}
          // La rueda del ratón sobre un campo numérico con foco lo cambia: desde
          // vacío, un paso abajo deja 0, y «no se contó» pasa a «cero brocas»
          // sin que nadie lo vea (mismo guardia que `RevisionDeTrampaForm`,
          // en `/plots/[id]/ajustes`).
          onWheel={(e) => e.currentTarget.blur()}
        />
      </div>

      <TriStateField id={id("otherInsects")} name="otherInsects" label={t("trapCheckOthers")} />
      <div className="nn-field">
        <label htmlFor={id("otherInsectsNote")}>{t("trapCheckOthersNote")}</label>
        <input id={id("otherInsectsNote")} type="text" name="otherInsectsNote" placeholder={t("notRecorded")} />
      </div>

      <TriStateField id={id("cleaned")} name="cleaned" label={t("trapCheckCleaned")} />
      <TriStateField id={id("liquidChanged")} name="liquidChanged" label={t("trapCheckLiquid")} />
      <TriStateField id={id("lureRecharged")} name="lureRecharged" label={t("trapCheckLure")} />

      <div className="nn-field">
        <label htmlFor={id("foto")}>{t("trapCheckPhotoLabel")}</label>
        <input
          id={id("foto")}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
        />
      </div>

      {/* Regla 3 del ruling — una rechazada NUNCA usa el texto de «revisada
          hoy»: sólo pendiente y sincronizada lo hacen. */}
      {estado === "pendiente" || estado === "sincronizada" ? (
        <p className="nn-note" role="status">
          {t(estado === "pendiente" ? "trapCheckQueuedPending" : "trapCheckQueuedSynced")}
        </p>
      ) : null}
      {estado === "rechazada" ? (
        <div className="nn-error" role="alert">
          <p>{t("trapCheckRejected", { motivo: t(claveI18nDeRevisionRechazada(motivoRechazo)) })}</p>
          <button type="button" className="nn-button" onClick={descartar}>
            {t("trapCheckDiscard")}
          </button>
        </div>
      ) : null}
      {errorLocal ? (
        <p className="nn-error" role="alert">
          {t("fieldEventQueueFailed")}
        </p>
      ) : null}
      {errorFoto ? (
        <p className="nn-error" role="alert">
          {t("trapCheckPhotoQueueFailed")}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={encolando}>{t("trapCheckSave")}</button>
    </form>
  );
}
