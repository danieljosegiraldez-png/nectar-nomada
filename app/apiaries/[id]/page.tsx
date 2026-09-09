import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getApiaryDetail, getManageableApiaryProjects } from "../../../lib/apiary/hives";
import { densidadDePolinizacion } from "../../../lib/apiary/polinizacion";
import { coordenadasPropuestas } from "../../../lib/traceability/coordenadasDelSitio";
import { confirmarCoordenadasAction } from "../../actions/traceability";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";
import { NewHiveForm } from "../../components/apiary/NewHiveForm";
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
