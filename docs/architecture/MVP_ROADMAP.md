# MVP Roadmap — Néctar Nómada Digital Platform

Sequences the vertical slices from CLAUDE.md §53 against the domain model and
RBAC design above. **Deviates from CLAUDE.md's listed order** — flagged
explicitly per this document's own instructions rather than silently reordered.

---

## 1. The deviation, stated plainly

CLAUDE.md §53 lists Vertical Slice A (Public Discovery) first and Vertical Slice
B (Identity) second. This roadmap builds **Identity first.**

**Why:** Every other slice's data model depends on RBAC existing to be
meaningful. Public Discovery's own classification filtering (`SECURITY.md` §4)
requires the `classification` axis and the authorization service to already
exist, or "public" has nothing to be filtered against. Partner Workspace,
Research, and Sensory are unbuildable without Assignments/Scopes to gate them.
Building Discovery first would mean either (a) building it with no permission
enforcement and retrofitting RBAC around live data and routes later, which is
exactly the kind of rework CLAUDE.md's own methodology (§50) tries to avoid, or
(b) building a throwaway version. Identity first means every subsequent slice is
built against a real authorization service from its first line of code.

This was flagged in `PLATFORM_OVERVIEW_draft.md` §8 before this document existed
and is carried forward here as the final decision, logged formally in
`DECISIONS.md` ADR-012.

## 2. Sequencing

### Slice 1 — Identity
Authentication (`SECURITY.md` §1) · Person/UserAccount model (`DOMAIN_MODEL.md`
§1) · full RBAC chain (`RBAC.md`) with seed Role Profiles (`RBAC.md` §5) ·
authorization service (`SECURITY.md` §2) · My Néctar shell (empty-state profile,
no orders/bookings yet since Commerce/Experiences don't exist). Includes the
mandatory RBAC test suite (`RBAC.md` §9) as an in-scope deliverable of this
slice, not deferred hardening.

**Exit criteria:** a Person can be created, invited, assigned a Role Profile at a
Scope, and the authorization service correctly grants/denies across at least one
positive and one negative case per seeded Role Profile.

### Slice 2 — Public Discovery (read-only) — **implemented, DECISIONS.md ADR-024**
Location, Project, Story, Product, Experience — read paths only, no
booking/purchase yet. Built against the real authorization service from Slice 1,
so classification filtering (`SECURITY.md` §4) is exercised from day one, not
bolted on. This is where the "same location page dynamically exposes connected
information" behavior (CLAUDE.md §6) first appears, scoped to whatever entities
exist by this point (Location, Project, Story, Product stubs).

Shipped as: `lib/discover/service.ts` (the single hard-filtered read path,
`classification: 'public'` AND `status: 'approved'`, unconditional regardless
of viewer identity — verified in a real browser session to return identical
content signed in and signed out), `/discover` index plus
`/locations|projects|stories|products|experiences/[slug]` detail pages, and
CLAUDE.md §54-compliant DEMO seed content (`SEED_DEMO_CONTENT=true`) built
around Las Nubes, Finca Rosina, and Kiva Estate. `StoryBlock` composition,
the MediaAsset/object-storage pipeline, and Commerce/Experience booking
mechanics are explicitly deferred past this slice — see ADR-024.

### Slice 3 — Commerce (implemented, DECISIONS.md ADR-025)
Product/Variant/SKU, Cart, Order, Stripe integration (`INTEGRATIONS.md` §6).
Extends Discovery's read-only Product pages into purchasable ones. My Néctar
gains Orders. End-to-end Stripe purchase verification pending test-mode API
keys and at least one priced DEMO variant (ADR-025 decision 10).

### Slice 4 — Experiences & Reservations (implemented, DECISIONS.md ADR-028)
Experience, ExperienceSession, Booking, Participant. My Néctar gains Bookings.
Distinct booking engine per CLAUDE.md §12, not a Commerce SKU hack — validates
that the Experience/Booking model built in `DOMAIN_MODEL.md` actually holds up
against a real capacity/scheduling UI. This is the core booking engine only —
`TOURISM_EXPERIENCES.md`'s gastro-tourism-specific extensions (waitlist,
multi-day sessions, dietary structure, pairing menus, live sensory feedback)
are accepted planning input (ADR-026/027) not yet built. End-to-end Stripe
purchase verification pending test-mode API keys and at least one priced
DEMO Experience, same open item as Slice 3 (ADR-025 decision 10).

### Slice 5 — Partner Workspace (implemented, DECISIONS.md ADR-029)
Project Assignment (exercising `RBAC.md`'s scope=project path in production for
the first time with a real non-admin user type), Task, data submission forms,
media upload (`DATA_ARCHITECTURE.md` §5). First slice where the classification
axis meaningfully restricts a non-admin, non-researcher user's view — verified
live with a real seeded DEMO Partner Field Collector account. Media upload's
object-storage round trip is unverified pending Cloudflare R2 credentials
(same open item as Stripe for Slices 3/4).

### Slice 6 — Sensory (implemented, DECISIONS.md ADR-030)
Sensory Session, Blind Sample, Evaluator, Assessment, Panel Results — starting
with one configured Evaluation Protocol (coffee cupping) rather than all
domains at once, to prove the configurable-protocol model (`DOMAIN_MODEL.md`
"Sensory Evaluation") before generalizing to honey/beer/wine. RBAC.md §7's
blind-mapping restriction implemented as a genuinely separate, permission-gated
table and verified live: a DEMO Sensory Judge sees only blind codes, never real
sample identity. Assessments are immutable once submitted (create-only, no
update path) — corrections are a documented future workflow, not built.

