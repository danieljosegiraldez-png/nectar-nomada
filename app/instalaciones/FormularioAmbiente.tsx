"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { registrarAmbienteFormAction } from "../actions/instalaciones";
import { BotonDeEnvio } from "../components/BotonDeEnvio";
import { CampoNumerico } from "../components/CampoNumerico";
import { TimezoneOffsetField } from "../components/TimezoneOffsetField";
import { OpcionesDePersona, type OpcionDePersona } from "../components/OpcionesDePersona";
import { CIELOS, VENTILACIONES } from "../../lib/traceability/secadoForm";
import { paraCampoLocal } from "../../lib/time/localDateTime";

type Estante = { id: string; name: string; niveles: number };

/**
 * Lo que hace falta para precargar una corrección. Son los campos de la
 * original, TODOS: una corrección es una fila nueva, así que lo que no se
 * reenvíe se pierde en silencio (`PENDING_IMPLEMENTATIONS/020`).
 */
export type LecturaACorregir = {
  id: string;
  /** ISO. Lo convierte a reloj de pared un efecto del navegador, nunca el servidor. */
  occurredAt: string;
  rackId: string | null;
  rackLevel: number | null;
  airTemperatureC: number | null;
  relativeHumidityPct: number | null;
  skyCondition: string | null;
  ventilation: string | null;
  notaCielo: string | null;
  notaVentilacion: string | null;
  operadorPersonId: string | null;
};

