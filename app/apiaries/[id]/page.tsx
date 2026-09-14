import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getApiaryDetail, getManageableApiaryProjects } from "../../../lib/apiary/hives";
import { densidadDePolinizacion } from "../../../lib/apiary/polinizacion";
import { coordenadasPropuestas } from "../../../lib/traceability/coordenadasDelSitio";
import { coloniasPorIrregularidad } from "../../../lib/apiary/irregularidades";
import { avisosDeEnjambrazon } from "../../../lib/apiary/avisoDeEnjambrazon";
import { alcanceDelAlimento } from "../../../lib/apiary/alcanceDelAlimento";
import { tratamientosPorObjetivo } from "../../../lib/apiary/objetivoDelTratamiento";
import { retirosPendientes } from "../../../lib/apiary/cierreDeEvento";
import { completarCierreDeTratamientoFormAction } from "../../actions/apiary";
import { confirmarCoordenadasAction } from "../../actions/traceability";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";
import { NewHiveForm } from "../../components/apiary/NewHiveForm";
import { Ayuda } from "../../components/apiary/Ayuda";
import { TrasladoForm } from "../../components/apiary/TrasladoForm";
import { destinosCandidatos } from "../../../lib/apiary/traslado";
import { listFieldSessions } from "../../../lib/traceability/fieldSessions";
import { getObserverCandidates } from "../../../lib/traceability/lots";
import { FieldSessionStartForm } from "../../components/traceability/FieldSessionForms";
import { mostrarInstante } from "../../../lib/time/mostrarInstante";

export const dynamic = "force-dynamic";

