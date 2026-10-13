import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { detalleInstalacion } from "../../../lib/traceability/instalaciones";
import { LocationAccessError, puedeEditarBeneficioEn } from "../../../lib/traceability/locations";
import { SecadoFormError } from "../../../lib/traceability/secadoForm";
import { FormularioUbicacion } from "../FormularioUbicacion";
import { FormularioEstante } from "../FormularioEstante";
import { AvisoDeRutina } from "../../components/rutinas/AvisoDeRutina";
import { RutinasDeLugar } from "../../components/rutinas/RutinasDeLugar";
import { TraceabilityAccessError, getObserverCandidates } from "../../../lib/traceability/lots";
import { ambienteDeInstalacion, puedeRegistrarAmbienteEn } from "../../../lib/traceability/ambiente";
import { edad, lecturaDelPunto, type LecturaVigente } from "../../../lib/traceability/ambienteVigente";
import { FormularioAmbiente } from "../FormularioAmbiente";
import { mostrarInstante } from "../../../lib/time/mostrarInstante";

export const dynamic = "force-dynamic";
export default async function InstalacionPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; posicion?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Secado");
  const tEq = await getTranslations("Equipos");
  const { id } = await params;
  const { ok, posicion, error: errorCode } = await searchParams;
  let instalacion;
  try { instalacion = await detalleInstalacion(user.userAccountId, id); }
  catch (error) {
    // «No existe», «id mal formado» y «sin permiso» dan las tres 404, como en `plots/[id]`:
    // separarlas diría a quien no tiene acceso qué ids existen (Daniel, 2026-10-09; ficha 026).
    if (error instanceof SecadoFormError || error instanceof LocationAccessError) notFound();
    throw error;
  }
  const puedeEditar = await puedeEditarBeneficioEn(user.userAccountId, id);
  // Hallazgo 5 (revisión independiente de Codex, 2026-09-18): el permiso de
  // la INSTALACIÓN no es el de cada CAMA — `actualizarUbicacionDeSecado`
  // comprueba `edit_beneficio` sobre el id de la cama, no el de su padre, así
  // que reutilizar `puedeEditar` aquí ofrecía un formulario que el servidor
  // iba a rechazar (o, peor, aceptar sobre una cama que sí concede otra
  // cosa). Cada cama pregunta por SU PROPIO permiso.
  const permisosDeCamas = await Promise.all(
    instalacion.camas.map((c) => puedeEditarBeneficioEn(user.userAccountId, c.id)),
  );
  // Igual que con las camas: el permiso de ampliar/editar es POR ESTANTE y por
  // POSICIÓN, nunca heredado del permiso de la instalación (revisión de Codex).
  const permisosDeEstantes = await Promise.all(
    instalacion.estantes.map((e) => puedeEditarBeneficioEn(user.userAccountId, e.id)),
  );
  const posicionSeleccionada = posicion
    ? instalacion.estantes.flatMap((e) => e.posiciones.map((p) => ({ ...p, estanteId: e.id }))).find((p) => p.id === posicion)
    : undefined;
  const puedeEditarPosicion = posicionSeleccionada ? await puedeEditarBeneficioEn(user.userAccountId, posicionSeleccionada.id) : false;
  // El ambiente pide otro permiso que la instalación (`sample`, no
  // `manage_attributes`): sin él la sección no aparece, sin romper la página.
  const ambiente = await ambienteDeInstalacion(user.userAccountId, id).catch((error: unknown) => {
    if (error instanceof TraceabilityAccessError) return null;
    throw error;
  });
  const puedeRegistrarAmbiente = ambiente ? await puedeRegistrarAmbienteEn(user.userAccountId, id) : false;
  const personas = puedeRegistrarAmbiente
    ? (await getObserverCandidates(user.userAccountId, [{ locationId: id }])).people
    : [];
  const ahora = new Date();
  const nombreDeEstante = (rackId: string | null) =>
    rackId == null ? null : instalacion.estantes.find((e) => e.id === rackId)?.name ?? t("ambienteEstanteNoVisible");
  const resumen = (l: LecturaVigente) => {
    const e = edad(l.occurredAt, ahora);
    return [
      l.airTemperatureC != null ? `${l.airTemperatureC.toFixed(1)} °C` : null,
      l.relativeHumidityPct != null ? `${l.relativeHumidityPct.toFixed(1)} % HR` : null,
      l.skyCondition ? t(`cielo_${l.skyCondition}`) : null,
      l.ventilation ? t(`ventilacion_${l.ventilation}`) : null,
    ].filter(Boolean).join(" · ") + ` — ${mostrarInstante(l.occurredAt, ambiente?.zona)}, ${t(e.unidad === "min" ? "haceMin" : e.unidad === "h" ? "haceH" : "haceD", { n: e.n })} (${t(`fuente_${l.sourceType}`)})`;
  };
  const puntoDe = (l: LecturaVigente) => l.rackId
    ? `${nombreDeEstante(l.rackId)}${l.rackLevel != null ? ` · ${t("nivel", { n: l.rackLevel })}` : ""}`
    : l.rackLevel != null ? t("ambienteNivelSinEstante", { n: l.rackLevel }) : t("ambienteGeneral");
  /** Los mismos catálogos para registrar y para corregir: un solo sitio donde cambiarlos. */
  const propsDeAmbiente = {
    facilityId: id,
    estantes: instalacion.estantes.map((e) => ({ id: e.id, name: e.name, niveles: e.niveles })),
    nivelesSinEstante: [...new Set(instalacion.camas.map((c) => c.rackLevel).filter((n): n is number => n != null))],
    personas,
  };
  const posicionesTotal = instalacion.estantes.reduce((total, estante) => total + estante.posiciones.length, 0);
  const lecturaGeneral = ambiente ? lecturaDelPunto(ambiente.vigentes, { rackId: null, rackLevel: null }) : null;
  return <div className="nn-installation-page">
    <nav className="nn-breadcrumb" aria-label={t("rutaInstalacion")}>
      <Link href="/instalaciones">{t("volver")}</Link>
      <span aria-hidden="true">/</span>
      <span>{instalacion.sitio?.name ?? t("sitioNoVisible")}</span>
    </nav>
    <header className="nn-installation-header">
      <div>
        <h1>{instalacion.name}</h1>
        <p>{t("instalacionEnSitio", { sitio: instalacion.sitio?.name ?? t("sitioNoVisible") })}</p>
      </div>
      <Link className="nn-button nn-installation-primary" href="/inspecciones/nueva">{t("inspeccionTitulo")}</Link>
    </header>
    {ok === "guardado" && <p className="nn-notice nn-notice-success" role="status">{t("guardado")}</p>}
    <AvisoDeRutina ok={ok} error={errorCode} t={tEq} />
    {ok === "ambiente" && <p className="nn-notice nn-notice-success" role="status">{t("ambienteGuardado")}</p>}
    {!puedeEditar && <p className="nn-notice" role="alert">{t("sinPermisoEditar")}</p>}

    <section className="nn-installation-overview" aria-labelledby="resumen-instalacion">
      <h2 id="resumen-instalacion">{t("resumenInstalacion")}</h2>
      <dl>
        <div><dt>{t("ambiente")}</dt><dd>{instalacion.dryingEnvironment ? t(`ambiente_${instalacion.dryingEnvironment}`) : t("noDeclarado")}</dd></div>
        <div><dt>{t("camas")}</dt><dd>{instalacion.camas.length}</dd></div>
        <div><dt>{t("estantes")}</dt><dd>{instalacion.estantes.length}</dd></div>
        <div><dt>{t("posiciones")}</dt><dd>{posicionesTotal}</dd></div>
      </dl>
      {ambiente && <div className="nn-installation-reading">
        <span>{t("ambienteGeneral")}</span>
        <strong>{lecturaGeneral ? resumen(lecturaGeneral) : t("ambienteSinLectura")}</strong>
      </div>}
    </section>

    {puedeEditar && <details className="nn-disclosure" open={ok === "guardado"}>
      <summary><span>{t("ajustesInstalacion")}</span><small>{t("ajustesInstalacionAyuda")}</small></summary>
      <div className="nn-disclosure-body"><FormularioUbicacion key={JSON.stringify(instalacion)} tipo="drying_facility" existente={instalacion} /></div>
    </details>}

    <section className="nn-installation-section" aria-labelledby="estructura-secado">
      <div className="nn-installation-section-heading">
        <div><h2 id="estructura-secado">{t("estructuraSecado")}</h2><p>{t("estructuraSecadoAyuda")}</p></div>
      </div>
      <div className="nn-installation-subsection">
        <h3>{t("camas")}</h3>
        {!instalacion.camas.length && <p className="nn-empty-state">{t("sinCamas")}</p>}
        <div className="nn-installation-records">{instalacion.camas.map((c, i) => <section key={c.id} className="nn-installation-record">
          <div><strong>{c.name}</strong><span>{c.rackLevel != null ? t("rackValor", { nivel: c.rackLevel }) : t("rackNoDeclarado")}</span></div>
          {permisosDeCamas[i] && <details className="nn-inline-disclosure">
            <summary>{t("editarCama")}</summary>
            <FormularioUbicacion tipo="drying_bed" existente={c} />
          </details>}
          <details className="nn-inline-disclosure nn-location-operations">
            <summary>{t("rutinasYEquipos")}</summary>
            <RutinasDeLugar userAccountId={user.userAccountId} locationId={c.id} />
          </details>
        </section>)}</div>
        {puedeEditar && <details className="nn-disclosure nn-disclosure-compact">
          <summary><span>{t("crearCama")}</span><small>{t("crearCamaAyuda")}</small></summary>
          <div className="nn-disclosure-body"><FormularioUbicacion tipo="drying_bed" parentLocationId={id} /></div>
        </details>}
      </div>

      <div className="nn-installation-subsection">
        <h3>{t("estantes")}</h3>
        {!instalacion.estantes.length && <p className="nn-empty-state">{t("sinEstantes")}</p>}
        {instalacion.estantes.map((estante, i) => {
      // La rejilla es de sólo lectura en este plan (2b pinta qué bandeja hay
      // en cada posición): una fila por nivel, del más alto al más bajo.
      const filas = Array.from({ length: estante.niveles }, (_, idx) => estante.niveles - idx);
      const puestos = Array.from({ length: estante.puestos }, (_, idx) => idx + 1);
      return <section key={estante.id} className="nn-rack">
        <div className="nn-rack-heading"><h3>{estante.name}</h3><span>{t("resumenEstante", { niveles: estante.niveles, puestos: estante.puestos, total: estante.posiciones.length })}</span></div>
        <div className="nn-table-scroll"><table>
          <tbody>
            {filas.map((nivel) => <tr key={nivel}>
              <th scope="row">{t("nivel", { n: nivel })}</th>
              {puestos.map((puesto) => {
                const pos = estante.posiciones.find((p) => p.nivel === nivel && p.puesto === puesto);
                return <td key={puesto}>
                  {pos && <Link href={`/instalaciones/${id}?posicion=${pos.id}`}>
                    {`P${puesto}`}{pos.shadePercentage ? " *" : ""}
                  </Link>}
                </td>;
              })}
              <td className="nn-rack-reading">{ambiente
                ? (() => { const l = lecturaDelPunto(ambiente.vigentes, { rackId: estante.id, rackLevel: nivel }); return l ? resumen(l) : t("ambienteSinLecturaDelNivel"); })()
                : null}</td>
            </tr>)}
          </tbody>
        </table></div>
        {posicionSeleccionada?.estanteId === estante.id && puedeEditarPosicion &&
          <div className="nn-selected-position"><FormularioUbicacion key={JSON.stringify(posicionSeleccionada)} tipo="drying_bed" existente={{
              id: posicionSeleccionada.id, name: posicionSeleccionada.name, rackLevel: posicionSeleccionada.nivel,
              shadePercentage: posicionSeleccionada.shadePercentage, shadeDescription: posicionSeleccionada.shadeDescription,
            }} /></div>}
        {permisosDeEstantes[i] && <details className="nn-inline-disclosure">
          <summary>{t("ampliarEstante")}</summary>
          <FormularioEstante existente={{ id: estante.id, niveles: estante.niveles, puestos: estante.puestos }} />
        </details>}
        <details className="nn-inline-disclosure nn-location-operations">
          <summary>{t("rutinasYEquipos")}</summary>
          <RutinasDeLugar userAccountId={user.userAccountId} locationId={estante.id} />
        </details>
      </section>;
        })}
        {puedeEditar && <details className="nn-disclosure nn-disclosure-compact">
          <summary><span>{t("crearEstante")}</span><small>{t("crearEstanteAyuda")}</small></summary>
          <div className="nn-disclosure-body"><FormularioEstante facilityId={id} /></div>
        </details>}
      </div>
    </section>

    {ambiente && <section className="nn-installation-section" aria-labelledby="ambiente-instalacion">
      <div className="nn-installation-section-heading"><div><h2 id="ambiente-instalacion">{t("ambienteTitulo")}</h2><p>{t("ambienteIntroCorto")}</p></div></div>
      <h3>{t("ambienteRecientes")}</h3>
      {ambiente.recientes.length
        ? <ul className="nn-reading-list">{ambiente.recientes.map((l) => <li key={l.id}>
            <strong>{puntoDe(l)}</strong><span>{resumen(l)}</span>
            {/* El rótulo va en TEXTO, no en un color: una lectura reemplazada
                tiene que distinguirse también en blanco y negro y para quien
                use lector de pantalla. Mismo criterio que la pantalla del lote. */}
            {l.reemplazada ? <span> · <strong>{t("ambienteReemplazada")}</strong>{l.reemplazada.motivo ? ` — ${l.reemplazada.motivo}` : ""}</span> : null}
            {/* Sólo se corrige lo vigente. Corregir una reemplazada bifurcaría
                el historial y el servicio lo rechaza; la pantalla no ofrece lo
                que sería rechazado. */}
            {puedeRegistrarAmbiente && !l.reemplazada ? <details>
              <summary>{t("ambienteCorregir")}</summary>
              <FormularioAmbiente {...propsDeAmbiente} corrigiendo={{
                id: l.id, occurredAt: l.occurredAt.toISOString(), rackId: l.rackId, rackLevel: l.rackLevel,
                airTemperatureC: l.airTemperatureC, relativeHumidityPct: l.relativeHumidityPct,
                skyCondition: l.skyCondition, ventilation: l.ventilation,
                notaCielo: l.notaCielo, notaVentilacion: l.notaVentilacion, operadorPersonId: l.operadorPersonId,
              }} />
            </details> : null}
          </li>)}</ul>
        : <p className="nn-empty-state">{t("ambienteSinLectura")}</p>}
      {puedeRegistrarAmbiente && <details id="registrar-ambiente" className="nn-disclosure nn-disclosure-compact" open={ok === "ambiente"}>
        <summary><span>{t("registrarAmbiente")}</span><small>{t("registrarAmbienteAyuda")}</small></summary>
        <div className="nn-disclosure-body">
          <p className="nn-muted">{t("ambienteIntro")}</p>
          <FormularioAmbiente {...propsDeAmbiente} />
        </div>
      </details>}
    </section>}
    <section className="nn-installation-section nn-installation-support">
      <RutinasDeLugar userAccountId={user.userAccountId} locationId={id} />
    </section>
  </div>;
}
