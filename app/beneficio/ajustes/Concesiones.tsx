"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { concederEdicionFormAction, quitarEdicionFormAction } from "../../actions/beneficios";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";
import type { PersonaDelBeneficio } from "../../../lib/traceability/concesiones";

type Props = { beneficioId: string; personas: PersonaDelBeneficio[] };

/**
 * Plan 3, Task 2 — quién puede editar el beneficio, y el formulario para
 * conceder o quitar `location:edit_beneficio` por persona. Mismo estilo que
 * `FormularioBeneficio.tsx`: un `useActionState` por formulario, no uno
 * compartido, porque cada persona tiene el suyo con su propio estado de error.
 */
export function Concesiones({ beneficioId, personas }: Props) {
  const t = useTranslations("AjustesDelBeneficio");
  return <div>
    <h3>{t("concesionesTitulo")}</h3>
    <ul>
      {personas.map((p) => <li key={p.assignmentId}>
        <p>{p.persona} — {p.perfil} — {p.ambito} — {t(`estado_${p.estado}`)}</p>
        {/* Hallazgo B (ronda 2): `puedeGestionar` es la misma guardia que el
            servidor exige (hallazgo 1) — sin ella, esta pantalla ofrecía
            conceder/quitar sobre una asignación de ámbito más ancho (el
            sitio) que el actor no gestiona, y el servidor lo rechazaba. */}
        {p.estado === "sin_permiso" && (p.puedeGestionar
          ? <FormularioConceder beneficioId={beneficioId} assignmentId={p.assignmentId} />
          : <p className="nn-muted">{t("gestionadoEnOtroAmbito")}</p>)}
        {p.estado === "concedido" && (p.puedeGestionar
          ? <FormularioQuitar beneficioId={beneficioId} assignmentId={p.assignmentId} razon={p.razon} />
          : <p className="nn-muted">{t("gestionadoEnOtroAmbito")}</p>)}
      </li>)}
    </ul>
    <p className="nn-muted">{t("concesionAlcance")}</p>
  </div>;
}

function FormularioConceder({ beneficioId, assignmentId }: { beneficioId: string; assignmentId: string }) {
  const t = useTranslations("AjustesDelBeneficio");
  const [state, action] = useActionState(concederEdicionFormAction, {});
  return <form action={action}>
    {state.error && <p role="alert">{t(`error_${state.error}`)}</p>}
    <input type="hidden" name="beneficioId" value={beneficioId} />
    <input type="hidden" name="assignmentId" value={assignmentId} />
    <label>{t("razon")}<input name="reason" required /></label>
    <BotonDeEnvio>{t("conceder")}</BotonDeEnvio>
  </form>;
}

function FormularioQuitar({ beneficioId, assignmentId, razon }: { beneficioId: string; assignmentId: string; razon: string | null }) {
  const t = useTranslations("AjustesDelBeneficio");
  const [state, action] = useActionState(quitarEdicionFormAction, {});
  return <form action={action}>
    {state.error && <p role="alert">{t(`error_${state.error}`)}</p>}
    <input type="hidden" name="beneficioId" value={beneficioId} />
    <input type="hidden" name="assignmentId" value={assignmentId} />
    {razon && <p className="nn-muted">{t("razon")}: {razon}</p>}
    <BotonDeEnvio>{t("quitar")}</BotonDeEnvio>
  </form>;
}
