"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { crearTipoAction, registrarBandejasAction, registrarPesajeAction, type BandejaFormState } from "../../actions/bandejas";
import { moverBandejaAction } from "../../actions/bandejasDelSecado";
import { claveDeErrorDeSecado } from "./errorDeSecado";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";
import { CampoNumerico } from "../../components/CampoNumerico";
import { TimezoneOffsetField } from "../../components/TimezoneOffsetField";
import { paraCampoLocal } from "../../../lib/time/localDateTime";
import type { PosicionParaMover } from "../../../lib/traceability/bandejasDelSecado";

const inicial: BandejaFormState = {};

// Espejo de MAX_TANDA en lib/equipos/bandejas.ts — no se importa de ahí porque
// ese módulo trae `prisma` y no se puede empaquetar para el navegador (`pg`,
// `tls`), la misma razón que FormularioEstante.tsx mira antes de nombrar
// MAX_NIVELES/MAX_PUESTOS. Sólo es el tope del `<input>`; el servidor vuelve a
// validar contra la constante real.
const MAX_TANDA = 400;

function Resultado({ state }: { state: BandejaFormState }) {
  const t = useTranslations("Bandejas");
  return (
    <>
      {state.error && <p role="alert">{t(`error_${state.error}`)}</p>}
      {state.ok && <p role="status">{state.ok}</p>}
    </>
  );
}

export function FormularioNuevoTipo({ organizationId }: { organizationId: string }) {
  const t = useTranslations("Bandejas");
  const [state, action] = useActionState(crearTipoAction, inicial);
  return (
    <form action={action}>
      <input type="hidden" name="organizationId" value={organizationId} />
      <Resultado state={state} />
      <label>
        {t("nombre")}
        <input name="nombre" required maxLength={60} />
      </label>
      <label>
        {t("ancho")}
        <CampoNumerico name="ancho" min={0.1} step="any" required />
      </label>
      <label>
        {t("largo")}
        <CampoNumerico name="largo" min={0.1} step="any" required />
      </label>
      <label>
        {t("unidad")}
        <select name="unidad" defaultValue="ft">
          <option value="ft">{t("unidad_ft")}</option>
          <option value="cm">{t("unidad_cm")}</option>
        </select>
      </label>
      <BotonDeEnvio>{t("crearTipo")}</BotonDeEnvio>
    </form>
  );
}

