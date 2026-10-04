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
  ocupacionDelSitio,
  type FilaDeAtencion,
  type GrupoDeAtencion,
} from "../../lib/beneficio/tablero";
import { LIENZO_DE_CURVA, leerCurvaPedida } from "../../lib/beneficio/curvaEnPantalla";
import { AvisoDeRutina } from "../components/rutinas/AvisoDeRutina";
import { CurvaDeLote } from "../components/beneficio/CurvaDeLote";
import { LiberacionDeUnidad } from "../components/beneficio/LiberacionDeUnidad";
import { LineaDeEtapas } from "../components/beneficio/LineaDeEtapas";
import { MapaDeUnidades } from "../components/beneficio/MapaDeUnidades";
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
 * **Componente de servidor, sin JavaScript de cliente y sin librería de gráficas.** La curva es
 * un `<svg>` del servidor (`CurvaDeLote`), y elegir lote o variable es un enlace con parámetros de
 * búsqueda (`?lote=…&variable=…`), no una ruta nueva ni un estado de cliente.
 *
 * **Cómo se acomodan las tres piezas, que es decisión de Daniel (diseño §4.5, 2026-09-18) y no
 * una preferencia.** El orden del documento ES el orden del celular: la línea de etapas en dos
 * filas de tres; debajo «qué hacer ahora» (la cola); debajo «¿puedo recibir?» reducido a dos
 * números y a cuándo se libera la próxima unidad; y **la curva sólo al tocar un lote**. En
 * pantalla ancha (`min-width: 60rem`, ver `globals.css`) las tres van juntas, con el mapa de
 * tanques y camas completo.
 *
 * **El porqué:** a unos 375 px, seis etapas en fila dejan unos 55 px por etapa —se leen números,
 * no etiquetas—, y la curva comprimida pierde la banda que la hace útil. Por eso no se pintan las
 * tres juntas en el celular aunque «cupieran» apretadas.
 *
 * **Con `sinAmbito` la pantalla no pinta ni una línea de ceros ni «0 libres de 0»:** dice «no ves
 * ninguno todavía», que no es «no hay ninguno». Se mira ANTES que nada.
 *
 * **Cada enlace sólo aparece si quien mira puede usarlo** (`permissionKeysAnywhere`), y la
 * autorización de verdad sigue en cada destino. Los lotes del tablero los acota
 * `datosDelTablero` con la visibilidad real, y si no alcanza ninguno dice **por qué** en vez de
 * pintar un tablero vacío.
 */
