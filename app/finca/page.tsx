import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { permissionKeysAnywhere } from "../../lib/rbac/service";
import { cookies } from "next/headers";
import { COOKIE_FINCA, fincaDeLaPagina, puedeCrearParcelaEn } from "../../lib/traceability/fincas";
import { NuevaParcelaForm } from "../components/traceability/NuevaParcelaForm";
import { FincaElegida } from "../components/traceability/FincaElegida";

export const dynamic = "force-dynamic";

/**
 * La sección Finca: una página índice, sin formularios. Hermana de `/beneficio`.
 *
 * Decisión de Daniel del 2026-09-18: la finca llega **hasta la cosecha** —parcelas,
 * lo de antes de cosechar, la cosecha, su rendimiento y quién la recolecta—, y lo
 * del beneficio empieza cuando entra la cereza. Diseño en
 * `docs/superpowers/specs/2026-09-18-seccion-finca-design.md`.
 *
 * **Sólo enlaza lo que ya existe.** Rendimiento y calidad de la cosecha llegan
 * en piezas posteriores del spec (las jornadas y sus recolectores ya existen); hasta entonces se nombran en una
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

  // Spec fincas y parcelas §3.1: con varias fincas y ninguna elegida, primero se elige.
  const finca = await fincaDeLaPagina(user.userAccountId, (await cookies()).get(COOKIE_FINCA)?.value);
  if (finca.debeElegir) redirect("/fincas?volver=/finca");
  const puedeCrearParcela = finca.elegida ? await puedeCrearParcelaEn(user.userAccountId, finca.elegida.siteId) : false;

  const t = await getTranslations("SeccionFinca");
  const tf = await getTranslations("Fincas");
  const destinos = [
    { href: "/plots", titulo: t("parcelas"), ayuda: t("parcelasAyuda"), visible: true },
    // `recordHarvestEvent` exige `lot:manage` (lib/traceability/harvest.ts).
    { href: "/lots/new", titulo: t("cosecha"), ayuda: t("cosechaAyuda"), visible: granted.has("lot:manage") },
    // `jornadasDeFinca` exige `lot:view` sobre la finca; abrir una, `lot:manage`.
    { href: "/finca/jornadas", titulo: t("jornadas"), ayuda: t("jornadasAyuda"), visible: granted.has("lot:view") || granted.has("lot:manage") },
  ].filter((d) => d.visible);

  return (
    <div>
      <h1>{t("titulo")}</h1>
      <FincaElegida elegida={finca.elegida} hayVarias={finca.fincas.length > 1} volver="/finca" />
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
      {finca.elegida ? (
        <section className="nn-section">
          <h2>{tf("nuevaParcelaTitulo")}</h2>
          {puedeCrearParcela ? <NuevaParcelaForm siteId={finca.elegida.siteId} /> : <p className="nn-muted">{tf("parcelaSinPermiso")}</p>}
        </section>
      ) : null}
      <p className="nn-muted">{t("proximamente")}</p>
    </div>
  );
}
