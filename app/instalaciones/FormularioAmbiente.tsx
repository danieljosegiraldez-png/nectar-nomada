"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { registrarAmbienteFormAction } from "../actions/instalaciones";
import { BotonDeEnvio } from "../components/BotonDeEnvio";
import { CampoNumerico } from "../components/CampoNumerico";
import { TimezoneOffsetField } from "../components/TimezoneOffsetField";
import { CIELOS, VENTILACIONES } from "../../lib/traceability/secadoForm";

type Estante = { id: string; name: string; niveles: number };

export function FormularioAmbiente({ facilityId, estantes, nivelesSinEstante, personas }: {
  facilityId: string; estantes: Estante[]; nivelesSinEstante: number[]; personas: { id: string; name: string }[];
}) {
  const t = useTranslations("Secado");
  const [state, action] = useActionState(registrarAmbienteFormAction, {});
  const [estanteId, setEstanteId] = useState("");
  const niveles = estanteId
    ? Array.from({ length: estantes.find((e) => e.id === estanteId)?.niveles ?? 0 }, (_, i) => i + 1)
    : [...new Set([...nivelesSinEstante, ...estantes.flatMap((e) => Array.from({ length: e.niveles }, (_, i) => i + 1))])].sort((a, b) => a - b);
  return <form action={action}>
    {state.error && <p role="alert">{t(`error_${state.error}`)}</p>}
    <TimezoneOffsetField />
    <input type="hidden" name="facilityLocationId" value={facilityId} />
    <label>{t("hora")}<input type="datetime-local" name="occurredAt" required /></label>
    <label>{t("ambientePunto")}<select name="rackLocationId" value={estanteId} onChange={(e) => setEstanteId(e.target.value)}>
      <option value="">{t("ambientePuntoGeneral")}</option>
      {estantes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select></label>
    <label>{t("ambienteNivelOpcional")}<select name="rackLevel" defaultValue="" key={estanteId}>
      <option value="">—</option>
      {niveles.map((n) => <option key={n} value={n}>{t("nivel", { n })}</option>)}
    </select></label>
    <label>{t("ambienteTemperatura")}<CampoNumerico name="temperatura" step="0.1" /></label>
    <label>{t("ambienteUnidad")}<select name="unidadTemperatura" defaultValue="C">
      <option value="C">°C</option><option value="F">°F</option>
    </select></label>
    <label>{t("ambienteHumedadRelativa")}<CampoNumerico name="humedadRelativaPct" step="0.1" min="0" max="100" /></label>
    <label>{t("ambienteCielo")}<select name="skyCondition" defaultValue="">
      <option value="">—</option>
      {CIELOS.map((c) => <option key={c} value={c}>{t(`cielo_${c}`)}</option>)}
    </select></label>
    <label>{t("ambienteNotaCielo")}<input name="skyNote" maxLength={300} /></label>
    <label>{t("ambienteVentilacion")}<select name="ventilation" defaultValue="">
      <option value="">—</option>
      {VENTILACIONES.map((v) => <option key={v} value={v}>{t(`ventilacion_${v}`)}</option>)}
    </select></label>
    <label>{t("ambienteNotaVentilacion")}<input name="ventilationNote" maxLength={300} /></label>
    <label>{t("operador")}<select name="operatorPersonId" defaultValue="">
      <option value="">{t("noDeclarado")}</option>
      {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <BotonDeEnvio>{t("ambienteRegistrar")}</BotonDeEnvio>
  </form>;
}
