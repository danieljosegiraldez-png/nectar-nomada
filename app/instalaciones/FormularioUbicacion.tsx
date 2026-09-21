"use client";

import { CampoNumerico } from "../components/CampoNumerico";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { guardarInstalacionFormAction } from "../actions/instalaciones";
import { BotonDeEnvio } from "../components/BotonDeEnvio";
import { AMBIENTES_DE_SECADO, GRADOS_DE_SOMBRA } from "../../lib/traceability/secadoForm";

type Props = {
  tipo: "drying_facility" | "drying_bed";
  padres?: { id: string; name: string }[];
  parentLocationId?: string;
  existente?: { id: string; name: string; dryingEnvironment?: string | null; rackLevel?: number | null; shadePercentage?: string | null; shadeDescription?: string | null };
};
export function FormularioUbicacion({ tipo, padres, parentLocationId, existente }: Props) {
  const t = useTranslations("Secado");
  const [state, action] = useActionState(guardarInstalacionFormAction, {});
  return <form action={action}>
    {state.error && <p role="alert">{t(`error_${state.error}`)}</p>}
    <input type="hidden" name="locationType" value={tipo} />
    {existente && <input type="hidden" name="locationId" value={existente.id} />}
    {parentLocationId && <input type="hidden" name="parentLocationId" value={parentLocationId} />}
    {padres && <label>{t("sitio")}<select name="parentLocationId" required defaultValue="">
      <option value="" disabled>{t("sinSeleccion")}</option>
      {padres.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>}
    <label>{t("nombre")}<input name="name" required maxLength={120} defaultValue={existente?.name ?? ""} /></label>
    {tipo === "drying_facility"
      ? <label>{t("ambiente")}<select name="dryingEnvironment" defaultValue={existente?.dryingEnvironment ?? ""}>
        <option value="">{t("noDeclarado")}</option>
        {AMBIENTES_DE_SECADO.map((a) => <option key={a} value={a}>{t(`ambiente_${a}`)}</option>)}
      </select></label>
      : <label>{t("rack")}<CampoNumerico name="rackLevel" min={1} max={2147483647} step={1} defaultValue={existente?.rackLevel ?? ""} /><span className="nn-muted">{t("rackAyuda")}</span></label>}
    <label>{t("sombra")}<select name="shadePercentage" defaultValue={existente?.shadePercentage ?? ""}>
      <option value="">{t("noDeclarado")}</option>
      {GRADOS_DE_SOMBRA.map((g) => <option key={g} value={g}>{t(`sombra_${g}`)}</option>)}
    </select></label>
    <label>{t("sombraNota")}<input name="shadeDescription" maxLength={300} defaultValue={existente?.shadeDescription ?? ""} />
      <span className="nn-muted">{t(tipo === "drying_bed" ? "sombraAyudaCama" : "sombraAyuda")}</span></label>
    <BotonDeEnvio>{t(existente ? "guardar" : tipo === "drying_facility" ? "crearInstalacion" : "crearCama")}</BotonDeEnvio>
  </form>;
}
