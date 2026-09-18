import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { mostrarInstante, mostrarFecha } from "../../../lib/time/mostrarInstante";
import { getCurrentUser } from "../../../lib/auth/session";
import { getPlotDetail } from "../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../lib/traceability/locations";
import { SoilProfileForm } from "../../components/traceability/SoilProfileForm";
import { LandPhotoUploadForm } from "../../components/traceability/LandPhotoUploadForm";
import { listLandAssets } from "../../../lib/traceability/landMedia";
import { SoilSampleForm, FoliarSampleForm } from "../../components/traceability/SampleForms";
import { LabMeasurementForm } from "../../components/traceability/LabMeasurementForm";
import { listVariableDefinitions } from "../../../lib/traceability/units";
import { listSamplesForLocation, camposDeProtocoloQueFaltan } from "../../../lib/traceability/soilSamples";
import { listSoilProfilesForLocation, computeAnaerobicSignals } from "../../../lib/traceability/soilProfiles";
import { listFieldSessions } from "../../../lib/traceability/fieldSessions";
import { getObserverCandidates } from "../../../lib/traceability/lots";
import { FieldSessionStartForm } from "../../components/traceability/FieldSessionForms";
import { estadosPorCohorte } from "../../../lib/traceability/estadoDeProduccion";
import { cifrasDelLote } from "../../../lib/traceability/cifrasDelLote";
import { diaDeHoy } from "../../../lib/time/diaDeHoy";
import { pendienteDeLaParcela, enlaceDelAviso, type Aviso } from "../../../lib/traceability/pendienteDeLaParcela";
import { ubicacionesEmparentadas } from "../../../lib/traceability/ubicacionesEmparentadas";
import { intervencionesVigentes } from "../../../lib/traceability/intervenciones";

export const dynamic = "force-dynamic";

/**
 * El tablero de una parcela — spec `2026-09-16-tablero-de-parcela-design.md`.
 *
 * Arriba, cómo está el lote y qué hay pendiente. Plegado, lo que no cambia a
 * diario: condiciones y muestras. La gestión vive en `/plots/[id]/ajustes`.
 *
 * Sigue valiendo la regla de antes: la página enseña lo que FALTA tanto como lo
 * registrado. Todo bloque de Finca Rosina tiene siembras y no área, así que la
 * densidad no se puede calcular, y eso sale con su motivo, no en blanco.
 */
