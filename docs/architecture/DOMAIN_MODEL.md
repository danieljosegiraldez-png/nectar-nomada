# Domain Model — Néctar Nómada Digital Platform

Refines CLAUDE.md Section 52's entity list into a normalized model. This is the
conceptual model; `DATA_ARCHITECTURE.md` covers physical schema conventions
(column types, indexing, partitioning). Table/column names below are indicative,
not final DDL — migrations come after this doc is approved.

**Build-status markers (added C1 §7, 17_ audit)**: every named entity below
carries one of four tags, so a future reader can tell specified from shipped
without opening `prisma/schema.prisma`. This document is the one both
`GAP_ANALYSIS_2026-08-10.md` and `MVP_ROADMAP.md` §3 should have been
cross-checked against — its own staleness (this section didn't exist before
this pass) is exactly why those two went stale twice over.

- **[BUILT]** — exists in the schema and a real code path uses it.
- **[PARTIAL]** — exists, but incompletely, differently-shaped than specified
  here, or with a materially narrower scope than this doc originally
  described (with a short note on how).
- **[SPECIFIED]** — designed here, not built, correctly deferred per
  `MVP_ROADMAP.md`.
- **[DEFERRED]** — named in this doc's original design but not (yet) built,
  and not currently the focus of active work — distinct from [SPECIFIED]
  only in that [SPECIFIED] items are usually whole modules with an explicit
  roadmap note, while [DEFERRED] marks a specific entity within an otherwise-
  built module.

Verified against `prisma/schema.prisma` and the live codebase as of this
pass; will drift again the same way the schema list in `DATA_ARCHITECTURE.md`
§1 did twice — see §8 below for the maintenance discipline this needs.

---

## 1. The distinction that matters most: Person vs. User Account vs. Role

These three are separate entities and must never collapse into one row or one field.

### Person
A canonical human identity. Exists whether or not that human ever logs in. A
producer interviewed for a story, a judge in a competition, a farm owner — all are
Person records the moment the platform needs to reference them, independent of
whether they have credentials.

`Person(id, given_name, family_name, display_name, email(nullable), phone(nullable),
locale, bio, created_at, updated_at, created_by, status)`

### User Account
Login credentials and session identity. A 0-or-1 relationship to Person: a Person
may have zero User Accounts (never invited to log in) or exactly one (the platform
does not support multiple login identities per human). A User Account without a
linked Person cannot exist — even a service/system account is represented as a
Person of type "system."

`UserAccount(id, person_id UNIQUE, auth_provider, auth_subject, email_verified_at,
last_login_at, status[active|invited|suspended|deactivated], created_at, updated_at)`

### Role — never stored on the User
There is no `role` column on `UserAccount` or `Person`. A role is always the result
of an **Assignment**: `UserAccount → Assignment → Scope → Role Profile → Permission`
(full mechanics in `RBAC.md`). The same Person can simultaneously be:

- Producer at Farm A (Organization membership, not a platform role)
- Research Contributor on Project B (Assignment, scope = Project B, role profile =
  "Research Contributor")
- Judge in Competition C (Assignment, scope = Competition C edition, role profile =
  "Judge")

None of these is "the user's role." Each is a scoped grant that exists only where
declared and expires when its Assignment ends. This is why `RBAC.md` is a separate
document instead of a section of this one — the resolution logic is non-trivial
enough to deserve its own spec, and it is the piece most likely to be collapsed by
accident under time pressure.

## 2. Organization membership vs. platform permission