**Beverage Sensory Protocols & Panel Calibration (implemented, DECISIONS.md
ADR-035)** — extends Slice 6 with real, honestly-attributed protocol content
for coffee (CVA-adapted descriptive/affective split), beer and mead
(BJCP-adapted), and honey (ISO/academic-grounded), plus placeholder `planned`
rows for the nine remaining categories (`BEVERAGE_SENSORY_PROTOCOLS.md` §4).
Also implements the Reference Standards & Panel Calibration system (§7):
`ReferenceStandard`, `CalibrationSession`/`CalibrationResult`, and
`EvaluatorSensitivityProfile`, gated by the existing `sensory:manage_session`
permission. No `ReferenceStandard` rows carry invented compound/threshold
data — CLAUDE.md §54.

### Slice 7 — AI (implemented, DECISIONS.md ADR-033)
Permission-aware assistant (`AI_GOVERNANCE.md`), data-completeness suggestions.
Deliberately last: it needs Slices 1–6's governed data model to exist and be
populated before an AI feature reading that data means anything, and it needs
the RBAC-scoped retrieval path (`AI_GOVERNANCE.md` §5) to have real permission
boundaries to respect. The write-restriction control is a real, separately-
privileged Postgres role (`ai_service`), verified directly against Neon to
enforce insert-only access to `ai.recommendation` and nothing else — not just
an application-layer convention. No real LLM provider is wired up (no API
key); the shipped generator is an honest, working rule-based one, swappable
later without touching the suggestion lifecycle around it.

## 3. Explicitly deferred past this roadmap

- **Research OS full build-out and CryoBloom data migration** — the domain model
  is specified now (`DOMAIN_MODEL.md`) so it doesn't require redesign later, but
  CLAUDE.md §53 itself says not to implement advanced CryoBloom science in the
  first public MVP if doing so blocks foundational architecture. Migration via
  the Airtable adapter (`INTEGRATIONS.md` §4) is a project that starts after
  Slice 6, once Sensory's protocol model is proven and Research OS can reuse it.
- ~~**Competitions**~~ — **implemented, DECISIONS.md ADR-034.** Reuses
  Sensory's judging engine directly (`DOMAIN_MODEL.md`) rather than
  duplicating it — no new judging UI, `CompetitionCategory` links to an
  existing `SensorySession`. Not built: competitor-facing entry
  registration, public results browsing.
- ~~**Apiary/Honey**~~ — **implemented, tickets A1-A8 + A5.5** (corrected
  here, 17_ audit C1 §4 — this line went stale the same way the Competitions
  line above once did, and for the same reason: a later ticket set shipped
  without this deferral list getting a follow-up edit). Hive/Colony/
  Inspection/ColonyEvent/ApiaryHarvestEvent, a honey `Lot` reusing the
  coffee traceability chain with zero new code (`22_APIARY_V1_SCOPING_
  REPORT.md` §2), offline capture (see below), and a DEMO seed chain are
  all live. **Fermentation, additional agricultural domains beyond coffee
  and honey** — still deferred; `FermentationRun`/`FermentationIntervention`
  exist only as generic coffee-processing infrastructure (T6), not the
  broader multi-beverage fermentation model `DOMAIN_MODEL.md` §4 describes.
- **Offline/field capability** (CLAUDE.md §40) — **partially implemented**,
  corrected here (C1 §4): this line originally described offline support as
  just "a data-shape consideration," but A5/A5.5 built real infrastructure
  for the Apiary module specifically — an IndexedDB draft queue with
  idempotent `clientDraftId` sync (A5) and a registered service worker
  caching the app shell for cold-start availability with zero connectivity
  (A5.5, ADR-046). Full offline operation across every module (the general,
  cross-cutting architecture `OFFLINE_FIELD_CAPABILITY.md` describes) is
  still not built — only Apiary's Inspection/ColonyEvent forms have it.
- **Internationalization content pipeline** — Spanish/English are the stated
  priority (CLAUDE.md §41); the schema separates canonical data from localized
  display content from Slice 1 onward (a `locale` dimension on content tables),
  but a full translation workflow/UI is not built until content volume justifies
  it.

## 4. Team/ops context shaping this roadmap

Solo-maintained (Daniel), Nathy Rubio on ops/content, not development
(`PLATFORM_OVERVIEW.md` §9). Each slice above is scoped to be shippable and
reviewable in a single extended work session or a small handful of sessions —
consistent with `README_SETUP.md`'s own expectation that this spans many
sessions across weeks, not one sitting. `DECISIONS.md` is the running log that
keeps a solo maintainer (or a future Claude Code session with no memory of this
one) from re-deriving decisions already made.

## 5. What happens after this document is approved

Per `00_FIRST_SESSION_PROMPT.md`, architecture approval is required before
touching schema/migrations, the application shell, or Slice 1 implementation.
The follow-up prompt for that next session is: create the Prisma schema for
Slice 1's tables (`core.person`, `core.user_account`, `core.role_profile`,
`core.permission`, `core.role_profile_permission`, `core.scope`,
`core.assignment`, `core.audit_event`), the Next.js application shell, and
Slice 1 itself.
