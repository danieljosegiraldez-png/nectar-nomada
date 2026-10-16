"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { cerrarFloracionFormAction, registrarFloracionFormAction } from "../../actions/floracion";
import type { TraceabilityActionState } from "../../actions/traceability";
import { OpcionesDePersona, type OpcionDePersona } from "../OpcionesDePersona";

const initialState: TraceabilityActionState = {};

/**
 * Anotar una floración — decisión de Daniel, 2026-10-16.
 *
 * **Los días son campos de DÍA** (`type="date"`), no instantes: el servidor los lee con
 * `fechaDeDia`, que es lo que pide el esquema de `PlotBloom`. Por eso no lleva el desfase de zona.
 * El fin es opcional: vacío quiere decir «sigue en floración», y se cierra después desde la ficha.
 *
 * `hoy` llega del servidor, calculado en la zona de la parcela (`diaDeHoy`): calcularlo aquí daría
 * el día del navegador, que de noche puede ser otro.
 */
export function FloracionForm({
  locationId,
  hoy,
  bloques,
  personas,
  selfPersonId,
}: {
  locationId: string;
  hoy: string;
  bloques: readonly { id: string; name: string }[];
  personas: readonly OpcionDePersona[];
  selfPersonId: string | null;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(registrarFloracionFormAction, initialState);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />

      <div className="nn-field">
        <label htmlFor="floracion-inicio">{t("floracionInicioLabel")}</label>
        <input id="floracion-inicio" type="date" name="startsAt" defaultValue={hoy} max={hoy} required />
      </div>

      <div className="nn-field">
        <label htmlFor="floracion-fin">{t("floracionFinLabel")}</label>
        <input id="floracion-fin" type="date" name="endsAt" max={hoy} />
        <p className="nn-muted">{t("floracionFinAyuda")}</p>
      </div>

      {bloques.length > 0 ? (
        <div className="nn-field">
          <label htmlFor="floracion-bloque">{t("floracionBloqueLabel")}</label>
          <select id="floracion-bloque" name="plotBlockId" defaultValue="">
            <option value="">{t("floracionParcelaEntera")}</option>
            {bloques.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="nn-field">
        <label htmlFor="floracion-observador">{t("floracionObservadorLabel")}</label>
        <select id="floracion-observador" name="observerPersonId" defaultValue={selfPersonId ?? ""}>
          <option value="">{t("floracionObservadorNone")}</option>
          <OpcionesDePersona personas={personas} selfPersonId={selfPersonId} />
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="floracion-notas">{t("floracionNotasLabel")}</label>
        <textarea id="floracion-notas" name="notes" rows={2} />
      </div>

      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("floracionGuardar")}
      </button>
    </form>
  );
}

/**
 * Pone el fin a una floración abierta, una sola vez (`cerrarFloracion`). Va dentro del desplegable
 * «Ya cayeron las flores» de la ficha, como «Cerrar pedido». El día por defecto es hoy, en la zona de
 * la parcela; se puede elegir uno anterior, nunca antes del inicio.
 */
export function CerrarFloracionForm({ floracionId, desde, hoy }: { floracionId: string; desde: string; hoy: string }) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(cerrarFloracionFormAction, initialState);
  const campo = `floracion-fin-${floracionId}`;

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="floracionId" value={floracionId} />
      <div className="nn-field">
        <label htmlFor={campo}>{t("floracionCerrarLabel")}</label>
        <input id={campo} type="date" name="endsAt" defaultValue={hoy} min={desde} max={hoy} required />
      </div>
      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("floracionCerrarConfirmar")}
      </button>
    </form>
  );
}
