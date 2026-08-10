import { NextResponse } from "next/server";
import { paymentsProvider } from "../../../../lib/integrations/payments";
import { markOrderPaid } from "../../../../lib/commerce/orders";
import { markBookingPaid } from "../../../../lib/experiences/bookings";

export async function POST(request: Request): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event;
  try {
    event = paymentsProvider.parseWebhookEvent(rawBody, signature);
  } catch {
    // Invalid/forged signature — never treat an unverified body as real.
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event?.type === "checkout_completed" && event.orderId) {
    // event.orderId is the opaque, domain-prefixed reference set at
    // checkout-session creation (lib/commerce/orders.ts /
    // lib/experiences/bookings.ts) — dispatch on the prefix rather than
    // guessing which module a bare UUID belongs to.
    const [domain, id] = event.orderId.split(":");
    if (domain === "order" && id) {
      await markOrderPaid(id, event.sessionId, event.paymentIntentId);
    } else if (domain === "booking" && id) {
      await markBookingPaid(id, event.sessionId, event.paymentIntentId);
    }
  }

  // Any other recognized-but-unhandled event, or one parseWebhookEvent
  // intentionally returned null for, is still acknowledged with 200 so
  // Stripe doesn't retry delivery of something we deliberately ignore.
  return NextResponse.json({ received: true });
}
