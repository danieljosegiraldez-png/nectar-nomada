import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../../lib/auth/session";
import { TraceabilityAccessError } from "../../../../../lib/traceability/lots";
import {
  listarIntervenciones,
  productosFitosanitarios,
  bloquesDeLaParcela,
  contextoDeManejo,
} from "../../../../../lib/traceability/intervenciones";
import { carenciaDeIntervencion, reentradaDeIntervencion } from "../../../../../lib/traceability/carenciaDeIntervencion";
import { lecturaDeTrampaQueMotivo, listPlantSpecimens, type LecturaDeTrampa } from "../../../../../lib/traceability/specimens";
import { getObserverCandidates } from "../../../../../lib/traceability/lots";
import { mostrarFecha, mostrarInstante } from "../../../../../lib/time/mostrarInstante";
import { IntervencionForm, type IntervencionFormValues } from "../../../../components/traceability/IntervencionForm";
import {
  textoDeTipoDeManejo,
  textoDeObjetivoDeManejo,
  textoDeMetodoDeManejo,
} from "../../../../components/traceability/etiquetasDeManejo";
import { origenDeLaCarencia } from "../../../../../lib/traceability/origenDeLaCarencia";

export const dynamic = "force-dynamic";

/**
 * El detalle de una intervención fitosanitaria — Tarea 8, spec §5.
 *
 * `listarIntervenciones` trae TODAS las de la parcela, vigentes y corregidas;
 * se busca aquí adentro en vez de pedir una función nueva de «una sola» — la
 * corrección de ESTA intervención, si la hay, es una fila más de esa misma
 * lista (`correctsId === interventionId`), y buscarla ahí evita una segunda
 * consulta con su propio permiso que decir.
 */
