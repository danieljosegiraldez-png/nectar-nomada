"use client";

import { OpcionesDePersona } from "../OpcionesDePersona";
import { CampoNumerico } from "../CampoNumerico";
import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { recordMeasurementAction, type TraceabilityActionState } from "../../actions/traceability";
import { unidadesAceptadas } from "../../../lib/traceability/units";
import { TimezoneOffsetField } from "../TimezoneOffsetField";
import { paraCampoLocal } from "../../../lib/time/localDateTime";

import type { MaterialState } from "../../../generated/prisma/client";
import type { ModoDeMedicion } from "../../../lib/equipos/modos";
import { avisoDeModo, materialNoEsDeSecado, MATERIALES, sinCamposVacios } from "../../../lib/traceability/avisoDeModo";

const initialState: TraceabilityActionState = {};

// §10.3's six Measurement-routed variables — weight is deliberately absent
// (routed through QuantityEvent, not here, per T3's own design).
const VARIABLES = ["temperature", "ph", "brix", "relative_humidity", "moisture", "water_activity"] as const;

interface ObserverOption {
  id: string;
  displayName: string;
}

/**
 * **Tres campos menos de trabajo (2026-09-11).** Daniel, usándolo: «there is a
 * field for unit and also for variable and it could be redundant… its like you
 * are trying to make me work more».
 *
 * Tenía razón y medía peor de lo que sonaba. La unidad era una **caja de texto
 * libre obligatoria**, y de las seis variables que este formulario ofrece
 * **cinco admiten una sola unidad** —`ph` sólo pH, `brix` sólo Bx, `%` las dos
 * humedades, `aw` la actividad de agua—. Sólo la temperatura elige entre C y F.
 * Escribirla era teclear una respuesta que el registro ya conoce, y teclearla
 * mal era un rechazo: los dos únicos desenlaces eran «acertaste y sobraba» o
 * «fallaste y te bloquea».
 *
 * Ahora la unidad **se deriva de la variable**: una sola → campo oculto, no se
 * pregunta; varias → un desplegable con ésas y sólo ésas. La fuente sigue
 * siendo `lib/traceability/units.ts`, así que añadir una unidad a una variable
 * cambia esta pantalla sin tocarla.
 *
 * **La procedencia también sale del camino**, por decisión de Daniel el mismo
 * día. Era un desplegable de cinco para una respuesta que en esta fase es
 * siempre la misma: una lectura de instrumento es un hecho medido. Va como
 * campo oculto; el día que entre un sensor o una importación, ese camino pondrá
 * su propia procedencia, que es donde corresponde decidirlo — no tecleándolo.
 *
 * **Y entra «cuándo se midió», que antes no existía.** La acción ponía
 * `new Date()`, la hora de GUARDAR. Medir a las 7 en el patio y escribirlo a
 * las 9 en la oficina quedaba fechado a las 9, y en una fermentación la curva
 * es el dato. Llega relleno con la hora actual: si mides y anotas a la vez, no
 * se toca.
 */
