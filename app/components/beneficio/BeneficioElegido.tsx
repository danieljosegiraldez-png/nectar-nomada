import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * «Beneficio: X · cambiar», arriba de Recepción y Pedidos, igual que `FincaElegida`. Con uno solo
 * no hay nada que cambiar, así que sólo se nombra. Cambiar lleva a `/beneficios`, la pregunta con
 * un botón por beneficio.
 */
export async function BeneficioElegido({
  elegido,
  hayVarios,
  volver,
}: {
  elegido: { id: string; name: string };
  hayVarios: boolean;
  volver: string;
}) {
  const t = await getTranslations("Recepcion");
  return (
    <p className="nn-detail-meta">
      {t("beneficioElegido", { nombre: elegido.name })}
      {hayVarios ? (
        <>
          {" · "}
          <Link href={`/beneficios?volver=${encodeURIComponent(volver)}`}>{t("cambiarBeneficio")}</Link>
        </>
      ) : null}
    </p>
  );
}
