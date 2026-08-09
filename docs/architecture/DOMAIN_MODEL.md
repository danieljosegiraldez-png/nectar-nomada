# Domain Model — Néctar Nómada Digital Platform

Refines CLAUDE.md Section 52's entity list into a normalized model. This is the
conceptual model; `DATA_ARCHITECTURE.md` covers physical schema conventions
(column types, indexing, partitioning). Table/column names below are indicative,
not final DDL — migrations come after this doc is approved.

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

- **Person** — see §1.
- **UserAccount** — see §1.
- **Organization** — typed via `organization_type` (Farm, Estate, Producer, Roaster,
  Brewery, Winery, Distillery, Apiary, Laboratory, Restaurant, Venue, Association,
  University, Supplier, Tour Operator, Néctar Nómada Partner). One table, typed, not
  one table per type — see `DATA_ARCHITECTURE.md` §3 for why (type-specific
  attributes go in a JSONB `attributes` column validated per type at the application
  layer, not in per-type tables, to avoid an explosion of near-identical tables for
  what is fundamentally the same entity shape).
- **Location** — hierarchical (`parent_location_id`, `location_type`:
  country/province/district/locality/site), carries lat/lng/altitude, timezone. An
  Organization has one or more Locations (a Roaster can have a farm-gate buying
  point and a separate roastery).
- **Program / Project** — Program is optional parent grouping; Project is the unit
  Assignments and most module data attach to. `ProjectDomainTag` (many-to-many,
  Project ↔ domain tag like Coffee/Apiary/Tourism/Research) implements "a project
  belongs to multiple domains simultaneously" (CLAUDE.md §8) without a rigid
  taxonomy column.
- **Product / ProductVariant** — see Commerce module below.
- **Experience** — see Experiences module below.
- **Event** — separate from Experience (CLAUDE.md §13): an Event is a scheduled
  happening with sessions/guests/sponsors, not a repeatable bookable offering.
- **Sample** — a physical or informational unit that can be traced (a green coffee
  sample, an environmental sample, a honey batch sample). Referenced by Research OS,
  Sensory, and Competitions rather than each defining its own sample concept.
- **Asset (media)** — see `DATA_ARCHITECTURE.md` §5 for storage; this table is the
  metadata record (creator, capture date, project link, rights, status), never the
  binary.
- **Role / Permission / Assignment / Scope** — see `RBAC.md`.

## 4. Domain modules and their attachment points

Each module below lists its module-owned entities and which canonical entities they
reference. Module-owned tables are never joined directly by another module's
service layer except through the canonical entity or a documented internal API
(Section 5 of `PLATFORM_OVERVIEW.md`).

