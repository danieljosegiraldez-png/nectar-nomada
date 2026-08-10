# Competitions — Néctar Nómada Digital Platform

Extends `DOMAIN_MODEL.md` §4 (Competitions: `Competition →
CompetitionEdition → CompetitionCategory → Division → Entry → Competitor →
Product/Sample → BlindCode → Flight → Panel → JudgeAssignment → Evaluation →
CompetitionResult → Ranking → Award`, reusing the Sensory Assessment engine
rather than a parallel scoring system). That entity chain covers the judging
mechanics; this document adds the **operational layer** — the real roles,
physical logistics, and event-running infrastructure a competition actually
needs, grounded in patterns from established professional competition
management software (Beer Awards Platform's category structure: Cellar
Master, Entries Receptionist, Judges, Organizer, Results, Orders/Billing).

Confirmed scope: **full operational depth**, built properly now — real use
may come later (e.g., a Panama-style lager competition, connecting to the
cultural-identity research work under `RESEARCH_ACTIVITY_CRITERIA.md`), but
this isn't placeholder architecture.

**Explicitly category-agnostic, not beer-specific**: Beer Awards Platform
was used only for *operational pattern* research (what roles a real
competition needs, how physical logistics actually work) — the resulting
entities are the same generic `Competition`/`CompetitionCategory`/`Division`
structure already in `DOMAIN_MODEL.md`, unchanged. Nothing here is coupled
to beer, mead, or cider specifically:

- A **Panama Fine Honey Awards** competition uses the exact same
  Organizer/Entries Receptionist/Cellar Master roles, the same check-in and
  pull-sheet workflow, the same blind-coding discipline — judged using the
  Honey protocol from `BEVERAGE_SENSORY_PROTOCOLS.md` instead of a
  beer-based one.
- A **specialty coffee competition** works identically, judged against the
  CVA-adapted coffee protocol.
- A **cacao/chocolate competition** works identically once that protocol
  exists (currently placeholder per `BEVERAGE_SENSORY_PROTOCOLS.md` §4).
- The only category-specific piece anywhere in this system is *which
  sensory protocol a given competition's judging reuses* — the operational
  layer specified in this document doesn't change based on that choice.

"Best of Show" (§6) is a naming convention with roots in beer/homebrew
competition tradition, but the underlying concept — category winners
competing in a second round — is genuinely category-neutral; honey shows,
coffee competitions (Cup of Excellence-style finals), and wine competitions
all have structural equivalents. The entity is named generically
(`bos_round`, `round_type`) specifically so it isn't beer-coded in the data
model even though the term originated there.

---

## 1. New operational roles

Beyond the existing `Sensory Judge` Role Profile (`RBAC.md` §5), real
competition operations need:

- **Competition Organizer** (scope: competition) — full administrative
  control over one competition/edition: settings, categories, schedule,
  judge assignment, results publication.
- **Entries Receptionist** (scope: competition) — checks in physical/
  submitted entries against registration, assigns blind codes at intake.
  Explicitly does NOT get `blind_mapping.view` beyond what's needed to
  perform intake — reuses the same restrictive blind-coding discipline
  already specified in `RBAC.md` §7.
- **Cellar Master** (scope: competition) — manages physical storage/
  location of entries, generates pull sheets (§4), tracks entry
  condition/chain of custody from intake to judging to disposal.

All three are Role Profile data additions (`RBAC.md` §2 — data, not
schema), scoped per competition, consistent with how every other
project-scoped role in this platform works.

## 2. Entry intake and check-in

```
competitions.entry: extend with
  intake_status [registered|checked_in|rejected|withdrawn],
  checked_in_by_person_id (nullable), checked_in_at (nullable),
  rejection_reason (nullable),
  cellar_location text (nullable — physical storage location/shelf/bin)
```

Check-in is a real workflow step, not implicit: the Entries Receptionist
verifies a physical/submitted entry matches its registration record before
`intake_status` moves to `checked_in`. A mismatch or problem gets recorded
as `rejected` with a reason — never silently dropped.

## 3. Blind coding at intake

Reuses the existing blind-mapping restriction (`RBAC.md` §7) exactly —
blind codes get assigned at check-in, and the mapping table between
`blind_code` and the real `entry_id`/`competitor_id` stays restricted to
Head Judge/Organizer/Admin Role Profiles. The Entries Receptionist can
*assign* a code during intake without being able to later *query* the
mapping — assignment and lookup are different permissions.

