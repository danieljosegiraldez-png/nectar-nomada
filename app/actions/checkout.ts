"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "../../lib/db";
import { getCurrentUser } from "../../lib/auth/session";
import { createOrderFromCart, createCheckoutSessionForOrder, CheckoutError } from "../../lib/commerce/orders";

export interface CheckoutActionState {
  error?: string;
}

async function getOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function startCheckoutAction(
  _prevState: CheckoutActionState,
  _formData: FormData,
): Promise<CheckoutActionState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Cart");

  const order = await createOrderFromCart(user.userAccountId).catch((error) => {
    if (error instanceof CheckoutError) return null;
    throw error;
  });

  if (!order) {
    return { error: t("error_variant_unavailable") };
  }

  const userAccount = await prisma.userAccount.findUniqueOrThrow({
    where: { id: user.userAccountId },
    include: { person: true },
  });

  const origin = await getOrigin();
  const session = await createCheckoutSessionForOrder(order.id, userAccount.person.email ?? "", origin);

  redirect(session.url);
}
