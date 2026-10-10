import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "../../lib/auth/session";
import { disponibilidadDeRecipientes, listarEquipos, sitiosParaRegistrar } from "../../lib/equipos/equipos";
import { vencidasPorEquipo } from "../../lib/rutinas/rutinas";
import { diaDeHoy } from "../../lib/time/diaDeHoy";

export const dynamic = "force-dynamic";

/**
 * El inventario de equipos e instrumentos, con su estado de hoy.
 *
 * **Las tres columnas se derivan, ninguna se guarda** (§4 del documento de
 * diseño): la ubicación sale del último traslado, la condición del último informe
 * sin resolver, y la verificación de los contrastes contra patrón.
 *
 * **Y la severidad se dice con palabras, no con color.** Es el mismo criterio
 * que ya gobierna `VeredictoDeBeneficio`: en el patio se mira una pantalla a
 * pleno sol y con las manos sucias, y un matiz de color no sobrevive a eso.
 */
export default async function EquiposPage({
  searchParams,
}: {
  searchParams: Promise<{ vencidas?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, equiposTodos, disponibilidad, sp, sitiosDondeRegistrar] = await Promise.all([
    getTranslations("Equipos"),
    listarEquipos(user.userAccountId),
    disponibilidadDeRecipientes(user.userAccountId),
    searchParams,
    sitiosParaRegistrar(user.userAccountId),
  ]);
  const puedeRegistrarEquipo = sitiosDondeRegistrar.length > 0;

  // `diaDeHoy(..., null)` usa la zona más atrasada del planeta (UTC−12): un
  // aviso de rutina vencida puede llegar como mucho un día tarde, nunca antes
  // de tiempo — la misma regla que ya gobierna el resto de avisos derivados.
  const vencidasPorId = await vencidasPorEquipo(
    user.userAccountId,
    equiposTodos.map((e) => e.id),
    diaDeHoy(new Date(), null),
  );

  const soloVencidas = sp.vencidas === "1";
  const equipos = soloVencidas ? equiposTodos.filter((e) => (vencidasPorId.get(e.id) ?? 0) > 0) : equiposTodos;

  const instrumentos = equipos.filter((e) => e.kind === "instrument");
  const resto = equipos.filter((e) => e.kind !== "instrument");
  // Lo que pide atención primero: un instrumento sin revisar o que falló su
  // contraste, cualquier equipo averiado, y ahora también cualquiera con una
  // rutina de cuidado vencida.
  const atencion = equipos.filter(
    (e) =>
      e.verificacion === "REVISION_VENCIDA" ||
      e.verificacion === "VERIFICACION_FALLIDA" ||
      e.verificacion === "SIN_VERIFICACION" ||
      (e.condicion !== null && e.condicion.condition !== "operational") ||
      (vencidasPorId.get(e.id) ?? 0) > 0,
  );

  const filaModeloYVencidas = (e: (typeof equipos)[number]) => {
    const n = vencidasPorId.get(e.id) ?? 0;
    return (
      <>
        {e.model ? (
          <div className="nn-muted">
            {e.model.manufacturer} {e.model.modelName}
          </div>
        ) : null}
        {n > 0 ? <div>{t("rutinasVencidas", { n })}</div> : null}
      </>
    );
  };

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("title")}</h1>
      <p className="nn-muted">{t("intro")}</p>

      <p style={{ marginTop: "1rem" }}>
        {/* Daniel, 2026-09-27: lo que no puedes hacer no se muestra, y no se explica. Se
            pregunta con el MISMO predicado que usa `/equipos/nuevo` para decidir si pinta su
            formulario, así que el enlace no puede prometer lo que el destino niega. */}
        {puedeRegistrarEquipo ? (
          <>
            <Link href="/equipos/nuevo" className="nn-button">
              {t("botonNuevo")}
            </Link>{" "}
          </>
        ) : null}
        <Link href="/equipos/modelos">{t("verCatalogo")}</Link>
        {" · "}
        {soloVencidas ? <Link href="/equipos">{t("filtroTodos")}</Link> : <Link href="/equipos?vencidas=1">{t("soloVencidas")}</Link>}
      </p>

      {equipos.length === 0 ? (
        <p className="nn-muted" style={{ marginTop: "1.5rem" }}>
          {t("vacio")}
        </p>
      ) : null}

      {disponibilidad.resumen.total > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("capacidadTitulo")}</h2>
          <p className="nn-muted">{t("capacidadIntro")}</p>
          <p>
            <strong>{t("capacidadLibres", { n: disponibilidad.resumen.libresYSanos, de: disponibilidad.resumen.total })}</strong>
            {disponibilidad.resumen.enUso > 0 ? ` · ${t("capacidadEnUso", { n: disponibilidad.resumen.enUso })}` : null}
            {disponibilidad.resumen.requierenIntervencion > 0
              ? ` · ${t("capacidadIntervencion", { n: disponibilidad.resumen.requierenIntervencion })}`
              : null}
          </p>
          {/* Las columnas SE SOLAPAN a propósito: un tanque ocupado Y averiado
              está en las dos, porque son dos hechos que piden dos acciones. */}
          <p className="nn-muted">{t("capacidadSolape")}</p>
          <ul>
            {disponibilidad.filas
              .filter((f) => !f.clasificacion.libreYSano)
              .map((f) => (
                <li key={f.id}>
                  <Link href={`/equipos/${f.id}`}>{f.name}</Link>
                  {" — "}
                  {f.clasificacion.motivos
                    .map((m) =>
                      m === "CONDICION" && f.condicion ? t(`condicion_${f.condicion}`) : t(`motivo_${m}`),
                    )
                    .join(" · ")}
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {atencion.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("atencionTitulo", { n: atencion.length })}</h2>
          <p className="nn-muted">{t("atencionIntro")}</p>
          <ul>
            {atencion.map((e) => {
              const n = vencidasPorId.get(e.id) ?? 0;
              return (
                <li key={e.id}>
                  <Link href={`/equipos/${e.id}`}>{e.name}</Link>
                  {" — "}
                  {e.verificacion !== "SIN_INSTRUMENTO" ? t(`verificacion_${e.verificacion}`) : null}
                  {e.condicion && e.condicion.condition !== "operational"
                    ? ` · ${t(`condicion_${e.condicion.condition}`)}`
                    : null}
                  {n > 0 ? ` · ${t("rutinasVencidas", { n })}` : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {instrumentos.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("instrumentosTitulo")}</h2>
          <p className="nn-muted">{t("instrumentosIntro")}</p>
          <table className="nn-table">
            <thead>
              <tr>
                <th>{t("colNombre")}</th>
                <th>{t("colUbicacion")}</th>
                <th>{t("colRevision")}</th>
                <th>{t("colUltimaPrueba")}</th>
              </tr>
            </thead>
            <tbody>
              {instrumentos.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/equipos/${e.id}`}>{e.name}</Link>
                    {filaModeloYVencidas(e)}
                  </td>
                  <td>{e.ubicacion?.name ?? t("sinUbicar")}</td>
                  <td>{t(`verificacion_${e.verificacion}`)}</td>
                  <td>
                    {e.ultimaVerificacion
                      ? e.ultimaVerificacion.toISOString().slice(0, 16).replace("T", " ")
                      : t("nuncaVerificado")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {resto.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("equiposTitulo")}</h2>
          <table className="nn-table">
            <thead>
              <tr>
                <th>{t("colNombre")}</th>
                <th>{t("colTipo")}</th>
                <th>{t("colUbicacion")}</th>
                <th>{t("colCondicion")}</th>
              </tr>
            </thead>
            <tbody>
              {resto.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/equipos/${e.id}`}>{e.name}</Link>
                    {filaModeloYVencidas(e)}
                  </td>
                  <td>{t(`tipo_${e.kind}`)}</td>
                  <td>{e.ubicacion?.name ?? t("sinUbicar")}</td>
                  <td>{e.condicion ? t(`condicion_${e.condicion.condition}`) : t("sinInformes")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
