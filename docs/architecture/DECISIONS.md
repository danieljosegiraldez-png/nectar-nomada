# Decisions — Néctar Nómada Digital Platform

Architecture Decision Records. This is the source of truth for "why" — update it
every session a real decision is made, per CLAUDE.md §61(D). No stack preference
was given (`00_FIRST_SESSION_PROMPT.md`), so ADR-001 through ADR-011 are the
full stack proposal, each justified against the constraints already fixed in
CLAUDE.md rather than picked silently.

Format: Context → Decision → Alternatives considered → Consequences.

---

## ADR-001 — Relational core on PostgreSQL + PostGIS

**Context:** CLAUDE.md §36 recommends Postgres and forbids Airtable as the final
transactional backend. The data model (`DOMAIN_MODEL.md`) is relational and
provenance-heavy — foreign keys, not embedded documents, are how traceability
chains (Harvest → Lot → ... → Product) stay queryable and consistent.

**Decision:** PostgreSQL as the single canonical transactional datastore, with
the PostGIS extension for geospatial queries (Map & Territory module, Location
hierarchy with lat/lng/altitude).

**Alternatives considered:** A document database (MongoDB) was rejected —
provenance/traceability chains and RBAC's scope-containment queries are
fundamentally relational joins; a document model would push referential
integrity into application code exactly where CLAUDE.md §35/§36 want it
enforced structurally. A dedicated graph database was rejected despite the
"relational knowledge graph" framing in the spec — the actual query patterns
(scoped permission checks, traceability joins, time-range environmental
queries) are well-served by Postgres with proper indexing, and a graph database
would be a second datastore to operate for a solo maintainer without a
corresponding capability that Postgres can't provide here.

**Consequences:** One database to operate, back up, and reason about
transactionally. PostGIS is mature and well-supported by every major managed
Postgres provider under consideration (ADR-007).

---

## ADR-002 — Environmental time-series: native partitioning, not a separate database

**Context:** CLAUDE.md §7/§38 require time-series data to scale to millions of
observations "without degrading the transactional database," which could be read
as requiring a separate time-series store (InfluxDB, TimescaleDB as a distinct
service).

**Decision:** Keep environmental (and later fermentation) time-series data in
the same Postgres database, in declaratively range-partitioned tables (monthly
partitions, BRIN indexing) — see `DATA_ARCHITECTURE.md` §6.

**Alternatives considered:** A dedicated time-series database was rejected for
v1 — it's a second system to operate, back up, and secure, which cuts against
the "low ops complexity, solo-maintained" context and CLAUDE.md §59's "do not
prematurely create microservices/infrastructure." The realistic v1 data volume
(a handful of weather stations and field sensors, not an industrial IoT fleet)
does not yet exceed what partitioned Postgres handles well. The TimescaleDB
*extension* (as opposed to a separate database) was seriously considered and is
the documented upgrade path — it's Postgres-API-compatible, so adopting it later
is a migration, not a rewrite, but it constrains hosting choice (not every
managed Postgres provider supports installing it), so it's deferred until
volume or query-latency evidence justifies giving up hosting flexibility for it.

**Consequences:** Millions of rows are handled via partition pruning and BRIN
indexes without a second service. Revisit trigger: if a single partition's query
latency degrades past an acceptable threshold in production, or ingest volume
materially exceeds field-sensor scale (e.g., a move to dense industrial
logging), re-evaluate Timescale or a dedicated store as a new ADR — not a
silent scope change.

---

## ADR-003 — Object storage: S3-compatible (Cloudflare R2)

**Context:** CLAUDE.md §37/§49 forbid large media in the SQL database.

**Decision:** Cloudflare R2 for all Asset originals and derivatives.

**Alternatives considered:** AWS S3 was the default assumption but R2 was
chosen for zero egress fees (relevant for a media-heavy storytelling/Discover
module serving photos/video to public visitors) while remaining fully
S3-API-compatible, so the adapter (`INTEGRATIONS.md` §3) and any future move to
S3 or another S3-compatible vendor requires no interface change.

**Consequences:** Lower, more predictable bandwidth cost at public-traffic
scale; no vendor lock-in at the interface level.

---

## ADR-004 — Application framework: Next.js (App Router) + TypeScript, single deployable

**Context:** CLAUDE.md §42 suggests Next.js/React/TypeScript for frontend and a
TypeScript backend, and §59 says start modular monolith, not microservices.

