"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordRoastSessionAction, type TraceabilityActionState } from "../../actions/traceability";
import { TimezoneOffsetField } from "../TimezoneOffsetField";

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
 * **Sólo dos campos obligatorios:** el código del lote tostado y cuándo empezó.
 * Todo lo demás —niveles, pesos, cracks, equipo— es opcional, porque un tostador
 * que acaba de descargar tiene las manos ocupadas y la alternativa a un formulario
 * corto no es un formulario completo: es ningún registro.
 *
 * **La procedencia se elige, no se fija.** Aquí sí importa la distinción de §3:
 * un perfil leído de la máquina no vale lo mismo que uno recordado esa noche.
 * En secado se fija a `original_record` porque empezar un secado es un acto, no
 * una lectura; un tueste registrado después puede ser cualquiera de las dos.
 */
const PROVENANCES = ["original_record", "direct_observation"] as const;

interface PerfilOption {
  id: string;
  label: string;
}

export function RoastSessionForm({ lotId, perfiles }: { lotId: string; perfiles: PerfilOption[] }) {
  const [state, formAction, pending] = useActionState(recordRoastSessionAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      {/* Sin esto `parseLocalDateTime` lanza `timezone_offset_missing`: se
          niega a adivinar la zona, que es como se guardaba un instante
          equivocado con aspecto de correcto. */}
      <TimezoneOffsetField />
      <input type="hidden" name="lotId" value={lotId} />

      {/* Lo primero, y obligatorio: un tueste de muestra y uno de producción se
          registran igual y después son indistinguibles si no se dice. */}
      <div className="nn-field">
        <label htmlFor="r-purpose">{t("roastPurposeLabel")}</label>
        <select id="r-purpose" name="purpose" defaultValue="sample" required>
          <option value="sample">{t("roastPurpose_sample")}</option>
          <option value="production">{t("roastPurpose_production")}</option>
        </select>
      </div>

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

      <div className="nn-field">
        <label htmlFor="r-outputLotCode">{t("roastOutputLotCodeLabel")}</label>
        <input id="r-outputLotCode" name="outputLotCode" type="text" required />
      </div>
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
        <input id="r-chargeWeightKg" name="chargeWeightKg" type="number" inputMode="decimal" step="0.001" />
      </div>
      <div className="nn-field">
        <label htmlFor="r-dischargeWeightKg">{t("roastDischargeWeightLabel")}</label>
        <input id="r-dischargeWeightKg" name="dischargeWeightKg" type="number" inputMode="decimal" step="0.001" />
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
        <label htmlFor="r-equipmentNote">{t("roastEquipmentLabel")}</label>
        <input id="r-equipmentNote" name="equipmentNote" type="text" />
      </div>
      <div className="nn-field">
        <label htmlFor="r-provenanceClass">{t("provenanceClassLabel")}</label>
        <select id="r-provenanceClass" name="provenanceClass" defaultValue="original_record" required>
          {PROVENANCES.map((v) => (
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
