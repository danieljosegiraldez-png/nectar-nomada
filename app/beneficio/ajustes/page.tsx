import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { listarBeneficios, sitiosParaBeneficio } from "../../../lib/traceability/beneficios";
import { LocationAccessError } from "../../../lib/traceability/locations";
import { FormularioBeneficio } from "./FormularioBeneficio";

export const dynamic = "force-dynamic";
export default async function AjustesDelBeneficioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("AjustesDelBeneficio");
  let sitios;
  try { sitios = await sitiosParaBeneficio(user.userAccountId); }
  catch (error) {
    if (!(error instanceof LocationAccessError)) throw error;
    // Un mundo sin ningún sitio no es una negativa de permiso: decirlo,
    // en vez del mismo 404 mudo que usa la falta de acceso.
    if (error.message === "no_sites_exist") {
      return <div>
        <h1>{t("ajustesTitulo")}</h1>
        <p className="nn-muted">{t("sinSitios")}</p>
        <p><Link href="/lots">← {t("volverALotes")}</Link></p>
      </div>;
    }
    // Quien no puede configurar no ve la pantalla: 404, como `/equipos/[id]`.
    // Una página vacía diría qué hay dentro. `notFound()` devuelve `never`, así
    // que TypeScript sabe que `sitios` está definido a partir de aquí.
    notFound();
  }
  const beneficios = await listarBeneficios(user.userAccountId);
  return <div>
    <h1>{t("ajustesTitulo")}</h1>
    <p className="nn-muted">{t("ajustesIntro")}</p>
    <h2>{t("misBeneficios")}</h2>
    {!beneficios.length && <p>{t("sinBeneficios")}</p>}
    {beneficios.map((b) => <section key={b.id}>
      <h3>{b.name}</h3>
      <p className="nn-muted">{b.sitio ? t("enSitio", { sitio: b.sitio.name }) : t("sitioNoVisible")}</p>
      <details><summary>{t("renombrar")}</summary>
        <FormularioBeneficio existente={{ id: b.id, name: b.name }} />
      </details>
    </section>)}
    <h2>{t("crear")}</h2>
    <FormularioBeneficio padres={sitios} />
    <p><Link href="/lots">← {t("volverALotes")}</Link></p>
  </div>;
}
