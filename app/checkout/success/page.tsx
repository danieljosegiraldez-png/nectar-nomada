import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getOrderForUser } from "../../../lib/commerce/orders";
import { formatPrice } from "../../../lib/discover/format";

export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { order: orderNumber } = await searchParams;
  const [t, order] = await Promise.all([
    getTranslations("Checkout"),
    orderNumber ? getOrderForUser(user.userAccountId, orderNumber) : null,
  ]);

  if (!order) {
    redirect("/my-nectar");
  }

  return (
    <div>
      <h1>{t("successTitle")}</h1>
      <p>{t("successBody")}</p>

      <div className="nn-card" style={{ maxWidth: "none", marginTop: "1.5rem" }}>
        <p>
          <strong>{t("orderNumberLabel")}:</strong> {order.orderNumber}
        </p>
        <p>
          <strong>{t("statusLabel")}:</strong> {t(`status_${order.status}` as "status_pending_payment")}
        </p>
        <ul>
          {order.items.map((item) => (
            <li key={item.id}>
              {item.productVariant.product.name}
              {item.productVariant.variantName ? ` — ${item.productVariant.variantName}` : ""} ×{item.quantity} —{" "}
              {formatPrice(item.unitPriceAmount, item.currency, "")}
            </li>
          ))}
        </ul>
        <p className="nn-price">{formatPrice(order.subtotalAmount, order.currency, "")}</p>
      </div>

      <Link href="/my-nectar" className="nn-back-link" style={{ marginTop: "1.5rem" }}>
        {t("viewOrdersLink")}
      </Link>
    </div>
  );
}
