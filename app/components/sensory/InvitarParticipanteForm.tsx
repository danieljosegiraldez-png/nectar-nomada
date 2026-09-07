"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { invitarParticipanteAction, type SensoryActionState } from "../../actions/sensory";

const initialState: SensoryActionState = {};

/**
 * Invitar a alguien a puntuar en esta cata.
 *
 * Hasta hoy los participantes sólo se podían meter a mano en la base, así que
 * una cata la puntuaba quien alguien hubiera metido — o nadie. El invitado
 * recibe el perfil de juez **acotado a esta sesión**: puede puntuar aquí y en
 * ningún otro sitio.
 */
export function InvitarParticipanteForm({
  sessionId,
  invitables,
}: {
  sessionId: string;
  invitables: { id: string; displayName: string; estado: string }[];
}) {
  const [state, formAction, pending] = useActionState(invitarParticipanteAction, initialState);
  const t = useTranslations("Sensory");

  if (invitables.length === 0) return <p className="nn-muted">{t("noOneLeftToInvite")}</p>;

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="nn-field">
        <label htmlFor="ip-invitado">{t("inviteLabel")}</label>
        <select id="ip-invitado" name="invitadoUserAccountId" required defaultValue="">
          <option value="" disabled>
            {t("invitePlaceholder")}
          </option>
          {invitables.map((i) => (
            <option key={i.id} value={i.id}>
              {i.displayName}
              {i.estado === "invited" ? ` · ${t("inviteNotSignedInYet")}` : ""}
            </option>
          ))}
        </select>
      </div>
      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("inviteButton")}
      </button>
    </form>
  );
}
