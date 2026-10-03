import Link from "next/link";
import { puedeSubdividirParcela } from "../../../../lib/traceability/fincas";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getPlotDetail } from "../../../../lib/traceability/plantingCohorts";
import { getObserverCandidates } from "../../../../lib/traceability/lots";
import { puedeGestionarAtributosDeUbicacion, LocationAccessError } from "../../../../lib/traceability/locations";
import { listSoilProfilesForLocation } from "../../../../lib/traceability/soilProfiles";
import { estadosPorCohorte } from "../../../../lib/traceability/estadoDeProduccion";
import { recortarPorPrecision } from "../../../../lib/time/recortarPorPrecision";
import { PlantingCohortForm } from "../../../components/traceability/PlantingCohortForm";
import { PlotAttributesForm } from "../../../components/traceability/PlotAttributesForm";
import { RejillaForm } from "../../../components/traceability/RejillaForm";
import { RangosDeBloqueForm } from "../../../components/traceability/RangosDeBloqueForm";
import { SoilProfileForm } from "../../../components/traceability/SoilProfileForm";
import { MarcarEnProduccionForm } from "../../../components/traceability/MarcarEnProduccionForm";
import { listPlotBlocks, claveDeTituloDeBloque } from "../../../../lib/traceability/plotBlocks";
import { productosFitosanitariosSiPuede } from "../../../../lib/traceability/intervenciones";
import { AltaDeBloqueForm } from "../../../components/traceability/AltaDeBloqueForm";
import { AsignarTipoDeBloqueForm } from "../../../components/traceability/AsignarTipoDeBloqueForm";
import { AltaDeTrampaForm } from "../../../components/traceability/AltaDeTrampaForm";
import { RevisionDeTrampaForm } from "../../../components/traceability/RevisionDeTrampaForm";
import { ReglaDeTrampasForm } from "../../../components/traceability/ReglaDeTrampasForm";

export const dynamic = "force-dynamic";

/**
 * Gestionar una parcela — tablero de parcela, spec §6.
 *
 * Sólo formularios de gestión. Lo que se hace en campo —iniciar una jornada,
 * registrar una muestra, describir una calicata— se queda en el tablero.
 * Misma compuerta que el tablero (`getPlotDetail`), y cuelga de `/plots`, así
 * que hereda `FieldSyncControls` del layout y la carga sin red del service
 * worker.
 */
