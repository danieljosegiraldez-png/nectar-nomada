"use client";

import { OpcionesDePersona, type OpcionDePersona } from "../OpcionesDePersona";
import { CampoNumerico } from "../CampoNumerico";
import { startTransition, useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { recordRoastSessionAction, type TraceabilityActionState } from "../../actions/traceability";
import { TimezoneOffsetField } from "../TimezoneOffsetField";
import { PROCEDENCIA_DE_REGISTRO_DE_CAMPO } from "../../../lib/traceability/procedencia";

const initialState: TraceabilityActionState = {};

/**
 * R1 §4 — registrar un tueste ya hecho.
 *
 * **Un solo envío, no un empezar/terminar.** Fermentación y secado se registran
 * en dos llamadas porque duran lo que duran y nadie sabe cuánto al empezar. Un
 * tueste dura minutos y su punto de captura real es «anótalo cuando acabe», que
 * es la misma forma que ya usa la cosecha. Lo dice el propio servicio en su
 * cabecera; esta pantalla no lo reinterpreta.
 *
 * **Fecha real obligatoria:** muestras reciben código automático; producción requiere código.
 * Una muestra vinculada exige peso de carga.
 * Todo lo demás —niveles, pesos, cracks, equipo— es opcional, porque un tostador
 * que acaba de descargar tiene las manos ocupadas y la alternativa a un formulario
 * corto no es un formulario completo: es ningún registro.
 *
 * **La procedencia se elige, no se fija.** Aquí sí importa la distinción de §3:
 * un perfil leído de la máquina no vale lo mismo que uno recordado esa noche.
 * En secado se fija a `original_record` porque empezar un secado es un acto, no
 * una lectura; un tueste registrado después puede ser cualquiera de las dos.
 */

interface PerfilOption {
  id: string;
  label: string;
}

interface Opcion { id: string; label: string }
interface MuestraOption extends Opcion { disponibleKg: number | null }

export function RoastSessionForm({ lotId, perfiles, muestras, equipos, personas, selfPersonId }: {
  lotId: string; perfiles: PerfilOption[]; muestras: MuestraOption[]; equipos: Opcion[];
  personas: OpcionDePersona[]; selfPersonId: string | null;
}) {
  const [state, formAction, pending] = useActionState(recordRoastSessionAction, initialState);
  const t = useTranslations("Traceability");
  const [purpose, setPurpose] = useState("sample");

  return (
    <form method="post" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      // Dispatch explicitly: a returned domain error must not reset the form.
      startTransition(() => formAction(data));
    }} className="nn-form" style={{ maxWidth: 480 }}>
      {/* Sin esto `parseLocalDateTime` lanza `timezone_offset_missing`: se
          niega a adivinar la zona, que es como se guardaba un instante
          equivocado con aspecto de correcto. */}
      <TimezoneOffsetField />
      <input type="hidden" name="lotId" value={lotId} />

      {/* Lo primero, y obligatorio: un tueste de muestra y uno de producción se
          registran igual y después son indistinguibles si no se dice. */}
      <div className="nn-field">
        <label htmlFor="r-purpose">{t("roastPurposeLabel")}</label>
        <select id="r-purpose" name="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} required>
          <option value="sample">{t("roastPurpose_sample")}</option>
          <option value="production">{t("roastPurpose_production")}</option>
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="r-roasterPersonId">{t("roastPersonLabel")}</label>
        <select id="r-roasterPersonId" name="roasterPersonId" defaultValue="">
          <option value="">{t("roastPersonUnknown")}</option>
          <OpcionesDePersona personas={personas} selfPersonId={selfPersonId} />
        </select>
        <small className="nn-muted">{t("roastPersonHelp")}</small>
      </div>

      {purpose === "sample" && muestras.length > 0 ? (
        <div className="nn-field">
          <label htmlFor="r-sourceSampleId">{t("roastSourceSampleLabel")}</label>
          <select id="r-sourceSampleId" name="sourceSampleId" defaultValue="">
            <option value="">{t("roastSourceSampleNoneOption")}</option>
            {muestras.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}{m.disponibleKg == null ? "" : ` · ${m.disponibleKg.toFixed(3)} kg`}
              </option>
            ))}
          </select>
          <small className="nn-muted">{t("roastSourceSampleHelp")}</small>
        </div>
      ) : null}

      {/* Sólo si hay perfiles aprobados para este lote. Sin ellos no se pinta un
          desplegable vacío: los primeros tuestes de muestra se hacen SIN perfil,
          que es como se encuentra uno, y ofrecer una lista vacía sugeriría que
          falta algo. */}
      {perfiles.length > 0 ? (
        <div className="nn-field">
          <label htmlFor="r-recipeVersionId">{t("roastProfileLabel")}</label>
          <select id="r-recipeVersionId" name="recipeVersionId" defaultValue="">
            <option value="">{t("roastProfileNoneOption")}</option>
            {perfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {purpose === "sample" ? <p className="nn-muted">{t("sampleRoastAutomaticCodeHelp")}</p> : <div className="nn-field">
        <label htmlFor="r-outputLotCode">{t("roastOutputLotCodeLabel")}</label>
        <input id="r-outputLotCode" name="outputLotCode" type="text" required />
      </div>}
      <div className="nn-field">
        <label htmlFor="r-startedAt">{t("roastStartedAtLabel")}</label>
        <input id="r-startedAt" name="startedAt" type="datetime-local" required />
      </div>
      <div className="nn-field">
        <label htmlFor="r-endedAt">{t("roastEndedAtLabel")}</label>
        <input id="r-endedAt" name="endedAt" type="datetime-local" />
      </div>
      <div className="nn-field">
        <label htmlFor="r-roastLevel">{t("roastLevelLabel")}</label>
        <input id="r-roastLevel" name="roastLevel" type="text" placeholder="light, medium, dark" />
      </div>
      <div className="nn-field">
        <label htmlFor="r-chargeWeightKg">{t("roastChargeWeightLabel")}</label>
        <CampoNumerico id="r-chargeWeightKg" name="chargeWeightKg" inputMode="decimal" step="0.001" />
      </div>
      <div className="nn-field">
        <label htmlFor="r-dischargeWeightKg">{t("roastDischargeWeightLabel")}</label>
        <CampoNumerico id="r-dischargeWeightKg" name="dischargeWeightKg" inputMode="decimal" step="0.001" />
      </div>
      <div className="nn-field">
        <label htmlFor="r-firstCrackAt">{t("roastFirstCrackLabel")}</label>
        <input id="r-firstCrackAt" name="firstCrackAt" type="datetime-local" />
      </div>
      <div className="nn-field">
        <label htmlFor="r-secondCrackAt">{t("roastSecondCrackLabel")}</label>
        <input id="r-secondCrackAt" name="secondCrackAt" type="datetime-local" />
      </div>
      <div className="nn-field">
        <label htmlFor="r-equipmentId">{t("roastEquipmentLabel")}</label>
        <select id="r-equipmentId" name="equipmentId" defaultValue="">
          <option value="">{t("roastEquipmentNoneOption")}</option>
          {equipos.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </div>
      <details>
        <summary>{t("roastEquipmentOtherSummary")}</summary>
        <div className="nn-field">
          <label htmlFor="r-equipmentNote">{t("roastEquipmentNoteLabel")}</label>
          <input id="r-equipmentNote" name="equipmentNote" type="text" />
        </div>
      </details>
      <div className="nn-field">
        <label htmlFor="r-provenanceClass">{t("provenanceClassLabel")}</label>
        <select id="r-provenanceClass" name="provenanceClass" defaultValue="original_record" required>
          {PROCEDENCIA_DE_REGISTRO_DE_CAMPO.map((v) => (
            <option key={v} value={v}>
              {t(`provenanceClass_${v}` as "provenanceClass_original_record")}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="r-notes">{t("notesLabel")}</label>
        <input id="r-notes" name="notes" type="text" />
      </div>

      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("recordRoastButton")}
      </button>
    </form>
  );
}
