"use client";

/**
 * La lectura del refractómetro de miel de UNA cosecha (ADR-160).
 *
 * **Dos casillas y no una**, porque un refractómetro de miel tiene dos escalas —Brix y H%—
 * y el apicultor puede leer una, la otra o las dos. Lo que no se leyó se deja vacío: la
 * humedad **no se calcula** desde el Brix y se guarda como si alguien la hubiera leído.
 *
 * Sólo se ofrecen los aparatos que tienen algún modo sobre MIEL DE ABEJA: el refractómetro
 * del beneficio, que lee mosto de café, no es el de mieles (Daniel, 2026-09-17).
 */
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { registrarLecturaDeRefractometroAction } from "../../actions/apiary";

const inicial: { error?: string; ok?: boolean } = {};

export interface RefractometroDeMiel {
  id: string;
  name: string;
  /** Las escalas que ese aparato declara leer sobre miel, con su rango, para enseñarlas. */
  escalas: string[];
}

export function LecturaDeRefractometroForm({
  apiaryHarvestEventId,
  hiveId,
  apiaryId,
  instrumentos,
  claveDeEnvio,
}: {
  apiaryHarvestEventId: string;
  hiveId: string;
  apiaryId: string;
  instrumentos: RefractometroDeMiel[];
  claveDeEnvio: string;
}) {
  const [estado, accion, pending] = useActionState(registrarLecturaDeRefractometroAction, inicial);
  const t = useTranslations("Apiary");
  const id = (s: string) => `${s}-${apiaryHarvestEventId}`;

  return (
    <form action={accion} className="nn-form" style={{ margin: "0.5rem 0 0" }}>
      <input type="hidden" name="apiaryHarvestEventId" value={apiaryHarvestEventId} />
      <input type="hidden" name="hiveId" value={hiveId} />
      <input type="hidden" name="apiaryId" value={apiaryId} />
      <input type="hidden" name="claveDeEnvio" value={claveDeEnvio} />

      <div className="nn-field">
        <label htmlFor={id("refr-dia")}>{t("refractometroDia")}</label>
        <input id={id("refr-dia")} name="occurredAt" type="date" required />
      </div>
      <div className="nn-field">
        <label htmlFor={id("refr-brix")}>{t("refractometroBrix")}</label>
        <input id={id("refr-brix")} name="brix" type="number" step="0.1" min={0} max={100} inputMode="decimal" />
      </div>
      <div className="nn-field">
        <label htmlFor={id("refr-agua")}>{t("refractometroAgua")}</label>
        <input id={id("refr-agua")} name="aguaPct" type="number" step="0.1" min={0} max={100} inputMode="decimal" />
      </div>
      <p className="nn-muted">{t("refractometroAyuda")}</p>
      <div className="nn-field">
        <label htmlFor={id("refr-aparato")}>{t("refractometroAparato")}</label>
        <select id={id("refr-aparato")} name="instrumentId" defaultValue="">
          {/* Vacío = no se dijo con qué aparato (ADR-080). La lectura se guarda igual. */}
          <option value="">{t("refractometroAparatoSinDecir")}</option>
          {instrumentos.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.escalas.join(" · ")})
            </option>
          ))}
        </select>
        {instrumentos.length === 0 ? <p className="nn-muted">{t("refractometroSinAparatos")}</p> : null}
      </div>

      {estado.error ? (
        <p className="nn-error" role="alert">
          {estado.error}
        </p>
      ) : null}
      {estado.ok ? <p className="nn-muted">{t("refractometroGuardada")}</p> : null}
      <button type="submit" disabled={pending}>
        {t("refractometroGuardar")}
      </button>
    </form>
  );
}
