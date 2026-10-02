/**
 * El proceso de un lote, en una sola pantalla.
 *
 * **Una ruta y no cinco.** Esto se usa en el campo, con el teléfono en una mano
 * y café en la otra: abrir el proceso, apuntar un manejo, cerrarlo con la
 * humedad y —si se pasó del objetivo, o si el lote ya está en bodega—
 * devolverlo a secado son cosas que ocurren en la misma visita a la cama de
 * secado. Cinco rutas serían cinco navegaciones.
 *
 * **La pantalla no decide nada.** Todo lo que se ve aquí lo decide el servicio:
 * si hay un proceso abierto, si se puede cerrar, si el lote pasó el objetivo.
 * Ocultar un botón no es autorizar (SECURITY.md §2) — el servidor rechaza igual,
 * y estas condiciones existen para no ofrecer lo que va a fallar.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getLotSummary, TraceabilityAccessError, puedeGestionarLote } from "../../../../lib/traceability/lots";
import { listarProcesosDeLote, opcionesParaProceso, LotProcessError } from "../../../../lib/traceability/lotProcess";
import { listRecipeVersionsForLot } from "../../../../lib/traceability/processTargets";
import { getCurrentStorageAssignment } from "../../../../lib/traceability/storage";
import {
  AbrirProcesoForm,
  CambiarIntencionForm,
  CambiarObjetivoForm,
  CerrarProcesoForm,
  DevolverASecadoForm,
  IntervencionForm,
} from "../../../components/traceability/ProcesoDelLote";

export const dynamic = "force-dynamic";

export default async function ProcesoDeLotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");

  let lot;
  try {
    lot = await getLotSummary(user.userAccountId, id);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) notFound();
    throw error;
  }

  let procesos;
  try {
    procesos = await listarProcesosDeLote(user.userAccountId, id);
  } catch (error) {
    if (error instanceof LotProcessError) notFound();
    throw error;
  }

  const puedeGestionar = await puedeGestionarLote(user.userAccountId, lot);
  const { intervenciones, mediciones, grados, estadosDeCereza, motivosDeDevolucion } = await opcionesParaProceso(user.userAccountId, id);
  // La misma etiqueta que ya usa la página del lote, para que una receta se
  // llame igual en las dos pantallas.
  const recetas = (await listRecipeVersionsForLot(user.userAccountId, id)).map((v) => ({
    id: v.id,
    label: `${v.recipe.name} · v${v.version} · ${v.targets.length} ${t("targetsCountSuffix")}`,
  }));

  const abierto = procesos.find((p) => p.endedAt === null) ?? null;
  const ultimo = procesos[procesos.length - 1] ?? null;
  // Cerrado y por encima del objetivo: es el estado que bloquea la ENTRADA a
  // bodega. Es una de las dos condiciones con que se ofrece `devolverASecado`; la
  // otra, `enBodega`, está justo debajo. Ya no es la única (Parte 1, R7).
  const bloqueado =
    ultimo !== null && ultimo.endedAt !== null && (ultimo.diferenciaContraObjetivo ?? 0) > 0;
  // Parte 1, R7: «devolver a secado» se ofrece en todo lote en bodega o bloqueado al entrar. Antes
  // sólo salía con el cierre por encima del objetivo, y como la compuerta impide guardar algo así,
  // un lote EN BODEGA nunca lo veía, que es justo el caso que pide Daniel.
  const enBodega = (await getCurrentStorageAssignment(user.userAccountId, id)) !== null;

  const fecha = (d: Date | null) => (d === null ? "—" : d.toISOString().slice(0, 10));

  return (
    <div>
      <Link href={`/lots/${id}`} className="nn-back-link">
        {t("backToLot", { lotCode: lot.lotCode })}
      </Link>
      <h1>{t("processHeading")}</h1>
      <p className="nn-muted">{t("processIntro")}</p>

      {!puedeGestionar ? <p className="nn-muted">{t("soloLecturaEnEsteLote")}</p> : null}

      {procesos.length === 0 ? (
        <section className="nn-section">
          <h2>{t("openProcessButton")}</h2>
          {puedeGestionar ? <AbrirProcesoForm lotId={id} recetas={recetas} grados={grados} estadosDeCereza={estadosDeCereza} /> : null}
        </section>
      ) : null}

      {procesos.map((p) => (
        <section key={p.id} className="nn-section">
          <h2>
            {t("processNumberHeading", { n: p.sequenceOrder })} · {p.etiqueta}
          </h2>

          <div className="nn-detail-meta">
            <span>{t("processStateLabel", { state: p.endedAt === null ? t("processOpen") : t("processClosed") })}</span>
            <span>{t("processTargetShown", { pct: p.targetMoisturePct.toNumber().toString() })}</span>
            <span>{t("processGradeShown", { grade: p.processGradeValue.value })}</span>
            <span>{t("processCherryStateShown", { state: p.cherryStateValue.value })}</span>
            <span>{t("processStartedShown", { date: fecha(p.startedAt) })}</span>
            {p.endedAt !== null ? <span>{t("processEndedShown", { date: fecha(p.endedAt) })}</span> : null}
          </div>

          <p>
            <strong>{t("processIntentShown")}</strong> {p.intent}
          </p>

          {p.humedadDeCierre !== null ? (
            <p className={(p.diferenciaContraObjetivo ?? 0) > 0 ? "nn-error" : undefined}>
              {t("processClosedAt", {
                pct: p.humedadDeCierre.toString(),
                diff: (p.diferenciaContraObjetivo ?? 0).toFixed(2),
              })}
            </p>
          ) : null}

          {p.interventions.length > 0 ? (
            <ul>
              {p.interventions.map((i) => (
                <li key={i.id}>
                  {fecha(i.occurredAt)} · {i.catalogValue.value}
                  {i.notes ? ` · ${i.notes}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="nn-muted">{t("processNoInterventionsYet")}</p>
          )}

          {p.fermentationRuns.length > 0 || p.dryingRuns.length > 0 ? (
            <p className="nn-muted">
              {t("processRunsAttached", { fermentations: p.fermentationRuns.length, dryings: p.dryingRuns.length })}
            </p>
          ) : null}
        </section>
      ))}

      {abierto !== null && puedeGestionar ? (
        <>
          <section className="nn-section">
            <h2>{t("recordProcessInterventionButton")}</h2>
            <IntervencionForm lotProcessId={abierto.id} lotId={id} opciones={intervenciones} />
          </section>

          <section className="nn-section">
            <h2>{t("closeProcessButton")}</h2>
            <CerrarProcesoForm lotProcessId={abierto.id} lotId={id} mediciones={mediciones} />
          </section>

          <section className="nn-section">
            <h2>{t("processChangeIntentButton")}</h2>
            <CambiarIntencionForm lotProcessId={abierto.id} lotId={id} actual={abierto.intent} />
            <CambiarObjetivoForm
              lotProcessId={abierto.id}
              lotId={id}
              actual={abierto.targetMoisturePct.toNumber()}
            />
          </section>
        </>
      ) : null}

      {(bloqueado || enBodega) && puedeGestionar ? (
        <section className="nn-section">
          <h2>{t("processBackToDryingButton")}</h2>
          {bloqueado ? <p className="nn-error">{t("processBlockedFromStorage")}</p> : null}
          <DevolverASecadoForm lotId={id} motivos={motivosDeDevolucion} />
        </section>
      ) : null}

      {abierto === null && procesos.length > 0 && !bloqueado && puedeGestionar ? (
        <section className="nn-section">
          <h2>{t("openProcessButton")}</h2>
          <p className="nn-muted">{t("processOpenAnotherHelp")}</p>
          <AbrirProcesoForm lotId={id} recetas={recetas} grados={grados} estadosDeCereza={estadosDeCereza} />
        </section>
      ) : null}
    </div>
  );
}
