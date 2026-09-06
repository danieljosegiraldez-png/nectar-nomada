"use client";

import { useTranslations } from "next-intl";
import { createHiveFormAction } from "../../actions/apiary";
import { BotonDeEnvio } from "../BotonDeEnvio";

interface ProjectOption {
  id: string;
  name: string;
}

/**
 * Online-only, standard <form action> — A0's own scope is Inspection/
 * ColonyEvent specifically (§7), not Hive creation, which happens rarely
 * (once per physical box, not "dozens of times a season").
 */
export function NewHiveForm({ locationId, projects }: { locationId: string; projects: ProjectOption[] }) {
  const t = useTranslations("Apiary");

  return (
    <form action={createHiveFormAction} className="nn-form" style={{ maxWidth: 420 }}>
      <input type="hidden" name="locationId" value={locationId} />
      <div className="nn-field">
        <label htmlFor="hive-identifier">{t("hiveIdentifierLabel")}</label>
        <input id="hive-identifier" name="identifier" type="text" placeholder="H-014" required />
      </div>
      {projects.length > 0 ? (
        <div className="nn-field">
          <label htmlFor="hive-project">{t("projectLabel")}</label>
          <select id="hive-project" name="projectId" defaultValue="">
            <option value="">{t("noProjectOption")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="nn-field">
        <label htmlFor="hive-installed">{t("installedAtLabel")}</label>
        <input id="hive-installed" name="installedAt" type="date" />
      </div>
      <BotonDeEnvio className="nn-button">
        {t("createHiveButton")}
      </BotonDeEnvio>
    </form>
  );
}
