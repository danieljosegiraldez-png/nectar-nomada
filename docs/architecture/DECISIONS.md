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
styling fits the non-generic public design direction (`CLAUDE.md`
§48) better, and its pricing model is more predictable at the traffic levels
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

---

## ADR-025 — Slice 3 (Commerce) implemented: variant model, ownership pattern, payments adapter

**Context:** `MVP_ROADMAP.md` Slice 3 — Product → purchasable
`ProductVariant`, Cart, Order, Stripe checkout — built on top of Slice 2's
read-only Discover catalog and Slice 1's real authorization service. This
ADR records the implementation-level decisions, same pattern as ADR-021/024.

**Decisions:**

1. **`Product` gets a `ProductVariant[]` relation instead of `priceAmount`/
   `priceCurrency` fields directly on `Product`.** `Product` stays the
   catalog listing (name, description, classification — what Discover
   renders); `ProductVariant` is the sellable unit (SKU, price, inventory).
   This matches CLAUDE.md §11's own object list (`Product`, `Product
   Variant`, `SKU`, `Inventory` as distinct objects) and avoids conflating
   "a product exists" with "a specific priced, purchasable configuration of
   it exists" — a coffee could have a 250g and 1kg variant at different
   prices, or no purchasable variant at all yet.
2. **New `commerce` Postgres schema**, separate from `core` — first
   module-specific schema, following the convention `DATA_ARCHITECTURE.md`
   §1 already named but hadn't yet used. `ProductVariant`, `Cart`,
   `CartItem`, `Order`, `OrderItem`, `Payment` all live there;
   `ProductVariant.productId` is the only cross-schema foreign key.
3. **Cart and Order authorization use the ownership-folded-into-query
   pattern**, not RBAC Assignment resolution — the same choice already made
   for My Néctar profile access (RBAC.md's "ownership is the filter, not a
   separate check"). Every Cart/Order read or write puts `userAccountId` in
   the `where` clause itself (`lib/commerce/cart.ts`,
   `lib/commerce/orders.ts`'s `getOrderForUser`); there is no
   fetch-then-check-ownership step, and no case where personal transactional
   data needs the classification axis (it's never `public`/`internal`, it's
   simply "yours or not").
4. **`OrderItem.unitPriceAmount`/`currency` are snapshotted at order
   creation**, never a live join through `ProductVariant` at read time — the
   same provenance principle already applied to Protocol versions and lot
   genealogy elsewhere in the architecture. A later price change on a
   `ProductVariant` must never rewrite what a past order says it charged.
5. **Availability is re-validated at checkout, not trusted from add-to-
   cart time.** `createOrderFromCart` re-checks `status === 'active'`,
   `product.classification === 'public'`, `product.status === 'approved'`,
   and remaining inventory for every cart item inside the same transaction
   that creates the Order — an item could have gone out of stock or been
   unpublished between being added to the cart and checkout.
6. **Payments go through a `PaymentsProvider` adapter interface**
   (`lib/integrations/payments/types.ts`), never calling the Stripe SDK
   directly from application code — `INTEGRATIONS.md` §1's adapter-per-
   capability pattern, already used for nothing else yet since this is the
   first external paid integration. Method names
   (`createCheckoutSession`/`parseWebhookEvent`) were chosen to match what
   Stripe Checkout actually needs rather than keeping
   `INTEGRATIONS.md`'s original placeholder names (`createCharge`/
   `getStatus`), which assumed a lower-level charge API than Stripe
   Checkout's session-based flow.
7. **Stripe Checkout (hosted), not Stripe Elements/custom payment UI.**
   Fastest path to a working, PCI-scope-free purchase flow given the
   multi-day timeline (ADR-022's same reasoning applied again); the
   `PaymentsProvider` interface doesn't leak this choice, so swapping to an
   embedded flow later doesn't touch `lib/commerce/orders.ts`.
8. **Order creation happens before redirecting to Stripe**, not after
   payment succeeds. The `Order` row (status `pending_payment`) and
   `Payment` row (status `pending`) are created synchronously in the
   checkout server action; the webhook (`/api/webhooks/stripe`) only ever
   transitions an existing Order to `paid`, decrementing tracked inventory
   and recording an `AuditEvent`. This keeps "what did the customer try to
   buy" inspectable even if they abandon Stripe Checkout or the webhook is
   delayed, and makes `markOrderPaid` naturally idempotent against Stripe's
   at-least-once webhook delivery (a no-op if the Order is already `paid`).
9. **Webhook signature verification is mandatory and unforgiving** —
   `stripe.webhooks.constructEvent` is left to throw on a bad signature, and
   the route handler turns that into a 400 without touching the database.
   No fallback path trusts an unverified request body.
10. **No fabricated prices anywhere in seed data (CLAUDE.md §54, continuing
    ADR-024 decision 6).** The two existing DEMO products (Las Nubes
    Coffee, Cerro Azul Wildflower Honey) still have zero `ProductVariant`
    rows as of this ADR — they are not yet purchasable, and won't be until
    real or explicitly-user-supplied placeholder pricing exists. Full
    Stripe purchase-flow verification is deferred until that's resolved.

**Consequences:** Slice 3's schema, cart, order, and payments-adapter code
is complete. End-to-end verification (a real Stripe test-mode purchase
completing through the webhook) is blocked on two external prerequisites
that can't be supplied by this session: Stripe test-mode API keys, and a
decision about how to price at least one DEMO variant for testing. Slice 4
(Experience booking) is untouched by this ADR.

---

## ADR-026 — Five planning docs accepted: specimen/material traceability,
consumer sensory feedback, guided field study tool, tourism experiences,
research activity criteria

**Context:** Five architecture planning documents were added to
`docs/architecture/`, read in dependency order (each extends the one(s)
before it):

1. `SPECIMEN_AND_MATERIAL_TRACEABILITY.md`
2. `CONSUMER_SENSORY_FEEDBACK.md`
3. `GUIDED_FIELD_STUDY_TOOL.md`
4. `TOURISM_EXPERIENCES.md`
5. `RESEARCH_ACTIVITY_CRITERIA.md`

Same pattern as every prior planning doc (ADR-017/018/019/020): **accepted
as domain-model/process input, implementation deferred** — none of the
schema described in documents 1-4 is built by this ADR. Cross-checked
against `DOMAIN_MODEL.md`, `RBAC.md`, `AI_GOVERNANCE.md`, and
`DATA_ARCHITECTURE.md` for conflicts; none found. Specific findings below.

**Decisions:**

1. **Documents 1-4 accepted as written, no conflicts found.**
   `core.specimen`/`material.*` correctly reuse the existing `Species`/
   `Cultivar` tables (`DOMAIN_MODEL.md` §4) rather than duplicating them;
   `consumer_sensory.*` and `field_study.*` correctly follow the
   one-schema-per-module convention (`DATA_ARCHITECTURE.md` §1) and the
   mandatory provenance/data-quality columns (§4) — `provenance_class` is a
   plain `text` column with a documented value list, not a Postgres enum,
   so document 2's new `consumer_hedonic_feedback` value is a purely
   additive comment-list extension, not a migration conflict. Document 2's
   consumer/expert separation is a direct, correctly-scoped implementation
   of CLAUDE.md §49's "never combine consumer preference with technical
   quality score" rule — separate tables, separate provenance class,
   comparison-not-merging in the UI, enforced at the query layer per its
   §6. Document 3's AI-assisted species ID and voice-transcription features
   correctly route through the `pending`-until-confirmed AI Suggestion
   lifecycle (`AI_GOVERNANCE.md` §4) rather than writing directly.
   Document 4's `requires_account = true` override for gastro-tourism
   bookings is a documented, deliberate, narrowly-scoped exception to the
   platform's general guest-checkout default (CLAUDE.md §12) — logged here
   per its own request, not a silent policy change.
2. **Minor documentation gap, not a conflict**: `DATA_ARCHITECTURE.md` §1's
   enumerated schema list (`identity, commerce, research, sensory,
   competitions, environmental, content, project, partner, ai`) predates
   `material`, `consumer_sensory`, and `field_study` — the same situation
   `commerce` was in before Slice 3 (ADR-025). Fold these three into that
   list whenever `DATA_ARCHITECTURE.md` next gets a substantive edit; not
   urgent enough to justify a standalone edit today.
3. **OTA strategy (document 4, §1) — its own decision, as requested.**
   Direct integration with Viator/GetYourGuide is **declined for now**.
   Both platforms route independent operators through certified
   connectivity-partner software (Bokun, Rezdy, FareHarbor) rather than
   expecting direct API integration; building it directly would mean a real
   certification process, mandatory polling-frequency compliance, and —
   per Viator's supplier terms — the platform bearing legal responsibility
   for overbooking/rate discrepancies caused by its own integration. Given
   this platform's stated preference for low operational complexity and
   solo maintainability (the same reasoning behind ADR-022's Neon-first
   and ADR-025's Stripe-Checkout-not-Elements decisions), direct-booking
   ownership through the platform's own Experience/Booking model is the
   priority; OTA reach is not pursued now. **Kept open, not foreclosed**:
   `INTEGRATIONS.md`'s adapter pattern means an `OTAChannelProvider`
   interface (via a connectivity-partner intermediary, not a direct build)
   could be added later without redesigning the Experience model — a
   future ADR if OTA reach becomes a real priority, not a default path.
4. **Document 5 (`RESEARCH_ACTIVITY_CRITERIA.md`) — substance test and
   fee-tiering confirmed understood, no open questions.** The five-part
   test (§1: falsifiable question, real protocol, real usable evidence,
   honest consent language, program/project/location/researcher linkage as
   necessary-but-not-sufficient infrastructure) and the paid/free tiering
   (§2-3: structured falsifiability + hard-blocking tourism-language check
   for paid activities, self-declared question + soft flag for free ones)
   are both clear as specified — nothing flagged as ambiguous.
5. **Research Compliance Reviewer Role Profile (document 5, §4) — compatible
   with `RBAC.md` as a straightforward data addition, with one mechanism
   worth naming precisely.** Adding the Role Profile itself, and Permissions
   like `('research_activity', 'approve')`/`('research_activity', 'reject')`
   scoped `platform` or `program`, is exactly the "Role Profiles and
   Permissions are data, not code" pattern `RBAC.md` §2 and §5 already
   establish (directly analogous to the existing `Research Lead` profile's
   `('protocol', 'approve')` permission) — no schema or resolver change
   needed, and `RBAC.md` §3's containment rule already lets a
   platform/program-scoped Reviewer reach project-scoped research
   activities correctly. **The one thing to get right at implementation
   time**: the document's "cannot review an activity they personally
   designed or proposed" rule is a **per-row conflict-of-interest check**
   (did *this specific person* design *this specific activity*), which is
   mechanically different from `RBAC.md` §7's blind-evaluation precedent it
   cites — §7 restricts an entire table (`blind_code`↔`sample_id` mapping)
   to specific Role Profiles, a scope/permission-level restriction; this
   rule instead needs an authorship check folded into the query/action
   itself, the same "ownership is the filter" pattern already used for
   Cart/Order (ADR-025 decision 3) and My Néctar profile access, just
   inverted (exclude the author rather than restrict to the owner). Not a
   conflict — both are "structural enforcement, not policy-only," which is
   the property that actually matters — just not literally the same
   mechanism as §7, worth being precise about before implementation.
6. **Retroactive review (document 5 §9) confirmed as a blocking gate, not
   performed by AI.** Consistent with `AI_GOVERNANCE.md`'s "AI cannot
   approve scientific conclusions" applied here to compliance conclusions
   specifically: no automated judgment was made about whether CryoBloom or
   the `TOURISM_EXPERIENCES.md` gastro-tourism design pass the five-part
   test. A review checklist was prepared instead (delivered directly, not
   filed as a doc, since it's an action item for Daniel Silvera as the
   independent Compliance Reviewer, not reference architecture) covering
   both against §1's test, for human completion. Per document 5 §9, no new
   activity-related feature work (Sensory-adjacent live-tasting work from
   document 4 §11, Guided Field Study Tool, or any other
   research/tourism-activity feature) proceeds until that review completes.

**Consequences:** All five documents are accepted as domain-model/process
input; none of documents 1-4's schema is implemented by this ADR. Document
5's compliance gate is now active and blocking: CryoBloom and gastro-tourism
activity work are frozen pending Daniel Silvera's review against §1's
five-part test. Everything else already in flight (Slice 4 Experiences work
not touching gastro-tourism specifics, general platform work) is unaffected
— the gate is scoped to *activity-related* feature work specifically, per
document 5 §9's own wording, not a platform-wide freeze.

---

## ADR-027 — Retroactive research-activity review (ADR-026/§9 gate): resolved

**Context:** ADR-026 logged `RESEARCH_ACTIVITY_CRITERIA.md` §9's blocking
requirement — CryoBloom and the `TOURISM_EXPERIENCES.md` gastro-tourism
design had to be reviewed against the five-part substance test (§1) by
Daniel Silvera, the independent Research Compliance Reviewer, before any
new activity-related feature work (Consumer Sensory Feedback's live-tasting
path, Guided Field Study Tool, further Tourism build-out) could proceed.
Per `AI_GOVERNANCE.md`, this review was performed by the human reviewer,
not by AI — the checklist prepared alongside ADR-026 was handed off, not
completed, by this session.

**Decision:** Reported by the platform owner (2026-08-10) as **approved by
Daniel Silvera** — no conditions or exceptions noted as of this entry. If
Daniel Silvera's own written notes (per-item findings against the §1
checklist, for CryoBloom and the gastro-tourism design separately) become
available, they should be appended here or linked from here, consistent
with `RESEARCH_ACTIVITY_CRITERIA.md` §4's visibility requirement for
compliance decisions — this entry records the outcome, not the underlying
reasoning, which is the reviewer's to document.

**Consequences:** The `RESEARCH_ACTIVITY_CRITERIA.md` §9 gate is lifted.
Activity-related feature work (gastro-tourism-specific pieces of Slice 4,
Consumer Sensory Feedback's live-tasting integration, Guided Field Study
Tool) may now proceed under the same "planning input, implementation
deferred until its own slice comes up" discipline as every other accepted
planning document — this ADR removes the blocking gate, it does not itself
schedule or start that work.

---

## ADR-028 — Slice 4 (Experiences & Reservations) implemented: core booking
engine only, extensions deferred

**Context:** `MVP_ROADMAP.md` Slice 4 — `Experience → ExperienceSession →
Booking → Participant` (`DOMAIN_MODEL.md`'s Experiences & Reservations
module), built on Slice 2's read-only Experience catalog and reusing Slice
3's Stripe integration. Built after ADR-027 lifted the
`RESEARCH_ACTIVITY_CRITERIA.md` §9 gate — this ADR covers the core booking
engine only, not any gastro-tourism-specific piece of `TOURISM_EXPERIENCES.md`.

**Decisions:**

1. **`Experience` gets a `sessions ExperienceSession[]` relation instead of
   bookings hanging directly off `Experience`** — same catalog-listing /
   sellable-unit split as `Product → ProductVariant` (ADR-025 decision 1):
   `Experience` stays the catalog page Discover renders; `ExperienceSession`
   is the actual scheduled, capacity-bound occurrence. An Experience with
   zero sessions still renders as a normal catalog listing ("no sessions
   currently scheduled"), same graceful-empty pattern as a Product with zero
   variants.
2. **New `experiences` Postgres schema**, second module-owned schema after
   `commerce`, same `DATA_ARCHITECTURE.md` §1 convention. `ExperienceSession`,
   `Booking`, `Participant`, `BookingPayment` all live there;
   `ExperienceSession.experienceId` is the only cross-schema foreign key.
3. **No Cart-equivalent for bookings.** `DOMAIN_MODEL.md`'s own chain has no
   intermediate step between `ExperienceSession` and `Booking` — a booking
   is created directly from a session (participant names + implicit
   quantity), not staged in a cart first. This is a real structural
   difference from Commerce, not a simplification skipped for later:
   booking flows are naturally single-item ("book this session"), unlike a
   multi-product shopping cart.
4. **Booking authorization uses the same ownership-folded-into-query
   pattern** as Cart/Order (ADR-025 decision 3) — `getBookingForUser`/
   `getBookingsForUser` fold `userAccountId` into the query itself, no
   fetch-then-check.
5. **`Booking.unitPriceAmount`/`currency` are snapshotted at booking
   creation**, same provenance principle as `OrderItem.unitPriceAmount`
   (ADR-025 decision 4) — a later Experience price change must never
   rewrite a past Booking's total.
6. **Capacity is re-validated at booking creation, decremented only on paid
   confirmation** (`markBookingPaid`), exactly mirroring ADR-025 decision 5's
   inventory handling — a session's `capacityRemaining` isn't reserved the
   moment someone starts booking, only once payment actually succeeds.
7. **The existing `PaymentsProvider` adapter is reused as-is for bookings**,
   not duplicated — `INTEGRATIONS.md`'s adapter-per-capability pattern means
   one Stripe Checkout integration serves both Commerce and Experiences.
   Since both modules now share one webhook endpoint and one
   `client_reference_id` slot, the value passed to `createCheckoutSession`
   is now a domain-prefixed opaque string (`order:<uuid>` /
   `booking:<uuid>`) rather than a bare id — the webhook route
   (`app/api/webhooks/stripe/route.ts`) parses the prefix to dispatch to
   `markOrderPaid` or `markBookingPaid`. `BookingPayment` is a distinct
   model from `commerce.Payment` (same shape, own status enum) purely
   because Prisma foreign keys and enums are schema-scoped — every module
   schema so far defines its own status enums even where identical in
   shape (`ProductVariantStatus` vs. `ExperienceSessionStatus`), not shared
   cross-schema.
8. **A Booking cannot be created for a session whose Experience has no
   price** (`priceAmount === null`) — CLAUDE.md §54's anti-fabrication rule
   applied the same way as ADR-025 decision 10 handled unpriced
   ProductVariants: the UI shows "booking opens once pricing is set"
   instead of inventing a number. Verified live against Neon with a real
   (non-fabricated, date-only) test `ExperienceSession` fixture: the
   session's date/capacity render correctly and the booking form is
   correctly withheld pending a real price — fixture removed after
   verification, not left in the database.
9. **Gastro-tourism-specific extensions from `TOURISM_EXPERIENCES.md`
   (waitlist, multi-day sessions, recurring session templates, structured
   dietary/allergen fields, the `requires_account` override, pairing menus,
   deposits, live `consumer_sensory` feedback integration) are explicitly
   NOT part of this ADR.** They remain accepted planning input
   (ADR-026/027) layered onto this core engine later, not built now — this
   keeps Slice 4 a genuine vertical slice rather than absorbing all of
   Tourism's scope at once.

**Verified**: `npx tsc --noEmit`, `npm run lint`, `npm test` (30 RBAC tests,
unaffected), and `npm run build` all pass; migration
`20260810062745_slice4_experiences` applied cleanly to Neon
(`prisma migrate status` confirms up to date). Browser-verified against
Neon: an Experience with zero sessions shows the correct empty state; a real
scheduled session (test fixture, removed after verification) shows its
date/time and remaining capacity via `next-intl`'s `useFormatter`, and
correctly withholds the booking form because the DEMO Experience has no
price. My Néctar's new Bookings section correctly shows "no bookings yet"
for a real logged-in user.

**Consequences:** Slice 4's core schema, booking service, session/booking UI,
and My Néctar integration are complete. End-to-end verification (a real
Stripe booking payment completing through the shared webhook) is blocked on
the same two prerequisites as Slice 3 (ADR-025 decision 10): Stripe
test-mode API keys, and a decision about how to price at least one DEMO
Experience for testing. Gastro-tourism-specific extensions
(`TOURISM_EXPERIENCES.md`) remain a separate, not-yet-scheduled increment on
top of this engine.

---

## ADR-029 — Slice 5 (Partner Workspace) implemented: assignment-scope
visibility, classification restriction, RBAC catalog fix, R2 adapter

**Context:** `MVP_ROADMAP.md` Slice 5 — Project Assignment, Task, data
submission forms, and media upload, explicitly scoped as "the first slice
where the classification axis meaningfully restricts a non-admin,
non-researcher user's view." Per `DOMAIN_MODEL.md` §4, Partner Workspace is
not a separate data model — it's a role-aware view composed from the
existing RBAC primitives (`lib/rbac/service.ts`) over new `Task`/
`FieldSubmission` (module-owned, new `partner` schema) and `Asset`
(canonical, `core` schema, per `DATA_ARCHITECTURE.md` §5).

**Decisions:**

1. **RBAC catalog fix, applied before building anything else**: the
   "Partner Field Collector" Role Profile (`RBAC.md` §5) was seeded with
   `partner:submit_task`/`submit_data`/`upload_media` but **no
   `classification:clear_partner`** — meaning, before this fix, a partner
   could see nothing above `public` on their own assigned project, which
   defeats the purpose of the classification level literally named
   "partner." Added `classification:clear_partner` to the profile
   (`lib/rbac/catalog.ts`) — Role Profiles/Permissions are seed-managed data
   (`RBAC.md` §2), so this is a data change plus two new unit tests
   (`tests/rbac/resolve.test.ts`), not a schema migration. A partner still
   cannot clear `internal`/`confidential`/`trade_secret`, even on their own
   assigned project — verified live (see below), not just in unit tests.
2. **Partner Workspace's project list is driven by project-scoped
   Assignments directly, not a `project:view` permission check** — same
   "ownership is the filter" family of pattern as Cart/Order (ADR-025
   decision 3), adapted to "assignment scope is the filter." A consequence,
   confirmed by manual verification: a Platform Admin's platform-scoped
   Assignment does **not** populate their own Partner Workspace project
   list — "projects I'm assigned to" is a literal, narrow question, not a
   god-view of every project. `RBAC.md` §3's platform-contains-everything
   rule still applies *inside* a given project's workspace (an admin with a
   matching project-scoped Assignment would see everything a partner sees
   plus internal/confidential content) — it just isn't what drives which
   projects show up in the list.
3. **No dedicated `partner:view` permission — visibility reuses the
   `submit_task`/`submit_data`/`upload_media` action permissions as the
   view gate**, each independently AND-gated with the record's own
   classification (`lib/partner/workspace.ts`'s `isVisible`). Deliberate
   simplification, stated plainly rather than silently: every Role Profile
   that can act on partner data today (Partner Field Collector, Platform
   Admin) also holds all three action permissions together, so nothing is
   currently under- or over-granted. Splitting out a real `partner:view`
   permission is a small, isolated catalog change if a submit-without-view
   profile is ever needed — not a redesign.
4. **Task creation is admin/seed-only in this slice — no UI for it.** A
   partner can update an existing Task's `status` (`submit_task`) and
   create `FieldSubmission`s (`submit_data`), but Task rows themselves come
   from seed/future-admin-tooling, not a Partner Workspace form. This keeps
   the slice's write surface to what `partner:*`'s permission descriptions
   actually say ("submit **or update** an assigned task," not "create
   one") and avoids building an admin task-management UI that wasn't asked
   for.
5. **Partner-authored `FieldSubmission`s are always created at
   `classification: 'partner'`, not user-selectable.** Letting a partner
   pick a classification level (including one they can't themselves see)
   would be a confusing, unnecessary escalation surface. Reclassifying
   content upward is an admin/Research-Lead operation, not built in this
   slice.
6. **Media upload is a presigned-PUT flow, not a proxy through the Next.js
   server**: `requestAssetUpload` (server action) returns a short-lived R2
   presigned PUT URL; the browser uploads the file bytes directly to R2;
   `finalizeAssetUpload` (a second server action, re-checking permissions —
   never trusting the client-only gate) creates the `Asset` row only after
   a successful upload, so a failed/abandoned upload never leaves a
   dangling record pointing at nothing in the bucket. `ObjectStorageProvider`
   (`lib/integrations/storage/`) follows the exact same adapter-per-
   capability shape as `PaymentsProvider` (ADR-025 decision 6) —
   `putObject`/`getSignedUrl`/`deleteObject`, Cloudflare R2 behind an
   S3-API-compatible client (`DECISIONS.md` ADR-003), swappable to AWS S3
   without touching `lib/partner/workspace.ts`.
7. **`Asset` stays in `core` (canonical), `Task`/`FieldSubmission` get a new
   `partner` module schema** — same split as `Product`/`ProductVariant`
   (ADR-025 decision 1) and `Experience`/`ExperienceSession` (ADR-028
   decision 1): the canonical, cross-module-referenceable entity in `core`,
   the module-specific transactional data in its own schema.
8. **A real, checked-in DEMO Partner Field Collector account**
   (`demo-partner@nectar-nomada.example`, gated behind
   `SEED_DEMO_PARTNER=true`, same `SEED_DEMO_ADMIN` convention) —
   assigned to Las Nubes, used to seed one `partner`-classified
   `FieldSubmission` (a `FieldSubmission.submittedByUserAccountId` is a
   required FK; a submission genuinely needs a real actor, so this step is
   skipped, not faked, when the flag isn't set). This is a deliberate
   departure from Slice 3/4's ephemeral-test-fixture verification pattern:
   the classification restriction this slice exists to prove is exactly
   the kind of thing worth being permanently reproducible by anyone running
   `SETUP.md`'s steps, not just demonstrated once in this session.
9. **Two DEMO `Task` rows, deliberately mixed classification** — one
   `classification: 'partner'` ("Confirm bloom-window observations..."),
   one `classification: 'internal'` ("Internal: review Q3 research
   budget..."), both on Las Nubes. This is the concrete fixture the
   classification-restriction test needed and now permanently has.

**Verified**, live, against Neon: `npx tsc --noEmit`, `npm run lint`,
`npm test` (32 tests, 30 prior + 2 new for the catalog fix), and
`npm run build` all pass. Browser-verified end to end, logged in as the real
seeded DEMO partner account: Partner Workspace's project list shows exactly
Las Nubes; the project workspace page shows **only** the `partner`-classified
Task ("Confirm bloom-window observations...") — the `internal`-classified
one is correctly absent; the DEMO `FieldSubmission` renders with real
attribution; both write paths (task status update, new field submission
creation) were exercised live and correctly appear via `revalidatePath`,
then cleaned up (test data removed, task status reverted to its seeded
`open` state) so the repository's demo dataset stays exactly what the seed
script reproduces. Media upload itself is not yet verified — R2 credentials
are unset, same open item as Stripe for Slices 3/4 (a third external
credential this session cannot supply).

**Consequences:** Slice 5's schema, RBAC catalog fix, object storage
adapter, Partner Workspace service layer and UI, and DEMO seed content are
complete and match MVP_ROADMAP.md's stated scope for this slice. Not built:
an admin-facing Task-creation/reclassification UI (out of scope, noted
above), and real media upload verification (blocked on R2 credentials, same
shape as the Stripe items already tracked).

---

## ADR-030 — Slice 6 (Sensory) implemented: configurable protocol, blind
mapping as a genuinely restricted table, immutable assessments

**Context:** `MVP_ROADMAP.md` Slice 6 — Sensory Session, Blind Sample,
Evaluator, Assessment, Panel Results, starting with one configured
Evaluation Protocol (coffee cupping, per the roadmap's own stated
preference) rather than every domain at once, to prove the
configurable-protocol model (`DOMAIN_MODEL.md`'s "Sensory Evaluation")
before generalizing. This is CLAUDE.md's most rigor-heavy module — §21-30
specify configurable protocols, blind evaluation, and immutable responses
in detail, and RBAC.md §7 already named the exact restricted-table pattern
this slice needed to implement literally, not just reference.

**Decisions:**

1. **`SensoryProtocol → SensoryProtocolVersion → SensoryAttribute`, all in a
   new `sensory` schema, `domain` a free-text field** — not a closed enum —
   matching CLAUDE.md §21's explicit instruction that the sensory
   architecture must not be one universal form. Versions carry their own
   `scoreMin`/`scoreMax` and `supersededByVersionId`, the same
   versioned-protocol shape used elsewhere in this project's design work.
2. **The DEMO protocol's attribute set (Aroma, Flavor, Acidity, Body,
   Sweetness, Aftertaste, Overall Impression) is deliberately generic, not
   the real SCA cupping form** — CLAUDE.md §30 explicitly warns against
   assuming or implying one specific official scoring system, and the SCA
   form is itself a real, specific published protocol; copying it verbatim
   under a "DEMO" label would still read as claiming that standard. The
   protocol's own description states this plainly.
3. **`SensorySession → SensoryFlight → SensoryBlindSample`, with
   `SensoryBlindMapping` as its own table** — RBAC.md §7's "the mapping
   table between blind_code and the real sample_id is its own table with
   its own restrictive Role Profile requirement" implemented literally, not
   approximated. A new `blind_mapping:view` permission exists, and the
   "Sensory Judge" Role Profile does not hold it — a Judge's resolved
   permission set cannot query `SensoryBlindMapping` at all, the same
   "structurally unreachable, not merely hidden" property RBAC.md §7
   already required for this exact scenario. `core.Sample` (Foundational
   schema, previously unused since it was built ahead of any module that
   needed it) is the real-identity target — the first thing to actually
   reference it.
4. **New "Sensory Head Judge" Role Profile** (scope: session) — holds
   `sensory:manage_session`, `blind_mapping:view`, `sensory:submit_assessment`,
   and `classification:clear_internal`. A dedicated profile rather than
   reusing Platform Admin, because a real judging panel's head judge is a
   session-scoped role, not necessarily a platform administrator.
5. **Assessments are create-only — no `updateAssessment` function exists.**
   CLAUDE.md §21 and `AI_GOVERNANCE.md` §2 both require submitted sensory
   forms to be immutable; the schema supports corrections via a
   `supersedesAssessmentId` self-reference, but building the correction
   *workflow* (when is a correction allowed, who approves it, how it's
   surfaced) is out of scope for this slice. `submitAssessment` simply
   rejects a second submission from the same evaluator for the same blind
   sample — verified live (see below), not just asserted.
6. **`PanelResult` rows are recomputed via delete-then-recreate, not
   upsert.** A nullable `attributeId` (null = overall-score aggregate) means
   Postgres's NULL-is-distinct semantics wouldn't actually enforce "at most
   one overall row per blind sample" through the unique index alone;
   `computePanelResult` sidesteps this by clearing and rebuilding all rows
   for a blind sample inside one transaction, which is correct regardless
   of that edge case and matches CLAUDE.md §28's "derived metric, stored
   with method/timestamp, never hand-edited" requirement either way.
7. **Task/session creation stays seed-only, same scope boundary as Slice
   5's Task creation** — no admin UI for creating protocols, sessions,
   flights, or blind samples in this slice. The judge-facing (submit
   assessment) and head-judge-facing (reveal identity, compute panel
   result) surfaces are what MVP_ROADMAP.md's Slice 6 description actually
   asks for.
8. **A real, permanent DEMO Sensory Judge account**
   (`demo-judge@nectar-nomada.example`, gated `SEED_DEMO_JUDGE=true`, same
   convention as ADR-029's DEMO partner) assigned to one DEMO cupping
   session — same reasoning as ADR-029 decision 8: the blind-mapping
   restriction this slice exists to prove should be reproducible by anyone
   running `SETUP.md`, not just demonstrated once. **Zero Assessment rows
   are seeded** — CLAUDE.md §54 forbids fabricating sensory outcomes, the
   same discipline already applied to prices (Slice 3) and session dates
   (Slice 4).

**Verified**, live, against Neon: `npx tsc --noEmit`, `npm run lint`,
`npm test` (37 tests, 32 prior + 5 new for the blind-mapping RBAC
restriction), and `npm run build` all pass. Browser-verified end to end:
logged in as the real seeded DEMO Sensory Judge, the session page shows
only blind codes ("Muestra A"/"Muestra B") with no real-identity text
anywhere in the rendered page; submitted a real test assessment across all
7 attributes, which correctly flipped that sample's form to "already
submitted" and correctly left the other sample's form open; logged in as
Platform Admin (whose platform-scoped Assignment correctly grants
`blind_mapping:view`/`sensory:manage_session` via RBAC.md §3's containment
rule even without a session-specific Assignment), the same session now
shows the real sample codes (`LN-CUP-001`/`LN-CUP-002`) and a working
"compute panel result" action whose output matched the submitted values
exactly. Test assessment and its derived panel results were then deleted so
the repository's demo dataset stays exactly what the seed script
reproduces.

**Consequences:** Slice 6's schema, RBAC extension, service layer, and UI
are complete and match MVP_ROADMAP.md's stated scope. Not built: the
Assessment-correction workflow (schema supports it, no UI), Competitions
(explicitly deferred — `DOMAIN_MODEL.md` notes it reuses
`SensoryProtocol`/`Assessment` rather than duplicating the scoring engine,
which this slice's design already accommodates), and any domain beyond
coffee (the configurable-protocol model is proven; extending to honey/beer/
wine is now a content addition, not a schema change).

---

## ADR-031 — Beverage Sensory Protocols & Reference Standards: accepted as
planning input, Organization-typing gap identified (non-blocking)

**Context:** `BEVERAGE_SENSORY_PROTOCOLS.md` (committed separately) extends
Slice 6's `SensoryProtocol`/`SensoryProtocolVersion` entities with real,
licensing-aware protocol content for coffee (adapted from SCA's CVA
structure), beer and mead (adapted from BJCP), and honey (grounded in ISO/
academic literature), plus a Reference Standards & Panel Calibration system
(`reference_standard`, `calibration_session`, `calibration_result`,
`evaluator_sensitivity_profile`, plus structured certifications on
`core.Person`). Unlike the five-document planning batch (ADR-026), this is
explicitly not speculative future scope — reference-standard suppliers
(FlavorActiV) and real certifications (UC Davis, CQI Q-Grader, etc.) are
current practice. Same discipline applies regardless: **accepted as planning
input, implementation deferred** — nothing in this ADR builds any of it.

**Cross-check requested: does `core.Organization` support being a
reference-standard supplier and any other organization type
simultaneously?**

Checked against the actual implementation, not just the docs:
`Organization.organizationType` is a single, required, closed Prisma enum
(`OrganizationType` — farm/estate/producer/.../supplier/
nectar_nomada_partner/...), not nullable, not multi-valued, no open
free-text escape hatch. One Organization row carries exactly one type.

**Finding: not a blocker for this specific use case, but a real, named gap
in the general model.**

- `reference_standard.supplier_organization_id`, as the planning doc
  specifies it, is a plain FK to `core.Organization` with no constraint
  requiring `organizationType = 'supplier'` — mechanically, *any*
  Organization row can already be referenced as a supplier regardless of
  its type. AROXA/FlavorActiV (pure third-party suppliers) fit cleanly
  under the existing `supplier` value with zero schema change.
- The actual friction is Néctar Nómada's own Organization record (already
  typed `nectar_nomada_partner`, its primary identity in the platform) also
  being a standards creator/seller. `organizationType` cannot hold two
  values at once, so it cannot be truthfully tagged both
  `nectar_nomada_partner` *and* `supplier` simultaneously.
- **Recommended resolution, no schema change required**: don't try to
  answer "is this Organization a supplier" from `organizationType` at all
  for this purpose — derive it contextually from whether any
  `reference_standard` rows reference it via `supplier_organization_id`,
  the same "don't encode a role permanently in identity, derive it from
  context" principle `DOMAIN_MODEL.md` §2 already states for Person roles
  ("Wanting a producer's OrganizationMembership to also grant Partner
  Workspace access requires a separate, explicit Assignment... permission
  scope and organizational title do not always move together"), applied
  here to Organization instead of Person. Néctar Nómada's own org record
  keeps its existing type and is simply referenced by
  `reference_standard.supplier_organization_id` — no redesign needed.
- **The general gap is real and worth naming precisely, even though it
  doesn't block this feature**: `organizationType` as a single closed enum
  cannot express "this Organization is genuinely both X and Y" for *any*
  pair of types (e.g., an org that's both a Roaster and a Tour Operator),
  the exact same problem `ProjectDomainTag` already solves for Projects
  (CLAUDE.md §8 — "a project belongs to multiple domains simultaneously").
  No equivalent many-to-many tag table exists for Organization. If a real
  case requiring simultaneous organization types shows up (not the
  reference-standard-supplier case, which the contextual-FK resolution
  above already handles cleanly), the fix is the same shape already
  proven: an `OrganizationTypeTag` join table, not a redesign of the
  canonical entity.

**Other cross-checks**: no conflicts found against `DOMAIN_MODEL.md`
(reuses `SensoryProtocol`/`SensoryProtocolVersion` exactly as specified,
adds no new canonical entities beyond what §3 already lists) or `RBAC.md`
(the calibration system's access needs fit the existing
`sensory:manage_session`/classification-axis pattern already built for
Slice 6 — no new permission type implied). One minor, pre-existing
documentation lag noticed while cross-checking, unrelated to this doc: the
"Sensory Head Judge" Role Profile (added in Slice 6, ADR-030 decision 4)
isn't yet listed in `RBAC.md` §5's prose alongside "Sensory Judge" — cosmetic,
`RBAC.md` §5 already states its list isn't closed, not urgent to fix now.

**Consequences:** Accepted as planning input for a future increment of
Slice 6 (real protocol content for coffee/beer/mead/honey, plus the
calibration/reference-standard system) — not built by this ADR. The
Organization-typing question is resolved without a schema change for the
reference-standard use case specifically; the general single-type
limitation remains a known, low-priority gap with an already-proven fix
pattern if it's ever actually needed.

---

## ADR-032 — Fix: Assessment double-submission race (post-Slice-6 review)

**Context:** A self-review after Slice 6 shipped found that
`submitAssessment` used a check-then-create pattern (query for an existing
submitted Assessment, then create a new one) with no database-level
uniqueness backing it. Two concurrent requests — a double-click, a retried
network request — could both pass the check and create two "submitted"
Assessment rows for the same evaluator/blind-sample pair, and
`computePanelResult` would then silently count that evaluator's scores
twice in the panel average.

**Decision:** Added `@@unique([blindSampleId, evaluatorUserAccountId])` to
`Assessment` and rewrote `submitAssessment` to rely on the resulting
Postgres constraint violation (caught as `Prisma.PrismaClientKnownRequestError`
code `P2002`) rather than a pre-check query — the create either succeeds or
fails atomically, closing the race entirely instead of narrowing it.

**Consequence worth flagging now, for later**: this constraint assumes
there is never more than one Assessment row per evaluator/sample, which is
true today (ADR-030 decision 5 — no correction workflow exists). If a
correction workflow is ever built, this exact constraint will need
revisiting — most likely a partial unique index scoped to
`status = 'submitted'` rather than an unconditional one, so a `superseded`
row can coexist with its replacement. Noted directly in the schema comment
so this isn't rediscovered the hard way.

**Verified**: `npx tsc --noEmit` clean, migration applied cleanly to Neon.

---

## ADR-033 — Slice 7 (AI) implemented: real restricted Postgres role, not
just an application-layer promise

**Context:** `MVP_ROADMAP.md` Slice G — a permission-aware platform
assistant and data-completeness suggestions. `AI_GOVERNANCE.md` §3 draws a
sharp line between a governance *policy* and a governance *control*: "the
prohibition is enforced at the database permission layer, not only in
application logic ... this is the concrete difference." This slice takes
that literally rather than approximating it in application code.

**Decisions:**

1. **A real, separately-privileged Postgres role (`ai_service`)**, not a
   naming convention. `prisma/migrations/*_slice7_ai` creates it `NOLOGIN`
   (no password embedded in a file committed to git) with
   `GRANT INSERT ON ai.recommendation`; a follow-up migration adds
   `GRANT SELECT` on that same table once testing showed Postgres's
   `RETURNING` clause (which Prisma's `.create()` always uses) requires
   SELECT even for an otherwise insert-only caller. `UPDATE`/`DELETE`
   stay revoked — even the AI role cannot edit or delete its own past
   suggestions, only append new ones. **Verified directly against Neon**,
   not just asserted: connected as `ai_service` and confirmed `INSERT`
   succeeds, `UPDATE` on `ai.recommendation` fails, and `SELECT` on
   `core.user_account` (or any other table) fails with a real Postgres
   permission-denied error — see verification note below.
2. **The role's password is generated and set out-of-band**, never
   committed — the migration file creates the role `NOLOGIN`; a separate,
   non-committed step (`ALTER ROLE ... LOGIN PASSWORD ...`, documented in
   `SETUP.md`) activates it, and the resulting connection string lives only
   in `.env` as `AI_SERVICE_DATABASE_URL`. `lib/ai/db.ts` is the only file
   that constructs a Prisma Client against it; every other file in the
   codebase uses `lib/db.ts`'s full-access client.
3. **No real LLM provider is wired up — and the code says so.**
   `generateDataCompletenessSuggestions` is a genuine, working rule-based
   generator (`model: "rule-based-completeness-checker-v1"`), not a stub
   pretending to call GPT/Claude. There is no API key for one, and
   fabricating that call would misrepresent what's actually happening —
   the same anti-fabrication discipline CLAUDE.md §54 applies to seed data
   applied here to the AI layer itself. Swapping in a real model later only
   touches this one function; the suggestion lifecycle, RBAC gating, and
   audit trail don't change (`INTEGRATIONS.md` §7's provider-independence
   principle).
4. **Read-scoping for suggestion review is a single new permission
   (`ai:review_suggestion`), not fully generic per-entity scoping.**
   `AI_GOVERNANCE.md` §4 describes review visibility as scoped like a
   human's own resolved RBAC access; building that generically for an
   open-ended `related_entity_type` (which could point at a Project, a
   Task, a SensorySession, anything) is materially more work than this
   slice needs. Deliberately narrowed, same trade-off already made for
   Partner Workspace (ADR-029) and Sensory (ADR-030) visibility: gated by a
   platform/program-scope permission check, not resolved per related
   entity. Granted to Platform Admin (via its full permission set) and
   Content/Ops Coordinator — reviewing a data-completeness gap is exactly
   the non-developer collaborator task `RBAC.md` §5 names that profile for.
5. **"Accept" records a human decision, it does not apply anything.**
   `decideSuggestion` writes `status`/`reviewer`/`decisionAt` and a
   mandatory `AuditEvent` — it never edits the Project (or whatever entity)
   the suggestion is about. The actual fix happens through whatever
   surface already exists for that entity. This keeps the human's real
   write genuinely the human's own action, per `AI_GOVERNANCE.md` §3's
   requirement, rather than this function performing it on the AI's
   behalf under a human's clicked "accept."

**Verified**, live, against Neon: `npx tsc --noEmit`, `npm run lint`,
`npm test`, and `npm run build` all pass. Direct role-level verification
(a standalone script, not the app) confirmed `ai_service` can `INSERT`
into `ai.recommendation`, cannot `UPDATE` it, and cannot touch any other
table at all — real Postgres `permission denied` errors, not application
logic. Browser-verified the full lifecycle as Platform Admin: the rule
correctly found zero suggestions against real seed data (Las Nubes already
has a description — nothing to fabricate a gap about); created a real
temporary test Project with no description, ran the generator again, got a
genuine `pending` suggestion, clicked Accept, confirmed it moved to
"reviewed" with correct human attribution, and confirmed the resulting
`AuditEvent` (`operation: "recommendation.accepted"`) was actually written.
Test project, suggestion, and audit row all removed afterward.

**Consequences:** Slice 7's suggestion lifecycle, RBAC-gated review UI, and
the DB-enforced write restriction are complete and demonstrably real, not
asserted. Not built: any actual LLM-backed suggestion generator (no
provider configured — this is an intentional scope boundary, not a gap to
close later by default), and per-entity-scoped review visibility (decision
4 above).

---

## ADR-034 — Competitions implemented: reuses Sensory's judging engine
directly, no parallel scoring system

**Context:** `DOMAIN_MODEL.md`'s Competitions section is explicit:
"Reuses `SensoryProtocol`/`Assessment` from the Sensory module for the
actual judging mechanics rather than duplicating a scoring engine —
Competitions is a workflow and chain-of-custody layer wrapped around
Sensory, not a parallel evaluation system." `MVP_ROADMAP.md` §3 sequenced
this after Slice 6 for exactly that reason. Built now that Slice 6 exists.

**Decisions:**

1. **New `competitions` schema holds only workflow entities — `Competition
   → CompetitionEdition → CompetitionCategory → Entry`,
   `CompetitionJudgeAssignment` (conflict-of-interest metadata only), and
   `CompetitionResult`/`Award`.** No competitions-owned table duplicates
   blind coding, assessment submission, or panel-result computation —
   `CompetitionCategory.sensorySessionId` links directly to an existing
   `sensory.SensorySession`, and all actual judging happens through the
   unmodified `/sensory/[sessionId]` UI already built in Slice 6. Verified
   live (see below): zero new judging UI was written, and the existing one
   worked unchanged.
2. **A competition judge is assigned exactly the way a Sensory judge always
   is** — a session-scoped RBAC Assignment holding "Sensory Judge" or
   "Sensory Head Judge." `CompetitionJudgeAssignment` records
   competition-specific metadata Sensory has no concept of (conflict-of-
   interest declaration, CLAUDE.md §29) alongside that Assignment, but does
   not replace or duplicate the actual permission grant.
3. **Direct cross-module references to `sensory.*` tables** (`Entry` doesn't
   reference `sensory.*` directly, but `CompetitionCategory.sensorySessionId`
   and `CompetitionResult.blindSampleId` do) are a deliberate exception to
   `DATA_ARCHITECTURE.md` §1's general "modules reference core, not each
   other" convention — made explicitly because `DOMAIN_MODEL.md` itself
   mandates reuse over duplication for this specific module, not a
   precedent for cross-module references generally.
4. **`CompetitionResult` is a distinct, official, human-finalized outcome —
   never a live read of `PanelResult`.** `finalizeResult` snapshots the
   current overall-score `PanelResult` mean into `CompetitionResult.
   finalScore` at the moment a head judge finalizes it, the same
   provenance/snapshot principle used for `OrderItem.unitPriceAmount`
   (ADR-025) and `Booking.unitPriceAmount` (ADR-028) — a later Assessment
   correction (once that workflow exists) must never silently rewrite an
   already-finalized competition result. Finalizing never touches the
   underlying `Assessment`/`PanelResult` rows themselves (CLAUDE.md §32 —
   nobody, including this action, silently changes what the judges actually
   submitted).
5. **No classification field on `Competition`/`Edition`/`Category`/`Entry`
   in this slice** — stated plainly as a scope simplification, not an
   oversight. Every function in `lib/competitions/service.ts` is gated by a
   single `competition:manage` permission (granted to Platform Admin only);
   there is no public-facing browse/results surface yet that would need
   per-record classification. Add it if/when that surface is built, not
   preemptively.
6. **`competition:manage` is Admin-only for this slice** — `Content/Ops
   Coordinator`'s existing catalog description already said "explicitly
   excluding ... competition-result permissions" before this ADR (written
   during Slice 1, anticipating this module), so no change was needed there
   to keep that boundary.

**Verified**, live, against Neon: `npx tsc --noEmit`, `npm run lint`,
`npm test`, and `npm run build` all pass. Created a real, clearly-labeled
TEST Competition/Edition/Category/Entry linked to the existing DEMO Sensory
session and one of its two DEMO Samples; submitted a real assessment
through the *existing, unmodified* `/sensory/[sessionId]` UI; computed a
panel result there (also unmodified); then, from the new Competitions UI,
finalized the result — the resulting `finalScore` (8.50) matched the
submitted score exactly — and declared an award, which rendered correctly.
All test data (competition, cascaded edition/category/entry/result/award,
the test assessment, and derived panel results) removed afterward.

**Consequences:** Competitions' workflow layer is complete and genuinely
reuses Sensory rather than approximating reuse. Not built: a
competitor-facing entry-registration UI (entries are admin/seed-created
this slice, same scope boundary already used for Partner Workspace Tasks
and Sensory Sessions), and any public results/awards browsing surface
(would need the classification field noted in decision 5 first).

## ADR-035 — Beverage Sensory Protocol content populated; Reference
Standards & Panel Calibration implemented

**Context:** ADR-031 accepted `BEVERAGE_SENSORY_PROTOCOLS.md` as
domain-model input, deferring implementation to Slice 6. Slice 6 shipped
with only the illustrative coffee protocol as a placeholder. This ADR closes
that gap: real (not fabricated) protocol content for coffee/beer/mead/honey,
placeholder rows for the nine deferred categories, and the Reference
Standards & Panel Calibration system specified in
`BEVERAGE_SENSORY_PROTOCOLS.md` §7.

**Decisions:**

1. **`SensoryProtocol` gains `standardSourceReference` and
   `standardLicenseStatus` (`adapted_original|licensed|pending_license`);
   `SensoryAttribute` gains `section` (`descriptive|affective|null`).** Every
   populated protocol in this ADR sets `standardSourceReference` to an
   honest, specific citation of what it's structurally adapted from, and
   `standardLicenseStatus = adapted_original` — none of the seeded content
   claims to be a licensed reproduction of SCA/BJCP/ISO material, matching
   `BEVERAGE_SENSORY_PROTOCOLS.md` §1's "adapt-original, not verbatim"
   governing rule.
2. **Coffee** (existing "Coffee Cupping (Illustrative)" protocol, patched
   rather than replaced, so already-seeded production rows keep their
   history) — attributes split into `descriptive` (Aroma, Flavor, Acidity,
   Body, Sweetness, Aftertaste) and `affective` (Overall Impression),
   structurally informed by the SCA Coffee Value Assessment's
   Descriptive/Affective separation (CVA-103/104) without reproducing CVA's
   proprietary scale wording.
3. **Beer and Mead** — separate protocols (matching BJCP's own separate
   scoresheets), each with Aroma/Appearance/Flavor/Mouthfeel (descriptive)
   plus Overall Impression (affective) — the general category shape used
   broadly in brewing/mead judging, not BJCP's scoring rubric or
   style-specific point allocations.
4. **Honey** — grounded in ISO 4121/5492/8586/8589 and published academic
   honey-sensory literature (least licensing constraint of the batch per
   ADR-031's registry) — four-category structure (visual, olfactory,
   olfactory-gustatory, tactile) plus an affective Overall Impression.
5. **Nine deferred categories** (wine, cacao, chocolate, spirits, rum, gin,
   infused liquors, water, non-alcoholic) seeded as `SensoryProtocol` rows
   with `status: planned` and no attributes — recognized categories the
   platform is designed to support, with zero invented content, per
   `BEVERAGE_SENSORY_PROTOCOLS.md` §4.
6. **FlavorActiV recorded as a real `core.Organization`**
   (`organizationType: supplier`) rather than a hard-coded supplier
   reference — legitimate because the user supplied this fact directly in
   the original planning conversation (not fabricated), and consistent with
   §7.1's "any supplier is just an Organization record" design.
   No `ReferenceStandard` rows carry invented compound/threshold data —
   CLAUDE.md §54 applies to protocol design content exactly as it does to
   sensory outcomes; no real FlavorActiV data sheets were available to seed
   honestly, so the registry ships empty and is populated only when real
   data-sheet content exists.
7. **Reference Standards & Panel Calibration schema** implements
   `BEVERAGE_SENSORY_PROTOCOLS.md` §7 as specified: `ReferenceStandard`
   (open `supplierOrganizationId`, not a closed list; optional
   `commerceProductId` for standards that are also sold),
   `SelfCreatedStandardDetail` (1:1, carries `validatedAgainst` so a
   self-made standard's claims stay traceable per the platform's evidence
   discipline rather than getting a pass because they're "internal"),
   `CalibrationSession`/`CalibrationResult` (structurally distinct from
   `SensorySession`/`Assessment` — a calibration session tests a panelist's
   demonstrated ability against a known standard, it does not evaluate a
   product), and `EvaluatorSensitivityProfile` (composite-keyed on
   person + reference standard, tracks demonstrated threshold and
   `confidenceLevel` so a panel's aggregate results are traceable to
   tested, not assumed, perceptual ability — the same reasoning
   AROXA/FlavorActiV documentation gives for tracking per-panelist
   anosmia).
8. **Calibration gating reuses `sensory:manage_session`, no new
   permission.** Running a calibration program is the same
   panel-administration authority as running a judging session, already
   held by "Sensory Head Judge" — adding a dedicated permission would
   duplicate an existing authority boundary rather than express a new one.
   `lib/sensory/calibration.ts` gates every function through this single
   platform-scope check, matching the `competition:manage` pattern from
   ADR-034.
9. **`recordCalibrationResult` upserts `EvaluatorSensitivityProfile` as a
   side effect** — every recorded result updates the evaluator's
   `lastCalibrationDate` and `confidenceLevel` (`tested_once` → later
   results move it to `regularly_calibrated`), and updates
   `demonstratedThreshold` only when the result was both correctly
   identified and carries an `actualConcentrationPresented` value. A wrong
   or unmeasured result still records `lastCalibrationDate`/
   `confidenceLevel` (the evaluator was tested) without overwriting a
   previously-demonstrated threshold with a null.
10. **Minimal UI, not a full workflow builder** — `/calibration` (reference
    standards + calibration sessions, both list-and-add) and
    `/calibration/[id]` (results list + record-result form), matching the
    UI density of Competitions (ADR-034) rather than Sensory's full judging
    flow, since calibration is an admin/back-office activity, not a
    field-facing form.

**Verified**, live, against Neon: `npx tsc --noEmit`, `npm run lint`,
`npm test`, and `npm run build` all pass. Applied the schema migration,
ran the (idempotent) seed to confirm no duplicate `Organization` rows were
created and all 13 protocols (coffee, beer, mead, honey, 9 planned) exist
with the expected `standardSourceReference`/`status`/`section` values.
Created a real, clearly-labeled TEST `ReferenceStandard` and
`CalibrationSession` through the live UI, then recorded a `CalibrationResult`
against the existing DEMO Sensory Judge Person — confirmed the
`EvaluatorSensitivityProfile` upsert produced the expected
`demonstratedThreshold`/`confidenceLevel`, and that the session detail page
rendered the result correctly. All test data removed afterward.

**Consequences:** The Sensory module now ships genuinely differentiated,
honestly-attributed protocol content for four real categories instead of
one illustrative placeholder, and a real panel-calibration program instead
of just a descriptor list — closing the gap ADR-031 flagged between
"descriptor lists" and what UC Davis/AROXA/FlavorActiV-grade programs
actually require. Not built: any UI for editing/superseding a protocol
version (protocols are seed/service-created only, matching the admin-only
pattern used elsewhere), and no licensing relationship with SCA/BJCP/ISO
has been pursued — that remains the user's own action item per ADR-031.

---

## ADR-036 — Competitions operational layer (COMPETITIONS.md): accepted as
planning input; category-agnostic design confirmed; four gaps identified
(non-blocking)

**Context:** `COMPETITIONS.md` (committed separately) extends the
Competitions *entity chain* — already implemented per ADR-034 — with the
**operational layer**: roles (Organizer, Entries Receptionist, Cellar
Master), entry intake/check-in, blind coding at intake, pull sheets,
judge-facing sign-in/dashboard, Best of Show as a second judging round, and
a genuinely separate entry-fee payment system. Same discipline as every
other planning doc: **accepted as input, implementation deferred** —
nothing in this ADR builds any of it.

**Category-agnostic confirmation, explicitly requested and verified**: the
document's own opening section states its Beer Awards Platform research was
for *operational pattern* research only, and the entity structure it
proposes (`competitions.entry` extensions, `pull_sheet`, `judge_session`,
`bos_round`, `entry_fee_payment`) is built entirely on the existing
generic `Competition`/`CompetitionCategory`/`Entry` chain (ADR-034) with no
beer-specific field, enum, or default anywhere. Confirmed correct — a
honey or coffee competition uses identical infrastructure, differing only
in which `SensoryProtocolVersion` a category's judging reuses, exactly as
the document claims.

**Important framing correction, not a fault of the document**: the
document (and its accompanying prompt) describes Competitions as future
work "sequenced after Slice 6, not part of this roadmap's numbered
slices," accurate when `MVP_ROADMAP.md` was last in that state. As of
ADR-034, the core entity chain — `Competition → CompetitionEdition →
CompetitionCategory → Entry → CompetitionJudgeAssignment →
CompetitionResult → Award`, RBAC gating (`competition:manage`), and a
working UI — is **already implemented and live in production**. This
document's operational layer is additive on top of that existing
implementation, not describing not-yet-started work. Noted here so the
eventual implementation pass starts from the real current schema, not the
conceptual one in `DOMAIN_MODEL.md` §4 (see gap 1 below).

**Cross-checks requested (§1, §3, §6, §9), checked against the actual
implementation, not just the docs:**

1. **§1 (new roles as Role Profile data additions)** — confirmed
   consistent with `RBAC.md` §2/§5: `competition` is already a valid leaf
   scope type (`RBAC.md` §2, §3), and Organizer/Entries
   Receptionist/Cellar Master as competition-scoped Role Profiles is a
   pure data addition, no schema change, matching how every other
   project/session-scoped role already works. **Gap (naming, not
   RBAC-structural)**: the document's proposed `judge_session
   (judge_person_id, ...)` keys the judge by `core.Person`, but the
   already-implemented `CompetitionJudgeAssignment.userAccountId` (and
   `Assessment.evaluatorUserAccountId`) key by `core.UserAccount` — the
   login identity, not the biographical record. `judge_session` should key
   the same way for consistency (a Person without a UserAccount can't sign
   in or submit Assessments today), a one-line fix when this is actually
   built, not a structural conflict.
2. **§3 (blind coding at intake reuses RBAC.md §7; assignment vs. lookup
   permissions separated)** — the **lookup restriction** is real and
   already enforced exactly as claimed: `blind_mapping:view` gates every
   function in `lib/sensory/service.ts` that reads a
   `SensoryBlindMapping` row, and the Entries Receptionist profile the
   document proposes correctly excludes it. **Gap**: there is currently no
   runtime **creation** path for `SensoryBlindMapping` at all — every
   existing row is seed-created (`prisma/seed.ts`), not written through any
   service function or permission-gated action. The document's "assignment
   and lookup are different permissions" claim is the right design, but it
   describes a permission (something like `blind_mapping:assign`, distinct
   from `blind_mapping:view`) that doesn't exist yet in
   `lib/rbac/catalog.ts` — worth adding explicitly as a named permission
   when intake is built, not assumed to already exist.
3. **§6 (`bos_round` as its own entity, not an overloaded `Flight`)** — no
   naming or schema conflict: `SensoryFlight` is scoped to one
   `SensorySession.id` with no notion of rounds, rankings, or advancement,
   and `competitions.bos_round` lives in a different schema entirely.
   **Gap**: the document doesn't yet specify *how* a `bos_round`'s
   `entries` (category winners) actually get judged. `CompetitionCategory`
   already links to Sensory via `sensorySessionId` for its first round; a
   `bos_round` needs the equivalent link (its own `sensorySessionId`, most
   likely) so Best of Show judging still flows through the existing
   Sensory UI rather than becoming a second, undocumented parallel
   scoring path — which would violate the platform's own "no parallel
   scoring system" principle (`DOMAIN_MODEL.md` §4, restated in ADR-034
   decision 1). Worth specifying explicitly before implementation, not a
   blocker for accepting the document now.
4. **§9 (entry fees: genuinely separate `PaymentsProvider` instance, not
   shared with Commerce)** — the decision itself is sound and the
   `PaymentsProvider.createCharge/refund/getStatus` interface shape
   matches `INTEGRATIONS.md` §6 exactly. **Structural gap in the
   convention, not the decision**: `INTEGRATIONS.md` §1 currently
   describes one configured provider per capability directory via a
   single env-driven factory (`<capability>/index.ts`) — it doesn't yet
   describe how two independently-configured instances of the *same*
   interface (Commerce's Stripe config and Competitions' separate one)
   coexist. Resolution is straightforward (two capability directories, or
   a factory taking a named instance) but should be decided explicitly
   when built, the same way ADR-034 called out its own explicit exception
   to a general convention rather than silently deviating from it.
   Separately, confirmed `SECURITY.md` §6 already mandates audit rows for
   "every payment/refund event" *and*, independently, "every competition
   result change or judge assignment change" — both already-existing
   requirements the document correctly inherits. **One pre-existing gap
   found while checking this, unrelated to the new document**:
   `lib/competitions/service.ts`'s already-implemented `finalizeResult` and
   `declareAward` do not currently call `recordAuditEvent`, despite
   `SECURITY.md` §6 requiring it for "every competition result change."
   Not introduced by this document — flagged here because the operational
   layer will add several more audit-requiring actions (check-in,
   blind-code assignment, entry-fee payments) on top of an existing gap
   that should be closed at the same time, not compounded.

**Other cross-checks**: no conflicts found against `DOMAIN_MODEL.md`'s
conceptual entity chain beyond the framing correction above (§8's reuse of
the Story & Knowledge Engine for a competition website matches the existing
`Story`/`Project` pattern with no new module implied), or against
`RESEARCH_ACTIVITY_CRITERIA.md` (referenced only as example future context
for a Panama-style lager competition, not a functional dependency of this
document).

**Consequences:** Accepted as planning input for a future Competitions
operational-layer increment — not built by this ADR. Four concrete,
non-blocking items are now on record for whoever implements it: key
`judge_session` by `UserAccount` not `Person` (gap 1); add an explicit
`blind_mapping:assign`-shaped permission distinct from `blind_mapping:view`
for intake (gap 2); give `bos_round` its own `sensorySessionId` link before
building Best of Show judging (gap 3); decide the two-Stripe-instance
convention explicitly and close the pre-existing audit-trail gap in
`finalizeResult`/`declareAward` in the same pass (gap 4).

---

## ADR-037 — AI Persona, Modes, Knowledge & Tools Architecture: approved decisions

**Context:** `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md` §43 listed
seven open decisions after reviewing
`AI_PERSONA_MODES_KNOWLEDGE_TOOLS_PROMPT_CORRECTED.md`. All seven are
approved as recommended, resolved below. That document's status moves from
"awaiting product-owner approval" to approved; as with ADR-017/018/020,
approval covers architecture and sequencing only — nothing in it is
implemented, and no model SDK, embedding, retrieval pipeline, or permission
is created by this entry.

**Decisions (approved):**

1. Professional modes live as a **code-level registry** (a typed
   array/map, e.g. `lib/ai/modes.ts`), following the same "data-shaped
   constants in code" pattern `lib/rbac/catalog.ts` already uses — not a
   database table, not admin-editable at runtime. Approved. `RBAC.md` §2
   makes Role Profiles data because CLAUDE.md requires non-developers to
   add roles without a deploy; that requirement does not extend to
   prompt/product surface, which is the same category as email templates
   (`INTEGRATIONS.md` §5) and adapter capability interfaces
   (`INTEGRATIONS.md` §1), both already code in this architecture. Which
   mode(s) a given response used is recorded per response in
   `ai.recommendation.context` (already `jsonb`, no schema change).

2. `knowledge.*` is a **new schema, structurally parallel to but distinct
   from `external.*`** (`EXTERNAL_DATA_ARCHITECTURE.md` §7) — approved,
   explicitly rejecting folding textual knowledge sources into the
   external-data design. The two answer different questions and carry
   different shapes: `external.*` stores observations (value, unit, place,
   time), `knowledge.*` stores documents and claims. The licensing/access
   column shape is copied from `external.license` — that is the reuse that
   matters, not a shared table.

3. **MVP mode set: FIELD, OPERATOR, SENSORY, COMPETITION, COMMERCE, and a
   general DISCOVER mode** — approved per §40. RESEARCH, FERMENTATION,
   BREWING, and CONSULTING are explicitly deferred until their underlying
   modules exist, and stay marked `groundingStatus = not_yet_grounded`
   until then, with the intent router declining to route to them with
   fabricated confidence. No business reason was identified to build
   persona/routing for a mode ahead of its module. Each becomes `live` on
   its module shipping, with no change to the mode's persona or tool
   definition — only its grounding flag.

4. **`ai:converse` is a real new permission**, platform-scoped, distinct
   from the existing `ai:review_suggestion` (who may review AI-written
   output) — approved. Held initially by **Platform Admin and Content/Ops
   Coordinator**, the same two profiles that already hold
   `ai:review_suggestion`. Explicitly not defaulted to "every
   authenticated user"; widening is a later decision to make deliberately
   once real responses have been read. To be added to
   `lib/rbac/catalog.ts` when Ask Néctar is actually built, not now.

5. **No bulk knowledge ingestion — source registration only** until
   retrieval and citation rights are individually confirmed per source
   (§8, §38) — approved. `knowledge.source.retrieval_allowed` and
   `citation_allowed` are hard gates checked before any retrieval job
   runs, not documentation notes, mirroring
   `EXTERNAL_DATA_ARCHITECTURE.md` §24's enforcement pattern for external
   datasets. This applies with particular force to BJCP, SCA, WSET, and
   Cicerone material, whose proprietary status is already flagged in
   `BEVERAGE_SENSORY_PROTOCOLS.md` §1. A registered source with citation
   permitted and retrieval not assumed is the platform's representation of
   a pending licensing question — if a license is later obtained, that is
   a column change on one row plus a reference to the actual grant, not a
   new mechanism.

6. **Anthropic Claude remains the default `AIProvider`**, per ADR-011 and
   `PLATFORM_OVERVIEW.md` §8 — approved, confirming the existing decision
   rather than reopening it. No new information has arrived that would
   trigger re-evaluation. Provider independence is preserved by the
   adapter boundary (`INTEGRATIONS.md` §7, CLAUDE.md §42), so comparing or
   switching providers later remains a configuration change, not a rewrite
   of the routing/mode/tool logic.

7. **`ai.recommendation.decision_reason` is added at Foundational-phase
   time, with its taxonomy left open** — approved. The column is additive
   and nullable (a one-column migration, no backfill). The reason
   vocabulary suggested in §30 (incorrect, unsupported, irrelevant, too
   generic, too technical, too simplified, wrong tone, missing source,
   better alternative) is treated as a starting reference, not a fixed
   enum: the real taxonomy is derived from actual rejection reasons once
   there is review volume to learn from. Consistent with §30's own
   caution, historical user decisions never retroactively upgrade a past
   record's `provenance_class`.

**What this unblocks:** `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md`
is now an approved architecture document and can be cited as authority.
This specifically unblocks the brand/marketing review
(`BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md`, not yet written), whose
own required conflict check — per its input document's §98 item 11 —
requires that its AI marketing guardrails and Ask Néctar marketing mode
defer to `AI_GOVERNANCE.md`'s suggestion lifecycle and to this document's
Commerce/Tourism mode definitions rather than defining a parallel AI
behavior model for marketing.

**Not decided here:** model selection specifics, prompting strategy, and
cost/latency trade-offs remain implementation details of the AI slice's own
design notes (`AI_GOVERNANCE.md` §9, this document's §39). The first real
`AIProvider` implementation, the intent router, and the mode registry are
Foundational-phase work (§41) to be kicked off explicitly, not started by
this approval.

---

## ADR-038 — T9.5: provenanceClass required, no default; operatorPersonId
confirmed as the sole observer field

**Context:** `5ceed23` (the verification-pass fix) added `sourceReference`
to the five Phase 1 traceability tables (`LotTransformation`,
`QuantityEvent`, `Measurement`, `HarvestEvent`, `ReceivingEvent`) and
threaded `provenanceClass` as a parameter through all twelve write
functions across `lib/traceability/*.ts`. What it did not do — and what
this ticket (`docs/architecture/14_T9.5_PROVENANCE_RETROFIT_PROMPT.md`)
exists to fix — is remove the fallback. Every one of those functions still
declared `provenanceClass?: ProvenanceClass` and resolved it with
`input.provenanceClass ?? "direct_observation"`. No caller anywhere passed
a value; every row written by T1-T10, including everything T10's eight new
routes produced, silently asserted `direct_observation` — the strongest
class in the vocabulary — regardless of whether anyone actually observed
anything. `DATA_ARCHITECTURE.md` §4 requires unknown provenance to surface
honestly as `data_quality = 'missing_source_record'`, never a sentinel; a
default that silently claims the strongest class is exactly that sentinel.

**Decision 1 — required, not nullable.** `provenanceClass` is now a
required field with no schema default (`ALTER COLUMN ... DROP DEFAULT`,
migration `20260811100000_provenance_class_required`) and no `?` in any
`lib/traceability/*.ts` input interface. Every one of the twelve write
functions removed its `?? "direct_observation"` fallback.

Rejected alternative: making the column nullable, carrying "unknown" as
`data_quality = 'missing_source_record'` per `DATA_ARCHITECTURE.md` §4.
Reasoning for required over nullable:

1. CLAUDE.md §3 — "never automatically infer missing factual values and
   save them as facts" — applies here too. A nullable column with no
   forcing mechanism doesn't remove the silent-omission failure, it just
   changes its shape: rows would sit at `null` forever, for the same
   reason they sat at `direct_observation` forever — nothing forces a real
   choice either way.
2. Required makes the TypeScript compiler the enforcement mechanism. Every
   call site — all twelve service functions and all ten call sites in
   `app/actions/traceability.ts` — fails to build until it states a real,
   justified class. That is strictly stronger than a runtime convention
   that depends on every future author remembering to fill in a nullable
   field.
3. Nullable would require adding a `dataQuality` column to three tables
   that don't have one today (`LotTransformation`, `HarvestEvent`,
   `ReceivingEvent`) purely to carry the "missing" state honestly — more
   schema surface for a problem the required approach avoids by
   construction.
4. Required forces exactly the analysis this ticket asks for: a stated,
   per-operation class at every call site, not a table of "null for now."

All five tables were empty in production at the time of this migration
(verified live against Neon — zero rows in `lot_transformation`,
`quantity_event`, `measurement`, `harvest_event`, `receiving_event`, and
zero rows in `lot` itself). T10's verification fixtures were fully cleaned
up; no real operator data existed yet. The migration was therefore
unconditionally safe — nothing to backfill or reclassify.

**Decision 2 — `operatorPersonId` is the observer field; `recordedBy` is
explicitly rejected.** The prompt that originated this ticket first asked
for a new `recordedBy` field, distinct from `createdBy`. That request was
itself a mistake, caught before implementation: `operatorPersonId` already
exists on the input interfaces in `lots.ts`, `harvest.ts`,
`measurements.ts`, `fermentation.ts`, `drying.ts`, and `samples.ts`, is
already genuinely independent of `createdBy` (a `Person` FK vs. a
`UserAccount` FK), and does exactly the job `recordedBy` would have
duplicated. Creating a second field for the same concept is the specific
category of error this platform's data architecture is disciplined
against. No `recordedBy` or `recordedAt` field was added; `occurredAt` and
`createdAt` already cover the timestamps.

The gap was never the field — it was that no call site ever supplied it.
Before this ticket, `grep` confirmed every T10 write path passed
`operatorPersonId` through as `null`, so the divergence the schema already
supported was unreachable from any UI. This ticket makes it reachable on
measurement entry (`app/components/traceability/MeasurementForm.tsx`): a
new "Observed by" select, defaulting to the logged-in user's own `Person`
(via a new `getObserverCandidates` in `lib/traceability/lots.ts`, sourced
system-wide — same "convenience, not security boundary" reasoning already
used for `getManageableContext`'s Location dropdown), changeable to any
other active `Person` in two taps. No other write path gained a UI
override in this pass — deliberately minimal, per the ticket's own
constraint (§4) not to design a general provenance-capture UX ahead of
`16_ADAPTIVE_OPERATOR_WORKSPACE_PREAMBLE.md`'s research.

**Decision 3 — per-operation provenance classes, chosen at the action
layer, not the service layer.** `app/actions/traceability.ts`'s ten call
sites now each state an explicit class:

| Call site | Class | Reasoning |
|---|---|---|
| `recordHarvestAction` | `measured_fact` | Cherry weight/brix/temperature are instrument readings taken at receiving. |
| `recordReceivingAction` | `measured_fact` | Same reasoning — a delivery weight is a scale reading. |
| `recordMeasurementAction` | UI-selected, default `measured_fact` | The one path with a real operator-facing choice; see Decision 2. |
| `startFermentationAction` | `original_record` | Starting a run is an action taken, not something measured. |
| `endFermentationFormAction` | `original_record` | Same — ending a run is an action, also seeds the output lot's QuantityEvent with the same class. |
| `startDryingAction` / `endDryingFormAction` | `original_record` | Same reasoning as fermentation. |
| `createSampleAction` | `original_record` | Extracting a sample is an action taken against the source lot. |
| `recordStageChangeFormAction` (split/merge/blend/stage_change) | `original_record` | A transformation record is an original record of an action, not a measurement. |

`recordFermentationInterventionFormAction`, `recordDryingTurnFormAction`,
and `recordStorageMoveAction` are unchanged — `FermentationIntervention`,
`DryingTurnEvent`, and `StorageAssignment` carry no `provenanceClass`
column and are out of this ticket's five-table scope.

**Tests added** (`tests/traceability/measurements.test.ts`, describe block
"T9.5"): one asserting a chosen `provenanceClass` (`scientific_evidence`,
`interpretation`) persists exactly as given and never lands on
`direct_observation`; one asserting `operatorPersonId` and `createdBy` can
hold two different people on the same `Measurement` row — the case that
was structurally supported but practically unreachable before this ticket.
One pre-existing test (`lots.test.ts`, "verification-pass fix:
provenanceClass/sourceReference default sensibly...") asserted the exact
fallback behavior this ADR removes; it was rewritten rather than deleted,
now asserting the value passed through is honored verbatim with no
fallback of any kind.

**Remaining open item, explicitly out of scope here:**
`PHASE_1_TECHNICAL_EXECUTION_PLAN.md` §6.3's six sensory tables
(`Assessment`, `AttributeResponse`, `PanelResult`, `CalibrationResult`,
`CompetitionResult`, `FieldSubmission`) do not carry `provenanceClass` and
were not touched by this ticket, which is scoped to the five Phase 1
traceability tables only. They remain a known gap for a future pass.

---

## ADR-039 — Platform v1 defined by falsifiable test, not feature list;
T11 and Notification deferred to v1.1

**Context:** `CLAUDE.md` specifies an enterprise-scale platform across 63
sections; only a fraction is built, by design (§53's vertical-slice
strategy). "CLAUDE.md complete" is not a usable v1 definition — scoped
that way, v1 never ships. A feature list is no better: every line becomes
a negotiation and scope drifts upward without anyone deciding it should.

**Decision: v1 is defined by a falsifiable test.**

> Can the platform carry one real 2026 harvest from cherry through to a
> cupping score and a lot report that could actually be sent to a client?

If something is required to pass this test, it is in scope. If it is not,
it is out — regardless of how well-specified it already is elsewhere in
the architecture set.

**In scope, confirmed by the mapping below:** Phase 1 Traceability T6-T10
(built), T9.5's provenance retrofit (built, this session), T12 (Sensory
linkage panel), T13 (Lot Summary Report), T14 (Full E2E test + DEMO seed).

**Deferred to v1.1 or later, one explicit logged decision — not an
omission.** The point of logging what is deliberately not being built is
that it cannot quietly return later without a stated reason:

- **Research OS / CryoBloom migration**, including its Equipment/
  Calibration readiness objects (`CLAUDE.md` §17) — real, specified,
  not required to carry a coffee harvest.
- **Apiary/honey structured schema** — architecture-only per
  `DOMAIN_MODEL.md` §4, no tables exist, not required.
- **Fermentation beyond coffee** — the fermentation infrastructure built
  (T6) is coffee-scoped for v1; generalizing it is real future work.
- **Environmental/time-series data** — no sensor or logger ingestion in
  v1; `Measurement`'s `sourceType` values beyond `manual` remain
  unexercised by design (T3).
- **Role-specific dashboards** (`CLAUDE.md` §47) — v1 has the Operator
  Workbench (T10); executive/research/commerce dashboards are later.
- **Global search** (`CLAUDE.md` §33) — not required to carry one named
  harvest through a system an operator already knows how to navigate.
- **Full offline/PWA** (`OFFLINE_FIELD_CAPABILITY.md`) — specified,
  deferred; v1's operator UI assumes connectivity.
- **Native mobile** — the PWA-first strategy (`CLAUDE.md` §39) already
  defers this beyond v1.
- **Data import/export** (`CLAUDE.md` §45-46), including PDF export of
  the Lot Report — not required by the test as literally stated (see the
  print-friendly-page reading below).
- **T11 (Process/Deviation tracking).** Not required by the test: a
  harvest with zero recorded deviations (the common case) still produces
  a valid cupping score and lot report. T13's own DoD list — "origin/
  lineage/processing/measurements/samples/sensory" — never names
  deviations as a rendered section, even though the existing dependency
  graph lists `T11 → T13`. That dependency looks inherited from
  ticket-sequencing order (T11 was slotted before T13 in the original
  14-ticket list) rather than a genuine data dependency. **Action taken:**
  the dependency graph in `PHASE_1_TECHNICAL_EXECUTION_PLAN.md` §35 is
  corrected — `T13` depends on `T10` and `T12` only, not `T11` — and T11's
  deferral is recorded in the plan document itself, marked deferred (not
  cancelled), on the v2 list. T11 remains real, scoped, and worth
  building; it is simply not gating v1.
- **`Notification`.** Real leverage (Operator Mode's digest framing,
  tourism waitlist claim windows, field-study reminders, Alert delivery)
  but not required by a single-harvest walkthrough — an operator can
  check Lot Detail manually for the one harvest the test describes.
  Recommended **out** of v1, revisited once operator count or alert
  volume makes manual checking impractical (a v1.1-scale problem, not a
  v1 one).

None of the above is required to carry one harvest end to end. All remain
real, specified, and undiminished for later phases — deferral is a
sequencing decision, not a judgment that the work doesn't matter.

**Decided: "sent to a client" means a print-friendly authenticated page,
not an export pipeline.** "A lot report that could actually be sent to a
client" was ambiguous between (a) an exported file (PDF) a staff member
forwards, (b) a clean, printable authenticated web page (browser
print-to-PDF suffices), and (c) a genuine external share link requiring
no login. Confirmed reading for v1: (b) — T13's Lot Report is designed
print-friendly from the outset (its own definition of done now states
this explicitly, `PHASE_1_TECHNICAL_EXECUTION_PLAN.md` T13 row), which is
zero extra cost done up front and real rework if retrofitted later. (a)
PDF export and (c) login-free external client access are real future
capabilities (`CLAUDE.md` §46 Exports; a genuine external client portal)
but neither is required by the test as literally stated, and neither is
built by any T6-T14 ticket — both remain on the deferred list above.

**Status-accuracy findings (verified live, not from prior session notes):**

1. **Credentials**: Vercel production (`vercel env ls production`) has
   only `DATABASE_URL` and `AUTH_SECRET` set. None of
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the four R2 variables, or
   Google OAuth credentials exist in production (or, per prior
   `GAP_ANALYSIS_2026-08-10.md` findings, locally). Unchanged since that
   report.
2. **Commerce/Experiences never exercised past DEMO content-level rows**:
   `commerce.product_variant` has zero rows (confirmed live) —
   `core.product` has 2 DEMO rows, but no variant/SKU/price has ever been
   created for either, by design (`prisma/seed.ts`'s own comment:
   "`priceAmount` stays null — CLAUDE.md §54," matching ADR-025 decision
   10 / ADR-028 decision 8's no-fabricated-pricing rule). Same pattern for
   Experiences: `core.experience` has 2 DEMO rows, `experiences.
   experience_session` has zero. No Stripe checkout or booking path has
   ever run against real data, consistent with finding 1 (no Stripe keys
   configured anywhere to run one).
3. **Partner Workspace media**: `core.asset` has zero rows. No object-
   storage round trip has ever completed, consistent with finding 1 (no
   R2 credentials configured anywhere to complete one).

None of this blocks v1 — the falsifiable test does not touch Commerce,
Experiences, or Partner Workspace media. It is stated here because v1
scope decisions should be made knowing which adjacent paths are proven
versus unexercised, not assumed.

**Traceability chain status** (the actual v1 surface): `core.location`
(7 rows), `core.project` (1), `core.organization` (3) carry real DEMO
seed data; `traceability.lot` and its dependent tables are empty in
production as of this ADR — expected, since T10's verification fixtures
were cleaned up and no real 2026 harvest has been entered yet.

**Explicit clause — capability versus completion.** Building T6-T14 plus
the provenance retrofit gives the platform the *capability* to carry a
harvest end to end. It does not, by itself, constitute *having done so*.
The Part B test is answered truthfully only once an actual 2026 harvest
has been entered by a real operator, once T12-T14 ship — a real
operational event, not a ticket closing. A v1 that is declared complete
because every ticket is checked off, but that no real harvest has ever
actually passed through, is **not** a v1 that has passed its own test —
it is a v1 that has been declared complete and never used, which is the
specific failure mode this project is most exposed to, and the one most
likely to be forgotten first once the ticket list is empty. This
distinction is recorded here, in the decision log, precisely so it
survives past the session that wrote it: **"all tickets closed" and
"the test in Part B answered yes" are not the same claim, and only the
second one is v1.**

---

## ADR-040 — Amendment to ADR-026/031/035/036: real honey/mead content
verified, no schema/RBAC conflict, copyright boundary held

**Context:** commit `4080633` updated three already-accepted planning
documents with real content received directly (not researched):
`BEVERAGE_SENSORY_PROTOCOLS.md` (100-point honey competition rubric,
three-tier defect taxonomy, `apiary.field_sample` intake schema, AESHI
mead classification/specs/fermentation-phase model), `COMPETITIONS.md`
(confirming the honey/mead examples reference real, not placeholder,
scoring content), and `TOURISM_EXPERIENCES.md` (new §13 documenting the
real mead-making course, renumbering old §13 Sequencing to §14). This is
an amendment to the documents' existing acceptance record — `TOURISM_
EXPERIENCES.md`'s original acceptance is ADR-026; `BEVERAGE_SENSORY_
PROTOCOLS.md`'s is ADR-031 (accepted) and ADR-035 (partially
implemented); `COMPETITIONS.md`'s is ADR-036 — not a fresh acceptance
entry.

**Verification performed, per the five items named when this content was
handed off:**

1. **Rubric/classification integration**: conceptually clean, not yet
   implemented. ADR-035 implemented Honey's general four-category
   structure (visual/olfactory/olfactory-gustatory/tactile) and Mead's
   Aroma/Appearance/Flavor/Mouthfeel shape using the existing generic
   `SensoryProtocol`/`SensoryAttribute`/`Assessment` mechanism — confirmed
   live (`grep` against `prisma/schema.prisma`) that none of this
   commit's new content (`honey_competition_score`,
   `mead.style_classification`, `apiary.field_sample`,
   `honey_descriptor`) has been implemented; these remain markdown-
   sketched shapes. **One real design question surfaced, not silently
   resolved**: the honey competition rubric is sketched as a bespoke
   6-column table, but the platform's own governing principle (`CLAUDE.md`
   §49, already realized for Coffee/Beer/Mead/Honey-general in ADR-035) is
   to avoid a hardcoded per-category scoring table — the more consistent
   implementation, when built, is six `SensoryAttribute` rows under a new
   "Honey Competition (100-pt)" `SensoryProtocolVersion`, reusing the
   mechanism already proven rather than adding a parallel one. Flagged for
   the implementer to decide at build time, not decided here.
2. **`apiary.field_sample` vs. `SPECIMEN_AND_MATERIAL_TRACEABILITY.md`'s
   `Specimen`/`SpecimenObservation`**: genuine overlap, not a conflict —
   both remain unimplemented. Recommendation, not a merge: keep them
   separate (`field_sample` describes one honey sample's lab/intake data;
   `Specimen` describes one individually-tracked tree's bloom timing —
   different semantics, per `DOMAIN_MODEL.md` §20's own "diverge enough,
   keep separate" principle already applied elsewhere in both documents).
   The connection is the correlational many-to-many link
   `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §3 already proposes
   (`primary_forage_specimen_ids`), with `field_sample.pollen_analysis`
   serving as the analytical evidence a human would use to decide which
   Specimens are plausible forage sources — not a new linking mechanism,
   and not a field-level merge.
3. **`COMPETITIONS.md`'s honey/mead references checked against the actual
   updated rubric/taxonomy**: accurate. The cited 100-point breakdown
   (Aroma 20/Sabor y Gusto 20/Textura y Boca 15/Apariencia 10/
   Persistencia y Equilibrio 15/Ausencia de Defectos 20, tiers 90-100
   Excelente down to <70) and the "Melomel — Semi Dulce" example division
   both match `BEVERAGE_SENSORY_PROTOCOLS.md`'s actual content exactly —
   no fabricated or mismatched cross-reference.
4. **`TOURISM_EXPERIENCES.md` renumbering (old §13 Sequencing → new
   §14)**: confirmed clean. Repo-wide search for any citation of
   `TOURISM_EXPERIENCES.md §13` (or any other specific section number of
   this document) found none outside the prompt file describing this same
   update — no citation broke.
5. **Copyright boundary — AESHI Chapter IV (BJCP-sourced organoleptic
   content) exclusion**: verified respected, not just stated. Direct read
   of the new mead content (raw material specs, finished-product specs,
   fruit/cereal sugar rules, water chemistry targets, fermentation-phase
   model, yeast species) confirms it is regulatory/compositional/
   biological content, not organoleptic scoring language — a targeted
   search for BJCP scoresheet vocabulary (diacetyl, estery, phenolic,
   DMS, oxidized, "off-flavor," point-allocation language) across the new
   content returned zero matches. One borderline passage noted: the water
   chemistry section uses perceptual language ("adds smoothness/perceived
   sweetness," "adds astringency/perceived bitterness") — read as general
   production science explaining water chemistry's effect on the product,
   not judging-rubric descriptor language, and not drawn from a
   scoresheet structure. Does not cross the excluded boundary.

**No implementation in this ADR** — matches the source content's own
framing ("this remains planning-doc content"). `PHASE_1_TECHNICAL_
EXECUTION_PLAN.md`'s Traceability tickets do not touch Sensory/
Competitions/Tourism; this amendment changes nothing about Phase 1
sequencing.

---

## ADR-041 — Four planning docs accepted: map & territory, offline field
capability, Drive organization scheme, tourism design resources

**Context:** Four architecture planning documents were added to
`docs/architecture/`, each ending with "Log acceptance in `DECISIONS.md`"
and none previously logged (documentation correction pass, Part D item
1):

1. `MAP_AND_TERRITORY.md`
2. `OFFLINE_FIELD_CAPABILITY.md`
3. `DRIVE_ORGANIZATION_SCHEME.md`
4. `TOURISM_DESIGN_RESOURCES.md`

Same pattern as every prior planning-doc batch (ADR-017/018/019/020/026):
**accepted as domain-model/planning input, implementation deferred** —
none of the schema or process described below is built by this ADR.
Cross-checked against `DOMAIN_MODEL.md`, `RBAC.md`, `DATA_ARCHITECTURE.md`,
and each other for conflicts; none found.

**Decisions:**

1. **`MAP_AND_TERRITORY.md` accepted.** A rendering-layer specification
   over already-modeled entities (`Location`, `Specimen`, `Experience`
   routes) — no new canonical entity, no schema conflict. Its Sentinel
   Hub/Copernicus NDVI layer and licensing-discipline references now
   correctly point at `EXTERNAL_DATA_ARCHITECTURE.md` (corrected this
   same pass — see Part C above). Static-export attribution requirement
   is a real licensing-compliance need, not a design preference, and is
   logged as such.
2. **`OFFLINE_FIELD_CAPABILITY.md` accepted.** Cross-cutting PWA/service-
   worker infrastructure (`offline.draft_record`, `offline.sync_conflict`)
   — genuinely new schema, no overlap with anything built. Its conflict-
   resolution model (both competing versions preserved for human review,
   never last-write-wins) is a direct, correctly-scoped application of
   the version-preservation principle already running through the
   platform (`CLAUDE.md` §3, `DATA_ARCHITECTURE.md` §2's `superseded_by`
   pattern) — not a new philosophy invented for this one case. Confirmed
   as the document `MAP_AND_TERRITORY.md` §7/§12 and
   `GUIDED_FIELD_STUDY_TOOL.md` §8 both already defer their own offline
   requirement to, rather than duplicating it.
3. **`DRIVE_ORGANIZATION_SCHEME.md` accepted.** Addendum to
   `MEDIA_INTELLIGENCE_PIPELINE.md`, grounded in a real audit of the
   actual shared Drive (2026-08-10) — no schema of its own; specifies a
   target folder structure and an ID/naming convention
   (`[PROYECTO]-[SERIE]-VOL[N]`, `[PROYECTO]-[AAAA]-[SEQ]`,
   `[LOTE]-[PROCESO]-[SEQ]`) that `MEDIA_INTELLIGENCE_PIPELINE.md` Phase A
   ingestion should apply once real server-side Drive write credentials
   exist. Historical codes are explicitly not rewritten retroactively —
   consistent with the platform's own no-silent-mutation discipline
   applied to an external system, not just internal data.
4. **`TOURISM_DESIGN_RESOURCES.md` accepted.** New `resources.
   tourism_design_module`/`tourism_design_exercise` tables, Partner-
   Workspace-scoped (`Partner Field Collector`, `Research Contributor`,
   and above — `RBAC.md` §5, no new permission needed). Grounded
   primarily in SERNATUR's citation-licensed manual plus two applied
   works from a named, credentialed practitioner (Victor Jiménez Ayres) —
   every module carries a populated `source_attribution` field, and
   third-party framework content (Hackéate's propósito/vínculo lens) is
   described in the platform's own words rather than reproduced, matching
   this platform's general copyright discipline. §2c's cross-producer
   "beer route" map extension is explicitly flagged as a future
   opportunity, not built here — correctly left out of this acceptance.

**Consequence:** all four documents move from "awaiting acceptance" to
accepted planning input; sequencing (Slice 5 for offline/Partner-Workspace-
scoped work, rendering-layer work for the map, Phase A ingestion for the
Drive scheme once credentials exist) stays exactly as each document's own
§`Sequencing` already states — this ADR does not change build order, only
records that the input itself is accepted.

---

## ADR-042 — Publer adopted for social publishing/distribution/analytics,
reversing the earlier Meta Business Suite preference

**Context:** `NECTAR_NOMADA_BRAND_MARKETING_COMMUNITY_SALES_INPUT_
CORRECTED.md`'s own opening states this explicitly reverses a prior
decision and asks for its own `DECISIONS.md` entry — logged here as part
of the documentation correction pass (Part D item 2), since a search of
this file for "Publer" previously returned nothing.

**What it reverses:** an earlier operating preference to avoid paid
social-scheduling subscriptions, favoring Meta Business Suite over
Publer/Buffer. That preference was never itself logged as its own ADR —
it was an informal operating decision, not a documented one — so this
entry is both the first formal record of the tool choice and the record
of what it replaces.

**Decision:** Publer adoption is confirmed. Publer is scoped narrowly, per
the source document's own framing: a **replaceable social publishing,
distribution, and analytics adapter** — implementing the platform's
`PaymentsProvider`-style adapter discipline (`INTEGRATIONS.md`), not a
piece of canonical domain data. Néctar Nómada's own platform remains
authoritative for brand identity, brand voice, canonical facts, approved
claims, audience strategy, campaigns, original media, customer identity,
sales, bookings, consulting inquiries, CRM, community intelligence,
attribution, learning, rights, and AI governance — Publer only executes
scheduling/publishing/analytics on top of that, and canonical
campaign/content data must survive a Publer failure (the source
document's own §22), never living only in Publer.

**No implementation in this ADR.** `NECTAR_NOMADA_BRAND_MARKETING_
COMMUNITY_SALES_INPUT_CORRECTED.md` is itself marked "architecture input
only — do not implement directly," and no Phase 1 Traceability ticket
touches Marketing/Community — this decision does not change current
build sequencing.

---

## ADR-043 — T12: `getSensoryLinkageForSamples` gated by `lot:view`, not
`blind_mapping:view`

**Context:** `RBAC.md` §7 restricts every function in `lib/sensory/
service.ts` that would reveal a `SensoryBlindMapping` row to callers
holding `blind_mapping:view` — the permission only "Sensory Head Judge"
holds (`lib/rbac/catalog.ts`), never "Sensory Judge" and never "Farm
Operator." T12's Lot Detail Sensory panel needs to show a Farm Operator
their own lot's cupping score, which reads through `SensoryBlindMapping`
to reach the `PanelResult` it points at — a literal reading of §7 would
require `blind_mapping:view` here too, which Farm Operator does not and
should not hold. This decision was made and implemented during T12
(`lib/traceability/lots.ts`'s `getSensoryLinkageForSamples`, plan doc's
T12 implementation note) but never recorded as its own ADR — this entry
closes that gap (`21_T12.5_MEDIA_ATTACHMENT_PROMPT.md` §8 flagged it as
still open going into T12.5).

**Decision:** `getSensoryLinkageForSamples` is gated by `lot:view` alone
— already checked by its only caller, `getLotDetail`, before this
function ever runs — not `blind_mapping:view`.

**Why this does not weaken §7.** §7's restriction exists to keep a
*judge* from learning which real sample a blind code maps to *before or
during scoring* — the whole point of a blind evaluation is that the judge
scoring a sample cannot trace it back to a producer while their judgment
could still be influenced by that knowledge. It has never been a rule
that a finished, computed result must stay hidden forever from the
operator whose lot produced it. `getSensoryLinkageForSamples` is not
reachable by a judge mid-session and is not called from any code path
`lib/sensory/service.ts` owns — it is a read exposed only through
Traceability's own Lot Detail aggregation, to the operator of that
specific lot, after scoring is complete.

**The explicit limit, stated so it survives past this session.** This
function returns exactly two things and nothing else: an aggregate
`PanelResult` (`meanValue`/`minValue`/`maxValue`/`responseCount`, the
`attributeId: null` overall row only) and the session's own `name`/
`status`. It **never** returns `blindCode`, the `SensoryBlindMapping` row
itself, or any individual `Assessment`/evaluator identity — verified by
re-reading its Prisma `select` (`lots.ts`), which has no path to any of
those three. A future addition to this function's returned fields must
not widen past that limit without a new, explicit decision — "it already
bypasses `blind_mapping:view`" is not license to add more through the
same door.

**Scoping, verified rather than assumed.** `getSensoryLinkageForSamples`
takes only `sampleIds`, no user or scope argument of its own — its only
caller, `getLotDetail`, has already run `requireLotAccess(userAccountId,
"view", ...)` for the one lot in question, and passes only
`samples.map((s) => s.id)` — the Samples already scoped to that lot via
`sourceLotId: lotId`, not sample IDs from anywhere else. There is no
path by which this function is called with another operator's sample
IDs; leaf-scope containment (`RBAC.md` §3) governs which lots
`requireLotAccess` allows in the first place, and this function inherits
that scoping structurally rather than re-checking it. `tests/
traceability/lots.test.ts`'s new "T12 boundary" describe block pins both
claims (the field-level limit and this scoping) as regression tests,
closing the second item `21_T12.5_MEDIA_ATTACHMENT_PROMPT.md` §8 flagged
as open.

**Also deliberately does not check `SensorySession.classification`**
(defaults `internal`) against the caller's `classification:clear_*`
grant — gating is purely "has a `PanelResult` been computed," matching
T12's own "shows its PanelResult; one without shows nothing" framing. If
that turns out to be the wrong call in practice, it is a one-line `can()`
addition, not a schema change — noted here, not resolved, since no
concrete case has required it yet.

---

## ADR-044 — Amendment to ADR-039: the capture-or-lose-it clause;
labour-time and material-consumption capture (T12.6) enters v1 scope

**Context.** `20_CAPTURE_OR_LOSE_IT_PROMPT.md` asked a narrow question
ahead of the 2026 harvest: what is the minimum set of operator-workbench
fields that must exist before the season starts, so its true operational
economics can be reconstructed later, even though the analysis itself
won't be built until v2? The governing principle: money can be applied
retroactively (a labour rate can be decided in 2027 and multiplied
against hours recorded now); physical and temporal facts cannot (if
nobody records that a fermentation took eleven hours of attended work,
no future system recovers it). The resulting read-only analysis
(`20_CAPTURE_OR_LOSE_IT_REPORT.md`) found labour time and batch-
identified material consumption both irrecoverable if not captured
during the harvest window, proposed a minimal schema and UX, and drafted
this amendment for review. It has now been implemented (T12.6) and this
entry formally appends that draft, confirmed against the live decision
log immediately before appending (ADR-043 was the prior last entry).

**The amendment itself.** ADR-039's deferral list (T11, Notification,
Research OS migration, etc.) shares one property: none of it forecloses
anything by waiting. A notification system built in v1.1 works exactly
as well as one built in v1; a deviation-tracking ticket added mid-
harvest doesn't lose deviations that hadn't happened yet.

Labour time and batch-identified material consumption during the 2026
harvest do not share that property. Neither is required by the v1
falsifiable test (a cupping score and lot report need neither), so by
the test alone both would defer exactly like T11 and Notification. But
unlike every item on that list, the window to capture them closes
permanently on a fixed calendar (Panama's harvest, roughly November
2026–March 2027) — a labour tally not recorded during a January
fermentation cannot be added in March, let alone in 2027 when the v2
economics work is actually built.

**Decision: labour-time and material-consumption capture enter v1
scope, on this narrow basis — not because the falsifiable test requires
them, but because deferring them does not preserve the option the way
every other deferred item does.** This is the same reasoning already
applied to media attachment (T12.5, `21_T12.5_MEDIA_ATTACHMENT_PROMPT.md`)
— the two are independent applications of one principle, not two
unrelated exceptions. This amendment names that principle once: no
change to any other item on ADR-039's deferred list, no change to the
v1 test itself, one added criterion for what else can justify v1
inclusion beyond passing the test — irreversibility against a fixed
calendar window, argued explicitly, not invoked casually.

**What was actually built (T12.6), matching the source report's own
field spec.** Two new append-only `traceability` tables, no changes to
any existing table's required-ness:

- `LabourEntry` — specific nullable FKs per parent (`harvestEventId`,
  `receivingEventId`, `fermentationRunId`, `dryingRunId`; no `lotId` —
  every parent already sits on the genealogy DAG, ADR-020 decision 8's
  no-polymorphic-parent rule applied again), `workerCount`/`hours`
  required together, optional `taskNote`, an optional
  `providedByOrganizationId` in-kind flag, required `provenanceClass`
  (no default, ADR-038's reasoning applied a third time after Measurement
  and Asset), and a separate nullable `dataQuality` axis — deliberately
  distinct from `provenanceClass`: a same-day headcount tally and a
  next-morning recollection can both legitimately be `direct_observation`
  about what happened, differing only in how much the number is trusted
  (`verified` vs. `provisional`), which is a `dataQuality` distinction,
  not a `provenanceClass` one.
- `MaterialConsumptionEntry` — scoped to `fermentationRunId`/
  `dryingRunId` only (the two stages the source report names).
  `materialName`/`batchLabel` required — `batchLabel` is the one
  irrecoverable identity fact a fermentation result can't be fully
  interpreted without later; `quantity`/`unit` stay optional even once
  the form is open, since a fabricated precise number is worse than an
  honest blank (`DATA_ARCHITECTURE.md` §4). Free text, not an FK to a
  `Consumable` entity — none exists yet (`18_
  EQUIPMENT_AND_READINESS_PROMPT_REVISED.md` owns that model); no fourth
  inventory concept was created here, matching the source report's own
  hard constraint.

`provenanceClass` is fixed to `direct_observation` at the action layer
for every call site — not operator-selectable, since none of the six
attachment points (four for labour, two for consumption) has a
genuinely ambiguous provenance the way a lab-reported measurement
sometimes does; a picker here would be exactly the UI friction the
source report's §5 warns against.

Permission: `lot:manage`, reused rather than a new permission —
consistent with every other Traceability write function in this phase.

**UI, matching the source report's §3 exactly.** Both forms are small,
always-optional inline actions (never blocking `startFermentationAction`/
`endFermentationFormAction`/harvest or receiving recording), wired into
Lot Detail's Harvest section, a new Receiving section (added for this
ticket — Lot Detail had no such section before, since T12.5's photos
attach receiving-stage media via `lotId` directly and never needed one;
`LabourEntry` does carry a real `receivingEventId` FK per the source
report's own field spec, so a section exists here that T12.5
deliberately didn't need), and the existing Active Fermentation/Active
Drying sections. The golden path is two field-taps and one submit-tap
for labour (People, Hours) and four field-taps and one submit-tap for
consumption (Material, Batch label, Quantity, Unit — Unit pre-filled
`kg`), matching the source report's own tap-count analysis.

**Deliberately not captured, unchanged from the source report's §4**:
named individual identity (aggregate headcount only), clock-in/clock-out
timestamps, structured Resource/Equipment identity (`18_`'s job),
stock-linked material consumption, and labour/consumption during
Storage and Sample stages. Any monetary field remains entirely out of
scope — this is the governing principle itself, not a shortfall.

---

## ADR-045 — Incident: undefined-`where` unfiltered deletes during T14
verification; `assertDefinedWhere` adopted as a structural control

**Context.** During T14's own verification (`tests/traceability/e2e.test.ts`
against real Neon), a first test run hit Neon's cold-start latency against
Vitest's default 10s `hookTimeout`. `beforeAll` failed partway through,
after the harvest step had already assigned `cherryLotId` but before any
later step assigned `dryingStageLotId`, `greenLotId`, `sampleId`,
`protocolId`, `protocolVersionId`, `sessionId`, `flightId`, or
`blindSampleId` — those variables were left `undefined`. Vitest still ran
`afterAll` against this partially-populated fixture state, as it always
does regardless of how `beforeAll` exited.

**What happened.** `afterAll` called `prisma.panelResult.deleteMany({
where: { blindSampleId } })` and several structurally identical calls,
each keyed on a variable that was `undefined` at that point. Prisma's
client silently drops `undefined`-valued keys from a `where` object
before sending the query — `{ blindSampleId: undefined }` is not treated
as "match nothing" or "invalid input," it is treated as `{}`, which
`deleteMany` executes as an unfiltered delete of every row in the table.
Ten tables were wiped platform-wide in sequence —`panelResult`,
`sensoryBlindMapping`, `sensoryBlindSample`, `sensoryFlight`,
`sensorySession`, `sensoryProtocolVersion`, `sensoryProtocol`, `sample`,
`measurement`, `storageAssignment` — before the cascade reached
`quantityEvent.deleteMany({ where: { lotId: { in: [realId, undefined,
undefined] } } } )`, which threw. This is the one asymmetry that
actually stopped the cascade: Prisma validates array elements inside a
filter (`{ in: [...] }`) and rejects an `undefined` member, but performs
no equivalent check on a bare top-level key. The same silent-drop
behavior, applied inconsistently across the client's own input surface,
is what made the bug both possible and, briefly, invisible — every prior
call had returned normally, because an unfiltered `deleteMany` on an
already-matching-everything table does not itself raise an error.

Discovered via a read-only row-count check run immediately after the
failed test, disclosed in full to the user before any further action was
taken. No destructive action was taken to try to work around it.

**Why this class of bug is dangerous, not just this instance of it.**
Three properties compound: (1) the failure mode is silent at the call
site — no exception, no warning, the query simply runs with a different
`where` than the one written; (2) TypeScript's own types do not catch it
— every fixture-id variable in `e2e.test.ts` was declared `let x:
string`, which is true once `beforeAll` succeeds and false exactly when
it matters, so the type checker offered no protection against the actual
failure mode; (3) `deleteMany`'s blast radius scales with how wrong the
filter is, and an empty filter is the maximally wrong case — one missing
value converts a scoped cleanup into a platform-wide one. Nothing about
this is specific to `e2e.test.ts` — any `afterAll`/cleanup path anywhere
in the codebase that builds a `where` from variables assigned during
`beforeAll` carries the same latent risk the moment `beforeAll` can fail
partway through, which every real-Neon integration test can.

**Decision: adopt `assertDefinedWhere` as a required structural control
on every `deleteMany` (and, by the same reasoning, any other
unrestricted-by-default Prisma write) whose `where` is built from
variables that are not compile-time constants.** Not a convention, not a
review checklist item — a function every such call must be wrapped in,
so the failure mode is a thrown error at the call site instead of a
silent no-op filter.

`tests/helpers/assertDefinedWhere.ts` recursively validates a `where`
object: throws `UnsafeWhereClauseError` if the object is empty, or if any
value at any depth (including inside nested filter objects and arrays)
is `undefined`. `null` and empty `{ in: [] }` arrays are explicitly
allowed through — both are real, deliberate values a caller can mean, not
the missing-value case this guard exists to catch. Composes as
`deleteMany({ where: assertDefinedWhere({ ... }) })`, a minimal-diff
wrapper rather than a rewritten call. Applied retroactively to all 155
`deleteMany` call sites across all 12 test files with an `afterAll`
cleanup block, not only the three that actually fired during the
incident — every other site carried the identical latent risk, just
not yet triggered.

The guard's own correctness is pinned independently of any live incident
replay: `tests/helpers/assertDefinedWhere.test.ts` covers the guard in
isolation (empty `where`, top-level and nested `undefined`, one-
undefined-among-several, `null`/empty-array allowed, a fake `deleteMany`
proving rejection happens before the delete call is reached).
`tests/helpers/e2e-cleanup-failsafe.test.ts` goes further and calls
`e2e.test.ts`'s own real cleanup function (`cleanupE2eFixtures`,
extracted into the plain module `tests/traceability/e2e-cleanup.ts` so
importing it doesn't re-trigger `e2e.test.ts`'s own top-level
`describe`/`beforeAll`/`afterAll`) with the exact partial-fixture shape
the real incident produced, and confirms it throws
`UnsafeWhereClauseError` on `blindSampleId` — the actual first vulnerable
field. Run with zero database environment variables loaded at all, it
still passes, which is the direct proof the guard fails before any
network call is made, not merely before a destructive one reaches the
database.

**Alternatives considered.**
- *Per-call `if (!x) throw` guards at each of the 155 sites.* Rejected:
  the same omission that caused the incident (a variable assumed always
  defined) is exactly the kind of manual step a per-call guard depends on
  someone remembering to add at every new call site going forward. A
  composable function that every `deleteMany` is wrapped in cannot be
  individually forgotten in the same way once it is the established
  pattern.
- *Scope every `afterAll` behind a `try/catch` that skips cleanup on any
  `beforeAll` failure.* Rejected: this hides the underlying defect rather
  than fixing it, and does nothing for a `beforeAll` that partially
  succeeds without throwing (a slow step that returns a still-usable but
  wrong value, for instance) — the actual incident's `where`-shape defect
  would remain live.
- *Switch every `deleteMany` to explicit `id`-list deletes only, never a
  derived filter.* Rejected as disproportionate: several legitimate
  cleanup queries are relationally derived (`lotId: { in: allLotIds }`,
  `OR` across input/output joins) and cannot be reduced to a flat id
  list without losing what they're actually expressing; the defect is
  the possibility of an `undefined` value reaching Prisma silently, not
  the shape of the filter itself.

**Recovery.** The affected Neon database was restored via Neon's
point-in-time recovery from the console (performed by the operator, not
from this session — no Neon CLI/API credentials exist in this
environment). The restore did not fully recover DEMO-sourced content in
the affected tables; those rows were regenerated by re-running
`prisma/seed.ts` with `SEED_DEMO_CONTENT=true` after confirming directly
that the seed script contains zero `delete` calls anywhere in it. This
recovery method works specifically because the seed script is
idempotent-by-construction for the rows it owns (each `seedDemo*`
function checks for its own already-existing rows before creating new
ones) and because the real sensory-protocol content it seeds
(`sensoryProtocol`/`sensoryProtocolVersion`, added in commit `f1e87ae`)
is authored content reproducible from the script itself, not data that
only ever existed as rows in the database. Rows the seed script does not
source at all (`panelResult`, `measurement`, `storageAssignment` prior to
T14) were correctly identified as not recovered by this method — an
inherent property of what the script produces, not additional damage
from the incident.

**Consequences.**
- Every `afterAll`/cleanup path in this codebase that derives a `where`
  from `beforeAll`-assigned variables must use `assertDefinedWhere` (or
  an equivalent guard providing the same property) going forward; a new
  test file adding an unguarded `deleteMany` on such a variable is a
  regression of this decision, not a stylistic omission.
- Daily automated snapshots have since been configured on the Neon
  project (operator-configured, outside this codebase), narrowing future
  exposure between a similar incident and the nearest clean recovery
  point. This is a mitigation for the consequence, not a substitute for
  the guard — `assertDefinedWhere` prevents the class of query from
  executing at all; snapshots only bound how much would be lost if some
  future, structurally different bug got past it.
- The underlying Prisma behavior — silently dropping `undefined` object
  keys from a `where` clause while validating `undefined` inside array
  filters — is unchanged upstream and not something this platform
  controls. This decision treats it as a permanent hazard of the ORM to
  guard against at the call site, not a bug expected to be fixed
  elsewhere.
- No production data was affected — the incident occurred against a
  development/DEMO Neon database used for test verification, not the
  platform's production environment.

---

## ADR-046 — Service worker for cold-start offline app-shell availability
(A5.5); three offline security decisions

**Context.** A5 built `25_OFFLINE_OPTIONS_ANALYSIS.md`'s Option B: a vanilla
IndexedDB draft queue with explicit/opportunistic sync, no service worker.
That mechanism only ever engages once the app is already open in a live
browser tab — it solves losing signal mid-session. It does nothing for the
more basic failure `28_A5.5_SERVICE_WORKER_OFFLINE.md` names as the real
field condition: an operator at a site with zero cellular coverage
(Calovébora and equivalent sites) taps the home-screen icon, the browser
tries to fetch from the network, fails, and shows nothing — the same failure
mode as a device restart or a browser fully closed and reopened. `25_` itself
anticipated this outcome and named the correction in advance: *if Option B
proves insufficient, add a service worker that caches the app shell — not a
jump to full Option A* (the heavier, cross-cutting offline architecture
`OFFLINE_FIELD_CAPABILITY.md` describes in general). A5.5 is exactly that
anticipated, narrow addition, confirmed necessary rather than assumed
necessary, once A5 shipped and made the gap concrete.

**Decision 1 — scope.** Add `public/sw.js`: cache-first for static/
build-hashed assets, network-first-with-cache-fallback for navigations to
operator routes (`/apiaries`, `/lots`), falling back further to a precached,
locale-aware-at-runtime `public/offline.html` when nothing else is cached.
Explicitly out of scope, per the ticket's own boundary: Background Sync API,
automatic conflict resolution, map-tile caching, push notifications, offline
mode for admin/report routes. This sits on top of A5, not instead of it —
A5's IndexedDB queue and idempotent `clientDraftId` sync are unchanged and
still do all the actual data work; the service worker's only job is making
the shell open at all.

**Decision 2 — session duration offline.** Auth.js's default JWT session
`maxAge` (~30 days) is too long for a device that may operate for extended
stretches without ever reaching the server to be told its session is
revoked. Auth.js has no concept of an "offline-only" session lifetime — the
lever is uniform, online and offline alike — so the fix is a single shorter
`maxAge`: 7 days (`lib/auth/config.ts`). Chosen to bound how long a lost or
stolen device stays authenticated without forcing daily re-login for
operators who use the app most days. **This deliberately supersedes
`SECURITY.md` §11's original role-differentiated session-lifetime design**
for the reason stated above: Auth.js's `maxAge` is a single global lever, not
a per-Role-Profile one, so a uniform value applied to everyone was the only
implementable form of "bound exposure from a lost device" available without
building custom session-token infrastructure disproportionate to this
platform's current scale. `SECURITY.md` §11 has been corrected to describe
this uniform value rather than the differentiated design that was never
built.

**Decision 3 — drafts at rest.** Queued Inspection/ColonyEvent drafts sit in
plaintext IndexedDB, and a lost/stolen device exposes them as
`partner`-classified field data. App-level encryption was evaluated and
rejected for v1: any key reachable by the page itself (no server round trip
available, by construction, while offline) is reachable by anything that can
drive the page, which protects against a reader of the raw IndexedDB file
but not against the realistic threat — an unlocked lost phone. The device's
own screen lock is the actual first line of defense here, outside this
application's control. Implemented mitigation instead: `purgeStaleDrafts()`
(`lib/apiary/offlineQueue.ts`) — a visible warning at 7 days unsynced, an
actual purge at 21 days, always reported back to the UI, never silent. This
is an explicit, narrowly-scoped exception to `OFFLINE_FIELD_CAPABILITY.md`
§3's general "no expiry, ever" rule for captured field data — justified here
specifically by the security exposure of an unsynced draft on a lost device,
not a reversal of that rule for any other case. Worth reconsidering (e.g. a
device-bound key via WebAuthn/platform keystore) for a future engagement
with stronger data-protection requirements.

**Decision 4 — revalidation on sync.** Non-negotiable per the ticket: the
server must revalidate Assignment/scope validity fresh on every sync call,
never trusting what the client believed when it queued the draft. This was
already true by construction — `recordInspectionSyncAction`/
`recordColonyEventSyncAction` call `recordInspection`/`recordColonyEvent`,
which call `requireApiaryAccess`/`requireColonyEventWriteAccess`, which call
`can()`, which queries `Assignment` fresh from the database on every
invocation with no caching layer in between — but "true by construction" is
not the same as verified. Confirmed live: a scratch Person/UserAccount/
Assignment (Farm Operator, scoped to a scratch Location) was created;
`recordInspection` succeeded against it; the Assignment was set `status:
revoked`; a second, distinct `recordInspection` call and a
`recordColonyEvent` call against the same now-revoked Assignment both threw
`ApiaryAccessError("no_apiary_access")`. Scratch rows deleted after.

**Consequence.** A5.5 does not reopen or revise A0-A5's design — it is the
specific, bounded addition `25_` already predicted, built once A5 made the
gap real rather than speculative. No case was found for jumping to full
Option A (`OFFLINE_FIELD_CAPABILITY.md`'s general cross-cutting architecture)
for this ticket's scope.

---

## ADR-047 — T12.5: Asset provenance required from the start; classification
defaults internal; creatorPersonId fixed before it shipped; media capture
enters v1 alongside the labour/consumption capture-window reasoning

**Context.** `21_T12.5_MEDIA_ATTACHMENT_PROMPT.md` scoped photo/asset
attachment across Traceability — Harvest, Measurement, Fermentation, Drying,
Sample, and a general Lot photo (which also covers Receiving, which gets no
dedicated FK of its own). `core.Asset` existed since Slice 5 (Partner
Workspace) but carried none of ADR-038's provenance columns and had no
Traceability FK of any kind. Confirmed empty in production before this
migration (`core.asset` row count: 0, matching every prior media-readiness
check this phase).

**Decision 1 — six specific nullable FKs, not a polymorphic pair.** `Asset`
gains `lotId`, `harvestEventId`, `measurementId`, `fermentationRunId`,
`dryingRunId`, `sampleId`. Matches ADR-020 decision 8 and `Measurement`'s own
precedent. Receiving has no FK of its own — a receiving-stage photo attaches
via `lotId`, the lot `ReceivingEvent` itself creates, since a separate
`receivingEventId` column would just be a second way to say "this lot" for
an event with no other Traceability FK pointing at it specifically.

**Decision 2 — `provenanceClass` required, no default; per-attachment-point
class stated explicitly.** Same reasoning as ADR-038: a photograph is a
fact-bearing record, and a silent default would misrepresent an unstated
provenance as the strongest class in the vocabulary. Every one of the six
attachment points uses `direct_observation`, chosen at the action layer
(`app/actions/traceability.ts`), not exposed as an operator-facing picker —
a field photo documents what is directly in front of the person taking it;
unlike Measurement (T9.5 decision 3), none of these six points has a
genuinely ambiguous case among the provenance vocabulary to justify UI
friction for a choice that isn't really in question. `sourceReference` and
`dataQuality` follow `DATA_ARCHITECTURE.md` §4, present but unused by any
current call site (no source document/report to cite for a field photo; no
lab-report data-quality state applies).

**Decision 3 — classification defaults to `internal`, not `partner`.**
`lib/partner/workspace.ts` hardcodes `classification: "partner"` for its own
uploads; Traceability's new `finalizeLotAssetUpload` does not copy that
constant. Every Lot in Traceability today is Néctar Nómada's own production —
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §7's `partner`/`confidential`
client-site rule is written for apiary consulting engagements, which have no
Lot/HarvestEvent chain of their own, so there is no current Traceability
project that rule actually applies to. `internal` (visible to staff, not the
public) is therefore the correct default for v1. Rejected: making this
configurable now — no client-facing coffee engagement exists yet to
configure it against, and building the choice ahead of a real need repeats
the mistake `18_EQUIPMENT_AND_READINESS_PROMPT_REVISED.md`'s own instructions
warn against elsewhere in this phase (don't build toward a use case that
doesn't exist). If a client-facing coffee engagement is added later, this
default needs a real per-project decision at that time, not a silent reuse
of this one.

**Decision 4 — `creatorPersonId`, fixed at the source rather than left for an
audit.** `lib/partner/workspace.ts`'s `finalizeAssetUpload` hardcoded
`creatorPersonId: userAccount.personId` — the field is a real `Person` FK,
structurally identical in role to `operatorPersonId` elsewhere (observer vs.
`createdBy`'s uploader/typist), but no caller could ever reach a value other
than the uploader themselves, the exact "field exists, never exercised"
shape T9.5 (ADR-038 decision 2) fixed for `operatorPersonId`. Fixed here
rather than deferred: `finalizeAssetUpload` now accepts an optional
`creatorPersonId` override (default preserved, so Partner Workspace's
existing behavior is unchanged), and the new Traceability path
(`finalizeLotAssetUpload`) is built with the same default-to-uploader,
overridable shape from the start — surfaced as a "Photographed by" select on
the new `PhotoUploadForm.tsx`, the same UX pattern as T9.5's "Observed by" on
`MeasurementForm.tsx`. Reasoning: a field technician may photograph a
fermentation while the operator uploads it that evening — who took the photo
and who uploaded it are different facts, and the schema should be able to
say so without a second field duplicating `createdBy`'s job (the same
discipline ADR-038 decision 2 already established against a proposed
`recordedBy` field).

**Decision 5 — permission reuses `lot:manage`.** No new permission created.
Consistent with every other Traceability write function in this phase (start
a run, record a measurement, move storage) — `lot:manage` already expresses
the right authority for "this operator may add a fact to this lot," and a
photo is one more such fact.

**Offline, addressed but not built.** Per the prompt's own instruction, this
ticket does not build offline support but must not design the upload flow so
that offline capture becomes impossible to add later. Attachment is always a
call separate from the record it documents — every parent (Lot, HarvestEvent,
Measurement, FermentationRun, DryingRun, Sample) already exists before
`PhotoUploadForm` renders, so no record is ever blocked on having a photo,
and a future offline-sync path can call `finalizeLotAssetUpload` against an
already-synced parent with no change to this function's shape.

**Open item — R2 credentials.** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET` did not exist in any environment as of
this ADR's writing. `requestLotAssetUpload`'s call to
`objectStorageProvider.putObject` would throw on first real use. This
ticket's schema, service-layer RBAC/validation, and UI were verified live
against real Neon (a real Harvest created through the actual UI, the new
Photos-adjacent sections rendering correctly on Lot Detail); the actual PUT
to R2 and a real `core.Asset` row from a completed upload were not verified
at the time and remained blocked on credentials being provisioned. This was
an operational blocker, not a code gap.

**Relationship to the capture-or-lose-it reasoning
(`20_CAPTURE_OR_LOSE_IT_REPORT.md` §5, ADR-039 amendment).** T12.5 is the
same "irreversibility against a fixed calendar window" argument already
applied to labour-time and material-consumption capture, applied here to
photographs: a photo of a specific fermentation or drying step taken in
January 2027 cannot be taken again in March once the window has closed. This
ADR is a second application of that one amendment, not an independent
justification.

**Note on numbering.** This decision was drafted during T12.5 under the
working number ADR-044; that number was taken by the time it was appended
(ADR-044 is the capture-or-lose-it amendment above), so it is recorded here
as ADR-047, the next number actually available in this log — chronological
order of the underlying decision does not determine its position in this
append-only log.

---

## ADR-048 — F1: farm-operation data model (Location attributes, microlots,
labour/material against a place, PlantingEvent, Specimen/traps)

**Context.** `docs/implementation/29_BRECHAS_OPERACION_FINCA_INVESTIGACION_
MIGRACION.md` (a "dirección, no implementación" investigation, itself never
meant to be built from directly) identified four real gaps in farm
operations the existing traceability model — built around `Lot`/batch —
couldn't express: stable per-lot terroir attributes, human-driven microlot
subdivision, work and material consumption against a *place* rather than a
batch, and individual-plant/trap tracking with sector.
`30_F1_OPERACION_FINCA_ESQUEMA.md` implements exactly the four sections of
`29_` that map to these gaps (§4a, §4b, §5, §6); it explicitly does not
touch `29_`'s other sections (`RoastSession`, defect classification,
Research OS, map, water, climate — see `docs/implementation/README.md`
for the full list of what remains unbuilt).

**Decision 1 — labour/material against a Location: extend, don't create a
new entity.** Four real, undocumented facts triggered this: 600 planting
holes being dug, cleanup of apiary sites, 600 seedlings received, a
biochar-fermentation waterwheel activated. None of these are against a
`Lot` — T12.6's `LabourEntry`/`MaterialConsumptionEntry` require one.
Added a nullable `locationId` FK to both existing tables rather than
building a new entity, and built a separate small `PlantingEvent` entity
for the arrival/planting-specific facts (varietal, quantity, source
organization) that don't fit either table's shape. `ReceivingEvent` (T4)
was considered and rejected as a home for "receiving 600 seedlings" — it
produces a coffee `Lot` and carries cherry-specific fields
(`cherryWeightKg`, `brix`, `temperatureC`); forcing seedlings through it
would conflate two different kinds of "receiving," the mistake CLAUDE.md
§18 warns against for Species/Cultivar. `LabourEntry`/
`MaterialConsumptionEntry` already model the right shape for genuine
labour-hours and material-consumption facts — a hole-digging or a
fumigation is structurally identical whether it happens against a `Lot`
or a `Location`, only the parent changes. A discriminated-union parent
(`LabourEntryParent`/`MaterialConsumptionParent`, now five and three
variants respectively) keeps this on the existing RBAC/audit path
(`lot:manage`, reused rather than a new permission). Both a whole-lot
treatment (Sherry fumigating Lote 2 entirely) and a targeted one (three
specific plants treated for roya) coexist as valid, distinct records —
the location-parent entries cover the former, `SpecimenObservation`
(decision 3) covers the latter. Costs deliberately excluded, per
`20_CAPTURE_OR_LOSE_IT_REPORT.md`'s own standing criterion.

**Decision 2 — microlots via `Location.parentLocationId`, two
non-negotiable rules.** No new entity — a microlot is a `Location` with
`locationType` inherited from its parent and `parentLocationId` pointing
at it, the pattern already proven for `plot` and `apiary_site` (A1). Rule
1: a batch harvested before a microlot existed can only ever be
attributed to the whole parent lot — nothing in this codebase reassigns
an existing `Lot`/`HarvestEvent`'s `locationId`, and `createMicrolot`
doesn't add that capability; enforced by omission, not a check. Rule 2:
the system never detects microlots, and must not try to — detecting an
internal difference would require the difference to already exist as
separately-harvested data, which means a human already made the
subdivision decision, making detection circular. `getAltitudeRange()` is
the one arithmetic-only exception: it returns the raw `altitudeMaxM -
altitudeMinM`, never a boolean against an invented threshold. Human
observation decides; the system only records the decision.

**Decision 3 — broca traps modeled as `Specimen`, not a separate
entity.** `Specimen.specimenType` (`plant` | `trap`) discriminates a trap
from a plant. The active → removed → reinstalled lifecycle is not a
third/fourth `Specimen.status` value — status stays exactly
`active`/`removed`/`dead` (the last plant-only) — and the cycle lives
entirely in `SpecimenObservation` rows (`installed`/`removed`/
`reinstalled`), which also drive the status transition in the service
layer. Capture-count trap readings (`trap_check`, with a required
`captureCount`) live in the same observation table, read back as a series
via `getTrapCheckSeries`. A trap's state history is structurally
identical to the observation log a tagged plant already needed; one
mechanism, two specimen types, discriminated by `specimenType`, not by
nulling out plant-only fields. Both sector mechanisms (`sectorSimple`:
alto/medio/bajo, and `gridRow`/`gridPosition`) are accepted
simultaneously, never forced into a choice. Position, not GPS — canopy
defeats GPS precision in the field, the same problem
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §6 already had to solve. No
`species_id`/`cultivar_id` FK — `DOMAIN_MODEL.md` §4 specifies a
Species/Cultivar taxonomy never built; rather than building that taxonomy
now, `Specimen.commonName`/`varietalNote` and `PlantingEvent.varietal`
stay free text.

**Decision 4 — schema without interface, by explicit product-owner
decision.** F1 ships migration, service layer
(`lib/traceability/locations.ts`, `specimens.ts`, `plantingEvents.ts`, the
`operations.ts` location-parent extension), RBAC
(`location:manage_attributes`, `specimen:manage`/`view`), and tests — no
UI. The seedlings are six months old and won't fruit until 2031;
observations can be recorded manually in the field until an interface
exists. Mirrors `DOMAIN_MODEL.md` §7's own standing principle: specifying
ahead of building is the point of modeling in advance, not a deferred
obligation.

**Consequence.** Terroir correlation (altitude/sun/shade against cupping
scores) becomes possible once real per-lot attribute values are entered —
none are yet. Running F1's own real-data verification surfaced a real
RBAC gap: Farm Operator assignments for the real Cerro Azul operators
were project-scoped, but every new F1 permission check is location-scoped
only, since `Location` carries no `projectId` for `lot:manage`'s usual
project-or-location fallback to reach. Fixed live against Neon for the
real accounts that needed it (Bob, Sherry, Daniel each hold real
location-scoped Farm Operator assignments now), but this remains a
standing design tension worth its own future ADR: should `location`/
`specimen` RBAC checks fall back to project scope the way `lot:manage`
already does via `scopeTargetsFor()`, or should Farm Operator assignments
themselves become location-scoped as the norm? Not decided here —
flagged for the product owner. ~150-300 real `Specimen` rows (stratified
sampling across Lote 1-3) and the 30 real broca traps remain to be
created by an actual person in the field with actual position/sector
data — this ticket built the mechanism and proved it against real Neon,
it did not and could not fabricate that field data.

---

## ADR-049 — S1: external coffee — cupping without a full traceability chain

**Context.** `docs/implementation/32_S1_CAFES_EXTERNOS.md`. The
platform's entire traceability model assumed a `Sample` comes from a
`Lot` via `sample_extraction`. Real operation breaks that assumption
constantly: a client or contact hands over a coffee with only a farm
name, a declared varietal, a declared process, and a harvest year or
month — no terrain lot, no transformation chain, no measurements. It gets
cupped anyway, and that score is valid.

**Decision 1 — `Sample` without a `Lot`, not a minimal `Lot`.** Two
structural options were on the table: (a) a minimal `Lot` row carrying
only what's known, with `Sample` continuing to extract from it as always;
(b) `Sample.sourceLotId` stays null and `Sample` gets its own
declared-origin metadata directly, via a new 1:1 `ExternalCoffeeOrigin`
table. Decided (b), on evidence rather than preference:
`Sample.sourceLotId` was already nullable — T5's own schema comment
states DEMO Sensory/Competitions samples predate the `Lot` model and
correctly carry null lineage, "never backfilled with a guess." DEMO
`Sample` rows already flow through the full real cupping pipeline
(`SensorySession` → `SensoryFlight` → `SensoryBlindSample` →
`SensoryBlindMapping` → `Assessment`/`PanelResult`) with zero special
casing anywhere in that chain — every function along that path, including
`getSensoryLinkageForSamples`, operates on `sampleIds` alone and never
reads `sourceLotId`. A minimal `Lot` (option a) would have looked like a
normal, traceable `Lot` everywhere except in the fine print of its own
provenance fields — exactly the confusion the ticket's own risk note
warned about. `ExternalCoffeeOrigin` is a separate 1:1 table rather than
columns on `Sample` directly, since `Sample` already serves Sensory,
Competitions, and Partner Workspace uses that have nothing to do with
coffee origin declarations.

**Decision 2 — producer, processor, brand: three independently nullable
`Organization` FKs.** `producerOrganizationId`, `processorOrganizationId`,
`brandOrganizationId` — the worked example is real: Agustín Gómez's
Geisha, processed at Cafelino's beneficio, presented under Néctar
Nómada's own brand. None of the three implies the others. Enforced in the
service layer, not the schema, that at least one is present — a DB CHECK
across three nullable FKs was rejected as unnecessary machinery for a
rule the service layer already owns elsewhere (F1's `Specimen.
sectorSimple`/`gridRow` "at least one, not enforced as XOR" is the direct
precedent). Not limited to genuinely external coffee — a `Lot`-backed
`Sample` could carry an `ExternalCoffeeOrigin` too if that need ever
arises; today only the `Lot`-less path populates it.

**Decision 3 — declared, not observed; `dataQuality` per fact, not per
record.** One `declaredProvenanceClass` for the whole declared bundle
(`manufacturer_specification` or `interpretation`, required, ADR-038's
exact pattern, no default). `dataQuality` is per field instead —
`varietalDataQuality`, `processDataQuality`, `harvestWindowDataQuality`
are three independent columns — since reliability genuinely differs fact
by fact (the ticket's own calibration note: the farm is usually solid,
the process sometimes reliable, the varietal is what most often comes in
wrong). Collapsing that into one record-level value would erase exactly
the distinction the ticket asked to preserve. Any declared value requires
its own `dataQuality`; a value with none is rejected rather than silently
left unrated.

**Decision 4 — harvest window never fabricates a day.**
`harvestWindowPrecision` (`year`/`month`/`date`) is authoritative;
`harvestYear`/`harvestMonth`/`harvestDay` are validated against it so
"cosecha 2025" can never silently become "2025-01-01." A single
`harvestWindowStart`/`harvestWindowEnd` range pair was considered and
rejected — computing an implied boundary from a year-only or month-only
declaration risks the exact fabricated-precision problem the ticket warns
against, since an inferred boundary looks like a real date to anything
reading the column later without also reading the precision field.

**Decision 5 — classification and ownership needed no new mechanism.**
`Sample.classification` already defaults to `internal`; `createdBy` is
already the creating `UserAccount`. There is no `organization`
`ScopeType` in this codebase (`lib/rbac/types.ts` lists exactly platform/
program/project/location/competition/session/experience) — linking
`producerOrganizationId` at a coffee therefore grants that organization's
members nothing; access is purely Assignment-based, same as every other
record in the platform.

**Decision 6 — completing a record later: dated-knowledge fields, not
row-versioning.** This codebase's existing versioning machinery
(`SensoryProtocolVersion`, and CLAUDE.md §3's "Version preservation"
principle) exists because *other* approved artifacts pin a reference to a
specific version — a `CompetitionResult` or `SensorySession` names the
exact `ProtocolVersion` it was scored against, and that reference must
keep resolving to the same content forever. Nothing points at "this
`ExternalCoffeeOrigin` as of version 3," so parallel version tables would
be machinery with no consumer. Instead: per-fact `*KnownAt` timestamp
columns (`varietalKnownAt`/`processKnownAt`/`harvestWindowKnownAt`), each
stamped to `now()` only when that specific field is newly set or
genuinely changes — completing the process doesn't touch the varietal's
own timestamp. `completeExternalCoffeeOrigin(..., { linkToLotId })` also
supports linking the real `Lot` once traced, without deleting or clearing
the `ExternalCoffeeOrigin` row — how a record started (declared, not
traced) stays true history even after the gap closes, the same
"never silently mutate away evidence of a prior state" instinct behind
every audit-trail decision already made in this codebase (C1 §3).

**Decision 7 — Lost Origin.** Real organization
(`organization_type: laboratory`), created directly against Neon via a
one-time script, matching A7/F1's own precedent for loading real, named
entities — never through `prisma/seed.ts`'s DEMO gate. Id:
`f18965bd-46cc-459b-a469-3732442218ee`.

**Consequence.** RBAC reuses `sample:manage` exactly as
`createSampleFromLot` (T5) already does — no new permission. No UI, no
third-party self-submission form, no CSV importer, no cross-organization
data-sovereignty resolution (deferred to whenever that gets designed, per
`29_`'s own note) — all per the ticket's explicit scope. No real
external-coffee samples were loaded, since none were supplied; the
mechanism is proven by tests only (`tests/traceability/s1.test.ts`, 14
tests, real Neon), the same way F1 proved its own mechanism before real
field data existed to load.

---

## ADR-050 — R1: RoastSession and structured sensory descriptor/defect
taxonomy

**Context.** `docs/implementation/29_BRECHAS_OPERACION_FINCA_INVESTIGACION_
MIGRACION.md` §7a and `17_`'s Part C finding 4 named two gaps that need
each other: no typed record of *how* a coffee was roasted, and no
structured vocabulary for *what* was perceived beyond a plain number. The
case that unifies them is real: the same coffee roasted by different
roasters on different equipment, cupped side by side — the roaster is a
variable of the experiment, not just an actor, and a judge's "off-flavor,
confianza media, defecto de familia DMS" has nowhere to go but
unstructured comment text today, despite the platform's own Reference
Standards & Calibration system existing specifically to make that
observation precise and comparable.

**Decision 1 — roast curve reuses `Measurement`, not a new time-series
table or a file reference.** Three options were on the table: discrete
points, a dedicated time-series table, or an opaque reference to the
roaster's own equipment export. Decided discrete points via the existing
`Measurement` entity (`Measurement.roastSessionId`, additive, matching
the exact per-parent-table pattern already established for
`fermentationRunId`/`dryingRunId`/`storageAssignmentId`). First/second
crack get real columns on `RoastSession` itself
(`firstCrackAt`/`secondCrackAt`) since every roast log tracks those two
checkpoints regardless of equipment; every other curve point (bean/air
temperature over time) is an ordinary `Measurement` row. A dedicated
time-series table was rejected as unbuilt machinery for data volume this
ticket has no evidence needs it. An opaque equipment-file reference was
rejected because it would make the curve unqueryable from within the
platform.

**Decision 2 — equipment stays free text, no new entity.**
`RoastSession.equipmentNote` matches `FermentationRun.vesselNote`'s own
precedent exactly. `18_EQUIPMENT_AND_READINESS_PROMPT_REVISED.md` remains
unbuilt (still V2); building an `Equipment` entity now would be scope
invented ahead of being asked for.

**Decision 3 — one `RoastSession` per execution, not the split-with-many-
outputs shape reused directly.** `RoastSession` follows Fermentation/
DryingRun's principle (an execution record hanging off `LotTransformation`
via a dedicated FK) but not their exact two-call start/end shape, and not
the already-verified `split` transformation's exact shape either.
Roasting is short and its real capture point is "log the whole session
once it's done," so `recordRoastSession` is one call, matching
`HarvestEvent`'s own precedent for a short, bounded activity. Three
roasters roasting the same green lot three ways is recorded as three
separate `stage_change` `LotTransformation`s sharing the same input lot,
rather than reusing the verified `split`-with-three-outputs shape
directly — each roast is a genuinely separate execution the one-
`roastSessionId`-per-transformation FK can't express if they shared one
transformation row. This produces the identical queryable DAG either way:
`getLotLineage`'s recursive CTE follows `lot_transformation_input`/
`output` edges generically, indifferent to whether three children came
from one transformation row or three — the generic split mechanism
itself stays untouched; this ticket simply doesn't use it for this
specific case.

**Decision 4 — one unified descriptor/defect table, matching the already-
designed shape.** `BEVERAGE_SENSORY_PROTOCOLS.md`'s defects-taxonomy
section already specified the shape (`sensory.honey_descriptor(id,
family, specific_descriptor, expected_perception, classification
[positivo|neutral|defecto], technical_cause nullable)`) —
`SensoryDescriptor` implements it as written, not redesigned into
separate Descriptor/Defect tables. A descriptor belongs to a
`SensoryProtocolVersion`, the same versioning discipline `SensoryAttribute`
already follows. Confidence is a new, separate axis on
`SensoryDescriptorResponse` (nullable low/medium/high) — additive
alongside the existing numeric `AttributeResponse` and
`Assessment.comment` free text, never a replacement for either.

**Decision 5 — real content only for honey; no fabrication for coffee/
beer/mead.** Loaded the real, product-owner-authored three-tier taxonomy
(12 positive families, 2 neutral, 6 defect families each with a real
technical cause) from `BEVERAGE_SENSORY_PROTOCOLS.md`'s current,
non-superseded version — unconditionally seeded in `prisma/seed.ts`'s
`seedBeverageProtocolsContent()`, same category as the honey rubric/
attributes already seeded there, not `SEED_DEMO_CONTENT`-gated
placeholder data. Coffee, beer, and mead get no descriptor rows, since no
real vocabulary exists for them yet.

**Decision 6 — existing evaluations: nothing to migrate.** Checked live
against Neon: `core.Assessment` currently has zero rows in the shared
database. The policy for when real evaluations do start accumulating
stands as the ticket states it: never auto-convert free text into
structured descriptors — leave existing free-text comments as-is, and
optionally flag them as human-review candidates if a future ticket wants
to backfill structure with actual evaluator confirmation.

**Consequence.** Terroir-to-roast-to-cupping correlation (the platform's
own falsifiable v1 test, ADR-039) gains one more real link: a roast
profile is now a queryable fact, not a lot-code-and-notes guess. Two
pre-existing gaps were found while building this ticket, unrelated to
R1's own scope, and spun off as separate background tasks rather than
folded into these commits: `Measurement.fermentationRunId`/`dryingRunId`/
`storageAssignmentId` existed as schema columns since T6/T7/T8 but were
never actually wired through `recordMeasurement` until this ticket's own
`roastSessionId` addition prompted the fix (now landed); and
`FermentationRun`/`DryingRun`'s start/end functions were missed by C1 §3's
audit-trail pass and still record no `AuditEvent`. No real `RoastSession`
or `SensoryDescriptorResponse` data was loaded, since none was supplied —
the mechanism is proven by tests only, against real Neon, the same way F1
and S1 proved their own mechanisms before real field data existed to
load.

---

## ADR-051 — RO1: Research OS schema, PE-protocol variable modeling,
statistical discipline

**Context.** `29_BRECHAS_OPERACION_FINCA_INVESTIGACION_MIGRACION.md` §8
and the `17_` audit (hallazgos 18 and 22) named the same gap twice: more
than thirty PE post-harvest protocols at Cafelino run real, controlled
experiments — isolated variables (water source, yeast, fermentation
orientation, bag position, volume, bed level), a declared control, one
un-replicated run per treatment — with nowhere to live.
`Protocol`/`ProtocolVersion` generic was never built (only Sensory's own
specific version exists), and every variable today lives as prose in a
single `Comentarios` column ("GrainPro Bag, Spontaneous Wild, vertical
position 28 cm height cherry mass" — three variables mixed in free text,
unqueryable).

**Decision 1 — `Recommendation` naming collision resolved by prefix, not
redesign.** The AI Layer already has a `Recommendation` model (Slice 7,
`ai` schema: `suggestionType`/`model`/`confidence`/`reviewer`) with an
unrelated shape. The Research OS entity is named `ResearchRecommendation`,
matching this chain's own `ResearchProgram`/`ResearchQuestion` prefix
rather than bolting "Research" on awkwardly elsewhere. The two models
never reference each other and share no fields beyond the English word.

**Decision 2 — catalog versus closed-enum, per variable, exactly as the
product owner specified.** Two distinct shapes, respected per variable,
never converted either direction. **Catalog** (Recipiente/equipo de
fermentado, Levadura/cultivo, Método de inoculación, Grado de proceso,
Cuarto de secado): a named `VariableCatalog` + `VariableCatalogValue`
pair, extendable by insert, never migration — the same data-not-schema
pattern `RBAC.md` §2 already proves for Role Profiles; `lib/research/
catalogs.ts` seeds the real starting values. **Closed enum** (Fuente de
agua, Posición de masa): fixed, small, product-owner-confirmed
vocabularies not expected to grow, stored as `ProtocolVariable.enumValues`
(a native array), frozen at creation — changing the set means a new
`ProtocolVersion`, the same immutability every other field on a version
already has. `ProtocolVariableValueType` (`text | numeric | boolean |
catalog | closed_enum`) carries the distinction at the schema level;
`createProtocolVersion` rejects a `catalog` variable without a
`catalogId` or a `closed_enum` variable with empty `enumValues`.

**Decision 3 — catalog value `definition` and `alias`, both optional, and
the honey-color/semi-wash mapping deliberately left unlinked.** Every
`VariableCatalogValue` gained `definition` (optional, standardizes
language over time — the same reasoning `SensoryDescriptor.
expectedPerception`/`technicalCause` already proves for R1's tasting
vocabulary, applied here to process variables) and `aliasOfId` (optional,
self-referential, one level — an alias points directly at its canonical
row, never chains). The real case the mechanism exists for:
honey-by-color (`black honey`, `red honey`, `yellow honey`, `light
honey`) and semi-wash-by-percentage (`Semi Wash 75%`, `50%`, `25%`) may
name the same underlying process. **Deliberately not pre-linked** in
`lib/research/catalogs.ts`'s seed data, per the ticket's own explicit
instruction not to assume the mapping. `setVariableCatalogValueAlias` and
`compareTreatmentBatchesByVariable`'s alias resolution are built and
tested against a placeholder pair; the real correspondence is a
product-owner decision, still open (see Consequence).

**Decision 4 — "Spontaneous Wild" is a `dataQuality` signal, not an
organism name.** Recording it as an identified organism would assert
knowledge nobody has (the same distinction `23_
RECIPES_FORMULATION_AND_DISTILLATION.md` §5c already established for
spontaneous fermentation/consortia). `VariableCatalogValue.
impliesUnknownIdentity` marks values like this one; when a treatment
picks one, `TreatmentBatchVariableValue.dataQuality` becomes required by
`createTreatmentBatch`'s own validation — never silently defaulted.

**Decision 5 — bed level is interpreted against its room, not stored as a
bare number.** The solar room has 3 levels with light; the dark room has
6 levels with none — a level number alone doesn't say how much light a
lot received. The drying room is a `Location` (reusing F1's own
exposure-attribute pattern) carrying `dryingRoomLightExposure` and
`dryingRoomBedLevelCount`; `ProcessingStage.locationId` records which
room a given stage ran in. `getBedLevelContext` resolves a numeric "nivel
de cama" value against that stage's room, so level 1 in the solar room
and level 1 in the dark room are never conflated.

**Decision 6 — declared control, and the no-replication discipline
enforced at runtime, not just in a comment.** `Experiment.
controlTreatmentBatchId` is declared, never inferred, and validated to
belong to a `TreatmentBatch` under that same Experiment
(`declareControlTreatmentBatch`). Every PE treatment runs once: the
platform can say "this treatment scored 87, the control scored 84," and
can never say "this treatment produces on average 3 points more."
`Conclusion` gains `provenanceClass` (required, ADR-038 pattern) and
`isComparative` (boolean); `createConclusion` rejects `isComparative:
true` paired with `provenanceClass: "measured_fact"` — a single
un-replicated run can never earn measured-fact certainty about a
*difference* between treatments.

**Decision 7 — bioprotection is constitutive of the method, not a free
variable.** MP72 and HDA54 colonize without fermenting during cold hold
prefermentativo, mechanistically distinct from a fermentation yeast.
Which strain is used is a catalog-typed `ProtocolVariable` value *within
one `ProtocolVersion`* — MP72 vs. HDA54 is comparison inside the method,
not two protocols. A future "no bioprotection" control-negative run is
the same `ProtocolVersion` with a different catalog pick, not a new
protocol; no schema addition was needed beyond Decision 2's catalog
mechanism.

**Decision 8 — CryoBloom is a method, not a marker field, and experiments
have lineage separate from Lot transformation.** Multiple PEs (PE-79/80,
PE-97/98) ran the same prefermentative protocol with only the strain
varied — confirmed not a version change. "All treatments that used
CryoBloom" is answered as "all `TreatmentBatch` rows under that one
`ProtocolVersion`"; `ProtocolVariable.isControlled` (already built)
distinguishes a deliberately-varied factor from a protocol constant, no
new field needed. Separately, the six prior trials that led to
experiments A/B/C are scientific derivation, not a physical Lot split —
deliberately modeled apart from the Lot lineage DAG.
`Experiment.derivedFromExperimentId` + `derivationNote` (self-
referential, declared via `declareExperimentLineage`) record which
experiment's findings shaped the next design, and why.

**Decision 9 — declared limits are part of the record, not a separate
document.** The product owner's reference card names what isn't measured
yet (β-glucosidasa, GC-MS, LC-MS, comparative pH/°Brix, quantitative
microbiology, calibrated-panel formal cupping) as the honest boundary of
what the method can currently claim. `Experiment.declaredLimitations`
(free text, the product owner's own wording, not forced into an invented
checklist enum) is set via `updateDeclaredLimitations` and read back
alongside the experiment's results.

**Decision 10 — cherry-study vocabulary gets new infrastructure, not
`SensoryDescriptor`.** The "Estudio de cerezas" sheet's controlled
vocabulary (Selección, Flotado, Condición visual, Limpieza, Color,
Firmeza, Densidad-bracket, Tamaño/forma, Defectos de grano) is the same
*shape* as R1's `SensoryDescriptor`/`SensoryDescriptorResponse` —
vocabulary controlled by attribute, versioned under a protocol —
evaluated and rejected as a direct reuse: `SensoryDescriptorResponse` is
structurally coupled to `Assessment` → `BlindSample` → a judging session
context, and a pre-processing cherry inspection has none of those — no
judge, no blind code, no session. Decided instead to reuse the
*mechanism* Decision 2 already builds (`VariableCatalog`/
`VariableCatalogValue`) rather than a third parallel system. A new join
table, `ProcessingStageObservation`, records a categorical pick against a
`ProcessingStage`; Brix, peso inicial, and densidad-as-decimal stay
ordinary `Measurement` rows. Real content: only 2 of 6 rows in the source
sheet have values (Brix 17.53 pacamara lote 11, Brix 18.5 Geisha lote
10) — preserved as a template in incipient use; empty cells are
`missing_source_record`, never zero or estimated.

**Decision 11 — `ProtocolRequiredMeasurement` enforces what "el sistema
sabe qué medir" actually means.** Either a numeric `MeasurementVariable`
reference (`variable` set, `catalogId` null) or a categorical
`VariableCatalog` reference (`catalogId` set, `variable` null), each
paired with `atProcessingStage` (free text, matched by string equality
against `ProcessingStage.name`). `completeProcessingStage`
(`lib/research/treatments.ts`) refuses to close a stage until every
required measurement/observation for that stage's name has a
corresponding `Measurement` or `ProcessingStageObservation` row — an
enforcement point, not a comment.

**Decision 12 — UI built only where the ticket exercises it.** Screens
exist for: create/version a protocol with its catalog/enum/numeric
variables and required measurements; list/filter protocols by variable;
execute a protocol against a lot; view a treatment's results including
its sensory linkage. No UI for `Publication`, `AnalysisPlan`/
`AnalysisRun`/`AnalysisResult`, `Deviation`/`CorrectiveAction`,
`Approval`, the `Interpretation` → `Conclusion` → `ResearchRecommendation`
chain, control declaration, experiment lineage, or declared limitations —
all of these have real schema and RBAC-checked, audited service
functions, callable from a script or a future screen without redesign.

**Decision 13 — `RESEARCH_ACTIVITY_CRITERIA.md` gets support, not
enforcement.** Built: the `ResearchActivity` model (`isPaid`,
`researchQuestionStructured`, `complianceStatus`, `publicListingCopy`,
`consentFormCopy`, `languageFlagStatus`), the Research Compliance
Reviewer Role Profile (`research_activity:review`, deliberately excluding
`research:approve_protocol`/`execute_protocol` — this role reviews
whether an activity qualifies as research, it doesn't run research), and
a no-self-review rule enforced in code (`canReviewResearchActivity` —
structural, the same mechanism `RBAC.md` §7 uses for blind-judge
restrictions). Not applied: no CryoBloom/gastro-tourism activity was
reviewed against the five-part test — that is `RESEARCH_ACTIVITY_
CRITERIA.md` §9's own human review, out of this ticket's scope.

**Consequence.** The platform can now hold a PE-style controlled
experiment as queryable structure instead of prose in a `Comentarios`
column, with two questions deliberately left open rather than guessed:
which honey-color name is genuinely equivalent to which semi-wash
percentage (the alias mechanism is built and tested; the mapping needs
the product owner's confirmation before any real catalog rows are linked
with `setVariableCatalogValueAlias`), and what the PE-77…PE-112 numbering
itself encodes beyond lineage (`Protocol.externalIdentifier` stores it
verbatim, `identifierConvention` is a free-text slot for the explanation
once given). Deferred by design, not oversight: `Publication`,
`AnalysisPlan`/`Run`/`Result`, `Deviation`/`CorrectiveAction`, `Approval`,
and the `Interpretation` → `Conclusion` → `ResearchRecommendation` chain
have no UI — a future ticket, triggered by actual use. No PE data was
imported — the real CSVs live with the product owner, not in this
repository; `README.md`'s implementation status states what a clean
PE-protocol CSV import would need and what's still unknown before
writing it. CryoBloom source material classification is named, not
applied: the product owner's CryoBloom presentation/protocol/Q&A/
reference card carry an explicit "personal use, do not distribute"
notice — if loaded, it must be `internal`, never `public`
(`03_CRYOBLOOM_PUBLIC_CONTENT_PROMPT.md`'s existing discipline), not
loaded in this ticket.

---

## ADR-052 — Amendment to ADR-051: honey color has no percentage mapping,
by design, not by omission; PE-77…PE-112 confirmed sequence-only

**Context.** ADR-051's own Consequence section left two questions open
rather than guessed: whether a honey-color name (black/red/yellow/white)
is genuinely equivalent to a semi-wash percentage, and what the
PE-77…PE-112 numbering encodes beyond lineage. `35_
RO1.1_HONEY_PORCENTAJE_CANONICO.md` answers the first with an explicit
correction to §3a-bis, and the product owner has now confirmed the
second directly.

**Decision 1 — no color-to-percentage mapping is loaded, and none should
be, because the industry sources contradict each other, not just each
other's numbers but what "color" measures at all.** Black honey is
reported as 75%, 75–100%, 50–100%, and 65–100% mucílago retenido
depending on the source. Yellow honey is reported as 25% and 25–35%
retenido, and at least one source defines it by mucílago *removed*
instead — inverting the whole system relative to the others. White
honey ranges from 10% retenido to 80–90% removed. Beyond the arithmetic,
the deeper problem is that "color" itself isn't one measurement
region-to-region: some regions determine color by how much mucílago
remains after depulping, but most determine it by sugar caramelization
during drying — the color is a drying outcome, not a mucílago quantity,
in much of the industry. Efico's own framing: retained-mucílago
percentage mainly explains white-versus-yellow, while light exposure and
drying time — a different axis entirely — mainly explains red-versus-
black. Loading a fixed color↔percentage table would assert one
productor's vocabulary as a universal standard that does not exist.

**Decision 2 — percentage is the canonical value; color is the
producer's own label, recorded alongside it, never in its place.** The
percentage of mucílago retenido is what's measurable and what makes two
producers' lots comparable. Color is now `honey_color`, its own
catalog-typed `ProtocolVariable` — a sibling of `grado_proceso`
(percentage), not a value inside it and not `aliasOfId`-linked to any of
its rows. `lib/research/catalogs.ts`'s four values (black/red/yellow/
white — `gold` was considered and dropped by product-owner decision)
each carry a `definition` stating explicitly that the percentage
equivalence varies by region and by producer, so a future reader of the
catalog sees the caution at the point of use, not only in this ADR. This
is the same discipline `Spontaneous Wild` (RO1 §3a) already established
for `levadura_cultivo` — a label is not a measurement, and recording it
as if it were asserts knowledge nobody has.

**Decision 3 — this is the goal, not a workaround: register both,
compare on the measurable one, let the vocabulary itself become data.**
Per the product owner, the objective is to keep using percentage while
*gradually* standardizing language — producers use different vocabulary
in process talk versus marketing for what is often the same or a
closely related measurable process. The platform doesn't impose a
translation; it records both fields on every honey treatment it can, and
comparison always runs on `grado_proceso`. Over enough real lots, seeing
percentage and color side by side is what will eventually reveal how
each producer actually uses their own color terms — real information
earned from data, not a convention invented ahead of it.

**Cleanup.** A live leak was found and removed during this ticket's own
execution: `tests/research/ro1.test.ts`'s original §9.5 test (added
under RO1) created a throwaway `grado_proceso` value named `TEST red
honey (...)` and aliased it to the real `Semi Wash 50%` row to prove the
alias mechanism — but its `afterAll` cleanup only ever deleted RUN_ID-
scoped rows from `levadura_cultivo`, never from `grado_proceso`, so
every test run since RO1 shipped left one more `TEST red honey (...)`
alias row permanently attached to the real, shared `grado_proceso`
catalog. Seven such rows were found live in Neon and deleted; the test's
cleanup now covers every catalog it writes a TEST value to
(`levadura_cultivo`, `grado_proceso`, `recipiente`), and §9.5 itself no
longer uses a honey-color example — it proves the alias mechanism (still
valid for other cases, per this ADR's own Decision 1) against a neutral
`recipiente` pair instead. Confirmed after cleanup: zero
`VariableCatalogValue` rows with a non-null `aliasOfId` remain anywhere
in the database.

**Also confirmed by the product owner, recorded here rather than left
implicit: the PE-77…PE-112 numbering is sequence only.** It encodes no
information beyond the lineage the `Lot`/`LotTransformation` DAG already
models — not a process family, not a date range, not a site. No further
schema or parsing work is needed against this numbering;
`Protocol.externalIdentifier` continues to store it verbatim exactly as
before.

**Consequence.** Both of ADR-051's open questions are now closed: the
honey-color mapping is closed by explicit non-mapping (a decision, not a
gap), and the PE numbering question is closed by direct confirmation.
`getManageableContext`/`compareTreatmentBatchesByVariable` and the rest
of RO1's comparison machinery are unchanged by this ADR — `honey_color`
flows through the exact same catalog-typed-variable mechanism `§3a`
already built, proving that mechanism's own claim that catalog and alias
infrastructure built for one case generalizes to a new one without a
schema change.

---

## ADR-053 — RO1.2: fermentation methods as orthogonal dimensions, not a
flat catalog

**Context.** `36_RO1.2_METODOS_FERMENTACION.md` set out to load RO1's
catalog mechanism with the industry's fermentation-method vocabulary and
found the vocabulary itself doesn't fit a flat catalog: "anaeróbico no es
un proceso, es una condición de fermentación" — it can sit on top of a
washed, honey, or natural flow, combine with thermal shock, a
prefermentative cold hold, or inoculated yeast, none of which compete with
each other. The product owner's own real data already shows this: *"cereza
entera anaeróbica sumergida, después despulpado, después honey"* is one
lot combining an oxygen condition with a process flow across two chained
stages — not one compound label.

**Decision 1 — seven independent dimensions, not a method enum.** A
treatment selects one value from each of: Flujo de proceso, Condición de
oxígeno, Manejo de temperatura, Fuente microbiana, Sustrato añadido,
Estado de la cereza, Medio de lavado. This is data, not schema: RO1 §3a's
`VariableCatalog`/`VariableCatalogValue` + `ProtocolVariable`(catalog-
typed) + `TreatmentBatchVariableValue` mechanism already expresses exactly
this shape — "pick one value per declared axis" — so six of the seven
dimensions are new `VariableCatalog` rows (`condicion_oxigeno`,
`manejo_temperatura`, `fuente_microbiana`, `sustrato_anadido`,
`estado_cereza`, `medio_lavado`) with no schema change at all.

**Decision 2 — "Flujo de proceso" reuses `grado_proceso`, not a new
catalog.** RO1's own `grado_proceso` catalog (Natural/Washed/Semi Wash
50%/Semi Wash 75%) already *is* this axis under a different name — adding
a duplicate would recreate what CLAUDE.md §2 forbids ("the same X must not
be recreated unnecessarily"). Its only real gap was "Honey," entirely
missing until now; added bare, without a baked-in percentage (unlike
"Semi Wash 50%/75%," which do bake theirs in), because RO1.1/ADR-052
already established that inventing a color-to-percentage equivalence
without real data is exactly the fabrication this platform's provenance
discipline forbids — the same restraint applies to guessing a *specific*
honey percentage bracket. A "Honey NN%" value gets added, same
insert-extensible mechanism, only once a real batch's measured percentage
justifies it.

**Decision 3 — the multi-stage scenario is a DAG, never a compound
value.** "Cereza entera anaeróbica sumergida → despulpado → honey" is
modeled as two `TreatmentBatch` rows (one per stage) joined by a real
`LotTransformation` between their lots — each stage carries only the
dimension values that actually describe it, never a composite string.
This is the same resolution §2's own "Multi-etapa... no crees un valor de
catálogo" instruction already states for encoding sequence: the
`lot_transformation` DAG is the mechanism, not a field.

**Decision 4 — wash medium is its own dimension, with two new
`ProcessingStage` fields, not a catalog value alone.** "Lavar con agua
limpia no es lo mismo que lavar con el propio mucílago o con mosto
fermentado" — water dilutes; mosto keeps the microbial load and developed
compounds. `medio_lavado` (a new catalog: agua_limpia / mosto_propio /
mosto_de_otro_lote / ninguno_natural) names *which* medium; a real schema
addition, `ProcessingStage.washMediumSourceLotId`, names *which other Lot*
the mosto came from when it's `mosto_de_otro_lote` — required exactly
then, forbidden otherwise (`recordWashMedium` enforces both directions),
because that case is closer to inoculating than to rinsing (the product
owner's own PE-106/PE-107 "Doble Mosto Guacho"), and provenance would be
misrepresented either omitting it or leaving it dangling on an unrelated
selection. Quantity and the medium's own pH/Brix/temperature stay ordinary
`Measurement` rows (`wash_medium_volume`/`ph`/`brix`/`temperature`),
distinct variable names from the cherry/lot's own readings — same
physical measurement, different subject, no new column needed to say so.

**Decision 5 — every §2 method's numeric field is a `Measurement`
variable, not new schema.** Cold hold's six temperature checkpoints,
thermal-shock cycle durations, river-water temperature, vessel pressure,
brine concentration, and the rest are additions to
`lib/traceability/units.ts`'s registry only — CLAUDE.md's own stated rule
("adding a new measurable variable requires no schema migration"). A
distinct variable name is used per genuinely distinct concept (the six
cold-hold checkpoints are six different things, not six readings of one
thing); a repeated concept over time (thermal-shock cycles) reuses one
variable across multiple `Measurement` rows, one per occurrence — "cantidad
de ciclos" is the row count, never stored as a second field. Boolean and
free-text fields (agitación, tipo de sellado, cultivo usado) go through
the existing `ProtocolVariable`(boolean/text-typed) mechanism, not
`Measurement` at all.

**Decision 6 — process-sensory evaluation is its own entity, and
deliberately carries no inference field.** `ProcessSensoryObservation` is
new: subject is the *medium* (mosto/cereza/pergamino/grano) at a specific
processing moment, not the finished product (`Assessment`, weeks later)
or the cherry's physical state (`ProcessingStageObservation`, §3b). Its
`freeTextDescriptor` is recorded verbatim, in the field worker's own
language ("huele a guarapo") — never forced to technical vocabulary,
matching RO1.1's own "let the equivalence emerge from use" reasoning for
honey color; an optional `structuredDescriptorId` link is a later mapping
a person with judgment makes, never automatic. A real inference about
microbial activity ("hay levadura no-Saccharomyces activa") does NOT get
a same-row field — it goes through the existing `Evidence` →
`EvidenceClaim` → `Interpretation` chain instead (a new
`Evidence.processSensoryObservationId` FK), the same discipline
`Evidence`/`Interpretation` already enforces for every other kind of
evidence in this schema: observation and inference stay structurally
separate, not just textually separate, and only the latter carries a
`provenanceClass` of `interpretation`.

**Consequence.** No schema rename, no new UI (per the ticket's own
scoping — "sin pantallas nuevas," RO1's existing screens read this data
unmodified since it flows through mechanisms they already render). Two
genuinely new relational structures: `ProcessSensoryObservation` (+its
`Evidence` link) and `ProcessingStage.washMediumCatalogValueId`/
`washMediumSourceLotId`. Everything else — the six new catalogs, the new
`Measurement` variables, `grado_proceso`'s "Honey" addition — is data, not
schema, matching every prior RO1 decision's own bias toward the
insert-extensible mechanism over a migration.

**Incomplete fields, reported per §6, not silently assumed:** the
reference card excerpt in the ticket names `bioprotective_yeast_dose`'s
field but not its unit convention (grams assumed here as the common
sachet/gram-scale default; needs product-owner confirmation — g vs g/hL
vs another convention). `koji_substrate`, `rehydration_method`, valve
type (maceración carbónica/anaeróbico), and the specific purge gas for
anaeróbico are recorded as free text rather than a controlled vocabulary
— the ticket gives no fixed list for any of them, and inventing one would
be exactly the fabrication this discipline forbids. No specific "Honey
NN%" `grado_proceso` value is loaded (Decision 2) — every method in §2
otherwise has its full field list built.

---

## ADR-054 — Amendment to ADR-053: bioprotective yeast dose is g/kg, per
the product owner

**Context.** ADR-053's own Consequence section left
`bioprotective_yeast_dose`'s unit unconfirmed, defaulting to an absolute
gram weight rather than guess a scale-relative convention without real
data. The product owner has now confirmed it directly.

**Decision.** The unit is `g/kg` — dose scales with the mass of cherry
being treated, not an absolute weight. The CryoBloom reference card's own
real figure: **1 g/kg base, plus a 30% adjustment, ≈1.3 g/kg.**
`lib/traceability/units.ts`'s registry entry is corrected from `g` (min
0/max 10000) to `g/kg` (min 0/max 20 — wide enough for real dosing,
narrow enough to still catch a fat-fingered entry), and
`tests/research/ro1-2.test.ts`'s §5.4 cold-hold verification now records
the real 1.3 g/kg figure rather than a placeholder value.

**Consequence.** `bioprotective_yeast_dose` moves from ADR-053's
"incomplete fields" list to confirmed. The remaining items on that
list — `koji_substrate`, `rehydration_method`, valve type, anaeróbico's
purge gas, and the unloaded "Honey NN%" `grado_proceso` value — are
unaffected by this amendment and stay open.

---

## ADR-055 — Off-provider backup with mandatory restore verification

**Context.** Every byte the platform holds lived in one Neon project
(`neondb`, one endpoint, 12 schemas, 122 tables) and one Cloudflare R2
bucket. The only recovery mechanism was Neon's own PITR — which is a fine
first line of defence and a useless last one, because it lives inside the
account that is the single point of failure. ADR-007 chose Neon partly for
"straightforward backups" and no backup was ever taken. The
implementation README named data sovereignty "the gap with the least
margin for error: a provider failure today would be unrecoverable." This
is not hypothetical for this project: T14 already lost data once to an
unfiltered `deleteMany` and was recovered only by Neon PITR.

**Decision.** `scripts/backup/` — a `pg_dump` custom-format backup
(`npm run backup:db`) and a restore verification (`npm run backup:verify`)
that are separate commands, because a backup nobody has restored is not a
backup. Manual first, deliberately: automation is worth adding only once
the thing being automated is known to work.

Four specifics that are load-bearing:

1. **Dump against the direct endpoint, never the pooler.** `DATABASE_URL`
   points at Neon's PgBouncer (`-pooler` in the host). Transaction pooling
   cannot hold the repeatable-read snapshot `pg_dump` opens, so dumping
   through it risks a torn backup. `direct_url()` strips `-pooler`.

2. **Verification restores into a throwaway local PostgreSQL cluster**,
   created and destroyed per run, listening on a Unix socket only. A Neon
   branch would prove the dump is readable *by Neon*; restoring into stock
   PostgreSQL 18 proves the platform can leave. Ownership and grants are
   captured in the dump and dropped at restore (`--no-owner
   --no-privileges`) because `neondb_owner` and `ai_service` are Neon
   roles that do not exist off Neon.

3. **The verification is a row census diff, not an exit code.** Per-table
   counts are taken at dump time (`rowcounts.tsv`) and recomputed on the
   restored copy; the backup passes only if every count matches. A
   `pg_restore` that exits 0 having quietly skipped tables would otherwise
   read as success.

4. **Client tools must be PostgreSQL 18+.** Neon runs 18.4 and `pg_dump`
   refuses to dump a server newer than itself, so this fails outright on
   17 rather than degrading. `require_pg_tools` checks the major version
   and prints install instructions rather than failing obscurely.

**Consequence.** Verified 2026-08-19 against real Neon: 122 tables, 12,956
rows, dump 959K, restored into stock PostgreSQL 18.6 with zero
`pg_restore` errors and an identical census. Provider exit for the
database is demonstrated rather than assumed.

Deliberately **not** covered, and still open: R2 media has no second copy
(the `Asset` table's `checksum_sha256` makes a reconciling backup
straightforward, and it is not built); there is no producer-facing data
export; backups are manual, so the recovery point is "whenever someone
last ran it"; and the destination is a local folder until Google Drive for
desktop is installed, which means the backup currently shares this
laptop's fate. `AUTH_SECRET`, R2 keys, and the Neon password are not in
any backup — restoring to a working system needs `.env` from wherever it
is kept, which is nowhere but this machine.

**Credential hygiene note.** libpq prints the entire connection string,
password included, on some connection errors. The first run of this script
did exactly that. All client-tool stderr is now routed through
`redact_secrets()`, because these logs are written beside the backup and
are intended to be synced to cloud storage.

---

## ADR-056 — Pin TLS verification explicitly: `sslmode=verify-full`

**Context.** Every connection string used `sslmode=require`. Under
`pg-connection-string` v2 that is silently treated as `verify-full` — the
certificate chain *and* the hostname are checked. `pg` v9 /
`pg-connection-string` v3 adopt libpq semantics, where `require` means
"encrypt, but verify nothing." The library warns about this on every boot
(it is the warning surfaced from `DiscoverPage`).

The failure mode is what makes this worth an ADR rather than a silenced
warning: a routine `npm update` would downgrade production from verified
TLS to unauthenticated TLS, with no error, no test failure, and no visible
change in behaviour. An attacker able to intercept the connection could
present any certificate. Nothing in the codebase would notice.

**Decision.** State the intent explicitly rather than depend on a default
that is scheduled to change. `DATABASE_URL` and `AI_SERVICE_DATABASE_URL`
use `sslmode=verify-full`, in `.env` and `.env.example`. Verified against
Neon on both the pooled and direct endpoints: TLS 1.3, `authorized=true`,
Let's Encrypt chain.

**The two client libraries need different spellings of the same intent**,
which is the non-obvious part:

- **node-postgres** (the app, Prisma, the test suite) validates against
  Node's bundled CA roots. `sslmode=verify-full` alone is sufficient and
  correct.
- **libpq** (`psql`, `pg_dump`, `pg_restore`) ignores those roots. It looks
  for `~/.postgresql/root.crt`, which does not exist on this machine, and
  refuses to connect at all. It needs `sslrootcert=system` (libpq 16+) to
  use the OS trust store.

`sslrootcert=system` therefore cannot live in `.env`: node-postgres treats
`sslrootcert` as a file path and dies with `ENOENT: open 'system'`. It is
appended by `libpq_url()` in `scripts/backup/pg-tools.sh`, at the same point
the pooler host is stripped — the backup tooling already rewrites the URL for
libpq's benefit, and this is one more item of the same kind.

**Consequence.** The upgrade to `pg` v9 becomes a non-event for TLS instead
of a silent regression. Backups continue to run: verified end to end after
the change, including a restore into a throwaway cluster with an identical
row census.

**Not done here.** The same change must be made to `DATABASE_URL` in the
Vercel project's environment variables, which is where production actually
reads it. Until then production still runs `sslmode=require` and remains
exposed to the v9 semantics change.

---

## ADR-057 — Secrets custody: passphrase-sealed `.env` beside the backups

**Context.** ADR-055 made the database recoverable and deliberately put no
credentials in the dump. That leaves a restored database that cannot become
a restored *system*: without `AUTH_SECRET` every session and token is
invalid, and without the R2 credentials the media pipeline cannot address
its own bucket. `.env` existed on one laptop, and in Vercel's environment
variables — one machine and one provider, which is the same shape of risk
ADR-055 exists to remove.

**Decision.** `npm run secrets:seal` encrypts `.env` to
`<destination>/secrets/env.enc` under a passphrase the operator types and
that is stored only in their password manager. `npm run secrets:open`
recovers it. AES-256-CBC, PBKDF2-HMAC-SHA256, 600,000 iterations, random
salt.

Three specifics that carry the weight:

1. **`openssl`, not `age` or `gpg`.** Neither is installed and there is no
   Homebrew here, and a recovery tool that cannot run on a bare machine is
   not a recovery tool. macOS ships LibreSSL; the recovery path depends on
   nothing that has to be installed first.

2. **Sealing verifies its own round-trip.** It decrypts what it just wrote
   and compares against `.env`, writing nothing if they differ. An encrypted
   file nobody has decrypted is the same failure as a backup nobody has
   restored.

3. **The passphrase is never co-located with the ciphertext.** Ciphertext in
   Drive plus passphrase in a password manager is two custodians; both in
   Drive is one, and would make the encryption theatre. The scripts never
   write the passphrase anywhere, and it is not recoverable if lost — stated
   plainly in the tooling rather than discovered during an incident.

`secrets/` sits outside the timestamped set directories, so ADR-055's
retention pruning cannot delete it. `INVENTORY.txt` records key *names* only.

**Consequence.** Recovery is: this repository from git, the newest verified
dump, and the sealed `.env` — none of which require Neon, Vercel, or this
laptop to still exist.

**Known weakness, accepted.** Nothing detects a stale seal. Rotating the Neon
password or adding Stripe keys without re-sealing yields a recovery that
restores a system unable to connect to anything. A checksum comparison would
not help, since `.env` legitimately changes; the honest fix is to re-seal as
part of rotating a credential, which the runbook says and the seal output
repeats.

---

## ADR-058 — DRAFT, NOT RATIFIED — S2: sensory purpose and subject, and the navigation that follows

**Status: DRAFT.** Written as S2 §9 requires, marked in the heading, and not
to be cited as settled until the product owner ratifies it. The migration and
code it describes are merged; the *reasoning* below is what awaits sign-off.

**Context.** The signed-in bar carried ten items, three of which — Sensory,
Competitions, Calibration — are not separate disciplines. They are one
discipline used for different ends. Merging them on that observation alone
would have been cosmetic, so S2 asked first what actually distinguishes one
evaluation tool from another.

**Decision 1 — three axes, not a list of roles.** Enumerating roles (judge,
QC, process panel, green buyer, roaster, barista, competitor, consumer) was
considered and rejected: the list grows without end and hides that many of
them do the same thing to a different subject. A roaster verifying a profile
and a brewer verifying a batch are both verifying conformance. A green buyer
and a competitor choosing what to enter are both selecting. Three axes cover
twelve roles without naming them and admit the thirteenth without a schema
change.

- **Purpose** — what the evaluation is for. Five: `rank`,
  `verify_conformance`, `characterize`, `select`, `hedonic`.
- **Subject** — what is evaluated. Three: `raw_material_in_process`,
  `intermediate_product`, `prepared_beverage`.
- **Role** — who evaluates. Already RBAC's job; deliberately not modelled
  again.

Session format and deliberation mode are consequences of purpose, not
independent axes: a judge deliberates under competition rules, a QC decides
alone against a specification. Neither needs its own column.

**Decision 2 — what is comparable with what.** §2a asked for a
recommendation with reasoning, *enforced in the model*. It lives in
`lib/sensory/purpose.ts` as pure functions rather than as prose here.

| | comparable with |
|---|---|
| `rank` | `rank`, `characterize` |
| `characterize` | `characterize`, `rank` |
| `verify_conformance` | itself only |
| `select` | itself only |
| `hedonic` | itself only |

- **`rank` ↔ `characterize`** read the same scales on the same scoresheet.
  What differs is what the reader does with the number afterwards, which is
  not a property of the measurement. Allowed only across a shared protocol
  version.
- **`verify_conformance`** yields a verdict against a specification, not a
  position on a shared scale. Averaging a pass with an 87.5 produces a number
  that means nothing.
- **`select`** yields a choice made *within* an option set; it does not
  travel outside the set it was made in.
- **`hedonic`** is the existing rule, not a new one
  (`CONSUMER_SENSORY_FEEDBACK.md`, CLAUDE.md §49). S2 stops it being a special
  case and applies the same discipline between the technical purposes.

Two further constraints: subject must match, and protocol version must match
even within a single purpose — two scores on different scoresheets are not the
same measurement.

**Decision 3 — extraction method is an attribute, not a subject.** Espresso,
filter and press are how a cup was prepared. Modelling them as subjects would
grow the list without end *and* would make two brews of the same coffee
incomparable, which is exactly the comparison a barista needs. Stored as
`preparationMethod` on the session and deliberately never consulted by the
comparability rules.

**Decision 4 — an undeclared purpose is a refusal, not a wildcard.**
`purpose` and `subject` are nullable and unbackfilled. §6 forbids classifying
an existing evaluation automatically: deducing what a past session was *for*
is precisely the interpretation provenance rules prohibit. Six sessions
predate this migration and remain null.

The consequence is enforced rather than documented: `computePanelResult`
refuses a session whose purpose is undeclared, with its own error type
distinct from the permission error. Aggregating assessments asserts they
measure the same thing; doing that for a session nobody has characterised
asserts it without anybody having said what was measured or why. Legacy
sessions therefore surface as a specific, fixable error instead of
disappearing into a mean.

**Decision 5 — AI Suggestions stays a destination, correctly hidden.** §4
asked whether it is a destination or a cross-cutting capability. Today `/ai`
is the suggestion review queue, gated on `ai:review_suggestion`. The
cross-cutting permission, `ai:converse`, is deliberately absent from the
catalog — ADR-037 decision 4 defers it until Ask Néctar is actually built —
so there is nothing cross-cutting to place yet. It remains a destination and
is now hidden from viewers who lack the permission. When Ask Néctar ships,
*that* is the capability worth revisiting as cross-cutting; this one is a
queue.

**Decision 6 — navigation is filtered by permission, and that filter is not
security.** `permissionKeysAnywhere` answers "could this person use this
section at all", which no single-target resolution can answer: a farm
operator's `lot:manage` sits on a project scope and is invisible to a
platform-scoped query. It is display-only by construction and documented as
such — the union is strictly wider than any single scope, so using it to
authorize would broaden exactly what `resolve.ts` exists to keep narrow.
Enforcement stays a `can()` call against a specific target, per SECURITY.md §2.

The rule it implements is "nothing visible that the viewer cannot use." The
concrete failure it fixes: `/ai` was offered to every signed-in user and
answered "no access" to almost all of them.

**Consequences.** The bar drops from ten fixed entries to at most eight
permission-filtered ones — a judge sees two. Sign out and the locale switcher
move out of the destination row, since neither is a destination. Competitions
and Calibration are reachable inside `/sensory`, offered by the same filter.

`16_ADAPTIVE_OPERATOR_WORKSPACE_PREAMBLE.md` remains the destination:
navigation derived from context, not merely from permissions. This is the
cheap intermediate step that ticket explicitly allows, and does not replace it.

**Not done here, deliberately.** The evaluation tools themselves — the judge
form, the QC form, the process panel — are their own tickets. No existing
`Assessment` was classified. No visual redesign beyond the consolidation.

---

## ADR-059 — Producer data export, and the classification gate it does not apply

**Context.** A producer could see their lots in the application and print one
report at a time, but could not take their own records out. CLAUDE.md §46
asks for exports; `docs/implementation/README.md` named client export as the
last piece of data sovereignty still open. Sovereignty that only the
platform's operator enjoys is not sovereignty.

**Decision 1 — CSV and JSON together, in one zip.** They serve different
people. CSVs open in the spreadsheet a producer already uses; the JSON keeps
the lineage and nesting that CSV flattens into a column of ids, which is what
a lab, a re-import, or another platform actually needs. Neither alone is
sufficient, and choosing one would have been choosing which audience to
serve.

**Decision 2 — scope is the question the application already answers.**
`resolveLotVisibility` decides which lots the caller may export, asked of
`lot:export` rather than `lot:view`. Reusing the resolver rather than writing
a second one means the export cannot drift from what the app shows: there is
one implementation of "which lots are yours", and both callers ask it.

**Decision 3 — `lot:export` is its own permission.** CLAUDE.md §10 lists
Export as its own verb. Reading one record in the UI and extracting every
record you can see as a file are different acts, and only the second is worth
being able to withhold — from a Project Viewer, say, or a partner granted
sight of a project but not a copy of it. Held by Farm Operator (the producer
this exists for) and Platform Admin.

**Decision 4 — the export does NOT apply a classification AND-gate, and this
is the uncomfortable one.**

Every `Lot` on this platform is classified `internal`. Farm Operator holds
only `classification:clear_partner`. So an AND-gate here would return an
empty file to precisely the person the feature exists for.

The traceability read path does not apply one either — `lots.ts` documents
that choice above `getSensoryLinkageForSamples`. Matching it keeps the export
honest: it contains exactly what the application already shows the caller, no
more and no less. Inventing a stricter rule in this one corner would have
produced a feature that appears to work and returns nothing.

**The real defect this exposes, recorded rather than papered over:** operators
create lots that default to a classification they cannot clear. The
classification system is effectively unwired on the traceability path, and
export is simply the first place that becomes visible. Fixing it is a
deliberate choice between three things — granting Farm Operator
`clear_internal`, changing the default classification for operator-created
lots, or accepting that lots are not classification-gated and saying so in
`SECURITY.md`. That decision is not this ticket's to make, and making it
silently inside an export feature would have been the worst of the options.

**Consequence.** A producer gets their lots, measurements, samples and panel
results as a dated zip. Panel results only — `getSensoryLinkageForSamples`
never returns blind codes, mappings or evaluator identities, so the export
inherits that narrowness for free.

Every export writes an `AuditEvent` (§35) recording counts and scope, never
contents: the trail says a copy was taken, not what was in it.

**Not done here.** No per-lot export button; the whole-account zip covers the
"send this to a buyer" case less neatly than the existing print-to-PDF report
already does. No scheduled or emailed exports. No re-import of an exported
archive — the JSON is shaped to make that possible later, not to make it work
now.

---

## ADR-060 — `EQUIPMENT_AND_READINESS.md` accepted as planning input

**Status: accepted planning input, not a build order.** `18_`'s own framing,
recorded here so a later session cannot mistake the document for a ticket. v2:
it must not enter v1 or any current ticket.

**Context.** `DOMAIN_MODEL.md` §3–5 names `Equipment/Calibration` in the
Research OS chain and never specifies it. Equipment is recorded today as free
text at the point of use (`FermentationRun.vesselNote`,
`StorageAssignment.containerNote`) — which preserves the irreversible fact and
answers nothing about the object.

**Four of `18_`'s premises had drifted, and two changed the answer.** Recorded
because `README.md`'s own rule is to verify a prompt's vocabulary before
running it:

1. `material.vessel` does **not** exist and has **no** production rows — it is
   specified in `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §4 and unbuilt. The
   schema says so in a comment on `vesselNote`. So `18_` §4's "recommend
   whether it migrates, it has real production rows" has no migration to
   assess; the question is instead whether two *planning documents* reconcile
   before either ships. They should, and doing so is currently free.
2. `Measurement.deviceId` **does** exist, with `sourceType` already
   distinguishing `device`/`sensor`/`lab`. `18_` §7's "Measurement has no
   instrument reference today" is wrong, which makes the migration smaller than
   anticipated and turns the real question into what happens to existing
   free-text device values.
3. The provenance value is `manufacturer_specification`, not
   `manufacturer_spec`.
4. The attention vocabulary `18_` §6 says to map onto is **not established** —
   it appears only in an unrun research prompt. The instruction's intent (do
   not invent a second vocabulary) is honoured by naming no severity levels at
   all.

**Decisions recorded in the document**, none of them binding until built: one
`Equipment` entity absorbing the planned `material.vessel`; custody as an
append-only transfer chain with location derived; lifecycle, allocation and
condition as three orthogonal axes with allocation derived from the run rather
than stored; readiness as the highest-value output and recommended **ahead of
consumables** on perishability grounds; instrument calibration under an
`Instrument*` prefix to avoid colliding with the built panel-calibration
vocabulary; a nullable `instrument_id` on `Measurement` with **no backfill**;
consumables as an explicitly third inventory concept with per-site balances.

**Two product decisions raised, not resolved** (§7, and the ticket asked for
them to be raised rather than silently settled): whether an out-of-calibration
instrument blocks or downgrades a measurement — recommended **downgrade**,
because blocking gets routed around in the field and the platform ends up
knowing less; and how retroactive review is bounded when an instrument fails —
mechanism recommended (a review-flag table that never rewrites the
measurement), bounding strategy deferred because it needs real calibration
intervals that do not exist yet.

**Consequence.** `Notification` now has four known consumers waiting on it —
readiness signalling, the tourism waitlist, recurring field-study reminders,
and Alerts. That convergence is an argument for building it, and is the main
thing this document changes about the v2 order.

**Dependency on ADR-059's open defect.** Client separation for partner-site
equipment relies on `classification = partner` actually gating reads. It does
not today. Equipment does not introduce that problem and is not where it should
be fixed, but it does depend on the answer.

---

## ADR-061 — `BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md` accepted as planning input

**Status: accepted planning input, implementation deferred.** Not a build
order. `09_ADD_BRAND_MARKETING_PROMPT.md`'s deliverable, which had never been
produced although its input was filed.

**A filing problem, found first.** `09_` says to use the corrected input and
place it *at* the plain `..._INPUT.md` filename. Both files are present
instead, and the one at the plain name is the **uncorrected original** — it
cites `MASTER_IMPLEMENTATION_ROADMAP.md` and
`PLATFORM_ARCHITECTURE_RECONCILIATION.md`, neither of which exists, and which
`20_CAPTURE_OR_LOSE_IT_REPORT.md` independently found missing. Anyone following
`09_`'s own hand-off text reads the wrong document. This review was written
from `..._INPUT_CORRECTED.md`; which file is authoritative is a product-owner
action.

**Repository state, verified not assumed.** None of the thirteen entities in
the input's §94 exist. Everything they attach to does: `Story`, `Asset`,
`Product`, `Experience`, `Booking`, `Order`, `Recommendation`, `Person`,
`Organization`, `Project`, `AuditEvent`. No `Discount`/`Promotion` model, so
campaign-linked offers have nothing to attach to.

**Publer could not be verified.** This review has no access to
`publer.com/docs`. Input §93 requires marking unconfirmed capabilities
`UNCONFIRMED — DO NOT IMPLEMENT` rather than inferring from UI behaviour, so
the matrix records whether the **input document cites a documentation URL** —
a weaker claim than verification, labelled as such. Comments, AI replies,
unified inbox/DMs and draft are uncited and marked accordingly; webhooks are
unconfirmed, so reconciliation assumes polling. This is structural rather than
cosmetic: it is why community is a separate provider boundary from publishing.

**Two conflict checks, both required by the input's §98.**

1. **Content generation genuinely overlaps.**
   `MEDIA_INTELLIGENCE_PIPELINE.md` §3 (Phase B) already specifies AI-assisted
   generation *as a `suggestion_type` family within the existing AI Suggestion
   lifecycle, explicitly not a new governance model*, and already names
   marketing copy drafts and social crops among its outputs. Resolution:
   generation stays Phase B's; marketing supplies brand voice and claim
   constraints and consumes suggestions; `ContentPiece` begins where a promoted
   suggestion ends; and `ContentPiece` **references** `Story` rather than
   copying it, since `Story` is built, flat, and first-class
   (`DOMAIN_MODEL.md` §4). Two AI content pipelines would be the same
   divergence `README.md` warns about for Resource.
2. **Guardrails defer correctly; the marketing mode needs one correction.**
   Input §95 already subordinates marketing AI to AI governance, research
   governance, brand rules, rights and RBAC. But a marketing/community mode is
   **not** in ADR-037 decision 3's approved MVP mode set, so it enters the
   existing mode table as `not_yet_grounded` — the treatment every deferred
   mode gets — rather than as a live mode with its own parallel persona and
   tool semantics. It also inherits ADR-037 decision 4's `ai:converse` gate
   rather than inventing one.

**Consequence.** `Notification` now has **six** known consumers waiting on it
(ADR-060 counted four; marketing and community signalling add two). And this
document depends on ADR-059's open defect: rights, consent and community all
handle personal data and lean on a classification gate that is not enforced on
the read path today. That needs settling before community ships.

**Recommended first slice**, endorsing the input's §89: one real experience
with unsold capacity — campaign → brief → approved variant → publication →
tracked link → booking — because the platform already knows the capacity and
the conversion is unambiguous.

---

## ADR-062 — The classification AND-gate was never applied; the bypass is now a compile error

**Context.** ADR-059 noted, while building the producer export, that the
traceability read path applies no classification gate. That understated it.
Audited across the codebase: the gate was passed at **zero of thirteen**
`can()` call sites. It is fully specified (`RBAC.md` §4, `CLAUDE.md` §10),
implemented (`lib/rbac/resolve.ts`), seeded (five `classification:clear_*`
permissions across seven role profiles) and stored on `Lot`, `Sample`,
`SensorySession`, `Asset` and `Story` — and never enforced anywhere.

Two things kept it invisible:

1. **The parameter defaulted to `public`.** Omitting it silently produced the
   permissive answer, so no call site looked wrong.
2. **It had no tests.** Nothing failed when it was skipped, and nothing proved
   it worked when it wasn't.

`SECURITY.md` §4 asserted the enforcement as fact. It described intent, and has
been corrected to say so.

**Decision 1 — the parameter is required.** `resourceClassification` no longer
defaults in either `can()`. Omission is now a compile error rather than an
invisible bypass. This produced exactly thirteen errors, which is the count of
sites that were skipping the gate.

**Decision 2 — unenforced sites are named, not silent.** They pass
`CLASSIFICATION_GATE_DEFERRED`, a sentinel that evaluates to `public` so
behaviour is unchanged, but which makes the debt an inventory:

```
grep -rn CLASSIFICATION_GATE_DEFERRED lib app
```

Thirteen sites today. That number should only ever fall, and a code review can
see it move.

**Decision 3 — the gate is now tested.** Six tests in
`tests/rbac/resolve.test.ts` prove it grants at the cleared level, denies above
it, denies when the action permission is absent regardless of clearance, and
that Platform Admin clears everything. The mechanism is trustworthy before it
is switched on, rather than after.

**Not decided here, because it is not a code question.** Enforcement is blocked
on a genuine inconsistency between two recorded decisions:

- **ADR-029 decision 1** deliberately holds that a partner-level role *"still
  cannot clear `internal`/`confidential`/`trade_secret`, even on their own
  assigned project — verified live."* Farm Operator was given the same grant on
  that basis.
- Every `Lot` is `internal` (51 of 51), every `Sample` is `internal`, every
  `SensorySession` is `internal`. Plain Sensory Judge holds no clearance at
  all.

Both cannot hold. Enforcing today denies operators the lots they create and
judges the sessions they judge. The options, none of them free:

1. **Grant `clear_internal` to the field roles.** Makes enforcement work
   immediately and is a *net narrowing* — today those roles can read
   `confidential` and `trade_secret` too, because nothing checks. But it
   contradicts ADR-029 decision 1 and needs a superseding decision, not a
   catalog edit.
2. **Default operator-created records to `partner`.** Consistent with ADR-029,
   and arguably what `partner` is for. Requires reclassifying real production
   rows, which is a data write over research records.
3. **Accept that operational records are not classification-gated** and say so
   plainly, reserving the axis for `Asset`, `Story` and future client work.
   Honest and cheapest; abandons the axis where most of the data lives.

This ADR takes none of them. It makes the bypass impossible to reintroduce
silently, proves the mechanism, tells the truth in `SECURITY.md`, and leaves
the policy where it belongs.

**Consequence for other work.** ADR-059's export and ADR-061's community and
consent design both depend on this being settled — the export inherits whatever
is decided, and community handles personal data under it.

---

## ADR-063 — Clearance corrected for internal roles; the classification gate is now enforced on the lot and sample paths

**Supersedes ADR-029 decision 1 only as it was applied to internal roles.**
ADR-029 itself stands, and this ADR strengthens rather than weakens it.

**Context.** ADR-062 made the bypass impossible to reintroduce but could not
enforce anything, because enforcing would have denied operators the lots they
create. The product owner chose to grant `clear_internal`.

Investigating which roles should receive it produced a better answer than a
blanket grant, and found the actual root cause.

**The root cause: a grant copied across a role boundary where its reasoning did
not transfer.** `lib/rbac/catalog.ts` gave Farm Operator
`classification:clear_partner` with the comment *"Same classification grant as
Partner Field Collector (ADR-029 decision 2) — an operator on their own
assigned project still cannot clear internal."* But ADR-029's reasoning is
about **partners** — external parties — and a Farm Operator is not one. The
constraint was inherited along with the grant.

**Decision 1 — `clear_internal` for Farm Operator and Project Viewer.** These
are the only non-admin profiles holding `lot:view`. Every Lot defaults to
`internal`, so without it an enforced gate denies an operator their own records
and leaves Project Viewer — a role whose entire purpose is *"read-only
visibility into a project's operational data"* — seeing none of it. Project
Viewer held **no clearance at all**, which was invisible while the gate went
unapplied.

Against today's behaviour this is a **narrowing, not a widening**: with the
gate unenforced those roles could reach `confidential` and `trade_secret`
records too. They now stop at `internal`.

**Decision 2 — Partner Field Collector is deliberately unchanged.** ADR-029
decision 1 is not overturned. `partner.task` still holds one `internal` row and
one `partner` row, and a partner seeing only the second is the property ADR-029
verified live. Granting a partner `clear_internal` would have destroyed exactly
the thing this axis exists for.

**Decision 3 — Sensory Judge is deliberately unchanged.** Its profile excludes
`classification:clear_*` on purpose, so *"a judge's resolved permissions cannot
reach the blind-code mapping (RBAC.md §7), regardless of what the UI shows."*
Blind-judging integrity outranks convenience, and a judge denied an `internal`
session is a signal that session classification needs looking at — not a reason
to hand judges a clearance.

**Decision 4 — enforce on the lot and sample paths.** `requireLotAccess` and
`requireSampleAccess` now take the record's own `classification` as a required
field on every candidate, and pass it to `can()`. Create paths pass
`DEFAULT_NEW_RECORD_CLASSIFICATION`, so *"may this user create an internal
lot"* is a question that now gets asked. A measurement's `ScopeCandidate`
carries the subject's classification, so a measurement cannot be gated more
loosely than the lot or sample it is about.

**Verification.** 400 tests pass with the gate live, including the whole
traceability suite — enforcement did not break real flows. The two tests that
failed were the two ADR-062 wrote to pin the old state, one of them explicitly
so that *"whichever way ADR-062 is decided, this test has to be revisited
deliberately rather than quietly continuing to pass."* It did exactly that.
Both now assert the resolution, alongside two new tests pinning the
partner and judge exclusions so a future blanket grant fails loudly.

**Deployment hazard, stated plainly.** The new clearances are seed-managed
data. **If this code reaches production before `prisma db seed` runs there,
Farm Operator and Project Viewer lose access to every lot.** The seed must run
first. This is the same class of ordering problem the build guard solves for
migrations and does not solve for seeds.

**Remaining.** The inventory is now eleven sites, not thirteen — apiary
(three), research (two), competitions, calibration, locations, specimens, and
AI (two). Apiary,
research, competitions, calibration, locations, specimens and AI still pass the
sentinel — each is its own small decision about which record's classification
is the right one to gate on, not a blanket sweep.

---

## ADR-064 — Seed-managed data is applied by the production build, not by hand

**Extends ADR-058** (the guarded build), which applied migrations only.

**Context.** ADR-063 shipped a permission change: Farm Operator and Project
Viewer needed a `clear_internal` grant before the enforced classification gate
could deploy without denying them every lot they had created. That grant lives
in `prisma/seed.ts`, and nothing in the pipeline ran the seed. The clearances
reached production only because they were applied by hand, deliberately, before
the deploy — and the ordering was verified by counting the grants (86 → 89)
rather than assumed.

That worked once because someone was watching. The hazard is structural, not
specific to ADR-063: Permissions and Role Profiles are seed-managed data
(RBAC.md §2), not schema, so `prisma migrate deploy` never touches them. Any
future grant has the same shape — code that depends on it can reach production
first, and the failure is a live lockout rather than a build error.

**Decision.** The production branch of `scripts/vercel-build.sh` runs
`prisma db seed` after `prisma migrate deploy`.

After, never before: the seed writes rows, so it needs the schema those rows
live in. Both stay inside the `VERCEL_ENV = production` test, because
`DATABASE_URL` is scoped to Production in this Vercel project and preview
builds have no database at all.

Running it on every production deploy is safe because the seed is entirely
upserts on natural keys with no delete anywhere in it, so a re-run is a no-op.
That property is load-bearing. If a destructive step is ever added to the seed,
this decision has to be revisited rather than worked around.

**The demo gates are cleared explicitly**, via `env -u`, rather than trusted to
be absent from the Vercel dashboard. The gates are opt-in by design,
specifically so a production pipeline never ships a default login — but
"nobody has set that variable" is a weaker guarantee than "it is unset at the
point of use", and it degrades silently. A stray `SEED_DEMO_CONTENT` would
otherwise write demo projects into the real research record.

**Verification.** The production branch was exercised against the local test
database with all four `SEED_DEMO_*` variables deliberately set. The seed ran,
reported 38 permissions and 11 role profiles, and left the pre-existing demo
rows untouched — their `updated_at` unchanged at nine days old, which is the
evidence that the gate held rather than merely that no new rows appeared.
Real data was unchanged: 51 lots, 23 people.

**What is tested, and what is not.** `tests/seed/buildGuard.test.ts` makes
static assertions about the script, because the behaviour itself only happens
on Vercel with production credentials attached. It pins the part that rots:
the guard names the demo gates literally, so it silently stops covering any
gate added to the seed afterwards. That assertion was mutation-tested — a
renamed gate in `seed.ts` fails the suite and names the gate that was missed.
Ordering is asserted over the script with comment lines stripped, because the
header explains `prisma migrate deploy` many lines above the line that runs it,
and an `indexOf` over the raw file passes for the wrong reason.

**Consequence.** A permission change now ships with the code that depends on
it, in the right order, without anyone remembering to run the seed. The manual
pre-deploy seed done for ADR-063 remains correct and is not undone by this —
the next production build will re-apply the same upserts to no effect.

---

## ADR-065 — The Prisma client is generated by the build, not inherited from a cache

**Amends ADR-064**, which added seeding to the same script.

**Context.** Every open pull request had a failing Vercel preview check, all
with the same error: `Can't resolve '../generated/prisma/client'`. The
generator writes to `generated/prisma`, which is gitignored, so the client does
not arrive with a checkout — and nothing in the pipeline created it. There is
no postinstall hook, and `prisma migrate deploy` does not generate. That was
verified rather than assumed: with the directory removed, `migrate deploy` left
it absent and `prisma generate` restored it.

Production builds were succeeding anyway, which is the part worth recording.
They were not reproducible — they were reusing Vercel's restored build cache,
which still held a `generated/prisma` from an older deployment. Preview builds
restore a different cache and so failed every time. Production was one cache
eviction away from the same failure, and nothing would have warned first.

**Decision.** `npx prisma generate` runs unconditionally at the top of
`scripts/vercel-build.sh`, before the production branch and before
`next build`.

Unconditional, not inside the `VERCEL_ENV` test, because preview builds need
the client just as much and generating touches no database — it reads
`prisma/schema.prisma` and writes TypeScript. This is the one step in the
script that is safe everywhere, which is why it sits outside the guard that
exists to keep database work away from previews.

**Verification.** `generated/prisma` was deleted and the build run with no
`DATABASE_URL`, `DIRECT_URL` or `TEST_DATABASE_URL` and `VERCEL_ENV=preview` —
the conditions a preview deployment actually has. The client was generated and
the build compiled. That reproduces the failing preview and shows it cleared.

**Consequence.** A build no longer depends on what a previous build left
behind. This was found while preparing to merge the stack: sixteen pull
requests all reported a failing check, and the check was right.

---

## ADR-066 — Demo and test records removed from production

**Context.** Production carried records that were never real. Two `DEMO`
projects seeded on 2026-08-13, four `TEST RO1 Session` rows left by the test
suite from when it still ran against production (the practice ADR-058's
companion work ended by moving the suite to a restored local database), and
four `DEMO` identities including a `DEMO Platform Admin` login.

None of it was doing harm where it sat, but CLAUDE.md §54 asks that
demonstration data be clearly labelled *development* seed data, and this was
labelled demonstration data living in the production research record. The
sensory module was the clearest case: production held six sensory sessions and
not one of them was real.

**The hazard that shaped the work.** Deleting the two `core.project` rows on
their own would have been worse than leaving them. Most foreign keys into
`core.project` are `SET NULL`, not `CASCADE` — including `traceability.lot`,
`core.sample`, `research.experiment` and `research.treatment_batch`. The eight
demo lots and five demo samples would have survived with `project_id` NULL:
demo records sitting in the real tables with nothing left to identify them by,
and no error raised. A cascade that silently detaches is more dangerous than
one that refuses.

**Decision.** Remove the demo subtree rather than its roots, in two rounds,
each: verified backup → rehearsal on that exact snapshot restored locally →
apply in one transaction whose post-conditions abort on any surprise.

Round one removed 90 rows across 15 tables — projects, lots, samples, sensory
sessions, transformation inputs and outputs, quantity events, the apiary chain
(hive → colony → inspections), a product, a story, an experience, partner tasks
and domain tags. Round two removed 20 more: the four TEST RO1 sessions, the
four DEMO identities with their accounts and assignments, and four orphaned
runs. Production went from 14,781 rows to 14,671, confirmed against the row
census in the backup manifests either side.

**Why the identities needed more care than the content.** 104 foreign keys
reference `core.person` or `core.user_account`, nearly all `created_by` with
`SET NULL` — `core.audit_event.actor_user_account_id` among them. Deleting an
account that owned real provenance would have blanked it silently, which is the
audit-trail failure §35 exists to prevent.

So every one of those 104 columns was swept rather than a sample checked: only
twelve rows referenced DEMO identities, none of them real, and no audit event
named a DEMO actor. The script re-asserts each of those conditions at runtime,
because the sweep measured the data rather than guaranteeing anything about it,
and the answer has to still hold at the moment of the delete.

**What the rehearsal caught.** Three things that would each have failed against
production: a column named `session_id` that does not exist on
`sensory_blind_mapping`, a blind-mapping chain that runs through blind samples
and flights rather than sessions, and the demo hive's colony holding `RESTRICT`
children. Rehearsing on a restored copy turned three production incidents into
three cheap iterations.

**A consequence worth recording.** Round one created its own residue: removing
the demo lots took their `lot_transformation` rows, stranding two fermentation
runs and two drying runs that pointed at nothing. They were the only rows in
those two tables. Round two's sweep found them. Deleting a subtree can orphan
rows *above* it, and reachability from the deleted roots does not describe that
set — only a fresh sweep afterwards does.

**Verification.** On the rehearsal copy, every foreign key in the database was
validated after each round: zero dangling, zero orphaned lots or samples. That
was deliberately not repeated against production, where
`ALTER TABLE ... VALIDATE CONSTRAINT` takes table locks and the data was
identical. Real data is unchanged at 43 lots, 17 people, 3 projects, 14
organizations, 43 treatment batches, 4,773 audit events, 89 permission grants
and 38 active assignments.

Farm Operators clearing `internal` went from seven to six; the seventh was the
DEMO account, and the remaining six are real people. Production now reports
zero sensory sessions, which is accurate rather than a loss.

**Backups.** `2026-08-22T004622Z` before, `2026-08-22T005229Z` between rounds,
`2026-08-22T005913Z` after — each restore-verified into stock PostgreSQL 18,
row counts identical. The pre-removal backup is the recovery path if any of
this is ever wanted back.

---

## ADR-067 — Bootstrapping the first login and the first administrator

**Context.** After ADR-066, production held real research data, enforced RBAC
and classification, served a working export — and could not be used by anyone.
Two separate deadlocks, found together:

Nobody could authenticate. Fourteen accounts, all `invited`, all `credentials`,
none holding a password hash. Checking the pre-removal backup showed why: the
only three accounts that ever had a password, and the only three that had ever
logged in, were the seeded `DEMO` ones. Removing them was still right — demo
credentials in a production research record are worse than none — but it took
the last usable login with it.

Nobody could administer. Zero active `Platform Admin` assignments existed at
all. The platform owner held Research Lead at platform scope, which is seven
research permissions and no ability to manage users, permissions or commerce.

The second deadlock is self-locking: granting Platform Admin requires
`rbac:manage_permissions`, which only Platform Admin holds. With no holder, the
role cannot be granted from inside the application, ever. The first
administrator has to come from outside; every later one can be granted through
the UI.

**Why not sign-up.** The sign-up flow creates a new Person. The people here
already exist, with Assignments attached — a second Person record for the same
human is precisely what CLAUDE.md §2 forbids, and it would leave the
Assignments pointing at the wrong identity.

**Decision.** Two operator scripts, run deliberately from a terminal, not
wired into the deploy.

`scripts/set-password.ts` sets a credentials password on an existing account
and activates it. The password is prompted with echo disabled and is never
accepted as an argument: an argument survives in shell history and in the
process list, outliving the command that used it. The value is never logged and
never written anywhere but the Argon2id hash. The audit record says credentials
were set and by what route — never the password, never the hash.

`scripts/grant-platform-admin.sh` grants Platform Admin at platform scope. The
insert is guarded by `NOT EXISTS` and the audit row is written from that
insert's `RETURNING`, so a re-run changes nothing *and records nothing*. The
first draft wrote the audit row separately, and a second run recorded a
creation that had not happened — an append-only trail must not carry entries
for events that did not occur. Post-conditions assert exactly one active
assignment and that `role_profile_permission` still holds 89 rows: this grants
a role to a person and must never alter what the role means.

**On the boundary this respects.** The script sets a password without the
password ever reaching the transcript, the model, or the machine's history.
That is the point of prompting rather than parameterising — it is a design
constraint, not a convenience.

**Verification.** Six tests in `tests/auth/setPassword.test.ts` cover what the
script cannot demonstrate in CI, since it deliberately requires a TTY: that
Argon2id round-trips, salts, rejects a wrong password, produces an `$argon2id$`
hash rather than bcrypt or scrypt, and — most importantly — that an account the
script has written satisfies every condition `authorize()` checks, found by the
same query `authorize()` runs. A password that hashes but does not verify would
surface only at the login form, which is the worst place to discover it.

A test also pins that a valid password is not sufficient on its own: an account
whose status is not `active` stays locked out while its hash still verifies, so
deactivation works as a control by itself.

The grant was rehearsed against a restored copy — applied, re-applied, and
refused for an unknown email — and its post-conditions held each time.

**Consequence.** Neither script runs on deploy and neither is reachable from
the application. Both are deliberate acts by someone with database access,
which is the correct amount of friction for creating the account that can do
everything.

---

## ADR-068 — The rest of the classification sites, and the distinction between deferred and not applicable

**Completes ADR-063**, which enforced the gate on the lot and sample paths and
left eleven sites carrying `CLASSIFICATION_GATE_DEFERRED`.

**Context.** Working through the eleven showed they were not eleven instances
of one job. They fall into three kinds, and treating them uniformly — which is
what "eleven remaining sites" implied — would have been wrong in two different
directions.

**First correction: classification lives on thirteen tables, not the four or
five earlier ADRs record.** `asset`, `experience`, `location`, `organization`,
`product`, `project`, `sample`, `story`, `field_submission`, `task`,
`sensory_descriptor`, `sensory_session` and `lot` all carry it. That matters
because it decides which sites have a subject to gate on at all.

**Kind one — the record carries its own classification.** `location` does.
`requireLocationAttributeAccess` and `requireSpecimenAccess` now load it and
pass it. A Specimen has no classification of its own, but the Location it
stands at does, and where a plant grows and whether that site is internal are
the same question.

Both refuse a record that cannot be loaded rather than falling back to
`public`. Defaulting a missing record to the most permissive level is how a
gate gets bypassed by a stale id.

**Kind two — the record belongs to something that carries one.** Research
records — Experiment, Measurement, Protocol — have no classification; the
Project or Location the work belongs to does. `requireResearchAccess` resolves
those in two batched queries and gates each scope target on the matching
record, skipping any target whose record it could not load.

**Kind three — there is no record.** Five checks ask *may this account manage
competitions at all*, *review AI suggestions at all*, *manage sensory sessions
at all*, *review research activities at all*. They resolve against
`{ scopeType: "platform" }` and touch no row. Nothing's sensitivity is in
question, so `public` is the correct and final answer.

These were the second wrong direction: marked "deferred", they made five
permanent no-ops look like a backlog. They now use a separate named constant,
`CLASSIFICATION_NOT_APPLICABLE`. Both still evaluate to `public` and behaviour
is unchanged — the point is that the grep for deferred work now counts only
work that actually remains.

**What is still deferred, and why it is a decision rather than a task.**
Apiary: three sites (`apiary:view`, `apiary:manage`, `colony_event:manage`).
Enforcing them would gate on the Project or Location, exactly as research now
does — and that would lock `Apiary Colony Event Recorder` out of every internal
location, which is sixteen of twenty-eight. The role holds `apiary:view` and
`colony_event:manage` and clears nothing.

That is ADR-063's hazard again, and it was checked the same way before writing
any code: of every role holding a permission touched by this change, exactly
one lacks the clearance it would need. One person currently holds that role,
and the apiary tables are empty, so nothing breaks today — but it would break
the moment the module is used. The choice is to grant the role
`clear_internal`, as ADR-063 did for Farm Operator, or to leave apiary
deferred; both are defensible and it is not a decision to slip into a
refactor.

**Verification, and why the passing suite proved nothing on its own.** The
enforcement change passed all 411 existing tests without a single failure —
because every seeded role holding these permissions already clears `internal`,
so no existing fixture could exercise a refusal.

`tests/traceability/classificationGate.test.ts` builds a role that holds the
action permissions and no clearance, and drives the real service functions
against the database. Each case is a pair: the same caller, the same record,
refused at `internal` and allowed at `public`, so only the classification
differs between them. Reverting `locations.ts` to pass a constant fails the
refusal case, which is the regression these tests exist to catch.

**Also removed:** three unused `CLASSIFICATION_GATE_DEFERRED` imports, one of
them stale since ADR-063. The sentinel's entire value is that grep returns a
true inventory; an import with no call site inflates it and makes finished work
look pending.

---

## ADR-069 — Apiary joins the gate, and the deferred inventory reaches zero

**Completes ADR-068**, which left apiary as the one open decision rather than
the one remaining task.

**Decision.** `Apiary Colony Event Recorder` is granted
`classification:clear_internal`, and the three apiary call sites now gate on
the classification of the Project or Location the hives belong to.

**Why the grant is the correction, not a loosening.** The profile holds
`apiary:view` and `colony_event:manage` and cleared nothing. Sixteen of
twenty-eight Locations are `internal`, and that is where hives stand — so
enforcing the gate without this would have left the role able to reach neither.
That is the same defect ADR-063 corrected for Farm Operator: a role that cannot
see the records it exists to write.

The profile's real boundary is the *absence* of `apiary:manage` — no
Inspections, no Hives, documented as a competence gate on the Assignment. That
is untouched. Clearance to see internal sites is not authority to do more at
them, and a test pins exactly that: the recorder is denied `apiary:manage` at
both `internal` and `public`, so the grant cannot quietly widen into the
permission list.

The exclusions ADR-063 drew still hold: Partner Field Collector clears only
`partner`, Sensory Judge clears nothing. Both remain external parties. A
trainee on staff is on the other side of that line, which is what made this a
decision for the product owner rather than a refactor.

**Shared resolution.** Research and apiary need identical logic — resolve the
Project/Location classification, skip a target whose record cannot be loaded,
treat a platform target as not applicable. That now lives once in
`lib/rbac/scopeClassification.ts` rather than as a second hand-written copy;
the skip-don't-default rule is subtle enough that a duplicate would eventually
get it wrong.

**Ordering, and the first change to be protected by ADR-064.** ADR-063's
hazard was that enforcement could reach production before the clearance it
depends on, locking people out. That required a hand-run seed, done
deliberately and verified by counting grants.

Nothing manual was needed this time. The guarded build runs `prisma db seed`
after `migrate deploy` and *before* `next build`, and Vercel promotes a
deployment only after its build succeeds — so the grant lands in production
while the old code is still serving, and the enforcing code goes live after it.
The ordering hazard is now closed by the pipeline rather than by remembering.

**Verification.** 89 grants → 90, rehearsed on a restored local copy. The
clearance table was checked directly afterwards: the recorder clears
`internal`, Farm Operator still `internal, partner`, Partner Field Collector
still `partner` only, Sensory Judge still nothing.

A discrepancy worth recording: the local count read 92, not 90. Two of those
were an orphaned test fixture left by a run whose cleanup threw — not a seed
defect. Chasing the difference rather than assuming it was the change is what
kept the production estimate right.

`grep -rn CLASSIFICATION_GATE_DEFERRED lib app` now returns no call sites. The
sentinel is deliberately kept rather than retired, with its documentation
rewritten: a future module not yet ready to gate should use it and stay
greppable, instead of passing a bare `"public"` and vanishing from the
inventory. SECURITY.md §4 is updated to describe enforcement as it now is —
that section previously overclaimed, which is what ADR-062 had to correct, and
it should not be allowed to drift again.

---

## ADR-070 — The build runs before the database is touched

**Amends ADR-064**, which added seeding to the guarded build and put it before
`next build`.

**Context — an incident, not a theory.** The production deploy for ADR-068
failed. A TypeScript error in a test file (`classificationGate.test.ts`, a
cleanup helper typed too generically for Prisma's model delegates) failed
`next build`. Its own log shows the order that mattered:

```
▲ seeding permissions, role profiles and catalogs
  Seeded 38 permissions and 11 role profiles.     <- ran
✓ Compiled successfully
tests/…/classificationGate.test.ts: error TS2345  <- then failed
Error: Command "npm run build" exited with 1
```

The deployment was never promoted, so the code never reached users. But the
seed had already run against production. **A deploy that does not ship was able
to write to the production database.**

Nothing was damaged — the seed is idempotent and that change carried no grant —
so this is a near miss recorded as a hazard, not a loss.

**Decision.** `next build` runs before `prisma migrate deploy` and
`prisma db seed`. Any build failure — type error, compile error, bad import —
now happens while the database is still untouched.

This is safe because `next build` needs no database, which was verified rather
than assumed: a clean checkout builds with `DATABASE_URL`, `DIRECT_URL` and
`TEST_DATABASE_URL` all unset, compiling and statically generating every page.

Ordering for the live site is unchanged, which is the property worth
preserving: Vercel promotes a deployment only after the whole command exits 0,
so migrations and seed still land while the old code is serving and the new
code goes live after them. That is what ADR-064 added and ADR-069 relied on,
and it still holds — the change only moves *when a failure stops us*, earlier,
before any write.

**Verified by reproducing the incident.** A deliberate type error was planted
and the production path run against a restored local copy: the build failed,
neither migrate nor seed executed, and the grant count was identical before and
after. Under the old ordering the seed would have run first. The new assertion
in `tests/seed/buildGuard.test.ts` was mutation-tested by moving `next build`
back to the end, which fails it.

**The process failure underneath, recorded because the code fix does not
address it.** PR #22 was merged with its Vercel check already reporting
`FAILURE`. In practice it was pushed and merged within seconds, so the check
had not finished reporting — which amounts to the same thing: the signal that
would have caught this existed and was not waited for.

Building first limits the blast radius of that mistake; it does not prevent the
mistake. A pull request should not be merged until its Vercel check has
reported, and `npm run typecheck` is the local equivalent — `vitest` passing
proves nothing about types, and 416 green tests were reported for a change that
could not build.

---

## ADR-071 — The public register, and the DEMO places ADR-066 missed

**Context.** Two problems, found by opening `/discover` as a visitor would.

**First: ADR-066 did not remove all the demo data, and the report that followed
was wrong.** That cleanup removed the demo *project subtree*, and it was
thorough about what a project reaches. But a Location carries no `projectId`
and an Organization carries none either, so neither was ever in scope — they
were not spared by a judgement call, they were never looked at. Eight records
survived: five Locations and three Organizations. Six of them are `public`, so
"DEMO Cloudline" and "DEMO Amber Ridge" are what a visitor sees today.

The lesson generalises past this instance: a cleanup scoped by reachability
from a root only removes what that root reaches, and the verification that
follows must check the axes the root does not touch — not just re-query the
subtree that was deleted.

Nothing real references them. Every inbound reference is DEMO to DEMO (four
Locations belong to demo Organizations, two are children of demo parents), and
every RESTRICT relation — specimen, hive, harvest_event, storage_assignment,
organization_membership — counts zero.

Applying the deletion to production was refused by the safety classifier, which
is correct for a destructive production write. It ships instead as
`npm run data:remove-demo-places`: the same guarded single transaction,
rehearsed against a restored copy, for the product owner to run.

**Second: the page carried a standing disclaimer that had become a lie.**
`/discover` opened with "everything on this page is demo content — plausible
but fictional data, not real project information." Boquete, Cerro Azul and both
stories are real. A permanent disclaimer that is wrong is worse than none: it
teaches a reader to disbelieve the real material, and it was unconditional, so
nothing would ever have retired it. Removed, along with its now-dead strings
and the `.nn-demo-banner` rule.

**Decision — the editorial register, scoped rather than routed.** ADR's design
pass built the operator register: dense sans, small uppercase index labels,
card elevation, tuned for someone standing in a wet mill. CLAUDE.md §48 asks
for *one* system in which public and operator surfaces carry different density.

`.nn-editorial` is that other half — serif headings from a system stack (no
webfont, nothing fetched at build or runtime), chapter-mark section rules
instead of index labels, flatter cards, more air, a wider grid because a story
summary needs room to be read where a batch code only needs to be scanned.

Scoped by class, not by route, so a page opts in by saying what it is. Colour,
spacing tokens and the tap-target guarantees stay shared: only typography,
rhythm and card weight change. Verified both ways — `/discover` computes serif
at 36px with a 24px chapter rule and no card shadow, while `/lots` still
computes sans at 32px with 12.8px uppercase labels and elevation intact.

**Also.** `/discover` rendered five headed sections whether or not each had
content, so a visitor met "no public content in this category" repeatedly.
Only sections with content render now, and stories lead, because a visitor
arriving with no context needs a way in rather than a directory. The empty
state is said once, and only when the whole page is empty — the same correction
the lots page needed.

Mobile re-checked: nav links at 44px, no sideways scroll, every card inside the
viewport at 375px.
