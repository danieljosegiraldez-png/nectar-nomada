"use client";

import { useTranslations } from "next-intl";
import { createColonyFormAction } from "../../actions/apiary";
import { BotonDeEnvio } from "../BotonDeEnvio";

const ORIGIN_TYPES = ["purchased", "captured", "split", "other"] as const;

export interface OrigenDeColonia {
  id: string;
  value: string;
}

/** Online-only — same reasoning as NewHiveForm. */
export function NewColonyForm({
  apiaryId,
  hiveId,
  origenes,
}: {
  apiaryId: string;
  hiveId: string;
  /** Del catálogo `origen_de_colonia`, no de una lista escrita aquí. */
  origenes: readonly OrigenDeColonia[];
}) {
  const t = useTranslations("Apiary");

  return (
    <form action={createColonyFormAction} className="nn-form" style={{ maxWidth: 420 }}>
      <input type="hidden" name="apiaryId" value={apiaryId} />
      <input type="hidden" name="hiveId" value={hiveId} />
      <div className="nn-field">
        <label htmlFor="colony-origin-type">{t("originTypeLabel")}</label>
        <select id="colony-origin-type" name="originType" defaultValue="purchased" required>
          {ORIGIN_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`originType_${type}`)}
            </option>
          ))}
        </select>
      </div>

      {/* A9.10 (D6) — de dónde vino el pie, agrupable. Va DESPUÉS del tipo
          porque son dos preguntas distintas: el tipo dice cómo se obtuvo
          (comprada, capturada, división) y esto dice de dónde. Sin `required`:
          el catálogo no puede tener todavía todos los orígenes que existen, y
          bloquear la instalación de una colonia por eso sería peor que un
          «sin registro». Se ofrece sólo si el catálogo tiene algo. */}
      {origenes.length > 0 ? (
        <div className="nn-field">
          <label htmlFor="colony-origin-source">{t("originSourceLabel")}</label>
          <select id="colony-origin-source" name="originSourceValueId" defaultValue="">
            <option value="" />
            {origenes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.value}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="nn-field">
        <label htmlFor="colony-origin-note">{t("originNoteLabel")}</label>
        <input id="colony-origin-note" name="originNote" type="text" placeholder={t("originNotePlaceholder")} />
      </div>
      <BotonDeEnvio className="nn-button">
        {t("createColonyButton")}
      </BotonDeEnvio>
    </form>
  );
}
