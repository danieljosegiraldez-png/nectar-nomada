"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { trasladarColmenasFormAction } from "../../actions/apiary";
// Del módulo PURO, no de `traslado.ts`: un valor importado de allí arrastraría `prisma`
// —y `pg`— al paquete del navegador. Lo cazó `cliente-sin-prisma` antes del PR.
import { MOTIVOS_DE_TRASLADO } from "../../../lib/apiary/motivoDeTraslado";
import type { DestinoCandidato } from "../../../lib/apiary/traslado";
import { Ayuda } from "./Ayuda";
import { BotonDeEnvio } from "../BotonDeEnvio";

export interface ColmenaSeleccionable {
  id: string;
  identifier: string;
  /** Si tiene colonia activa. Lo usa el atajo «solo pobladas». */
  poblada: boolean;
}

/**
 * Trasladar colmenas — `48_A9_ANEXO_E_PANTALLAS_Y_FORMULARIOS.md` §8.
 *
 * **Los atajos no son comodidad.** El Anexo lo dice con las manos del oficio: *«Selección
 * múltiple con atajos, porque nadie toca veinte casillas con guante.»* De ahí «todas» y
 * «solo pobladas», y de ahí que las casillas sean grandes.
 *
 * **Los conteos de antes y después se enseñan SIEMPRE, y son el control.** *«El conteo
 * antes y después se muestra en ambos apiarios antes de confirmar, porque es el único
 * control contra un traslado a medias.»* Se calculan aquí, en el cliente, restando y
 * sumando lo seleccionado sobre las cifras que el servidor trajo: la pantalla enseña lo que
 * VA a pasar, y el servidor devuelve después lo que pasó.
 *
 * **El aviso del destino tiene dos mitades y sólo una existe.** La carencia corriendo se
 * avisa con sus días. Las aspersiones previstas **no están en el sistema** —no hay tabla de
 * aplicaciones de fincas vecinas—, así que en vez de callarlo la pantalla dice que ese lado
 * no se ha preguntado. Un aviso vacío se habría leído como «el destino está limpio».
 *
 * **Vocabulario del vacío (ADR-125).** El destino y el motivo son obligatorios, así que su
 * primera opción va **sin texto y `disabled`**: un placeholder no es una respuesta. No hay
 * ninguna opción que diga «Sin registrar».
 */
export function TrasladoForm({
  apiaryId,
  apiaryNombre,
  colmenas,
  colmenasEnOrigen,
  destinos,
  hoy,
}: {
  apiaryId: string;
  apiaryNombre: string;
  colmenas: ColmenaSeleccionable[];
  colmenasEnOrigen: number;
  destinos: DestinoCandidato[];
  /** `YYYY-MM-DD` calculado en el servidor: el cliente no decide qué día es hoy. */
  hoy: string;
}) {
  const t = useTranslations("Apiary");
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [destinoId, setDestinoId] = useState("");

  const destino = useMemo(() => destinos.find((d) => d.locationId === destinoId), [destinos, destinoId]);
  const n = seleccion.length;

  function alternar(id: string) {
    setSeleccion((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <form action={trasladarColmenasFormAction} className="nn-form">
      <input type="hidden" name="apiaryId" value={apiaryId} />

      <fieldset>
        <legend>{t("trasladoColmenasLegend")}</legend>
        <div className="nn-atajos">
          <button type="button" className="nn-link-button" onClick={() => setSeleccion(colmenas.map((c) => c.id))}>
            {t("trasladoTodas")}
          </button>
          <button
            type="button"
            className="nn-link-button"
            onClick={() => setSeleccion(colmenas.filter((c) => c.poblada).map((c) => c.id))}
          >
            {t("trasladoSoloPobladas")}
          </button>
          <button type="button" className="nn-link-button" onClick={() => setSeleccion([])}>
            {t("trasladoNinguna")}
          </button>
        </div>
        <ul className="nn-seleccion">
          {colmenas.map((c) => (
            <li key={c.id}>
              <label htmlFor={`tras-${c.id}`}>
                <input
                  id={`tras-${c.id}`}
                  type="checkbox"
                  name="hiveIds"
                  value={c.id}
                  checked={seleccion.includes(c.id)}
                  onChange={() => alternar(c.id)}
                />{" "}
                {c.identifier}
                {c.poblada ? "" : ` · ${t("trasladoSinColonia")}`}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="nn-field">
        <label htmlFor="tras-destino">{t("trasladoDestinoLabel")}</label>
        <select
          id="tras-destino"
          name="destinationLocationId"
          value={destinoId}
          onChange={(e) => setDestinoId(e.target.value)}
          required
        >
          <option value="" disabled />
          {destinos.map((d) => (
            <option key={d.locationId} value={d.locationId}>
              {d.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="tras-fecha">{t("trasladoFechaLabel")}</label>
        <input id="tras-fecha" name="occurredAt" type="date" defaultValue={hoy} required />
      </div>

      <div className="nn-field">
        <label htmlFor="tras-motivo">{t("trasladoMotivoLabel")}</label>
        <select id="tras-motivo" name="reason" defaultValue="" required>
          <option value="" disabled />
          {MOTIVOS_DE_TRASLADO.map((m) => (
            <option key={m} value={m}>
              {t(`trasladoMotivo_${m}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor="tras-piqueras">{t("trasladoPiquerasLabel")}</label>
        {/* Tres estados: sin texto es «no se anotó», que no es «se viajó abiertas». */}
        <select id="tras-piqueras" name="entrancesClosed" defaultValue="">
          <option value="" />
          <option value="si">{t("triSi")}</option>
          <option value="no">{t("triNo")}</option>
        </select>
        <Ayuda resumen={t("ayudaResumen")}>{t("trasladoPiquerasHelp")}</Ayuda>
      </div>

      {/* EL CONTROL: lo que va a pasar en los dos apiarios, antes de confirmar. */}
      <p className="nn-conteos">
        {apiaryNombre}: {colmenasEnOrigen} → {colmenasEnOrigen - n}
        <br />
        {destino ? `${destino.nombre}: ${destino.colmenas} → ${destino.colmenas + n}` : t("trasladoSinDestino")}
      </p>

      {destino && destino.diasDeCarenciaMasLarga !== null ? (
        <p className="nn-alerta nn-alerta-critico">
          {t("trasladoAvisoCarencia", {
            colonias: destino.coloniasConCarencia,
            dias: destino.diasDeCarenciaMasLarga,
          })}
        </p>
      ) : null}

      {/* La mitad que no existe se dice, no se calla. */}
      <p className="nn-vital-sin-registro">{t("trasladoAspersionesSinConsultar")}</p>

      {/* `BotonDeEnvio` y no un `<button>` propio: se apaga mientras el envío está en
          curso, que es lo que evita crear el traslado dos veces con un dedo. Su `disabled`
          se COMBINA con el `pending` desde el arreglo de hoy; antes lo sobrescribía. */}
      <BotonDeEnvio disabled={n === 0 || destinoId === ""}>{t("trasladoConfirmar", { n })}</BotonDeEnvio>
    </form>
  );
}