**Decision:** One Next.js application serving both the role-aware UI (public,
customer, partner, researcher, admin surfaces) and the API layer (Route
Handlers / Server Actions), deployed as a single unit.

**Alternatives considered:** A separate frontend (React SPA) plus a separate
backend API service (NestJS/Express) was rejected — for a solo maintainer, two
deployables means two build pipelines, two places for the authorization logic to
potentially drift, and no current requirement (native mobile app, third-party
API consumer) that needs the decoupling. `PLATFORM_OVERVIEW.md` §5's module
boundary discipline (internal APIs between modules within the one deployable) is
the mechanism that keeps this option open later without paying for it now.

**Consequences:** One build, one deploy, one runtime to monitor. Server
Components/Server Actions reduce the amount of hand-written API-boundary
plumbing, which matters for solo-maintained velocity.

---

## ADR-005 — ORM: Prisma

**Context:** CLAUDE.md §42 suggests "Prisma or equivalent mature typed ORM."

**Decision:** Prisma.

**Alternatives considered:** Drizzle was considered (lighter, closer to raw
SQL) but Prisma's migration tooling (`prisma migrate`) and schema-as-source-of-
truth model fit `DATA_ARCHITECTURE.md` §9's migration discipline requirement
more directly, and its maturity/ecosystem support reduces solo-maintainer risk.
Raw SQL/query-builder-only was rejected — type safety across ~40+ tables spanning
many modules is worth the ORM layer.

**Consequences:** Schema changes flow through versioned migration files
reviewed like code. Some escape hatches (raw SQL) will be needed for the
partitioned time-series tables (ADR-002), since Prisma's partition support is
limited — documented as implementation detail for Slice-level work, not an
architecture blocker.

---

## ADR-006 — Authentication: Auth.js, self-hosted, custom RBAC (not vendor RBAC)

**Context:** CLAUDE.md §42 allows "secure modern authentication provider or
self-hosted auth architecture with RBAC support." The RBAC model required
(`RBAC.md`) — non-broadening scoped Assignments across arbitrary scope types —
does not map onto the simpler organization/team-role models most hosted auth
providers (Clerk, Supabase Auth, WorkOS) ship out of the box.

**Decision:** Auth.js (NextAuth) for authentication mechanics (credentials +
OAuth, session management) with RBAC entirely custom-built in the platform's own
schema (`RBAC.md` §2), not delegated to the auth provider's role/org features.

**Alternatives considered:** A hosted auth+RBAC platform (Clerk) was rejected
specifically because its RBAC primitives don't express the scope-containment
model this platform requires (`RBAC.md` §3) — forcing the fit would mean fighting
the vendor's model or building a shadow RBAC system anyway, at which point the
vendor's RBAC feature adds cost without adding capability. Auth.js is used only
for what it's genuinely good at: credential/OAuth/session mechanics.

**Consequences:** More auth-mechanics code to own than a fully hosted solution,
but the RBAC model that CLAUDE.md §10 specifies is implementable exactly as
designed rather than approximated.

---

## ADR-007 — Hosting: Vercel + Neon (Postgres) + Cloudflare R2

**Context:** Solo-maintained, low ops-complexity tolerance
(`PLATFORM_OVERVIEW.md` §9).

**Decision:** Vercel for the Next.js app, Neon for managed Postgres (serverless-
friendly, branching for preview environments, straightforward backups), R2 for
object storage (ADR-003).

**Alternatives considered:** Self-hosted (a VPS running everything) was
rejected — it directly conflicts with the stated low-ops-complexity preference;
every additional piece of self-managed infrastructure (OS patching, Postgres
backups, TLS renewal) is maintenance burden with no corresponding capability
this project currently needs. Supabase was a close alternative to Neon (and
bundles auth/storage) but was not chosen because its bundled auth/RBAC has the
same mismatch problem as ADR-006, and taking Supabase only for its Postgres
hosting doesn't add value over Neon.

**Consequences:** Predictable, low-maintenance hosting bill scaling with usage;
preview-branch databases make the "review before merging" workflow
straightforward even solo.

---

## ADR-008 — Payments: Stripe

**Context:** CLAUDE.md §42 suggests "Stripe-compatible architecture where
available."

**Decision:** Stripe directly, behind the `PaymentsProvider` adapter
(`INTEGRATIONS.md` §6).

