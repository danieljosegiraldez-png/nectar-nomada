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
export function FinDeColoniaForm({ colonyId, revalidationPath }: { colonyId: string; revalidationPath: string }) {
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
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="colony-end-at">{t("colonyEndAtLabel")}</label>
        <input id="colony-end-at" name="endedAt" type="datetime-local" required />
      </div>

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
