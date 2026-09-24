"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { confirmarCoordenadasAction, type TraceabilityActionState } from "../../actions/traceability";
import { BotonDeEnvio } from "../BotonDeEnvio";

/**
 * Declarar dónde está un sitio. Vivía dentro de `app/apiaries/[id]/page.tsx`
 * como un `<form action={…}>` suelto.
 *
 * **Sale a su propio componente de cliente para poder ENSEÑAR el error.** Los
 * campos son editables a propósito —quien declara tiene que poder corregir la
 * propuesta— así que una latitud de 95 llega de verdad al servidor, y hasta el
 * 2026-09-19 eso era un 500: la acción no capturaba nada y la página no tenía
 * dónde pintar un mensaje (`PENDING_IMPLEMENTATIONS/013`). Con `useActionState`
 * la acción devuelve `{ error }` y aquí se lee.
 */
export function ConfirmarCoordenadasForm({
  locationId,
  propuesta,
  distanciaALoDeclaradoM,
}: {
  locationId: string;
  propuesta: { latitude: number; longitude: number } | null;
  distanciaALoDeclaradoM: number | null;
}) {
  const tt = useTranslations("Traceability");
  const [state, formAction] = useActionState(confirmarCoordenadasAction, {} as TraceabilityActionState);

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 420 }}>
      <input type="hidden" name="locationId" value={locationId} />
      {/* Los valores van en campos editables, no ocultos: quien declara
          tiene que poder corregir la propuesta, que para eso es una
          propuesta. */}
      <div className="nn-field">
        <label htmlFor="coords-lat">{tt("coordsLatitude")}</label>
        <input
          id="coords-lat"
          name="latitude"
          type="text"
          inputMode="decimal"
          defaultValue={propuesta ? propuesta.latitude.toFixed(6) : ""}
          required
        />
      </div>
      <div className="nn-field">
        <label htmlFor="coords-lon">{tt("coordsLongitude")}</label>
        <input
          id="coords-lon"
          name="longitude"
          type="text"
          inputMode="decimal"
          defaultValue={propuesta ? propuesta.longitude.toFixed(6) : ""}
          required
        />
      </div>
      <div className="nn-field">
        <label htmlFor="coords-reason">{tt("coordsReason")}</label>
        <input id="coords-reason" name="reason" type="text" placeholder={tt("coordsReasonPlaceholder")} />
      </div>
      {distanciaALoDeclaradoM !== null && distanciaALoDeclaradoM > 50 ? (
        <p className="nn-muted">{tt("coordsDiffersFromDeclared", { metros: Math.round(distanciaALoDeclaradoM) })}</p>
      ) : null}
      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <BotonDeEnvio className="nn-button">{tt("coordsConfirm")}</BotonDeEnvio>
    </form>
  );
}