**Alternatives considered:** None seriously — Stripe is the default for a
platform needing both one-off commerce charges and booking/reservation payments,
and the adapter boundary keeps the option to add a second provider (e.g. for a
region Stripe doesn't serve well) open later.

**Consequences:** No PCI-scoped card data touches the platform's own database
(`SECURITY.md` §6).

---

## ADR-009 — Maps: Mapbox

**Context:** CLAUDE.md §42 suggests "Mapbox or equivalent."

**Decision:** Mapbox, behind the `MapsProvider` adapter.

**Alternatives considered:** Google Maps was considered but Mapbox's custom
styling fits the non-generic public design direction (`PLATFORM_OVERVIEW.md`
§48/§9) better, and its pricing model is more predictable at the traffic levels
expected.

**Consequences:** Custom map styling is available from v1's Map & Territory
work without a later re-platforming.

---

## ADR-010 — Search: Postgres full-text search for v1

**Context:** CLAUDE.md §42 explicitly allows this: "PostgreSQL search initially,
with migration path to specialized search when scale requires it."

**Decision:** `tsvector`/GIN-indexed full-text search within the existing
database for v1 (`DATA_ARCHITECTURE.md` §8).

**Alternatives considered:** Standing up Elasticsearch/Algolia/Typesense from
day one was rejected as premature infrastructure for a global search feature
whose real query patterns aren't known yet.

**Consequences:** One fewer system to run. **Revisit trigger, stated explicitly
so this isn't an open-ended deferral:** result relevance quality degrading
noticeably, or query volume/latency crossing a threshold that Postgres FTS can't
serve acceptably — either becomes a new ADR when it happens.

---

## ADR-011 — AI: provider-agnostic adapter, default Anthropic Claude

**Context:** CLAUDE.md §31/§42 require an AI service layer not tightly coupled
to one vendor.

**Decision:** `AIProvider` interface (`INTEGRATIONS.md` §7) with Anthropic
Claude as the default configured provider; governance controls
(`AI_GOVERNANCE.md`) live in the calling service layer above the adapter, so
they hold regardless of provider.

**Alternatives considered:** Building directly against one vendor's SDK
throughout the application was rejected per CLAUDE.md §31's explicit
instruction.

**Consequences:** Provider swap is a config + adapter-file change; governance
guarantees don't need re-verification per provider.

---

## ADR-012 — MVP sequencing: Identity (Slice 1) before Public Discovery

**Context:** CLAUDE.md §53 lists Public Discovery as Vertical Slice A and
Identity as Slice B.

**Decision:** Build Identity/RBAC first (`MVP_ROADMAP.md` §1–2), Public
Discovery second.

**Alternatives considered:** Following the spec's listed order was the default,
but rejected — Discovery's own classification filtering and every later slice's
permission gating depend on RBAC existing first; building Discovery without it
would mean either shipping without enforcement or reworking it once Identity
lands, which conflicts with CLAUDE.md §50's own "work iteratively, avoid
throwaway work" methodology.

**Consequences:** Slice 1 produces no public-facing feature by itself (no visible
"progress" to a non-technical stakeholder), which is worth naming so it isn't
mistaken for slow progress — it's the foundation every visible slice after it
depends on.

---

## ADR-013 — Modular monolith confirmed, no microservices for v1

**Context:** CLAUDE.md §59 defaults to modular monolith "unless the repository
constraints strongly justify otherwise." Nothing in this repository (empty at
architecture time) justifies otherwise.

**Decision:** Confirmed — see `PLATFORM_OVERVIEW.md` §5 for the module-boundary
discipline that keeps future extraction possible.

**Consequences:** None beyond what's already stated in §5 — recorded here
because it's a decision point CLAUDE.md explicitly asks to be evaluated, not
assumed.

---

## ADR-014 — RBAC: Assignment/Scope/Role Profile/Permission chain, non-broadening scopes

**Context:** CLAUDE.md §10 requires this chain rather than a flat role field,
and requires contextual assignments to narrow, not broaden.

**Decision:** Implemented exactly as `RBAC.md` specifies — scope containment
flows only downward from `platform`/`program`, never upward from a narrower
scope.

**Alternatives considered:** A simpler "org-level role + project-level
override" model (common in SaaS products) was rejected — it doesn't cleanly
express leaf scopes (Competition, Session, Experience) that aren't nested under
Project/Program, and CLAUDE.md's explicit worked example (Person X as Producer/
Research Contributor/Judge simultaneously) needs independent, non-interacting
scoped grants, not an override hierarchy.

