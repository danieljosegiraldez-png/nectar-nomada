/**
 * INTEGRATIONS.md §6 — payments adapter boundary. Business logic
 * (lib/commerce/orders.ts) depends only on this interface, never on the
 * `stripe` package directly, so a future second provider is a new adapter
 * file, not a rewrite of checkout/order logic (INTEGRATIONS.md §1's
 * general adapter-per-capability convention).
 *
 * Named `createCheckoutSession`/`getSessionStatus` rather than the
 * `createCharge`/`getStatus` placeholder names INTEGRATIONS.md originally
 * used — concretizing to the actual Stripe Checkout (hosted page) flow at
 * implementation time, not a deviation from the documented architecture
 * (the adapter boundary and provider choice are unchanged).
 */
export interface CheckoutLineItem {
  name: string;
  variantName: string | null;
  unitAmount: number; // in the currency's smallest unit (cents for USD)
  currency: string;
  quantity: number;
}

export interface CreateCheckoutSessionInput {
  // Opaque to this adapter — round-tripped as Stripe's client_reference_id
  // and returned unchanged in PaymentEvent.orderId. Callers from more than
  // one module (Commerce, Experiences) share this one adapter, so each
  // prefixes its own domain onto the value (e.g. "order:<uuid>",
  // "booking:<uuid>") and the webhook route dispatches on that prefix —
  // this field is never interpreted here, only carried.
  orderId: string;
  orderNumber: string;
  lineItems: CheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
  customerEmail: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

export type PaymentEventType = "checkout_completed" | "checkout_expired" | "payment_failed";

export interface PaymentEvent {
  type: PaymentEventType;
  sessionId: string;
  paymentIntentId: string | null;
  orderId: string | null;
}

export interface PaymentsProvider {
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult>;
  /** Verifies the webhook signature and normalizes the provider's event shape — the only place `stripe`'s raw event type is visible. */
  parseWebhookEvent(rawBody: string, signatureHeader: string): PaymentEvent | null;
}
