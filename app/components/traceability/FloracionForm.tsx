"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { registrarFloracionFormAction } from "../../actions/floracion";
import type { TraceabilityActionState } from "../../actions/traceability";
import { OpcionesDePersona, type OpcionDePersona } from "../OpcionesDePersona";

const inicial: TraceabilityActionState = {};

/**
 * «Empezó a florecer» — F1. Toda la parcela o un bloque, el día en que empezó, el fin si ya
 * terminó, quién la vio y una nota. Sin fin queda abierta, y se cierra después con «Terminó» desde
 * la portada de la parcela.
 *
 * Las dos fechas son `type="date"`: campos de DÍA. `hoy` es sólo el valor inicial, calculado en el
 * servidor en la zona de la finca; no se usa como tope, porque sin zona declarada el servidor no
 * puede saber con certeza qué día es allí.
 */
export function FloracionForm({
  locationId,
  bloques,
  personas,
  selfPersonId,
  hoy,
}: {
  locationId: string;
  bloques: ReadonlyArray<{ id: string; name: string }>;
  personas: readonly OpcionDePersona[];
  selfPersonId: string | null;
  hoy: string;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(registrarFloracionFormAction, inicial);

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />

      {bloques.length > 0 ? (
        <div className="nn-field">
          <label htmlFor="floracion-bloque">{t("floracionDonde")}</label>
          <select id="floracion-bloque" name="plotBlockId" defaultValue="">
            <option value="">{t("floracionTodaLaParcela")}</option>
            {bloques.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="nn-field">
        <label htmlFor="floracion-inicio">{t("floracionInicio")}</label>
        <input id="floracion-inicio" type="date" name="startsAt" required defaultValue={hoy} />
      </div>

      <div className="nn-field">
        <label htmlFor="floracion-fin">{t("floracionFin")}</label>
        <input id="floracion-fin" type="date" name="endsAt" />
      </div>

      <div className="nn-field">
        <label htmlFor="floracion-observador">{t("observerLabel")}</label>
        <select id="floracion-observador" name="observerPersonId" defaultValue={selfPersonId ?? ""}>
          <option value="">{t("notRecorded")}</option>
          <OpcionesDePersona personas={personas} selfPersonId={selfPersonId} />
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="floracion-nota">{t("floracionNota")}</label>
        <textarea id="floracion-nota" name="notes" rows={2} />
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
