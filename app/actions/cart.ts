"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { addToCart, updateCartItemQuantity, AddToCartError } from "../../lib/commerce/cart";

export interface CartActionState {
  error?: string;
}

export async function addToCartAction(
  _prevState: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Cart");
  const productVariantId = String(formData.get("productVariantId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);

  try {
    await addToCart(user.userAccountId, productVariantId, quantity);
  } catch (error) {
    if (error instanceof AddToCartError) {
      return { error: t(`error_${error.message}` as "error_variant_unavailable") };
    }
    throw error;
  }

  revalidatePath("/cart");
  redirect("/cart");
}

export async function updateCartItemAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const cartItemId = String(formData.get("cartItemId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);

  await updateCartItemQuantity(user.userAccountId, cartItemId, quantity);
  revalidatePath("/cart");
}
