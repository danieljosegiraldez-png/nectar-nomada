import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { permissionKeysAnywhere } from "../../../lib/rbac/service";
import { COOKIE_BENEFICIO, beneficioDeLaPagina } from "../../../lib/traceability/beneficioElegido";
import { pedidosDeBeneficio } from "../../../lib/traceability/pedidosDeCereza";
import { proveedoresDeCereza } from "../../../lib/traceability/proveedoresDeCereza";
import { listarFincas } from "../../../lib/traceability/fincas";
import { BeneficioElegido } from "../../components/beneficio/BeneficioElegido";
import { CerrarPedidoForm, PedidoForm } from "../../components/beneficio/PedidoForm";

export const dynamic = "force-dynamic";

/**
 * Los pedidos de cereza del beneficio elegido (spec recepción §3.3 y §4): a quién, cuánto, con qué
 * margen, y lo recibido contra lo pedido. La calidad pedida se guarda y la evalúa la pieza 3.
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
      <div>
        <h1>{t("pedidosTitulo")}</h1>
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
    gestiona ? proveedoresDeCereza(user.userAccountId) : Promise.resolve([]),
    gestiona ? listarFincas(user.userAccountId) : Promise.resolve([]),
  ]);
  const kg = (x: number) => x.toFixed(1);

  return (
    <div>
      <p>
        <Link href="/beneficio">{t("volver")}</Link>
      </p>
      <h1>{t("pedidosTitulo")}</h1>
      <BeneficioElegido beneficios={beneficios} elegido={elegido} volver="/beneficio/pedidos" />

      <section className="nn-section">
        {pedidos.length === 0 ? (
          <p className="nn-muted">{t("sinPedidos")}</p>
        ) : (
          <ul>
            {pedidos.map((p) => (
              <li key={p.id}>
                <strong>{p.fincaSite?.name ?? p.proveedor?.name ?? ""}</strong>
                {" — "}
                {p.fecha.toISOString().slice(0, 10)}
                {" — "}
                {t("pedidoCifras", { pedidos: kg(Number(p.kgPedidos)), recibidos: kg(p.recibidoKg), dif: kg(p.diferenciaKg), pct: (p.diferenciaPct * 100).toFixed(1) })}
                <br />
                <span className="nn-muted">
                  {t(p.estado === "abierto" ? "abierto" : "cerrado")}
                  {p.exceso ? ` · ${t("exceso")}` : ""}
                  {p.falta && p.estado === "cerrado" ? ` · ${t("falta")}` : ""}
                  {p.notaDeCierre ? ` · ${p.notaDeCierre}` : ""}
                </span>
                {gestiona && p.estado === "abierto" ? <CerrarPedidoForm pedidoId={p.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {gestiona ? (
        <section className="nn-section">
          <h2>{t("nuevoPedidoTitulo")}</h2>
          <PedidoForm beneficioId={elegido.id} fincas={fincas.map((f) => ({ id: f.siteId, name: f.nombre }))} proveedores={proveedores} />
        </section>
      ) : null}
    </div>
  );
}