## 4. Pull sheets — physical logistics

```
competitions.pull_sheet(id, flight_id, generated_by_person_id,
  generated_at, entries jsonb (ordered list of entry_id + cellar_location),
  status [pending|in_progress|complete])
```

A pull sheet is the Cellar Master's retrieval list — which physical entries
need to go from cellar storage to a specific judging flight, in what order,
from where. This is real event-day logistics infrastructure, not just data
modeling: without it, a competition with more than a handful of entries
becomes physically unmanageable on judging day.

## 5. Judge-facing operational flow

```
competitions.judge_session(id, competition_edition_id, judge_person_id,
  signed_in_at (nullable), status [not_started|in_progress|complete])
```

- **Sign-in**: a judge signs in for a specific competition day/session —
  distinct from their platform login, since judging happens in bursts
  (a day at a physical venue), not as an ongoing session.
- **Judge dashboard**: once signed in, a judge sees their assigned flights
  for that session (via existing `JudgeAssignment`) — what to judge next,
  not a raw list requiring manual lookup.
- **Personal scoresheets**: judges can access their own historical
  Assessments across competitions/editions they've judged — their own
  judging record over time, useful for a working judge tracking their own
  development (directly relevant given your own UC Davis/FlavorActiV/
  Cicerone background — this is exactly the kind of record a working judge
  actually wants).

```
sensory.assessment: add visible_to_judge_as_personal_record (boolean,
  default true — a judge can always see their own past assessments,
  independent of whether competition results are otherwise public)
```

## 6. Best of Show — a second judging round, not a bigger flight

```
competitions.bos_round(id, competition_edition_id, round_type
  [mini_bos|bos], parent_round_id (nullable — mini_bos rounds can feed into
  a final bos round), entries jsonb (category winners advancing),
  status [pending|in_progress|complete])
```

Best of Show is structurally distinct from a regular judging `Flight` — it
pits category winners against each other in a secondary round, not a bigger
version of the first round. Modeled as its own entity rather than
overloading `Flight`, since the entry criteria (must have won something
already) and judging panel composition (often the most senior judges) are
genuinely different.

## 7. Results and awards

Reuses `CompetitionResult → Ranking → Award` as already specified in
`DOMAIN_MODEL.md` §4 — no changes needed there. Results publication is
gated the same way any other content is (`SECURITY.md` §4 classification) —
an Organizer controls when results move from `internal` (judging complete,
not yet announced) to `public`.

## 8. Competition website

Each `CompetitionEdition` can have its own lightweight public-facing page —
reuses the existing Story & Knowledge Engine pattern
(`DOMAIN_MODEL.md` §4) rather than building a separate website system.
Entry registration, schedule, and eventually results render through this
page. Not a new module — a configured view over existing Project/Story
infrastructure, scoped to a competition.

## 9. Entry fees — genuinely separate payment system, confirmed

**Explicit decision, confirmed twice given the real infrastructure
duplication involved**: competition entry fees use a **fully independent
payment integration**, not the Commerce module's Stripe configuration or
`Order`/`Payment` tables.

```
competitions.entry_fee_payment(id, entry_id, amount, currency, provider
  [distinct PaymentsProvider adapter instance from Commerce's],
  provider_reference, status [pending|paid|refunded|failed], paid_at)
```

- Still implements the `PaymentsProvider` adapter interface
  (`INTEGRATIONS.md` §6) — same interface discipline as the rest of the
  platform — but configured as its own separate provider instance
  (potentially even a different underlying processor from Commerce's
  Stripe setup, your choice), not sharing Commerce's orders/inventory/
  discount-code infrastructure.
- Still gets the same mandatory audit trail as any other payment event
  (`SECURITY.md` §6 already requires this for "every payment/refund
  event" platform-wide) — the audit requirement isn't optional just
  because this is a separate system.
- Refund policy for entry fees (often stricter/no-refund-after-judging-
  starts in real competitions) is its own business rule, independent of
  Commerce's return/refund policies.

## 10. Sequencing

Confirmed as full-depth build, positioned to follow Slice 6 (Sensory) per
`MVP_ROADMAP.md` §3's existing note that Competitions "reuses Sensory's
Assessment engine... sequenced after Slice 6, not part of this roadmap's
numbered slices." This document specifies what that later work should
actually contain — operational depth included, not a stripped-down version
to add later. Log acceptance in `DECISIONS.md`, same pattern as every other
planning document.
