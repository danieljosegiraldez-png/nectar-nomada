# Tourism Experiences — Néctar Nómada Digital Platform

Extends `DOMAIN_MODEL.md` §4 (Experiences & Reservations) and
`CLAUDE.md` §12. Covers eco, gastro, heritage, and agricultural tourism —
**gastro-tourism confirmed as the build priority** — and specifies whether/
how OTA marketplaces (Viator, GetYourGuide, and similar) connect to
commercialization.

Every decision below came from 18 rounds of scoped questions — nothing here
is a silent default, including two explicit exceptions to defaults already
established elsewhere in the spec, both flagged plainly rather than buried.

---

## 1. OTA strategy — researched, then explicitly declined for now

**Finding**: neither Viator nor GetYourGuide expect individual small
operators to build direct API integration. Both route suppliers through
certified **connectivity partners** — third-party reservation/booking
software (Bokun, Rezdy, FareHarbor, and similar) that already hold the
certification and maintain the integration on behalf of many operators.
Building this directly means: a real certification process, mandatory
update-frequency compliance (Viator: cancellation checks every 5–10 minutes,
hourly booking-status polling), ongoing monitoring/incident-response
obligations, and — per Viator's current supplier terms — **you bear legal
responsibility for overbooking or rate discrepancies caused by your own
integration.**

**Decision**: Néctar Nómada's own platform is the direct-booking priority.
**No OTA integration work now** — not direct API, not a channel-manager
intermediary. This is a deliberate departure from chasing OTA reach in favor
of direct-booking ownership, consistent with your stated preference
throughout this build (low ops complexity, solo-maintained, managed services
over heavier integrations).

**Kept open, not foreclosed**: the existing adapter pattern
(`INTEGRATIONS.md`) means an `OTAChannelProvider` interface could be added
later — through a connectivity-partner intermediary, not a direct build —
without redesigning the core Experience model. This is a future ADR when/if
OTA reach becomes a real priority, not a default path.

## 2. Tourism types — existing pattern, no new modeling needed

Eco, gastro, heritage, and agricultural tourism all fit the existing
`ProjectDomainTag` multi-domain tagging pattern (`DOMAIN_MODEL.md` §3) — a
single Experience or Project can carry multiple tags simultaneously (a coffee
farm tour is Coffee + Tourism + Agriculture + Research, same as your existing
Las Nubes example). **Gastro-tourism is the build priority**; the other three
types use the same underlying model without special-casing.

## 3. Core Experience model extensions

```
core.experience: add
  visibility [public|unlisted] (default 'public'),
  unlisted_access_token (nullable, generated when visibility = 'unlisted'),
  minimum_group_size (nullable, applies to private bookings),
  age_verification_required (boolean, default false — set true for
    alcohol-related experience types),
  cancellation_policy_text (free text, per experience — no structured rule),
  deposit_required (boolean, default false),
  deposit_refundable (boolean, nullable — configurable per experience, no
    platform-wide default),
  requires_account (boolean, default false — see §8 for the gastro-tourism
    exception)
```

- **Unlisted/exclusive experiences**: accessed via a direct link containing a
  unique token — doesn't appear in public Discover search, but anyone with
  the link can view/book it. Simple, no separate invitation-code system.
- **Private vs. group sessions**: both supported. Private bookings can carry
  a `minimum_group_size`; group sessions are open, capacity-limited, and
  support a waitlist (§6).

```
core.experience_host(experience_id, person_id, role_note (nullable))
```

Multiple team members can host different experiences (Beto, you, others),
each tied to a real `Person` record — not a single fixed host field.

## 4. Multi-day expeditions

```
core.experience_session: add
  session_type [single_day|multi_day] (default 'single_day'),
  end_date (nullable, used when multi_day)
```

Multi-day expeditions (like the Guna Yala-style trips already in your
project notes) are supported via `start_date`/`end_date` plus the existing
general description field — **no structured day-by-day stop itinerary** for
v1. If a future need for structured multi-day planning emerges, it can reuse
the day-based structure already built for the `itinerary_display` pattern
elsewhere, without redesigning this table.

## 5. Recurring session templates

```
core.experience_session_template(id, experience_id, recurrence_rule
  (e.g. 'weekly:friday:18:00'), duration_minutes, capacity, status
  [active|paused])
```

Group sessions can repeat on a fixed schedule ("every Friday 6pm") — the
template auto-generates individual `ExperienceSession` rows going forward,
rather than requiring manual creation of every occurrence.

## 6. Waitlist

```
core.experience_waitlist(id, session_id, user_account_id, joined_at,
  notified_at (nullable), claim_expires_at (nullable), status
  [waiting|notified|claimed|expired])
```

When a spot opens, the next waitlisted person is notified (via the existing
`Notification` entity) and has a **24-hour window to claim it** before the
offer moves to the next person in line.

## 7. Check-in / attendance

```
core.booking: add checked_in_at (nullable), checked_in_by_person_id (nullable)
```

The host marks real attendance the day of the event, distinct from who
booked — a booking and an actual attendance are different facts, not
assumed identical. This also drives inventory release (§9).

## 8. Dietary/allergen handling and account requirement

```
core.participant: add
  dietary_restrictions jsonb (structured checklist: gluten, dairy, nuts,
    shellfish, and other common allergens — plus free-text notes field)
```

