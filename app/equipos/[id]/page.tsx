import { CampoNumerico } from "../../components/CampoNumerico";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  declararModoFormAction,
  declararPatronFormAction,
  editarDatosDeEquipoFormAction,
  informarCondicionFormAction,
  verificarInstrumentoFormAction,
} from "../../actions/equipos";
import { crearRutinaFormAction } from "../../actions/rutinas";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";
import { DocumentoUploadForm } from "../../components/equipos/DocumentoUploadForm";
import { TarjetaDeRutina } from "../../components/rutinas/TarjetaDeRutina";
import { TimezoneOffsetField } from "../../components/TimezoneOffsetField";
import { getCurrentUser } from "../../../lib/auth/session";
import {
  EquipoError,
  instrumentoParaVerificar,
  proveedoresPosibles,
  puedeGestionarEquipo,
  puedeSobreEquipo,
} from "../../../lib/equipos/equipos";
import { documentosDeEquipo } from "../../../lib/equipos/documentos";
import { modelosParaElegir } from "../../../lib/equipos/modelos";
import { rutinasDeEquipo } from "../../../lib/rutinas/rutinas";
import { diaDeHoy } from "../../../lib/time/diaDeHoy";
import { getObserverCandidates } from "../../../lib/traceability/lots";

export const dynamic = "force-dynamic";

/** Los materiales sobre los que un modo puede leer. `BEE_HONEY` es miel de ABEJA (ADR-160). */
const MATERIALES_DE_MODO = ["CHERRY", "MUCILAGE_HONEY", "PARCHMENT", "GREEN", "BEE_HONEY"] as const;
/** Las variables que un instrumento de mano suele leer. Del vocabulario de `units.ts`. */
const VARIABLES_DE_MODO = ["brix", "moisture", "ph", "temperature", "relative_humidity", "water_activity"] as const;

/**
 * Un equipo: su estado, y el acto de verificarlo.
 *
 * **El formulario de verificación es el que se usa a diario**, y por eso pinta un
 * campo por patrón vigente con su valor de referencia y su tolerancia a la vista.
 * El operario no tiene que recordar que el agua va a 0 °Bx: lo dice la fila.
 *
 * **Y no hay botón de verificar cuando no hay patrones declarados.** Sin patrones
 * no hay nada que contrastar, y ofrecer el botón produciría una verificación
 * vacía — que el servicio y el trigger ya rechazan por separado, pero que la
 * pantalla no debe llegar a proponer.
 */