**Consequences:** More upfront modeling complexity than a simpler role system,
justified by this being explicitly the platform's most safety-critical
subsystem (confidential research, blind judging, sensitive customer data all
depend on it holding).

---

## Open assumptions carried forward (not yet resolved, flagged per CLAUDE.md §61(D))

- **Concrete weather API and transactional email vendor** — deferred to
  Environmental Data / Slice-level implementation time (`INTEGRATIONS.md` §2,
  §5); doesn't affect architecture.
- **Whether Program is a mandatory or optional parent of Project** — modeled as
  optional (`DOMAIN_MODEL.md` §3); revisit if a real Program/Project hierarchy
  emerges in practice that the current model doesn't fit.
- **Exact Role Profile list beyond the v1 seed set** (`RBAC.md` §5) — intentionally
  left as editable data, not a closed architectural decision.
- **TimescaleDB adoption trigger** — threshold not numerically fixed (ADR-002);
  will be a data-driven call once real ingest volume exists.
- **Airtable migration timing and field mapping specifics** — deferred past
  Slice 6 (`MVP_ROADMAP.md` §3); needs the actual CryoBloom Airtable schema in
  hand to spec precisely, which wasn't supplied as part of this architecture
  pass.

No business facts (prices, real production figures, addresses, GPS, sensory
outcomes, certifications, real dates) were invented anywhere in this document
set, per CLAUDE.md §61(E)/§54 — all examples referencing Finca Rosina, Las
Nubes, CryoBloom, Kiva Estate are the same illustrative project names already
present in CLAUDE.md itself, used structurally, not as asserted facts.

---

## ADR-015 — Local dev database: Prisma's local Postgres (`prisma dev`), not Docker

**Context:** Implementing Slice 1 required an actual Postgres instance to run
migrations and verify the RBAC engine against real data, not just schema
validation. The development machine had no Docker, Homebrew, or existing
Postgres install.

**Decision:** Use `prisma dev` (Prisma 7's bundled local Postgres-compatible
database, part of the toolchain already required by ADR-005) for local
development. Documented in `SETUP.md`.

**Alternatives considered:** Installing Docker was rejected as unnecessary
weight for a solo-maintained project when Prisma's own tooling already
provides a zero-config local database with the exact migration workflow
(`prisma migrate dev`) the project uses. Production remains Neon (ADR-007)
unchanged — this is purely a local-dev convenience, not a hosting decision
reversal; the `pg` driver adapter (ADR resolved in the driver-adapters
research during implementation) speaks standard Postgres wire protocol
against both.

**Consequences:** `SETUP.md` documents `npx prisma dev` as a required local
step. No production impact.

## ADR-016 — Prisma Client via `@prisma/adapter-pg`, one adapter for both local and Neon

**Context:** Prisma 7 requires an explicit driver adapter for SQL databases
(no more bundled native engine binary in the client itself). Prisma publishes
a Neon-specific adapter (`@prisma/adapter-neon`, HTTP-fetch-based, optimized
for edge runtimes) alongside the generic `@prisma/adapter-pg` (standard `pg`
driver, TCP).

**Decision:** Use `@prisma/adapter-pg` uniformly, in both local dev and
production against Neon.

**Alternatives considered:** `@prisma/adapter-neon` was considered for
production specifically, but rejected for v1 — it exists primarily for
edge/serverless runtimes making stateless HTTP calls, and this application
runs entirely in the Node.js runtime (required anyway for `argon2` password
hashing, SECURITY.md §1), where a standard pooled TCP connection via `pg`
works against Neon without issue. Using one adapter everywhere avoids an
environment-conditional code path in `lib/db.ts` for no current benefit;
revisit only if a future route genuinely needs edge deployment.

**Consequences:** `lib/db.ts` has no environment branching. If an edge-runtime
route is ever needed, that specific route (not the whole app) would switch to
`@prisma/adapter-neon`.

---

## ADR-017 — External Data Architecture: approved decisions

**Context:** `EXTERNAL_DATA_ARCHITECTURE.md` §30 listed eight open decisions
after reviewing the `NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md` candidate
catalog. All eight are approved as recommended, resolved below.

**Decisions (approved):**

