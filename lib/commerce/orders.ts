import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import { paymentsProvider } from "../integrations/payments";
import { recordAuditEvent } from "../audit";

export class CheckoutError extends Error {}

function generateOrderNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = randomBytes(3).toString("hex").toUpperCase();
  return `NN-${datePart}-${randomPart}`;
}

/**
 * Cart → Order, re-validating availability/inventory at the moment of
 * checkout (not trusting whatever was true when the item was added) and
 * snapshotting unit price onto OrderItem — the cart itself is left
 * `converted` rather than deleted, so "what did they try to buy" stays
 * inspectable even if payment never completes.
 */
export async function createOrderFromCart(userAccountId: string) {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { userAccountId, status: "active" },
      include: { items: { include: { productVariant: { include: { product: true } } } } },
    });

    if (!cart || cart.items.length === 0) {
      throw new CheckoutError("cart_empty");
    }

    for (const item of cart.items) {
      const variant = item.productVariant;
      if (
        variant.status !== "active" ||
        variant.product.classification !== "public" ||
        variant.product.status !== "approved"
      ) {
        throw new CheckoutError("item_unavailable");
      }
      if (variant.inventoryCount !== null && item.quantity > variant.inventoryCount) {
        throw new CheckoutError("insufficient_inventory");
      }
    }

    const currency = cart.items[0]!.productVariant.priceCurrency;
    const subtotal = cart.items.reduce(
      (sum, item) => sum + item.productVariant.priceAmount.toNumber() * item.quantity,
      0,
    );

    const order = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userAccountId,
        status: "pending_payment",
        subtotalAmount: subtotal,
        currency,
        items: {
          create: cart.items.map((item) => ({
            productVariantId: item.productVariantId,
            quantity: item.quantity,
            unitPriceAmount: item.productVariant.priceAmount,
            currency: item.productVariant.priceCurrency,
          })),
        },
      },
      include: { items: { include: { productVariant: { include: { product: true } } } } },
    });

    await tx.cart.update({ where: { id: cart.id }, data: { status: "converted" } });

    return order;
  });
}

export async function createCheckoutSessionForOrder(
  orderId: string,
  customerEmail: string,
  origin: string,
) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { productVariant: { include: { product: true } } } } },
  });

  const session = await paymentsProvider.createCheckoutSession({
    // Domain-prefixed, opaque to the payments adapter — the webhook route
    // strips the prefix to decide whether to call markOrderPaid (Commerce)
    // or markBookingPaid (Experiences, lib/experiences/bookings.ts). One
    // PaymentsProvider adapter serves both modules.
    orderId: `order:${order.id}`,
    orderNumber: order.orderNumber,
    customerEmail,
    successUrl: `${origin}/checkout/success?order=${order.orderNumber}`,
    cancelUrl: `${origin}/cart`,
    lineItems: order.items.map((item) => ({
      name: item.productVariant.product.name,
      variantName: item.productVariant.variantName,
      unitAmount: Math.round(item.unitPriceAmount.toNumber() * 100),
      currency: item.currency,
      quantity: item.quantity,
    })),
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "stripe",
      providerSessionId: session.sessionId,
      amount: order.subtotalAmount,
      currency: order.currency,
      status: "pending",
    },
  });

  return session;
}

/** Called from the Stripe webhook route only — never from a user-facing action. */
export async function markOrderPaid(orderId: string, sessionId: string, paymentIntentId: string | null) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.status === "paid") return; // idempotent — Stripe may retry webhook delivery

    await tx.order.update({ where: { id: orderId }, data: { status: "paid" } });
    await tx.payment.updateMany({
      where: { orderId, providerSessionId: sessionId },
      data: { status: "succeeded", providerPaymentIntentId: paymentIntentId },
    });

    for (const item of order.items) {
      const variant = await tx.productVariant.findUnique({ where: { id: item.productVariantId } });
      if (variant?.inventoryCount !== null && variant?.inventoryCount !== undefined) {
        await tx.productVariant.update({
          where: { id: item.productVariantId },
          data: { inventoryCount: Math.max(0, variant.inventoryCount - item.quantity) },
        });
      }
    }
  });

  await recordAuditEvent({
    actorUserAccountId: null,
    operation: "order.paid",
    entityType: "order",
    entityId: orderId,
    sourceInterface: "stripe.webhook",
  });
}

export function getOrdersForUser(userAccountId: string) {
  return prisma.order.findMany({
    where: { userAccountId },
    include: { items: { include: { productVariant: { include: { product: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Ownership check is the query itself — same pattern as lib/commerce/cart.ts. */
export function getOrderForUser(userAccountId: string, orderNumber: string) {
  return prisma.order.findFirst({
    where: { userAccountId, orderNumber },
    include: { items: { include: { productVariant: { include: { product: true } } } } },
  });
}
