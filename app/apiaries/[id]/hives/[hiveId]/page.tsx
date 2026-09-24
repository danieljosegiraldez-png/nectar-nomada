import { CampoNumerico } from "../../../../components/CampoNumerico";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { getApiaryDetail, getHive } from "../../../../../lib/apiary/hives";
import { lineaDeColonia } from "../../../../../lib/apiary/genealogia";
import { dividirColoniaFormAction, unirColoniasFormAction } from "../../../../actions/apiary";
import { cambiarReinaFormAction, cerrarTenenciaFormAction, introducirReinaFormAction } from "../../../../actions/apiary";
import { estadoDeReina, FINES_DE_TENENCIA, historiaDeReinas, ORIGENES_DE_REINA } from "../../../../../lib/apiary/reinas";
import { colorDelAño } from "../../../../../lib/apiary/colorDelAno";
import { permissionKeysAnywhere } from "../../../../../lib/rbac/service";
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
import { TimezoneOffsetField } from "../../../../components/TimezoneOffsetField";
import { cosechasDeColonia, TIPOS_DE_MIEL } from "../../../../../lib/apiary/cierreDeCosecha";
import { anotarRecipienteFormAction, completarCierreDeCosechaFormAction, quitarRecipienteFormAction } from "../../../../actions/apiary";
import { NewColonyForm } from "../../../../components/apiary/NewColonyForm";
import { Ayuda } from "../../../../components/apiary/Ayuda";
import { LimpiezaDeCajaForm } from "../../../../components/apiary/LimpiezaDeCajaForm";
import { LecturaDeRefractometroForm } from "../../../../components/apiary/LecturaDeRefractometroForm";
import { instrumentosParaMedicion } from "../../../../../lib/equipos/equipos";
import { limpiezasDeCaja } from "../../../../../lib/apiary/limpiezaDeCaja";
import { historiaDeArtefactos } from "../../../../../lib/apiary/artefactos";
import { DECLARABLES_EN_INSPECCION } from "../../../../../lib/apiary/tiposDeArtefacto";
import { instalarArtefactoFormAction, ponerAlzaFormAction, retirarArtefactoFormAction } from "../../../../actions/apiary";
import { alzasDelApiario } from "../../../../../lib/apiary/alzas";
import { FinDeColoniaForm } from "../../../../components/apiary/FinDeColoniaForm";
import { InspectionForm } from "../../../../components/apiary/InspectionForm";
import { ColonyEventQuickEntry } from "../../../../components/apiary/ColonyEventQuickEntry";
import { frascosParaTratar } from "../../../../../lib/inventario/frascosParaTratar";
import { ConteoDeVarroaForm } from "../../../../components/apiary/ConteoDeVarroaForm";
import { HarvestForm } from "../../../../components/apiary/HarvestForm";
import { ApiaryPhotoUploadForm } from "../../../../components/apiary/ApiaryPhotoUploadForm";
import type { Asset } from "../../../../../generated/prisma/client";
import { FAENAS, faenaDe, seccionAbierta } from "../../../../../lib/apiary/faena";
import { avisosDeEnjambrazon } from "../../../../../lib/apiary/avisoDeEnjambrazon";

export const dynamic = "force-dynamic";

