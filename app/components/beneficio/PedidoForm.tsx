"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { cerrarPedidoAction, crearPedidoAction, type RecepcionActionState } from "../../actions/recepcionDeCereza";

const inicial: RecepcionActionState = {};

/**
 * Un pedido de cereza (spec recepción §3.3): a quién —finca propia o productor de fuera—, cuántos
 * kg con qué margen, y la calidad pedida, que se guarda ahora y se evalúa en la pieza 3.
 */
export function PedidoForm({
  beneficioId,
  fincas,
  proveedores,
}: {
  beneficioId: string;
  fincas: { id: string; name: string }[];
  proveedores: { id: string; name: string }[];
}) {
  const t = useTranslations("Recepcion");
  const [state, formAction, pending] = useActionState(crearPedidoAction, inicial);
  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="beneficioId" value={beneficioId} />
      <div className="nn-field">
        <label htmlFor="pedido-fuente">{t("fuente")}</label>
        <select id="pedido-fuente" name="fuente" required defaultValue="">
          <option value="" disabled>{t("elegir")}</option>
          {fincas.length ? (
            <optgroup label={t("fincasPropias")}>
              {fincas.map((f) => (
                <option key={f.id} value={`F:${f.id}`}>{f.name}</option>
              ))}
            </optgroup>
          ) : null}
          {proveedores.length ? (
            <optgroup label={t("productoresDeFuera")}>
              {proveedores.map((p) => (
                <option key={p.id} value={`P:${p.id}`}>{p.name}</option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="pedido-fecha">{t("fecha")}</label>
        <input id="pedido-fecha" name="fecha" type="date" required />
      </div>
      <div className="nn-field">
        <label htmlFor="pedido-kg">{t("kgPedidos")}</label>
        <input id="pedido-kg" name="kgPedidos" type="text" inputMode="decimal" required />
      </div>
      <div className="nn-field">
        <label htmlFor="pedido-margen">{t("margen")}</label>
        <input id="pedido-margen" name="margenCantidadPct" type="text" inputMode="decimal" defaultValue="0" />
      </div>
      <fieldset className="nn-field">
        <legend>{t("calidadPedida")}</legend>
        <label htmlFor="pedido-maduro">{t("minMaduro")}</label>
        <input id="pedido-maduro" name="minMaduroPct" type="text" inputMode="decimal" />
        <label htmlFor="pedido-verde">{t("maxVerde")}</label>
        <input id="pedido-verde" name="maxVerdePct" type="text" inputMode="decimal" />
        <label htmlFor="pedido-flotes">{t("maxFlotes")}</label>
        <input id="pedido-flotes" name="maxFlotesPct" type="text" inputMode="decimal" />
        <span className="nn-muted">{t("calidadAyuda")}</span>
      </fieldset>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {state.ok ? <p role="status">{t("pedidoCreado")}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("pedidoBoton")}</button>
    </form>
  );
}

/** Cerrar un pedido. Si falta más que el margen, el servicio pide la nota. */
export function CerrarPedidoForm({ pedidoId }: { pedidoId: string }) {
  const t = useTranslations("Recepcion");
  const [state, formAction, pending] = useActionState(cerrarPedidoAction, inicial);
  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <div className="nn-field">
        <label htmlFor={`cerrar-${pedidoId}`}>{t("notaDeCierre")}</label>
        <input id={`cerrar-${pedidoId}`} name="nota" type="text" maxLength={1000} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("cerrarPedidoBoton")}</button>
    </form>
  );
}
