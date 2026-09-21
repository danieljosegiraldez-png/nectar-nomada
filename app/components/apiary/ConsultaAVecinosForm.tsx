"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { registrarConsultaAVecinosFormAction } from "../../actions/apiary";
import { RESULTADOS_DE_CONSULTA } from "../../../lib/apiary/vocabularioDeConsulta";
import { Ayuda } from "./Ayuda";
import { BotonDeEnvio } from "../BotonDeEnvio";
import { OpcionesDePersona, type OpcionDePersona } from "../OpcionesDePersona";

export interface Opcion {
  id: string;
  name: string;
}

/**
 * La consulta mensual a una finca vecina — `48_A9_ANEXO_E_PANTALLAS_Y_FORMULARIOS.md` §4:
 * *«Finca, cultivo, aplicación prevista y fecha, quién informó. Es protocolo mensual, no
 * una nota, y el sistema lo reclama solo.»*
 *
 * **La fecha de aplicación aparece y desaparece según el resultado, y no es cosmética.** La
 * base tiene un `CHECK` que rechaza una fecha junto a «no hay aplicación prevista» y otra
 * que la exige cuando sí la hay. Si el campo estuviera siempre visible, la forma más normal
 * de usar el formulario —rellenar la fecha y después cambiar de idea en el resultado—
 * terminaría en un error de Postgres que ninguna pantalla sabe traducir.
 *
 * **Vocabulario del vacío (ADR-125).** Resultado y finca son obligatorios, así que su
 * primera opción va **sin texto y `disabled`**: un placeholder no es una respuesta. Ninguna
 * opción dice «Sin registrar».
 */
export function ConsultaAVecinosForm({
  locationId,
  vecinos,
  personas,
  selfPersonId,
  hoy,
}: {
  locationId: string;
  vecinos: Opcion[];
  personas: readonly OpcionDePersona[];
  selfPersonId: string | null;
  /** `YYYY-MM-DD` calculado en el servidor: el cliente no decide qué día es hoy. */
  hoy: string;
}) {
  const t = useTranslations("Apiary");
  const [outcome, setOutcome] = useState("");
  const hayAplicacion = outcome === "aplicacion_prevista";
  const seConsulto = outcome !== "" && outcome !== "no_se_pudo_consultar";

  return (
    <form action={registrarConsultaAVecinosFormAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />

      <div className="nn-field">
        <label htmlFor="cv-vecino">{t("consultaVecinoLabel")}</label>
        <select id="cv-vecino" name="neighbourOrganizationId" defaultValue="" required>
          <option value="" disabled />
          {vecinos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <Ayuda resumen={t("ayudaResumen")}>{t("consultaVecinoHelp")}</Ayuda>
      </div>

      <div className="nn-field">
        <label htmlFor="cv-fecha">{t("consultaFechaLabel")}</label>
        <input id="cv-fecha" name="occurredAt" type="date" defaultValue={hoy} required />
      </div>

      <div className="nn-field">
        <label htmlFor="cv-resultado">{t("consultaResultadoLabel")}</label>
        <select
          id="cv-resultado"
          name="outcome"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          required
        >
          <option value="" disabled />
          {RESULTADOS_DE_CONSULTA.map((r) => (
            <option key={r} value={r}>
              {t(`consultaResultado_${r}`)}
            </option>
          ))}
        </select>
        <Ayuda resumen={t("ayudaResumen")}>{t("consultaResultadoHelp")}</Ayuda>
      </div>

      {hayAplicacion ? (
        <div className="nn-field">
          <label htmlFor="cv-aplicacion">{t("consultaAplicacionLabel")}</label>
          <input id="cv-aplicacion" name="plannedApplicationAt" type="date" required />
          <Ayuda resumen={t("ayudaResumen")}>{t("consultaAplicacionHelp")}</Ayuda>
        </div>
      ) : null}

      <div className="nn-field">
        <label htmlFor="cv-cultivo">{t("consultaCultivoLabel")}</label>
        <input id="cv-cultivo" name="crop" type="text" maxLength={200} />
      </div>

      {seConsulto ? (
        <div className="nn-field">
          <label htmlFor="cv-informante">{t("consultaInformanteLabel")}</label>
          <input id="cv-informante" name="informantName" type="text" maxLength={200} required />
          <Ayuda resumen={t("ayudaResumen")}>{t("consultaInformanteHelp")}</Ayuda>
        </div>
      ) : null}

      {personas.length > 0 ? (
        <div className="nn-field">
          <label htmlFor="cv-operador">{t("consultaOperadorLabel")}</label>
          <select id="cv-operador" name="operatorPersonId" defaultValue={selfPersonId ?? ""}>
            <option value="" />
            <OpcionesDePersona personas={personas} selfPersonId={selfPersonId} />
          </select>
        </div>
      ) : null}

      <div className="nn-field">
        <label htmlFor="cv-nota">{t("consultaNotaLabel")}</label>
        <textarea id="cv-nota" name="note" rows={2} maxLength={1000} />
      </div>

      <BotonDeEnvio disabled={outcome === ""}>{t("consultaGuardar")}</BotonDeEnvio>
    </form>
  );
}
