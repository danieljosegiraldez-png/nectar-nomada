import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getPlotDetail } from "../../../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../../../lib/traceability/locations";
import { NuevaMicroparcelaForm } from "../../../../components/traceability/NuevaMicroparcelaForm";

export const dynamic = "force-dynamic";

/**
 * Crear una microparcela dentro de esta parcela — spec fincas y parcelas
 * §3.3. Es configuración, no captura de campo, así que vive fuera del
 * tablero (que sólo enseña, spec de vistas de finca y parcela) y cuelga de
 * `/plots/[id]/ajustes`, de donde se llega y a donde se vuelve.
 *
 * Mismo acceso que las demás rutas mudadas fuera del tablero:
 * `getPlotDetail` exige `manage_attributes` sobre esta Location. El
 * `locationType === "plot"` de abajo es la regla que ya tenía `main`, sin
 * cambios — una microparcela creada por `createMicrolot` ES `plot` (copia
 * el tipo de su padre, spec fincas y parcelas §3.3), así que esta pantalla
 * SÍ existe para ella: el spec no prohíbe subdividir una microparcela otra
 * vez, y `createMicrolot` no tiene tope de profundidad.
 */
export default async function NuevaMicroparcelaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const tf = await getTranslations("Fincas");

  let detail;
  try {
    detail = await getPlotDetail(user.userAccountId, id);
  } catch (error) {
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }
  if (detail.location.locationType !== "plot") notFound();

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${id}/ajustes`}>{t("plotDashboardBackLink")}</Link>
      </p>
      <h1>{tf("nuevaMicroparcelaTitulo")}</h1>
      <NuevaMicroparcelaForm parentLocationId={id} />
    </div>
  );
}
