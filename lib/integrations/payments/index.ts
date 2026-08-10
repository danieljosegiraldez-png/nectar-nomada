import { stripePaymentsProvider } from "./stripe";
import type { PaymentsProvider } from "./types";

export const paymentsProvider: PaymentsProvider = stripePaymentsProvider;
export type { PaymentsProvider, CreateCheckoutSessionInput, CheckoutSessionResult, PaymentEvent } from "./types";
