"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CampoNumerico } from "../CampoNumerico";

export interface ModeloOpcion {
  id: string;
  manufacturer: string;
  modelName: string;
  recommendedMaintenanceDays: number | null;
}

/** Los modelos elegibles, ya filtrados por el servidor en memoria (Tarea 9): un
 * modelo por SITIO (no por organización) porque es el `locationId` del
 * formulario, no su `organizationId`, lo que este componente puede leer del
 * DOM sin una consulta más. */
export type ModelosPorSitioYTipo = Record<string, Record<string, { compartidos: ModeloOpcion[]; propios: ModeloOpcion[] }>>;

/**
 * El selector de modelo del alta de un equipo (spec de catálogos §3.3).
 *
 * **Lee `kind` y `locationId` del formulario padre con un `ref` y `change`,
 * nunca con estado de React levantado desde fuera** — es lo que pide el
 * encargo para no acoplarse al DOM de un formulario que no controla: si el
 * día de mañana el campo `kind` cambia de sitio en el formulario, este
 * componente lo sigue encontrando por su `name`, no por su posición.
 *
 * **Funciona con JS lento.** El primer render — incluido el que llega del
 * servidor, antes de cualquier hidratación — ya muestra los modelos del tipo y
 * el sitio por defecto del formulario, porque `kindInicial`/`locationIdInicial`
 * inicializan el estado en vez de arrancar vacíos a la espera de un efecto.
 */
export function SelectorDeModelo({
  modelos,
  etiquetas,
  kindInicial,
  locationIdInicial,
  modeloInicial,
}: {
  modelos: ModelosPorSitioYTipo;
  etiquetas: { campo: string; ninguno: string; compartidos: string; propios: string; crear: string };
  kindInicial: string;
  locationIdInicial: string;
  modeloInicial?: string;
}) {
  const t = useTranslations("Equipos");
  const raizRef = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState(kindInicial);
  const [locationId, setLocationId] = useState(locationIdInicial);
  const [modelId, setModelId] = useState(modeloInicial ?? "");

  useEffect(() => {
    const form = raizRef.current?.closest("form");
    const kindEl = form?.elements.namedItem("kind");
    const locEl = form?.elements.namedItem("locationId");
    if (!(kindEl instanceof HTMLSelectElement) || !(locEl instanceof HTMLSelectElement)) return;
    const leer = () => {
      setKind(kindEl.value);
      setLocationId(locEl.value);
    };
    leer();
    kindEl.addEventListener("change", leer);
    locEl.addEventListener("change", leer);
    return () => {
      kindEl.removeEventListener("change", leer);
      locEl.removeEventListener("change", leer);
    };
  }, []);

  const opciones = modelos[locationId]?.[kind] ?? { compartidos: [], propios: [] };
  const elegido = [...opciones.compartidos, ...opciones.propios].find((m) => m.id === modelId) ?? null;

  const [crear, setCrear] = useState(elegido?.recommendedMaintenanceDays != null);
  const [dias, setDias] = useState(
    elegido?.recommendedMaintenanceDays != null ? String(elegido.recommendedMaintenanceDays) : "",
  );
  // Cambiar de modelo reinicia la sugerencia de rutina al valor que trae ESE
  // modelo — quien registra puede desmarcarla o cambiar los días después.
  //
  // Ajustado DURANTE el render, no en un efecto («adjusting state when a prop
  // changes»): un `setState` síncrono dentro de un efecto encadena un segundo
  // render evitable, y aquí no hay nada externo que sincronizar.
  const [ultimoModeloId, setUltimoModeloId] = useState(elegido?.id ?? null);
  if ((elegido?.id ?? null) !== ultimoModeloId) {
    setUltimoModeloId(elegido?.id ?? null);
    setCrear(elegido?.recommendedMaintenanceDays != null);
    setDias(elegido?.recommendedMaintenanceDays != null ? String(elegido.recommendedMaintenanceDays) : "");
  }

  return (
    <div ref={raizRef}>
      <label>
        {etiquetas.campo}
        <select name="modelId" value={modelId} onChange={(e) => setModelId(e.target.value)}>
          <option value="">{etiquetas.ninguno}</option>
          {opciones.compartidos.length > 0 ? (
            <optgroup label={etiquetas.compartidos}>
              {opciones.compartidos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.manufacturer} {m.modelName}
                </option>
              ))}
            </optgroup>
          ) : null}
          {opciones.propios.length > 0 ? (
            <optgroup label={etiquetas.propios}>
              {opciones.propios.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.manufacturer} {m.modelName}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>
      <p className="nn-muted">
        <Link href="/equipos/modelos/nuevo?volverA=/equipos/nuevo">{etiquetas.crear}</Link>
      </p>

      {elegido?.recommendedMaintenanceDays != null ? (
        <div className="nn-field">
          <label>
            <input type="checkbox" name="crearRutinaMantenimiento" checked={crear} onChange={(e) => setCrear(e.target.checked)} />
            {" "}
            {t("crearRutinaMantenimiento")}
          </label>
          {crear ? (
            <label>
              {t("rutinaDias")}
              <CampoNumerico name="rutinaMantenimientoDias" min={1} step={1} value={dias} onChange={(e) => setDias(e.target.value)} />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
