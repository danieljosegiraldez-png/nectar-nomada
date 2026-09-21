import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { TraceabilityAccessError } from "../../../../../lib/traceability/lots";
import {
  productosFitosanitarios,
  bloquesDeLaParcela,
  motivoValidoParaParcela,
  contextoDeManejo,
} from "../../../../../lib/traceability/intervenciones";
import { getObserverCandidates } from "../../../../../lib/traceability/lots";
import { listPlantSpecimens } from "../../../../../lib/traceability/specimens";
import { idValidoEnLista } from "../../../../../lib/traceability/precargaDeIntervencion";
import { IntervencionForm, type IntervencionFormValues } from "../../../../components/traceability/IntervencionForm";

export const dynamic = "force-dynamic";

/**
 * Registrar un manejo fitosanitario — Tarea 8, spec §5.
 *
 * `?motivo=<observationId>` es la lectura de trampa que lo motivó, y
 * `?bloque=`/`?material=` (Tarea 5 PR B) precargan bloque y producto desde el
 * botón «Registrar aplicación» del aviso de lectura alta
 * (`enlaceDeRegistrarAplicacion`, `pendienteDeLaParcela.ts`). Los tres se
 * validan contra lo que es válido para ESTA parcela/organización — uno que no
 * cuadra se ignora en silencio, sin pintar error (brief, decisión del
 * controlador #3): `bloque`/`material` con `idValidoEnLista` contra lo que
 * la página ya cargó; `motivo` con `motivoValidoParaParcela`, que repite las
 * mismas tres condiciones que el servicio exige al guardar
 * (`validarReferencias`) pero sin lanzar — ronda de arreglos 1, importante
 * #2: antes se pasaba sin validar y un motivo inválido hacía FALLAR el
 * guardado con un error, en vez de perder sólo la precarga.
 */
export default async function NuevoManejoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ motivo?: string; bloque?: string; material?: string }>;
}) {
  const { id } = await params;
  const { motivo, bloque, material } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let location;
  try {
    // Ronda final de arreglos, hallazgo 5: lectura propia y acotada,
    // autorizada con `lot:view` — no `getPlotDetail`, que exige
    // `location:manage_attributes` y dejaba fuera a un operario con sólo
    // `lot:view`/`lot:manage`. Ver el docstring de `contextoDeManejo`.
    location = await contextoDeManejo(user.userAccountId, id);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) notFound();
    throw error;
  }

  const [productos, { people, selfPersonId }, plantas, bloques, motivoValido] = await Promise.all([
    productosFitosanitarios(user.userAccountId, id),
    getObserverCandidates(user.userAccountId, [{ locationId: id }]),
    listPlantSpecimens(user.userAccountId, id),
    // Ronda de arreglos 1 (hallazgo crítico): los bloques de manejo se leen
    // con el MISMO permiso (`lot:view`/`manage`) que ya exige esta página,
    // nunca `location:manage_attributes` — ver el docstring de
    // `bloquesDeLaParcela`.
    bloquesDeLaParcela(user.userAccountId, id),
    motivoValidoParaParcela(motivo, id),
  ]);

  const bloqueValido = idValidoEnLista(bloque, bloques);
  const materialIdValido = idValidoEnLista(material, productos);
  const materialValido = productos.find((p) => p.id === materialIdValido) ?? null;

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
    motivoObservationId: motivoValido,
    specimenIds: [],
    plotBlockIds: bloqueValido ? [bloqueValido] : [],
    notes: null,
    // Decisión del controlador #3: la línea precargada con `?material=` trae
    // la carencia/reentrada DEL PRODUCTO, a la vista y editable — exactamente
    // lo que `LineaDeIntervencion` muestra al elegirlo a mano (nunca un valor
    // ya declarado, porque no hay ninguno todavía).
    lineas: materialValido
      ? [
          {
            materialId: materialValido.id,
            consumableLotId: null,
            quantity: null,
            unit: null,
            withdrawalDays: materialValido.defaultWithdrawalDays,
            reentryHours: materialValido.defaultReentryHours,
          },
        ]
      : [],
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
        bloques={bloques.map((b) => ({ id: b.id, name: b.name }))}
        claveDeEnvio={crypto.randomUUID()}
        valores={valores}
      />
    </div>
  );
}
