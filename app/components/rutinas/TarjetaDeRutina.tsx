import type { getTranslations } from "next-intl/server";

import {
  anularRegistroFormAction,
  cambiarIntervaloFormAction,
  registrarRealizadaFormAction,
  retirarRutinaFormAction,
} from "../../actions/rutinas";
import { BotonDeEnvio } from "../BotonDeEnvio";
import { OpcionesDePersona, type OpcionDePersona } from "../OpcionesDePersona";
import { CampoNumerico } from "../CampoNumerico";
import type { RutinaConEstado } from "../../../lib/rutinas/rutinas";

type T = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Una rutina de equipo, con su estado y su historial (spec de catálogos §3.4).
 *
 * **No sabe de equipos.** Todo lo que necesita para las tres acciones de
 * gestión —anular, cambiar intervalo, retirar— y la de faena —registrar que se
 * hizo— llega en `camposOcultos` (aquí siempre `{ equipmentId }`, para que las
 * acciones sepan a dónde revalidar y redirigir) y en `personas`. Servidor puro:
 * ningún estado propio, sólo formularios de `app/actions/rutinas.ts`.
 */
export function TarjetaDeRutina({
  rutina,
  puedeGestionar,
  puedeApuntar,
  camposOcultos,
  personas,
  insumos,
  t,
}: {
  rutina: RutinaConEstado;
  puedeGestionar: boolean;
  puedeApuntar: boolean;
  camposOcultos: Record<string, string>;
  personas: readonly OpcionDePersona[];
  insumos?: { id: string; etiqueta: string }[];
  t: T;
}) {
  const ocultos = (
    <>
      {Object.entries(camposOcultos).map(([nombre, valor]) => (
        <input key={nombre} type="hidden" name={nombre} value={valor} />
      ))}
    </>
  );

  const titulo = rutina.kindNote ?? t(`rutina_${rutina.kind}` as "rutina_mantenimiento");

  return (
    <div className="nn-card" style={{ marginBottom: "1rem" }}>
      <h3>{titulo}</h3>
      <p className="nn-muted">{t("rutinaCada", { dias: rutina.intervalDays })}</p>

      {rutina.estado.estado === "sin_referencia" ? <p>{t("rutinaSinReferencia")}</p> : null}
      {rutina.estado.estado === "al_dia" ? <p>{t("rutinaAlDia", { proximo: rutina.estado.proximo })}</p> : null}
      {rutina.estado.estado === "vencida" ? (
        <p>
          <strong>{t("rutinaVencida", { pasaron: rutina.estado.pasaron })}</strong>
        </p>
      ) : null}

      {puedeApuntar ? (
        <form action={registrarRealizadaFormAction}>
          {ocultos}
          <input type="hidden" name="routineId" value={rutina.id} />
          <label>
            {t("rutinaFecha")}
            <input type="date" name="performedOn" required />
          </label>
          <label>
            {t("rutinaQuien")}
            <select name="performedByPersonId" defaultValue="">
              <option value="" />
              <OpcionesDePersona personas={personas} />
            </select>
          </label>
          <label>
            {t("rutinaNota")}
            <textarea name="note" rows={2} />
          </label>
          <label>
            {t("campoProcedencia")}
            <select name="provenanceClass" defaultValue="original_record">
              <option value="original_record">{t("procedencia_original_record")}</option>
              <option value="manufacturer_specification">{t("procedencia_manufacturer_specification")}</option>
            </select>
          </label>
          {insumos?.length ? (
            <fieldset>
              <legend>{t("rutinaInsumos")}</legend>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ display: "flex", gap: "0.5rem" }}>
                  <select name={`insumo_${i}_lote`} defaultValue="">
                    <option value="">{t("rutinaSinInsumo")}</option>
                    {insumos.map((x) => (
                      <option key={x.id} value={x.id}>{x.etiqueta}</option>
                    ))}
                  </select>
                  <CampoNumerico name={`insumo_${i}_cantidad`} min={0} step="any" placeholder={t("rutinaCantidad")} />
                  <input type="text" name={`insumo_${i}_unidad`} maxLength={20} placeholder={t("rutinaUnidad")} />
                </div>
              ))}
            </fieldset>
          ) : null}
          <BotonDeEnvio>{t("rutinaRegistrar")}</BotonDeEnvio>
        </form>
      ) : null}

      {rutina.registros.length > 0 ? (
        <details style={{ marginTop: "0.5rem" }}>
          <summary>{t("rutinaHistorial")}</summary>
          <ul>
            {rutina.registros.map((r) => (
              <li key={r.id}>
                {r.voidedAt ? (
                  <s>
                    {r.performedOn.toISOString().slice(0, 10)}
                    {r.performedBy ? ` — ${r.performedBy.displayName}` : ""}
                    {r.note ? ` — ${r.note}` : ""}
                    {r.productos.length
                      ? ` — ${r.productos.map((p) => (p.quantity ? `${p.materialName} ${p.quantity} ${p.unit ?? ""}` : p.materialName)).join(", ")}`
                      : rutina.kind === "fumigacion"
                        ? ` — ${t("rutinaProductoSinDeclarar")}`
                        : ""}
                  </s>
                ) : (
                  <>
                    {r.performedOn.toISOString().slice(0, 10)}
                    {r.performedBy ? ` — ${r.performedBy.displayName}` : ""}
                    {r.note ? ` — ${r.note}` : ""}
                    {r.productos.length
                      ? ` — ${r.productos.map((p) => (p.quantity ? `${p.materialName} ${p.quantity} ${p.unit ?? ""}` : p.materialName)).join(", ")}`
                      : rutina.kind === "fumigacion"
                        ? ` — ${t("rutinaProductoSinDeclarar")}`
                        : ""}
                  </>
                )}
                {r.voidedAt ? ` — ${t("rutinaAnulada")}: ${r.voidReason}` : null}
                {!r.voidedAt && puedeGestionar ? (
                  <form action={anularRegistroFormAction} style={{ display: "inline", marginLeft: "0.5rem" }}>
                    {ocultos}
                    <input type="hidden" name="eventId" value={r.id} />
                    <input type="text" name="motivo" required placeholder={t("rutinaMotivo")} maxLength={200} />
                    <BotonDeEnvio className="nn-button-quiet">{t("rutinaAnular")}</BotonDeEnvio>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {puedeGestionar ? (
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "1rem" }}>
          <form action={cambiarIntervaloFormAction}>
            {ocultos}
            <input type="hidden" name="routineId" value={rutina.id} />
            <label>
              {t("rutinaCambiarIntervalo")}
              <CampoNumerico name="intervalDays" min={1} step={1} defaultValue={rutina.intervalDays} />
            </label>
            <BotonDeEnvio className="nn-button-quiet">{t("rutinaCambiarIntervalo")}</BotonDeEnvio>
          </form>

          <form action={retirarRutinaFormAction}>
            {ocultos}
            <input type="hidden" name="routineId" value={rutina.id} />
            <BotonDeEnvio className="nn-button-quiet">{t("rutinaRetirar")}</BotonDeEnvio>
          </form>
        </div>
      ) : null}
    </div>
  );
}
