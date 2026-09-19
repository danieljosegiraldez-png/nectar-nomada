import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "../../lib/auth/session";
import { pedidosPorDespachar, puedeGestionarTienda, tiendaParaGestionar } from "../../lib/commerce/tienda";
import { AnularAsignacionForm, ConfirmarRecepcionForm, DespacharPedidoForm, NuevaVarianteForm } from "../components/commerce/TiendaForms";

export const dynamic = "force-dynamic";

/**
 * La tienda por dentro (ADR-163): lo que espera recepción, y los productos con sus variantes.
 *
 * **Sólo para quien tiene `commerce:manage_store`**, y a quien no lo tiene se le contesta 404, no
 * «prohibido»: que exista una trastienda no es información que haga falta dar.
 */
export default async function TiendaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await puedeGestionarTienda(user.userAccountId))) notFound();

  const [t, { productos, pendientes }, porDespachar] = await Promise.all([
    getTranslations("Tienda"),
    tiendaParaGestionar(user.userAccountId),
    pedidosPorDespachar(user.userAccountId),
  ]);

  return (
    <div>
      <h1>{t("titulo")}</h1>

      {/* ADR-169 — los pedidos pagados, y de qué lote sale cada frasco. */}
      <section className="nn-section">
        <h2>{t("despachoTitulo")}</h2>
        <p className="nn-muted">{t("despachoIntro")}</p>
        {porDespachar.length === 0 ? (
          <p className="nn-muted">{t("sinPedidos")}</p>
        ) : (
          <ul>
            {porDespachar.map((p) => (
              <li key={p.id} style={{ marginBottom: "1rem" }}>
                <strong>{p.orderNumber}</strong> · {p.createdAt.toISOString().slice(0, 10)}
                <DespacharPedidoForm orderId={p.id} articulos={p.items} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("pendientesTitulo")}</h2>
        <p className="nn-muted">{t("pendientesIntro")}</p>
        {pendientes.length === 0 ? (
          <p className="nn-muted">{t("sinPendientes")}</p>
        ) : (
          <ul>
            {pendientes.map((p) => (
              <li key={p.id} style={{ marginBottom: "1rem" }}>
                {p.assignedAt.toISOString().slice(0, 10)} ·{" "}
                {t("pendienteFila", {
                  envases: p.unitsAssigned,
                  producto: p.productVariant.product.name,
                  variante: p.productVariant.variantName ?? p.productVariant.sku,
                })}{" "}
                · {t("delLote")}{" "}
                <Link href={`/lots/${p.lot.id}`} className="nn-code">
                  {p.lot.lotCode}
                </Link>
                <ConfirmarRecepcionForm allocationId={p.id} asignados={p.unitsAssigned} />
                <AnularAsignacionForm allocationId={p.id} lotId={p.lot.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("productosTitulo")}</h2>
        {productos.map((pr) => (
          <div key={pr.id} style={{ marginBottom: "1.5rem" }}>
            <h3>{pr.name}</h3>
            {pr.variants.length === 0 ? (
              <p className="nn-muted">{t("productoSinVariantes")}</p>
            ) : (
              <ul>
                {pr.variants.map((v) => (
                  <li key={v.id}>
                    {v.variantName ?? v.sku} <span className="nn-code">{v.sku}</span> · {String(v.priceAmount)} {v.priceCurrency} ·{" "}
                    {v.inventoryCount === null ? t("inventarioNoLlevado") : t("inventario", { n: v.inventoryCount })}
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary>{t("nuevaVariante")}</summary>
              <NuevaVarianteForm productId={pr.id} />
            </details>
          </div>
        ))}
      </section>
    </div>
  );
}
