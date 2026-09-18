"use client";

import { DECLARABLES_EN_INSPECCION, type TipoDeArtefacto } from "../../../lib/apiary/tiposDeArtefacto";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { queueDraft } from "../../../lib/apiary/offlineQueue";
import {
  CELDAS_REALES,
  ETAPAS_DE_CRIA,
  NIVELES_DE_RESERVA,
  POBLACIONES,
} from "../../../lib/apiary/estadoDeColonia";
import { APIARY_DRAFTS_CHANGED_EVENT } from "./OfflineSyncIndicator";
import { Ayuda } from "./Ayuda";

/**
 * §4's own design, revised (22_APIARY_V1_SCOPING_REPORT.md): one tap on
 * "Nothing unusual" submits immediately — occurredAt=now, operator=self,
 * outcome=nothing_unusual, everything else null. A secondary, visually
 * smaller "Record details" control expands the exceptional case. Neither
 * path ever touches the network directly: both write to the local draft
 * queue first (offlineQueue.queueDraft), which is what makes the one-tap
 * case feel instant regardless of signal, and is what makes submission
 * itself never fail — only the later sync can.
 */
export interface IrregularidadOfrecida {
  id: string;
  value: string;
  definition: string | null;
}

/**
 * Un desplegable de tres estados a `boolean | null`. Vacío es **sin registrar**,
 * y por eso vuelve `null` y no `false`: «nadie miró» no es «no». Es la misma
 * conversión que hace `TriStateField` en el lado de los formularios de servidor;
 * aquí hace falta otra porque esta pantalla guarda en IndexedDB, no en `FormData`.
 */
function triEstado(valor: string): boolean | null {
  if (valor === "si") return true;
  if (valor === "no") return false;
  return null;
}

