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

---

## ADR-019 — Media Intelligence Pipeline: accepted as planning input, deferred

**Context:** `MEDIA_INTELLIGENCE_PIPELINE.md` (committed separately) extends
the Asset model, object storage conventions, and the AI Suggestion lifecycle
to cover non-destructive ingestion of existing brand/expedition media from
Google Drive (Phase A), AI-assisted content generation from that material
(Phase B), and optional custom-model fine-tuning (Phase C). Per the
document's own §6 and the instruction it was filed under, this has zero
current urgency — Phase A is eligible to start no earlier than Slice 2
(when `core.asset` exists), and Phase B belongs with Slice 7 (AI).

**Decision:** Accepted as planning input now; implementation deferred to
Slice 2 (Phase A) and Slice 7+ (Phase B/C) respectively — same pattern as
`EXTERNAL_DATA_ARCHITECTURE.md`/`ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md`:
logged and cross-checked now so it isn't re-derived with less context later,
not an immediate build order.

**Conflicts/gaps found on cross-check against `DOMAIN_MODEL.md` and
`AI_GOVERNANCE.md`** (flagged per instruction, not silently reconciled):

1. **`core.asset` doesn't yet have provenance columns.**
   `MEDIA_INTELLIGENCE_PIPELINE.md` §2 assumes an Asset row can carry
   `source_reference` (the Drive file ID/folder path) and, per §3, a
   `provenance_class` value (`ai_suggestion` for AI-touched derivatives).
   `DATA_ARCHITECTURE.md` §5's Asset field list has neither column —
   §4's provenance-column requirement was written for "fact tables"
   (research/sensory/environmental) and didn't explicitly name `core.asset`
   as one of them, even though a photo is clearly evidence in the same
   sense. **Resolution:** when `core.asset` is actually created (Slice 2),
   add `provenance_class` and `source_reference` to it, extending
   `DATA_ARCHITECTURE.md` §4's scope to explicitly include Asset. Not fixed
   now since the table doesn't exist yet — noted here so it isn't
   rediscovered as a surprise during Slice 2 schema work.
2. **`INTEGRATIONS.md` §11's Google Drive adapter is scoped too narrowly.**
   It currently names the interface `DocumentSourceProvider` and frames
   Drive as a one-time migration source for documents/protocols.
   `MEDIA_INTELLIGENCE_PIPELINE.md` needs an ongoing, broader capability —
   listing/fetching binary media (photos/video) from designated folders,
   repeatable, not a one-off migration. **Resolution:** generalize or add a
   sibling interface (e.g. `GoogleDriveProvider` covering both documents and
   media) when Phase A is actually implemented — not resolved now since it's
   a one-line `INTEGRATIONS.md` edit best made alongside real code, not
   speculatively.
3. **`imported_unreviewed` is not in the existing status vocabulary.**
   `DATA_ARCHITECTURE.md` §7's generic lifecycle enum is `draft |
   incomplete | pending_review | verified | approved | archived | rejected`.
   `MEDIA_INTELLIGENCE_PIPELINE.md` §2/§5a use `imported_unreviewed` and
   `verified` — `verified` already exists in the enum; `imported_unreviewed`
   does not. **Resolution:** at Slice 2 schema time, either map newly
   ingested Assets to the existing `pending_review` value or add
   `imported_unreviewed` as an explicit enum member if the distinction from
   ordinary `pending_review` proves useful in practice — a judgment call to
   make with real ingestion data in hand, not now.

No conflict was found in §3 (AI-assisted generation) against
`AI_GOVERNANCE.md` §2/§3/§4/§6 — the suggestion-only write path, the
prohibition on claiming generated imagery is original photography, and the
provenance-retention rule all apply directly with no adjustment needed.

**Consequences:** No schema, code, or credentials changed by this ADR. The
three gaps above are carried forward as concrete Slice 2 implementation
notes rather than left implicit in a document that won't be re-read until
Slice 7.

---

## ADR-020 — Commerce, Operations & Professional Tools Architecture: approved decisions

**Context:** `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §AA listed eight
open decisions after reviewing the commerce/operations/professional-tools
input document. All eight are approved as recommended, resolved below.

**Decisions (approved):**

1. Add `organization` as a new `RBAC` `ScopeType`, with the same
   downward-only containment rule already used for `program → project`
   (`RBAC.md` §3) — approved. Scheduled as a `RBAC.md` amendment alongside
   Client Portal work, not implemented now.
