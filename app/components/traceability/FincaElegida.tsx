import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Finca } from "../../../lib/traceability/fincas";

/**
 * «Finca: Rosina · cambiar», arriba de Finca, Parcelas y Cosecha (spec fincas y parcelas §3.1).
 * Con una sola finca no hay nada que cambiar, así que sólo se nombra.
 */
export async function FincaElegida({ elegida, hayVarias, volver }: { elegida: Finca | null; hayVarias: boolean; volver: string }) {
  const t = await getTranslations("Fincas");
  const cambiar = `/fincas?volver=${encodeURIComponent(volver)}`;
  return (
    <p className="nn-detail-meta">
      {elegida ? t("elegida", { nombre: elegida.nombre }) : t("todasElegidas")}
      {hayVarias ? (
        <>
          {" · "}
          <Link href={cambiar}>{t("cambiar")}</Link>
        </>
      ) : null}
    </p>
  );
}
