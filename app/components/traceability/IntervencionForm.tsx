"use client";

import { OpcionesDePersona } from "../OpcionesDePersona";
import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { registrarIntervencionFormAction, corregirIntervencionFormAction } from "../../actions/manejo";
import type { TraceabilityActionState } from "../../actions/traceability";
import { TimezoneOffsetField } from "../TimezoneOffsetField";
import { paraCampoLocal, instanteAPrecargar } from "../../../lib/time/localDateTime";
import { BotonDeEnvio } from "../BotonDeEnvio";
import { soltarFocoConLaRueda } from "../CampoNumerico";
import { LineaDeIntervencion, type ProductoOption, type ValoresDeLinea } from "./LineaDeIntervencion";
import { hayFloracion, type VentanaDeFloracion } from "../../../lib/traceability/floracionVigente";
import { textoDeTipoDeManejo, textoDeObjetivoDeManejo, textoDeMetodoDeManejo } from "./etiquetasDeManejo";
import type { PlotInterventionKind, PlotInterventionMethod, PlotInterventionTarget } from "../../../generated/prisma/client";

const initialState: TraceabilityActionState = {};

import { PLAGAS } from "../../../lib/traceability/plagas";

const KINDS: readonly PlotInterventionKind[] = ["aplicacion", "liberacion", "manejo_cultural"];


const METHODS: readonly PlotInterventionMethod[] = ["follaje", "tronco", "suelo", "riego", "cebo", "liberacion", "manual", "otro"];

export interface PersonOption {
  id: string;
  displayName: string;
}
export interface SpecimenOption {
  id: string;
  commonName: string;
}
export interface PlotBlockOption {
  id: string;
  name: string;
}

export interface IntervencionFormValues {
  kind: PlotInterventionKind;
  target: PlotInterventionTarget;
  targetNote: string | null;
  method: PlotInterventionMethod | null;
  mixVolume: number | null;
  mixUnit: string | null;
  /**
   * El instante en ISO, o `null` para «ahora» — ronda final, hallazgo 1.
   * **Nunca** ya formateado para `datetime-local`: esa conversión depende de
   * la zona del DISPOSITIVO (`paraCampoLocal`), y precargarla en el servidor
   * horneaba ahí la zona del servidor. Este componente la hace en un efecto,
   * igual que `MeasurementCorrectionForm`.
   */
  occurredAt: string | null;
  operatorPersonId: string | null;
  motivoObservationId: string | null;
  specimenIds: readonly string[];
  /** Los bloques marcados — Tarea 5 PR B. Igual que `specimenIds`: guardar sin tocarlos los conserva. */
  plotBlockIds: readonly string[];
  notes: string | null;
  lineas: readonly ValoresDeLinea[];
}

const lineaVacia = (): ValoresDeLinea => ({
  materialId: "",
  consumableLotId: null,
  quantity: null,
  unit: null,
  withdrawalDays: null,
  reentryHours: null,
});

/**
 * Registrar o corregir una intervención fitosanitaria — Tarea 8, spec §5.
 * Un mismo formulario para las dos: `modo="corregir"` manda a
 * `corregirIntervencionFormAction`, precarga todo desde `valores` y añade el
 * motivo obligatorio.
 */
