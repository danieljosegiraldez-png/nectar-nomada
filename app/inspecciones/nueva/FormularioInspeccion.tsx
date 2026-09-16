"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { registrarInspeccionFormAction } from "../../actions/inspecciones";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";
import { TimezoneOffsetField } from "../../components/TimezoneOffsetField";
import { MATERIALES_DE_SECADO, PAPELES_DE_MUESTRA, ZONAS_DE_MUESTRA } from "../../../lib/traceability/secadoForm";

type Opcion = { id: string; name: string };
function Muestra({ numero }: { numero: number }) {
  const t = useTranslations("Secado");
  const [papel, setPapel] = useState("");
  return <fieldset>
    <legend>{t("muestra", { numero })}</legend>
    <label>{t("material")}<select name={`materialState_${numero}`} required defaultValue="">
      <option value="" disabled>{t("sinSeleccion")}</option>
      {MATERIALES_DE_SECADO.map((m) => <option key={m} value={m}>{t(`material_${m}`)}</option>)}
    </select></label>
    <label>{t("papel")}<select name={`samplingRole_${numero}`} required value={papel} onChange={(e) => setPapel(e.target.value)}>
      <option value="" disabled>{t("sinSeleccion")}</option>
      {PAPELES_DE_MUESTRA.map((p) => <option key={p} value={p}>{t(`papel_${p}`)}</option>)}
    </select></label>
    {papel === "ZONE" && <>
      <label>{t("zona")}<select name={`samplingZone_${numero}`} defaultValue="">
        <option value="">{t("zonaPorNota")}</option>
        {ZONAS_DE_MUESTRA.map((z) => <option key={z} value={z}>{t(`zona_${z}`)}</option>)}
      </select></label>
      <label>{t("notaZona")}<input name={`samplingZoneNote_${numero}`} maxLength={500} /></label>
    </>}
  </fieldset>;
}

export function FormularioInspeccion({ lotes, camas, personas }: { lotes: Opcion[]; camas: Opcion[]; personas: Opcion[] }) {
  const t = useTranslations("Secado");
  const [state, action] = useActionState(registrarInspeccionFormAction, {});
  return <form action={action}>
    {state.error && <p role="alert">{t(`error_${state.error}`)}</p>}
    <TimezoneOffsetField />
    <label>{t("lote")}<select name="lotId" required defaultValue="">
      <option value="" disabled>{t("sinSeleccion")}</option>
      {lotes.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select></label>
    <label>{t("cama")}<select name="dryingBedLocationId" required defaultValue="">
      <option value="" disabled>{t("sinSeleccion")}</option>
      {camas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select></label>
    <label>{t("hora")}<input type="datetime-local" name="occurredAt" required /></label>
    <label>{t("operador")}<select name="operatorPersonId" defaultValue="">
      <option value="">{t("noDeclarado")}</option>
      {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <p className="nn-muted">{t("papelAyuda")}</p>
    <Muestra numero={1} /><Muestra numero={2} />
    <label>{t("notas")}<textarea name="notes" rows={3} /></label>
    <BotonDeEnvio>{t("registrarInspeccion")}</BotonDeEnvio>
  </form>;
}
