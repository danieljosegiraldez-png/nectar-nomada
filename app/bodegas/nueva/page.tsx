import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { crearBodegaFormAction } from "../../actions/bodegas";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";
import { getCurrentUser } from "../../../lib/auth/session";
import { padresParaBodega } from "../../../lib/traceability/bodegas";

export const dynamic = "force-dynamic";
export default async function NuevaBodegaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [t, { error }] = await Promise.all([getTranslations("Bodegas"), searchParams]);
  const padres = await padresParaBodega(user.userAccountId);
  const codigo = error && /^[a-z_]+$/.test(error) ? error : null;
  return (
    <div>
      <p>
        <Link href="/bodegas">← {t("titulo")}</Link>
      </p>
      <h1>{t("nueva")}</h1>
      {codigo ? (
        <p className="nn-error" role="alert">
          {t(`error_${codigo}` as "error_datos_invalidos")}
        </p>
      ) : null}
      {!padres.length ? (
        <p className="nn-muted">{t("sinPermiso")}</p>
      ) : (
        <form action={crearBodegaFormAction}>
          <label>
            {t("padre")}
            <select name="parentLocationId" required defaultValue="">
              <option value="" disabled>
                {t("padre")}
              </option>
              {padres.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {t(`tipo_${p.tipo}`)}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="name">{t("nombre")}</label>
          <input type="text" id="name" name="name" required maxLength={120} />
          <BotonDeEnvio>{t("crear")}</BotonDeEnvio>
        </form>
      )}
    </div>
  );
}
