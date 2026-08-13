"use client";

import { useTranslations } from "next-intl";

const ROWS = [0, 1, 2, 3, 4, 5];

interface CatalogOption {
  id: string;
  key: string;
  name: string;
}

/**
 * Shared repeatable-row fields for a ProtocolVersion's controlled
 * variables and required measurements — used by both "create protocol +
 * first version" and "create a new version of an existing protocol".
 * Fixed six rows (RO1's real PE examples name five isolated factors: water
 * source, yeast, orientation, bag position, volume), matching this
 * codebase's plain-HTML-form convention rather than a client-side dynamic
 * array builder. Empty rows are skipped server-side.
 *
 * §3a — "Respetá esta distinción: no conviertas un catálogo en enum ni al
 * revés." A variable's type picks one of four value shapes: text/numeric/
 * boolean (free), catalog (Recipiente, Levadura/cultivo, Método de
 * inoculación, Grado de proceso — pick which VariableCatalog), or
 * closed_enum (Fuente de agua, Posición de masa — type the fixed values,
 * comma-separated, frozen once this version is created).
 */
export function ProtocolVersionFields({ catalogs }: { catalogs: CatalogOption[] }) {
  const t = useTranslations("Research");

  return (
    <>
      <div className="nn-field">
        <label htmlFor="notes">{t("notesLabel")}</label>
        <textarea id="notes" name="notes" rows={2} />
      </div>

      <h3>{t("variablesHeading")}</h3>
      {ROWS.map((i) => (
        <div key={`var-${i}`} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
          <input name={`var_name_${i}`} type="text" placeholder={t("variableNameLabel")} style={{ flex: 2 }} />
          <select name={`var_type_${i}`} defaultValue="text" style={{ flex: 1 }}>
            <option value="text">text</option>
            <option value="numeric">numeric</option>
            <option value="boolean">boolean</option>
            <option value="catalog">catalog</option>
            <option value="closed_enum">closed_enum</option>
          </select>
          <select name={`var_catalog_${i}`} defaultValue="" style={{ flex: 1 }}>
            <option value="">— {t("variableTypeLabel")}: catalog —</option>
            {catalogs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input name={`var_enum_values_${i}`} type="text" placeholder="closed_enum: valor1,valor2" style={{ flex: 1 }} />
          <input name={`var_unit_${i}`} type="text" placeholder={t("variableUnitLabel")} style={{ flex: 1 }} />
          <label style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <input name={`var_controlled_${i}`} type="checkbox" defaultChecked />
            {t("variableControlledLabel")}
          </label>
        </div>
      ))}

      <h3>{t("requiredMeasurementsHeading")}</h3>
      {ROWS.map((i) => (
        <div key={`rm-${i}`} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
          <select name={`rm_variable_${i}`} defaultValue="" style={{ flex: 1 }}>
            <option value="">{t("requiredMeasurementVariableLabel")} (numeric)</option>
            <option value="brix">brix</option>
            <option value="ph">ph</option>
            <option value="moisture">moisture</option>
            <option value="temperature">temperature</option>
            <option value="relative_humidity">relative_humidity</option>
            <option value="water_activity">water_activity</option>
          </select>
          <select name={`rm_catalog_${i}`} defaultValue="" style={{ flex: 1 }}>
            <option value="">— or categorical (catalog) —</option>
            {catalogs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input name={`rm_stage_${i}`} type="text" placeholder={t("requiredMeasurementStageLabel")} style={{ flex: 2 }} />
        </div>
      ))}
    </>
  );
}