2. `Offering` is built as a thin catalog/discovery layer (title, summary,
   status, price summary, a pointer to the real detail entity) — approved,
   explicitly rejecting a deeper shared commercial-workflow abstraction.
   `Product`, `Experience`, and the new `Service`/`ConsultingEngagement`
   chain keep their own distinct workflows.
3. Research OS's `Protocol`/`ProtocolVersion` is reused for operational
   (non-research) processing protocols too, rather than a separate
   operational-protocol entity — approved. One versioning mechanism, one
   immutability rule, applied to both contexts.
4. Consulting is modeled as a `Project` carrying a `domain_tag =
   'consulting'` (reusing `ProjectDomainTag`), with a new pre-Project
   pipeline (`ServiceInquiry → Proposal`) only for the lead/discovery/scope
   stages that occur before a Project exists — approved. No separate
   consulting-project system.
5. First vertical slice once Foundational work lands: **coffee lot
   genealogy + processing workbench** — approved, ahead of fermentation
   logging, coffee cupping/Sensory OS, consulting project → report, and
   commerce → operational project, per that review's §Y dependency
   analysis. This is the same Foundational-phase priority as ADR-017/018's
   shared prerequisite (Location/Organization/Project/Sample), extended
   with `Lot`/`LotTransformation`/`QuantityEvent` as the first
   domain-specific build on top of it.
