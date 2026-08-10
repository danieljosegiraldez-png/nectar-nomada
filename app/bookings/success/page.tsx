import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getBookingForUser } from "../../../lib/experiences/bookings";
import { formatPrice } from "../../../lib/discover/format";

export const dynamic = "force-dynamic";

export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { booking: bookingNumber } = await searchParams;
  const [t, booking] = await Promise.all([
    getTranslations("Bookings"),
    bookingNumber ? getBookingForUser(user.userAccountId, bookingNumber) : null,
  ]);

  if (!booking) {
    redirect("/my-nectar");
  }

  return (
    <div>
      <h1>{t("successTitle")}</h1>
      <p>{t("successBody")}</p>

      <div className="nn-card" style={{ maxWidth: "none", marginTop: "1.5rem" }}>
        <p>
          <strong>{t("bookingNumberLabel")}:</strong> {booking.bookingNumber}
        </p>
        <p>
          <strong>{t("statusLabel")}:</strong> {t(`status_${booking.status}` as "status_pending_payment")}
        </p>
        <p>{booking.experienceSession.experience.name}</p>
        <ul>
          {booking.participants.map((participant) => (
            <li key={participant.id}>{participant.fullName}</li>
          ))}
        </ul>
        <p className="nn-price">
          {formatPrice(booking.unitPriceAmount.mul(booking.participantCount), booking.currency, "")}
        </p>
      </div>

      <Link href="/my-nectar" className="nn-back-link" style={{ marginTop: "1.5rem" }}>
        {t("viewBookingsLink")}
      </Link>
    </div>
  );
}