export function IntervencionForm({
  modo,
  locationId,
  interventionId,
  productos,
  observers,
  selfPersonId,
  specimens,
  bloques,
  ventanasDeFloracion,
  claveDeEnvio,
  valores,
}: {
  modo: "nuevo" | "corregir";
  locationId: string;
  /**
   * Las ventanas de floración de esta parcela. Van ENTERAS y la decisión se toma aquí porque la
   * fecha vive aquí: el operario puede corregirla, y un aviso calculado en el servidor para «ahora»
   * se equivocaría en cuanto lo hiciera. Vacío = nadie anotó floración, y entonces no avisa nada.
   */
  ventanasDeFloracion?: readonly VentanaDeFloracion[];
  /** Sólo en modo "corregir". */
  interventionId?: string;
  productos: readonly ProductoOption[];
  observers: readonly PersonOption[];
  selfPersonId: string | null;
  specimens: readonly SpecimenOption[];
  bloques: readonly PlotBlockOption[];
  claveDeEnvio: string;
  valores: IntervencionFormValues;
}) {
  const t = useTranslations("Traceability");
  const accion = modo === "corregir" ? corregirIntervencionFormAction : registrarIntervencionFormAction;
  const [state, formAction] = useActionState(accion, initialState);

  const [kind, setKind] = useState<PlotInterventionKind>(valores.kind);
  const [target, setTarget] = useState<PlotInterventionTarget>(valores.target);
  const [lineas, setLineas] = useState<readonly ValoresDeLinea[]>(valores.lineas.length > 0 ? valores.lineas : [lineaVacia()]);

  /**
   * Ronda final, hallazgo 1: el reloj de pared se escribe en el DOM al
   * montar, nunca se renderiza en el servidor — mismo motivo que
   * `TimezoneOffsetField` y `MeasurementCorrectionForm`. Antes esta pantalla
   * recibía `valores.occurredAt` ya formateado por `paraCampoLocal` en el
   * SERVIDOR: con el servidor en UTC y el dispositivo en Panamá, corregir sin
   * tocar la hora desplazaba el instante cinco horas.
   */
  const refOccurredAt = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (refOccurredAt.current) {
      refOccurredAt.current.value = paraCampoLocal(instanteAPrecargar(valores.occurredAt, new Date()));
    }
  }, [valores.occurredAt]);

  /**
   * **El aviso de floración se decide aquí, y se OBSERVA en vez de controlar.**
   *
   * El campo de fecha y las casillas de bloque son no controlados a propósito —`ref` y
   * `defaultChecked`—, por el hallazgo 1 de arriba. Convertirlos en controlados para poder avisar
   * sería un cambio mucho mayor que el aviso, así que se les añade un `onChange` que sólo mira:
   * siguen siendo del DOM y aquí se guarda una copia para decidir.
   *
   * La fecha empieza en `null` porque el efecto de arriba la escribe DESPUÉS de montar.
   * `instanteAPrecargar` da la misma respuesta que ese efecto, así que el aviso es correcto desde el
   * primer render en vez de aparecer de golpe al tocar el campo.
   */
  const [cuandoElegido, setCuandoElegido] = useState<string | null>(null);
  const [bloquesElegidos, setBloquesElegidos] = useState<readonly string[]>(valores.plotBlockIds);
  // `new Date("2026-03-10T07:30")` sobre un reloj de pared sin zona lo interpreta en la zona de
  // QUIEN EJECUTA. Aquí eso es correcto y no es casualidad: este código corre en el navegador, y la
  // zona del dispositivo es exactamente la que el operario quiere decir — es la misma que el
  // formulario manda en `TimezoneOffsetField` para que el servidor la combine. La misma línea en el
  // servidor sería el fallo de husos que costó nueve sitios en tres módulos.
  const cuandoSeAplica = cuandoElegido ? new Date(cuandoElegido) : instanteAPrecargar(valores.occurredAt, new Date());
  /**
   * **Una sola expresión, y el guardia la exige así.** La primera versión envolvía esto en un IIFE
   * con un `if (ventanas.length === 0) return false` delante — innecesario, porque `hayFloracion`
   * sobre una lista vacía ya devuelve `false` y eso tiene su propia prueba. Y el IIFE dejaba un
   * hueco: una revisión adversaria le puso `const enFloracion = false && (() => {…})()`, el aviso
   * dejó de salir para siempre, y el guardia siguió **verde 12/12** porque `hayFloracion(` seguía
   * apareciendo en el archivo. Con la asignación directa, el guardia ancla `const enFloracion =
   * hayFloracion(` y esa mutación ya no pasa.
   */
  const enFloracion = hayFloracion(ventanasDeFloracion ?? [], cuandoSeAplica, bloquesElegidos);

  // Tarea 8, ronda de arreglos 1 (menor #1): las tres tablas salen de
  // `etiquetasDeManejo.ts`, compartida con las otras pantallas que las usan.
  const textoDeTipo = textoDeTipoDeManejo(t);
  const textoDeObjetivo = textoDeObjetivoDeManejo(t);
  const textoDeMetodo = textoDeMetodoDeManejo(t);

  return (
    <form action={formAction} className="nn-form">
      <TimezoneOffsetField />
      <input type="hidden" name="claveDeEnvio" value={claveDeEnvio} />
      <input type="hidden" name="locationId" value={locationId} />
      {modo === "corregir" ? <input type="hidden" name="interventionId" value={interventionId} /> : null}
      {valores.motivoObservationId ? <input type="hidden" name="motivoObservationId" value={valores.motivoObservationId} /> : null}

      <fieldset>
        <legend>{t("manejoKindLegend")}</legend>
        {KINDS.map((k) => (
          <label key={k} style={{ display: "block" }}>
            <input
              type="radio"
              name="kind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
              aria-label={textoDeTipo[k]}
            />{" "}
            {textoDeTipo[k]}
          </label>
        ))}
      </fieldset>

      {kind !== "manejo_cultural" ? (
        <fieldset>
          <legend>{t("manejoLineasLegend")}</legend>
          {lineas.map((linea, i) => (
            <LineaDeIntervencion
              key={i}
              indice={i}
              valores={linea}
              productos={productos}
              target={target}
              enFloracion={enFloracion}
            />
          ))}
          <button type="button" className="nn-button-secondary" onClick={() => setLineas((prev) => [...prev, lineaVacia()])}>
            {t("manejoAddProductButton")}
          </button>
        </fieldset>
      ) : null}

      <fieldset>
        <legend>{t("manejoAreaLegend")}</legend>
        {/*
         * Ronda final de arreglos, hallazgo 2: el modelo permite áreas MIXTAS
         * (plantas Y bloques a la vez — `crearAreas`, `intervenciones.ts`); un
         * radio de tres modos excluyentes obligaba a elegir uno, así que
         * corregir una intervención mixta mostrando sólo "plantas" enviaba
         * `plotBlockIds: []` y borraba los bloques en silencio. Las dos
         * secciones se enseñan y envían siempre juntas, cada una precargada
         * con lo que ya tenga la intervención; "parcela entera" sigue siendo
         * el caso de no marcar nada en ninguna, spec §2.2.
         */}
        <p className="nn-muted">{t("manejoAreaWholePlotHint")}</p>
        <p>{t("manejoAreaMarkPlants")}</p>
        {specimens.length === 0 ? (
          <p className="nn-muted">{t("manejoAreaNoPlants")}</p>
        ) : (
          <ul className="nn-seleccion">
            {specimens.map((s) => (
              <li key={s.id}>
                <label htmlFor={`specimen-${s.id}`}>
                  <input
                    id={`specimen-${s.id}`}
                    type="checkbox"
                    name="specimenIds"
                    value={s.id}
                    defaultChecked={valores.specimenIds.includes(s.id)}
                  />{" "}
                  {s.commonName}
                </label>
              </li>
            ))}
          </ul>
        )}
        <p>{t("manejoAreaMarkBlocks")}</p>
        {bloques.length === 0 ? (
          <p className="nn-muted">{t("manejoAreaNoBlocks")}</p>
        ) : (
          <ul className="nn-seleccion">
            {bloques.map((b) => (
              <li key={b.id}>
                <label htmlFor={`bloque-${b.id}`}>
                  <input
                    id={`bloque-${b.id}`}
                    type="checkbox"
                    name="plotBlockIds"
                    value={b.id}
                    defaultChecked={valores.plotBlockIds.includes(b.id)}
                    onChange={(e) =>
                      setBloquesElegidos((prev) =>
                        e.target.checked ? [...prev, b.id] : prev.filter((x) => x !== b.id),
                      )
                    }
                  />{" "}
                  {b.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="nn-field">
        <label htmlFor="manejo-target">{t("manejoTargetLabel")}</label>
        <select id="manejo-target" name="target" value={target} onChange={(e) => setTarget(e.target.value as PlotInterventionTarget)}>
          {PLAGAS.map((x) => (
            <option key={x} value={x}>
              {textoDeObjetivo[x]}
            </option>
          ))}
        </select>
      </div>
      {target === "otro" ? (
        <div className="nn-field">
          <label htmlFor="manejo-target-note">{t("manejoTargetNoteLabel")}</label>
          <input id="manejo-target-note" name="targetNote" type="text" required defaultValue={valores.targetNote ?? ""} />
        </div>
      ) : null}

      <div className="nn-field">
        <label htmlFor="manejo-method">{t("manejoMethodLabel")}</label>
        <select id="manejo-method" name="method" defaultValue={valores.method ?? ""}>
          <option value="">{t("manejoMethodNone")}</option>
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {textoDeMetodo[m]}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <div className="nn-field" style={{ flex: "1 1 140px" }}>
          <label htmlFor="manejo-mix-volume">{t("manejoMixVolumeLabel")}</label>
          <input id="manejo-mix-volume" name="mixVolume" type="number" step="0.001" min={0} defaultValue={valores.mixVolume ?? ""} onWheel={soltarFocoConLaRueda} />
        </div>
        <div className="nn-field" style={{ flex: "1 1 100px" }}>
          <label htmlFor="manejo-mix-unit">{t("manejoMixUnitLabel")}</label>
          <input id="manejo-mix-unit" name="mixUnit" type="text" defaultValue={valores.mixUnit ?? ""} />
        </div>
      </div>

      <div className="nn-field">
        <label htmlFor="manejo-occurred-at">{t("manejoOccurredAtLabel")}</label>
        <input
          id="manejo-occurred-at"
          name="occurredAt"
          type="datetime-local"
          required
          ref={refOccurredAt}
          defaultValue=""
          onChange={(e) => setCuandoElegido(e.target.value || null)}
        />
      </div>

      <div className="nn-field">
        <label htmlFor="manejo-operator">{t("manejoOperatorLabel")}</label>
        <select id="manejo-operator" name="operatorPersonId" defaultValue={valores.operatorPersonId ?? selfPersonId ?? ""}>
          <option value="">{t("manejoOperatorNone")}</option>
          <OpcionesDePersona personas={observers} selfPersonId={selfPersonId} />
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="manejo-notes">{t("notesLabel")}</label>
        <textarea id="manejo-notes" name="notes" rows={2} defaultValue={valores.notes ?? ""} />
      </div>

      {modo === "corregir" ? (
        <div className="nn-field">
          <label htmlFor="manejo-motivo">{t("manejoCorrectionReasonLabel")}</label>
          <textarea id="manejo-motivo" name="motivo" rows={2} required />
        </div>
      ) : null}

      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <BotonDeEnvio className="nn-button">{t(modo === "corregir" ? "manejoCorrectButton" : "manejoRegisterButton")}</BotonDeEnvio>
    </form>
  );
}