`OrganizationMembership(id, person_id, organization_id, title, started_at,
ended_at(nullable), status)` records that a Person is, e.g., "Owner" or "Field
Technician" at an Organization. This is descriptive metadata (what to call this
person in that context, for display and story attribution) — it grants **no**
platform permission by itself. Wanting a producer's OrganizationMembership to also
grant them Partner Workspace access requires a separate, explicit Assignment. The
two are correlated in practice (most Assignments are created because of an
Organization relationship) but are not the same mechanism, because permission scope
and organizational title do not always move together (a producer can lose Partner
Workspace access for one project while remaining listed as the farm's owner).

## 3. Canonical entity layer

These exist once, referenced everywhere:

- **Person** `[BUILT]` — see §1.
- **UserAccount** `[BUILT]` — see §1. No `role` column, confirmed live in
  schema — the "role is always via Assignment" design (§1) holds exactly as
  specified.
- **Organization** `[BUILT]` — typed via `organization_type` (Farm, Estate, Producer, Roaster,
  Brewery, Winery, Distillery, Apiary, Laboratory, Restaurant, Venue, Association,
  University, Supplier, Tour Operator, Néctar Nómada Partner). One table, typed, not
  one table per type — see `DATA_ARCHITECTURE.md` §3 for why (type-specific
  attributes go in a JSONB `attributes` column validated per type at the application
  layer, not in per-type tables, to avoid an explosion of near-identical tables for
  what is fundamentally the same entity shape).
- **Location** `[PARTIAL]` — hierarchical (`parent_location_id`, `location_type`:
  country/province/district/locality/site), carries lat/lng/altitude, timezone. An
  Organization has one or more Locations (a Roaster can have a farm-gate buying
  point and a separate roastery). The typed-JSONB `attributes` pattern described
  above under Organization was never actually added to `Location` itself, despite
  `DATA_ARCHITECTURE.md` §3 naming both in the same sentence (C1 audit finding).
- **Program / Project** `[BUILT]` — Program is optional parent grouping; Project is the unit
  Assignments and most module data attach to. `ProjectDomainTag` (many-to-many,
  Project ↔ domain tag like Coffee/Apiary/Tourism/Research) implements "a project
  belongs to multiple domains simultaneously" (CLAUDE.md §8) without a rigid
  taxonomy column.
- **Product / ProductVariant** `[PARTIAL]` — see Commerce module below; built,
  but SKU/inventory are direct `ProductVariant` columns, not the separate
  tables §4 originally sketched.
- **Experience** `[BUILT]` — see Experiences module below.
- **Event** `[DEFERRED]` — separate from Experience (CLAUDE.md §13): an Event is a scheduled
  happening with sessions/guests/sponsors, not a repeatable bookable offering.
  No `Event` model exists yet; Experience is the only scheduled-happening
  entity actually built.
- **Sample** `[BUILT]` — a physical or informational unit that can be traced (a green coffee
  sample, an environmental sample, a honey batch sample). Referenced by Research OS,
  Sensory, and Competitions rather than each defining its own sample concept.
  Extended in T5 with `sourceLotId`/`sourceTransformationId` — a deliberate
  denormalization beyond this doc's and `COMMERCE_OPERATIONS_TOOLS_
  ARCHITECTURE.md` §F's minimal design, logged in `DECISIONS.md`.
- **Asset (media)** `[BUILT]` — see `DATA_ARCHITECTURE.md` §5 for storage; this table is the
  metadata record (creator, capture date, project link, rights, status), never the
  binary. Also carries `derivativeOfAssetId`/`checksumSha256` (landed via
  T12.5, matching `MEDIA_INTELLIGENCE_PIPELINE.md` §2-3's proposal) — schema-
  complete but **not yet exercised by any code path**, the textbook
  `[PARTIAL]` case, worth flagging even though the base Asset entity itself
  is solidly `[BUILT]`.
- **Role / Permission / Assignment / Scope** `[BUILT]` — see `RBAC.md`.

## 4. Domain modules and their attachment points

Each module below lists its module-owned entities and which canonical entities they
reference. Module-owned tables are never joined directly by another module's
service layer except through the canonical entity or a documented internal API
(Section 5 of `PLATFORM_OVERVIEW.md`).

### Commerce
`Product → ProductVariant → SKU/Inventory/Price` `[PARTIAL — SKU/inventory are
ProductVariant.sku/inventoryCount columns, not separate tables]`,
`Cart → Order → OrderItem` `[BUILT]`,
`Payment` `[BUILT]`, `Fulfillment` `[DEFERRED]`, `Discount` `[DEFERRED]`.
`Product.project_id`, `Product.location_id`,
`Product.organization_id` (producer) are nullable FKs to canonical entities — a
product is not required to have all three, but when it does, the connection is a
foreign key, not a text field, per CLAUDE.md §11 ("do not duplicate project
information inside commerce"). `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`
§P/§G's further proposals (a unifying `Offering` entity, `ProductVariant.
sourceLotId` connecting Commerce to Traceability, `InventoryItem`/
`InventoryMovement`) are all `[SPECIFIED]` — none built.

### Experiences & Reservations
`Experience → ExperienceSession → Booking → Participant` `[BUILT]`. `Experience.location_id`,
`Experience.host_person_id` (via Person, not a free-text "host name"),
`Experience.related_project_id`, `Experience.related_product_id` (nullable).

### Research OS
`[SPECIFIED — entire module]`. `ResearchProgram → ResearchQuestion →
Hypothesis → Experiment → Protocol → ProtocolVersion`, `TreatmentBatch →
ProcessingStage`, `Equipment/Calibration`, `Evidence → EvidenceClaim`,
`Interpretation → Conclusion → Recommendation`, `AnalysisPlan → AnalysisRun →
AnalysisResult`, `Publication`, `Deviation → CorrectiveAction`, `Approval` —
none of these exist as models. Correctly deferred per `MVP_ROADMAP.md` §3.
**`Measurement` itself did get built** `[BUILT]`, but attached to
`Lot`/`Sample`/`FermentationRun`/`DryingRun`/`StorageAssignment` under
Agricultural Traceability (T3) instead of to `Experiment`/`ProtocolVersion`
as sketched here — a real attachment-point drift from this section's
original design, not a naming difference. Every fact-bearing table that
*did* get built (across Traceability/Apiary, not Research OS) carries the
provenance classification column from `PLATFORM_OVERVIEW.md` §3 — see
`DATA_ARCHITECTURE.md` §4 and the coverage caveat under Sensory Evaluation
below. **Naming collision to watch for**: this section's own `Recommendation`
(interpretation→conclusion→recommendation, unbuilt) and the AI Layer's real,
built `Recommendation` model (Slice 7, below) are different concepts sharing
a name — not a conflict today only because this module doesn't exist yet.

### Agricultural Traceability
`[BUILT, but generalized differently than sketched here — see below]`. This
section originally specified a linear per-domain chain: `Lot → HarvestEvent →
Selection → Processing → Fermentation → Drying → Storage → Transport →
GreenSample → RoastSession → Brewing → SensorySession`. What was actually
built (Phase 1, T1-T14) is a single graph-transformation model —
`Lot`/`LotTransformation` `[BUILT]`, generalizing `Selection`/`Processing`/
every stage change into one append-only transformation record per
`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F — reused identically for
Apiary/Honey below. **This is the code being correct and the doc being
superseded, not a gap**: one graph model handling split/merge/blend/stage-
change for every domain is exactly the kind of canonical-layer unification
§3 above argues for elsewhere. Per-entity status: `HarvestEvent`
`[BUILT]`, `FermentationRun`/`DryingRun`/`StorageAssignment` `[BUILT]`
(T6-T8), `Transport` `[DEFERRED]`, `GreenSample` `[PARTIAL — the generic
Sample entity is used, not a dedicated GreenSample table, which matches this
doc's own canonical-Sample intent even though the name here suggests
otherwise]`, `RoastSession`/`Brewing` `[DEFERRED]`, `SensorySession`
`[BUILT]` (reused from Sensory, not duplicated). **`Species`/`Cultivar`/
`LotCultivarComposition`** `[DEFERRED]` — CLAUDE.md §18 explicitly flags the
Species/Cultivar conflation this was meant to prevent, but none of these
three exist; `Lot` currently carries no cultivar or species data at all.

### Apiary / Honey
`[BUILT — A1-A8, A5.5]`. `Hive → Colony → Inspection` `[BUILT]`, `Queen`
`[DEFERRED — not a separate entity]`, `Feeding`/`Treatment`/
`HealthObservation` `[BUILT, folded into one type-discriminated ColonyEvent
table rather than three — a deliberate simplification, same reasoning as
FermentationIntervention/DryingTurnEvent elsewhere]`, `Bloom/Flora`
`[DEFERRED]`. `Harvest → HoneyBatch → Extraction → Storage`
`[BUILT, but HoneyBatch/Extraction are not separate entities — a honey batch
literally is a Lot, reusing Agricultural Traceability's Lot/LotTransformation
graph with zero new schema, per `22_APIARY_V1_SCOPING_REPORT.md` §2's own
central claim, verified live]`. `HoneyBatch` (i.e. the resulting `Lot`) links
to `Sensory` and `Competitions` the same way `Lot` does for
coffee — both ultimately produce a `Sample` that Sensory/Competitions consume, so
those two modules do not need per-domain special cases. Offline capture for
this module specifically (`clientDraftId` idempotent sync, service-worker
app-shell caching) is `[BUILT]` — see `MVP_ROADMAP.md` §3's corrected entry.

### Fermentation & Beverage
`[PARTIAL — coffee-only, no shared multi-beverage infrastructure yet]`.
`FermentationRun`/`FermentationIntervention` `[BUILT]`, but scoped to coffee
processing (T6) — `Vessel`, `Ingredient`, `Culture`, `Inoculation` as
separate entities `[DEFERRED]`, time-series `FermentationObservation`
`[DEFERRED — the generic Measurement entity is used instead, same pattern
as GreenSample above]`, domain-specific tables like beer `MashProfile` or
wine `MustComposition` `[DEFERRED]`. The broader "shared infrastructure
across beverage domains" vision CLAUDE.md §20 describes has not been built
past the coffee case.

### Sensory Evaluation
`SensoryProtocol → SensoryProtocolVersion` `[BUILT]` (configurable per domain: coffee, honey,
beer, wine/mead/spirits — never one universal form), `SensorySession → Flight →
BlindCode` `[BUILT]`, `Sample` (canonical) `[BUILT]`, `Evaluator` (a Person with sensory history, not a
separate identity) `[BUILT]`, `Assessment → AttributeResponse` `[BUILT]`.
**`Descriptor`/`Defect`** `[DEFERRED — collapsed into AttributeResponse's
generic numeric `value` + free-text `comment`; no descriptor vocabulary or
defect classification exists anywhere, including no `honey_descriptor`
taxonomy for the honey protocol specifically]`. **`Score`**
`[PARTIAL — a plain numeric field, not a modeled Score entity]`.
`PanelResult` `[BUILT]`. Assessments are immutable once submitted; corrections are new
versioned assessments, never in-place edits (CLAUDE.md §21) — audited as an
evidentiary write since `Assessment` doesn't carry the generic
`provenanceClass` column (C1 §3). **Not originally listed in this section,
added since it's real and substantial**: Reference Standards & Panel
Calibration (`ReferenceStandard`, `CalibrationSession`, `CalibrationResult`,
`EvaluatorSensitivityProfile`) `[BUILT]` — documented in
`BEVERAGE_SENSORY_PROTOCOLS.md` §7, not previously reflected back into this
canonical model doc. **Coverage gap**: zero automated tests exist for
Sensory, Calibration, or Competitions specifically, despite CLAUDE.md §57
making RBAC/permission tests mandatory — the generic `tests/rbac/
resolve.test.ts` suite covers the permission mechanics, not this module's
own write paths.

### Competitions
`[BUILT — core hierarchy]`. `Competition → CompetitionEdition →
CompetitionCategory` `[BUILT]` → `Division` `[DEFERRED — folded into
CompetitionCategory, not a separate entity]` → `Entry` `[BUILT]` →
`Competitor(Person/Organization)` `[DEFERRED — Entry references Person/
Organization directly, no separate Competitor entity]` → `Product/Sample →
BlindCode → Flight → Panel → JudgeAssignment` `[BUILT]` → `Evaluation`
(i.e. `Assessment`, reused) `[BUILT]` → `CompetitionResult`
`[PARTIAL — the row exists and is finalized, but its own `rank` field is
never computed by any code path]` → `Ranking` `[DEFERRED — no separate
entity; would derive from CompetitionResult.rank once that's computed]` →
`Award` `[BUILT]`. Reuses
`SensoryProtocol`/`Assessment` from the Sensory module for the actual judging
mechanics rather than duplicating a scoring engine — Competitions is a workflow and
chain-of-custody layer wrapped around Sensory, not a parallel evaluation system.
Also `[DEFERRED]`: intake/check-in workflow, pull sheets, judge sign-in
dashboards, Best of Show rounds, entry-fee payment, and any public-facing
competition page — all specified in `COMPETITIONS.md` but not built; only
admin/seed-created entries and internal judging exist today.

### Environmental Data
`[SPECIFIED — entire module]`. `EnvironmentalSource` (typed: weather API / station / IoT sensor / logger / manual /
imported dataset — never conflated), `Sensor → SensorDeployment(location_id,
person_installed_by)`, `EnvironmentalObservation` (time-series; see
`DATA_ARCHITECTURE.md` §6 for partitioning) — none of these exist as models.
Correctly absent per `DATA_ARCHITECTURE.md` §1's own note and
`MVP_ROADMAP.md` §3.

### Story & Knowledge Engine
`Story` `[BUILT — but as a single flat model, not the content-type family
below]`/`Article/Interview → Source/Quote/Transcript` `[DEFERRED]`,
`Topic/Tag` `[DEFERRED]`. `Story` has no type discriminator distinguishing
these — every content type this section originally specified separately is
one table today. References
Person, Organization, Location, Project by FK for "who/where/what this story is
about" rather than embedding names as text, so a location page can dynamically
pull its stories (CLAUDE.md §6).

### Partner Workspace
`[BUILT]`. Not a separate data model — it is a role-aware view over `Assignment` (scope =
Project), `Task`, `Asset` uploads, and module-specific submission forms (research
measurements, environmental manual observations, story field notes) filtered to
what that partner's Assignments grant.

### AI Layer
`Recommendation` (this section's original name, `AIRecommendation`, doesn't
match the actual model name — a naming drift worth noting alongside the
Research OS collision flagged above) `[BUILT, narrow scope]` — see
`AI_GOVERNANCE.md`. Not a domain module in the traceability
sense; it is a cross-cutting service that writes only to its own table,
structurally enforced (`ai_service` Postgres role, DB-verified). **Scope
caveat**: only one suggestion generator exists
(`generateDataCompletenessSuggestions`, a rule-based Project-description
checker) — the broader "search/summarize/compare/detect anomalies" surface
`AI_GOVERNANCE.md` §1 describes is unbuilt, and reads for generation are
platform-wide/unscoped rather than RBAC-filtered per requesting user
(`AI_GOVERNANCE.md` §5, corrected C1 §4).

## 5. Cross-cutting entities

- `Notification(id, user_account_id, type, related_entity_type/id, read_at,
  created_at)` `[DEFERRED]` — no model exists at all; CLAUDE.md §34 names
  several trigger conditions (task due, approval needed, booking confirmed,
  document awaiting review) that today produce no notification of any kind.
- `AuditEvent(id, actor_user_account_id, occurred_at, operation, entity_type,
  entity_id, before, after, reason(nullable), source_interface)` `[PARTIAL]`
  — schema matches this spec exactly, and 11 evidentiary write sites across
  Traceability/Apiary/Sensory were instrumented in C1 §3, but coverage is
  still incomplete against `SECURITY.md` §6's full list (protocol
  supersession, competition-result changes, refunds, and account-status
  changes are not audited yet — see that section for the current list), and
  append-only-ness is an application convention, not a database grant
  (corrected, C1 §4).

