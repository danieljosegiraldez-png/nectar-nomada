# Phase 1 Technical Execution Plan — Néctar Nómada Digital Platform

**Status: approved.** All 7 decisions in §40 resolved — 6 approved as
proposed, 1 changed (Farm Operator scope, §26/§40 item 6 — see below).
Implementation of T1 is in progress; this document is updated in place as
each ticket lands, not re-derived per ticket.

**Decision record for §40's 7 items, as actually approved**:

1. Lot Genealogy reconciliation (§8.1) — approved as proposed.
2. Provenance retrofit sequencing (§6.3) — approved as proposed.
3. `traceability` schema name — approved as proposed.
4. First ticket, T1 — approved.
5. Mixed-cultivar composition deferred (§13) — approved; no known
   upcoming harvest needs it sooner.
6. Farm Operator scope granularity — **changed from what was drafted**:
   `project`-scope alone is not sufficient; real operators work across
   multiple projects at one physical site, so `location`-scope must be
   supported too, not treated as optional. Verified before implementing:
   `ScopeType` already includes `location` (`prisma/schema.prisma`), and
   Role Profiles carry no code-level restriction on which scope type
   they're assigned at — `Partner Field Collector (scope: project or
   location)` already proves this exact pattern works today with zero
   schema change. Confirmed genuinely seed-data/Assignment-level, not a
   schema change, as this document's §39 already anticipated — §26
   already specified "project or location" before this decision was
   asked, so no text change was needed there, only this record that it
   was deliberately confirmed rather than defaulted to.
7. Full offline sync out of Phase 1's gates (§24, §37) — approved as
   proposed.

Input: `NECTAR_NOMADA_PHASE_1_TECHNICAL_EXECUTION_PLAN_PROMPT_CORRECTED.md`.
Required predecessor, read in full per its §-1: `GAP_ANALYSIS_2026-08-10.md`
— its findings are cited throughout rather than re-derived, and every claim
about "what's actually built" in this document was re-verified directly
against the current repository, not assumed from that report's date.

**Reading-list correction, stated up front rather than silently worked
around**: the prompt's required-reading list names
`BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md`. That file does not
exist. Only its unreviewed input (`NECTAR_NOMADA_BRAND_MARKETING_
COMMUNITY_SALES_INPUT.md` / `..._CORRECTED.md`) and its add-prompt
(`09_ADD_BRAND_MARKETING_PROMPT.md`) exist — confirmed by the gap analysis
and re-confirmed here. This is irrelevant to Phase 1's actual scope (coffee
traceability shares no entities with Brand/Marketing) so it doesn't block
anything below, but per the prompt's own §1 instruction ("do not assume any
static list is complete"), it's named rather than silently skipped.

---

## 1. Executive Summary

Phase 1's job is to give the platform its first real operational spine —
coffee lot genealogy from harvest to sensory result — without inventing a
second architecture next to the one already designed. The good news,
confirmed by directly re-reading the relevant documents rather than
assuming they're still current: **the hard design work for this is already
done.** `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F-J (approved,
`DECISIONS.md` ADR-020) already specifies a canonical `Lot` +
`LotTransformation` (input/output join) model, an event-based
`QuantityEvent` ledger, a generalized `Measurement` table, and protocol-
execution/deviation tracking — reviewed, cross-checked against `RBAC.md`
and `SECURITY.md` at the time, and never built. Phase 1's primary technical
task is **building that already-approved design**, not designing a new one
— with one gap this plan closes: reconciling it explicitly against
`DOMAIN_MODEL.md`'s own, earlier-and-simpler Agricultural Traceability
chain (§8 below), which no prior document did in writing.

The one piece of genuinely new design work this plan adds, per its own
required scope (§-1 of the input prompt): the provenance vocabulary
(`provenance_class`/`source_reference`/`data_quality`) that `DATA_
ARCHITECTURE.md` §4 has described as "mandatory, not conventional" since
the very first architecture pass, and that the gap analysis confirmed has
**zero implementation anywhere** in five built slices. This plan designs
that vocabulary for real, specifies exactly which of the six already-built
fact-bearing tables need it retrofitted, and makes an explicit,
reasoned call on sequencing (§28, §33): **new Phase 1 tables get it from
day one; retrofitting the six existing tables is sequenced as a fast-follow
immediately after Phase 1's coffee-slice gates pass, not folded into
Phase 1 itself.**

Recommended first ticket (§41, detailed in §34): the canonical `Lot` +
`LotTransformation` schema and its append-only invariant tests — the
single piece of new infrastructure every other Phase 1 capability (harvest
receiving, fermentation, drying, storage, samples, the operator workbench)
depends on directly.

## 2. Current Repository State

Re-verified directly against the repository at the time of writing (`git
log`, `prisma/schema.prisma`, `npx tsc --noEmit`), not assumed from the gap
analysis's date:

- **55 Prisma models across 7 schemas** (`core` 19, `sensory` 15,
  `competitions` 7, `commerce` 6, `experiences` 4, `partner` 3, `ai` 1). 13
  migrations applied, in order, no gaps.
- **Zero coffee-traceability entities exist.** No `Lot`, `LotTransformation`,
  `HarvestEvent`, `ReceivingEvent`, `FermentationRun`, `DryingRun`,
  `StorageAssignment`, `Measurement`, or `QuantityEvent` table exists
  anywhere in the schema. This is a genuinely greenfield build within an
  otherwise mature platform, not a refactor.
