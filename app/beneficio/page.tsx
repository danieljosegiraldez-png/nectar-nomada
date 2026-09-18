import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { permissionKeysAnywhere } from "../../lib/rbac/service";

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
  // Lotes, recetas e informe se rigen por el acceso a lotes, ya comprobado arriba.
  const destinos = [
    { href: "/lots", titulo: t("lotes"), ayuda: t("lotesAyuda"), visible: true },
    { href: "/recipes", titulo: t("recetas"), ayuda: t("recetasAyuda"), visible: true },
    { href: "/reports/proceso", titulo: t("informe"), ayuda: t("informeAyuda"), visible: true },
    {
      href: "/instalaciones",
      titulo: t("instalaciones"),
      ayuda: t("instalacionesAyuda"),
      visible: granted.has("location:manage_attributes"),
    },
    { href: "/equipos", titulo: t("equipos"), ayuda: t("equiposAyuda"), visible: granted.has("equipment:view") },
    {
      href: "/beneficio/ajustes",
      titulo: t("ajustes"),
      ayuda: t("ajustesAyuda"),
      // Los mismos dos permisos que exige el servicio de ajustes.
      visible: granted.has("location:manage_attributes") && granted.has("location:create_site"),
    },
  ].filter((d) => d.visible);

  return (
    <div>
      <h1>{t("titulo")}</h1>
      <p className="nn-muted">{t("intro")}</p>
      <ul>
        {destinos.map((d) => (
          <li key={d.href}>
            <Link href={d.href}>{d.titulo}</Link>
            <br />
            <span className="nn-muted">{d.ayuda}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