## 6. Non-developer collaborator roles (forward compatibility)

CLAUDE.md's team context asks that RBAC be "ready to add non-developer
collaborator roles (e.g. content/ops) later without rework." Because Role Profiles
and Permissions are data, not code (`RBAC.md` §2), adding a "Content Editor" or
"Operations Coordinator" role profile is a data insert, not a schema migration or
deploy. The domain model supports this today by construction — no deferred design
debt here.

## 7. What is deliberately not modeled yet

**This section itself went stale and is corrected here (C1 §7, 17_ audit)** —
it originally listed Research OS, Sensory, Competitions, Apiary, and
Fermentation together as all "not built until their vertical slice comes
up." Three of those five have since shipped: Sensory (Slice 6), Competitions,
and Apiary (A1-A8) are all `[BUILT]` per §4 above. What remains genuinely
unbuilt, per `MVP_ROADMAP.md` §3: **Research OS** (full stop — no entity in
that section exists), and **Fermentation & Beverage beyond the coffee-only
case** already built under Agricultural Traceability. Environmental Data and
the Story-content-type family (Article/Interview/etc.) are also unbuilt —
see their entries in §4 above for specifics. Specifying without immediately
implementing remains the right pattern for what's still ahead; the mistake
was letting this summary paragraph stop tracking which modules had crossed
over, the same failure mode `MVP_ROADMAP.md` §3 had (and was also just
corrected for).

