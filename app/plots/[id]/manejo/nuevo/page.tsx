import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getPlotDetail } from "../../../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../../../lib/traceability/locations";
import { productosFitosanitarios } from "../../../../../lib/traceability/intervenciones";
import { getObserverCandidates } from "../../../../../lib/traceability/lots";
import { listPlantSpecimens } from "../../../../../lib/traceability/specimens";
import { IntervencionForm, type IntervencionFormValues } from "../../../../components/traceability/IntervencionForm";

export const dynamic = "force-dynamic";

/**
 * Registrar un manejo fitosanitario — Tarea 8, spec §5.
 *
 * `?motivo=<observationId>` es la lectura de trampa que lo motivó (la abre el
 * aviso del PR B); aquí sólo se lee y se manda oculta al formulario — este PR
 * no dibuja todavía ese botón.
 */
export default async function NuevoManejoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { id } = await params;
  const { motivo } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let detail;
  try {
    detail = await getPlotDetail(user.userAccountId, id);
  } catch (error) {
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }
  const { location } = detail;

  const [productos, { people, selfPersonId }, plantas] = await Promise.all([
    productosFitosanitarios(user.userAccountId, id),
    getObserverCandidates(user.userAccountId),
    listPlantSpecimens(user.userAccountId, id),
  ]);

  const valores: IntervencionFormValues = {
    kind: "aplicacion",
    target: "broca",
    targetNote: null,
    method: null,
    mixVolume: null,
    mixUnit: null,
    // Ronda final, hallazgo 1: `null` = «ahora», calculado en el NAVEGADOR por
    // `IntervencionForm`. Calcularlo aquí, en el servidor, horneaba la zona
    // del servidor en el valor precargado.
    occurredAt: null,
    operatorPersonId: null,
    motivoObservationId: motivo ?? null,
    specimenIds: [],
    notes: null,
    lineas: [],
  };

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${location.id}`}>{t("manejoBackToPlot")}</Link>
      </p>
      <h1>{t("manejoNewTitle")}</h1>
      <p className="nn-detail-meta">{location.name}</p>

      <IntervencionForm
        modo="nuevo"
        locationId={location.id}
        productos={productos}
        observers={people.map((p) => ({ id: p.id, displayName: p.displayName }))}
        selfPersonId={selfPersonId}
        specimens={plantas}
        claveDeEnvio={crypto.randomUUID()}
        valores={valores}
      />
    </div>
  );
}