6. Operational inventory (`traceability.inventory_item`/
   `inventory_movement`, tied to `Lot`) stays structurally separate from
   Commerce SKU inventory (`ProductVariant`'s existing `SKU/Inventory`),
   connected only by a `source_lot_id` lineage FK — approved. Never the
   same table with two meanings.
7. Professional SaaS / multi-tenancy: design-now, build-later — approved
   as the standing posture. No billing/subscription complexity,
   white-labeling, or self-service organization signup until product
   strategy specifically requires it (input document's own §34
   instruction).
8. The generalized `traceability.measurement` table uses specific nullable
   FKs per possible parent (`fermentation_run_id` / `drying_lot_id` /
   `storage_lot_id`), not a polymorphic `parent_type`/`parent_id` pair —
   approved, trading table width for real foreign-key referential
   integrity.

**Consequences:** `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`'s architecture
is approved as written. As with ADR-017/018/019, this approves architecture
and sequencing, not an implementation start — Foundational-phase work
(Location/Organization/Project/Sample, then Lot/LotTransformation/
QuantityEvent) begins when explicitly kicked off, which has not yet
happened as of this ADR. No checkout, payment, billing, or sensor
integration code is implied or authorized by this approval.

---

## ADR-021 — Foundational schema implemented; PostGIS deferred (tooling, not design)

**Context:** Implementing the Foundational schema (`Location`, `Organization`,
`Program`, `Project`, `DomainTag`, `Sample` — the shared prerequisite named
in ADR-017/018/019/020) surfaced one concrete blocker: ADR-017 item 6
approved enabling PostGIS "when the Location table is built," which is this
moment. Adding `extensions = [postgis]` and an `Unsupported("geography(Point,
4326)")` column on `Location` and attempting `prisma migrate dev` against
the local development database failed:

```
ERROR: extension "postgis" is not available
DETAIL: Could not open extension control file
"/pglite/share/postgresql/extension/postgis.control": No such file or directory.
```

Prisma's bundled local development database (`prisma dev`) runs on PGlite —
a WASM-embedded Postgres — which does not support installing arbitrary
extensions, unlike a real Postgres server (Neon, or any standard Postgres
install). This is a local-tooling limitation, not a reason to revisit the
PostGIS decision itself.

**Decision:** Ship the Foundational schema now with `Location.latitude`/
`longitude`/`altitudeMeters` only (plain columns, as already specified in
`DOMAIN_MODEL.md` §3). The PostGIS `geography(Point, 4326)` column is
deferred until the schema is next migrated against a real Postgres instance
(Neon, or a real local Postgres if one becomes available) — at that point it
is a small additive migration, not a redesign, since lat/lng remain the
canonical human-readable columns and the geography column was always meant
to be additive (`EXTERNAL_DATA_ARCHITECTURE.md` §9).

**Update, same day (ADR-022):** closed out. With Neon now the primary
database, migration `20260810010606_enable_postgis_location_geopoint` added
`CREATE EXTENSION IF NOT EXISTS postgis` and `Location.geoPoint`, deployed
and verified for real — `ST_MakePoint`/`ST_SetSRID`/`ST_Distance` round-
tripped correctly via `$executeRaw`/`$queryRaw` in a rolled-back transaction
against Neon. The deferral lasted one work session, exactly as predicted.

**A second, unrelated finding from the same implementation pass:** `prisma
migrate dev`'s automatic shadow-database provisioning also does not work
against this local PGlite instance — the first attempt failed with `type
"PersonStatus" already exists`, which turned out to mean the auto-created
shadow database silently fell back to the main development database itself.
Fixed by explicitly pointing `prisma.config.ts`'s `shadowDatabaseUrl` at the
separate shadow instance `prisma dev` already provisions (documented in
`.env`/`SETUP.md` as `SHADOW_DATABASE_URL`) — this is also a local-only
workaround; Neon/any real Postgres provisions its own shadow database
correctly without it.

**Consequences:** `Location`, `Organization`, `Program`, `DomainTag`,
`Project` (+ `ProjectDomainTagAssignment`), and `Sample` are live in the
database (migration `20260810002142_foundational_entities`), verified
end-to-end against the real local database: a 3-level Location hierarchy,
Organization↔Location, Program→Project, Organization→Project (both as
owning org and as consulting client per ADR-020 item 4), Project→primary
Location, the domain-tag many-to-many join, and Project→Sample all resolve
correctly. `RecordStatus` and `ClassificationLevel` (RBAC.md §6, the first
table to actually carry a classification column) are shared enums used
across all five new models. No service/UI layer was built for these tables
in this pass — none is needed yet, since no feature reads or writes them
until Slice 2.

---

## ADR-022 — Neon becomes the primary development database ahead of go-live

**Context:** Daniel is dedicating the next several days to finishing the
platform before going online and inviting other users/collaborators (Nathy
Rubio and possibly others). ADR-021 surfaced two friction points specific to
Prisma's local `prisma dev` database (PGlite): it can't auto-provision a
shadow database (worked around with an explicit `SHADOW_DATABASE_URL`), and
it can't load Postgres extensions at all (PostGIS deferred). Both are
tooling limitations of the local sandbox, not of the architecture — Neon
(already the approved production target, ADR-007) doesn't have either
problem.

**Decision:** Switch primary development to Neon now, rather than only at
deploy time. Local `prisma dev` remains available as an optional, disposable
sandbox for local experimentation, but is no longer the default —
`DATABASE_URL` in `.env` points at Neon from this point forward.

**Alternatives considered:** Continuing on local `prisma dev` until closer to
launch, moving to Neon only right before going live, was rejected
specifically because of the timeline given — a tight multi-day push toward
inviting real people is exactly the wrong time to discover a local/production
divergence (a migration that behaves differently, an extension that isn't
available, a shadow-database quirk) for the first time. Surfacing that risk
now, with days of runway left rather than hours, is the entire point of this
decision.

**Consequences:**
- `SHADOW_DATABASE_URL` and its local-only workaround (ADR-021) become
  unnecessary once `DATABASE_URL` points at Neon — `prisma migrate dev`
  provisions its own shadow database correctly against real Postgres. The
  env var and the `prisma.config.ts` wiring stay in place (harmless, and
  still needed if local `prisma dev` is used again later), but are no longer
  load-bearing for day-to-day work.
- PostGIS can be enabled for real once migrations run against Neon, closing
  out the ADR-021 deferral — `Location.geoPoint` becomes a small additive
  migration rather than a redesign.
- Neon project creation itself requires Daniel — account creation is outside
  what this session performs regardless of instruction, per this
  environment's standing account-creation restriction. Once a connection
  string exists, migration deploy, seeding, and verification proceed the
  same way they did against the local database.
- `SETUP.md` is updated to present Neon as the default local `.env` target,
  with `prisma dev` documented as an optional fallback rather than the
  primary path.

**Update, same day — migration deployed and verified:** `prisma migrate
deploy` applied both existing migrations to Neon cleanly on the first try
(no shadow-database step needed at all for `deploy`, unlike `dev`), the RBAC
catalog seeded successfully, and PostGIS was re-enabled per the note on
ADR-021. The full signup/login/My Néctar flow was re-verified through an
actual browser session against Neon, and Neon's cold-start behavior (a
`P2028` "unable to start a transaction in the given time" on the very first
query after the compute had been idle) was observed and resolved by simply
retrying — expected serverless behavior, not a bug, but worth knowing about
for anything time-sensitive (e.g. an OAuth callback) once this is deployed
somewhere real.