### Commerce
`Product → ProductVariant → SKU/Inventory/Price`, `Cart → Order → OrderItem`,
`Payment`, `Fulfillment`, `Discount`. `Product.project_id`, `Product.location_id`,
`Product.organization_id` (producer) are nullable FKs to canonical entities — a
product is not required to have all three, but when it does, the connection is a
foreign key, not a text field, per CLAUDE.md §11 ("do not duplicate project
information inside commerce").

### Experiences & Reservations
`Experience → ExperienceSession → Booking → Participant`. `Experience.location_id`,
`Experience.host_person_id` (via Person, not a free-text "host name"),
`Experience.related_project_id`, `Experience.related_product_id` (nullable).

### Research OS
`ResearchProgram → ResearchQuestion → Hypothesis → Experiment → Protocol →
ProtocolVersion`, `TreatmentBatch → ProcessingStage`, `Measurement`, `Sample`,
`Equipment/Calibration`, `Evidence → EvidenceClaim`, `Interpretation → Conclusion →
Recommendation`, `AnalysisPlan → AnalysisRun → AnalysisResult`, `Publication`,
`Deviation → CorrectiveAction`, `Approval`. Every fact-bearing table here carries the
provenance classification column from `PLATFORM_OVERVIEW.md` §3 — see
`DATA_ARCHITECTURE.md` §4.

### Agricultural Traceability
Coffee first: `Lot → HarvestEvent → Selection → Processing → Fermentation → Drying →
Storage → Transport → GreenSample → RoastSession → Brewing → SensorySession`. Species
and Cultivar are separate tables (`Species 1—N Cultivar`) — CLAUDE.md §18 explicitly
flags this as a common conflation to avoid. `Lot` supports mixed-cultivar
composition via a join table (`LotCultivarComposition`) rather than a single
cultivar FK, since mixed lots are normal, not exceptional.

### Apiary / Honey
`Apiary → Hive → Colony → Inspection`, `Queen`, `Feeding`, `Treatment`,
`HealthObservation`, `Bloom/Flora`, `Harvest → HoneyBatch → Extraction → Storage`.
`HoneyBatch` links to `Sensory` and `Competitions` the same way `Lot` does for
coffee — both ultimately produce a `Sample` that Sensory/Competitions consume, so
those two modules do not need per-domain special cases.

### Fermentation & Beverage
Shared infrastructure (`FermentationRun → Vessel, Ingredient, Culture,
Inoculation`, time-series `FermentationObservation` for temperature/gravity/
Brix/pH), with domain-specific tables only where semantics genuinely diverge
(e.g., beer `MashProfile` vs. wine `MustComposition`) rather than forcing every
beverage into one generic record, per CLAUDE.md §20.

### Sensory Evaluation
`SensoryProtocol → SensoryProtocolVersion` (configurable per domain: coffee, honey,
beer, wine/mead/spirits — never one universal form), `SensorySession → Flight →
BlindCode`, `Sample` (canonical), `Evaluator` (a Person with sensory history, not a
separate identity), `Assessment → AttributeResponse`, `Descriptor/Defect`, `Score`,
`PanelResult`. Assessments are immutable once submitted; corrections are new
versioned assessments, never in-place edits (CLAUDE.md §21).

### Competitions
`Competition → CompetitionEdition → CompetitionCategory → Division → Entry →
Competitor(Person/Organization) → Product/Sample → BlindCode → Flight → Panel →
JudgeAssignment → Evaluation → CompetitionResult → Ranking → Award`. Reuses
`SensoryProtocol`/`Assessment` from the Sensory module for the actual judging
mechanics rather than duplicating a scoring engine — Competitions is a workflow and
chain-of-custody layer wrapped around Sensory, not a parallel evaluation system.

### Environmental Data
`EnvironmentalSource` (typed: weather API / station / IoT sensor / logger / manual /
imported dataset — never conflated), `Sensor → SensorDeployment(location_id,
person_installed_by)`, `EnvironmentalObservation` (time-series; see
`DATA_ARCHITECTURE.md` §6 for partitioning). Every observation row carries
`source_id` so provenance is a join, not a guess.

### Story & Knowledge Engine
`Story/Article/Interview → Source/Quote/Transcript`, `Topic/Tag`. References
Person, Organization, Location, Project by FK for "who/where/what this story is
about" rather than embedding names as text, so a location page can dynamically
pull its stories (CLAUDE.md §6).

### Partner Workspace
Not a separate data model — it is a role-aware view over `Assignment` (scope =
Project), `Task`, `Asset` uploads, and module-specific submission forms (research
measurements, environmental manual observations, story field notes) filtered to
what that partner's Assignments grant.

### AI Layer
`AIRecommendation` — see `AI_GOVERNANCE.md`. Not a domain module in the traceability
sense; it is a cross-cutting service that reads (permission-filtered) and writes
only to its own table.

## 5. Cross-cutting entities

- `Notification(id, user_account_id, type, related_entity_type/id, read_at,
  created_at)`
- `AuditEvent(id, actor_user_account_id, occurred_at, operation, entity_type,
  entity_id, before, after, reason(nullable), source_interface)` — see
  `SECURITY.md` §6 for what triggers a mandatory audit row.

## 6. Non-developer collaborator roles (forward compatibility)

CLAUDE.md's team context asks that RBAC be "ready to add non-developer
collaborator roles (e.g. content/ops) later without rework." Because Role Profiles
and Permissions are data, not code (`RBAC.md` §2), adding a "Content Editor" or
"Operations Coordinator" role profile is a data insert, not a schema migration or
deploy. The domain model supports this today by construction — no deferred design
debt here.

## 7. What is deliberately not modeled yet

Per `MVP_ROADMAP.md`, v1 implements Identity, Public Discovery (read paths only),
Commerce, and Experiences. The entities above for Research OS, Sensory, Competitions,
Apiary, and Fermentation are specified now (so later modules attach cleanly) but not
built until their vertical slice comes up — specifying without implementing is the
point of doing this modeling pass up front.
