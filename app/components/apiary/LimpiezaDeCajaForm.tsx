"use client";

/**
 * Registrar la limpieza de una CAJA (ADR-159).
 *
 * **Casillas y no un desplegable para los actos**, porque una limpieza hace varios: el método
 * térmico es raspar y después flamear. Un desplegable de uno obligaría a dos registros para una
 * sola limpieza.
 *
 * Importa el vocabulario de `vocabularioDeLimpieza` —puro— y NO de `limpiezaDeCaja`, que trae
 * `prisma` y lo arrastraría al navegador (`cliente-sin-prisma`).
 */
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { registrarLimpiezaDeCajaAction } from "../../actions/apiary";
import { ACTOS_DE_LIMPIEZA, RAZONES_DE_LIMPIEZA } from "../../../lib/apiary/vocabularioDeLimpieza";

const inicial: { error?: string; ok?: boolean } = {};

export function LimpiezaDeCajaForm({ hiveId, apiaryId }: { hiveId: string; apiaryId: string }) {
  const [estado, accion, pending] = useActionState(registrarLimpiezaDeCajaAction, inicial);
  const t = useTranslations("Apiary");

  return (
    <form action={accion} className="nn-form" style={{ maxWidth: 460 }}>
      <input type="hidden" name="hiveId" value={hiveId} />
      <input type="hidden" name="apiaryId" value={apiaryId} />

      <div className="nn-field">
        <label htmlFor="limpieza-dia">{t("limpiezaDia")}</label>
        {/* Obligatorio y sin valor por defecto: un «hoy» afirmaría una fecha que nadie dio. */}
        <input id="limpieza-dia" name="occurredAt" type="date" required />
      </div>

      <fieldset className="nn-field">
        <legend>{t("limpiezaActos")}</legend>
        <p className="nn-muted">{t("limpiezaActosAyuda")}</p>
        {ACTOS_DE_LIMPIEZA.map((a) => (
          <label key={a} style={{ display: "block", padding: "0.35rem 0" }}>
            <input type="checkbox" name="acts" value={a} /> {t(`limpiezaActo_${a}`)}
          </label>
        ))}
      </fieldset>

      <div className="nn-field">
        <label htmlFor="limpieza-otro">{t("limpiezaOtroCual")}</label>
        <input id="limpieza-otro" name="actOtherNote" type="text" />
      </div>

      <div className="nn-field">
        <label htmlFor="limpieza-razon">{t("limpiezaRazon")}</label>
        <select id="limpieza-razon" name="reason" defaultValue="">
          {/* Vacío = «sin registrar» (ADR-080), que no es lo mismo que ninguna de las razones. */}
          <option value="">{t("limpiezaRazonSinRegistrar")}</option>
          {RAZONES_DE_LIMPIEZA.map((r) => (
            <option key={r} value={r}>
              {t(`limpiezaRazon_${r}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="limpieza-razon-otro">{t("limpiezaRazonOtroCual")}</label>
        <input id="limpieza-razon-otro" name="reasonOtherNote" type="text" />
      </div>

      <div className="nn-field">
        <label htmlFor="limpieza-notas">{t("limpiezaNotas")}</label>
        <textarea id="limpieza-notas" name="notes" rows={2} />
      </div>

      {estado.error ? (
        <p className="nn-error" role="alert">
          {estado.error}
        </p>
      ) : null}
      {estado.ok ? <p className="nn-muted">{t("limpiezaGuardada")}</p> : null}
      <button type="submit" disabled={pending}>
        {t("limpiezaGuardar")}
      </button>
    </form>
  );
}
