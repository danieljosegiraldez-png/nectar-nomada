import Stripe from "stripe";
import type {
  PaymentsProvider,
  CreateCheckoutSessionInput,
  CheckoutSessionResult,
  PaymentEvent,
} from "./types";

function getClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set — see SETUP.md for how to get Stripe test-mode keys.");
  }
  return new Stripe(secretKey);
}

export const stripePaymentsProvider: PaymentsProvider = {
  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    const stripe = getClient();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: input.orderId,
      customer_email: input.customerEmail,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
      line_items: input.lineItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: item.currency.toLowerCase(),
          unit_amount: item.unitAmount,
          product_data: {
            name: item.variantName ? `${item.name} — ${item.variantName}` : item.name,
          },
        },
      })),
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout Session URL.");
    }

    return { sessionId: session.id, url: session.url };
  },

  parseWebhookEvent(rawBody: string, signatureHeader: string): PaymentEvent | null {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not set — see SETUP.md.");
    }

    const stripe = getClient();
    // Throws on an invalid/forged signature — the route handler lets that
    // propagate into a 400, never treats an unverified body as a real event.
    const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        type: "checkout_completed",
        sessionId: session.id,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
        orderId: session.client_reference_id,
      };
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        type: "checkout_expired",
        sessionId: session.id,
        paymentIntentId: null,
        orderId: session.client_reference_id,
      };
    }

    // Any other event type is real but not one this application acts on
    // yet — returning null lets the webhook route acknowledge receipt
    // (200) without pretending to have handled something it didn't.
    return null;
  },
};
