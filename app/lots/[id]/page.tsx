import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { mostrarInstante } from "../../../lib/time/mostrarInstante";
import { getCurrentUser } from "../../../lib/auth/session";
import {
  getLotDetail,
  getObserverCandidates,
  getManageableContext,
  puedeGestionarLote,
  TraceabilityAccessError,
} from "../../../lib/traceability/lots";
import { puedeGestionarAtributosDeUbicacion } from "../../../lib/traceability/locations";
import { computeCurrentQuantity } from "../../../lib/traceability/quantity";
import { nextActionFor, type BatchAction } from "../../../lib/traceability/batchActions";
import { compareRunToTargets } from "../../../lib/traceability/processTargets";
import { TargetComparisonTable } from "../../components/traceability/TargetComparisonTable";
import { getSignedUrlForAsset } from "../../../lib/traceability/media";
import {
  recordFermentationInterventionFormAction,
  endFermentationFormAction,
  recordDryingTurnFormAction,
  endDryingFormAction,
} from "../../actions/traceability";
import { MeasurementForm } from "../../components/traceability/MeasurementForm";
import { MeasurementCorrectionForm } from "../../components/traceability/MeasurementCorrectionForm";
import { PhotoUploadForm } from "../../components/traceability/PhotoUploadForm";
import { LabourEntryForm } from "../../components/traceability/LabourEntryForm";
import { MaterialConsumptionForm } from "../../components/traceability/MaterialConsumptionForm";
import { SelectionForm } from "../../components/traceability/SelectionForm";
import { getSelectionCatalogs, getSelectionOutturn } from "../../../lib/traceability/selection";
import { getHarvestSourceContext } from "../../../lib/traceability/plantingCohorts";
import { HarvestSourcesForm } from "../../components/traceability/HarvestSourcesForm";
import type { LabourEntry } from "../../../generated/prisma/client";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";

export const dynamic = "force-dynamic";

const FERMENTATION_INTERVENTION_TYPES = ["inoculation", "agitation", "purge", "addition", "sample", "transfer", "termination", "other"] as const;
const DRYING_TURN_TYPES = ["turned", "covered", "uncovered", "other"] as const;
const LOT_TYPES = ["cherry", "processing", "drying", "green", "roast", "sample", "other"] as const;

