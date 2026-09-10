"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { registrarFinDeColoniaFormAction } from "../../actions/apiary";
import { BotonDeEnvio } from "../BotonDeEnvio";
import { TimezoneOffsetField } from "../TimezoneOffsetField";

/**
 * Registrar que una colonia se perdió.
 *
 * **Va detrás de un paso deliberado, no abierto en la página.** Es una
 * transición de una vez y sin deshacer: marcar muerta la colonia equivocada con
 * el pulgar en el móvil es más fácil que corregirlo después. Por eso primero se
 * abre y luego se confirma, que es la única fricción que este formulario tiene.
 *
 * **La fecha se pide.** Es cuándo se perdió, no cuándo se anota — una pérdida se
 * suele registrar días después, y `endedAt` existe justo para no confundirlas.
 * Va con `TimezoneOffsetField` como todo instante del proyecto: sin el desfase
 * del dispositivo, un `datetime-local` se interpretaría en la zona del servidor,
 * que en producción es UTC.
 */
export interface CausaOfrecida {
  id: string;
  value: string;
  /** De dónde salió esta causa. Se enseña: ver el comentario del bloque. */
  definition: string | null;
}

export function FinDeColoniaForm({
  colonyId,
  revalidationPath,
  causas,
}: {
  colonyId: string;
  revalidationPath: string;
  causas: readonly CausaOfrecida[];
}) {
  const t = useTranslations("Apiary");
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button type="button" className="nn-button-quiet" onClick={() => setAbierto(true)}>
        {t("colonyEndOpenButton")}
      </button>
    );
  }

  return (
    <form action={registrarFinDeColoniaFormAction} className="nn-form" style={{ maxWidth: 420 }}>
      <input type="hidden" name="colonyId" value={colonyId} />
      <input type="hidden" name="revalidationPath" value={revalidationPath} />
      <TimezoneOffsetField />

      <p className="nn-muted">{t("colonyEndWarning")}</p>

      <div className="nn-field">
        <label htmlFor="colony-end-status">{t("colonyEndStatusLabel")}</label>
        {/* Sin preseleccionar: «murió» y «se fugó» son hechos distintos y el
            valor por defecto sería uno que nadie declaró. */}
        <select id="colony-end-status" name="status" defaultValue="" required>
          <option value="">{t("colonyEndStatusUnset")}</option>
          <option value="dead">{t("colonyStatus_dead")}</option>
          <option value="absconded">{t("colonyStatus_absconded")}</option>
          <option value="combined">{t("colonyStatus_combined")}</option>
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="colony-end-at">{t("colonyEndAtLabel")}</label>
        <input id="colony-end-at" name="endedAt" type="datetime-local" required />
      </div>

      {/* Las causas. UN control por causa, no dos.

          La forma obvia sería una casilla para elegirla y un desplegable al
          lado para decir cuán seguro estás — dos controles por fila, catorce
          filas, en un teléfono en el campo. Un solo desplegable de cuatro
          opciones dice las dos cosas: «no» es no elegirla, y las otras tres
          son cómo se estableció. Nada preseleccionado.

          Y se enseña la DEFINICIÓN de cada causa, que es lo que evita que
          alguien marque «Saqueo» queriendo decir «se fue»: son cosas distintas
          y el catálogo lo explica en una línea. */}
      <fieldset className="nn-field">
        <legend>{t("colonyEndCausesLegend")}</legend>
        <p className="nn-muted">{t("colonyEndCausesHelp")}</p>
        {causas.map((c) => (
          <div key={c.id} className="nn-field">
            <label htmlFor={`causa-${c.id}`}>{c.value}</label>
            <select id={`causa-${c.id}`} name={`causa:${c.id}`} defaultValue="">
              <option value="">{t("colonyEndCauseNo")}</option>
              <option value="hypothesis">{t("colonyEndCause_hypothesis")}</option>
              <option value="conclusion">{t("colonyEndCause_conclusion")}</option>
              <option value="direct_observation">{t("colonyEndCause_direct_observation")}</option>
            </select>
            {c.definition ? <p className="nn-muted">{c.definition}</p> : null}
          </div>
        ))}
      </fieldset>

      <div className="nn-field">
        <label htmlFor="colony-end-reason">{t("colonyEndReasonLabel")}</label>
        <input id="colony-end-reason" name="reason" type="text" placeholder={t("colonyEndReasonPlaceholder")} />
      </div>

      <BotonDeEnvio className="nn-button">{t("colonyEndButton")}</BotonDeEnvio>
      <button type="button" className="nn-button-quiet" onClick={() => setAbierto(false)}>
        {t("cancelButton")}
      </button>
    </form>
  );
}
