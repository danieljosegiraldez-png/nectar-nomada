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

### Slice 2 — Public Discovery (read-only)
Location, Project, Story, Product, Experience — read paths only, no
booking/purchase yet. Built against the real authorization service from Slice 1,
so classification filtering (`SECURITY.md` §4) is exercised from day one, not
bolted on. This is where the "same location page dynamically exposes connected
information" behavior (CLAUDE.md §6) first appears, scoped to whatever entities
exist by this point (Location, Project, Story, Product stubs).

### Slice 3 — Commerce
Product/Variant/SKU, Cart, Order, Stripe integration (`INTEGRATIONS.md` §6).
Extends Discovery's read-only Product pages into purchasable ones. My Néctar
gains Orders.

### Slice 4 — Experiences & Reservations
Experience, ExperienceSession, Booking, Participant. My Néctar gains Bookings.
Distinct booking engine per CLAUDE.md §12, not a Commerce SKU hack — validates
that the Experience/Booking model built in `DOMAIN_MODEL.md` actually holds up
against a real capacity/scheduling UI.

### Slice 5 — Partner Workspace
Project Assignment (exercising `RBAC.md`'s scope=project path in production for
the first time with a real non-admin user type), Task, data submission forms,
media upload (`DATA_ARCHITECTURE.md` §5). First slice where the classification
axis meaningfully restricts a non-admin, non-researcher user's view.

### Slice 6 — Sensory
Sensory Session, Blind Sample, Evaluator, Assessment, Panel Results — starting
with one configured Evaluation Protocol (likely coffee cupping, given the
existing CryoBloom/coffee context) rather than all domains at once, to prove the
configurable-protocol model (`DOMAIN_MODEL.md` "Sensory Evaluation") before
generalizing to honey/beer/wine.

### Slice 7 — AI
Permission-aware assistant (`AI_GOVERNANCE.md`), data-completeness suggestions.
Deliberately last: it needs Slices 1–6's governed data model to exist and be
populated before an AI feature reading that data means anything, and it needs
the RBAC-scoped retrieval path (`AI_GOVERNANCE.md` §5) to have real permission
boundaries to respect.

## 3. Explicitly deferred past this roadmap

- **Research OS full build-out and CryoBloom data migration** — the domain model
  is specified now (`DOMAIN_MODEL.md`) so it doesn't require redesign later, but
  CLAUDE.md §53 itself says not to implement advanced CryoBloom science in the
  first public MVP if doing so blocks foundational architecture. Migration via
  the Airtable adapter (`INTEGRATIONS.md` §4) is a project that starts after
  Slice 6, once Sensory's protocol model is proven and Research OS can reuse it.
- **Competitions** — reuses Sensory's Assessment engine (`DOMAIN_MODEL.md`), so
  it is sequenced after Slice 6, not part of this roadmap's numbered slices.
- **Apiary/Honey, Fermentation, additional agricultural domains beyond coffee** —
  modeled to not require redesign (`DOMAIN_MODEL.md` §7) but not built until a
  concrete project needs them.
- **Offline/field capability** (CLAUDE.md §40) — architected for (local draft +
  sync is a data-shape consideration touched on in Partner Workspace forms) but
  full offline operation is not a Slice 5 deliverable.
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
