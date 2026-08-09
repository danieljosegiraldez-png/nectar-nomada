# Data Architecture — Néctar Nómada Digital Platform

Physical schema conventions for the model described in `DOMAIN_MODEL.md`. Stack
choices are justified in `DECISIONS.md`; this document assumes PostgreSQL +
PostGIS + Prisma + S3-compatible object storage and specifies how they're used.

---

## 1. One database, module-owned schemas

Single Postgres database (`nectar`), one schema per module
(`identity`, `commerce`, `research`, `sensory`, `competitions`, `environmental`,
`content`, `project`, `partner`, `ai`) plus a `core` schema for the canonical
entity layer (Person, UserAccount, Organization, Location, Project, Asset, RBAC
tables). This is a naming/organizational convention within one physical database
— not separate databases — chosen so:

- Cross-module joins remain physically possible (needed for search, dashboards,
  audit) without needing distributed transactions.
- Module ownership is still legible: a query joining `commerce.order` directly to
  `research.measurement` is a visible code smell in review, whereas
  `commerce.order.project_id → core.project.id` is the sanctioned path.
- A future extraction of one module to a separate service is a schema-boundary
  extraction, not an archaeological untangling of a flat namespace.

## 2. Standard columns

Every table in every module gets:

```
id            uuid primary key default gen_random_uuid()
created_at    timestamptz not null default now()
updated_at    timestamptz not null default now()
created_by    uuid references core.user_account(id)   -- nullable only for system/seed inserts
status        text not null                            -- enum per table, see §7
```

Tables holding versioned or approvable content (protocols, evaluation forms,
published stories) additionally get:

```
version       integer not null default 1
superseded_by uuid references <self>(id)   -- null = current version
```

No table uses a display name, slug, or code as its primary key or as a foreign key
target (CLAUDE.md §36). Human-readable codes (blind codes, SKUs, lot codes) are
separate unique-indexed columns, not identifiers other tables point to.

## 3. Typed entities via constrained JSONB, not per-type tables

