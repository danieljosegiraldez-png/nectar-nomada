import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { organizacionesDeFinca, puedeCrearFincas } from "../../../lib/traceability/fincas";
import { NuevaFincaForm } from "../../components/traceability/NuevaFincaForm";

export const dynamic = "force-dynamic";

/**
 * Dar de alta una finca (spec fincas y parcelas §3.2). Sólo el administrador de plataforma: a los
 * demás, un 404 como el resto de las pantallas que no les corresponden. `?organizacion=` sólo se
 * acepta si es una organización de finca; cualquier otro valor se ignora.
 *
 * **ADR-189:** ya no se exige que esa organización esté SIN terreno. Se le puede añadir otra finca,
 * y por eso la lista que valida el parámetro es `organizacionesDeFinca` y no `organizacionesSinTerreno`
 * — aquella deja fuera precisamente a las que pueden recibir la segunda.
 */
export default async function NuevaFincaPage({ searchParams }: { searchParams: Promise<{ organizacion?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await puedeCrearFincas(user.userAccountId))) notFound();

  const { organizacion } = await searchParams;
  const deFinca = await organizacionesDeFinca(user.userAccountId);
  const elegida = organizacion ? (deFinca.find((o) => o.id === organizacion) ?? null) : null;

  const t = await getTranslations("Fincas");
  return (
    <div>
      <Link href="/fincas" className="nn-back-link">
        {t("volverAFincas")}
      </Link>
      <h1>{elegida ? t("crearTerrenoTitulo") : t("nuevaTitulo")}</h1>
      <p className="nn-muted">{t("nuevaIntro")}</p>
      <NuevaFincaForm organizacion={elegida} />
    </div>
  );
}
