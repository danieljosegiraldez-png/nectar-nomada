"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import {
  startFieldSessionFormAction,
  recordFieldEventFormAction,
  endFieldSessionFormAction,
  type TraceabilityActionState,
} from "../../actions/traceability";
import { TimezoneOffsetField } from "../TimezoneOffsetField";
import { paraCampoLocal } from "../../../lib/time/localDateTime";
import { queueFieldEvent } from "../../../lib/sync/offlineQueue";
import { construirEventoEncolado } from "../../../lib/sync/fieldEventPayload";

const initialState: TraceabilityActionState = {};

export interface PersonOption {
  id: string;
  displayName: string;
}

export interface EventKindOption {
  id: string;
  value: string;
}

/**
 * El instante actual en el formato que espera `datetime-local`, en hora local.
 *
 * Era una segunda copia de la misma aritmética que `paraCampoLocal`. Dos
 * definiciones de una conversión de husos son dos sitios donde arreglar el
 * mismo fallo, y este repositorio ya sabe cómo acaba eso.
 */
function ahoraLocal(): string {
  return paraCampoLocal(new Date());
}

/**
 * Las coordenadas van juntas o no van.
 *
 * El servicio rechaza media coordenada, y este bloque existe para que eso no
 * llegue a intentarse: un botón que las pide al navegador y las escribe en los
 * tres campos de una vez. Escribirlas a mano sigue siendo posible — un reporte
 * de visita en papel puede traerlas — pero lo normal es capturarlas estando
 * ahí, que es cuando valen algo.
 */
function CamposDeCoordenadas({ prefijo }: { prefijo: string }) {
  const t = useTranslations("Traceability");
  const [estado, setEstado] = useState<"idle" | "pidiendo" | "no_disponible">("idle");

  const pedirUbicacion = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setEstado("no_disponible");
      return;
    }
    setEstado("pidiendo");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const set = (name: string, v: number) => {
          const el = document.querySelector<HTMLInputElement>(`#${prefijo}-${name}`);
          if (el) el.value = String(v);
        };
        set("latitude", pos.coords.latitude);
        set("longitude", pos.coords.longitude);
        set("accuracyM", Math.round(pos.coords.accuracy));
        setEstado("idle");
      },
      // Un permiso denegado o un GPS que no fija no es un error del registro:
      // la jornada se guarda igual sin coordenadas.
      () => setEstado("no_disponible"),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <fieldset className="nn-field">
      <legend>{t("coordinatesLegend")}</legend>
      <button type="button" className="nn-button-secondary" onClick={pedirUbicacion} disabled={estado === "pidiendo"}>
        {estado === "pidiendo" ? t("coordinatesAsking") : t("coordinatesUseDevice")}
      </button>
      {estado === "no_disponible" ? <p className="nn-muted">{t("coordinatesUnavailable")}</p> : null}
      <label htmlFor={`${prefijo}-latitude`}>{t("latitudeLabel")}</label>
      <input id={`${prefijo}-latitude`} type="number" name="latitude" step="any" inputMode="decimal" placeholder={t("notRecorded")} />
      <label htmlFor={`${prefijo}-longitude`}>{t("longitudeLabel")}</label>
      <input id={`${prefijo}-longitude`} type="number" name="longitude" step="any" inputMode="decimal" placeholder={t("notRecorded")} />
      <label htmlFor={`${prefijo}-accuracyM`}>{t("accuracyLabel")}</label>
      <input id={`${prefijo}-accuracyM`} type="number" name="accuracyM" step="1" min="0" inputMode="numeric" placeholder={t("notRecorded")} />
    </fieldset>
  );
}

/**
 * Abrir una jornada: una persona, un sitio, una hora de inicio.
 *
 * Es lo que convierte «cuatro inspecciones sueltas» en «la visita del 12 de
 * marzo al Apiario 1». El operador es una **Persona**, no una cuenta de
 * usuario, a propósito (ADR-101): quien camina el apiario normalmente no tiene
 * con qué iniciar sesión, y exigirle una cuenta dejaría la jornada a nombre de
 * quien la transcribió.
 */
export function FieldSessionStartForm({
  locationId,
  people,
  selfPersonId,
}: {
  locationId: string;
  people: ReadonlyArray<PersonOption>;
  selfPersonId: string | null;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(startFieldSessionFormAction, initialState);

  return (
    <form action={formAction} className="nn-form">
      <TimezoneOffsetField />
      <input type="hidden" name="locationId" value={locationId} />
      <p className="nn-muted">{t("fieldSessionStartIntro")}</p>

      <div className="nn-field">
        <label htmlFor="operatorPersonId">{t("fieldSessionOperatorLabel")}</label>
        <select id="operatorPersonId" name="operatorPersonId" required defaultValue={selfPersonId ?? ""}>
          <option value="" disabled>
            {t("fieldSessionOperatorChoose")}
          </option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === selfPersonId ? t("observerSelfOption", { name: p.displayName }) : p.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="startedAt">{t("fieldSessionStartedAtLabel")}</label>
        <input id="startedAt" type="datetime-local" name="startedAt" required defaultValue={ahoraLocal()} />
      </div>

      <CamposDeCoordenadas prefijo="start" />

      <div className="nn-field">
        <label htmlFor="sessionNotes">{t("notesLabel")}</label>
        <textarea id="sessionNotes" name="notes" rows={2} />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("fieldSessionStartButton")}
      </button>
    </form>
  );
}

