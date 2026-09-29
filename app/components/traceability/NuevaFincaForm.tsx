"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { crearFincaAction, type FincasActionState } from "../../actions/fincas";

const inicial: FincasActionState = {};

/**
 * Dar de alta una finca (spec fincas y parcelas §3.2). Con `organizacion`, la organización ya
 * existe y se le añade una finca.
 *
 * **ADR-189: el nombre se pide también en ese caso.** Antes se heredaba el de la organización, que
 * era correcto mientras cada una tuviera una sola finca. Kiva Estate tiene dos, y heredarlo las
 * llamaría a las dos «Kiva Estate». Viene rellenado con el de la organización cuando aún no tiene
 * ninguna, así que la primera finca se sigue creando sin escribir nada; para una segunda el campo
 * sale vacío, y si se repitiera el nombre el servicio responde `nombre_repetido`.
 */
export function NuevaFincaForm({ organizacion }: { organizacion: { id: string; name: string; fincas: number } | null }) {
  const t = useTranslations("Fincas");
  const [state, formAction, pending] = useActionState(crearFincaAction, inicial);

  return (
    <form action={formAction} className="nn-form">
      {organizacion ? (
        <>
          <input type="hidden" name="organizationId" value={organizacion.id} />
          <p>{t("crearTerrenoDe", { nombre: organizacion.name })}</p>
          <div className="nn-field">
            <label htmlFor="finca-nombre-org">{t("nombre")}</label>
            <input
              id="finca-nombre-org"
              name="nombre"
              type="text"
              required
              maxLength={120}
              defaultValue={organizacion.fincas > 0 ? "" : organizacion.name}
            />
          </div>
        </>
      ) : (
        <>
          <div className="nn-field">
            <label htmlFor="finca-nombre">{t("nombre")}</label>
            <input id="finca-nombre" name="nombre" type="text" required maxLength={120} />
          </div>
          <div className="nn-field">
            <label htmlFor="finca-tipo">{t("tipo")}</label>
            <select id="finca-tipo" name="tipo" required defaultValue="farm">
              <option value="farm">{t("tipo_farm")}</option>
              <option value="estate">{t("tipo_estate")}</option>
            </select>
          </div>
          <div className="nn-field">
            <label htmlFor="finca-descripcion">{t("descripcion")}</label>
            <input id="finca-descripcion" name="descripcion" type="text" />
          </div>
        </>
      )}
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {organizacion ? t("crearTerrenoBoton") : t("crearFincaBoton")}
      </button>
    </form>
  );
}
