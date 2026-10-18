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
 *
 * **Parte 1, R7 (tarea 9, 2026-10-02): enseña el proceso que CUBRE al lote**, no sólo los
 * propios. El pergamino no tiene proceso: lo tiene la cereza de la que salió. Se pinta la
 * cadena —el vigente y la historia de arriba, del más cercano al más lejano— con el lote
 * donde vive cada uno, y una mezcla dice de qué está hecha sin nombrar ningún proceso.
 * «Abrir proceso» y «Devolver a secado» sólo salen donde el servicio los aceptaría
 * (`puedeAbrirProceso`, `puedeDevolverASecado`); donde no, una frase con el motivo. Un
 * `LotProcessError` al cargar —un linaje de más de 64 generaciones— se dice, no es un 404
 * ni un 500.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { rotuloDeVersion } from "../../../../lib/recetas/rotuloDeVersion";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getLotSummary, TraceabilityAccessError, puedeGestionarLote } from "../../../../lib/traceability/lots";
import {
  coberturaDelLote,
  fraseDeNoAbrir,
  opcionesParaProceso,
  puedeAbrirProceso,
  puedeDevolverASecado,
  puedeGestionarProceso,
  LotProcessError,
} from "../../../../lib/traceability/lotProcess";
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

  const puedeGestionar = await puedeGestionarLote(user.userAccountId, lot);

  // Todo lo que recorre el linaje, en un solo `try`: la cobertura sube, las opciones bajan (las humedades de la
  // descendencia), y los dos predicados hacen las dos cosas. Cualquiera lanza `lineage_too_deep` con un linaje de más de 64
  // generaciones, y eso se DICE en la pantalla: no es un 404 —el lote existe— ni un 500.
  let cargado;
  try {
    const cobertura = await coberturaDelLote(user.userAccountId, lot.id);
    const abiertoAhora = cobertura.estado === "abierto";
    cargado = {
      cobertura,
      opciones: await opcionesParaProceso(user.userAccountId, lot.id),
      // Sólo hace falta preguntar si hay algo que ofrecer: con un proceso abierto que lo cubre, la página trata de ese.
      puede: !abiertoAhora && puedeGestionar ? await puedeAbrirProceso(user.userAccountId, lot.id) : null,
      puedeDevolver: puedeGestionar ? await puedeDevolverASecado(user.userAccountId, lot.id) : null,
      // Ronda de arreglo 1 (2026-10-02): los formularios del proceso abierto piden `manage` sobre el lote DONDE VIVE el proceso,
      // que puede ser un ancestro; `puedeGestionar` es el de ESTE lote, y con él se ofrecía lo que el servicio rechaza.
      // Un vigente `oculto` vive en un lote que quien mira no puede ver: sin su id no hay formularios que ofrecer.
      puedeGestionarElAbierto:
        abiertoAhora && cobertura.vigente && !cobertura.vigente.oculto
          ? await puedeGestionarProceso(user.userAccountId, cobertura.vigente.id)
          : false,
    };
  } catch (error) {
    if (error instanceof LotProcessError) {
      return (
        <div>
          <Link href={`/lots/${id}`} className="nn-back-link">
            {t("backToLot", { lotCode: lot.lotCode })}
          </Link>
          <h1>{t("processHeading")}</h1>
          <p className="nn-error">
            {error.message === "lineage_too_deep" ? t("processLineageTooDeep") : t("processLoadFailed", { detail: error.message })}
          </p>
        </div>
      );
    }
    throw error;
  }
  const { cobertura, puede, puedeDevolver, puedeGestionarElAbierto } = cargado;
  const { intervenciones, mediciones, grados, estadosDeCereza, motivosDeDevolucion } = cargado.opciones;
  // La misma etiqueta que ya usa la página del lote, para que una receta se
  // llame igual en las dos pantallas.
  const recetas = (await listRecipeVersionsForLot(user.userAccountId, lot.id)).map((v) => ({
    id: v.id,
    label: rotuloDeVersion(v, t),
  }));

  // Parte 1, R7: el proceso que CUBRE al lote, que puede vivir en un ancestro. Una mezcla no tiene vigente.
  // Revisión final (ronda de arreglo 1): un vigente `oculto` —vive en un lote que quien mira no puede ver— no trae ni su id ni su
  // humedad de cierre, así que no hay formularios ni «bloqueado» que decidir con él.
  const visible = cobertura.vigente && !cobertura.vigente.oculto ? cobertura.vigente : null;
  const abierto = cobertura.estado === "abierto" ? visible : null;
  const ultimo = visible;
  // Cerrado y por encima del objetivo: es el estado que bloquea la ENTRADA a
  // bodega. Es una de las dos condiciones con que se ofrece `devolverASecado`; la
  // otra, `enBodega`, está justo debajo. Ya no es la única (Parte 1, R7).
  // Con el vigente oculto no hay `ultimo`: el bloqueo llega como un booleano de la cobertura (mismo hecho que la compuerta).
  const bloqueado = cobertura.vigente?.oculto
    ? cobertura.vigente.bloqueadoAlEntrar
    : ultimo !== null && ultimo.endedAt !== null && (ultimo.diferenciaContraObjetivo ?? 0) > 0;
  // Parte 1, R7: «devolver a secado» se ofrece en todo lote en bodega o bloqueado al entrar. Antes
  // sólo salía con el cierre por encima del objetivo, y como la compuerta impide guardar algo así,
  // un lote EN BODEGA nunca lo veía, que es justo el caso que pide Daniel. Y desde la tarea 9, sólo
  // donde el servicio lo aceptaría (`puedeDevolverASecado`): un lote guardado sin proceso, una
  // mezcla o un dividido reciben la frase de por qué, no un formulario que siempre falla.
  const enBodega = (await getCurrentStorageAssignment(user.userAccountId, lot.id)) !== null;

  const fecha = (d: Date | null) => (d === null ? "—" : d.toISOString().slice(0, 10));

  return (
    <div>
      <Link href={`/lots/${id}`} className="nn-back-link">
        {t("backToLot", { lotCode: lot.lotCode })}
      </Link>
      <h1>{t("processHeading")}</h1>
      <p className="nn-muted">{t("processIntro")}</p>

      {!puedeGestionar ? <p className="nn-muted">{t("soloLecturaEnEsteLote")}</p> : null}

      {cobertura.composicion ? (
        <section className="nn-section">
          <p>
            {t("processMixture", {
              partes: cobertura.composicion.procesos
                .map((p) => (p.oculto ? t("processHiddenLot") : `${p.lot.lotCode} · ${p.recetaConVersion ?? t("processNoRecipeLabel")}`))
                .join(" + "),
            })}
          </p>
          {cobertura.composicion.ramaSinProceso ? <p className="nn-muted">{t("processMixtureWithUnprocessed")}</p> : null}
        </section>
      ) : null}

      {cobertura.cadena.map((p, i) =>
        p.oculto ? (
          <section key={`oculto-${i}`} className="nn-section">
            <p className="nn-muted">{t("processCoveringHidden", { state: p.abierto ? t("processOpen") : t("processClosed") })}</p>
          </section>
        ) : (
        <section key={p.id} className="nn-section">
          <h2>
            {/* M6 (revisión final): «Sin receta» en el idioma de la pantalla, no la constante del reporte. */}
            {t("processNumberHeading", { n: p.sequenceOrder })} · {p.processRecipeVersion?.recipe.name ?? t("processNoRecipeLabel")}
            {p.lot.id !== lot.id ? <span className="nn-muted"> · {t("processLivesIn", { lotCode: p.lot.lotCode })}</span> : null}
            {p.origen === "continuacion" ? <span className="nn-muted"> · {t("processOriginContinuation")}</span> : null}
            {p.origen === "parte_de_division" ? <span className="nn-muted"> · {t("processOriginPart")}</span> : null}
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
                  {/* Parte 2a: el «cómo» si se declaró; si no, el acto. La base exige uno de los dos (lot_process_intervention_catalogo_o_tipo). */}
                  {fecha(i.occurredAt)} · {(i.catalogValue ?? i.stepTypeValue)!.value}
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
        ),
      )}

      {/* Ronda de arreglo 1: con el permiso del lote DONDE VIVE el proceso, que es lo que piden sus servicios. */}
      {abierto !== null && puedeGestionarElAbierto ? (
        <>
          <section className="nn-section">
            <h2>{t("recordProcessInterventionButton")}</h2>
            <IntervencionForm lotProcessId={abierto.id} lotId={lot.id} opciones={intervenciones} />
          </section>

          <section className="nn-section">
            <h2>{t("closeProcessButton")}</h2>
            <CerrarProcesoForm lotProcessId={abierto.id} lotId={lot.id} mediciones={mediciones} />
          </section>

          <section className="nn-section">
            <h2>{t("processChangeIntentButton")}</h2>
            <CambiarIntencionForm lotProcessId={abierto.id} lotId={lot.id} actual={abierto.intent} />
            <CambiarObjetivoForm
              lotProcessId={abierto.id}
              lotId={lot.id}
              actual={abierto.targetMoisturePct.toNumber()}
            />
          </section>
        </>
      ) : null}

      {(bloqueado || enBodega) && puedeDevolver ? (
        <section className="nn-section">
          <h2>{t("processBackToDryingButton")}</h2>
          {bloqueado ? <p className="nn-error">{t("processBlockedFromStorage")}</p> : null}
          {puedeDevolver.puede ? (
            <DevolverASecadoForm lotId={lot.id} motivos={motivosDeDevolucion} />
          ) : (
            <p className="nn-muted">{t(`processCannotReturn_${puedeDevolver.motivo}`)}</p>
          )}
        </section>
      ) : null}

      {/* Parte 1, R2 (tarea 9): «Abrir proceso» sólo donde el servicio lo aceptaría; donde no, el motivo. Con un proceso
          abierto que cubre al lote no se pregunta: la página ya trata de él. */}
      {puede ? (
        <section className="nn-section">
          <h2>{t("openProcessButton")}</h2>
          {puede.puede ? (
            <>
              {cobertura.cadena.length > 0 || cobertura.composicion ? <p className="nn-muted">{t("processOpenAnotherHelp")}</p> : null}
              <AbrirProcesoForm lotId={lot.id} recetas={recetas} grados={grados} estadosDeCereza={estadosDeCereza} />
            </>
          ) : (
            // Ronda de arreglo 1: en bodega sólo se manda a «Devolver a secado» si esta misma página lo ofrece.
            <p className="nn-muted">{t(`processCannotOpen_${fraseDeNoAbrir(puede.motivo, puedeDevolver)}`)}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
