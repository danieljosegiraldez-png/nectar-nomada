import type { Prisma } from "../../generated/prisma/client";

/**
 * Product/Experience.priceAmount is nullable and deliberately unseeded in
 * DEMO data (CLAUDE.md §54 — never fabricate prices). `unavailableLabel`
 * covers that case; once Slice 3 (Commerce) sets real prices, this starts
 * formatting them.
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
