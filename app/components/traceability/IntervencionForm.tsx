"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { registrarIntervencionFormAction, corregirIntervencionFormAction } from "../../actions/manejo";
import type { TraceabilityActionState } from "../../actions/traceability";
import { TimezoneOffsetField } from "../TimezoneOffsetField";
import { BotonDeEnvio } from "../BotonDeEnvio";
import { LineaDeIntervencion, type ProductoOption, type ValoresDeLinea } from "./LineaDeIntervencion";
import type { PlotInterventionKind, PlotInterventionMethod, PlotInterventionTarget } from "../../../generated/prisma/client";

const initialState: TraceabilityActionState = {};

const KINDS: readonly PlotInterventionKind[] = ["aplicacion", "liberacion", "manejo_cultural"];

// spec §2.5 — la lista es de Daniel; crecerla es una migración de una línea.
const TARGETS: readonly PlotInterventionTarget[] = [
  "arana_roja",
  "broca",
  "minador_hoja",
  "cochinillas",
  "nematodos",
  "jobotos",
  "roya",
  "ojo_de_gallo",
  "mancha_de_hierro",
  "antracnosis",
  "llaga_macana",
  "chasparria",
  "otro",
];

const METHODS: readonly PlotInterventionMethod[] = ["follaje", "tronco", "suelo", "riego", "cebo", "liberacion", "manual", "otro"];

export interface PersonOption {
  id: string;
  displayName: string;
}
export interface SpecimenOption {
  id: string;
  commonName: string;
}

export interface IntervencionFormValues {
  kind: PlotInterventionKind;
  target: PlotInterventionTarget;
  targetNote: string | null;
  method: PlotInterventionMethod | null;
  mixVolume: number | null;
  mixUnit: string | null;
  /** En formato de `datetime-local`, ya en hora local — `paraCampoLocal`. */
  occurredAt: string;
  operatorPersonId: string | null;
  motivoObservationId: string | null;
  specimenIds: readonly string[];
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
  claveDeEnvio,
  valores,
}: {
  modo: "nuevo" | "corregir";
  locationId: string;
  /** Sólo en modo "corregir". */
  interventionId?: string;
  productos: readonly ProductoOption[];
  observers: readonly PersonOption[];
  selfPersonId: string | null;
  specimens: readonly SpecimenOption[];
  claveDeEnvio: string;
  valores: IntervencionFormValues;
}) {
  const t = useTranslations("Traceability");
  const accion = modo === "corregir" ? corregirIntervencionFormAction : registrarIntervencionFormAction;
  const [state, formAction] = useActionState(accion, initialState);

  const [kind, setKind] = useState<PlotInterventionKind>(valores.kind);
  const [target, setTarget] = useState<PlotInterventionTarget>(valores.target);
  const [lineas, setLineas] = useState<readonly ValoresDeLinea[]>(valores.lineas.length > 0 ? valores.lineas : [lineaVacia()]);
  const [areaModo, setAreaModo] = useState<"parcela" | "plantas">(valores.specimenIds.length > 0 ? "plantas" : "parcela");

  const textoDeTipo: Record<PlotInterventionKind, string> = {
    aplicacion: t("manejoKind_aplicacion"),
    liberacion: t("manejoKind_liberacion"),
    manejo_cultural: t("manejoKind_manejo_cultural"),
  };
  const textoDeObjetivo: Record<PlotInterventionTarget, string> = {
    arana_roja: t("manejoTarget_arana_roja"),
    broca: t("manejoTarget_broca"),
    minador_hoja: t("manejoTarget_minador_hoja"),
    cochinillas: t("manejoTarget_cochinillas"),
    nematodos: t("manejoTarget_nematodos"),
    jobotos: t("manejoTarget_jobotos"),
    roya: t("manejoTarget_roya"),
    ojo_de_gallo: t("manejoTarget_ojo_de_gallo"),
    mancha_de_hierro: t("manejoTarget_mancha_de_hierro"),
    antracnosis: t("manejoTarget_antracnosis"),
    llaga_macana: t("manejoTarget_llaga_macana"),
    chasparria: t("manejoTarget_chasparria"),
    otro: t("manejoTarget_otro"),
  };
  const textoDeMetodo: Record<PlotInterventionMethod, string> = {
    follaje: t("manejoMethod_follaje"),
    tronco: t("manejoMethod_tronco"),
    suelo: t("manejoMethod_suelo"),
    riego: t("manejoMethod_riego"),
    cebo: t("manejoMethod_cebo"),
    liberacion: t("manejoMethod_liberacion"),
    manual: t("manejoMethod_manual"),
    otro: t("manejoMethod_otro"),
  };

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
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} /> {textoDeTipo[k]}
          </label>
        ))}
      </fieldset>

      {kind !== "manejo_cultural" ? (
        <fieldset>
          <legend>{t("manejoLineasLegend")}</legend>
          {lineas.map((linea, i) => (
            <LineaDeIntervencion key={i} indice={i} valores={linea} productos={productos} />
          ))}
          <button type="button" className="nn-button-secondary" onClick={() => setLineas((prev) => [...prev, lineaVacia()])}>
            {t("manejoAddProductButton")}
          </button>
        </fieldset>
      ) : null}

      <fieldset>
        <legend>{t("manejoAreaLegend")}</legend>
        <label style={{ display: "block" }}>
          <input type="radio" checked={areaModo === "parcela"} onChange={() => setAreaModo("parcela")} /> {t("manejoAreaWholePlot")}
        </label>
        <label style={{ display: "block" }}>
          <input type="radio" checked={areaModo === "plantas"} onChange={() => setAreaModo("plantas")} /> {t("manejoAreaMarkPlants")}
        </label>
        {areaModo === "plantas" ? (
          specimens.length === 0 ? (
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
          )
        ) : null}
      </fieldset>

      <div className="nn-field">
        <label htmlFor="manejo-target">{t("manejoTargetLabel")}</label>
        <select id="manejo-target" name="target" value={target} onChange={(e) => setTarget(e.target.value as PlotInterventionTarget)}>
          {TARGETS.map((x) => (
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
          <input id="manejo-mix-volume" name="mixVolume" type="number" step="0.001" min={0} defaultValue={valores.mixVolume ?? ""} />
        </div>
        <div className="nn-field" style={{ flex: "1 1 100px" }}>
          <label htmlFor="manejo-mix-unit">{t("manejoMixUnitLabel")}</label>
          <input id="manejo-mix-unit" name="mixUnit" type="text" defaultValue={valores.mixUnit ?? ""} />
        </div>
      </div>

      <div className="nn-field">
        <label htmlFor="manejo-occurred-at">{t("manejoOccurredAtLabel")}</label>
        <input id="manejo-occurred-at" name="occurredAt" type="datetime-local" required defaultValue={valores.occurredAt} />
      </div>

      <div className="nn-field">
        <label htmlFor="manejo-operator">{t("manejoOperatorLabel")}</label>
        <select id="manejo-operator" name="operatorPersonId" defaultValue={valores.operatorPersonId ?? selfPersonId ?? ""}>
          <option value="">{t("manejoOperatorNone")}</option>
          {observers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === selfPersonId ? t("observerSelfOption", { name: p.displayName }) : p.displayName}
            </option>
          ))}
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
