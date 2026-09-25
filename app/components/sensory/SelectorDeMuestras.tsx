"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { buscarMuestrasParaCataAction } from "../../actions/sensory";
import { codigoCiego } from "../../../lib/sensory/muestraEnCata";

interface Opcion {
  key: string;
  sampleId: string;
  roastSessionId: string | null;
  label: string;
}

/**
 * Elegir las muestras de una cata buscando varias veces.
 *
 * **Por qué (Daniel, 2026-09-18):** «un cupping se debe poder seleccionar o hacer
 * búsquedas y seleccionar varias muestras y a veces no vienen mismo lugar, lote,
 * finca, parcela». Buscar reemplaza los resultados; **la selección no se toca**.
 *
 * **El orden en que se marcan decide el código ciego**, y la lista de
 * seleccionadas lo enseña con la misma `codigoCiego` que usa el servidor. Los
 * `<input type="hidden">` van en ese orden, y `getAll("muestras")` lo conserva.
 * Con las casillas de antes el texto de ayuda lo prometía y no era verdad: el
 * orden era el de la pantalla, no el de los clics.
 */
export function SelectorDeMuestras({ iniciales, hayMasInicial }: { iniciales: Opcion[]; hayMasInicial: boolean }) {
  const t = useTranslations("Sensory");
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Opcion[]>(iniciales);
  const [hayMas, setHayMas] = useState(hayMasInicial);
  const [error, setError] = useState<string | null>(null);
  const [buscadoCon, setBuscadoCon] = useState<string | null>(null);
  const [seleccionadas, setSeleccionadas] = useState<Opcion[]>([]);
  const [buscando, startTransition] = useTransition();

  const marcada = (key: string) => seleccionadas.some((s) => s.key === key);
  const alternar = (o: Opcion) =>
    setSeleccionadas((prev) => (prev.some((s) => s.key === o.key) ? prev.filter((s) => s.key !== o.key) : [...prev, o]));

  const buscar = () =>
    startTransition(async () => {
      const r = await buscarMuestrasParaCataAction(texto);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setError(null);
      setResultados(r.muestras);
      setHayMas(r.hayMas);
      setBuscadoCon(texto.trim());
    });

  return (
    <fieldset className="nn-field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>{t("sessionSamplesLabel")}</legend>

      <label htmlFor="cs-buscar">{t("sampleSearchLabel")}</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          id="cs-buscar"
          type="search"
          value={texto}
          placeholder={t("sampleSearchPlaceholder")}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter busca; no envía la cata a medio elegir.
            if (e.key === "Enter") {
              e.preventDefault();
              buscar();
            }
          }}
          style={{ flex: "1 1 200px" }}
        />
        <button type="button" className="nn-button" onClick={buscar} disabled={buscando}>
          {buscando ? t("sampleSearching") : t("sampleSearchButton")}
        </button>
      </div>

      {error ? (
        <p className="nn-error" role="alert">
          {error}
        </p>
      ) : null}

      <div aria-live="polite">
        {resultados.length === 0 ? (
          <p className="nn-muted">{t("sampleSearchNoResults", { texto: buscadoCon ?? "" })}</p>
        ) : (
          resultados.map((m) => (
            <label key={m.key} className="nn-sensory-sample-option">
              <input type="checkbox" checked={marcada(m.key)} onChange={() => alternar(m)} /> <span>{m.label}</span>
            </label>
          ))
        )}
        {hayMas ? <p className="nn-muted">{t("sampleSearchMore", { n: resultados.length })}</p> : null}
      </div>

      <h3 style={{ fontSize: "1rem", marginTop: 16 }}>{t("sampleSelectedTitle", { n: seleccionadas.length })}</h3>
      <p className="nn-muted">{t("sessionSamplesHelp")}</p>
      {seleccionadas.length === 0 ? (
        <p className="nn-muted">{t("sampleSelectedNone")}</p>
      ) : (
        <ol style={{ listStyle: "none", padding: 0 }}>
          {seleccionadas.map((s, i) => (
            <li key={s.key} className="nn-sensory-selected-row">
              <strong>{codigoCiego(i)}</strong>
              <span style={{ flex: 1 }}>{s.label}</span>
              <button type="button" className="nn-link-button" onClick={() => alternar(s)}>
                {t("sampleRemove")}
              </button>
              <input type="hidden" name="muestras" value={s.sampleId} />
              <input type="hidden" name="roastSessions" value={s.roastSessionId ?? ""} />
            </li>
          ))}
        </ol>
      )}
    </fieldset>
  );
}