/** Anotar algo dentro de la jornada: una observación, un pesaje, una foto. */
export function FieldEventForm({
  fieldSessionId,
  eventKinds,
  people,
  selfPersonId,
}: {
  fieldSessionId: string;
  eventKinds: ReadonlyArray<EventKindOption>;
  people: ReadonlyArray<PersonOption>;
  selfPersonId: string | null;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(recordFieldEventFormAction, initialState);
  const [encolado, setEncolado] = useState(false);
  const [errorLocal, setErrorLocal] = useState(false);

  /**
   * P4 §11 — sin señal, el evento se guarda en la cola local en vez de perderse.
   *
   * Se decide por `navigator.onLine` y no intentando la petición primero:
   * `onLine === false` es una certeza («no hay interfaz de red»), mientras que
   * un `fetch` que tarda es indistinguible de un servidor lento, y esperar a
   * que falle deja al operador mirando un botón girando en mitad de un cafetal.
   * Lo que `onLine === true` NO garantiza es que haya internet — una wifi de
   * finca sin salida da `true`; ese caso lo recoge la otra mitad, porque la
   * acción del servidor falla y el operador lo ve.
   *
   * **El `try` no es decorativo.** Una vez llamado `preventDefault()` la Server
   * Action ya está cancelada, así que cualquier fallo aquí dejaría la anotación
   * en ninguna parte. Eso ya pasó: el desfase horario se leía de un campo con
   * nombre inventado, `parseLocalDateTime` lanzaba, y la pantalla seguía
   * diciendo «guardado en este dispositivo». Un fallo al encolar tiene que
   * verse, porque es la única copia que existe.
   */
  const alEnviar = async (e: React.FormEvent<HTMLFormElement>) => {
    if (typeof navigator !== "undefined" && navigator.onLine) return; // camino normal: la Server Action
    e.preventDefault();
    const form = e.currentTarget;
    try {
      await queueFieldEvent({ ...construirEventoEncolado(new FormData(form), fieldSessionId) });
      form.reset();
      setEncolado(true);
      setErrorLocal(false);
    } catch {
      setEncolado(false);
      setErrorLocal(true);
    }
  };

  return (
    <form action={formAction} onSubmit={alEnviar} className="nn-form">
      <TimezoneOffsetField />
      <input type="hidden" name="fieldSessionId" value={fieldSessionId} />

      <div className="nn-field">
        <label htmlFor="eventKindValueId">{t("fieldEventKindLabel")}</label>
        <select id="eventKindValueId" name="eventKindValueId" required defaultValue="">
          <option value="" disabled>
            {t("fieldEventKindChoose")}
          </option>
          {eventKinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.value}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="occurredAt">{t("fieldEventOccurredAtLabel")}</label>
        <input id="occurredAt" type="datetime-local" name="occurredAt" required defaultValue={ahoraLocal()} />
      </div>

      <div className="nn-field">
        <label htmlFor="eventOperatorPersonId">{t("fieldEventOperatorLabel")}</label>
        {/* Vacío hereda el operador de la jornada, que es lo normal. Se ofrece
            por si una parte de la visita la hizo otra persona. */}
        <select id="eventOperatorPersonId" name="operatorPersonId" defaultValue="">
          <option value="">{t("fieldEventOperatorInherit")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === selfPersonId ? t("observerSelfOption", { name: p.displayName }) : p.displayName}
            </option>
          ))}
        </select>
      </div>

      <CamposDeCoordenadas prefijo="event" />

      <div className="nn-field">
        <label htmlFor="eventNotes">{t("notesLabel")}</label>
        <textarea id="eventNotes" name="notes" rows={2} />
      </div>

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
      <button type="submit" className="nn-button" disabled={pending}>
        {t("fieldEventRecordButton")}
      </button>
    </form>
  );
}

/** Cerrar la jornada. Una jornada abierta es una visita que sigue en curso. */
export function FieldSessionEndForm({ fieldSessionId }: { fieldSessionId: string }) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(endFieldSessionFormAction, initialState);

  return (
    <form action={formAction} className="nn-form">
      <TimezoneOffsetField />
      <input type="hidden" name="fieldSessionId" value={fieldSessionId} />
      <div className="nn-field">
        <label htmlFor="endedAt">{t("fieldSessionEndedAtLabel")}</label>
        <input id="endedAt" type="datetime-local" name="endedAt" required defaultValue={ahoraLocal()} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("fieldSessionEndButton")}
      </button>
    </form>
  );
}