export default async function PlotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");

  let detail;
  try {
    detail = await getPlotDetail(user.userAccountId, id);
  } catch (error) {
    // Not "forbidden": a block this user may not read is a block that, for
    // them, is not there. Distinguishing the two would confirm it exists.
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }

  const { location, cohorts, density, organizationName, eventosDeProduccion } = detail;
  const rendimiento = detail.yield;
  const [jornadas, { people, selfPersonId }, calicatas] = await Promise.all([
    listFieldSessions(user.userAccountId, id),
    getObserverCandidates(user.userAccountId),
    listSoilProfilesForLocation(user.userAccountId, id),
  ]);
  const muestras = await listSamplesForLocation(user.userAccountId, id);
  const fotos = await listLandAssets(user.userAccountId, id);
  // La parcela ve también las intervenciones de su microparcela y de su parcela
  // madre — igual que la cosecha, spec §3.3.
  const intervenciones = await intervencionesVigentes(await ubicacionesEmparentadas(id));

  const activas = cohorts.filter((c) => c.status === "active");
  const estados = estadosPorCohorte(activas.map((c) => c.id), eventosDeProduccion);
  const cifras = cifrasDelLote(activas, estados);
  const ahora = new Date();
  const pendiente = pendienteDeLaParcela({
    hoy: diaDeHoy(ahora, location.timezone),
    areaHectares: location.areaHectares == null ? null : Number(location.areaHectares),
    cohortesActivas: activas,
    estados,
    jornadas,
    muestrasDeSuelo: muestras.soil.map((m) => ({ sampledAt: m.sampledAt, resultados: m.measurements.length })),
    muestrasFoliares: muestras.foliar.map((m) => ({ sampledAt: m.sampledAt, resultados: m.measurements.length })),
    ahora,
    intervenciones,
  });
  const ultimoAnio = rendimiento.status === "ok" ? rendimiento.years[0] : undefined;

  const lineaDeJornada = (j: (typeof jornadas)[number]) => (
    <li key={j.id}>
      <Link href={`/field-sessions/${j.id}`}>{mostrarInstante(j.startedAt, location.timezone)}</Link>
      {" · "}
      {j.operator.displayName}
      {" · "}
      {t("fieldSessionEventCount", { count: j._count.events })}
      {j.endedAt == null ? <> · <strong>{t("fieldSessionOpen")}</strong></> : null}
    </li>
  );

  const textoDelAviso = (aviso: Aviso): string => {
    switch (aviso.tipo) {
      case "jornada_sin_cerrar":
        return t("plotDashboardAlertOpenSession", { fecha: mostrarFecha(aviso.startedAt, location.timezone) });
      case "muestreo_vencido": {
        const muestra = t(aviso.muestra === "suelo" ? "plotDashboardSamplingSoil" : "plotDashboardSamplingFoliar");
        return aviso.ultimo == null
          ? t("plotDashboardAlertSamplingNever", { muestra })
          : t("plotDashboardAlertSamplingDue", { muestra, fecha: aviso.ultimo });
      }
      case "muestras_sin_resultado":
        return t("plotDashboardAlertAwaitingResults", { suelo: aviso.suelo, foliar: aviso.foliar });
      case "sin_area":
        return t("plotDashboardAlertNoArea");
      case "area_no_valida":
        return t("plotDashboardAlertBadArea");
      case "siembras_sin_conteo":
        return t("plotDashboardAlertNoCount", { n: aviso.n });
      case "siembras_sin_marcar":
        return t("plotDashboardAlertUnmarked", { n: aviso.n });
      case "reentrada_vigente":
        return t("plotDashboardAlertReentry", { hasta: mostrarInstante(aviso.hasta, location.timezone) });
      case "carencia_vigente":
        return t("plotDashboardAlertWithdrawal", { fecha: mostrarFecha(aviso.hasta, location.timezone), dias: aviso.dias });
      case "carencia_no_declarada":
        return t("plotDashboardAlertWithdrawalUnknown", {
          fecha: aviso.alMenosHasta == null ? t("notRecorded") : mostrarFecha(aviso.alMenosHasta, location.timezone),
        });
      case "reentrada_no_declarada":
        return t("plotDashboardAlertReentryUnknown", {
          fecha: aviso.alMenosHasta == null ? t("notRecorded") : mostrarFecha(aviso.alMenosHasta, location.timezone),
        });
    }
  };

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href="/plots">{t("backToPlots")}</Link>
      </p>

      <span className="nn-badge">{t("badge")}</span>
      <h1>{location.name}</h1>
      {organizationName ? <p className="nn-detail-meta">{organizationName}</p> : null}
      {location.description ? <p className="nn-muted">{location.description}</p> : null}
      <p>
        <Link href={`/plots/${location.id}/ajustes`} className="nn-button">
          {t("plotDashboardManageLink")}
        </Link>
      </p>

      <section className="nn-section">
        <h2>{t("plotDashboardStatusHeading")}</h2>
        <div className="nn-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <article className="nn-card">
            <h3>{t("plotDashboardPlantsLabel")}</h3>
            {activas.length === 0 ? (
              <p className="nn-muted">{t("noCohorts")}</p>
            ) : (
              <>
                <p style={{ fontVariantNumeric: "tabular-nums", fontSize: "1.25rem" }}>
                  {/* ADR-080: un conteo ausente no suma 0 en silencio. Sin
                      ninguna planta conocida, «al menos 0» sería un cero
                      inventado: se dice cuántas siembras no tienen conteo,
                      igual que en la tarjeta «Variedades». */}
                  {cifras.plantasConocidas === 0 && cifras.cohortesSinConteo > 0 ? (
                    <span className="nn-muted">{t("plotDashboardAlertNoCount", { n: cifras.cohortesSinConteo })}</span>
                  ) : cifras.cohortesSinConteo > 0 ? (
                    t("plotDashboardPlantsAtLeast", { n: cifras.plantasConocidas, cohorts: cifras.cohortesSinConteo })
                  ) : (
                    t("plotDashboardPlantsTotal", { n: cifras.plantasConocidas })
                  )}
                </p>
                <p className="nn-detail-meta">
                  {/* Lo mismo por estado. Un 0 sólo sale cuando no hay NINGUNA
                      siembra en ese estado, que sí es un cero sabido. */}
                  {cifras.enProduccionSinConteo === 0
                    ? t("plotDashboardPlantsInProduction", { n: cifras.enProduccion })
                    : cifras.enProduccion === 0
                      ? t("plotDashboardPlantsInProductionNoCount", { cohorts: cifras.enProduccionSinConteo })
                      : t("plotDashboardPlantsInProductionAtLeast", { n: cifras.enProduccion })}
                  {" · "}
                  {cifras.sinMarcarSinConteo === 0
                    ? t("plotDashboardPlantsUnmarked", { n: cifras.sinMarcar })
                    : cifras.sinMarcar === 0
                      ? t("plotDashboardPlantsUnmarkedNoCount", { cohorts: cifras.sinMarcarSinConteo })
                      : t("plotDashboardPlantsUnmarkedAtLeast", { n: cifras.sinMarcar })}
                </p>
              </>
            )}
          </article>

          <article className="nn-card">
            <h3>{t("plotDashboardVarietiesLabel")}</h3>
            {cifras.variedades.length === 0 ? (
              <p className="nn-muted">{t("noCohorts")}</p>
            ) : (
              <ul className="nn-detail-meta">
                {cifras.variedades.map((v) => (
                  <li key={v.nombre ?? "desconocida"}>
                    {v.nombre ?? t("cultivarUnknown")}:{" "}
                    {/* ADR-080: si no hay ninguna planta CONOCIDA y sí hay
                        siembras sin conteo, «0 plantas» sería un cero
                        inventado para un dato que no se sabe. */}
                    {v.plantas === 0 && v.cohortesSinConteo > 0 ? (
                      <span className="nn-muted">{t("plotDashboardAlertNoCount", { n: v.cohortesSinConteo })}</span>
                    ) : (
                      <>
                        {t("plotDashboardPlantsTotal", { n: v.plantas })}
                        {v.cohortesSinConteo > 0 ? (
                          <span className="nn-muted"> · {t("plotDashboardAlertNoCount", { n: v.cohortesSinConteo })}</span>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="nn-card">
            <h3>{t("densityHeading")}</h3>
            {density.status === "ok" ? (
              <>
                <p style={{ fontVariantNumeric: "tabular-nums", fontSize: "1.25rem" }}>
                  {t("densityValue", { plants: density.plantsPerHectare })}
                </p>
                <p className="nn-detail-meta">
                  {t("densityBasis", { plants: density.totalPlants, hectares: density.hectares })}
                </p>
              </>
            ) : (
              <p className="nn-muted">
                {density.status === "sin_area"
                  ? t("densityMissingArea")
                  : density.status === "area_no_positiva"
                    ? t("densityBadArea")
                    : density.status === "conteo_incompleto"
                      ? t("densityMissingCount", { cohorts: density.cohortesSinConteo })
                      : t("densityNoCohorts")}
              </p>
            )}
            {/* Dicho para que nadie busque una columna guardada que está vacía
                a propósito: se calcula al leer, nunca se escribe en
                `PlantingCohort.densityPerHectare`. */}
            <p className="nn-detail-meta">{t("densityComputedNote")}</p>
          </article>

          <article className="nn-card">
            {ultimoAnio ? (
              <>
                <h3>{t("plotDashboardYieldLabel", { year: ultimoAnio.year })}</h3>
                <p style={{ fontVariantNumeric: "tabular-nums", fontSize: "1.25rem" }}>
                  {ultimoAnio.weighedKg != null ? (
                    t("sourceWeightValue", { kg: ultimoAnio.weighedKg })
                  ) : (
                    <span className="nn-muted">{t("yieldNothingWeighed")}</span>
                  )}
                </p>
                <p className="nn-detail-meta">
                  {ultimoAnio.kgPerHectare != null
                    ? t("yieldPerHectareValue", { kg: ultimoAnio.kgPerHectare })
                    : t("yieldMissingArea")}
                  {ultimoAnio.unweighedContributions > 0 ? (
                    <> · {t("yieldUnweighedNote", { count: ultimoAnio.unweighedContributions })}</>
                  ) : null}
                </p>
              </>
            ) : (
              <>
                <h3>{t("yieldHeading")}</h3>
                <p className="nn-muted">{t("yieldNoHarvests")}</p>
              </>
            )}
          </article>
        </div>

        {rendimiento.status === "ok" ? (
          <details>
            <summary>{t("plotDashboardYieldByYear")}</summary>
            <div style={{ overflowX: "auto" }}>
              <table className="nn-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.75rem 0.4rem 0" }}>{t("yieldYearLabel")}</th>
                    <th style={{ textAlign: "right", padding: "0.4rem 0.75rem" }}>{t("yieldWeighedLabel")}</th>
                    <th style={{ textAlign: "right", padding: "0.4rem 0 0.4rem 0.75rem" }}>{t("yieldPerHectareLabel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rendimiento.years.map((y) => (
                    <tr key={y.year}>
                      <td style={{ padding: "0.4rem 0.75rem 0.4rem 0" }}>{y.year}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", padding: "0.4rem 0.75rem" }}>
                        {y.weighedKg != null ? (
                          t("sourceWeightValue", { kg: y.weighedKg })
                        ) : (
                          <span className="nn-muted">{t("yieldNothingWeighed")}</span>
                        )}
                        {y.unweighedContributions > 0 ? (
                          // El total es un MÍNIMO. Sin esto, un número más bajo
                          // de lo real se leería como medido.
                          <>
                            <br />
                            <span className="nn-muted">
                              {t("yieldUnweighedNote", { count: y.unweighedContributions })}
                            </span>
                          </>
                        ) : null}
                      </td>
                      <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", padding: "0.4rem 0 0.4rem 0.75rem" }}>
                        {y.kgPerHectare != null ? (
                          <strong>{t("yieldPerHectareValue", { kg: y.kgPerHectare })}</strong>
                        ) : (
                          <span className="nn-muted">{t("yieldMissingArea")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="nn-detail-meta">{t("yieldComputedNote")}</p>
          </details>
        ) : null}
      </section>

      <section className="nn-section">
        <h2>{t("plotDashboardPendingHeading")}</h2>
        {pendiente.tocaHacer.length + pendiente.faltaUnDato.length === 0 ? (
          <p className="nn-muted">{t("plotDashboardPendingNone")}</p>
        ) : (
          <>
            {pendiente.tocaHacer.length > 0 ? (
              <>
                <h3>{t("plotDashboardToDo")}</h3>
                <ul>
                  {pendiente.tocaHacer.map((aviso, i) => (
                    <li key={`toca-${i}`}>
                      <Link href={enlaceDelAviso(aviso, location.id)}>{textoDelAviso(aviso)}</Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {pendiente.faltaUnDato.length > 0 ? (
              <>
                <h3>{t("plotDashboardMissingData")}</h3>
                {/* Una línea por dato, no una alarma: hoy «sin área» sale en los 8
                    lotes de Finca Rosina y no debe gritar. */}
                <ul className="nn-detail-meta">
                  {pendiente.faltaUnDato.map((aviso, i) => (
                    <li key={`falta-${i}`}>
                      <Link href={enlaceDelAviso(aviso, location.id)}>{textoDelAviso(aviso)}</Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("plotDashboardRecentSessions")}</h2>
        {jornadas.length === 0 ? (
          <p className="nn-muted">{t("fieldSessionsNone")}</p>
        ) : (
          <>
            <ul className="nn-detail-meta">{jornadas.slice(0, 3).map(lineaDeJornada)}</ul>
            {/* R11: no hay ruta que liste las jornadas de una parcela, así que
                las que no caben en las 3 últimas se pliegan aquí en vez de
                quedar inalcanzables. */}
            {jornadas.length > 3 ? (
              <details>
                <summary>{t("plotDashboardSessionsSeeAll", { n: jornadas.length })}</summary>
                <ul className="nn-detail-meta">{jornadas.slice(3).map(lineaDeJornada)}</ul>
              </details>
            ) : null}
          </>
        )}
        <details>
          <summary>{t("fieldSessionStartSummary")}</summary>
          <FieldSessionStartForm
            locationId={location.id}
            people={people.map((p) => ({ id: p.id, displayName: p.displayName }))}
            selfPersonId={selfPersonId}
          />
        </details>
      </section>

      {/* M1: el `id` va DENTRO del <details>. El navegador sólo abre un
          <details> al navegar a un fragmento cuando el destino está dentro de
          él; en el propio <details> cerrado, el enlace no lo abre. */}
      <details className="nn-section">
        <summary style={{ fontSize: "1.25rem", fontWeight: 600 }}>{t("plotDashboardConditionsHeading")}</summary>

        <h3 id="condiciones">{t("groundConditionsHeading")}</h3>
        <dl className="nn-detail-meta">
          <p>{t("areaLabel")}: {location.areaHectares?.toString() ?? <span className="nn-muted">{t("notRecorded")}</span>}</p>
          <p>{t("spacingLabel")}: {location.plantSpacingMeters?.toString() ?? <span className="nn-muted">{t("notRecorded")}</span>}</p>
          <p>{t("altitudeMinLabel")}: {location.altitudeMinM ?? <span className="nn-muted">{t("notRecorded")}</span>}</p>
          <p>{t("altitudeMaxLabel")}: {location.altitudeMaxM ?? <span className="nn-muted">{t("notRecorded")}</span>}</p>
          <p>
            {t("sunExposureLabel")}:{" "}
            {location.sunExposure ? t(`sunExposure_${location.sunExposure}` as "sunExposure_full_sun") : <span className="nn-muted">{t("notRecorded")}</span>}
          </p>
          <p>
            {t("shadePercentageLabel")}:{" "}
            {location.shadePercentage ? t(`shadePercentage_${location.shadePercentage}` as "shadePercentage_pct_20") : <span className="nn-muted">{t("notRecorded")}</span>}
          </p>
          <p>{t("slopeLabel")}: {location.slopeDescription ?? <span className="nn-muted">{t("notRecorded")}</span>}</p>
          <p>
            {t("aspectLabel")}:{" "}
            {location.aspect ? t(`aspect_${location.aspect}` as "aspect_north") : <span className="nn-muted">{t("notRecorded")}</span>}
          </p>
          <p>{t("soilTypeLabel")}: {location.soilType ?? <span className="nn-muted">{t("notRecorded")}</span>}</p>
        </dl>

        <h3>{t("soilProfileHeading")}</h3>
        <p className="nn-muted">{t("soilProfileIntro")}</p>

        {calicatas.length === 0 ? (
          <p className="nn-muted">{t("soilNoProfiles")}</p>
        ) : (
          calicatas.map((c) => {
            const señales = computeAnaerobicSignals(c);
            return (
              <article key={c.id} className="nn-card">
                <h3>{c.describedAt.toISOString().slice(0, 10)}</h3>
                <dl className="nn-detail-meta">
                  <p>
                    {t("soilRootingDepthLabel")}:{" "}
                    {c.rootingDepthCm != null ? `${c.rootingDepthCm} cm` : <span className="nn-muted">{t("notRecorded")}</span>}
                  </p>
                  <p>
                    {t("soilImpedingDepthLabel")}:{" "}
                    {c.impedingLayerDepthCm != null ? `${c.impedingLayerDepthCm} cm` : <span className="nn-muted">{t("notRecorded")}</span>}
                  </p>
                  {/* `anyPresent` es null cuando NINGUNA de las cuatro señales
                      se miró, y entonces la pantalla lo dice en vez de escribir
                      «no». Contestar «no» a una pregunta que nadie hizo es lo
                      que mandaría a la finca a fertilizar un problema de aire
                      (§6.1 del marco). */}
                  <p>
                    {t("soilAnaerobicHeading")}:{" "}
                    {señales.anyPresent == null ? (
                      <span className="nn-muted">{t("soilAnaerobicUnobserved")}</span>
                    ) : señales.anyPresent ? (
                      <strong>{t("soilAnaerobicPresent", { n: señales.present, total: señales.observed })}</strong>
                    ) : (
                      t("soilAnaerobicAbsent", { total: señales.observed })
                    )}
                  </p>
                </dl>

                {c.horizons.length > 0 ? (
                  <table className="nn-table">
                    <thead>
                      <tr>
                        <th>{t("soilHorizonNumber", { n: "#" })}</th>
                        <th>{t("soilHorizonDepthColumn")}</th>
                        <th>{t("soilHorizonDesignationPlaceholder")}</th>
                        <th>{t("soilHorizonColourPlaceholder")}</th>
                        <th>{t("soilHorizonTexturePlaceholder")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.horizons.map((h) => (
                        <tr key={h.id}>
                          <td>{h.ordinal}</td>
                          <td style={{ fontVariantNumeric: "tabular-nums" }}>
                            {h.topCm != null || h.bottomCm != null ? (
                              `${h.topCm ?? "?"}–${h.bottomCm ?? "?"} cm`
                            ) : (
                              <span className="nn-muted">{t("notRecorded")}</span>
                            )}
                          </td>
                          <td>{h.designation ?? <span className="nn-muted">—</span>}</td>
                          <td>{h.colour ?? <span className="nn-muted">—</span>}</td>
                          <td>{h.textureByFeel ?? <span className="nn-muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="nn-muted">{t("soilNoHorizons")}</p>
                )}

                {/* Paso 4 del marco: «fotografiar cada perfil con una
                    escala». La escala es lo que hace la foto interpretable, y
                    por eso el texto de ayuda la nombra. */}
                <FotosDe assets={fotos.filter((f) => f.soilProfileId === c.id)} etiqueta={t} />
                <LandPhotoUploadForm
                  locationId={location.id}
                  parent={{ kind: "soilProfile", soilProfileId: c.id }}
                  observers={people}
                  selfPersonId={selfPersonId}
                />
              </article>
            );
          })
        )}

        {/* Sigue disponible aunque ya haya perfiles: volver a describir el
            mismo bloque dentro de tres años NO es corregir el de hoy. §14 pide
            repetir el muestreo justamente para ver el cambio. */}
        <h3>{t("landPhotosHeading")}</h3>
        <p className="nn-muted">{t("landPhotosIntro")}</p>
        <FotosDe
          assets={fotos.filter((f) => f.soilProfileId == null && f.biocharBatchId == null)}
          etiqueta={t}
        />
        <LandPhotoUploadForm
          locationId={location.id}
          parent={{ kind: "location" }}
          observers={people}
          selfPersonId={selfPersonId}
        />

        <details>
          <summary>{t("soilDescribeHeading")}</summary>
          <SoilProfileForm
            locationId={location.id}
            values={{
              describedAt: null,
              pitDepthCm: null,
              rootingDepthCm: null,
              rootDistribution: null,
              mottling: null,
              greyColours: null,
              rootChannelConcretions: null,
              sourSmell: null,
              impedingLayerDepthCm: null,
              impedingLayerNote: null,
              provenanceClass: "",
              dataQuality: null,
              notes: null,
            }}
          />
        </details>
      </details>

      {/* M1: igual que #condiciones. `enlaceDelAviso` enlaza a #muestras. */}
      <details className="nn-section">
        <summary style={{ fontSize: "1.25rem", fontWeight: 600 }}>{t("labSamplesHeading")}</summary>
        <p className="nn-muted" id="muestras">{t("samplesIntro")}</p>

        <h3>{t("samplesSoilHeading")}</h3>
        {muestras.soil.length === 0 ? (
          <p className="nn-muted">{t("samplesNoSoil")}</p>
        ) : (
          muestras.soil.map((m) => (
            <article key={m.id} className="nn-card">
              <h4>
                {m.sampleCode} · {m.sampledAt.toISOString().slice(0, 10)}
                {m.depthTopCm != null || m.depthBottomCm != null
                  ? ` · ${m.depthTopCm ?? "?"}–${m.depthBottomCm ?? "?"} cm`
                  : ""}
              </h4>
              <p className="nn-detail-meta">
                {t("sampleLaboratoryLabel")}: {m.laboratory ?? <span className="nn-muted">{t("notRecorded")}</span>}
                {" · "}
                {t("sampleExtractionLabel")}:{" "}
                {m.extractionMethod ?? <span className="nn-muted">{t("notRecorded")}</span>}
              </p>
              <ResultadosDeLaboratorio filas={m.measurements} vacio={t("samplesNoResults")} etiqueta={t} zona={location.timezone} />
              <details>
                <summary>{t("samplesAddResult")}</summary>
                <LabMeasurementForm
                  claveDeEnvio={crypto.randomUUID()}
                  sujeto="soilSampleId"
                  sujetoId={m.id}
                  variables={listVariableDefinitions("analisis_de_suelo")}
                />
              </details>
            </article>
          ))
        )}
        <details>
          <summary>{t("samplesSoilAdd")}</summary>
          <SoilSampleForm locationId={location.id} />
        </details>

        <h3>{t("samplesFoliarHeading")}</h3>
        {muestras.foliar.length === 0 ? (
          <p className="nn-muted">{t("samplesNoFoliar")}</p>
        ) : (
          muestras.foliar.map((m) => {
            const faltan = camposDeProtocoloQueFaltan(m);
            return (
              <article key={m.id} className="nn-card">
                <h4>
                  {m.sampleCode} · {m.sampledAt.toISOString().slice(0, 10)}
                </h4>
                {/* §7.1: un análisis foliar sin su protocolo es INCOMPARABLE, y
                    eso es peor que no tenerlo porque parece que sirve. Se dice
                    qué falta, no sólo que falta algo. */}
                {faltan.length > 0 ? (
                  <p className="nn-detail-meta">
                    <strong>{t("sampleProtocolIncomplete", { n: faltan.length })}</strong>{" "}
                    <span className="nn-muted">
                      {faltan.map((f) => t(`sampleProtocolField_${f}` as "sampleProtocolField_leafPairPosition")).join(", ")}
                    </span>
                  </p>
                ) : (
                  <p className="nn-detail-meta">{t("sampleProtocolComplete")}</p>
                )}
                <ResultadosDeLaboratorio filas={m.measurements} vacio={t("samplesNoResults")} etiqueta={t} zona={location.timezone} />
                <details>
                  <summary>{t("samplesAddResult")}</summary>
                  <LabMeasurementForm
                  claveDeEnvio={crypto.randomUUID()}
                    sujeto="foliarSampleId"
                    sujetoId={m.id}
                    variables={listVariableDefinitions("analisis_foliar")}
                  />
                </details>
              </article>
            );
          })
        )}
        <details>
          <summary>{t("samplesFoliarAdd")}</summary>
          <FoliarSampleForm locationId={location.id} />
        </details>
      </details>
    </div>
  );
}

/**
 * Los resultados de laboratorio de una muestra.
 *
 * Se muestran TODAS las filas, incluidas las corregidas y sus originales:
 * esconder la original dejaría la ficha diciendo un número sin rastro de que
 * antes decía otro, que es lo contrario de por qué `Measurement` corrige por
 * sucesión y no por edición.
 */
function ResultadosDeLaboratorio({
  filas,
  vacio,
  etiqueta,
  zona,
}: {
  filas: {
    id: string;
    variable: string;
    value: unknown;
    unit: string;
    correctsId: string | null;
    occurredAt: Date;
    provenanceClass: string;
  }[];
  vacio: string;
  etiqueta: (clave: string) => string;
  /** La zona del sitio, para que `occurredAt` se lea donde ocurrió y no en UTC. */
  zona: string | null;
}) {
  if (filas.length === 0) return <p className="nn-muted">{vacio}</p>;

  // **Qué fila está vigente se DERIVA, no se almacena.** Una fila está
  // supersedida si otra la corrige. Antes se marcaba sólo la corrección y la
  // original quedaba sin marca, así que con dos valores de la misma variable el
  // operario tenía que inferir cuál manda por el orden en que aparecen — y el
  // orden es por fecha de análisis, no por la relación de sucesión. «Se ven las
  // dos filas» no basta en una plataforma de trazabilidad. Lo encontró la
  // quinta revisión independiente.
  const supersedidas = new Set(filas.map((m) => m.correctsId).filter((id): id is string => id != null));

  return (
    <ul className="nn-detail-meta">
      {filas.map((m) => (
        <li key={m.id} className={supersedidas.has(m.id) ? "nn-muted" : undefined}>
          {etiqueta(`variable_${m.variable}`)}: <strong>{String(m.value)}</strong> {m.unit}
          {" · "}
          <span className="nn-muted">{mostrarFecha(m.occurredAt, zona)}</span>
          {" · "}
          <span className="nn-muted">{etiqueta(`provenanceClass_${m.provenanceClass}`)}</span>
          {supersedidas.has(m.id) ? (
            <> · <span className="nn-muted">{etiqueta("labSupersededTag")}</span></>
          ) : null}
          {m.correctsId ? <> · <span className="nn-muted">{etiqueta("biocharCorrectionTag")}</span></> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Las fotografías de algo, o el hecho de que no las hay.
 *
 * Se dice «sin fotografías» en vez de no pintar nada: una sección vacía y una
 * sección ausente se ven igual, y el Paso 4 pide una foto por perfil — que
 * falte tiene que verse.
 */
function FotosDe({
  assets,
  etiqueta,
}: {
  assets: { id: string; url: string; originalFilename: string | null }[];
  etiqueta: (clave: string) => string;
}) {
  if (assets.length === 0) return <p className="nn-muted">{etiqueta("landPhotosNone")}</p>;
  return (
    <div className="nn-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
      {assets.map((a) => (
        // URL firmada de vida corta contra R2: `next/image` la optimizaría y
        // la cachearía, que es justo lo que no debe pasar con un objeto de
        // acceso restringido.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={a.id} src={a.url} alt={a.originalFilename ?? ""} style={{ width: "100%", borderRadius: 4 }} />
      ))}
    </div>
  );
}
