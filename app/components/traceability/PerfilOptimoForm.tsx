"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { elegirPerfilDeTuesteAction, type TraceabilityActionState } from "../../actions/traceability";

const initialState: TraceabilityActionState = {};

interface PerfilOption {
  id: string;
  label: string;
}

/**
 * Marcar cuál de los perfiles es el óptimo PARA ESTE LOTE.
 *
 * Decisión de Daniel (2026-09-06): «óptimo» vive en la relación perfil↔lote y no
 * en el perfil, porque un perfil puede ser el bueno para un café y no para otro.
 *
 * Hay uno vigente: elegir otro reemplaza al anterior, y el cambio queda en el
 * registro de auditoría. Por eso el botón dice «elegir» y no «añadir».
 */
export function PerfilOptimoForm({
  lotId,
  perfiles,
  actual,
}: {
  lotId: string;
  perfiles: PerfilOption[];
  /** El vigente, para que el desplegable abra en él y se vea qué se reemplaza. */
  actual: string | null;
}) {
  const [state, formAction, pending] = useActionState(elegirPerfilDeTuesteAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="po-recipeVersionId">{t("roastProfileOptimalLabel")}</label>
        <select id="po-recipeVersionId" name="recipeVersionId" defaultValue={actual ?? ""} required>
          <option value="" disabled>
            {t("roastProfileChoosePlaceholder")}
          </option>
          {perfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="po-notes">{t("roastProfileWhyLabel")}</label>
        <input id="po-notes" name="notes" type="text" placeholder={t("roastProfileWhyPlaceholder")} />
      </div>
      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {actual ? t("roastProfileReplaceButton") : t("roastProfileChooseButton")}
      </button>
    </form>
  );
}