- **Zero Research OS entities exist** — no `Experiment`, `Protocol`,
  `ProtocolVersion`, `Evidence`, `EvidenceClaim`. This matters directly for
  §14/§20 below: Phase 1 cannot "reuse Research OS protocol/version
  architecture" (input prompt §15) because there is nothing to reuse yet —
  it has to build a right-sized protocol-execution model of its own,
  designed so Research OS can adopt/extend it later without a rewrite, per
  `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §J's own precedent decision
  ("reuse `Protocol`/`ProtocolVersion` for both experimental and operational
  protocols — one entity, not two") — a decision this plan carries forward
  as an *intent*, not something it can execute yet since neither table
  exists.
- **What does exist and is directly reusable**: `Person`, `UserAccount`,
  `Organization` (already typed `farm`, already seeded with Finca Rosina),
  `Location` (hierarchical, PostGIS `geoPoint`, but only
  `country|province|district|locality|site` — no `plot`/`processing_site`
  granularity yet), `Sample` (already has nullable `projectId`/
  `organizationId`/`locationId`, but no lot lineage), `Assignment`/`Scope`/
  `RoleProfile`/`Permission` (full RBAC chain, working, tested),
  `AuditEvent` (generic, polymorphic `entityType`/`entityId`, already the
  right shape to extend coverage to), `Task` (reusable for §23's "open
  tasks" operator view), `SensoryProtocol`/`SensorySession`/`Assessment`/
  `PanelResult` (Slice 6, the most complete module in the platform —
  directly the sensory linkage target in §19).
- **Toolchain is clean**: `npx tsc --noEmit`, `npm run lint`, `npm test`
  (37/37, RBAC only — see gap analysis Part 4 on test coverage), `npm run
  build` all pass as of this writing.
- **`git status` is clean** — no uncommitted work to protect against, per
  the input prompt §1's "avoid discarding working code" instruction.

## 3. Existing Capabilities to Retain

Everything in this list is **KEEP**, reused directly, not rebuilt:

- RBAC resolution (`lib/rbac/service.ts`'s `can()`/`resolvedPermissionKeys()`)
  — Phase 1's authorization needs (§25) are new *permissions*, not a new
  *mechanism*.
- The "ownership check is the query itself" pattern (`lib/commerce/orders.ts`,
  `lib/experiences/bookings.ts`, and this session's own `lib/sensory/
  service.ts`'s `getAssessmentHistoryForEvaluator`) — the same shape
  applies to "farm operator's own assigned lots."
- `AuditEvent` — extend its coverage list (per `SECURITY.md` §6's own
  instruction: "every write to a table carrying `provenance_class`..." and
  "every competition result change or judge assignment change" are already
  named categories; lot/measurement events are the same category of thing).
- `Sample` — extended (§18), not replaced; it already has the right
  canonical shape (nullable project/org/location FKs, `sampleCode` unique,
  `status`/`classification`).
- `SensoryProtocol`/`SensorySession`/`Assessment`/`PanelResult` — Phase 1
  links to this, builds none of it again (§19).
- The module-schema convention (`DATA_ARCHITECTURE.md` §1, recently
  corrected to match reality) — Phase 1's new tables get their own
  `traceability` schema, following the exact precedent every other slice
  already set.
- `RecordStatus`/`ClassificationLevel` — Phase 1's new tables use these
  for lifecycle/visibility exactly as every other table does; this is
  orthogonal to the provenance retrofit (§6, §28) and needs no change.

## 4. Phase 1 Scope

One coffee vertical slice, end to end:

1. A real `Organization` (farm) with `Location`s down to plot granularity.
2. A `Lot` genealogy engine supporting create/split/merge/blend/transfer/
   sample/loss/dispose — the mechanism, not a fixed five-stage pipeline.
3. An event-based `QuantityEvent` ledger — no overwritable weight column.
4. A generalized `Measurement` model covering temperature/pH/Brix/RH/
   moisture/water-activity/weight, MANUAL source only (§10-11).
5. Harvest/Receiving capture (§13).
6. Fermentation and Drying as typed "run" entities linked to Lot
   transformations (§15-16).
7. Storage with location history (§17).
8. Samples with real lot lineage (§18).
9. A minimum integration boundary into the *existing* Sensory module —
   zero new sensory schema (§19).
10. An Operator Workbench: Active Operations view + canonical Lot Detail
    page (§23-24).
11. A reproducible, web-rendered Lot Summary report (§27).
12. Full RBAC/audit coverage for all of the above (§25-26).
13. The provenance vocabulary, designed and applied to every new table
    above from creation (§6, §28) — the retrofit onto the six already-built
    tables is explicitly **not** in this scope (§5).

## 5. Explicit Non-Scope

Deferred, matching the input prompt §42 list exactly, cross-checked against
what's already built to catch anything that would otherwise silently
duplicate existing work:

- Full Research OS (`Experiment`/`Evidence`/`EvidenceClaim`) — Phase 1
  builds a protocol-execution shape *compatible* with it (§14), not the OS
  itself.
- Commerce, Publer/social automation, complex AI agents, satellite/weather
  integration, 360/3D, predictive fermentation/sensory, SaaS billing,
  generalized ag ERP, IoT ingestion, autonomous recommendations, complex
  marketing attribution — none of these have any built infrastructure to
  accidentally duplicate; confirmed clean skips.
- **The provenance vocabulary retrofit onto Sensory/Competitions/Partner's
  six already-built fact-bearing tables** (§6, §28) — new scope item this
  plan adds to the deferred list, with explicit reasoning, not silently
  dropped.
- Sensor/device-integrated measurement sources — architecture accommodates
  it (§11), no adapter built.
- Blind-code-as-sample-identity — explicitly rejected per input prompt §19;
  `Sample` stays canonical, a future competition/formal-judging blind code
  is a separate mapping, exactly the pattern `SensoryBlindMapping` already
  proves works (`RBAC.md` §7).
- Full offline sync for field forms — architecture stays offline-friendly
  (§24) per `OFFLINE_FIELD_CAPABILITY.md`'s already-approved design, but
  wiring it up is not gated into Phase 1's success criteria (§37).

## 6. Canonical Entity Decisions

### 6.1 Entity Matrix

| Entity | Current Status | Recommendation | Domain Owner | Purpose | Key Relationships | Migration Impact | Phase 1 Required? |
|---|---|---|---|---|---|---|---|
| Person | Built (`core`) | **KEEP** | core | Canonical human identity | Organization (via future Membership), UserAccount | None | Yes |
| UserAccount | Built (`core`) | **KEEP** | core | Login/session identity | Person 1:1 | None | Yes |
| Organization | Built (`core`), `farm` type seeded | **KEEP** | core | Farm/producer/processor identity | Location, Sample | None | Yes |
| OrganizationMembership | Specified (`DOMAIN_MODEL.md` §2), never built | **NEW, not built this phase** | core | Display attribution ("Owner" at Farm X) | Person, Organization | Additive, low risk | **No** — not on Phase 1's critical path; a Harvest/Receiving `operator` field references `Person` directly, which is sufficient for attribution without this table |
| Location | Built (`core`) | **EXTEND** | core | Farm/plot/processing/drying/storage sites | Organization, parent hierarchy | Additive enum values, no data migration | Yes — `plot` at minimum |
| Project | Built (`core`) | **KEEP** | core | Optional grouping; a Lot's Project link stays nullable | DomainTag, Location | None | Optional (nullable FK only) |
| ProjectMembership | Never specified anywhere, not built | **NOT NEEDED** | — | — | `Assignment` (scope=project) already covers "who has project access" — a separate membership concept would duplicate it | None | No |
| RoleProfile/Permission | Built (`core`) | **EXTEND** (new permissions, no schema change — data, not code, per `RBAC.md` §2) | core | Lot/measurement authorization | Assignment | None (seed data only) | Yes |
| Assignment/Scope | Built (`core`) | **KEEP** | core | Contextual permission grants | UserAccount, RoleProfile | None | Yes |
| Asset (= "MediaAsset") | Built (`core`) | **KEEP, no rename** | core | Photo attachments on Harvest/Measurement/Lot | Any entity via FK | None | Yes (photo fields, §13/§24) |
| AuditEvent | Built (`core`) | **EXTEND coverage** | core | Immutable change log | Polymorphic `entityType`/`entityId` | None (schema already generic) | Yes |
| Sample | Built (`core`) | **EXTEND** | core | Physical/informational traceable unit | Add `sourceLotId`, `sourceTransformationId` (nullable) | Additive FK | Yes |
| **Lot** | Does not exist | **NEW** | `traceability` (new schema) | Canonical genealogy node | LotTransformation (input/output) | New table | Yes — critical path |
| **LotTransformation** | Does not exist | **NEW** | `traceability` | Records every split/merge/blend/stage-change/loss/sale | Lot (via input/output join tables) | New table | Yes — critical path |
| **QuantityEvent** | Does not exist | **NEW** | `traceability` | Append-only mass/quantity ledger | Lot, LotTransformation (nullable) | New table | Yes |
| **Measurement** | Does not exist | **NEW** | `traceability` | Generalized typed measurement | Lot/FermentationRun/DryingRun/StorageAssignment/Sample (nullable FKs) | New table, partitioned | Yes |
| **HarvestEvent/ReceivingEvent** | Does not exist | **NEW** | `traceability` | First-mile capture, creates the origin Lot | Location, Organization, Person | New table | Yes |
| **FermentationRun** | Does not exist | **NEW** | `traceability` | Typed stage-execution entity | Lot (input/output via LotTransformation) | New table | Yes |
| **DryingRun** | Does not exist | **NEW** | `traceability` | Typed stage-execution entity | Lot | New table | Yes |
| **StorageAssignment** | Does not exist | **NEW** | `traceability` | Location + container history for a Lot | Lot, Location | New table | Yes |
| **ProtocolExecution/Deviation** | Does not exist (Research OS's `Protocol`/`ProtocolVersion` don't exist either) | **NEW, minimal** | `traceability` | Records planned-vs-actual for a process step | FermentationRun/DryingRun/LotTransformation | New table | Partial — deviation tracking only, no full protocol-versioning engine (§14) |

### 6.2 Provenance vocabulary — the required-scope design (input prompt §-1)

`DATA_ARCHITECTURE.md` §4 already specifies the exact column set; it has
simply never been implemented. This plan adopts it as-is, as real Postgres
enums (not free text) for the first time — consistent with how every other
status-shaped column in this codebase (`RecordStatus`, `ClassificationLevel`,
`AssessmentStatus`, etc.) is already a typed enum, not a string:

```prisma
enum ProvenanceClass {
  measured_fact
  original_record
  direct_observation
  scientific_evidence
  manufacturer_specification
  interpretation
  hypothesis
  conclusion
  recommendation
  ai_suggestion

  @@schema("core")
}

enum DataQuality {
  verified
  verified_with_limitation
  provisional
  unconfirmed
  conflicting
  superseded
  working_hypothesis
  not_tested
  missing_source_record