**Bug found and fixed during this verification, unrelated to Neon itself:**
`app/my-nectar/page.tsx` used `findUniqueOrThrow` to load the `UserAccount`
for the current session, which throws an unhandled 500 if a
validly-signed session references a `UserAccount` that no longer exists in
the database — encountered here because a browser tab held a session
cookie issued against the local database before `DATABASE_URL` switched to
Neon, but the same failure mode would occur in production if a session
ever outlived its account (e.g. deletion). Fixed to `findUnique` with a
graceful `redirect("/login")` on a miss, matching `SECURITY.md` §2's
"fail closed, never 500" posture for authorization-adjacent code paths.

---

## ADR-023 — UI chrome i18n: next-intl, cookie-based, no URL routing

**Context:** The nav showed "Mi Néctar" (hardcoded Spanish) while the My
Néctar page body showed "My Néctar" (hardcoded English) — no locale system
existed at all, just ad hoc strings in each language depending on which
file was written when. CLAUDE.md §41 requires Spanish and English as
first-class, with Spanish stated as the priority language.

**Decision:** `next-intl` (v4) for UI chrome strings (nav, buttons, headers,
form labels, error messages), with **cookie-based locale resolution and no
`/en`/`/es` URL prefix routing**.

**Alternatives considered:** next-intl's more commonly documented setup
uses a `[locale]` URL segment (`/en/discover`, `/es/discover`) via its own
middleware, giving per-locale static generation and SEO benefits. Rejected
for now — that structure earns its cost when there's per-locale *content* to
route to, and Story/Product/Experience text is explicitly not translated
yet (MVP_ROADMAP.md §3's own reasoning: translation workflow waits for
content volume). Adopting URL-prefix routing today would mean restructuring
every existing route under `app/[locale]/...`, rewriting every internal
link, and reworking `proxy.ts`'s matcher — real cost with no present
benefit while every page is UI-chrome-only in whichever language the viewer
picked. Revisit when Story content actually ships in two languages.

Hand-rolling a small custom translation helper (plain objects + a `t()`
function) was also considered, avoiding a new dependency — rejected because
the user's instruction explicitly named a standard library, and next-intl's
ICU message support (interpolation, pluralization) is worth having before
it's needed rather than retrofitted later.

