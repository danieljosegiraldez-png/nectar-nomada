import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { listarBeneficios, sitiosParaBeneficio } from "../../../lib/traceability/beneficios";
import { personasDelBeneficio } from "../../../lib/traceability/concesiones";
import { LocationAccessError } from "../../../lib/traceability/locations";
import { FormularioBeneficio } from "./FormularioBeneficio";
import { Concesiones } from "./Concesiones";

export const dynamic = "force-dynamic";
export default async function AjustesDelBeneficioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("AjustesDelBeneficio");
  // `null` cuando quien mira no tiene ningún sitio donde crear (la sección
  // «Crear» no se ofrece), distinto de `[]` (`sitiosParaBeneficio` nunca lo
  // devuelve: lanza en vez de una lista vacía).
  let sitios: Awaited<ReturnType<typeof sitiosParaBeneficio>> | null = null;
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
    // Sin sitios propios que crear o gestionar, la pantalla puede seguir
    // siendo alcanzable si algún beneficio concede editar por concesión —
    // se comprueba abajo, sobre `listarBeneficios`, antes del 404.
  }
  const beneficios = await listarBeneficios(user.userAccountId);
  // Quien no puede ni crear ni editar nada no ve la pantalla: 404, como
  // `/equipos/[id]`. Una página vacía diría qué hay dentro.
  if (sitios === null && !beneficios.some((b) => b.puedeEditar)) notFound();

  const personasPorBeneficio = new Map<string, Awaited<ReturnType<typeof personasDelBeneficio>>>();
  for (const b of beneficios) {
    if (b.puedeEditar) personasPorBeneficio.set(b.id, await personasDelBeneficio(user.userAccountId, b.id));
  }

  return <div>
    <h1>{t("ajustesTitulo")}</h1>
    <p className="nn-muted">{t("ajustesIntro")}</p>
    <h2>{t("misBeneficios")}</h2>
    {!beneficios.length && <p>{t("sinBeneficios")}</p>}
    {beneficios.map((b) => <section key={b.id}>
      <h3>{b.name}</h3>
      <p className="nn-muted">{b.sitio ? t("enSitio", { sitio: b.sitio.name }) : t("sitioNoVisible")}</p>
      {b.puedeEditar && <>
        <details><summary>{t("renombrar")}</summary>
          <FormularioBeneficio existente={{ id: b.id, name: b.name }} />
        </details>
        <Concesiones beneficioId={b.id} personas={personasPorBeneficio.get(b.id) ?? []} />
      </>}
    </section>)}
    {sitios && <>
      <h2>{t("crear")}</h2>
      <FormularioBeneficio padres={sitios} />
    </>}
    <p><Link href="/lots">← {t("volverALotes")}</Link></p>
  </div>;
}
