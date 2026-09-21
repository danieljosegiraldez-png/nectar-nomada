"use client";

import { useState } from "react";
import { CampoNumerico } from "../components/CampoNumerico";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { guardarEstanteFormAction } from "../actions/instalaciones";
import { BotonDeEnvio } from "../components/BotonDeEnvio";

// Espejo de MAX_NIVELES/MAX_PUESTOS en lib/traceability/estantes.ts — no se
// importan de ahí porque ese módulo trae `prisma`, y `pg` no se puede empaquetar
// para el navegador (`tls`, `util/types`). Son sólo el límite del `<input>`;
// el servidor vuelve a validar con las constantes reales.
const MAX_NIVELES = 20;
const MAX_PUESTOS = 50;

type Props =
  | { facilityId: string; existente?: undefined }
  | { facilityId?: undefined; existente: { id: string; niveles: number; puestos: number } };

export function FormularioEstante(props: Props) {
  const t = useTranslations("Secado");
  const [state, action] = useActionState(guardarEstanteFormAction, {});
  const { existente } = props;
  const [niveles, setNiveles] = useState(existente?.niveles ?? "");
  const [puestos, setPuestos] = useState(existente?.puestos ?? "");
  const total = Number(niveles) > 0 && Number(puestos) > 0 ? Number(niveles) * Number(puestos) : null;
  return <form action={action}>
    {state.error && <p role="alert">{t(`error_${state.error}`)}</p>}
    {existente
      ? <input type="hidden" name="rackId" value={existente.id} />
      : <>
        <input type="hidden" name="facilityId" value={props.facilityId} />
        <label>{t("nombreEstante")}<input name="nombre" required maxLength={120} /></label>
      </>}
    <label>{t("niveles")}<CampoNumerico name="niveles" min={1} max={MAX_NIVELES} step={1} required
      value={niveles} onChange={(e) => setNiveles(e.target.value)} /></label>
    <label>{t("puestos")}<CampoNumerico name="puestos" min={1} max={MAX_PUESTOS} step={1} required
      value={puestos} onChange={(e) => setPuestos(e.target.value)} /></label>
    {total != null && <p>{t("resumenEstante", { niveles, puestos, total })}</p>}
    <p className="nn-muted">{t("estanteAyuda")}</p>
    <BotonDeEnvio>{t(existente ? "ampliarEstante" : "crearEstante")}</BotonDeEnvio>
  </form>;
}
