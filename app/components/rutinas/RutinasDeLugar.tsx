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
 *
 * **No recibe `insumos` como prop, a propósito (ronda 2 de la revisión de
 * PR A).** Lo recibía antes, «ya resuelto por el llamador», y una página con
 * varios bloques (`/instalaciones/[id]`, `/beneficio`) podía —por un `??`, una
 * variable intermedia, o el literal directo— pasarle el valor de OTRO lugar
 * a éste: `report_condition` se juzga por lugar, así que los insumos de la
 * instalación no son los de una cama ni los de un estante, y un guardia que
 * lee la fuente para prohibirlo es una carrera armamentista (dos rondas de
 * revisión independiente lo demostraron, tests/arquitectura/insumos-por-bloque
 * ya no existe). Cada bloque resuelve SIEMPRE `insumosDeLugar` con SU PROPIO
 * `locationId`, así que pasar el de otro lugar ya no compila — el tipo del
 * componente no tiene ese hueco. `personas` (observadores) sí sigue siendo
 * prop: es la misma lista de Personas activas sea cual sea el lugar, así que
 * hoistearla en el llamador evita el N+1 sin ningún riesgo de mezclar lugares.
 */
export async function RutinasDeLugar({
  userAccountId,
  locationId,
  personas: personasDelLlamador,
}: {
  userAccountId: string;
  locationId: string;
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
    insumosDeLugar(userAccountId, locationId),
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
