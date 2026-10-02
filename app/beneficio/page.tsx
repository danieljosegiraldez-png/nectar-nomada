import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { permissionKeysAnywhere } from "../../lib/rbac/service";
import { listarBeneficios } from "../../lib/traceability/beneficios";
import { datosDelTablero } from "../../lib/beneficio/datosDelTablero";
import {
  colaDeAtencion,
  instrumentosQuePidenAtencion,
  LINAJE_DEMASIADO_HONDO,
  ocupacionDelSitio,
  type FilaDeAtencion,
  type GrupoDeAtencion,
} from "../../lib/beneficio/tablero";
import { AvisoDeRutina } from "../components/rutinas/AvisoDeRutina";
import { RutinasDeLugar } from "../components/rutinas/RutinasDeLugar";
import { NavegacionBeneficio } from "../components/beneficio/NavegacionBeneficio";
import { destinosDelBeneficio, repartirDestinos } from "./destinos";

export const dynamic = "force-dynamic";

/**
 * La sección Beneficio: **el tablero arriba, el índice abajo** (ADR-193).
 *
 * **Por qué esta ruta y no una nueva.** El enfoque A que Daniel aprobó el 2026-09-16 ya
 * nombraba `/beneficio` para el tablero; el índice la ocupó mientras el tablero esperaba tres
 * semanas. Un `/beneficio/tablero` haría del tablero un destino DENTRO del índice —algo que hay
 * que encontrar— cuando es lo primero que el operario necesita ver.
 *
 * **El índice se reparte por frecuencia de uso, no por completitud del modelo:** operaciones
 * arriba, lo que se consulta en medio, y la configuración abajo. El reparto vive en
 * `destinos.ts` como función pura, y por eso tiene prueba — dentro del JSX estaba roto y nadie
 * podía verlo.
 *
 * **Componente de servidor, sin JavaScript de cliente y sin librería de gráficas.** La curva de
 * §4.5 del diseño y las otras dos piezas visuales son un plan aparte.
 *
 * **Cada enlace sólo aparece si quien mira puede usarlo** (`permissionKeysAnywhere`), y la
 * autorización de verdad sigue en cada destino. Los lotes del tablero los acota
 * `datosDelTablero` con la visibilidad real, y si no alcanza ninguno dice **por qué** en vez de
 * pintar un tablero vacío.
 */
