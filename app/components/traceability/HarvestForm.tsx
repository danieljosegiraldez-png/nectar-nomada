"use client";

import { CampoNumerico } from "../CampoNumerico";
import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { recordHarvestAction, type TraceabilityActionState } from "../../actions/traceability";
import { TimezoneOffsetField } from "../TimezoneOffsetField";
import { paraCampoLocal } from "../../../lib/time/localDateTime";

const initialState: TraceabilityActionState = {};

interface Option {
  id: string;
  name: string;
}
interface LocationOption extends Option {
  organization: Option | null;
}
interface CatalogOption {
  id: string;
  value: string;
}

/**
 * **La cereza deja de ser prosa** (Daniel, 2026-09-11: «condition field should
 * be fixed options that can be selected»).
 *
 * La condición era una caja de texto. Medido antes de tocarla: **29 de 33**
 * cosechas la tenían rellena y las 29 decían exactamente «Ripe Cherry» — que es
 * la prueba de por qué no sirve para un hecho que se quiere contar. Entran tres
 * desplegables de catálogo cerrado, los tres que Daniel eligió entre los siete
 * que ya existían sin que nadie los leyera: **color** (la escala de madurez),
 * **defectos** y **limpieza**.
 *
 * Los tres son **opcionales**: no registrar no es lo mismo que «sano y limpio».
 *
 * Y la fecha llega con la hora actual, como en medición. Se escribe en el DOM al
 * montar: en el servidor el reloj de pared es el del servidor —UTC en
 * producción— que es el valor equivocado.
 */
export function HarvestForm({
  organizations,
  locations,
  projects,
  cerezas,
}: {
  organizations: Option[];
  locations: LocationOption[];
  projects: Option[];
  cerezas: { color: CatalogOption[]; defectos: CatalogOption[]; limpieza: CatalogOption[] };
}) {
  const [state, formAction, pending] = useActionState(recordHarvestAction, initialState);
  const t = useTranslations("Traceability");

  const cuandoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (cuandoRef.current && !cuandoRef.current.value) {
      cuandoRef.current.value = paraCampoLocal(new Date());
    }
  }, []);

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <TimezoneOffsetField />
      <div className="nn-field">
        <label htmlFor="h-lotCode">{t("lotCodeLabel")}</label>
        <input id="h-lotCode" name="lotCode" type="text" required />
      </div>
      <div className="nn-field">
        <label htmlFor="h-organizationId">{t("organizationLabel")}</label>
        <select id="h-organizationId" name="organizationId" required>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="h-locationId">{t("plotLabel")}</label>
        <select id="h-locationId" name="locationId" required>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.organization ? `${loc.name} (${loc.organization.name})` : loc.name}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="h-projectId">{t("projectLabel")}</label>
        <select id="h-projectId" name="projectId" defaultValue="">
          <option value="">{t("noneOption")}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="h-harvestedAt">{t("harvestedAtLabel")}</label>
        <input ref={cuandoRef} id="h-harvestedAt" name="harvestedAt" type="datetime-local" defaultValue="" required />
      </div>
      <div className="nn-field">
        <label htmlFor="h-cherryWeightKg">{t("cherryWeightLabel")}</label>
        <CampoNumerico id="h-cherryWeightKg" name="cherryWeightKg" inputMode="decimal" step="0.001" />
      </div>
      <div className="nn-field">
        <label htmlFor="h-brix">{t("brixLabel")}</label>
        <CampoNumerico id="h-brix" name="brix" inputMode="decimal" step="0.01" />
      </div>
      <div className="nn-field">
        <label htmlFor="h-cherryColor">{t("cherryColorLabel")}</label>
        <select id="h-cherryColor" name="cherryColorValueId" defaultValue="">
          <option value="">{t("noneOption")}</option>
          {cerezas.color.map((c) => (
            <option key={c.id} value={c.id}>{t(`cereza_color_${c.value}` as "cereza_color_rojo")}</option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="h-cherryDefects">{t("cherryDefectsLabel")}</label>
        <select id="h-cherryDefects" name="cherryDefectsValueId" defaultValue="">
          <option value="">{t("noneOption")}</option>
          {cerezas.defectos.map((c) => (
            <option key={c.id} value={c.id}>{t(`cereza_defectos_${c.value}` as "cereza_defectos_sano")}</option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="h-cherryCleanliness">{t("cherryCleanlinessLabel")}</label>
        <select id="h-cherryCleanliness" name="cherryCleanlinessValueId" defaultValue="">
          <option value="">{t("noneOption")}</option>
          {cerezas.limpieza.map((c) => (
            <option key={c.id} value={c.id}>{t(`cereza_limpieza_${c.value}` as "cereza_limpieza_limpio")}</option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="h-notes">{t("notesLabel")}</label>
        <textarea id="h-notes" name="notes" rows={2} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("recordHarvestButton")}
      </button>
    </form>
  );
}