Structured checklist plus free-text, not free-text alone — this is safety-
relevant information, worth the extra structure over a pure text field.

**Explicit exception, confirmed intentional**: gastro-tourism experiences
require a logged-in account to book (`requires_account = true` on those
experiences specifically), **overriding the general guest-checkout default**
already established in `CLAUDE.md` §12 ("guest registration" alongside
registered-user reservations). Reasoning, recorded per `CLAUDE.md` §61(D)'s
decision-logging requirement: dietary/allergen data and live sensory
feedback (§11) are meaningfully more useful tied to a real, persistent
identity than to a one-time guest checkout — this is a deliberate,
industry-specific override, not a change to the platform-wide booking
default. Eco/heritage/agricultural experiences keep guest checkout available
unless a future decision says otherwise.

## 9. Product inventory integration

- Booking an experience with a paired product (§10) **reserves that
  product's inventory immediately at booking time**, not at check-in.
- **No-show handling**: if a booked participant doesn't check in, their
  reserved-but-unconsumed inventory **releases back automatically** — the
  payment/booking itself is unaffected (they still paid), but the physical
  product isn't permanently locked away for someone who never showed up.

## 10. Pairing menu (optional structure) and episode design

```
core.experience_pairing_course(id, experience_id, sequence_order,
  course_name, paired_product_id (nullable — FK to real core.Product),
  description)
```

Available for experiences that want a structured, ordered pairing sequence
(course 1 + Product X, course 2 + Product Y) tied to real Products — **not
required for every experience**. A simple tasting can just use the general
description field; a multi-course pairing dinner can use this structure.

### Episode design — grounded in SERNATUR's official methodology

Extends the same table to support general **episode-based experience
design**, not limited to pairing courses — grounded in Chile's national
tourism authority (SERNATUR) manual *Diseño de Experiencias Turísticas*,
which explicitly names turismo cultural y gastronómico as one of five
official priority special-interest tourism categories.

```
core.experience_pairing_course: rename conceptually to episode, add
  episode_type [pairing_course|talk|activity|transition|other],
  action_type [nuclear|auxiliary] (nuclear = defines the experience;
    auxiliary = support, e.g. transit/bathroom breaks — same action can be
    nuclear in one experience design and auxiliary in another),
  intensity_marker (nullable, small int or enum — for dramatic-curve
    pacing: does this episode build toward, sit at, or come down from a
    climax),
  place_notes (nullable — functional AND emotional dimension: light,
    sound, smell, not just a location reference),
  narrative_notes (nullable — the "relato": what gets communicated in
    this episode, distinct from what happens),
  mediator_person_id (nullable — who leads this specific episode; not
    every episode needs one, reuses core.experience_host from §3)
```

This is the same table, generalized — a pairing course *is* an episode
(with `episode_type = pairing_course`); other episode types (a welcome
talk, an outdoor activity segment, a transition between locations) use the
same structure without needing separate tables.

**Design principle carried from the source methodology, worth stating
explicitly**: a good experience isn't just a checklist of episodes — the
*sequence* should build a dramatic arc (build → climax → resolution, or
multiple smaller peaks), not stay flat throughout. This is guidance for
whoever designs an Experience (you, or a partner using the resource
library — see `TOURISM_DESIGN_RESOURCES.md`), not an enforced constraint
in the data model — the platform records the design, it doesn't grade it.

## 11. Live sensory feedback during tastings

Confirmed: reuses the exact `consumer_sensory` structure from
`CONSUMER_SENSORY_FEEDBACK.md` — no separate mechanism. A live tasting
creates `consumer_sensory.session` rows with `source = 'live_tasting'`
(alongside the existing `qr_scan` source), tied to whichever
`batch_type`/`batch_id` is relevant to that specific course/product
(honey batch, coffee lot, fermentation batch — whatever applies), using the
same per-industry form/attribute variation already specified. The
comparison view (batch peers, optional expert-panel overlay) works
identically whether the feedback came from a retail QR scan or a live event.

## 12. Pricing, deposits, and commerce integration

- **Pricing**: both flat-rate (private bookings) and per-person (group
  sessions) — varies by experience/booking type, not a single platform-wide
  model.
- **Deposits**: private bookings can require a partial deposit with the
  balance due later. Refundability (§3, `deposit_refundable`) is configurable
  per experience — some experiences forfeit the deposit on cancellation,
  others don't; no single platform-wide rule.
- **Discount codes**: experience bookings support the same discount/
  promotion codes already modeled for Commerce (`DOMAIN_MODEL.md` §4) —
  reused, not duplicated.
- **Add-ons/upsells**: booking flow supports additional purchases at booking
  time (a bottle to take home, merch) — these are ordinary `OrderItem`
  references attached to the booking, not a separate product system.

## 13. Sequencing

This is a substantial extension of Slice 4 (Experiences & Reservations) —
fits within or immediately after that slice, not a separate later slice.
Gastro-tourism ships first; eco/heritage/agricultural use the same
underlying model without additional build work, since nothing here is
gastro-specific except the account-requirement override (§8) and the pairing
structure (§10), both of which other tourism types can adopt or ignore per
experience.

Log as accepted domain-model input in `DECISIONS.md` when added to the repo,
including the OTA strategy decision (§1) as its own ADR entry — this is
exactly the kind of "why we didn't build X" reasoning worth preserving so it
doesn't get silently revisited without cause later.