export default async function BeneficioPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const granted = await permissionKeysAnywhere(user.userAccountId);
  // La misma regla que la entrada del menú: quien no ve lotes no tiene sección.
  if (!granted.has("lot:view") && !granted.has("lot:manage")) notFound();

  const t = await getTranslations("SeccionBeneficio");
  const destinos = destinosDelBeneficio(granted);
  const { operaciones, consultar, herramientas } = repartirDestinos(destinos);

  const [tEq, { ok, error }, beneficios, datos] = await Promise.all([
    getTranslations("Equipos"),
    searchParams,
    listarBeneficios(user.userAccountId),
    datosDelTablero(user.userAccountId),
  ]);

  const cola = colaDeAtencion({
    lotes: datos.lotes,
    desviacionesAbiertasPorLote: datos.desviacionesAbiertasPorLote,
    ahora: datos.medidoEn,
  });
  const ocupacion = ocupacionDelSitio({
    tanques: datos.tanques,
    camas: datos.camas,
    corridas: datos.corridas,
  });
  const instrumentos = instrumentosQuePidenAtencion(datos.instrumentos);

  // Los cinco grupos en su orden de gravedad, y sólo los que tienen filas: una sección vacía
  // llamada «Crítico» se lee como un problema que no existe.
  const GRUPOS: readonly { grupo: GrupoDeAtencion; clave: string; ayuda?: string }[] = [
    { grupo: "critico", clave: "grupoCritico" },
    { grupo: "listo_para_decidir", clave: "grupoListo", ayuda: "grupoListoAyuda" },
    { grupo: "aviso", clave: "grupoAviso" },
    { grupo: "sin_veredicto", clave: "grupoSinVeredicto", ayuda: "grupoSinVeredictoAyuda" },
    { grupo: "en_curso", clave: "grupoEnCurso" },
  ];

  /**
   * El ritmo, en palabras. **`demora: null` nunca se pinta como «en hora»**: son dos hechos
   * distintos y `puntajeDeUrgencia` los puntúa igual a propósito, así que la diferencia la tiene
   * que hacer esta pantalla o se pierde.
   */
  function textoDeRitmo(fila: FilaDeAtencion): string[] {
    if ("error" in fila.ritmo) return [t("ritmoInvalido", { codigo: fila.ritmo.error })];
    const partes = fila.ritmo.debidas.map((d) =>
      t("ritmoDebe", { variable: d.variable, cada: d.cada, horas: Math.round(d.horasSinMedir) }),
    );
    if (fila.ritmo.demora === true) {
      partes.push(t("ritmoTarde", { horas: Math.round(fila.ritmo.horasDeMas ?? 0) }));
    } else if (fila.ritmo.demora === false) {
      partes.push(t("ritmoEnHora"));
    } else {
      partes.push(t("ritmoSinDeclarar"));
    }
    return partes;
  }

  return (
    <div className="nn-mill-page">
      <header className="nn-mill-header">
        <div><h1>{t("titulo")}</h1><p>{t("intro")}</p></div>
      </header>
      <NavegacionBeneficio userAccountId={user.userAccountId} actual="/beneficio" />

      <section className="nn-mill-board" aria-labelledby="tablero-beneficio">
        <h2 id="tablero-beneficio">{t("tablero")}</h2>
        <p className="nn-muted">{t("tableroAyuda")}</p>
        {datos.sinAmbito ? (
          // **No es «no hay lotes».** Decirlo así le diría a una cuenta nueva que el beneficio
          // no tiene café fermentando.
          <p className="nn-empty">{t("sinAmbito")}</p>
        ) : cola.length === 0 ? (
          <p className="nn-empty">{t("nadaPideAtencion")}</p>
        ) : (
          GRUPOS.map(({ grupo, clave, ayuda }) => {
            const filas = cola.filter((f) => f.grupo === grupo);
            if (filas.length === 0) return null;
            return (
              <div key={grupo} className={`nn-board-group nn-board-${grupo}`}>
                <h3>{t(clave)} <small>({filas.length})</small></h3>
                {ayuda ? <p className="nn-muted">{t(ayuda)}</p> : null}
                <ul>
                  {filas.map((f) => (
                    <li key={f.lotId}>
                      <Link href={`/lots/${f.lotId}`}><strong>{f.lotCode}</strong></Link>
                      {/* TODOS los motivos, no el que ganó el grupo: un lote crítico Y listo
                          para decidir tiene dos hechos, y esconder uno es esconder trabajo. */}
                      {/* Tarea 9, ronda de arreglo 1: un linaje demasiado hondo se dice con su frase —hay que revisarlo a mano—,
                          no con el código. */}
                      <span className="nn-board-motivos">
                        {f.motivos.map((m) => (m === LINAJE_DEMASIADO_HONDO ? t("motivoLinajeDemasiadoHondo") : m)).join(" · ")}
                      </span>
                      <span className="nn-board-ritmo">{textoDeRitmo(f).join(" · ")}</span>
                      {f.ultimaLectura === null ? (
                        <span className="nn-board-sinlectura">{t("sinLectura")}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <section className="nn-mill-capacity" aria-labelledby="capacidad-beneficio">
        <h2 id="capacidad-beneficio">{t("capacidad")}</h2>
        <p>
          {t("capacidadTanques", {
            libres: ocupacion.tanques.libresYSanos,
            total: ocupacion.tanques.total,
            intervencion: ocupacion.tanques.requierenIntervencion,
          })}
        </p>
        <p>{t("capacidadCamas", { libres: ocupacion.camas.libresYSanos, total: ocupacion.camas.total })}</p>
        {/* Los tres avisos sólo salen si hay algo que decir, y dicen POR QUÉ importan. */}
        {ocupacion.sinUnidadDeclarada > 0 ? (
          <p className="nn-warn">{t("sinUnidadDeclarada", { n: ocupacion.sinUnidadDeclarada })}</p>
        ) : null}
        {ocupacion.conflictos.length > 0 ? (
          <p className="nn-warn">{t("conflictoDeDatos", { n: ocupacion.conflictos.length })}</p>
        ) : null}
        {ocupacion.ajenas > 0 ? <p className="nn-muted">{t("ocupacionAjena", { n: ocupacion.ajenas })}</p> : null}
      </section>

      <section className="nn-mill-instruments" aria-labelledby="instrumentos-beneficio">
        <h2 id="instrumentos-beneficio">{t("instrumentosTitulo")}</h2>
        {instrumentos.length === 0 ? (
          <p className="nn-empty">{t("instrumentosNinguno")}</p>
        ) : (
          <ul>
            {instrumentos.map((i) => (
              <li key={i.id}>
                <Link href={`/equipos/${i.id}`}>{i.name}</Link> <span>{tEq(i.verificacion)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nn-mill-primary" aria-labelledby="operaciones-beneficio">
        <h2 id="operaciones-beneficio">{t("operaciones")}</h2>
        <div>
          {operaciones.map((d) => (
            <Link key={d.href} href={d.href} className="nn-mill-action">
              <strong>{t(d.clave)}</strong>
              <span>{t(`${d.clave}Ayuda`)}</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="nn-mill-lookup" aria-labelledby="consultar-beneficio">
        <h2 id="consultar-beneficio">{t("consultar")}</h2>
        <div>
          {consultar.map((d) => (
            <Link key={d.href} href={d.href}>
              <strong>{t(d.clave)}</strong>
              <span>{t(`${d.clave}Ayuda`)}</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="nn-mill-tools" aria-labelledby="herramientas-beneficio">
        <h2 id="herramientas-beneficio">{t("herramientas")}</h2>
        <div>
          {herramientas.map((d) => (
            <Link key={d.href} href={d.href}>
              <strong>{t(d.clave)}</strong>
              <span>{t(`${d.clave}Ayuda`)}</span>
            </Link>
          ))}
        </div>
      </section>

      <AvisoDeRutina ok={ok} error={error} t={tEq} />
      {beneficios.length > 0 && <section className="nn-mill-routines" aria-labelledby="rutinas-beneficio">
        <h2 id="rutinas-beneficio">{t("rutinas")}</h2>
        {beneficios.map((b) => (
          <details key={b.id} className="nn-disclosure nn-disclosure-compact">
            <summary><span>{b.name}</span><small>{t("rutinasAyuda")}</small></summary>
            <div className="nn-disclosure-body"><RutinasDeLugar userAccountId={user.userAccountId} locationId={b.id} /></div>
          </details>
        ))}
      </section>}
    </div>
  );
}