export default async function ApiaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const t = await getTranslations("Apiary");
  const tt = await getTranslations("Traceability");
  const [apiary, projects, jornadas, { people, selfPersonId }] = await Promise.all([
    getApiaryDetail(user.userAccountId, id),
    getManageableApiaryProjects(user.userAccountId),
    listFieldSessions(user.userAccountId, id),
    getObserverCandidates(user.userAccountId),
  ]);

  // `getApiaryDetail` ya autorizó este sitio; esto lee hechos del id concedido.
  const polinizacion = await densidadDePolinizacion(id);
  const coordenadas = await coordenadasPropuestas(id);

  // Ventana MÓVIL de doce meses, no año natural: el dueño la eligió así el
  // 2026-09-11 porque el repositorio no define ninguna temporada, y un año
  // natural deja el reporte casi vacío cada enero.
  const ahora = new Date();
  // Anexo E §8: los apiarios de la MISMA organización, porque un traslado entre dueños no
  // es un traslado sino una venta, y eso no es este formulario. Si la ubicación no declara
  // organización la lista sale vacía y el formulario no se pinta — que es lo correcto: sin
  // saber de quién es el sitio no hay a dónde mover. Reusa el `ahora` de aquí abajo en vez
  // de declarar un segundo: dos relojes en la misma página pueden dar días distintos a
  // medianoche.
  const destinos = apiary.organizationId
    ? await destinosCandidatos(apiary.organizationId, apiary.id, ahora)
    : [];
  const haceUnAno = new Date(ahora.getFullYear() - 1, ahora.getMonth(), ahora.getDate());
  const irregularidades = await coloniasPorIrregularidad(id, haceUnAno, ahora);
  // A9 · Anexo B §2.2 — el aviso de enjambrazón. Ventana más corta que la de las
  // irregularidades a propósito: un aviso de hace ocho meses es historia, no
  // aviso. Sesenta días cubre de sobra el ciclo de una celda real, que va de días
  // a un par de semanas.
  const haceSesentaDias = new Date(ahora.getTime() - 60 * 24 * 60 * 60 * 1000);
  const avisos = await avisosDeEnjambrazon(id, haceSesentaDias, ahora);
  // A9 · Anexo B §3 — «alcanza hasta». Catorce días de antelación: el aviso tiene
  // que llegar con tiempo de volver al sitio, y en Toabré el hueco entre el
  // vencimiento y el hallazgo fue de días, no de horas.
  const alcance = await alcanceDelAlimento(id, ahora, 14);
  // A9 · Anexo B §4 — «eficacia por objetivo; hoy no se puede agrupar». Misma
  // ventana móvil de doce meses que las irregularidades, por la misma razón.
  const tratamientos = await tratamientosPorObjetivo(id, haceUnAno, ahora);
  // A9 · Anexo B §4 — «las tiras que no se retiran generan resistencia». Espera a
  // que pase la carencia declarada, o catorce días si nadie la declaró.
  const retiros = await retirosPendientes(id, ahora, 14);

  return (
    <div>
      <p>
        <Link href="/apiaries">{t("backToApiaries")}</Link>
      </p>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{apiary.name}</h1>

      {/* Dónde está este sitio. **La sección aparece siempre**, y ése es el
          arreglo del 2026-09-08: antes se dibujaba sólo si el sitio ya tenía
          coordenadas o si alguna visita las proponía. Medido: de las 24
          ubicaciones que existen, CERO tienen coordenadas, y ninguna visita ha
          traído lectura de GPS todavía — o sea que la única forma de declarar
          unas coordenadas estaba detrás de una condición que nadie podía
          cumplir. El mapa no esperaba a Mapbox ni a Leaflet: esperaba a un
          formulario alcanzable.

          El sistema PROPONE y la persona DECLARA. `CLAUDE.md` §3 prohíbe
          guardar como hecho un valor inferido, y un GPS bajo dosel cerrado se
          equivoca por decenas de metros. Sin propuesta los campos salen
          vacíos y se teclean a mano, que es justo lo que faltaba; con
          propuesta salen rellenos y editables, que es lo que ya hacían. */}
      <section className="nn-section">
        <h2>{tt("coordsHeading")}</h2>
        <p className="nn-detail-meta">
          <span>
            {coordenadas.yaDeclaradas
              ? tt("coordsDeclared", {
                  lat: coordenadas.yaDeclaradas.latitude.toFixed(6),
                  lon: coordenadas.yaDeclaradas.longitude.toFixed(6),
                })
              : tt("coordsNotDeclared")}
          </span>
          <span>{tt("coordsSamples", { count: coordenadas.muestras })}</span>
          {coordenadas.dispersionM !== null ? (
            <span>{tt("coordsSpread", { metros: Math.round(coordenadas.dispersionM) })}</span>
          ) : null}
          {coordenadas.mejorPrecisionM !== null ? (
            <span>{tt("coordsAccuracy", { metros: Math.round(coordenadas.mejorPrecisionM) })}</span>
          ) : null}
        </p>

        {/* Se dice que no hay propuesta, pero ya no en lugar del formulario:
            al lado de él. «Nadie ha traído lectura» explica por qué los campos
            están vacíos, no por qué no se puede escribir. */}
        {coordenadas.propuesta === null ? <p className="nn-muted">{tt("coordsNoSamples")}</p> : null}

        <form action={confirmarCoordenadasAction} className="nn-form" style={{ maxWidth: 420 }}>
          <input type="hidden" name="locationId" value={id} />
          {/* Los valores van en campos editables, no ocultos: quien declara
              tiene que poder corregir la propuesta, que para eso es una
              propuesta. */}
          <div className="nn-field">
            <label htmlFor="coords-lat">{tt("coordsLatitude")}</label>
            <input id="coords-lat" name="latitude" type="text" inputMode="decimal" defaultValue={coordenadas.propuesta ? coordenadas.propuesta.latitude.toFixed(6) : ""} required />
          </div>
          <div className="nn-field">
            <label htmlFor="coords-lon">{tt("coordsLongitude")}</label>
            <input id="coords-lon" name="longitude" type="text" inputMode="decimal" defaultValue={coordenadas.propuesta ? coordenadas.propuesta.longitude.toFixed(6) : ""} required />
          </div>
          <div className="nn-field">
            <label htmlFor="coords-reason">{tt("coordsReason")}</label>
            <input id="coords-reason" name="reason" type="text" placeholder={tt("coordsReasonPlaceholder")} />
          </div>
          {coordenadas.distanciaALoDeclaradoM !== null && coordenadas.distanciaALoDeclaradoM > 50 ? (
            <p className="nn-muted">
              {tt("coordsDiffersFromDeclared", { metros: Math.round(coordenadas.distanciaALoDeclaradoM) })}
            </p>
          ) : null}
          <BotonDeEnvio className="nn-button">{tt("coordsConfirm")}</BotonDeEnvio>
        </form>
      </section>


      {/* A9.9 (D6) — el compromiso de polinización, que es el único número que
          convierte la conversación con el cliente en algo que no sea una
          impresión. Sólo aparece si hay compromiso vigente: un sitio de
          producción no tiene por qué enseñar una fila vacía.

          Usa `nn-detail-meta`, que ya existe, en vez de estrenar clases: la
          banda de vitales de A9.8 sigue en revisión y dos hojas compitiendo por
          el mismo sitio envejecen por separado.

          El déficit sale como RANGO porque el objetivo lo es —«4-6 colmenas/ha»
          es lo que declaró el dueño—, y colapsarlo inventaría una precisión que
          nadie dio. */}
      {polinizacion.length > 0 ? (
        <section className="nn-section">
          <h2>{t("pollinationHeading")}</h2>
          {polinizacion.map((p) => (
            <div key={p.compromisoId}>
              <p className="nn-detail-meta">
                <span>{t("pollinationHectares", { hectares: p.hectareasComprometidas })}</span>
                <span>{t("pollinationTarget", { min: p.objetivoMin, max: p.objetivoMax })}</span>
                <span>{t("pollinationColonies", { count: p.colonias })}</span>
                <span>
                  {p.deficitParaMin === 0 && p.deficitParaMax === 0
                    ? t("pollinationNoDeficit")
                    : t("pollinationDeficit", { min: p.deficitParaMin, max: p.deficitParaMax })}
                </span>
              </p>
              {/* De dónde salió el numerador. Se dice porque D6 avisa de que el
                  conteo del sistema y el declarado en la visita llevan
                  divergiendo desde diciembre, y un número sin fuente invita a
                  creer que son el mismo. */}
              <p className="nn-muted">{t(`pollinationCountSource_${p.fuenteDelConteo}`)}</p>
              {/* La divergencia se dice en voz alta. D6: en Toabré los dos
                  conteos llevan separándose desde diciembre, y eso es una
                  señal sobre el sitio, no un error que haya que esconder. */}
              {p.divergen ? (
                <p className="nn-muted">
                  {t("pollinationCountDiverges", { declarado: p.coloniasDeclaradas ?? 0, sistema: p.coloniasDelSistema })}
                </p>
              ) : null}
              {p.contractReference ? <p className="nn-muted">{p.contractReference}</p> : null}
            </div>
          ))}
        </section>
      ) : null}


      {/* Lo que se vio en las inspecciones, contado. Es el reporte que el Anexo
          B §2.3 nombra —«todas las colonias con varroa esta temporada»— y hasta
          hoy existía sin pantalla.

          ## Por qué aquí, y no en el tablero de series

          El Anexo C §2 fija el orden del tablero del sitio y este reporte no es
          ninguno de sus seis puntos: es de los de §3.3, «otros reportes que
          salen casi gratis», que no tienen sitio asignado. Va **después** de los
          vitales y la polinización —que son lo que exige acción— y **antes** del
          historial de visitas, porque es una lente sobre el pasado reciente y no
          una alarma.

          ## Por qué una tabla y no un gráfico

          El Anexo C §2.1 pide «una serie por gráfico», y esto **no es una
          serie**: es un corte de doce meses. Dibujarlo como curva inventaría una
          evolución que estos datos no tienen.

          ## Por qué dice «últimos 12 meses» y no «temporada»

          Porque el repositorio **no define** ninguna temporada — comprobado: las
          únicas menciones en el esquema son comentarios. Decisión del dueño el
          2026-09-11: ventana móvil de doce meses. El día que defina el ciclo
          real, esto recibe el rango como parámetro y sólo cambia el rótulo. */}
      {/* La sección entera se oculta si NADA se vio: trece ceros en un sitio sin
          hallazgos son ruido, no información, y el resto de esta pantalla ya
          esconde lo vacío igual. Los ceros que sí se enseñan son los de dentro
          del reporte, cuando hay al menos un hallazgo — ahí la distinción entre
          «no hay» y «nadie miró» sí importa. */}
      {/* Las tiras sin retirar. Con su formulario por fila, porque esto se completa
          en la casa —semanas después de aplicar— y no en el campo: es la única
          escritura del apiario que NO pasa por la cola offline, y su fila de
          auditoría lo dice con `sourceInterface = "apiary.close"`. */}
      {retiros.length > 0 ? (
        <section className="nn-section">
          <h2>{t("retirosHeading")}</h2>
          <Ayuda resumen={t("ayudaResumen")}>{t("retirosAyuda")}</Ayuda>
          <ul>
            {retiros.map((r) => (
              <li key={r.colonyEventId} style={{ marginBottom: "0.75rem" }}>
                {t("retirosFila", {
                  colmena: r.hiveIdentifier,
                  producto: r.product ?? t("retiroSinProducto"),
                  dias: r.diasDesde,
                })}
                <form action={completarCierreDeTratamientoFormAction} className="nn-form" style={{ margin: "0.25rem 0 0" }}>
                  <input type="hidden" name="colonyEventId" value={r.colonyEventId} />
                  <input type="hidden" name="locationId" value={apiary.id} />
                  <div className="nn-field">
                    <label htmlFor={`retiro-${r.colonyEventId}`}>{t("retiroFechaLabel")}</label>
                    {/* DÍA, no instante: nadie retira una tira «a las 10:30». */}
                    <input id={`retiro-${r.colonyEventId}`} name="removalDate" type="date" required />
                  </div>
                  <BotonDeEnvio>{t("retiroGuardar")}</BotonDeEnvio>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* El alimento que se acaba, arriba del todo: es lo que el Anexo C §1.2
          llama el modo de fallo de Toabré. Las filas `sin_fecha` SE ENSEÑAN —una
          alimentación sin «alcanza hasta» es una colonia de la que no se puede
          avisar, y esconderla la contaría como tranquila—. */}
      {alcance.length > 0 ? (
        <section className="nn-section">
          <h2>{t("alcanceHeading")}</h2>
          <ul>
            {alcance.map((a) => (
              <li key={a.colonyId} className={a.estado === "sin_fecha" ? "nn-vital-sin-registro" : undefined}>
                {t("alcanceRow", {
                  colmena: a.hiveIdentifier,
                  estado:
                    a.estado === "sin_fecha"
                      ? t("alcance_sin_fecha")
                      : a.estado === "vencido"
                        ? t("alcance_vencido", { dias: Math.abs(a.diasRestantes ?? 0) })
                        : t("alcance_por_vencer", { dias: a.diasRestantes ?? 0 }),
                  fecha: a.alimentadaEl.toISOString().slice(0, 10),
                })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* El aviso de enjambrazón, ARRIBA de las irregularidades: es lo único de
          esta pantalla que pide ir a una caja hoy. Se oculta cuando no hay
          ninguno —un aviso vacío enseña a no mirar la sección— y lo que apaga un
          aviso es una inspección que MIRE y diga «no hay», no el paso del tiempo
          dentro de la ventana. */}
      {avisos.length > 0 ? (
        <section className="nn-section">
          <h2>{t("swarmWarningHeading")}</h2>
          <ul>
            {avisos.map((a) => (
              <li key={a.colonyId}>
                {t("swarmWarningRow", {
                  colmena: a.hiveIdentifier,
                  tipo: t(`queenCell_${a.kind}`),
                  dias: a.diasDesde,
                })}
                {a.count !== null ? ` — ${t("swarmWarningCount", { cuantas: a.count })}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Tratamientos por objetivo. Se esconde la sección entera si no se trató
          nada —cinco ceros son ruido— y dentro se enseñan los ceros, que es donde
          la distinción entre «no se trató» y «nadie registró» importa. Misma
          disciplina que el reporte de irregularidades de abajo. */}
      {tratamientos.some((x) => x.tratamientos > 0) ? (
        <section className="nn-section">
          <h2>{t("tratamientosHeading")}</h2>
          <p className="nn-muted">{t("tratamientosVentana")}</p>
          <p className="nn-detail-meta">
            {tratamientos.map((x) => (
              <span key={x.target} className={x.tratamientos === 0 ? "nn-vital-sin-registro" : undefined}>
                {t("tratamientosFila", {
                  objetivo: t(`treatmentTarget_${x.target}`),
                  colonias: x.colonias,
                  tratamientos: x.tratamientos,
                })}
              </span>
            ))}
          </p>
        </section>
      ) : null}

      {irregularidades.some((i) => i.colonias > 0) ? (
        <section className="nn-section">
          <h2>{t("irregularidadesHeading")}</h2>
          <p className="nn-muted">{t("irregularidadesVentana")}</p>
          {/* El cero se enseña apagado, no se esconde: «no hay loque» y «nadie
              miró loque» no son lo mismo, y una fila ausente los confunde. Misma
              distinción que los vitales de A9.8, y reusa su misma clase. */}
          <p className="nn-detail-meta">
            {irregularidades.map((i) => (
              <span key={i.valueId} className={i.colonias === 0 ? "nn-vital-sin-registro" : undefined}>
                {i.value}: {t("irregularidadColonias", { colonias: i.colonias, inspecciones: i.inspecciones })}
              </span>
            ))}
          </p>
        </section>
      ) : null}

      <section className="nn-section">
        <h2>{t("hivesHeading")}</h2>
        {apiary.hives.length === 0 ? (
          <p className="nn-muted">{t("noHives")}</p>
        ) : (
          <div className="nn-grid">
            {apiary.hives.map((hive) => (
              <Link key={hive.id} href={`/apiaries/${apiary.id}/hives/${hive.id}`} className="nn-card-link">
                <h3>{hive.identifier}</h3>
                <p className="nn-muted">{t(`hiveStatus_${hive.status}`)}</p>
                <p className="nn-detail-meta">
                  {hive.colonies.length > 0 ? t("colonyPresent") : t("colonyAbsent")}
                </p>
              </Link>
            ))}
          </div>
        )}

        {/* Anexo E §8 — el traslado, colapsado y debajo del inventario: es una operación
            de día de carga, no de cada visita. Sólo aparece si hay colmenas que mover Y
            algún apiario a donde moverlas; un formulario que no puede hacer nada es peor
            que su ausencia. */}
        {apiary.hives.length > 0 && destinos.length > 0 ? (
          <details className="nn-traslado">
            <summary>{t("trasladoHeading")}</summary>
            <TrasladoForm
              apiaryId={apiary.id}
              apiaryNombre={apiary.name}
              colmenasEnOrigen={apiary.hives.length}
              colmenas={apiary.hives.map((h) => ({
                id: h.id,
                identifier: h.identifier,
                poblada: h.colonies.some((c) => c.status === "active"),
              }))}
              destinos={destinos}
              hoy={ahora.toISOString().slice(0, 10)}
            />
          </details>
        ) : null}
      </section>

      {/* A9.2 — la visita, antes que las colmenas: es lo que agrupa el trabajo
          del día. Una ida donde se revisan tres colonias eran tres
          `Inspection` y ningún registro del viaje; con una visita abierta, lo
          que se registre entra en ella sin un toque más
          (`lib/traceability/visitaAbierta.ts`). */}
      <section className="nn-section">
        <h2>{tt("fieldSessionsHeading")}</h2>
        {jornadas.length === 0 ? (
          <p className="nn-muted">{tt("fieldSessionsNone")}</p>
        ) : (
          <ul className="nn-detail-meta">
            {jornadas.map((j) => (
              <li key={j.id}>
                <Link href={`/field-sessions/${j.id}`}>
                  {mostrarInstante(j.startedAt, apiary.timezone)}
                </Link>
                {" · "}
                {j.operator.displayName}
                {" · "}
                {tt("fieldSessionEventCount", { count: j._count.events })}
                {j.endedAt == null ? <> · <strong>{tt("fieldSessionOpen")}</strong></> : null}
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary>{tt("fieldSessionStartSummary")}</summary>
          <FieldSessionStartForm
            locationId={apiary.id}
            people={people.map((p) => ({ id: p.id, displayName: p.displayName }))}
            selfPersonId={selfPersonId}
          />
        </details>
      </section>

      <section className="nn-section">
        <h2>{t("newHiveHeading")}</h2>
        <NewHiveForm locationId={apiary.id} projects={projects} />
      </section>
    </div>
  );
}
