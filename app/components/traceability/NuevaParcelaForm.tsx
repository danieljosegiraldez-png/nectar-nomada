"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { crearParcelaAction, type FincasActionState } from "../../actions/fincas";

const inicial: FincasActionState = {};

/**
 * Una parcela nueva en la finca elegida (spec fincas y parcelas §3.3). Daniel, 2026-09-21: un botón
 * «Crear parcela nueva» que despliega el formulario, con lo fijo de la parcela —área medida en ha o
 * m², GPS y dónde está en la finca—. Todo menos el nombre es opcional; lo vacío se guarda vacío.
 * La rejilla (hileras, plantas y distancias) llega con la entrega 1 del spec de la rejilla.
 */
export function NuevaParcelaForm({ siteId }: { siteId: string }) {
  const t = useTranslations("Fincas");
  const [state, formAction, pending] = useActionState(crearParcelaAction, inicial);
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);
  const [gps, setGps] = useState<"idle" | "buscando" | "error">("idle");

  function usarMiUbicacion() {
    if (!("geolocation" in navigator)) {
      setGps("error");
      return;
    }
    setGps("buscando");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (latRef.current) latRef.current.value = pos.coords.latitude.toFixed(6);
        if (lngRef.current) lngRef.current.value = pos.coords.longitude.toFixed(6);
        setGps("idle");
      },
      () => setGps("error"),
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  }

  return (
    <details className="nn-nueva-parcela">
      <summary className="nn-button">{t("crearParcelaNueva")}</summary>
      <form action={formAction} className="nn-form">
        <input type="hidden" name="siteId" value={siteId} />
        <div className="nn-field">
          <label htmlFor="parcela-nombre">{t("nombreParcela")}</label>
          <input id="parcela-nombre" name="nombre" type="text" required maxLength={120} />
        </div>
        <div className="nn-field">
          <label htmlFor="parcela-area">{t("areaHectareas")}</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input id="parcela-area" name="area" type="text" inputMode="decimal" />
            <select name="areaUnidad" aria-label={t("areaUnidad")} defaultValue="ha">
              <option value="ha">ha</option>
              <option value="m2">m²</option>
            </select>
          </div>
        </div>
        <fieldset className="nn-field">
          <legend>{t("ubicacionGps")}</legend>
          <button type="button" className="nn-button" onClick={usarMiUbicacion} disabled={gps === "buscando"}>
            {gps === "buscando" ? t("gpsBuscando") : t("usarMiUbicacion")}
          </button>
          {gps === "error" ? <p className="nn-error" role="alert">{t("gpsNoDisponible")}</p> : null}
          <label htmlFor="parcela-lat">{t("latitud")}</label>
          <input id="parcela-lat" ref={latRef} name="latitude" type="text" inputMode="decimal" placeholder="8.123456" />
          <label htmlFor="parcela-lng">{t("longitud")}</label>
          <input id="parcela-lng" ref={lngRef} name="longitude" type="text" inputMode="decimal" placeholder="-82.123456" />
        </fieldset>
        <div className="nn-field">
          <label htmlFor="parcela-descripcion">{t("dondeEstaEnLaFinca")}</label>
          <textarea id="parcela-descripcion" name="descripcion" rows={2} maxLength={500} placeholder={t("dondeEstaEjemplo")} />
        </div>
        {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
        {state.ok ? <p role="status">{t("parcelaCreada")}</p> : null}
        <button type="submit" className="nn-button" disabled={pending}>{t("crearParcelaBoton")}</button>
      </form>
    </details>
  );
}
