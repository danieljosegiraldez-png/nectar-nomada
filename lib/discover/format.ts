import type { Prisma } from "../../generated/prisma/client";

/**
 * Experience.priceAmount is nullable and deliberately unseeded in DEMO data
 * (CLAUDE.md §54 — never fabricate prices). `unavailableLabel` covers that
 * case. Product pricing lives on ProductVariant (Slice 3) — see
 * `lowestVariantPrice` below for the Product-level "starting from" display.
 */
export function formatPrice(
  amount: Prisma.Decimal | number | null,
  currency: string | null,
  unavailableLabel: string,
): string {
  if (amount === null) return unavailableLabel;
  const numericAmount = typeof amount === "number" ? amount : amount.toNumber();
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency ?? "USD",
  }).format(numericAmount);
}

interface PricedVariant {
  priceAmount: Prisma.Decimal | number;
  priceCurrency: string;
}

/** The cheapest active variant's price, for a Product card's "from $X" display — null if the product has no purchasable variant yet. */
export function lowestVariantPrice(variants: readonly PricedVariant[]): { amount: number; currency: string } | null {
  if (variants.length === 0) return null;
  const cheapest = variants.reduce((min, v) => {
    const amount = typeof v.priceAmount === "number" ? v.priceAmount : v.priceAmount.toNumber();
    const minAmount = typeof min.priceAmount === "number" ? min.priceAmount : min.priceAmount.toNumber();
    return amount < minAmount ? v : min;
  });
  const amount = typeof cheapest.priceAmount === "number" ? cheapest.priceAmount : cheapest.priceAmount.toNumber();
  return { amount, currency: cheapest.priceCurrency };
}
