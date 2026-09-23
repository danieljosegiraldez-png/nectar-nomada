import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { permissionKeysAnywhere } from "../../../lib/rbac/service";
import { destinosDelBeneficio } from "../../beneficio/destinos";

export async function NavegacionBeneficio({
  userAccountId,
  actual,
}: {
  userAccountId: string;
  actual: string;
}) {
  const [granted, t] = await Promise.all([
    permissionKeysAnywhere(userAccountId),
    getTranslations("SeccionBeneficio"),
  ]);
  const destinos = destinosDelBeneficio(granted);
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
