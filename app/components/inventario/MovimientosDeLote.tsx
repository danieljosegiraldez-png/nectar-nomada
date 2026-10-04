"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import { BotonDeEnvio } from "../BotonDeEnvio";
import { CampoNumerico } from "../CampoNumerico";

import {
  botarFormAction,
  contarFormAction,
  cuadrarFormAction,
  perderFormAction,
  type EstadoDeExistencias,
} from "../../actions/existencias";

/**
 * Los cuatro movimientos de un lote: contar, cuadrar, botar, perder.
 *
 * **Cada uno es su propio formulario con su propio estado**, no un formulario con
 * un selector de acción: el motivo es obligatorio en tres de ellos y opcional en
 * ninguno de los que lo piden, así que un formulario común tendría que decidir en
 * tiempo de ejecución qué validar — y esa decisión es justo la que se olvida.
 *
 * **La unidad viaja como campo oculto, tomada del lote.** El servicio rechaza
 * mezclar unidades, así que ofrecerla editable sería ofrecer un error.
 */
const VACIO: EstadoDeExistencias = {};

function Error_({ estado }: { estado: EstadoDeExistencias }) {
  return estado.error ? <p className="nn-alerta">{estado.error}</p> : null;
}

export function MovimientosDeLote({ consumableLotId, unidad }: { consumableLotId: string; unidad: string }) {
  const t = useTranslations("Inventario");
  const [contar, accionContar] = useActionState(contarFormAction, VACIO);
  const [cuadrar, accionCuadrar] = useActionState(cuadrarFormAction, VACIO);
  const [botar, accionBotar] = useActionState(botarFormAction, VACIO);
  const [perder, accionPerder] = useActionState(perderFormAction, VACIO);

  const ocultos = (
    <>
      <input type="hidden" name="consumableLotId" value={consumableLotId} />
      <input type="hidden" name="unit" value={unidad} />
    </>
  );

  return (
    <>
      <section className="nn-section">
        <h2>{t("contarTitulo")}</h2>
        <p className="nn-muted">{t("contarAyuda")}</p>
        <form action={accionContar}>
          {ocultos}
          <label htmlFor="contar-cantidad">{t("campoCantidadConUnidad", { unidad })}</label>
          <CampoNumerico id="contar-cantidad" name="quantity" step="any" min="0" required />
          <Error_ estado={contar} />
          <BotonDeEnvio>{t("contarBoton")}</BotonDeEnvio>
        </form>
      </section>

      <section className="nn-section">
        <h2>{t("cuadrarTitulo")}</h2>
        <p className="nn-muted">{t("cuadrarAyuda")}</p>
        <form action={accionCuadrar}>
          {ocultos}
          <label htmlFor="cuadrar-direccion">{t("cuadrarDireccionLabel")}</label>
          <select id="cuadrar-direccion" name="direccion" defaultValue="alza" required>
            <option value="alza">{t("cuadrarSobra")}</option>
            <option value="baja">{t("cuadrarFalta")}</option>
          </select>
          <label htmlFor="cuadrar-cantidad">{t("campoCantidadConUnidad", { unidad })}</label>
          <CampoNumerico id="cuadrar-cantidad" name="quantity" step="any" min="0" required />
          {/* Obligatoria en el servicio Y en la base: cuadrar es una afirmación
              sobre lo que pasó, y una afirmación sin razón no se puede auditar. */}
          <label htmlFor="cuadrar-razon">{t("cuadrarRazonLabel")}</label>
          <input id="cuadrar-razon" name="reason" type="text" required />
          <Error_ estado={cuadrar} />
          <BotonDeEnvio>{t("cuadrarBoton")}</BotonDeEnvio>
        </form>
      </section>

      <section className="nn-section">
        <h2>{t("botarTitulo")}</h2>
        <p className="nn-muted">{t("botarAyuda")}</p>
        <form action={accionBotar}>
          {ocultos}
          <label htmlFor="botar-cantidad">{t("campoCantidadConUnidad", { unidad })}</label>
          <CampoNumerico id="botar-cantidad" name="quantity" step="any" min="0" required />
          <label htmlFor="botar-motivo">{t("motivoLabel")}</label>
          <input id="botar-motivo" name="reason" type="text" required />
          <Error_ estado={botar} />
          <BotonDeEnvio>{t("botarBoton")}</BotonDeEnvio>
        </form>
      </section>

      <section className="nn-section">
        <h2>{t("perderTitulo")}</h2>
        <p className="nn-muted">{t("perderAyuda")}</p>
        <form action={accionPerder}>
          {ocultos}
          <label htmlFor="perder-cantidad">{t("campoCantidadConUnidad", { unidad })}</label>
          <CampoNumerico id="perder-cantidad" name="quantity" step="any" min="0" required />
          <label htmlFor="perder-motivo">{t("motivoLabel")}</label>
          <input id="perder-motivo" name="reason" type="text" required />
          <Error_ estado={perder} />
          <BotonDeEnvio>{t("perderBoton")}</BotonDeEnvio>
        </form>
      </section>
    </>
  );
}
