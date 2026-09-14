import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "../../lib/auth/session";
import { listarEquipos } from "../../lib/equipos/equipos";

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
export default async function EquiposPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, equipos] = await Promise.all([getTranslations("Equipos"), listarEquipos(user.userAccountId)]);

  const instrumentos = equipos.filter((e) => e.kind === "instrument");
  const resto = equipos.filter((e) => e.kind !== "instrument");
  // Lo que pide atención primero: un instrumento sin revisar o que falló su
  // contraste, y cualquier equipo averiado.
  const atencion = equipos.filter(
    (e) =>
      e.verificacion === "REVISION_VENCIDA" ||
      e.verificacion === "VERIFICACION_FALLIDA" ||
      e.verificacion === "SIN_VERIFICACION" ||
      (e.condicion !== null && e.condicion.condition !== "operational"),
  );

  return (
    <div>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{t("title")}</h1>
      <p className="nn-muted">{t("intro")}</p>

      {equipos.length === 0 ? (
        <p className="nn-muted" style={{ marginTop: "1.5rem" }}>
          {t("vacio")}
        </p>
      ) : null}

      {atencion.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>{t("atencionTitulo", { n: atencion.length })}</h2>
          <p className="nn-muted">{t("atencionIntro")}</p>
          <ul>
            {atencion.map((e) => (
              <li key={e.id}>
                <Link href={`/equipos/${e.id}`}>{e.name}</Link>
                {" — "}
                {e.verificacion !== "SIN_INSTRUMENTO" ? t(`verificacion_${e.verificacion}`) : null}
                {e.condicion && e.condicion.condition !== "operational"
                  ? ` · ${t(`condicion_${e.condicion.condition}`)}`
                  : null}
              </li>
            ))}
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
