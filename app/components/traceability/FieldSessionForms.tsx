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

const initialState: TraceabilityActionState = {};

export interface PersonOption {
  id: string;
  displayName: string;
}

export interface EventKindOption {
  id: string;
  value: string;
}

/** El instante actual en el formato que espera `datetime-local`, en hora local. */
function ahoraLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
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

  return (
    <form action={formAction} className="nn-form">
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
