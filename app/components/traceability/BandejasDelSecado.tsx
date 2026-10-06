"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { bajarBandejaAction, cargarBandejaAction, moverBandejaAction } from "../../actions/bandejasDelSecado";
import { BotonDeEnvio } from "../BotonDeEnvio";
import { CampoNumerico } from "../CampoNumerico";
import type { BandejaEnCorrida, PosicionParaMover } from "../../../lib/traceability/bandejasDelSecado";
import { claveDeErrorDeSecado, DESENLACES_DEL_SECADO } from "../../beneficio/bandejas/errorDeSecado";

type Fila = Omit<BandejaEnCorrida, "desde" | "hasta"> & { desde: string; hasta: string | null };

type Props = {
  lotId: string;
  dryingRunId: string;
  filas: Fila[];
  disponibles: { id: string; nombre: string }[];
  puedeRegistrar: boolean;
  /** Los dos estados materiales válidos al terminar secado, ya traducidos por la página. */
  tiposDeSalida: { valor: string; etiqueta: string }[];
  /** Paso 3b: las posiciones a las que se puede mover cada bandeja CARGADA (ya filtradas a las que esta cuenta ve). */
  posicionesPorBandeja: Record<string, PosicionParaMover[]>;
};

export function BandejasDelSecado({ lotId, dryingRunId, filas, disponibles, puedeRegistrar, tiposDeSalida, posicionesPorBandeja }: Props) {
  const t = useTranslations("BandejasDelSecado");
  const [cargar, accionCargar] = useActionState(cargarBandejaAction, {});
  const [bajar, accionBajar] = useActionState(bajarBandejaAction, {});
  const [mover, accionMover] = useActionState(moverBandejaAction, {});
  const abiertas = filas.filter((f) => f.hasta === null).length;
  // RULING (secado-2b, Tarea 3): un nombre de lugar nulo con su bandera es
  // "oculto para quien mira", nunca una celda vacía ("—").
  const lugar = (nombre: string | null, oculto: boolean | undefined) => nombre ?? (oculto ? t("lugarOculto") : "—");
  const donde = (f: Fila) => !f.posicion
    ? t("sinPosicion")
    : f.posicion.ajena
      ? t("posicionAjena")
      : f.posicion.oculta
        ? t("posicionOculta")
        : f.posicion.estante
          ? t("posicion", {
              instalacion: lugar(f.posicion.instalacion, f.posicion.instalacionOculta),
              estante: f.posicion.estante,
              nivel: f.posicion.nivel ?? "—",
              puesto: f.posicion.puesto ?? "—",
            })
          : t("posicionCama", { instalacion: lugar(f.posicion.instalacion, f.posicion.instalacionOculta), cama: f.posicion.cama ?? "—" });
  return <section>
    <h4>{t("titulo", { abiertas, total: filas.length })}</h4>
    {filas.length === 0 ? <p className="nn-muted">{t("ninguna")}</p> : <ul>
      {filas.map((f) => <li key={f.id}>
        {/* RULING: `nombre` es `null` cuando quien mira no puede ver esta bandeja — nunca el literal "(bandeja oculta)". */}
        <strong>{f.nombre ?? t("bandejaOculta")}</strong> · {donde(f)} · {f.hasta ? t("bajada") : t("cargada")}
        {f.conflicto.length + f.conflictoSinAcceso > 0 && <p role="alert">{t("conflicto", {
          otras: [...f.conflicto, ...(f.conflictoSinAcceso > 0 ? [t("conflictoSinAcceso", { n: f.conflictoSinAcceso })] : [])].join(", "),
        })}</p>}
        {puedeRegistrar && f.hasta === null && (abiertas > 1
          ? <form action={accionBajar} style={{ display: "inline" }}>
            <input type="hidden" name="lotId" value={lotId} />
            <input type="hidden" name="dryingRunTrayId" value={f.id} />
            <BotonDeEnvio className="nn-button">{t("bajar")}</BotonDeEnvio>
          </form>
          // La última: bajarla cierra el secado, así que pide lo mismo que el cierre de siempre.
          : <form action={accionBajar} className="nn-form" style={{ maxWidth: 420 }}>
            <p>{t("ultimaCierra")}</p>
            <input type="hidden" name="lotId" value={lotId} />
            <input type="hidden" name="dryingRunTrayId" value={f.id} />
            <input type="hidden" name="esUltima" value="1" />
            <label>{t("desenlace")}<select name="endedOutcome" defaultValue="" required aria-describedby="desenlace-secado-ayuda">
              <option value="" disabled>{t("elegirDesenlace")}</option>
              {DESENLACES_DEL_SECADO.map((d) => <option key={d} value={d}>{t(`desenlace_${d}` as "desenlace_target_reached")}</option>)}
            </select></label>
            <p id="desenlace-secado-ayuda" className="nn-muted">{t("desenlaceAyuda")}</p>
            <label>{t("codigoSalida")}<input name="outputLotCode" type="text" required /></label>
            <label>{t("tipoSalida")}<select name="outputLotType" defaultValue="" required aria-describedby="salida-secado-ayuda">
              <option value="" disabled>{t("elegirTipoSalida")}</option>
              {tiposDeSalida.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
            </select></label>
            <p id="salida-secado-ayuda" className="nn-muted">{t("tipoSalidaAyuda")}</p>
            <label>{t("cantidad")}<CampoNumerico name="quantity" inputMode="decimal" step="any" min={0} /></label>
            <label>{t("unidad")}<input name="unit" type="text" /></label>
            <BotonDeEnvio className="nn-button">{t("bajarYCerrar")}</BotonDeEnvio>
          </form>)}
        {/* Fix round 1 (Tarea 3, hallazgo 3): un equipo fijo no tiene destino
            posible (`moverBandeja` lo rechaza con `bandeja_fija`), así que no
            se ofrece el formulario de mover. */}
        {puedeRegistrar && f.hasta === null && !f.fija && (
          <form action={accionMover} style={{ display: "inline-flex", gap: "0.25rem" }}>
            <input type="hidden" name="lotId" value={lotId} />
            <input type="hidden" name="equipmentId" value={f.equipmentId} />
            <select name="posicionId" required defaultValue="">
              <option value="" disabled>{t("moverA")}</option>
              {(posicionesPorBandeja[f.equipmentId] ?? []).map((p) => <option key={p.id} value={p.id}>
                {t("posicion", {
                  instalacion: lugar(p.instalacion, p.instalacionOculta),
                  estante: lugar(p.estante, p.estanteOculto),
                  nivel: p.nivel,
                  puesto: p.puesto,
                })}
                {p.ocupada ? ` — ${p.ocupadaPor ? t("ocupadaPor", { bandeja: p.ocupadaPor }) : t("ocupada")}` : ""}
              </option>)}
            </select>
            <BotonDeEnvio className="nn-button">{t("mover")}</BotonDeEnvio>
          </form>
        )}
      </li>)}
    </ul>}
    {bajar.error && <p role="alert">{t(claveDeErrorDeSecado(bajar.error) as "error_bandeja_ocupada")}</p>}
    {mover.error && <p role="alert">{t(claveDeErrorDeSecado(mover.error) as "error_bandeja_ocupada")}</p>}
    {puedeRegistrar && (disponibles.length === 0
      ? <p className="nn-muted">{t("sinDisponibles")}</p>
      : <form action={accionCargar} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input type="hidden" name="lotId" value={lotId} />
        <input type="hidden" name="dryingRunId" value={dryingRunId} />
        <select name="equipmentId" required defaultValue="">
          <option value="" disabled>{t("elegir")}</option>
          {disponibles.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
        <BotonDeEnvio className="nn-button">{t("cargar")}</BotonDeEnvio>
      </form>)}
    {cargar.error && <p role="alert">{t(claveDeErrorDeSecado(cargar.error) as "error_bandeja_ocupada")}</p>}
    <p className="nn-muted">{t("comoSeMueve")}</p>
  </section>;
}
