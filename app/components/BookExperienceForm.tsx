"use client";

import { useActionState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { bookExperienceSessionAction, type BookingActionState } from "../actions/bookings";

interface SessionOption {
  id: string;
  startAt: Date;
  capacityRemaining: number | null;
}

const initialState: BookingActionState = {};

function SessionBookingForm({ session, bookable }: { session: SessionOption; bookable: boolean }) {
  const [state, formAction, pending] = useActionState(bookExperienceSessionAction, initialState);
  const t = useTranslations("Experiences");
  const format = useFormatter();
  const soldOut = session.capacityRemaining === 0;

  return (
    <div className="nn-card" style={{ maxWidth: "none", marginBottom: "1rem" }}>
      <p>
        <strong>{format.dateTime(session.startAt, { dateStyle: "medium", timeStyle: "short" })}</strong>
      </p>
      {session.capacityRemaining !== null ? (
        <p className="nn-muted">
          {soldOut ? t("soldOut") : t("spotsRemaining", { count: session.capacityRemaining })}
        </p>
      ) : null}

      {!bookable ? (
        <p className="nn-muted">{t("notBookableYet")}</p>
      ) : soldOut ? null : (
        <form action={formAction} className="nn-form">
          <input type="hidden" name="experienceSessionId" value={session.id} />
          <div className="nn-field">
            <label htmlFor={`participantNames-${session.id}`}>{t("participantNamesLabel")}</label>
            <textarea
              id={`participantNames-${session.id}`}
              name="participantNames"
              rows={3}
              placeholder={t("participantNamesPlaceholder")}
              required
            />
          </div>
          {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
          <button type="submit" className="nn-button" disabled={pending}>
            {t("bookButton")}
          </button>
        </form>
      )}
    </div>
  );
}

export function BookExperienceForm({ sessions, bookable }: { sessions: SessionOption[]; bookable: boolean }) {
  const t = useTranslations("Experiences");

  if (sessions.length === 0) {
    return <p className="nn-muted">{t("noSessionsScheduled")}</p>;
  }

  return (
    <div>
      <h2>{t("upcomingSessionsHeading")}</h2>
      {sessions.map((session) => (
        <SessionBookingForm key={session.id} session={session} bookable={bookable} />
      ))}
    </div>
  );
}
