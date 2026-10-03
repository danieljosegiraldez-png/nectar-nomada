"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CampoNumerico } from "../CampoNumerico";
import {
  declararTrozoDeFormaAction,
  quitarTrozoDeFormaAction,
  type TraceabilityActionState,
} from "../../actions/traceability";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";

const initialState: TraceabilityActionState = {};

export interface TrozoDeForma {
  id: string;
  rowFrom: number;
  rowTo: number;
  plantFrom: number;
  plantTo: number;
}

/**
 * Qué celdas del tablero están plantadas de verdad (D9, 2026-10-03).
 *
 * **Por qué una lista de trozos y no un número.** La rejilla es un **tablero de
 * direcciones**; cuáles de sus celdas tienen planta es otro dato, y un lote no siempre
 * es rectangular: «a veces puede variar unas columnas o filas». Con varios rectángulos se
 * describe una esquina cortada, hileras desplazadas y un hueco en medio por una roca.
 *
 * **Y los trozos PUEDEN pisarse entre sí**, a propósito: la cuenta es una unión, así que
 * no suma dos veces lo compartido. Prohibirlo obligaría a partir la forma a mano en
 * rectángulos disjuntos, que es trabajo de campo inventado.
 *
 * **El aviso de quitar se pinta APARTE del error.** Quitar un trozo puede dejar plantas
 * situadas fuera de lo que queda, y eso se dice — pero el trozo **se quitó** (§7.4):
 * pintarlo con `role="alert"` diría que algo falló cuando lo que pasó es que se guardó.
 * Rechazarlo obligaría a declarar como plantado un terreno que no lo está.
 *
 * Los números van en `<CampoNumerico>`: en Chrome, girar la rueda sobre un
 * `<input type="number">` con foco cambia su valor, y en un formulario de campo eso
 * convierte «no se midió» en otro número sin que nadie lo vea.
 */
export function FormaDelLoteForm({
  locationId,
  trozos,
  celdasPlantadas,
  celdasDelTablero,
}: {
  locationId: string;
  trozos: readonly TrozoDeForma[];
  /** Celdas de la UNIÓN de los trozos, ya calculada en el servidor. */
  celdasPlantadas: number;
  celdasDelTablero: number;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(declararTrozoDeFormaAction, initialState);
  const [quitarState, quitarAction, quitando] = useActionState(quitarTrozoDeFormaAction, initialState);

  return (
    <div>
      <p className="nn-muted">{t("formaIntro")}</p>

      {trozos.length ? (
        <>
          <ul className="nn-list">
            {trozos.map((r) => (
              <li key={r.id}>
                {t("rejillaRangoResumen", {
                  desdeHilera: r.rowFrom,
                  hastaHilera: r.rowTo,
                  desdePlanta: r.plantFrom,
                  hastaPlanta: r.plantTo,
                })}{" "}
                <form action={quitarAction} style={{ display: "inline" }}>
                  <input type="hidden" name="locationId" value={locationId} />
                  <input type="hidden" name="trozoId" value={r.id} />
                  <BotonQueNecesitaConexion pending={quitando}>
                    {t("rejillaQuitarRangoBoton")}
                  </BotonQueNecesitaConexion>
                </form>
              </li>
            ))}
          </ul>
          {/* La unión, no la suma: dos trozos que se pisan no cuentan dos veces. */}
          <p className="nn-detail-meta" style={{ fontVariantNumeric: "tabular-nums" }}>
            {t("formaTotalCeldas", { celdas: celdasPlantadas, tablero: celdasDelTablero })}
          </p>
        </>
      ) : (
        <p className="nn-muted">{t("formaSinTrozos", { tablero: celdasDelTablero })}</p>
      )}

      {quitarState.error ? (
        <p className="nn-error" role="alert">
          {quitarState.error}
        </p>
      ) : null}
      {/* Aviso, no error: el trozo SE QUITÓ y hay algo que decir (§7.4). */}
      {quitarState.avisos?.length ? (
        <ul className="nn-muted" role="status">
          {quitarState.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : null}

      <form action={formAction} className="nn-form">
        <input type="hidden" name="locationId" value={locationId} />

        <div className="nn-field">
          <label htmlFor="formaRowFrom">{t("rejillaDesdeHileraLabel")}</label>
          <CampoNumerico id="formaRowFrom" name="rowFrom" step="1" min="1" required />
        </div>

        <div className="nn-field">
          <label htmlFor="formaRowTo">{t("rejillaHastaHileraLabel")}</label>
          <CampoNumerico id="formaRowTo" name="rowTo" step="1" min="1" required />
        </div>

        <div className="nn-field">
          <label htmlFor="formaPlantFrom">{t("rejillaDesdePlantaLabel")}</label>
          <CampoNumerico id="formaPlantFrom" name="plantFrom" step="1" min="1" required />
        </div>

        <div className="nn-field">
          <label htmlFor="formaPlantTo">{t("rejillaHastaPlantaLabel")}</label>
          <CampoNumerico id="formaPlantTo" name="plantTo" step="1" min="1" required />
        </div>

        {state.error ? (
          <p className="nn-error" role="alert">
            {state.error}
          </p>
        ) : null}
        <BotonQueNecesitaConexion pending={pending}>{t("formaAnadirTrozoBoton")}</BotonQueNecesitaConexion>
      </form>
    </div>
  );
}
