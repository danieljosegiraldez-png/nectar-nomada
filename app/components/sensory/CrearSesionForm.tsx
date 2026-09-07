"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { crearSesionDeCataAction, type SensoryActionState } from "../../actions/sensory";

const initialState: SensoryActionState = {};

interface Opcion {
  id: string;
  label: string;
}

/**
 * Montar una cata: nombre, protocolo y qué muestras entran.
 *
 * **Las muestras se eligen con casillas, no con un `<select multiple>`.** En un
 * móvil, en una mesa de cata, ahí es donde se pierden las selecciones — y el
 * orden en que se marcan decide qué código ciego (A, B, C) le toca a cada una,
 * así que perder una no es perder una fila: es correr todas las demás.
 */
export function CrearSesionForm({ protocolos, muestras }: { protocolos: Opcion[]; muestras: Opcion[] }) {
  const [state, formAction, pending] = useActionState(crearSesionDeCataAction, initialState);
  const t = useTranslations("Sensory");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 560 }}>
      <div className="nn-field">
        <label htmlFor="cs-name">{t("sessionNameLabel")}</label>
        <input id="cs-name" name="name" type="text" required maxLength={200} />
      </div>

      <div className="nn-field">
        <label htmlFor="cs-protocol">{t("sessionProtocolLabel")}</label>
        <select id="cs-protocol" name="protocolVersionId" required defaultValue="">
          <option value="" disabled>
            {t("sessionProtocolPlaceholder")}
          </option>
          {protocolos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Ya estaban modelados y el primer formulario no los pedía: sin propósito,
          una cata de control de calidad y una de competencia se guardan iguales
          y después no se pueden separar para reportar. */}
      <div className="nn-field">
        <label htmlFor="cs-purpose">{t("sessionPurposeLabel")}</label>
        <select id="cs-purpose" name="purpose" defaultValue="">
          <option value="">{t("sessionPurposeNone")}</option>
          {(["characterize", "select", "verify_conformance", "hedonic", "rank"] as const).map((v) => (
            <option key={v} value={v}>
              {t(`purpose_${v}` as "purpose_characterize")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="cs-subject">{t("sessionSubjectLabel")}</label>
        <select id="cs-subject" name="subject" defaultValue="">
          <option value="">{t("sessionSubjectNone")}</option>
          {(["raw_material_in_process", "intermediate_product", "prepared_beverage"] as const).map((v) => (
            <option key={v} value={v}>
              {t(`subject_${v}` as "subject_prepared_beverage")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="cs-preparation">{t("sessionPreparationLabel")}</label>
        <input id="cs-preparation" name="preparationMethod" type="text" />
      </div>

      <fieldset className="nn-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>{t("sessionSamplesLabel")}</legend>
        <p className="nn-muted">{t("sessionSamplesHelp")}</p>
        {muestras.map((m) => (
          <label key={m.id} style={{ display: "block" }}>
            <input type="checkbox" name="muestras" value={m.id} /> {m.label}
          </label>
        ))}
      </fieldset>

      {state.error ? (
        <p className="nn-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("createSessionButton")}
      </button>
    </form>
  );
}
