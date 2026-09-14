import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getHive } from "../../../../../lib/apiary/hives";
import { origenesDeColonia } from "../../../../../lib/apiary/origenDeColonia";
import { sinRegistrar } from "../../../../../lib/apiary/vacio";
import { causasDePerdida } from "../../../../../lib/apiary/causaDePerdida";
import { irregularidadesOfrecidas } from "../../../../../lib/apiary/irregularidades";
import { getObserverCandidates } from "../../../../../lib/traceability/lots";
import { getSignedUrlForAsset } from "../../../../../lib/traceability/media";
import { listInspectionsForColony } from "../../../../../lib/apiary/inspections";
import { listColonyEventsForColony } from "../../../../../lib/apiary/colonyEvents";
import { serieDeInfestacion } from "../../../../../lib/apiary/varroa";
import { fuerzaDeColonia } from "../../../../../lib/apiary/configuracionDeCaja";
import { METODOS_DE_ALIMENTACION } from "../../../../../lib/apiary/alimentacion";
import { leerEnmiendas } from "../../../../../lib/traceability/enmiendas";
import { actualizarConfiguracionDeCajaFormAction } from "../../../../actions/apiary";
import { BotonDeEnvio } from "../../../../components/BotonDeEnvio";
import { cosechasDeColonia, TIPOS_DE_MIEL } from "../../../../../lib/apiary/cierreDeCosecha";
import { completarCierreDeCosechaFormAction } from "../../../../actions/apiary";
import { NewColonyForm } from "../../../../components/apiary/NewColonyForm";
import { Ayuda } from "../../../../components/apiary/Ayuda";
import { FinDeColoniaForm } from "../../../../components/apiary/FinDeColoniaForm";
import { InspectionForm } from "../../../../components/apiary/InspectionForm";
import { ColonyEventQuickEntry } from "../../../../components/apiary/ColonyEventQuickEntry";
import { ConteoDeVarroaForm } from "../../../../components/apiary/ConteoDeVarroaForm";
import { HarvestForm } from "../../../../components/apiary/HarvestForm";
import { ApiaryPhotoUploadForm } from "../../../../components/apiary/ApiaryPhotoUploadForm";
import type { Asset } from "../../../../../generated/prisma/client";

export const dynamic = "force-dynamic";

