"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { TriStateField } from "./TriStateField";
import { queueFieldEvent, syncFieldEvents, listFieldEventDrafts } from "../../../lib/sync/offlineQueue";
import { construirPayloadDeRevisionDeTrampa, generarClaveDeRevision } from "../../../lib/sync/parcelaPayload";
import { queueTrapPhoto, syncTrapPhotos } from "../../../lib/sync/trapPhotoQueue";

const NIVELES = ["ninguno", "pocos", "algunos", "muchos"] as const;

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
 * **Fix final A1+A2 — un solo camino, primero la cola, y SIEMPRE.** Antes
 * había dos caminos: con señal, el navegador hacía el envío nativo del
 * `<form action={formAction}>` hacia `recordRoundTrapCheckFormAction`; sin
 * señal, `alEnviar` interceptaba y encolaba. Eso rompía en dos sitios
 * (revisión final, C1/I3): el `<input type="file">` viajaba DENTRO de ese
 * `<form>`, así que una foto de cámara (varios MB) superaba el límite de
 * 1 MB del cuerpo de una Server Action y la revisión no se guardaba aunque
 * hubiera señal de sobra; y un reintento tras perder el acuse del servidor
 * generaba una clave FRESCA (necesaria para el camino sin señal) que el
 * camino con señal no persistía en ningún sitio, así que un segundo intento
 * creaba una segunda fila.
 *
 * Ahora hay un solo camino: `alEnviar` SIEMPRE hace `preventDefault()` y
 * encola la revisión con `queueFieldEvent` — nunca hay envío nativo del
 * formulario, así que la foto nunca puede viajar en su cuerpo. Si hay
 * señal, se dispara `syncFieldEvents()` enseguida después de encolar (no se
 * espera a que el operario pulse el botón de `FieldSyncControls`). La clave
 * de idempotencia (`generarClaveDeRevision`) es la misma que ve el servidor
 * sin importar si había cobertura al pulsar «Registrar»: un reintento la
 * reutiliza —se fija una vez por intento de guardado real, ver más abajo—,
 * así que el servidor lo deduplica por `clientDraftId` en vez de crear una
 * fila nueva, y un envío que de verdad se pierde queda recuperable en la
 * cola en vez de desaparecer sin dejar rastro.
 *
 * `recordRoundTrapCheckFormAction` quedó sin ningún llamador con este
 * cambio (comprobado con `grep`) y se quitó, junto con su prueba dedicada:
 * la única regla que fijaba —procedencia y observador en el servidor— la
 * sigue fijando `aplicarRevisionDeTrampa`, que es ahora el único sitio por
 * el que pasa CUALQUIER revisión de la ronda, con o sin señal.
 *
 * **A3 — la foto se intenta encolar ANTES que la revisión.** Si
 * `queueTrapPhoto` falla (cuota de IndexedDB, navegación privada), el
 * formulario NO se limpia y la revisión NO se encola: el operario ve el
 * error y no cree que guardó algo que no guardó. Si la foto se encola bien
 * (o no había foto), la revisión se encola y, si hay señal, las dos colas
 * —revisión y foto— se sincronizan enseguida.
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

  // `encolado`: la revisión quedó guardada en este dispositivo (spec §4.2 —
  // «revisada hoy»). `pendienteDeEnvio`: sigue sin confirmarse que el
  // servidor la recibió — arranca en `true` al encolar y pasa a `false` en
  // cuanto, tras el intento de sincronización con señal, el borrador ya no
  // está en la cola local.
  const [encolado, setEncolado] = useState(false);
  const [pendienteDeEnvio, setPendienteDeEnvio] = useState(false);
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

      await queueFieldEvent({
        ...construirPayloadDeRevisionDeTrampa(new FormData(form), specimenId, locationId, clave),
      });
      form.reset();
      setFoto(null);
      setErrorFoto(false);
      setErrorLocal(false);
      setEncolado(true);
      setPendienteDeEnvio(true);

      // A2 — con señal, sincronizar enseguida, no esperar al botón de
      // `FieldSyncControls`. `syncFieldEvents` avisa por evento a
      // `SincronizarFotosDeRonda`, que también sincroniza su propia cola de
      // fotos (A4) — no hace falta duplicar esa llamada aquí.
      if (typeof navigator !== "undefined" && navigator.onLine) {
        void syncFieldEvents()
          .then(async () => {
            const siguePendiente = (await listFieldEventDrafts()).some(
              (d) => (d.payload as { clientDraftId?: unknown }).clientDraftId === clave,
            );
            setPendienteDeEnvio(siguePendiente);
          })
          .catch(() => {
            // El fetch no llegó: sigue pendiente, tal cual estaba.
          });
        if (foto) void syncTrapPhotos().catch(() => {});
      }
    } catch {
      setEncolado(false);
      setPendienteDeEnvio(false);
      setErrorLocal(true);
    } finally {
      yaEncolando.current = false;
      setEncolando(false);
    }
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

      {encolado ? (
        <p className="nn-note" role="status">
          {t(pendienteDeEnvio ? "trapCheckQueuedPending" : "trapCheckQueuedSynced")}
        </p>
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
