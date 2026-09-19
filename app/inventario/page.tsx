import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "../../lib/auth/session";
import { listarInventario } from "../../lib/inventario/lista";

export const dynamic = "force-dynamic";

/**
 * El inventario de materiales: qué hay, en qué lotes, y cuánto queda.
 *
 * **El saldo se deriva, no se guarda** — sale del libro mayor cada vez que se
 * pinta esta página. Y hay dos estados que se dicen con PALABRAS y no se
 * confunden:
 *
 * - **«nunca contado»** — llegó y nadie lo pesó. No es cero: nadie ha mirado.
 * - **«hay que cuadrarlo»** — se gastó más de lo que el sistema creía. No es un
 *   error del operario: el sistema sabe lo que le contaron, no lo que hay.
 *
 * Con palabras y no con color por lo mismo que la pantalla de equipos: en el
 * patio se mira a pleno sol y con las manos sucias, y un matiz no sobrevive.
 *
 * Cada lote se filtra por el ámbito de quien mira; lo que no puede ver no
 * aparece.
 */
export default async function InventarioPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [t, materiales] = await Promise.all([
    getTranslations("Inventario"),
    listarInventario(user.userAccountId),
  ]);

  const { ok } = await searchParams;
  const porCuadrar = materiales.flatMap((m) => m.lotes).filter((l) => l.requiereReconciliacion).length;
  const sinContar = materiales.flatMap((m) => m.lotes).filter((l) => !l.recorded).length;

  return (
    <main className="nn-page">
      <h1>{t("title")}</h1>
      <p className="nn-muted">{t("intro")}</p>
      {ok === "recibido" ? <p className="nn-alerta">{t("recibidoOk")}</p> : null}
      <p style={{ display: "flex", gap: "0.75rem" }}>
        <Link href="/inventario/recibir">{t("recibirEnlace")}</Link>
        {/* Ronda de arreglos 2 (Tarea 8): el formulario de recepción ya
            distingue medicamento/fitosanitario (`?clase=`, Tarea 4); este
            índice sólo enlazaba al primero. */}
        <Link href="/inventario/recibir?clase=fitosanitario">{t("recibirEnlaceFitosanitario")}</Link>
      </p>

      {/* Lo que hay que atender, arriba y con número. Si no hay nada, se DICE —
          una sección vacía que desaparece no distingue «todo en orden» de «no
          cargó». */}
      {porCuadrar > 0 || sinContar > 0 ? (
        <section className="nn-section">
          {porCuadrar > 0 ? <p className="nn-alerta nn-alerta-aviso">{t("porCuadrar", { n: porCuadrar })}</p> : null}
          {sinContar > 0 ? <p className="nn-alerta">{t("sinContar", { n: sinContar })}</p> : null}
        </section>
      ) : materiales.length > 0 ? (
        <p className="nn-muted">{t("todoEnOrden")}</p>
      ) : null}

      {materiales.length === 0 ? (
        <p className="nn-muted">{t("vacio")}</p>
      ) : (
        materiales.map((m) => (
          <section key={m.id} className="nn-section">
            <h2>{m.name}</h2>
            <table className="nn-tabla">
              <thead>
                <tr>
                  <th>{t("colLote")}</th>
                  <th>{t("colRecibido")}</th>
                  <th>{t("colQueda")}</th>
                  <th>{t("colEstado")}</th>
                  <th>{t("colVence")}</th>
                  <th>{t("colCustodia")}</th>
                </tr>
              </thead>
              <tbody>
                {m.lotes.map((l) => (
                  <tr key={l.id}>
                    <td>{l.batchLabel}</td>
                    <td>{l.receivedAt.toISOString().slice(0, 10)}</td>
                    {/* «Nunca contado» NO pinta un cero. Un cero aquí sería la
                        afirmación contraria a la que el sistema puede hacer. */}
                    <td>{l.recorded ? `${l.quantity} ${l.unit ?? ""}` : "—"}</td>
                    <td>
                      {l.requiereReconciliacion
                        ? t("estadoPorCuadrar")
                        : !l.recorded
                          ? t("estadoSinContar")
                          : t("estadoContado")}
                    </td>
                    {/* Con palabras. «Sin fecha» no es «vigente»: lo desconocido no se vuelve bueno. */}
                    <td>
                      {l.vencimiento.estado === "SIN_FECHA"
                        ? t("venceSinFecha")
                        : l.vencimiento.estado === "VIGENTE"
                          ? t("venceVigente")
                          : l.vencimiento.estado === "VENCIDO"
                            ? t("avisoVencido", { dias: l.vencimiento.dias })
                            : t("avisoPorVencer", { dias: l.vencimiento.dias })}
                    </td>
                    <td>
                      {l.custodia
                        ? l.custodia.responsable
                          ? t("custodiaConResponsable", { sitio: l.custodia.sitio, responsable: l.custodia.responsable })
                          : l.custodia.sitio
                        : t("custodiaDondeSeRecibio")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </main>
  );
}