  @@schema("core")
}
```

Added as a shared `core`-schema pair (mirroring how `RecordStatus`/
`ClassificationLevel` are already `core`-schema enums reused across every
module) plus four columns on every fact-bearing table:

```prisma
provenanceClass  ProvenanceClass @map("provenance_class")
sourceReference  String?         @map("source_reference")
recordedById     String?         @map("recorded_by") @db.Uuid
recordedBy       Person?         @relation(fields: [recordedById], references: [id])
recordedAt       DateTime?       @map("recorded_at")
dataQuality      DataQuality?    @map("data_quality")
```

`provenanceClass` is `NOT NULL` on every new write path going forward
(matches `DATA_ARCHITECTURE.md` §4's "mandatory, not conventional"
language literally); `dataQuality`/`sourceReference`/`recordedBy`/
`recordedAt` stay nullable, since not every fact carries all four (a
manual harvest weight has an operator and a timestamp; a derived metric
computed from other measurements may not need a human `recordedBy` at
all).

**Every new Phase 1 table (§6.1's `NEW` rows) gets this column set from its
first migration.** No retrofit needed for tables that don't exist yet —
this is the concrete difference between "designing it right the first
time" and "the retrofit debt this plan also has to name" (§6.3).

### 6.3 The retrofit — which built tables need it, and the explicit sequencing call

Applying `DATA_ARCHITECTURE.md` §4's own stated scope ("research
measurements, observations, evaluations, environmental readings,
competition results") to what's actually built today, not everything —
Commerce's `Order`/`Payment` are transaction records, not evidence, and
correctly stay out of scope:

| Table | Schema | Why it qualifies |
|---|---|---|
| `Assessment` | `sensory` | A judge's evaluation — `direct_observation`, the textbook case this vocabulary was designed for |
| `AttributeResponse` | `sensory` | Same evaluation, per-attribute |
| `PanelResult` | `sensory` | A derived/computed metric — `interpretation`, with `sourceReference` pointing at the computation method (already partially covered by `CLAUDE.md` §28's "derived metrics must store method/formula/version," currently unimplemented) |
| `CalibrationResult` | `sensory` | A panelist capability test result — `direct_observation` |
| `CompetitionResult` | `competitions` | `finalScore` is a snapshotted measurement — `measured_fact` at the moment of finalization |
| `FieldSubmission` | `partner` | Field-collected data/notes — `direct_observation`, the closest existing analog to what Phase 1's own Harvest/Measurement records will be |

**`ReferenceStandard` is deliberately excluded** — it already has its own,
more specific provenance-shaped field (`standardOrigin`:
`commercial_third_party|self_created|adapted_from_commercial`), which is
better-fitted to that specific domain than the general vocabulary would
be. Retrofitting the general columns on top would be redundant, not an
improvement — noted explicitly so this isn't read as an oversight.

**Explicit sequencing decision, with reasoning, per the input prompt's
own instruction not to leave this unstated**: the retrofit is **not**
part of Phase 1. It is sequenced as the **first fast-follow immediately
after Phase 1's gates pass** (a "Phase 1.5"), not folded into Phase 1
itself. Reasoning:

- Nothing in Phase 1's own success criteria (§37) depends on Sensory,
  Competitions, or Partner Workspace having these columns — the coffee
  genealogy slice is fully achievable without touching those three
  modules' schemas at all.
- Retrofitting six tables that are already live, tested (Sensory has the
  platform's only real production-shaped write paths with actual seeded
  history), and shipped means: a migration with backfill logic for
  existing rows (what `provenanceClass` should existing `Assessment` rows
  get, retroactively?), plus updating three separate service layers'
  write paths (`lib/sensory/service.ts`, `lib/competitions/service.ts`,
  `lib/partner/workspace.ts`) to actually populate the new columns going
  forward, plus regression-testing all three. That's a meaningfully
  different, module-spanning kind of work from building new
  `traceability.*` tables from scratch.
- Folding it into Phase 1 would double Phase 1's real surface area for a
  requirement that's about closing a *pre-existing* gap, not about
  proving the coffee slice's value — diluting focus against the input
  prompt's own §0 instruction that Phase 1 should be "the smallest
  foundational implementation that proves the platform's core value."
- The risk of deferring is small and named honestly (§38): the gap stays
  open a little longer, exactly as it has been since Slice 6. It does not
  compound — no new fact-bearing table ships without the vocabulary from
  this point forward (§6.2), so the retrofit backlog is fixed at exactly
  these six tables, not growing.

## 7. Farm / Organization / Location Model

**Farm is `Organization` with `organizationType = farm`, confirmed as the
existing, working decision — not re-litigated.** Finca Rosina is already
seeded this way and referenced by `Story`/`Location`/`Product` today. This
directly answers the input prompt §6 question ("Organization subtype vs.
specialized entity vs. both"): the codebase already committed to
"Organization subtype, no specialized entity," and nothing in Phase 1's
requirements needs more than that — a specialized `Farm` entity would
duplicate `Organization` for zero functional gain (`DATA_ARCHITECTURE.md`
§3's typed-JSONB-attributes pattern already covers any farm-specific
fields that aren't universally queried).

**`LocationType` needs exactly one new value for Phase 1: `plot`.**
Current enum (`country|province|district|locality|site`) has no
plot/block granularity. Recommendation, directly reusing
`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §H's already-approved design:
a Plot is a `Location` with `locationType = plot` and `parentLocationId`
pointing at the farm's own `site`-typed Location row — not a new entity
family, an additive enum value. Processing/drying/storage sites can reuse
the existing `site` type with a descriptive `name` (e.g. "Finca Rosina —
Drying Patio") rather than needing their own enum values, since nothing in
Phase 1 needs to *query* "give me all drying sites" across organizations —
if that need appears later, it's a cheap follow-up enum addition, not a
redesign.

PostGIS: `Location.geoPoint` already exists and is already enabled
(`DECISIONS.md` ADR-021). Phase 1 uses it for farm/plot-level coordinates
where known; no new spatial capability needed.

## 8. Lot Genealogy Architecture

### 8.1 Required reconciliation with `DOMAIN_MODEL.md`

`DOMAIN_MODEL.md` §4 (Agricultural Traceability) specifies:

```
Lot → HarvestEvent → Selection → Processing → Fermentation → Drying →
Storage → Transport → GreenSample → RoastSession → Brewing → SensorySession
```

This is a **conceptual pipeline naming the stages**, not a relational
mechanism — it says nothing about how a lot physically splits, merges, or
blends between those stages, which the input prompt's own §7 correctly
identifies as the critical gap. `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`
§F (approved, ADR-020) already designed that mechanism:

```
traceability.lot (
  id, lot_code, lot_type[cherry|processing|drying|green|roast|sample|other],
  origin_harvest_event_id (nullable), status, created_at, created_by
)
traceability.lot_transformation (
  id, transformation_type[split|merge|blend|stage_change|sample_extraction|
                          loss|disposal|sale],
  occurred_at, protocol_version_id (nullable), operator_id, notes, created_at
)
traceability.lot_transformation_input  (transformation_id, lot_id, quantity, unit)
traceability.lot_transformation_output (transformation_id, lot_id, quantity, unit)
```

**Verdict: this is not a competing model to reconcile away — it is the
physical mechanics underneath `DOMAIN_MODEL.md`'s named stages.** Every
stage named in the conceptual chain maps onto this mechanism directly:

| `DOMAIN_MODEL.md` stage | Mechanism |
|---|---|
| `HarvestEvent` | A new `HarvestEvent` row (§13) that creates the origin `Lot` (`lot_type = cherry`) |
| `Selection` | A `lot_transformation` with `transformation_type = stage_change` (or `split`, if selection separates out a distinct sub-lot) — not its own `lot_type`, since it's a within-stage refinement, not a new material state |
| `Processing` → `Fermentation` → `Drying` → `Storage` | Each transition is a `lot_transformation` (`stage_change`), and `FermentationRun`/`DryingRun`/`StorageAssignment` (§15-17) are the typed "what actually happened" records the transformation points at — matching input prompt §8's **Option C (hybrid)** exactly: canonical `Lot` + specialized stage-execution entities |
| `Transport` | A `quantity_event` (`transfer_out`/`transfer_in`, §9) plus, if the lot's location genuinely changes custody, a `stage_change` transformation — not a new entity |
| `GreenSample` | `Sample.sourceLotId` (§6.1, §18) — a `sample_extraction` transformation whose output is a `core.Sample` row, not a second `Lot` row |
| `RoastSession`/`Brewing` | Out of Phase 1 scope (§5) — the model has an explicit slot (`lot_type` could add `roast` when that vertical is scheduled) but nothing is built now |
| `SensorySession` | The existing, unmodified `sensory.SensorySession`, linked via `Sample` (§19) — zero new schema |

This is the recommended approach for §8's required Option A/B/C
comparison. Named explicitly against the prompt's own framing: this is
**Option C**, canonical `Lot` + specialized run entities, not pure Option B
(events alone would lose the typed fermentation/drying-specific fields
§15-16 need) and not Option A (stage-specific `Lot` subtype tables would
be exactly the "duplicate canonical entity" anti-pattern `CLAUDE.md` §2
warns against, and would make merge/blend genuinely awkward since a merge
output's "type" wouldn't cleanly belong to one stage-specific table).

**The one genuine extension beyond `COMMERCE_OPERATIONS_TOOLS_
ARCHITECTURE.md` §F**: that document didn't specify `FermentationRun`/
`DryingRun`/`StorageAssignment` as their own tables — its §I `Measurement`
table referenced `fermentation_run_id`/`drying_lot_id`/`storage_lot_id` as
if they already existed, without designing them. This plan designs those
three (§15-17), closing that gap.

### 8.2 Append-only invariant — the correctness rule that matters most

Carried forward verbatim from `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`
§F, because it's correct and because weakening it is the single highest-
consequence mistake Phase 1 could make: **`Lot` and `LotTransformation`
rows are never updated in place.** A stage change, a correction, a new
measurement is always a new `LotTransformation` or `QuantityEvent`
referencing the existing `Lot` — never an `UPDATE` to a historical row. A
lot's current state/quantity is always *computed* from the transformation/
event history, never stored as an overwritable column. This is the same
principle already proven in this codebase for `Assessment` (immutable,
`supersedesAssessmentId` for corrections) and `SensoryProtocolVersion`
(versioned, never overwritten) — applied here because getting it wrong
would silently corrupt traceability with no error, discovered only when a
report doesn't add up.

### 8.3 Required lineage diagram

Split example (Harvest → Processing → Fermentation → Drying → Storage →
Green → Sample → Sensory):

```
HarvestEvent H-001
      │ creates
      ▼
Lot L-001 (cherry, 500kg)
      │ LotTransformation T-001 (split)
      ├──────────────┬──────────────┐
      ▼              ▼              ▼
Lot L-002        Lot L-003       Lot L-004
(processing,     (processing,    (processing, control,
 300kg)           150kg)          50kg)
      │
      │ LotTransformation T-002 (stage_change: → fermentation)
      ▼
FermentationRun F-001 (input: L-002)
      │ ends, LotTransformation T-003 (stage_change: → drying)
      ▼
Lot L-005 (drying, ~285kg wet parchment)
      │
DryingRun D-001 (input: L-005)
      │ ends, LotTransformation T-004 (stage_change: → green)
      ▼
Lot L-006 (green, ~75kg)
      │
      │ LotTransformation T-005 (sample_extraction, output: Sample not Lot)
      ▼
Sample S-001 (1.5kg, sourceLotId = L-006)
      │
      ▼
SensorySession (existing sensory.* schema, linked via Sample)
```

Merge/blend example:

```
Lot L-010 (green, Geisha, 40kg)  ─┐
                                    ├──▶ LotTransformation T-020 (blend)
Lot L-011 (green, Geisha, 35kg)  ─┘             │
                                                  ▼
                                          Lot L-012 (green, blend, 75kg)
```

Both directions are ordinary recursive CTEs over
`lot_transformation_input`/`output` — "where did this come from" walks
`output → input` backward; "what did this become" walks `input → output`
forward. No graph database, no new infrastructure — same conclusion
`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F already reached and this
plan re-confirms rather than re-derives.

## 9. Quantity / Mass Architecture

Event-based ledger, adopted directly from `COMMERCE_OPERATIONS_TOOLS_
ARCHITECTURE.md` §G:

```prisma
model QuantityEvent {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  lotId               String   @map("lot_id") @db.Uuid
  lot                 Lot      @relation(fields: [lotId], references: [id])
  eventType           QuantityEventType @map("event_type")
  quantity            Decimal  @db.Decimal(10, 3)
  unit                String
  occurredAt          DateTime @map("occurred_at")
  transformationId    String?  @map("transformation_id") @db.Uuid
  transformation      LotTransformation? @relation(fields: [transformationId], references: [id])
  recordedById        String?  @map("recorded_by") @db.Uuid
  // provenance columns (§6.2) — dataQuality specifically carries the
  // "estimated vs. weighed" distinction input prompt §9 asks for
  provenanceClass     ProvenanceClass @default(direct_observation) @map("provenance_class")
  dataQuality         DataQuality?    @map("data_quality")
  notes               String?
  createdAt           DateTime @default(now()) @map("created_at")
}

enum QuantityEventType {
  received
  process_output
  loss
  sample_removed
  adjustment
  transfer_in
  transfer_out
}
```

A lot's current quantity is **computed** (`SUM` over its `QuantityEvent`
rows), never a stored overwritable column — same append-only principle as
§8.2. `dataQuality` lets "285 kg wet parchment, weighed" and "~285 kg
wet parchment, estimated" both be recorded honestly, directly satisfying
input prompt §9's "missing measurements must remain missing... do not
infer mass loss automatically unless explicitly calculated as a derived
metric" instruction — a mass-balance report can compute loss between two
`QuantityEvent`s, but that computed figure is itself a new, explicitly-
labeled `derived` record, never silently written back as if it were
another `direct_observation`.

## 10. Measurement Architecture

### 10.1 The hybrid, and why

Input prompt §10 warns against both "one huge table with dozens of
nullable columns" and "arbitrary JSON where typed semantics matter."
Directly reusing the resolution `EXTERNAL_DATA_ARCHITECTURE.md` §14
already reached for the identical problem (canonical variable names/units
defined once, every write path normalizes into them, never stored in a
provider's native unit "to figure out later"): `variable` is a validated
string (Zod-checked against a small canonical registry at the application
layer, per `SECURITY.md` §3), not a Postgres enum requiring a migration
for every new measurement type the platform will need as it grows into
honey/fermentation/other domains, and not unvalidated free text either.
`value`+`unit` are typed columns (`Decimal`+`String`), never JSON.

```prisma
model Measurement {
  id                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  variable              String   // validated against the canonical registry, app-layer
  value                 Decimal  @db.Decimal(12, 4)
  unit                  String
  occurredAt            DateTime @map("occurred_at")

  // Specific nullable FKs, not a polymorphic subject_type/subject_id pair —
  // reusing COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md §I's explicit
  // trade-off (referential integrity over table width), extended with
  // lotId/sampleId since Phase 1's subject list is broader than that
  // document scoped for.
  lotId                 String?  @map("lot_id") @db.Uuid
  fermentationRunId     String?  @map("fermentation_run_id") @db.Uuid
  dryingRunId           String?  @map("drying_run_id") @db.Uuid
  storageAssignmentId   String?  @map("storage_assignment_id") @db.Uuid
  sampleId              String?  @map("sample_id") @db.Uuid

  sourceType            MeasurementSourceType @map("source_type")
  deviceId              String?  @map("device_id")
  operatorId            String?  @map("operator_id") @db.Uuid

  provenanceClass       ProvenanceClass @default(direct_observation) @map("provenance_class")
  dataQuality           DataQuality?    @map("data_quality")
  note                  String?
  createdAt             DateTime @default(now()) @map("created_at")

  @@index([lotId])
  @@index([fermentationRunId])
  @@index([dryingRunId])
  @@index([storageAssignmentId])
  @@index([sampleId])
}

enum MeasurementSourceType {
  manual
  device
  sensor
  lab
  import
  external_context
  derived
}
```

Partitioning: not applied in Phase 1. `DATA_ARCHITECTURE.md` §6's
partitioning pattern is designed for the environmental-observation write
volume (continuous sensor feeds); Phase 1's `MANUAL`-only source type
(§10.2) means write volume is operator-paced, nowhere near the threshold
that pattern exists for. The table is designed so partitioning can be
added later (range on `occurred_at`) without a shape change — noted, not
built.

### 10.2 Source types — Phase 1 scope

Per input prompt §11: **`MANUAL` only, `DEVICE`-ready architecture, nothing
integrated.** The `sourceType` enum includes all seven values from the
start (cheap, no migration later) but every Phase 1 write path only ever
produces `manual`. `deviceId` stays nullable and unused. This matches the
existing precedent exactly: `EXTERNAL_DATA_ARCHITECTURE.md`'s own
`environmental.observation.source` column already does the identical
"manual and automated coexist in one table by design" thing for weather
data — same shape, applied here for the first time to operational
measurement instead of environmental data.

### 10.3 Required measurement matrix

| Variable | Subject types | Source (Phase 1) | Typical unit | Canonical unit | Phase 1? | Validation |
|---|---|---|---|---|---|---|
| temperature | FermentationRun, DryingRun, StorageAssignment | manual | °C, °F | °C | Yes | Range check (e.g. -10 to 80°C), reject out-of-range |
| pH | FermentationRun | manual | pH | pH | Yes | Range 0-14 |
| Brix | Lot (at receiving), FermentationRun | manual | °Bx | °Bx | Yes | Range 0-40 |
| RH (relative humidity) | DryingRun, StorageAssignment | manual | % | % | Yes | Range 0-100 |
| moisture | DryingRun, Lot (green) | manual | % | % | Yes | Range 0-100 |
| water activity | DryingRun, StorageAssignment | manual | aw | aw | Yes | Range 0-1 |
| weight | Lot (via QuantityEvent, not Measurement — §9) | manual | kg, lb | kg | Yes (via QuantityEvent) | Positive, unit-converted |

Weight is deliberately routed through `QuantityEvent`, not `Measurement`
— it's a *quantity* of material (feeds mass-balance/genealogy), not an
*observation about* material the way temperature/pH/Brix are. Keeping
these two concerns in separate tables (per §9's own design) avoids the
"one huge table" anti-pattern the input prompt warns against by not
merging two structurally different kinds of fact into one.

## 11. Unit Architecture

Canonical units per variable (§10.3's table) defined once in the
application-layer registry (`lib/traceability/units.ts`, new file), every
write path normalizes into it before persistence — directly reusing
`EXTERNAL_DATA_ARCHITECTURE.md` §14's normalization discipline:

```
source_value / source_unit   — what the operator actually entered
normalized_value / normalized_unit — canonical form, what's stored
```

Adopted **only if the operator's entry unit can genuinely differ from
canonical** (e.g., a field team entering Fahrenheit) — where source and
canonical are always the same in practice (pH, Brix, water activity all
have one conventional unit, no real-world alternate), the extra column
pair is skipped rather than added speculatively, per this plan's general
bias against premature structure. Concretely: `Measurement.unit` stores
the canonical unit always; the UI-layer input can accept common
alternates (°F) and convert before submission, with conversion logic
centralized in the one `units.ts` registry — never duplicated per form,
directly avoiding the input prompt §12's named risk.

## 12. Event Architecture

**Typed operational entities + `AuditEvent`, not a generic domain-event
bus.** The input prompt's own §13 list (`HARVESTED`, `LOT_SPLIT`,
`FERMENTATION_STARTED`, `TURNED`, ...) maps cleanly onto three concrete,
already-scoped mechanisms rather than needing a fourth, generic one:

- Lot lifecycle events (`LOT_CREATED`, `LOT_SPLIT`, `LOT_MERGED`, ...) —
  `LotTransformation` rows (§8) are already the typed record of these; a
  generic event table would just be a less-structured duplicate.
- Stage-run events (`FERMENTATION_STARTED`/`ENDED`, `DRYING_STARTED`/
  `ENDED`, `TURNED`, `COVERED`/`UNCOVERED`, `INOCULATED`) —
  `FermentationRun`/`DryingRun`'s own start/end timestamps plus a small
  `interventions` sub-record (§15) cover the "what happened during the
  run" shape directly.
- Everything else that's genuinely "something happened, worth a durable
  record, not itself a domain entity" (`MEASURED`, `SAMPLED`,
  `TRANSFERRED`) — already has its own table (`Measurement`,
  `Sample`-creation, `QuantityEvent`).

This directly answers input prompt §13's own question ("generic domain-
event model or typed entities + audit events") — **typed entities**,
because every event in the list already has, or gets in this plan, a
proper typed home; a generic event table would be redundant with all of
them, not a simplification. `AuditEvent` remains the separate,
infrastructure-level "who changed what, when" log (§26) — never confused
with these business-meaning-carrying records, matching the input prompt's
own explicit caution not to conflate business events with message-bus
events.

## 13. Harvest / Receiving

```prisma
model HarvestEvent {
  id                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId            String   @map("location_id") @db.Uuid  // the plot
  organizationId        String   @map("organization_id") @db.Uuid  // the farm
  harvestedAt           DateTime @map("harvested_at")
  cultivarNotes         String?  @map("cultivar_notes")  // mixed-cultivar support: free text now, LotCultivarComposition join table if/when a real mixed-lot reporting need appears — not built speculatively
  cherryWeightKg        Decimal? @db.Decimal(10, 3) @map("cherry_weight_kg")
  brix                  Decimal? @db.Decimal(5, 2)
  temperatureC          Decimal? @db.Decimal(5, 2) @map("temperature_c")
  condition             String?
  ripenessNotes         String?  @map("ripeness_notes")
  operatorPersonId      String?  @map("operator_person_id") @db.Uuid
  notes                 String?
  resultingLotId        String   @unique @map("resulting_lot_id") @db.Uuid  // the Lot this creates
  provenanceClass        ProvenanceClass @default(direct_observation) @map("provenance_class")
  createdAt              DateTime @default(now()) @map("created_at")
}
```

Photos: `ContentEntityLink`-shaped join to `core.Asset` (per `ADAPTIVE_
INTELLIGENCE_EXPERIENCE_REVIEW.md` §D's precedent — a join table, not a
new media mechanism). `ReceivingEvent` is the same shape as `HarvestEvent`
for material arriving from an external supplier rather than an owned
harvest — modeled as a second, near-identical table rather than a nullable
"is this a harvest or a receiving" flag on one table, since the input
prompt's own field list (farm/plot vs. supplier/delivery-note) genuinely
diverges enough to warrant separate tables, consistent with `DOMAIN_
MODEL.md` §20's "domain-specific tables only where semantics genuinely
diverge" principle. Both create a `Lot` with `lotType = cherry`.

**No mixed-cultivar join table in Phase 1** — `cultivarNotes` stays free
text. `DOMAIN_MODEL.md` §4 already specifies `LotCultivarComposition` for
this, but building it now, before a single real Lot exists, is exactly the
premature-structure risk `PLATFORM_OVERVIEW.md` §5 warns against; add it
when a real multi-cultivar lot needs precise composition tracking, not
speculatively.

## 14. Processing / Protocol Execution

Minimal, matching `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §J's shape,
but genuinely reduced in scope since — unlike that document's context —
**no `Protocol`/`ProtocolVersion` table exists anywhere to reuse yet**
(§2). Phase 1 builds only the "did this run deviate from what was
planned" record, not a full versioned-protocol engine:

```prisma
model ProcessExecution {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  executedAgainstType  String   @map("executed_against_type") // 'fermentation_run' | 'drying_run'
  executedAgainstId    String   @map("executed_against_id") @db.Uuid
  protocolNote         String?  @map("protocol_note") // free text: "standard 48h washed process" — no versioned Protocol entity yet
  startedAt            DateTime @map("started_at")
  endedAt              DateTime? @map("ended_at")
  operatorPersonId     String?  @map("operator_person_id") @db.Uuid
}

model Deviation {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  processExecutionId  String   @map("process_execution_id") @db.Uuid
  processExecution    ProcessExecution @relation(fields: [processExecutionId], references: [id])
  expected            String
  actual              String
  reason              String?
  recordedById        String?  @map("recorded_by") @db.Uuid
  recordedAt          DateTime @default(now()) @map("recorded_at")
}
```

**Designed so Research OS can adopt it later without a rewrite**: when
`Protocol`/`ProtocolVersion` are eventually built, `ProcessExecution.
protocolNote` (free text) is replaced by a real `protocolVersionId` FK —
an additive schema change, not a restructure, since `ProcessExecution`'s
shape (executed-against polymorphic reference, start/end, operator) stays
identical either way. This is the concrete form of `COMMERCE_OPERATIONS_
TOOLS_ARCHITECTURE.md` §J's "reuse Protocol/ProtocolVersion for both
experimental and operational" intent — honored as a forward-compatible
shape now, executed for real once the entity it depends on exists.

## 15. Fermentation

```prisma
model FermentationRun {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  vesselNote          String?  @map("vessel_note")  // free text ("Tank 3") — no Vessel entity yet, per DOMAIN_MODEL.md §20's deferred Fermentation & Beverage module
  startedAt           DateTime @map("started_at")
  endedAt             DateTime? @map("ended_at")
  operatorPersonId    String?  @map("operator_person_id") @db.Uuid
  inoculated          Boolean  @default(false)
  inoculationNote     String?  @map("inoculation_note")
  createdAt           DateTime @default(now()) @map("created_at")

  interventions       FermentationIntervention[]
  measurements        Measurement[]
}

model FermentationIntervention {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  fermentationRunId  String   @map("fermentation_run_id") @db.Uuid
  fermentationRun    FermentationRun @relation(fields: [fermentationRunId], references: [id])
  interventionType   FermentationInterventionType @map("intervention_type")
  occurredAt         DateTime @map("occurred_at")
  notes              String?
}

enum FermentationInterventionType {
  inoculation
  agitation
  purge
  addition
  sample
  transfer
  termination
  other
}
```

Input lot(s)/output lot(s) are **not** FKs on `FermentationRun` directly —
they're expressed through the `LotTransformation` that references this
run (§8.1's `stage_change` mapping), keeping the single source of lineage
truth in one place (`LotTransformation`) rather than duplicating it on
every stage-run table. `inoculated` defaults `false`, matching input
prompt §16's explicit "do not force every fermentation to be inoculated"
instruction.

## 16. Drying

```prisma
model DryingRun {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  method              String?  // 'raised_bed' | 'patio' | 'mechanical' | free text
  locationId          String?  @map("location_id") @db.Uuid  // the drying site/bed Location
  layerDepthCm        Decimal? @db.Decimal(6, 2) @map("layer_depth_cm")
  startedAt           DateTime @map("started_at")
  endedAt             DateTime? @map("ended_at")
  createdAt           DateTime @default(now()) @map("created_at")

  turningEvents       DryingTurnEvent[]
  measurements        Measurement[]
}

model DryingTurnEvent {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  dryingRunId  String   @map("drying_run_id") @db.Uuid
  dryingRun    DryingRun @relation(fields: [dryingRunId], references: [id])
  eventType    String   @map("event_type") // 'turned' | 'covered' | 'uncovered'
  occurredAt   DateTime @map("occurred_at")
  operatorPersonId String? @map("operator_person_id") @db.Uuid
}
```

All fields nullable except identity/timing, per input prompt §17's "do not
make all fields mandatory" instruction — a farm that dries on a simple
patio with no layer-depth tracking still gets a valid record.

## 17. Storage

```prisma
model StorageAssignment {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  lotId         String    @map("lot_id") @db.Uuid
  lot           Lot       @relation(fields: [lotId], references: [id])
  locationId    String    @map("location_id") @db.Uuid
  containerNote String?   @map("container_note")  // "Bag #14" — free text, no Container entity in Phase 1
  startedAt     DateTime  @map("started_at")
  endedAt       DateTime? @map("ended_at")  // null = current assignment
  createdAt     DateTime  @default(now()) @map("created_at")

  measurements  Measurement[]
}
```

**Location history is preserved by never updating `endedAt` retroactively
past the truth** — a lot moving storage location creates a *new*
`StorageAssignment` row (with the prior one's `endedAt` set once, at the
actual move time) rather than mutating one row's `locationId` in place.
Current quantity: computed from `QuantityEvent` (§9), not duplicated here.
Sample extraction from storage: a `LotTransformation` (`sample_extraction`,
§8.1), not a `StorageAssignment` field.

## 18. Sample Management

`core.Sample` (§6.1) **extended**, not replaced:

```prisma
model Sample {
  // ...existing fields unchanged...
  sourceLotId           String?  @map("source_lot_id") @db.Uuid
  sourceLot              Lot?    @relation(fields: [sourceLotId], references: [id])
  sourceTransformationId String? @map("source_transformation_id") @db.Uuid
  sourceTransformation    LotTransformation? @relation(fields: [sourceTransformationId], references: [id])
}
```

Both additive, nullable — existing `Sample` rows (seeded for Sensory/
Competitions demo content) stay valid with `NULL` lineage, since they
predate the Lot model and genuinely have no lot to point at; this is
correctly `missing`, not backfilled with a guess. **Blind codes stay
exactly where they already are** (`sensory.SensoryBlindMapping`) — input
prompt §19's "do not use blind code as canonical sample identity" is
already the enforced reality in this codebase (`RBAC.md` §7), not a new
requirement to satisfy.

## 19. Sensory Integration Boundary

**The Sensory OS already exists (Slice 6) — use it, build nothing new.**
The minimum integration is exactly the FK Phase 1 already adds in §18:
`Sample.sourceLotId`. A Phase 1 coffee sample walks:

```
Lot (green) → LotTransformation (sample_extraction) → Sample
  → [existing, unmodified] SensoryBlindMapping → SensoryBlindSample
  → SensorySession → Assessment → PanelResult
```

Nothing about `SensorySession`/`Assessment`/`PanelResult` changes. This
directly matches this session's own precedent from building Competitions
(`DECISIONS.md` ADR-034): the strongest possible proof this boundary is
correctly minimal is that zero new judging UI or schema was needed there
either — the same "reuse, don't duplicate" verification applies here.

## 20. Research OS Boundary

`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §26/`EXTERNAL_DATA_
ARCHITECTURE.md` §17 already establish the rule this plan inherits exactly:
**Operational Measurement ≠ Approved Research Evidence.** A `Measurement`
or `Deviation` row Phase 1 creates is never automatically an
`EvidenceClaim` — that promotion happens only through Research OS's own
explicit, human-mediated evidence workflow, once Research OS exists.
Nothing in Phase 1 needs to enforce this proactively (there's no
`EvidenceClaim` table yet to accidentally write to), but the principle is
stated here so Research OS's eventual design finds Phase 1's tables ready
to be *referenced* by an evidence-claim join row, not needing restructuring
to become referenceable.

## 21. External Data Boundary

No weather/satellite integration in Phase 1 (input prompt §30, `EXTERNAL_
DATA_ARCHITECTURE.md` §29's own P0 list doesn't include anything Phase 1
needs either). `Measurement`'s `sourceType` enum already includes
`external_context` (§10.1) as a reserved, unused-in-Phase-1 value —
architecture is ready for a future `EnvironmentalContext`-style join
(`EXTERNAL_DATA_ARCHITECTURE.md` §17's pattern) without a schema change
when that integration is actually built.

## 22. AI Boundary

No Ask Néctar implementation in Phase 1 (`AI_PERSONA_MODES_KNOWLEDGE_
TOOLS_ARCHITECTURE.md` §0 already confirmed no `AIProvider` exists at all
— unchanged since that document was written). The domain model is verified
ready for the specific example questions input prompt §31 lists, without
needing anything AI-specific built now:

- *"Which lots are active?"* — a `Lot` query filtered by whether its most
  recent `LotTransformation`/`StorageAssignment` has no terminal state.
- *"Which measurements are missing?"* — a rule-based check (no `Measurement`
  row of an expected `variable` for a given `FermentationRun` past a
  time threshold) — exactly the same shape as the existing `lib/ai/
  service.ts`'s rule-based completeness checker, extensible to this domain
  later without new architecture.
- *"Trace sample S-001 backward"* / *"compare two fermentations"* — both
  answerable via the recursive-CTE lineage queries §8.3 already describes.
- *"Show deviations from protocol"* — a direct `Deviation` query (§14).

None of this requires AI to work — confirming input prompt §31's own
requirement that "AI must not be required for the core workflow."

## 23. Operator UX

One canonical **Lot Detail** page, sections shown only when relevant
(input prompt §22):

```
Overview (lot code, type, current stage, current quantity)
Lineage (ancestors + descendants, rendered from the recursive-CTE query)
Timeline (all LotTransformation + QuantityEvent + Measurement rows, chronological)
Processing (linked FermentationRun/DryingRun/StorageAssignment)
Measurements (filtered to this lot's subject-linked rows)
Samples (Sample rows with sourceLotId = this lot)
Sensory (via Sample → SensorySession, only shown if a linked Sample has one)
Media (Asset rows linked via ContentEntityLink)
Tasks (existing Task rows scoped to this lot's Project, if any)
History (AuditEvent rows for this entity)
```

**Active Operations** view (input prompt §23) — four concrete,
actionable cards, not a decorative dashboard:

- Active `FermentationRun`s (no `endedAt`).
- Active `DryingRun`s (no `endedAt`).
- Lots with no `Measurement` in the expected variable set for their
  current stage past a configurable threshold ("requiring attention," not
  AI-flagged — a plain query).
- `Sample`s with no linked `SensorySession` yet ("awaiting sensory").

## 24. Mobile / Field Requirements

Forms designed mobile-first per input prompt §24: large touch targets,
default-to-now timestamp, optional note, optional photo (via existing
`Asset`/R2 upload path — `lib/integrations/storage/r2.ts` already built
for Partner Workspace, directly reusable), QR-resolvable canonical IDs
(§25). **Full offline sync is explicitly not built in Phase 1** (§5,
matching the input prompt's own "do not build full offline sync unless
roadmap already places it in Phase 1" instruction — it doesn't) — but
every new table's write shape (small, flat forms; no multi-step wizard
state) is compatible with `OFFLINE_FIELD_CAPABILITY.md`'s already-approved
draft-then-sync architecture being layered on later without a schema
change, satisfying the prompt's "avoid architecture that makes offline
support impossible" instruction directly.

## 25. QR Readiness

Canonical IDs are already UUIDs on every new table (§6.1) — a QR payload
encodes a bare `Lot`/`Sample`/`FermentationRun`/`StorageAssignment` UUID
and nothing else, exactly the "no sensitive data directly in the payload"
principle `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §V already stated
for this identical case. No new infrastructure required — a QR scan is a
navigation to `/lots/{id}` (or the equivalent), resolved through the same
RBAC-gated page load as a typed-in URL.

## 26. RBAC

**New permissions, not a new mechanism** (`RBAC.md` §2's "data, not
code" — additive rows in `lib/rbac/catalog.ts`, no migration):

```
("lot", "manage")          — create/transform/correct lots, record measurements
("lot", "view")             — view lot detail/lineage/measurements
("sample", "manage")        — create samples from lots (extends existing Sample creation, currently unguarded by any lot-specific permission)
```

New Role Profile: **Farm Operator** (scope: `project` or `location` —
reusing the existing `ScopeType` enum, no `organization` scope needed for
Phase 1 despite `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §S's broader
recommendation, since a farm operator's Assignment is naturally
project-scoped the same way Partner Field Collector already is) —
`lot:manage`, `sample:manage`, no `classification:clear_*` beyond
`partner` (mirroring `Partner Field Collector`'s existing, precedented
classification grant, `DECISIONS.md` ADR-029 decision 2).

**Deliberately not reusing `research:create_measurement`** (already in the
catalog, unused, seeded for a future Research OS) — recording an
operational fermentation temperature is not research evidence
(`Operational Measurement ≠ Approved Research Evidence`, §20); overloading
that permission would blur exactly the boundary `COMMERCE_OPERATIONS_
TOOLS_ARCHITECTURE.md` §J insists on keeping sharp. A new, separately-named
permission costs nothing and keeps the distinction real, not just
documented.

## 27. Audit / Correction Model

`AuditEvent` coverage extended (per `SECURITY.md` §6's own existing
mandate) to: lot creation, every `LotTransformation`, every
`QuantityEvent`, `Measurement` corrections, `Sample` creation,
`Deviation` records. **Correction model**: an operational `Measurement`
or `QuantityEvent` is corrected by writing a new row with a
`correctsId` (nullable, self-referencing FK, same shape as `Assessment.
supersedesAssessmentId`) pointing at the corrected row, plus a mandatory
`reason` — never an in-place `UPDATE`. This directly satisfies input
prompt §28 ("support corrections without destroying history... do not
make immutable operational records impossible to correct") using a
pattern this codebase has already proven twice (`Assessment`,
`SensoryProtocolVersion`), not a third, different mechanism.

## 28. Database Change Plan

New `traceability` Postgres schema (module-schema convention,
`DATA_ARCHITECTURE.md` §1), added to `datasource.schemas` alongside the
existing seven. New tables, in dependency order:

| Entity | Purpose | New/Existing | Key fields | Relationships | Indexes | Constraints | Audit/version needs | Migration risk |
|---|---|---|---|---|---|---|---|---|
| `Lot` | Genealogy node | New | `lotCode` (unique), `lotType` | → `LotTransformation` (via input/output joins) | `lotCode` unique | — | Append-only (§8.2) | Low — new table, no existing data |
| `LotTransformation` | Records every transition | New | `transformationType`, `occurredAt` | `LotTransformationInput`/`Output` join tables → `Lot` | `occurredAt` | — | Append-only | Low |
| `QuantityEvent` | Mass ledger | New | `eventType`, `quantity`, `unit` | → `Lot`, → `LotTransformation` (nullable) | `lotId` | `quantity >= 0` check (except `loss`/`adjustment`) | Append-only | Low |
| `Measurement` | Typed observations | New | `variable`, `value`, `unit`, `sourceType` | Nullable FKs → `Lot`/`FermentationRun`/`DryingRun`/`StorageAssignment`/`Sample` | Per-subject-FK indexes | — | Correction via `correctsId` (§27) | Low |
| `HarvestEvent`/`ReceivingEvent` | First-mile capture | New | `harvestedAt`, `cherryWeightKg` | → `Location`, → `Organization`, creates `Lot` | `resultingLotId` unique | — | Append-only | Low |
| `FermentationRun` | Stage execution | New | `startedAt`/`endedAt`, `inoculated` | → `Measurement`, → `FermentationIntervention` | — | — | — | Low |
| `DryingRun` | Stage execution | New | `method`, `startedAt`/`endedAt` | → `Location`, → `Measurement`, → `DryingTurnEvent` | — | — | — | Low |
| `StorageAssignment` | Location history | New | `startedAt`/`endedAt` | → `Lot`, → `Location` | `lotId` | — | — | Low |
| `ProcessExecution`/`Deviation` | Planned-vs-actual | New | `executedAgainstType/Id` | Polymorphic → `FermentationRun`/`DryingRun` | — | — | — | Low |
| `Sample` extension | Add lineage FKs | **Existing table, additive migration** | `sourceLotId`, `sourceTransformationId` | → `Lot`, → `LotTransformation` | New FK indexes | Nullable — existing rows unaffected | — | **Low, but the one migration touching a live table with real seeded data** |
| `Location` enum extension | Add `plot` | **Existing enum, additive** | — | — | — | — | — | Low |
| Provenance enums + columns | §6.2 | **New enums; applied to new tables only in Phase 1** | — | — | — | `provenanceClass NOT NULL` on new tables | — | Low for Phase 1 scope; the retrofit (§6.3) onto 6 existing tables is explicitly deferred and carries the session's real migration risk, not this phase |

**No destructive migration anywhere in this plan** — every change is
additive (new tables, new nullable columns/FKs on `Sample`, new enum
values). No `DROP`, no `ALTER ... NOT NULL` on a populated column, no
type narrowing.

## 29. API / Service Plan

New service modules, following the existing modular-monolith convention
(`lib/<module>/service.ts`, matching `lib/sensory/service.ts`,
`lib/competitions/service.ts`) — not created for their own sake, mapped
one-to-one against a real boundary each already has in this plan:

```
lib/traceability/lots.ts          — createLot, recordTransformation (split/merge/blend/stageChange/sampleExtraction), getLotDetail (lineage query), getActiveOperations
lib/traceability/quantity.ts      — recordQuantityEvent, computeCurrentQuantity
lib/traceability/measurements.ts  — recordMeasurement, correctMeasurement, canonical unit registry
lib/traceability/harvest.ts       — recordHarvestEvent, recordReceivingEvent
lib/traceability/fermentation.ts  — startFermentationRun, recordIntervention, endFermentationRun
lib/traceability/drying.ts        — startDryingRun, recordTurnEvent, endDryingRun
lib/traceability/storage.ts       — assignStorage, moveStorage
lib/traceability/samples.ts       — createSampleFromLot (extends existing Sample creation with sourceLotId)
lib/traceability/reports.ts       — getLotSummary (§27)
```

No separate `LotGenealogyService`/`SensoryLinkService` split from
`lots.ts`/existing `sensory/service.ts` respectively — the input prompt's
own §37 instruction ("do not create services merely for aesthetic
architecture") argues against fragmenting one cohesive Lot-lineage
concern into two files, and the sensory link is a single FK read, not a
service boundary.

## 30. UI Screen Plan

Exactly the input prompt §38 list, confirmed as the right scope (no
additions, no trimming needed):

1. Active Operations (`/lots` landing view, §23)
2. Lot List (filterable, `/lots`)
3. Lot Detail (`/lots/[id]`, §23)
4. Create Lot (via Harvest/Receiving form, not a bare "create lot" form —
   a `Lot` only ever comes into existence through a `HarvestEvent`/
   `ReceivingEvent` or a `LotTransformation` output, never created
   standalone, matching §8's model)
5. Record Measurement (a shared component, mounted contextually on
   Fermentation/Drying/Storage/Lot detail views — not a standalone page)
6. Record Process/Fermentation (`/lots/[id]/fermentation/new`)
7. Record Drying (`/lots/[id]/drying/new`)
8. Record Storage Movement (`/lots/[id]/storage/new`)
9. Create Sample (`/lots/[id]/samples/new`)
10. Sensory linkage/result view (a read-only panel on Lot Detail, linking
    into the *existing, unmodified* `/sensory/[sessionId]` page — §19)
11. Lot Report (`/lots/[id]/report`, web-rendered per §27, PDF deferred)

## 31. Testing Strategy

Per the gap analysis's Part 4 finding that this codebase has exactly one
test file (RBAC only) despite five shipped modules — Phase 1 is the right
place to start closing that gap, not compound it, since it's greenfield
code with no legacy-test debt to work around:

**UNIT**: lineage-traversal correctness (split then merge round-trips to
the right total quantity), `QuantityEvent` sum computation, unit
conversion (§11), Zod validation for `Measurement.variable`/canonical
registry.

**INTEGRATION**: full lot creation → split → fermentation → drying →
storage → sample chain against a real (test) database, exercising every
new service function in §29 — same "real Postgres, no mocks" discipline
`CLAUDE.md`'s testing guidance and this session's own memory of prior
feedback both establish.

**RBAC**: Farm Operator can manage lots within their Assignment's project
scope; cannot reach a different project's lots (scope-containment
negative test, matching `RBAC.md` §9's mandatory positive+negative
pattern); a Customer/unauthenticated request is denied.

**END-TO-END**: one full coffee workflow, browser-driven against a real
Neon database with clearly-labeled TEST fixtures, cleaned up afterward —
the exact verification discipline this session has used for every prior
slice (Sensory, Competitions, Calibration), applied here for the first
time as an actual `*.test.ts` file rather than only a one-time manual
pass.

## 32. Seed / Demo Strategy

DEMO-labeled fixtures only (`CLAUDE.md` §54, `SEED_DEMO_CONTENT` gate,
same convention every prior slice used). No fabricated cherry weights,
Brix readings, fermentation temperatures, or dates beyond what's needed to
demonstrate the mechanism — matching the project's consistent anti-
fabrication discipline (verified in this session's own work on Sensory/
Competitions/Calibration seed content). One realistic DEMO harvest → split
→ ferment → dry → store → sample chain for Las Nubes (the existing seeded
DEMO project), explicitly not real production data.

## 33. Migration Strategy

| Change | Classification |
|---|---|
| New `traceability` schema + 9 new tables | **NEW** |
| `Sample.sourceLotId`/`sourceTransformationId` | **EXTEND** (additive, nullable) |
| `LocationType` + `plot` value | **EXTEND** (additive enum value) |
| Provenance enums (`ProvenanceClass`/`DataQuality`) + columns on new tables | **NEW**, applied at creation |
| Provenance retrofit onto `Assessment`/`AttributeResponse`/`PanelResult`/`CalibrationResult`/`CompetitionResult`/`FieldSubmission` | **DEFERRED to fast-follow** (§6.3) — not `REMOVE_LATER`, not `DEPRECATE`; explicitly scheduled, not abandoned |
| Everything else in the existing schema | **KEEP**, untouched |

No `RENAME`, no `MIGRATE` (in the sense of moving data between shapes), no
`DEPRECATE`, no destructive step anywhere in this plan.

## 34. Implementation Ticket Breakdown

| Ticket | Dependency | Domain | Schema | Backend | Frontend | Tests | Risk | Definition of Done |
|---|---|---|---|---|---|---|---|---|
| **T1 — Canonical Lot + LotTransformation schema** | None | traceability | New: `Lot`, `LotTransformation`, input/output joins, provenance enums | `lib/traceability/lots.ts`: createLot, recordTransformation | None yet | Unit: split/merge round-trip; lineage CTE correctness | Low — new tables, but the append-only invariant (§8.2) must be gotten right here or everything downstream inherits the bug | Migration applied to Neon; unit tests pass; a script-level split/merge/blend scenario verified against real DB |
| **T2 — QuantityEvent ledger** | T1 | traceability | New: `QuantityEvent` | `lib/traceability/quantity.ts` | None yet | Unit: sum computation, negative-quantity rejection | Low | Quantity computed correctly across a multi-event lot history |
| **T3 — Measurement architecture + unit registry** | T1 | traceability | New: `Measurement` | `lib/traceability/measurements.ts`, `lib/traceability/units.ts` | None yet | Unit: unit conversion, variable validation | Low | Measurement recordable against a Lot; canonical-unit registry covers §10.3's 7 variables |
| **T4 — Harvest/Receiving capture** | T1, T3 | traceability | New: `HarvestEvent`, `ReceivingEvent`, `Location.plot` | `lib/traceability/harvest.ts` | Create Lot (via Harvest form) | Integration: harvest creates a valid origin Lot | Low | A real DEMO harvest creates a Lot end-to-end |
| **T5 — Sample lineage extension** | T1 | traceability + core | Extend: `Sample` | `lib/traceability/samples.ts` | Create Sample | Integration: sample_extraction transformation + Sample row | Low | Sample correctly links back to its source Lot |
| **T6 — Fermentation run** | T1, T2, T3 | traceability | New: `FermentationRun`, `FermentationIntervention` | `lib/traceability/fermentation.ts` | Record Fermentation | Integration: full fermentation lifecycle | Medium — first "stage-run" entity, sets the pattern T7 follows | Start→intervene→measure→end cycle works, produces a stage-change LotTransformation |
| **T7 — Drying run** | T1, T2, T3, T6 (pattern reuse) | traceability | New: `DryingRun`, `DryingTurnEvent` | `lib/traceability/drying.ts` | Record Drying | Integration | Low (same pattern as T6) | Same shape as T6, drying-specific fields |
| **T8 — Storage assignment** | T1 | traceability | New: `StorageAssignment` | `lib/traceability/storage.ts` | Record Storage Movement | Integration: location-history preservation | Low | Moving storage preserves prior assignment's history |
| **T9 — RBAC: Farm Operator + lot/sample permissions** | T1 | core (RBAC catalog) | None (seed data) | `lib/rbac/catalog.ts` additions | None | RBAC positive+negative (§31) | Low | Farm Operator scoped correctly; cross-project denial verified |
| **T10 — Operator Workbench: Active Operations + Lot Detail** | T1-T9 | traceability | None | Read queries only | Active Operations, Lot Detail pages | E2E: full workflow visible | Medium — the first UI surfacing everything above, likely to surface integration gaps | A user can see identity/lineage/quantity/process/measurements/samples/tasks/audit on one Lot Detail page |
| **T11 — Process/Deviation tracking** | T6, T7 | traceability | New: `ProcessExecution`, `Deviation` | Extend `fermentation.ts`/`drying.ts` | Surfaced on Lot Detail | Unit | Low | A recorded deviation shows on Lot Detail's Processing section |
| **T12 — Sensory linkage panel** | T5, existing Sensory | traceability + sensory (read-only) | None | Read query joining Sample → SensorySession | Sensory panel on Lot Detail | Integration: link renders when present, absent gracefully otherwise | Low — read-only, no sensory schema touched | A Lot with a cupped Sample shows its PanelResult; one without shows nothing, not an error |
| **T13 — Lot Summary Report** | T1-T12 | traceability | None | `lib/traceability/reports.ts` | Lot Report page | E2E: report reproduces from live data | Low | Report renders origin/lineage/processing/measurements/samples/sensory for a real DEMO lot |
| **T14 — Full E2E test + DEMO seed** | T1-T13 | traceability | Seed script additions | None | None | The full coffee-workflow E2E test (§31) | Medium — the integration point that proves everything actually composes | One DEMO harvest-to-sensory chain seeded and passing an automated E2E test, not just a manual verification pass |

## 35. Dependency Graph

```
T1 (Lot + LotTransformation)
 ├─→ T2 (QuantityEvent)
 ├─→ T3 (Measurement + units)
 │    ├─→ T4 (Harvest/Receiving)
 │    ├─→ T6 (Fermentation) ──→ T7 (Drying, pattern reuse)
 │    └─→ T8 (Storage)
 ├─→ T5 (Sample lineage)
 └─→ T9 (RBAC)
      │
T4, T5, T6, T7, T8, T9 ──→ T10 (Operator Workbench)
T6, T7 ──→ T11 (Process/Deviation)
T5 ──→ T12 (Sensory linkage)
T10, T11, T12 ──→ T13 (Lot Report)
T13 ──→ T14 (Full E2E + DEMO seed)
```

## 36. Phase Gates

- **GATE A — Canonical model approved**: this document approved by the
  product owner (blocks T1).
- **GATE B — Genealogy tests pass**: T1's split/merge/blend unit tests
  green against real Postgres.
- **GATE C — Measurement model validated**: T3's unit-registry and
  variable-validation tests green.
- **GATE D — Operator workflow functional**: T10 renders a real, non-empty
  Lot Detail page for a DEMO lot.
- **GATE E — End-to-end trace works**: T14's E2E test passes — full
  harvest-to-sensory chain, both directions of lineage query verified.
- **GATE F — RBAC verified**: T9's positive+negative tests pass; a
  cross-project access attempt is confirmed denied against a real
  database, not just asserted in a unit test with mocked permissions.
- **GATE G — Lot report reproducible**: T13 renders the same report twice
  from the same underlying data with no discrepancy.

No advanced-feature work (retrofit migration, Research OS adoption, AI
querying) begins before Gates A-G all pass, per the input prompt's own
§40 instruction.

## 37. Success Criteria

Matches the input prompt's own §41 list exactly — restated here as the
literal acceptance test for Phase 1, not paraphrased, since it's already
precise:

A user can (1) create/select a farm/location, (2) create a harvest/source
lot, (3) split or transform the lot, (4) record processing/fermentation,
(5) record structured measurements over time, (6) transition into drying,
(7) transition into storage, (8) create a sample, (9) link a sensory
result/session, (10) trace the sample back to origin, (11) trace the
source lot forward, (12) see the full timeline, (13) generate/view a
reproducible lot summary, (14) all under proper RBAC/audit controls —
verified live against Neon with real (DEMO-labeled) data, not asserted
from code review alone, matching every prior slice's verification
discipline this session established.

## 38. Risks

- **Lot genealogy complexity** — mitigated by adopting the already-
  reviewed `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F design rather
  than inventing a new one under time pressure (§8.1).
- **Overly generic models / stage-specific duplication** — the Option
  A/B/C analysis (§8.1) explicitly rejects both extremes; the chosen
  hybrid (Option C) is reasoned, not defaulted to.
- **Nullable-table explosion** — `Measurement`'s specific-FK design (§10.1)
  is wider than a polymorphic pair but bounded (5 nullable FKs, not
  dozens of nullable value columns) — the actual anti-pattern the input
  prompt warns against is columns-per-variable, which this design avoids
  by keeping `variable` as data, not schema.
- **Excessive JSON** — none used; every new table has typed columns
  throughout (§9-10).
- **Poor unit semantics** — the canonical-unit-registry pattern (§11) is
  reused from an already-proven precedent (`EXTERNAL_DATA_ARCHITECTURE.md`
  §14), not invented fresh.
- **Permission leakage / cross-organization access** — mitigated by
  reusing, not reimplementing, the existing RBAC scope-containment
  guarantee (§26); explicitly tested (Gate F).
- **Audit gaps** — `AuditEvent`'s coverage list is explicitly extended
  (§27), not assumed to auto-cover new tables.
- **Mass-balance false precision** — `dataQuality` on `QuantityEvent`
  (§9) exists specifically to prevent "estimated" figures from being
  presented with the same confidence as "weighed" ones.
- **Research/operations confusion** — the boundary (§20) is stated
  explicitly and checked against every new table; nothing in Phase 1
  writes to a Research OS table, because none exists yet to accidentally
  write to.
- **Mobile usability** — addressed structurally (§24), not deferred
  entirely, though full offline sync stays out of scope.
- **Migration complexity** — every Phase 1 migration is additive (§28);
  the one genuinely complex migration this plan identifies (the
  provenance retrofit) is explicitly *not* in Phase 1's own risk surface
  (§6.3).
- **Premature abstraction** — actively resisted throughout: no
  `LotCultivarComposition` (§13), no `Vessel`/`Container` entities (§15,
  §17), no partitioning (§10.1), no `ProjectMembership` (§6.1) — each
  explicitly deferred with reasoning rather than built speculatively.
- **New risk this plan surfaces, not in the input prompt's own list**:
  **test-debt compounding.** The gap analysis found exactly one test file
  in five shipped slices. If Phase 1 repeats that pattern across 14
  tickets and 9 new tables, the debt roughly doubles. §31 treats this as
  a first-class requirement (tests named per-ticket in §34), not an
  afterthought, specifically to avoid that outcome.

## 39. Open Questions

- Should `FermentationRun`/`DryingRun` eventually reference a real
  `Vessel`/`Container` entity (per `DOMAIN_MODEL.md` §20's Fermentation &
  Beverage module) rather than free-text notes? Deferred by design (§15,
  §17) — revisit once that module is actually scheduled, not now.
- Should `HarvestEvent`/`ReceivingEvent` support structured mixed-cultivar
  composition (`LotCultivarComposition`) before or after Phase 1 ships?
  This plan defers it (§13); worth an explicit product-owner call if a
  known upcoming harvest genuinely needs precise composition tracking
  sooner than "when it's needed."
- ~~Does the Farm Operator Role Profile need `location`-scope
  Assignments...~~ — **Resolved**: yes, both `project` and `location`
  scope are supported, confirmed as a seed-data/Assignment-level decision
  with no schema impact (see the decision record at the top of this
  document).

## 40. Product-Owner Decisions Required

1. **Approve the Lot Genealogy reconciliation** (§8.1) — confirm that
   `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F's already-approved
   design, extended with the three new stage-run entities this plan adds,
   is the intended Phase 1 model, rather than requesting a different
   structural approach.
2. **Confirm the provenance retrofit sequencing** (§6.3) — full vocabulary
   built and applied to new tables in Phase 1; retrofit onto the six
   existing fact-bearing tables scheduled as the immediate fast-follow,
   not folded into Phase 1 itself. Confirm or push back.
3. **Confirm the `traceability` schema name** — matches `COMMERCE_
   OPERATIONS_TOOLS_ARCHITECTURE.md`'s own naming; no reason to diverge,
   but naming is cheap to change now and expensive after migrations land.
4. **Confirm Recommended First Ticket (§41)** — T1, or reprioritize.
5. **Confirm no mixed-cultivar composition tracking in Phase 1** (§13,
   §39) — or flag a specific known need that changes this.
6. ~~Confirm Farm Operator's default scope granularity~~ — **Resolved,
   changed from draft**: both `project` and `location` scope are
   supported and expected in practice, not `project` alone. Verified
   no schema change required (see decision record at the top of this
   document).
7. **Confirm full offline sync stays out of Phase 1's gates** (§24, §37)
   — architecture stays compatible, but wiring it up isn't a Phase 1
   success criterion unless directed otherwise.

## 41. Recommended First Ticket

**T1 — Canonical `Lot` + `LotTransformation` schema and its append-only
invariant tests.**

Matches input prompt §49's own instruction to choose based on repository
state, not default to Option A: every other Phase 1 capability (harvest
capture, fermentation, drying, storage, samples, the operator workbench,
the report) depends on `Lot`/`LotTransformation` existing and being
correct — this is the "maximum architectural leverage, minimum user-facing
complexity" ticket the prompt asks for, and the dependency graph (§35)
confirms it's the only ticket with zero prerequisites and the largest
fan-out. Getting the append-only invariant (§8.2) right here, with real
tests, before anything else builds on top of it, is the single highest-
leverage correctness investment available in this plan.

---

*Planning only. No production code modified, no migration created, no
dependency installed, no live data changed, per the constraint given with
this task.*
