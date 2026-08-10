import { NextResponse } from "next/server";
import { paymentsProvider } from "../../../../lib/integrations/payments";
import { markOrderPaid } from "../../../../lib/commerce/orders";

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
    await markOrderPaid(event.orderId, event.sessionId, event.paymentIntentId);
  }

  // Any other recognized-but-unhandled event, or one parseWebhookEvent
  // intentionally returned null for, is still acknowledged with 200 so
  // Stripe doesn't retry delivery of something we deliberately ignore.
  return NextResponse.json({ received: true });
}
