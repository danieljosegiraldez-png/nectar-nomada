"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CampoNumerico } from "../CampoNumerico";
import {
  anadirRangoAlBloqueAction,
  quitarRangoDelBloqueAction,
  type TraceabilityActionState,
} from "../../actions/traceability";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";

const initialState: TraceabilityActionState = {};

export interface RangoDelBloque {
  id: string;
  rowFrom: number;
  rowTo: number;
  plantFrom: number;
  plantTo: number;
}

/**
 * Dónde está un bloque dentro de la rejilla de su parcela.
 *
 * **Varios rangos por bloque (D5), y por eso esto es una lista y no cuatro
 * campos.** Un bloque en L son dos rangos y sigue siendo UNA unidad de
 * observación; si el formulario sólo admitiera un rango, el agrónomo tendría que
 * partir el bloque en dos y perdería la unidad que mide.
 *
 * **Los avisos de solape se pintan APARTE del error, y es deliberado.** Un bloque
 * experimental que se solapa con una trampa se guarda — es una decisión del
 * agrónomo, no un error de captura (D7) — así que pintarlo con `role="alert"` y
 * clase de error diría que algo falló cuando lo que pasó es que todo se guardó.
 * Lo que el sistema debe hacer es decir con quién y cuántas celdas.
 */
export function RangosDeBloqueForm({
  locationId,
  plotBlockId,
  rangos,
}: {
  locationId: string;
  plotBlockId: string;
  rangos: readonly RangoDelBloque[];
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(anadirRangoAlBloqueAction, initialState);
  const [quitarState, quitarAction, quitando] = useActionState(quitarRangoDelBloqueAction, initialState);

  return (
    <div>
      {rangos.length ? (
        <ul className="nn-list">
          {rangos.map((r) => (
            <li key={r.id}>
              {t("rejillaRangoResumen", {
                desdeHilera: r.rowFrom,
                hastaHilera: r.rowTo,
                desdePlanta: r.plantFrom,
                hastaPlanta: r.plantTo,
              })}{" "}
              <form action={quitarAction} style={{ display: "inline" }}>
                <input type="hidden" name="locationId" value={locationId} />
                <input type="hidden" name="rangoId" value={r.id} />
                <BotonQueNecesitaConexion pending={quitando}>
                  {t("rejillaQuitarRangoBoton")}
                </BotonQueNecesitaConexion>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="nn-muted">{t("rejillaSinRangos")}</p>
      )}

      {quitarState.error ? (
        <p className="nn-error" role="alert">
          {quitarState.error}
        </p>
      ) : null}

      <form action={formAction} className="nn-form">
        <input type="hidden" name="locationId" value={locationId} />
        <input type="hidden" name="plotBlockId" value={plotBlockId} />
        <p className="nn-muted">{t("rejillaRangoIntro")}</p>

        <div className="nn-field">
          <label htmlFor={`rowFrom-${plotBlockId}`}>{t("rejillaDesdeHileraLabel")}</label>
          <CampoNumerico id={`rowFrom-${plotBlockId}`} name="rowFrom" step="1" min="1" required />
        </div>

        <div className="nn-field">
          <label htmlFor={`rowTo-${plotBlockId}`}>{t("rejillaHastaHileraLabel")}</label>
          <CampoNumerico id={`rowTo-${plotBlockId}`} name="rowTo" step="1" min="1" required />
        </div>

        <div className="nn-field">
          <label htmlFor={`plantFrom-${plotBlockId}`}>{t("rejillaDesdePlantaLabel")}</label>
          <CampoNumerico id={`plantFrom-${plotBlockId}`} name="plantFrom" step="1" min="1" required />
        </div>

        <div className="nn-field">
          <label htmlFor={`plantTo-${plotBlockId}`}>{t("rejillaHastaPlantaLabel")}</label>
          <CampoNumerico id={`plantTo-${plotBlockId}`} name="plantTo" step="1" min="1" required />
        </div>

        {state.error ? (
          <p className="nn-error" role="alert">
            {state.error}
          </p>
        ) : null}
        {/* Aviso, no error: el rango SE GUARDÓ y hay algo que decir (D7). */}
        {state.avisos?.length ? (
          <ul className="nn-muted" role="status">
            {state.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}
        <BotonQueNecesitaConexion pending={pending}>{t("rejillaAnadirRangoBoton")}</BotonQueNecesitaConexion>
      </form>
    </div>
  );
}