export default async function PlotSettingsPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { location, cohorts, cultivarOptions, eventosDeProduccion, trampas, reglaDeTrampas, farmLocationId } = detail;
  // Spec fincas y parcelas §3.3, regla de `main` sin cambios: el enlace se
  // ofrece sobre cualquier Location `plot` con `manage_attributes` (ya
  // exigido por `getPlotDetail` arriba, la misma comprobación de
  // `crearMicroparcelaAction`). Una microparcela creada por `createMicrolot`
  // ES `plot` —copia el tipo de su padre—, así que esta regla también deja
  // subdividirla otra vez: el spec no lo prohíbe y `createMicrolot` no tiene
  // tope de profundidad.
  // El MISMO predicado que la ficha de la parcela y que `createMicrolot`: antes bastaba con que el
  // lugar fuera una parcela, así que el botón aparecía también a quien el servidor iba a negar.
  const puedeSubdividir = await puedeSubdividirParcela(user.userAccountId, location.id);
  // **La regla de trampas se comprueba sobre la FINCA, no sobre esta parcela**, y por eso necesita su
  // propia bandera. `guardarReglaDeTrampas` llama a `requireLocationAttributeAccess` con
  // `input.farmLocationId` (`lib/traceability/trapRules.ts`), así que quien tenga
  // `location:manage_attributes` sobre la parcela y no sobre la finca —un operario asignado a una
  // parcela suelta— veía el formulario, lo rellenaba y se lo rechazaba el servidor.
  //
  // Es la misma forma que esta página ya corrigió para `puedeSubdividir`, y su comentario lo dice:
  // «antes bastaba con que el lugar fuera una parcela, así que el botón aparecía también a quien el
  // servidor iba a negar». Aquí faltaba la mitad del objetivo: el permiso es el mismo, el SITIO no.
  //
  // La regla vigente se sigue mostrando: verla no exige nada que no exija entrar en esta página, y
  // esconderla quitaría información que la persona sí puede leer. Lo que se oculta es el formulario.
  const puedeEditarLaReglaDeTrampas = farmLocationId
    ? await puedeGestionarAtributosDeUbicacion(user.userAccountId, farmLocationId)
    : false;
  const activas = cohorts.filter((c) => c.status === "active");
  const estados = estadosPorCohorte(activas.map((c) => c.id), eventosDeProduccion);
  // Ronda 1: `location:manage_attributes` (lo que exige esta página) y
  // `lot:view` (lo que exige el selector) son permisos distintos sobre
  // ámbitos que NO se implican entre sí — un ámbito alcanza sus
  // descendientes, nunca sus ancestros —, así que alguien con permiso sólo
  // sobre la parcela puede entrar aquí y no tener `lot:view` en la finca.
  // `productosFitosanitariosSiPuede` no lanza en ese caso: sin permiso, el
  // selector sale vacío en vez de reventar la página entera. `farmLocationId`
  // ya viene de `detail` (resuelto por `resolveFarmSiteId`, el sitio
  // antepasado): no se recalcula aquí con `parentLocation?.id ?? location.id`.
  const [calicatas, bloques, { people, selfPersonId }, productosDeLaFinca] = await Promise.all([
    listSoilProfilesForLocation(user.userAccountId, id),
    listPlotBlocks(user.userAccountId, id),
    getObserverCandidates(user.userAccountId, [{ locationId: id }]),
    productosFitosanitariosSiPuede(user.userAccountId, farmLocationId),
  ]);

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${location.id}`}>{t("plotDashboardBackLink")}</Link>
      </p>
      <h1>{t("plotDashboardSettingsTitle", { name: location.name })}</h1>

      {puedeSubdividir ? (
        <p>
          <Link href={`/plots/${location.id}/microparcela/nueva`} className="nn-button">
            {tf("nuevaMicroparcelaTitulo")}
          </Link>
        </p>
      ) : null}

      <section className="nn-section" id="siembras">
        <h2>{t("plotDashboardCohortsHeading")}</h2>
        {activas.length === 0 ? <p className="nn-muted">{t("noCohorts")}</p> : null}
        {activas.map((cohort) => {
          const estado = estados.get(cohort.id);
          return (
            <article key={cohort.id} className="nn-card">
              <h3>
                {cohort.cultivarValue?.value ?? t("cultivarUnknown")}
                {" · "}
                {cohort.plantCount ?? <span className="nn-muted">{t("notRecorded")}</span>}
                {" · "}
                {cohort.plantedAt ? (
                  recortarPorPrecision(cohort.plantedAt.toISOString(), cohort.plantedPrecision ?? "year")
                ) : (
                  <span className="nn-muted">{t("plantedUnknown")}</span>
                )}
              </h3>
              <p className="nn-detail-meta">
                {estado?.estado === "en_produccion" ? (
                  <>
                    {t("plotDashboardProductionSince", {
                      fecha: recortarPorPrecision(estado.desde.toISOString(), estado.precision ?? "date"),
                    })}
                    {/* R12: cómo se sabe esa fecha, con la misma forma que la
                        procedencia de la siembra de debajo. */}
                    {" · "}
                    {t(`provenanceClass_${estado.provenanceClass}` as "provenanceClass_direct_observation")}
                    {estado.dataQuality ? (
                      <>
                        {" · "}
                        <strong>{t(`dataQuality_${estado.dataQuality}` as "dataQuality_provisional")}</strong>
                      </>
                    ) : null}
                  </>
                ) : (
                  <strong>{t("plotDashboardProductionUnmarked")}</strong>
                )}
              </p>
              <p className="nn-detail-meta">
                {t(`provenanceClass_${cohort.provenanceClass}` as "provenanceClass_direct_observation")}
                {cohort.dataQuality ? (
                  <>
                    {" · "}
                    <strong>{t(`dataQuality_${cohort.dataQuality}` as "dataQuality_provisional")}</strong>
                  </>
                ) : null}
              </p>
              {cohort.notes ? <p className="nn-detail-meta">{cohort.notes}</p> : null}
              <details>
                <summary>{t("plotDashboardMarkProductionSummary")}</summary>
                <MarcarEnProduccionForm cohortId={cohort.id} />
              </details>
              <details>
                <summary>
                  {t("cohortEditSummary", { cultivar: cohort.cultivarValue?.value ?? t("cultivarUnknown") })}
                </summary>
                <PlantingCohortForm
                  locationId={location.id}
                  cultivars={cultivarOptions}
                  cohort={{
                    id: cohort.id,
                    cultivarValueId: cohort.cultivarValueId,
                    plantCount: cohort.plantCount,
                    plantedAt: cohort.plantedAt ? cohort.plantedAt.toISOString() : null,
                    plantedPrecision: cohort.plantedPrecision,
                    dataQuality: cohort.dataQuality,
                    notes: cohort.notes,
                  }}
                />
              </details>
            </article>
          );
        })}
        <details>
          <summary>{t("cohortCreateSummary")}</summary>
          <PlantingCohortForm locationId={location.id} cultivars={cultivarOptions} />
        </details>
      </section>

      <section className="nn-section" id="condiciones">
        <h2>{t("groundConditionsHeading")}</h2>
        <PlotAttributesForm
          locationId={location.id}
          attributes={{
            // Decimal como cadena: `Number()` sobre Decimal(10,4) puede redondear.
            areaHectares: location.areaHectares?.toString() ?? null,
            plantSpacingMeters: location.plantSpacingMeters?.toString() ?? null,
            altitudeMinM: location.altitudeMinM,
            altitudeMaxM: location.altitudeMaxM,
            sunExposure: location.sunExposure,
            shadePercentage: location.shadePercentage,
            slopeDescription: location.slopeDescription,
            aspect: location.aspect,
            soilType: location.soilType,
          }}
        />
      </section>

      {/* La rejilla va en su propia sección y no dentro de las condiciones del
          terreno: son la numeración del suelo, no una propiedad suya, y de ella
          cuelgan los rangos de los bloques de más abajo. */}
      <section className="nn-section" id="rejilla">
        <h2>{t("rejillaHeading")}</h2>
        <RejillaForm
          locationId={location.id}
          rejilla={{
            gridOrigin: location.gridOrigin,
            rowCount: location.rowCount,
            plantsPerRow: location.plantsPerRow,
            // Decimal como cadena, igual que el área: `Number()` sobre un
            // Decimal(5,2) puede redondear.
            rowSpacingMeters: location.rowSpacingMeters?.toString() ?? null,
          }}
        />
      </section>

      <section className="nn-section" id="calicatas">
        <h2>{t("soilProfileHeading")}</h2>
        {calicatas.length === 0 ? <p className="nn-muted">{t("soilNoProfiles")}</p> : null}
        {calicatas.map((c) => (
          <details key={c.id}>
            <summary>
              {t("soilCorrectHeading")} · {c.describedAt.toISOString().slice(0, 10)}
            </summary>
            <SoilProfileForm
              locationId={location.id}
              values={{
                id: c.id,
                describedAt: c.describedAt.toISOString().slice(0, 10),
                pitDepthCm: c.pitDepthCm,
                rootingDepthCm: c.rootingDepthCm,
                rootDistribution: c.rootDistribution,
                mottling: c.mottling,
                greyColours: c.greyColours,
                rootChannelConcretions: c.rootChannelConcretions,
                sourSmell: c.sourSmell,
                impedingLayerDepthCm: c.impedingLayerDepthCm,
                impedingLayerNote: c.impedingLayerNote,
                provenanceClass: c.provenanceClass,
                dataQuality: c.dataQuality,
                notes: c.notes,
              }}
            />
          </details>
        ))}
      </section>

      <section className="nn-section" id="bloques">
        <h2>{t("blocksTitle")}</h2>
        {bloques.length === 0 ? (
          <p className="nn-muted">{t("blocksNone")}</p>
        ) : (
          <ul className="nn-detail-meta">
            {bloques.map((b) => (
              <li key={b.id} className="nn-card">
                <strong>
                  {claveDeTituloDeBloque(b.blockType) ? t(claveDeTituloDeBloque(b.blockType)!, { name: b.name }) : b.name}
                </strong>
                {b.notes ? <span className="nn-muted"> · {b.notes}</span> : null}
                {b.description ? <p className="nn-muted">{b.description}</p> : null}
                {b.blockType == null ? (
                  <AsignarTipoDeBloqueForm locationId={location.id} plotBlockId={b.id} />
                ) : null}
                <details>
                  <summary>{t("rejillaRangosDeBloqueTitulo")}</summary>
                  <RangosDeBloqueForm
                    locationId={location.id}
                    plotBlockId={b.id}
                    rangos={b.rangos}
                  />
                </details>
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary>{t("blockNewTitle")}</summary>
          <AltaDeBloqueForm locationId={location.id} />
        </details>
      </section>

      <section className="nn-section" id="trampas">
        <h2>{t("trapsTitle")}</h2>
        {trampas.length === 0 ? <p className="nn-muted">{t("trapsNone")}</p> : null}
        {/* La configuración (qué trampas hay y en qué bloque) y, para cada
            trampa ACTIVA, un camino de transcripción con procedencia y
            observador elegibles (spec §4.2) — para quien pasa notas de papel
            de otra persona a la aplicación, no para quien mira la tela en el
            campo. Ese camino corto, con provenance/observador fijos al
            propio operario, vive en la ronda (`/finca/trampas/ronda`), no
            aquí. Ruling del controlador, Tarea 10 fix round 1: restaura
            `RevisionDeTrampaForm`, que el commit anterior había dejado sin
            ningún sitio de montaje. */}
        {trampas.length > 0 ? (
          <ul className="nn-detail-meta">
            {trampas.map((trampa) => (
              <li key={trampa.id}>
                {trampa.trapNumber != null ? t("trapsNumber", { n: trampa.trapNumber }) : t("notRecorded")}
                {" · "}
                {trampa.bloque ? (
                  claveDeTituloDeBloque(trampa.bloque.blockType) != null
                    ? t(claveDeTituloDeBloque(trampa.bloque.blockType)!, { name: trampa.bloque.name })
                    : trampa.bloque.name
                ) : (
                  t("trapsNoBlock")
                )}
                {trampa.status === "active" ? (
                  <details>
                    <summary>{t("trapCheckTranscribedSummary")}</summary>
                    <RevisionDeTrampaForm
                      locationId={location.id}
                      specimenId={trampa.id}
                      people={people}
                      selfPersonId={selfPersonId}
                    />
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <details>
          <summary>{t("trapNewTitle")}</summary>
          <AltaDeTrampaForm locationId={location.id} bloques={bloques.map((b) => ({ id: b.id, name: b.name }))} />
        </details>
      </section>

      {/* La regla es de la FINCA —el sitio antepasado, no el padre inmediato:
          una microparcela tiene por padre la parcela, no la finca. La misma
          clave que usa `createTrap` (`resolveFarmSiteId`, `fincas.ts`), así
          que vale para todas las parcelas y microparcelas de la finca. */}
      <section className="nn-section" id="regla-trampas">
        <h2>{t("trapRuleTitle")}</h2>
        <p className="nn-muted">{t("trapRuleIntro")}</p>
        {reglaDeTrampas ? (
          <p className="nn-detail-meta">
            {t("trapRuleCurrent", {
              lectura: t(`trapsLevel_${reglaDeTrampas.triggerLevel}`),
              normal: reglaDeTrampas.normalDays,
              alerta: reglaDeTrampas.alertDays,
              accion: reglaDeTrampas.suggestedAction,
            })}
          </p>
        ) : (
          <p className="nn-muted">{t("trapRuleNone")}</p>
        )}
        {puedeEditarLaReglaDeTrampas ? (
          <ReglaDeTrampasForm
            locationId={location.id}
            farmLocationId={farmLocationId}
            regla={reglaDeTrampas}
            productos={productosDeLaFinca}
          />
        ) : null}
      </section>
    </div>
  );
}