1. Weather-shaped external data (Open-Meteo, NASA POWER) writes into the
   existing `environmental.observation` table rather than a new table —
   approved. `external.*` (new schema) is for everything that doesn't fit
   that shape (biodiversity, soil, satellite, market, reference).
2. `external_source_class` is a new axis alongside `provenance_class`, not
   folded into one enum — approved.
3. P0 scope is **Open-Meteo, NASA POWER, OpenTopography** — approved,
   narrower than the source catalog's own 12-item P0 list. GBIF, Panama
   IPDE/CKAN, Copernicus/Sentinel, SoilGrids, Crossref, ROR, Catalogue of
   Life move to P1, sequenced with the modules that actually consume them
   (Map & Territory, Research OS).
4. Panama-government sources (IMHPA, INEC, ACP, MiAmbiente/SINIA, MIDA/
   OSIGA) remain scheduled-import-only, not prioritized ahead of readiness
   despite general Panama-first intent — approved. Revisit if a specific
   consuming feature needs one of them sooner.
5. No commercial/paid external-data provider (Visual Crossing, Tomorrow.io,
   Google Places/Air Quality, ICE feeds, stock-imagery APIs) until a funded,
   specific use case exists — approved as the standing default.
6. PostGIS is adopted when the `Location` table is built (MVP Slice 2), not
   enabled preemptively — approved.
7. Forecast data is not persisted by default (fetched on demand, short
   cache) — approved. A future research need to archive forecasts-as-issued
   would be a separate, explicitly-scoped decision.
8. Legal/licensing review is required before any use of Protected Planet,
   ORCID, eBird, any Google API, stock-imagery providers, or ICE feeds —
   approved as a hard gate; owner of that review is Daniel until a
   Content/Ops Coordinator collaborator (`RBAC.md` §5) is onboarded.

**Consequences:** `EXTERNAL_DATA_ARCHITECTURE.md`'s architecture is approved
as written. No external-data code, adapters, or migrations are implemented
yet — implementation is sequenced with `MVP_ROADMAP.md` Slice 2 (Location)
and later, not started by this approval alone.

---

## ADR-018 — Adaptive Intelligence & Experience Architecture: approved decisions

**Context:** `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` §Q listed seven
open decisions after reviewing the content/experience/AI architecture input
document. All seven are approved as recommended, resolved below.

**Decisions (approved):**

1. Story/Media ("Foundational" phase per that review's §N) is folded into
   `MVP_ROADMAP.md` Slice 2 (Public Discovery) rather than a new separate
   slice — approved. Slice 2 already scoped "Story" in `MVP_ROADMAP.md` §2;
   this formalizes that it carries real content-model weight, not just a
   placeholder read path.
2. All content/creative/operator/research/sensory suggestion flows reuse
   the existing `ai.recommendation` table (extending its `suggestion_type`
   taxonomy) — approved. No parallel `AISuggestion`/`AIEnrichmentResult`
   table is built.
3. `StoryBlock` is adopted as the composition primitive now; a separate
   `ExperienceComposition`/Experience Engine layer is deferred until a
   genuinely block-incompatible experience type (e.g. real-time multi-
   participant state) is actually scoped — approved.
4. No media vendor (Cloudinary, Mux, etc.) is committed to in the
   Foundational or MVP phase — start with object storage (R2, ADR-003) +
   Next.js Image transforms; approved. Revisit per `ADAPTIVE_INTELLIGENCE_
   EXPERIENCE_REVIEW.md` §I once volume/need justifies a dedicated media
   platform.
5. First vertical slice once Foundational work lands: **interactive place/
   project story** — approved, ahead of CryoBloom/Follow-the-Sample, guided
   sensory session, and the field-capture companion, per that review's §O
   dependency analysis.
6. `CustomerProfile`, `DeclaredPreference`, and `InteractionEvent` are added
   to `DOMAIN_MODEL.md` — approved as a documented gap-fix, tracked together
   with the Foundational-phase work rather than as a separate initiative.
7. Rights/Consent ships in two tiers: minimal fields on `MediaAsset` in the
   Foundational phase, full `RightsGrant`/`ReleaseDocument`/`License`
   entities deferred to NEXT — approved.

**Consequences:** `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md`'s
recommendations are approved as written. As with ADR-017, this approves
*architecture and sequencing*, not an immediate implementation start —
Foundational-phase work (Location/Project/Organization/Sample schema, basic
Story/MediaAsset) begins when Slice 2 itself is kicked off, which has not
yet been requested as of this ADR.
