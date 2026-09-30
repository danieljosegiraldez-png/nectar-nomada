import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { TODAS, listarFincas, organizacionesSinTerreno, puedeCrearFincas } from "../../lib/traceability/fincas";
import { elegirFincaAction } from "../actions/fincas";
import { BotonDeEnvio } from "../components/BotonDeEnvio";

export const dynamic = "force-dynamic";

/**
 * Spec fincas y parcelas §3.1 — elegir la finca. Daniel, 2026-09-18: «debería preguntarme qué
 * finca —trabajo con varias— o mostrarme todas». Cada finca es un botón que la deja elegida en
 * la sesión y vuelve a la página de donde se vino.
 */
export default async function FincasPage({ searchParams }: { searchParams: Promise<{ volver?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { volver } = await searchParams;
  const destino = volver && volver.startsWith("/") && !volver.startsWith("//") ? volver : "/finca";

  const t = await getTranslations("Fincas");
  const [fincas, sinTerreno, puedeCrear] = await Promise.all([
    listarFincas(user.userAccountId),
    organizacionesSinTerreno(user.userAccountId),
    puedeCrearFincas(user.userAccountId),
  ]);

  return (
    <div>
      <h1>{t("titulo")}</h1>
      <p className="nn-muted">{t("intro")}</p>

      {fincas.length === 0 ? (
        <p className="nn-muted">{t("ninguna")}</p>
      ) : (
        <ul className="nn-grid">
          {fincas.map((f) => (
            <li key={f.siteId}>
              <form action={elegirFincaAction}>
                <input type="hidden" name="finca" value={f.siteId} />
                <input type="hidden" name="volver" value={destino} />
                <BotonDeEnvio>{f.nombre}</BotonDeEnvio>
              </form>
              {/*
                Rúbrica 22: una finca sin destino **no dice «0 pendientes»**, dice qué falta y
                quién lo arregla — con el enlace al sitio donde se arregla. Y rúbrica 21: la
                afirmación «esta cereza va a X» se puede desarmar hasta aquí, que es el enlace
                que la sostiene.
              */}
              <p className="nn-muted">
                {f.beneficioDestino
                  ? t("destinoDeLaFinca", { beneficio: f.beneficioDestino.name })
                  : t("destinoDeLaFincaFalta")}{" "}
                <Link href={`/fincas/${f.siteId}/destino`}>{t("destinoEnlace")}</Link>
              </p>
            </li>
          ))}
          <li>
            <form action={elegirFincaAction}>
              <input type="hidden" name="finca" value={TODAS} />
              <input type="hidden" name="volver" value={destino} />
              <BotonDeEnvio className="nn-button nn-button-quiet">{t("verTodas")}</BotonDeEnvio>
            </form>
          </li>
        </ul>
      )}

      {puedeCrear ? (
        <p>
          <Link href="/fincas/nueva">{t("nueva")}</Link>
        </p>
      ) : null}

      {sinTerreno.length > 0 ? (
        <section className="nn-section">
          <h2>{t("sinTerrenoTitulo")}</h2>
          <p className="nn-muted">{t("sinTerrenoIntro")}</p>
          <ul>
            {sinTerreno.map((o) => (
              <li key={o.id}>
                {o.name} · <Link href={`/fincas/nueva?organizacion=${o.id}`}>{t("crearTerreno")}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
