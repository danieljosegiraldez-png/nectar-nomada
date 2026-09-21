"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { armarLoteAction, type RecepcionActionState } from "../../actions/recepcionDeCereza";
import { CampoNumerico } from "../CampoNumerico";

const inicial: RecepcionActionState = {};

export interface RecepcionArmable {
  id: string;
  etiqueta: string;
  disponibleKg: number;
  pedidoId: string | null;
}

/**
 * Armar un lote con cereza de una o varias recepciones (spec de la recepción a los lotes §3.1).
 *
 * **Avisa** —no impide— cuando las elegidas vienen de pedidos distintos: el lote se puede armar
 * igual, pero entonces no será atribuible a ninguno y su veredicto lo dirá. Quien mezcla suele
 * saber por qué; lo que no puede es no enterarse.
 */
export function ArmarLoteForm({ beneficioId, recepciones }: { beneficioId: string; recepciones: RecepcionArmable[] }) {
  const t = useTranslations("Recepcion");
  const [state, formAction, pending] = useActionState(armarLoteAction, inicial);
  const [kilos, setKilos] = useState<Record<string, string>>({});

  const elegidas = recepciones.filter((r) => (kilos[r.id] ?? "").trim() !== "");
  const pedidos = new Set(elegidas.map((r) => r.pedidoId));
  const mezcla = elegidas.length > 1 && pedidos.size > 1;

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="beneficioId" value={beneficioId} />
      <div className="nn-field">
        <label htmlFor="armar-codigo">{t("loteCodigo")}</label>
        <input id="armar-codigo" name="codigo" type="text" required maxLength={60} />
      </div>
      <fieldset className="nn-field">
        <legend>{t("loteRecepciones")}</legend>
        {recepciones.map((r) => (
          <div key={r.id} className="nn-field">
            <label htmlFor={`armar-kg-${r.id}`}>
              {r.etiqueta} — {t("disponible", { kg: r.disponibleKg.toFixed(1) })}
            </label>
            <CampoNumerico
              id={`armar-kg-${r.id}`}
              name={`kg.${r.id}`}
              min={0}
              max={r.disponibleKg}
              step={0.001}
              value={kilos[r.id] ?? ""}
              onChange={(e) => setKilos((k) => ({ ...k, [r.id]: e.target.value }))}
            />
          </div>
        ))}
      </fieldset>
      {mezcla ? <p role="status" className="nn-muted">{t("avisoPedidosDistintos")}</p> : null}
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {state.ok ? <p role="status">{t("loteArmado")}</p> : null}
      <button type="submit" className="nn-button" disabled={pending || elegidas.length === 0}>
        {t("armarBoton")}
      </button>
    </form>
  );
}
