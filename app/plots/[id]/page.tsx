import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getPlotDetail } from "../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../lib/traceability/locations";
import { PlotAttributesForm } from "../../components/traceability/PlotAttributesForm";
import { SoilProfileForm } from "../../components/traceability/SoilProfileForm";
import { LandPhotoUploadForm } from "../../components/traceability/LandPhotoUploadForm";
import { listLandAssets } from "../../../lib/traceability/landMedia";
import { SoilSampleForm, FoliarSampleForm } from "../../components/traceability/SampleForms";
import { LabMeasurementForm } from "../../components/traceability/LabMeasurementForm";
import { listVariableDefinitions } from "../../../lib/traceability/units";
import {
  listSamplesForLocation,
  camposDeProtocoloQueFaltan,
} from "../../../lib/traceability/soilSamples";
import {
  listSoilProfilesForLocation,
  computeAnaerobicSignals,
} from "../../../lib/traceability/soilProfiles";
import { PlantingCohortForm } from "../../components/traceability/PlantingCohortForm";
import { listFieldSessions } from "../../../lib/traceability/fieldSessions";
import { getObserverCandidates } from "../../../lib/traceability/lots";
import { FieldSessionStartForm } from "../../components/traceability/FieldSessionForms";

export const dynamic = "force-dynamic";

