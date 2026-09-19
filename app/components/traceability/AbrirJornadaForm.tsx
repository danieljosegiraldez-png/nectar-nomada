"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { abrirJornadaAction, agregarRecolectorAction, type JornadaActionState } from "../../actions/jornadasDeCosecha";

const inicial: JornadaActionState = {};

/** El día de hoy en el dispositivo, para un `type="date"`. Sólo en el navegador. */
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Abrir una jornada de cosecha (spec jornada y entrega §3.2): la fecha y quién va a cada parcela
 * lista. Cada casilla es una asignación «parcela:persona». La finca no crea lotes aquí.
 */
export function AbrirJornadaForm({
  fincaSiteId,
  parcelas,
  recolectores,
  beneficios,
}: {
  fincaSiteId: string;
  parcelas: { id: string; name: string }[];
  recolectores: { personId: string; nombre: string }[];
  /** Spec recepción §3.1: a qué beneficio va la cereza del día (`beneficiosDeDestino`). */
  beneficios: { id: string; name: string }[];
}) {
  const t = useTranslations("Jornadas");
  const [state, formAction, pending] = useActionState(abrirJornadaAction, inicial);

  if (!parcelas.length) return <p className="nn-muted">{t("sinParcelas")}</p>;
  if (!recolectores.length) return <p className="nn-muted">{t("sinRecolectores")}</p>;
  if (!beneficios.length) return <p className="nn-muted">{t("sinBeneficioDestino")}</p>;

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="fincaSiteId" value={fincaSiteId} />
      <div className="nn-field">
        <label htmlFor="jornada-fecha">{t("fecha")}</label>
        <input id="jornada-fecha" name="fecha" type="date" required ref={(el) => { if (el && !el.value) el.value = hoyLocal(); }} />
      </div>
      <div className="nn-field">
        <label htmlFor="jornada-destino">{t("destino")}</label>
        <select id="jornada-destino" name="beneficioId" required defaultValue={beneficios.length === 1 ? beneficios[0]!.id : ""}>
          <option value="" disabled>{t("elegir")}</option>
          {beneficios.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
      {parcelas.map((p) => (
        <fieldset key={p.id} className="nn-field">
          <legend>{p.name}</legend>
          {recolectores.map((r) => (
            <label key={r.personId} style={{ display: "block" }}>
              <input type="checkbox" name="asignacion" value={`${p.id}:${r.personId}`} /> {r.nombre}
            </label>
          ))}
        </fieldset>
      ))}
      <div className="nn-field">
        <label htmlFor="jornada-nota">{t("nota")}</label>
        <input id="jornada-nota" name="nota" type="text" maxLength={500} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("abrirBoton")}</button>
    </form>
  );
}

/** Añadir una persona a la lista de recolectores de la finca, desde una fecha. */
export function AgregarRecolectorForm({ fincaSiteId, personas }: { fincaSiteId: string; personas: { id: string; displayName: string }[] }) {
  const t = useTranslations("Jornadas");
  const [state, formAction, pending] = useActionState(agregarRecolectorAction, inicial);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="fincaSiteId" value={fincaSiteId} />
      <div className="nn-field">
        <label htmlFor="recolector-persona">{t("persona")}</label>
        <select id="recolector-persona" name="personId" required defaultValue="">
          <option value="" disabled>{t("elegir")}</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>{p.displayName}</option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="recolector-desde">{t("desde")}</label>
        <input id="recolector-desde" name="desde" type="date" required ref={(el) => { if (el && !el.value) el.value = hoyLocal(); }} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      {state.ok ? <p role="status">{t("recolectorAgregado")}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("agregarRecolectorBoton")}</button>
    </form>
  );
}
