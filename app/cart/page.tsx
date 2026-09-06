import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { getCart } from "../../lib/commerce/cart";
import { formatPrice } from "../../lib/discover/format";
import { updateCartItemAction } from "../actions/cart";
import { CheckoutButton } from "../components/CheckoutButton";
import { BotonDeEnvio } from "../components/BotonDeEnvio";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [t, cart] = await Promise.all([getTranslations("Cart"), getCart(user.userAccountId)]);

  const items = cart?.items ?? [];
  const subtotal = items.reduce((sum, item) => sum + item.productVariant.priceAmount.toNumber() * item.quantity, 0);
  const currency = items[0]?.productVariant.priceCurrency ?? "USD";

  return (
    <div>
      <h1>{t("title")}</h1>

      {items.length === 0 ? (
        <div>
          <p className="nn-muted">{t("empty")}</p>
          <Link href="/discover" className="nn-back-link">
            {t("continueShopping")}
          </Link>
        </div>
      ) : (
        <div>
          {items.map((item) => (
            <div
              key={item.id}
              className="nn-card"
              style={{ maxWidth: "none", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}
            >
              <div>
                <h3 style={{ margin: 0 }}>{item.productVariant.product.name}</h3>
                {item.productVariant.variantName ? <p className="nn-muted">{item.productVariant.variantName}</p> : null}
                <p className="nn-price">
                  {formatPrice(item.productVariant.priceAmount, item.productVariant.priceCurrency, "")}
                </p>
              </div>
              <form action={updateCartItemAction} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input type="hidden" name="cartItemId" value={item.id} />
                <label className="nn-field" style={{ margin: 0 }}>
                  <span className="nn-muted">{t("quantityLabel")}</span>
                  <input name="quantity" type="number" inputMode="numeric" min={0} defaultValue={item.quantity} style={{ width: "4rem" }} />
                </label>
                <BotonDeEnvio className="nn-button">
                  {t("updateButton")}
                </BotonDeEnvio>
              </form>
            </div>
          ))}

          <div className="nn-detail-meta" style={{ fontSize: "1.1rem" }}>
            <strong>
              {t("subtotalLabel")}: {formatPrice(subtotal, currency, "")}
            </strong>
          </div>

          <CheckoutButton />
        </div>
      )}
    </div>
  );
}
