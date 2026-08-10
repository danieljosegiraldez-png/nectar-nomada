"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { startCheckoutAction, type CheckoutActionState } from "../actions/checkout";

const initialState: CheckoutActionState = {};

export function CheckoutButton() {
  const [state, formAction, pending] = useActionState(startCheckoutAction, initialState);
  const t = useTranslations("Cart");

  return (
    <form action={formAction} style={{ marginTop: "1rem" }}>
      {state.error ? <p className="nn-error">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("checkoutButton")}
      </button>
    </form>
  );
}
