import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  declararModoFormAction,
  declararPatronFormAction,
  informarCondicionFormAction,
  verificarInstrumentoFormAction,
} from "../../actions/equipos";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";
import { TimezoneOffsetField } from "../../components/TimezoneOffsetField";
import { getCurrentUser } from "../../../lib/auth/session";
import { EquipoError, instrumentoParaVerificar, puedeGestionarEquipo } from "../../../lib/equipos/equipos";

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
  searchParams: Promise<{ ok?: string }>;
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

  const [t, sp, puedeGestionar] = await Promise.all([
    getTranslations("Equipos"),
    searchParams,
    puedeGestionarEquipo(user.userAccountId, id),
  ]);
  const patrones = equipo.checkRequirements;
  const esInstrumento = equipo.kind === "instrument";

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
                        <input
                          type="number"
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
                <input type="number" step="any" name="ambientTempC" />
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
              <input type="number" step="any" name="referenceValue" required />
            </label>
            <label>
              {t("campoUnidad")}
              <input type="text" name="unit" required maxLength={12} placeholder="°Bx" />
            </label>
            <label>
              {t("colTolerancia")}
              <input type="number" step="any" name="toleranceAbs" required min={0} />
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
                <input type="number" step="any" name="rangeMin" />
              </label>
              <label>
                {t("campoRangoMax")}
                <input type="number" step="any" name="rangeMax" />
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
