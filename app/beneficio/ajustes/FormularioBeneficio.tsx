"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { guardarBeneficioFormAction } from "../../actions/beneficios";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";

type Props = {
  padres?: { id: string; name: string }[];
  existente?: { id: string; name: string };
};
export function FormularioBeneficio({ padres, existente }: Props) {
  const t = useTranslations("AjustesDelBeneficio");
  const [state, action] = useActionState(guardarBeneficioFormAction, {});
  return <form action={action}>
    {state.error && <p role="alert">{t(`error_${state.error}`)}</p>}
    {existente && <input type="hidden" name="locationId" value={existente.id} />}
    {padres && <label>{t("sitio")}<select name="parentLocationId" required defaultValue="">
      <option value="" disabled>{t("sinSeleccion")}</option>
      {padres.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>}
    <label>{t("nombre")}<input name="name" required maxLength={120} defaultValue={existente?.name ?? ""} /></label>
    <BotonDeEnvio>{t(existente ? "guardar" : "crear")}</BotonDeEnvio>
  </form>;
}
