"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { recordRoundTrapCheckFormAction, type TraceabilityActionState } from "../../actions/traceability";
import { TriStateField } from "./TriStateField";
import { queueFieldEvent } from "../../../lib/sync/offlineQueue";
import { construirPayloadDeRevisionDeTrampa } from "../../../lib/sync/parcelaPayload";

const NIVELES = ["ninguno", "pocos", "algunos", "muchos"] as const;
const initialState: TraceabilityActionState = {};

/**
 * El formulario corto de la ronda — spec §4.2: seis campos, no diez.
 *
 * **Sin campo de procedencia ni de observador, ni siquiera oculto.** Ruling
 * del controlador, Tarea 10: un `<input type="hidden">` es falsificable
 * (SECURITY.md §2 — el formulario no es la frontera), así que
 * `recordRoundTrapCheckFormAction` fija los dos en el SERVIDOR —observación
 * directa, la persona vinculada a la cuenta de la sesión— y ni siquiera lee
 * esos nombres del `FormData`. `RevisionDeTrampaForm` —con procedencia,
 * calidad del dato y observador elegibles— vive en
 * `/plots/[id]/ajustes` (sección «trampas», Tarea 10 fix round 1), para
 * transcribir una revisión de notas de papel de un tercero; no en este
 * formulario, donde quien registra es siempre quien tiene la sesión
 * iniciada.
 *
 * `hoy` (`YYYY-MM-DD`) lo calcula el servidor con la zona de LA FINCA
 * (`diaDeHoy`, en `app/finca/trampas/ronda/page.tsx`): un `hoyLocalISO()` en
 * el cliente daría el día del dispositivo, que puede no ser el de la finca,
 * y desajustaría la hidratación. El campo sigue siendo un `type="date"`
 * editable — sólo cambia de dónde sale el valor por defecto.
 *
 * **Tarea 11 — la ronda viaja sin señal.** Sin conexión, `alEnviar` encola la
 * revisión con `queueFieldEvent` en vez de dejar que la Server Action se
 * dispare (que fallaría igual, sin red). `revisionClientDraftId` es la clave
 * de idempotencia que viaja por los DOS caminos: sin señal, dentro del
 * payload de la cola; con señal, como el resto del `FormData` que
 * `recordRoundTrapCheckFormAction` ya lee. Así la clave es la misma sin
 * importar si había cobertura al pulsar «Registrar», que es lo que la Tarea
 * 12 necesita para engancharle la foto a una revisión que el servidor
 * todavía no ha visto.
 *
 * **La genera el servidor al pintar la página** (`crypto.randomUUID()` en
 * `app/finca/trampas/ronda/page.tsx`, una por tarjeta), no el cliente — mismo
 * criterio que `claveDeEnvio` en `MeasurementForm`/`StorageForm`: un
 * `useState`/`useRef` con `crypto.randomUUID()` daría un valor al renderizar
 * en el servidor y otro al hidratar, que es un desajuste de hidratación
 * sobre el valor del campo oculto.
 */
export function RondaDeTrampaForm({
  locationId,
  specimenId,
  hoy,
  revisionClientDraftId,
}: {
  locationId: string;
  specimenId: string;
  hoy: string;
  revisionClientDraftId: string;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(recordRoundTrapCheckFormAction, initialState);
  const id = (campo: string) => `ronda-${campo}-${specimenId}`;

  const [encolado, setEncolado] = useState(false);
  const [errorLocal, setErrorLocal] = useState(false);
  const [encolando, setEncolando] = useState(false);
  // El pestillo, mismo motivo que `SoilProfileForm`: tras `preventDefault()`
  // la Server Action no se dispara, así que `pending` nunca se pone a `true`
  // en este camino, y sin el ref dos toques encolarían dos revisiones.
  const yaEncolando = useRef(false);

  const alEnviar = async (e: React.FormEvent<HTMLFormElement>) => {
    if (typeof navigator !== "undefined" && navigator.onLine) return; // camino normal
    e.preventDefault();
    if (yaEncolando.current) return;
    yaEncolando.current = true;
    setEncolando(true);
    const form = e.currentTarget;
    try {
      await queueFieldEvent({
        ...construirPayloadDeRevisionDeTrampa(new FormData(form), specimenId, locationId, revisionClientDraftId),
      });
      form.reset();
      setEncolado(true);
      setErrorLocal(false);
    } catch {
      setEncolado(false);
      setErrorLocal(true);
    } finally {
      yaEncolando.current = false;
      setEncolando(false);
    }
  };

  return (
    <form action={formAction} onSubmit={alEnviar} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      <input type="hidden" name="specimenId" value={specimenId} />
      <input type="hidden" name="revisionClientDraftId" value={revisionClientDraftId} />

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

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {encolado ? (
        <p className="nn-note" role="status">
          {t("fieldEventQueuedOffline")}
        </p>
      ) : null}
      {errorLocal ? (
        <p className="nn-error" role="alert">
          {t("fieldEventQueueFailed")}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending || encolando}>{t("trapCheckSave")}</button>
    </form>
  );
}
