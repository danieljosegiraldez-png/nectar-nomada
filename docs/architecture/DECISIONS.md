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

---

## ADR-072 — Person.email is unique, and email addresses arrive from a person

**Context.** Only one account can sign in, because fifteen of seventeen People
have no email address (ADR-067). Fixing that is not a code problem: an address
is a business fact, and CLAUDE.md §61E is explicit that these are not to be
invented. It has to come from someone who knows it.

Preparing to accept them surfaced a defect underneath. `authorize()` resolves a
login with

```ts
findFirst({ where: { authProvider: "credentials", person: { email } } })
```

and `Person.email` had **no unique constraint**. Two People sharing an address
would have made *which* of them signs in arbitrary — and arbitrary in a way
that decides which records a session can reach. `app/actions/auth.ts` did check
for a duplicate before inserting, but that is an application-level check with a
race between the read and the write, not a guarantee.

**Decision.** `Person.email` is `@unique`, with a migration adding
`person_email_key`.

NULL stays allowed, because Postgres treats NULLs as distinct in a unique index
and most People still have no address. A plain unique index is sufficient
rather than one over `lower(email)`, because `signUpSchema` and `loginSchema`
both `.toLowerCase()`, so a case-variant duplicate cannot arise through the
application; the CLI below normalises the same way for the same reason.

Verified against production before writing the migration: zero duplicates,
case-insensitive. The constraint was then proven on a restored copy — a second
insert of the same address raised `unique_violation`, and two NULL addresses
still inserted cleanly.

**It found a real duplicate immediately.** `tests/traceability/export.test.ts`
called one fixture helper twice, and both calls used the same
`RUN_ID`-derived address. That had always been wrong — two accounts, one
email, resolved by `findFirst` — and nothing had ever objected. The suite went
red on the constraint, which is the constraint working.

**`scripts/set-person-email.ts`** takes the address from an operator. It
normalises exactly as the schemas do, matches a Person by exact display name or
id (never fuzzily — a near-match would attach someone else's address to them,
and the mistake would surface as a login reaching the wrong records), refuses an
address already held by someone else *by name* rather than letting the
constraint raise, and is a no-op when the address is unchanged.

It also creates the credentials `UserAccount` where none exists — three People
had none at all, and without one they cannot be given a password even after an
address is set. The account is created `invited` with no password, which is the
state everyone else already occupies until `auth:set-password` runs.

Run with no arguments it lists who can sign in and who cannot, which is the
question this whole area exists to answer.

**One implementation note worth keeping.** The person lookup originally tried
`{ OR: [{ id: who }, { displayName: who }] }`. Against a uuid column a display
name is not a miss, it is a database error — so the id branch is only offered
when the argument actually looks like a uuid.

---

## ADR-073 — Organizations carry their own contact details

**Context.** An organizational email address (`nectarnomada@gmail.com`) was
offered for Néctar Nómada, and there was nowhere to put it. Néctar Nómada
exists as an Organization, not a Person, and `Organization` had no contact
fields at all — no email, no phone, no website.

The alternatives were both wrong. Creating a Person named "Néctar Nómada" to
hold it would have made a shared login whose every action is attributed to the
organization rather than to whoever performed it — which cuts directly against
the provenance and `created_by` discipline the rest of the platform is built
on. Attaching it to a member's Person record would make a fact about the
organization depend on who currently works there.

**Decision.** `Organization` gains `contactEmail`, `contactPhone` and
`websiteUrl`, all nullable.

CLAUDE.md §9 models Organizations as canonical entities — a farm, a roaster, a
laboratory. How to reach one is a fact about it, and this is where facts about
it live.

All three are nullable because most organizations will not have them, and
CLAUDE.md §3 is explicit that missing information stays missing rather than
being filled in.

**Not unique, unlike `Person.email` (ADR-072).** That constraint exists because
`authorize()` resolves a login by that column, so a duplicate would make *which*
account signs in arbitrary. An Organization never authenticates; no lookup's
answer becomes ambiguous, and two organizations sharing an owner's address is
ordinary rather than an error.

**Visibility is already governed.** `Organization.classification` decides who
may see the record, and these columns are part of it — an `internal`
organization does not publish its phone number merely because the column
exists. Néctar Nómada is currently `internal`, so recording an address here
does not put it on the public site; that would be a separate, deliberate
reclassification.

**`scripts/set-organization-contact.ts`** accepts them from an operator.
`--email=` normalises and shape-checks; `--website=` requires an http(s) URL
and normalises through `URL`; `--phone=` is deliberately *not* pattern-checked,
because phone formats vary by country and a regex there would reject real
numbers rather than catch typos. An explicitly empty flag clears a field, while
an absent flag leaves it untouched — so setting a phone number cannot silently
erase a website. Matching is by exact name or id, never fuzzy, for the same
reason as ADR-072.

Run with no arguments it lists every organization and what is recorded, which
is the fastest way to see the gap this ADR closes.

---

## ADR-074 — Users & Permissions administration

**Context.** The platform owner held `platform:manage_users` and
`platform:manage_permissions` and could exercise neither. No route in the
application created or revoked an Assignment — every role change went through a
script or raw SQL, which meant through me.

That was not a missing capability. `lib/rbac/service.ts` already had
`createAssignment` and `revokeAssignment`, both writing an AuditEvent per
RBAC.md §8, both correct. What was missing was any way to reach them. This is
CLAUDE.md §4's "Platform Command Center → Users, Permissions", and it was the
last thing standing between "Daniel's platform" and "the team's platform":
ADR-072 gave Nathy Rubio an address, and giving her a role still required
another round trip.

**Decision.** `/admin/users` — one page listing every Person with their account
state and roles, a form to grant, and a revoke control per assignment.

**Gated on `manage_permissions`, not `manage_users`.** Granting a role *is*
managing permissions. Someone holding only `manage_users` would have found the
page refusing them, which is exactly the failure `lib/navigation.ts`'s second
rule exists to prevent — never offer what the server will refuse.

The check runs server-side before any data is read. The nav entry hides itself
for someone without the permission, and the page refuses regardless, because
SECURITY.md is explicit that a hidden control is not an authorization boundary.

**Scope names, not ids.** Assignments render as "Farm Operator — Las Nubes
Cerro Azul — Café", resolved in two batched queries. `/my-nectar` used to print
the raw uuid (ADR-071's sibling problem) and it told the reader nothing.

**Scope rows are reused, never duplicated.** Two Scope rows for the same
(type, ref) silently split grants between them, so a permission check resolving
against one misses an Assignment attached to the other. A platform-scoped grant
is forced to a null ref for the same reason.

**The guard that matters: the last Platform Admin cannot be revoked.** ADR-067
recorded the deadlock — granting Platform Admin requires
`rbac:manage_permissions`, which only Platform Admin holds, so with no holder
the role can never be granted from inside again. Escaping it took two
out-of-band scripts. Making revocation available through a UI makes walking
back into it a two-click operation, including by revoking your own.

The decision is a pure predicate, `wouldRemoveLastPlatformAdmin`, separated
from the query that counts. Whether one is the last is global state, so an
integration test could only reach the zero-remaining case by revoking the real
administrator the suite runs as. The predicate is exhaustively unit-tested; the
service test proves the guard does not *over*-refuse while another admin
exists, which is the half integration can reach honestly.

**Errors are returned, not thrown.** "You cannot revoke the last Platform
Admin" is a sentence the operator needs to read; an unhandled throw renders a
500 and loses it.

**A bug the tests could not have caught.** The revoke control was first placed
inside a `<p>`. A `<form>` cannot be a descendant of `<p>` — the browser closes
the paragraph before it, the server and client trees disagree, and hydration
fails. Thirteen passing service tests said nothing about it; opening the page
did. Verified fixed by inspecting the live DOM: zero forms inside a paragraph,
all thirty-nine revoke forms children of a `div`.

---

## ADR-075 — External identities, and the Google sign-in that would have crashed

**Context.** Enabling Google OAuth needs credentials from a Google Cloud
console, which only the product owner can issue. Reviewing the flow *before*
that setup found the flow itself was broken.

The `signIn` callback resolved a Google login by finding a Person with the
matching email and creating a `UserAccount` for them. But `person_id` is unique
on `user_account`: one Person has at most one account. So for any Person who
already had one, the create fails.

That is every account that can currently sign in. Reproduced before changing
anything: `Unique constraint failed on the fields: (person_id)`. The symptom
would have been "Google sign-in doesn't work", appearing only after the console
setup was finished, with nothing pointing at the cause.

**Why the constraint is right and the code was wrong.** Assignments hang off
`UserAccount`, so the account is what carries authority. Two accounts for one
Person would mean their roles differ depending on how they signed in — a far
worse failure than a crash. The model was correct; what it lacked was anywhere
to record a *second way of proving identity* for the one account.

**Decision.** `ExternalIdentity` — `(userAccountId, provider, subject)`, unique
on `(provider, subject)` and on `(userAccountId, provider)`.

Chosen over a `googleSubject` column on `UserAccount`, which would have been
smaller but provider-specific in the schema — the scattering CLAUDE.md §44
warns against, and needing another column for the next provider.

Credentials are deliberately *not* modelled as an identity: a password is a
property of the account (`passwordHash`), not a link to another system.

`user_account.auth_subject` is dropped rather than left behind. It held the
OAuth subject, is read nowhere once sign-in uses the new table, and had zero
non-null values in production — fourteen accounts, all `credentials`. A dead
column that still looks meaningful invites someone to write to it.

**Sign-in now resolves in three cases:** a known identity uses its account; a
known Person keeps their single account and Google is *linked* to it; nobody
matching creates Person, account and identity together.

**Two properties worth naming.**

An unverified Google address never matches an existing Person. Matching is done
on email alone, so without checking `email_verified` anyone able to set that
address on a Google account could claim the matching Person. An unverified
sign-in creates a separate Person carrying no email at all.

A non-active account is refused even through Google. Status has to be a control
that stands on its own — a second provider must not be a way back into a
suspended account. This is the same property
`tests/auth/setPassword.test.ts` already pins for passwords.

**Verification.** Six tests drive the real callback out of `authConfig` rather
than a copy of its logic. The linking test was mutation-tested by removing the
link branch, which reproduces the original failure exactly —
`Unique constraint failed on the fields: (person_id)`.

**Still required from the product owner**, and not something this ADR can
supply: a Google Cloud OAuth client, its redirect URI registered for both the
production origin and `http://localhost:<port>` for local work, and
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set in `.env` and in Vercel. The
provider only registers when both values are non-empty, so until then the
button does not appear and nothing changes.

---

## ADR-076 — A way to actually start the Google flow

**Context.** ADR-075 made Google sign-in resolve accounts correctly, and the
credentials were then configured in `.env` and in Vercel. Verifying it found
the remaining gap: **there was no button.**

`app/login/page.tsx` rendered the credentials form and nothing else, and
`signIn("credentials", …)` was the only sign-in call anywhere in the codebase.
The provider registered server-side — `/api/auth/providers` listed it — and no
user could reach it. Configuration alone is not a feature.

**Decision.** `/login` becomes a server component that decides which sign-in
methods exist and renders a "Continue with Google" button when the provider is
configured. The credentials form stays a client component in `LoginForm.tsx`,
because it uses `useActionState` for inline errors; only the decision moves,
since `process.env` is not readable from the client.

The button posts to a server action, matching every other auth path rather than
introducing a client-side `signIn()` call.

**The condition mirrors `lib/auth/config.ts` exactly** — both non-empty. Showing
a button that leads to "provider not found" would be worse than showing none.
This is presentation, not protection: with Google unconfigured, Auth.js has no
`google` provider registered and rejects the request regardless. Verified by
running the app with both variables unset and confirming the button is absent.

**No separate sign-up button.** A Google sign-in for someone with no matching
Person creates Person, account and identity together (ADR-075 case 3), so one
button serves both. A second control on `/signup` would imply a distinction the
flow does not have.

**Two things verified rather than assumed.**

`/api/auth/providers` locally reports the Google callback as
`http://localhost:3012/api/auth/callback/google`, matching the redirect URI
registered with Google. A mismatch there fails at Google's end, before the
application is reached, and is the most common way this integration breaks.

Production reports its base URL as the **stable alias**
(`https://nectar-nomada-package.vercel.app`), not the per-deployment hostname.
On Vercel that is worth confirming: had Auth.js derived the origin from
`VERCEL_URL`, every deployment would present a different redirect URI and none
would match what is registered.

**Still outstanding at the time of writing:** production's provider list does
not include Google, because that build predates the environment variable.
Environment variables apply to new builds only, so a redeploy is required — this
merge is it.

---

## ADR-077 — libpq connections verify the server, not just encrypt

**Context.** A routine production query failed:

```
weak sslmode "require" may not be used with sslrootcert=system (use "verify-full")
```

`libpq_url()` in `scripts/backup/pg-tools.sh` appends `sslrootcert=system` to
the connection string, and `DATABASE_URL` carries `sslmode=require`. libpq
tightened its rules and now rejects that pair.

The combination was always contradictory: `require` encrypts the connection but
verifies *nothing* — not the certificate chain, not the hostname — so pinning a
trust store alongside it asks libpq to check against a root it was never going
to consult. The error is libpq refusing to pretend.

**Why it mattered more than one failed query.** Every psql and pg_dump path in
the repository goes through that helper: `backup:db`, `backup:verify`,
`auth:grant-admin`, `data:remove-demo-places`. The next failure would have been
a backup — and the failure mode ADR-056 exists to prevent is precisely
discovering a backup problem when you need the backup.

**Decision.** `libpq_url()` upgrades a weak `sslmode` (`require`, `prefer`,
`allow`) to `verify-full` when it attaches the system trust store.

Stricter than before, not a workaround: `verify-full` checks the certificate
chain *and* that the hostname matches. The tempting fix — dropping
`sslrootcert=system` so `require` is accepted again — would have made the error
disappear while leaving the connection unverified, which is the wrong direction
for a connection carrying the entire research record.

**The application is unaffected**, and the reason is worth restating because it
is why two connection strings exist at all: Prisma connects through
node-postgres, which uses Node's own CA bundle and rejects `sslrootcert=system`
outright with `ENOENT: open 'system'`. Only the libpq path takes this
treatment. Confirmed during diagnosis — the app was connecting normally while
psql refused.

**Verification.** `backup:db` and `backup:verify` were run end to end after the
change: 123 tables, 14,673 rows, restored into stock PostgreSQL 18 with every
count identical. `auth:grant-admin` connects and its guard fires.

`tests/backup/libpqUrl.test.ts` runs the shell function *as shell* rather than
restating it in TypeScript — a restatement can agree with itself while the
script does something else. Six cases, including that an already-pinned URL is
left alone and that `verify-full` is never downgraded; that last one guards
against the exact wrong fix. Mutation-tested by restoring the previous helper,
which fails two of them.

**Note on the deferred item.** The product owner previously deferred moving
Vercel's `DATABASE_URL` to `sslmode=verify-full`. That decision stands and is
untouched here — this changes only how local tooling builds its libpq
connection string. The two are separate connections with separate trust
mechanisms.

---

## ADR-078 — Internal references removed from the interface, and names sort naturally

**Context.** Walking the operator surfaces signed in surfaced two classes of
defect that no test would have caught, because both render correctly — they are
simply wrong to show a person.

**Internal references in user-facing copy.** Seven strings cited things only a
developer can act on:

- `/research` closed with "…tienen esquema y funciones de servicio pero no
  pantalla todavía — **fuera del alcance de este ticket** por diseño", half in
  English, describing ticket scope.
- `/sensory`, `/partner` and `/my-nectar` told the reader an admin could grant
  an Assignment **"(RBAC.md §5)"** — citing an architecture document.
- `/apiaries` carried the badge **"Apiario — A5"**; `/plots` and the batch page
  said conditions were recorded **"(F1)"**. Slice identifiers as UI copy.

Each rewrite keeps what the sentence was *for* — explaining why a page is empty
and what would change it — and drops only the reference. The research note has
no user-facing equivalent and was deleted outright: a reader cannot act on "no
screen yet", and DECISIONS.md already records what is unbuilt.

**Names containing numbers sorted as text.** `/plots` listed
Lote 1, Lote 10, Lote 2, Lote 3 … Both Postgres `ORDER BY name` and
JavaScript's default sort compare codepoint by codepoint: "1" precedes "2" and
the comparison stops there.

`lib/naturalOrder.ts` wraps `Intl.Collator` with `numeric: true`, applied to
the plot list and to the admin page's scope pickers, which draw from the same
locations. Being locale-aware it also sorts accented names where a Spanish
reader expects them rather than exiling them past Z — worth having in a
Spanish-first product.

Sorting happens in the application rather than in SQL because Postgres has no
natural-order collation by default, and adding one is a database-wide change
for a presentation concern.

**Verification, and a check that first proved nothing.** Curling the pages
returned zero matches for the offending strings — but every operator route
answers `307` to an anonymous request, so those zeros only proved the redirect
worked. Re-checked signed in: the badge reads "APIARIO", the ticket note is
gone, `(F1)` is absent, and plots list 1, 2, 3, 4, 5, 6, 9, 10.

A regex sweep across both message files now reports zero internal references,
which is the check that would catch the next one.

---

## ADR-079 — The Partner Workspace gates the Project, not only its contents

**Context.** Walking the operator surfaces showed `/partner` rendering project
descriptions including *"Sociedad Huerbsch. Daniel Giráldez como asesor y
posible socio (en negociación)"* — commercial standing, on a partner-facing
page.

Reading the module found why. Its own header already stated the rule: holding a
`partner:*` action for the project's scope **and clearing the specific
record's classification** is what makes a record visible. `isVisible()`
implemented exactly that for Tasks, field submissions and Assets.

The Project itself was never checked. `getPartnerProjects` filtered the list by
permission alone, and `getProjectWorkspace` returned the whole Project record —
name and description — while filtering only the contents inside it. A partner
assigned to an `internal` project would see it listed *and* be able to open it.

**Why the classification sweep missed it.** ADR-068 inventoried `can()` call
sites. This module calls `resolvedPermissionKeys` directly and applies its own
comparison, so it was never in the grep. The lesson is not about this file: an
inventory built from one function's call sites only covers code that goes
through that function.

**Decision.** The clearance test is extracted as `clearsClassification` and
applied to the Project in both places.

`getPartnerProjects` loads candidate projects before the loop so the gate has a
record to gate on, and requires both halves — the action permission says what
the account may *do* in the project, the clearance says whether it may know the
project exists at all.

`getProjectWorkspace` **refuses** an uncleared project rather than returning a
stripped one. A partner who cannot clear the project should be told no, not
shown an empty workspace implying the project is theirs. Hiding it from the
list would not have been enough on its own: the id is guessable and the URL
reachable, and SECURITY.md is explicit that the frontend is not the boundary.

**Exposure was latent, not live.** Nobody currently holds Partner Field
Collector, and every Project Viewer assigned to an internal project legitimately
clears `internal`. But ADR-074 has just made granting that role two clicks, so
the window was about to open.

**Verification.** Six tests using the *real* seeded Partner Field Collector
profile rather than a hand-built permission set, so they fail if that profile's
clearances ever widen. The assignment and the `partner:*` permissions are both
present in the negative cases — only the clearance is missing, so it is the
classification gate and nothing else doing the work. A matching positive case
proves the gate refuses *by classification* rather than refusing everything.

Mutation-tested by removing both gates, which fails three of the six.

---

## ADR-080 — Three defects on the batch page, all in the data handed to it

**Context.** Opening a real batch as an operator — the page where field work
actually happens — surfaced three problems. None was in the page's markup; each
was in what a service gave it.

**"Who took this reading" listed the reader seventh.** `getObserverCandidates`
returned every active Person ordered by `displayName`, and consumers render in
array order. The overwhelmingly common answer to that question is "I did",
entered on a phone, outdoors, often with wet hands — and it required scrolling
past six colleagues. Self now comes first, and the remainder uses the
locale-aware comparator from ADR-078 so accented names sort where a Spanish
reader expects rather than after Z.

**Lineage showed a uuid prefix.** "Provino de: 32311e6d" — a batch's parent
means something as `PE-79` and nothing as eight hex characters. This is the
same defect ADR-071 fixed on `/my-nectar`, in a place that sweep did not reach.
The lookup lives in the service beside the recursive lineage query rather than
in the page: a page that queries Prisma directly is how the next one gets
missed. A missing row still renders its id, so a dangling reference stays
visible rather than blank.

**The header asserted a quantity nobody had recorded.** With no QuantityEvent,
`computeCurrentQuantity` returned `{ quantity: 0, unit: null }`, and the page
rendered "Cantidad: 0 unidad desconocida".

That is not merely awkward phrasing — it is an inferred fact, which CLAUDE.md
§3 forbids in as many words: missing information must remain missing. It also
collapsed a distinction worth keeping. A lot that has been fully consumed
genuinely *is* zero, and the platform should be able to say so. `CurrentQuantity`
now carries `recorded`, and the page says "Cantidad no registrada" when nothing
has been weighed.

**Verification.** Five tests over the services, then the page opened signed in
to confirm all three render: "Cantidad no registrada", "Provino de: PE-79", and
"Yo (Daniel Giráldez)" first in every dropdown on the page.

The observer test uses a fixture named "ZZZ" deliberately, so it cannot pass by
accident of alphabet, and asserts the list still contains everyone — reordering
must not drop anyone.

**Not addressed here**, and still open from the walkthrough: the five
equal-weight actions offer no sense of which is the expected next step for a
batch at a given stage, the photo upload sits above those actions, and several
sections announce their own emptiness. Those are design decisions about what a
batch page should lead with, not defects, and worth deciding deliberately.

---

## ADR-081 — Sensory enforces the classification gate, and the judge gets the clearance that makes it a restriction

**Context.** ADR-079 found the Partner Workspace resolving permission keys
directly and never applying the classification half of the gate. The obvious
follow-up was to ask who else does that. Three callers of
`resolvedPermissionKeys` sit outside `lib/rbac`: Partner (fixed), `/my-nectar`
(platform scope, no record, correct as is), and `lib/sensory/service.ts`.

`SensorySession` has carried a `classification` column since it was added,
defaulting to `internal`, with this comment sitting on it:

> CLAUDE.md §10 classification axis — same independent AND-gate as every other
> module. Sensory data defaults internal (real judging results are rarely
> public until formally released).

Nothing read it. Every gate in that file resolved permission keys and stopped,
so a judge assigned to a `confidential` session opened it on
`sensory:submit_assessment` alone. This is the module CLAUDE.md §29 singles
out — "never reveal sample identity to a judge during blind evaluation" — and
while `blind_mapping:view` still held that specific line, the sensitivity axis
beside it was inert.

**Decision 1 — the gate is applied once, where the keys are resolved.** Rather
than adding a check to each of the five entry points, `grantedKeysForSession`
now loads the session alongside the permission resolution and refuses before
returning. A call site cannot obtain keys without the gate having run. A
session that cannot be loaded is refused rather than treated as public, the
same rule `scopeClassification.ts` already states for a missing Project or
Location: a stale id must not become the bypass. The refusal reuses
`no_session_access` on purpose — "you lack clearance" and "you have no
assignment here" are different facts, and which one applies is itself
information about the session.

**Decision 2 — Sensory Judge gains `classification:clear_internal`.** Every
session defaults to `internal` and the profile held no clearance at all, so
enforcing without this would have denied a judge every session they were
assigned to. That is ADR-063's finding for Farm Operator and ADR-069's for the
colony event recorder, a third time: a gate enforced against a profile with no
clearance makes a role useless rather than restrictive.

The exclusion had a stated reason — that withholding `clear_*` kept a judge's
resolved permissions away from the blind-code mapping. RBAC.md §7 does not
describe that mechanism. It puts the mapping in its own table behind
`blind_mapping:view`, "so a Judge's resolved permission set genuinely cannot
query the mapping", which remains true and is the lock that was doing the work.
Using absence-of-clearance as a second, undocumented lock cost the clearance
axis its own purpose. Granting `clear_internal` and enforcing is a **narrowing**
against the previous behaviour, where the gate applied nowhere and a judge
reached `confidential` and `trade_secret` sessions too.

**Decision 3 — the session list is gated on both halves, like the open path.**
`getJudgeSessions` filtered on the Assignment alone, so a session-scoped
profile holding no `sensory:*` permission saw its sessions listed and hit
`no_session_access` on opening one — the same list/open divergence ADR-079
found in Partner. It now applies the identical two conditions
`getSessionForJudge` gates on. A list that shows what cannot be opened is its
own defect; a list carrying the *names* of sessions above the reader's
clearance is the leak.

**Decision 4 — sensory history is gated too, though the rows are the caller's
own.** `getAssessmentHistoryForEvaluator` returns only assessments the caller
authored, and ownership was treated as sufficient. It is not: each row carries
the session and protocol names alongside, and those belong to the session's
classification rather than to the evaluator. Without this, "My Tastings" is the
way around the gate everything else applies, and a session reclassified upward
keeps surfacing its name to whoever once judged it.

The tradeoff is real and worth naming: a judge who loses clearance loses
entries from their own history view. The assessment is untouched — stored,
immutable, auditable, and back in the list the moment clearance returns. What
the filter withholds is the reading, never the record.

**`clearsClassification` moved to `lib/rbac/scopeClassification.ts`.** It was
private to `lib/partner/workspace.ts`. Two modules independently omitting the
same rule is the argument for it living beside the other classification
helpers, where the second caller borrows it instead of re-deriving it — the
reasoning that file's own header already gives.

**Verification.** Fourteen tests. Every case in
`tests/sensory/classificationGate.test.ts` is a pair in which only the
session's classification changes, so a gate that reverted to a constant would
show up as refusal-cases passing, and a gate that began refusing everything
would show up in the paired allow-cases. Mutating `clearsClassification` to
`return true` fails six of them plus ADR-079's three, which is the evidence
that the classification is what refuses rather than something incidental. The
roles are the real seeded profiles, so the tests fail if Sensory Judge's or
Sensory Head Judge's clearances ever widen past `internal`.

`tests/rbac/resolve.test.ts` carried an assertion that a judge holds no
clearance at all. That test encoded the decision this ADR reverses, so it was
replaced rather than deleted: one case asserts the judge now reaches `internal`,
and a second asserts what must not have broken — `blind_mapping:view` is
unreachable at every classification, and `confidential` and `trade_secret`
sessions are closed.

**Live impact today: none.** The database holds zero SensorySessions and one
active Sensory Judge assignment, so this closes the gate before the module
carries real judging data rather than after. The catalog grant reaches
production through the seed on the next deploy, which is additive and
idempotent.

**Not addressed here.** `getSensoryLinkageForSamples` in
`lib/traceability/lots.ts` still skips the check deliberately, with its
reasoning recorded in place: it returns only a computed aggregate and the
session's name/status to a Farm Operator looking at their own sample, and the
ticket's framing gates on whether a result was computed rather than on the
session's classification. Left as it stands, and still a one-line change if
that turns out to be the wrong call.

---

## ADR-082 — Signing in lands you in your work, not in a reading of your own permissions

**Context.** All three sign-in paths — credentials, signup, Google — passed
`redirectTo: "/my-nectar"`. That page opens on the viewer's Assignments and
then their thirty-eight resolved permission keys grouped by resource. It is a
reasonable account page and a poor place to arrive: an operator signing in on a
phone at a beneficio wants the lots that are fermenting, not an inventory of
their own access.

The operator's work page already existed. `/lots` leads with
`getActiveOperations` — fermentation and drying runs under way, lots gone
unmeasured past the staleness threshold, samples awaiting sensory — all scoped
to what the viewer's Assignments actually reach. Nothing needed building. The
sign-in flow simply never went there.

**Decision 1 — a landing priority list, deliberately not the nav order.**
`landingDestination` in `lib/navigation.ts` sits beside `buildNavigation` and
takes the same `permissionKeysAnywhere` set, for the same reason: a farm
operator's `lot:manage` lives on a project scope that a platform-scoped
resolution cannot see, and choosing what to *offer* is a wider question than
choosing what to *allow*.

The order differs from `NAV` on purpose. `NAV` is ordered for scanning a menu
and puts `/partner` before `/lots`; landing is ordered by how likely a section
is to be where the holder's work happens. That only matters for someone holding
several keys — a Platform Admin holds every one of them, and belongs on
operations rather than on whichever menu item matched first. A test asserts
both facts together: that `/partner` precedes `/lots` in the menu, and that an
admin still lands on `/lots`.

`/admin/users` is absent from the list entirely, for the reason `NAV` already
gives for placing it last — it is administration, not a place work happens.
Nobody should *arrive* there. `/my-nectar` remains the fallback and is the
right one: a registered customer with no Assignment has orders and bookings
there and nothing anywhere else.

An invariant test closes the loop the two lists could otherwise drift through:
for every profile, the landing destination must appear in that same viewer's
navigation. Landing somewhere absent from your own menu is how a page becomes
unreachable the moment you navigate away from it.

**Decision 2 — `/start` resolves the destination, and renders nothing.** The
destination depends on resolved permissions, which do not exist when `signIn()`
is called: the password has not been checked yet, and for Google the Person may
be about to be created by the `signIn` callback. So `redirectTo` cannot name
the real destination. `/start` resolves it one request later, when there is a
session to ask, and redirects. It returns no markup — a second landing page
would be a second thing to keep consistent with the first. Reached without a
session it redirects to `/login`, per SECURITY.md §2's rule that every server
entry point re-checks rather than trusting how it was reached.

**Decision 3 — `callbackUrl` is honoured, because this change would have
broken it.** `proxy.ts` sets `callbackUrl` when it turns an unauthenticated
request away, and nothing had ever read it. Sign-in went to a hardcoded
`/my-nectar`, which is also the only proxied prefix, so the promise looked kept
by coincidence. Sending everyone to `/start` would have turned that coincidence
into a visible bug, so `loginAction` now reads the parameter and `LoginForm`
carries it through.

Only a same-origin absolute path is accepted. A value beginning `//`, or
carrying a scheme, is discarded rather than sanitised — that is the classic
route by which a login form becomes a phishing hop, and rewriting a hostile
value is a worse habit than dropping it.

**Decision 4 — `/my-nectar` keeps both sections, at the bottom.** "Which roles
do I hold, and where" is a real question, and for a non-admin this page is the
only place it is answered. It is simply not the question anyone arrives with.
Orders, bookings and sensory history now lead; Assignments and resolved
permissions follow.

**Verification.** Six new tests over the pure function, and the flow walked
signed in: `/start` redirects to `/lots`, which renders Panel del Operador with
the real batch list, and `/my-nectar` now opens on Pedidos rather than
Asignaciones. 479 tests pass, no console errors.

Worth recording honestly: for the product owner today, Operaciones Activas
renders "Nada en curso ahora mismo", because nothing is currently fermenting or
drying. Landing there is still right — the page answers the question rather
than answering a different one — but the win is smaller than it will be in
harvest season, and this ADR should not be read as claiming otherwise.

**Not addressed here.** `16_ADAPTIVE_OPERATOR_WORKSPACE_PREAMBLE.md` remains
the destination: navigation and landing derived from context, not from
permissions alone. `lib/navigation.ts` already describes itself as the cheap
intermediate step that document explicitly allows, and this is the same step
applied to arrival. It is gated on v1 scope being settled, and still is.

Also unbuilt: no page anywhere reads `Task.assignedToUserAccountId`, so a task
assigned to a specific person is invisible unless they open the project that
holds it. That is a genuine gap this ADR does not close.

---

## ADR-083 — An invitation that can be accepted

**Context.** A count of who can actually use the platform returned one: the
product owner. Thirteen of fourteen UserAccounts sat at `status = invited` with
no password — including Bob Huerbsch and Sherry Huerbsch, holding ten active
Assignments each, and Chini, Roberto and Eliecer holding two apiece. Every
Assignment resolved correctly. None of it was reachable by the person it named.

The cause was one line in the Google `signIn` callback:

```ts
// An account someone has disabled must not be revived by signing in
// through a second provider — status is the control that stands alone
if (userAccount.status !== "active") return false;
```

The comment is about `suspended` and `deactivated`, and it is right about them.
But the check lumps `invited` in with the deliberate revocations, and `invited`
is not a revocation — it is a state nobody has acted on yet. The only route out
of it was `scripts/set-password.ts`, a TTY script run per person, which
`authorize()` reaches by looking the account up by email. Eleven of these
Persons carry no email address at all.

So the platform issued invitations and then refused every attempt to accept
one.

**Decision — `invited` activates on a Google sign-in that establishes the
identity; `suspended` and `deactivated` do not.** Reaching that line means one
of two things happened: an `ExternalIdentity` already links this Google subject
to the account, or the address Google verified matched a Person on record. Both
establish that whoever holds the mailbox is the person who was invited, which
is what accepting an invitation means. The account is set `active`, its
`emailVerifiedAt` filled if empty, and an AuditEvent written naming the actor
as the account itself — nobody administered this; the invited person accepted
it (CLAUDE.md §35).

The distinction is the whole decision, so it is tested from both sides. A
mutation that widens the condition from `=== "invited"` to `!== "active"` fails
three tests: the suspended case, the deactivated case, and the pre-existing
ADR-075 assertion that a disabled account stays disabled.

**Unverified addresses are untouched.** ADR-075 already refuses to match a
Person on an address Google has not verified, and that path now has its own
test here: an invited account approached with `email_verified: false` stays
`invited`, and the callback creates a separate emailless Person instead —
exactly as it did before. Anyone can type an address into a Google profile;
only verification proves the mailbox, and accepting someone else's invitation
is precisely the harm that would follow from trusting it.

**Credentials sign-in is deliberately unchanged.** `authorize()` still refuses
an `invited` account. An invited account has no password to check, and
`set-password.ts` is what both sets one and activates. Accepting an invitation
should be something the invited person does, never something reachable by
guessing at a password.

**What this does not fix, and it is the larger half.** This makes acceptance
*possible*; it does not give most people anything to accept with. Only three
Persons carry an email address — Daniel, José and Nathy — and an account with
no email cannot be matched by any provider. Two of those three (José, Nathy)
also hold zero Assignments, so they would sign in successfully and reach
nothing.

Turning the remaining accounts into working ones is data the product owner has
to supply, not code: an address per person (`npm run people:set-email`) and a
role per person (`/admin/users`, ADR-074). This ADR removes the blocker that
would have made both of those pointless.

**Verification.** Seven new tests through the real callback, not a copy of its
logic. 486 tests pass.

---

## ADR-084 — `npm run dev` refuses to start against production

**Context.** `dev` was plain `next dev`. `next dev` loads `.env`. `.env` holds
the production `DATABASE_URL`. So the default way to run this application
locally talked to production Neon, and nothing in the running app said so —
the pages look identical whichever database is behind them.

That is not a hypothetical clone-and-run problem. Both launch configurations on
the product owner's own machine reached it: the repository's
`.claude/launch.json` ran `npm run dev` on port 3000, and
`~/.claude/nectar-dev.sh` did the same. Only the second local config
(`nectar-dev-local.sh`) exported a local URL first, and it does so with a
comment explaining that `dotenv` will not override an existing variable —
which is precisely the knowledge a person has to already have for the default
to be safe.

Every write a dev session makes is a real write. Creating a batch, recording a
transformation, submitting an assessment, signing in — all of it lands in the
live research record, indistinguishably from real work.

`tests/setup.ts` already refuses exactly this, and the reasoning it gives is
the same reasoning: the suite was found writing ~244 audit rows per run into
production, and it now stops rather than guess. Dev had no equivalent.

**Decision 1 — guard the script, not just the launch config.** Fixing
`.claude/launch.json` alone would leave `npm run dev` typed directly, and
`~/.claude/nectar-dev.sh`, both still pointing at production. `dev` now runs
`scripts/dev-guard.ts` first, which refuses a non-local `DATABASE_URL` and
exits non-zero before `next dev` starts.

**Decision 2 — an explicit escape hatch.** `ALLOW_REMOTE_DEV_DB=1` allows it,
mirroring `ALLOW_REMOTE_TEST_DB=1`. Reading production data through the real UI
is a legitimate thing to want, and a guard with no way past it gets deleted
rather than respected. It should be a sentence someone typed, not the default.

**Decision 3 — the rule lives in one place.** `lib/databaseHost.ts` holds
`hostOf` and `isLocalDatabaseUrl`; `tests/setup.ts` now imports them instead of
carrying its own copy. Two hand-written copies of a safety check is how the two
drift into disagreeing about what "local" means — the same argument ADR-081
made for `clearsClassification`.

`isLocalDatabaseUrl` returns false for an absent or unparseable URL,
deliberately. A guard that cannot tell where it is pointing must refuse: "I
could not read this" is not evidence of locality.

**A latent bug the extraction surfaced.** Writing the first direct test of that
rule showed `new URL("postgresql://u@[::1]:5432/db").hostname` returns
`"[::1]"`, brackets included, while `LOCAL_HOSTS` holds the plain `"::1"`. The
two could never be equal, so the loopback address the rule most obviously means
to accept was classified as remote, and `tests/setup.ts` would have refused a
local IPv6 cluster while telling the reader it was remote. `hostOf` now strips
the brackets. The bug had sat unnoticed because nothing ever asserted on the
predicate directly.

**Decision 4 — `dev:local` routes through `dev`.** It exports the local URL and
then calls `npm run dev`, so the guard covers both entry points rather than
only the unqualified one. `.claude/launch.json` points at it.

**Verification.** The guard exercised in all three directions — refuses the
production URL from `.env` naming the host it refused, passes a local URL,
passes with the escape hatch — plus `npm run dev` itself refusing end to end.
Seven tests over the shared predicate, including that a remote host merely
*containing* "localhost" is rejected, since substring matching is the obvious
wrong implementation and would pass every other case. The existing local dev
workflow still starts, now through the guard, and `/start` still resolves to
`/lots` signed in.

**Not addressed here — a flaky test this work uncovered.** Running the suite
repeatedly to check the change showed `tests/traceability/roasting.test.ts`
failing roughly one run in three, on §4.1's "expected 2 to be 3".

The cause is not this change and not timing. `roasting.test.ts`'s `afterAll`
deletes RoastSessions `where roasterPersonId in [gabriel, maria]`, but §4.1
creates three sessions with no roaster at all, so those leak on every run. 219
have now accumulated in the local test database, every one dated 2027.
`listRoastSessions` takes 200 ordered by `startedAt desc`, so past that
threshold the test stops finding its own rows.

Two separate things, deliberately left for their own change: the fixture leak,
and the fact that `listRoastSessions` silently truncates at 200 with no
pagination and no indication — which is a list that lies to a roaster with a
long history, not only a test problem. `npm run test:db reset` clears the
accumulated rows in the meantime.

---

## ADR-085 — The test suite's residue in production, and a script to remove it

**Context.** ADR-084 flagged `tests/traceability/roasting.test.ts` failing about
one run in three, caused by RoastSessions accumulating in the local test
database. Resetting that database was expected to clear them. It did not:
79 came back with the restore, because they are in production.

The survey is unambiguous. All 79 rows in `traceability.roast_session` match
every residue criterion simultaneously — dated 2027, no transformation, no
measurement, no roaster, no creator — and nothing references them:

```
roast_session: total=79 future=79 noTransformations=79
               noMeasurements=79 noRoaster=79 MATCHING_ALL=79
inbound refs:  lot_transformation=0  measurement=0
Lots of type roast: 0
```

**There are no real roast sessions in production.** The table is entirely
leakage from the era `tests/setup.ts` was written to end, when the suite ran
against the live database. That guard stopped new residue; it did not remove
what was already there, and nothing since has looked.

The mechanism is the same fixture bug ADR-084 identified: the roasting test's
`afterAll` deletes sessions `WHERE roaster_person_id IN (gabriel, maria)`, and
§4.1 creates three naming no roaster. Their output lots and transformations
were cleaned up — which is why zero `roast` lots exist — and the sessions were
not.

**Decision — a reviewable script, not a write from this session.** Same shape
as ADR-066's `remove-demo-places`: a guarded single transaction in a `.sql`
file, run by a `.sh` that reuses the backup tooling's connection handling, and
an npm script. Destructive production writes are handed over to be read and
run deliberately, never performed as a side effect of an investigation.

**The guard is the point, not the delete.** The script refuses outright if any
roast session fails the residue predicate. A real roast recorded between the
survey and the run lands there and rolls the whole transaction back, rather
than being swept up with the rest. That is what makes the script safe to keep
and run later, when "all 79 are residue" may no longer be true.

**Post-conditions compare rather than hardcode.** ADR-066's script asserted
literal totals — `IF n <> 90 THEN RAISE EXCEPTION 'permission grants changed'`
— and that number has since moved to 91, correctly, via ADR-081's clearance
grant. A hardcoded post-condition goes stale the moment a legitimate change
lands, and a stale guard is worse than none: it fails for the wrong reason and
teaches the reader to bypass it. This script captures every total into a temp
table inside the transaction and asserts equality before and after, which
proves the same property without expiring.

**Rehearsed on the restored copy, three ways:**

1. **It removes what it should.** 89 residue rows locally (79 restored plus 10
   from test runs since), all deleted; lots, people, projects, transformations
   and measurements identical before and after.
2. **It is re-runnable.** A second run on the empty set is a clean no-op —
   `residue roast sessions to remove: 0`, `DELETE 0`, post-conditions hold.
3. **It refuses a real roast.** With one genuine session inserted — a roaster
   named, dated in the past — the script aborts with `ABORT: 1 roast session(s)
   are not residue`, exits 3, and leaves that row untouched.

The third is the one worth having rehearsed. A cleanup script that has only
ever been run against data it was written for has not been tested at all.

**Not run.** Production still holds the 79 rows. The sequence when it runs is
ADR-066's: `npm run backup:db && npm run backup:verify -- <dir>`, then
`npm run data:remove-orphan-roasts`, then re-survey and re-backup.

**Still open, and tracked separately:** the fixture leak that produces this,
and `listRoastSessions`'s silent `take: 200` with no pagination — a list that
lies to a roaster with a long history, not merely a test problem.

---

## ADR-086 — The fixture leak, and two assertions that were never measuring what they claimed

**Context.** ADR-085 removed 79 orphaned RoastSessions from production and
named the mechanism that produced them. This closes it, and closes two further
things the cleanup exposed.

**Decision 1 — the cleanup matches on `createdBy`, not on the roaster.**
`roasting.test.ts`'s `afterAll` deleted sessions
`WHERE roaster_person_id IN (gabriel, maria)`. §4.1 creates three naming no
roaster, so those survived every run. Every session this file creates goes
through `recordRoastSession`, which stamps `createdBy` with the acting account,
so that is the key that catches all of them.

It has to run before the UserAccounts are deleted. `createdBy` is a nullable
FK, so removing the account first sets it to null and the sessions become
unmatchable — which is exactly why every row ADR-085 deleted carried
`created_by = null` despite having been written with it set. The evidence and
the fix are the same fact seen from two ends.

**Decision 2 — the cleanup asserts it worked.** A cleanup nothing checks can
silently stop working, and this one did, for long enough to reach production.
`afterAll` now ends with a count of sessions still owned by this run's
accounts, asserted zero. Reverting the delete to its old form makes that
assertion report `expected 5 to be +0` and the run exit non-zero — an
`afterAll` failure does fail the build, which was worth confirming rather than
assuming.

The assertion is scoped to this run's accounts rather than a global count of
the table: three other files create RoastSessions and vitest runs files in
parallel, so a total would be measuring their progress rather than this file's
damage.

**Decision 3 — two "real data intact" assertions removed, not repaired.**
With production genuinely clean, `tests/research/ro1.test.ts` §9.15 and
`ro1-2.test.ts` §5.11 began failing on `expect(roastSessions).toBeGreaterThan(0)`.

They were not broken by the cleanup. They had never worked. Both counted
`roastSession` globally under the heading "real data unaffected by this run",
and every row they were counting was this suite's own leaked fixtures — so
they asserted that the residue existed. The only reason they passed was the
bug they were nominally guarding against.

This is the third instance of one anti-pattern. `tests/setup.ts` already
records the first: two assertions counted every Location named "Lote"
platform-wide and passed only because production happened to hold exactly six.
A global count taken in a parallel suite is not a property of the code under
test.

They are removed rather than rewritten as before/after comparisons, because
that would race with `roasting.test.ts` running alongside. The surrounding
assertions — Cerro Azul locations, the `Lost Origin` organization, twenty-plus
variable catalogs — are anchored on records that genuinely exist, and those
stay.

**Decision 4 — one more of the same, in a test from ADR-080.** Running the
suite repeatedly to confirm the leak was closed surfaced
`batchPageData.test.ts`'s "loses nobody" case failing about one run in three
with `expected 19 to be 21`. It compared `getObserverCandidates` against
`person.count({ status: "active" })` — two round trips, with other files
creating and deleting Persons in between. My own test, the same defect, written
earlier in this session.

What "loses nobody" needs is that reordering is a permutation, so it now
asserts the row it controls is present, that nothing is duplicated, and that
nothing inactive crept in. All three hold whatever another file is doing.

**Verification.** Five consecutive full-suite runs, 493 passing, exit 0 every
time, with `traceability.roast_session` at 0 before and after each. Three
consecutive runs of the roasting file alone leave the count unmoved where it
previously grew by five.

**Still open:** `listRoastSessions` takes 200 rows ordered by `startedAt desc`
with no pagination and no signal that anything was dropped. It is what turned
this leak into an intermittent failure rather than merely a slow accumulation,
and it remains a list that lies to a roaster with a long history. Whether to
paginate, raise the cap, or scope the query is a design decision, and the same
silent cap should be checked for across the sibling list functions it was
likely copied into.

---

## ADR-087 — The row cap was spent on rows the caller could not see

**Context.** ADR-086 left `listRoastSessions`'s `take: 200` open as "a list
that lies to a roaster with a long history". Surveying the four services that
carried the same cap turned up something worse in one of them.

`getLotList`, `getApiaryList` and `listTreatmentBatches` apply their filter in
the query and then cap the result. Silent, but the 200 rows are the caller's
own. `listRoastSessions` did it the other way round: it took the newest 200
rows **platform-wide** and only then dropped the ones the caller could not
see. The cap was spent on other people's sessions.

That is not a cap, it is a wrong answer. A roaster scoped to one project could
be shown almost nothing while hundreds of their own rows sat just past the
limit — and it is exactly how ADR-086's test came to lose its own three
sessions behind 200 leaked ones.

**Decision 1 — visibility moves into the query.** `listRoastSessions` now
filters through `lotWhereFromVisibility` on the transformation's input lot,
which is the mechanism `getLotList` already used. Reverting to the old
filter-after-take makes the new test return **zero** rows where the fix returns
two: the production defect, reproduced at three fixtures rather than the 201 it
would otherwise take.

**Decision 2 — a cut-off list says so.** All four services return
`{ items, truncated, limit }`. Truncation is detected by asking for
`LIST_LIMIT + 1` and seeing whether the extra row comes back, not by a second
`count()` — a separate count is another round trip against another snapshot and
could disagree with the rows actually returned. `/lots` and `/apiaries` render
a notice when it is set.

This is deliberately **not pagination**, which CLAUDE.md §59 still wants. It is
the smaller, prior fix: silence is the actual defect. A visible "showing the
newest 200" is a limitation; an invisible one presents part of the data as all
of it.

**Decision 3 — the limit is a parameter.** Demonstrating "the cap was spent on
invisible rows" needs either `LIST_LIMIT + 1` fixtures or a smaller limit, and
only the second leaves a fast test behind. `listRoastSessions` takes an
optional `limit`, and the regression test drives it at 2.

**Two fixture leaks, one of them mine, found by opening the page.** Verifying
the pages still rendered showed `/lots` listing six lots named
`r1-roast-…-other-green`. The test written to prove Decision 1 created a
wrong-project Lot inside the test body, where nothing tracked it — ADR-086's
defect, reintroduced by the change that documents ADR-086. It now lives in
`beforeAll` alongside the lot it mirrors, and the cleanup owns it.

The second was worse and more instructive. The Lot-count self-check added
alongside it was placed mid-cleanup, before `lot.deleteMany` ran. Throwing
there aborted the rest of `afterAll`, so the assertion stranded the very rows
it was complaining about — twelve per run instead of one. **A cleanup
assertion belongs at the end of the cleanup**, and a guard that fires early
does not merely fail to help, it causes the condition it reports. It now sits
after every delete.

**Verification.** Three consecutive full-suite runs, 500 passing, exit 0, with
zero fixture Lots and zero RoastSessions left behind — checked in the database
rather than inferred from a green run. Three consecutive runs of the roasting
file alone, likewise. `/lots` reopened and confirmed showing real batch codes
only. No `take: 200` remains in `lib`.

**Still open.** Real pagination. `/lots` can now say it is showing the newest
200 of more; it still offers no way to reach the rest. The smaller caps
elsewhere — `take: 50` on samples awaiting sensory, `take: 20` on a lot's
tasks and on the AI queue — are deliberate "most recent N" panels rather than
lists claiming completeness, and are left as they are.

---

## ADR-088 — The listing that told people to do work they no longer needed

**Context.** `npm run people:set-email` with no arguments prints who can sign
in, and it is the thing a person reads before deciding what to do next. Asked
to correct one stale line, reading it turned up four wrong states — every one
of them wrong in the direction of naming a fix that does not fix anything.

**1. It sent everyone to the password script.** `"email set, no password yet —
run auth:set-password"`. True when written; ADR-083 made it obsolete. An
address is now usually the whole job: the invited person signs in with Google,
the verified address matches their Person, and the account activates itself.
`auth:set-password` is a TTY session the product owner has to run per head, so
this was recommending real work that nobody needed to do.

**2. It reported a suspended account as able to sign in.** The state was
`account.passwordHash ? \`can sign in (${status})\` : ...`, which prints
"can sign in (suspended)" — for a row `authorize()` refuses on status before it
ever verifies a hash. A password hash is not permission to enter.

**3. It never looked at ExternalIdentity**, so an account already linked to
Google read as though nothing had been set up.

**4. It told three people an address would help them, and it would not.**
Found by running the listing rather than by reading it: Agustín Gómez,
Guillermo Ungo and Kurt Ngo are Persons with no UserAccount at all. The old
order checked `email` first, so they got "no email — cannot be given a login",
which implies setting one is the fix. It is not; there is no account for an
address to attach to.

The states are now ordered by which fact actually blocks the reader rather
than by which field is cheapest to check, and the missing account is named
first. Repeating this listing's original sin while correcting it would have
been a poor outcome.

**Decision — the states become a pure function, and get tested.** `describeAccess`
is exported and covered by seven cases, including the two that were actively
false. A help string is not usually worth a test; one that a person acts on,
and that had been wrong in four ways without anyone noticing, is. Nothing in
the suite had ever read this output.

**Verification.** Seven unit cases, 507 passing overall, and the listing run
against production to read the real output — which is how the fourth defect
was found. Two people (José, Nathy) now correctly read as invited and one
Google sign-in away; three correctly read as needing an account before an
address means anything.

**Not addressed here.** Eleven people hold real Assignments and have no
address, so they still cannot sign in. That is the data this listing exists to
prompt for, and it has to come from someone who knows it — `set-person-email.ts`
says so in its own header, and this ADR does not change it.

---

## ADR-089 — The weekly backup had been failing silently for six days

**Context.** Asked what to work on next, checking the scheduled job first
turned up `launchctl list` reporting last exit status `1`. The run of
2026-08-24 had failed, produced no backup, and told nobody. The last
successful scheduled run was 2026-08-20.

The cause, from launchd's stderr:

```
run-scheduled.sh: line 34: echo: write error: Resource deadlock avoided
```

`$LOG` was a file inside Google Drive, and the File Provider returned EDEADLK
on append. That alone would be a lost log line — except the backup itself ran
as `backup-db.sh >> "$LOG"`, and **when a redirect cannot be opened the
command never runs at all.** So a transient Drive condition silently skipped
the backup entirely, and the wrapper exited 1 into `/tmp`, which nothing reads.

The failure mode had every property you would not want: it failed early, it
failed silently, it left an empty directory that looked like a backup, and its
only report was an exit code delivered to a daemon.

**Decision 1 — the log moves to local disk, and can never abort the run.**
`$HOME/Library/Logs/nectar-nomada-backup.log`. Drive is for artifacts, not for
a file appended to on every line. Every write is `>>"$LOG" 2>/dev/null || true`:
a log that cannot be written is something to notice later, never a reason to
skip a backup. Inverting that dependency is the actual fix — the rest is
making failure audible.

**Decision 2 — failure leaves the process.** Two channels, neither trusted
alone because neither is guaranteed: a macOS notification with a sound
(`osascript`, needs a logged-in session), and a `BACKUP-FAILED.txt` written
beside the backups (needs Drive writable, but syncs, so it is visible from
another machine). The marker is removed on the next success, so its presence
always means "the most recent run failed". The two failure cases are worded
differently on purpose — a dump that did not complete is bad; a set that was
written and does **not restore** is the state ADR-055 exists to prevent.

**Decision 3 — a failed backup leaves nothing that looks like a backup.**
`backup-db.sh` runs under `set -e` and creates its destination directory
before writing anything into it, so any later failure abandoned a
backup-shaped directory. Two were found: the 08-24 scheduled run, and a manual
run during ADR-085 whose `pg_dump` died with `No route to host` and left a
0-byte dump.

This is not tidiness. The retention pruner keeps the newest N directories by
name, and an abandoned directory carries the newest name of all — so **a
failed run could evict a good backup.** An `EXIT` trap now removes the
incomplete set, and the pruner counts only directories carrying a
`MANIFEST.txt`, which is written last. Belt and braces, because the cost of
being wrong here is a backup that is not there when it is needed.

`is_complete_set` lives in `pg-tools.sh` rather than inline so it can be
exercised directly, the same reasoning ADR-077 applied to `libpq_url`. Its
tests run the real shell function; a TypeScript restatement could agree with
itself while the script did something else.

**Decision 4 — the current state is offsite again.** The newest set on Drive
was from 2026-08-22 and predates ADR-085's cleanup. Worse, both backups taken
by hand during that work went to `/Users/danielsan/nectar-backups`, because
`NN_BACKUP_DIR` was unset in that shell — so the only verified backup matching
live production was on one laptop. A scheduled run now exists on Drive,
verified at 123 tables and 14,600 rows.

**Verification.** The partial-cleanup trap exercised with an injected failure:
destination left empty, message printed. The failure path exercised with an
injected dump failure: exit 1, marker written naming the reason and the log
path, log line recorded — then a successful run clearing the marker. Five
tests over `is_complete_set`, including the two shapes actually found in the
wild. 512 tests overall.

Finally the job run through `launchctl kickstart` rather than from a shell.
That distinction matters here more than usual: the original fault was EDEADLK
under launchd's own environment, so a passing run from an interactive terminal
would have proved nothing about the thing that broke.

**Not addressed.** The alert is local to this machine — a notification and a
file on Drive. If the laptop is closed for a fortnight, nothing is backed up
and nothing says so. Off-machine alerting (a healthcheck ping the absence of
which raises an alarm) is the real answer and a larger decision, involving an
external service this platform does not currently use.

---

## ADR-090 — Two role decisions, and a permission set that leads nowhere

**Context.** José Giráldez and Nathy Rubio have had working addresses and zero
Assignments since ADR-083 made invitations acceptable. Both could sign in and
reach nothing. This records what each should be, decided rather than left.

**Decision 1 — Nathy Rubio: Content/Ops Coordinator at platform scope.** Her
OrganizationMembership at Néctar Nómada is titled "Operaciones y contenido",
which is the profile's description almost word for word. Platform scope because
she works across projects rather than inside one; a per-project grant would
mean adding her again for every project she touches, and DOMAIN_MODEL.md §2 is
explicit that the membership itself grants nothing, so the scope has to come
from somewhere.

The title is evidence for what to propose, never authority in itself. The
decision is the product owner's, and this ADR is where it is recorded.

**Decision 2 — José Giráldez: no platform access.** He is a contact at Craft
Brewing Supply, a supplier. Not everyone the platform records is someone who
uses it, and "invited, no roles" is a coherent state for a person who is data
rather than a user. Written down so it reads as decided rather than forgotten —
which is the whole difference between the two.

**Decision 3 — granted through the audited path, not an INSERT.**
`scripts/grant-role.ts` calls `grantRole` from `lib/rbac/admin.ts`, the same
function `/admin/users` calls, so the permission check, the Scope reuse, the
last-Platform-Admin guard and the AuditEvent all come along. An
`assignment.create` would have written the row and none of the rest.

The UI remains the intended path (ADR-074). This exists for the case the UI
cannot serve: granting against production from a machine not signed in as an
administrator, without a password passing through a terminal or a transcript.
The actor is named explicitly and recorded in the audit row — "a script did it"
is not an answer to who authorised a permission change.

Rehearsed on the restored copy first, including the refusals: an unknown
person, an unknown role, and a second identical grant, which is refused as
`already_granted` rather than duplicated.

**The finding this turned up: `content:*` is granted and enforced nowhere.**
Nathy now holds `content:create`, `content:edit`, `content:publish` and
`content:view`. No route in the application checks any of them. `/stories` is
public discovery with no gate, and there is no authoring surface at all.

So her resolved navigation is `/my-nectar` and `/ai`, and she lands on the
account page. The four permissions that name her actual job reach nothing.

This is ADR-062's finding in a second place, and its phrasing fits exactly:
fully specified, seeded, and applied at zero call sites. The difference is that
ADR-062 concerned a gate that failed to restrict; this is a grant that fails to
enable. Both are invisible for the same reason — nothing tests that a
permission has a destination.

The grant is still correct and stands: the role is right for her, it is
auditable, and it is the prerequisite for a content surface being useful rather
than a consequence of one. But **this ADR must not be read as "Nathy can now do
her job."** She can review AI suggestions and see her own account.

**Not addressed.** The content surface itself — CLAUDE.md §16's Story /
Article / Interview / Field Note engine. `/stories` renders published content
to the public and nothing authors it. That is a slice, not a fix, and wants
deciding on its own terms.

Worth considering alongside it: a test asserting every permission in the
catalog is checked by at least one call site would have caught this, and would
have caught ADR-062. That is a cheap, general guard against a whole class of
defect this codebase has now hit twice.

---

## ADR-091 — A permission with nowhere to be used is now a test failure

**Context.** This codebase has twice shipped a permission that was fully
specified, seeded, resolvable, and applied at zero call sites:

- **ADR-062** — the classification gate. Correct, stored on thirteen tables,
  enforced nowhere. A gate that failed to *restrict*.
- **ADR-090** — `content:*`. Granted to a real person whose job it names, and
  checked by no route. A grant that failed to *enable*.

Opposite directions, one cause: nothing asserted that a permission has anywhere
to be used. Both were found by accident, months apart, while doing something
else.

**Decision — assert coverage, with a declared and shrinking inventory.**
`tests/rbac/permissionCoverage.test.ts` walks `PERMISSIONS` and fails on any
key no code path checks, unless it is listed in `UNENFORCED` with a reason
naming what would remove it.

This is deliberately the same trick ADR-062 used with
`CLASSIFICATION_GATE_DEFERRED`, which went from thirteen entries to zero
precisely because it was greppable and shrinking. A platform mid-build
legitimately has permissions ahead of their surfaces. What it should not have
is permissions ahead of their surfaces *and nobody counting*.

**The inventory stands at eight of thirty-eight**, and each entry names its
own removal condition: the four `content:*` (no authoring surface exists),
`project:view` and `project:manage_operations` (`/projects` is public discovery;
operational management lives in the Partner Workspace behind `partner:*`),
`platform:manage_users` (ADR-074 gated the admin page on `manage_permissions`
specifically, and the softer account operations have no surface), and
`colony_event:view` (A1 built recording, not a reading surface).

**Getting the scanner honest was most of the work.** Three of the four
enforcement shapes never name the permission literally:

```
permissionKey("sensory", "submit_assessment")     both parts literal
can(user, action, "specimen", target, cls)        action is a variable
permissionKey("classification", `clear_${level}`) action built at runtime
"lot:export"                                      combined literal
```

A first pass matching only the literal forms reported **nineteen** permissions
as unenforced. Twelve of those were false — `research:*`, `specimen:*` and
`classification:clear_*` are all enforced through a variable or a template
literal. Shipping that number would have been worse than shipping nothing: an
inventory with false entries in it teaches the reader to ignore the inventory,
which is precisely how both original defects survived. Shapes 2 and 3 now
contribute a wildcard for their resource type — the resource is provably gated
and the action is decided at runtime, which is the honest reading and
deliberately generous. This test is meant to catch a permission with no
enforcement anywhere, not to police precision.

The scanner collapses whitespace before matching, so a call split across lines
reads the same as one on a single line. Formatting is not a security property,
and a check that depends on it fails silently the next time someone runs a
formatter.

**Both directions are guarded, and both were mutation-tested.** Adding a
`widget:frobnicate` permission to the catalog fails with the key named and an
instruction not to silence it by listing it. Leaving `lot:export` in the
inventory after it is enforced fails the honesty check — which is the half that
makes the list shrink rather than quietly become fiction. A separate case
rejects ghost entries for permissions that no longer exist in the catalog.

**Verification.** Five cases, 517 tests overall, no database required — the
whole thing is a pure function of the catalog and the source tree, so it costs
a quarter of a second.

**Not addressed.** The eight entries themselves. This ADR makes them visible
and counted; it does not build the surfaces. The largest by far is the content
engine (CLAUDE.md §16), which is a slice rather than a fix, and which ADR-090
left open for the same reason.

---

## ADR-092 — The Story authoring surface, and the fourth profile with no clearance

**Context.** ADR-090 found `content:*` granted to a real person whose job it
names and checked by no route; ADR-091 made that visible as a counted
inventory. `/stories` rendered approved public stories to visitors and nothing
anywhere wrote one. This builds the missing half.

Scoped to **Story**, which is the only content model in the schema. CLAUDE.md
§16's Article, Interview, Field Note, Source, Quote and Transcript would each
be a migration, and building them ahead of a use for them is how the
unenforced-permission inventory got started.

**Decision 1 — publishing is the consequential act, not saving.**
`lib/discover/service.ts` selects on `{ status: "approved", classification:
"public" }`. The moment a story becomes world-readable is the moment both are
true, so `setStoryStatus` sets them together and requires `content:publish`.

Setting them together is not a convenience. Approved-but-internal is invisible
to visitors, which reads as a broken publish rather than a deliberate state —
an author would reasonably conclude the feature is broken and try again. The
service exports `PUBLICLY_VISIBLE` and `isPubliclyVisible` so the editor and
the public query cannot drift apart silently, and a test asserts a story the
editor calls published is found by the exact query the public site runs.

**Decision 2 — an edit to an approved story requires `content:publish`, and
history lives in the audit trail.** CLAUDE.md §3 requires that approved
documents are not silently overwritten and that historical versions remain
accessible. A `StoryVersion` table mirroring `ProtocolVersion` would be the
faithful reading; the product owner chose the audit trail for now.

So `updateStory` on an approved story requires the publish permission — an
editor who may draft cannot quietly alter what visitors are already reading —
and writes an AuditEvent carrying the **whole record** either side, not a diff.
A partial `before` would make §3's promise false, which is why a test asserts
the untouched fields are present too.

**The limitation is real and recorded: you cannot browse or restore a previous
version.** History is preserved and readable, through the audit trail, by
someone who knows to look. That is a weaker guarantee than versioning and it
was chosen deliberately, not overlooked.

**Decision 3 — Content/Ops Coordinator gains `clear_partner` and
`clear_internal`.** Enforcing the gate revealed the profile held **no
clearance at all**, and Story defaults to `internal` — so an enforced gate
denied the coordinator every story, including drafting one.

This is the **fourth** occurrence of one shape: ADR-063 for Farm Operator and
Project Viewer, ADR-069 for the Apiary Colony Event Recorder, ADR-081 for
Sensory Judge. A profile holding actions and no clearance is not restricted by
an enforced gate, it is disabled by it. Four times is a pattern worth naming
rather than fixing again quietly: **any new resource permission granted to a
profile needs its clearance decided at the same time**, because the two are
only separable while the gate goes unapplied.

Stops at `internal`, matching Farm Operator. Confidential and trade-secret
stories stay out of a content role's reach, which is a narrowing against the
previous state where `content:*` was checked nowhere and a story's
classification restricted nobody.

**Decision 4 — `/content` joins the landing priority.** Before this, a
Content/Ops Coordinator matched nothing in `LANDING_PRIORITY` and arrived at
`/my-nectar` — an inventory of permissions that reached nothing, which is
precisely the complaint ADR-082 set out to fix. Nathy would have been its
clearest case.

**Verification.** Fourteen service tests covering both halves of the gate,
including a hand-built role holding all four content actions and no clearance,
paired against the same story made public — so a failure means the
classification is what refused rather than something incidental. The ADR-091
inventory drops from eight entries to four, which is the assertion that
`content:*` is now genuinely enforced rather than merely referenced.

531 tests. Then the round trip walked signed in: a draft created as
internal-and-not-visible, published to approved-and-public, and read back on
the public site at `/stories/cafe-de-cerro-azul-prueba-de-publicacion` — the
accent folded rather than dropped, which `caf-de-cerro-azul` would have been.
No console errors. The fixture was removed from the local database afterwards
and production still holds its original two stories.

**Not addressed.** Markdown is stored and rendered as plain text, as it was
before — no renderer was added, and `app/stories/[slug]/page.tsx` already
explains why. Media attachment, the remaining §16 content types, and a review
workflow distinct from the status field are all untouched. `project:view`,
`project:manage_operations`, `platform:manage_users` and `colony_event:view`
remain in ADR-091's inventory.

---

## ADR-093 — The offline decision was right for a question nobody is asking any more

**Context.** `OFFLINE_FIELD_CAPABILITY.md` §1 states the platform's position
without hedging: **"Progressive Web App... not a separate native app"**,
justified by keeping `PLATFORM_OVERVIEW.md` §5's single-deployable, low-ops
discipline intact rather than adding a second codebase and deployment target.
`25_OFFLINE_OPTIONS_ANALYSIS.md` then sized three options with, in its own
words, no option favoured in advance — full offline, minimal local draft, and
paper with honest provenance. **None of the three was native.** Option B
shipped: `lib/apiary/offlineQueue.ts`, `client_draft_id` on
`apiary.inspection` and `apiary.colony_event`, and A5.5's service worker. It
works, and it is in use.

The Specialty Coffee Field OS specification
(`COFFEE_FIELD_OS_AUDIT.md`) asks for something that analysis never
evaluated: an Android operator application over local SQLite, running on
roughly 2 GB of RAM, working for **days** with no connectivity, where the
local database is an *operational data store and not a cache*.

So this is not a decision that was wrong being corrected. It is a decision
made against a narrower question than the one now being asked, and the honest
thing is to say which question changed rather than to quietly edit the
document that answered the old one.

**Decision 1 — native Android is adopted, and `OFFLINE_FIELD_CAPABILITY.md`
§1 is superseded.** Three places the PWA fails the new requirement, in
descending order of severity:

**The browser may evict IndexedDB under storage pressure, without asking and
without the page being open to object.** For a cache that is a performance
event. For an operational store holding a picker's week of unsynced work it is
not a risk to be managed — it is a disqualification, because "authoritative
store the platform can delete underneath you" is a contradiction. Nothing in
the PWA's control surface fixes this; `navigator.storage.persist()` is a
request, not a guarantee, and `offlineQueue.ts` already does the honest thing
available to it by estimating quota and warning.

Service-worker background sync is killed aggressively under memory pressure on
low-end Android, and a PWA cannot reliably wake itself to fire a protocol
alarm — the `T+6h` pH reading. Scheduled measurement is what makes protocol
execution more than a form, and it is a stated requirement.

The first of these is decisive on its own. The other two are severe and
arguably workable.

**Decision 2 — the native client is sequenced *behind* the sync protocol, not
built alongside it.** The expensive, irreversible work here is the JSON API
and the synchronisation protocol. The client is the cheap, replaceable part.
Phase 4 builds both and exercises them **from the existing PWA** — a real
client, a real queue, real idempotent replay, against the real protocol.
Phase 5 adds the native client.

Two things this buys that building both at once does not. If field trials show
the PWA is sufficient after all, Phase 5 is *not started* rather than thrown
away. And when the native client is built, it is built against a protocol
something has already exercised, which is the difference between debugging one
unknown and two at the same time.

**Decision 3 — what explicitly does not change.** The PWA is not deleted; it
remains the web operator surface, and `public/sw.js` keeps its narrow
app-shell scope. `OFFLINE_FIELD_CAPABILITY.md` §3–§6 survive intact and apply
to the native client unchanged: no draft expiry by default, a visible and
honest connection indicator rather than silent background handling, a storage
warning before writes start failing, and media syncing after structured data
so a record is not held hostage by its slowest attachment. §4's conflict
position — competing versions preserved for human review, never
last-write-wins — survives and is *sharpened* by the audit's three conflict
categories (append-mostly, controlled update, critical), which say where that
rule actually needs to bite instead of applying it uniformly.

`lib/apiary/offlineQueue.ts` is the template for the generalised protocol, not
its casualty. Its client-generated UUID doubling as the server's idempotency
key, its ordered replay, and above all its distinction between *the request
never reached the server* (stay queued, retry) and *the server ran and refused*
(mark error, show the operator, stop retrying) are the parts most sync
implementations get wrong, and they are already right.

**Decision 4 — `offline.draft_record` and `offline.sync_conflict` stay
unbuilt, and the document should stop implying they are pending.** Neither was
ever created; there is no `offline` Postgres schema. `draft_record` is the
wrong shape in hindsight — the draft belongs on the device, and what the
server needs is idempotent application plus a review queue for genuinely
critical collisions. `sync_conflict`'s *concept* is kept and narrowed to the
critical category; `draft_record` is dropped rather than left as a phantom
obligation.

**Alternatives considered.** *Extend the PWA only* — rejected on IndexedDB
eviction alone; everything else about it is attractive and it remains the
cheaper answer if the field disagrees with this analysis. *Capacitor wrapping
the existing PWA* — rejected as the worst of both: it inherits WebView memory
behaviour on exactly the low-end hardware being targeted, and does not solve
eviction, because the storage is still the browser's. *Flutter* — rejected
because it forfeits TypeScript sharing with the domain package, which is the
principal reuse argument for React Native in a repository whose validation,
enums and permission constants are all TypeScript. *Commit to native
immediately, in parallel with the API* — rejected as Decision 2.

**Consequences.** The repository becomes a monorepo at Phase 5, not before; a
premature workspace conversion is churn with no consumer. A second deployment
target and a distribution story (Play Store or sideload) arrive with it.
`PLATFORM_OVERVIEW.md` §5's single-deployable discipline is genuinely
weakened, and that cost is accepted here rather than argued away — it was a
real principle, and this is a real exception to it, made for a requirement
that did not exist when it was written.

The four remaining product decisions taken alongside this one — rejected
material as real Lots, remediation of the three overstated lots, device
authority with Person attribution, and the ~25-table device mirror — are
recorded in `COFFEE_FIELD_OS_AUDIT.md` §58 and will get their own ADRs as the
tickets that implement them land, rather than being pre-registered here.

---

## ADR-094 — The quantity ledger only ever had one side, and a test said that was correct

**Context.** `QuantityEvent` has carried `transfer_out`, `loss` and
`adjustment_decrease` since T2. **No code path anywhere had ever written any
of them.** `recordTransformation` created a `process_output` event for each
output lot and no decrement for any input; `endFermentationRun`,
`endDryingRun` and `createRoastSession` each copied that shape, defect
included. Only `samples.ts` was correct, writing `sample_removed` when 2 kg
left for a sample.

So after every split, merge, blend and stage change the parent lot still
reported its full intake while the children reported theirs. Splitting 200 kg
into 120 + 80 left 400 kg visible in a system holding 200. `getLotReport`
aggregates across ancestry, so it compounded the error rather than cancelling
it, and "how much coffee is on hand" had no answer at all.

Two things kept it invisible for fourteen tickets. `computeCurrentQuantity`
was correct in isolation and `quantity.test.ts` proved it against hand-written
event lists — the bug lived entirely in what never called it. And T14's
end-to-end test **asserted the broken behaviour as intentional**, under the
heading "gives each lot its own independent quantity ledger, not a
decrementing running total", reasoning that a stage transition "is expressed
through lineage, not by mutating a prior lot's own quantity."

That reasoning is refuted by the same test's own numbers. It asserted the
green lot at 398, not 400, because a 2 kg sample extraction *had* decremented
it. Extracting 2 kg reduced the balance; moving 480 kg to the next stage did
not. Both cannot be right, and the enum had carried the vocabulary for the
correct answer from the beginning, unused.

Measured against the 2026-08-26 restore: five lots were consumed as inputs
without a decrement, of which **three carry a ledger and are genuinely
overstated** — PE-79, PE-80, PE-90, Cafelino cherry, 145.3 kg. The other two
were never weighed, so ADR-080's `recorded: false` already described them
honestly.

**Decision 1 — one implementation, not four.** `settleMassBalance`
(`lib/traceability/balance.ts`) is the single entry point all four write paths
call. The defect existed four times because the pattern had been copied four
times; a fix applied four times would have drifted four ways. `balance.ts` is
deliberately a leaf — it imports nothing from `lots.ts` or `quantity.ts`, both
of which import it — which is what keeps the dependency acyclic now that
`computeCurrentQuantity` delegates its summation there too.

**Decision 2 — a transformation with zero outputs moves nothing.**
`startFermentationRun` and `startDryingRun` create a `stage_change` with one
input and no outputs: a marker saying the lot entered the stage. The coffee is
in the tank; it has not gone anywhere. Only the closing transformation
converts material. Decrementing on both would zero the lot the moment
fermentation began and decrement it again at the end — a bug that would have
*looked* like the fix working. `movesMaterial()` names this rule in one place,
and `sample_extraction` returns false from it because `samples.ts` already
writes its own event.

**Decision 3 — full consumption decrements by the computed balance, not by the
declared input quantity.** Nine of ten transformation inputs in real data
carry a NULL quantity, so "decrement by what the operator declared" is
unimplementable for almost all of them. The lot's own balance is knowable
exactly where the declaration is not. `split` is the exception and requires an
explicit quantity, because how much of a lot was taken cannot be inferred.

`LotTransformationInput.quantity` is deliberately **not** back-filled with the
computed figure. That column records what the operator declared; the ledger
records what moved. Collapsing them would destroy the ability to notice they
disagree, which is the signal a balance review is looking for.

**Decision 4 — only `split`, `merge` and `blend` are reconciled against a
tolerance.** This corrects `41_P0_MASS_BALANCE.md` §4, which said every
material-moving transformation. Applying it to a `stage_change` looks right
until you try it: cherry to parchment loses roughly four fifths of its mass,
and that loss is the **yield**, the single most valuable number a mill
computes. Treating it as an unexplained discrepancy would raise a Deviation on
every correctly recorded depulping, which is how an alarm gets ignored and
then switched off.

A split, merge or blend re-partitions material without transforming it, so the
masses genuinely must add up and a gap means someone mis-weighed. That is also
exactly the shape the Phase 3 selection operation has — accepted + rejected +
declared loss = input — so the machinery lands where it was actually needed.
Yield stays fully derivable from the ledger; it is reported, not alarmed on.

**Decision 5 — out of tolerance records and raises a Deviation; it does not
reject.** Operators estimate weights, and a field tool that refuses real data
stops being used and goes back to paper. The transformation is written, the
unexplained difference is **stored** on it (not derived — it is the figure an
audit asks about years later, and recomputing it from a since-corrected
history would answer a different question), and a `Deviation` is raised
against it. NULL, never zero, whenever a term is genuinely unknown.

Accepting a discrepancy is a separate act from recording it, so it needs a
separate permission: `lot:override_balance`, held by Platform Admin and
deliberately **not** by Farm Operator. The operator records what the scale
says. The override does not suppress the Deviation — the discrepancy happened
either way — it answers it at write time with an attributed reason, through
the existing `CorrectiveAction` machinery rather than a parallel concept.

**Decision 6 — `lot_code` is unique per organization, and `organization_id` is
required.** A global unique is an offline-collision hazard (two disconnected
devices minting "PE-79") and a multi-tenant defect (two farms cannot both
number a batch "01"). Making `organization_id` NOT NULL is what gives the
scoped constraint something real to scope against — Postgres treats NULLs as
distinct, so a nullable column would leave it unenforced for exactly the rows
most likely to need it. Verified 0 NULLs and 0 duplicates before migrating,
and the migration re-checks both and refuses rather than backfilling a guess.

`Sample.sample_code` is scoped the same way but its `organization_id` stays
**nullable**, which is a real difference and not an oversight: the S1
external-coffee path exists for a green sample handed over at a fair, with no
lineage and no owning organization. Forcing one onto it would push someone
toward inventing one.

**Decision 7 — the three overstated lots are flagged, not corrected.**
`npm run data:flag-overstated-lots` sets `dataQuality = conflicting` and
reporting excludes them. It detects **by condition** — consumed as an input,
carries a ledger, has no subtractive event — rather than by hardcoded lot
code, so it is self-verifying, finds nothing once the fix is in, and is a safe
no-op on re-run. No quantity is synthesized: CLAUDE.md §3 forbids inferring a
missing value into a fact, and a compensating adjustment would be exactly
that. If the real weights are recoverable from the Cafelino source data they
should be entered as genuine corrections; if not, these three stay flagged,
and that is the honest outcome.

**Consequences.** T14's assertion is reversed in `e2e.test.ts`, with the
reasoning recorded inline so the next reader meets the argument rather than a
silent change. A consumed lot now reads `0` with `recorded: true` — a real
zero, distinct from never-weighed. Every fixture that creates a Lot needed a
real organization, which is why eleven test files gained one and
`tests/helpers/testOrganization.ts` exists.

Yield reporting is now possible and was not before; it is also still unwritten,
and Phase 6 owns it. The tolerance default of 2% is a starting value chosen to
clear ordinary field practice, not a claim about coffee — the per-organization
column exists precisely so a farm that knows its own scales can say so.

---

## ADR-095 — A cohort is what stands on a block, and renovation does not erase what stood there before

**Context.** P1 (`42_P1_LAND_FOUNDATION.md`) closes the one genuine gap on the
land side. Three things partially answered "what is planted in this block, how
old, how dense" and none answered it: `PlantingEvent` records *that* material
went into the ground — an event, not a population, and there was exactly **one
row** in the whole database; `Specimen` tracks *individual* plants and traps,
right for the broca traps and far too granular for four thousand trees; and
`Location.plantSpacingMeters` is a single value for a whole plot.

Worth stating plainly, because it shaped the ticket: measured 2026-08-27, the
land side holds 8 plots, 6 sites, **1 planting event, 0 specimens and 1
distinct varietal**. F1 built that schema deliberately ahead of the data — the
plantones are six months old and will not fruit until 2031 — and that was
right. But it means P1 stacks a third unexercised layer on two others, and the
ticket therefore makes *loading the real land data* its real acceptance
criterion rather than the schema. That half is not in this change.

**Decision 1 — cultivar is a `VariableCatalog`, for the third time.**
`DOMAIN_MODEL.md` §4 specifies Species and Cultivar tables. F1 declined to
build them, RO1 declined again, and this declines a third time. What is
actually needed is controlled values with aliases and definitions, which the
existing mechanism already provides, and adding a variety later is an entry in
`lib/research/catalogs.ts` plus a re-seed rather than a migration.

This is the twenty-first catalog and the first that is not a *process*
vocabulary — the other twenty describe how coffee was treated; this one
describes what was planted. That is a widening of what `VariableCatalog` is
for, made deliberately rather than by drift.

**Decision 2 — aliases finally have a seeder.** `VariableCatalogValue.aliasOfId`
has existed since RO1 and nothing ever populated it. Cultivars are where it
earns its place: "Catuaí", "Catuai" and "Catuaí Rojo" are one plant written
three ways, and `createPlantingCohort` resolves an alias to its canonical row
before storing, because otherwise "cultivar performance across seasons" —
the first question a producer actually asks — silently splits one plant across
spellings. The alias row still preserves what someone typed.

The seeder resolves aliases in a **second pass** and throws if an alias names a
value absent from its own catalog, since the canonical row must exist first and
a dangling alias would otherwise seed silently as a plain value.

**Decision 3 — renovation creates a cohort; it never edits one.** A stumped and
replanted block leaves the outgoing cohort `renovated` with a `removedAt`, and
its cultivar, planting date and plant count stay exactly as recorded. The
reason is not tidiness: a block stumped in 2027 was still Caturra in 2019, and
a yield figure from 2019 is only interpretable against the population that
actually produced it. Editing the cohort in place would silently reassign
every historical number to a plant that was not there — the same class of
error V1 already ruled out when it forbade reattributing a pre-microlot batch
to a microlot.

**Decision 4 — planting dates carry their own precision, reusing S1's
`HarvestWindowPrecision`.** "Sembrado en 2019" and "sembrado el 14 de marzo de
2019" are different claims, and a producer usually knows the first and not the
second. A date with no stated precision is refused, because a bare timestamp
claims more than anyone knows. No second precision vocabulary was invented.

**Decision 5 — `location:manage_attributes`, not a new permission.** A cohort
describes what stands on a Location, which is the same authority as editing
that Location's altitude or soil, so `requireLocationAttributeAccess` is reused
directly. This deliberately diverges from `Specimen`, which *did* get its own
permission pair under F1: a Specimen is an individually tracked object with its
own lifecycle and observations; a cohort is an aggregate description of the
block. ADR-091 also makes a permission with nowhere to be used a build
failure, so inventing one for symmetry would be a regression.

**Decision 6 — multi-block harvest is additive, and its arithmetic is reported
rather than enforced.** `HarvestEvent.locationId` stays **required and
unchanged** — it is the primary plot, the one a single-block harvest names, and
V1's own test asserts it is structurally required. `HarvestEventSource` rows
are *additional* contributions, so every existing harvest stays valid with
none, which a nullable-and-migrate approach would not have achieved.

The sum of source weights is compared to `HarvestEvent.cherryWeightKg` and the
difference is returned, never rejected. This is intake, not a conserving
transformation: nobody weighs each block's contribution on a calibrated scale
before tipping it into the same hopper. ADR-094 Decision 4 is the precedent and
the reasoning is identical — an alarm that fires on ordinary practice is an
alarm someone switches off. An unweighed contribution yields `null`, not `0`,
following ADR-080.

**Decision 7 — `Location.areaHectares`, declared not derived.** F1 added sun,
shade, altitude range, slope, soil and spacing but no area, so planted area,
yield per hectare and cultivar distribution by area could not be computed at
all. Deliberately not derived from a boundary polygon: none exists — the audit
found `geoPoint` referenced by zero lines of application code — and a producer
knows their block's hectares long before anyone walks its perimeter with GPS.
When polygons arrive in Phase 7 this becomes the declared value to reconcile
the computed one against, which is more useful than either alone.

**Consequences.** Planted area, plant age distribution, yield per hectare and
yield per cohort all become computable — and are trustworthy only because
ADR-094 fixed the ledger first; before it, every one of those figures would
have been inflated by whatever transformations sat between harvest and
measurement.

The four existing free-text varietal columns (`PlantingEvent.varietal`,
`Specimen.varietalNote`, `HarvestEvent.cultivarNotes`,
`Sample.declaredVarietal`) are **left alone**. Consolidating them onto the
catalog against one row of real data would be guessing; revisit once §4's data
load shows which spellings actually occur.

---

## ADR-096 — The batch page suggests a next step, and stops leading with a photo

**Context.** ADR-080 fixed three defects on the batch detail page and
deliberately left three design questions open, on the grounds that they were
decisions about what the page should lead with rather than things that were
wrong. This answers them, with the product owner's answers rather than
inferred ones.

**Decision 1 — one action is drawn as the expected next step.** The page
offered five buttons of identical weight in a single flex row: start
fermentation, start drying, move to storage, create sample, view report.
Nothing said which one a batch at this stage was waiting for, so the page read
as a list of capabilities rather than a place work happens.

`nextActionFor(lotType, hasActiveRun)` in `lib/traceability/batchActions.ts`
returns that action. The sequence is the product owner's, confirmed rather than
derived from the schema: cherry is waiting to ferment, processing to dry,
drying to be stored; green and roasted coffee is waiting to be tasted.

**It suggests, it never restricts.** Every action the page offered before is
still rendered and still one click away; only the styling and the ordering
change. That property is what made this safe to build over a sequence the
platform cannot verify — real batches skip stages, and one that does costs the
operator nothing extra. The tests assert the suggestion, and say in as many
words that a wrong answer here is a worse hint rather than a blocked operator.

`null` is a real return value, not a gap. A `sample` is an end state; `honey`
reaches Lot through A3's "a honey batch is a Lot" decision and never travels
the coffee sequence; `other` exists precisely because the material did not fit
a stage, so guessing one would be inventing a fact (CLAUDE.md §3). A batch with
a run under way also returns `null` — it is not waiting for a new stage, it is
waiting for that run to end, and pointing at "start drying" would point away
from the work in progress.

**Decision 2 — the photo upload moves below the actions.** It sat between the
origin-lot section and the harvest section, above every operational control, so
the first thing a batch page offered was a file picker. Recording what happened
to the batch comes first; the photograph complements it.

**Decision 3 — empty sections stay.** "No measurements yet" also says "this is
where measurements are recorded", and the platform is still being learned by
the people who will use it. The page is longer than it needs to be for an
expert and more legible to everyone else, and that trade was made deliberately
rather than by omission. Worth revisiting once the sections are routinely full.

**Verification.** Five pure tests over the function, including one that walks
every `LotType` in the schema so a new stage must be a deliberate decision
rather than an accidental `undefined` reaching the page. 554 tests pass,
typecheck and lint clean.

**Not addressed.** The ordering is fixed at render time from the lot's type
alone. `16_ADAPTIVE_OPERATOR_WORKSPACE_PREAMBLE.md` describes deriving it from
context — season, the operator's recent actions, what the rest of the site is
doing — and that remains the destination. This is the cheap intermediate step
that document allows, applied to a page rather than to navigation.

---

## ADR-097 — The one vocabulary decision the project made, broken in two fields

**Context.** Opening a batch mid-fermentation, the product owner asked what a
form was for: *"I don't understand what batch label is for with material and
quantity, maybe a supply was used, maybe a treatment, or nutrition load?"*

All three guesses were right, which is the tell. The form records an input
consumed during a fermentation or drying run — yeast, culture, lime, nutrient,
biochar — together with the lot number printed on its packaging. Its own source
comment calls that number "the one irrecoverable identity fact": throw the sack
away and no one can ever say which production lot of yeast that fermentation
used.

The form has recorded **zero entries in production**. Nobody has used it, which
is what you would expect of a form nobody can interpret.

**The cause is one label.** The field was called **"Lote/batch"** — and V1
(`38_V1_VOCABULARIO_LOTE_BATCH.md`) reserved both of those words:

| Concept | Interface word |
|---|---|
| A plot of land with coffee trees | **Lote** |
| Harvested coffee being processed | **Batch** |

So a field on a batch page, labelled with both reserved words, meant a third
thing entirely. Read quickly it asks "which batch is this?" — a question the
page has already answered in its heading.

V1 exists because the product owner opened `/lots` expecting his six plots and
found coffee batches. That document fixed the navigation and the headings. It
did not reach this field, or its twin.

**Decision 1 — the package's lot number is named as such.** `Lote/batch` →
**"N.º de lote del envase"**. Longer, and unambiguous: it cannot be misread as
a plot or a coffee batch, which is the entire requirement. The product owner
chose the wording; inventing operational vocabulary on his behalf is how the
previous label happened.

`Material` → `Insumo`, and the form now carries one line saying what the
section is for and why the number matters. The fields alone did not say it, and
a form that needs explaining should contain the explanation.

**Decision 2 — the same defect in the apiary module, found by grep.** Colony
treatment entry asked for `Producto` and **`Lote`** — the same package lot
number, the same reserved word, in a module V1 never looked at. Fixed
identically. Two occurrences is the difference between a slip and a pattern:
the word "lote" is load-bearing in this platform and any new field using it
needs checking against V1.

**No schema change**, per V1's own instruction: `material_consumption_entry.
batch_label` keeps its name. What was wrong was what the user reads.

**Verification.** 554 tests pass, typecheck and lint clean. A grep across
`messages/` confirms every remaining use of "lote" refers to a plot, which is
V1-correct.

**Worth noting for whoever adds the next field.** This was not found by a test,
a type, or a review. It was found by the person who uses the platform opening a
page and saying he could not tell what a form was for — and the strongest
evidence was already in the database: zero rows, for a feature that shipped.
An unused write path is worth a look before it is worth a fix.

---

## ADR-098 — Target versus actual, and the mean that must never eat its inputs

**Context.** The product owner asked for BeerSmith's shape, in his own words:
*"we have a desired measurement or batch size, and then what actually happens
… we target 3.8 or 4.0 and then if it's 3.785, or after taking a few samples
and average them, we get the actual result versus target."*

The platform stored only actuals. 25 pH readings, 11 temperature, 2 moisture —
every one a number with nothing to compare it to. A measurement says what
happened; on its own it cannot say whether that was what you wanted.

**Decision 1 — targets live in a reusable, versioned recipe.** `ProcessRecipe`
→ `ProcessRecipeVersion` → `ProcessTarget`, chosen over the two alternatives
after putting all three to the product owner.

Not on the run itself: that works on day one and makes twenty batches
incomparable, because each run's targets are retyped rather than shared. Not
the research `Protocol` either — that carries approval, deviation and
experiment machinery, and folding routine production into it would make every
ordinary fermentation an experiment.

A `FermentationRun` points at the **version**, never at the recipe. Editing a
recipe must not rewrite what a run six months ago was aiming for, which is
CLAUDE.md §3's version-preservation rule applied to production rather than to
protocols. A test creates version 2 with a different target and asserts the
existing run still compares against version 1.

**Decision 2 — `moment` is part of the target's identity.** `initial`,
`during`, `final`, with a unique constraint on
`(recipeVersionId, variable, moment)`. Original gravity and final gravity are
the same variable targeted twice in one process; that is the ordinary case in
fermentation, not an edge case, and a schema that could not express it would
have failed at the first thing asked of it.

**Decision 3 — the mean is derived, computed on read, and never replaces its
readings.** CLAUDE.md §49 forbids combining raw measurement with calculated
value; §28 requires a derived metric to carry its method. So a comparison
returns `actual.readings` *and* `actual.mean`, with `method:
"mean_of_readings"` naming how the second came from the first.

Three readings of 3.7/3.8/3.9 and three of 3.78/3.79/3.79 have the same mean
and mean very different things. Storing only the average would satisfy the
feature request and destroy the information that makes it worth having.
Mutating the code to return the mean without its readings fails two tests.

Nothing is stored: the mean is computed when read. A stored aggregate would
need method, formula, source dataset and timestamp per §28, and there is no
call for that until something needs to cite the number rather than display it.

**Decision 4 — null is an answer, in four places.** No readings yet, no target
declared, no range declared, no recipe on the run. Each returns null or an
empty comparison rather than a zero, a `false`, or an error. Reporting a
deviation of `0` for a target nobody measured asserts an agreement nobody
established — the same failure ADR-080 fixed when a lot with no weighing read
"Cantidad: 0".

**`ambiguousSingleReading`.** The rule mapping readings to moments is
positional: earliest is initial, latest is final, `during` is all of them. It
has one honest failure — with a single reading, earliest and latest are the
same row, and one measurement cannot truthfully be both an original and a final
gravity. Rather than quietly reporting a deviation against both, the comparison
says so and lets the page tell the operator.

**A pattern this deliberately does not follow.** `units.ts` already contains
`cold_hold_target_temperature_min` and `..._max` — targets modelled as
*measurement variables*, which stores a declared intention as though it were an
observed fact. That is exactly the distinction CLAUDE.md §3 asks the system to
keep. It predates this work and is left alone; it is noted here so the next
person meets the argument rather than copying the precedent.

**Verification.** Nine tests against a real database, including the product
owner's own figures: target 3.8, actual 3.785, deviation −0.015. The mutation
described above fails two of them.

**Not built here, and it is a real boundary.** There is no UI. No screen
creates a recipe, attaches a version to a run, or displays a comparison —
`compareRunToTargets` is called by tests only. Recipes must currently be
created through a script, the same way A7/F1/S1 loaded real named entities
before their surfaces existed.

That is a deliberate stopping point rather than an oversight: the data model
and the arithmetic are the parts that are expensive to get wrong and cheap to
verify, and the shape of the screen is worth deciding with the numbers already
flowing. Until that screen exists, **this feature is invisible to the operator
and should not be described as delivered.**

---

## ADR-099 — The screen that makes target-versus-actual visible

**Context.** ADR-098 built the data model and the arithmetic and stopped
there, saying in as many words that until a screen existed the feature was
"invisible to the operator and should not be described as delivered". This is
that screen, plus the two things it needed to have anything to show: a way to
attach a recipe to a run, and a way to create one.

**Decision 1 — a table, under the run's own heading.** Three columns —
objetivo, real, desviación — one row per target, and the eye goes down the
deviation column. The product owner described BeerSmith, and BeerSmith is a
table.

Placed directly beneath the active fermentation's heading rather than in a
section of its own: this is the run's report card, and a separate section would
put the numbers a scroll away from the thing they describe.

**Decision 2 — each kind of "no answer" gets its own words.** ADR-098 returns
null in four distinct places, and rendering them all as a dash would make the
table lie by omission — the same failure ADR-080 fixed when an unweighed lot
read "Cantidad: 0". So:

| Situation | What the cell says |
|---|---|
| No readings for that variable yet | *sin medir todavía* |
| Target declares no number | *sin número declarado* |
| No range declared | the range line is simply absent |
| One reading serving as initial *and* final | *no puede ser inicial y final a la vez* |

**Decision 3 — the mean never appears without its readings.** When more than
one reading contributed, the cell prints the mean, says *media de N lecturas*,
and lists the values beneath: `4.6 · 4.1 · 3.785`. §28 requires a derived
metric to carry its method; showing the mean alone would satisfy the layout and
hide the spread, which is the information the operator is actually reading for.

**Decision 4 — the recipe is chosen when the run starts, and the field hides
when there is nothing to choose.** `listRecipeVersionsForLot` returns only
**approved** versions belonging to the batch's organization, or shared ones
with no organization. A draft version is someone still deciding what the
targets should be, and a run operated against a moving target is worse than a
run with none. When the list is empty the field is not rendered — an empty
select is a question with no answers.

Gated on `lot:manage` at the batch's own scope rather than a new `recipe:*`
permission: choosing which process a batch runs under is an operational
decision about that batch, and inventing a permission nobody holds would fail
ADR-091's coverage test.

**Decision 5 — a recipe and its first version are created together.**
`createRecipeWithVersion` refuses a recipe with no targets, a target with no
number at all, and an inverted range. A name with no targets declares nothing;
a target with no number is an instruction to measure, which is what
`ProtocolRequiredMeasurement` is for.

**Verification.** Exercised against the local restored database with a recipe
carrying all three shapes of target, and it produces exactly the case mix the
design has to handle:

```
brix initial   22 Bx      21.4 Bx (1)     -0.6    ⚠ una sola lectura
ph during      4–5 pH     4.1617 pH (3)   —  dentro
                          lecturas: 4.6 · 4.1 · 3.785
ph final       3.8 pH     3.785 pH (1)    -0.015
```

The last row is the product owner's own example, unchanged from how he
described it. 592 tests pass, typecheck, lint and build clean.

**Not built here.** There is no recipe-authoring *page*. `createRecipeWithVersion`
exists, is validated and is callable, but nothing in the interface reaches it —
a recipe must be created through a script today. So an operator can attach a
recipe and read the comparison, and cannot yet write one.

That is a narrower gap than ADR-098's and it is still a gap: the loop is
closed for someone who already has recipes and open for someone starting from
none. Worth building next, and worth designing with the comparison already on
screen so the form is shaped by what the table needs.

**First worktree-separated work.** Built in
`~/Developer/nectar-worktrees/session-b` after `git add -A` in the shared
checkout swept a parallel session's uncommitted files into PR #52. The
separation is the actual fix; staging discipline was only a mitigation.

---

## ADR-100 — Authoring a recipe, and the unit the operator never types

**Context.** ADR-099 put target-versus-actual on screen and said the loop was
"closed for someone who already has recipes and open for someone starting from
none". The product owner had none. This closes it.

**Decision 1 — the unit is not an input.** It comes from the variable's own
definition in `units.ts` and travels as a hidden field. An operator picks
*pH* and the unit is `pH`; there is no way to record a pH target in Brix.

That is the one field an operator would most plausibly get wrong, and getting
it wrong would not fail — it would compare a pH target against Brix readings
and quietly report nonsense for the rest of the run. Removing the field removes
the failure.

**Decision 2 — a target is checked against the same physical bounds a reading
is.** `units.ts` already knew pH runs 0–14 and Brix 0–40; it just had no way to
say so, since `REGISTRY` was private. `listVariableDefinitions` and `boundsFor`
export it, the form uses them for `min`/`max` attributes, and the service
refuses anything outside regardless — the form is not the boundary.

A declared pH of 15 is not a preference to record. It is a typo, and a
comparison table would otherwise report a deviation of −11 for the rest of that
run's life, looking like a process problem rather than a slip of the thumb.
Mutating the check away fails two tests.

**Decision 3 — the target count is not fixed.** "Lavado tradicional" declares
three targets, a cold-hold protocol declares eight. The form adds and removes
rows, and the action parses `targets[i][...]` by walking indices until one
comes up empty rather than trusting a hidden count that a truncated POST would
make wrong. The last row cannot be removed, because a recipe with no targets
declares nothing and the service refuses it anyway.

**Decision 4 — recipes are not a top-level navigation entry.** Adding one took
the signed-in bar from eight items to nine, and
`tests/navigation.test.ts` failed on "consolidates three former entries into
one, and stays short on a phone".

The test was right and the change was wrong. S2 consolidated that bar from ten
entries deliberately, for operators working one-handed outdoors, and a recipe
is process configuration reached from the batch flow rather than a place work
happens. The link lives on `/lots` beside "Crear Batch", gated on `lot:manage`
to match the service.

Worth recording as a small case of a test defending a decision rather than
describing behaviour: had the assertion been `toBeLessThanOrEqual(10)` the
regression would have shipped.

**Verification.** Eleven tests, of which seven are refusals — no name, no
targets, a target with no number, an inverted range, a value outside physical
range, a unit belonging to another variable, a variable not in the registry —
plus one asserting a refused creation leaves no half-built recipe row behind,
the same shape as ADR-089's abandoned backup directory. 603 tests pass overall;
typecheck, lint and build clean.

**Not built.** Editing an existing recipe, and creating version 2. The schema
supports both — `ProcessRecipeVersion` exists precisely so targets can change
without rewriting what past runs were aiming for — and nothing in the interface
reaches them. A recipe today is created once and thereafter fixed. That is a
smaller gap than the one this ADR closes, and it is the next one.

---

## ADR-101 — A field session belongs to a person who cannot log in

**Context.** P2 §3–§5 (`43_P2_OPERATOR_CORE.md`) added `FieldSession`,
`FieldEvent` and the first real capture timestamps. The code landed on main
inside **PR #52**, whose title and description are about fermentation targets:
two sessions were working the same tree, a broad `git add` swept four
uncommitted files into someone else's commit, and 1,176 lines merged without
being reviewed as their own change. The code was tested and main stayed green;
the process was not. This ADR exists partly because that history is otherwise
misleading — the reasoning below was never in a PR anyone read.

Two facts framed the work. Nothing in the schema grouped a visit: every event
table is anchored to its own domain parent — a run, a colony, a stage — so
"Kenneth went to Lote 3 on Tuesday morning and did these eleven things" could
not be expressed. And `partner.task` had **0 rows, ever**, as did
`field_submission`: the Partner Workspace is fully built and has never been
used, which is why §1–§2 (extending Task, task templates) were deliberately
*not* built here. Extending a model nobody has used, for users who do not
exist, was not worth doing before someone answers why it went unused.

**Decision 1 — `operatorPersonId` is a `Person`, never a `UserAccount`.** Most
Person rows in this database have no email and therefore no account. A session
recorded by someone who cannot log in is the normal case at a farm, not an edge
case, and a model that cannot express it excludes most of the people doing the
work.

This is the same defect `Task.assignedToUserAccountId` still has — a task
literally cannot be assigned to most of the crew — and it is the single
hardest blocker left in the operator model. `FieldSession` simply refuses to
repeat it.

The authority question is separate and unchanged: the **caller** still needs
`location:manage_attributes` on the block. Who did the work and who is allowed
to record it are two different facts, and conflating them is what forces the
UserAccount requirement in the first place.

**Decision 2 — `FieldEvent` is a spine, not a replacement.** The tempting
design is one generic event table that `FermentationIntervention`,
`DryingTurnEvent`, `SpecimenObservation`, `QuantityEvent` and
`ProcessingStageObservation` all migrate into. That would collapse their typed
columns into JSON, which CLAUDE.md §49 forbids outright, and discard the
validation each of them carries.

So `FieldEvent` owns no domain semantics. It records *when, where and by whom*,
and points at the row holding *what* through a nullable FK per parent — the
ADR-020 decision 8 pattern `Asset` already uses fifteen times. At most one
subject may be set, enforced in the service: two would make the timeline
ambiguous about which row a moment refers to, and being unambiguous is the
spine's only job.

Every specialised table stays exactly where it is.

**Decision 3 — `eventKind` is a catalog value, not an enum.** What an operator
might record will keep growing, and P1 established that a growing vocabulary is
a seed entry plus a re-seed rather than a migration. The service validates that
the value belongs to the `event_kind` catalog specifically — a cultivar is not a
kind of moment — and follows an alias to its canonical row, the same rule
ADR-095 set for cultivars, so a timeline does not group one kind of moment
under two labels.

**Decision 4 — three timestamps, because they are three different facts.**
`occurredAt` is when it happened, `recordedAt` is the device clock when the
operator entered it, `createdAt` is server receipt, `syncedAt` is arrival from a
device. The audit's worked example — measured 14:00, entered 14:23, synced
09:17 the next morning — was previously expressible only as one of those.

**A `recordedAt` earlier than `occurredAt` is refused.** Entering something
before it happened is a clock problem, not a record, and a fermentation curve
reconstructed from a drifting cheap phone is wrong in a way nobody notices
until the conclusions are drawn.

Scope was **narrowed against the ticket**, which said every operationally
captured table. The columns went to `measurement`, `quantity_event` and the two
apiary tables that already have an offline write path (`clientDraftId`, A5) —
the only places where device-versus-server time diverges today rather than in
theory — plus the two new tables. The rest follow in Phase 4 alongside
`Device`, when the FK can actually be wired and something writes them. Adding
fifty-odd nullable columns nothing can populate is not cheap insurance, it is
surface area; and the migration costs the same either way.

`deviceId` is a bare nullable UUID for now for that reason. `Device`, with
token issuance and revocation, is Phase 4.

`measurement.device_id` — free text since T3, never written by any code path —
was **left alone rather than repurposed**. A column that once meant "some string
a lab machine reported" and now meant "a registered device" would make old rows
lie. `capture_device_id` is the real one.

**Decision 5 — a position is all-or-nothing.** Latitude without longitude is not
a partial fix, it is a bug, and half a coordinate stored as data is worse than
none because a map will plot it somewhere confidently wrong. Ranges are checked;
a negative accuracy is refused. All three stay nullable, because a device with
no fix and a session written up afterwards at a desk both genuinely have no
coordinates, and a fabricated one is the failure this schema exists to prevent.

**Decision 6 — the timeline orders by `occurredAt`, not `createdAt`.** For a
batch synced the next morning, creation order is the order the server happened
to receive rows and says nothing about the morning's work. Events before the
session started, and events on an ended session, are both refused: the first
belongs to a different session, and the second is a record being appended to a
closed one.

**Consequences.** A session and its events reconstruct a visit in order, which
nothing could do before. `FieldSession` is also the intended offline
transaction boundary and unit of selective sync (audit §17) — a device pulls the
sessions assigned to its operator and pushes them back whole — so its shape is
load-bearing for Phase 4 in a way none of it is exercised by yet.

Sixteen tests cover it and 592 pass overall, but **no real session has ever been
recorded**, exactly as no task ever was. P2's acceptance criterion stands
unmet and is not a test: one real person, who is not the product owner, receives
a task, goes to a block, records an observation and a photo with GPS, and
completes it. Until that happens this is a well-tested guess about how field
work goes.

---

## ADR-102 — A name may be edited; a target may only be superseded

**Context.** ADR-100 left a recipe "created once and thereafter fixed". The
schema always supported change — `ProcessRecipeVersion` exists for exactly that
— and nothing in the interface reached it. This is that half.

**Decision 1 — the two operations are separated, and the separation is the
point.** Renaming a recipe and changing its targets look like the same action
in a form and are opposite in kind:

- A **name** is a label. Correcting "Lavado tradicinal" changes nothing about
  what any run was aiming for, so it is an edit, and it is audited with both
  sides.
- **Targets** are what runs were operated against. Changing those is a new
  version and never an edit, which is CLAUDE.md §3's version-preservation rule
  applied to production rather than to protocols.

`updateRecipeMetadata` takes name and description and nothing else — there is
no target field to reach. Conflating the two is the failure ADR-092 avoided for
stories and ADR-098 built this table to prevent.

**Decision 2 — the new-version form is prefilled from the current version.**
Creating v2 almost always means changing one number, not retyping eight
targets. An empty form is why people edit the database directly, or give up and
let the recipe drift out of date — which is the outcome the version table
exists to prevent. The prefill is a starting point, not a diff: what is
submitted becomes the new version in full.

**Decision 3 — only the newest version is offered for a new run, and this was
a defect this change would otherwise have introduced.**
`listRecipeVersionsForLot` returned every approved version. That was correct
while a recipe could only ever have one, and wrong the moment v2 existed: the
picker would have listed "Lavado v1", "Lavado v2", "Lavado v3" and asked the
operator to know which was current.

Older versions stay attached to the runs that used them and stay readable
there. They are simply not offered again.

**Decision 4 — the history shows how many runs used each version.** That is
what makes version preservation legible rather than abstract: a version with
runs attached is history, and the page says so, instead of implying it could be
tidied away.

**Decision 5 — a duplicate (variable, moment) is caught before the database.**
The unique index would raise `P2002`, which an operator cannot read. Validation
names the actual mistake — two targets for the same variable at the same
moment.

`validateTargets` is now shared between creating a recipe and creating a
version. Two copies would eventually disagree, and the copy that drifted would
be the one nobody was reading.

**Verification.** Eleven tests, and the one that matters most asserts a run
operated against v1 still compares against **3.8** after v2 declares 4.0.
Mutating `compareRunToTargets` to use the recipe's newest version instead of
the run's own fails that test *and* ADR-098's equivalent — two suites, written
weeks apart, guarding the same rule. 614 tests pass overall.

**Not built.** Retiring a recipe, and deleting a version. Both are deliberate
omissions rather than gaps: a version with runs attached must not be removable,
and a recipe nobody uses is harmless. When retirement is wanted it should be a
status change with the runs left intact, not a delete — and that is a decision
worth making when something actually needs retiring.

---

## ADR-103 — Floaters are coffee, and coffee that is not recorded does not exist

**Context.** Selection was the first specialty-coffee operation the platform
could not express. What existed was `cereza_seleccion` and `cereza_flotado` —
`VariableCatalog` values recorded as `ProcessingStageObservation` rows. They
capture what was *seen* ("5-10% flotadores") and they remain valid and
complementary. They capture **no weight, produce no material, and leave rejected
coffee with no existence in the system.** Floaters sold as commercial grade were,
as far as the database was concerned, not there.

The audit's §57 named this the most architecturally meaningful slice to build,
and it was blocked on the mass-balance work. ADR-094 shipped, so it isn't.

**Decision 1 — a selection is a `LotTransformation`, not a new entity.** It
already has exactly the shape the graph handles: one input lot, several typed
outputs with quantities, plus method, operator, time and equipment. A
specialised `SelectionEvent` table was considered and rejected in the audit
(§11): it would need its own inputs, outputs, quantities, lineage edges and mass
balance — a second transformation system differing only in vocabulary.

`recordSelection` (`lib/traceability/selection.ts`) is a thin domain wrapper
over `recordTransformation`, never a parallel write path.

**Decision 2 — `selection` joins `CONSERVING_TYPES`, and that is the point of
the ticket.** Accepted + rejected + declared loss must equal the input, so the
reconciliation path ADR-094 built now has its first real consumer. It is also
the first transformation where an out-of-balance figure means something: a
`stage_change` legitimately loses four fifths of its mass and that loss is the
yield, whereas a selection that does not add up means someone mis-weighed or
material went missing.

`selection` is deliberately **absent** from `FULL_CONSUMPTION_TYPES`, so it takes
the partial path and an explicit input quantity is required. A selection whose
input was never weighed cannot reconcile against anything, and the outturn is
the entire reason the operation exists.

**Decision 3 — rejected material is a real `Lot`, but its `lotType` stays
physical.** §58 Decision B settled that each rejection stream becomes an output
Lot, so it keeps identity, weight, storage and a sale path, and mass balance
falls out with no special case.

This **diverges from the audit's §25**, which proposed a new `LotType` value for
rejected material. `LotType` describes the material's *stage* — cherry,
processing, drying, green — and a lot of floaters is physically still cherry; a
rejected parchment is still parchment. Folding a quality judgement into the
stage enum would make it mean two things at once, and the moment there is
rejected material at a later stage the enum could not say so.

So `Lot.rejectionCategoryValueId` instead: stage and quality as two axes, the
same separation `dataQuality` already has from `status`. "Is this sellable
coffee or a reject" becomes one nullable column, and a floater lot still
correctly reports as cherry.

**Not every rejection is waste** (audit §18). A rejected lot can be stored, sold
through the existing `sale` transformation, composted through `disposal`, or
reprocessed as the input to another transformation. All of that works because it
is a Lot; none of it works if rejection is an attribute. A test asserts the
store-and-sell path specifically, because it is the whole argument.

**Decision 4 — two catalogs, not two enums.** `seleccion_metodo` (flotación,
manual, madurez, densidad, color, óptica, tamaño, defectos, otro) and
`rechazo_categoria` (flotadores, cereza verde, sobremadura, cereza seca, dañada,
broca, moho, materia extraña, pergamino defectuoso, otro). This vocabulary grows
with real practice, and P1 and P2 both established that growth is a seed entry
plus a re-seed rather than a migration. Both carry `otro`, always paired with a
free note — F1 §1's rule. Aliases resolve to canonical rows before storing, the
rule ADR-095 set for cultivars, so reporting cannot split one category across
two spellings.

Every rejected output **must** carry a category. A rejected lot with no reason is
indistinguishable from ordinary material a week later, which is the failure this
ticket exists to prevent.

**Decision 5 — standards are explicitly not here.** The audit pairs selection
with `OperatingStandard` ("Specialty Cherry Intake v3: max floaters 5%"). Nobody
has decided what the real thresholds are, and building a threshold engine with
no thresholds would repeat the mistake P2 §0 identifies — infrastructure for
users and data that do not exist. Record selections first; the observed
distribution then becomes the input to that conversation.

**Consequences.** Cherry outturn is computable for the first time, and per
stream: `getSelectionOutturn` reports each stream's share of the input, computed
never stored, because storing both a quantity and its percentage invites the two
to disagree and the quantities are the facts.

Fourteen tests cover it. As with P1 and P2, **no real selection has ever been
recorded** — this is a well-tested model of an operation nobody has yet
performed through the platform. The first real one is what will show whether the
rejection vocabulary matches what actually comes off a flotation tank.

---

## ADR-104 — A mutation run leaves rows a tracked-id cleanup will never find

**Context.** Asked to remove a demo recipe from the local database, the
cleanup turned up a second row nobody had asked about:

```
RECIPE Impossible recipe-1787941745697   →  target pH 15
```

pH 15 is the exact value `tests/traceability/recipeAuthoring.test.ts` asserts
must be **refused**. The row existed anyway, and the test was passing.

**What happened.** ADR-100's bounds check was verified by mutation: the check
was disabled, the suite re-run, and two tests failed as designed. That is the
evidence the check does work. But with validation disabled, the creation the
test expected to be *refused* **succeeded** — and the test's `afterAll` deletes
by `created.recipeIds`, a list the refusal cases never push to, because under
normal conditions there is nothing to record.

So the mutant's row was invisible to the cleanup that ran seconds later, and to
every run afterwards. It sat in the local database for days.

**Decision — refusal-heavy suites delete by run prefix, not by tracked id
alone.** Both recipe suites now end with

```ts
await prisma.processRecipe.deleteMany({
  where: assertDefinedWhere({ name: { contains: RUN } }),
});
```

The tracked-id list stays for the AuditEvent rows, which have no name to match
on. `RUN` is already a per-run timestamp, so the pattern cannot reach another
run's data, and `assertDefinedWhere` still guards against the clause collapsing
to `{}` (ADR-045).

**Why this is worth an ADR rather than a quiet fix.** It is the third variation
of one mistake in this repository, and the shape is now clear enough to name:

- **ADR-086** — a fixture cleanup matched on `roasterPersonId`, and the three
  sessions that named no roaster leaked, 79 of them into production.
- **ADR-089** — a failed backup left a directory the pruner counted as a
  backup.
- **Here** — a cleanup matched on ids it had recorded, and the row created by a
  path that was supposed to fail was never recorded.

Each time, the cleanup was correct for the case the author had in mind and
silent about the case they had not. **A cleanup that only removes what it
expected to create is not a cleanup; it is a record of intentions.**

There is a sharper lesson for mutation testing specifically, which this
codebase now does routinely: *a mutant that turns a refusal into a success
writes data the suite was never designed to remove.* Verifying a guard can
leave behind exactly the thing the guard exists to prevent.

**Verification.** Re-ran the mutation with the fix in place: two tests fail as
before, and the database is left with **zero** recipes instead of one. 614
tests pass with the real code.

---

## ADR-105 — The step the page recommends had a right answer that stopped being right

**Context.** ADR-096 gave the batch page a suggested next action, and recorded
its sequence as **the product owner's, confirmed rather than inferred**: cherry
is waiting to ferment, processing to dry, drying to be stored.

That was true when it was written, and it is the reason this change was not
made unilaterally. Selección did not exist then. It does now (ADR-103), and at
a mill it comes first: cherry arrives, is sorted, and only then ferments. So
the page was recommending the second step of a two-step sequence and never
mentioning the first — leaving an operation that shipped with a form
discoverable only by scrolling past it.

**Decision 1 — unsorted cherry suggests `selection`; sorted cherry keeps
suggesting `fermentation`.** The distinction is load-bearing rather than
cosmetic. An accepted output *is* a cherry lot: it has the same `lotType` as
the batch it came from, deliberately (ADR-103 keeps `lotType` physical). A rule
that simply said "cherry suggests selección" would tell an operator who had
just finished sorting to sort the result again, which reads as the page not
knowing what happened to the batch in front of them.

`alreadySelected` is resolved from the batch's own transformations — a
selection naming this lot at all, as input or output, means the page stops
suggesting one. Sorting an accepted stream a second time is a real thing
someone might do, but it is a deliberate decision rather than the expected next
step, and the button remains one click away.

**Decision 2 — the new parameter defaults to `true`, which preserves ADR-096's
behaviour.** A caller that has not been taught to resolve lineage keeps getting
`fermentation` for cherry, exactly as before. The alternative — defaulting to
`false` — would have quietly given every existing and future caller a new
suggestion the moment they upgraded, which is how a "suggests, never restricts"
feature turns into a surprise. The one caller that *does* resolve lineage, the
batch page, passes the real answer.

**Decision 3 — the action is an anchor, not a route.** `#seleccion` scrolls to
the form already in its own section on the same page, the same treatment
`measurement` gets. Fermentation and drying navigate because they genuinely
start something elsewhere; selección does not.

**Consequences.** ADR-096's own promise still holds without qualification:
**this suggests, it never restricts.** Every action the page offered is still
offered, in its original order, one click away. What changed is which one is
drawn as expected, for one lot type, in one state.

The sequence recorded in ADR-096 is not wrong and is not being corrected — it
was a complete answer to the question as it stood. This is what that answer
becomes once the platform can perform an operation it previously could not, and
it was confirmed with the product owner before being written rather than
inferred from the domain.

Still unverified by use: no real selección has been recorded, so whether
sorting actually precedes fermentation at Finca Rosina — rather than in the
general case — is a claim this ADR makes on domain reasoning, not on evidence
from the farm.

---

## ADR-106 — La familia Huerbsch registrada, and a decision that closed before anyone checked

**Context.** `scripts/open-decisions.sh` carried this premise in the comment
above P-D's test: *"La familia Huerbsch es dueña de Finca Rosina y NO está en
la base como Personas."* Every session since has read that line and carried
P-D to the product owner as blocked on him supplying names and roles.

Production disagrees. Measured 2026-08-29:

| Persona | Título en `OrganizationMembership` | UserAccount | Assignments |
|---|---|---|---|
| Bob Huerbsch | Copropietario | `invited`, sin clave, nunca ingresó | 10 |
| Sherry Huerbsch | Copropietaria | `invited`, sin clave, nunca ingresó | 10 |
| Chris Huerbsch | Representante familiar | `invited`, sin clave, nunca ingresó | 2 |

These rows are neither invented nor DEMO.
`docs/implementation/27_A7_PROYECTOS_ASSIGNMENTS_DATOS_REALES.md` §2 names all
three with those roles and §4 assigns the memberships — a specification written
by the product owner, not inferred by a session. `prisma/seed.ts` records the
farm organization's name as pre-approved by Sherry Huerbsch and deliberately
excludes it from DEMO seeding, precisely so `SEED_DEMO_CONTENT=true` could never
attach fictional content to the real organization.

So P-D was answered by the work that created those rows. It kept being asked
because its test looks for an ADR heading that nobody had written — which is
exactly what that test was built to look for, after a different test closed
itself on its own text. The guard did its job. The prose above it went stale,
and no session re-read it against the database.

**Decision 1 — the three Persons above, with those titles, are P-D's answer.**
Nothing is created here. This ADR records that the rows already carry the names
and roles the decision asked for, and cites where each came from, so the claim
can be re-checked instead of re-litigated.

**Decision 2 — closing P-D asserts nothing about whether they can use the
platform.** `OrganizationMembership` is descriptive and grants no permissions
(`DOMAIN_MODEL.md` §2). Access comes from the 22 Assignments, which resolve
correctly and reach nobody: all three accounts sit at `invited` with no
password, and all three Persons have `email = NULL`. ADR-083 already removed
the sign-in callback that rejected `invited` accounts, so the door works — there
is nobody to hand a key to. That is P-C, still open, and it is the reason these
are two decisions rather than one. Registering a person and reaching them are
different facts, the same way ADR-080 keeps "never recorded" different from
"recorded and zero."

**Decision 3 — the stale comment is corrected in place, not annotated.** A
comment that says the opposite of the database is worse than no comment: it is
read every session as context and reasoned around. `CLAUDE.md`'s rule is that a
false rule gets corrected rather than reinforced, and this is that case.

**Consequences.** P-D closes and drops out of the first message to the product
owner, leaving P-A and P-C. The count of open decisions goes 3 → 2 for a reason
that is a correction, not progress: nothing was built, something was measured.

Flip-tested in both directions: with this heading present `open-decisions.sh`
reports P-D **cerrada**; with the heading removed it reports **abierta** again.
The heading is the landing site, so the verdict survives in a file rather than
in a session that ends.

Unverified by use, and worth stating plainly: nothing in this ADR makes the
farm's owners able to open the platform. Twenty-two Assignments have resolved
correctly to nobody since they were created.

---

## ADR-107 — Los correos de las personas se dan por función, no por jerarquía

**Contexto.** Sin correo no hay contraseña, así que la lista de quién tiene
correo *es* la lista de quién puede entrar. Hasta hoy eran dos personas. P-C
llevaba abierta desde el 2026-08-28 porque quién recibe la llave no lo decide
el sistema.

Medido el 2026-09-04 contra una copia local restaurada del backup
`2026-09-04T202018Z` —no contra producción directamente, y con control
positivo: `traceability.planting_cohort` dio 4, que es su valor conocido—:

| | |
|---|---|
| Personas en `core.person` | 17 |
| Con correo | 3 |
| Sin correo | 14 |

Los tres con correo son Daniel Giráldez, José Giráldez y **Nathy Rubio**.

**Decisión del dueño, 2026-09-04.** El acceso se concede por **la función que
la persona ejerce**, no por su posición en la organización. Nathy Rubio lleva
administración y operaciones: opera el sistema como parte de su trabajo, y por
eso tiene cuenta.

De ahí se sigue lo que esta regla **no** dice: ser propietario no otorga acceso
por sí mismo, y no tenerlo no es una degradación. Son ejes distintos.

**Los Huerbsch siguen sin correo, y la razón importa.** Bob, Sherry y Chris
—copropietarios y representante familiar, con 22 Assignments entre los tres
según ADR-106— **no están excluidos por decisión: todavía no han dado sus
direcciones.** Es un hecho pendiente, no un veredicto.

La distinción no es retórica. Una tabla con la casilla vacía se lee igual en los
dos casos, y quien la mire dentro de seis meses no podrá saber si es que nadie
preguntó o si se decidió que no. Aquí queda dicho: se preguntó, y falta el dato.
Cuando lleguen los correos, darlos de alta **no requiere volver a abrir P-C** —
ya están cubiertos por esta regla, porque su función lo justifica.

**Lo que esto no arregla.** Las 22 asignaciones de los Huerbsch siguen
resolviendo correctamente a nadie, igual que el día que se crearon. La puerta
funciona desde ADR-083; lo que falta es a quién dársela, y de ellos tres sigue
faltando.

**Cómo se comprueba.** La prueba de P-C exige la frase en el encabezado de un
ADR, no en el cuerpo: `^## ADR-[0-9]+.*correos de las personas`. Se pide así
desde que una mención de pasada —«los correos de las personas siguen
pendientes»— habría cerrado la decisión sin que nadie la tomara.

---

## ADR-107 — Nadie asignó nunca una tarea, así que la Fase 2 se cierra sin extender `Task`

**Contexto.** `docs/implementation/43_P2_OPERATOR_CORE.md` §0 midió el
2026-08-28 que `partner.task` y `partner.field_submission` tenían **0 filas
desde siempre**, y dejó escrita una condición antes de construir §1 (extender
`partner.Task` con objetivo, asignado `Person`, planeado-vs-real y evidencia
requerida) y §2 (`TaskTemplate`): *contestar por qué no se ha creado nunca
ninguna tarea*, porque de la respuesta depende si `Task` es siquiera el padre
correcto.

Re-medido el 2026-09-04 contra producción, con control positivo en la misma
consulta para que un cero no pudiera venir de mirar donde no era:

| | filas |
|---|---|
| `core.person` *(control)* | 17 |
| `core.project` *(control)* | 3 |
| `core.assignment` *(control)* | 40 |
| `partner.task` | **0** |
| `partner.field_submission` | **0** |
| `traceability.field_session` | **0** |
| `traceability.field_event` | **0** |

Las dos últimas son lo que la Fase 2 **sí** construyó (ADR-101), desplegado
hace una semana. Nadie ha abierto una jornada de campo desde que la pantalla
existe.

**Decisión — la respuesta del dueño del producto, 2026-09-04: nunca se asignó
trabajo por la plataforma.** El trabajo se reparte hablando, y el sistema no
entró en esa rutina. §0 nombra esa rama y dice qué hacer con ella: *la brecha
es de adopción, no de esquema, y las extensiones de §1 son especulativas.*

Así que §1 y §2 **no se construyen**, y la Fase 2 se cierra con §5 y §6, que
§0 pide igual porque la sincronización los necesita y porque son caros de
añadir a posteriori.

**Por qué esto no es aplazar por pereza.** Extender `Task` ahora significaría
añadir siete columnas y una tabla nueva a un modelo con cero filas, para
servir a operadores que no tienen cuenta (3 de 17 Personas tienen correo), en
un flujo que nadie ha recorrido de punta a punta. Son tres suposiciones
apiladas. Y hay una cuarta que sólo se ve con el dato de hoy: la mitad de la
Fase 2 que sí se construyó tampoco tiene una sola fila, así que extender
`Task` sería apilar un segundo modelo sin usar encima de un primero sin usar.

**Lo que reabre esta decisión.** No es una fecha: es una fila. En cuanto
exista una `FieldSession` real —alguien que no sea Daniel recorriendo un
bloque y registrando algo— se sabrá qué le faltó al modelo para expresar su
trabajo, y esa observación será mejor especificación para §1 que la conjetura
del ticket. El §7 del ticket ya dice cuál sería lo primero en ese caso:
`assignedToPersonId`, porque la mayoría de quienes harían el trabajo no
tienen cuenta.

**Lo que NO decide este ADR.** No dice que `Task` sea el padre equivocado
—esa era la tercera rama de §0 y no es la que se tomó—, ni toca
`assignedToUserAccountId`, ni descarta `TaskTemplate` para siempre. Dice que
hoy no hay evidencia para diseñarlos.

**Cómo se comprueba.** Que la Fase 2 está cerrada sin §1–§2 se ve en que
`partner.task` no tiene columnas nuevas y no existe `task_template`, y en que
la migración `20260904150000_p2_cierre_gps_asset_y_desfase_reloj` sólo añade
las nueve columnas de §5 y §6. Que la premisa sigue viva se comprueba
volviendo a contar `traceability.field_session`: mientras dé 0, este ADR
describe el mundo.

---

## ADR-108 — La primera rebanada de P4 se construye sin tokens y sin `organizationId`, y las dos ausencias son la decisión

**Contexto.** `46_P4_API_Y_SINCRONIZACION.md` §11 nombra la primera rebanada
como «`Device` + tokens + push por lotes de UNA categoría append-mostly,
ejercida desde la PWA existente». Al construirla, dos piezas que el ticket y el
audit dan por hechas resultaron no tener nada que las ejerciera.

**Decisión 1 — el carril de tokens (§2) NO se construye todavía.** La PWA se
autentica por la cookie de sesión que ya existe, y las dos rutas nuevas
(`/api/v1/devices` y `/api/v1/sync/field-events`) la usan sin tocarla. Unos
endpoints de emisión y refresco de token no tendrían hoy **ni un llamador**: el
cliente que los necesita es el Android de la Fase 5.

Es exactamente el razonamiento de ADR-107 aplicado a otra pieza — construir
autenticación para un cliente que no existe es diseñar a ciegas la parte más
cara de equivocarse. Y no bloquea nada: el criterio de aceptación de §11 es que
un evento anotado sin señal llegue a la base y que repetir el push no duplique
la fila, y eso se demuestra entero por cookie.

**Lo que esta decisión NO dice:** que el diseño de §2 y del audit §19 esté mal.
Sigue siendo el correcto, y el protocolo se construyó para admitirlo — el push
recibe `deviceId` explícito, así que cambiar quién autentica no cambia la forma
de la petición. Lo que dice es que se construye cuando exista quien lo llame.

**Decisión 2 — `Device` va SIN `organizationId`**, contra el audit §19 y el
ticket §1. `ScopeType` no tiene `organization`: los ámbitos de RBAC de este
repositorio son platform, program, project, location, competition, session y
experience. Una FK a `Organization` en `device` no la leería ni la validaría
nada, y una columna así es una capacidad aparente que el sistema no tiene —
justo lo que `schema.prisma` ya evita en `Asset` («una columna que nada escribe
es peso muerto que además parece una capacidad»).

Lo que hoy acota a un dispositivo es quién lo registró y, **evento a evento**,
el RBAC de la `Location` de su jornada, que es donde la autorización vive de
verdad. La columna vuelve cuando exista revocación por organización, que
necesita un ámbito que el RBAC todavía no expresa.

**Decisión 3 — la cola local nueva no refactoriza la de apiario.**
`lib/apiary/offlineQueue.ts` sincroniza de una en una porque su protocolo es de
una en una; el de P4 es por lotes con resultado por mutación, que es otra forma.
`lib/sync/offlineQueue.ts` nace aparte y la duplicación queda **escrita en su
cabecera**, con el momento de colapsarlas: cuando apiario pase a push por lotes.
Refactorizar hoy una cola offline que funciona, para dar de comer a una pantalla
distinta, mezcla dos revisiones y arriesga lo que ya andaba.

**Qué reabre esto.** La Decisión 1 se cierra sola cuando empiece la Fase 5: el
primer cliente nativo no puede usar una cookie. La 2, cuando alguien pida
revocar todos los aparatos de una finca. La 3, cuando apiario cambie de
protocolo.

**Cómo se comprueba.** Que no hay tokens: `grep -r "refresh_token\|accessToken"
lib/sync app/api/v1` no da nada. Que `device` no tiene organización — y la
comprobación obvia NO sirve, porque el comentario del modelo menciona la
palabra y un `grep` simple la cuenta. Hay que mirar la declaración del campo:

```bash
sed -n '/^model Device {/,/^}/p' prisma/schema.prisma | grep -E '^\s+organizationId\s'
```

Vacío es la ausencia; con el campo puesto imprime la línea. Que las tres
decisiones no rompen el criterio de aceptación: `tests/sync/pushFieldEvents.test.ts`,
once casos, dos de ellos con flip-test hecho contra cada guardia de idempotencia.

---

## ADR-109 — Los aparatos de campo son personales, así que §9 se cierra sin tabla de operadores

**Contexto.** `46_P4_API_Y_SINCRONIZACION.md` §9 pide que un PIN verificado sin
red sea **atribución y no autenticación**, y que nunca desbloquee permisos más
amplios que «el conjunto de operadores registrado en el dispositivo». Ese
conjunto suponía un teléfono compartido en el molino, y el propio ticket listaba
la pregunta como decisión del dueño.

**Decisión del dueño, 2026-09-05: los aparatos son personales, uno por
persona.**

**Qué cierra.** `Device.operatorPersonId` —un único campo anulable, que ya
existe— basta. **No se crea tabla de roster, no hay migración y no hay PIN**:
con un aparato por persona, no hay nadie entre quien cambiar sin volver a
autenticarse contra el servidor.

**Qué NO cambia, y es lo que había que proteger.** El operador de un aparato
sigue sin conceder autoridad ninguna. La autorización es la **cuenta** que
sincroniza, comprobada contra la `Location` de la jornada en cada mutación. Con
aparatos personales la tentación es justo la contraria a la de §9: leer «este
aparato es de Kenneth» y usarlo para decidir qué puede escribir. Eso sería un
fallo de seguridad silencioso, porque la lectura es plausible.

`tests/sync/deviceOperator.test.ts` lo fija con tres casos: atribuir a otra
Persona funciona sin más —quien hace el trabajo normalmente no tiene cuenta, y
restringirlo excluiría a esa gente, que es lo que §4 del estado prohíbe volver a
proponer—; y un aparato registrado a una Persona real **no abre** una Location
que su cuenta no tiene, ni siquiera atribuyendo el evento a su propio dueño.

**Flip-test hecho:** quitando `requireLocationAttributeAccess` de
`recordFieldEvent` —mutación acotada a esa función, comprobado por sha y que
compila— caen exactamente los dos casos de guardia y sigue pasando el de
atribución.

**Qué lo reabre.** Un teléfono compartido de verdad. Entonces vuelve la
pregunta del roster, y con ella el PIN — y la regla de §9 sigue escrita esperando
ese día: el PIN sería atribución, nunca autenticación.

**Cómo se comprueba — y la comprobación obvia NO sirve.** `grep -c
"DeviceOperator" prisma/schema.prisma` da **2**, porque ése es el nombre de la
relación que ya existe entre `Device` y `Person`. Un cero ahí sería imposible y
un dos no dice nada. La buena mira si hay un MODELO con ese nombre:

```bash
grep -cE '^model DeviceOperator ' prisma/schema.prisma          # 0 = no hay roster
sed -n '/^model Device {/,/^}/p' prisma/schema.prisma | grep -cE '^  operatorPersonId '   # 1 = un solo campo
```

Que el aparato no autoriza: los tres casos de `tests/sync/deviceOperator.test.ts`.

---

## ADR-110 — Enmienda a ADR-009: el mapa se hace con Leaflet y teselas de OSM, y lo que lo bloqueaba no era el proveedor

**Contexto.** ADR-009 eligió Mapbox «behind the `MapsProvider` adapter», por su
estilo propio. Al ir a construirlo, el reporte A9 (§48) medía el estado real:
el mapa estaba **especificado entero** —`MAP_AND_TERRITORY.md`, Mapbox +
PostGIS, ADR-001/ADR-009— y tenía **cero código**: ni `mapbox`, ni `maplibre`,
ni `leaflet` en `package.json`, `app/` ni `lib/`.

**Lo que la medición cambió, y es la mitad que importa.** No estaba bloqueado
por el proveedor. De las **24 `Location` que existen, cero tienen latitud y
longitud**, y la pantalla de un sitio sólo enseñaba el formulario para
declararlas **si ya había una propuesta** sacada del GPS de alguna visita. Como
tampoco hay visitas con lectura de GPS, no había propuesta; sin propuesta, no
había formulario; sin formulario, **no existía ninguna forma de teclear una
coordenada en toda la plataforma**. Un mapa con cualquier proveedor habría
salido vacío.

**Decisión — dos partes, y van juntas en el mismo cambio:**

1. **Leaflet 1.9.4 con teselas raster de OpenStreetMap**, en vez de Mapbox.
2. **El formulario de coordenadas se dibuja siempre**, con la propuesta como
   valor por defecto cuando la hay y en blanco cuando no.

**Alternativas medidas, no estimadas.** El dueño pidió explícitamente «sin
token ni costo», lo que deja fuera a Mapbox, que exige cuenta de pago y token.
Quedaban dos:

| | peso instalado | dependencias | licencia |
|---|---|---|---|
| **Leaflet 1.9.4** | **3,7 MB** | **0** | BSD-2 |
| MapLibre GL 6.8.0 | 20 MB | 17 | BSD-3 |

Se eligió Leaflet. MapLibre da teselas vectoriales y rotación 3D, capacidades
que nadie ha pedido para 24 ubicaciones y un puñado de personas con teléfonos
en el campo.

**Lo que esto cuesta, dicho en voz alta.** Se pierde el estilo propio que era
**toda la razón** de ADR-009 (`CLAUDE.md` §48, «no debe parecer software
empresarial genérico»): las teselas de OSM se ven como OSM. Es un intercambio
consciente — un mapa genérico que existe contra uno bonito que no.

**Y las teselas de OSM no son «gratis» a secas.** Su política de uso pide
**atribución visible** —está puesta y hay una prueba que la vigila— y
desaconseja el uso intensivo. Para este volumen está dentro de lo razonable.

**Qué lo reabre.** Volumen de teselas que incomode a OSM, o que el estilo
propio pase a importar de verdad para el público. La salida del primer caso es
**un proveedor de teselas**, no un cambio de librería: Leaflet acepta cualquier
URL de teselas, así que ese día se cambia una cadena. El segundo sí sería
volver a ADR-009.

**El adaptador `MapsProvider` de ADR-009 no se construye.** Un adaptador de un
solo uso es justo lo que `CLAUDE.md` prohíbe: se escribiría contra la única
implementación que existe, y el día del cambio habría que rehacerlo igual.

**Cómo se comprueba.** `tests/arquitectura/mapa-de-sitios.test.ts`, cuatro
guardias de código fuente, cada uno con su control positivo:

1. Leaflet se carga en un `import()` dentro del efecto y **nunca** en el módulo
   —toca `window` al cargarse y `app/apiaries/page.tsx` es de servidor—;
2. las teselas llevan la atribución de OSM;
3. el formulario de coordenadas **no** está detrás de `coordenadas.propuesta`,
   que es la regresión de arriba;
4. `.nn-mapa` tiene altura explícita en px — Leaflet mide su contenedor y uno
   sin altura resuelta da un mapa de 0 px **sin lanzar ningún error**.

**Flip-test hecho.** Las cuatro mutaciones —importar Leaflet en el módulo,
quitar la atribución, volver a envolver el formulario en `{coordenadas.propuesta
? (`, y cambiar `height: 360px` por `height: auto`— tiran **cada una la prueba
que le toca, por su nombre**, y las tres de TypeScript **compilan** mutadas, así
que el rojo no es un error de carga disfrazado.

---

## ADR-111 — Las causas de pérdida de una colonia son varias, salen de un estándar publicado, y cada una dice cómo se supo

**Contexto.** `20260909010000_fin_de_colonia` cerró el hueco de que ningún
servicio escribiera nunca `Colony.status = dead`. Su cabecera y el comentario de
`Colony.endedAt` decían lo mismo, y tenían razón para aquel día: *«un
vocabulario de causas es conocimiento del dueño: se le pregunta, no se
inventa»*. Se preguntó el 2026-09-09.

**Lo que el dueño contestó, y las dos cosas que cambia.** *«Cuando hay pérdida
de colonia hay múltiples razones y/o causales y situaciones»*, y que antes de
fijar el vocabulario había que **estudiar la documentación de soporte y lo
disponible en línea**, dejando sitio para *«agregar después lo que falte»*.

Eso descarta las dos formas que el comentario viejo daba por buenas: no cabe en
una columna de texto **ni en una FK sola**. Obligar a elegir entre varroa y
hambre cuando la respuesta honesta es las dos falsea el registro.

**Lo que se midió antes de proponer nada.**

| | |
|---|---|
| Vocabulario de causas en el repositorio | **no existe** (grep con control positivo) |
| Lo que sí estaba documentado | `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §2.3 — catorce «irregularidades», pero son *lo que se observa en una inspección*, no *por qué se perdió* |
| Datos reales de apiario | **2 sitios, 2 colmenas, 2 colonias, 1 inspección, 0 pérdidas** |

Esa última fila es la que manda: **no se puede deducir nada de los datos**, así
que el vocabulario sale de fuera o se lo inventa alguien.

**Decisión — cuatro partes.**

1. **`ColonyLossCause`, una fila por causa.** Varias por pérdida.
2. **`provenanceClass` obligatorio y sin valor por defecto**, acotado por el
   servicio a `hypothesis`, `conclusion` y `direct_observation`. Una causa de
   pérdida casi nunca se ve: se deduce de una caja vacía dos semanas después.
   El propio cuestionario internacional pregunta por «hambre **sospechada**» y
   «exposición tóxica **sospechada**», y el caso de Toabré que hay documentado
   es literalmente «una hipótesis en pie». `CLAUDE.md` §3 prohíbe guardar una
   inferencia como hecho; un defecto silencioso convertiría cada sospecha en
   observación.
3. **`ColonyStatus` gana `combined`.** El estándar cuenta como pérdida la
   colonia con «problema de reina irresoluble»: viva, no recuperable, se
   combina o se elimina. Sin ese valor se quedaba `active` para siempre e
   inflaba el conteo contra el compromiso de polinización con abejas que ya no
   están en esa caja. Decisión del dueño el 2026-09-09.
4. **Quince valores, ninguno inventado**, en un `VariableCatalog` que crece por
   semilla y no por migración (precedente P1, igual que A9.10). Cada valor
   lleva en su `definition` de dónde salió, y sólo hay tres procedencias
   posibles:
   - **el estándar internacional de monitoreo de pérdidas** — COLOSS y su
     versión latinoamericana de SOLATINA, **donde Panamá participa**: clasifica
     toda pérdida en problema de reina irresoluble, desastre natural, y colonia
     muerta o caja vacía, siendo esta última la que engloba ausentamiento,
     enfermedad e intoxicación;
   - **el Anexo B §2.3 del propio dueño**, del que entran las banderas que son
     causa de *pérdida* y se quedan fuera las que son señal de inspección
     —moho, alas deformadas, olor anormal, disentería, cría calva—: son dos
     preguntas distintas y conviene que sigan siéndolo;
   - **los casos que los documentos de la finca registran**: la hipótesis de
     Toabré —un frente frío de enero coincidiendo con una poda que cortó la
     floración— y el aviso de enjambrazón del Anexo B §2.2.

**Dos cosas que se decidieron al revés de lo obvio, y por qué.**

- **La certeza no va en el nombre del valor.** Se pensó en «intoxicación
  sospechada», como escribe el cuestionario internacional. Sería un error:
  dejaría sin nombre a la intoxicación confirmada y pediría dos filas para el
  mismo hecho.
- **«Robo de colmenas» sale de «desastre natural».** El estándar lo mete ahí.
  No tiene nada de natural, y lo que se hace al respecto es otra cosa.

**Lo que se probó y se descartó.** La regla del precedente
`TreatmentBatchVariableValue` (RO1 §3a) —exigir `dataQuality` cuando el valor
declara identidad desconocida— se implementó y se quitó: allí califica cuán
firme es una cepa sin nombre, y aquí sería ceremonia sobre un «no sabemos» que
ya es completo. En su lugar quedó una regla que sí impide un registro
incoherente: **«desconocido» no convive con otra causa.**

**Cómo se comprueba.** `tests/apiary/finDeColonia.test.ts`, quince casos.
**Flip-test: siete mutaciones, cada una tira la prueba que le toca, por su
nombre, y las siete compilan mutadas.**

**Y una que el flip-test destapó, que es la parte que vale.** La prueba de
«misma causa dos veces» afirmaba `toThrow(ColonyEndError)` y **pasaba con el
guardia quitado**: el `in` de Prisma deduplica, así que la comprobación de
longitud posterior salta con otro error que también es `ColonyEndError`. Era un
adorno. Ahora afirma el mensaje —`causa_repetida`—, porque «la elegiste dos
veces» y «esa causa no existe» son cosas distintas para quien rellena el
formulario.

**Qué lo reabre.** Que el dueño encuentre una causa que no está, que es lo que
él mismo anticipó: entonces es **una línea en `lib/research/catalogs.ts` y un
`db:seed`**, sin migración. Y si algún día se reporta a SOLATINA de verdad,
habrá que mapear estos quince valores a sus tres categorías — el mapeo es
posible porque cada valor dice de cuál viene.

---

## ADR-112 — La idempotencia de un UPDATE vive en la fila que actualiza, y el fin de colonia deja de tener camino en línea

**Contexto.** La cola offline del apiario (A5/A0) aceptaba dos tipos de
borrador: `inspection` y `colony_event`. El **fin de una colonia** no estaba, y
es el hecho que más se descubre en el campo — una caja que aparece vacía.
Mientras no hubiera cobertura no se podía anotar, y entre medias el conteo del
sitio seguía contando colonias que ya no existen.

**Decisión 1 — la clave de idempotencia va en `Colony.endClientDraftId`.**

Las otras dos mutaciones son inserciones: su `clientDraftId` vive en la fila
nueva, y el servidor pregunta por él antes de insertar. El fin de una colonia es
un **UPDATE**: no hay fila nueva donde colgar la clave. Se pone en `Colony`,
anulable y única.

**Por qué hace falta, y es la mitad que importa.** Sin la clave, dos situaciones
llegan al servicio como el mismo error, `colony_already_ended`:

| Lo que pasó | Qué debe informar |
|---|---|
| Mi propio envío llegó y su respuesta se perdió | `duplicate` — se descarta en silencio |
| Otra persona la dio por perdida antes | `rejected` — el operador tiene que verlo |

Confundirlas haría que alguien descartara un aviso real, o que saltara una
alarma por trabajo que sí se guardó. Con la clave, `aplicarFinDeColonia`
distingue: misma clave ⇒ duplicado; terminada con otra clave o sin ninguna ⇒
rechazo.

**Decisión 2 — el formulario deja de tener acción de servidor.**

`FinDeColoniaForm` era el único formulario de apiario que exigía red. Ahora
escribe en IndexedDB como sus hermanos, y la acción `registrarFinDeColoniaFormAction`
**se elimina**: mi propio cambio la dejó huérfana.

**Lo que eso cuesta, dicho en voz alta.** El rechazo deja de ser inmediato. Sin
permiso sobre el sitio, o si alguien llegó antes, eso ya no sale al pulsar: sale
al sincronizar, marcado en la cola. Es el mismo trato que aceptan las otras dos
pantallas de campo —la razón está escrita en `InspectionForm` desde A5: ninguna
toca la red, así que **guardar no puede fallar**— y el precio de poder anotar sin
cobertura. Para una transición de una vez el rechazo es más probable que en una
inserción, y por eso se dice aquí en vez de descubrirse en el campo.

**Un defecto que esto destapó, y que no era teórico.** La traducción del
borrador al protocolo era `kind === "inspection" ? "inspection" : "colony_event"`.
Con dos tipos funcionaba; con el tercero, **un fin de colonia habría llegado al
servidor disfrazado de evento de colonia** y se habría rechazado por un campo
que falta, no por lo que era. Ahora es un `Record<DraftKind, string>` total: un
cuarto tipo no compila hasta que alguien lo nombre.

**Cómo se comprueba.** `tests/sync/finDeColoniaSinSenal.test.ts`, cinco casos —
aplicado con su causa y la fecha declarada, mismo borrador dos veces, otro
borrador sobre una ya terminada, sin acceso, y una clase de causa inventada que
se rechaza **sin abortar el lote** (con control positivo: la mutación siguiente
sí se aplica). Más dos en `tests/apiary/offlineQueue.test.ts` sobre la
traducción.

**Flip-test: cinco mutaciones**, cada una tira la prueba que le toca por su
nombre y las cinco compilan mutadas — incluida la de volver al ternario.

**Qué queda fuera.** La pantalla no se abrió en un navegador: está detrás de
`/login`. Y nadie ha anotado todavía una pérdida real desde un teléfono en el
campo, que es la única prueba que cuenta.

## ADR-113 — La aplicación deduce su propia dirección; no se le clava

**Context.** El 2026-09-11 Daniel probó «Continuar con Google» en producción y
recibió un **404**. No era Google: producción anunciaba de sí misma

```
"callbackUrl": "https://www.nectarnomada.com/api/auth/callback/google"
```

o sea el dominio de marca, que **desde el 2026-08-28 sirve el sitio editorial**
y no tiene esa ruta (ver la trampa homónima en `CLAUDE.md`). Medido con control
positivo: esa dirección responde **404** y la misma ruta en
`nectar-nomada-package.vercel.app` responde **302**. Google autenticaba bien y
devolvía al usuario al sitio equivocado, así que **el 404 llegaba después de
Google** — la forma más ilegible posible, porque parece un fallo del proveedor.

El usuario y contraseña seguían funcionando, y eso escondió el problema durante
semanas: el formulario de credenciales se manda a la página donde uno ya está,
sin dirección absoluta. **Sólo el viaje de ida y vuelta de OAuth necesita que la
aplicación sepa nombrarse a sí misma**, y ahí es donde la dirección clavada
muerde. Nathy llevaba sin poder entrar con Google desde entonces.

**Decision 1 — no se define `AUTH_URL` ni `NEXTAUTH_URL`.** Sin ellas, Auth.js
deduce el origen de la petición. No es una preferencia de estilo: es la única
opción que existe. `next-auth/lib/env.js` dice

```js
/** If `NEXTAUTH_URL` or `AUTH_URL` is defined, override the request's URL. */
const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
if (!url) return req;
return new NextRequest(href.replace(origin, envOrigin), req);
```

Reescribe el origen de **cada** petición antes de que se lea nuestra
configuración. Ningún ajuste del código lo revierte — la variable se borra o
gana la variable. Y borrarla es seguro porque `@auth/core` ya enciende
`trustHost` solo:

```js
config.trustHost ??= !!(AUTH_URL ?? AUTH_TRUST_HOST ?? VERCEL ?? CF_PAGES ?? NODE_ENV !== "production")
```

En Vercel la variable `VERCEL` siempre está puesta; en local basta el
`NODE_ENV`. El `basePath` tampoco cambia: sin la variable, `next-auth` usa su
propio `/api/auth`, que es el que ya tienen los callbacks registrados.

**Alternatives considered.** *Apuntar la variable a la dirección buena* fue lo
primero que se propuso, y es lo que se descartó al leer la librería: deja el
mismo cepo armado para el próximo cambio de dominio, que es exactamente cómo
nació éste. *Un `trustHost: true` explícito en la configuración* no sirve —
`reqWithEnvURL` actúa antes y no consulta `trustHost`.

**Decision 2 — el guardia avisa, no corrige.** `lib/auth/direccionFijada.ts`
compara la dirección clavada con el anfitrión que sirve la petición; si
discrepan, `/login` **no pinta el botón de Google** y dice por qué. No puede
arreglar el enrutado —eso ya lo decidió la librería— pero convierte un 404
después de Google en una frase antes de salir hacia él. Calla cuando no hay
nada clavado y cuando no hay anfitrión con qué comparar: un aviso que no puede
saber si acierta enseña a ignorar avisos.

**Consequences.** Cambiar de dominio deja de requerir acordarse de una variable.
A cambio, la aplicación confía en la cabecera `x-forwarded-host` — aceptable
porque Vercel la fija y no la deja falsificar desde fuera, y porque es lo que
`trustHost` ya hacía en este despliegue. El arreglo en producción es de Daniel:
borrar la variable en Vercel y registrar el callback de `.vercel.app` en Google
Cloud Console.
---

## ADR-114 — Las irregularidades de una inspección son casillas contables, y no son el catálogo de causas de pérdida

**Contexto, y lo pide el dueño por escrito.**
`48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §2.3 dice: *«Hoy `pestDiseaseFlags` es una
cadena. Una cadena no se puede contar, y "todas las colonias con varroa esta
temporada" es exactamente el reporte que hace falta.»* Y da el vocabulario:
catorce banderas, cada una con su razón.

**Medido el 2026-09-11, antes de construir nada:** **ninguna línea de aplicación
consulta esa columna.** Sólo se escribe y se lee como prosa, así que el reporte
no se podía ni intentar. Y **0 de 1 inspecciones** tienen texto ahí, así que no
hay nada que convertir.

**Decisión — cuatro partes.**

1. **`InspectionIrregularity`, una fila por bandera.** Varias por inspección,
   par único para que la base impida contar doble.
2. **Trece valores en un `VariableCatalog`**, que crece por semilla y no por
   migración (precedente P1). **La catorceava de la lista del Anexo no es un
   valor**: «Otro | texto, siempre disponible» es `pestDiseaseFlags`, que se
   queda exactamente para eso, con su papel recortado a lo que el catálogo no
   cubre — mismo reparto que `Colony.originNote` junto a
   `originSourceValueId`.
3. **Viajan por la cola offline**, en la mutación `inspection`. Una inspección
   con hallazgo se anota en el campo; dejarlas fuera habría hecho que sólo se
   pudieran marcar con cobertura, que es el hueco que esa cola existe para
   cerrar.
4. **`coloniasPorIrregularidad`**, que es el motivo del cambio y no un extra: un
   catálogo sin nadie que lo consulte es la misma cadena con más pasos.

**Por qué NO reutiliza el catálogo de causas de pérdida (`ADR-111`).** Porque son
dos preguntas distintas, y aquél ya lo dejó escrito: **lo que se observa en una
inspección no es lo que mató a la colonia.** Varroa vista en marzo en una colonia
viva en diciembre es un dato de manejo. Los vocabularios se solapan y no
coinciden: moho, alas deformadas, olor anormal y disentería son señales de
inspección y **no** son causas de pérdida; enjambrazón, escasez de floración y
problema de reina irresoluble son causas y **no** son banderas de inspección.

**Dos decisiones del reporte que no son obvias.**

- **Cuenta colonias distintas, no inspecciones.** Tres visitas a la misma caja
  con varroa son un problema, no tres. Se devuelven las dos cifras porque las dos
  sirven, pero la que el Anexo pide es la primera.
- **Devuelve las trece filas, también las que valen cero.** Un reporte que sólo
  enseña lo encontrado no distingue «no hay loque» de «nadie miró loque», y ésa
  es justo la diferencia que hay que poder ver.

**Cómo se comprueba.** `tests/apiary/irregularidades.test.ts`, nueve casos, tres
de ellos con control positivo: la bandera ajena al catálogo se rechaza **y** la
del catálogo entra; la ventana de temporada recorta **y** la ventana que sí la
contiene la encuentra; el sitio ajeno da cero **y** el propio da uno. Más el
viaje por la cola, que es la mitad que importa en el campo.

**Un límite del instrumento que esto destapó, y queda escrito en
`PENDING_IMPLEMENTATIONS/007`:** el detector del inventario de acceso decide si
una operación «recibe principal» con una coincidencia de texto sobre el cuerpo
troceado, **comentarios incluidos**. Una función sin un solo argumento quedó
clasificada como «recibe principal» porque un comentario vecino decía *«No recibe
`userAccountId`»*. Reproducido quitando esa palabra: la clase cambia. El arreglo
a mano es indistinguible de escribir prosa para complacer a un regex — aquí dio
la clasificación correcta, y el día que texto y código discrepen el detector
creerá al texto.

**Qué queda fuera.** El reporte **no tiene pantalla todavía**: existe, está
probado, y nadie lo ha visto dibujado. Y las casillas no se han pulsado en un
navegador — la pantalla está detrás de `/login`.

---

## ADR-115 — La carencia de un tratamiento se registra, y una cosecha dentro de ella se marca en vez de impedirse

**Contexto.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §4 marca «Período de
carencia» como **obligatorio** y como **no existente**, con la consecuencia
escrita: *«decide cuándo se puede cosechar. Sin él, una cosecha puede violar la
carencia sin que el sistema lo sepa.»*

Y `lib/apiary/bitacora.ts` ya lo afirmaba desde A9.12, en su propia regla
inmediata: *«Se aplicó un producto. Tiene periodo de carencia y afecta a la miel
que salga de esa colmena, así que quien coseche necesita saberlo sin
buscarlo.»* **El aviso existía; el dato no.**

**La contradicción que había que resolver, y es del propio Anexo.** §5 dice, en
una sola celda: `| Carencia vigente | derivado | … | **bloqueo**: si hay
tratamiento con carencia activa, la cosecha avisa |`. «Bloqueo» y «avisa» son dos
comportamientos distintos.

**Decisión del dueño, 2026-09-11: avisa y registra igual**, con los días que
faltaban guardados en la fila. La razón: **si la miel ya se extrajo, impedir el
registro no la devuelve al panal** — deja el hecho sin rastro, que para
trazabilidad es peor que un registro marcado.

**Qué entra.**

1. **`ColonyEvent.treatmentWithdrawalDays`** — días, no fecha de fin. Lo que trae
   la etiqueta del producto son los días; la fecha se deriva de `occurredAt +
   días`, y guardarla además sería un segundo sitio que puede discrepar del
   primero. Anulable en la base —la tabla sirve a tres tipos de evento y una
   alimentación no tiene carencia— y **obligatorio en el servicio cuando
   `eventType = treatment`**, donde ya vive la exigencia de
   `treatmentBatchLabel`.
2. **`ApiaryHarvestEvent.withinWithdrawalDays`** — los días que faltaban, o
   `null` si no había carencia. **Columna y no sólo aviso**: un aviso se lee una
   vez, y esto tiene que poder consultarse el día que aparezca un residuo en un
   análisis. Mismo razonamiento que `ADR-114`.
3. **`lib/apiary/carencia.ts`** — el lector derivado.

**Cuatro decisiones pequeñas que no son obvias.**

- **Cero es una respuesta legítima.** Hay productos sin carencia. La comprobación
  es `== null`, no `!valor`: un `!input.treatmentWithdrawalDays` habría rechazado
  el cero y obligado a mentir poniendo un 1.
- **Los días que faltan se redondean hacia arriba.** Medio día de carencia sigue
  siendo carencia, y un `Math.floor` daría cero en las últimas horas — que es
  justo cuando alguien va a cosechar creyendo que ya puede.
- **La marca es la carencia MÁS LARGA, no la suma.** Corren en paralelo; sumarlas
  inventaría una espera que ningún producto exige.
- **La carencia se pregunta en la FECHA DE LA COSECHA, no en la de hoy.** Una
  cosecha se registra días después, y preguntar por «ahora» marcaría o dejaría
  pasar la fila equivocada.

**Lo que esto rompe a propósito.** El campo es obligatorio, así que **todo
tratamiento registrado sin carencia se rechaza desde ahora**. Medido: rompió
cinco llamadas en cuatro archivos de prueba, todas actualizadas; y el formulario
de evento rápido y la cola offline llevan el campo. No hubo nada que
retroadaptar — **0 tratamientos y 0 cosechas** existían al construirlo.

**Cómo se comprueba.** `tests/apiary/carencia.test.ts`, diez casos, tres con
control positivo.

**Y lo que estas pruebas NO son, dicho para que nadie lo cuente dos veces:** son
una **red para el día que lleguen los datos**, no un guardia sobre datos que
existan. Sus fixtures crean el tratamiento y la cosecha, así que la
transformación sí se ejercita — pero nadie ha tratado ni cosechado de verdad
todavía.

**Qué queda fuera.** El aviso **no se ha visto en pantalla**: el servicio
devuelve las carencias con su producto, y quien las pinte es otro cambio. Y los
otros tres campos que §4 pide siguen sin existir: objetivo, vía y fecha de
retiro.

---

## ADR-116 — El conteo de varroa es una fila propia que puede apuntar a un tratamiento, y el porcentaje no se guarda

**Contexto.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §2.5 pide cuatro campos
—método, abejas de muestra, ácaros contados, infestación derivada— y marca los
cuatro como **no existentes**. El Anexo C §2.1 nombra la serie que sin ellos no
se puede dibujar: *«Infestación de varroa | por conteo | umbral de tratamiento y
si el tratamiento sirvió»*.

**Tres decisiones, y ninguna es de gusto.**

**1. Fila propia, no `Measurement`.** El propio A9 dice *«`Measurement` guarda
una variable por fila»*, y un conteo son dos números que sólo significan algo
juntos: 9 ácaros no dice nada sin las 300 abejas. Repartirlos en dos filas haría
posible tener el numerador sin el denominador, que es el estado que
`infestacionPorCiento` rechaza.

**2. El tratamiento que se evalúa es una relación OPCIONAL.** El informe del A9
lo plantea así: *«Es un conteo de varroa posterior ligado al tratamiento anterior
— o sea, una relación entre dos visitas, no un campo.»* Opcional porque contar
**para decidir** si se trata es el caso normal; cuando viene, el servicio exige
que sea un evento de tipo `treatment` **y de la misma colonia**. Sin esa segunda
comprobación se podría atribuir la eficacia de una caja a otra, que es peor que
no medirla.

**3. El porcentaje no se guarda en ninguna columna.** El Anexo lo marca
«derivado». Guardarlo sería un segundo sitio para el mismo número, y el día que
alguien corrigiera el conteo sin recalcularlo, los dos discreparían en silencio.
Se calcula al leer, en `lib/apiary/infestacion.ts`, y **con muestra cero lanza en
vez de devolver cero**: devolver cero afirmaría «no hay infestación», que es lo
contrario de «no se sabe».

**Lo que esto NO prueba todavía.** Medido el 2026-09-11: **nadie ha contado
varroa en esta plataforma**. Las pruebas construyen los conteos, así que la
aritmética y las reglas sí se ejercitan, pero ningún dato real las ha pasado —
está escrito en la cabecera de `tests/apiary/varroa.test.ts` para que nadie lo
cuente dos veces.

**Y un defecto propio que este trabajo destapó, porque tocaba el mismo sitio.**
A9.5 (ADR-112) dio camino sin señal al fin de colonia: la cola lo encola, el
servicio lo aplica, y `tests/sync/finDeColoniaSinSenal.test.ts` lo comprueba. El
**parseo de la ruta HTTP no reconocía ese `kind`**: caía al camino de
`FieldEvent`, que exige `fieldSessionId`, y devolvía **400 del lote entero**. El
cliente trata un 4xx de lote como fallo de transporte —y hace bien, porque no
puede distinguirlo de «no llegué»— así que dejaba todo en cola: **un solo
borrador de fin de colonia bloqueaba la cola del apiario indefinidamente**, él y
todo lo que tuviera detrás.

Ninguna prueba podía verlo, y no por descuido: importar
`app/api/v1/sync/field-events/route.ts` arrastra `next-auth`, que vitest no
resuelve. La pieza que decide qué tipos existen **no se podía llamar**. Es la
regla de `CLAUDE.md` al pie de la letra —*«el guardia es el que llama a la
función con la entrada hostil, lo que suele obligar a exportarla; si eso
incomoda, la incomodidad es el aviso»*—, así que el parseo salió a
`lib/sync/parsearMutaciones.ts` y `tests/sync/parseoDelLote.test.ts` lo vigila
con la lista de tipos **tomada del cliente**, no escrita a mano: un quinto tipo
sin rama en el parseo hace caer esa prueba por su nombre.

---

## ADR-117 — El nivel de una reserva y el sitio donde está son dos columnas, y una inspección que no miró no apaga un aviso

**Contexto.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §2.2 —«Estado de la colonia,
nuevo, por protocolo»— son **siete campos con su motivo al lado y ninguno
existía**. El que el dueño subraya trae el caso real: *«Celdas reales → **aviso de
enjambrazón antes de perder la colonia.** Directamente relevante al ausentamiento
de Toabré»*.

**El vocabulario no se inventó.** Sale de `protocolos/apiario-campo-v1.json`, que
el dueño escribió: `population` (baja/normal/apiñada), `brood_stages`
(huevo/larva/operculada/pupa), `queen_cells`
(no_hay/emergencia/enjambrazon/reemplazo), `frames_covered`, `queen_cells_count`.
Ese archivo **no se editó**: su propia cabecera lo prohíbe —*«cambiar esto después
no es editar aquí: es crear una versión 2»*— y la v2 que hace falta queda anotada
en `PENDING_IMPLEMENTATIONS/010`.

**Decisión 1 — el nivel y el sitio se separan, y la decidió el dueño.** El Anexo
escribe las reservas como «alta, media, baja, junto a la cría». Las tres primeras
son una cantidad; la cuarta es un **sitio**. En una sola lista: no se puede decir
«alta y junto a la cría», y el reporte «colonias con reservas bajas» tiene que
decidir si esa cuarta opción cuenta. Se le preguntó el 2026-09-12 y eligió **nivel
de tres valores más casilla de sitio**, pagando el coste que él mismo ve: dos
controles por reserva en el teléfono en vez de uno.

**Decisión 2 — `brood_stages` es una lista escalar, no una tabla puente.** Las
irregularidades (ADR-114) sí llevan tabla y catálogo, porque su lista **crece por
semilla** (precedente P1). Las etapas de cría no crecen: las cierra la biología.
Un `BroodStage[]` evita una tabla y una FK que nunca cambiarían, y se consulta con
`has`. Es el segundo array escalar del esquema; el primero es
`VariableCatalog.enumValues`.

**Decisión 3 — `storesLevel` no se borra.** Lo reemplazan cuatro columnas, y
medido el 2026-09-12 la copia local tiene **1 inspección y ni un valor ahí**. Pero
esa copia viene de un respaldo semanal y **producción no se mide sin tocarla**, así
que se deja: borrar una columna es el único movimiento que una migración no puede
deshacer. El formulario deja de escribirla y su comentario dice qué la reemplazó.

**Decisión 4 — la que decide si el aviso sirve: una inspección que NO miró no lo
apaga.** `avisosDeEnjambrazon` toma, por colonia, **la última inspección que
registró celdas** —`queen_cell_kind` no nulo—, no la última inspección. Una visita
posterior que pasó rápido y no abrió la caja deja `null`, y tratar eso como «ya no
hay» convertiría una ausencia en una afirmación (ADR-080) **apagando el aviso justo
en el caso que pierde la colonia**. Para apagarlo hay que mirar y decir `no_hay`,
que por eso es un valor del enum y no la ausencia de valor. Y `reemplazo` **no
avisa**: una colonia que cambia de reina por su cuenta no se está yendo, y meterla
ahí enseñaría a ignorar la sección.

**Un defecto propio que esto destapó, y era invisible para su propio guardia.**
`tests/arquitectura/booleanos-de-tres-estados.test.ts` prohíbe preguntar un
`Boolean?` con una casilla, porque sin marcar guarda `false` —«miré y no estaba»—
cuando lo cierto es «nadie miró». Buscaba `name="<campo>"`, que es como se ata un
formulario de servidor. **Los formularios de campo guardan en IndexedDB y se atan
con `checked={campo}`**, así que el guardia no los veía — y `queenSighted` en
`InspectionForm.tsx` tenía el defecto exacto que ese archivo describe. Medido: era
el **único** caso. Hoy es un desplegable de tres opciones y el guardia mira las dos
formas, con control positivo de que reconoce la mala y no marca la buena.

**Lo que esto NO prueba.** Nadie ha registrado un estado de colonia todavía: 1
inspección en la copia local, con las diez columnas vacías. Las pruebas crean los
datos, así que las reglas se ejercitan, pero ningún dato real ha pasado por aquí —
escrito en la cabecera de `tests/apiary/estadoDeColonia.test.ts` para que nadie lo
cuente dos veces.

---

## ADR-118 — «Alcanza hasta» no se exige en el servicio; su ausencia se enseña, y el aviso es por colonia

**Contexto.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §3 marca «Alcanza hasta» como
**obligatorio** y lo subraya con el caso real: *«**el campo que faltó en Toabré.**
El alimento del 22 de julio cubría seis semanas: vencía cerca del 2 de septiembre,
el día en que se encontró todo vacío. Con este campo, el aviso llega antes y no
después»*.

**Lo primero que hubo que medir es que el campo ya existía.** `coverage_until`
entró con `20260907214500_a9_vitales_del_sitio` y `vitalesDeSitios` ya lo leía. Lo
que faltaba no era esquema: medido el 2026-09-13, **1 alimentación en la copia
local y ninguna con ese valor**, porque **ninguna pantalla podía escribirlo**. Una
columna que nada rellena es una puerta sin manija, y el Anexo decía «Hoy: no»
porque desde fuera se ve igual que si no existiera.

**Decisión 1 — el servicio sigue sin exigirla, y la razón previa se mantiene.**
`recordColonyEvent` lo dejó escrito cuando se añadió la columna: las alimentaciones
de urgencia se registran sin saber hasta cuándo alcanzan, y la obligatoriedad vive
en el protocolo A9.4, donde el dueño la cambia sin tocar código. Exigirla en el
servicio convertiría un dato incompleto en **ningún dato**, que es el mismo error
que ADR-115 rechazó para la carencia: *«impedir el registro no devuelve la miel al
panal»*.

**Decisión 2 — y por eso la ausencia tiene que VERSE.** `alcanceDelAlimento`
devuelve cuatro estados y `sin_fecha` es uno de ellos: una alimentación sin plazo
no es una colonia tranquila, es una **de la que no se puede avisar**. Contarla entre
las cubiertas la volvería invisible, que es literalmente lo que pasó en Toabré —
nadie sabía que el alimento vencía el 2 de septiembre—. El formulario sí la exige
para guardar, porque ahí exigirla no cuesta un dato: quien está delante puede
ponerla.

**Decisión 3 — el aviso es por COLONIA, no por sitio.** `vitalesDeSitios` ya
resumía por sitio tomando el `coverage_until` más largo. Eso responde «¿hay algo
cubierto en Toabré?» y no responde «¿a qué caja hay que ir?»: una colmena
alimentada en julio y olvidada queda **tapada** por otra alimentada en agosto, que
es la forma exacta del fallo. Y manda la **última** alimentación de cada colonia, no
la de plazo más largo: volver a alimentar corrige el plazo anterior.

**Decisión 4 — el día del vencimiento todavía cubre.** `coverage_until` es un campo
de **día** a medianoche UTC, así que «alcanza hasta el 2 de septiembre» significa
que el 2 hay alimento. Compararlo con `<` lo daría por vencido a las 00:01 de ese
día, un día antes de lo que dijo quien alimentó — y un aviso que se adelanta
mintiendo enseña a ignorarlo. Por lo mismo, el parseo del lote lo convierte con
`fechaDeDia` y **falla** si no es un día válido, en vez de dejar que `new Date()`
adivine: es el fallo que tumbó la creación de colmenas el 2026-09-11.

**Lo que queda fuera, con su nombre.** Una colonia que **nunca** se alimentó no
sale en el aviso —no todas necesitan alimento— y una **terminada** tampoco: avisar
de que hay que alimentar una caja que se dio por muerta es ruido, y el ruido es cómo
se aprende a no mirar una sección.

**Lo que esto NO prueba.** Nadie ha registrado un «alcanza hasta» todavía. Las
pruebas crean las alimentaciones, así que las reglas se ejercitan; ningún dato real
ha pasado por aquí.

---

## ADR-119 — «Objetivo» es obligatorio y tiene enum propio; «Fecha de retiro» se queda fuera porque no hay dónde escribirla

**Contexto.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §4 marca «Objetivo» como
**obligatorio** —el último campo de esa columna que seguía sin existir en todo el
Anexo B— con su consecuencia escrita: *«eficacia por objetivo; hoy no se puede
agrupar»*. Sin él, «qué se trató contra varroa esta temporada» no es una consulta,
igual que antes de ADR-114 no lo era «todas las colonias con varroa».

**Decisión 1 — obligatorio en el servicio, como el lote y la carencia.** Un
tratamiento sin objetivo se rechaza. La razón es que **nadie va a volver a
preguntarle al que aplicó**: una fila sin objetivo deja la pregunta sin responder
para siempre, y a diferencia de «alcanza hasta» (ADR-118) aquí no hay un caso de
urgencia en que el dato sea desconocido — quien aplica un producto sabe contra qué
lo aplica. Medido antes de exigirlo: **0 tratamientos en la copia local**, así que
ninguna fila existente queda en falso; y **14 pruebas en 8 archivos cayeron** al
exigirlo, que es la prueba de que la exigencia muerde en vez de adornar.

**Decisión 2 — enum propio, no el catálogo de irregularidades**, aunque cuatro
valores se llamen igual (varroa, polilla, escarabajo, hormigas). Es la misma
distinción que ADR-114 hizo entre lo observado y las causas de pérdida: **lo que se
observa no es lo que se trata**. De los trece valores de irregularidad, nueve —moho,
loque, alas deformadas, obrera ponedora, disentería…— no son algo contra lo que se
aplique un producto. El conjunto de cinco lo cerró el dueño en su protocolo.

**Decisión 3 — «Fecha de retiro» y «Eficacia observada» NO entran, y se dice por
qué.** Las dos son de etapa **cierre**: se anotan semanas después, cuando se vuelve
al sitio. Medido el 2026-09-13: **no existe ningún camino para completar o corregir
un `ColonyEvent`** —`lib/apiary/` no tiene una sola función de actualización—. Añadir
la columna igual sería repetir exactamente lo que costó una semana con
`coverage_until`: una columna con comentario, con lectura, y **sin ninguna pantalla
que pudiera escribirla**, que se ve igual que no existir y además se cuenta como
hecha. Queda en `PENDING_IMPLEMENTATIONS/011` con el hueco medido.

De «Eficacia observada» conviene decir que **ya está casi cerrada por otro sitio**:
ADR-116 le dio el mecanismo con `VarroaCount.evaluatesColonyEventId` —*«tratar,
volver a contar, comparar»*— y lo que falta es la nota en prosa, que es lo de menos.

**Una pregunta que queda para el dueño, sin resolverla por deducción.**
`VIAS_QUE_DEJAN_MATERIAL` contiene hoy **sólo `tira`**, porque es lo único que el
Anexo nombra: *«las tiras que no se retiran generan resistencia»*. `cebo` también
deja material en el sitio, pero añadirlo sería deducir una regla sanitaria que él no
escribió. La lista existe ya para que el aviso de «no retirado» salga de un solo
lugar cuando exista el camino de cierre.

---

## ADR-120 — La deriva entre esquema y migraciones se cierra declarando lo que la base ya hace, no ejecutando el diff

**Contexto.** `prisma migrate diff --from-migrations --to-schema` proponía sentencias
que **no eran de ningún cambio en curso**: cinco claves ajenas con otra acción de
borrado y cinco índices que el esquema no declaraba. Eran **seis líneas** el
2026-09-12 y **quince** el 2026-09-13, porque cada tabla nueva sumaba las suyas.
Cada migración escrita a mano las excluía y lo decía en su prosa, lo cual funciona
**exactamente hasta el día en que alguien no se dé cuenta**.

**La dirección es la decisión, y es lo único que importa aquí.** Medido, tabla por
tabla, en la migración **y** en la base:

| Clave ajena | La migración creó | El esquema pedía |
|---|---|---|
| `harvest_event` × 3 (color, defectos, limpieza de cereza) | `RESTRICT` | `SET NULL` (defecto de Prisma) |
| `lot_process.process_recipe_version_id` | `RESTRICT` | `SET NULL` |
| `lot_process.closing_moisture_measurement_id` | `RESTRICT` | `SET NULL` |
| `drying_run.lot_process_id` | `SET NULL` | `SET NULL` ✔ |
| `fermentation_run.lot_process_id` | `SET NULL` | `SET NULL` ✔ |

El esquema no pedía `SET NULL` porque nadie lo eligiera: **lo heredaba del defecto de
Prisma para relaciones opcionales al no decir nada**. Ejecutar el diff habría cambiado
producción de «no puedes borrar este valor de catálogo» a «se borra y te vacío en
silencio el color de cereza que alguien observó» — que es lo que
`CLAUDE.md` §3 prohíbe con nombre: *no silenciar mutaciones de registros
científicos*, y *la evidencia original sigue siendo la autoridad*.

**Decisión: se declara en el esquema lo que la base ya hace.** Cinco relaciones
ganan `onDelete: Restrict` donde la base lo tiene, dos se dejan como estaban porque
ya coincidían, y los cinco índices se declaran con `@@index`. **Cero sentencias SQL,
cero migraciones, cero filas tocadas.** La medición: 15 → 8 → **0**, y
`--from-migrations --to-schema --exit-code` devuelve 0 con «No difference detected».

**Y un guardia, porque si no vuelve.** `tests/derivaDeMigraciones.test.ts` corre ese
mismo `migrate diff` y falla si propone algo, con **control positivo dentro**: un
esquema al que se le quita un índice tiene que dar código 2. Distingue los tres
valores de `--exit-code` —0 vacío, 2 diferencia, **1 error**— porque sin esa
distinción un comando que revienta se lee igual que «no hay deriva». Pasó dos veces
mientras se escribía esto: `--from-url` ya no existe en Prisma 7, y en otra corrida
faltaba exportar `SHADOW_DATABASE_URL`; las dos veces el error estaba escondido en un
`2>/dev/null` y el cero era mentira. `scripts/ci-con-base.sh` deriva ahora la base de
sombra de `DATABASE_URL` para que el guardia pueda medir en CI.

---

## ADR-121 — Completar no es corregir: el cierre de un tratamiento no pide razón, cambiarlo sí

**Contexto.** `PENDING_IMPLEMENTATIONS/011`: medido el 2026-09-13, `lib/apiary/` **no
tenía una sola función de actualización**. Un `ColonyEvent` se escribía una vez y no
había forma auditada de completarlo, así que los dos campos de etapa **cierre** del
Anexo B §4 —«fecha de retiro» y «eficacia observada»— no se podían añadir sin crear
columnas que nadie pudiera rellenar. Eso ya costó una semana con `coverage_until`
(ADR-118) y no se repite.

**La decisión, y es toda la de este ADR: completar y corregir son cosas distintas.**

- **Completar** es escribir por primera vez un hecho que *siempre* iba a llegar
  después. Las tiras se retiran semanas después de ponerlas: eso no es una
  corrección, no hay nada que enmendar, y **no lleva razón ni plazo**. Pedirlos
  convertiría el curso normal del trabajo en una excepción que hay que justificar — y
  el resultado previsible es que alguien escriba «.» en el campo de la razón.
- **Corregir** es cambiar algo ya escrito. Ahí la razón es **obligatoria**, el valor
  anterior queda en `before` del `AuditEvent`, y la operación se llama distinto:
  `colony_event.correct` frente a `colony_event.close`. Quien lea el rastro necesita
  distinguir «se completó lo que faltaba» de «se cambió lo que había».

Se decide **campo por campo**: completar el retiro y a la vez cambiar la nota es una
corrección y pide razón, en vez de dejar que el primero que se mire decida.

**`sourceInterface = "apiary.close"`.** Es el vocabulario que `completarVisita` ya
estableció en trazabilidad, y su razón vale igual aquí: con `"apiary.service"` para lo
capturado y `"apiary.close"` para lo completado, **«se anotó en el campo» y «se
completó en la casa» se distinguen leyendo la fila**. Y de ahí una consecuencia de
diseño que conviene decir en voz alta: **es la única escritura del apiario que NO pasa
por la cola offline**, y no por una limitación técnica — se hace con el cuaderno
delante y señal, así que un borrador local pagaría complejidad sin comprar nada.

**Lo que NO deja tocar, y por qué.** Sólo los dos campos de cierre. El producto, el
lote, la dosis, la carencia y el objetivo se capturaron con la caja abierta: si
estuvieran mal, lo que corresponde es un evento nuevo con su razón, **no reescribir la
evidencia de lo que se hizo aquel día**. `CLAUDE.md` §49 lo tiene en su lista de cosas
que no se hacen.

**El aviso que esto desbloquea.** `retirosPendientes` contesta *«las tiras que no se
retiran generan resistencia»* con tres reglas medidas: sólo las vías que **dejan
material** —hoy `tira`, lo único que el Anexo nombra—; una vía **sin registrar no
entra**, porque `null` significa que nadie dijo cómo se aplicó y no que fuera una tira
(ADR-080); y espera a que pase **la carencia declarada**, no una ventana inventada,
porque avisar antes de tiempo enseña a ignorar la sección.

**Y `leerEnmiendas` no hubo que tocarlo.** Lee el rastro de cualquier entidad por
`entityType`, y el audit del apiario ya escribía `"colony_event"`. La consecuencia de
haber respetado ese vocabulario meses antes es que el historial de un tratamiento
existió el mismo día que su cierre.

---

## ADR-122 — La configuración de la caja vive en la colmena, y es lo que hace comparable a «cuadros cubiertos»

**Contexto.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §2.4 son seis filas de
configuración —cámaras y alzas, cuadros por caja, excluidor, alimentador, reductor de
piquera, piso sanitario— y **ninguna existía**.

**Por qué esta rebanada antes que las otras dos que quedaban del Anexo.** No por
orden: `framesPerBox` es el **denominador** de `beeCoveredFrames`, que se construyó en
ADR-117 hace un día. El Anexo pide ese campo porque es *«la medida cuantitativa de
fuerza, comparable entre visitas y entre sitios»* — y **no lo era**: ocho cuadros
cubiertos dicen una cosa en una caja de ocho y otra en una de diez. Terminar lo que
quedó a medias vale más que añadir campos nuevos al lado.

**Decisión 1 — viven en la colmena, y lo decide el dueño.** Sus palabras: *«Cambia poco
entre visitas, así que se guarda en la colmena y en la inspección sólo se registra la
diferencia. Preguntarlo cada vez es coste sin información.»* La fila guarda la
configuración **actual**; el historial vive en `AuditEvent` con su `before`/`after`.

**Decisión 2 — cambiar la caja NO es corregir, así que no pide razón.** Es la
distinción de ADR-121 aplicada al caso contrario: allí completar un hecho posterior no
pedía razón y cambiar lo escrito sí. Aquí **añadir un alza es un hecho del mundo** y el
cambio **es** el evento, así que exigir una razón para el curso normal del trabajo
enseñaría a escribir «.». La razón es opcional y se guarda cuando viene.

**Y el límite de eso, dicho en voz alta:** el rastro **no puede** distinguir por su
cuenta «le puse un alza» de «me equivoqué al teclear». La razón opcional es cómo se
dice cuál de las dos fue; sin ella, las dos se ven igual. Es un coste aceptado a
cambio de no convertir el trabajo normal en una excepción justificada.

**Decisión 3 — `feederType` reusa el enum `FeedingMethod`.** Son las mismas cosas
físicas —en Toabré, «bolsa sobre los cabezales»— y dos enums idénticos serían dos
sitios donde añadir el siguiente alimentador. Lo que cambia es el sujeto: aquí es lo
que la caja **lleva**, en §3 es cómo se dejó **una** alimentación. Es el caso opuesto a
ADR-114 y ADR-119, donde las listas se separaron porque los **significados** diferían;
aquí coinciden.

**Decisión 4 — sin denominador, la ocupación es `null` y se dice.** `fuerzaDeColonia`
devuelve `null` cuando la caja no está declarada, y la pantalla escribe *«sin cuadros
por caja no es comparable»*. Devolver 0 sería falso; **suponer diez cuadros por caja
sería peor**, porque haría comparables cosas que no lo son y nadie vería la suposición.
Y no se recorta al 100 %: doce cuadros cubiertos en una caja de diez pasa de verdad
—abeja en el alza sin cuadros propios— y recortarlo esconde justo la caja que hay que
dividir.

**El hueco que cerró de paso.** `lib/apiary/` no tenía **ninguna** función para
actualizar una colmena, igual que hasta ayer no la tenía para un evento (ADR-121). Aquí
no era un accidente del diseño: la configuración **cambia por definición**, así que el
camino de actualización es parte del campo y no un añadido.

**Y el historial no hubo que construirlo**, por segunda vez en dos días:
`leerEnmiendas` lee cualquier entidad por `entityType`, y basta escribir `"hive"`.

---

## ADR-123 — La humedad de la miel no era «parcial»: ya funcionaba y nadie la encontraba

**Contexto.** §5 del Anexo B era la última fila sin construir. Pedía dos cosas: «Tipo de
miel», marcada **no existe**, y «Humedad», marcada **parcial**.

**La medición que cambió la rebanada.** «Parcial» no describía un mecanismo a medias.
Medido el 2026-09-14:

- `Measurement` ya admite `lotId`, y una cosecha de apiario **crea** un `Lot`;
- `PANEL_DEL_SUJETO` en `lib/traceability/measurements.ts` **no restringe `lotId`**, así
  que una lectura de `moisture` sobre un lote de miel se acepta;
- `LotType` ya tiene `honey`, y su comentario dice que **A3 decidió que la miel reusa la
  maquinaria del lote sin modificarla**.

O sea: **la humedad se podía registrar desde antes de esta rebanada**, y lo prueba
`tests/apiary/cierreDeCosecha.test.ts` llamando a `recordMeasurement` sin que nada de
este cambio participe. Lo que faltaba era **encontrarla**: no había forma de verla junto
a la cosecha, y un número que nadie ve no decide nada — la humedad decide si la miel
fermenta.

**Es la tercera vez esta semana con la misma forma.** `coverage_until` existía y ninguna
pantalla lo escribía (ADR-118); `frames_covered` existía y no era comparable (ADR-122);
la humedad existe y no se ve. **Un mecanismo al que nadie llega se ve igual que uno que
no existe** — y peor: en el Anexo se marca «parcial» y se lee como trabajo pendiente de
esquema, que es la conclusión equivocada.

**Decisión 1 — NO se añade columna de humedad.** Sería un segundo sitio para el mismo
dato, sin instrumento, sin método y sin quién lo midió. Lo que se añade es un lector,
`humedadDeLaMiel`, y una lista de cosechas que lo enseña.

**Decisión 2 — `honeyType` sí es columna, porque es una clasificación y no una lectura.**
Y `monofloral_declarada` dice **«declarada»** porque así lo escribió el dueño: es una
afirmación de quien cosechó, no un resultado de laboratorio. Verificarla es un análisis
de polen —una `Sample` con su `Measurement`— y **no un cambio en esta columna**: guardar
la declaración y la verificación en el mismo campo las haría indistinguibles, que es lo
que `CLAUDE.md` §3 separa con nombre.

**Decisión 3 — el cierre sigue la regla de ADR-121.** Completar el tipo o el peso no
lleva razón; cambiarlos sí, con el valor anterior en `before` y la operación
`apiary_harvest.correct` frente a `.close`. Y cero kilos extraídos **es un dato**: se
abrió la caja y no había miel.

**Y un hueco que había que cerrar para que nada de esto se viera:** `lib/apiary/harvest.ts`
sólo sabía **escribir**. La pantalla de la colmena tenía formulario de cosecha y **no
listaba ninguna cosecha**, así que ni el tipo, ni el peso, ni la humedad tenían dónde
mostrarse — ni dónde cerrarse. `cosechasDeColonia` es esa lista.

## ADR-124 — Entra el Anexo E (pantallas y formularios); y por primera vez el hueco es de esquema, no de pantalla

**Contexto.** El dueño entregó `pantallas-captura-apicola.md` el 2026-09-13, sin
instrucción. Queda como `docs/implementation/48_A9_ANEXO_E_PANTALLAS_Y_FORMULARIOS.md`,
quinto de la serie A–D, copia byte a byte. Define qué ve y qué llena el operador a 390 px.

**Decisión 1 — se acepta como insumo de planificación, no como orden de construcción.**
Nada se implementa con su entrada. La secuencia la decide el dueño.

**Decisión 2 — se registran dos referencias que no existen.** Se declara «tercera pieza
del paquete, junto al brief del módulo y al plan de renumeración», y ninguna de las dos
está en el repositorio ni en `~/Downloads` (buscado `renumerac|secuencia de tickets|brief
del m` en `docs/`; control positivo: «ANEXO B» sí encuentra cinco archivos). Importa
porque su nota de modelo **delega en una de ellas**: «Manda la secuencia de tickets». Sin
ese documento, el orden de trabajo no tiene fuente autoritativa.

**Lo que el cruce contra el código destapó, y va aquí porque cambia lo que hay que
construir:**

| lo que el documento dice | lo que está medido |
|---|---|
| §2 «Orden por urgencia, no alfabético» | **ya existe**: `pesoDeAlerta` ordena `app/apiaries/page.tsx:50` |
| §5 «nada la persigue» (jornada sin cerrar) | **falso a las 72 h**: `visita_sin_cerrar` en `alertasDe`, con su cadena, pintada en `app/apiaries/page.tsx:131` |
| §5 «si lleva más de un día abierta» | el umbral real es `HORAS_DE_BORRADOR_VIEJO = 72`, no 24 |
| §6 «Elimina "— elegir —"» | **2 apariciones**, y viven en `messages/es.json`, no en los componentes |
| §6 «un solo término para el vacío» | **siete** en el módulo apícola: `Sin registrar`, `Sin registro`, `Elegir método…`, `Elegir objetivo…`, `Elegir…`, `—`, `— Ninguno —` |
| §6 «sácalo de las listas desplegables» | `Sin registrar` es `<option value="">` **13 veces** |
| §6 «los textos hablan de fósforo Bray contra Mehlich» | **no en apiario**: la única clave con Bray/Mehlich es `sampleExtractionHelp`, del namespace `Traceability`, pintada por `SampleForms.tsx`. El namespace `Apiary` tiene **10 textos de ayuda propios** y **0** con palabra de suelo o fósforo. Falta confirmar qué pantalla vio |
| §6 «los textos de ayuda van colapsados» | **cierto y sin hacer**: `<details>` en formularios de apiario = **0** |
| §8 traslado de colmenas | **no hay dónde**: `Hive.locationId` es un FK escalar, sin modelo de vigencia |
| §9 emplazamiento temporal | **parcial de verdad**: `PollinationCommitment` ya trae cliente, hectáreas, meta min/max, contrato, `startsAt`/`endsAt`; faltan cultivo/parcela, ventana de floración y las dos alertas |
| §4 y §8 consulta a fincas vecinas / aspersiones previstas | **no existe** (control positivo: `carencia|Withdrawal` da 10 en el esquema) |

**Decisión 3 — §6 es retroalimentación contra un patrón que introduje esta semana, y se
acepta.** Las últimas cuatro rebanadas **añadieron** opciones de vacío a los desplegables
—`triNoRegistrado`, `treatmentTargetUnset`, `colonyEndStatusUnset`, `varroaMethodUnset`—
cada una con su propia palabra. El dueño tiene razón en las dos mitades: son siete
términos para un concepto, y «sin registrar» es un **estado resultante**, no algo que
alguien elige. Lo que la distinción de tres estados necesitaba era que «no se miró» y «se
miró y no había» no se confundan (ADR-080); eso se puede sostener con un solo término y
sin ofrecerlo como opción elegible.

**Decisión 4 — §8 invierte el hallazgo de la semana, y conviene decirlo.** Tres veces
seguidas —ADR-118, ADR-122, ADR-123— el Anexo marcó «no existe» o «parcial» algo que ya
funcionaba y a lo que ninguna pantalla llegaba. **El traslado de colmenas es el caso
contrario:** `Hive.locationId` guarda el apiario **actual** y nada más, así que mover una
colmena hoy reescribiría su pasado —sus inspecciones viejas parecerían haber ocurrido en
el apiario nuevo— y `@@unique([locationId, identifier])` chocaría si el destino ya tiene
una `C-01`. Eso es esquema, migración y un modelo de vigencia; no es una pantalla que
falta. Buscar aquí un mecanismo escondido sería aplicar el hallazgo anterior donde no
aplica.

**CORRECCIÓN, 2026-09-13 (mismo día).** La Decisión 2 de arriba decía que, sin el «plan
de renumeración», *«el orden de trabajo no tiene fuente autoritativa»*. **Es falso, y se
corrige aquí en vez de trabajar a su alrededor.** La secuencia de tickets **está en el
repositorio**: la tabla «Camino crítico» de `48_A9_CAPTURA_DE_CAMPO_REPORTE.md` enumera
**A9.0 … A9.12** con su columna de esquema, de qué depende cada uno y a qué bloquea; A9.0
a A9.6 son el camino crítico y A9.7 a A9.12 van en paralelo. El `48_A9_ANEXO_H` que entró
el mismo día lo confirma desde fuera: su §5 dice *«Nada. A9.0 a A9.6 quedan como están»*.

Le pedí al dueño un documento que ya tenía. Lo que sí sigue sin aparecer es el «brief del
módulo»; la «secuencia de tickets» no faltaba, **faltaba que yo la buscara**.

**Y lo que la medición añade, que es más útil que el reproche:** los **trece** tickets
tienen ya un módulo que los declara —de `lib/traceability/jornadaDeCampo.ts` (A9.0) a
`lib/apiary/bitacora.ts` (A9.12)—. O sea que la secuencia **está agotada**, y por eso no
ordena el §8 ni el §9 del Anexo E: **esos dos no están en ella**. Son alcance nuevo, no
tickets pendientes, y eso cambia la pregunta de «¿en qué orden?» a «¿entran o no?».

*(Medido con `grep -rlE "A9\.N( |\)|—|,|$)"` sobre `lib/`, `app/` y el esquema, con
control positivo en A9.6 → `reporteDeVisita.ts`. «Tiene módulo que lo declara» no es
«está terminado»: es lo que la medición sostiene.)*

**Nota de inventario:** la serie de anexos salta de **E a G**. No hay `48_A9_ANEXO_F_*` en
`main` al escribir esto. Puede ser deliberado o puede ser una pieza que no llegó; queda
señalado, no rellenado.

## ADR-125 — El vacío no se ofrece como opción; y dos de los nueve términos no eran vacío, eran respuestas

**Contexto.** El Anexo E §6 pide tres cosas: un solo término para el vacío, sacar «Sin
registrar» de los desplegables dejándolo como estado, y eliminar «— elegir —». Medido el
2026-09-13, el módulo apícola tenía **nueve grafías en 22 opciones vacías** y la app
entera **34 en 89**.

**La medición que cambió la rebanada.** El dueño contó términos y pidió uno. Pero dos de
los nueve **no son vacío**: son respuestas que casualmente guardan `null`.

- `varroaEvaluatesNone` = «No — cuento para decidir» dice que ese conteo **no evalúa
  ningún tratamiento**. El comentario que ya estaba en el código lo declara el caso
  normal: *«contar para decidir es el caso normal, y preseleccionar un tratamiento
  atribuiría una eficacia que nadie afirmó»*.
- `colonyEndCauseNo` = «—» dice que **esa causa candidata no participó** en la pérdida.
  El operador clasifica cada causa; el vacío es un «no, ésta no».

Colapsar las nueve a un término habría borrado las dos. Que el valor guardado sea `null`
es un detalle de almacenamiento, no su significado.

**Decisión 1 — tres familias, declaradas en código.** `lib/apiary/vacio.ts`:

| familia | qué significa la opción vacía | cómo se escribe | cuántas |
|---|---|---|---|
| `vacio` | nadie lo anotó | `<option value="" />`, sin texto | 14 |
| `placeholder` | obligatorio sin elegir todavía | `<option value="" disabled />` | 4 |
| `respuesta` | afirmación deliberada que vale «ninguno» | conserva sus palabras | 3 |

**Decisión 2 — la lista de `respuesta` es explícita, no una heurística.** Un detector que
clasificara por la forma del texto tomaría el «—» de las causas por decoración y se lo
comería. Añadir una obliga a escribirla en `CLAVES_DE_RESPUESTA_QUE_VALE_NINGUNO`, que es
el sitio nombrado donde aterriza el veredicto.

**Decisión 3 — «Sin registrar» pasa a LEERSE, que es la mitad que no existía.** El origen
del pie y los dos campos de cierre de la cosecha se enseñaban **omitiéndose** al faltar
(`c.honeyType ? … : ""`), así que «esta cosecha está sin cerrar» y «no aplica» se leían
igual: una línea que no aparece. Ahora salen con su rótulo y la clase
`nn-vital-sin-registro` que ya existía.

**Decisión 4 — cero y `false` están ANOTADOS.** `estadoDelDato` lo afirma y su prueba lo
defiende. Cero kilos extraídos es haber abierto la caja y no encontrar miel; `false` en un
tres-estados es haber mirado y no haber visto. Tratarlos como vacío es ADR-080 leído del
revés: convertir una observación en una ausencia. `NaN` **no** está anotado, y se afirma
antes de comparar, porque una comparación con `NaN` siempre sale falsa y por tanto siempre
halaga a quien mide.

**Decisión 5 — el guardia se acota al módulo apícola, y el número es la razón.** Un
guardia sobre las 89 opciones de la app no podría pasar hoy, y `~/.claude/CLAUDE.md` lo
dice con nombre: *«Un guardia que nunca puede pasar es peor que ninguno: enseña a ignorar
una línea roja.»* Lo que queda **inventariado y no vigilado**, medido el 2026-09-13: 89
opciones vacías, 34 grafías, repartidas por sensorial, investigación, café y admin; las
más repetidas son «Ninguno» (12), «—» (7), «— elegir —» (6) y «— Elegir —» (5).

**Lo que NO se tocó, con su razón:**

- **`TriStateField`** es de trazabilidad: 2 usos allí, **0** en apiario, donde sólo aparece
  en comentarios. Tocarlo habría cambiado pantallas de café sin pedirlo.
- **`humedadSinMedir`** se queda aunque empiece por «Sin medir»: dice algo que «Sin
  registrar» no puede — que el dato vive en la medición del lote, con su instrumento y su
  procedencia (ADR-123).
- **La mitad de «reescritos para apicultura» ya estaba hecha.** El Anexo dice que los
  textos de ayuda *«hablan de fósforo Bray contra Mehlich y de perfiles de suelo
  compactado»*. Medido: el namespace `Apiary` tiene **10 ayudas propias y 0** con palabra
  de suelo o fósforo; la única clave con Bray/Mehlich es `sampleExtractionHelp`, del
  namespace `Traceability`, que pinta una pantalla de muestras de café. **Queda por
  confirmar qué pantalla vio el dueño** — no se afirma que se equivocara. Lo que sí
  faltaba era colapsarlas: había **cero** `<details>` y ahora están los diez.

**El fallo del instrumento, anotado porque es de una clase conocida.** El detector del
guardia usaba `/<option\s+value=""([^>]*?)>([\s\S]*?)<\/option>/`, que **se traga la forma
autocerrada**: toma ` /` por atributo y todo lo que sigue hasta el siguiente `</option>`
por su etiqueta. Con la regla ya arreglada en las fuentes reportó **18 violaciones
inexistentes**. Falló en rojo y no en verde, que es la única razón por la que se vio — la
misma forma habría pasado desapercibida al revés. El caso quedó como control del detector,
con la forma autocerrada seguida de una opción de verdad.

**Flip-test, las tres con sha distinto y compilando:** devolver «Sin registrar» a una
opción tumba «ninguna opción vacía lleva texto» y «"Sin registrar" no se usa como etiqueta
de opción»; devolver un «— elegir —» al namespace tumba «ningún texto de apiario dice
"elegir"»; hacer que cero cuente como vacío tumba «cero y false están ANOTADOS» y, de
paso, la de `NaN`, porque `-0 === 0` y su control de `-0` también lo caza.

## ADR-126 — El traslado de colmenas: la primera rebanada de A9 cuyo hueco era de esquema, y tres restricciones que no eran lo que parecían

**Contexto.** El Anexo E §8 pide *«mover un grupo de colmenas de un apiario a otro en un
solo gesto»* con una regla que no admite medias tintas: *«El traslado cierra la vigencia de
cada colmena en el apiario de origen y abre la del destino en la misma operación. Nunca
deja una colmena en dos lugares ni en ninguno.»*

**La medición que decide la forma, y que invierte el hallazgo de la semana.** ADR-118,
ADR-122 y ADR-123 encontraron tres veces lo mismo: un mecanismo completo al que ninguna
pantalla llegaba. Aquí es al revés. `Inspection`, `ColonyEvent`, `ApiaryHarvestEvent` y
`VarroaCount` **no tienen `location_id` propio** —cero en los cuatro, contra dos en `Lot`
como control positivo—, así que el único camino de un evento a su apiario era
`hive.location_id`. Mover la colmena habría movido su historia entera: las inspecciones de
marzo en Santa Fe se leerían como hechas en el destino. **Eso no es una pantalla que falte;
es un hecho que no se puede escribir.**

**Decisión 1 — `HivePlacement`, con el patrón que la casa ya usa.** `hiveId` + `locationId`
+ `startedAt` + `endedAt` (`null` = vigente), que es exactamente
`traceability.storage_assignment`: un lote ya se mueve entre ubicaciones así. Inventar una
segunda forma para el mismo hecho —una cosa que está en un sitio durante un rato— daría dos
vocabularios que derivan.

**Decisión 2 — `hive.locationId` NO se sustituye.** Es el ancla de autorización
—`requireApiaryAccess` lo usa en ocho sitios de `lib/apiary/`— y lo que hace cumplir
`@@unique([locationId, identifier])`. La invariante es que coincide con la colocación
abierta, y el traslado mueve las dos cosas en la misma transacción.

**Decisión 3 — la migración RELLENA.** Sin eso la tabla nace diciendo que ninguna colmena
ha estado en ningún sitio, y toda consulta por fecha devolvería vacío para la historia
existente — una ausencia que se leería como «no se sabe» cuando el dato sí está.
`started_at` sale de `installed_at` si existe y de `created_at` si no; `reason` queda
`NULL`, porque los cuatro motivos del Anexo describen traslados y ninguno describe «aquí es
donde estaba cuando empezamos a registrarlo».

**Decisión 4 — el aviso del destino se construye a medias, y la otra mitad se DECLARA.** El
Anexo pide advertir *«si el destino tiene aplicaciones previstas o un periodo de carencia
corriendo»*. La carencia se avisa con sus días. Las aspersiones **no existen en el sistema**
—buscado `vecin|neighbour|aspersion|spray` en el esquema y en `lib/apiary/`: cero, con
`carencia|Withdrawal` dando diez como control positivo—; es el mismo hueco que el §4 pide
como «Consulta a fincas vecinas». Por eso `avisosDeDestino` devuelve
`aspersionesConsultadas: false` y la pantalla dice **que nadie lo ha preguntado**. Un aviso
vacío habría significado «el destino está limpio», que es ADR-080 leído del revés.

### Las tres restricciones que no eran lo que parecían

**1. `@@unique([hiveId, endedAt])` no habría guardado nada.** En Postgres los `NULL` son
distintos entre sí en un índice único, así que dos colocaciones abiertas pasarían. **Medido
el 2026-09-13 contra Postgres 18.6, con control positivo**: el mismo índice rechazó la fila
duplicada con valor —sobrevivió 1 de 2 inserciones— y admitió **las dos** con `NULL`. Habría
sido una restricción que se lee como estructural y no existe para la base: el defecto que
esta casa ya pagó tres veces en un día. Un índice único **parcial** sí lo haría, pero Prisma
no lo expresa y meterlo como SQL suelto crearía la deriva que ADR-120 cerró. La invariante
la sostiene el servicio y la defiende el flip-test (quitar el cierre del origen tumba dos
pruebas por su nombre). `StorageAssignment`, que es el mismo patrón, tampoco lo tiene.

**2. Mi compuerta del destino negaba el caso normal.** La escribí como
`requireApiaryAccess(..., [{ locationId: destino }])`. `apiaryScopeTargetsFor` genera un
objetivo **por cada campo que recibe**, así que eso probaba únicamente el ámbito `location`
— y un Farm Operator asignado por **proyecto**, que es cómo están asignados los perfiles de
esta casa, habría sido **rechazado** al trasladar entre dos apiarios de su propio proyecto.
Una compuerta que niega el caso normal se quita a la semana. Lo dijo **leer
`requireApiaryAccess`**, no una corrida. Y el límite queda escrito: para quien está asignado
por proyecto las dos llamadas pasan por el mismo objetivo y la segunda no añade nada.

**3. La aritmética de la carencia estaba duplicada.** `destinosCandidatos` resuelve la lista
de destinos en tres consultas en vez de un N+1, y para eso **copié** la cuenta de
`carenciasVigentes`. Se extrajo a `libreDesdeDe` y `diasQueFaltanDe`, puras y exportadas en
`carencia.ts`, y las usan las dos. Dos copias de la misma cuenta acaban diciendo cosas
distintas del mismo apiario.

### Un defecto ajeno, encontrado porque un guardia rechazó código nuevo

`BotonDeEnvio` hacía `disabled={pending} {...resto}`. Un llamador que pasara su propio
`disabled` lo **sobrescribía y perdía la protección del doble toque sin que nada lo dijera**
— el botón parecía protegido porque usaba el componente compartido. Le pasaba a
`app/sensory/[sessionId]/page.tsx`, que pasa `disabled={...assessments.length === 0}`: con
una evaluación en la lista, ese botón se podía pulsar dos veces, y
`MaterialConsumptionEntry` y compañía no tienen índice único que rechace el duplicado.
Arreglado combinando, con guardia nuevo de dos aserciones.

**Y el instrumento de ese guardia falló primero.** Mi primera versión comparaba posiciones
—«el spread va después del `disabled` combinado»— con `indexOf`, y encontró **la mención en
un comentario de ese mismo archivo**, no el JSX. Era la medición leyendo prosa. La aserción
era además redundante: con `disabled` desestructurado ya no viaja dentro de `resto` y el
orden deja de importar. Se retiró, y la retirada está explicada en el archivo para que nadie
la reponga.

**Lo que dejo nombrado y sin hacer:** `createHive` **no abre la colocación inicial** de una
colmena nueva. El relleno de la migración cubre las que ya existían; las que se creen desde
hoy quedan sin fila en `hive_placement` hasta que se trasladen, y su prueba lo abre a mano.
No entra aquí porque tocar `createHive` es cambiar el alta de colmenas, con su propia
autorización y sus propias pruebas, y esta rebanada ya trae dos migraciones.

**Cuatro guardias de la casa cazaron este cambio, y los cuatro tenían razón:**
`cliente-sin-prisma` —un valor importado de un módulo con `prisma` desde un `"use client"`,
la **cuarta** vez que el módulo apícola necesita este reparto, de ahí
`motivoDeTraslado.ts`—, `envio-sin-doble-toque`, `acceso-a-datos` —una operación y cinco
lectores sin inventariar, y después una entrada **muerta** cuando quité un export
especulativo— y `cifras-del-inventario`: 299→305 operaciones y 91→92 archivos, un delta que
cuadra exactamente con lo añadido, que es la comprobación de que nada más entró sin pasar
por el inventario.

## ADR-127 — La consulta a vecinos: el sistema sabía registrar la colonia muerta y no el aviso que la habría salvado

**Contexto.** El hueco lo destapó ADR-126 al construir el traslado: el Anexo E §8 pide
avisar *«si el destino tiene aplicaciones previstas o un periodo de carencia corriendo»*, y
sólo se pudo construir la mitad de la carencia. La otra mitad aparece **tres veces** en el
Anexo: el §4 la pide como formulario —*«Finca, cultivo, aplicación prevista y fecha, quién
informó. Es protocolo mensual, no una nota, y el sistema lo reclama solo»*—, el §3 la enseña
como alerta del sitio —«Consulta a vecinos vence en 3 días»— y el §8 la necesita para que su
aviso deje de decir que nadie ha preguntado.

**La medición, hecha antes de escribir nada.** Cero coincidencias de
`vecin|neighbour|aspersi|spray|pesticid|agroquim` en el esquema y en `lib/apiary/`, con
`carencia|Withdrawal` dando diez como control positivo. Lo único que existía era la
**consecuencia**: `lib/research/catalogs.ts` tiene «Intoxicación por agroquímicos» como
causa de pérdida de colonia, y su propia nota dice que *«en Panamá la literatura la asocia a
la deriva de aplicaciones vecinas»*. El sistema sabía registrar la colonia muerta y no el
aviso que la habría salvado. **Este ADR se titula con eso porque es el hallazgo, no la
prosa.**

**Decisión 1 — un enum de resultado, no una fecha anulable.** Los tres valores son
**respuestas**:

| valor | qué afirma |
|---|---|
| `sin_aplicacion_prevista` | se preguntó y la finca dijo que no hay nada previsto |
| `aplicacion_prevista` | se preguntó y hay una; exige fecha |
| `no_se_pudo_consultar` | se fue y no se pudo preguntar: nadie, o se negaron |

«Fuimos y no hay aplicación prevista» es la respuesta más valiosa del protocolo y la más
fácil de perder: guardada como «sin fecha de aplicación» sería **indistinguible de «nadie
preguntó»**. Y `no_se_pudo_consultar` no es lo mismo que no haber ido — el protocolo se
cumplió y la información no llegó, así que ocupa el mes igual que las otras dos. Es ADR-080
aplicado a un protocolo, y la misma disciplina que ADR-125 aplicó al vocabulario del vacío.

**Decisión 2 — la finca vecina es una `Organization` obligatoria**, por el precedente de
`PollinationCommitment.clientOrganizationId`. Cuesta un alta la primera vez por vecino; a
cambio, la consulta del mes que viene habla de la misma finca que la de este mes. Con texto
libre, «la finca de al lado» y «Finca Los Robles» serían dos vecinos distintos y ninguna
consulta podría comparar un mes con el siguiente.

**Decisión 3 — el cultivo es texto libre, y se dice por qué.** No hay catálogo de cultivos
en este repositorio —los «cultivo» que aparecen son de levaduras— y el dueño no ha dado
vocabulario; inventarlo sería fabricar un hecho de negocio. A diferencia de
`harvest_event.condition`, que era texto libre sobre algo **nuestro** y acabó con 29 filas
diciendo lo mismo, éste es un hecho de la finca de otro y se recoge como lo dijeron. El día
que haya vocabulario es un catálogo y una migración de valores, no un rediseño.

**Decisión 4 — la cadencia se mide por SITIO, no por vecino.** El Anexo pide «protocolo
mensual» del apiario. Exigir un mes por cada vecino multiplicaría el aviso por el número de
fincas colindantes y dejaría un sitio con cuatro vecinos permanentemente en rojo. Cuál
vecino toca es decisión de quien va; la lista por vecino la da `vecinosConsultados`.

**Decisión 5 — `sin_consultar` NO levanta alerta.** Un apiario recién creado no ha
incumplido nada. Gritar el primer día enseñaría a ignorar este aviso, que es exactamente lo
que el Anexo quiere evitar cuando dice «el sistema lo reclama solo». La pantalla del sitio sí
enseña «nunca se ha consultado» **como estado**. El flip-test de esto tumba la prueba
llamada «nunca consultado NO es vencido — es la distinción que hace útil el aviso».

### Las dos invariantes viven en la BASE, y se probó que disparan

`CLAUDE.md` lo dice con nombre: *«Una restricción que vive en TypeScript o en un comentario
no existe para la base: un importador, una reparación operativa o SQL directo se la
saltan.»* Así que `neighbour_consultation` lleva dos `CHECK`:

1. la fecha de aplicación existe **exactamente** cuando el resultado es
   `aplicacion_prevista` —una fecha junto a «no hay aplicación» es una contradicción que
   después nadie sabe leer—;
2. una consulta que **ocurrió** dice quién informó; la que no se pudo hacer no está
   obligada, y el nombre no se prohíbe ahí porque se puede haber hablado con alguien que no
   supiera, y eso es información.

**Medido con `SAVEPOINT`, con control positivo:** la fila válida entra, las tres
contradicciones se rechazan **nombrando la restricción**, y `no_se_pudo_consultar` sin
informante entra — o sea que la restricción no es demasiado estricta. Y **no crean deriva**:
`migrate diff` no modela `CHECK`, comprobado con `--exit-code` 0.

**El primer intento de esa medición no medía nada.** El control positivo falló —`updated_at`
no tiene valor por defecto en la base, porque el `@updatedAt` de Prisma es de aplicación— y
con la transacción abortada los tres «rechazos» siguientes eran `current transaction is
aborted` disfrazado de `ERROR`. Tres rojos que parecían el guardia funcionando.

El servicio repite las dos reglas, y no es redundancia inútil: el `CHECK` protege a la tabla
de un importador, y la comprobación del servicio devuelve un error con nombre de dominio en
vez de uno de Postgres que ninguna pantalla sabe traducir.

### Una trampa evitada, que es la del docblock al revés

`organizacionesParaApiario` devuelve `[]` salvo cuando la visibilidad es `"all"`, y su
comentario explica por qué: *«un formulario que ofrece lo que el servicio niega»* —
`crearApiario` rechaza lo demás. **Aquí la asimetría va en el otro sentido:**
`registrarConsultaAVecinos` autoriza sobre el **apiario**, no sobre la organización vecina
—no hay nada que autorizar en «a quién le pregunté»—, así que reusar aquella función habría
dado un desplegable **vacío precisamente al Farm Operator con ámbito de proyecto**, que es
quien hace el trabajo de campo. Un formulario que niega lo que el servicio permite es el
mismo defecto por el otro lado. De ahí `vecinosOfrecidos`, que autoriza sobre el sitio y no
filtra por `organizationType`: un vecino puede estar registrado como `farm`, `estate` o
`producer`, y decidir por él cuál cuenta como «finca» sería inventar una regla que nadie
pidió.

### La decisión de orden, llevada al dueño y RESUELTA el mismo día

Los tres motivos nuevos entraron primero **después** de los cinco que ya existían, porque el
Anexo C §1.2 fija su orden («la primera regla que se cumpla, en este orden») y reordenarlas
cambiaría una decisión documentada sin pedirlo. Se dejó señalado que **una aspersión anunciada
en tres días es la única fecha de ese tablero que la impone alguien de fuera y que no se puede
atender después**, y que por tanto podría merecer ir antes que una pérdida que ya ocurrió.

**Daniel dijo que sí, el 2026-09-14: `aspersion_anunciada` pasa a ser la primera.** Cambia el
orden del Anexo C §1.2 a propósito y con su palabra. `alertas[0]` pinta el borde de la
tarjeta, así que esto cambia qué grita primero la lista de apiarios.

**El veredicto tiene su sitio nombrado**, que es lo que distingue «hecho» de «sin hacer»:
el `it` llamado *«una aspersión anunciada manda sobre TODO lo demás — decisión del dueño,
2026-09-14»*, que además comprueba lo contrario —una aspersión ya pasada **no** adelanta a
nada y vuelve a mandar la pérdida—. Y el `it` que había, cuyo comentario decía «el Anexo fija
que manda la pérdida de colonias», se corrigió: eso ahora sólo es cierto cuando no hay
aspersión.

**Y el guardia de los textos de alerta se rompió con este cambio, por su propio instrumento.**
El comentario que se añadió dentro de la declaración de `MotivoDeAlerta` contiene un punto y
coma —«ADR-127 la planteó y no la resolvió; el dueño la subió»— y el detector cortaba la unión
en el primer `;`: midió **cero motivos** y su control positivo anuló la corrida, que es
exactamente para lo que estaba. Ahora quita los comentarios antes de buscar, y el caso quedó
como control. **Tercera vez en el mismo día que el instrumento mide prosa** — las otras dos
fueron un `grep` que encontró el texto de un comentario del esquema y un `indexOf` que
encontró la mención de `{...resto}` en otro.

### Guardia nuevo, por un agujero que el compilador no puede ver

`tests/arquitectura/alertas-con-su-texto.test.ts`. `app/apiaries/page.tsx` pinta las alertas
con `t(\`alerta_${a.motivo}\`)`: la clave se construye **en ejecución**, así que un motivo
nuevo sin texto **no rompe el build** — rompe la lista de apiarios cuando alguien la abre,
que es la primera pantalla del módulo. Se escribió al añadir tres motivos de golpe, después
de comprobarlo a mano: una comprobación a mano es una que la próxima vez no se hace. Lleva
su control positivo (el detector tiene que encontrar ≥5 motivos), su control del detector
sobre una unión sintética, y un `it` que dice que **si la pantalla deja de construir la clave
en ejecución, este guardia debe borrarse** en vez de quedarse vigilando algo que ya no pasa.

### Y una nota sobre mi propio arnés de flip-test

Con **dos** archivos de prueba en la misma corrida, el `grep -E '^\s+×'` del arnés salió
vacío y eso se lee igual que «no cayó nada» — el veredicto que halaga. Con un solo archivo
lo dijo entero, por su nombre. El arnés necesita un archivo de prueba por mutación, y queda
escrito aquí porque es la cuarta forma distinta que el instrumento ha tomado esta semana.

**Inventario de acceso:** 305→311 operaciones y 92→93 archivos. Dos operaciones con guardia
directo más cuatro lectores que dependen del llamador = 6, que es exactamente el salto.

## ADR-128 — Los dos apiarios reales: una colonia equivocada se borra, una que murió se cierra

**Contexto.** El dueño declaró el 2026-09-14 el estado real de sus apiarios: **son dos, los
dos propiedad de Néctar Nómada**. El de Finca Rosina tiene **2 colmenas vacías, sin
colonias, con sus patas y tapa** (`NN-0041`, `NN-0042`). El otro, **Apiario Las Nubes**,
tiene 5 colmenas `NN-0043`…`NN-0047` con colonia activa: núcleos jóvenes de **Parita
(Herrera)** criados, trasladados y vendidos por **Chayanne López**, implementado el **4 de
septiembre a las 6:00**, con trasiego a cámaras de cría hechas con **madera de un roble del
bosque de Cerro Azul** que estaba caído, secado y tratado.

**Decisión 1 — la distinción que gobierna todo esto: dato equivocado ≠ historia.** Las dos
colmenas de Rosina tenían una colonia activa cada una y en la realidad están vacías. Esas
colonias **no son historia, son datos equivocados**, así que se **borran**. Cerrarlas con
`registrarFinDeColonia` habría exigido una causa de pérdida y **afirmado una muerte de
colonia que no ocurrió** — inventar un hecho, que es la primera prohibición de `CLAUDE.md`
§3. **El criterio queda escrito para la próxima vez:** se cierra lo que pasó, se borra lo
que nunca fue.

**Y el guion se niega a borrar cuando podría estar equivocándose:** si una colonia tiene
cosechas, fotos o conteos de varroa, aborta y lo dice. Eso ya es historia, y entonces
borrarla no corrige un registro: pierde un hecho. Medido antes de aplicar: un evento y una
inspección, nada más.

**Decisión 2 — las cajas se renombran, no se recrean.** `H-0014` → `NN-0041` y
`PRUEBA-apiario-1788975585395` → `NN-0042`. Las cajas **existen físicamente**; lo que estaba
mal era cómo se llamaban. Recrearlas habría perdido su `hive_placement` y su fecha de
instalación.

**Decisión 3 — el dueño es Néctar Nómada; el sitio sigue siendo Finca Rosina.** Los dos
apiarios estaban `(sin organización)`. Ahora su `organizationId` es Néctar Nómada y su
`parentLocationId` **no se toca**: sigue siendo la ubicación `Finca Rosina`, que cuelga de la
localidad `Cerro Azul` junto a los seis lotes de café y al Beneficio Las Nubes. **Esa
jerarquía ya existía** —medido, no construido— y es lo que permite preguntar por la miel y el
café del mismo sitio, que es lo que el dueño quiere para la polinización dirigida que viene
«en el futuro, no ahora». Para eso ya hay mecanismo: `PollinationCommitment` (A9.9).

### Tres hechos del dueño que el esquema NO puede guardar

Se dicen en vez de forzarlos, y son trabajo nombrado:

| hecho | por qué no cabe |
|---|---|
| «con sus patas y tapa» | `Hive` no tiene columnas de soporte ni de tapa |
| la madera de roble de Cerro Azul | `Hive` no tiene material ni nota; va en un `ColonyEvent` de tipo `other` |
| «todas con reina» | `Colony` no tiene campo de reina: eso se afirma en una inspección, y **no se inventa una inspección que nadie hizo** |

**Y el apaño del roble es consciente:** `ColonyEventType` sólo tiene `feeding`, `treatment`,
`passing_observation` y `other`, aunque el **Anexo E §4 pide «Instalación o retiro de
colmena» como tipo propio**. Cuando ese tipo exista, esas cinco filas se migran.

**Decisión 4 — la hora se escribe en UTC explícito.** «4 de septiembre 6AM» es hora de
Panamá (UTC−5) = `2026-09-04T11:00:00Z`. Escribirlo como `new Date("2026-09-04T06:00")` lo
habría interpretado en la zona del proceso: en un runner en UTC, la 1 de la madrugada de
Panamá. Es ADR-112, y aquí no hay formulario que mande el desfase. Verificado leyendo la base
con `at time zone 'UTC' at time zone 'America/Panama'`: **06:00** en las cinco.

### Señalado y no corregido

- **El catálogo dice «Parita, Chitré» y el dueño dijo «Parita, Herrera».** Parita es distrito
  de Herrera. El valor del catálogo parece estar mal, pero corregir un catálogo es otra
  decisión y **dos veces el dato estaba bien y la duda estaba mal**.
- **`NN-0041` conserva su fecha de instalación original**, que es medianoche UTC del 24 de
  agosto y se lee como el 23 a las 19:00 en Panamá. Es un artefacto de campo-de-día anterior
  a este cambio, no algo que este guion haya puesto.
- **`Finca Las Nubes (Jaramillo Arriba, Boquete)` no se toca.** Es otra finca en otra
  provincia, y el guion de renombrado de 2026-08-27 ya avisó de esta colisión de nombre. Se
  compara por nombre **exacto**, nunca por `contains`.

**Aplicado SÓLO en la copia local**, por la regla en pie de que este asistente no toca la
base de producción de Neon. Producción y la copia local **han divergido**: quien restaure la
copia desde un backup anterior perderá esto, y quien quiera llevarlo a producción corre el
mismo guion con `--apply`. Verificado contra la base y no contra el informe del propio guion,
con controles negativos: cero colmenas `PRUEBA`, cero colonias en Rosina, la finca de Boquete
intacta, 21 filas de auditoría, y las 28 pruebas que tocan datos reales en verde (258).

## ADR-129 — Un valor de catálogo se declara en la semilla, no se inserta: lo dijo el guardia, no yo

**Contexto.** El dueño declaró el 2026-09-14 las procedencias de sus apiarios: **todas las
colmenas anteriores son origen San Francisco, Veraguas, del apicultor Marcelino Guevara**, y
sus sitios son Toabré, Río Gatú, Lagartero y «Los Palacios, Los Asientos, Pedasí, Los
Santos». Confirmó además **10 colmenas en Apiario Las Nubes**, cinco de ellas llegadas el **2
de septiembre** (no el 4).

**Decisión 1 — el cuarto origen va en `lib/research/catalogs.ts`, no en un `INSERT`.** La
primera versión del guion insertaba «San Francisco, Veraguas» directamente en
`variable_catalog_value`. **`tests/apiary/origenDeColonia.test.ts` lo cazó**: su `it` llamado
«está sembrado, no sólo declarado» compara lo que hay en la base con lo que la semilla
declara, y la base tenía un valor que la semilla no conocía.

El propio catálogo ya lo decía, y no lo leí: *«Crece por semilla, no por migración (precedente
P1): el día que entre un cuarto origen es una línea aquí y un `db:seed`.»* **Y la forma
correcta es mejor por una razón que no había visto:** `db:seed` corre en cada despliegue de
producción —se lee en el log del build, «seeding permissions, role profiles and catalogs»—
así que el valor llega a producción **sin que nadie toque Neon a mano**.

**Decisión 2 — la fecha sin hora se ancla a medianoche LOCAL, no UTC.** De las cinco del 2 de
septiembre el dueño no dio hora. Se guardan a `2026-09-02T05:00:00Z`, que es medianoche de
Panamá. Con medianoche UTC se leerían como **el 1 de septiembre a las 19:00**: el día
equivocado. Es el artefacto que `NN-0041` ya arrastra —su instalación se lee como el 23 de
agosto a las 19:00— y se evitó a propósito. Verificado con `at time zone`: las cinco dicen
**2026-09-02 00:00**.

**Decisión 3 — `original_record` y no `direct_observation` para esas cinco.** El dueño dijo
que estuvo en el trasiego del 4 de septiembre; del 2 no dijo nada. La clase de procedencia
distingue lo que vio de lo que reporta, y suponer que estuvo presente sería inventar una
observación. **Tampoco se les crea evento de trasiego**: el del 4 está descrito por él, el del
2 no existe como declaración.

**Decisión 4 — `locality` y no `district`.** San Francisco, Parita y Pedasí son distritos, y
el enum tiene `district`. Pero **ninguna fila del repositorio usa ese tipo** —medido: cero— y
`Boquete`, que también es distrito, está guardado como `locality`. Se sigue el precedente
(`CLAUDE.md` §61) y queda anotado como elección, no descuido.

**Lo que NO se creó, y es la mitad del trabajo:** **Toabré, Río Gatú y Lagartero**. El dueño
tiene apiarios ahí y **no dijo en qué provincia están**. Una jerarquía inventada es peor que
ninguna: después nadie sabe si el dato salió de él o de una suposición. Control negativo en la
verificación: cero ubicaciones con esos nombres.

### Dos conflictos del catálogo, señalados y sin resolver

1. **`Santa Fe, Veraguas` está definido como «El pie original de Toabré»**, y el dueño dice
   que el origen de Toabré es Marcelino, de **San Francisco**. Los dos son distritos de
   Veraguas: **uno de los dos está mal**, y decidirlo cambia la procedencia de 15 colmenas.
2. **`Parita, Chitré` está definido como «Los tres núcleos instalados en septiembre de
   2026»** — o sea que se creó para las 3 que Chayanne llevó a **Toabré**, y las diez de Cerro
   Azul usan ese mismo valor porque el lugar es el mismo. Su definición ya no las describe. Y
   su nombre sigue pareciendo equivocado: Parita es distrito de **Herrera**.

### Y la historia de Toabré, que no se registró porque su aritmética no cierra

El dueño la contó: 15 colmenas de Marcelino instaladas en **diciembre de 2025**; **12 de 15
perdidas en marzo**; un **enjambre** llegó a Finca 2 —abandonada— en **abril** y **se fue a
final de julio**; **«las últimas 2»** de Finca 1 se perdieron a **final de agosto**; Chayanne
instaló **3 nuevas**. **12 + 2 = 14, de 15: falta una.** No se registró ninguna de esas
pérdidas, porque una muerte de colonia inventada es un hecho falso en la trazabilidad, y el
sistema guarda causas precisamente para poder preguntar de qué se murieron. Falta también el
reparto de las 15 entre Finca 1 y Finca 2, que la propia historia distingue.

## ADR-130 — El emplazamiento temporal: la primera pregunta histórica que el módulo puede contestar

**Contexto.** El Anexo E §9 pide que un servicio de polinización tenga *«apertura, vida y
cierre propios, distintos de los del apiario»*, y que al cerrarlo *«el reporte se genera con
el alcance de la ventana —no de la vida del apiario— con las colmenas que estuvieron, los días
efectivos y lo observado»*.

**Por qué esta rebanada va DESPUÉS del traslado y no antes.** «Las colmenas que estuvieron» es
una pregunta sobre el **pasado**. Hasta ADR-126, el único camino de una colmena a su apiario
era `hive.locationId`, que dice dónde está **ahora**: la pregunta no tenía respuesta posible,
ni con una pantalla ni con un informe. `HivePlacement` la hizo contestable, y ésta es **la
primera vez que el módulo apícola contesta algo histórico**.

**Decisión 1 — tres campos nuevos, y uno de ellos justifica la migración entero.** De las siete
cosas que el §9 pide al abrir, cuatro existían desde A9.9. Faltaban `crop`, `parcelReference`,
`committedHives` y la ventana de floración.

**`bloomStartsAt` NO es `startsAt`.** El servicio empieza cuando llegan las colmenas; la
floración abre cuando la abre la planta. Con una sola fecha, la alerta que el Anexo pide —«que
se acerque la floración con la meta incompleta»— **no se puede dar**: no habría nada que se
acerque distinto del propio servicio. Son dos hechos y son dos columnas.

**`committedHives` NO es `hectáreas × densidad`.** El cociente es la regla agronómica; esto es
lo que dice el contrato. Cuando los dos existen y no coinciden, **la diferencia es el dato**,
igual que `divergen` en el conteo de colonias (D6).

**`crop` y `parcelReference` son texto libre**, por la misma razón que el cultivo de una finca
vecina (ADR-127): son hechos de la finca del **cliente**, no hay catálogo de cultivos y el
dueño no ha dado vocabulario. Y las parcelas ajenas **no se modelan como `Location`**: una
ubicación por cada parcela de cada cliente llenaría la jerarquía de sitios que nadie visita.

**Decisión 2 — dos `CHECK` en la base, probados en las dos direcciones.** Una ventana de
floración invertida y un número de colmenas negativo se rechazan en Postgres. Medido con
`SAVEPOINT` y control positivo: la fila válida entra, las dos contradicciones se rechazan
**nombrando la restricción**, y una ventana a medias —sólo apertura— **sí** entra. La
invertida importa más de lo que parece: habría hecho que «se acerca la floración» calculara
días negativos y **el aviso no saliera nunca**. Un guardia silencioso es el peor.

**Decisión 3 — de las dos alertas del §9, sólo una es nueva.** La de la floración vive aquí,
pura. La de la aspersión **ya existe** desde ADR-127 —`aplicacionesPrevistas`, y el tablero la
pinta como la primera de todas— y **no se reimplementa**: dos reglas para el mismo hecho acaban
diciendo cosas distintas del mismo apiario, que es exactamente lo que pasó con la aritmética de
la carencia en ADR-126. Esta pantalla la mira en el contexto del compromiso.

**Decisión 4 — `diasEfectivosDe` cuenta SOLAPE, no duración.** Una colmena que llegó antes de
abrir el servicio y se fue a mitad cuenta sólo los días de en medio. Sumar colocaciones enteras
**inflaría la factura** de un servicio de polinización, que es el número que un cliente mira. Y
el `Math.max(0, …)` va **antes** de sumar: un solape negativo restaría días de otra colocación
y el total saldría plausible y falso — hay prueba de eso, y su flip-test tumba el `it` llamado
«una colocación FUERA de la ventana cuenta cero, y no resta».

**Decisión 5 — sin ventana de floración declarada NO se avisa.** Un compromiso sin
`bloomStartsAt` no incumple nada: no se sabe cuándo abre. Gritar ahí convertiría una ausencia
en una afirmación (ADR-080) y enseñaría a ignorar el aviso. Tampoco se avisa **cuando la
floración ya abrió**: entonces no «se acerca», y llegar tarde es otro problema — mezclarlos
haría que este aviso no se pudiera apagar nunca.

**Y lo que ya estaba bien y no se tocó:** `endsAt` sigue siendo anulable, que es el caso de
Toabré que el propio §9 nombra —*«allí el emplazamiento simplemente no tiene fecha de
cierre»*—. `densidadDePolinizacion` ya lo trataba así desde A9.9; sólo se le añadió el
comentario que lo dice. Cuando la ventana no tiene cierre, `colmenasDeLaVentana` la cierra en
`ahora`: un servicio abierto se mide hasta hoy, no hasta el infinito.

**Inventario de acceso:** 311→312 y 93→94. **Un solo lector**, porque la aritmética y la alerta
son puras. Que el salto sea de uno y no de tres es la comprobación de que el módulo lee y no
escribe.

## ADR-131 — La jornada abierta se ve en todas las pantallas, y se reclama al día y no a los tres

**Contexto.** El Anexo E §5 dice dos cosas que el código no cumplía. *«Una jornada abierta es
visible en todas las pantallas hasta que se cierra»* y *«si la jornada lleva más de un día
abierta, la app lo reclama»*. Y las dos con un ejemplo: *«Hoy hay una del 13 de septiembre con
cero eventos y sin cerrar, y nada la persigue.»*

**Lo medido el 2026-09-14.** `app/layout.tsx` no tenía **ni una** referencia a `FieldSession`:
la única pantalla que sabía de la visita abierta era la ficha del apiario. Quien abría una
visita y navegaba a otra parte la perdía de vista — que es exactamente cómo se queda una
abierta sin que nada la persiga. Y el umbral era **72 horas**, tanto en el código como en el
texto en español.

**Decisión 1 — 24 horas, y el número vive en UN sitio.** «Más de un día» son 24 h. Tres días
de gracia convertían «la app lo reclama» en «lo reclama pasado mañana». El umbral vive en
`fieldSessions.ts` como `HORAS_DE_JORNADA_VIEJA` y `vitalesDelSitio.ts` lo **reexporta**: dos
constantes para el mismo umbral —una para el aviso del sitio y otra para el banner— acabarían
diciendo cosas distintas de la misma visita, que es el defecto que ADR-126 ya pagó con la
aritmética de la carencia.

**Decisión 2 — el banner va en el layout, no en cada página.** Porque «todas las pantallas»
incluye **las que nadie ha escrito todavía**: ponerlo página a página garantiza que la
siguiente se olvide. Cuesta una consulta por página —`findFirst` con `select` acotado— y sólo
cuando hay sesión: una visita anónima no puede tener jornada abierta, así que la página
pública no paga nada.

**Decisión 3 — dos estados, no uno.** Una jornada de hoy **se recuerda**; una de más de un día
**se reclama**, con su cuenta de días y un color distinto. Pintarlas igual haría que la segunda
se leyera como la primera, que es el defecto que este banner viene a arreglar.

**Decisión 4 — `diasAbierta` redondea hacia ABAJO**, al contrario que el resto del módulo. Aquí
el número se enseña como «lleva N días abierta», y decir «1 día» de una visita de esta mañana
sería falso. Lo que decide el aviso es el umbral, no ese redondeo — y la prueba lo fija en los
dos lados del borde: en las 24 h exactas **todavía no**, un minuto más allá **sí**.

**Y el lector está acotado por construcción, no vigilado.** `jornadaAbiertaDe` filtra
`createdBy` por el propio principal, así que **no puede** devolver la jornada de otra persona.
El inventario de acceso lo clasifica solo —`acotado por construcción`, 32→33— y por eso **no
necesita entrada en el allowlist**. El control que lo demuestra no es un UUID inventado, que
devolvería vacío para cualquiera: son **dos cuentas reales con dos jornadas abiertas en el
mismo sitio**, y cada una ve la suya.

**Dónde se quedó la función, y por qué no donde parecía.** `visitaAbierta.ts` es la familia
natural de esta pregunta, pero **no importa el cliente de Prisma a propósito** —recibe el `tx`
de quien lo llama, y su perfil de acceso lo declara—. Meterla ahí habría cambiado lo que el
inventario dice de ese archivo. Vive en `fieldSessions.ts`, que ya lo importaba.

**Lo que el §5 pide y sigue sin hacerse:** el cierre produce *«resumen de lo registrado, lo que
quedó pendiente»*. El resumen **ya existe** (`resumenDeVisita`, con inspecciones, eventos,
cosechas e inmediatos); **«lo que quedó pendiente» no**. `retirosPendientes` de ADR-121 es la
mitad obvia de esa respuesta y queda nombrada, no construida.

## ADR-132 — La app entra en la jornada abierta; y la vuelta mandaba al apiario a la pantalla de parcelas de café

**Contexto.** El Anexo E §1 empieza así: *«Si hay una jornada abierta, la app entra directo en
ella. Desde ahí: toque 1 → colmena, toque 2 → tipo de evento.»*

**Decisión 1 — una jornada abierta gana a la prioridad por permisos.** La decisión de dónde
aterriza una sesión vive en `/start` desde ADR-082 y sólo miraba permisos. Ahora
`destinoDeEntrada` la antepone: quien tiene una visita sin cerrar está en medio de un
trabajo, y mandarlo a su tablero le cobra un toque para volver. El ejemplo del dueño es el
argumento: *«Hoy hay una del 13 de septiembre con cero eventos y sin cerrar, y nada la
persigue»* es lo que pasa cuando la app no lleva a nadie de vuelta.

**La consecuencia se dice en vez de esconderse:** una cuenta con permisos de plataforma **y**
una jornada abierta aterriza en la jornada, no en su tablero. Es lo que el Anexo pide; el
banner global de ADR-131 deja ver siempre que hay una abierta, así que nadie llega ahí sin
saber por qué. Hay una prueba de ese caso con nombre.

**Decisión 2 — un defecto encontrado midiendo, no razonando.** `app/field-sessions/[id]` se
enlazaba de vuelta a `/plots/<id>` **siempre**, así que una jornada de apiario mandaba a la
pantalla de **parcelas de café**: desde la jornada abierta **no había forma de llegar a las
colmenas**, o sea que el «toque 1 → colmena» del §1 estaba roto antes de empezar.

`rutaDelSitio` resuelve por `locationType`, que es un hecho de la fila y **nunca un parámetro
que elija quien llama** — la misma disciplina que `requireFieldSessionAccess` (A9.0). Y **la
consulta ya traía `locationType`**: el arreglo no cuesta una consulta más.

**Todo lo que no es `apiary_site` sigue cayendo en `/plots`**, que es lo que hacía antes. No se
inventa una ruta para `site` ni `locality`: no existen como pantalla, y mandar ahí sería cambiar
un destino equivocado por otro. La prueba recorre los seis tipos.

**Las dos son puras**, y por eso se prueban sin base: una recibe el id ya resuelto y la otra el
tipo de la fila. Flip-test de las dos, compilando y cayendo por su nombre: quitar la
preferencia por la jornada tumba «una jornada abierta gana a la prioridad por permisos» y «gana
incluso con permisos de plataforma»; devolver el enlace a `/plots` tumba «la vuelta desde la
jornada va al APIARIO cuando el sitio es un apiario».

**Lo que NO entra, y es la mitad del §1.** Queda «toque 2 → tipo de evento» con el formulario
ya resuelto. Eso es ergonomía que **sólo se juzga con el teléfono en la mano y el guante
puesto**, y no se rediseña a ciegas. Lo medido para que la próxima sesión no empiece de cero:
la ficha del apiario tiene **tres `<details>`** que hay que abrir, y la de la colmena ninguno.

## ADR-133 — La lista de apiarios ordenaba por alfabeto entre iguales, así que la prioridad del dueño movía el borde sin mover la tarjeta

**Contexto.** Anexo E §2: *«Orden por urgencia, no alfabético ni por código. Mapa cuando hay
más de un sitio; entrada directa cuando hay uno solo. Lo vencido se ve desde aquí.»*

Tres de esas cuatro frases estaban. La que faltaba es la primera, y faltaba de una forma que
no se ve leyendo la pantalla: **sí ordenaba por urgencia, con un solo criterio.**

**El defecto, medido.** `app/apiaries/page.tsx` ordenaba con dos líneas — `pesoDeAlerta`, que
devuelve tres valores (crítico 0, aviso 1, nada 2), y `localeCompare` del nombre para los
empates. O sea que **entre dos sitios críticos decidía el alfabeto**, que es lo que el Anexo
prohíbe por su nombre.

Y eso choca con la decisión que el dueño tomó el día antes. ADR-127 dejó planteado el orden de
los motivos y él subió `aspersion_anunciada` a la primera prioridad, porque es *«la única
fecha de este tablero que la impone alguien de fuera y que no se puede atender después»*. El
comentario de `alertasDe` dice que ese orden «decide qué grita primero la lista de apiarios».
**Decidía el borde de la tarjeta y no su posición:** un apiario con una aspersión en tres días
quedaba debajo de uno con una visita vencida por empezar su nombre por T. La decisión se
aplicó a medias y nada lo dijo.

**Nada lo vigilaba, y no por descuido: no había qué llamar.** El orden vivía en dos líneas
dentro de un componente de servidor. `pesoDeAlerta` tenía prueba —el peso, que es el primer
criterio—; el orden, ninguna. Es la misma forma que ADR-132: **una decisión metida en JSX no
se puede probar, así que no se prueba.**

**Decisión — `compararPorUrgencia`, puro, con cuatro criterios y el cuarto no es un criterio.**

1. el nivel: crítico, aviso, nada;
2. **el motivo más grave, en la prioridad del dueño** (`MOTIVOS_DE_ALERTA`);
3. **cuántas alertas**, de más a menos — la tarjeta ya enseñaba los tres problemas de un
   sitio; ahora el orden también lo dice;
4. el nombre, **como desempate determinista**. Sin él dos sitios igualmente urgentes se
   barajan entre una carga y otra, y una lista que se mueve sola no se puede leer. Que quede
   cuarto es toda la diferencia entre «alfabético» y «estable», y por eso se dice aquí en vez
   de dejarlo en el código como si fuera lo mismo que había.

El motivo va **antes** que el recuento a propósito: un sitio con una aspersión anunciada va
encima de uno con tres problemas ya ocurridos. Es el argumento del dueño, no una métrica.

**Decisión — la entrada directa va en `destinoDeEntrada` y NO es un `redirect` en `/apiaries`.**
La frase del Anexo pide entrar en el sitio cuando hay uno solo. Construirla al pie de la letra
—redirigir desde la lista— **habría creado el hallazgo que este módulo ya lleva cuatro
veces**, y esto se midió antes de escribir nada: la ficha del apiario tiene **una sola
salida**, un enlace «volver a apiarios», y la navegación global ofrece **sólo** `/apiaries`.
Con la lista redirigiendo, ese enlace rebota a la misma ficha y **`/apiaries/new` deja de ser
alcanzable**: nadie podría crear su segundo apiario. Un mecanismo que no se puede alcanzar se
ve igual que uno que no existe.

Así que la decisión vive donde ya vive la de §1, y **sólo cuando el aterrizaje por permisos es
la lista de apiarios**: a quien lleva café y abejas no se le desvía por tener un apiario. La
condición está dentro de la función y no en el sitio de llamada, que es donde se olvida.
`/start` sólo paga la cuenta cuando hace falta —no hay jornada abierta que gane y el
aterrizaje es `/apiaries`—, y reutiliza `getApiaryList`, que ya autoriza: un `count` propio
sería otra puerta a la misma pregunta y el inventario de acceso cuenta puertas. Sigue en
326/95.

**Decisión — el mapa aparece con dos SITIOS, no con dos pines.** Tres sitios de los que sólo
uno tiene coordenadas siguen llevando mapa, porque ahí la línea «faltan dos» es información y
no un hueco. Con un solo sitio no hay mapa: un pin no sitúa nada respecto a nada y ocupa la
pantalla que en un teléfono es lo único que hay.

**Y tres instrumentos que medían prosa, en un solo cambio.**

El primero no es nuevo, es el mismo de siempre con otra cara. El guardia que comprueba que
cada motivo tiene su texto **leía la unión `MotivoDeAlerta` con una expresión regular sobre el
texto del archivo**, porque `vitalesDelSitio.ts` arrastra `prisma` y el carril hermético no
puede importarlo. Ese detector ya midió **cero motivos** una vez, el 2026-09-14, cuando un
comentario con un `;` cortó la unión. Los motivos pasan a un módulo puro,
`lib/apiary/motivoDeAlerta.ts`, y el guardia **lee un valor**. Sexta vez que hace falta esta
partición, y la primera en que el motivo no es el paquete del navegador sino un guardia.

El segundo lo escribí y cayó en el mismo minuto: el `it` nuevo que comprueba que ese módulo no
importa `prisma` era `expect(fuente).not.toContain("prisma")`, y **la palabra está en el
comentario de cabecera que explica por qué no lo importa**. Ahora mide los `import` sobre el
código sin comentarios, con control positivo: el mismo detector tiene que ver el `import` en
`vitalesDelSitio.ts`, y ahí sale `true`.

El tercero lo encontró un flip-test, y es el más instructivo porque la prueba estaba **en
verde**: quitando entera la línea que quita los comentarios, **las seis pruebas seguían
pasando**. Ninguna tenía un `import` comentado, así que esa línea no la ejercitaba nada — la
trampa del escapado del RSS, que ya está escrita en `CLAUDE.md` y volvió a aparecer. Añadidos
los dos casos, de línea y de bloque, la mutación cae por su nombre.

**Y una cuarta, de ayer, que salió al tirar de este hilo:** la prueba de ADR-132 llamada «gana
incluso con permisos de plataforma» usaba `user:manage_permissions`, **que no existe** — la
real es `platform:manage_permissions`. Pasaba igual porque el aterrizaje lo decidía `lot:view`
que iba al lado, así que el nombre del caso afirmaba algo que la entrada no contenía. La
destapó una prueba nueva que **sí** dependía de la clave, y de paso midió lo que yo suponía
mal: un administrador de plataforma **no** aterriza en un tablero de administración, porque
`/admin/users` no está en `LANDING_PRIORITY`; sin un permiso operativo aterriza en
`/my-nectar`.

**Flip-test de las cuatro decisiones**, cada una en su corrida, compilando y cayendo por su
nombre: sin el criterio del motivo caen «entre dos críticos manda el motivo del dueño» y «una
lista como la del dueño sale por urgencia»; sin el recuento cae la segunda; sin la
comprobación del aterrizaje caen «a quien NO aterriza en la lista de apiarios no se le desvía»
y la del administrador; y sin el despojado de comentarios cae «CONTROL DEL DETECTOR».

**Lo que NO entra.** El «sitio por corregir» que el maquetado del §2 enseña debajo de un
apiario con cero colmenas no es ninguno de los ocho motivos de alerta, y no se inventa: hace
falta saber qué cuenta como un sitio por corregir antes de rotular uno.

## ADR-134 — El inventario del sitio no decía de dónde vino ninguna colmena ni cuándo se abrió, y estaba octavo

**Contexto.** Anexo E §3, y la frase lleva su propia razón dentro: *«Inventario primero,
**porque decide la acción del día**. Flora después. Condiciones e historial al final,
colapsados. La acción vive abajo, al alcance del pulgar.»*

Ese *porque* es comprobable, y las dos mitades fallaban.

**El defecto, medido.** El maquetado del Anexo pone tres líneas en cada tarjeta:

```
C-07  poblada
núcleo Parita · 2 sep
inspección hace 11 d
```

La pantalla enseñaba la primera y media — identificador, estado de la caja, y si hay colonia
o no. **Ni cuándo se abrió por última vez, ni de dónde vino.** Un inventario que no dice cuál
llevas cinco semanas sin abrir no decide ninguna acción: hay que entrar en cada colmena para
saberlo, que son tantos toques como colmenas, y el Anexo entero está escrito contra eso.

**Y los datos ya estaban.** `Inspection.occurredAt` y `Inspection.population` existen desde
A9 (Anexo B §2.2), el origen agrupable desde A9.10 (D6). Nadie los leía en la lista. Es la
quinta vez en este módulo que el hueco no es el dato sino el camino hasta él — con una
variante: aquí ni siquiera había que construir un mecanismo, sólo mirar.

**El inventario estaba OCTAVO**, debajo del formulario de coordenadas, la polinización, los
retiros pendientes, el alcance del alimento, la enjambrazón, los tratamientos y las
irregularidades. Siete secciones que dicen cosas ciertas, y ninguna es lo que se mira al
llegar al sitio con el ahumador encendido. Ahora va justo tras el título, y **el orden
relativo del resto no se toca**.

**Decisión — `vitalesDeColmenas`, el gemelo por colmena de `vitalesDeSitios`.** Dos lecturas,
ninguna escritura, y la misma disciplina del A9.8: **no recibe `userAccountId` a propósito**,
porque quien la llama ya autorizó el sitio con `getApiaryDetail`. Un lector que pide un
principal parece una compuerta y termina usándose como tal.

Y **ninguna cifra sin fila detrás** (Anexo C): todo es `null`-able. «Sin inspeccionar» no es
«hace mucho» y no es cero — y hoy es el estado de casi todo el inventario real, que entró por
guion y nunca se ha abierto desde la aplicación.

**Decisión — el `⚠` sale de lo observado, no de un plazo.** El maquetado marca una sola caja
de las tres, la que dice «débil»; **no** marca la que lleva once días sin inspección. Así que
los días se **ven** y no gritan: convertir «hace mucho» en alerta sería inventar una cadencia
por colmena, y la cadencia de este módulo la declara una persona al cerrar cada visita en
`nextVisitDueAt`, no una constante. Y `null` no avisa: **no observar la población no es
observarla baja** — el campo es opcional por ADR-080, porque una inspección rápida que sólo
mira si la caja sigue viva es legítima.

**Decisión — sólo la colonia viva, y la prueba que lo obliga es de datos reales.** El lector
filtra `endedAt: null`. Sin eso, **NN-0041 y NN-0042 de Finca Rosina** —cajas con patas y
tapa, sin colonia— dirían «inspección hace 3 d» y llevarían un `⚠` de población baja sobre
una caja donde no hay abejas. La prueba de ese caso trae **control positivo de que la
inspección de la colonia muerta existe y es reciente**; sin él, pasaría por no haber nada que
heredar.

**Lo que se enseña cuando hay las dos cosas: la fuente de catálogo, no el tipo.** Los dos
juntos darían «Comprada Parita», que no es castellano. El catálogo es el dato con el que D6
compara un pie contra otro, así que gana el sitio en la tarjeta; el tipo aparece cuando no hay
fuente.

**Inventario de acceso: 326/95 → 327/96**, con sus dos entradas en el allowlist. Cae en
**«depende del llamador»** y no en «acotado por construcción», y la diferencia se dice en el
documento porque es la que importa: `jornadaAbiertaDe` filtra por el propio principal y la
base le impide devolver lo ajeno; éste recibe **ids** que la ficha ya tiene concedidos, y con
un id ajeno devolvería el dato ajeno.

**Flip-test de las cuatro decisiones**, cada una en su corrida, compilando y cayendo por su
nombre: leer la inspección más vieja tumba «lee la inspección MÁS RECIENTE»; quitar
`endedAt: null` tumba «una caja vacía no hereda la inspección de la colonia que se murió»;
avisar también sin población observada tumba «no observar la población NO es observarla baja»;
y cortar el origen de catálogo tumba «trae el origen agrupable del catálogo».

**Lo que NO está probado, y se dice en vez de dejarlo implícito.** El **orden de las secciones
y el renderizado de la tarjeta no tienen prueba**. No hay pruebas de renderizado de páginas en
este repositorio, y una aserción posicional sobre el texto del archivo es exactamente la
trampa que ya me costó una medición —`indexOf` encontró `{...resto}` en mi propio comentario y
no en el JSX—. El lector tiene ocho casos; la disposición tiene el compilador y nada más.

**Lo que NO entra.** La otra mitad del §3: colapsar condiciones e historial, y el
«[Registrar evento] al alcance del pulgar». Es ergonomía, se juzga con el guante puesto, y
mover una sección con una razón escrita no es lo mismo que rediseñar la pantalla a ciegas.

**Y la FLORA MELÍFERA del maquetado tampoco, por una razón distinta y peor: no existe.** No
hay **ningún** modelo de observación de floración en el esquema —comprobado sobre
`prisma/schema.prisma`, cero modelos y cero enums—, y el §4 nombra el formulario que lo
llenaría: *«Observación de floración. Especie, fase fenológica, abundancia, recurso que
aporta.»* Es un hueco de **esquema**, como fue el §8, y su vocabulario es conocimiento del
dueño: qué especies, qué fases, qué escala de abundancia. No se inventa.

## ADR-135 — La invariante de la colocación vivía en un comentario, y diez de las veintinueve colmenas reales no la cumplían

**Contexto.** ADR-126 creó `apiary.hive_placement` para contestar «dónde ha estado esta
colmena y desde cuándo», rellenó una fila por cada colmena que existía entonces, y dejó
escrito —en un comentario— que `createHive` no la abría.

**Lo que pasó con esa nota, que es el ADR entero.** `scripts/apiario-toabre.ts` la creó a
mano, con la nota al lado explicando por qué. `scripts/apiario-las-nubes.ts` y
`scripts/procedencias-y-sitios.ts`, escritos **el mismo día por el mismo camino**, no. Una
invariante en prosa se aplica en el archivo donde se escribió y se olvida en el siguiente.

**Medido el 2026-09-15 sobre la copia local con los datos reales, antes de tocar nada:**

| | |
|---:|---|
| colmenas | **29** |
| con alguna colocación | 19 |
| **sin ninguna** | **10** |

Y las diez son las de **Apiario Las Nubes**. Control positivo en la misma corrida: NN-0041,
del relleno original, sí tenía la suya — sin eso, un cero se habría leído como «la consulta no
mide nada».

**Qué significaba ese hueco.** `apiarioDeColmenaEn` devuelve `null` para esas diez **en
cualquier fecha**, y su propio comentario define ese `null` como «no consta».
`colmenasDeLaVentana` no las cuenta. O sea que **el §9 del Anexo E —la primera pregunta
histórica que el módulo sabe contestar, entregada el día antes— era ciego al apiario real del
dueño.** Y nada fallaba en rojo: la respuesta salía vacía, que se lee como «no hay».

**Decisión 1 — `createHive` es una transacción: colmena, colocación y rastro.** La fecha sale
de `installedAt` cuando la hay —la que alguien **declaró**— y de `createdAt` cuando no, que es
literalmente el `COALESCE(installed_at, created_at)` del relleno de ADR-126. Tener la misma
regla en dos sitios es deliberado: uno es la historia y el otro el futuro.

**Decisión 2 — un ayudante compartido, `crearColocacionInicial`.** Cuatro rutas crean colmenas
—el servicio y tres guiones— y ahora las cuatro dicen lo mismo en una línea. La nota de
`apiario-toabre.ts` que decía «se crea A MANO porque `createHive` no la crea» **dejó de ser
cierta y se corrige en vez de dejarla ahí**: una instrucción vieja es peor que ninguna.

**Decisión 3 — migración de relleno, idempotente por `NOT EXISTS`.** Mira si la colmena tiene
**cualquier** colocación, no sólo una abierta: una colmena trasladada ya tiene su historia
completa, y añadirle una tercera fila desde el origen sería inventar que estuvo en dos sitios a
la vez. No toca el esquema —sólo datos—, así que `migrate diff` sigue diciendo que esquema y
migraciones coinciden. Aplicada en local: **29 de 29**, con el control positivo intacto. Y
comprobado después contra los lectores, que es la prueba que importa: `apiarioDeColmenaEn`
contesta «Apiario Las Nubes» para NN-0043 desde el **4 de septiembre** y para NN-0048 desde el
**2** — las dos fechas que declaró el dueño, no la de creación de la fila.

**Decisión 4 — el guardia es de FUENTE, y por qué no puede ser de datos.** La comprobación
fuerte sería «ninguna colmena sin colocación abierta», y no se puede tener:
`tests/traceability/jornadaEnApiario.test.ts` crea colmenas con `prisma.hive.create` para su
propio montaje, y sobre la base compartida ese montaje **convive con las demás sesiones**. El
guardia se iría a rojo por una prueba ajena en vuelo, que es la peor clase de guardia — enseña
a ignorar una línea roja. Así que se comprueba lo que sí se puede: que **cada archivo que crea
colmenas cree su colocación**, con su límite dicho (mide por archivo, no por línea).

**Y un agujero de rastro que salió al tirar del hilo.** El camino de la aplicación creaba una
colmena **sin AuditEvent**, mientras los tres guiones de datos sí escribían su `hive.create`.
Se añade en la misma transacción, porque esta escritura ya lo era. Consecuencia visible: el
historial de una caja incluye desde hoy su creación, y la prueba de `configuracionDeCaja` pasa
de esperar dos entradas a tres. Eso **es** la mejora: «cuándo apareció esta caja» era una
pregunta que el historial no podía contestar.

**El coste, dicho en vez de escondido: 27 archivos de prueba.** La FK de la colocación es
`RESTRICT`, así que las 27 limpiezas que borran colmenas necesitan borrar la colocación antes.
**Se mantiene `RESTRICT` y no se cambia a `CASCADE`** aunque eso habría ahorrado el diff: en
producción una colmena no se borra —se retira—, y una cascada haría que un borrado se llevara
la historia en silencio. El diff es ceremonia; la cascada sería una pérdida de datos posible.

**Dos pruebas cambiaron de expectativa porque la suya codificaba el defecto**, y eso se dice
porque cambiar una expectativa es lo que hace un arnés complaciente:

* `polinizacion.test.ts` contaba con que una colmena **sin** colocación fuera invisible a la
  ventana. Ahora retira las iniciales y construye su historia entera a mano, a propósito.
* `traslado.test.ts` abría la colocación por su cuenta —con la nota de la deuda al lado—, lo
  que hoy dejaría **dos** colocaciones abiertas: el estado que la base no impide (los `NULL`
  no chocan en un índice único) y el servicio sí.

**Flip-test de las cuatro, compilando y cayendo por su nombre**, y **el cuarto encontró un
defecto en mi propio guardia**: al quitar la llamada de `apiario-las-nubes.ts` el guardia
siguió **en verde**, porque el `import` del ayudante mencionaba el nombre y el detector contaba
la mención. El instrumento midió una línea de importación en vez de una escritura — la misma
forma que ya me costó dos mediciones este mes. Corregido para exigir el paréntesis, con los dos
casos sintéticos que lo ejercitan; ahora la mutación tumba «cada uno crea también su
colocación».

**Inventario de acceso: 327/96 → 328/96**, con dos entradas nuevas para el mismo archivo
porque son dos preguntas distintas — por qué recibe una transacción abierta
(`reciben_transaccion`) y quién autoriza en su lugar (`dependen_del_llamador`).

**Lo que NO entra.** Un índice único parcial que garantice «una sola colocación abierta por
colmena» sigue sin poder expresarse en Prisma, tal como dejó dicho ADR-126; la invariante la
sostiene el servicio en una transacción y la defiende su prueba.

## ADR-136 — El mismo manejo a varias colmenas de una vez, y la línea entre lo que se puede aplicar en lote y lo que no la traza el esquema

**Contexto.** Pedido del dueño, literal: *«cuando entro a apiario poder seleccionar todas las
colmenas para aplicar que se hizo algo que hice igual a todas, y no tener que hacer siempre
una por una»*. En Toabré una alimentación es una bolsa de jarabe sobre los cabezales de cada
caja en la misma vuelta; un tratamiento de varroa se aplica al apiario, porque el ácaro no
respeta cajas.

**No es una idea nueva en el módulo: es terminar una.** El Anexo E §8 ya lo había escrito
para el traslado —*«selección múltiple con atajos, porque nadie toca veinte casillas con
guante»*— y `TrasladoForm` ya tiene casillas, botón de «todas» y un conteo antes de
confirmar. Se reusa el patrón entero, incluido escribir **una fila y un `AuditEvent` por
colmena** como hace `trasladarColmenas`.

**Decisión 1 — sólo `feeding` y `treatment`, y la línea no es de gusto.** `provenanceClassFor`
ya la traza: esos dos son **`original_record`**, y `passing_observation` y `other` son
**`direct_observation`**. Un registro original de algo que **hiciste** en diez cajas son diez
hechos ciertos; una observación directa de diez cajas sacada de una sola mirada, no. Por eso
la **inspección** no entra —el Anexo la marca «(por colmena)», y cuadros cubiertos, reina
vista o patrón de cría son hechos de UNA colonia—, y por eso los otros dos tipos quedan fuera
hasta que el dueño diga qué significa hacerlos en grupo. La prueba que fija esto se llama por
su argumento.

**Decisión 2 — en lote sale MÁS correcto que una por una, y ése es el argumento fuerte.** Los
dos tipos admitidos guardan la fecha que dispara un aviso: `coverageUntil` —hasta cuándo
alcanza el alimento— y la carencia del tratamiento. Tecleadas diez veces se desvían, y diez
cajas que recibieron el mismo jarabe el mismo día acabarían avisando en días distintos. Lo
mismo con `treatmentBatchLabel`: un dedazo en una de diez rompe el agrupado por objetivo que
el Anexo B §4 pide. El lote no es sólo menos toques: es un solo dato en vez de diez copias
que derivan.

**Decisión 3 — lo que NO se relaja por ser en lote.**

* **Una fila por colonia**, nunca una fila por lote: la carencia y las alertas se calculan por
  colonia, y el día que trates 8 de 10 el registro tiene que decir 8.
* **Un `AuditEvent` por fila**, y `ligarAVisitaAbierta` por fila, para que la jornada abierta
  las recoja todas.
* **Una colonia que no está viva no recibe nada**, y el error la nombra por su identificador.
  Son **doce cajas vacías** entre Finca Rosina y Toabré Finca 1: en el formulario se ven —
  esconderlas diría que el apiario tiene menos cajas— y no se pueden marcar.
* **Un lote es de UN sitio.** No porque la base lo impida, sino porque el formulario se ofrece
  desde la ficha de un apiario: aceptar dos sitios haría que el lote afirmara una vuelta que
  nadie dio.

**Decisión 4 — las reglas se EXTRAJERON, no se duplicaron.** `normalizarEventoDeColonia`
recoge las validaciones que ya tenía `recordColonyEvent` y ahora sirve a las dos puertas.
Duplicarlas habría hecho que una regla añadida después valiera para una y no para la otra —
que es **exactamente** cómo la invariante de la colocación se aplicó en un guion y se olvidó
en el siguiente (ADR-135). Hay una prueba que lo fija: un tratamiento sin carencia se rechaza
también en lote.

**Decisión 5 — la clave de reintento se genera en el servidor.** De ella sale una por fila,
`<lote>:<colonia>`. Un id nacido en el navegador cambiaría en cada reenvío, que es justo
cuando hace falta que **no** cambie; sin eso, un «sincronizar» repetido sin señal escribiría
unas dos veces y otras ninguna. Reenviar el mismo lote escribe una vez y **lo dice**
(`yaEstaban`), en vez de callarlo.

**Autorización con todos los ámbitos concretos en juego**, no con uno: las colmenas de un
mismo apiario pueden colgar de proyectos distintos, y pasar sólo el primero rechazaría el caso
normal — el mismo arreglo que ADR-126 necesitó en el traslado. Por eso sube la fila de
**guardia directo** del inventario (220 → 221) y no hace falta entrada en el allowlist.

**Flip-test de las cinco decisiones**, cada una en su corrida, compilando y cayendo por su
nombre.

**Lo que NO entra.** La observación en lote, hasta que el dueño diga qué significa —él la
nombró y la línea de `direct_observation` dice que no es lo mismo—. Y el «nada fuera de lo
normal» sobre varias colmenas, que sí es honesto (es lo que observaste recorriendo el apiario)
pero escribe `Inspection`, no `ColonyEvent`, y merece su propia rebanada.

## ADR-137 -- La lista de apiarios aplanaba una jerarquia que ya estaba en los datos

**Contexto.** Pedido del dueno: *"devuelta a finca o organizacion y ver apiarios bajo ellos
ya sea en lista o mapa"*.

**Esto no construye una jerarquia nueva.** Medido antes de escribir nada:

```
Nectar Nomada / Finca Rosina (site)   / Apiario Finca Rosina    ->  2 cajas
Nectar Nomada / Finca Rosina (site)   / Apiario Las Nubes       -> 10 cajas
Nectar Nomada / Toabre (locality)     / Apiario Toabre Finca 1  -> 10 cajas
Nectar Nomada / Toabre (locality)     / Apiario Toabre Finca 2  ->  6 cajas
```

`Location.parentLocationId` y `Location.organizationId` estaban poblados para los cuatro
apiarios reales, y **`app/apiaries/page.tsx` no nombraba ninguno de los dos en ninguna
linea**: dibujaba ocho apiarios en fila, mezclando duenos. `getApiaryList` tampoco los traia
-- y son dos `select` anidados sobre la consulta que ya hacia, no consultas nuevas. Sexta vez
en este modulo que el hueco es el camino y no el dato.

**Decision 1 -- el grupo es el LUGAR PADRE, y su tipo se ensena.** El padre de Las Nubes es un
`site` (Finca Rosina) y el de Toabre una `locality`. Llamar "finca" a los dos seria rotular
como hecho algo que la fila no dice, asi que el encabezado dice el tipo. Se agrupa por el
padre **y no por la organizacion** porque agrupar por ella daria un solo grupo de cuatro, que
es la lista plana otra vez; la organizacion se ensena al lado.

**Decision 2 -- la urgencia no se pierde al agrupar.** Era el riesgo entero: si agrupar
enterrara un apiario critico debajo de una finca tranquila, habria costado justo lo que
ADR-133 acababa de arreglar. Manda entre grupos y dentro de cada uno, y **el grupo sin lugar
declarado no va al final por serlo** -- a un apiario critico al que le falta el padre no se le
entierra por un dato que falta. Solo cuando todo empata cae detras.

**No se crea una pantalla `/fincas/[id]`, y se dice por que.** Existe `/locations/[slug]`, pero
es la ficha **publica** de descubrimiento: mandar ahi a un apicultor desde su lista operativa
lo sacaria de la aplicacion de trabajo. Una pantalla operativa nueva seria una ruta mas y una
superficie de autorizacion mas para un nivel que hoy no tiene nada propio que ensenar mas alla
del resumen que ya cabe en su encabezado. Cuando el nivel tenga contenido propio -- costos,
un calendario por finca -- tendra su pantalla.

**Un defecto que salio de mirar la salida real, no de releer el codigo.** El encabezado del
grupo rotulaba la organizacion **del primer sitio**. En el grupo "sin lugar declarado" eso
juntaba cuatro sitios de **tres** organizaciones bajo el nombre de una. Ahora se afirma solo si
todos la comparten, con su prueba y su control positivo.

**Y un criterio que no decidia nada, destapado por un flip-test.** El orden entre grupos
empezaba comparando el nivel del sitio mas urgente. Anulandolo, las nueve pruebas seguian en
verde -- y no por una prueba que faltara, sino **estructuralmente**: una alerta critica implica
nivel 0, asi que un grupo con criticas gana tambien por el recuento de criticas, y uno con
avisos por el de avisos. Los dos criterios no pueden discrepar nunca. Se quito, y se anadio la
prueba que si aisla lo que queda. Un criterio que ninguna entrada puede hacer decidir es un
adorno con forma de regla, que es justo lo que `CLAUDE.md` llama peor que ninguno.

**Flip-test de las cinco decisiones que quedan**, cada una compilando y cayendo por su nombre.

**Lo que NO entra.** El mapa por grupo. El mapa sigue arriba y con todos los sitios, porque
**cero de los ocho tienen coordenadas**: un mapa por finca dibujaria hoy cuatro recuadros
vacios, y partirlo antes de que haya algo que pintar seria decidir a ciegas como se ve. La
frase del dueno pide "lista o mapa" y hoy solo una de las dos tiene datos detras.

## ADR-144 — Un ámbito de ubicación alcanza a sus descendientes

**2026-09-16. Decisión de Daniel.**

**Contexto.** El árbol de secado es sitio → instalación → cama (ADR de la
topología, `LocationType.drying_facility` y `drying_bed`). Construyendo la
pantalla de administración se midió que un operario con ámbito sobre la finca
podía crear el invernadero —cuyo padre es el sitio, que sí está en su ámbito— y
**no podía crear las camas de dentro**: el guardia comprueba contra el padre
directo, y el invernadero no estaba en ningún ámbito suyo. Medido antes de tocar
nada: ámbito en el sitio daba `true` sobre el sitio y `false` sobre su hija.

Con el caso real de Cafelino —dos invernaderos y un cuarto oscuro— la alternativa
era una asignación a mano por cada instalación construida. Eso no lo hace nadie,
así que en la práctica las camas sólo las habría creado un administrador de
plataforma.

**Decisión.** Cuando el objetivo de una comprobación es una ubicación, `can()`
resuelve también sus **ancestros**: el permiso concedido sobre una ubicación vale
sobre todo lo que cuelga de ella.

**Qué NO cambia, y es la mitad que importa.** Un **hermano** sigue fuera, y la
contención no va hacia arriba: quien manda en una cama no manda en la finca. Las
dos están fijadas en `tests/rbac/ambitoDeUbicacion.test.ts`, que existe
precisamente por eso — ensanchar una autorización sin fijar dónde termina es como
se abren agujeros.

**Por qué no contradice «las asignaciones contextuales estrechan, no ensanchan».**
Esa regla prohíbe conceder por acumulación lo que ningún ámbito concede. Aquí no se
concede nada nuevo: se reconoce que una ubicación **está dentro de** otra.

**Dónde vive.** En `lib/rbac/service.ts`, no en `resolve.ts`: la jerarquía es un
hecho de la base y el resolutor es puro a propósito. Lleva tope de profundidad
porque un `parentLocationId` en ciclo —que el esquema no impide— colgaría el punto
de estrangulamiento de toda la autorización.
## ADR-138 -- Las dos mitades del cierre de jornada faltaban en la pantalla, y una de ellas existia desde hacia dias

**Contexto.** Anexo E §5: *"Al cerrarla: resumen de lo registrado, **lo que quedo pendiente**,
y de ahi sale el reporte tecnico al cliente"*.

**Medido sobre `main` antes de escribir nada.** La pantalla de la jornada no ensenaba
**ninguna de las dos mitades**:

* `resumenDeVisita` existe desde A9.1 y aparece en **cero** pantallas -- alimenta un mensaje
  de bitacora y nada mas. Cuarta vez en este modulo que un mecanismo existe y no tiene puerta.
* De "lo que quedo pendiente" no habia **nada**, y es la mitad que contesta la pregunta del
  oficio: **abriste cuatro de diez, cuales seis se quedaron**.

**Decision 1 -- que cuenta como pendiente: lo que todavia puedes hacer antes de irte.** Dos
cosas, y las dos se resuelven sin subir al carro: las **cajas del sitio sin ningun evento de
esa jornada** -- el hecho nuevo -- y las **tiras sin retirar**, que `retirosPendientes` ya
sabia leer.

**Lo que deliberadamente NO se repite aqui:** el alimento por vencer y la consulta a vecinos.
Las dos son estado del sitio, ya gritan en su tarjeta y en la ficha, y **ninguna se resuelve
caminando de vuelta a la caja**. Amontonarlas en el cierre haria una pared de avisos que se
aprende a pasar de largo -- justo lo que el Anexo quiere evitar cuando dice que el sistema
"lo reclama solo". Un aviso que no se puede atender donde aparece ensena a ignorar los que si.

**Decision 2 -- los tres caminos cuentan, no uno.** Un evento de campo llega a una colmena por
`inspection`, por `colonyEvent` o por `apiaryHarvestEvent`, y las tres FK las anadio A9.1
justo para poder leer la visita desde su rastro. Si el lector mirara solo las inspecciones,
**una caja alimentada saldria como sin tocar** y el cierre reclamaria trabajo ya hecho. Hay una
prueba por ese caso, y el flip-test la tumba.

**Decision 3 -- el filtro es por JORNADA, no por sitio.** Sin el, los eventos de una visita
anterior harian creer que ya abriste todo hoy. La prueba de ese caso lleva **control positivo**
-- comprueba que la jornada de hoy si tiene dos cajas tocadas -- porque sin el, "cero tocadas
en la otra jornada" lo cumpliria igual un lector que no encuentra nada nunca.

**Decision 4 -- la lista aparece MIENTRAS la jornada sigue abierta, ademas de al cerrar.** El
Anexo la pide "al cerrarla". Ensenarla solo entonces daria una lista de lo que te falta que
aparece **cuando ya no puedes anadir eventos**: la forma en miniatura del hallazgo que este
modulo lleva cuatro veces. Al cerrar se sigue ensenando, como registro de lo que se dejo.

**La caja vacia sigue en la lista, y marcada como tal.** Esconderla diria que el apiario tiene
menos cajas de las que tiene; la cifra que decide si te vas es la de las **pobladas** sin
tocar, y va aparte.

**Flip-test de las cuatro decisiones**, cada una compilando y cayendo por su nombre.

**Inventario de acceso: 329/96 -> 330/97**, en "depende del llamador" -- con un id de jornada
ajeno devolveria el dato ajeno -- y con su entrada en el allowlist.

**Lo que NO entra.** La tercera parte de la frase del §5, *"y de ahi sale el reporte tecnico al
cliente"*, ya existe: `EmitirReporteForm` y `/field-sessions/[id]/report` estan en esa misma
pantalla desde el 2026-09-10.

> **CORRECCION del 2026-09-15, el mismo dia.** Este parrafo decia que "lo que sigue sin existir
> es el **PDF sin almacenarlo** que el Anexo pide al lado". **Es falso, y lo afirme sin
> medirlo.** `PrintButton` existe desde T13 y ADR-039 ya fijo que la impresion del navegador
> **es** el mecanismo entero -- sin libreria de PDF y sin paso de render en el servidor --, y la
> pantalla del reporte de visita lo usa en su linea 56. Lo comprobe al ir a construirlo. Se
> corrige aqui en vez de dejarlo: un pendiente falso manda a la proxima sesion a construir algo
> que ya esta, que es la forma inversa del hallazgo que este modulo lleva cuatro veces.

## ADR-139 -- El informe al cliente decia la clase de cada registro y no de que colmena hablaba

**Contexto.** El dueno lo pidio de frente: *"deberiamos tambien ver como meter el informe,
todos los informes son visita y o inspecciones y acciones o manejos en apiario"*. El §5 del
Anexo E cierra con *"y de ahi sale el reporte tecnico al cliente -- pagina web con enlace"*.

**El reporte existe desde el 2026-09-10** y se congela en un snapshot versionado (A9.6/D7).
**Lo que decia cada linea, medido:** `cuando · clase · sujeto · operador · notas`, donde
`sujeto` era la cadena literal `"inspeccion"`, `"evento_de_colonia"` o `"cosecha"` -- el nombre
de la tabla. O sea que el informe que recibe Kiva Estates por su enlace decia **de que TIPO era
cada fila y no de que caja hablaba ni que se le hizo**. Un informe tecnico asi es un listado de
tipos de fila.

El comentario del codigo explicaba el `sujeto` como "que hecho concreto cuelga de este
registro, **sin exponer el id interno**". El instinto es correcto y estaba aplicado demasiado
ancho: **`NN-0043` no es un id interno**, es exactamente el dato con el que el cliente sigue su
servicio.

**Decision 1 -- el snapshot lleva la colmena y una linea de lo que paso.** `colmena` es el
identificador de la caja cuando el registro cuelga de una colonia; `detalle` es lo que la fila
declara: el resultado de la inspeccion, el producto del tratamiento, el material de la
alimentacion, los kilos de la cosecha. **Nada inventado:** un tratamiento sin producto anotado
da `null`, no "se aplico algo". Y nada de costos -- la cabecera de ese archivo ya fija que no
entran al snapshot, y esto no los cuela por otra puerta.

**Decision 2 -- los dos campos son OPCIONALES en el tipo, y no por comodidad.** El snapshot se
guarda como JSON y se lee de vuelta con un `as`, asi que declararlos obligatorios haria creer a
TypeScript que **todo lo ya emitido los trae**. No los trae: el snapshot es inmutable y no se
reescribe hacia atras. `undefined` ahi es la verdad sobre esas filas, y las dos pantallas los
dibujan condicionalmente. Hay una prueba que reescribe un snapshot guardado quitandoselos --
que es el estado real de lo emitido hasta hoy -- y comprueba que se sigue leyendo.

**Las dos pantallas, y la que importa es la publica.** `/field-sessions/[id]/report` es la del
operador; **`/informe/[token]` es la que abre el cliente con su enlace**, y era la que mas lo
necesitaba.

**Un nombre de campo que me invente, y por que el compilador no lo vio.** Escribi `honeyKg`; el
campo real es `extractedWeightKg`. Paso `tsc` porque el ayudante que lo consume tipaba ese
parametro como `{ honeyKg: unknown }` -- **un `unknown` en el borde apaga la unica comprobacion
que habia**. Lo cazo la corrida, con un `PrismaClientValidationError` que nombraba el campo. El
tipo pasa a ser `Prisma.Decimal | null`, que es lo que la fila tiene.

**Y una prueba que salia verde con el archivo en rojo.** Anadir el tratamiento dejo una fila en
`colony_event`, cuya FK es `RESTRICT`, asi que la limpieza del archivo fallaba al borrar la
colonia: **37 pruebas en verde y el archivo en rojo**. La limpieza se amplia, igual que las 27
de ADR-135.

**Flip-test de las dos decisiones**, compilando y cayendo por su nombre.

**Lo que NO entra.** Las fotos en el informe. `FieldEvent` puede apuntar a un `Asset` y el
snapshot no lo mira; el Anexo §7 dice que la revision de fotos "se hace despues, en telefono o
laptop", asi que meterlas en el informe es una decision del dueno sobre que ve el cliente, no
una que se deduzca del esquema.

## ADR-140 -- Las 44 preguntas del protocolo y el esquema son dos vocabularios sin traduccion, y por eso nadie podia decir cuantas se capturan

**Contexto.** El protocolo de campo del dueno entro como `ProtocolVersion` en A9.4 (D2): 44
preguntas en cinco actividades, con su `stage` -- `field` o `close` -- y su `required`. Medido
el 2026-09-15: **ningun formulario del modulo lo lee**, y la pregunta obvia -- *cuantas de las
44 puede capturar el sistema hoy* -- no la podia contestar nadie.

**El primer intento de contestarla dio una cifra inventada, y se tira.** Compare las claves del
JSON contra los nombres de los servicios y salio "29 sin campo". **La mitad de esos 29 existen
con otro nombre**: `material` es `feedingMaterial`, `frames_covered` es `beeCoveredFrames`,
`varroa_method` vive en `VarroaCount`. El instrumento medía **mi suposicion sobre los nombres**,
no el sistema -- la misma forma que ya me costo tres mediciones este mes, esta vez sobre un
numero que iba a reportar como hallazgo.

**Decision -- el mapa se declara, una entrada por pregunta, y un guardia lo sostiene contra el
esquema.** `lib/apiary/mapaDelProtocolo.ts` dice de cada item si aterriza en un campo de un
modelo, en una tabla propia, o en **ningun sitio todavia**, con el porque en cada caso.

Las dos mitades del guardia, y **la segunda es la que lo hace imposible de falsear**:

1. Ningun item del JSON se queda sin entrada -- anadir una pregunta obliga a decidir donde
   aterriza, o CI se pone en rojo diciendo cual.
2. **Ningun destino declarado es inventado**: el modelo y el campo existen en
   `prisma/schema.prisma`. Sin esta mitad el mapa seria prosa; se podria declarar que la
   humedad va a `ApiaryHarvestEvent.humedad` y nadie lo notaria.

Es la misma forma que el inventario de acceso: cuando no se puede ver lo que hay, se declara y
se vigila que la declaracion no derive.

**Lo medido, ya con el instrumento bueno: 34 de 44 tienen sitio.** Las diez que no:
`purpose`, `weather_observed`, `site_condition`, `hives_present_count`, `travel_cost_usd`,
`probable_cause`, `recommendation`, `assessment`, `efficacy_note`, `moisture_pct`.

**Y de esas diez, exactamente UNA es obligatoria y de patio: `purpose`.** El proposito de la
visita, que el protocolo marca `required` con `stage: field` y que **no se puede guardar en
ningun sitio**. Las otras nueve son opcionales o `stage: close` -- se escriben en casa, que es
lo que el §7 dice que debe pasar.

**El guardia lee el esquema y no `Prisma.dmmf`.** En esta version del cliente el dmmf no viaja
con el paquete y el `import` revienta al cargar, lo que deja el archivo entero en **"no tests"**
-- que en una salida filtrada se lee igual que "no fallo nada". El esquema es la declaracion,
asi que se lee el esquema.

**Y un filtro muerto que quito otro flip-test.** El detector quitaba los comentarios del
esquema antes de buscar. Anulandolo, las siete pruebas seguian en verde: el patron de campo
exige una palabra pegada a la sangria y toda linea de comentario empieza por `/`, asi que
ninguna podia colarse. Se quito -- ademas de no hacer nada, mentia: sugeria que el detector se
defiende de algo de lo que no tiene que defenderse. Es el segundo criterio inutil que un
flip-test destapa hoy, y los dos estaban escritos con su justificacion al lado.

**Lo que este mapa NO dice, y hay que decirlo:** que la pregunta se pueda **responder desde un
formulario**. Dice que el dato tiene sitio donde guardarse. Un campo que existe y que ningun
formulario ofrece sigue siendo un dato que nadie puede escribir; esa es la otra mitad y se mide
aparte.

**Lo que sigue, con su vocabulario ya resuelto.** `purpose` es la unica de las diez que bloquea
el patio, y **el protocolo ya trae sus seis opciones** -- `inspeccion`, `alimentacion`,
`tratamiento`, `cosecha`, `montaje`, `diagnostico` --, o sea que construirla no inventa nada.
Es un `multi_enum` sobre la visita, y el esquema ya tiene el precedente exacto:
`Inspection.broodStages` es un arreglo de enum. Eso es la proxima rebanada, no esta.

## ADR-141 -- El proposito de la visita: la unica pregunta obligatoria de patio que no tenia donde guardarse

**Contexto.** ADR-140 midio las 44 preguntas del protocolo del dueno contra el esquema: 34
tenian sitio y 10 no. De esas diez, **exactamente una** era `required` con `stage: field` --
`purpose`. El protocolo obliga a declarar a que se fue, con el guante puesto, y el sistema no
tenia columna donde ponerlo. Las otras nueve son opcionales o `stage: close`, que es lo que el
§7 dice que debe pasar: se escriben en casa.

**El vocabulario no se inventa: ya estaba.** Los seis valores -- `inspeccion`, `alimentacion`,
`tratamiento`, `cosecha`, `montaje`, `diagnostico` -- salen literalmente de
`protocolos/apiario-campo-v1.json`, item `purpose`, campo `options`. Por eso esta rebanada se
pudo construir sin preguntar nada: el dueno ya lo habia contestado, en el sitio donde vive su
vocabulario.

**Decision 1 -- un arreglo y no una columna.** Una misma ida revisa, alimenta y trata. Obligar
a elegir uno haria que el informe al cliente **mintiera sobre a que se fue**. El precedente
exacto ya esta en este esquema: `Inspection.broodStages` es un arreglo de enum por la misma
razon -- varias etapas de cria a la vez.

**Decision 2 -- el vacio es "sin registrar", no "sin proposito".** Un arreglo de Postgres no es
`NULL`: nace vacio. Las visitas guardadas hasta hoy lo tendran vacio **porque nadie las
pregunto**, no porque no tuvieran proposito -- el tercer estado de ADR-080 aplicado a un
arreglo. De ahi tres consecuencias que se toman juntas:

* **la migracion no rellena nada**: inventar un proposito para las visitas viejas seria
  afirmar lo que nadie declaro;
* **no lleva `DEFAULT '{}'` con `NOT NULL`**, que diria que toda visita vieja fue declarada
  sin proposito;
* **el campo es opcional en la entrada del servicio**, porque exigirlo romperia la cola offline
  de un dispositivo que todavia no lo manda.

Lo que si es estricto es la **frontera**: cuando el campo llega, `exigePropositos` rechaza el
vacio y lo desconocido. Llega como **cadena** del formulario y de la cola, y un `as never`
dejaria entrar cualquier valor del enum -- el fallo que ADR-112 documenta.

**Decision 3 -- se quitan los repetidos, no se rechazan.** Marcar dos veces la misma casilla es
un resbalon del dedo con guante, no una respuesta distinta. Y se devuelve **en el orden del
catalogo**, para que dos visitas con los mismos propositos se lean iguales en el informe.

**Decision 4 -- tres sitios, un vocabulario, y un guardia.** El JSON del dueno, el enum de
Postgres --que es quien lo hace cumplir-- y un modulo puro --lo unico que el formulario puede
importar sin arrastrar `prisma` al navegador, septima vez que hace falta esta particion--. Tres
listas en tres archivos que se editan por separado, que es exactamente la forma que
`valoresEnumerados` vigila para el resto del esquema. **El fallo de la deriva es silencioso en
una direccion:** un proposito anadido al JSON y no al enum no se puede guardar, y el formulario
ni siquiera lo ofrece.

**Y el mapa de ADR-140 se cierra sobre si mismo.** `purpose` pasa de "sin sitio" a
`FieldSession.purposes`, y la prueba que contaba las obligatorias de patio sin sitio pasa de
`["purpose"]` a `[]`. **Que esa lista este vacia es el resultado del trabajo, no la ausencia de
comprobacion**: si manana entra al protocolo otra pregunta obligatoria de patio sin sitio, esa
prueba la nombra. Es la primera vez en este modulo que una medicion construida ayer verifica el
trabajo de hoy.

**Flip-test de las cuatro decisiones**, cada una compilando y cayendo por su nombre.

**Lo que NO entra.** Las otras nueve sin sitio. **Seis** son `stage: close` -- se escriben en
casa, y tres de ellas (`travel_cost_usd`, `probable_cause`, `recommendation`) son las que
convierten una visita en un informe tecnico; el de viaticos es ademas el hueco de costos que ya estaba
nombrado y que no tiene modelo en todo el esquema. Las tres de patio que quedan
--`weather_observed`, `site_condition`, `hives_present_count`-- son opcionales, y ninguna
bloquea cerrar una visita.

## ADR-142 -- Las tres preguntas que convierten una visita en un informe tecnico

**Contexto.** ADR-140 midio las 44 preguntas del protocolo contra el esquema: diez sin sitio.
ADR-141 cerro la unica obligatoria de patio. Estas tres son de las **seis** de casa
--`stage: close`-- y son las que el cliente lee: **viaticos, causa probable y recomendacion**.

**Decision 1 -- van en `field_session` y en el CIERRE, y eso no es una eleccion nueva.** El
comentario de `completarVisita` ya decia que esa funcion *"solo acepta `notes`"* porque un
valor de etapa `field` no se edita desde la casa. Las tres son de etapa `close`: son
exactamente lo que ese cierre debia aceptar desde el principio. Y el §7 lo dice del otro lado
-- *"que los formularios no pidan en el patio lo que puede esperar a la casa"*.

**Decision 2 -- la moneda va en el nombre.** El protocolo dice `travel_cost_usd` y Panama
opera en dolares. Inventar un modelo de monedas para un campo seria construir lo que nadie
pidio; si algun dia hay otra, sera una decision del dueno con su columna. `DECIMAL(10,2)` y no
coma flotante, que es dinero.

**Decision 3 -- cero no es `null`, y por eso la validacion mira la ausencia y no la verdad del
numero.** Una visita a Cerro Azul en carro propio puede costar **cero de verdad**, y ese cero
es un dato; `null` es "nadie lo anoto". Un `!valor` habria rechazado el cero, obligando a
mentir poniendo un centimo -- la misma forma que ADR-115 fijo para la carencia. Un **negativo**
si se rechaza: no existe un viatico de menos ocho dolares, y guardarlo haria que cualquier suma
por sitio mintiera.

**Decision 4 -- los viaticos NO viajan al informe salvo que el contrato los pida, y esa regla
ya estaba declarada antes de que el campo existiera.** `generationQuery.incluyeCostos` nace en
`false` desde A9.6, con su prueba, y no tenia nada que filtrar porque no habia costos. Ahora
los hay y la regla se cumple sola: **lo que no se congela no se puede filtrar mal despues**. Su
prueba lleva **control positivo** -- pidiendolos, si viajan --, porque el `null` por defecto lo
cumpliria igual un campo que nunca se rellena.

**La causa probable y la recomendacion SI van al informe**, en las dos pantallas, y la que
importa es `/informe/[token]`: la que abre el cliente con su enlace. Opcionales en el tipo por
lo mismo que `colmena` y `detalle` (ADR-139): el snapshot es inmutable y lo ya emitido no las
trae.

**`undefined` no toca la columna; `null` la limpia.** Quien completa dos veces sin rellenarlas
no las borra, y quien puso un valor por error puede deshacerlo. Es la misma distincion que ya
usaban `notes` y `nextVisitDueAt` en esa funcion.

**Y la causa probable no es `ColonyLossCause`.** Esa es la causa del **fin** de una colonia,
tiene su propia tabla y admite varias a la vez con su procedencia. Esto es la lectura del
tecnico sobre la visita entera, en prosa. Mezclarlas habria hecho que "por que se murieron"
y "que vi hoy" compartieran fila.

**Flip-test de las cuatro decisiones**, cada una compilando y cayendo por su nombre.

**El mapa de ADR-140 baja a seis huecos**, y la prueba que los nombra no se mueve sola: hay
que contarlos.

> **CORRECCION del 2026-09-15, escrita al verificar la fusion.** Este parrafo decia "baja de
> diez huecos a siete" y estaba **mal dos veces**. Diez fue la cuenta de ADR-140; ADR-141 ya
> habia cerrado `purpose`, asi que al empezar esta rebanada quedaban **nueve**, y cerrar tres
> deja **seis**, no siete. El error salio de contar `hives_present_count` dos veces al
> repartirlas entre "de patio" y "de casa". El codigo estuvo bien todo el tiempo -- la lista
> del guardia tiene seis nombres y paso en CI --; lo que estaba mal era la prosa, que es
> justo lo que nadie vuelve a comprobar. Las seis que quedan: `weather_observed`,
> `site_condition`, `hives_present_count` --las tres de patio, opcionales-- y `assessment`,
> `efficacy_note`, `moisture_pct` --las tres de casa.

**Lo que NO entra, y es el hueco de costos de verdad.** `travelCostUsd` es **el viatico de una
visita**, no un modelo de costos: `LabourEntry` sigue sin llevar ninguno, el material que se
consume no tiene movimiento, y "cuanto cuesta sostener Toabre" sigue sin respuesta. Esta
columna contesta una pregunta del protocolo, no esa. Confundirlas seria dar por cerrado un
hueco que sigue abierto.

## ADR-143 -- Un "sin sitio" del mapa era una afirmacion que nada verificaba, y una de las mias era falsa

**Contexto.** ADR-140 declaro el mapa de las 44 preguntas del protocolo y lo puso bajo un
guardia que comprueba que **ningun destino declarado sea inventado** -- el modelo y el campo
tienen que existir en el esquema. Con eso di por hecho que el mapa no podia mentir.

**Podia, en la otra direccion.** Fui a construir las que el mapa daba por sin sitio y **la
primera que mire ya tenia columna**: `ColonyEvent.treatmentEfficacyNote` existe desde A9.4
**y el cierre de tratamiento la escribe** (`completarCierreDeTratamiento`, con su `tocaNota`).
O sea que `efficacy_note` nunca estuvo sin sitio, y **la cuenta de huecos que publique era mas
grande que la real**.

El guardia no podia cazarlo porque **un `sin_sitio` no lo contradecia nada**: era la mitad no
falsable del instrumento. La mitad que si vigilaba --"los destinos existen"-- es la que protege
contra declarar un campo que no hay; no hay nada simetrico que proteja contra declarar que no
hay campo cuando si.

**Decision -- el guardia mira tambien al reves.** Para cada `sin_sitio` comprueba que **ningun
campo de los modelos de esa actividad se parezca a la clave**, comparando en minusculas y por
inclusion: `efficacy_note` -> `efficacynote`, que esta dentro de `treatmentEfficacyNote`.

Para poder mirar, el mapa declara ahora **a que modelos escribe cada actividad**
(`MODELOS_POR_ACTIVIDAD`). Sin saber donde buscar, "no tiene sitio" no se puede contradecir.

**Es una heuristica sobre nombres y el codigo lo dice.** Puede dar una falsa alarma, y se
resuelve **declarando el destino** -- que es lo que habria que hacer igualmente. Lo que no
puede es dejar pasar el caso que ocurrio: su **control positivo** exige que
`efficacy_note` contra `treatmentEfficacyNote` salte, porque sin el, el `[]` lo cumpliria igual
una comprobacion que no mira nada.

**Y un flip-test encontro que la declaracion nueva no era portante.** Vaciando
`MODELOS_POR_ACTIVIDAD.inspection` las nueve pruebas seguian en verde: hoy ningun `sin_sitio`
de esa actividad tiene un campo parecido, asi que la declaracion **no la ejercitaba nada**. Se
exige aparte que cada actividad del protocolo declare al menos un modelo y que esos modelos
existan. Es la tercera vez esta semana que un flip-test destapa una linea escrita con su
justificacion al lado y sin nada que la ejerza.

**La cuenta, medida sobre el mapa y no de memoria: 38 con campo, 1 en tabla, CINCO sin sitio.**
`weather_observed`, `site_condition`, `hives_present_count` --las tres de patio, opcionales-- y
`assessment`, `moisture_pct` --las dos de casa.

**Lo que esto le hace a las cifras que publique.** Las tres de ayer --ADR-140 "diez",
ADR-141 "nueve", ADR-142 "seis"-- se midieron todas con el instrumento que no comprobaba los
`sin_sitio`, asi que **todas iban una de mas**. No se reescriben: quedan con esta nota, porque
lo que importa no es el numero de ayer sino que hoy se pueda contradecir.

**Lo que NO entra.** Construir las cinco. `moisture_pct` tiene ademas una pregunta abierta que
no es de forma sino de diseno: `moisture` **ya es una variable canonica de medicion** en este
esquema, asi que la humedad de la miel podria ser un `Measurement` en vez de una columna. Esa
eleccion cambia como se consulta la serie y merece decidirse aparte, no de paso.

## ADR-145 -- El meliponario es un tipo de sitio, no un modulo aparte ni una especie

**Nota de numeracion.** Esto se publico primero como ADR-144 y colisiono: ese numero ya lo
tenia "Un ambito de ubicacion alcanza a sus descendientes", que estaba en la base de esta misma
rama. No se vio porque este archivo **no esta en orden numerico** --el 144 vivia en la linea
9865, antes del 140-- y la lista de encabezados se leyo cortada a las cuatro ultimas. Una salida
truncada se lee como el mundo entero. Se renumero este, que era el recien llegado y el que menos
citas tenia (13, todas de su propia rebanada, contra 3 del otro).

**Contexto.** El dueno va a instalar abejas sin aguijon: cinco especies panamenas, minimo dos
colonias de cada una, traidas de Parita e instaladas en Cerro Azul. Su decision, literal:
"diria tener meliponiarios y tener apiarios separado aunque el apicultor tiene acceso a ambas
si se configura asi". Y sobre donde: "pueden haber apiarios por lote de finca rosina y tambien
bajo beneficio las nubes".

**Lo que se midio antes de decidir.** El modulo A9 entero **da por supuesto que son Apis**: la
caja es Langstroth (camaras, alzas, cuadros), la plaga es varroa, la revision cuenta cuadros
cubiertos. Y `"apiary_site"` estaba afirmado **a mano en diez sitios** del codigo -- servicios,
navegacion, pantallas -- cada uno comparando la cadena por su cuenta.

**Las tres opciones que habia, y por que esta.**

- *Modulo aparte.* Duplica sitio, colmena, colonia, traslado, cosecha, jornada, informe. El
  manejo difiere; la contabilidad de "una caja que ocupa un sitio durante un periodo" no.
- *Nada: un `apiary_site` mas.* Gratis hoy y falso manana -- un listado de apiarios mezclaria
  Langstroth con INPA, y el traslado dejaria mover una melipona a un apiario de Apis.
- *Un tipo de sitio propio, hermano.* Es lo que se hizo.

**Decision -- `meliponary` entra como valor de `LocationType`**, hermano de `apiary_site`, y
**todo el codigo deja de comparar cadenas**: `lib/apiary/sitioDeAbejas.ts` es el unico sitio
donde viven los dos nombres. `TIPOS_DE_SITIO_DE_ABEJAS` es la familia, `esSitioDeAbejas` el
predicado, `exigeTipoDeSitioDeAbejas` la puerta de entrada. Los diez sitios pasan por ahi.

Anadir un valor a un enum de Postgres **es aditivo y no convierte nada**: ningun sitio existente
cambia de tipo, ninguna consulta de hoy devuelve algo distinto. Por eso la migracion es una
linea.

**La familia se lista junta y se maneja separada.** `getApiaryList` devuelve los dos tipos --el
apicultor con acceso los ve en una lista, que es lo que el dueno pidio-- y el traslado **exige
el mismo tipo en origen y destino**: no se puede mover una caja INPA a un apiario de Apis, ni al
reves, y `destinosCandidatos` ni siquiera los ofrece.

**Lo que esto habilita hoy y no antes.** Un meliponario puede **colgar de un lote**
(`parentLocationId`), porque el dueno los reparte "una entre cada cuantos bloques dentro de
parcelas" y ademas "muchas juntas bajo el techo" del beneficio. Las dos formas son el mismo
objeto con distinto padre, y la vista agrupada (ADR-135) las dibuja sola.

**Lo que NO entra, y es la mitad que falta.** **La especie.** No hay tabla `Species`, ni
`Colony.especie`, ni guardia que impida a un meliponario heredar varroa o cuadros. Eso necesita
los cinco nombres con su procedencia, y hasta que existan seria inventar taxonomia -- que es
justo lo que la casa prohibe. El tipo de sitio es la pieza que **no** depende de esos nombres, y
por eso va primero.

**Un guardia nuevo de arquitectura**, `tests/arquitectura/un-solo-predicado-de-sitio.test.ts`:
nadie vuelve a escribir `=== "apiary_site"` fuera del predicado. Su control positivo distingue
**comparar** de **mencionar**, porque el propio predicado nombra la cadena y no debe saltar.

**Cinco flip-tests, los cinco compilando.** El tercero --fijar los destinos a `"apiary_site"` en
vez del tipo de origen-- hubo que **rehacerlo**: la primera version usaba un simbolo sin
importar, no compilaba, y una mutacion que no compila se lee como un guardia que funciona.

## ADR-146 -- Las fuentes de Cerro Azul entran al repositorio, y lo que faltaba era una fuente que otro documento mandaba leer

**Contexto.** El dueno pidio que la investigacion preparada sobre Cerro Azul no se perdiera:
"esto no quiero que se pierda que fue mucha investigacion y preparacion para que tengas, y
armes tu support documents que mas adelante esto servira mas alla del build como data de
referencia".

**Lo que se midio antes de mover nada.** Cuatro documentos vivian **solo en `~/Downloads`**:
las dos versiones de la minuta del 18 de julio de 2026, la minuta ejecutiva del 6 de agosto, y
el marco de investigacion suelo-ambiente-taza. Las cadenas **`Noria mix`**, **`Inversiones
Melissa`**, **`lejia`** y **`cal agricola`** salian **cero veces** en todo el arbol, con control
positivo --`Finca Rosina` en 49 archivos y `biochar` en 51, asi que la busqueda miraba bien--.

**Y habia un hueco de referencia, que es el hallazgo.**
`docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md` dice de si mismo "No lo sustituye ni lo
resume" y ordena "**Leer primero:** el propio marco, §15, §10, §14.1". **Ese marco no estaba en
el repositorio.** O sea: un plan que manda leer una fuente ausente, y nadie lo habia notado
porque el plan si estaba y se lee como completo.

Control de identidad, porque "el documento con ese titulo" no basta: `45_S1` cita **13.345
palabras** y la extraccion del `.docx` da **13.345 exactas**. Es ese documento y no otra version.

**Decision -- entran como `FUENTE_*` en `docs/architecture/`, verbatim y con cabecera de
procedencia.** Cinco archivos: los cuatro documentos mas un **indice** que mapea que hecho
operativo vive en cual.

- **No se resumen.** La minuta en markdown se copia literal; los dos PDF y el `.docx` van como
  **extraccion de texto**, y su cabecera lo dice: una tabla extraida pierde la cuadricula, asi
  que si una linea parece descolocada **manda el original**. Llamarlo "el documento" cuando es
  una extraccion es como se cita una tabla que nadie leyo.
- **El prefijo `FUENTE_` no es decoracion.** Estos son **registros**, no decisiones de
  arquitectura, y comparten carpeta con 44 documentos que si lo son. Sin el prefijo, el
  siguiente que abra la carpeta los lee como arquitectura.
- **No se editan.** Una correccion va como nota del dueno, fechada, al final -- la misma regla
  que `docs/beneficio/` ya usa cuando una decision suya contradice un documento normativo.

**El vocabulario que estas fuentes fijan, y que el esquema confunde.** El **retort** es el
horno; la **noria** es la piscina donde el carbon se vuelve biochar **activo**, inoculado con
agua, hoja triturada y gallinaza fermentada. Son dos pasos separados **en el tiempo**: la minuta
del 6 de agosto dice "ya se cuenta con carbon seco, pero falta que Bob prepare la mezcla de la
noria".

**Los cuatro conflictos se SENALAN y no se resuelven**, y estan en la §4 del indice:

1. **Las dos versiones de la misma minuta discrepan en los anos de cosecha** -- "harvesting
   **2029**-2033" en ingles, "cosechando **2031**-2033" en la espanola revisada para Chris.
   Misma reunion. Lo resuelve el dueno.
2. **Las DOS norias no estan en ningun documento.** El dueno dijo que hay dos, "una de un
   tamano, y otra doble", y que el detalle estaba en las minutas. **No esta**: siete ocurrencias
   de "noria" en los cuatro documentos, todas la receta o la tarea de Bob, y el marco tiene 88
   menciones de "biochar" y **cero** de "noria". Queda anotado como dicho del dueno sin
   documento, y con eso no se declaran capacidades.
3. **`BiocharBatch` mete el retort y la noria en la misma fila** -- regimen termico y activacion
   juntos, cuando la operacion los separa en el tiempo y una noria podria recibir carbon de
   varias quemas.
4. **La aplicacion al cultivo no existe.** Un lote se enlaza a `Asset`, `Measurement` y
   `TreatmentBatch`; ninguno llega a plantones, y el dueno dijo que una misma microparcela puede
   tener plantones con batches distintos -- lo que obliga a fila propia, no columna.

**Lo que NO entra: nada de implementacion.** Esto es entrada de planificacion aceptada, no una
orden de construir. Las piezas del biochar --la noria con identidad, las cantidades de entrada y
salida, la aplicacion como fila propia, y la receta con cantidad por ingrediente-- quedan
nombradas y sin construir.

## ADR-147 -- Entre dos versiones de una minuta manda la ultima revisada, y la superada se queda

**Contexto.** ADR-146 trajo al repositorio las fuentes de Cerro Azul y dejo cuatro conflictos
senalados sin resolver. El primero: las **dos versiones de la misma reunion** del 18 de julio de
2026 discrepan en los anos de cosecha -- la inglesa dice "harvesting **2029**-2033", la espanola
revisada para Chris Huerbsch dice "cosechando **2031**-2033". Mismo objetivo de 20.000 plantones
para 2030, misma reunion, mismo redactor.

**Decision del dueno, literal:** "La ultima revision de minutas sera la que debe actualizar,
puede quedar historial que se penso antes pero la revisada es la version que importa ahora."

Asi que **vale 2031-2033**. Pero lo que se registra aqui no es ese numero: es la **regla**, que
sirve para cualquier par futuro y evita tener que preguntarselo otra vez.

**Lo que la regla implica, y es la mitad que no es obvia: la version superada NO se corrige.**
Se le pone una **nota del dueno fechada al final**, y su cuerpo se queda diciendo lo que decia.
Hecho en `FUENTE_CERRO_AZUL_MINUTA_2026-07-18.md`, que sigue diciendo 2029 a proposito.

Tres razones, y la tercera es la que decide:

- El dueno lo pidio asi -- "puede quedar historial que se penso antes".
- Es el mecanismo que **esos archivos ya declaraban** en su cabecera: "No editar el cuerpo. Una
  correccion va como nota del dueno, fechada, al final". Esta es su primera aplicacion, y el
  mecanismo aguanto sin inventarse nada.
- **Corregir el cuerpo destruiria la evidencia de que hubo un cambio de criterio.** Un archivo
  donde las dos versiones coinciden no se distingue de uno donde nadie reviso nada, y quien lo
  lea dentro de un ano no sabra que 2029 se llego a pensar. Es la misma razon por la que aqui no
  se reescriben las cifras equivocadas de un ADR viejo: se les pone la nota al lado.

**Como se sabe cual es "la ultima revisada", que no es lo mismo que la mas nueva.** La espanola
es **revision** de la inglesa -- misma reunion, mismo dia, ampliada y revisada para Chris. Una
minuta de **otra** reunion, como la ejecutiva del 6 de agosto, es mas nueva y **no** supersede
nada: es otro documento. La regla compara versiones de una misma reunion, no fechas.

**Lo que NO entra.** Un guardia. Hoy hay **un** par de versiones en el repositorio y una sola
nota; un detector de "minutas de la misma reunion" sobre ese corpus no tendria nada que
distinguir, y una prueba que recorre datos reales que no ejercitan la transformacion vale como
red para el dia que lleguen, no como guardia. Si aparece un segundo par, ahi tiene sentido.

## ADR-148 -- Con que se alimento deja de ser texto libre, y "otro" tiene que decir cual

**Contexto.** El dueno, en el apiario el 2026-09-16 y con la aplicacion abierta: *"yo quiero que
todos los campos, lo mas que se pueda, no sea campo libre de texto libre, que sean variables
como le alimente con azucar morena o azucar blanca o con melaza o con miel de abeja miel de
cana... y bueno, si hay algo que no entra, puedes poner otro y que uno pueda llenar, que es ese
otro"*.

**Lo que se midio antes de construir nada**, porque el pidio comprobar si ya estaba: de los
campos de manejo de campo, **ya eran vocabulario** el metodo de alimentacion, el objetivo y la
via del tratamiento, el origen de la colonia, el motivo de traslado, la causa de perdida, el
proposito de la visita, el motivo de alerta, las irregularidades, la poblacion, las reservas,
los estadios de cria y el tipo de realera. **Seguian en texto libre** `feedingMaterial`,
`feedingUnit`, `treatmentProduct`, `treatmentDoseUnit`, y dos duplicados de campos que ya tenian
vocabulario al lado (`storesLevel`, `pestDiseaseFlags`). Este ADR cierra **el primero**, que es
el que el dueno nombro.

**Decision -- una columna NUEVA, no una conversion.** `feedingMaterialKind` es el enum;
`feedingMaterial`, el texto de siempre, **se queda**. Convertir la columna de texto a enum
exigiria traducir lo ya escrito en produccion, y **esa base no se puede leer desde aqui**. Anadir
un tipo y una columna anulable es aditivo: ninguna fila cambia, ninguna consulta de hoy devuelve
algo distinto.

El texto no queda obsoleto: pasa a ser **el "cual" de `otro`**, y a la vez lo que se escribiera
antes del vocabulario. Es la misma forma que `ColonyOriginType.other` + `originNote`, que ya
existia.

**Los cinco valores son del dueno, literales, y no se anadio ninguno mas** -- ni candy, ni
sustituto de polen, ni jarabe invertido, que cualquier manual listaria. Un desplegable con
opciones que en esta finca nadie usa ensena a bajar hasta "otro", y entonces el vocabulario deja
de leerse. Cuando el alimente con algo nuevo, se anade entonces.

**En espanol, como `FeedingMethod`**, que es su hermano en el mismo formulario. `ColonyOriginType`
esta en ingles y no se toca: cambiarlo seria un renombrado que nadie pidio.

**Tres reglas, y la tercera es la que el dueno pidio explicitamente:**

1. **Alimentar sin declarar con que NO es un error.** `null` es "sin registrar" (ADR-080), y
   bloquearlo perderia la captura entera en campo -- peor que un registro al que le falta un dato.
2. **Un valor del vocabulario admite texto al lado**, como precision: "miel de cana, de la finca
   de al lado" no es una contradiccion.
3. **`otro` EXIGE decir cual.** Un "otro" en blanco no es informacion: es la respuesta vacia que
   ADR-125 persigue, disfrazada de dato.

**Viaja por la cola sin senal.** `lib/sync/pushFieldEvents.ts` lo lleva. Sin eso el desplegable
funcionaria en linea y se perderia **justo en campo**, que es donde se usa.

**El mapa del protocolo pasa a apuntar al enum y no al texto.** Si siguiera apuntando a
`feedingMaterial`, diria que esta capturada una pregunta que ahora se contesta con un desplegable.

**Cuatro flip-tests, los cuatro compilando** -- y dos hubo que rehacerlos. El de "quitar un valor
del vocabulario" **no compila**, y la razon merece quedar escrita: quitar un valor **estrecha la
union de tipos**, y la prueba nombra `"miel_de_cana"` como literal. O sea que la pertenencia al
vocabulario **la protege tambien el compilador**, no solo la asercion. El flip valido fue cambiar
el ORDEN, que no estrecha nada.

**Lo que NO esta guardado todavia, dicho para que nadie lo cuente como hecho:** que
`feeding_material_solo_en_alimentacion` salte de verdad al escribir, y que el campo llegue por la
cola sin senal. Las dos reglas existen en el codigo y **ninguna tiene prueba**: cruzan la frontera
del servicio y van con las de `colonyEvents` contra Postgres.

**Y lo que queda del encargo del dueno:** el vocabulario de **productos de tratamiento** y el de
**limpieza fitosanitaria** -- que ademas **no existe como tipo de evento**: `ColonyEventType` tiene
cuatro valores y ninguno es limpieza. Los dos estan bloqueados en el, porque que productos usa y
que actos de limpieza hace no estan en ningun manual.

## ADR-149 -- Dar de alta colmenas en lote, con prefijo, vista previa y todo-o-nada

**Contexto.** El dueno abrio la aplicacion en el apiario el 2026-09-16, los apiarios salieron, y
lo que faltaba era registrar **cinco colmenas en cada uno**. El unico camino era `NewHiveForm`,
que crea **una**: cinco envios por apiario, diez en total, tecleando el identificador cada vez.
Es literalmente lo que el ya habia pedido antes --"no tener que hacer siempre una por una"--
resuelto entonces para tratar y alimentar (`registrarEventoEnLote`, ADR-136) y no para dar de alta.

**Decision -- una transaccion, todo o nada.** Un alta en lote a medias es peor que ninguna: deja
al dueno sin saber cuales de las cinco entraron, y el segundo intento choca con las que si.

**Los identificadores se comprueban DENTRO de la transaccion, no antes.** Comprobar fuera deja
una ventana en la que otra sesion crea `LN-03` y este lote la pisa con un choque de clave unica
**a media escritura** -- que es el mismo estado que la transaccion venia a impedir. Y el error
dice **cuales** estan repetidos, no solo que algo fallo: "ya existe alguno" obliga a adivinar.

**La vista previa no es adorno: es la respuesta a una pregunta de diseno que no se puede acertar.**
El relleno de ceros depende del esquema que el dueno ya usa --tiene colmenas de tres cifras
(`H-014`)-- asi que en vez de adivinarle el ancho, el formulario le ensena **los identificadores
exactos** antes de enviar, calculados con la **misma funcion** que valida en el servidor. Si no
son los que quiere, cambia el prefijo o el numero y lo ve al momento.

Por la misma razon **el separador va dentro del prefijo**: `"LN-"` da `LN-01`, `"LN"` da `LN01`.
Anadirle un guion por nuestra cuenta es como se parte una numeracion en dos familias que no
ordenan juntas.

**El relleno va al ancho del numero mas grande del lote, con minimo de dos.** Con ancho fijo, un
lote de 8 a 11 daria `LN-8, LN-9, LN-10, LN-11`, que como texto ordena 10, 11, 8, 9 -- y en una
lista se ordena como texto.

**La colonia es opcional y EXPLICITA, y eso no es pereza.** `CreateColonyInput.originType` no
tiene valor por omision a proposito: su propio comentario lo llama *"a capture-or-lose-it fact"*.
Crear N colonias de oficio obligaria a **inventarles un origen**. Cuando el dueno marca la
casilla, afirma que las N vienen del mismo sitio --cierto cuando llegan juntas, y el lo sabe--;
cuando no la marca, se crean cajas vacias y la colonia se anade despues, colmena por colmena,
donde cada una puede decir su propia verdad.

**Cada colmena nace con su colocacion** (ADR-135): esto **llama** a `crearColocacionInicial`, no
repite su cuerpo. Una colmena guardada sin colocacion es el estado que aquel ADR vino a impedir, y
un camino nuevo que lo olvide lo reabre sin que nada se ponga rojo.

**Un AuditEvent por colmena, no uno por lote.** Agruparlos haria que una consulta por `entityId`
encontrara el alta individual y no esta, y el audit dejaria de responder "quien creo esta colmena"
para la mitad de ellas.

**El techo es 50, y no es redondo por gusto.** El dueno instala cinco por apiario y el plan mas
grande de sus minutas son diez. Cincuenta deja sitio de sobra y convierte un cero de mas al
teclear --500-- en un error visible en vez de en quinientas filas. Una prueba exige que el techo
no baje de diez, para que nadie lo apriete por debajo de lo que el instala.

**El modulo se partio en dos.** `identificadoresDeLote.ts` es puro; `altaEnLote.ts` tiene `prisma`.
El formulario es `"use client"` y necesita la funcion para la vista previa: importarla del servicio
arrastraria `lib/db` --y `pg`-- al navegador y rompe el build. Es la misma division que
`vocabularioDeTratamiento` / `objetivoDelTratamiento`, y la vigila
`tests/arquitectura/cliente-sin-prisma.test.ts` -- comprobado, 71 en verde.

**Cinco flip-tests, los cinco compilando, y el quinto hubo que rehacerlo.** La primera version
--`input.colonia ?? true`-- **no compilaba** y tumbo **seis** pruebas, que es la senal de
sospechar del arnes y no del codigo. La valida inventa los valores a mano
(`originType: input.colonia?.originType ?? "other"`), compila, y cae **una sola** prueba: el
control negativo "sin declararla, las colmenas nacen VACIAS".

**Lo que NO entra.** Dar de alta en lote **sin senal**. Es en linea como `NewHiveForm`, por la
misma razon: dar de alta el inventario de un sitio se hace una vez, no con el guante puesto.

## ADR-150 -- Cajas presentes: lo que alguien conto contra lo que el sistema tiene colocado

**Contexto.** El Anexo E pregunta *«Cajas presentes»* en la etapa de campo, y el mapa del protocolo
la daba por **sin sitio** desde ADR-140, con la razon ya escrita: *«Las cajas presentes se cuentan
hoy desde `Hive`, no se declaran. Contar y declarar son datos distintos: el segundo es lo que
alguien vio.»* **Esa razon es exactamente la que la construye**, no la que la posterga.

**El problema medible.** `HivePlacement` sabe cuantas cajas **coloco** en un sitio. Eso no es
cuantas **hay**: una caja puede irse --robada, movida por un vecino, prestada-- sin que nadie
registre el traslado. Hoy el sistema **no puede ni notarlo**.

**Decision -- `FieldSession.hivesPresentCount`, hermana de `coloniesAliveCount`.** Un entero
anulable, capturado en el cierre de la visita, al lado de las colonias vivas. No es lo mismo: **una
caja puede estar ahi vacia.**

**Y aqui NINGUNO de los dos manda, a diferencia de las colonias.** Para colonias vivas la regla de
`polinizacion.ts` es explicita --*«ese conteo declarado manda cuando existe»*-- porque el sistema no
sabe cuales murieron: una colonia muere sin que nadie lo apunte. Para cajas esa regla no vale:
`HivePlacement` **si** es un registro deliberado, asi que ninguno de los dos es obviamente mejor.

Elegir uno **esconderia la senal**. Asi que la salida de `compararCajasPresentes` **no es un numero:
es la comparacion**. Se sigue la mitad de `polinizacion.ts` que si aplica --*«el que no manda NO se
tira»*--: los dos viajan.

**El estado tiene TRES valores y no es un booleano.** Un `divergen: boolean` diria `false` cuando
nadie conto, y `false` se lee como «coinciden» cuando significa «no lo se». Es ADR-080 aplicado a un
**valor derivado**: `sin_recuento | coinciden | divergen`.

**La diferencia lleva signo.** Un `-2` es «faltan dos de las registradas» y un `+2` es «hay dos que
el sistema no tiene»: son problemas distintos --una caja perdida contra una caja sin registrar-- y
un valor absoluto los meteria en el mismo aviso. Su flip-test lo confirma: poner `Math.abs` tumba
el caso que motiva todo esto.

**Cero declarado es valido y no es «sin recuento».** Un apiario vaciado se cuenta como cero, y ese
cero es un dato -- confundirlo con «no conte» perderia justo el caso mas grave. Por eso la guarda es
`declaradas == null` y no `!declaradas`; el flip-test 3 lo demuestra.

**Y no se pinta un «coinciden».** `avisoDeCajas` devuelve `null` cuando no hay nada que decir: decir
«todo bien» en cada visita entrena a no leer el aviso.

**La lista de huecos del protocolo baja de CINCO a CUATRO** --quedan `weather_observed`,
`site_condition`, `assessment` y `moisture_pct`--. El guardia de ADR-143 **obligo a declararlo**: la
prueba fija la lista, asi que la cuenta no pudo cambiar en silencio. Y al revertir el mapa a
`sin_sitio`, el flip-test 5 lo caza **por dos guardias** a la vez, incluido el que comprueba que un
`sin_sitio` no miente -- porque ahora existe un campo que se parece a la clave.

**Lo que NO entra.** El aviso en la ficha del sitio. `compararCajasPresentes` y `avisoDeCajas`
existen y estan probadas, pero **ninguna pantalla las llama todavia**: lo que entra aqui es que el
dato se pueda capturar y que la comparacion exista. Pintarla es una pieza propia, y se dice aqui
para que nadie la cuente como hecha.

## ADR-151 -- La divergencia de cajas se ve: alerta de sitio, nivel aviso

**Contexto.** ADR-150 construyo `compararCajasPresentes` y `avisoDeCajas`, con sus nueve pruebas, y
**dijo explicitamente que ninguna pantalla las llamaba**. Eso es el patron del que este repositorio
se queja de haber repetido **tres veces en una semana** --lo dice la cabecera de
`scripts/cargar-protocolo-de-campo.ts`: *«el servicio hecho y la puerta sin poner»*--. Este ADR pone
la puerta.

**Decision -- va como ALERTA del sitio, no como un vital mas.** Un vital es una cifra que se
consulta; esto es **una razon para ir a mirar**, que es lo que el mecanismo de alertas ya modela. El
hermano mas cercano es `perdida_sin_reposicion`: tambien una discrepancia, tambien algo que pide
accion.

**Nivel `aviso` y no `critico`, y la razon es la que decide.** La divergencia es **ambigua por
construccion**: puede ser una caja que se fue sin registrarse, o un recuento mal hecho.
`perdida_sin_reposicion` es critica porque unas colonias murieron de verdad; esto es «ve a mirar».
**Subir una senal ambigua a critica es como se ensena a ignorar lo critico**, y este tablero ya
tiene cinco motivos criticos compitiendo por el borde de la tarjeta.

**Sin recuento NO alerta.** Avisar de que nadie conto seria avisar de una ausencia que el propio
protocolo marca **opcional** (`"required": false`). Y «coinciden» tampoco se pinta: decir «todo
bien» en cada visita entrena a no leer el aviso.

**El motivo nuevo va AL FINAL del arreglo de prioridad, y eso no es pereza.**
`lib/apiary/motivoDeAlerta.ts` dice de si mismo que el orden es *«la prioridad que fijo el dueno el
2026-09-14»* y que **«se cambia con el dueno delante y no al pasar»**. El final es la unica posicion
que **no reordena ninguno de los ocho** que el decidio. **Donde debe ir de verdad es decision suya**
y queda abierta; el flip-test 4 comprueba que colarlo al principio salta.

**La cuenta del sistema es `Hive.locationId` y no `HivePlacement`, medido y no supuesto.**
`trasladarColmenas` cierra la colocacion abierta, crea la nueva **y** actualiza `Hive.locationId`
**en la misma transaccion**, asi que no pueden divergir. Comprobado el 2026-09-17 contra la base
compartida: **29 colmenas, 0 sin colocacion abierta, 0 divergentes**. Y `vitalesDeSitios` ya carga
las colmenas, asi que no hace falta consulta nueva.

**Dos guardias existentes obligaron a declarar el cambio**, y ninguno lo tuve que recordar yo: el
que exige texto en los dos idiomas para cada motivo, y el que **fija la cuenta del arreglo en ocho**.
El segundo es de los buenos: cambio a nueve con la razon escrita al lado.

**Y un flip-test encontro un agujero real.** Vaciar el filtro que lee `hivesPresentCount` de la
sesion mas nueva **no rompia NADA** --«NADIE CAYO»--: las pruebas de alerta trabajan sobre un
fixture en memoria, asi que **la lectura contra la base no estaba cubierta**. Se anadio una prueba
con DOS sesiones --una vieja con un recuento que no debe ganar y una nueva que si-- para que la
regla de «la mas nueva que lo traiga» tambien sea falsable. Rehecho el flip: cae una sola prueba,
por su nombre.

**Nota sobre el flip-test 3, para que nadie lo lea mal.** Hacer que la alerta salte con
`!== "coinciden"` tumbo **diez** pruebas, que normalmente es la senal de sospechar del arnes. Aqui
es legitimo: `sin_recuento` es el estado del sitio sano del fixture, asi que esa mutacion hace
alertar a **todos** los sitios y rompe cada prueba que espera una lista exacta. El control negativo
cayo entre ellas, por su nombre.

## ADR-152 -- Clima observado, y el guardia que ata el protocolo al esquema

**Contexto.** El mapa del protocolo daba `weather_observed` por **sin sitio** con esta nota:
*«Sin columna. El Anexo C lo pide como vital del sitio y lo deja en una capa externa sin proveedor
conectado.»*

**Esa nota confunde dos preguntas distintas**, y por eso el hueco no era un hueco:

| | |
|---|---|
| **Anexo C** | «Clima 7 dias» -- un **pronostico**, capa externa, sin proveedor conectado. Sigue bloqueado, y bien. |
| **Anexo E** | «Clima observado» -- lo que el apicultor **vio estando ahi**, con sus cuatro opciones **ya declaradas** en `protocolos/apiario-campo-v1.json`. |

La segunda no necesita ningun proveedor. **Es la segunda vez que un `sin_sitio` resulta ser una
lectura equivocada de su propia nota**; ADR-143 fue la primera, con `efficacy_note`.

**Decision -- `FieldSession.weatherObserved`, enum de cuatro valores.** Hermana de
`hivesPresentCount` y `coloniesAliveCount`. Los cuatro valores son **los del protocolo,
literales**. El vacio es `null` --«nadie miro el cielo»-- y **no** `despejado`: el protocolo la
marca `"required": false`, y no mirar no invalida la visita.

**No hay `otro`, y es deliberado.** El protocolo no lo declara, y el sitio donde el dueno anade un
quinto valor es **ese JSON** -- toda la idea de A9.4. **`neblina` merece mencion aparte**: el marco
de investigacion describe Las Nubes como *«low-elevation cloud-forest environment»*, asi que ahi
la neblina no es rara. Anadirla es decision del dueno, y hay que hacerlo **en los dos sitios a la
vez**.

## El guardia, que es lo que de verdad faltaba

**`feedingMethod` lleva desde A9.4 con sus cuatro opciones escritas DOS veces** --el JSON y el
`enum FeedingMethod`-- y **nada comprobaba que coincidieran**. Coincidian por haberlas escrito
bien a mano.

Eso es deriva esperando a ocurrir: las `options` del protocolo se guardan como `enumValues` de una
`ProtocolVariable` **en la base**, asi que el dueno puede cambiarlas sin migracion -- pero cuando
el mapa manda esa pregunta a una **columna de enum**, Postgres solo acepta los valores del tipo.
El dia que alguien anada `"neblina"` al JSON, la captura lo ofrecera y la escritura lo rechazara
con un error que no dice nada de protocolos.

`tests/arquitectura/enum-del-protocolo.test.ts` lo ata. Solo mira las preguntas que **el mapa
dice** que van a un enum del esquema: las que ya prometieron esa correspondencia.

## Lo que el guardia encontro el primer dia, y una es mia

**Cuatro divergencias que ya existian**, declaradas con su razon y su dueno porque **tres son
decisiones de Daniel** y un guardia que no puede pasar nunca ensena a ignorar una linea roja:

1. **`population`** -- el protocolo dice `apiñada` **con ñ** y el enum dice `apinada`. **Nadie
   traduce**: `POBLACIONES` usa la del codigo. Hoy no rompe porque el formulario sale de esa
   constante, pero el protocolo existe para que la captura salga **de el**. Cual de los dos se
   cambia es decision del dueno: la ñ es su ortografia.
2. **`honey_stores`** y 3. **`pollen_stores`** -- el protocolo declara `junto_a_cria` como cuarto
   nivel; el esquema lo modela **aparte**, como booleano (`honeyNextToBrood`). Es deliberado y
   mejor: «junto a cria» no es una cantidad, es una posicion.
4. **`material`** -- **DIVERGENCIA MIA, del 2026-09-16.** ADR-148 construyo `FeedingMaterial` con
   los cinco valores que el dueno dicto en el apiario **y no se actualizo el protocolo**, que
   sigue ofreciendo `jarabe_1_1`, `jarabe_2_1`, `sustituto_polen` y `torta`. **Son dos
   vocabularios para la misma pregunta**, y cual gana es decision suya.

Desde hoy **no puede aparecer una quinta**, y una prueba aparte exige que las cuatro **sigan ahi**:
si alguien arregla una, la lista se queda corta y lo dice.

**La lista de huecos del protocolo baja de CUATRO a TRES** -- quedan `site_condition`,
`assessment` y `moisture_pct`.

**Cinco flip-tests, los cinco compilando, y dos rehechos** por la razon de siempre: anadir un
valor a un `as const satisfies` estrecha la union y no compila. Los validos fueron **reordenar** el
vocabulario y **vaciar el predicado**. El cuarto es el que vale: separar el JSON del enum
--anadiendo `"neblina"` solo al protocolo-- cae por el guardia nuevo, compilando.

## ADR-153 -- Las dos divergencias del dueno, resueltas: la eñe y el vocabulario completo

**Contexto.** El guardia de ADR-152 encontro cuatro divergencias entre el protocolo del dueno y el
esquema, y le llevo las tres que eran decisiones suyas. Contesto dos el mismo dia: *«mis cinco mas
los jarabes, y arregla apiñada»*.

## 1 · La eñe, y la afirmacion falsa que la causaba

`apiñada` es su ortografia y la que **su protocolo ya usaba**; el enum decia `apinada` y **nadie
traducia**. No rompia todavia porque el formulario sale de `POBLACIONES`, la constante del codigo
-- pero el protocolo existe para que la captura salga **de el**, y ese dia habria ofrecido un valor
que Postgres rechaza.

**La causa raiz estaba escrita en el esquema, y era falsa.** El comentario de `ColonyPopulation`
justificaba la ausencia asi: *«`apinada` sin eñe porque un identificador de enum no la admite»*.
**Un enum de Prisma SI la admite**: `prisma validate` dice «the schema is valid» con `apiñada`
dentro. Esa suposicion --escrita como justificacion y nunca medida-- es la razon de la divergencia,
y **se corrige el comentario en vez de dejarlo al lado**: una regla que resulta falsa hay que
corregirla, no reforzarla.

**La migracion se escribe A MANO, y esa es la decision tecnica de esta mitad.** Prisma genero un
**intercambio de tipo**: crear `ColonyPopulation_new` y castear
`population::text::ColonyPopulation_new`. **Ese cast revienta para cualquier fila que valga
`'apinada'`.** En la base local hay cero --medido: 2 inspecciones, 0 con ese valor-- pero **la de
produccion no se puede leer desde aqui**, asi que la ausencia no se puede afirmar.
`ALTER TYPE ... RENAME VALUE` preserva los datos **por definicion**: renombra la etiqueta, no
reescribe filas. Sin deriva de esquema despues, comprobado.

## 2 · «Mis cinco mas los jarabes»

`FeedingMaterial` pasa de seis valores a diez: los **cinco** que el dueno dicto el 2026-09-16
--primero, porque son los que usa--, los **dos jarabes**, y `sustituto_polen` y `torta`.

**Esos dos ultimos NO son jarabes** --son alimentos proteicos-- y **se quedan igual**: ya estaban
en **su** protocolo, y quitarlos seria una perdida de capacidad que nadie pidio. Queda dicho que si
no los usa, se quitan entonces. Es la eleccion de menor perdida con la pregunta a la vista, en vez
de decidirla en silencio en cualquiera de las dos direcciones.

**Y esto revisa a ADR-148, con su razon.** Aquella prueba decia «exactamente sus cinco, ni uno
mas», y su argumento era bueno: *un desplegable con opciones que nadie usa ensena a bajar hasta
«otro»*. Lo que no habia visto es que **el protocolo ya ofrecia otras cuatro**, asi que el efecto
neto de «no anadir ninguna» no era un vocabulario corto: eran **dos vocabularios** para la misma
pregunta. El argumento sigue valiendo; la premisa estaba incompleta.

## Lo que impide que vuelvan a separarse

Dos cosas, y la segunda es la que faltaba en ADR-148:

- El guardia `enum-del-protocolo` pasa ahora con **solo las dos divergencias legitimas**
  (`honey_stores`, `pollen_stores`), que son de modelado y estan declaradas.
- Una prueba nueva **compara el vocabulario con el ARCHIVO del protocolo**, no con una lista
  escrita en la prueba. Compararse con una lista propia es compararse consigo mismo.

**Tres flip-tests, y el tercero hubo que rehacerlo.** Quitar la eñe de `POBLACIONES` **no
compila** --rompe el `satisfies readonly ColonyPopulation[]`--, o sea que **ahi la protege el
compilador y no una prueba**, que es mas fuerte. El flip valido quita la eñe **del JSON**, que no
pasa por tipos, y cae por el guardia.

## ADR-154 -- La valoracion del tecnico, por el cierre de la visita y no por uno nuevo

**Contexto.** El Anexo E pide «Valoracion» y el mapa del protocolo la daba por **sin sitio** con la
razon escrita: *«`note` es la nota de campo; mezclarlas perderia cual se escribio con el guante
puesto»*. Esa distincion es la que la construye: son dos columnas porque son **dos momentos**.

**Y el dato que decide el diseno, medido:** `assessment` es el **UNICO** campo de etapa `close` de
la inspeccion. Los otros **dieciseis** son de campo.

## La decision: no se le inventa un cierre a la inspeccion

`Inspection` **no tiene nada de cierre** -- ni `completedAt`, ni ventana de edicion, ni una funcion
que la complete: solo `recordInspection` y el listado. `FieldSession` si tiene las tres cosas, con
sus reglas ya decididas y **distinguidas entre si a proposito**: `locked` por decision,
`editWindowExpiresAt` por plazo, *«porque quien lo lea necesita saber cual de las dos»*.

Inventar un segundo cierre duplicaria esa maquina y la haria derivar. Asi que **la puerta es la
visita**: el servicio encuentra la sesion a la que pertenece la inspeccion y le aplica **sus**
reglas. La ruta existe y no hubo que crearla -- `FieldEvent` une `fieldSessionId` con
`inspectionId`.

**Una inspeccion SIN visita se acepta, y el servicio lo DICE.** Se puede inspeccionar sin jornada
abierta, asi que el enlace puede faltar; negarlo dejaria esa valoracion **sin poder escribirse
nunca**, que es peor que escribirla sin plazo. Devuelve `origenDeLaVentana` --`"visita"` o
`"sin_visita"`-- para que la pantalla lo pueda decir y nadie suponga un plazo que no hubo.

**El AuditEvent lleva el ANTES.** Una valoracion es una lectura del tecnico; saber que la cambio
--y desde que-- es parte de poder sostenerla. El vacio **borra**, que es como se deshace una puesta
por error: misma regla que los campos de cierre de la visita.

## El desajuste de procedencia, que NO es nuevo y queda dicho

El protocolo declara `assessment` como **`interpretation`**, y esta fila esta estampada
**`direct_observation`** -- `inspections.ts` la fija asi para toda la inspeccion. Una fila tiene
**una** procedencia, y esta lleva dos clases de afirmacion.

**El desajuste ya existia y ADR-142 no lo dijo:** `probable_cause` y `recommendation` son los otros
dos items que el protocolo marca `interpretation`, y viven como columnas de `FieldSession`, cuya
fila tampoco es una interpretacion. Son los tres unicos items con procedencia declarada en todo el
protocolo.

**No se arregla aqui, y la razon no es pereza:** separarlo bien significa decidir si una
interpretacion merece fila propia --`FieldEvent` ya tiene su propio `provenanceClass`, asi que el
esquema ya modela procedencia por evento-- y eso cambia como se consulta la serie. Es una pieza
propia, y hacerla de paso en una rebanada de una columna seria decidirlo sin mirarlo.

**La lista de huecos del protocolo baja de TRES a DOS** -- quedan `site_condition` y `moisture_pct`.

**Seis flip-tests, los seis compilando y cayendo por su nombre**: la ventana deja de aplicarse, una
visita cerrada deja de bloquear, las dos causas se dicen igual, el audit pierde el antes, la
valoracion escribe en `note`, y el mapa vuelve a declararla sin sitio.

## ADR-155 -- Tres guardias que pasaban por razones equivocadas, y el segundo asiento que lo demostro mutando

**Contexto.** El 2026-09-17 se le paso el trabajo del dia al CLI de Codex. No encontro un fallo de
producto: encontro **tres guardias en verde que no vigilaban lo que decian vigilar**, y los
demostro **mutando el codigo y ensenando que las pruebas seguian pasando** -- no opinando.

**1. La exencion por clave eximia el futuro.** `enum-del-protocolo` declaraba sus divergencias
heredadas como un `Map<clave, razon>`. Bastaba con que la clave estuviera para que **cualquier**
desajuste de esa pregunta quedara exento: anadir un valor inventado a `honey_stores` dejaba **4/4
en verde**. Ahora se declara el **par exacto** --que hay en el protocolo y que hay en el esquema--
y cualquier otra diferencia vuelve a ser un desajuste.

**2. Un `continue` sacaba preguntas de la vigilancia en silencio.** Si el protocolo dejaba de
declarar `options`, el bucle la saltaba. Quitarselas a `method` dejaba **4/4 en verde**. Ahora,
cuando el mapa manda la pregunta a una columna de enum, **la ausencia de `options` ES un
desajuste**.

**Y al cerrar ese agujero salio un numero: la cobertura real era de CINCO preguntas, no doce.** Se
estaban saltando siete --`honey_type`, `outcome`, `queen_cells`, `route`, `target`, `varroa_method`,
`weather_observed`-- y las siete coinciden, asi que no habia deuda escondida; habia **vigilancia
que no existia**. La lista de doce queda fijada por nombre.

**3. El «control positivo» probaba los lectores, no el detector.** Reducir el comparador a mirar
solo dos preguntas dejaba **4/4 en verde** con todo lo demas sin vigilar. La causa era estructural
y es la leccion general: **el detector leia sus entradas del modulo, asi que no se podia llamar con
entrada hostil.** Ahora las recibe por parametro, y el control se las inventa -- que es la unica
forma de probar un detector. Es literalmente la regla de la casa: *«el guardia es el que llama a la
funcion con la entrada hostil, lo que suele obligar a exportarla»*.

**4. `take: 1` presuponia una invariante que el esquema no garantiza.**
`FieldEvent.inspectionId` tiene indice pero **no unicidad**, asi que una inspeccion puede colgar de
dos visitas. Con una cerrada y otra abierta, la misma escritura se permitia o se rechazaba **segun
el orden que devolviera Postgres**.

Y aqui la observacion de Codex fue mejor que el arreglo obvio: **anadir `orderBy` solo habria
vuelto determinista la arbitrariedad.** Lo que hacia falta era decidir cual manda. Manda la **mas
restrictiva**: si cualquier visita que contiene la inspeccion esta cerrada o vencida, la ventana
esta cerrada. La valoracion pertenece a la inspeccion, y una inspeccion contenida en algo ya
cerrado no se reabre porque otra visita siga abierta. Asi no hay nada que ordenar ni que elegir.

**5. El `before` del audit se leia y luego se escribia.** Con el aislamiento por omision de
Postgres --read committed-- dos escrituras concurrentes leen el mismo valor A, guardan B y C, y
**auditan las dos «desde A»**: la segunda afirma haber partido de A cuando reemplazo a B. La
transaccion pasa a `Serializable`.

**Y la parte que mas vale de todo esto: DOS DE MIS PROPIAS PRUEBAS eran adorno, y lo dijo su
flip-test, no yo.**

- La de «manda la mas restrictiva» decia en su comentario estar montada «al reves de lo comodo» y
  **era falso**: dejaba la visita CERRADA primera, asi que un `sesiones[0]` daba la respuesta
  correcta por accidente. «NADIE CAYO». Ahora la abierta va primera --la unica disposicion que
  distingue «la mas restrictiva» de «la que salga antes»-- y **el orden se afirma** antes del
  veredicto en vez de suponerse.
- El `Serializable` **no tenia guardia ninguno**. Ahora hay uno con concurrencia de verdad, y
  afirma **el rastro** --que ningun audit diga haber partido de un valor que otro ya reemplazo--
  en vez de exigir que una transaccion falle: si las dos no llegan a solaparse, las dos tienen
  exito legitimamente y sus audits son correctos.

Reincidi en la trampa que Codex me acababa de ensenar, una hora despues, en el arreglo de esa misma
trampa. Escribirla otra vez no arregla nada; lo que la caza es el flip-test, y por eso los cinco de
esta rebanada repiten **las mutaciones exactas de Codex**.

**Lo que NO entra.** Una restriccion de unicidad en `FieldEvent.inspectionId`, que seria el arreglo
mas fuerte del punto 4. Es una migracion cuya seguridad **no se puede comprobar contra produccion**
--leer esa base esta prohibido-- y que fallaria si ya hubiera duplicados. Queda nombrada: exige
primero contar duplicados en produccion, y eso lo hace el dueno.

## ADR-156 — `beneficio` es un tipo de ubicación, y crear un sitio es del jefe

**Estado: aceptado, construido.** Decisiones de Daniel del 2026-09-17, en conversación.

**Contexto.** Hasta hoy un beneficio sólo podía ser una `Location` de tipo
`site`, así que **nada lo distinguía de una finca o una bodega salvo su
nombre** — y deducir el dominio del nombre es exactamente lo que este
repositorio prohíbe en otras cuatro secciones. Consecuencia práctica: un
`Equipment` se coloca en un sitio, así que un fermentador vivía «en Finca
Rosina» y ninguna pantalla podía decir qué hay **en el beneficio**.

**Decisión 1: tipo propio, hijo del `site`.** `LocationType.beneficio`, mismo
patrón que `drying_facility` y `drying_bed`: una `Location` con su tipo y su
padre, **no una familia de entidades nueva**. Sigue el precedente de
`meliponary`, que Daniel separó el 2026-09-16 con el mismo argumento — cuando
el manejo cambia, el tipo es propio. Hoy una `drying_facility` sólo puede
colgar del `site`: `crearUbicacionDeSecado` (lib/traceability/instalaciones.ts)
exige `parent.locationType === "site"` y esta rama no lo cambia. Colgar una de
un `beneficio` es un cambio futuro sobre esa función, no algo que ya soporte.

**Decisión 2: `location:create_site`, y el capataz no lo tiene.** Crear un
lugar nuevo no es editar los atributos de uno existente, así que no se pliega
en `location:manage_attributes`. Se concede a Platform Admin —que recibe todos
los permisos por construcción— y a **Farm Manager**. Se **excluye
deliberadamente** de Farm Operator: palabras de Daniel, «farm manager/owner
quien puede crear o editar un beneficio, no un capataz». Es la misma forma de
exclusión explícita que ya usa Farm Manager con `lot:override_balance`.

**Decisión 3: se comprueba sobre el sitio padre.** `crearBeneficio` exige
`manage_attributes` **y** `create_site` sobre el padre, no sobre la plataforma.
Eso es lo que impide que un Farm Manager de una finca cree un beneficio en
otra, y lo hace con el mecanismo de asignaciones que ADR-144 ya define, sin una
segunda regla de visibilidad escrita a mano que derivaría de la primera.
Medido por flip-test el 2026-09-17: cada comprobación rechaza algo distinto —
`create_site`, resuelto contra el ámbito del `Assignment`, es lo que rechaza al
capataz y al Farm Manager de otra finca; `manage_attributes`
(`requireLocationAttributeAccess`) es lo que rechaza un sitio padre inexistente
en vez de dejarlo caer como un error de Prisma sin traducir.

**El precedente contrario, y por qué no se sigue aquí.** `crearSitioDeAbejas`
exige alcance de plataforma (`apiary_create_needs_platform_scope`) porque un
apiario puede nacer sin padre y entonces no hay de quién heredar el acceso. Un
beneficio **siempre** nace bajo un sitio, así que el padre es un sujeto real
para el permiso. Un beneficio suelto, sin finca, queda fuera de alcance.

**Consecuencia.** La pantalla es `/beneficio/ajustes`, primera sección del
centro de configuración que describe PR #370.
Las otras cuatro —capacidades, equipos, instalaciones y recetas— llegan con el
tablero del beneficio, porque una capacidad declarada sin dónde leerse no sirve
de nada. Sin permiso, la ruta responde **404** y no una página vacía, como ya
hace `/equipos/[id]`.

## ADR-157 -- Los vitales de campo se pueden anotar en el sitio, y queda dicho que fue alli

**El hallazgo, y es sobre mi propio trabajo.** El protocolo marca `weather_observed`,
`colonies_alive_count` y `hives_present_count` como **`stage: field`** --son cosas que se VEN
estando ahi-- y las tres se capturaban **solo en el formulario de cierre**, que se rellena en
casa. Dos de ellas las puse yo el 2026-09-16 (ADR-150, ADR-152) siguiendo a las que ya estaban,
**sin comprobar que las que seguia estuvieran bien**.

Medido: de los ocho items que van a `FieldSession`, los cuatro de `stage: close` estan donde
deben y **los cuatro de `stage: field` estan todos en el cierre**.

**Le lleve dos opciones al dueno y contesto una tercera, mejor:**

> «se deberia poder hacer durante la visita o al cierre, a veces en sitio y si solo un apicultor
> es dificil maniobrar y ser eficiente de entrar y salir y estresar menos a las abejas»

Un apicultor solo, con las manos ocupadas y una caja abierta, **tiene una razon real** para salir
y anotar despues. Esa razon no convierte lo anotado despues en lo mismo que lo visto.

**Decision -- no se restringe, se REGISTRA cual de las dos paso.** `FieldSession` gana
`fieldVitalsOnSiteAt`, y hay una puerta nueva --`registrarVitalesEnSitio`-- disponible **mientras
la visita esta abierta**, en la pantalla de la visita.

Sin la marca, **una cifra vista con el guante puesto y una reconstruida de memoria dos horas
despues son la MISMA fila**, las dos estampadas `original_record`. Es la misma forma que el
desajuste que ADR-154 declaro sin arreglar: el protocolo declara una propiedad de la captura y
nada la hace cumplir.

**La marca describe el valor ACTUAL, no un historico**, y por eso **el cierre la limpia** cuando
reescribe alguno de los tres: una cifra corregida desde casa ya no es la que se vio. El historico
completo vive en el `AuditEvent`, que es su sitio. Su prueba lleva el control de que un cierre que
**no** toca los tres deja la marca intacta -- sin el, un `null` puesto siempre la cumpliria igual.

**Por que UNA marca y no una por campo.** Tres columnas dirian mas y cuestan tres caminos de
escritura y tres formas de quedar inconsistentes. La marca de grupo responde la pregunta que se
hace de verdad al leer una visita: *«esto se anoto alli o en casa?»*. Si hace falta la precision
por campo, se anade con el caso delante.

**Lo que la puerta afirma, y lo que NO.** Afirma **una sola cosa**: que la visita seguia abierta.
**No comprueba GPS a proposito.** Las coordenadas de `startLatitude` son del arranque, no de
ahora, y exigirlas dejaria sin registrar una visita bajo dosel cerrado -- que es justo donde estan
las abejas. Decir «el aparato estaba en el apiario» seria inventarlo.

**Y devuelve la comparacion de cajas ya resuelta** (ADR-150): quien acaba de contar en el sitio es
exactamente quien puede hacer algo si no cuadra, y decirselo al cerrar en casa llega tarde.

**Un flip-test volvio a destapar una prueba mia que no discriminaba.** La de «los tres son
independientes» escribia el recuento primero y el clima despues, asi que la mutacion que borra el
clima cuando llega vacio no cambiaba nada: el clima estaba vacio igualmente. «NADIE CAYO». Ahora
se prueba en las **tres** direcciones, porque cada una solo puede cazar la mutacion de su campo.
Es la tercera vez en dos dias, y las tres las dijo el flip-test.

**Lo que NO entra.** `purpose` es el cuarto `stage: field` y se queda donde esta: «que se fue a
hacer» se sabe **antes** de llegar, asi que no es una observacion del sitio y la marca no diria
nada sobre ella.

## ADR-158 -- El material de soporte se guarda entero, verificable, y separado entre registro y conocimiento

**Contexto.** Daniel, el 2026-09-17: *«deberias tener mas documentacion y material de soporte
guardado, revisar todo»*. Antes lo habia pedido con otras palabras: *«no quiero que se pierda que
fue mucha investigacion y preparacion... servira mas alla del build como data de referencia»*.

**Tenia razon, y se midio -- buscando por CONTENIDO, con control positivo.** De todo lo entregado en
septiembre, el repositorio guardaba **solo las cuatro fuentes de Cerro Azul** (ADR-146):

| material | en el repositorio |
|---|---|
| paquete Meliponini y su seeder | nada |
| libro de ANSA (Gennari, INTA) | nada, ni citado |
| **paquete Q1-Q49** -- las 49 decisiones de descubrimiento | solo dos analisis mios que lo CITAN |
| paquete smart-hive-v1 -- 68 archivos | una mencion en un plan |
| manual de Varroa del 2026-09-17 | nada |
| **trece decisiones de Daniel dichas en la conversacion** | solo en la transcripcion |

El caso grave es el de Q1-Q49: **si se perdia la carpeta de Codex, de las 49 decisiones del dueno
quedaba solo el resumen de quien construyo.** Es exactamente lo que no debe pasar.

**Decision 1 -- dos clases, en dos sitios, y no se mezclan.**

- **Registros** -- lo que se dijo o decidio -- a `docs/architecture/`: `FUENTE_DECISIONES_DEL_DUENO_2026-09.md`,
  `fuentes/paquete-q1-q49/`, `fuentes/smart-hive-v1/`.
- **Conocimiento con cifras** -- umbrales, dosis, medidas -- a `docs/dominio/`, con su `estado`
  declarado: Varroa y Meliponini como **borrador**, ANSA como **referencia externa**.

No es de estilo: `material-de-dominio-declarado` existe porque *«una matriz sin su rotulo es
indistinguible de un umbral que el dueno respalda, y el codigo se apoya en los dos por igual»*. El
manual de Varroa tiene exactamente esa forma -- dosis, umbrales del 3 % y 5 %, «estrictamente
obligatorio» -- y ninguna fuente citada.

**Decision 2 -- «verbatim» deja de ser una promesa.** `tests/arquitectura/fuentes-verbatim.test.ts`
verifica cada copia en cada corrida: smart-hive contra **su propio** `MANIFEST.sha256` -- hecho por
quien lo produjo, mejor juez que uno propio --, Q1-Q49 contra uno generado sobre la copia tras
comprobarla identica al original, y los documentos con cabecera contra el sha que declaran. Lleva
cuatro controles que **alteran copias a proposito**, porque un verificador que solo se prueba contra
copias buenas no se ha probado.

**Lo que el contraste encontro, y va en las cabeceras, no en un resumen aparte:**

- **El manual de Varroa esta escrito para clima TEMPLADO.** Habla de invernada y de aplicar a
  5-12 C. En Cerro Azul no hay invierno. **El acido formico es un asunto de SEGURIDAD**: el propio
  texto dice que por encima de 27 C mata a la reina, y en el tropico 27 C se superan buena parte del
  dia. El oxalico depende de un bloqueo de cria invernal que alli no ocurre. Los umbrales de
  tratamiento estan anclados a estaciones que no existen.
- **Meliponini no es fiable todavia:** tres especies uno, cuatro el otro, cinco segun Daniel; y de
  las tres que comparten, **dos discrepan entre si** en medidas de caja y alcance de vuelo.
- **ANSA es la unica fuente publicada del lote, pero es de Tucuman.** Sus especies son argentinas
  -- *T. fiebrigi*, *S. jujuyensis* --: los generos coinciden con los de Daniel y las especies no.
  Se guarda la **ficha**, extraida del propio PDF, no el libro, que es obra publicada.

**Y las trece decisiones de Daniel, en sus palabras literales**, extraidas de la transcripcion por
programa, cada una con su linea y con **lo que produjo** -- o en que esta bloqueada. Seis habian
llegado como mensajes enviados mientras se trabajaba, que la herramienta entrega incrustados en la
salida de otra orden: **la primera busqueda solo encontro siete**, porque miraba los mensajes aparte.
No faltaban; estaban en otro sitio.

**P-F pasa de tres guias a cinco.** Su prueba no cambia -- ya miraba la carpeta entera -- pero su
texto decia «tres» y se corrigio, porque una instruccion vieja es peor que ninguna.

**Seguridad, comprobada antes de copiar.** Ningun `CLAUDE.md` en los paquetes -- se cargaria en cada
sesion --. Ningun secreto: el detector se probo en tres formas, y la primera version **no cubria el
caso JSON**, donde una comilla separa la clave de los dos puntos. Las ocho coincidencias de la version
ampliada fueron nombres de esquemas de autenticacion OpenAPI, no valores.

**Lo que NO entra.** El PDF de ANSA (obra publicada: si Daniel quiere versionarlo, se anade con el sha
que ya declara la ficha), los `.zip` (redundantes, comprobado archivo por archivo) y `.DS_Store`.
**Ni una sola cifra de estos documentos pasa al software**: los vocabularios de tratamiento y de
limpieza se proponen a partir del de Varroa, pero los decide Daniel.

## ADR-159 -- La limpieza se registra sobre la CAJA, no sobre la colonia

**Contexto.** Daniel pidio vocabularios fijos para la limpieza fitosanitaria, y el manual de
Varroa (ADR-158) trajo los procedimientos. La pregunta de diseno era donde cuelga: la limpieza
-- raspar, flamear, hervir en sosa -- se le hace al MATERIAL, no a una colonia. Se le llevaron
tres opciones y eligio: **«1, sobre la caja»**.

**Medido antes de construir:** de `Hive` colgaban solo `Colony`, `HivePlacement` y `Asset`.
**Ningun evento del apiario colgaba de la caja**: todos lo hacen de la colonia. Asi que la
limpieza necesita su propia tabla, y no por gusto: una caja vacia se desinfecta ANTES de recibir
otra colonia, y en ese momento no hay colonia de la que colgarla.

**Decision -- `HiveCleaning`,** con los actos como **arreglo** -- una limpieza raspa y DESPUES
flamea -- y dos vocabularios fijos con «otro, ¿cual?»: los actos y la razon.

**Los nombres salen del manual de Varroa, que es borrador, y se toman SOLO los nombres.** La
concentracion de la sosa, los minutos de inmersion o las 48 h al sol no son el valor por defecto
de nada (ADR-158). Y **faltan dos actos del manual a proposito**: desbrozar es del SITIO y
desinfectar la herramienta es del OPERARIO; ninguno se le hace a una caja.

**Las reglas viven TAMBIEN en la base.** Tres `CHECK` --al menos un acto; «otro» dice cual;
razon «otra» dice cual-- probados contra Postgres con su control positivo, **7 de 7**, dentro
de transacciones que se deshacen. Es el primer `CHECK` del repositorio sobre un **arreglo de
enum**. Cada rechazo lo atribuye la base a la restriccion concreta, no a un error generico.

**La regla que no puede ser `CHECK` -- la caja vacia -- es por DIA ENTERO, no por instante.** La
limpieza es un dia, y con dias hay dos transiciones que son lo normal: la colonia muere el 10 y
la caja se limpia el 10; la caja se limpia el 10 y ese dia entra una colonia nueva. Una regla por
instante las rechazaria segun la hora. **Su flip-test lo demuestra: volver al instante tumba las
dos pruebas del mismo dia.** Se rechaza solo si una colonia ocupo la caja el dia entero.

**La ocupacion sale del intervalo `[startedAt, endedAt)`, no del `status`.** El `status` es el de
HOY: una colonia hoy muerta pudo estar viva en la fecha que se pregunta. Esto se apoya en que una
colonia no activa lleva `endedAt` -- medido: 34 colonias, las 16 fugadas con fecha de fin, **cero**
no activas sin ella --, y la prueba «limpiar despues de la muerte se acepta» lo vigila.

**Renovar cera es la excepcion**, porque se hace CON la colonia dentro. Y «otro» tampoco exige caja
vacia: no se sabe que es, y bloquearlo seria decidir por el apicultor.

**La primera accion del apiario que DEVUELVE el error en vez de lanzarlo.** Sus hermanas casi nunca
fallan; esta rechaza en un caso normal -- «esa caja tenia colonia ese dia» -- y el apicultor tiene
que leer por que, no ver una pagina de error.

**Cinco guardias de la casa pararon este cambio, los cinco con razon:** el inventario de acceso, la
lectura sin principal -- que obligo a escribir QUIEN la autoriza y DESDE CUANDO --, las cifras del
inventario, y ADR-125, porque la opcion vacia «sin registrar» llevaba texto sin estar declarada.

**Lo que NO entra.** Los productos de tratamiento: esperan a que Daniel diga cuales usa, y hay un
plan recien fusionado -- «el botiquin del apiario» (#386) -- que hay que leer antes, porque puede
tocar lo mismo.

## ADR-160 -- El refractometro de miel: su lectura va sobre el LOTE, y el aparato dice que lee

**Contexto.** Daniel corrigio una confusion mia: un refractometro **no mide humedad en general**.
El de cafe mide Brix del mosto; la humedad del grano la da un medidor de humedad de grano; y el
refractometro **de miel** lee dos escalas -- Brix y H% (agua). Y «el refractometro del beneficio es
diferente al de mieles»: los rangos de Brix son otros (0-32 para mosto y jugos, 58-92 para miel) y
la escala H% solo existe en los de miel. Pidio: una lectura por cosecha, el refractometro como
INSTRUMENTO con su modo, y la miel como material. Respuesta: **«si, construyelo asi»**.

**La primera version ponia tres columnas en `ApiaryHarvestEvent`, y se quito antes de commitear.**
El propio esquema ya lo prohibia en un comentario del 2026-09-14 -- «la humedad NO esta aqui a
proposito» -- y a mitad del trabajo Daniel lo dijo con otras palabras: **la miel es un lote**, y hay
que seguirla cuando se divide, se filtra, se guarda, se envasa y se muestrea hasta la cata. Una
columna en la cosecha se queda atras en la primera division. `Measurement` ya tenia `lotId`,
`instrumentId` e `instrumentModeId`; la miel ya era un `Lot` (A3). Faltaban tres cosas pequenas.

**Decision.**

1. **`MaterialState.BEE_HONEY`** -- miel de ABEJA. No confundir con `MUCILAGE_HONEY`, que es el
   proceso *honey* del cafe. Hasta hoy el enum solo conocia estados del cafe, y el modo de un
   refractometro de miel no tenia sobre que declararse.
2. **`InstrumentMeasurementMode.variable`** -- QUE lee el modo, del mismo vocabulario que
   `Measurement.variable` (`isKnownVariable`), no de una lista propia. Un refractometro de miel son
   **dos modos**: `brix` 58-90 y `moisture` 12-27 sobre `BEE_HONEY`. Anulable: los modos que ya
   existian no la declaraban (ADR-080). `CHECK` de no vacia en la base.
3. **`recordMeasurement`**: (a) un modo que declara variable no firma otra -- el modo H% no produce
   un Brix; (b) **fuera del rango del modo se rechaza**: el aparato no puede marcar ese numero, asi
   que no es una lectura; (c) sobre un lote de miel el material se INFIERE del tipo de lote, sin
   crear una muestra para declararlo -- y un modo de cafe usado sobre miel levanta su marca
   `mode_material_mismatch`.

**El limite del Brix no se ensancha para todos.** El registro lo tiene en 0-40 porque su sujeto es
el mosto: ahi un 180 es un 18 mal tecleado. Con ese limite ninguna miel entraria nunca. Se abre al
limite fisico (0-100) **solo sobre un lote `honey`** (`LIMITES_SOBRE_MIEL`), y lo que acota de
verdad es el rango del modo. La prueba de control mete el mismo 81 sobre un lote de cereza y sigue
fuera.

**`registrarLecturaDeRefractometro`** es la puerta desde la cosecha: una o dos escalas, con o sin
aparato. **El H% nunca se calcula desde el Brix** y se guarda como leido -- la tabla de Chataway lo
permitiria, y seria un valor calculado vestido de medido. **Una lectura por cosecha**: la segunda de
la misma escala se rechaza; si esta mal, se corrige la que hay (`correctMeasurement` conserva la
original). Con aparato, **todo se valida ANTES de escribir**: una lectura de dos escalas con una
fuera de rango no deja escrita la otra a medias. Cada escala lleva su propia clave de envio, asi que
un reintento no duplica.

**`moisture_pct` sale de «sin sitio».** Va como `tabla: Measurement` sobre el lote de la cosecha. La
lista de items del protocolo sin sitio baja de DOS a UNA: queda `site_condition`.

**La ficha del equipo no tenia donde declarar modos** -- `declararModoDeInstrumento` existia sin
ninguna pantalla que lo llamara. Ahora la tiene, con material y variable como listas cerradas.

**Lo que NO entra, y es lo siguiente que pide el mensaje de Daniel.** La maquinaria del lote ya
divide (`split`), fusiona (`merge`/`blend`), cambia de etapa, extrae muestras, guarda
(`StorageAssignment`) y llega a la cata por `Sample`. **Lo que no tiene nombre todavia es filtrar y
envasar miel**, ni una pantalla del lote de miel que recorra esa cadena. Es la rebanada siguiente.

## ADR-161 -- Procesar y envasar miel: dos pasos del lote, con sus nombres

**Contexto.** Daniel: la miel es un lote, y hay que seguirla cuando se divide, filtra, guarda,
envasa y muestrea hasta la cata. La maquinaria del lote ya dividia, fusionaba, guardaba y sacaba
muestras; **filtrar y envasar no tenian nombre**, y el contrato del beneficio manda parar y
preguntar antes de inventar uno. Se le llevaron tres formas y eligio: **«Proceso + envasado»**.

**Decision.**

1. **Dos tipos de `LotTransformation`: `honey_processing` y `packaging`.** Cada uno crea un lote
   NUEVO de miel con codigo derivado del padre (`MIEL-1` → `MIEL-1-A`), asi que la genealogia
   entera -- cosecha, colonia, caja -- llega sin copiar nada hasta la muestra y la cata.
2. **Los actos del proceso son un vocabulario fijo con «otro, ¿cual?»**: colado, filtrado,
   decantacion/maduracion, homogenizado. Un arreglo, porque un proceso cuela Y decanta.
3. **El envasado dice cuantos envases y de que masa neta.** La masa del lote envasado es
   `envases × masa neta`, **y se dice que es un calculo**: dos numeros declarados multiplicados,
   no una tercera pesada. Si no cuadra con lo que entro, la diferencia sale en el balance, que es
   donde tiene que salir, en vez de esconderse en un numero tecleado para que cuadre.
4. **Los dos CONSERVAN masa** (`balance.ts`), como la seleccion y la trilla: lo que sale mas la
   merma declarada (cera y residuos; lo que queda en el tanque) suma lo que entro. Un hueco es miel
   que nadie sabe donde esta, no un rendimiento. **Lo que no cuadra no se rechaza: queda como
   desviacion** -- la miel ya se proceso, y negarse a registrarlo no la devuelve al tanque.
5. **Tomar parte del lote es lo normal** (se cuelan 20 kg de un tanque de 30), asi que los kilos
   que entran son obligatorios: no se deducen.

**Las reglas viven TAMBIEN en la base:** cuatro `CHECK`, probados con sondas dentro de
transacciones que se deshacen y su control positivo. **Una sonda encontro un fallo real en la
primera version:** la igualdad «es envasado ⇔ lleva envases y masa» dejaba que un paso que NO es
envasado llevara un numero de envases sin masa. Se reescribio con `CASE`. Se compara
`transformation_type::text`: un valor de enum recien anadido no se puede usar en la misma
transaccion que lo crea.

**Un hueco que habia debajo: el peso del cierre no entraba en el libro.** Una cosecha pesada al
cosechar abonaba su lote; una pesada en el cierre de extraccion -- que es lo normal, se pesa al
extraer -- lo dejaba **sin saldo**, y nada de lo que se le hiciera despues podia cuadrar. Ahora
completar el peso en el cierre abona lo pesado, y corregirlo asienta SOLO la diferencia
(`adjustment_increase`/`decrease`), dejando el asiento original. Borrar el peso no asienta nada.

**La ficha del lote de miel deja de ofrecer los botones del cafe** (fermentar, secar, proceso) y
ofrece los dos pasos. Ensena **de donde viene**, subiendo por la genealogia: un frasco envasado es
nieto del lote de la cosecha, y sin esto no diria de que caja salio.

**Lo que NO entra.** Dividir un lote de miel en varios desde la pantalla (el tipo `split` existe,
la pantalla no), enlazar un lote envasado a un `Product` de la tienda, y una etiqueta con el
recorrido. Y visto de paso, sin tocarlo: `transformationType_hulling` **no tiene traduccion**, asi
que la linea de tiempo de un lote trillado ensena la clave cruda.