export default async function EquipoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  let equipo;
  try {
    equipo = await instrumentoParaVerificar(user.userAccountId, id);
  } catch (error) {
    if (error instanceof EquipoError) notFound();
    throw error;
  }

  // La ubicación sale del último traslado, igual que en `listarEquipos`: es lo
  // único que sabe en qué zona vive el equipo, y de ahí sale el «hoy» que
  // gobierna el aviso de garantía y el de sus rutinas.
  const ubicacion = equipo.transfers[0]?.toLocation ?? null;
  const hoy = diaDeHoy(new Date(), ubicacion?.timezone ?? null);

  const [t, sp, puedeGestionar, puedeApuntar, documentos, proveedores, modelosElegibles, rutinas, observadores] =
    await Promise.all([
      getTranslations("Equipos"),
      searchParams,
      puedeGestionarEquipo(user.userAccountId, id),
      puedeSobreEquipo(user.userAccountId, id, "report_condition"),
      documentosDeEquipo(user.userAccountId, id),
      proveedoresPosibles(user.userAccountId),
      modelosParaElegir(user.userAccountId, equipo.organizationId, equipo.kind),
      rutinasDeEquipo(user.userAccountId, id, hoy),
      getObserverCandidates(user.userAccountId),
    ]);
  const personas = observadores.people.map((p) => ({ id: p.id, name: p.displayName }));
  const modeloActualElegible = [...modelosElegibles.compartidos, ...modelosElegibles.propios].some((m) => m.id === equipo.modelId);
  const patrones = equipo.checkRequirements;
  const esInstrumento = equipo.kind === "instrument";
  // El código viene de la URL: sólo se acepta la forma que las acciones de
  // app/actions/equipos.ts y app/actions/rutinas.ts producen, nunca texto libre.
  const codigoError = sp.error && /^[a-z_]+$/.test(sp.error) ? sp.error : null;

  return (
    <div>
      <p>
        <Link href="/equipos">← {t("volver")}</Link>
      </p>
      <span className="nn-badge">{t(`tipo_${equipo.kind}`)}</span>
      <h1>{equipo.name}</h1>

      {sp.ok === "verificado" ? (
        <p className="nn-ok" role="status">
          {t("okVerificado")}
        </p>
      ) : null}
      {sp.ok === "registrado" ? (
        <p className="nn-ok" role="status">
          {t("okRegistrado")}
        </p>
      ) : null}
      {sp.ok === "patron" ? (
        <p className="nn-ok" role="status">
          {t("okPatron")}
        </p>
      ) : null}
      {sp.ok === "modo" ? (
        <p className="nn-ok" role="status">
          {t("okModo")}
        </p>
      ) : null}
      {sp.ok === "condicion" ? (
        <p className="nn-ok" role="status">
          {t("okCondicion")}
        </p>
      ) : null}
      {sp.ok === "datos" ? (
        <p className="nn-ok" role="status">
          {t("okDatos")}
        </p>
      ) : null}
      {sp.ok === "rutina_creada" ? (
        <p className="nn-ok" role="status">
          {t("okRutinaCreada")}
        </p>
      ) : null}
      {sp.ok === "rutina_registrada" ? (
        <p className="nn-ok" role="status">
          {t("okRutinaRegistrada")}
        </p>
      ) : null}
      {sp.ok === "rutina_anulada" ? (
        <p className="nn-ok" role="status">
          {t("okRutinaAnulada")}
        </p>
      ) : null}

      {codigoError ? (
        <p className="nn-error" role="alert">
          {codigoError === "rutina_duplicada"
            ? t("errorRutinaDuplicada")
            : codigoError === "fecha_futura"
              ? t("errorFechaFutura")
              : codigoError === "motivo_obligatorio"
                ? t("errorMotivoObligatorio")
                : codigoError === "codigo_interno_duplicado"
                  ? t("errorCodigoInternoDuplicado")
                  : codigoError === "modelo_no_elegible" ||
                      codigoError === "modelo_de_otro_tipo" ||
                      codigoError === "modelo_retirado" ||
                      codigoError === "modelo_no_encontrado"
                    ? t("errorModeloNoElegible")
                    : codigoError === "forbidden"
                      ? t("errorSinPermiso")
                      : codigoError === "unidad_distinta"
                        ? t("errorUnidadDistinta")
                        : codigoError === "insumo_ajeno"
                          ? t("errorInsumoAjeno")
                          : t("errorModeloGenerico", { codigo: codigoError })}
        </p>
      ) : null}

      <section style={{ marginTop: "1.5rem" }}>
        <h2>{t("identificacion")}</h2>
        <p>
          <strong>{t("campoModeloDeEquipo")}:</strong>{" "}
          {equipo.model ? (
            <Link href={`/equipos/modelos/${equipo.model.id}`}>
              {equipo.model.manufacturer} {equipo.model.modelName}
            </Link>
          ) : (
            t("sinModelo")
          )}
        </p>
        <p>
          <strong>{t("campoSerie")}:</strong> {equipo.serialNumber ?? "—"}
        </p>
        <p>
          <strong>{t("campoCodigoInterno")}:</strong> {equipo.internalCode ?? "—"}
        </p>
        <p>
          <strong>{t("campoProveedor")}:</strong> {equipo.supplier ? equipo.supplier.name : t("sinProveedor")}
        </p>
        <p>
          <strong>{t("campoGarantia")}:</strong>{" "}
          {equipo.warrantyUntil ? (
            <>
              {equipo.warrantyUntil.toISOString().slice(0, 10)}
              {equipo.warrantyUntil.toISOString().slice(0, 10) < hoy ? ` — ${t("garantiaVencida")}` : null}
            </>
          ) : (
            "—"
          )}
        </p>

        {puedeGestionar ? (
          <details>
            <summary>{t("editarDatos")}</summary>
            <form action={editarDatosDeEquipoFormAction}>
              <input type="hidden" name="equipmentId" value={equipo.id} />
              <label>
                {t("campoModeloDeEquipo")}
                <select name="modelId" defaultValue={equipo.modelId ?? ""}>
                  <option value="">{t("modeloNinguno")}</option>
                  {/* El modelo ACTUAL siempre se ofrece, aunque esté retirado o no sea
                      elegible hoy: si faltara, el formulario enviaría "" y editar la
                      serie borraría el modelo en silencio. */}
                  {equipo.model && !modeloActualElegible ? (
                    <option value={equipo.model.id}>
                      {equipo.model.manufacturer} {equipo.model.modelName}
                      {equipo.model.retiredAt ? ` (${t("modeloRetirado")})` : null}
                    </option>
                  ) : null}
                  {modelosElegibles.compartidos.length > 0 ? (
                    <optgroup label={t("modelosCompartidos")}>
                      {modelosElegibles.compartidos.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.manufacturer} {m.modelName}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {modelosElegibles.propios.length > 0 ? (
                    <optgroup label={t("modelosPropios")}>
                      {modelosElegibles.propios.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.manufacturer} {m.modelName}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <label>
                {t("campoSerie")}
                <input type="text" name="serialNumber" maxLength={120} defaultValue={equipo.serialNumber ?? ""} />
              </label>
              <label>
                {t("campoCodigoInterno")}
                <input type="text" name="internalCode" maxLength={60} defaultValue={equipo.internalCode ?? ""} />
              </label>
              <label>
                {t("campoProveedor")}
                <select name="supplierOrganizationId" defaultValue={equipo.supplierOrganizationId ?? ""}>
                  <option value="">{t("sinProveedor")}</option>
                  {/* Igual que el modelo: el proveedor actual se ofrece siempre. */}
                  {equipo.supplier && !proveedores.some((p) => p.id === equipo.supplier!.id) ? (
                    <option value={equipo.supplier.id}>{equipo.supplier.name}</option>
                  ) : null}
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("campoGarantia")}
                <input
                  type="date"
                  name="warrantyUntil"
                  defaultValue={equipo.warrantyUntil ? equipo.warrantyUntil.toISOString().slice(0, 10) : ""}
                />
              </label>
              <BotonDeEnvio>{t("editarDatos")}</BotonDeEnvio>
            </form>
          </details>
        ) : null}
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>{t("rutinas")}</h2>
        <p className="nn-muted">{t("rutinasIntro")}</p>
        {rutinas.map((r) => (
          <TarjetaDeRutina
            key={r.id}
            rutina={r}
            puedeGestionar={puedeGestionar}
            puedeApuntar={puedeApuntar}
            camposOcultos={{ equipmentId: equipo.id }}
            personas={personas}
            t={t}
          />
        ))}

        {puedeGestionar ? (
          <details>
            <summary>{t("rutinaAnadir")}</summary>
            <form action={crearRutinaFormAction}>
              <input type="hidden" name="equipmentId" value={equipo.id} />
              <label>
                {t("rutinaTipo")}
                <select name="kind" defaultValue="mantenimiento">
                  {(["mantenimiento", "limpieza", "fumigacion", "otra"] as const).map((k) => (
                    <option key={k} value={k}>
                      {t(`rutina_${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("rutinaNota")}
                <input type="text" name="kindNote" maxLength={120} />
              </label>
              <label>
                {t("rutinaDias")}
                <CampoNumerico name="intervalDays" min={1} step={1} required />
              </label>
              <label>
                {t("rutinaInstrucciones")}
                <textarea name="instructions" rows={2} />
              </label>
              <BotonDeEnvio>{t("rutinaAnadir")}</BotonDeEnvio>
            </form>
          </details>
        ) : null}
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>{t("documentos")}</h2>
        <h3>{t("documentosDelEquipo")}</h3>
        {documentos.propios.length === 0 ? (
          <p className="nn-muted">{t("documentosVacio")}</p>
        ) : (
          <ul>
            {documentos.propios.map((d) => (
              <li key={d.id}>
                <a href={d.url} target="_blank" rel="noreferrer">
                  {d.originalFilename ?? d.id}
                </a>
              </li>
            ))}
          </ul>
        )}
        {puedeGestionar ? <DocumentoUploadForm destino={{ tipo: "equipo", equipmentId: equipo.id }} /> : null}

        <h3>{t("documentosHeredados")}</h3>
        {documentos.delModelo.length === 0 ? (
          <p className="nn-muted">{t("documentosVacio")}</p>
        ) : (
          <ul>
            {documentos.delModelo.map((d) => (
              <li key={d.id}>
                <a href={d.url} target="_blank" rel="noreferrer">
                  {d.originalFilename ?? d.id}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {esInstrumento ? (
        <p>
          <strong>{t("estadoActual")}:</strong> {t(`verificacion_${equipo.verificacion}`)}
          {equipo.checkAdvisoryHours
            ? ` — ${t("avisoCada", { horas: equipo.checkAdvisoryHours })}`
            : ` — ${t("sinPlazo")}`}
        </p>
      ) : null}

      {esInstrumento ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("verificarTitulo")}</h2>
          {patrones.length === 0 ? (
            <p className="nn-muted">{t("sinPatrones")}</p>
          ) : (
            <form action={verificarInstrumentoFormAction}>
              <TimezoneOffsetField />
              <input type="hidden" name="equipmentId" value={equipo.id} />
              <p className="nn-muted">{t("verificarIntro")}</p>
              <table className="nn-table">
                <thead>
                  <tr>
                    <th>{t("colPatron")}</th>
                    <th>{t("colReferencia")}</th>
                    <th>{t("colTolerancia")}</th>
                    <th>{t("colObservado")}</th>
                  </tr>
                </thead>
                <tbody>
                  {patrones.map((p) => (
                    <tr key={p.id}>
                      <td>{p.label}</td>
                      <td>
                        {String(p.referenceValue)} {p.unit}
                      </td>
                      <td>
                        ± {String(p.toleranceAbs)} {p.unit}
                      </td>
                      <td>
                        {/* Vacío = NO se envía. Un campo en blanco leído como cero
                            aprobaría el patrón del agua sin que nadie mirara. */}
                        <CampoNumerico
                          step="any"
                          name={`observado_${p.id}`}
                          aria-label={`${p.label} (${p.unit})`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <label>
                {t("campoCuando")}
                <input type="datetime-local" name="occurredAt" required />
              </label>
              <label>
                {t("campoTemperatura")}
                <CampoNumerico step="any" name="ambientTempC" />
              </label>
              <label>
                {t("campoNota")}
                <textarea name="note" rows={2} />
              </label>
              <BotonDeEnvio>{t("botonVerificar")}</BotonDeEnvio>
            </form>
          )}
        </section>
      ) : null}

      {esInstrumento && puedeGestionar ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("patronTitulo")}</h2>
          {/* Sólo para quien tiene `equipment:manage`. Declarar contra qué se
              contrasta un instrumento es la decisión del jefe de beneficio con el
              especialista en procesos, no del operario que lo usa. */}
          <p className="nn-muted">{t("patronIntro")}</p>
          <form action={declararPatronFormAction}>
            <input type="hidden" name="equipmentId" value={equipo.id} />
            <label>
              {t("campoEtiqueta")}
              <input type="text" name="label" required maxLength={80} placeholder={t("campoEtiquetaEjemplo")} />
            </label>
            <label>
              {t("colReferencia")}
              <CampoNumerico step="any" name="referenceValue" required />
            </label>
            <label>
              {t("campoUnidad")}
              <input type="text" name="unit" required maxLength={12} placeholder="°Bx" />
            </label>
            <label>
              {t("colTolerancia")}
              <CampoNumerico step="any" name="toleranceAbs" required min={0} />
            </label>
            <p className="nn-muted">{t("campoToleranciaAyuda")}</p>
            <BotonDeEnvio>{t("botonDeclararPatron")}</BotonDeEnvio>
          </form>
        </section>
      ) : null}

      {esInstrumento ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("modosTitulo")}</h2>
          <p className="nn-muted">{t("modosIntro")}</p>
          {equipo.modes.length === 0 ? (
            <p className="nn-muted">{t("sinModos")}</p>
          ) : (
            <ul>
              {equipo.modes.map((m) => (
                <li key={m.id}>
                  <strong>{m.label}</strong> — {t(`material_${m.materialState}`)}
                  {" · "}
                  {m.variable ? t(`variable_${m.variable}` as "variable_brix") : t("variableSinDeclarar")}
                  {" · "}
                  {m.rangeMin != null || m.rangeMax != null
                    ? `${m.rangeMin != null ? String(m.rangeMin) : "?"}–${m.rangeMax != null ? String(m.rangeMax) : "?"}`
                    : t("rangoSinDeclarar")}
                </li>
              ))}
            </ul>
          )}
          {puedeGestionar ? (
            <form action={declararModoFormAction}>
              <input type="hidden" name="equipmentId" value={equipo.id} />
              <label>
                {t("campoEtiqueta")}
                <input type="text" name="label" required maxLength={80} placeholder={t("campoModoEjemplo")} />
              </label>
              <label>
                {t("campoMaterial")}
                <select name="materialState" required defaultValue="">
                  <option value="" disabled>
                    {t("elegir")}
                  </option>
                  {MATERIALES_DE_MODO.map((mt) => (
                    <option key={mt} value={mt}>
                      {t(`material_${mt}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("campoVariable")}
                <select name="variable" required defaultValue="">
                  <option value="" disabled>
                    {t("elegir")}
                  </option>
                  {VARIABLES_DE_MODO.map((v) => (
                    <option key={v} value={v}>
                      {t(`variable_${v}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("campoRangoMin")}
                <CampoNumerico step="any" name="rangeMin" />
              </label>
              <label>
                {t("campoRangoMax")}
                <CampoNumerico step="any" name="rangeMax" />
              </label>
              <p className="nn-muted">{t("campoRangoAyuda")}</p>
              <BotonDeEnvio>{t("botonDeclararModo")}</BotonDeEnvio>
            </form>
          ) : null}
        </section>
      ) : null}

      <section style={{ marginTop: "1.5rem" }}>
        <h2>{t("condicionTitulo")}</h2>
        <p className="nn-muted">{t("condicionIntro")}</p>
        <form action={informarCondicionFormAction}>
          <TimezoneOffsetField />
          <input type="hidden" name="equipmentId" value={equipo.id} />
          <label>
            {t("campoCondicion")}
            <select name="condition" defaultValue="operational">
              {["operational", "needs_cleaning", "needs_maintenance", "faulty", "out_of_service"].map((c) => (
                <option key={c} value={c}>
                  {t(`condicion_${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("campoCuando")}
            <input type="datetime-local" name="occurredAt" required />
          </label>
          <label>
            {t("campoNota")}
            <textarea name="note" rows={2} />
          </label>
          <BotonDeEnvio>{t("botonInformar")}</BotonDeEnvio>
        </form>
      </section>

      {esInstrumento && equipo.checks.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("historialTitulo")}</h2>
          <ul>
            {equipo.checks.map((c) => (
              <li key={c.id}>
                {c.occurredAt.toISOString().slice(0, 16).replace("T", " ")} — {t(`veredicto_${c.outcome}`)}
                {c.results.length > 0
                  ? ` (${c.results
                      .map((r) => `${r.requirement.label}: ${String(r.observedValue)} ${r.requirement.unit}`)
                      .join(" · ")})`
                  : ` — ${t("sinContrastes")}`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