export function InspectionForm({
  colonyId,
  selfPersonId,
  irregularidades,
}: {
  colonyId: string;
  selfPersonId: string | null;
  irregularidades: readonly IrregularidadOfrecida[];
}) {
  const t = useTranslations("Apiary");
  const [showDetails, setShowDetails] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [brood, setBrood] = useState("");
  /**
   * **Tres estados, no dos.** Era una casilla, y una casilla no puede decir «no
   * se buscó»: sin marcar guardaba `false` —«miré y no estaba»—, que es una
   * afirmación que nadie hizo. Es el defecto que `TriStateField` y
   * `tests/arquitectura/booleanos-de-tres-estados.test.ts` existen para impedir,
   * y aquí el guardia no lo veía porque su regla buscaba `name="…"` y este
   * formulario ata por estado de React. Medido el 2026-09-12: era el único caso.
   *
   * El protocolo del dueño ya pedía los tres: `queen_sighted` con `vista`,
   * `no_vista`, `no_se_busco`.
   */
  const [queenSighted, setQueenSighted] = useState("");
  const [temperament, setTemperament] = useState("");
  // Anexo B §2.2, el estado de la colonia. Cadenas vacías = sin registrar, y el
  // servicio las recibe como `null`: ninguna se rellena sola.
  const [poblacion, setPoblacion] = useState("");
  const [cuadros, setCuadros] = useState("");
  const [etapas, setEtapas] = useState<ReadonlySet<string>>(new Set());
  const [celdas, setCeldas] = useState("");
  const [celdasCuantas, setCeldasCuantas] = useState("");
  const [mielNivel, setMielNivel] = useState("");
  const [mielJuntoACria, setMielJuntoACria] = useState("");
  const [polenNivel, setPolenNivel] = useState("");
  const [polenJuntoACria, setPolenJuntoACria] = useState("");
  const [zangano, setZangano] = useState("");
  const [pest, setPest] = useState("");
  /** Los ids marcados. Un Set porque la pregunta es «¿está marcada?», no «¿en qué orden?». */
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState("");
  /**
   * Artefactos de colmena, Tarea 2 — **sólo la diferencia**, como pidió Daniel: «en la
   * inspección sólo se registra la diferencia». Todo empieza en «sin cambio» y lo que se
   * deja así no se manda.
   */
  const [cambiosCaja, setCambiosCaja] = useState<Partial<Record<TipoDeArtefacto, "" | "instalado" | "retirado">>>({});
  const [alzasPuestas, setAlzasPuestas] = useState("");
  const [otroCual, setOtroCual] = useState("");

  async function submitRoutine() {
    setSaveError(null);
    try {
      await queueDraft("inspection", {
        colonyId,
        occurredAt: new Date(),
        operatorPersonId: selfPersonId,
        outcome: "nothing_unusual",
      });
    } catch {
      // A5.5 §2: the local write itself failed (e.g. storage quota) — the
      // operator must see this now, not discover a missing entry later.
      setSaveError(t("localSaveFailedError"));
      return;
    }
    window.dispatchEvent(new Event(APIARY_DRAFTS_CHANGED_EVENT));
    setSavedMessage(t("inspectionSavedLocally"));
  }

  async function submitDetails() {
    setSaveError(null);
    // Un alza marcada sin cuenta la rechazaría el servidor, y con ella la inspección entera:
    // se dice aquí, antes de guardar, donde todavía se puede corregir.
    if (cambiosCaja.alza === "instalado" && !(Number.isInteger(Number(alzasPuestas)) && Number(alzasPuestas) > 0)) {
      setSaveError(t("alzasPuestasFaltan"));
      return;
    }
    if (cambiosCaja.otro === "instalado" && !otroCual.trim()) {
      setSaveError(t("otroCualFalta"));
      return;
    }
    try {
      await queueDraft("inspection", {
        colonyId,
        occurredAt: new Date(),
        operatorPersonId: selfPersonId,
        outcome: "issue_observed",
        broodPatternNote: brood.trim() || null,
        queenSighted: triEstado(queenSighted),
        // `storesLevel` ya NO se manda: la reemplazan las dos reservas de abajo.
        // La columna sigue en la base con lo que tuviera (ADR-117).
        temperamentNote: temperament.trim() || null,
        pestDiseaseFlags: pest.trim() || null,
        irregularidades: [...marcadas],
        note: note.trim() || null,
        // Anexo B §2.2. Van como CADENAS y las valida el servicio: el aparato no
        // es la frontera, y un desplegable manipulado no debe poder escribir.
        population: poblacion || null,
        beeCoveredFrames: cuadros === "" ? null : cuadros,
        broodStages: [...etapas],
        queenCellKind: celdas || null,
        queenCellCount: celdasCuantas === "" ? null : celdasCuantas,
        honeyStoresLevel: mielNivel || null,
        honeyNextToBrood: triEstado(mielJuntoACria),
        pollenStoresLevel: polenNivel || null,
        pollenNextToBrood: triEstado(polenJuntoACria),
        droneBroodPresent: triEstado(zangano),
        cambiosDeConfiguracion: DECLARABLES_EN_INSPECCION.flatMap((kind) => {
          const accion = cambiosCaja[kind];
          if (!accion) return [];
          return [{
            kind,
            accion,
            count: kind === "alza" && accion === "instalado" ? Number(alzasPuestas) : null,
            notes: kind === "otro" ? otroCual.trim() || null : null,
          }];
        }),
      });
    } catch {
      setSaveError(t("localSaveFailedError"));
      return;
    }
    window.dispatchEvent(new Event(APIARY_DRAFTS_CHANGED_EVENT));
    setSavedMessage(t("inspectionSavedLocally"));
    setShowDetails(false);
    setBrood("");
    setQueenSighted("");
    setTemperament("");
    setPoblacion("");
    setCuadros("");
    setEtapas(new Set());
    setCeldas("");
    setCeldasCuantas("");
    setMielNivel("");
    setMielJuntoACria("");
    setPolenNivel("");
    setPolenJuntoACria("");
    setZangano("");
    setPest("");
    setMarcadas(new Set());
    setNote("");
  }

  return (
    <div className="nn-form" style={{ maxWidth: 420 }}>
      <button
        type="button"
        className="nn-button"
        style={{ fontSize: "1.1rem", padding: "0.75rem" }}
        onClick={() => void submitRoutine()}
      >
        {t("inspectionNothingUnusualButton")}
      </button>

      {!showDetails ? (
        <button
          type="button"
          className="nn-button-quiet"
          onClick={() => setShowDetails(true)}
          style={{ marginTop: "0.5rem" }}
        >
          {t("inspectionRecordDetailsButton")}
        </button>
      ) : (
        <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div className="nn-field">
            <label htmlFor={`insp-brood-${colonyId}`}>{t("broodPatternLabel")}</label>
            <input id={`insp-brood-${colonyId}`} value={brood} onChange={(e) => setBrood(e.target.value)} />
          </div>
          {/* Tres opciones y no una casilla: «no se buscó» tiene que poder decirse. */}
          <div className="nn-field">
            <label htmlFor={`insp-queen-${colonyId}`}>{t("queenSightedLabel")}</label>
            <select id={`insp-queen-${colonyId}`} value={queenSighted} onChange={(e) => setQueenSighted(e.target.value)}>
              <option value="" />
              <option value="si">{t("triSi")}</option>
              <option value="no">{t("triNo")}</option>
            </select>
          </div>

          {/* --- Anexo B §2.2, el estado de la colonia.

              Ninguno preseleccionado: un valor por defecto afirmaría algo que
              nadie observó. Y ninguno obligatorio: una inspección rápida que sólo
              comprueba que la caja sigue viva es legítima. */}
          <div className="nn-field">
            <label htmlFor={`insp-pob-${colonyId}`}>{t("populationLabel")}</label>
            <select id={`insp-pob-${colonyId}`} value={poblacion} onChange={(e) => setPoblacion(e.target.value)}>
              <option value="" />
              {POBLACIONES.map((v) => (
                <option key={v} value={v}>
                  {t(`population_${v}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="nn-field">
            <label htmlFor={`insp-cuadros-${colonyId}`}>{t("beeCoveredFramesLabel")}</label>
            <input
              id={`insp-cuadros-${colonyId}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={cuadros}
              onChange={(e) => setCuadros(e.target.value)}
            />
          </div>
          {/* Varias a la vez: es un conjunto, no una elección. */}
          <fieldset className="nn-field">
            <legend>{t("broodStagesLegend")}</legend>
            {ETAPAS_DE_CRIA.map((v) => (
              <label key={v} htmlFor={`insp-etapa-${colonyId}-${v}`}>
                <input
                  id={`insp-etapa-${colonyId}-${v}`}
                  type="checkbox"
                  checked={etapas.has(v)}
                  onChange={(e) =>
                    setEtapas((prev) => {
                      const siguiente = new Set(prev);
                      if (e.target.checked) siguiente.add(v);
                      else siguiente.delete(v);
                      return siguiente;
                    })
                  }
                />{" "}
                {t(`broodStage_${v}`)}
              </label>
            ))}
          </fieldset>
          <div className="nn-field">
            <label htmlFor={`insp-celdas-${colonyId}`}>{t("queenCellsLabel")}</label>
            <select id={`insp-celdas-${colonyId}`} value={celdas} onChange={(e) => setCeldas(e.target.value)}>
              <option value="" />
              {CELDAS_REALES.map((v) => (
                <option key={v} value={v}>
                  {t(`queenCell_${v}`)}
                </option>
              ))}
            </select>
            <Ayuda resumen={t("ayudaResumen")}>{t("queenCellsHelp")}</Ayuda>
          </div>
          {/* Cuántas, sólo si se vio algo: un número sin tipo no dice de qué hay tres. */}
          {celdas !== "" && celdas !== "no_hay" ? (
            <div className="nn-field">
              <label htmlFor={`insp-celdas-n-${colonyId}`}>{t("queenCellsCountLabel")}</label>
              <input
                id={`insp-celdas-n-${colonyId}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={celdasCuantas}
                onChange={(e) => setCeldasCuantas(e.target.value)}
              />
            </div>
          ) : null}
          {/* Las dos reservas: NIVEL y SITIO separados. El Anexo los ponía en una
              sola lista de cuatro; decisión del dueño del 2026-09-12, ADR-117. */}
          <div className="nn-field">
            <label htmlFor={`insp-miel-${colonyId}`}>{t("honeyStoresLabel")}</label>
            <select id={`insp-miel-${colonyId}`} value={mielNivel} onChange={(e) => setMielNivel(e.target.value)}>
              <option value="" />
              {NIVELES_DE_RESERVA.map((v) => (
                <option key={v} value={v}>
                  {t(`storesLevel_${v}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="nn-field">
            <label htmlFor={`insp-miel-cria-${colonyId}`}>{t("nextToBroodLabel")}</label>
            <select
              id={`insp-miel-cria-${colonyId}`}
              value={mielJuntoACria}
              onChange={(e) => setMielJuntoACria(e.target.value)}
            >
              <option value="" />
              <option value="si">{t("triSi")}</option>
              <option value="no">{t("triNo")}</option>
            </select>
          </div>
          <div className="nn-field">
            <label htmlFor={`insp-polen-${colonyId}`}>{t("pollenStoresLabel")}</label>
            <select id={`insp-polen-${colonyId}`} value={polenNivel} onChange={(e) => setPolenNivel(e.target.value)}>
              <option value="" />
              {NIVELES_DE_RESERVA.map((v) => (
                <option key={v} value={v}>
                  {t(`storesLevel_${v}`)}
                </option>
              ))}
            </select>
            <Ayuda resumen={t("ayudaResumen")}>{t("pollenStoresHelp")}</Ayuda>
          </div>
          <div className="nn-field">
            <label htmlFor={`insp-polen-cria-${colonyId}`}>{t("nextToBroodLabel")}</label>
            <select
              id={`insp-polen-cria-${colonyId}`}
              value={polenJuntoACria}
              onChange={(e) => setPolenJuntoACria(e.target.value)}
            >
              <option value="" />
              <option value="si">{t("triSi")}</option>
              <option value="no">{t("triNo")}</option>
            </select>
          </div>
          <div className="nn-field">
            <label htmlFor={`insp-zangano-${colonyId}`}>{t("droneBroodLabel")}</label>
            <select id={`insp-zangano-${colonyId}`} value={zangano} onChange={(e) => setZangano(e.target.value)}>
              <option value="" />
              <option value="si">{t("triSi")}</option>
              <option value="no">{t("triNo")}</option>
            </select>
            <Ayuda resumen={t("ayudaResumen")}>{t("droneBroodHelp")}</Ayuda>
          </div>
          <div className="nn-field">
            <label htmlFor={`insp-temperament-${colonyId}`}>{t("temperamentLabel")}</label>
            <input id={`insp-temperament-${colonyId}`} value={temperament} onChange={(e) => setTemperament(e.target.value)} />
          </div>
          {/* Las irregularidades, como CASILLAS y no como texto.

              El Anexo B §2.3 lo pide así —«lista de casillas, no texto libre»—
              y dice por qué: una cadena no se puede contar, y «todas las
              colonias con varroa esta temporada» es el reporte que hace falta.
              El campo de texto sigue debajo para el «Otro» con que esa misma
              lista termina. */}
          <fieldset className="nn-field">
            <legend>{t("irregularidadesLegend")}</legend>
            {irregularidades.map((irr) => (
              <label key={irr.id} htmlFor={`insp-irr-${irr.id}`} title={irr.definition ?? undefined}>
                <input
                  id={`insp-irr-${irr.id}`}
                  type="checkbox"
                  checked={marcadas.has(irr.id)}
                  onChange={(e) =>
                    setMarcadas((prev) => {
                      const siguiente = new Set(prev);
                      if (e.target.checked) siguiente.add(irr.id);
                      else siguiente.delete(irr.id);
                      return siguiente;
                    })
                  }
                />{" "}
                {irr.value}
              </label>
            ))}
          </fieldset>
          {/* Plegado y sin nada marcado: una visita en la que no cambió la caja no pregunta nada. */}
          <details className="nn-field">
            <summary>{t("cambiosCajaResumen")}</summary>
            {DECLARABLES_EN_INSPECCION.map((kind) => (
              <div key={kind} className="nn-field">
                <label htmlFor={`insp-caja-${kind}-${colonyId}`}>{t(`artefacto_${kind}`)}</label>
                <select
                  id={`insp-caja-${kind}-${colonyId}`}
                  value={cambiosCaja[kind] ?? ""}
                  onChange={(e) => setCambiosCaja((prev) => ({ ...prev, [kind]: e.target.value as "" | "instalado" | "retirado" }))}
                >
                  <option value="">{t("cambioSinCambio")}</option>
                  <option value="instalado">{t("cambioInstalado")}</option>
                  {/* «Se quitó el otro» no dice cuál: se retira donde se ve cuál. */}
                  {kind !== "otro" ? <option value="retirado">{t("cambioRetirado")}</option> : null}
                </select>
                {kind === "alza" && cambiosCaja.alza === "instalado" ? (
                  <input
                    aria-label={t("alzasPuestasLabel")}
                    placeholder={t("alzasPuestasLabel")}
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={alzasPuestas}
                    onChange={(e) => setAlzasPuestas(e.target.value)}
                  />
                ) : null}
                {kind === "otro" && cambiosCaja.otro === "instalado" ? (
                  <input aria-label={t("otroCualLabel")} placeholder={t("otroCualLabel")} value={otroCual} onChange={(e) => setOtroCual(e.target.value)} />
                ) : null}
              </div>
            ))}
          </details>
          <div className="nn-field">
            <label htmlFor={`insp-pest-${colonyId}`}>{t("pestDiseaseFlagsLabel")}</label>
            <input id={`insp-pest-${colonyId}`} value={pest} onChange={(e) => setPest(e.target.value)} />
          </div>
          <div className="nn-field">
            <label htmlFor={`insp-note-${colonyId}`}>{t("noteLabel")}</label>
            <textarea id={`insp-note-${colonyId}`} value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="nn-button" onClick={() => void submitDetails()}>
              {t("inspectionRecordButton")}
            </button>
            <button type="button" className="nn-button-quiet" onClick={() => setShowDetails(false)}>
              {t("cancelButton")}
            </button>
          </div>
        </div>
      )}

      {savedMessage ? (
        <p className="nn-muted" style={{ marginTop: "0.5rem" }}>
          {savedMessage}
        </p>
      ) : null}
      {saveError ? (
        <p className="nn-error" role="alert" style={{ marginTop: "0.5rem" }}>
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
