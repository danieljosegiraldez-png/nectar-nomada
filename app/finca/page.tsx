import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { permissionKeysAnywhere } from "../../lib/rbac/service";

export const dynamic = "force-dynamic";

/**
 * La sección Finca: una página índice, sin formularios. Hermana de `/beneficio`.
 *
 * Decisión de Daniel del 2026-09-18: la finca llega **hasta la cosecha** —parcelas,
 * lo de antes de cosechar, la cosecha, su rendimiento y quién la recolecta—, y lo
 * del beneficio empieza cuando entra la cereza. Diseño en
 * `docs/superpowers/specs/2026-09-18-seccion-finca-design.md`.
 *
 * **Sólo enlaza lo que ya existe.** Recolectores, rendimiento y calidad de la
 * cosecha llegan en piezas posteriores del spec; hasta entonces se nombran en una
 * línea, sin enlace, porque un enlace a una pantalla que no existe es un 404 con
 * buena cara.
 *
 * **Cada enlace sólo aparece si quien mira puede usarlo**, con la misma pregunta
 * ancha que ya hace la navegación. La autorización de verdad sigue en cada destino.
 */
export default async function FincaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const granted = await permissionKeysAnywhere(user.userAccountId);
  // La misma regla que la entrada del menú, que heredó la de «Parcelas».
  const veFinca = ["location:manage_attributes", "lot:view", "lot:manage"].some((k) => granted.has(k));
  if (!veFinca) notFound();

  const t = await getTranslations("SeccionFinca");
  const destinos = [
    { href: "/plots", titulo: t("parcelas"), ayuda: t("parcelasAyuda"), visible: true },
    // `recordHarvestEvent` exige `lot:manage` (lib/traceability/harvest.ts).
    { href: "/lots/new", titulo: t("cosecha"), ayuda: t("cosechaAyuda"), visible: granted.has("lot:manage") },
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
      <p className="nn-muted">{t("proximamente")}</p>
    </div>
  );
}
