import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { detalleInstalacion } from "../../../lib/traceability/instalaciones";
import { LocationAccessError, puedeEditarBeneficioEn } from "../../../lib/traceability/locations";
import { SecadoFormError } from "../../../lib/traceability/secadoForm";
import { FormularioUbicacion } from "../FormularioUbicacion";
import { FormularioEstante } from "../FormularioEstante";

export const dynamic = "force-dynamic";
export default async function InstalacionPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; posicion?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Secado");
  const { id } = await params;
  const { ok, posicion } = await searchParams;
  let instalacion;
  try { instalacion = await detalleInstalacion(user.userAccountId, id); }
  catch (error) {
    if (error instanceof SecadoFormError) notFound();
    if (!(error instanceof LocationAccessError)) throw error;
    return <div><h1>{t("instalaciones")}</h1><p role="alert">{t("error_sin_acceso")}</p><Link href="/instalaciones">{t("volver")}</Link></div>;
  }
  const puedeEditar = await puedeEditarBeneficioEn(user.userAccountId, id);
  // Hallazgo 5 (revisión independiente de Codex, 2026-09-18): el permiso de
  // la INSTALACIÓN no es el de cada CAMA — `actualizarUbicacionDeSecado`
  // comprueba `edit_beneficio` sobre el id de la cama, no el de su padre, así
  // que reutilizar `puedeEditar` aquí ofrecía un formulario que el servidor
  // iba a rechazar (o, peor, aceptar sobre una cama que sí concede otra
  // cosa). Cada cama pregunta por SU PROPIO permiso.
  const permisosDeCamas = await Promise.all(
    instalacion.camas.map((c) => puedeEditarBeneficioEn(user.userAccountId, c.id)),
  );
  // Igual que con las camas: el permiso de ampliar/editar es POR ESTANTE y por
  // POSICIÓN, nunca heredado del permiso de la instalación (revisión de Codex).
  const permisosDeEstantes = await Promise.all(
    instalacion.estantes.map((e) => puedeEditarBeneficioEn(user.userAccountId, e.id)),
  );
  const posicionSeleccionada = posicion
    ? instalacion.estantes.flatMap((e) => e.posiciones.map((p) => ({ ...p, estanteId: e.id }))).find((p) => p.id === posicion)
    : undefined;
  const puedeEditarPosicion = posicionSeleccionada ? await puedeEditarBeneficioEn(user.userAccountId, posicionSeleccionada.id) : false;
  return <div>
    <p><Link href="/instalaciones">← {t("volver")}</Link></p>
    <p>{instalacion.sitio?.name ?? t("sitioNoVisible")} → {instalacion.name}</p>
    <h1>{instalacion.name}</h1>
    {ok === "guardado" && <p role="status">{t("guardado")}</p>}
    {!puedeEditar && <p role="alert">{t("sinPermisoEditar")}</p>}
    {puedeEditar && <FormularioUbicacion key={JSON.stringify(instalacion)} tipo="drying_facility" existente={instalacion} />}
    <h2>{t("camas")}</h2>
    {!instalacion.camas.length && <p>{t("sinCamas")}</p>}
    {instalacion.camas.map((c, i) => <section key={JSON.stringify(c)}>
      <h3>{c.name}</h3>
      {permisosDeCamas[i] && <FormularioUbicacion tipo="drying_bed" existente={c} />}
    </section>)}
    {puedeEditar && <><h2>{t("crearCama")}</h2><FormularioUbicacion tipo="drying_bed" parentLocationId={id} /></>}
    <h2>{t("estantes")}</h2>
    {instalacion.estantes.map((estante, i) => {
      // La rejilla es de sólo lectura en este plan (2b pinta qué bandeja hay
      // en cada posición): una fila por nivel, del más alto al más bajo.
      const filas = Array.from({ length: estante.niveles }, (_, idx) => estante.niveles - idx);
      const puestos = Array.from({ length: estante.puestos }, (_, idx) => idx + 1);
      return <section key={estante.id}>
        <h3>{estante.name}</h3>
        <table>
          <tbody>
            {filas.map((nivel) => <tr key={nivel}>
              <th scope="row">{t("nivel", { n: nivel })}</th>
              {puestos.map((puesto) => {
                const pos = estante.posiciones.find((p) => p.nivel === nivel && p.puesto === puesto);
                return <td key={puesto}>
                  {pos && <Link href={`/instalaciones/${id}?posicion=${pos.id}`}>
                    {`P${puesto}`}{pos.shadePercentage ? " *" : ""}
                  </Link>}
                </td>;
              })}
            </tr>)}
          </tbody>
        </table>
        {posicionSeleccionada?.estanteId === estante.id && puedeEditarPosicion &&
          <FormularioUbicacion key={JSON.stringify(posicionSeleccionada)} tipo="drying_bed" existente={{
            id: posicionSeleccionada.id, name: posicionSeleccionada.name, rackLevel: posicionSeleccionada.nivel,
            shadePercentage: posicionSeleccionada.shadePercentage, shadeDescription: posicionSeleccionada.shadeDescription,
          }} />}
        {permisosDeEstantes[i] && <FormularioEstante existente={{ id: estante.id, niveles: estante.niveles, puestos: estante.puestos }} />}
      </section>;
    })}
    {puedeEditar && <><h2>{t("crearEstante")}</h2><FormularioEstante facilityId={id} /></>}
    <p><Link href="/inspecciones/nueva">{t("inspeccionTitulo")}</Link></p>
  </div>;
}
