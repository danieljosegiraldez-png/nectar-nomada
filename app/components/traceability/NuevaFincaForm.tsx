"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { crearFincaAction, type FincasActionState } from "../../actions/fincas";

const inicial: FincasActionState = {};

/**
 * Dar de alta una finca (spec fincas y parcelas §3.2). Con `organizacion`, la organización ya
 * existe sin terreno —Kiva Estate— y sólo se confirma: se le crea el terreno con su mismo nombre.
 */
export function NuevaFincaForm({ organizacion }: { organizacion: { id: string; name: string } | null }) {
  const t = useTranslations("Fincas");
  const [state, formAction, pending] = useActionState(crearFincaAction, inicial);

  return (
    <form action={formAction} className="nn-form">
      {organizacion ? (
        <>
          <input type="hidden" name="organizationId" value={organizacion.id} />
          <p>{t("crearTerrenoDe", { nombre: organizacion.name })}</p>
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
