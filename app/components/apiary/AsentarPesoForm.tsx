"use client";

/**
 * El botón que asienta el peso de una cosecha vieja en el libro de su lote (ADR-166). Sin
 * campos: el número es el que la cosecha ya tiene escrito, no uno que se teclee aquí.
 */
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { asentarPesoDeCosechaAction } from "../../actions/apiary";

const inicial: { error?: string; ok?: boolean } = {};

export function AsentarPesoForm({ apiaryHarvestEventId, apiaryId, kg }: { apiaryHarvestEventId: string; apiaryId: string; kg: number }) {
  const [estado, accion, pending] = useActionState(asentarPesoDeCosechaAction, inicial);
  const t = useTranslations("Apiary");
  return (
    <form action={accion} style={{ display: "inline" }}>
      <input type="hidden" name="apiaryHarvestEventId" value={apiaryHarvestEventId} />
      <input type="hidden" name="apiaryId" value={apiaryId} />
      <button type="submit" disabled={pending || estado.ok}>
        {t("sinSaldoAsentar", { kg })}
      </button>
      {estado.error ? (
        <span className="nn-error" role="alert">
          {" "}
          {estado.error}
        </span>
      ) : null}
      {estado.ok ? <span className="nn-muted"> {t("sinSaldoAsentado")}</span> : null}
    </form>
  );
}
