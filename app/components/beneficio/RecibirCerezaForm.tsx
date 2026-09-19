"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  anularRecepcionAction,
  confirmarFotoDeRecepcionAction,
  crearProveedorAction,
  pedirSubidaDeFotoDeRecepcionAction,
  recibirCerezaAction,
  type RecepcionActionState,
} from "../../actions/recepcionDeCereza";
import { TimezoneOffsetField } from "../TimezoneOffsetField";
import { CampoNumerico } from "../CampoNumerico";
import { ahoraEnElCampo } from "../traceability/AnotarEntregaForm";

const inicial: RecepcionActionState = {};
const PUNTOS = ["CHERRY_PULP", "MUCILAGE_PRESSED", "TANK_LIQUID_MID", "TANK_LIQUID_SURFACE", "PARCHMENT_BED"] as const;

export interface PedidoElegible {
  id: string;
  etiqueta: string;
  /** «F:<sitio>» o «P:<organización>», la misma forma que lee la acción de pedidos. */
  fuente: string;
}

/**
 * Recibir o rechazar cereza (spec recepción §3.4): una entrega de la finca (`entregaId`) o cereza de
 * fuera (`proveedores`). La clave de envío la genera el navegador al montar el formulario y se
 * renueva tras cada recepción guardada: un doble envío del mismo formulario guarda una sola.
 */
