"use client";

import { CampoNumerico } from "./CampoNumerico";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { addToCartAction, type CartActionState } from "../actions/cart";
import { formatPrice } from "../../lib/discover/format";

interface VariantOption {
  id: string;
  variantName: string | null;
  priceAmount: number;
  priceCurrency: string;
  inventoryCount: number | null;
}

const initialState: CartActionState = {};

export function AddToCartForm({ variants }: { variants: VariantOption[] }) {
  const [state, formAction, pending] = useActionState(addToCartAction, initialState);
  const t = useTranslations("Discover");

  if (variants.length === 0) {
    return <p className="nn-muted">{t("noVariantsYet")}</p>;
  }

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 320 }}>
      {variants.length > 1 ? (
        <div className="nn-field">
          <label htmlFor="productVariantId">{t("variantLabel")}</label>
          <select id="productVariantId" name="productVariantId" required>
            {variants.map((v) => (
              <option key={v.id} value={v.id} disabled={v.inventoryCount === 0}>
                {v.variantName ?? t("variantLabel")} — {formatPrice(v.priceAmount, v.priceCurrency, "")}
                {v.inventoryCount === 0 ? ` (${t("outOfStock")})` : ""}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="productVariantId" value={variants[0]!.id} />
      )}

      <div className="nn-field">
        <label htmlFor="quantity">{t("quantityLabel")}</label>
        <CampoNumerico id="quantity" name="quantity" inputMode="numeric" min={1} defaultValue={1} required />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}

      <button type="submit" className="nn-button" disabled={pending || variants.every((v) => v.inventoryCount === 0)}>
        {t("addToCartButton")}
      </button>
    </form>
  );
}