export default async function BeneficioPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; lote?: string | string[]; variable?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const granted = await permissionKeysAnywhere(user.userAccountId);
  // La misma regla que la entrada del menú: quien no ve lotes no tiene sección.
  if (!granted.has("lot:view") && !granted.has("lot:manage")) notFound();

  const t = await getTranslations("SeccionBeneficio");
  const destinos = destinosDelBeneficio(granted);
  const { operaciones, consultar, herramientas } = repartirDestinos(destinos);

  const { ok, error, lote: loteCrudo, variable: variableCruda } = await searchParams;
  // La curva sólo se pide si la URL trae un lote válido: nadie la toca → no se consulta.
  const pedida = leerCurvaPedida({ lote: loteCrudo, variable: variableCruda });
  const [tEq, beneficios, datos] = await Promise.all([
    getTranslations("Equipos"),
    listarBeneficios(user.userAccountId),
    datosDelTablero(user.userAccountId, undefined, pedida ? { curva: { ...pedida, ...LIENZO_DE_CURVA } } : {}),
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
    // Sin filtrar por lote: de aquí sale `enUso`. Ver `OcupacionDeUnidad` y la ficha 015.
    corridasPorUnidad: datos.corridasPorUnidad,
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

      <div className="nn-tablero">
        {datos.sinAmbito ? (
          // **No es «no hay lotes», y no se pinta ninguna línea ni ningún «0 de 0».** Decirlo así le
          // diría a una cuenta nueva que el beneficio no tiene café fermentando ni tanques.
          <section className="nn-mill-board nn-tablero-cola" aria-labelledby="tablero-beneficio">
            <h2 id="tablero-beneficio">{t("tablero")}</h2>
            <p className="nn-empty">{t("sinAmbito")}</p>
          </section>
        ) : (
          <>
            <section className="nn-tablero-linea" aria-labelledby="linea-beneficio">
              <h2 id="linea-beneficio">{t("lineaTitulo")}</h2>
              <p className="nn-muted">{t("lineaAyuda")}</p>
              <LineaDeEtapas etapas={datos.etapas} />
            </section>

            <section className="nn-mill-board nn-tablero-cola" aria-labelledby="tablero-beneficio">
              <h2 id="tablero-beneficio">{t("tablero")}</h2>
              <p className="nn-muted">{t("tableroAyuda")}</p>
              {cola.length === 0 ? (
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
                          <li key={f.lotId} aria-current={pedida?.lotId === f.lotId ? "true" : undefined}>
                            {/* Tocar el lote abre su curva en esta misma pantalla; la ficha del lote
                                queda en el segundo enlace. */}
                            <Link href={`/beneficio?lote=${f.lotId}#curva-beneficio`}><strong>{f.lotCode}</strong></Link>
                            {/* TODOS los motivos, no el que ganó el grupo: un lote crítico Y listo
                                para decidir tiene dos hechos, y esconder uno es esconder trabajo. */}
                            <span className="nn-board-motivos">{f.motivos.join(" · ")}</span>
                            <span className="nn-board-ritmo">{textoDeRitmo(f).join(" · ")}</span>
                            {f.ultimaLectura === null ? (
                              <span className="nn-board-sinlectura">{t("sinLectura")}</span>
                            ) : null}
                            <Link className="nn-board-ficha" href={`/lots/${f.lotId}`}>{t("abrirLote")}</Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })
              )}
            </section>

            <section className="nn-mill-capacity nn-tablero-capacidad" aria-labelledby="capacidad-beneficio">
              <h2 id="capacidad-beneficio">{t("capacidad")}</h2>
              {/* En el celular, SÓLO esto: dos números y cuándo se libera la próxima unidad. */}
              {/* **«0 de 0» no es «no hay ninguno»**: con `total === 0` la lista de unidades que ve quien
                  mira vino vacía, y eso no dice cuántas existen. Se dice lo que de verdad pasa. */}
              <div className="nn-cap-numeros">
                {ocupacion.tanques.total === 0 ? (
                  <p className="nn-muted">{t("capacidadSinTanques")}</p>
                ) : (
                  <p>
                    <strong>{ocupacion.tanques.libresYSanos}</strong>
                    <span>{t("capacidadDeTotal", { total: ocupacion.tanques.total })}</span>
                    <small>{t("capacidadNumeroTanques")}</small>
                  </p>
                )}
                {ocupacion.camas.total === 0 ? (
                  <p className="nn-muted">{t("capacidadSinCamas")}</p>
                ) : (
                  <p>
                    <strong>{ocupacion.camas.libresYSanos}</strong>
                    <span>{t("capacidadDeTotal", { total: ocupacion.camas.total })}</span>
                    <small>{t("capacidadNumeroCamas")}</small>
                  </p>
                )}
              </div>
              <LiberacionDeUnidad liberacion={datos.liberacion} ahora={datos.medidoEn} />
              {/* Los avisos sólo salen si hay algo que decir, y dicen POR QUÉ importan. */}
              {ocupacion.sinUnidadDeclarada > 0 ? (
                <p className="nn-warn">{t("sinUnidadDeclarada", { n: ocupacion.sinUnidadDeclarada })}</p>
              ) : null}
              {ocupacion.conflictos.length > 0 ? (
                <p className="nn-warn">{t("conflictoDeDatos", { n: ocupacion.conflictos.length })}</p>
              ) : null}
              {ocupacion.ajenas > 0 ? <p className="nn-muted">{t("ocupacionAjena", { n: ocupacion.ajenas })}</p> : null}
              {/* Sólo en pantalla ancha: el mapa completo, y el detalle que los dos números no dicen. */}
              <div className="nn-cap-ancho">
                <p>
                  {ocupacion.tanques.total === 0
                    ? t("capacidadSinTanques")
                    : t("capacidadTanques", {
                        libres: ocupacion.tanques.libresYSanos,
                        total: ocupacion.tanques.total,
                        intervencion: ocupacion.tanques.requierenIntervencion,
                      })}
                </p>
                <p>
                  {ocupacion.camas.total === 0
                    ? t("capacidadSinCamas")
                    : t("capacidadCamas", { libres: ocupacion.camas.libresYSanos, total: ocupacion.camas.total })}
                </p>
                <MapaDeUnidades tanques={ocupacion.mapa.tanques} camas={ocupacion.mapa.camas} />
              </div>
            </section>

            <CurvaDeLote
              pedida={pedida}
              curva={datos.curva}
              codigoDelLote={datos.lotes.find((l) => l.lotId === pedida?.lotId)?.lotCode ?? null}
              perfilDelLote={datos.curva?.perfilDelLote ?? null}
            />
          </>
        )}
      </div>

      {/* **Con `sinAmbito` este bloque no se pinta**: `VACIO.instrumentos` es `[]` porque no se miró
          nada, y «Ningún instrumento pide atención» sobre un `[]` sin medir se lee como «todo bien».
          Es el mismo fallo que `etapas` ya guarda («Vacía cuando `sinAmbito`»), una sección más abajo. */}
      {datos.sinAmbito ? null : (
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
      )}

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
