"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "../../lib/db";
import { getCurrentUser } from "../../lib/auth/session";
import { createBookingForSession, createCheckoutSessionForBooking, BookingError } from "../../lib/experiences/bookings";

export interface BookingActionState {
  error?: string;
}

async function getOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function bookExperienceSessionAction(
  _prevState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Experiences");

  const experienceSessionId = formData.get("experienceSessionId");
  const namesRaw = formData.get("participantNames");
  const names =
    typeof namesRaw === "string"
      ? namesRaw
          .split("\n")
          .map((n) => n.trim())
          .filter(Boolean)
      : [];

  if (typeof experienceSessionId !== "string" || !experienceSessionId || names.length === 0) {
    return { error: t("error_participants_required") };
  }

  let booking;
  try {
    booking = await createBookingForSession(user.userAccountId, experienceSessionId, names);
  } catch (error) {
    if (error instanceof BookingError) {
      return { error: t(`error_${error.message}` as "error_session_unavailable") };
    }
    throw error;
  }

  const userAccount = await prisma.userAccount.findUniqueOrThrow({
    where: { id: user.userAccountId },
    include: { person: true },
  });

  const origin = await getOrigin();
  const session = await createCheckoutSessionForBooking(booking.id, userAccount.person.email ?? "", origin);

  redirect(session.url);
}
