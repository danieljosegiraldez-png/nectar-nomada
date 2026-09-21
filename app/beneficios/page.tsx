import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { permissionKeysAnywhere } from "../../lib/rbac/service";
import { beneficiosDeDestino } from "../../lib/traceability/jornadasDeCosecha";
import { elegirBeneficioAction } from "../actions/recepcionDeCereza";
import { BotonDeEnvio } from "../components/BotonDeEnvio";

export const dynamic = "force-dynamic";

/**
 * Elegir el beneficio, la misma pregunta que `/fincas`. Daniel, 2026-09-21: quien tiene varios
 * beneficios tiene que ver un botón por beneficio. Cada botón lo deja elegido en una cookie que sólo
 * acota —cada página la vuelve a resolver contra los beneficios que puede ver— y vuelve a la
 * pantalla de donde se vino. La lista es `beneficiosDeDestino`, que exige `lot:view` por beneficio.
 */
export default async function BeneficiosPage({ searchParams }: { searchParams: Promise<{ volver?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const granted = await permissionKeysAnywhere(user.userAccountId);
  if (!granted.has("lot:view") && !granted.has("lot:manage")) notFound();
  const { volver } = await searchParams;
  const destino = volver && volver.startsWith("/") && !volver.startsWith("//") ? volver : "/beneficio/recepcion";

  const t = await getTranslations("Recepcion");
  const beneficios = await beneficiosDeDestino(user.userAccountId);

  return (
    <div>
      <p>
        <Link href="/beneficio">{t("volver")}</Link>
      </p>
      <h1>{t("elegirBeneficioTitulo")}</h1>
      {beneficios.length === 0 ? (
        <p className="nn-muted">{t("sinBeneficios")}</p>
      ) : (
        <>
          <p className="nn-muted">{t("elegirBeneficioIntro")}</p>
          <ul className="nn-grid">
            {beneficios.map((b) => (
              <li key={b.id}>
                <form action={elegirBeneficioAction}>
                  <input type="hidden" name="beneficio" value={b.id} />
                  <input type="hidden" name="volver" value={destino} />
                  <BotonDeEnvio>{b.name}</BotonDeEnvio>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