export function MeasurementForm({
  lotId,
  observers,
  selfPersonId,
  fermentationRunId,
  dryingRunId,
  storageAssignmentId,
  claveDeEnvio,
  instrumentos = [],
  inspecciones = [],
  materialInicial = null,
  instrumentInicial = "",
  modoInicial = "",
  enSecado = false,
}: {
  // La genera el servidor al pintar la página, no el cliente: un `useState` con
  // `crypto.randomUUID()` daría un valor al renderizar en servidor y otro al
  // hidratar, que es un desajuste de hidratación.
  instrumentos?: { id: string; name: string; modos: ModoDeMedicion[] }[];
  inspecciones?: { id: string; label: string }[];
  materialInicial?: MaterialState | null;
  instrumentInicial?: string;
  modoInicial?: string;
  enSecado?: boolean;
  claveDeEnvio: string;
  lotId: string;
  observers: ObserverOption[];
  selfPersonId: string | null;
  // Pre-existing gap fix: the Lot Detail page already knows which of these
  // (if any) is the lot's current active context — same activeFermentation/
  // activeDrying/currentStorage it uses for the other contextual forms on
  // that page. At most one is ever non-null for a given lot at a time.
  fermentationRunId?: string | null;
  dryingRunId?: string | null;
  storageAssignmentId?: string | null;
}) {
  const [state, formAction, pending] = useActionState(recordMeasurementAction, initialState);
  const t = useTranslations("Traceability");

  const [instrumentId, setInstrumentId] = useState(instrumentInicial);
  const [modoId, setModoId] = useState(modoInicial);
  const [material, setMaterial] = useState<MaterialState | "">(materialInicial ?? "");
  const [inspeccion, setInspeccion] = useState("");
  const [otrosMateriales, setOtrosMateriales] = useState(false);
  const equipo = instrumentos.find((e) => e.id === instrumentId);
  const aviso = equipo ? avisoDeModo(material || null, equipo.modos, modoId) : null;
  const secado = enSecado || !!dryingRunId;
  const materiales = MATERIALES.filter((m) => !secado || otrosMateriales || m !== "GREEN" || material === m);

  const [variable, setVariable] = useState<string>("temperature");
  const unidades = unidadesAceptadas(variable);
  const unicaUnidad = unidades.length === 1 ? unidades[0] : null;

  // El «ahora» se escribe en el DOM al montar, por la misma razón que el
  // desfase horario: en el servidor este componente también se renderiza, y
  // allí el reloj de pared es el del servidor —UTC en producción—, que es el
  // valor equivocado. Sale vacío del servidor y lo rellena el navegador.
  const cuandoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (cuandoRef.current && !cuandoRef.current.value) {
      cuandoRef.current.value = paraCampoLocal(new Date());
    }
  }, []);

  return (
    <form action={(datos) => formAction(sinCamposVacios(datos))} className="nn-form" style={{ maxWidth: 480, marginTop: "1rem" }}>
      <input type="hidden" name="claveDeEnvio" value={claveDeEnvio} />
      <input type="hidden" name="lotId" value={lotId} />
      <TimezoneOffsetField />
      {/* Una lectura de instrumento es un hecho medido. Ver la cabecera. */}
      <input type="hidden" name="provenanceClass" value="measured_fact" />
      {fermentationRunId ? <input type="hidden" name="fermentationRunId" value={fermentationRunId} /> : null}
      {dryingRunId ? <input type="hidden" name="dryingRunId" value={dryingRunId} /> : null}
      {storageAssignmentId ? <input type="hidden" name="storageAssignmentId" value={storageAssignmentId} /> : null}

      <div className="nn-field">
        <label htmlFor="materialState">{t("materialStateLabel")}</label>
        <select id="materialState" name="materialState" value={material} onChange={(e) => setMaterial(e.target.value as MaterialState | "")}>
          <option value="">{t("notDeclaredOption")}</option>
          {materiales.map((m) => <option key={m} value={m}>{t(`material_${m}`)}</option>)}
        </select>
        {secado ? <label><input type="checkbox" checked={otrosMateriales} onChange={(e) => setOtrosMateriales(e.target.checked)} />{t("otherStageMaterials")}</label> : null}
      </div>
      {materialNoEsDeSecado(material || null, secado) ? <p role="status">{t("aviso_material_no_es_de_esta_etapa")}</p> : null}
      <div className="nn-field">
        <label htmlFor="instrumentId">{t("instrumentLabel")}</label>
        <select id="instrumentId" name="instrumentId" value={instrumentId} onChange={(e) => { setInstrumentId(e.target.value); setModoId(""); }}>
          <option value="">{t("notDeclaredOption")}</option>
          {instrumentos.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      {equipo ? <div className="nn-field">
        <label htmlFor="instrumentModeId">{t("instrumentModeLabel")}</label>
        <select id="instrumentModeId" name="instrumentModeId" value={modoId} onChange={(e) => setModoId(e.target.value)}>
          <option value="">{t("notDeclaredOption")}</option>
          {equipo.modos.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div> : null}
      {aviso && material ? <p role="status">{t(aviso.clave, { modo: aviso.modo, material: t(`material_${material}`) })}</p> : null}
      {inspecciones.length > 0 ? <div className="nn-field">
        <label htmlFor="samplingEventId">{t("samplingEventLabel")}</label>
        <select id="samplingEventId" name="samplingEventId" value={inspeccion} onChange={(e) => setInspeccion(e.target.value)}>
          <option value="">{t("notDeclaredOption")}</option>
          {inspecciones.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      </div> : null}
      {inspeccion ? <>
        <div className="nn-field">
          <label htmlFor="samplingRole">{t("samplingRoleLabel")}</label>
          <select id="samplingRole" name="samplingRole" defaultValue="">
            <option value="">{t("notDeclaredOption")}</option>
            {(["ZONE", "REPLICATE"] as const).map((r) => <option key={r} value={r}>{t(`samplingRole_${r}`)}</option>)}
          </select>
        </div>
        <div className="nn-field">
          <label htmlFor="samplingZone">{t("samplingZoneLabel")}</label>
          <select id="samplingZone" name="samplingZone" defaultValue="">
            <option value="">{t("notDeclaredOption")}</option>
            {(["NORTH", "SOUTH", "EAST", "WEST", "CENTER", "EDGE"] as const).map((z) => <option key={z} value={z}>{t(`samplingZone_${z}`)}</option>)}
          </select>
        </div>
      </> : null}

      <div className="nn-field">
        <label htmlFor="variable">{t("variableLabel")}</label>
        <select id="variable" name="variable" value={variable} onChange={(e) => setVariable(e.target.value)}>
          {VARIABLES.map((v) => (
            <option key={v} value={v}>
              {t(`variable_${v}` as "variable_temperature")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="value">
          {unicaUnidad ? t("valueLabelWithUnit", { unit: unicaUnidad }) : t("valueLabel")}
        </label>
        <CampoNumerico id="value" name="value" inputMode="decimal" step="0.01" required />
      </div>

      {unicaUnidad ? (
        <input type="hidden" name="unit" value={unicaUnidad} />
      ) : (
        <div className="nn-field">
          <label htmlFor="unit">{t("unitLabel")}</label>
          <select id="unit" name="unit" defaultValue={unidades[0]} key={variable}>
            {unidades.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="nn-field">
        <label htmlFor="occurredAt">{t("measuredAtLabel")}</label>
        <input ref={cuandoRef} id="occurredAt" name="occurredAt" type="datetime-local" defaultValue="" required />
      </div>

      <div className="nn-field">
        <label htmlFor="operatorPersonId">{t("observerLabel")}</label>
        <select id="operatorPersonId" name="operatorPersonId" defaultValue={selfPersonId ?? ""}>
          <OpcionesDePersona personas={observers} selfPersonId={selfPersonId} />
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="notes">{t("notesLabel")}</label>
        <textarea id="notes" name="notes" rows={2} />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("recordMeasurementButton")}
      </button>
    </form>
  );
}
