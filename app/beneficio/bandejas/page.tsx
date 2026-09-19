import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { vistaDeBandejas } from "../../../lib/beneficio/vistaDeBandejas";
import { mostrarFecha } from "../../../lib/time/mostrarInstante";
import { formatearNumero, medidaEnUnidad } from "./utilidades";
import { FormularioNuevoTipo, FormularioPesaje, FormularioRegistrarBandejas } from "./Formularios";

export const dynamic = "force-dynamic";

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
  // A6 (revisión final del plan 2a): los números se formatean con el
  // separador decimal del idioma de la PETICIÓN, no el del proceso del
  // servidor — `Intl.NumberFormat(undefined, …)` daría el mismo resultado
  // sin importar qué idioma esté leyendo la persona.
  const locale = await getLocale();
  const num = (n: number, decimales: number) => formatearNumero(n, decimales, locale);

  const secciones = await vistaDeBandejas(user.userAccountId);

  return (
    <div>
      <p>
        <Link href="/beneficio">← {t("volver")}</Link>
      </p>
      <h1>{t("titulo")}</h1>
      <p className="nn-muted">{t("intro")}</p>
      {!secciones.length && <p>{t("sinOrganizaciones")}</p>}
      {secciones.map(({ org, tipos, bandejas, puedeEditar, sitiosDisponibles, lotesGestionables, lotesRecortados }) => (
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
                  {/* A6: tres decimales (0,744 / 0,372), no uno — con el área
                      guardada de la 4×2 esto es lo que la distingue de la 2×2. */}
                  {t("area", { area: num(tipo.areaM2, 3) })}
                </p>
                <ul>
                  {tipo.estados.map((linea) => (
                    <li key={linea.estado}>
                      {t(`estado_${linea.estado}`)}
                      {": "}
                      {linea.fuente === "medido" && linea.capacidadKg != null && (
                        <>
                          {t("capacidadMedida", { kg: num(linea.capacidadKg, 1), n: linea.pesajes, profundidad: num(linea.profundidadCm!, 1) })}
                          {linea.detalle && linea.detalle.visibles.length > 0 && (
                            <details>
                              <summary>{t("verPesajes")}</summary>
                              <ul>
                                {linea.detalle.visibles.map((p) => (
                                  <li key={p.id}>
                                    {t("pesajeLinea", {
                                      fecha: mostrarFecha(p.occurredAt, null),
                                      lote: p.lote,
                                      kg: num(p.netKg, 1),
                                      profundidades: p.profundidadesCm.map((v) => num(v, 1)).join(", "),
                                      densidad: num(p.densidadKgM3, 0),
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
                        <>
                          {t("capacidadEstimada", {
                            kg: num(linea.capacidadKg, 1),
                            densidad: num(linea.densidadKgM3!, 0),
                            profundidad: num(linea.profundidadCm!, 1),
                            fuente: linea.fuenteDelEstimado ?? "",
                          })}
                        </>
                      )}
                      {linea.fuente === "sin_medir" && <>{t("capacidadSinMedir")}</>}
                      {/* A2 (RULING): con todo pesaje oculto no hay número —ni
                          medido ni estimado— pero SÍ el aviso de por qué,
                          fuera de cualquier condición de "hay visibles". */}
                      {linea.fuente === "sin_acceso" && <>{t("capacidadSinAcceso", { n: linea.ocultos })}</>}
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
              {/* A1: el corte silencioso de `take: 100` se dice, no se calla. */}
              {lotesRecortados && <p className="nn-muted">{t("lotesRecortados")}</p>}
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
                    {/* A3: `donde` es null por dos razones distintas — nunca se trasladó,
                        o el lugar no lo autoriza `manage_attributes` a esta cuenta — y no
                        se dicen igual: la segunda no es "sin traslado". */}
                    <td>{b.donde ?? (b.dondeOculto ? t("dondeOculto") : t("sinTraslado"))}</td>
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