export function RecibirCerezaForm({
  beneficioId,
  entregaId,
  fuenteDeLaEntrega,
  proveedores,
  pedidos,
}: {
  beneficioId: string;
  entregaId?: string;
  fuenteDeLaEntrega?: string;
  proveedores?: { id: string; name: string }[];
  pedidos: PedidoElegible[];
}) {
  const t = useTranslations("Recepcion");
  const [state, formAction, pending] = useActionState(recibirCerezaAction, inicial);
  const [modo, setModo] = useState<"recibir" | "rechazar">("recibir");
  const [proveedor, setProveedor] = useState("");
  const fuente = fuenteDeLaEntrega ?? (proveedor ? `P:${proveedor}` : "");
  const elegibles = pedidos.filter((p) => p.fuente === fuente);
  const id = (c: string) => `recibir-${c}-${entregaId ?? "fuera"}`;

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="beneficioId" value={beneficioId} />
      {/* La clave la escribe el navegador al montar el campo. El `key` cambia con cada resultado
          (guardada o rechazada), así que tras cada uno nace un campo vacío con clave nueva; si la
          respuesta se pierde, el estado no cambia, la clave tampoco, y el reintento es idempotente. */}
      <input
        key={JSON.stringify(state)}
        type="hidden"
        name="claveDeEnvio"
        ref={(el) => {
          if (el && !el.value) el.value = crypto.randomUUID();
        }}
      />
      {entregaId ? <input type="hidden" name="entregaId" value={entregaId} /> : null}
      <TimezoneOffsetField />
      <fieldset className="nn-field">
        <legend>{t("queHaces")}</legend>
        <label style={{ display: "inline-block", marginRight: "1rem" }}>
          <input type="radio" name="modo" value="recibir" checked={modo === "recibir"} onChange={() => setModo("recibir")} /> {t("recibir")}
        </label>
        <label style={{ display: "inline-block" }}>
          <input type="radio" name="modo" value="rechazar" checked={modo === "rechazar"} onChange={() => setModo("rechazar")} /> {t("rechazar")}
        </label>
      </fieldset>
      {proveedores ? (
        <>
          <div className="nn-field">
            <label htmlFor={id("proveedor")}>{t("proveedor")}</label>
            <select id={id("proveedor")} name="proveedorId" required value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
              <option value="" disabled>{t("elegir")}</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="nn-field">
            <label htmlFor={id("declarado")}>{t("pesoDeclarado")}</label>
            <input id={id("declarado")} name="pesoDeclaradoKg" type="text" inputMode="decimal" />
          </div>
        </>
      ) : null}
      {elegibles.length ? (
        <div className="nn-field">
          <label htmlFor={id("pedido")}>{t("pedido")}</label>
          <select id={id("pedido")} name="pedidoId" defaultValue="" key={fuente}>
            <option value="">{t("sinPedido")}</option>
            {elegibles.map((p) => (
              <option key={p.id} value={p.id}>{p.etiqueta}</option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="nn-field">
        <label htmlFor={id("bruto")}>{t("bruto")}</label>
        <input id={id("bruto")} name="brutoKg" type="text" inputMode="decimal" required />
      </div>
      <div className="nn-field">
        <label htmlFor={id("recipientes")}>{t("recipientes")}</label>
        <CampoNumerico id={id("recipientes")} name="recipientes" min={0} step={1} inputMode="numeric" defaultValue={0} />
      </div>
      <div className="nn-field">
        <label htmlFor={id("tara")}>{t("tara")}</label>
        <input id={id("tara")} name="taraPorRecipienteKg" type="text" inputMode="decimal" defaultValue="0" />
      </div>
      <div className="nn-field">
        <label htmlFor={id("brix")}>{t("brix")}</label>
        <input id={id("brix")} name="brix" type="text" inputMode="decimal" />
      </div>
      <div className="nn-field">
        <label htmlFor={id("punto")}>{t("puntoDeMuestreo")}</label>
        <select id={id("punto")} name="puntoDeMuestreo" defaultValue="CHERRY_PULP">
          {PUNTOS.map((p) => (
            <option key={p} value={p}>{t(`punto_${p}`)}</option>
          ))}
        </select>
      </div>
      {modo === "rechazar" ? (
        <div className="nn-field">
          <label htmlFor={id("motivo")}>{t("motivoRechazo")}</label>
          <input id={id("motivo")} name="motivoRechazo" type="text" required maxLength={500} />
        </div>
      ) : null}
      <div className="nn-field">
        <label htmlFor={id("nota")}>{t("nota")}</label>
        <input id={id("nota")} name="nota" type="text" maxLength={1000} />
        <span className="nn-muted">{t("notaAyuda")}</span>
      </div>
      <div className="nn-field">
        <label htmlFor={id("hora")}>{t("recibidaAt")}</label>
        <input id={id("hora")} name="recibidaAt" type="datetime-local" required ref={ahoraEnElCampo} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {state.ok ? <p role="status">{t("guardada")}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {modo === "rechazar" ? t("rechazarBoton") : t("recibirBoton")}
      </button>
    </form>
  );
}

/** Anular una recepción con motivo: la entrega vuelve a pendiente. */
export function AnularRecepcionForm({ recepcionId }: { recepcionId: string }) {
  const t = useTranslations("Recepcion");
  const [state, formAction, pending] = useActionState(anularRecepcionAction, inicial);
  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="recepcionId" value={recepcionId} />
      <div className="nn-field">
        <label htmlFor={`anular-rec-${recepcionId}`}>{t("motivoAnulacion")}</label>
        <input id={`anular-rec-${recepcionId}`} name="motivo" type="text" required maxLength={500} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("anularBoton")}</button>
    </form>
  );
}

/** Dar de alta un productor de fuera, ahí mismo. */
export function NuevoProveedorForm() {
  const t = useTranslations("Recepcion");
  const [state, formAction, pending] = useActionState(crearProveedorAction, inicial);
  return (
    <form action={formAction} className="nn-form">
      <div className="nn-field">
        <label htmlFor="proveedor-nombre">{t("proveedorNombre")}</label>
        <input id="proveedor-nombre" name="nombre" type="text" required maxLength={120} />
      </div>
      <div className="nn-field">
        <label htmlFor="proveedor-lugar">{t("proveedorLugar")}</label>
        <input id="proveedor-lugar" name="lugar" type="text" maxLength={200} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {state.ok ? <p role="status">{t("proveedorCreado")}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("proveedorBoton")}</button>
    </form>
  );
}

/** La foto de una recepción: sube directo al almacenamiento y sólo entonces se crea el `Asset`. */
export function FotoDeRecepcionForm({ recepcionId }: { recepcionId: string }) {
  const t = useTranslations("Recepcion");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subir() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setSubiendo(true);
    setError(null);
    const contentType = file.type || "application/octet-stream";
    const pedido = await pedirSubidaDeFotoDeRecepcionAction(recepcionId, file.name, contentType);
    if ("error" in pedido) {
      setSubiendo(false);
      setError(pedido.error);
      return;
    }
    const put = await fetch(pedido.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
    if (!put.ok) {
      setSubiendo(false);
      setError(t("error_subida"));
      return;
    }
    const hecho = await confirmarFotoDeRecepcionAction(recepcionId, pedido.storageKey, contentType, file.size, file.name);
    setSubiendo(false);
    if ("error" in hecho) {
      setError(hecho.error);
      return;
    }
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="nn-form">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" aria-label={t("foto")} />
      {error ? <p className="nn-error" role="alert">{error}</p> : null}
      <button type="button" className="nn-button" disabled={subiendo} onClick={subir}>
        {subiendo ? t("subiendo") : t("subirFoto")}
      </button>
    </div>
  );
}
