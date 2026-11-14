"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { crearCompromisoDePolinizacionAction } from "../../actions/apiary";
import { CampoNumerico } from "../CampoNumerico";
import { TimezoneOffsetField } from "../TimezoneOffsetField";
import { Ayuda } from "./Ayuda";

export interface OrganizacionOfrecida {
  id: string;
  name: string;
}

const VACIO = {
  clientOrganizationId: "",
  committedHectares: "",
  targetHivesPerHectareMin: "",
  targetHivesPerHectareMax: "",
  crop: "",
  parcelReference: "",
  startsAt: "",
  endsAt: "",
  bloomStartsAt: "",
  bloomEndsAt: "",
  notes: "",
};
type Campo = keyof typeof VACIO;

/**
 * **Abrir una meta de polinización** en un apiario — paso 12 del plan del Apiario (ADR-200 §6;
 * Anexo E §9: parcela y cultivo, cliente, hectáreas, ventana de floración y meta por hectárea).
 *
 * **Sin «colmenas comprometidas» ni «referencia al contrato»**, que el Anexo también nombra: no hay
 * nada pactado, y un número comprometido pasaría por delante de la meta en el aviso de floración
 * como si lo estuviera. Entran el día que exista un pacto, con su rótulo.
 *
 * **Los campos son controlados y el envío va por `onSubmit`, las dos cosas a propósito.** Con
 * `<form action>`, React 19 reinicia el formulario al terminar la acción (`CLAUDE.md`, «un formulario
 * rechazado se vacía»): un rechazo tiraría once campos, y un `<select>` controlado se quedaba en otra
 * opción que su estado no sabía (revisión del paso 12). Enviando con `onSubmit` no hay reinicio, y lo
 * escrito sigue donde estaba. Es el patrón de `RondaDeTrampaForm`.
 *
 * **«Empieza» no viene con «hoy» puesto**: una fecha de día que nadie dio no se rellena (la regla de
 * la limpieza de caja en `app/actions/apiary.ts`), y «hoy» en UTC es mañana en Panamá desde las 19:00.
 */
export function CompromisoDePolinizacionForm({
  locationId,
  organizaciones,
}: {
  locationId: string;
  organizaciones: readonly OrganizacionOfrecida[];
}) {
  const t = useTranslations("Apiary");
  const [v, setV] = useState(VACIO);
  // Guardada, se vacía: con los campos controlados, otro toque sobre lo mismo crearía una segunda meta.
  const [state, formAction, pending] = useActionState(
    async (prev: { error?: string; ok?: boolean }, datos: FormData) => {
      const r = await crearCompromisoDePolinizacionAction(prev, datos);
      if (r.ok) setV(VACIO);
      return r;
    },
    {},
  );
  const [, empezar] = useTransition();
  const alEnviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Del DOM, no del estado: así viaja también el desfase que `TimezoneOffsetField` escribe en él.
    const datos = new FormData(e.currentTarget);
    empezar(() => formAction(datos));
  };
  const campo = (nombre: Campo) => ({
    id: `poli-${nombre}`,
    name: nombre,
    value: v[nombre],
    onChange: (e: { target: { value: string } }) => setV((prev) => ({ ...prev, [nombre]: e.target.value })),
  });

  return (
    <form onSubmit={alEnviar} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      <TimezoneOffsetField />

      <div className="nn-field">
        <label htmlFor="poli-clientOrganizationId">{t("pollinationClienteLabel")}</label>
        <select {...campo("clientOrganizationId")} required>
          <option value="" disabled />
          {organizaciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <Ayuda resumen={t("ayudaResumen")}>{t("pollinationClienteAyuda")}</Ayuda>
      </div>

      <div className="nn-field">
        <label htmlFor="poli-crop">{t("pollinationCultivoLabel")}</label>
        <input {...campo("crop")} type="text" />
      </div>
      <div className="nn-field">
        <label htmlFor="poli-parcelReference">{t("pollinationParcelaLabel")}</label>
        <input {...campo("parcelReference")} type="text" />
      </div>

      <div className="nn-field">
        <label htmlFor="poli-committedHectares">{t("pollinationAreaLabel")}</label>
        <CampoNumerico {...campo("committedHectares")} step="0.01" min="0" inputMode="decimal" required />
      </div>
      <div className="nn-field">
        <label htmlFor="poli-targetHivesPerHectareMin">{t("pollinationMetaMinLabel")}</label>
        <CampoNumerico {...campo("targetHivesPerHectareMin")} step="0.1" min="0" inputMode="decimal" required />
      </div>
      <div className="nn-field">
        <label htmlFor="poli-targetHivesPerHectareMax">{t("pollinationMetaMaxLabel")}</label>
        <CampoNumerico {...campo("targetHivesPerHectareMax")} step="0.1" min="0" inputMode="decimal" required />
        <Ayuda resumen={t("ayudaResumen")}>{t("pollinationMetaAyuda")}</Ayuda>
      </div>

      <div className="nn-field">
        <label htmlFor="poli-startsAt">{t("pollinationInicioLabel")}</label>
        <input {...campo("startsAt")} type="date" required />
      </div>
      <div className="nn-field">
        <label htmlFor="poli-endsAt">{t("pollinationFinLabel")}</label>
        <input {...campo("endsAt")} type="date" />
      </div>

      <div className="nn-field">
        <label htmlFor="poli-bloomStartsAt">{t("pollinationFloracionDesdeLabel")}</label>
        <input {...campo("bloomStartsAt")} type="date" />
        <Ayuda resumen={t("ayudaResumen")}>{t("pollinationFloracionAyuda")}</Ayuda>
      </div>
      <div className="nn-field">
        <label htmlFor="poli-bloomEndsAt">{t("pollinationFloracionHastaLabel")}</label>
        <input {...campo("bloomEndsAt")} type="date" />
      </div>

      <div className="nn-field">
        <label htmlFor="poli-notes">{t("pollinationNotasLabel")}</label>
        <textarea {...campo("notes")} rows={2} />
        <Ayuda resumen={t("ayudaResumen")}>{t("pollinationNotasAyuda")}</Ayuda>
      </div>

      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="nn-detail-meta">{t("pollinationGuardada")}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("pollinationGuardar")}
      </button>
    </form>
  );
}
