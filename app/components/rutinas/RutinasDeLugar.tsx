import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { crearRutinaFormAction } from "../../actions/rutinas";
import { BotonDeEnvio } from "../BotonDeEnvio";
import { CampoNumerico } from "../CampoNumerico";
import { TarjetaDeRutina } from "./TarjetaDeRutina";
import { rutinasDeLugar } from "../../../lib/rutinas/rutinas";
import { equiposAqui, insumosDeLugar, lugarConRutinasOVacio, puedeSobreLugar } from "../../../lib/rutinas/lugares";
import { getObserverCandidates } from "../../../lib/traceability/lots";
import { diaDeHoy } from "../../../lib/time/diaDeHoy";

/**
 * Rutinas de un lugar y los equipos que hay en él (spec 2026-09-19 §5). Un solo
 * bloque para `/bodegas/[id]`, `/instalaciones/[id]` y `/beneficio`, que así
 * sólo AÑADEN una línea —lo que evita chocar con `secado-2a`—.
 *
 * Si el lugar no admite rutina propia (`lugar_sin_rutinas`, o una cama que
 * cuelga de un `drying_rack`, `rutina_en_el_estante`) no pinta nada: montarlo
 * en cualquier lugar de `/instalaciones/[id]` no puede tumbar la página
 * (arreglo de revisión de Tarea 6).
 */
export async function RutinasDeLugar({
  userAccountId,
  locationId,
  insumos: insumosDelLlamador,
  personas: personasDelLlamador,
}: {
  userAccountId: string;
  locationId: string;
  /**
   * Ya resueltos por el llamador (arreglo de revisión final, Hallazgo 4): evita
   * el N+1 de `insumosDeLugar`/`getObserverCandidates` cuando una página monta
   * varias instancias (`/instalaciones/[id]`, `/beneficio`). Si faltan, el
   * componente los resuelve solo — lo que mantiene `/bodegas/[id]` en una línea.
   */
  insumos?: Awaited<ReturnType<typeof insumosDeLugar>>;
  personas?: { id: string; name: string }[];
}) {
  const [t, lugar, puedeVer, puedeGestionar, puedeApuntar] = await Promise.all([
    getTranslations("Equipos"),
    lugarConRutinasOVacio(locationId),
    puedeSobreLugar(userAccountId, locationId, "view"),
    puedeSobreLugar(userAccountId, locationId, "manage"),
    puedeSobreLugar(userAccountId, locationId, "report_condition"),
  ]);
  if (!lugar || !puedeVer) return null;
  const hoy = diaDeHoy(new Date(), lugar.timezone ?? null);
  const [rutinas, insumos, equipos, personas] = await Promise.all([
    rutinasDeLugar(userAccountId, locationId, hoy),
    insumosDelLlamador ?? insumosDeLugar(userAccountId, locationId),
    equiposAqui(userAccountId, locationId),
    personasDelLlamador
      ? Promise.resolve(personasDelLlamador)
      : getObserverCandidates(userAccountId).then((o) => o.people.map((p) => ({ id: p.id, name: p.displayName }))),
  ]);
  return (
    <section style={{ marginTop: "1.5rem" }}>
      <h2>{t("rutinas")}</h2>
      <p className="nn-muted">{t("rutinasDeLugarIntro")}</p>
      {rutinas.map((r) => (
        <TarjetaDeRutina
          key={r.id}
          rutina={r}
          puedeGestionar={puedeGestionar}
          puedeApuntar={puedeApuntar}
          camposOcultos={{ locationId }}
          personas={personas}
          insumos={insumos}
          t={t}
        />
      ))}
      {puedeGestionar ? (
        <details>
          <summary>{t("rutinaAnadir")}</summary>
          <form action={crearRutinaFormAction}>
            <input type="hidden" name="locationId" value={locationId} />
            <label>
              {t("rutinaTipo")}
              <select name="kind" defaultValue="limpieza">
                {(["limpieza", "fumigacion", "mantenimiento", "otra"] as const).map((k) => (
                  <option key={k} value={k}>{t(`rutina_${k}`)}</option>
                ))}
              </select>
            </label>
            <label>{t("rutinaNota")}<input type="text" name="kindNote" maxLength={120} /></label>
            <label>{t("rutinaDias")}<CampoNumerico name="intervalDays" min={1} step={1} required /></label>
            <label>{t("rutinaInstrucciones")}<textarea name="instructions" rows={2} /></label>
            <BotonDeEnvio>{t("rutinaAnadir")}</BotonDeEnvio>
          </form>
        </details>
      ) : null}
      <h2>{t("equiposAqui")}</h2>
      {equipos.length === 0 ? <p className="nn-muted">{t("sinEquiposAqui")}</p> : (
        <ul>{equipos.map((e) => <li key={e.id}><Link href={`/equipos/${e.id}`}>{e.name}</Link></li>)}</ul>
      )}
    </section>
  );
}
