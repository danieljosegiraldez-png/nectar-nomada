import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPublicProductBySlug } from "../../../lib/discover/service";
import { lowestVariantPrice, formatPrice } from "../../../lib/discover/format";
import { AddToCartForm } from "../../components/AddToCartForm";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [t, product] = await Promise.all([getTranslations("Discover"), getPublicProductBySlug(slug)]);

  if (!product) {
    notFound();
  }

  const price = lowestVariantPrice(product.variants);

  return (
    <div>
      <Link href="/discover" className="nn-back-link">
        {t("backToDiscover")}
      </Link>

      <h1>{product.name}</h1>
      <p className="nn-price" style={{ fontSize: "1.2rem" }}>
        {price ? formatPrice(price.amount, price.currency, "") : t("priceUnavailable")}
      </p>
      <div className="nn-detail-meta">
        {product.project ? (
          <Link href={`/projects/${product.project.slug}`}>{t("partOfProject", { project: product.project.name })}</Link>
        ) : null}
        {product.organization ? <span>{t("producedBy", { organization: product.organization.name })}</span> : null}
        {product.location ? <Link href={`/locations/${product.location.slug}`}>{product.location.name}</Link> : null}
      </div>

      {product.summary ? <p className="nn-muted">{product.summary}</p> : null}
      {product.description ? <div className="nn-prose">{product.description}</div> : null}

      <div className="nn-section">
        <AddToCartForm
          variants={product.variants.map((v) => ({
            id: v.id,
            variantName: v.variantName,
            priceAmount: v.priceAmount.toNumber(),
            priceCurrency: v.priceCurrency,
            inventoryCount: v.inventoryCount,
          }))}
        />
      </div>
    </div>
  );
}
