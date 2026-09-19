import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { vistaDeBandejas } from "../../../lib/beneficio/vistaDeBandejas";
import { mostrarFecha } from "../../../lib/time/mostrarInstante";
import { medidaEnUnidad } from "./utilidades";
import { FormularioNuevoTipo, FormularioPesaje, FormularioRegistrarBandejas } from "./Formularios";

export const dynamic = "force-dynamic";

/** Un decimal, para kg/m²/cm; sin decimales, para densidad. */
const unDecimal = (n: number) => (Math.round(n * 10) / 10).toString();
const sinDecimales = (n: number) => Math.round(n).toString();

/**
 * Las bandejas y su capacidad, agrupadas por organización, más los tres
 * formularios de la Tarea 5 (spec 2a). El modelo de vista lo arma
 * `vistaDeBandejas` (`lib/beneficio/vistaDeBandejas.ts`) — esta página sólo
 * pinta, y convierte cm a la unidad tecleada con `medidaEnUnidad`.
 */
export default async function BandejasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Bandejas");

  const secciones = await vistaDeBandejas(user.userAccountId);

  return (
    <div>
      <p>
        <Link href="/beneficio">← {t("volver")}</Link>
      </p>
      <h1>{t("titulo")}</h1>
      <p className="nn-muted">{t("intro")}</p>
      {!secciones.length && <p>{t("sinOrganizaciones")}</p>}
      {secciones.map(({ org, tipos, bandejas, puedeEditar, sitiosDisponibles, lotesGestionables }) => (
        <section key={org.id}>
          <h2>{org.name}</h2>

          <h3>{t("tiposTitulo")}</h3>
          {!tipos.length && <p>{t("sinTipos")}</p>}
          {tipos.map((tipo) => {
            const medida = medidaEnUnidad(tipo.widthCm, tipo.lengthCm, tipo.entryUnit as "ft" | "cm");
            return (
              <div key={tipo.id}>
                <h4>{tipo.nombre}</h4>
                <p className="nn-muted">
                  {t("medida", { ancho: medida.ancho, largo: medida.largo, unidad: t(`unidadCorta_${medida.unidad}`) })}
                  {" · "}
                  {t("area", { area: unDecimal(tipo.areaM2) })}
                </p>
                <ul>
                  {tipo.estados.map((linea) => (
                    <li key={linea.estado}>
                      {t(`estado_${linea.estado}`)}
                      {": "}
                      {linea.fuente === "medido" && linea.capacidadKg != null && (
                        <>
                          {t("capacidadMedida", { kg: unDecimal(linea.capacidadKg), n: linea.pesajes })}
                          {linea.detalle && linea.detalle.visibles.length > 0 && (
                            <details>
                              <summary>{t("verPesajes")}</summary>
                              <ul>
                                {linea.detalle.visibles.map((p) => (
                                  <li key={p.id}>
                                    {t("pesajeLinea", {
                                      fecha: mostrarFecha(p.occurredAt, null),
                                      lote: p.lote,
                                      kg: unDecimal(p.netKg),
                                      profundidades: p.profundidadesCm.map((v) => unDecimal(v)).join(", "),
                                      densidad: sinDecimales(p.densidadKgM3),
                                    })}
                                  </li>
                                ))}
                              </ul>
                              {linea.detalle.ocultos > 0 && <p className="nn-muted">{t("pesajesOcultos", { n: linea.detalle.ocultos })}</p>}
                            </details>
                          )}
                        </>
                      )}
                      {linea.fuente === "estimado" && linea.capacidadKg != null && (
                        <>{t("capacidadEstimada", { kg: unDecimal(linea.capacidadKg), fuente: linea.fuenteDelEstimado ?? "" })}</>
                      )}
                      {linea.fuente === "sin_medir" && <>{t("capacidadSinMedir")}</>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {puedeEditar && (
            <>
              <h3>{t("nuevoTipoTitulo")}</h3>
              <FormularioNuevoTipo organizationId={org.id} />
            </>
          )}

          {sitiosDisponibles.length > 0 && tipos.length > 0 && (
            <>
              <h3>{t("registrarBandejasTitulo")}</h3>
              <FormularioRegistrarBandejas sitios={sitiosDisponibles} tipos={tipos.map((tp) => ({ id: tp.id, nombre: tp.nombre }))} />
            </>
          )}

          {lotesGestionables.length > 0 && tipos.length > 0 && (
            <>
              <h3>{t("registrarPesajeTitulo")}</h3>
              <FormularioPesaje tipos={tipos.map((tp) => ({ id: tp.id, nombre: tp.nombre }))} lotes={lotesGestionables} />
            </>
          )}

          <h3>{t("bandejasTablaTitulo")}</h3>
          {!bandejas.length && <p>{t("sinBandejas")}</p>}
          {bandejas.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>{t("columnaNumero")}</th>
                  <th>{t("columnaTipo")}</th>
                  <th>{t("columnaDonde")}</th>
                </tr>
              </thead>
              <tbody>
                {bandejas.map((b) => (
                  <tr key={b.id}>
                    <td>{b.numero}</td>
                    <td>{b.tipo}</td>
                    <td>{b.donde ?? t("sinTraslado")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}
