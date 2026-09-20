import Link from "next/link";
import { redirect } from "next/navigation";
import { AvisosDeBotiquin } from "../../components/inventario/AvisosDeBotiquin";
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
import { vitalesDeColmenas } from "../../../lib/apiary/vitalesDeColmena";
import {
  completarCierreDeTratamientoFormAction,
  darDeBajaAlzaFormAction,
  registrarAlzaFormAction,
  anotarCeraDeExtraccionFormAction,
  registrarCeraNuevaFormAction,
  registrarSalidaDeMarcosFormAction,
} from "../../actions/apiary";
import { alzasDelApiario } from "../../../lib/apiary/alzas";
import { DESTINOS_DE_CERA, leyendaDeCera, marcosNegrosDelApiario, MOTIVOS_DE_SALIDA, TIPOS_DE_CERA } from "../../../lib/apiary/cera";
import { ceraDeExtraccionDelApiario } from "../../../lib/apiary/ceraDeExtraccion";
import { DESTINOS_DE_CERA_SUBPRODUCTO } from "../../../lib/apiary/vocabularioDeMiel";
import { colorDelAño } from "../../../lib/apiary/colorDelAno";
import { CampoNumerico } from "../../components/CampoNumerico";
import { permissionKeysAnywhere } from "../../../lib/rbac/service";
import { ConfirmarCoordenadasForm } from "../../components/apiary/ConfirmarCoordenadasForm";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";
import { NewHiveForm } from "../../components/apiary/NewHiveForm";
import { AltaEnLoteForm } from "../../components/apiary/AltaEnLoteForm";
import { origenesDeColonia } from "../../../lib/apiary/origenDeColonia";
import { Ayuda } from "../../components/apiary/Ayuda";
import { TrasladoForm } from "../../components/apiary/TrasladoForm";
import { ManejoEnLoteForm } from "../../components/apiary/ManejoEnLoteForm";
import { ConsultaAVecinosForm } from "../../components/apiary/ConsultaAVecinosForm";
import {
  consultasDeSitio,
  estadoDelProtocolo,
  aplicacionesPrevistas,
  vecinosOfrecidos,
} from "../../../lib/apiary/consultaAVecinos";
import { destinosCandidatos } from "../../../lib/apiary/traslado";
import { listFieldSessions } from "../../../lib/traceability/fieldSessions";
import { getObserverCandidates } from "../../../lib/traceability/lots";
import { FieldSessionStartForm } from "../../components/traceability/FieldSessionForms";
import { mostrarInstante } from "../../../lib/time/mostrarInstante";
import { cosechasSinSaldo } from "../../../lib/apiary/cosechasSinSaldo";
import { AsentarPesoForm } from "../../components/apiary/AsentarPesoForm";

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
  // ADR-166 — cosechas pesadas antes de ADR-161 cuyo lote quedó sin saldo. Mismo id concedido.
  const sinSaldo = await cosechasSinSaldo(id);
  // Alzas con marca (spec 2026-09-18 §4.4). Con su propio `requireApiaryAccess("view")` dentro.
  // Qué se PINTA lo decide el mismo criterio que la ficha de la colmena: «en algún ámbito» basta
  // para pintar, porque la acción autoriza de verdad.
  const alzas = await alzasDelApiario(user.userAccountId, id);
  // Cera con el color de su año (spec §5.3). El primer renglón es siempre el año en curso.
  const cera = await leyendaDeCera(user.userAccountId, id);
  const ceraDeExtraccion = await ceraDeExtraccionDelApiario(user.userAccountId, id);
  // El aviso por aspecto (spec §5.3): la última inspección que contó marcos negros, por colmena.
  const marcosNegros = await marcosNegrosDelApiario(user.userAccountId, id);
  const añoEnCurso = cera[0]?.año ?? new Date().getUTCFullYear();
  const puedeGestionarAlzas = (await permissionKeysAnywhere(user.userAccountId)).has("apiary:manage");

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
  // Anexo E §4 — el protocolo de vecinos. Cuatro lecturas en paralelo: el estado, lo
  // anunciado, el historial y a quién se puede preguntar.
  const [protocolo, anunciadas, consultas, vecinos, origenes] = await Promise.all([
    estadoDelProtocolo(apiary.id, ahora),
    aplicacionesPrevistas([apiary.id], ahora),
    consultasDeSitio(apiary.id),
    vecinosOfrecidos(user.userAccountId, apiary.id),
    origenesDeColonia(),
  ]);
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
  // Anexo E §3 — los vitales de cada caja. `getApiaryDetail` ya autorizó el sitio; esto lee
  // hechos de las colmenas que ese sitio ya concedió, igual que `vitalesDeSitios` en la lista.
  const vitalesColmena = await vitalesDeColmenas(apiary.hives.map((h) => h.id), ahora);

  return (
    <div>
      <p>
        <Link href="/apiaries">{t("backToApiaries")}</Link>
      </p>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{apiary.name}</h1>
      <AvisosDeBotiquin userAccountId={user.userAccountId} />

      {/* **El inventario va PRIMERO.** Anexo E §3: «Inventario primero, porque decide la
          acción del día». Estaba octavo —debajo del formulario de coordenadas, la
          polinización, los retiros, el alcance, la enjambrazón, los tratamientos y las
          irregularidades—, así que en un teléfono había que pasar siete secciones para ver
          las colmenas. Las siete dicen cosas ciertas; ninguna es lo que se mira al llegar
          al sitio con el ahumador encendido.

          Lo que NO se toca aquí: el orden relativo del resto, ni el «colapsar condiciones e
          historial» ni el «[Registrar evento] al alcance del pulgar» que el §3 también pide.
          Eso es ergonomía que se juzga con el guante puesto, y mover una sección con una
          razón escrita no es lo mismo que rediseñar la pantalla a ciegas. */}
      {/* ADR-166 — sólo aparece cuando hay algo que asentar: una sección vacía sería ruido. */}
      {sinSaldo.length > 0 ? (
        <section className="nn-section">
          <h2>{t("sinSaldoHeading")}</h2>
          <p className="nn-muted">{t("sinSaldoIntro")}</p>
          <ul>
            {sinSaldo.map((c) => (
              <li key={c.id} style={{ marginBottom: "0.5rem" }}>
                {c.occurredAt.toISOString().slice(0, 10)} · {t("sinSaldoCaja")}{" "}
                <Link href={`/apiaries/${id}/hives/${c.hiveId}`}>{c.hiveIdentifier}</Link> · {t("sinSaldoLote")}{" "}
                <Link href={`/lots/${c.lotId}`} className="nn-code">
                  {c.lotCode}
                </Link>{" "}
                · <AsentarPesoForm apiaryHarvestEventId={c.id} apiaryId={id} kg={c.extractedWeightKg} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="nn-section">
        <h2>{t("hivesHeading")}</h2>
        {/* **Dónde está la inspección.** Esta línea existe porque el dueño no
            encontró la inspección estructurada: está construida, pero DENTRO de
            cada colmena, y nada en esta pantalla lo decía. Lo colectivo —abrir
            jornada, manejo en lote, traslado, consulta a vecinos— vive aquí; lo
            de una colmena concreta vive un nivel más adentro.

            Va una sola vez, bajo el encabezado, y no repetida en cada tarjeta:
            las tarjetas ya están llenas de dato real —estado, colonia, origen,
            días desde la última inspección— y repetir una instrucción 29 veces
            la convierte en ruido que se deja de leer. */}
        <p className="nn-muted">{t("hivesHint")}</p>
        {apiary.hives.length === 0 ? (
          <p className="nn-muted">{t("noHives")}</p>
        ) : (
          <div className="nn-grid">
            {apiary.hives.map((hive) => {
              // Anexo E §3 — las dos líneas que la tarjeta no tenía: de dónde vino y cuándo
              // se abrió por última vez. Sin ellas el inventario no «decide la acción del
              // día», que es la razón que da el Anexo para ponerlo primero.
              const v = vitalesColmena.get(hive.id);
              // El origen AGRUPABLE cuando lo hay, y el tipo cuando no. Los dos juntos darían
              // «Comprada Parita», que no es castellano; el catálogo es el dato con el que se
              // compara un pie contra otro (A9.10), así que gana el sitio en la tarjeta.
              const origen = v?.origenFuente ?? (v?.origenTipo ? t(`originType_${v.origenTipo}`) : null);
              return (
                <Link key={hive.id} href={`/apiaries/${apiary.id}/hives/${hive.id}`} className="nn-card-link">
                  <h3>{hive.identifier}</h3>
                  <p className="nn-muted">{t(`hiveStatus_${hive.status}`)}</p>
                  <p className="nn-detail-meta">
                    {hive.colonies.length > 0 ? t("colonyPresent") : t("colonyAbsent")}
                  </p>

                  {/* «⚠ débil» del maquetado. Sale de lo OBSERVADO —la población que declaró
                      la última inspección— y no de un plazo: convertir «hace mucho» en alerta
                      sería inventar una cadencia por colmena, y la cadencia de este módulo la
                      declara una persona al cerrar cada visita. */}
                  {v?.necesitaAtencion ? (
                    <p className="nn-alerta nn-alerta-aviso">⚠ {t("hiveNecesitaAtencion")}</p>
                  ) : null}

                  {origen && v?.coloniaDesde ? (
                    <p className="nn-detail-meta">
                      {t("hiveOrigenYFecha", { origen, fecha: v.coloniaDesde.toISOString().slice(0, 10) })}
                    </p>
                  ) : null}

                  {/* «Sin inspeccionar» no es «hace mucho» y no es cero: es el tercer estado
                      que el Anexo C exige, y aquí es además el caso de casi todo el inventario
                      real, que entró por guion y nunca se ha abierto desde la aplicación. */}
                  <p className={v?.diasDesdeInspeccion == null ? "nn-vital-sin-registro" : "nn-detail-meta"}>
                    {v?.diasDesdeInspeccion == null
                      ? t("hiveSinInspeccion")
                      : t("hiveInspeccionHace", { dias: v.diasDesdeInspeccion })}
                  </p>

                  {/* La tarjeta ES un enlace, pero eso sólo lo sabe quien pasa
                      el ratón por encima — y en el patio se usa con el pulgar y
                      bajo sol. La acción va en palabra, igual que la severidad
                      de las alertas va en palabra y no sólo en color. */}
                  <p className="nn-detail-meta">{t("hiveEntrar")} →</p>
                </Link>
              );
            })}
          </div>
        )}

        {/* ADR-136 — el mismo manejo a varias colmenas de una vez, colapsado y debajo de las
            tarjetas. Va ANTES del traslado porque es manejo de cada visita y el traslado es
            día de carga. Sólo aparece si hay alguna caja con colonia viva: un formulario que
            no puede hacer nada es peor que su ausencia, el mismo criterio que el traslado. */}
        {apiary.hives.some((h) => h.colonies.some((c) => c.status === "active")) ? (
          <details className="nn-traslado">
            <summary>{t("loteHeading")}</summary>
            <ManejoEnLoteForm
              apiaryId={apiary.id}
              colmenas={apiary.hives.map((h) => ({
                hiveId: h.id,
                identifier: h.identifier,
                colonyId: h.colonies.find((c) => c.status === "active")?.id ?? null,
              }))}
              hoy={ahora.toISOString().slice(0, 10)}
            />
          </details>
        ) : null}

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

        <ConfirmarCoordenadasForm
          locationId={id}
          propuesta={coordenadas.propuesta}
          distanciaALoDeclaradoM={coordenadas.distanciaALoDeclaradoM}
        />
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

      {/* Anexo E §4 y §3 — la consulta a vecinos. Va ANTES de las visitas porque su
          vencimiento decide si la próxima ida lleva una parada más, y el §3 la enseña
          entre los avisos de cabecera del sitio. */}
      <section className="nn-section">
        <h2>{t("consultaHeading")}</h2>

        {/* El estado del protocolo, siempre visible. «Nunca se ha consultado» es un estado
            y no una alerta: un apiario nuevo no ha incumplido nada (ADR-127). */}
        <p className={protocolo.estado === "vencida" ? "nn-alerta nn-alerta-aviso" : "nn-muted"}>
          {protocolo.ultimaConsulta === null
            ? t("consultaNunca")
            : protocolo.diasQueFaltan !== null && protocolo.diasQueFaltan < 0
              ? t("consultaVencidaHace", { dias: -protocolo.diasQueFaltan })
              : t("consultaVenceEn", { dias: protocolo.diasQueFaltan ?? 0 })}
        </p>

        {anunciadas.length > 0 ? (
          <ul className="nn-alertas">
            {anunciadas.map((a) => (
              <li key={a.consultationId} className="nn-alerta nn-alerta-critico">
                {t("consultaAspersionAnunciada", {
                  vecino: a.vecino,
                  dias: a.diasQueFaltan,
                  cultivo: a.crop ?? t("sinRegistrar"),
                })}
              </li>
            ))}
          </ul>
        ) : null}

        {consultas.length === 0 ? null : (
          <ul>
            {consultas.map((c) => (
              <li key={c.id}>
                {c.occurredAt.toISOString().slice(0, 10)} · {c.neighbourOrganization.name} ·{" "}
                {t(`consultaResultado_${c.outcome}`)}
                {c.plannedApplicationAt ? ` · ${c.plannedApplicationAt.toISOString().slice(0, 10)}` : ""}
                {c.crop ? ` · ${c.crop}` : ""}
                {c.informantName ? ` · ${c.informantName}` : ""}
              </li>
            ))}
          </ul>
        )}

        {vecinos.length > 0 ? (
          <details>
            <summary>{t("consultaRegistrarSummary")}</summary>
            <ConsultaAVecinosForm
              locationId={apiary.id}
              vecinos={vecinos}
              personas={people.map((p) => ({ id: p.id, name: p.displayName }))}
              selfPersonId={selfPersonId}
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

      {/* Alzas con marca — spec 2026-09-18 §4.4. La «ficha del alza» es el desplegable de cada
          una: por dónde pasó y en qué cosechas salió. Lo de otro apiario, sin nombre de caja. */}
      <section className="nn-section" id="alzas">
        <h2>{t("alzasHeading")}</h2>
        <p className="nn-muted">{t("alzasIntro")}</p>
        {alzas.length === 0 ? (
          <p className="nn-muted">{t("alzasNinguna")}</p>
        ) : (
          <ul>
            {alzas.map((a) => (
              <li key={a.id} style={{ marginBottom: "0.5rem" }}>
                <details>
                  <summary>
                    <strong className="nn-code">{a.code}</strong>
                    {" — "}
                    {a.lifecycleStatus !== "active"
                      ? t("alzaDeBaja", { fecha: a.retiredAt?.toISOString().slice(0, 10) ?? "", motivo: a.retiredReason ?? "" })
                      : a.puestaEn
                        ? a.puestaEn.aqui
                          ? t("alzaEnColmena", { colmena: a.puestaEn.identifier, fecha: a.puestaEn.desde.toISOString().slice(0, 10) })
                          : t("alzaEnOtroApiario", { fecha: a.puestaEn.desde.toISOString().slice(0, 10) })
                        : t("alzaEnBodega")}
                  </summary>
                  {a.historia.length > 0 ? (
                    <>
                      <h3>{t("alzaHistoria")}</h3>
                      <ul>
                        {a.historia.map((h, i) => (
                          <li key={i}>
                            {t("alzaHistoriaFila", {
                              colmena: h.aqui ? h.hiveIdentifier : t("alzaHistoriaOtroApiario"),
                              desde: h.desde.toISOString().slice(0, 10),
                              hasta: h.hasta ? h.hasta.toISOString().slice(0, 10) : t("alzaHistoriaAbierta"),
                            })}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {a.cosechas.length > 0 ? (
                    <>
                      <h3>{t("alzaCosechas")}</h3>
                      <ul>
                        {a.cosechas.map((c) => (
                          <li key={c.lotId}>
                            {c.occurredAt.toISOString().slice(0, 10)} ·{" "}
                            <Link href={`/lots/${c.lotId}`} className="nn-code">
                              {c.lotCode}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {puedeGestionarAlzas && a.lifecycleStatus === "active" && !a.puestaEn ? (
                    <form action={darDeBajaAlzaFormAction} className="nn-form" style={{ maxWidth: 420 }}>
                      <input type="hidden" name="apiaryId" value={id} />
                      <input type="hidden" name="hiveSuperId" value={a.id} />
                      <div className="nn-field">
                        <label htmlFor={`baja-${a.id}`}>{t("alzaMotivoBaja")}</label>
                        <input id={`baja-${a.id}`} name="reason" type="text" required />
                      </div>
                      <BotonDeEnvio>{t("alzaDarDeBajaBoton")}</BotonDeEnvio>
                    </form>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
        )}
        {puedeGestionarAlzas ? (
          <details>
            <summary>{t("alzaRegistrar")}</summary>
            <form action={registrarAlzaFormAction} className="nn-form" style={{ maxWidth: 420 }}>
              <input type="hidden" name="apiaryId" value={id} />
              <div className="nn-field">
                <label htmlFor="alza-code">{t("alzaMarca")}</label>
                <input id="alza-code" name="code" type="text" required />
              </div>
              <div className="nn-field">
                <label htmlFor="alza-desde">{t("alzaDesde")}</label>
                <input id="alza-desde" name="inServiceAt" type="date" />
              </div>
              <div className="nn-field">
                <label htmlFor="alza-nota">{t("alzaNota")}</label>
                <input id="alza-nota" name="notes" type="text" />
              </div>
              <BotonDeEnvio>{t("alzaRegistrarBoton")}</BotonDeEnvio>
            </form>
          </details>
        ) : null}
      </section>

      {/* Cera con el color de su año — spec 2026-09-18 §5.3. El color dice la edad del marco,
          esté donde esté; aquí sólo se lee la leyenda y se anotan entradas y salidas. */}
      <section className="nn-section" id="cera">
        <h2>{t("ceraHeading")}</h2>
        <p className="nn-muted">{t("ceraIntro")}</p>
        <p>
          <strong>{t("ceraEsteAno", { color: t(`color_${colorDelAño(añoEnCurso)}`) })}</strong>
        </p>
        <table className="nn-table" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr>
              <th>{t("ceraColumnaAno")}</th>
              <th>{t("ceraColumnaColor")}</th>
              <th>{t("ceraColumnaEntraron")}</th>
              <th>{t("ceraColumnaSalieron")}</th>
              <th>{t("ceraColumnaEdad")}</th>
            </tr>
          </thead>
          <tbody>
            {cera.map((f) => (
              <tr key={f.año}>
                <td>{f.año}</td>
                <td>{t(`color_${f.color}`)}</td>
                <td>{f.entraron}</td>
                <td>
                  {f.salieron}
                  {f.salieronDeMas ? <span className="nn-muted"> · {t("ceraSalieronDeMas")}</span> : null}
                </td>
                <td>
                  {t("ceraEdad", { edad: f.edad })}
                  {f.aviso === "renovar" ? (
                    <strong> · {t("ceraAvisoRenovar")}</strong>
                  ) : f.aviso === "revisar" ? (
                    <span> · {t("ceraAvisoRevisar")}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {marcosNegros.length > 0 ? (
          <>
            <h3>{t("marcosNegrosHeading")}</h3>
            <p className="nn-muted">{t("marcosNegrosIntro")}</p>
            <ul>
              {marcosNegros.map((m) => (
                <li key={m.hiveId}>
                  <Link href={`/apiaries/${id}/hives/${m.hiveId}`}>{m.identifier}</Link>
                  {": "}
                  {t("marcosNegrosFila", { n: m.marcos, fecha: m.fecha.toISOString().slice(0, 10) })}
                  {m.coloniaAnterior ? <span className="nn-muted"> · {t("marcosNegrosColoniaAnterior")}</span> : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {puedeGestionarAlzas ? (
          <>
            <details>
              <summary>{t("ceraAnotarEntrada")}</summary>
              <form action={registrarCeraNuevaFormAction} className="nn-form" style={{ maxWidth: 420 }}>
                <input type="hidden" name="apiaryId" value={id} />
                <div className="nn-field">
                  <label htmlFor="cera-dia">{t("ceraDia")}</label>
                  <input id="cera-dia" name="enteredAt" type="date" />
                </div>
                <div className="nn-field">
                  <label htmlFor="cera-cuantos">{t("ceraCuantosMarcos")}</label>
                  <CampoNumerico id="cera-cuantos" name="frameCount" min={1} step={1} inputMode="numeric" required />
                </div>
                <div className="nn-field">
                  <label htmlFor="cera-tipo">{t("ceraTipo")}</label>
                  <select id="cera-tipo" name="waxKind" required defaultValue="">
                    <option value="" disabled />
                    {TIPOS_DE_CERA.map((k) => (
                      <option key={k} value={k}>
                        {t(`cera_${k}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="nn-field">
                  <label htmlFor="cera-destino">{t("ceraDestino")}</label>
                  <select id="cera-destino" name="destination" defaultValue="">
                    {/* El vacío no se ofrece como opción (Anexo E §6): sin elegir, no se dice. */}
                    <option value="" />
                    {DESTINOS_DE_CERA.map((d) => (
                      <option key={d} value={d}>
                        {t(`ceraDestino_${d}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="nn-field">
                  <label htmlFor="cera-nota">{t("ceraNota")}</label>
                  <input id="cera-nota" name="notes" type="text" />
                </div>
                <BotonDeEnvio>{t("ceraGuardar")}</BotonDeEnvio>
              </form>
            </details>
            <details>
              <summary>{t("ceraAnotarSalida")}</summary>
              <form action={registrarSalidaDeMarcosFormAction} className="nn-form" style={{ maxWidth: 420 }}>
                <input type="hidden" name="apiaryId" value={id} />
                <div className="nn-field">
                  <label htmlFor="salida-ano">{t("ceraAnoDelColor")}</label>
                  <select id="salida-ano" name="waxYear" required defaultValue="">
                    <option value="" disabled />
                    {Array.from({ length: 8 }, (_, i) => añoEnCurso - i).map((a) => (
                      <option key={a} value={a}>
                        {a} · {t(`color_${colorDelAño(a)}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="nn-field">
                  <label htmlFor="salida-cuantos">{t("ceraCuantosMarcos")}</label>
                  <CampoNumerico id="salida-cuantos" name="frameCount" min={1} step={1} inputMode="numeric" required />
                </div>
                <div className="nn-field">
                  <label htmlFor="salida-motivo">{t("ceraMotivo")}</label>
                  <select id="salida-motivo" name="reason" required defaultValue="">
                    <option value="" disabled />
                    {MOTIVOS_DE_SALIDA.map((m) => (
                      <option key={m} value={m}>
                        {t(`ceraMotivo_${m}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="nn-field">
                  <label htmlFor="salida-dia">{t("ceraDia")}</label>
                  <input id="salida-dia" name="removedAt" type="date" />
                </div>
                <div className="nn-field">
                  <label htmlFor="salida-nota">{t("ceraNota")}</label>
                  <input id="salida-nota" name="notes" type="text" />
                </div>
                <BotonDeEnvio>{t("ceraGuardar")}</BotonDeEnvio>
              </form>
            </details>
          </>
        ) : null}
      </section>

      {/* Spec 2026-09-19 §4.3 — la cera del desopercular. Va aquí, con la del apiario, porque su
          origen es el sitio y una ventana: no se sabe de qué colmena salió, y no se inventa. */}
      <section className="nn-section">
        <h2>{t("ceraExtraccionHeading")}</h2>
        <p className="nn-muted">{t("ceraExtraccionIntro")}</p>
        {ceraDeExtraccion.length === 0 ? (
          <p className="nn-muted">{t("ceraExtraccionVacio")}</p>
        ) : (
          <ul>
            {ceraDeExtraccion.map((c) => (
              <li key={c.id}>
                {t("ceraExtraccionFila", {
                  kg: c.massKg,
                  destino: t(`ceraSubproductoDestino_${c.destination}`),
                  desde: c.windowStart.toISOString().slice(0, 10),
                  hasta: c.windowEnd.toISOString().slice(0, 10),
                })}
                {c.notes ? <span className="nn-muted"> · {c.notes}</span> : null}
                <div className="nn-muted">
                  {c.cosechas.length === 0
                    ? t("ceraExtraccionSinCosechas")
                    : t("ceraExtraccionCosechas", {
                        desde: c.windowStart.toISOString().slice(0, 10),
                        hasta: c.windowEnd.toISOString().slice(0, 10),
                        cuales: c.cosechas.map((h) => `${h.lotCode} (${h.hiveIdentifier})`).join(", "),
                      })}
                </div>
              </li>
            ))}
          </ul>
        )}
        {puedeGestionarAlzas ? (
          <details>
            <summary>{t("ceraExtraccionAnotar")}</summary>
            <form action={anotarCeraDeExtraccionFormAction} className="nn-form" style={{ maxWidth: 420 }}>
              <input type="hidden" name="apiaryId" value={id} />
              <div className="nn-field">
                <label htmlFor="cerax-kg">{t("ceraExtraccionKilos")}</label>
                <CampoNumerico id="cerax-kg" name="massKg" min={0} step="0.001" inputMode="decimal" required />
              </div>
              <div className="nn-field">
                <label htmlFor="cerax-desde">{t("ceraExtraccionDesde")}</label>
                <input id="cerax-desde" name="windowStart" type="date" required />
              </div>
              <div className="nn-field">
                <label htmlFor="cerax-hasta">{t("ceraExtraccionHasta")}</label>
                <input id="cerax-hasta" name="windowEnd" type="date" required />
              </div>
              <div className="nn-field">
                <label htmlFor="cerax-destino">{t("ceraExtraccionDestino")}</label>
                <select id="cerax-destino" name="destination" required defaultValue="">
                  {/* El vacío no se ofrece como opción (Anexo E §6). */}
                  <option value="" disabled />
                  {DESTINOS_DE_CERA_SUBPRODUCTO.map((d) => (
                    <option key={d} value={d}>
                      {t(`ceraSubproductoDestino_${d}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="nn-field">
                <label htmlFor="cerax-nota">{t("ceraExtraccionNota")}</label>
                <input id="cerax-nota" name="notes" type="text" />
              </div>
              <BotonDeEnvio>{t("ceraExtraccionGuardar")}</BotonDeEnvio>
            </form>
          </details>
        ) : null}
      </section>

      <section className="nn-section">
        <h2>{t("newHiveHeading")}</h2>
        <NewHiveForm locationId={apiary.id} projects={projects} />
        {/* El alta en lote va PLEGADA y debajo de la de una: dar de alta el inventario de un
            sitio se hace una vez, y el camino de todos los dias es la colmena suelta. */}
        <details>
          <summary>{t("loteAltaHeading")}</summary>
          <AltaEnLoteForm locationId={apiary.id} projects={projects} origenes={origenes} />
        </details>
      </section>
    </div>
  );
}
