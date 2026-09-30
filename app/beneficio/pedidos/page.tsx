import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { permissionKeysAnywhere } from "../../../lib/rbac/service";
import { COOKIE_BENEFICIO, beneficioDeLaPagina } from "../../../lib/traceability/beneficioElegido";
import { pedidosDeBeneficio } from "../../../lib/traceability/pedidosDeCereza";
import { veredictosDePedidos } from "../../../lib/traceability/veredictoDelLote";
import { proveedoresDeCereza } from "../../../lib/traceability/proveedoresDeCereza";
import { listarFincas } from "../../../lib/traceability/fincas";
import { BeneficioElegido } from "../../components/beneficio/BeneficioElegido";
import { NavegacionBeneficio } from "../../components/beneficio/NavegacionBeneficio";
import { CerrarPedidoForm, PedidoForm } from "../../components/beneficio/PedidoForm";

export const dynamic = "force-dynamic";

/**
 * Los pedidos de cereza del beneficio elegido (spec recepción §3.3 y §4): a quién, cuánto, con qué
 * margen, lo recibido contra lo pedido, y el veredicto de calidad de cada lote que salió de él.
 * Ver exige `lot:view` sobre el beneficio; pedir y cerrar, `lot:manage`, que exige el servicio.
 */
export default async function PedidosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const granted = await permissionKeysAnywhere(user.userAccountId);
  if (!granted.has("lot:view") && !granted.has("lot:manage")) notFound();
  const t = await getTranslations("Recepcion");

  const { beneficios, elegido } = await beneficioDeLaPagina(user.userAccountId, (await cookies()).get(COOKIE_BENEFICIO)?.value);
  if (!elegido) {
    return (
      <div className="nn-mill-page">
        <header className="nn-mill-header"><div><h1>{t("pedidosTitulo")}</h1><p>{t("pedidosIntro")}</p></div></header>
        <NavegacionBeneficio userAccountId={user.userAccountId} actual="/beneficio/pedidos" />
        {beneficios.length ? (
          <BeneficioElegido beneficios={beneficios} elegido={null} volver="/beneficio/pedidos" />
        ) : (
          <p className="nn-muted">{t("sinBeneficios")}</p>
        )}
      </div>
    );
  }

  const gestiona = granted.has("lot:manage");
  const [pedidos, proveedores, fincas] = await Promise.all([
    pedidosDeBeneficio(user.userAccountId, elegido.id),
    gestiona ? proveedoresDeCereza(user.userAccountId, elegido.id) : Promise.resolve([]),
    gestiona ? listarFincas(user.userAccountId) : Promise.resolve([]),
  ]);
  const kg = (x: number) => x.toFixed(1);
  const veredictos = await veredictosDePedidos(pedidos.map((p) => p.id));

  return (
    <div className="nn-mill-page">
      <header className="nn-mill-header"><div><h1>{t("pedidosTitulo")}</h1><p>{t("pedidosIntro")}</p></div></header>
      <NavegacionBeneficio userAccountId={user.userAccountId} actual="/beneficio/pedidos" />
      <BeneficioElegido beneficios={beneficios} elegido={elegido} volver="/beneficio/pedidos" />

      <section className="nn-mill-section">
        {pedidos.length === 0 ? (
          <p className="nn-muted">{t("sinPedidos")}</p>
        ) : (
          <ul className="nn-mill-records">
            {pedidos.map((p) => (
              <li key={p.id} className="nn-mill-record">
                <div className="nn-mill-record-heading"><strong>{p.fincaSite?.name ?? p.proveedor?.name ?? ""}</strong><span>{p.fecha.toISOString().slice(0, 10)}</span></div>
                <p>{t("pedidoCifras", { pedidos: kg(Number(p.kgPedidos)), recibidos: kg(p.recibidoKg), dif: kg(p.diferenciaKg), pct: (p.diferenciaPct * 100).toFixed(1) })}</p>
                <span className="nn-muted">
                  {t(p.estado === "abierto" ? "abierto" : "cerrado")}
                  {p.exceso ? ` · ${t("exceso")}` : ""}
                  {p.falta && p.estado === "cerrado" ? ` · ${t("falta")}` : ""}
                  {p.notaDeCierre ? ` · ${p.notaDeCierre}` : ""}
                </span>
                {(veredictos.get(p.id) ?? []).length > 0 ? (
                  <ul>
                    {(veredictos.get(p.id) ?? []).map((v) => (
                      <li key={v.lotId}>
                        <Link href={`/lots/${v.lotId}`} className="nn-code">{v.lotCode}</Link>
                        {" — "}
                        {t(`juicio_${v.juicio}`)}
                        {v.motivo ? <span className="nn-muted">{` — ${v.motivo}`}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {gestiona && p.estado === "abierto" ? <details className="nn-inline-disclosure"><summary>{t("cerrarPedido")}</summary><CerrarPedidoForm pedidoId={p.id} /></details> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {gestiona ? (
        <details className="nn-disclosure nn-mill-task">
          <summary><span>{t("nuevoPedidoTitulo")}</span><small>{t("nuevoPedidoAyuda")}</small></summary>
          <div className="nn-disclosure-body"><PedidoForm beneficioId={elegido.id} fincas={fincas.map((f) => ({ id: f.siteId, name: f.nombre }))} proveedores={proveedores} /></div>
        </details>
      ) : null}
    </div>
  );
}