export default async function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");

  let detail;
  try {
    detail = await getLotDetail(user.userAccountId, id);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) notFound();
    throw error;
  }

  const quantity = await computeCurrentQuantity(user.userAccountId, id);
  // Sólo si este batch nació de una cosecha. Un lote recibido de un tercero no
  // tiene bloques propios que atribuir.
  const harvestSources = detail.harvestEvent
    ? await getHarvestSourceContext(user.userAccountId, detail.harvestEvent.id)
    : null;
  const { people: observers, selfPersonId } = await getObserverCandidates(user.userAccountId);
  // T12.6: organizations for the labour form's "provided in-kind by" toggle
  // — same convenience-not-security-boundary reasoning as getManageableContext's
  // other dropdowns (lots.ts), reused here rather than a new query.
  const { organizations } = await getManageableContext(user.userAccountId);

  const {
    lot,
    lineage,
    transformations,
    quantityEvents,
    measurements,
    samples,
    fermentationRuns,
    dryingRuns,
    storageAssignments,
    tasks,
    auditEvents,
    sensoryLinkage,
    harvestEvent,
    receivingEvent,
    assets,
    labourEntries,
    materialConsumptionEntries,
  } = detail;

  // La página no consultaba NINGÚN permiso de escritura: ofrecía seis botones y
  // 16 formularios a cualquiera que pudiera *ver* el lote. Trazadas las ocho
  // cadenas de servicio, 15 de los 16 exigen `lot:manage` y uno
  // —`HarvestSourcesForm`— exige `location:manage_attributes`; por eso son dos
  // preguntas y no una: colapsarlas escondería el formulario de fuentes a quien
  // sí puede usarlo.
  //
  // Se le pregunta al MISMO guardia que usa la escritura en vez de reimplementar
  // la regla aquí, que es exactamente cómo la pantalla y el servicio acaban
  // discrepando.
  const puedeRegistrar = await puedeGestionarLote(user.userAccountId, lot);

  // Una clave por formulario y por render. El servidor las genera —no el
  // cliente— porque un `crypto.randomUUID()` dentro de un `useState` daría un
  // valor al renderizar en servidor y otro al hidratar. Cambian en cada carga y
  // tras el `revalidatePath` de cada acción, así que un registro legítimo
  // posterior nunca reusa la de antes.
  const clavesDeJornal = {
    harvestEvent: crypto.randomUUID(),
    receivingEvent: crypto.randomUUID(),
    fermentationRun: crypto.randomUUID(),
    dryingRun: crypto.randomUUID(),
  } as const;
  const clavesDeConsumo = {
    fermentationRun: crypto.randomUUID(),
    dryingRun: crypto.randomUUID(),
  } as const;
  const claveDeMedicion = crypto.randomUUID();
  const puedeEditarFuentes = harvestEvent
    ? await puedeGestionarAtributosDeUbicacion(user.userAccountId, harvestEvent.locationId)
    : false;

  // Qué mediciones han sido superadas por una corrección. Se calcula de la
  // lista que ya se cargó, sin otra consulta.
  const supersededMeasurementIds = new Set(
    measurements.map((m) => m.correctsId).filter((id): id is string => id != null),
  );

  /**
   * Fecha y hora en la zona del SITIO, no en UTC.
   *
   * Antes cada uso repetía `toISOString().slice(0, 16)`, que siempre devuelve
   * UTC: cosecha, recepción, fermentación y secado se leían cinco horas
   * adelantadas, y las que caen de madrugada cambiaban de día. Medido el
   * 2026-09-05 recorriendo la aplicación. Ver `lib/time/mostrarInstante.ts`.
   *
   * Un lote sin Location cae en el respaldo del formateador: mostrar la hora
   * de la finca es mejor que mostrar UTC, y no hay una tercera opción honesta.
   */
  const cuando = (date: Date) => mostrarInstante(date, lot.location?.timezone);
  const labourEntryLine = (entry: LabourEntry) =>
    t("labourEntryLine", { workers: entry.workerCount, hours: entry.hours.toString(), date: cuando(entry.occurredAt) }) +
    (entry.taskNote ? ` — ${entry.taskNote}` : "");
  const consumptionEntryLine = (entry: (typeof materialConsumptionEntries)[number]) =>
    t("consumptionEntryLine", { material: entry.materialName, batch: entry.batchLabel }) +
    (entry.quantity != null ? ` — ${entry.quantity.toString()} ${entry.unit ?? ""}` : "");

  const activeFermentation = fermentationRuns.find((r) => r.endedAt === null) ?? null;
  const activeDrying = dryingRuns.find((r) => r.endedAt === null) ?? null;

  // ADR-096 — which action this batch is waiting for, and the list to render.
  const suggestedAction = nextActionFor(
    lot.lotType,
    Boolean(activeFermentation || activeDrying),
    // Resolved below from this batch's own transformations; see `alreadySelected`.
    transformations.some((tr) => tr.transformationType === "selection"),
  );

  // ADR-099 — target versus actual for the run under way. Empty when the run
  // was started without a recipe, which is most of them and is legitimate;
  // the component renders nothing rather than an empty table.
  const targetRows = activeFermentation
    ? await compareRunToTargets(user.userAccountId, activeFermentation.id)
    : [];

  // P3 §6 — the selection form is offered for cherry that is not already in a
  // run. A batch mid-fermentation is not waiting to be sorted, and a lot that
  // has already been selected is a *different* lot (the accepted output), so
  // this does not need to ask whether sorting already happened.
  const canSelect = lot.lotType === "cherry" && !activeFermentation && !activeDrying;
  const selectionCatalogs = canSelect ? await getSelectionCatalogs() : null;

  // P3 §6 follow-through — a selection recorded against this batch produced an
  // outturn, and the outturn is the number a producer actually asks for. It was
  // computable from #58 and visible nowhere, so recording one told the operator
  // nothing back.
  const selectionTransformation = transformations.find((tr) => tr.transformationType === "selection") ?? null;

  // Has this batch already been sorted? True when a selection names it at all —
  // either it was the input (this batch was sorted) or it is an output (it came
  // out of one). Both mean the page should stop suggesting selección: the first
  // because it is done, the second because sorting the accepted stream again is
  // a different decision an operator would make deliberately, not a next step.
  const alreadySelected = selectionTransformation != null;
  const outturn = selectionTransformation ? await getSelectionOutturn(selectionTransformation.id) : null;

  const availableActions: { action: BatchAction; href: string; label: string }[] = [
    // Only offered while a run is under way, because that is the only time it
    // is the *expected* step — the measurement form itself is always on the
    // page, in its own section, and this is an anchor to it rather than a
    // second way to reach it (ADR-096).
    ...(activeFermentation || activeDrying
      ? [{ action: "measurement" as const, href: "#measurements", label: t("recordMeasurementButton") }]
      : []),
    // Starting a new stage is offered only when no run is under way, exactly
    // as before — the conditional is unchanged, only the styling below it is.
    // Selección is an anchor to the form already in its own section, not a
    // second route to it — the same treatment `measurement` gets above.
    ...(canSelect ? [{ action: "selection" as const, href: "#seleccion", label: t("recordSelectionButton") }] : []),
    ...(!activeFermentation && !activeDrying
      ? ([
          { action: "fermentation", href: `/lots/${lot.id}/fermentation/new`, label: t("startFermentationButton") },
          { action: "drying", href: `/lots/${lot.id}/drying/new`, label: t("startDryingButton") },
        ] as const)
      : []),
    { action: "storage", href: `/lots/${lot.id}/storage/new`, label: t("moveStorageButton") },
    { action: "sample", href: `/lots/${lot.id}/samples/new`, label: t("createSampleButton") },
    { action: "report", href: `/lots/${lot.id}/report`, label: t("viewReportButton") },
  ];

  // The suggested action leads. Everything else keeps its original order, so
  // an operator who already knows where a button lives still finds it there.
  // Sin permiso de registro sólo sobrevive `report`, que es la única de lectura.
  // Se filtra ANTES de ordenar por acción sugerida: si no, la sugerencia podría
  // ser una acción ya retirada y encabezaría una lista donde no está.
  const accionesVisibles = puedeRegistrar
    ? availableActions
    : availableActions.filter((a) => a.action === "report");

  const batchActions = [
    ...accionesVisibles.filter((a) => a.action === suggestedAction),
    ...accionesVisibles.filter((a) => a.action !== suggestedAction),
  ];
  const currentStorage = storageAssignments.find((s) => s.endedAt === null) ?? null;

  // T12.5: signed GET URLs computed once here (server-side, already gated
  // by getLotDetail's own requireLotAccess("view", ...) above) — same
  // "render-only-when-present" pattern as Sensory, and the same "no
  // independent RBAC check downstream of an already-gated aggregation"
  // reasoning as getSensoryLinkageForSamples.
  const assetsWithUrls = await Promise.all(
    assets.map(async (asset) => ({ asset, viewUrl: await getSignedUrlForAsset(asset.storageKey) })),
  );

  const currentStage = activeFermentation
    ? t("stageFermenting")
    : activeDrying
      ? t("stageDrying")
      : currentStorage
        ? t("stageInStorage")
        : t(`lotType_${lot.lotType}` as "lotType_cherry");

  type TimelineEntry = { occurredAt: Date; label: string; key: string };
  const timeline: TimelineEntry[] = [
    ...transformations.map((tr) => ({ occurredAt: tr.occurredAt, label: t(`transformationType_${tr.transformationType}` as "transformationType_split"), key: `tr-${tr.id}` })),
    ...quantityEvents.map((qe) => ({ occurredAt: qe.occurredAt, label: `${t(`quantityEventType_${qe.eventType}` as "quantityEventType_received")}: ${qe.quantity.toString()} ${qe.unit}`, key: `qe-${qe.id}` })),
    ...measurements.map((m) => ({ occurredAt: m.occurredAt, label: `${m.variable}: ${m.value.toString()} ${m.unit}`, key: `me-${m.id}` })),
  ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  return (
    <div>
      <Link href="/lots" className="nn-back-link">
        {t("backToLots")}
      </Link>

      <span className="nn-badge">{t(`lotType_${lot.lotType}` as "lotType_cherry")}</span>
      {lot.rejectionCategoryValue ? (
        <span className="nn-badge">{t("rejectBadge", { category: lot.rejectionCategoryValue.value })}</span>
      ) : null}
      <h1 className="nn-code">{lot.lotCode}</h1>
      <p className="nn-detail-meta">
        <span>{t("currentStageLabel", { stage: currentStage })}</span>
        <span>
          {quantity.recorded
            ? t("currentQuantityLabel", {
                quantity: quantity.quantity.toString(),
                unit: quantity.unit ?? t("unitUnknown"),
              })
            : t("quantityNotRecorded")}
        </span>
        {lot.project ? <span>{lot.project.name}</span> : null}
        {lot.location ? <span>{lot.location.name}</span> : null}
        {lot.organization ? <span>{lot.organization.name}</span> : null}
      </p>

      {/* Un aviso, no dieciséis: repetir el motivo junto a cada formulario sería
          ruido en una página de 825 líneas. La trazabilidad se sigue leyendo
          entera —ése es el punto de poder ver el lote—; lo que desaparece es lo
          que el servidor iba a rechazar. */}
      {!puedeRegistrar ? (
        <p className="nn-muted" role="status">
          {t("soloLecturaEnEsteLote")} {t("sinAmbitoGestionBody")}
        </p>
      ) : null}

      <section className="nn-section">
        <h2>{t("originLotHeading")}</h2>
        {lot.location ? (
          <>
            <p className="nn-muted">{t("originLotConditionsIntro")}</p>
            <p className="nn-detail-meta">
              <span>{lot.location.name}</span>
              {lot.location.sunExposure ? (
                <span>
                  {t("sunExposureLabel")}: {t(`sunExposure_${lot.location.sunExposure}` as "sunExposure_full_sun")}
                </span>
              ) : null}
              {lot.location.shadePercentage ? (
                <span>
                  {t("shadePercentageLabel")}:{" "}
                  {t(`shadePercentage_${lot.location.shadePercentage}` as "shadePercentage_pct_20")}
                </span>
              ) : null}
              {lot.location.altitudeMinM != null || lot.location.altitudeMaxM != null ? (
                <span>
                  {t("altitudeRangeLabel")}:{" "}
                  {t("altitudeRangeValue", {
                    min: lot.location.altitudeMinM ?? "?",
                    max: lot.location.altitudeMaxM ?? "?",
                  })}
                </span>
              ) : null}
              {lot.location.slopeDescription ? (
                <span>
                  {t("slopeLabel")}: {lot.location.slopeDescription}
                </span>
              ) : null}
              {lot.location.soilType ? (
                <span>
                  {t("soilTypeLabel")}: {lot.location.soilType}
                </span>
              ) : null}
            </p>
          </>
        ) : (
          <p className="nn-muted">{t("noOriginLot")}</p>
        )}
      </section>

      {harvestEvent ? (
        <section className="nn-section">
          <h2>{t("harvestInfoHeading")}</h2>
          <p className="nn-muted">{t("harvestOccurredAtLabel", { date: cuando(harvestEvent.harvestedAt) })}</p>
          {labourEntries.filter((le) => le.harvestEventId === harvestEvent.id).length > 0 ? (
            <ul>
              {labourEntries
                .filter((le) => le.harvestEventId === harvestEvent.id)
                .map((le) => (
                  <li key={le.id}>{labourEntryLine(le)}</li>
                ))}
            </ul>
          ) : null}
          {puedeRegistrar ? (
            <LabourEntryForm
            claveDeEnvio={clavesDeJornal.harvestEvent}
              lotId={lot.id}
              parent={{ kind: "harvestEvent", harvestEventId: harvestEvent.id }}
              observers={observers}
              selfPersonId={selfPersonId}
              organizations={organizations}
            />
          ) : null}
          {puedeRegistrar ? (
            <PhotoUploadForm lotId={lot.id} parent={{ kind: "harvestEvent", harvestEventId: harvestEvent.id }} observers={observers} selfPersonId={selfPersonId} />
          ) : null}

          {harvestSources ? (
            <>
              <h3>{t("harvestSourcesHeading")}</h3>
              {harvestSources.existing.length > 0 ? (
                <ul className="nn-detail-meta">
                  {harvestSources.existing.map((source) => (
                    <li key={source.id}>
                      {source.location.name}
                      {source.plantingCohort ? ` · ${source.plantingCohort.cultivarValue?.value ?? ""}` : ""}
                      {" — "}
                      {/* Sin peso NO es cero: el bloque aportó y nadie lo pesó
                          aparte, que es el caso normal en un beneficio. */}
                      {source.cherryWeightKg != null
                        ? t("sourceWeightValue", { kg: Number(source.cherryWeightKg) })
                        : t("sourceWeightUnweighed")}
                      {source.notes ? ` · ${source.notes}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="nn-muted">{t("harvestSourcesNone")}</p>
              )}
              {puedeEditarFuentes ? (
                <HarvestSourcesForm
                  lotId={lot.id}
                  harvestEventId={harvestSources.harvestEventId}
                  declaredTotalKg={harvestSources.declaredTotalKg}
                  alreadyRecordedKg={harvestSources.alreadyRecordedKg}
                  // Los dos números que hacen honesta a la diferencia: aportes
                  // guardados sin peso, y aportes que el RBAC oculta. El servicio
                  // los tenía calculados y la pantalla los dejaba caer.
                  sinPesar={harvestSources.existing.filter((s) => s.cherryWeightKg == null).length}
                  ocultos={harvestSources.hiddenContributions}
                  plots={harvestSources.plotLocations.map((plot) => ({
                    id: plot.id,
                    name: plot.name,
                    cohorts: plot.plantingCohorts.map((cohort) => ({
                      id: cohort.id,
                      // Sin conteo NO es «0 plantas»: es que nadie lo contó.
                      // Un 0 aquí se lee como un bloque vacío (ADR-080).
                      label:
                        cohort.plantCount != null
                          ? t("sourceCohortOption", {
                              cultivar: cohort.cultivarValue?.value ?? t("cultivarUnknown"),
                              plants: cohort.plantCount,
                            })
                          : t("sourceCohortOptionNoCount", {
                              cultivar: cohort.cultivarValue?.value ?? t("cultivarUnknown"),
                            }),
                    })),
                  }))}
                />
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {receivingEvent ? (
        <section className="nn-section">
          <h2>{t("receivingInfoHeading")}</h2>
          <p className="nn-muted">{t("receivingOccurredAtLabel", { date: cuando(receivingEvent.receivedAt) })}</p>
          {labourEntries.filter((le) => le.receivingEventId === receivingEvent.id).length > 0 ? (
            <ul>
              {labourEntries
                .filter((le) => le.receivingEventId === receivingEvent.id)
                .map((le) => (
                  <li key={le.id}>{labourEntryLine(le)}</li>
                ))}
            </ul>
          ) : null}
          {puedeRegistrar ? (
            <LabourEntryForm
            claveDeEnvio={clavesDeJornal.receivingEvent}
              lotId={lot.id}
              parent={{ kind: "receivingEvent", receivingEventId: receivingEvent.id }}
              observers={observers}
              selfPersonId={selfPersonId}
              organizations={organizations}
            />
          ) : null}
        </section>
      ) : null}

      {/*
        ADR-096. The five actions used to be one flex row of identical buttons,
        which made the page a list of capabilities rather than a place work
        happens. The action this batch is waiting for is now drawn first and
        solid; the rest stay quiet and remain one click away.

        It suggests, it never restricts — a batch that skips a stage costs the
        operator nothing extra, which is why this was safe to add over a
        sequence the platform cannot actually verify.
      */}
      <div style={{ marginTop: "1rem" }}>
        {suggestedAction ? (
          <p className="nn-muted" style={{ margin: "0 0 0.5rem" }}>{t("suggestedNextLabel")}</p>
        ) : null}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {batchActions.map(({ action, href, label }) => (
            <Link
              key={action}
              href={href}
              className={action === suggestedAction ? "nn-button" : "nn-button-quiet"}
              style={{ textDecoration: "none" }}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Below the actions, not above them: recording the batch's state comes
          first, and the photo is the complement to it (ADR-096). */}
      {puedeRegistrar ? (
        <PhotoUploadForm lotId={lot.id} parent={{ kind: "lot" }} observers={observers} selfPersonId={selfPersonId} />
      ) : null}

      <section className="nn-section">
        <h2>{t("lineageHeading")}</h2>
        <p className="nn-detail-meta">
          <span>{t("ancestorsLabel", { count: lineage.ancestorLotIds.length })}</span>
          <span>{t("descendantsLabel", { count: lineage.descendantLotIds.length })}</span>
        </p>
        {lineage.ancestorLotIds.length > 0 ? (
          <p>
            {t("ancestorsHeading")}:{" "}
            {lineage.ancestorLotIds.map((ancestorId, i) => (
              <span key={ancestorId}>
                {i > 0 ? ", " : ""}
                <Link href={`/lots/${ancestorId}`} className="nn-code">{lineage.lotCodesById.get(ancestorId) ?? ancestorId.slice(0, 8)}</Link>
              </span>
            ))}
          </p>
        ) : null}
        {lineage.descendantLotIds.length > 0 ? (
          <p>
            {t("descendantsHeading")}:{" "}
            {lineage.descendantLotIds.map((descendantId, i) => (
              <span key={descendantId}>
                {i > 0 ? ", " : ""}
                <Link href={`/lots/${descendantId}`} className="nn-code">{lineage.lotCodesById.get(descendantId) ?? descendantId.slice(0, 8)}</Link>
              </span>
            ))}
          </p>
        ) : null}
      </section>

      {outturn ? (
        <section className="nn-section">
          <h2>{t("selectionOutturnHeading")}</h2>
          {outturn.method ? <p className="nn-muted">{t("selectionOutturnMethod", { method: outturn.method })}</p> : null}
          <table className="nn-table" style={{ fontVariantNumeric: "tabular-nums" }}>
            <tbody>
              {outturn.accepted.map((stream) => (
                <tr key={stream.lotId}>
                  <td>{t("selectionOutturnAccepted")}</td>
                  <td><Link href={`/lots/${stream.lotId}`} className="nn-code">{stream.lotCode}</Link></td>
                  <td>{stream.quantity} {stream.unit}</td>
                  <td>{stream.sharePct != null ? t("selectionOutturnShare", { share: stream.sharePct }) : t("selectionOutturnUnknown")}</td>
                </tr>
              ))}
              {outturn.rejected.map((stream) => (
                <tr key={stream.lotId}>
                  <td>{t("selectionOutturnRejected")}{stream.rejectionCategory ? ` — ${stream.rejectionCategory}` : ""}</td>
                  <td><Link href={`/lots/${stream.lotId}`} className="nn-code">{stream.lotCode}</Link></td>
                  <td>{stream.quantity} {stream.unit}</td>
                  <td>{stream.sharePct != null ? t("selectionOutturnShare", { share: stream.sharePct }) : t("selectionOutturnUnknown")}</td>
                </tr>
              ))}
              {outturn.declaredLossQuantity != null ? (
                <tr>
                  <td>{t("selectionOutturnDeclaredLoss")}</td>
                  <td />
                  <td>{outturn.declaredLossQuantity}</td>
                  <td />
                </tr>
              ) : null}
              <tr>
                <td>{t("selectionOutturnUnexplained")}</td>
                <td />
                {/* null is "unknown", never 0 — ADR-080's distinction, and the
                    figure stored at write time rather than recomputed. */}
                <td>{outturn.unexplainedQuantity != null ? outturn.unexplainedQuantity : t("selectionOutturnUnknown")}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      {canSelect && selectionCatalogs ? (
        <section className="nn-section" id="seleccion">
          <h2>{t("selectionHeading")}</h2>
          {puedeRegistrar ? (
            <SelectionForm
              lotId={lot.id}
              lotType={lot.lotType}
              currentQuantity={quantity.recorded ? Number(quantity.quantity) : null}
              unit={quantity.unit ?? "kg"}
              methods={selectionCatalogs.methods}
              categories={selectionCatalogs.categories}
            />
          ) : null}
        </section>
      ) : null}

      <section className="nn-section">
        <h2>{t("processingHeading")}</h2>
        {activeFermentation ? (
          <div className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>{t("activeFermentationHeading")}</h3>
            {/* Placed directly under the run's own heading: this is the
                run's report card, not a separate section (ADR-099). */}
            <TargetComparisonTable rows={targetRows} />
            <p className="nn-muted">{t("startedAtLabel", { date: cuando(activeFermentation.startedAt) })}</p>
            {activeFermentation.interventions.length > 0 ? (
              <ul>
                {activeFermentation.interventions.map((iv) => (
                  <li key={iv.id}>
                    {t(`interventionType_${iv.interventionType}` as "interventionType_agitation")} — {cuando(iv.occurredAt)}
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={recordFermentationInterventionFormAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="fermentationRunId" value={activeFermentation.id} />
              <select name="interventionType" defaultValue="agitation">
                {FERMENTATION_INTERVENTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`interventionType_${type}` as "interventionType_agitation")}
                  </option>
                ))}
              </select>
              <BotonDeEnvio className="nn-button">
                {t("recordInterventionButton")}
              </BotonDeEnvio>
            </form>
            <form action={endFermentationFormAction} className="nn-form" style={{ maxWidth: 420, marginTop: "1rem" }}>
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="fermentationRunId" value={activeFermentation.id} />
              <div className="nn-field">
                <label htmlFor="ferm-output-code">{t("outputLotCodeLabel")}</label>
                <input id="ferm-output-code" name="outputLotCode" type="text" required />
              </div>
              <div className="nn-field">
                <label htmlFor="ferm-output-type">{t("outputLotTypeLabel")}</label>
                <select id="ferm-output-type" name="outputLotType" defaultValue="drying">
                  {LOT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`lotType_${type}` as "lotType_cherry")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="nn-field">
                <label htmlFor="ferm-output-quantity">{t("quantityLabel")}</label>
                <input id="ferm-output-quantity" name="quantity" type="number" inputMode="decimal" step="0.001" />
              </div>
              <div className="nn-field">
                <label htmlFor="ferm-output-unit">{t("unitLabel")}</label>
                <input id="ferm-output-unit" name="unit" type="text" placeholder="kg" />
              </div>
              <BotonDeEnvio className="nn-button">
                {t("endFermentationButton")}
              </BotonDeEnvio>
            </form>
            {puedeRegistrar ? (
              <PhotoUploadForm lotId={lot.id} parent={{ kind: "fermentationRun", fermentationRunId: activeFermentation.id }} observers={observers} selfPersonId={selfPersonId} />
            ) : null}

            {labourEntries.filter((le) => le.fermentationRunId === activeFermentation.id).length > 0 ? (
              <ul>
                {labourEntries
                  .filter((le) => le.fermentationRunId === activeFermentation.id)
                  .map((le) => (
                    <li key={le.id}>{labourEntryLine(le)}</li>
                  ))}
              </ul>
            ) : null}
            {puedeRegistrar ? (
              <LabourEntryForm
            claveDeEnvio={clavesDeJornal.fermentationRun}
                lotId={lot.id}
                parent={{ kind: "fermentationRun", fermentationRunId: activeFermentation.id }}
                observers={observers}
                selfPersonId={selfPersonId}
                organizations={organizations}
              />
            ) : null}

            {materialConsumptionEntries.filter((mc) => mc.fermentationRunId === activeFermentation.id).length > 0 ? (
              <ul>
                {materialConsumptionEntries
                  .filter((mc) => mc.fermentationRunId === activeFermentation.id)
                  .map((mc) => (
                    <li key={mc.id}>{consumptionEntryLine(mc)}</li>
                  ))}
              </ul>
            ) : null}
            {puedeRegistrar ? (
              <MaterialConsumptionForm
                claveDeEnvio={clavesDeConsumo.fermentationRun}
                lotId={lot.id}
                parent={{ kind: "fermentationRun", fermentationRunId: activeFermentation.id }}
              />
            ) : null}
          </div>
        ) : null}

        {activeDrying ? (
          <div className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0 }}>{t("activeDryingHeading")}</h3>
            <p className="nn-muted">{t("startedAtLabel", { date: cuando(activeDrying.startedAt) })}</p>
            {activeDrying.turningEvents.length > 0 ? (
              <ul>
                {activeDrying.turningEvents.map((ev) => (
                  <li key={ev.id}>
                    {t(`turnEventType_${ev.eventType}` as "turnEventType_turned")} — {cuando(ev.occurredAt)}
                  </li>
                ))}
              </ul>
            ) : null}
            <form action={recordDryingTurnFormAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="dryingRunId" value={activeDrying.id} />
              <select name="eventType" defaultValue="turned">
                {DRYING_TURN_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`turnEventType_${type}` as "turnEventType_turned")}
                  </option>
                ))}
              </select>
              <BotonDeEnvio className="nn-button">
                {t("recordTurnButton")}
              </BotonDeEnvio>
            </form>
            <form action={endDryingFormAction} className="nn-form" style={{ maxWidth: 420, marginTop: "1rem" }}>
              <input type="hidden" name="lotId" value={lot.id} />
              <input type="hidden" name="dryingRunId" value={activeDrying.id} />
              <div className="nn-field">
                <label htmlFor="dry-output-code">{t("outputLotCodeLabel")}</label>
                <input id="dry-output-code" name="outputLotCode" type="text" required />
              </div>
              <div className="nn-field">
                <label htmlFor="dry-output-type">{t("outputLotTypeLabel")}</label>
                <select id="dry-output-type" name="outputLotType" defaultValue="green">
                  {LOT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`lotType_${type}` as "lotType_cherry")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="nn-field">
                <label htmlFor="dry-output-quantity">{t("quantityLabel")}</label>
                <input id="dry-output-quantity" name="quantity" type="number" inputMode="decimal" step="0.001" />
              </div>
              <div className="nn-field">
                <label htmlFor="dry-output-unit">{t("unitLabel")}</label>
                <input id="dry-output-unit" name="unit" type="text" placeholder="kg" />
              </div>
              <BotonDeEnvio className="nn-button">
                {t("endDryingButton")}
              </BotonDeEnvio>
            </form>
            {puedeRegistrar ? (
              <PhotoUploadForm lotId={lot.id} parent={{ kind: "dryingRun", dryingRunId: activeDrying.id }} observers={observers} selfPersonId={selfPersonId} />
            ) : null}

            {labourEntries.filter((le) => le.dryingRunId === activeDrying.id).length > 0 ? (
              <ul>
                {labourEntries
                  .filter((le) => le.dryingRunId === activeDrying.id)
                  .map((le) => (
                    <li key={le.id}>{labourEntryLine(le)}</li>
                  ))}
              </ul>
            ) : null}
            {puedeRegistrar ? (
              <LabourEntryForm
            claveDeEnvio={clavesDeJornal.dryingRun}
                lotId={lot.id}
                parent={{ kind: "dryingRun", dryingRunId: activeDrying.id }}
                observers={observers}
                selfPersonId={selfPersonId}
                organizations={organizations}
              />
            ) : null}

            {materialConsumptionEntries.filter((mc) => mc.dryingRunId === activeDrying.id).length > 0 ? (
              <ul>
                {materialConsumptionEntries
                  .filter((mc) => mc.dryingRunId === activeDrying.id)
                  .map((mc) => (
                    <li key={mc.id}>{consumptionEntryLine(mc)}</li>
                  ))}
              </ul>
            ) : null}
            {puedeRegistrar ? (
              <MaterialConsumptionForm
                claveDeEnvio={clavesDeConsumo.dryingRun}
                lotId={lot.id}
                parent={{ kind: "dryingRun", dryingRunId: activeDrying.id }}
              />
            ) : null}
          </div>
        ) : null}

        {currentStorage ? (
          <p className="nn-muted">{t("currentStorageLabel", { location: currentStorage.location.name })}</p>
        ) : null}

        {!activeFermentation && !activeDrying && !currentStorage ? <p className="nn-muted">{t("noProcessing")}</p> : null}
      </section>

      <section className="nn-section" id="measurements">
        <h2>{t("measurementsHeading")}</h2>
        {measurements.length === 0 ? (
          <p className="nn-muted">{t("noMeasurements")}</p>
        ) : (
          <ul>
            {measurements.map((m) => {
              // Reemplazada = existe otra medición que la corrige. Se deriva de
              // la misma lista, así que una cadena de correcciones se resuelve
              // sola: sólo la última queda sin marcar.
              const reemplazada = supersededMeasurementIds.has(m.id);
              return (
                <li key={m.id}>
                  <span style={reemplazada ? { textDecoration: "line-through" } : undefined}>
                    {m.variable}: {m.value.toString()} {m.unit} — {cuando(m.occurredAt)}
                  </span>
                  {m.correctsId ? ` (${t("correctionLabel")})` : ""}
                  {/* La tachadura sola no basta: no se ve en un lector de
                      pantalla ni en blanco y negro. El texto lo dice. */}
                  {reemplazada ? <> · <strong>{t("supersededLabel")}</strong></> : null}
                  {puedeRegistrar ? (
                    <PhotoUploadForm lotId={lot.id} parent={{ kind: "measurement", measurementId: m.id }} observers={observers} selfPersonId={selfPersonId} />
                  ) : null}
                  {/* Sólo se corrige lo vigente. Corregir una lectura ya
                      corregida bifurcaría el historial, y el servicio lo
                      rechaza; la página no ofrece lo que sería rechazado. */}
                  {!reemplazada ? (
                    <details>
                      <summary>{t("correctionSummary")}</summary>
                      {puedeRegistrar ? (
                        <MeasurementCorrectionForm
                          lotId={lot.id}
                          measurement={{
                            id: m.id,
                            variable: m.variable,
                            value: m.value.toString(),
                            unit: m.unit,
                            occurredAt: m.occurredAt.toISOString(),
                            provenanceClass: m.provenanceClass,
                          }}
                        />
                      ) : null}
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {puedeRegistrar ? (
          <MeasurementForm
            claveDeEnvio={claveDeMedicion}
            lotId={lot.id}
            observers={observers}
            selfPersonId={selfPersonId}
            fermentationRunId={activeFermentation?.id ?? null}
            dryingRunId={activeDrying?.id ?? null}
            storageAssignmentId={currentStorage?.id ?? null}
          />
        ) : null}
      </section>

      <section className="nn-section">
        <h2>{t("timelineHeading")}</h2>
        {timeline.length === 0 ? (
          <p className="nn-muted">{t("noTimeline")}</p>
        ) : (
          <ul>
            {timeline.map((entry) => (
              <li key={entry.key}>
                {cuando(entry.occurredAt)} — {entry.label}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("samplesHeading")}</h2>
        {samples.length === 0 ? (
          <p className="nn-muted">{t("noSamples")}</p>
        ) : (
          <ul>
            {samples.map((s) => (
              <li key={s.id}>
                {s.sampleCode} ({s.sampleType})
                {puedeRegistrar ? (
                  <PhotoUploadForm lotId={lot.id} parent={{ kind: "sample", sampleId: s.id }} observers={observers} selfPersonId={selfPersonId} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {samples.some((s) => sensoryLinkage[s.id]?.length) ? (
        <section className="nn-section">
          <h2>{t("sensoryHeading")}</h2>
          <ul>
            {samples.flatMap((s) =>
              (sensoryLinkage[s.id] ?? []).map((entry) => (
                <li key={`${s.id}-${entry.sessionId}`}>
                  {s.sampleCode} — {entry.sessionName}
                  {entry.overallResult ? (
                    <>
                      : {t("sensoryOverallScoreLabel", { mean: entry.overallResult.meanValue, count: entry.overallResult.responseCount })}
                    </>
                  ) : (
                    <> — {t("sensoryAwaitingResultLabel")}</>
                  )}
                </li>
              )),
            )}
          </ul>
        </section>
      ) : null}

      {assetsWithUrls.length > 0 ? (
        <section className="nn-section">
          <h2>{t("photosHeading")}</h2>
          <ul style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", listStyle: "none", padding: 0 }}>
            {assetsWithUrls.map(({ asset, viewUrl }) => (
              <li key={asset.id}>
                {asset.assetType === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL, not a static/optimizable Next asset
                  <img src={viewUrl} alt="" style={{ width: 160, height: 160, objectFit: "cover", borderRadius: 4 }} />
                ) : (
                  <a href={viewUrl}>{asset.originalFilename ?? asset.id}</a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {lot.projectId ? (
        <section className="nn-section">
          <h2>{t("tasksHeading")}</h2>
          {tasks.length === 0 ? (
            <p className="nn-muted">{t("noTasks")}</p>
          ) : (
            <ul>
              {tasks.map((task) => (
                <li key={task.id}>{task.title}</li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="nn-section">
        <h2>{t("historyHeading")}</h2>
        {auditEvents.length === 0 ? (
          <p className="nn-muted">{t("noHistory")}</p>
        ) : (
          <ul>
            {auditEvents.map((ev) => (
              <li key={ev.id}>
                {ev.operation} — {cuando(ev.occurredAt)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
