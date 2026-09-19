import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getFincasConTrampas, getFincaTrampas, FincaTrapAccessError, elegirFincaDeTrampas } from "../../../../lib/traceability/fincaTrampas";
import { estadoDeTrampa, ordenDeRonda, proximaRevisionDe, trampasParaAviso } from "../../../../lib/traceability/pendienteDeTrampas";
import { claveDeTituloDeBloque } from "../../../../lib/traceability/plotBlocks";
import { diaDeHoy } from "../../../../lib/time/diaDeHoy";
import { RondaDeTrampaForm } from "../../../components/traceability/RondaDeTrampaForm";
import { FieldSyncControls } from "../../../components/traceability/FieldSyncControls";
import { SincronizarFotosDeRonda } from "../../../components/traceability/SincronizarFotosDeRonda";

export const dynamic = "force-dynamic";

/**
 * La ronda de trampas — spec §4.2, pensada para el móvil: una tarjeta grande por
 * trampa activa, primero las que tocan revisar. Sólo trampas activas: una retirada
 * no se revisa (mismo criterio que `recordTrapCheck`).
 *
 * La elección de finca (una entra directo, varias ofrecen selector, ninguna dice
 * el mensaje explícito) es la misma de `/finca/trampas` — Tarea 8 —, extraída a
 * `elegirFincaDeTrampas` en vez de copiarse.
 */
export default async function RondaDeTrampasPage({
  searchParams,
}: {
  searchParams: Promise<{ finca?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fincas = await getFincasConTrampas(user.userAccountId);
  if (fincas.length === 0) {
    return <p className="nn-error" role="alert">{t("fincaTrapsNoAnyAccess")}</p>;
  }

  const { finca: fincaElegida } = await searchParams;
  const farmLocationId = elegirFincaDeTrampas(fincas, fincaElegida);

  if (farmLocationId == null) {
    return (
      <div>
        <h1>{t("trapsRoundTitle")}</h1>
        <ul>
          {fincas.map((f) => (
            <li key={f.id}><Link href={`/finca/trampas/ronda?finca=${f.id}`}>{f.name}</Link></li>
          ))}
        </ul>
      </div>
    );
  }

  let detalle;
  try {
    detalle = await getFincaTrampas(user.userAccountId, farmLocationId);
  } catch (error) {
    if (error instanceof FincaTrapAccessError) {
      return <p className="nn-error" role="alert">{t("fincaTrapsNoAccess")}</p>;
    }
    throw error;
  }

  const hoy = diaDeHoy(new Date(), null);
  // El valor por defecto del campo de fecha del formulario corto (Tarea 10,
  // ruling del controlador) es un «hoy» distinto del de arriba: éste es el
  // día en la zona DE LA FINCA, calculado en el servidor y pasado como prop
  // — nunca un `hoyLocalISO()` en el cliente, que daría el día del
  // dispositivo y además desajustaría la hidratación. El `hoy` de arriba
  // sigue usando el respaldo UTC−12 a propósito: es para vencimientos, que
  // no deben afirmar antes de tiempo (ver `diaDeHoy`), no para un valor que
  // el operario puede editar.
  const hoyDeLaFinca = diaDeHoy(new Date(), detalle.farmTimezone);
  const paraAviso = new Map(trampasParaAviso(detalle.trampas).map((t) => [t.id, t]));

  const activas = detalle.trampas
    .filter((tr) => tr.status === "active")
    .map((tr) => {
      const entrada = paraAviso.get(tr.id)!;
      return {
        ...tr,
        estadoActual: estadoDeTrampa({ hoy, trampa: entrada, regla: detalle.reglaDeTrampas }),
        proximaRevision: proximaRevisionDe(entrada, detalle.reglaDeTrampas),
      };
    });
  const ordenadas = ordenDeRonda(activas);

  return (
    <div>
      {/* Tarea 11 — spec §4.3: «el indicador existente lo cuenta». La ronda
          registrada sin señal se ve y se sincroniza desde aquí, igual que en
          `/plots/[id]`. */}
      <FieldSyncControls />
      {/* Tarea 12 — su propio indicador: la foto viaja por una cola distinta
          (`lib/sync/trapPhotoQueue.ts`), así que `FieldSyncControls` no la
          cuenta. */}
      <SincronizarFotosDeRonda />
      <p className="nn-detail-meta"><Link href="/finca/trampas">{t("plotDashboardBackLink")}</Link></p>
      <h1>{t("trapsRoundTitleNamed", { name: detalle.farmName })}</h1>

      {ordenadas.length === 0 ? (
        <p className="nn-muted">{t("trapsNone")}</p>
      ) : (
        ordenadas.map((trampa) => {
          const claveBloque = trampa.bloque ? claveDeTituloDeBloque(trampa.bloque.blockType) : null;
          const { estado, diasDeRetraso } = trampa.estadoActual;
          // Tres textos ejemplo de spec §4.2 más los dos estados que ya tenía
          // la tabla de /finca/trampas: el día exacto del vencimiento es
          // «toca hoy», no «al día» a secas, aunque las dos comparten estado
          // (estadoDeTrampa no distingue diasDeRetraso === 0 de < 0).
          const tocaHoy = estado === "al_dia" && diasDeRetraso === 0;
          const colorDelEstado =
            estado === "toca_revisar" || estado === "lectura_alta"
              ? "var(--nn-error)"
              : tocaHoy
                ? "var(--nn-color-warning, #b45309)"
                : undefined;
          const textoDelEstado =
            estado === "toca_revisar"
              ? t("trapEstadoTextoRetraso", { dias: diasDeRetraso ?? 0 })
              : estado === "lectura_alta"
                ? t("trapEstado_lectura_alta")
                : tocaHoy
                  ? t("trapEstadoTextoHoy")
                  : estado === "al_dia"
                    ? t("trapEstado_al_dia")
                    : t("trapEstado_sin_regla");

          return (
            <article key={trampa.id} className="nn-card">
              <h2>{t("trapsNumber", { n: trampa.trapNumber ?? t("notRecorded") })}</h2>
              <p className="nn-detail-meta">
                {trampa.plotName}
                {trampa.bloque ? (
                  <> · {claveBloque ? t(claveBloque, { name: trampa.bloque.name }) : trampa.bloque.name}</>
                ) : null}
              </p>
              <p>
                <strong style={{ color: colorDelEstado }}>{textoDelEstado}</strong>
              </p>
              <p className="nn-detail-meta">
                {trampa.ultimaRevision
                  ? t("trapsLastCheck", {
                      fecha: trampa.ultimaRevision.observedAt.toISOString().slice(0, 10),
                      lectura: trampa.ultimaRevision.brocaLevel
                        ? t(`trapsLevel_${trampa.ultimaRevision.brocaLevel}`)
                        : t("notRecorded"),
                    })
                  : t("trapsNeverChecked")}
              </p>
              {trampa.proximaRevision ? (
                <p className="nn-detail-meta">{t("trapsNextReview", { fecha: trampa.proximaRevision })}</p>
              ) : null}
              <details>
                <summary>{t("trapCheckTitle")}</summary>
                {/* Tarea 11, fix round 2 — la clave de idempotencia ya NO es
                    un prop generado aquí: `RondaDeTrampaForm` la genera en
                    cada envío (`generarClaveDeRevision`), porque la tarjeta
                    sigue montada entre envíos y una clave fija por render
                    colisionaría en un segundo envío sin señal. */}
                <RondaDeTrampaForm locationId={trampa.plotId} specimenId={trampa.id} hoy={hoyDeLaFinca} />
              </details>
            </article>
          );
        })
      )}
    </div>
  );
}