export default async function HiveDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; hiveId: string }>;
  searchParams: Promise<{ faena?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id: apiaryId, hiveId } = await params;
  // Spec 2026-09-17 §A — «¿a qué vienes hoy?». Navegación, no dato: no se guarda.
  const faena = faenaDe((await searchParams).faena);
  const t = await getTranslations("Apiary");
  /**
   * **Qué puede hacer de verdad quien está mirando.**
   *
   * Hasta el 2026-09-17 esta pantalla pintaba los seis formularios a todo el
   * mundo y la acción decidía al enviar. Para un `Apiary Colony Event Recorder`
   * —Kenis, que registra alimentaciones y tratamientos pero NO crea
   * inspecciones— eso era un formulario que se rellena entero y revienta al
   * final. Una promesa rota es peor que una ausencia explicada.
   *
   * **`permissionKeysAnywhere` dice «en algún ámbito», no «en ESTE apiario»**, y
   * es a propósito: aquí sólo decide qué se PINTA. La autorización de verdad
   * sigue en la acción, por ámbito y por clasificación. Una cuenta con
   * `apiary:manage` en otro apiario vería el formulario y la acción lo
   * rechazaría — el fallo menos malo de los dos, y el que ya se corre en el
   * resto de la aplicación.
   */
  const [hive, origenes, causas, irregularidades, granted] = await Promise.all([
    getHive(user.userAccountId, hiveId),
    // Lecturas sin sujeto: los dos vocabularios salen del catálogo, no de una
    // lista escrita a mano en el formulario.
    origenesDeColonia(),
    causasDePerdida(),
    irregularidadesOfrecidas(),
    permissionKeysAnywhere(user.userAccountId),
  ]);
  // Las limpiezas de la CAJA (ADR-159). DESPUÉS del `Promise.all`, no dentro: `limpiezasDeCaja`
  // no autoriza, y `getHive` —que sí— lanza si no hay permiso de ver. Se usa `hive.id`, el de la
  // caja ya autorizada, no el parámetro crudo de la URL.
  const limpiezas = await limpiezasDeCaja(hive.id);
  // «Quién lo hizo», también después de `getHive` y con la caja ya autorizada: el `apiaryId` de la
  // URL no lo comprueba nadie, y anclar en él enseñaría los nombres de otra finca.
  const { people: observers, selfPersonId } = await getObserverCandidates(user.userAccountId, [
    { projectId: hive.projectId, locationId: hive.locationId },
  ]);
  // Artefactos de colmena, Tarea 8. Después de `getHive`, que ya autorizó ver esta caja; y con
  // su propio `requireApiaryAccess` dentro, que no depende de este orden.
  const historia = await historiaDeArtefactos(user.userAccountId, hive.id);
  const ahora = new Date();
  const puestos = historia.filter((f) => f.installedAt <= ahora && (!f.removedAt || f.removedAt > ahora));

  /**
   * Los dos niveles de autoridad, y NO son un escalón del mismo permiso:
   * `colony_event:manage` es una autoridad más pequeña, no una clearance más
   * baja — lo dice el propio guardia en `lib/apiary/hives.ts`.
   */
  const puedeGestionar = granted.has("apiary:manage");
  const puedeRegistrarEventos = puedeGestionar || granted.has("colony_event:manage");
  // Alzas con marca (spec 2026-09-18 §4.2–4.3): las libres para poner aquí —de la finca, activas,
  // sin colmena— y las que esta caja lleva HOY, que son las únicas que la cosecha puede nombrar
  // (se guarda con «ahora»). `hive.locationId` y no el `apiaryId` de la URL: es el sitio real de
  // la caja ya autorizada.
  const alzasDeLaFinca = puedeGestionar ? await alzasDelApiario(user.userAccountId, hive.locationId) : [];
  const alzasLibres = alzasDeLaFinca.filter((a) => a.lifecycleStatus === "active" && !a.puestaEn);
  const alzasPuestasAqui = puestos.filter((f) => f.hiveSuper).map((f) => ({ id: f.hiveSuperId ?? "", code: f.hiveSuper?.code ?? "" }));
  // Botiquín, Tarea 7: sólo los frascos que esta persona puede descontar. Sin
  // ninguno, el formulario de tratamiento es el de siempre.
  const frascos = puedeRegistrarEventos ? await frascosParaTratar(user.userAccountId) : [];

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
  // Spec 2026-09-18: la enjambrazón se descubre REVISANDO. El mismo cálculo y la misma ventana
  // de 60 días que la ficha del apiario (`app/apiaries/[id]/page.tsx`), no uno nuevo. Después de
  // `getHive`, que ya autorizó ver esta caja.
  // Spec 2026-09-18 §3 — la línea de la colonia, y las cajas del apiario para dividir y unir.
  // Después de `getHive`; cada lectura autoriza por su cuenta.
  const linea = colony ? await lineaDeColonia(user.userAccountId, colony.id) : null;
  const cajasDelApiario = colony && puedeGestionar ? (await getApiaryDetail(user.userAccountId, hive.locationId)).hives : [];
  const cajasLibres = cajasDelApiario.filter((h) => h.id !== hive.id && !h.colonies.some((c) => c.status === "active"));
  const receptoras = cajasDelApiario.flatMap((h) =>
    h.colonies.filter((c) => c.status === "active" && c.id !== colony?.id).map((c) => ({ colonyId: c.id, identifier: h.identifier })),
  );
  // Spec 2026-09-18 §4 — la reina. Después de `getHive`; cada lectura autoriza por su cuenta.
  const [estadoReina, historiaReinas] = colony
    ? await Promise.all([estadoDeReina(user.userAccountId, colony.id), historiaDeReinas(user.userAccountId, colony.id)])
    : [null, []];
  // «Criada aquí»: cualquier colonia activa del apiario, esta incluida.
  const coloniasDeOrigen = cajasDelApiario.flatMap((h) =>
    h.colonies.filter((c) => c.status === "active").map((c) => ({ colonyId: c.id, identifier: h.identifier })),
  );
  const ahoraEnjambrazon = new Date();
  const avisoDeEnjambrazon = colony
    ? ((
        await avisosDeEnjambrazon(hive.locationId, new Date(ahoraEnjambrazon.getTime() - 60 * 24 * 60 * 60 * 1000), ahoraEnjambrazon)
      ).find((a) => a.colonyId === colony.id) ?? null)
    : null;
  // ADR-160: sólo los aparatos con algún modo sobre MIEL DE ABEJA. El refractómetro del
  // beneficio lee mosto de café y no es el de mieles. La lista ya viene autorizada.
  const refractometrosDeMiel =
    cosechas.length === 0
      ? []
      : (await instrumentosParaMedicion(user.userAccountId))
          .map((i) => ({
            id: i.id,
            name: i.name,
            escalas: i.modos
              .filter((m) => m.materialState === "BEE_HONEY" && (m.variable === "brix" || m.variable === "moisture"))
              .map((m) => `${m.variable === "brix" ? "°Bx" : "H%"} ${m.rangeMin ?? "?"}–${m.rangeMax ?? "?"}`),
          }))
          .filter((i) => i.escalas.length > 0);

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
    <div className="nn-apiary-page nn-hive-page">
      <header className="nn-apiary-header"><div><Link href={`/apiaries/${apiaryId}`}>{t("backToApiary")}</Link><span className="nn-badge">{t("badge")}</span><h1>{hive.identifier}</h1><p>{t(`hiveStatus_${hive.status}`)}</p></div></header>
      <details className="nn-inline-disclosure nn-hive-photo">
        <summary>{t("photosHeading")}</summary>
        <ApiaryPhotoUploadForm
          parent={{ kind: "hive", hiveId: hive.id }}
          revalidationPath={revalidationPath}
          observers={observers}
          selfPersonId={selfPersonId}
        />
      </details>

      {!colony ? (
        <section className="nn-section">
          <h2>{t("newColonyHeading")}</h2>
          <p className="nn-muted">{t("noColonyYet")}</p>
          {puedeGestionar ? (
            <NewColonyForm apiaryId={apiaryId} hiveId={hiveId} origenes={origenes} />
          ) : (
            <p className="nn-muted">{t("sinPermisoGestion")}</p>
          )}
        </section>
      ) : (
        <>
          {/* La fila de faenas. Elegir una abre su sección y pliega las demás —plegadas,
              no ocultas—; sin elegir, la pantalla de siempre. El ancla lleva a la sección. */}
          <nav className="nn-hive-tasks" aria-label={t("faenaPregunta")}>
            <p><strong>{t("faenaPregunta")}</strong></p>
            <div>
              {FAENAS.map((f) => (
                <Link
                  key={f}
                  href={`/apiaries/${apiaryId}/hives/${hiveId}?faena=${f}#faena-${f}`}
                  aria-current={faena === f ? "page" : undefined}
                >
                  {t(`faena_${f}`)}
                </Link>
              ))}
              <Link href={`/apiaries/${apiaryId}/hives/${hiveId}`} aria-current={faena === null ? "page" : undefined}>
                {t("faenaTodo")}
              </Link>
            </div>
            {faena ? <p className="nn-muted">{t("faenaAyuda")}</p> : null}
          </nav>

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
            ) : puedeGestionar ? (
              <FinDeColoniaForm colonyId={colony.id} causas={causas} />
            ) : (
              <p className="nn-muted">{t("sinPermisoGestion")}</p>
            )}
            <details className="nn-inline-disclosure nn-hive-photo">
              <summary>{t("photosHeading")}</summary>
              <ApiaryPhotoUploadForm
                parent={{ kind: "colony", colonyId: colony.id }}
                revalidationPath={revalidationPath}
                observers={observers}
                selfPersonId={selfPersonId}
              />
            </details>
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
                  <CampoNumerico id="caja-camaras" name="broodBoxes" min={0} step={1} inputMode="numeric" defaultValue={hive.broodBoxes ?? ""} />
                </div>
                <div className="nn-field" style={{ flex: 1 }}>
                  <label htmlFor="caja-alzas">{t("supersLabel")}</label>
                  <CampoNumerico id="caja-alzas" name="supers" min={0} step={1} inputMode="numeric" defaultValue={hive.supers ?? ""} />
                </div>
                <div className="nn-field" style={{ flex: 1 }}>
                  <label htmlFor="caja-cuadros">{t("framesPerBoxLabel")}</label>
                  <CampoNumerico id="caja-cuadros" name="framesPerBox" min={1} step={1} inputMode="numeric" defaultValue={hive.framesPerBox ?? ""} />
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

          {/* ADR-159 — la limpieza de la CAJA. Va junto a su configuración porque las dos son de la
              caja, no de la colonia: una caja vacía se desinfecta ANTES de recibir otra. */}
          <section className="nn-section">
            <h2>{t("limpiezaHeading")}</h2>
            <Ayuda resumen={t("ayudaResumen")}>{t("limpiezaAyuda")}</Ayuda>
            {limpiezas.length === 0 ? (
              <p className="nn-muted">{t("limpiezaNinguna")}</p>
            ) : (
              <ul>
                {limpiezas.map((l) => (
                  <li key={l.id}>
                    {/* Un DÍA: se muestra tal cual, sin convertir a la zona del sitio, que lo movería un
                        día atrás (la trampa de los campos de día del CLAUDE.md). */}
                    <strong>{l.occurredAt.toISOString().slice(0, 10)}</strong>
                    {" — "}
                    {l.acts.map((a) => (a === "otro" && l.actOtherNote ? l.actOtherNote : t(`limpiezaActo_${a}`))).join(", ")}
                    {l.reason ? ` · ${l.reason === "otro" && l.reasonOtherNote ? l.reasonOtherNote : t(`limpiezaRazon_${l.reason}`)}` : null}
                    {l.notes ? <span className="nn-muted"> · {l.notes}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {puedeGestionar ? (
              <details>
                <summary>{t("limpiezaRegistrar")}</summary>
                <LimpiezaDeCajaForm hiveId={hive.id} apiaryId={apiaryId} />
              </details>
            ) : null}
          </section>

          {/* Artefactos de colmena (Tarea 8): qué lleva puesta HOY y desde cuándo, y debajo la
              historia. Quien no gestiona el apiario lo VE y no lo cambia — y se le dice por qué. */}
          <section className="nn-section" id="artefactos">
            <h2>{t("artefactosHeading")}</h2>
            {puestos.length === 0 ? (
              <p className="nn-muted">{t("artefactosNingunoPuesto")}</p>
            ) : (
              <ul>
                {puestos.map((f) => (
                  <li key={f.id}>
                    <strong>{t(`artefacto_${f.kind}`)}</strong>
                    {f.count !== null ? ` × ${f.count}` : ""}
                    {f.hiveNode ? ` · ${f.hiveNode.deviceId}` : ""}
                    {f.hiveSuper ? ` · ${f.hiveSuper.code}` : ""}
                    {f.notes ? ` · ${f.notes}` : ""}
                    {" — "}
                    {t("artefactoDesde", { fecha: f.installedAt.toISOString().slice(0, 10) })}
                    {/* Un nodo se retira con su propio permiso: moverlo reasigna sus datos. */}
                    {(f.kind === "nodo_de_sensores" ? granted.has("hive_node:manage") : puedeGestionar) ? (
                      <form action={retirarArtefactoFormAction} style={{ display: "inline", marginLeft: "0.5rem" }}>
                        <input type="hidden" name="hiveId" value={hive.id} />
                        <input type="hidden" name="apiaryId" value={apiaryId} />
                        <input type="hidden" name="fittingId" value={f.id} />
                        <TimezoneOffsetField />
                        <BotonDeEnvio>{t("artefactoRetirarHoy")}</BotonDeEnvio>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {puedeGestionar ? (
              <>
              {/* «¿Tiene marca?» del spec §4.2, hecho con dos formularios: éste pone un alza CON
                  marca; el de abajo, con «alza», pone alzas SIN marca, que se siguen contando. */}
              <details>
                <summary>{t("alzaPonerMarcada")}</summary>
                {alzasLibres.length === 0 ? (
                  <p className="nn-muted">{t("alzaSinLibres")}</p>
                ) : (
                  <form action={ponerAlzaFormAction} className="nn-form">
                    <input type="hidden" name="hiveId" value={hive.id} />
                    <input type="hidden" name="apiaryId" value={apiaryId} />
                    <TimezoneOffsetField />
                    <div className="nn-field">
                      <label htmlFor="alza-cual">{t("alzaCual")}</label>
                      <select id="alza-cual" name="hiveSuperId" required defaultValue="">
                        <option value="" disabled />
                        {alzasLibres.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="nn-field">
                      <label htmlFor="alza-cuando">{t("artefactoCuando")}</label>
                      <input id="alza-cuando" name="cuando" type="datetime-local" />
                    </div>
                    <BotonDeEnvio>{t("alzaPonerBoton")}</BotonDeEnvio>
                  </form>
                )}
              </details>
              <details>
                <summary>{t("artefactoPoner")}</summary>
                <form action={instalarArtefactoFormAction} className="nn-form">
                  <input type="hidden" name="hiveId" value={hive.id} />
                  <input type="hidden" name="apiaryId" value={apiaryId} />
                  <TimezoneOffsetField />
                  <div className="nn-field">
                    <label htmlFor="artefacto-kind">{t("artefactoQue")}</label>
                    <select id="artefacto-kind" name="kind" required defaultValue="">
                      <option value="" disabled />
                      {DECLARABLES_EN_INSPECCION.map((k) => (
                        <option key={k} value={k}>
                          {t(`artefacto_${k}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="nn-field">
                    <label htmlFor="artefacto-count">{t("artefactoCuantasAlzas")}</label>
                    <CampoNumerico id="artefacto-count" name="count" min={1} step={1} inputMode="numeric" />
                  </div>
                  <div className="nn-field">
                    <label htmlFor="artefacto-notes">{t("artefactoNota")}</label>
                    <input id="artefacto-notes" name="notes" type="text" />
                  </div>
                  <div className="nn-field">
                    <label htmlFor="artefacto-cuando">{t("artefactoCuando")}</label>
                    <input id="artefacto-cuando" name="cuando" type="datetime-local" />
                  </div>
                  <BotonDeEnvio>{t("artefactoPonerBoton")}</BotonDeEnvio>
                </form>
              </details>
              </>
            ) : (
              <p className="nn-muted">{t("artefactosSinPermiso")}</p>
            )}
            {historia.some((f) => f.removedAt) ? (
              <>
                <h3>{t("artefactosHistoria")}</h3>
                <ul>
                  {historia
                    .filter((f) => f.removedAt)
                    .map((f) => (
                      <li key={f.id}>
                        {t(`artefacto_${f.kind}`)}
                        {f.count !== null ? ` × ${f.count}` : ""}
                        {f.hiveNode ? ` · ${f.hiveNode.deviceId}` : ""}
                    {f.hiveSuper ? ` · ${f.hiveSuper.code}` : ""}
                        {" — "}
                        {t("artefactoDesdeHasta", {
                          desde: f.installedAt.toISOString().slice(0, 10),
                          hasta: f.removedAt!.toISOString().slice(0, 10),
                        })}
                      </li>
                    ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="nn-section" id="faena-revisar">
            <details open={seccionAbierta(faena, "revisar")}>
              <summary>
                <h2 style={{ display: "inline" }}>{t("inspectionHeading")}</h2>
              </summary>
            {avisoDeEnjambrazon ? (
              <p className="nn-alerta nn-alerta-aviso">
                {t("enjambrazonAviso", {
                  tipo: t(`queenCell_${avisoDeEnjambrazon.kind}`),
                  fecha: avisoDeEnjambrazon.occurredAt.toISOString().slice(0, 10),
                })}{" "}
                <Link href={`/apiaries/${apiaryId}/hives/${hiveId}?faena=dividir#faena-dividir`}>{t("enjambrazonDividir")}</Link>
              </p>
            ) : null}
            {/* **Se dice por qué, no se esconde a secas.** Un formulario que
                desaparece sin explicación se lee como una pantalla rota. Misma
                doctrina que las limitaciones del veredicto: la falta se declara. */}
            {puedeGestionar ? (
              <InspectionForm colonyId={colony.id} selfPersonId={selfPersonId} irregularidades={irregularidades} />
            ) : (
              <p className="nn-muted">{t("sinPermisoInspeccion")}</p>
            )}
            </details>
          </section>

          <section className="nn-section">
            <h2>{t("colonyEventHeading")}</h2>
            {puedeRegistrarEventos ? (
              <ColonyEventQuickEntry colonyId={colony.id} selfPersonId={selfPersonId} frascos={frascos} faena={faena} />
            ) : (
              <p className="nn-muted">{t("sinPermisoEvento")}</p>
            )}
          </section>

          {/* A9.6 — varroa: el conteo y su serie. La serie va junta con el
              formulario porque la decisión que se toma al contar es comparar con
              el conteo anterior, y tenerla en otra pantalla obliga a recordarla. */}
          <section className="nn-section" id="faena-varroa">
            <details open={seccionAbierta(faena, "varroa")}>
              <summary>
                <h2 style={{ display: "inline" }}>{t("varroaHeading")}</h2>
              </summary>
            {puedeGestionar ? (
              <ConteoDeVarroaForm colonyId={colony.id} selfPersonId={selfPersonId} tratamientos={tratamientos} />
            ) : (
              <p className="nn-muted">{t("sinPermisoGestion")}</p>
            )}
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
            </details>
          </section>

          <section className="nn-section" id="faena-dividir">
            <details open={seccionAbierta(faena, "dividir")}>
              <summary>
                <h2 style={{ display: "inline" }}>{t("faena_dividir")}</h2>
              </summary>
              {linea && (linea.madre || linea.hijas.length > 0) ? (
                <p>
                  {linea.madre ? (
                    <>
                      {t("lineaMadre")}{" "}
                      <Link href={`/apiaries/${linea.madre.hive.locationId}/hives/${linea.madre.hive.id}`}>{linea.madre.hive.identifier}</Link>
                      {". "}
                    </>
                  ) : null}
                  {linea.hijas.length > 0 ? (
                    <>
                      {t("lineaHijas")}{" "}
                      {linea.hijas.map((h, i) => (
                        <span key={h.id}>
                          {i > 0 ? ", " : ""}
                          <Link href={`/apiaries/${h.hive.locationId}/hives/${h.hive.id}`}>{h.hive.identifier}</Link>
                        </span>
                      ))}
                    </>
                  ) : null}
                </p>
              ) : null}
              {/* La guía de DICTA, citada, como guía: no se valida (spec §1 — ninguna cifra entra). */}
              <p className="nn-muted">{t("dividirGuia")}</p>
              {puedeGestionar && colony.status === "active" ? (
                <form action={dividirColoniaFormAction} className="nn-form">
                  <input type="hidden" name="apiaryId" value={apiaryId} />
                  <input type="hidden" name="hiveId" value={hive.id} />
                  <input type="hidden" name="locationId" value={hive.locationId} />
                  <input type="hidden" name="madreColonyId" value={colony.id} />
                  <TimezoneOffsetField />
                  <div className="nn-field">
                    <label htmlFor="dividir-destino">{t("dividirDestino")}</label>
                    <select id="dividir-destino" name="destinoHiveId" required defaultValue="">
                      <option value="" disabled />
                      {cajasLibres.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.identifier}
                        </option>
                      ))}
                      <option value="__nueva__">{t("dividirCajaNueva")}</option>
                    </select>
                  </div>
                  <div className="nn-field">
                    <label htmlFor="dividir-nueva">{t("dividirNuevoIdentificador")}</label>
                    <input id="dividir-nueva" name="nuevoIdentificador" type="text" />
                  </div>
                  <div className="nn-field">
                    <label htmlFor="dividir-cuando">{t("faenaCuando")}</label>
                    <input id="dividir-cuando" name="cuando" type="datetime-local" />
                  </div>
                  <div className="nn-field">
                    <label htmlFor="dividir-nota">{t("dividirNota")}</label>
                    <input id="dividir-nota" name="nota" type="text" />
                  </div>
                  {/* Sólo si hay reina registrada: sin ella no hay nada que mover, y no se inventa. */}
                  {estadoReina?.estado === "CON_REINA" ? (
                    <div className="nn-field">
                      <label htmlFor="dividir-reina">{t("dividirReinaVa")}</label>
                      <select id="dividir-reina" name="reinaVa" defaultValue="madre">
                        <option value="madre">{t("dividirReinaVaMadre")}</option>
                        <option value="hija">{t("dividirReinaVaHija")}</option>
                      </select>
                    </div>
                  ) : null}
                  <BotonDeEnvio>{t("dividirBoton")}</BotonDeEnvio>
                </form>
              ) : (
                <p className="nn-muted">{t("sinPermisoGestion")}</p>
              )}
            </details>
          </section>

          <section className="nn-section" id="faena-reinas">
            <details open={seccionAbierta(faena, "reinas")}>
              <summary>
                <h2 style={{ display: "inline" }}>{t("faena_reinas")}</h2>
              </summary>
              {estadoReina ? (
                <p>
                  {estadoReina.estado === "CON_REINA"
                    ? t("reinaEstadoCon", { fecha: estadoReina.desde.toISOString().slice(0, 10) })
                    : estadoReina.estado === "HUERFANA"
                      ? t("reinaEstadoHuerfana", { fecha: estadoReina.desde.toISOString().slice(0, 10) })
                      : t("reinaEstadoSinRegistro")}
                </p>
              ) : null}
              {historiaReinas.length > 0 ? (
                <>
                  <h3>{t("reinasHistoria")}</h3>
                  <ul>
                    {historiaReinas.map((r) => (
                      <li key={r.id}>
                        {r.hasta
                          ? t("reinaTenencia", {
                              origen: t(`reinaOrigen_${r.queen.origin}`),
                              desde: r.desde.toISOString().slice(0, 10),
                              hasta: r.hasta.toISOString().slice(0, 10),
                            })
                          : t("reinaTenenciaAbierta", { origen: t(`reinaOrigen_${r.queen.origin}`), desde: r.desde.toISOString().slice(0, 10) })}
                        {r.queen.birthYear !== null
                          ? ` · ${t("reinaApodo", { color: t(`reinaColor_${colorDelAño(r.queen.birthYear)}`), ano: r.queen.birthYear })}`
                          : ""}
                        {r.fin ? ` · ${t(`reinaFin_${r.fin}`)}` : ""}
                        {r.finNota ? ` — ${r.finNota}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {puedeGestionar && colony.status === "active" ? (
                estadoReina?.estado === "CON_REINA" ? (
                  <>
                    <h3>{t("reinaCambiar")}</h3>
                    <form action={cambiarReinaFormAction} className="nn-form">
                    <input type="hidden" name="apiaryId" value={apiaryId} />
                    <input type="hidden" name="hiveId" value={hive.id} />
                    <input type="hidden" name="colonyId" value={colony.id} />
                    <TimezoneOffsetField />
                    <div className="nn-field">
                      <label htmlFor="cambiar-fin">{t("reinaFin")}</label>
                      <select id="cambiar-fin" name="fin" required defaultValue="">
                        <option value="" disabled />
                        {FINES_DE_TENENCIA.map((f) => (
                          <option key={f} value={f}>
                            {t(`reinaFin_${f}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="nn-field">
                      <label htmlFor="cambiar-finnota">{t("reinaFinNota")}</label>
                      <input id="cambiar-finnota" name="finNota" type="text" />
                    </div>
                    <div className="nn-field">
                      <label htmlFor="cambiar-nueva-origen">{t("reinaOrigen")}</label>
                      <select id="cambiar-nueva-origen" name="origen" required defaultValue="">
                        <option value="" disabled />
                        {ORIGENES_DE_REINA.map((o) => (
                          <option key={o} value={o}>
                            {t(`reinaOrigen_${o}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="nn-field">
                      <label htmlFor="cambiar-nueva-madre">{t("reinaOrigenColonia")}</label>
                      <select id="cambiar-nueva-madre" name="origenColonyId" defaultValue="">
                        <option value="" />
                        {coloniasDeOrigen.map((c) => (
                          <option key={c.colonyId} value={c.colonyId}>
                            {c.identifier}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="nn-field">
                      <label htmlFor="cambiar-nacimiento">{t("reinaAnoDeNacimiento")}</label>
                      {/* Un campo de año y no una lista corta (Codex, PR #441): pasar al sistema una
                          reina de 2020 nacida en 2019 no debe obligar a dejarla en «no se sabe». Vacío =
                          no se sabe; el servicio valida el número. */}
                      <CampoNumerico id="cambiar-nacimiento" name="anoDeNacimiento" inputMode="numeric" min={1990} step={1} />
                    </div>
                    <div className="nn-field">
                      <label htmlFor="cambiar-nueva-notas">{t("reinaNotas")}</label>
                      <input id="cambiar-nueva-notas" name="notas" type="text" />
                    </div>
                    <div className="nn-field">
                      <label htmlFor="cambiar-cuando">{t("faenaCuando")}</label>
                      <input id="cambiar-cuando" name="cuando" type="datetime-local" />
                    </div>
                      <BotonDeEnvio>{t("reinaCambiarBoton")}</BotonDeEnvio>
                    </form>
                    <h3>{t("reinaCerrar")}</h3>
                    <form action={cerrarTenenciaFormAction} className="nn-form">
                    <input type="hidden" name="apiaryId" value={apiaryId} />
                    <input type="hidden" name="hiveId" value={hive.id} />
                    <input type="hidden" name="colonyId" value={colony.id} />
                    <TimezoneOffsetField />
                    <div className="nn-field">
                      <label htmlFor="cerrar-fin">{t("reinaFin")}</label>
                      <select id="cerrar-fin" name="fin" required defaultValue="">
                        <option value="" disabled />
                        {FINES_DE_TENENCIA.map((f) => (
                          <option key={f} value={f}>
                            {t(`reinaFin_${f}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="nn-field">
                      <label htmlFor="cerrar-finnota">{t("reinaFinNota")}</label>
                      <input id="cerrar-finnota" name="finNota" type="text" />
                    </div>
                    <div className="nn-field">
                      <label htmlFor="cerrar-cuando">{t("faenaCuando")}</label>
                      <input id="cerrar-cuando" name="cuando" type="datetime-local" />
                    </div>
                      <BotonDeEnvio>{t("reinaCerrarBoton")}</BotonDeEnvio>
                    </form>
                  </>
                ) : (
                  <>
                    <h3>{t("reinaIntroducir")}</h3>
                    <form action={introducirReinaFormAction} className="nn-form">
                    <input type="hidden" name="apiaryId" value={apiaryId} />
                    <input type="hidden" name="hiveId" value={hive.id} />
                    <input type="hidden" name="colonyId" value={colony.id} />
                    <TimezoneOffsetField />
                    <div className="nn-field">
                      <label htmlFor="introducir-origen">{t("reinaOrigen")}</label>
                      <select id="introducir-origen" name="origen" required defaultValue="">
                        <option value="" disabled />
                        {ORIGENES_DE_REINA.map((o) => (
                          <option key={o} value={o}>
                            {t(`reinaOrigen_${o}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="nn-field">
                      <label htmlFor="introducir-madre">{t("reinaOrigenColonia")}</label>
                      <select id="introducir-madre" name="origenColonyId" defaultValue="">
                        <option value="" />
                        {coloniasDeOrigen.map((c) => (
                          <option key={c.colonyId} value={c.colonyId}>
                            {c.identifier}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="nn-field">
                      <label htmlFor="introducir-nacimiento">{t("reinaAnoDeNacimiento")}</label>
                      {/* Un campo de año y no una lista corta (Codex, PR #441): pasar al sistema una
                          reina de 2020 nacida en 2019 no debe obligar a dejarla en «no se sabe». Vacío =
                          no se sabe; el servicio valida el número. */}
                      <CampoNumerico id="introducir-nacimiento" name="anoDeNacimiento" inputMode="numeric" min={1990} step={1} />
                    </div>
                    <div className="nn-field">
                      <label htmlFor="introducir-notas">{t("reinaNotas")}</label>
                      <input id="introducir-notas" name="notas" type="text" />
                    </div>
                    <div className="nn-field">
                      <label htmlFor="introducir-cuando">{t("faenaCuando")}</label>
                      <input id="introducir-cuando" name="cuando" type="datetime-local" />
                    </div>
                      <BotonDeEnvio>{t("reinaIntroducirBoton")}</BotonDeEnvio>
                    </form>
                  </>
                )
              ) : (
                <p className="nn-muted">{t("sinPermisoGestion")}</p>
              )}
            </details>
          </section>

          <section className="nn-section" id="faena-unir">
            <details open={seccionAbierta(faena, "unir")}>
              <summary>
                <h2 style={{ display: "inline" }}>{t("faena_unir")}</h2>
              </summary>
              <p className="nn-muted">{t("unirGuia")}</p>
              {puedeGestionar && colony.status === "active" ? (
                receptoras.length === 0 ? (
                  <p className="nn-muted">{t("unirSinReceptoras")}</p>
                ) : (
                  <form action={unirColoniasFormAction} className="nn-form">
                    <input type="hidden" name="apiaryId" value={apiaryId} />
                    <input type="hidden" name="hiveId" value={hive.id} />
                    <input type="hidden" name="debilColonyId" value={colony.id} />
                    <TimezoneOffsetField />
                    <div className="nn-field">
                      <label htmlFor="unir-receptora">{t("unirReceptora")}</label>
                      <select id="unir-receptora" name="receptoraColonyId" required defaultValue="">
                        <option value="" disabled />
                        {receptoras.map((r) => (
                          <option key={r.colonyId} value={r.colonyId}>
                            {r.identifier}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="nn-field">
                      <label htmlFor="unir-cuando">{t("faenaCuando")}</label>
                      <input id="unir-cuando" name="cuando" type="datetime-local" />
                    </div>
                    {/* Por qué se unió: el mismo catálogo y la misma firmeza que el fin de colonia. */}
                    <fieldset className="nn-field">
                      <legend>{t("colonyEndCausesLegend")}</legend>
                      {causas.map((c) => (
                        <div key={c.id} className="nn-field">
                          <label htmlFor={`unir-causa-${c.id}`}>{c.value}</label>
                          <select id={`unir-causa-${c.id}`} name={`causa_${c.id}`} defaultValue="">
                            <option value="">{t("colonyEndCauseNo")}</option>
                            <option value="hypothesis">{t("colonyEndCause_hypothesis")}</option>
                            <option value="conclusion">{t("colonyEndCause_conclusion")}</option>
                            <option value="direct_observation">{t("colonyEndCause_direct_observation")}</option>
                          </select>
                        </div>
                      ))}
                    </fieldset>
                    <div className="nn-field">
                      <label htmlFor="unir-razon">{t("colonyEndReasonLabel")}</label>
                      <input id="unir-razon" name="reason" type="text" />
                    </div>
                    <BotonDeEnvio>{t("unirBoton")}</BotonDeEnvio>
                  </form>
                )
              ) : (
                <p className="nn-muted">{t("sinPermisoGestion")}</p>
              )}
            </details>
          </section>

          <section className="nn-section" id="faena-cosechar">
            <details open={seccionAbierta(faena, "cosechar")}>
              <summary>
                <h2 style={{ display: "inline" }}>{t("harvestHeading")}</h2>
              </summary>
            {puedeGestionar ? <HarvestForm colonyId={colony.id} alzas={alzasPuestasAqui} /> : <p className="nn-muted">{t("sinPermisoGestion")}</p>}

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

                      {/* El Brix, junto a la humedad: las dos escalas del refractómetro de miel. */}
                      <p className={c.brix.length === 0 ? "nn-vital-sin-registro" : undefined}>
                        {c.brix.length === 0
                          ? t("brixSinMedir")
                          : c.brix
                              .map((m) => t("brixFila", { valor: m.valor, fecha: m.measuredAt.toISOString().slice(0, 10) }))
                              .join(" · ")}
                      </p>

                      {/* Una lectura por cosecha (Daniel, 2026-09-17): el formulario sólo aparece
                          mientras falte alguna de las dos escalas. Después se CORRIGE, no se apila. */}
                      {c.brix.length === 0 || c.humedad.length === 0 ? (
                        <details>
                          <summary>{t("refractometroTitulo")}</summary>
                          <LecturaDeRefractometroForm
                            apiaryHarvestEventId={c.id}
                            hiveId={hiveId}
                            apiaryId={apiaryId}
                            instrumentos={refractometrosDeMiel}
                            claveDeEnvio={crypto.randomUUID()}
                          />
                        </details>
                      ) : null}

                      {/* Pesada por recipiente (spec 2026-09-19 §3): con recipientes, el peso de la
                          cosecha ES la suma de sus netos, y el campo de peso a mano desaparece. */}
                      <details open={c.recipientes.length > 0}>
                        <summary>{t("recipientesHeading")}</summary>
                        {c.recipientes.length > 0 ? (
                          <>
                            <ul>
                              {c.recipientes.map((r) => (
                                <li key={r.id}>
                                  {t("recipienteFila", { label: r.label, bruto: r.grossKg, tara: r.tareKg, neto: r.netoKg })}
                                  <details style={{ display: "inline-block", marginLeft: "0.5rem" }}>
                                    <summary>{t("recipienteQuitar")}</summary>
                                    <form action={quitarRecipienteFormAction} className="nn-form">
                                      <input type="hidden" name="containerId" value={r.id} />
                                      <input type="hidden" name="apiaryId" value={apiaryId} />
                                      <input type="hidden" name="hiveId" value={hiveId} />
                                      <div className="nn-field">
                                        <label htmlFor={`quitar-${r.id}`}>{t("recipienteMotivo")}</label>
                                        <input id={`quitar-${r.id}`} name="reason" type="text" required />
                                      </div>
                                      <BotonDeEnvio>{t("recipienteQuitar")}</BotonDeEnvio>
                                    </form>
                                  </details>
                                </li>
                              ))}
                            </ul>
                            <p>
                              <strong>{t("recipientesTotal", { kg: c.extractedWeightKg ?? 0 })}</strong>
                            </p>
                          </>
                        ) : null}
                        <form action={anotarRecipienteFormAction} className="nn-form" style={{ margin: 0 }}>
                          <input type="hidden" name="apiaryHarvestEventId" value={c.id} />
                          <input type="hidden" name="apiaryId" value={apiaryId} />
                          <input type="hidden" name="hiveId" value={hiveId} />
                          <div className="nn-field">
                            <label htmlFor={`rec-label-${c.id}`}>{t("recipienteEtiqueta")}</label>
                            <input id={`rec-label-${c.id}`} name="label" type="text" required />
                          </div>
                          <div className="nn-field">
                            <label htmlFor={`rec-bruto-${c.id}`}>{t("recipienteBruto")}</label>
                            <CampoNumerico id={`rec-bruto-${c.id}`} name="grossKg" min={0} step="0.001" inputMode="decimal" required />
                          </div>
                          <div className="nn-field">
                            <label htmlFor={`rec-tara-${c.id}`}>{t("recipienteTara")}</label>
                            <CampoNumerico id={`rec-tara-${c.id}`} name="tareKg" min={0} step="0.001" inputMode="decimal" required />
                          </div>
                          <BotonDeEnvio>{t("recipienteGuardar")}</BotonDeEnvio>
                        </form>
                      </details>

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
                        {c.recipientes.length > 0 ? (
                          <p className="nn-muted">{t("pesoLoDanLosRecipientes")}</p>
                        ) : (
                          <div className="nn-field">
                            <label htmlFor={`peso-${c.id}`}>{t("extractedWeightLabel")}</label>
                            <CampoNumerico
                              id={`peso-${c.id}`}
                              name="extractedWeightKg"
                              min={0}
                              step="0.001"
                              inputMode="decimal"
                              defaultValue={c.extractedWeightKg ?? ""}
                            />
                          </div>
                        )}
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
            </details>
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
                    {insp.darkFrames !== null ? ` · ${t("darkFramesEnInspeccion", { n: insp.darkFrames })}` : null}
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
