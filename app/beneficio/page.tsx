import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { permissionKeysAnywhere } from "../../lib/rbac/service";
import { destinosDelBeneficio } from "./destinos";

export const dynamic = "force-dynamic";

/**
 * La sección Beneficio: una página índice, sin formularios.
 *
 * **Por qué existe ya, antes que el tablero.** El 2026-09-17 Daniel decidió que el
 * menú dijera «Beneficio» y no «Lotes», y que los lotes, las recetas, las
 * instalaciones y los equipos colgaran de ahí. El tablero del beneficio (spec #363)
 * es quien acabará ocupando esta ruta; hasta entonces, esta página es el índice de
 * la sección. Las rutas de dentro NO se mueven: mudarlas antes de que exista el
 * tablero obligaría a mudarlas dos veces.
 *
 * **Sin formularios, a propósito.** Esta ruta es la de operar, y la configuración
 * vive aparte en `/beneficio/ajustes` (spec #370). Un índice de enlaces cumple esa
 * separación sin necesidad de guardia todavía; el guardia llega con el tablero.
 *
 * **Cada enlace sólo aparece si quien mira puede usarlo**, con la misma pregunta
 * ancha que ya hace la navegación (`permissionKeysAnywhere`): ofrecer lo que el
 * servidor va a rechazar es el fallo que S2 §4 nombra. La autorización de verdad
 * sigue en cada destino.
 */
export default async function BeneficioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const granted = await permissionKeysAnywhere(user.userAccountId);
  // La misma regla que la entrada del menú: quien no ve lotes no tiene sección.
  if (!granted.has("lot:view") && !granted.has("lot:manage")) notFound();

  const t = await getTranslations("SeccionBeneficio");
  // Qué enlace ve cada perfil lo decide `destinosDelBeneficio`, que tiene su prueba.
  const destinos = destinosDelBeneficio(granted);

  return (
    <div>
      <h1>{t("titulo")}</h1>
      <p className="nn-muted">{t("intro")}</p>
      <ul>
        {destinos.map((d) => (
          <li key={d.href}>
            <Link href={d.href}>{t(d.clave)}</Link>
            <br />
            <span className="nn-muted">{t(`${d.clave}Ayuda`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