/**
 * What stands in one block.
 *
 * The page's job is as much to show what is *missing* as what is recorded.
 * Every block at Finca Rosina has cohorts and no area, so density cannot be
 * computed — and that gap only existed in conversation until now. Here it is
 * on screen every time someone opens the page, with the specific reason it
 * cannot be computed rather than a blank.
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

  const { location, cohorts, cultivarOptions, density, organizationName } = detail;
  const rendimiento = detail.yield;
  // Misma compuerta que el resto de la página (`requireLocationAttributeAccess`),
  // así que si llegaste hasta aquí, esto no puede negarte.
  const [jornadas, { people, selfPersonId }, calicatas] = await Promise.all([
    listFieldSessions(user.userAccountId, id),
    getObserverCandidates(user.userAccountId),
    listSoilProfilesForLocation(user.userAccountId, id),
  ]);
  const muestras = await listSamplesForLocation(user.userAccountId, id);
  const fotos = await listLandAssets(user.userAccountId, id);
  const activas = cohorts.filter((c) => c.status === "active");

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href="/plots">{t("backToPlots")}</Link>
      </p>

      <span className="nn-badge">{t("badge")}</span>
      <h1>{location.name}</h1>
      {organizationName ? <p className="nn-detail-meta">{organizationName}</p> : null}
      {location.description ? <p className="nn-muted">{location.description}</p> : null}

      <section className="nn-section">
        <h2>{t("standingPopulationHeading")}</h2>

        {/* `nn-table` carries no rule in globals.css; every table in this app
            styles itself inline, and this one follows that convention rather
            than introducing a stylesheet rule the others would not share. */}

        {activas.length === 0 ? (
          <p className="nn-muted">{t("noCohorts")}</p>
        ) : (
          <table className="nn-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem 0.4rem 0" }}>{t("cultivarLabel")}</th>
                <th style={{ textAlign: "right", padding: "0.4rem 0.75rem" }}>{t("plantCountLabel")}</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>{t("plantedLabel")}</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0 0.4rem 0.75rem" }}>{t("howKnownLabel")}</th>
              </tr>
            </thead>
            <tbody>
              {activas.map((cohort) => (
                <tr key={cohort.id}>
                  <td style={{ padding: "0.4rem 0.75rem 0.4rem 0" }}>
                    {cohort.cultivarValue?.value ?? t("cultivarUnknown")}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", padding: "0.4rem 0.75rem" }}>
                    {/* Never zero for a missing count: ADR-080 keeps "not
                        recorded" and "recorded as zero" apart, and a block
                        showing 0 trees would read as a cleared block. */}
                    {cohort.plantCount ?? <span className="nn-muted">{t("notRecorded")}</span>}
                  </td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>
                    {cohort.plantedAt ? (
                      formatPlanted(cohort.plantedAt, cohort.plantedPrecision)
                    ) : (
                      <span className="nn-muted">{t("plantedUnknown")}</span>
                    )}
                  </td>
                  <td className="nn-detail-meta" style={{ padding: "0.4rem 0 0.4rem 0.75rem" }}>
                    {t(
                      `provenanceClass_${cohort.provenanceClass}` as "provenanceClass_direct_observation",
                    )}
                    {cohort.dataQuality ? (
                      <>
                        {" · "}
                        <strong>
                          {t(`dataQuality_${cohort.dataQuality}` as "dataQuality_provisional")}
                        </strong>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activas.map((cohort) => (
          <details key={`edit-${cohort.id}`}>
            <summary>
              {t("cohortEditSummary", {
                cultivar: cohort.cultivarValue?.value ?? t("cultivarUnknown"),
              })}
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
        ))}

        <details>
          <summary>{t("cohortCreateSummary")}</summary>
          <PlantingCohortForm locationId={location.id} cultivars={cultivarOptions} />
        </details>

        {activas.some((c) => c.notes) ? (
          <div className="nn-detail-meta">
            {activas
              .filter((c) => c.notes)
              .map((c) => (
                <p key={`note-${c.id}`}>{c.notes}</p>
              ))}
          </div>
        ) : null}
      </section>

      <section className="nn-section">
        <h2>{t("densityHeading")}</h2>
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
        {/* Said plainly so nobody looks for a stored column that is empty on
            purpose: this is computed on read, never written to
            `PlantingCohort.densityPerHectare`. */}
        <p className="nn-detail-meta">{t("densityComputedNote")}</p>
      </section>

      <section className="nn-section">
        <h2>{t("fieldSessionsHeading")}</h2>
        {jornadas.length === 0 ? (
          <p className="nn-muted">{t("fieldSessionsNone")}</p>
        ) : (
          <ul className="nn-detail-meta">
            {jornadas.map((j) => (
              <li key={j.id}>
                <Link href={`/field-sessions/${j.id}`}>
                  {j.startedAt.toISOString().slice(0, 16).replace("T", " ")}
                </Link>
                {" · "}
                {j.operator.displayName}
                {" · "}
                {t("fieldSessionEventCount", { count: j._count.events })}
                {/* Una jornada sin cerrar es una visita que sigue en curso, no
                    un registro incompleto: se marca en vez de esconderse. */}
                {j.endedAt == null ? <> · <strong>{t("fieldSessionOpen")}</strong></> : null}
              </li>
            ))}
          </ul>
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

      <section className="nn-section">
        <h2>{t("yieldHeading")}</h2>
        {rendimiento.status === "sin_cosechas" ? (
          // No es «rendimiento cero»: es que a este bloque todavía no se le ha
          // atribuido ninguna cosecha. Decirlo así apunta a la acción que falta.
          <p className="nn-muted">{t("yieldNoHarvests")}</p>
        ) : (
          <>
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
                      {/* Nada pesado en el año: se dice, no se muestra un 0
                          que se leería como medición (ADR-080). */}
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
            <p className="nn-detail-meta">{t("yieldComputedNote")}</p>
          </>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("labSamplesHeading")}</h2>
        <p className="nn-muted">{t("samplesIntro")}</p>

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
              <ResultadosDeLaboratorio filas={m.measurements} vacio={t("samplesNoResults")} etiqueta={t} />
              <details>
                <summary>{t("samplesAddResult")}</summary>
                <LabMeasurementForm
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
                <ResultadosDeLaboratorio filas={m.measurements} vacio={t("samplesNoResults")} etiqueta={t} />
                <details>
                  <summary>{t("samplesAddResult")}</summary>
                  <LabMeasurementForm
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
      </section>

      <section className="nn-section">
        <h2>{t("soilProfileHeading")}</h2>
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

                <details>
                  <summary>{t("soilCorrectHeading")}</summary>
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
      </section>

      <section className="nn-section">
        <h2>{t("groundConditionsHeading")}</h2>

        {/* Editable en vez de solo lectura. La lista de antes decía «Sin
            registrar» y no ofrecía forma de arreglarlo: el dato tenía que
            pasar por una conversación y un script. El formulario dice lo
            mismo —una casilla vacía con «Sin registrar» de marcador— y
            además deja llenarlo. `areaHectares` es el que desbloquea la
            densidad, que la sección de arriba ya está lista para mostrar. */}
        <PlotAttributesForm
          locationId={location.id}
          attributes={{
            // Decimal se pasa como cadena, no como número: `Number()` sobre
            // Decimal(10,4) puede redondear, y este valor va de vuelta a una
            // casilla que el usuario reenvía tal cual.
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
    </div>
  );
}


/**
 * A date is shown only as precisely as it was recorded. "Sembrado en 2019" and
 * "sembrado el 14 de marzo de 2019" are different claims (the schema note on
 * `plantedPrecision` says so), and rendering both as a full date would
 * manufacture the second from the first.
 */
function formatPlanted(plantedAt: Date, precision: "year" | "month" | "date" | null): string {
  const iso = plantedAt.toISOString();
  if (precision === "year") return iso.slice(0, 4);
  if (precision === "month") return iso.slice(0, 7);
  if (precision === "date") return iso.slice(0, 10);
  // No precision recorded: show the coarsest reading rather than the most
  // precise, since the stored instant is not evidence of a known day.
  return iso.slice(0, 4);
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
          <span className="nn-muted">{m.occurredAt.toISOString().slice(0, 10)}</span>
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
