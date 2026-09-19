"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  confirmarFotoDeSituacionAction,
  pedirSubidaDeFotoDeSituacionAction,
  reportarSituacionAction,
  type JornadaActionState,
} from "../../actions/jornadasDeCosecha";
import { TimezoneOffsetField } from "../TimezoneOffsetField";
import { OpcionesDeOrigen, ahoraEnElCampo, type OrigenesDeJornada } from "./AnotarEntregaForm";

const inicial: JornadaActionState = {};

interface Opcion {
  id: string;
  value: string;
}

/**
 * «Reportar algo del campo» (spec jornada y entrega §3.5): una situación sobre lo asignado —tipo
 * del catálogo, «otro» con nota— o la condición del día de una parcela, sin valor medido. La
 * foto va aparte, en `FotoDeSituacionForm`, porque sube directo al almacenamiento.
 */
export function ReportarSituacionForm({
  jornadaId,
  origenes,
  parcelaIds,
  tipos,
  condiciones,
}: {
  jornadaId: string;
  origenes: OrigenesDeJornada;
  parcelaIds: string[];
  tipos: Opcion[];
  condiciones: Opcion[];
}) {
  const t = useTranslations("Jornadas");
  const [state, formAction, pending] = useActionState(reportarSituacionAction, inicial);
  const [modo, setModo] = useState<"situacion" | "condicion">("situacion");
  const id = (campo: string) => `reporte-${campo}-${jornadaId}`;

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="jornadaId" value={jornadaId} />
      <TimezoneOffsetField />
      <fieldset className="nn-field">
        <legend>{t("queReportas")}</legend>
        <label style={{ display: "block" }}>
          <input type="radio" name="modo" checked={modo === "situacion"} onChange={() => setModo("situacion")} /> {t("unaSituacion")}
        </label>
        <label style={{ display: "block" }}>
          <input type="radio" name="modo" checked={modo === "condicion"} onChange={() => setModo("condicion")} /> {t("condicionDelDia")}
        </label>
      </fieldset>
      <div className="nn-field">
        <label htmlFor={id("sobre")}>{t("sobre")}</label>
        <select id={id("sobre")} name="sobre" required defaultValue="" key={modo}>
          <option value="" disabled>{t("elegir")}</option>
          <OpcionesDeOrigen origenes={origenes} parcelaIds={parcelaIds} soloParcelas={modo === "condicion"} />
        </select>
      </div>
      {modo === "situacion" ? (
        <div className="nn-field">
          <label htmlFor={id("tipo")}>{t("tipo")}</label>
          <select id={id("tipo")} name="tipoValueId" required defaultValue="">
            <option value="" disabled>{t("elegir")}</option>
            {tipos.map((o) => (
              <option key={o.id} value={o.id}>{o.value}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="nn-field">
          <label htmlFor={id("condicion")}>{t("condicion")}</label>
          <select id={id("condicion")} name="condicionValueId" required defaultValue="">
            <option value="" disabled>{t("elegir")}</option>
            {condiciones.map((o) => (
              <option key={o.id} value={o.id}>{o.value}</option>
            ))}
          </select>
        </div>
      )}
      <div className="nn-field">
        <label htmlFor={id("nota")}>{t("notaReporte")}</label>
        <textarea id={id("nota")} name="nota" rows={3} maxLength={2000} />
      </div>
      <div className="nn-field">
        <label htmlFor={id("hora")}>{t("ocurridaAt")}</label>
        <input id={id("hora")} name="ocurridaAt" type="datetime-local" required ref={ahoraEnElCampo} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {state.ok ? <p role="status">{t("reporteGuardado")}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("reportarBoton")}</button>
    </form>
  );
}

/**
 * La foto de una situación: se elige sobre qué, se sube directo al almacenamiento, y sólo con la
 * subida hecha se crea el evento de campo con su `Asset`.
 */
export function FotoDeSituacionForm({ jornadaId, origenes, parcelaIds }: { jornadaId: string; origenes: OrigenesDeJornada; parcelaIds: string[] }) {
  const t = useTranslations("Jornadas");
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);
  const sobre = useRef<HTMLSelectElement>(null);
  const nota = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  async function subir() {
    const file = archivo.current?.files?.[0];
    const destino = sobre.current?.value ?? "";
    if (!file || !destino) {
      setError(t("error_foto_incompleta"));
      return;
    }
    setSubiendo(true);
    setError(null);
    setHecho(false);
    const contentType = file.type || "application/octet-stream";
    const pedido = await pedirSubidaDeFotoDeSituacionAction(jornadaId, file.name, contentType);
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
    const r = await confirmarFotoDeSituacionAction({
      jornadaId,
      sobre: destino,
      storageKey: pedido.storageKey,
      mimeType: contentType,
      sizeBytes: file.size,
      originalFilename: file.name,
      nota: nota.current?.value ?? "",
      ocurridaAtIso: new Date().toISOString(),
    });
    setSubiendo(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    if (archivo.current) archivo.current.value = "";
    if (nota.current) nota.current.value = "";
    setHecho(true);
    router.refresh();
  }

  return (
    <div className="nn-form">
      <div className="nn-field">
        <label htmlFor={`foto-sobre-${jornadaId}`}>{t("sobre")}</label>
        <select id={`foto-sobre-${jornadaId}`} ref={sobre} defaultValue="">
          <option value="" disabled>{t("elegir")}</option>
          <OpcionesDeOrigen origenes={origenes} parcelaIds={parcelaIds} />
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor={`foto-nota-${jornadaId}`}>{t("notaReporte")}</label>
        <input id={`foto-nota-${jornadaId}`} ref={nota} type="text" maxLength={2000} />
      </div>
      <input ref={archivo} type="file" accept="image/*,video/*" capture="environment" aria-label={t("fotoDelCampo")} />
      {error ? <p className="nn-error" role="alert">{error}</p> : null}
      {hecho ? <p role="status">{t("fotoGuardada")}</p> : null}
      <button type="button" className="nn-button" disabled={subiendo} onClick={subir}>
        {subiendo ? t("subiendo") : t("subirFoto")}
      </button>
    </div>
  );
}
