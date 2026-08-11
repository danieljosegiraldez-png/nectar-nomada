# Define Platform v1 — scope by falsifiable test, not by feature list

**Gate:** do not start this until `12_VERIFICATION_PASS_PROMPT.md` has been
run and its report reviewed. If that pass found a divergence in the lot
model, T5 sample lineage, or the honey/mead content, this task waits until
the divergence is triaged — scoping v1 on top of an unverified foundation
is the specific mistake this sequence exists to avoid.

**This task is planning only.** No code, no migrations, no schema changes.
Produce the two deliverables in Part D and stop.

---

## Part A — Why this document exists

`CLAUDE.md` specifies a genuinely enterprise-scale platform across 63
sections. Only a fraction is built, and that is fine — but it means
"CLAUDE.md complete" is not a usable definition of v1. Defined that way, v1
means everything, which means it never ships.

A feature-list definition is no better: every line becomes a negotiation,
and scope drifts upward under pressure without anyone deciding it should.

So v1 is defined by a **falsifiable test** instead.

## Part B — The test

> **Can the platform carry one real 2026 harvest from cherry through to a
> cupping score and a lot report that could actually be sent to a client?**

Answerable yes or no. It uses work already underway (Phase 1 Traceability),
and it draws the scope boundary by consequence rather than by argument: if
something is required to pass the test it is in, and if it is not, it is
not — regardless of how well specified it already is.

**Proposed in scope:**

- Phase 1 Traceability, T6 through T14 — fermentation, drying, storage
  runs; RBAC richness; the operator UI (T10, without which none of the
  data can actually be entered); deviation tracking; sensory linkage; lot
  report; end-to-end verification with DEMO seed.
- The **`provenance_class` / `source_reference` / `data_quality`
  retrofit**. `DATA_ARCHITECTURE.md` §4 calls these mandatory, not
  conventional; `GAP_ANALYSIS_2026-08-10.md` confirmed zero implementation
  anywhere. A lot report that cannot distinguish a measured fact from an
  estimate fails the central claim this platform makes about itself, and
  it is the failure a real client would notice first. The corrected Phase 1
  prompt already scoped a retrofit migration plan — confirm whether that
  plan exists and where it sits.

**Proposed out of scope (v2 onward):** Research OS / CryoBloom migration,
apiary/honey structured schema, fermentation beyond coffee, environmental
and time-series data, global search, data import/export, role-specific
dashboards, full offline/PWA, native mobile, the remaining i18n content
pipeline. Every one of these is real and already specified. None is
required to carry a harvest end to end.

**Judgment call, decide explicitly:** `Notification`. One small table that
unblocks Operator Mode's digest framing, the tourism waitlist claim window
(`TOURISM_EXPERIENCES.md` §6), recurring field-study reminders
(`GUIDED_FIELD_STUDY_TOOL.md` §9), and Alert delivery
(`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §T). Cheap, high leverage, not
required by the test. Recommend in or out, with reasoning.

## Part C — Status accuracy check, required first

Before mapping anything, confirm against the live environment rather than
prior session notes:

1. Are `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the four R2 variables,
   and the Google OAuth credentials set in **Vercel production**?
   `GAP_ANALYSIS_2026-08-10.md` Part 4 found none of them set, in
   production or locally.
2. Has any DEMO `ProductVariant` or Experience been given a price
   (`DECISIONS.md` ADR-025 decision 10, ADR-028 decision 8)? Without one,
   no Stripe path has ever been exercised end to end.
3. Has a real Partner Workspace media upload completed a full object-storage
   round trip?

State plainly which of Commerce, Experiences, and Partner Workspace have
genuinely been verified end to end versus verified up to the credential
boundary. This is not a criticism of the build — it is that v1 scope
depends on knowing which paths are actually proven.

## Part D — Deliverables

**1. A scope map.** For each of T6–T14 plus the provenance retrofit: is it
required to pass the Part B test, and what specifically would fail without
it? Flag anything currently planned inside T6–T14 that the test does *not*
require — those are candidates to defer, and finding them is part of the
point. Flag anything the test requires that is **not** in T6–T14 and not
listed in Part B; that is a genuine gap in the plan.

**2. Draft ADR text** (do not append it — draft only, for review) recording:
the v1 definition as the Part B test; the in-scope list as confirmed by the
mapping; the deferred list as an explicit, logged decision rather than a
silent omission; and the `Notification` call with reasoning. The deferral
list matters as much as the inclusion list — the purpose of logging it is
so scope does not get quietly revisited later without a stated reason.

Match the existing ADR format in `DECISIONS.md`, and confirm the next
available ADR number against the live file rather than assuming.

Report, then stop. Do not begin T6.