## 8. Keeping this document current (added C1 §7, 17_ audit)

The 17_ audit found the same failure pattern twice in independent places:
`DATA_ARCHITECTURE.md` §1's schema list went stale, was corrected once, then
went stale again the exact same way when `traceability`/`apiary` shipped.
`GAP_ANALYSIS_2026-08-10.md` and `MVP_ROADMAP.md` §3 both called Apiary
"unbuilt" after A1-A8 had already shipped it. In every case, the document
that should have caught the drift — this one — had no structure that made
"specified vs. shipped" checkable at a glance; a reader (or a future
session) had to cross-reference `prisma/schema.prisma` by hand to find out.
The `[BUILT]`/`[PARTIAL]`/`[SPECIFIED]`/`[DEFERRED]` tags added throughout
§3-§5 above are the fix for that specific gap — this document is now the one
other docs should check themselves against, not the other way around.

**This only holds if the tags get updated when something ships.** The
discipline this needs, proposed here but **not implemented** (per this
ticket's own scope — a process change, not a code or schema change):

- Every ticket that adds, extends, or drifts an entity from what's written
  here should update that entity's tag and note as part of the same commit
  that ships the change — the same discipline already applied to
  `PHASE_1_TECHNICAL_EXECUTION_PLAN.md` §34's ticket table throughout this
  project, just extended to this document too.
- A full audit pass like 17_ shouldn't run on a calendar cadence or only
  when explicitly requested — by the time three days had passed between
  writing `GAP_ANALYSIS_2026-08-10.md` and this pass, roughly a dozen
  tickets' worth of drift had already accumulated. The better trigger is
  **"a ticket set completes"** — each numbered slice, each lettered ticket
  group (A1-A8, T1-T14) — tied to `PHASE_1_TECHNICAL_EXECUTION_PLAN.md` §36's
  existing Phase Gates mechanism, so a status check is a normal part of
  closing out a body of work rather than a separate, easily-postponed audit
  request.