export function FormularioAmbiente({ facilityId, estantes, nivelesSinEstante, personas, corrigiendo }: {
  facilityId: string; estantes: Estante[]; nivelesSinEstante: number[]; personas: readonly OpcionDePersona[];
  corrigiendo?: LecturaACorregir;
}) {
  const t = useTranslations("Secado");
  const [state, action] = useActionState(registrarAmbienteFormAction, {});
  const [estanteId, setEstanteId] = useState(corrigiendo?.rackId ?? "");
  const niveles = estanteId
    ? Array.from({ length: estantes.find((e) => e.id === estanteId)?.niveles ?? 0 }, (_, i) => i + 1)
    : [...new Set([...nivelesSinEstante, ...estantes.flatMap((e) => Array.from({ length: e.niveles }, (_, i) => i + 1))])].sort((a, b) => a - b);

  /**
   * La hora se escribe en el DOM al montar, no se renderiza en el servidor:
   * `paraCampoLocal` depende de la zona del DISPOSITIVO, y en el servidor sería
   * la suya —0 en producción—, que es el fallo de cinco horas en silencio.
   *
   * **Sin array de dependencias, y sólo si el campo está vacío.** Las dos
   * mitades, con lo que cada una tiene medido detrás:
   *
   * - **sin array**, por el defecto del 2026-09-29 en `TimezoneOffsetField`:
   *   escribir en el `.value` de un nodo es escribir por detrás de React, y
   *   con `[]` no vuelve a escribirse nunca. Es también lo que vigila
   *   `tests/arquitectura/desfase-horario-sobrevive-al-render.test.ts`, cuyo
   *   flip-test sobre ESTE archivo cae como debe.
   *
   *   **Y una honestidad que el flip-test obligó a escribir:** se probó en vivo
   *   el 2026-10-01 con `[corrigiendo?.occurredAt]` —un array no vacío pero
   *   estable— en los dos caminos que este formulario tiene, guardar con éxito
   *   y recibir el error de «falta el motivo», y **la hora sobrevivió las dos
   *   veces igual que sin array**. Así que aquí no se afirma que el array
   *   arregle un fallo observado en esta pantalla: se escribe sin array porque
   *   es lo que la casa ya decidió para un valor que se escribe por detrás de
   *   React, y porque no puede desaparecer. El camino donde la diferencia SÍ se
   *   midió es el de aquel día, en otra pantalla.
   *
   * - **sólo si está vacío**, porque este campo SÍ lo edita el operario. Un
   *   efecto que escribe en cada render le borraría lo que acabe de teclear —
   *   que es por lo que `TimezoneOffsetField` puede escribir siempre y éste no:
   *   aquél es oculto y nadie lo toca.
   */
  const refCuando = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = refCuando.current;
    if (el && el.value === "") el.value = paraCampoLocal(new Date(corrigiendo?.occurredAt ?? Date.now()));
  });

  return <form action={action}>
    {state.error && <p role="alert">{t(`error_${state.error}`)}</p>}
    <TimezoneOffsetField />
    <input type="hidden" name="facilityLocationId" value={facilityId} />
    {corrigiendo ? <>
      <input type="hidden" name="supersedesId" value={corrigiendo.id} />
      <p>{t("ambienteCorrigiendo")}</p>
    </> : null}
    <label>{t("hora")}<input ref={refCuando} type="datetime-local" name="occurredAt" required defaultValue="" /></label>
    <label>{t("ambientePunto")}<select name="rackLocationId" value={estanteId} onChange={(e) => setEstanteId(e.target.value)}>
      <option value="">{t("ambientePuntoGeneral")}</option>
      {estantes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select></label>
    <label>{t("ambienteNivelOpcional")}<select name="rackLevel" defaultValue={corrigiendo?.rackLevel ?? ""} key={estanteId}>
      <option value="">—</option>
      {niveles.map((n) => <option key={n} value={n}>{t("nivel", { n })}</option>)}
    </select></label>
    {/* La temperatura se precarga en °C, la canónica y la que la pantalla
        enseña. La fila guarda el valor en °C y sólo CUÁL unidad se usó, así que
        reconstruir unos °F sería una conversión que nadie pidió. */}
    <label>{t("ambienteTemperatura")}<CampoNumerico name="temperatura" step="0.1" defaultValue={corrigiendo?.airTemperatureC ?? undefined} /></label>
    <label>{t("ambienteUnidad")}<select name="unidadTemperatura" defaultValue="C">
      <option value="C">°C</option><option value="F">°F</option>
    </select></label>
    <label>{t("ambienteHumedadRelativa")}<CampoNumerico name="humedadRelativaPct" step="0.1" min="0" max="100" defaultValue={corrigiendo?.relativeHumidityPct ?? undefined} /></label>
    <label>{t("ambienteCielo")}<select name="skyCondition" defaultValue={corrigiendo?.skyCondition ?? ""}>
      <option value="">—</option>
      {CIELOS.map((c) => <option key={c} value={c}>{t(`cielo_${c}`)}</option>)}
    </select></label>
    <label>{t("ambienteNotaCielo")}<input name="skyNote" maxLength={300} defaultValue={corrigiendo?.notaCielo ?? ""} /></label>
    <label>{t("ambienteVentilacion")}<select name="ventilation" defaultValue={corrigiendo?.ventilation ?? ""}>
      <option value="">—</option>
      {VENTILACIONES.map((v) => <option key={v} value={v}>{t(`ventilacion_${v}`)}</option>)}
    </select></label>
    <label>{t("ambienteNotaVentilacion")}<input name="ventilationNote" maxLength={300} defaultValue={corrigiendo?.notaVentilacion ?? ""} /></label>
    <label>{t("operador")}<select name="operatorPersonId" defaultValue={corrigiendo?.operadorPersonId ?? ""}>
      <option value="">{t("noDeclarado")}</option>
      <OpcionesDePersona personas={personas} />
    </select></label>
    {/* El motivo es obligatorio también en el navegador: el motor lanza
        `motivo_obligatorio`, y llegar al servidor para enterarse es un viaje de
        más. El `maxLength` es el mismo 300 de las demás notas, que es lo que
        `nota()` acota en el servicio. */}
    {corrigiendo ? (
      <label>{t("ambienteMotivo")}<textarea name="correctionReason" required maxLength={300} /></label>
    ) : null}
    <BotonDeEnvio>{t(corrigiendo ? "ambienteCorregir" : "ambienteRegistrar")}</BotonDeEnvio>
  </form>;
}
