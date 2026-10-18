"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { guardarBeneficioFormAction } from "../../actions/beneficios";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";

type Props = {
  padres?: { id: string; name: string }[];
  /** Organizaciones donde se puede crear un beneficio sin finca (ADR-198). Vacía = esa opción no se ofrece. */
  organizaciones?: { id: string; name: string }[];
  existente?: { id: string; name: string };
};
const SIN_FINCA = "__sin_finca__";
export function FormularioBeneficio({ padres, organizaciones = [], existente }: Props) {
  const t = useTranslations("AjustesDelBeneficio");
  const [state, action] = useActionState(guardarBeneficioFormAction, {});
  const [padre, setPadre] = useState("");
  const ofreceSinFinca = !existente && organizaciones.length > 0;
  const sinFinca = ofreceSinFinca && padre === SIN_FINCA;
  return <form action={action}>
    {state.error && <p role="alert">{t(`error_${state.error}`)}</p>}
    {existente && <input type="hidden" name="locationId" value={existente.id} />}
    {(padres || ofreceSinFinca) && <label>{t("sitio")}
      {/* `name` solo cuando hay finca: la opción «sin finca» no manda padre y el servidor lo lee como tal. */}
      <select name={sinFinca ? undefined : "parentLocationId"} required value={padre} onChange={(e) => setPadre(e.target.value)}>
        <option value="" disabled>{t("sinSeleccion")}</option>
        {ofreceSinFinca && <option value={SIN_FINCA}>{t("sinFincaOpcion")}</option>}
        {(padres ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>}
    {sinFinca && <label>{t("organizacion")}<select name="organizationId" required defaultValue="">
      <option value="" disabled>{t("sinSeleccionOrganizacion")}</option>
      {organizaciones.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select></label>}
    <label>{t("nombre")}<input name="name" required maxLength={120} defaultValue={existente?.name ?? ""} /></label>
    <BotonDeEnvio>{t(existente ? "guardar" : "crear")}</BotonDeEnvio>
  </form>;
}