export default async function ManejoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; interventionId: string }>;
  searchParams: Promise<{ ok?: string | string[] }>;
}) {
  const { id, interventionId } = await params;
  // `corregirIntervencionFormAction` redirige aquí con `?ok=corregido` y esta pantalla no lo leía.
  const okCrudo = (await searchParams).ok;
  const ok = Array.isArray(okCrudo) ? okCrudo[0] : okCrudo;
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

  const lista = await listarIntervenciones(user.userAccountId, id);
  const intervencion = lista.find((i) => i.id === interventionId);
  if (!intervencion) notFound();
  const correccion = lista.find((i) => i.correctsId === interventionId) ?? null;

  const [productos, { people, selfPersonId }, plantas, trampa, bloques] = await Promise.all([
    productosFitosanitarios(user.userAccountId, id),
    getObserverCandidates(user.userAccountId, [{ locationId: id }]),
    listPlantSpecimens(user.userAccountId, id),
    intervencion.motivoObservationId
      ? lecturaDeTrampaQueMotivo(user.userAccountId, intervencion.motivoObservationId)
      : Promise.resolve(null),
    // Ronda de arreglos 1 (hallazgo crítico): los bloques de manejo se leen
    // con el MISMO permiso (`lot:view`/`manage`) que ya exige
    // `listarIntervenciones` — nunca `location:manage_attributes`. Antes,
    // sin ese permiso distinto, corregir una intervención de bloque perdía
    // el bloque en silencio: no había forma de listarlo NI de conservarlo.
    // Ver el docstring de `bloquesDeLaParcela`.
    bloquesDeLaParcela(user.userAccountId, id),
  ]);

  const ahora = new Date();
  const carencia = carenciaDeIntervencion(intervencion, ahora);
  const reentrada = reentradaDeIntervencion(intervencion, ahora);

  // Tarea 8, ronda de arreglos 1 (menor #1): las tres tablas salen de
  // `etiquetasDeManejo.ts`, compartida con las otras 3 pantallas.
  const textoDeTipo = textoDeTipoDeManejo(t);
  const textoDeObjetivo = textoDeObjetivoDeManejo(t);
  const textoDeMetodo = textoDeMetodoDeManejo(t);

  // Rúbrica de veracidad (spec §4.3): cada carencia dice de dónde salió. La
  // MISMA función que usa el formulario para su rótulo (ronda de arreglos 1,
  // importante #1) — `esLaOriginal: true` porque aquí se enseña el valor YA
  // GUARDADO, no una precarga en vivo.
  const origenDeCarencia = (l: (typeof intervencion.lineas)[number]) =>
    origenDeLaCarencia(l.withdrawalDays, l.material.defaultWithdrawalDays, true);
  const textoDeOrigen = {
    del_producto: t("manejoOriginFromProduct"),
    indicada_al_registrar: t("manejoOriginDeclaredAtEntry"),
    no_declarada: t("manejoOriginNotDeclared"),
  };

  const textoDeCarencia = (() => {
    if (carencia.estado === "no_aplica") return t("manejoWithdrawalNotApplicable");
    if (carencia.estado === "cumplida") return t("manejoWithdrawalDone", { fecha: mostrarFecha(carencia.libreDesde, location.timezone) });
    if (carencia.estado === "conocida") {
      return t("plotDashboardAlertWithdrawal", { fecha: mostrarFecha(carencia.libreDesde, location.timezone), dias: carencia.diasQueFaltan });
    }
    return t("plotDashboardAlertWithdrawalUnknown", {
      fecha: carencia.alMenosHasta == null ? t("notRecorded") : mostrarFecha(carencia.alMenosHasta, location.timezone),
    });
  })();

  const textoDeReentrada = (() => {
    if (reentrada.estado === "no_aplica") return t("manejoReentryNotApplicable");
    if (reentrada.estado === "cumplida") return t("manejoReentryDone", { hasta: mostrarInstante(reentrada.libreDesde, location.timezone) });
    if (reentrada.estado === "vigente") return t("plotDashboardAlertReentry", { hasta: mostrarInstante(reentrada.libreDesde, location.timezone) });
    return t("plotDashboardAlertReentryUnknown", {
      fecha: reentrada.alMenosHasta == null ? t("notRecorded") : mostrarFecha(reentrada.alMenosHasta, location.timezone),
    });
  })();

  // F2 §4: la escala (`brocaLevel`) es la lectura principal ahora — el
  // número es adicional, y sólo se agrega entre paréntesis si alguien
  // contó. `manejoTrapReading`/`manejoTrapReadingUnknownCount` quedan como
  // respaldo defensivo para una lectura anterior a la pieza 2 que no tenga
  // escala.
  const lecturaTexto = (l: Pick<LecturaDeTrampa, "observedAt" | "captureCount" | "brocaLevel">) => {
    const fecha = mostrarFecha(l.observedAt, location.timezone);
    if (l.brocaLevel == null) {
      return l.captureCount != null ? t("manejoTrapReading", { fecha, n: l.captureCount }) : t("manejoTrapReadingUnknownCount", { fecha });
    }
    const nivel = t(`trapsLevel_${l.brocaLevel}`);
    return t("manejoTrapReadingLevel", { fecha, nivel: l.captureCount != null ? `${nivel} (${l.captureCount})` : nivel });
  };

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${location.id}`}>{t("manejoBackToPlot")}</Link>
      </p>
      <h1>{t("manejoDetailTitle", { fecha: mostrarFecha(intervencion.occurredAt, location.timezone) })}</h1>
      {ok === "corregido" && <p className="nn-notice nn-notice-success" role="status">{t("okCorreccion")}</p>}

      <dl className="nn-detail-meta">
        <p>
          {t("manejoKindLabel")}: {textoDeTipo[intervencion.kind]}
        </p>
        <p>
          {t("manejoTargetLabel")}: {textoDeObjetivo[intervencion.target]}
          {intervencion.targetNote ? ` — ${intervencion.targetNote}` : ""}
        </p>
        {intervencion.method ? (
          <p>
            {t("manejoMethodLabel")}: {textoDeMetodo[intervencion.method]}
          </p>
        ) : null}
        {intervencion.mixVolume != null ? (
          <p>
            {t("manejoMixVolumeLabel")}: {intervencion.mixVolume.toString()} {intervencion.mixUnit ?? ""}
          </p>
        ) : null}
        <p>
          {t("manejoOccurredAtLabel")}: {mostrarInstante(intervencion.occurredAt, location.timezone)}
        </p>
        {intervencion.operator ? (
          <p>
            {t("manejoOperatorLabel")}: {intervencion.operator.displayName}
          </p>
        ) : null}
        <p>
          {t("manejoAreaLabel")}:{" "}
          {intervencion.areas.length === 0
            ? t("manejoAreaWholePlot")
            : // Tarea 5 PR B: cada área es una planta o un bloque (nunca las
              // dos — CHECK en la base), y las dos traen su nombre.
              intervencion.areas.map((a) => a.specimen?.commonName ?? a.plotBlock?.name ?? "—").join(", ")}
        </p>
        {intervencion.notes ? (
          <p>
            {t("notesLabel")}: {intervencion.notes}
          </p>
        ) : null}
      </dl>

      {correccion ? (
        <p className="nn-detail-meta">
          {t("manejoCorrectedBy")}:{" "}
          <Link href={`/plots/${location.id}/manejo/${correccion.id}`}>
            {mostrarFecha(correccion.occurredAt, location.timezone)}
          </Link>{" "}
          — {correccion.correctionReason}
        </p>
      ) : null}

      {intervencion.lineas.length > 0 ? (
        <section className="nn-section">
          <h2>{t("manejoLinesHeading")}</h2>
          <ul className="nn-detail-meta">
            {intervencion.lineas.map((l) => (
              <li key={l.id}>
                {l.material.name}
                {l.quantity != null ? ` · ${l.quantity.toString()} ${l.unit ?? ""}` : ""}
                {l.consumableLot ? ` · ${l.consumableLot.batchLabel}${l.lotExpiredAtApplication ? ` (${t("manejoLotExpired")})` : ""}` : ""}
                {" · "}
                {t("manejoWithdrawalLabel")}: {l.withdrawalDays ?? "—"} ({textoDeOrigen[origenDeCarencia(l)]})
                {" · "}
                {t("manejoReentryLabel")}: {l.reentryHours ?? t("manejoOriginNotDeclared")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="nn-section">
        <h2>{t("manejoStatusHeading")}</h2>
        <p>{textoDeCarencia}</p>
        <p>{textoDeReentrada}</p>
      </section>

      {trampa ? (
        <section className="nn-section">
          <h2>{t("manejoTrapHeading")}</h2>
          <p>{lecturaTexto(trampa.motivo)}</p>
          {trampa.siguiente ? <p>{lecturaTexto(trampa.siguiente)}</p> : <p className="nn-muted">{t("manejoNoFollowUpReading")}</p>}
        </section>
      ) : null}

      {!correccion ? (
        <details className="nn-section">
          <summary style={{ fontSize: "1.25rem", fontWeight: 600 }}>{t("manejoCorrectSummary")}</summary>
          <IntervencionForm
            modo="corregir"
            locationId={location.id}
            interventionId={intervencion.id}
            productos={productos}
            // Quien la hizo sigue ofrecido aunque haya dejado la finca (Codex, hallazgo 1): sin su
            // opción, el desplegable caería en «ninguno» y corregir otro dato borraría al operador.
            observers={
              intervencion.operatorPersonId && intervencion.operator && !people.some((p) => p.id === intervencion.operatorPersonId)
                ? [{ id: intervencion.operatorPersonId, displayName: intervencion.operator.displayName }, ...people]
                : people
            }
            selfPersonId={selfPersonId}
            specimens={plantas}
            bloques={bloques.map((b) => ({ id: b.id, name: b.name }))}
            claveDeEnvio={crypto.randomUUID()}
            valores={
              {
                kind: intervencion.kind,
                target: intervencion.target,
                targetNote: intervencion.targetNote,
                method: intervencion.method,
                mixVolume: intervencion.mixVolume == null ? null : Number(intervencion.mixVolume),
                mixUnit: intervencion.mixUnit,
                // Ronda final, hallazgo 1: ISO crudo. `IntervencionForm` lo
                // convierte al reloj de pared en el NAVEGADOR — precargarlo
                // aquí con `paraCampoLocal` horneaba la zona del SERVIDOR.
                occurredAt: intervencion.occurredAt.toISOString(),
                operatorPersonId: intervencion.operatorPersonId,
                motivoObservationId: intervencion.motivoObservationId,
                specimenIds: intervencion.areas
                  .map((a) => a.specimenId)
                  .filter((sid): sid is string => sid != null),
                // Tarea 5 PR B, decisión del controlador #1: corregir sin
                // tocarlos los conserva, igual que las plantas.
                plotBlockIds: intervencion.areas
                  .map((a) => a.plotBlockId)
                  .filter((bid): bid is string => bid != null),
                notes: intervencion.notes,
                lineas: intervencion.lineas.map((l) => ({
                  materialId: l.materialId,
                  consumableLotId: l.consumableLotId,
                  quantity: l.quantity == null ? null : Number(l.quantity),
                  unit: l.unit,
                  withdrawalDays: l.withdrawalDays,
                  reentryHours: l.reentryHours,
                })),
              } satisfies IntervencionFormValues
            }
          />
        </details>
      ) : null}
    </div>
  );
}
