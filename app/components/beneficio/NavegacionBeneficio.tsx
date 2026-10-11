import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { permissionKeysAnywhere } from "../../../lib/rbac/service";
import { puedeCrearRecetaEnAlguna } from "../../../lib/traceability/processTargets";
import { destinosDelBeneficio } from "../../beneficio/destinos";

export async function NavegacionBeneficio({
  userAccountId,
  actual,
}: {
  userAccountId: string;
  actual: string;
}) {
  const [granted, puedeVerRecetas, t] = await Promise.all([
    permissionKeysAnywhere(userAccountId),
    // La misma regla que `listRecipes` (PENDING_IMPLEMENTATIONS/027), como el índice.
    puedeCrearRecetaEnAlguna(userAccountId),
    getTranslations("SeccionBeneficio"),
  ]);
  const destinos = destinosDelBeneficio(granted, puedeVerRecetas);
  return (
    <nav className="nn-mill-nav" aria-label={t("navegacion")}>
      {destinos.map((destino) => (
        <Link
          key={destino.href}
          href={destino.href}
          aria-current={actual === destino.href ? "page" : undefined}
        >
          {t(destino.clave)}
        </Link>
      ))}
    </nav>
  );
}
