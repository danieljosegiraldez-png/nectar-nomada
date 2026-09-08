"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { registrarInformeExternoAction, type SensoryActionState } from "../../actions/sensory";

const initialState: SensoryActionState = {};

interface Opcion {
  id: string;
  label: string;
}

interface Atributo {
  id: string;
  name: string;
  min: number;
  max: number;
  section: string | null;
}

/**
 * Paso 2: transcribir el informe.
 *
 * **El nombre del atributo viaja en un campo oculto y el id sólo da la clave.**
 * El servicio casa por nombre a propósito —«Flavor», no un UUID—, así que el
 * nombre tiene que llegar; pero un nombre con espacios no sirve de `name=` sin
 * escaparlo, y el id sí. Los dos, cada uno en lo suyo.
 *
 * **El total sólo se pregunta si el protocolo NO lo calcula.** Bajo el CVA el
 * total es una consecuencia de los ocho atributos: pedirlo invitaría a teclear
 * uno distinto, que es justo lo que la fórmula vino a arreglar.
 *
 * **Las tazas no se preseleccionan en 0.** Un 0 afirma «se contaron y no había
 * ninguna»; vacío dice que el informe no lo declara, que es distinto y es lo
 * que suele pasar.
 */
export function InformeExternoForm({
  protocolVersionId,
  atributos,
  calculaTotal,
  usaTazas,
  muestras,
  evaluadores,
}: {
  protocolVersionId: string;
  atributos: Atributo[];
  calculaTotal: boolean;
  usaTazas: boolean;
  muestras: Opcion[];
  evaluadores: Opcion[];
}) {
  const [state, formAction, pending] = useActionState(registrarInformeExternoAction, initialState);
  const t = useTranslations("Sensory");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 560 }}>
      <input type="hidden" name="protocolVersionId" value={protocolVersionId} />

      <div className="nn-field">
        <label htmlFor="ie-sample">{t("externalReportSampleLabel")}</label>
        <select id="ie-sample" name="sampleId" required defaultValue="">
          <option value="" disabled>
            {t("externalReportChoose")}
          </option>
          {muestras.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="ie-person">{t("externalReportEvaluatorLabel")}</label>
        <select id="ie-person" name="evaluadorPersonId" required defaultValue="">
          <option value="" disabled>
            {t("externalReportChoose")}
          </option>
          {evaluadores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="nn-muted">{t("externalReportEvaluatorHelp")}</p>
      </div>

      {/* Obligatorio, y el servicio lo exige igual: un puntaje sin dónde vive su
          original no se puede volver a comprobar, y entonces es una opinión
          transcrita en vez de un informe. */}
      <div className="nn-field">
        <label htmlFor="ie-source">{t("externalReportSourceLabel")}</label>
        <input id="ie-source" name="sourceReference" type="text" required maxLength={500} />
        <p className="nn-muted">{t("externalReportSourceHelp")}</p>
      </div>

      {/* Día, no instante: el informe dice «12 de marzo», no una hora. Por eso
          es `type="date"` y no lleva el desfase del dispositivo. */}
      <div className="nn-field">
        <label htmlFor="ie-date">{t("externalReportDateLabel")}</label>
        <input id="ie-date" name="evaluadoEl" type="date" />
      </div>

      <fieldset className="nn-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>{t("externalReportScoresLabel")}</legend>
        <p className="nn-muted">{t("externalReportScoresHelp")}</p>
        {atributos.map((a) => (
          <div key={a.id} className="nn-field">
            <input type="hidden" name="attributeId" value={a.id} />
            <input type="hidden" name={`nombre_${a.id}`} value={a.name} />
            <label htmlFor={`ie-attr-${a.id}`}>
              {a.name}
              {a.section ? ` · ${a.section}` : ""} ({a.min}–{a.max})
            </label>
            <input
              id={`ie-attr-${a.id}`}
              name={`attr_${a.id}`}
              type="number"
              inputMode="decimal"
              step="0.25"
              min={a.min}
              max={a.max}
            />
          </div>
        ))}
      </fieldset>

      {usaTazas ? (
        <>
          <div className="nn-field">
            <label htmlFor="ie-nonuniform">{t("nonUniformCupsLabel")}</label>
            <input id="ie-nonuniform" name="tazasNoUniformes" type="number" min="0" max="5" step="1" />
          </div>
          <div className="nn-field">
            <label htmlFor="ie-defective">{t("defectiveCupsLabel")}</label>
            <input id="ie-defective" name="tazasDefectuosas" type="number" min="0" max="5" step="1" />
            <p className="nn-muted">{t("externalReportCupsHelp")}</p>
          </div>
        </>
      ) : null}

      {calculaTotal ? (
        <p className="nn-muted">{t("externalReportTotalComputed")}</p>
      ) : (
        <div className="nn-field">
          <label htmlFor="ie-overall">{t("externalReportOverallLabel")}</label>
          <input id="ie-overall" name="overallScore" type="number" inputMode="decimal" step="0.25" />
        </div>
      )}

      <div className="nn-field">
        <label htmlFor="ie-comment">{t("externalReportCommentLabel")}</label>
        <textarea id="ie-comment" name="comentario" rows={3} />
      </div>

      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("externalReportSubmit")}
      </button>
    </form>
  );
}