export default async function HiveDetailPage({ params }: { params: Promise<{ id: string; hiveId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: apiaryId, hiveId } = await params;
  const t = await getTranslations("Apiary");
  const [hive, { people: observers, selfPersonId }, origenes, causas, irregularidades] = await Promise.all([
    getHive(user.userAccountId, hiveId),
    getObserverCandidates(user.userAccountId),
    // Lecturas sin sujeto: los dos vocabularios salen del catálogo, no de una
    // lista escrita a mano en el formulario.
    origenesDeColonia(),
    causasDePerdida(),
    irregularidadesOfrecidas(),
  ]);

  // A Hive holds at most one *current* Colony in practice (A1/A2's own
  // scope — a move/reassignment operation isn't built yet); prefer an
  // active one if several rows exist.
  const colony = hive.colonies.find((c) => c.status === "active") ?? hive.colonies[0] ?? null;

  const [inspections, colonyEvents, serieDeVarroa] = colony
    ? await Promise.all([
        listInspectionsForColony(user.userAccountId, colony.id),
        listColonyEventsForColony(user.userAccountId, colony.id),
        // `serieDeInfestacion` no autoriza: `getHive` de arriba ya lo hizo, y es
        // de donde salió este `colony.id`.
        serieDeInfestacion(colony.id),
      ])
    : [[], [], []];

  // Los tratamientos que un conteo puede evaluar salen de los eventos que ya se
  // leyeron — no de una consulta nueva. La fecha va en ISO corta porque es lo que
  // distingue dos tratamientos del mismo producto.
  const tratamientos = colonyEvents
    .filter((evt) => evt.eventType === "treatment")
    .map((evt) => ({
      id: evt.id,
      occurredAt: evt.occurredAt.toISOString().slice(0, 10),
      product: evt.treatmentProduct,
    }));

  // A9 · Anexo B §2.4 — el historial de la caja no hubo que construirlo:
  // `actualizarConfiguracionDeCaja` escribe su `AuditEvent` con `before`/`after`, y
  // `leerEnmiendas` ya sabía leer cualquier entidad por su tipo.
  const cambiosDeCaja = await leerEnmiendas([{ entityType: "hive", entityId: hive.id }], { limite: 10 });
  // A9 · Anexo B §5 — las cosechas no se listaban en ninguna parte, así que ni el tipo
  // de miel ni el peso ni la humedad tenían dónde verse.
  const cosechas = colony ? await cosechasDeColonia(colony.id) : [];

  const revalidationPath = `/apiaries/${apiaryId}/hives/${hiveId}`;

  // A6: same "one aggregated gallery, upload forms at each attachment
  // point" pattern as app/lots/[id]/page.tsx — signed GET URLs computed
  // once here, already gated by getHive/listInspectionsForColony/
  // listColonyEventsForColony's own requireApiaryAccess("view", ...) above.
  const allAssets: Asset[] = [
    ...hive.assets,
    ...(colony?.assets ?? []),
    ...inspections.flatMap((insp) => insp.assets),
    ...colonyEvents.flatMap((evt) => evt.assets),
  ];
  const assetsWithUrls = await Promise.all(
    allAssets.map(async (asset) => ({ asset, viewUrl: await getSignedUrlForAsset(asset.storageKey) })),
  );

  return (
    <div>
      <p>
        <Link href={`/apiaries/${apiaryId}`}>{t("backToApiary")}</Link>
      </p>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{hive.identifier}</h1>
      <p className="nn-muted">{t(`hiveStatus_${hive.status}`)}</p>
      <ApiaryPhotoUploadForm
        parent={{ kind: "hive", hiveId: hive.id }}
        revalidationPath={revalidationPath}
        observers={observers}
        selfPersonId={selfPersonId}
      />

      {!colony ? (
        <section className="nn-section">
          <h2>{t("newColonyHeading")}</h2>
          <p className="nn-muted">{t("noColonyYet")}</p>
          <NewColonyForm apiaryId={apiaryId} hiveId={hiveId} origenes={origenes} />
        </section>
      ) : (
        <>
          <section className="nn-section">
            <h2>{t("colonyHeading")}</h2>
            <p className="nn-detail-meta">
              <span>{t(`originType_${colony.originType}`)}</span>
              <span>{t(`colonyStatus_${colony.status}`)}</span>
            </p>
            {/* A9.10 (D6) — el origen se muestra como dato, no como prosa. Se
                dice siempre, incluso sin valor: «sin registro» es distinto de
                una línea que no aparece, que se lee como si nadie preguntara.
                `originNote` sigue debajo para lo que el catálogo no cubre. */}
            <p className="nn-muted">
              {t("originSourceLabel")}:{" "}
              {colony.originSource ? (
                colony.originSource.value
              ) : (
                <span className="nn-vital-sin-registro">{t("sinRegistrar")}</span>
              )}
            </p>
            {colony.originNote ? <p className="nn-muted">{colony.originNote}</p> : null}

            {/* El fin, cuando lo hay: la fecha se dice porque «cuándo la
                perdimos» es la pregunta, y sin ella el estado solo no responde.
                Y el formulario solo aparece mientras la colonia sigue activa —
                es una transición de una vez. */}
            {colony.endedAt ? (
              <p className="nn-muted">
                {t("colonyEndedOn", { fecha: colony.endedAt.toISOString().slice(0, 10) })}
              </p>
            ) : (
              <FinDeColoniaForm colonyId={colony.id} causas={causas} />
            )}
            <ApiaryPhotoUploadForm
              parent={{ kind: "colony", colonyId: colony.id }}
              revalidationPath={revalidationPath}
              observers={observers}
              selfPersonId={selfPersonId}
            />
          </section>

          <section className="nn-section">
            <h2>{t("cajaHeading")}</h2>
            <Ayuda resumen={t("ayudaResumen")}>{t("cajaAyuda")}</Ayuda>
            {/* El formulario manda la configuración COMPLETA, con lo actual
                precargado: representa «cómo está la caja hoy». Los tres sí/no son
                desplegables de TRES opciones y no casillas — un `Boolean?` tiene tres
                estados, y «sin registrar» tiene que poder decirse. */}
            <form action={actualizarConfiguracionDeCajaFormAction} className="nn-form" style={{ maxWidth: 420 }}>
              <input type="hidden" name="hiveId" value={hive.id} />
              <input type="hidden" name="apiaryId" value={apiaryId} />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <div className="nn-field" style={{ flex: 1 }}>
                  <label htmlFor="caja-camaras">{t("broodBoxesLabel")}</label>
                  <input id="caja-camaras" name="broodBoxes" type="number" min={0} step={1} inputMode="numeric" defaultValue={hive.broodBoxes ?? ""} />
                </div>
                <div className="nn-field" style={{ flex: 1 }}>
                  <label htmlFor="caja-alzas">{t("supersLabel")}</label>
                  <input id="caja-alzas" name="supers" type="number" min={0} step={1} inputMode="numeric" defaultValue={hive.supers ?? ""} />
                </div>
                <div className="nn-field" style={{ flex: 1 }}>
                  <label htmlFor="caja-cuadros">{t("framesPerBoxLabel")}</label>
                  <input id="caja-cuadros" name="framesPerBox" type="number" min={1} step={1} inputMode="numeric" defaultValue={hive.framesPerBox ?? ""} />
                </div>
              </div>
              <div className="nn-field">
                <label htmlFor="caja-alimentador">{t("feederTypeLabel")}</label>
                <select id="caja-alimentador" name="feederType" defaultValue={hive.feederType ?? ""}>
                  <option value="" />
                  {METODOS_DE_ALIMENTACION.map((m) => (
                    <option key={m} value={m}>
                      {t(`feedingMethod_${m}`)}
                    </option>
                  ))}
                </select>
              </div>
              {(
                [
                  ["queenExcluder", "queenExcluderLabel", hive.queenExcluder],
                  ["entranceReducer", "entranceReducerLabel", hive.entranceReducer],
                  ["screenedBottomBoard", "screenedBottomBoardLabel", hive.screenedBottomBoard],
                ] as const
              ).map(([nombre, rotulo, valor]) => (
                <div className="nn-field" key={nombre}>
                  <label htmlFor={`caja-${nombre}`}>{t(rotulo)}</label>
                  <select id={`caja-${nombre}`} name={nombre} defaultValue={valor === true ? "si" : valor === false ? "no" : ""}>
                    <option value="" />
                    <option value="si">{t("triSi")}</option>
                    <option value="no">{t("triNo")}</option>
                  </select>
                </div>
              ))}
              <div className="nn-field">
                <label htmlFor="caja-razon">{t("cajaRazonLabel")}</label>
                <input id="caja-razon" name="reason" type="text" />
              </div>
              <BotonDeEnvio>{t("cajaGuardar")}</BotonDeEnvio>
            </form>

            {/* El historial: lo que `before`/`after` compran. */}
            <h3>{t("cajaHistorial")}</h3>
            {cambiosDeCaja.length === 0 ? (
              <p className="nn-muted">{t("cajaSinHistorial")}</p>
            ) : (
              <ul>
                {cambiosDeCaja.map((c) => (
                  <li key={c.id}>
                    {c.occurredAt.toISOString().slice(0, 10)}
                    {c.reason ? ` — ${c.reason}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="nn-section">
            <h2>{t("inspectionHeading")}</h2>
            <InspectionForm colonyId={colony.id} selfPersonId={selfPersonId} irregularidades={irregularidades} />
          </section>

          <section className="nn-section">
            <h2>{t("colonyEventHeading")}</h2>
            <ColonyEventQuickEntry colonyId={colony.id} selfPersonId={selfPersonId} />
          </section>

          {/* A9.6 — varroa: el conteo y su serie. La serie va junta con el
              formulario porque la decisión que se toma al contar es comparar con
              el conteo anterior, y tenerla en otra pantalla obliga a recordarla. */}
          <section className="nn-section">
            <h2>{t("varroaHeading")}</h2>
            <ConteoDeVarroaForm colonyId={colony.id} selfPersonId={selfPersonId} tratamientos={tratamientos} />
            {serieDeVarroa.length === 0 ? (
              <p className="nn-muted">{t("varroaNoCounts")}</p>
            ) : (
              <ul>
                {serieDeVarroa.map((punto) => (
                  <li key={punto.id}>
                    {punto.occurredAt.toISOString().slice(0, 10)} —{" "}
                    {t("varroaInfestation", { valor: punto.infestacion.toFixed(1) })} (
                    {t(`varroaMethod_${punto.method}`)}, {punto.mitesCounted}/{punto.sampleBees})
                    {punto.evaluatesColonyEventId
                      ? ` — ${t("varroaSeriesEvaluates", {
                          fecha:
                            tratamientos.find((tr) => tr.id === punto.evaluatesColonyEventId)?.occurredAt ?? "",
                        })}`
                      : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="nn-section">
            <h2>{t("harvestHeading")}</h2>
            <HarvestForm colonyId={colony.id} />

            {/* Las cosechas, con su cierre. Cada una lleva su formulario porque el tipo
                de miel y el peso se saben al extraer, semanas después de cosechar. */}
            {cosechas.length > 0 ? (
              <>
                <h3>{t("cierreCosechaHeading")}</h3>
                <Ayuda resumen={t("ayudaResumen")}>{t("cierreCosechaAyuda")}</Ayuda>
                <ul>
                  {cosechas.map((c) => (
                    <li key={c.id} style={{ marginBottom: "1rem" }}>
                      {c.occurredAt.toISOString().slice(0, 10)}
                      {c.framesHarvested !== null ? ` · ${c.framesHarvested} ${t("framesPerBoxLabel")}` : ""}
                      {/* Los dos campos de cierre se enseñan SIEMPRE, con su rótulo.
                          Antes desaparecían al faltar, así que «sin cerrar» y «no
                          aplica» se leían igual — el §6 del Anexo E pide que el vacío
                          sea un estado visible, no una línea que no aparece. */}
                      {` · ${t("honeyTypeLabel")}: `}
                      <span className={sinRegistrar(c.honeyType) ? "nn-vital-sin-registro" : undefined}>
                        {c.honeyType ? t(`honeyType_${c.honeyType}`) : t("sinRegistrar")}
                      </span>
                      {` · ${t("extractedWeightLabel")}: `}
                      <span className={sinRegistrar(c.extractedWeightKg) ? "nn-vital-sin-registro" : undefined}>
                        {c.extractedWeightKg !== null ? `${c.extractedWeightKg} kg` : t("sinRegistrar")}
                      </span>

                      {/* La humedad: se LEE aquí y se REGISTRA como medición del lote.
                          El mecanismo ya existía y nadie lo encontraba. */}
                      <p className={c.humedad.length === 0 ? "nn-vital-sin-registro" : undefined}>
                        {c.humedad.length === 0
                          ? t("humedadSinMedir")
                          : c.humedad
                              .map((m) =>
                                t("humedadFila", {
                                  valor: m.valor,
                                  unidad: m.unidad,
                                  fecha: m.measuredAt.toISOString().slice(0, 10),
                                }),
                              )
                              .join(" · ")}
                      </p>

                      <form action={completarCierreDeCosechaFormAction} className="nn-form" style={{ margin: 0 }}>
                        <input type="hidden" name="apiaryHarvestEventId" value={c.id} />
                        <input type="hidden" name="apiaryId" value={apiaryId} />
                        <input type="hidden" name="hiveId" value={hiveId} />
                        <div className="nn-field">
                          <label htmlFor={`miel-${c.id}`}>{t("honeyTypeLabel")}</label>
                          <select id={`miel-${c.id}`} name="honeyType" defaultValue={c.honeyType ?? ""}>
                            <option value="" />
                            {TIPOS_DE_MIEL.map((tm) => (
                              <option key={tm} value={tm}>
                                {t(`honeyType_${tm}`)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="nn-field">
                          <label htmlFor={`peso-${c.id}`}>{t("extractedWeightLabel")}</label>
                          <input
                            id={`peso-${c.id}`}
                            name="extractedWeightKg"
                            type="number"
                            min={0}
                            step="0.001"
                            inputMode="decimal"
                            defaultValue={c.extractedWeightKg ?? ""}
                          />
                        </div>
                        <div className="nn-field">
                          <label htmlFor={`razon-${c.id}`}>{t("cierreCosechaRazon")}</label>
                          <input id={`razon-${c.id}`} name="reason" type="text" />
                        </div>
                        <BotonDeEnvio>{t("cierreCosechaGuardar")}</BotonDeEnvio>
                      </form>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="nn-section">
            <h2>{t("activityHeading")}</h2>
            {inspections.length === 0 && colonyEvents.length === 0 ? (
              <p className="nn-muted">{t("noActivity")}</p>
            ) : (
              <ul>
                {inspections.map((insp) => (
                  <li key={insp.id}>
                    {insp.occurredAt.toLocaleDateString()} — {t(`inspectionOutcome_${insp.outcome}`)}
                    {/* La fuerza, CON su denominador. Cuando la caja no declara
                        cuadros por caja se dice que el número no es comparable, en vez
                        de pintar un porcentaje inventado: es lo que el Anexo pide de
                        este campo —«comparable entre visitas y entre sitios»— y lo que
                        no era hasta que existió §2.4. */}
                    {insp.beeCoveredFrames !== null
                      ? (() => {
                          const f = fuerzaDeColonia(insp.beeCoveredFrames!, hive);
                          return (
                            <span className={f.ocupacion === null ? "nn-vital-sin-registro" : undefined}>
                              {" · "}
                              {f.ocupacion === null
                                ? t("ocupacionSinDenominador", { cubiertos: f.cuadrosCubiertos })
                                : t("ocupacionLabel", {
                                    cubiertos: f.cuadrosCubiertos,
                                    capacidad: f.capacidad ?? 0,
                                    porciento: f.ocupacion.toFixed(0),
                                  })}
                            </span>
                          );
                        })()
                      : null}
                    <ApiaryPhotoUploadForm
                      parent={{ kind: "inspection", inspectionId: insp.id }}
                      revalidationPath={revalidationPath}
                      observers={observers}
                      selfPersonId={selfPersonId}
                    />
                  </li>
                ))}
                {colonyEvents.map((evt) => (
                  <li key={evt.id}>
                    {evt.occurredAt.toLocaleDateString()} — {t(`colonyEventType_${evt.eventType}`)}
                    <ApiaryPhotoUploadForm
                      parent={{ kind: "colonyEvent", colonyEventId: evt.id }}
                      revalidationPath={revalidationPath}
                      observers={observers}
                      selfPersonId={selfPersonId}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

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
    </div>
  );
}