`Organization`, `Location`, and a few other canonical entities support many
subtypes with mostly-shared shape and a handful of type-specific fields
(a Laboratory has accreditation fields a Venue doesn't). Rather than one table per
subtype (which would fragment the canonical layer CLAUDE.md §2 explicitly warns
against) or a fully schemaless blob (CLAUDE.md §49 explicitly forbids "store all
data as JSON blobs"), the convention is:

- Core, universally-applicable columns are real typed columns.
- `organization_type` is a real column (enum), and drives which JSON Schema
  validates the `attributes jsonb` column at the application layer (Prisma
  middleware / Zod validation before write — never validated only in the UI).
- Anything queried or indexed across all organizations regardless of type (name,
  location, status) is a real column. Anything type-specific and not
  cross-type-queried lives in `attributes`, validated on write.

This is a deliberate middle ground, not a shortcut — the "no JSON blob" rule is
about not losing structure and validation, not about banning JSONB outright where
Postgres's `jsonb` + `CHECK`/application validation still gives real constraints.

## 4. Provenance and evidence columns are mandatory, not conventional

Every table storing a fact that can be evidenced (research measurements,
observations, evaluations, environmental readings, competition results) has:

```
provenance_class   text not null   -- measured_fact | original_record | direct_observation
                                    -- | scientific_evidence | manufacturer_spec
                                    -- | interpretation | hypothesis | conclusion
                                    -- | recommendation | ai_suggestion
source_reference    text           -- pointer to original file/instrument/person
recorded_by         uuid references core.person(id)
recorded_at         timestamptz
data_quality        text           -- verified | verified_with_limitation | provisional
                                    -- | unconfirmed | conflicting | superseded
                                    -- | working_hypothesis | not_tested | missing_source_record
```

`provenance_class = 'ai_suggestion'` is only ever written by the AI service role
(see `AI_GOVERNANCE.md` §3) and only into `ai.recommendation`, never into a
module's fact tables directly — a row in a research/sensory/environmental table
can reference an accepted AI suggestion via `source_ai_recommendation_id`, but the
act of acceptance is a human write, not the AI's.

Missing values are stored as explicit `NULL` with `data_quality = 'missing_source_record'`
(or the appropriate status) — never a sentinel value, empty string, or a guessed
number. Application-layer forms must surface "Unknown / Not yet measured" as a
distinct UI state from a blank input that silently becomes 0.

## 5. Media and object storage

`core.asset` stores metadata only:

```
core.asset(id, asset_type, storage_key, storage_bucket, checksum_sha256, mime_type,
  size_bytes, original_filename, creator_person_id, captured_at, location_id,
  project_id, usage_rights, status, derivative_of_asset_id)
```

Binary content lives in S3-compatible object storage (see `INTEGRATIONS.md` §3 and
`DECISIONS.md` ADR-003), never in Postgres. Convention:

- `nectar-originals/{module}/{entity_id}/{asset_id}.{ext}` — immutable once
  written; scientific/evidence originals are never overwritten, only superseded by
  a new Asset row with `derivative_of_asset_id` pointing back if it's a correction.
- `nectar-derivatives/{...}` — thumbnails, previews, resized images, transcoded
  video. Regenerable; safe to delete and recreate from the original.
- Access via signed URLs with short expiry, generated server-side after a
  permission check (`RBAC.md`), never a public bucket for anything not explicitly
  classified `Public` (`SECURITY.md` §4).

## 6. Environmental time-series

`environmental.observation` is the highest-write-volume table in the system and
the one CLAUDE.md §7 explicitly calls out as needing to scale to millions of rows
without degrading the transactional database.

**v1 approach: native Postgres declarative range partitioning, monthly, on the
same database.** Not a separate time-series database, not the TimescaleDB
extension, for v1. See `DECISIONS.md` ADR-002 for the full trade-off — summary:
partitioning + a BRIN index on `(sensor_deployment_id, observed_at)` handles
millions of rows at this project's realistic scale (field sensors and weather
station feeds, not industrial IoT fleets) on any standard managed Postgres,
keeping the "no premature infrastructure" principle (CLAUDE.md §59) intact while
leaving a documented, low-friction migration path to the Timescale extension (a
Postgres extension, not a different database) if actual volume or query patterns
later demand it.

```
environmental.observation(
  id, sensor_deployment_id, observed_at, variable, value, unit,
  data_quality, source_id, raw_payload jsonb, indoor_outdoor, created_at
) partition by range (observed_at)
```

Old partitions (e.g., >24 months) can be moved to cheaper storage or aggregated
into rollup tables without touching the live partition — this is the concrete
mechanism behind "keep raw data retrievable" (CLAUDE.md §38) while not forcing
every dashboard query to scan the entire history.

`FermentationObservation` (Section 20 of CLAUDE.md) uses the same partitioning
pattern once that module is built — same shape of problem, same solution, not a
separate design.

## 7. Status and data-quality enums

Standardized, not per-table bespoke strings:

- Generic record lifecycle: `draft | incomplete | pending_review | verified |
  approved | archived | rejected`
- Scientific evidence: `verified | verified_with_limitation | provisional |
  unconfirmed | conflicting | superseded | working_hypothesis | not_tested |
  missing_source_record`
- Classification (separate axis, not a status): `public | registered | partner |
  internal | confidential | trade_secret` — see `SECURITY.md` §4 for enforcement.

These are Postgres enums (or check-constrained text, decided at migration time),
shared across modules via the `core` schema so a dashboard can query data quality
platform-wide without module-specific translation tables.

## 8. Search

v1: Postgres full-text search (`tsvector` generated columns + GIN indexes) across
canonical entities and their commonly-searched module data (product names,
project names, story titles, organization names). Sufficient for the MVP's data
volume and avoids standing up and syncing a separate search index
(Elasticsearch/Algolia/etc.) before there's a proven need. `DECISIONS.md` ADR-010
records the migration trigger (result relevance quality or query volume
degrading) that would justify moving to a dedicated search service later.

## 9. Migrations and rollback

Prisma Migrate, one migration per PR, no manual schema edits against the
production database. Destructive migrations (column drops, type narrowing) require
a documented rollback note in the migration file's header comment and, for any
table holding scientific/evidence data, a pre-migration backup step — this is
process discipline layered on top of Postgres's own transactional DDL, not a
replacement for it.
