"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  anotarEntregaAction,
  confirmarFotoDeEntregaAction,
  pedirSubidaDeFotoDeEntregaAction,
  type JornadaActionState,
} from "../../actions/jornadasDeCosecha";
import { TimezoneOffsetField } from "../TimezoneOffsetField";
import { paraCampoLocal } from "../../../lib/time/localDateTime";

const inicial: JornadaActionState = {};

export interface OrigenesDeJornada {
  parcelas: { id: string; name: string }[];
  bloques: { id: string; name: string; locationId: string }[];
  plantas: { id: string; nombre: string; parcelaId: string }[];
}

/**
 * Las opciones de origen de unas parcelas: la parcela, sus bloques y sus plantas, con el valor
 * «L:», «B:» o «P:» que lee la acción. La usan la entrega y el reporte de campo.
 */
export function OpcionesDeOrigen({ origenes, parcelaIds, soloParcelas = false }: { origenes: OrigenesDeJornada; parcelaIds: string[]; soloParcelas?: boolean }) {
  const t = useTranslations("Jornadas");
  return (
    <>
      {origenes.parcelas
        .filter((p) => parcelaIds.includes(p.id))
        .map((p) => (
          <optgroup key={p.id} label={p.name}>
            <option value={`L:${p.id}`}>{t("toda", { nombre: p.name })}</option>
            {soloParcelas
              ? null
              : [
                  ...origenes.bloques.filter((b) => b.locationId === p.id).map((b) => (
                    <option key={b.id} value={`B:${b.id}`}>{t("bloque", { nombre: b.name })}</option>
                  )),
                  ...origenes.plantas.filter((s) => s.parcelaId === p.id).map((s) => (
                    <option key={s.id} value={`P:${s.id}`}>{t("planta", { nombre: s.nombre })}</option>
                  )),
                ]}
          </optgroup>
        ))}
    </>
  );
}

/** El reloj del dispositivo, escrito en el campo desde el navegador y nunca en el servidor. */
export function ahoraEnElCampo(el: HTMLInputElement | null) {
  if (el && !el.value) el.value = paraCampoLocal(new Date());
}

/**
 * Anotar una entrega (spec jornada y entrega §3.3): quién, de dónde dentro de lo asignado, cuánto
 * pesó en la finca y a qué hora salió. Sin `recolectores` de donde elegir, es la del propio
 * recolector (`propio`). La foto se añade después, a la entrega ya anotada.
 */
export function AnotarEntregaForm({
  jornadaId,
  recolectores,
  origenes,
  propio,
}: {
  jornadaId: string;
  recolectores: { personId: string; nombre: string; parcelaIds: string[] }[];
  origenes: OrigenesDeJornada;
  propio?: string;
}) {
  const t = useTranslations("Jornadas");
  const [state, formAction, pending] = useActionState(anotarEntregaAction, inicial);
  const [persona, setPersona] = useState(propio ?? "");
  const parcelaIds = recolectores.find((r) => r.personId === persona)?.parcelaIds ?? [];

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="jornadaId" value={jornadaId} />
      <TimezoneOffsetField />
      {propio ? (
        <input type="hidden" name="recolectorPersonId" value={propio} />
      ) : (
        <div className="nn-field">
          <label htmlFor={`entrega-recolector-${jornadaId}`}>{t("recolector")}</label>
          <select id={`entrega-recolector-${jornadaId}`} name="recolectorPersonId" required value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="" disabled>{t("elegir")}</option>
            {recolectores.map((r) => (
              <option key={r.personId} value={r.personId}>{r.nombre}</option>
            ))}
          </select>
        </div>
      )}
      <div className="nn-field">
        <label htmlFor={`entrega-origen-${jornadaId}`}>{t("origen")}</label>
        <select id={`entrega-origen-${jornadaId}`} name="origen" required defaultValue="" key={persona}>
          <option value="" disabled>{t("elegir")}</option>
          <OpcionesDeOrigen origenes={origenes} parcelaIds={parcelaIds} />
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor={`entrega-peso-${jornadaId}`}>{t("pesoFinca")}</label>
        <input id={`entrega-peso-${jornadaId}`} name="pesoFincaKg" type="text" inputMode="decimal" required />
      </div>
      <div className="nn-field">
        <label htmlFor={`entrega-hora-${jornadaId}`}>{t("enviadaAt")}</label>
        <input id={`entrega-hora-${jornadaId}`} name="enviadaAt" type="datetime-local" required ref={ahoraEnElCampo} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {state.ok ? <p role="status">{t("entregaAnotada")}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("anotarBoton")}</button>
    </form>
  );
}

/**
 * La foto de una entrega ya anotada. El navegador sube directo al almacenamiento y la fila `Asset`
 * se crea sólo cuando la subida respondió bien: el mismo viaje de dos pasos que `LandPhotoUploadForm`.
 */
export function FotoDeEntregaForm({ entregaId }: { entregaId: string }) {
  const t = useTranslations("Jornadas");
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
    const pedido = await pedirSubidaDeFotoDeEntregaAction(entregaId, file.name, contentType);
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
    const hecho = await confirmarFotoDeEntregaAction(entregaId, pedido.storageKey, contentType, file.size, file.name);
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
