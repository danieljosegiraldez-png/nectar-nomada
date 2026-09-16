import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { organizacionesParaApiario, getManageableApiaryProjects, lugaresParaSitioDeAbejas } from "../../../lib/apiary/hives";
import { NuevoApiarioForm } from "../../components/apiary/NuevoApiarioForm";

export const dynamic = "force-dynamic";

/**
 * Dar de alta un apiario.
 *
 * **El hueco, medido el 2026-09-09.** La aplicación dejaba registrar colmenas,
 * colonias, inspecciones, eventos de colonia, cosechas de miel y visitas — y no
 * dejaba registrar **el sitio donde ocurre todo eso**. Los tres apiarios que
 * existen salieron de `prisma/seed.ts` y de un script de importación, así que
 * un apicultor nuevo no tenía por dónde empezar.
 *
 * Sin organizaciones que ofrecer se nombra la causa en vez de pintar un
 * formulario inenviable, que es la lente que ya usan `/sensory/new` y
 * `/sensory/external-report`.
 */
export default async function NuevoApiarioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Apiary");
  const [organizaciones, proyectos, lugares] = await Promise.all([
    organizacionesParaApiario(user.userAccountId),
    getManageableApiaryProjects(user.userAccountId),
    // Los lugares donde puede colgar el sitio (ADR-144).
    lugaresParaSitioDeAbejas(user.userAccountId),
  ]);

  return (
    <div>
      <Link href="/apiaries" className="nn-back-link">
        {t("backToApiaries")}
      </Link>
      <h1>{t("apiaryCreateHeading")}</h1>
      <p className="nn-muted">{t("apiaryCreateIntro")}</p>

      {organizaciones.length === 0 ? (
        <p className="nn-muted">{t("apiaryNoOrganizations")}</p>
      ) : (
        <NuevoApiarioForm
          lugares={lugares}
          organizaciones={organizaciones}
          proyectos={proyectos.map((p) => ({ id: p.id, name: p.name }))}
        />
      )}
    </div>
  );
}