**Locale resolution order** (`i18n/request.ts`): `NEXT_LOCALE` cookie → the
request's `Accept-Language` header (English if it clearly prefers English,
Spanish otherwise) → `defaultLocale` (Spanish). The cookie is set two ways:
explicitly by the nav's EN/ES switcher (`app/actions/locale.ts`), and
automatically at login from the account's persisted `Person.locale`
(`app/actions/auth.ts`) — DOMAIN_MODEL.md §1 already modeled this field; it
was simply never wired to anything until now. Locale is deliberately kept
out of the session JWT (no type-augmentation surface added to
`next-auth`'s `User`/`Session`/`JWT` for something this low-stakes) —
`Person.locale` is the durable source of truth, the cookie is the
immediate-effect mechanism, and the two are kept in sync at exactly two
moments (switcher click, login) rather than resolved from the database on
every request.

**Verified end-to-end** in a real browser session against Neon: switching
EN→ES instantly re-rendered the entire page (nav, hero, CTA) with no full
reload artifacts, and `Person.locale` was confirmed updated to `'es'` in
the database afterward — the persistence isn't just a cookie, it round-
tripped through Neon.

**Consequences:** Every hardcoded UI string in `app/layout.tsx`,
`app/page.tsx`, `app/login`, `app/signup`, `app/my-nectar`, and
`app/actions/auth.ts` now resolves through `messages/{es,en}.json` — the
original "Mi Néctar"/"My Néctar" inconsistency can't recur because both the
nav and the page body read the same locale-resolved `Nav.myNectar` /
`MyNectar.badge` keys, which are defined consistently with each other in
each locale file. Zod's own per-field validation messages
(`lib/validation/auth.ts`) are **not** individually translated — out of
scope for this pass; a validation failure now surfaces one generic
translated message instead of Zod's raw English text, noted inline in
`app/actions/auth.ts`. Content translation (Story/Product/Experience) is
explicitly not covered, unchanged from MVP_ROADMAP.md §3.

---

## ADR-024 — Slice 2 (Public Discovery) implemented: scope and seed-data decisions

**Context:** `MVP_ROADMAP.md` Slice 2 — Location, Project, Story, Product,
Experience, read-only, built against Slice 1's real authorization service.
This ADR records the implementation-level decisions made while building it,
consistent with the pattern set by ADR-021's Foundational-schema notes.

**Decisions:**

1. **`Story` ships as a single `bodyMarkdown` text column, not
   `StoryBlock`/`StoryVersion`/composition.** `ADAPTIVE_INTELLIGENCE_
   EXPERIENCE_REVIEW.md`'s own Foundational-phase recommendation was a
   *handful* of block types; this goes one step thinner — plain text,
   rendered with `white-space: pre-wrap`, no markdown parser dependency
   added. Justification: nothing yet needs more than a readable page, and
   the real replacement (block composition, reused for Reporting too per
   `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §N) is a deliberate future
   investment, not something to approximate twice.
2. **No `MediaAsset`/object-storage pipeline in this slice.** Discover pages
   are text/data-first — no hero images, no photography. Adding R2 upload
   flow and an `Asset` table was in scope for neither the user's Slice 2
   request nor `MVP_ROADMAP.md`'s own Slice 2 description. Revisit when
   real photography exists to publish — inventing placeholder "photos of
   Finca Rosina" would itself be a CLAUDE.md §54 violation (fabricated
   visual evidence of a real place).
3. **Public visibility requires both `classification: 'public'` AND
   `status: 'approved'`**, enforced as one hard-coded `PUBLIC_WHERE` object
   in `lib/discover/service.ts` — the single path every public route reads
   through, unconditionally, regardless of viewer identity (verified: an
   authenticated Platform Admin and a signed-out visitor see identical
   `/discover` content in this slice). Seeing more belongs to a future
   Platform Command Center surface, not a variant of this one.
4. **`Location`/`Project` slugs are nullable**; only records meant to have a
   public page get one. Country/province rows in the seeded hierarchy
   (Panamá, Chiriquí, Panamá province) stay `slug: null` and simply don't
   appear in Discover listings — structural hierarchy, not published
   content.
5. **DEMO seed data uses only Las Nubes, Finca Rosina, and Kiva Estate** —
   the CLAUDE.md §54-sanctioned names — deliberately **not** CryoBloom,
   despite it also being listed there. Reasoning: CryoBloom is a real,
   ongoing research program; even clearly-labeled placeholder copy about it
   risks being read as a claim about actual findings, which is a sharper
   version of exactly the fabrication risk CLAUDE.md §54 and the Research
   OS provenance model exist to prevent. The other three names carry no
   comparable research-integrity weight.
6. **No prices, GPS/coordinates, certifications, specific dates, or named
   people anywhere in seed data** — CLAUDE.md §54's explicit do-not-
   fabricate list. `Product`/`Experience.priceAmount` stays `null`
   throughout every seeded record; the UI renders "pricing coming soon"
   instead of a placeholder number. `Story.authorPersonId` is never set in
   seed data. Every seeded Organization/Project/Story/Product/Experience
   description is written to read honestly as placeholder copy (bracketed
   `[DEMO placeholder — ...]` notes) rather than invented specifics dressed
   up as real detail.
7. **The seed script is idempotent** (`prisma/seed.ts`'s new
   `seedDemoDiscoverContent`, gated behind `SEED_DEMO_CONTENT=true`,
   matching the existing `SEED_DEMO_ADMIN` convention) — upserts by slug
   where a unique slug exists, find-or-create by name otherwise. Verified
   by running it twice against Neon with no errors or duplicates.

**Verified end-to-end** in a real browser session against Neon: `/discover`
listing all five entity types; a Project detail page showing its domain
tags (Coffee/Apiary/Tourism/Research — the same combination CLAUDE.md §8
uses as its own worked example for Las Nubes), primary Location, and
related Story; the reverse direction confirmed on the Location detail page
(showing its Project, Story, and Products); and identical content
confirmed for both an authenticated and a signed-out visitor.

**Consequences:** Slice 2 is functionally complete per its stated scope.
Commerce (`ProductVariant`/`Cart`/`Order`, Slice 3), Experience booking
(`ExperienceSession`/`Booking`, Slice 4), `StoryBlock` composition, and the
media pipeline remain open, tracked where they were already tracked
(`MVP_ROADMAP.md`, `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` §N/§X) —
this ADR doesn't reopen or resequence any of them.