export function FormularioRegistrarBandejas({
  sitios,
  tipos,
}: {
  sitios: { id: string; name: string }[];
  tipos: { id: string; nombre: string }[];
}) {
  const t = useTranslations("Bandejas");
  const [state, action] = useActionState(registrarBandejasAction, inicial);
  return (
    <form action={action}>
      <Resultado state={state} />
      <label>
        {t("sitio")}
        <select name="siteId" required defaultValue="">
          <option value="" disabled>
            {t("sinSeleccion")}
          </option>
          {sitios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("tipo")}
        <select name="trayTypeId" required defaultValue="">
          <option value="" disabled>
            {t("sinSeleccion")}
          </option>
          {tipos.map((tp) => (
            <option key={tp.id} value={tp.id}>
              {tp.nombre}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("cantidad")}
        <CampoNumerico name="cantidad" min={1} max={MAX_TANDA} step={1} required />
      </label>
      <BotonDeEnvio>{t("registrarBandejasBoton")}</BotonDeEnvio>
    </form>
  );
}

const ESTADOS = ["CHERRY", "MUCILAGE_HONEY", "PARCHMENT"] as const;

export function FormularioPesaje({
  tipos,
  lotes,
}: {
  tipos: { id: string; nombre: string }[];
  lotes: { id: string; lotCode: string }[];
}) {
  const t = useTranslations("Bandejas");
  const [state, action] = useActionState(registrarPesajeAction, inicial);
  // El «ahora» se escribe al montar, no en el servidor: ahí el reloj de pared
  // sería el del servidor (UTC en producción). Igual que MeasurementForm.
  //
  // **Sin `[]`, y eso es el arreglo, no un descuido.** Con el array vacío el efecto corre una vez:
  // React vacía el valor del DOM en cuanto este formulario se re-renderiza —y `useActionState` lo
  // re-renderiza en cada envío— y nadie lo vuelve a rellenar. El campo es obligatorio, así que el
  // navegador **bloquea el envío siguiente sin decir nada**: el botón responde, la acción no se
  // dispara y no aparece ningún error. Es el mismo defecto que el PR #564 quitó de
  // `MeasurementForm`, con el mismo mecanismo y el mismo arreglo; aquí sobrevivió porque el guardia
  // sólo miraba `TimezoneOffsetField.tsx`.
  //
  // El `!value` de dentro es lo que hace segura la reaplicación: sólo rellena cuando está vacío,
  // así que nunca pisa la hora que el operario corrigió.
  const cuandoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (cuandoRef.current && !cuandoRef.current.value) cuandoRef.current.value = paraCampoLocal(new Date());
  });
  return (
    <form action={action}>
      <Resultado state={state} />
      <p className="nn-muted">{t("protocoloPesaje")}</p>
      <label>
        {t("tipo")}
        <select name="trayTypeId" required defaultValue="">
          <option value="" disabled>
            {t("sinSeleccion")}
          </option>
          {tipos.map((tp) => (
            <option key={tp.id} value={tp.id}>
              {tp.nombre}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("estado")}
        <select name="materialState" required defaultValue="">
          <option value="" disabled>
            {t("sinSeleccion")}
          </option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {t(`estado_${e}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("lote")}
        <select name="lotId" required defaultValue="">
          <option value="" disabled>
            {t("sinSeleccion")}
          </option>
          {lotes.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lotCode}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("kgNetos")}
        <CampoNumerico name="netKg" min={0.01} step="any" required />
      </label>
      <label>
        {t("profundidad", { numero: 1 })}
        <CampoNumerico name="profundidad1" min={0.1} step="0.1" required />
      </label>
      <label>
        {t("profundidad", { numero: 2 })}
        <CampoNumerico name="profundidad2" min={0.1} step="0.1" required />
      </label>
      <label>
        {t("profundidad", { numero: 3 })}
        <CampoNumerico name="profundidad3" min={0.1} step="0.1" required />
      </label>
      <label>
        {t("profundidad4Opcional")}
        <CampoNumerico name="profundidad4" min={0.1} step="0.1" />
      </label>
      <label>
        {t("cuando")}
        <input ref={cuandoRef} name="occurredAt" type="datetime-local" defaultValue="" required />
      </label>
      <TimezoneOffsetField />
      <BotonDeEnvio>{t("registrarPesajeBoton")}</BotonDeEnvio>
    </form>
  );
}

/**
 * Paso 3b (secado-2b, Tarea 3): mover una bandeja desde `/beneficio/bandejas`
 * —la vía de quien CONFIGURA equipos, y la única para una bandeja vacía, que
 * no tiene ficha de lote—. `posiciones` ya llega filtrada a las que esta
 * cuenta puede ver y mover (`posicionesParaMover`, D1).
 */
export function FormularioMoverBandeja({ equipmentId, posiciones }: { equipmentId: string; posiciones: PosicionParaMover[] }) {
  const t = useTranslations("BandejasDelSecado");
  const [state, action] = useActionState(moverBandejaAction, {} as { error?: string });
  const lugar = (nombre: string | null, oculto: boolean | undefined) => nombre ?? (oculto ? t("lugarOculto") : "—");
  if (posiciones.length === 0) return <p className="nn-muted">{t("sinPosicionesParaMover")}</p>;
  return (
    <form action={action} style={{ display: "inline-flex", gap: "0.25rem" }}>
      <input type="hidden" name="equipmentId" value={equipmentId} />
      {state.error && <p role="alert">{t(claveDeErrorDeSecado(state.error) as "error_bandeja_ocupada")}</p>}
      <select name="posicionId" required defaultValue="">
        <option value="" disabled>{t("moverA")}</option>
        {posiciones.map((p) => (
          <option key={p.id} value={p.id}>
            {t("posicion", {
              instalacion: lugar(p.instalacion, p.instalacionOculta),
              estante: lugar(p.estante, p.estanteOculto),
              nivel: p.nivel,
              puesto: p.puesto,
            })}
            {p.ocupada ? ` — ${p.ocupadaPor ? t("ocupadaPor", { bandeja: p.ocupadaPor }) : t("ocupada")}` : ""}
          </option>
        ))}
      </select>
      <BotonDeEnvio className="nn-button">{t("mover")}</BotonDeEnvio>
    </form>
  );
}
