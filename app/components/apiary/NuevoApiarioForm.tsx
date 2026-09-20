"use client";

import { CampoNumerico } from "../CampoNumerico";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { crearApiarioFormAction, type EstadoDeApiario } from "../../actions/apiary";
import { BotonDeEnvio } from "../BotonDeEnvio";
import { Ayuda } from "./Ayuda";

interface Opcion {
  id: string;
  name: string;
}

/**
 * Dar de alta el sitio donde están las colmenas.
 *
 * **En línea y sin cola de sincronización**, igual que `NewHiveForm`: un
 * apiario se crea una vez, desde donde haya señal, y no en mitad de una visita.
 * Lo que sí va sin señal son la inspección y el evento de colonia, que es lo
 * que se captura con las manos sucias.
 *
 * Las coordenadas son opcionales a propósito. Un apiario que existe y no se
 * puede registrar porque falta el GPS es peor que uno registrado sin GPS, y
 * `CLAUDE.md` §3 dice que lo que falta se queda faltando.
 *
 * **No hay altitud ni notas**: `Location` guarda un RANGO de altitud, que
 * describe una parcela y no un punto, y no tiene columna de notas. Ver el
 * comentario en `crearApiario`.
 */
export function NuevoApiarioForm({
  organizaciones,
  proyectos,
  lugares,
}: {
  organizaciones: Opcion[];
  proyectos: Opcion[];
  /** Fincas, parcelas y microparcelas donde puede colgar el sitio (ADR-145). */
  lugares: { id: string; name: string; locationType: string }[];
}) {
  const t = useTranslations("Apiary");
  // Un nombre en blanco o un ámbito insuficiente eran un 500 hasta el 2026-09-19.
  const [state, formAction] = useActionState(crearApiarioFormAction, {} as EstadoDeApiario);

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 520 }}>
      <div className="nn-field">
        {/* **Qué es, primero.** El dueño lo decidió el 2026-09-16: «tener meliponiarios y
            tener apiarios separado». Va arriba porque cambia lo que significa todo lo demás —
            la caja, el manejo y lo que se pregunta al revisar. */}
        <label htmlFor="ap-tipo">{t("sitioTipoLabel")}</label>
        <select id="ap-tipo" name="tipo" required defaultValue="apiary_site">
          <option value="apiary_site">{t("locationType_apiary_site")}</option>
          <option value="meliponary">{t("locationType_meliponary")}</option>
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="ap-name">{t("apiaryNameLabel")}</label>
        <input id="ap-name" name="name" type="text" required maxLength={200} placeholder="Apiario 3 — Finca Rosina" />
      </div>

      <div className="nn-field">
        <label htmlFor="ap-org">{t("apiaryOrganizationLabel")}</label>
        <select id="ap-org" name="organizationId" required defaultValue="">
          <option value="" disabled />
          {organizaciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <Ayuda resumen={t("ayudaResumen")}>{t("apiaryOrganizationHelp")}</Ayuda>
      </div>

      {proyectos.length > 0 ? (
        <div className="nn-field">
          <label htmlFor="ap-project">{t("projectLabel")}</label>
          <select id="ap-project" name="projectId" defaultValue="">
            <option value="">{t("noProjectOption")}</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="nn-field">
        {/* **De qué lugar cuelga.** Hasta hoy no se podía decir, así que un apiario creado
            aquí nacía huérfano y no aparecía bajo su finca en la lista agrupada. Vacío sigue
            siendo legítimo: un sitio suelto es mejor que un padre inventado. */}
        <label htmlFor="ap-padre">{t("sitioPadreLabel")}</label>
        <select id="ap-padre" name="parentLocationId" defaultValue="">
          <option value="">{t("sitioPadreNinguno")}</option>
          {lugares.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} · {t(`locationType_${l.locationType}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="ap-lat">{t("apiaryLatitudeLabel")}</label>
        <CampoNumerico id="ap-lat" name="latitude" inputMode="decimal" step="0.000001" min="-90" max="90" />
      </div>

      <div className="nn-field">
        <label htmlFor="ap-lon">{t("apiaryLongitudeLabel")}</label>
        <CampoNumerico id="ap-lon" name="longitude" inputMode="decimal" step="0.000001" min="-180" max="180" />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <BotonDeEnvio>{t("apiaryCreateButton")}</BotonDeEnvio>
    </form>
  );
}
