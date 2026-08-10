import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import { paymentsProvider } from "../integrations/payments";
import { recordAuditEvent } from "../audit";

export class BookingError extends Error {}

function generateBookingNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = randomBytes(3).toString("hex").toUpperCase();
  return `BK-${datePart}-${randomPart}`;
}

/**
 * ExperienceSession → Booking, re-validated at booking time (not a cart —
 * DOMAIN_MODEL.md's chain has no intermediate step between Session and
 * Booking) and snapshotting unit price onto Booking, same "preserve what
 * actually happened" principle as OrderItem.unitPriceAmount
 * (lib/commerce/orders.ts). A later Experience price change must never
 * rewrite a past Booking's total.
 */
export async function createBookingForSession(
  userAccountId: string,
  experienceSessionId: string,
  participantNames: string[],
) {
  if (participantNames.length < 1) {
    throw new BookingError("participants_required");
  }

  return prisma.$transaction(async (tx) => {
    const session = await tx.experienceSession.findUnique({
      where: { id: experienceSessionId },
      include: { experience: true },
    });

    if (!session || session.status !== "scheduled") {
      throw new BookingError("session_unavailable");
    }
    // Same public gate as lib/discover/service.ts / lib/commerce/cart.ts —
    // a session of a non-public/non-approved Experience is never bookable,
    // regardless of whether the viewer somehow has the session's ID.
    if (session.experience.classification !== "public" || session.experience.status !== "approved") {
      throw new BookingError("session_unavailable");
    }
    if (session.startAt <= new Date()) {
      throw new BookingError("session_unavailable");
    }
    // CLAUDE.md §54 — never fabricate a price. A session cannot be booked
    // (charged for) until its Experience has a real price.
    if (session.experience.priceAmount === null) {
      throw new BookingError("price_unavailable");
    }
    if (session.capacityRemaining !== null && participantNames.length > session.capacityRemaining) {
      throw new BookingError("insufficient_capacity");
    }

    const booking = await tx.booking.create({
      data: {
        bookingNumber: generateBookingNumber(),
        experienceSessionId: session.id,
        userAccountId,
        status: "pending_payment",
        participantCount: participantNames.length,
        unitPriceAmount: session.experience.priceAmount,
        currency: session.experience.priceCurrency ?? "USD",
        participants: {
          create: participantNames.map((fullName) => ({ fullName })),
        },
      },
      include: {
        experienceSession: { include: { experience: true } },
        participants: true,
      },
    });

    return booking;
  });
}

export async function createCheckoutSessionForBooking(bookingId: string, customerEmail: string, origin: string) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { experienceSession: { include: { experience: true } } },
  });

  const experience = booking.experienceSession.experience;

  const session = await paymentsProvider.createCheckoutSession({
    // Domain-prefixed, opaque to the payments adapter — the webhook route
    // strips the prefix to decide whether to call markOrderPaid (Commerce)
    // or markBookingPaid (Experiences). One PaymentsProvider adapter serves
    // both modules (INTEGRATIONS.md's adapter-per-capability pattern).
    orderId: `booking:${booking.id}`,
    orderNumber: booking.bookingNumber,
    customerEmail,
    successUrl: `${origin}/bookings/success?booking=${booking.bookingNumber}`,
    cancelUrl: `${origin}/experiences/${experience.slug}`,
    lineItems: [
      {
        name: experience.name,
        variantName: null,
        unitAmount: Math.round(booking.unitPriceAmount.toNumber() * 100),
        currency: booking.currency,
        quantity: booking.participantCount,
      },
    ],
  });

  await prisma.bookingPayment.create({
    data: {
      bookingId: booking.id,
      provider: "stripe",
      providerSessionId: session.sessionId,
      amount: booking.unitPriceAmount.mul(booking.participantCount),
      currency: booking.currency,
      status: "pending",
    },
  });

  return session;
}

/** Called from the Stripe webhook route only — never from a user-facing action. */
export async function markBookingPaid(bookingId: string, sessionId: string, paymentIntentId: string | null) {
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.status === "confirmed") return; // idempotent — Stripe may retry webhook delivery

    await tx.booking.update({ where: { id: bookingId }, data: { status: "confirmed" } });
    await tx.bookingPayment.updateMany({
      where: { bookingId, providerSessionId: sessionId },
      data: { status: "succeeded", providerPaymentIntentId: paymentIntentId },
    });

    const session = await tx.experienceSession.findUnique({ where: { id: booking.experienceSessionId } });
    if (session?.capacityRemaining !== null && session?.capacityRemaining !== undefined) {
      await tx.experienceSession.update({
        where: { id: booking.experienceSessionId },
        data: { capacityRemaining: Math.max(0, session.capacityRemaining - booking.participantCount) },
      });
    }
  });

  await recordAuditEvent({
    actorUserAccountId: null,
    operation: "booking.paid",
    entityType: "booking",
    entityId: bookingId,
    sourceInterface: "stripe.webhook",
  });
}

export function getBookingsForUser(userAccountId: string) {
  return prisma.booking.findMany({
    where: { userAccountId },
    include: { experienceSession: { include: { experience: true } }, participants: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Ownership check is the query itself — same pattern as lib/commerce/orders.ts. */
export function getBookingForUser(userAccountId: string, bookingNumber: string) {
  return prisma.booking.findFirst({
    where: { userAccountId, bookingNumber },
    include: { experienceSession: { include: { experience: true } }, participants: true },
  });
}
