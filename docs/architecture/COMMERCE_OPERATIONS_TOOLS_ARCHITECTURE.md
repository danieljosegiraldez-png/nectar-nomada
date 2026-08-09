# Commerce, Operations & Professional Tools — Architecture Review

**Status: approved (see `DECISIONS.md` ADR-020).** Nothing is implemented,
no schema changed, no dependency installed, no checkout/payment/billing/
sensor code touched — approval covers architecture and sequencing;
Foundational-phase implementation begins when kicked off explicitly.

Input: `NÉCTAR NÓMADA — Commerce, Operations & Professional Tools
Architecture Input.md` (2,144 lines, referenced throughout as "the input
document"). Note: your instruction named it
`NECTAR_NOMADA_COMMERCE_OPERATIONS_PROFESSIONAL_TOOLS_INPUT.md`; no file with
that exact name exists — same naming-mismatch pattern as the two prior input
documents, and this is the file that matches your description.

Per the input document's own §43 and your instruction: this document does
not merge with, and stays compatible with, `EXTERNAL_DATA_ARCHITECTURE.md`
and `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md`. Overlaps are cross-
referenced, not duplicated.

---

## A. Executive Summary

The input document reads as large, but most of it is not new. `DOMAIN_MODEL.md`
already specifies, as approved design, the exact coffee traceability chain
this document elaborates (`Lot → HarvestEvent → Selection → Processing →
Fermentation → Drying → Storage → Transport → GreenSample → RoastSession →
Brewing → SensorySession`), the Research OS protocol/evidence model, the
Fermentation & Beverage shared infrastructure, the Sensory Evaluation module,
Competitions, and Partner Workspace as a role-aware view rather than a
separate system. Most of sections 7-25 of the input document (Coffee
Operations OS, Farm Management, Fermentation/Drying/Storage, Sensory OS,
Cupping, Blind Evaluation, Competition Mode) are detail arriving for a
module that was already named, not a new module to design from scratch.

Two things in the input document are genuinely new and load-bearing, and
this review spends its real design effort on them: **Lot Genealogy** (§F) —
the original `Lot` chain assumed linear, 1:1 progression and has no way to
represent a split, merge, or blend, which the input document correctly
identifies as a critical gap — and a thin **`Offering`** abstraction (§E, §P)
unifying Product/Experience/Service/Consulting under one catalog/discovery
layer without forcing genuinely different commercial workflows (SKU/Order vs.
Session/Booking vs. Inquiry/Proposal/Invoice) into one schema. Everything
else in this document — protocols, measurement architecture, reporting,
multi-organization access, the AI operator copilot — is a disciplined
extension of mechanisms already approved elsewhere (protocol versioning,
RBAC scope containment, the `ai.recommendation` suggestion loop, partitioned
time-series measurement, provenance columns), applied to a new domain rather
than reinvented for it.

As with the two prior reviews: almost none of this is buildable today.
Location, Organization, Project, and Sample don't exist in the database yet
(only Slice 1 Identity is implemented), and this document's scope sits
*behind* Commerce (`MVP_ROADMAP.md` Slice 3) and substantially behind
Research OS, which isn't sequenced in the roadmap's numbered slices at all.
The practical output of this review is a design that's ready and
cross-checked when that work starts, plus one clear recommendation for what
to build first once it does (§Y).

## B. Existing Repository State

**Implemented in the database today:** `Person`, `UserAccount`,
`RoleProfile`, `Permission`, `RoleProfilePermission`, `Scope`, `Assignment`,
`AuditEvent` — Slice 1 (Identity) only. No `Location`, `Organization`,
`Project`, `Sample`, `Product`, `Experience`, or any traceability/Research
OS/Sensory table exists as a live Prisma model.

**Already approved as design** (`DOMAIN_MODEL.md`, not yet code), directly
relevant here:

- **Agricultural Traceability**: the coffee chain named above, with `Species`
  and `Cultivar` deliberately kept separate, and `LotCultivarComposition` for
  mixed lots — but no explicit split/merge/blend model (the gap this review
  closes, §F).
- **Commerce**: `Product → ProductVariant → SKU/Inventory/Price`, `Cart →
  Order → OrderItem`, `Payment`, `Fulfillment`, `Discount`, with `Product`
  carrying nullable FKs to `Project`/`Location`/`Organization`.
- **Experiences & Reservations**: `Experience → ExperienceSession → Booking →
  Participant`, deliberately not a Commerce SKU (`DOMAIN_MODEL.md`, citing
  CLAUDE.md §12).
- **Research OS**: `ResearchProgram → ResearchQuestion → Hypothesis →
  Experiment → Protocol → ProtocolVersion`, `TreatmentBatch →
  ProcessingStage`, `Measurement`, `Sample`, `Equipment/Calibration`,
  `Evidence → EvidenceClaim`, `Interpretation → Conclusion →
  Recommendation`, `Deviation → CorrectiveAction`, `Approval` — protocol
  versioning and the deviation/correction pattern are already exactly what
  §J and §47 of the input document ask for.
- **Fermentation & Beverage**: shared `FermentationRun → Vessel, Ingredient,
  Culture, Inoculation`, with time-series `FermentationObservation` for
  temperature/gravity/Brix/pH — already the partitioned-table pattern
  `DATA_ARCHITECTURE.md` §6 established for environmental data, generalized.
- **Sensory Evaluation**: `SensoryProtocol → SensoryProtocolVersion`
  (explicitly "never one universal form" — already matches input §21's
  instruction not to hardcode one scoring standard), `SensorySession →
  Flight → BlindCode`, `Evaluator`, `Assessment → AttributeResponse`,
  immutable-once-submitted assessments.
- **Competitions**: reuses the Sensory module's `Assessment` engine rather
  than a parallel scoring system.
- **Partner Workspace**: explicitly "not a separate data model — a
  role-aware view over `Assignment` (scope = Project), `Task`, `Asset`
  uploads" — directly the pattern §Q below reuses for Client/Producer
  Portal.
- **Project System** (`DOMAIN_MODEL.md` §8, from CLAUDE.md §8): `Programs,
  Projects, Subprojects/Initiatives, Project Assignments, Collaborations,
  Milestones, Tasks, Assets, Reports, Events, Products, Experiences` — `Task`
  and even `Reports` are already named here, meaning §37 (Tasks) and part of
  §29 (Reporting) are not new concepts, only underspecified ones.
- **RBAC** (`RBAC.md`): `User → Assignment → Scope → Role Profile →
  Permission`, scope containment that only narrows (never broadens), and a
  seeded Role Profile list already including Research Lead/Contributor and
  Partner Field Collector — anticipating much of input §36's actor list.
  **Gap found**: `ScopeType` has no `organization` value (§S).
- **Governance already covering this domain's AI needs**: `AI_GOVERNANCE.md`'s
  suggestion/review/audit loop, `SECURITY.md` §2's "authorization is never
  UI-only" rule (directly answers input §23's blind-evaluation concern), and
  `DATA_ARCHITECTURE.md` §4's provenance columns.
- **Cross-document work already done this session**: `EXTERNAL_DATA_
  ARCHITECTURE.md` already designs manual/automated measurement coexistence
  (the same shape as input §15); `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md`
  already designs `StoryBlock` and the `Report`-shaped versioning pattern
  this document reuses for §N.

**Conclusion:** as with the prior two reviews, this document is not filling
a blank slate — it's designing the two genuinely new pieces (Lot Genealogy,
`Offering`) and showing, section by section, that the rest extends existing
architecture without duplicating it.

## C. Capability Matrix

| Capability | Status |
|---|---|
| `Offering` abstraction (Product/Experience/Service/Consulting under one catalog layer) | MISSING, genuinely new — recommended thin (§E, §P) |
| Commerce → Operations linkage | MISSING but simple — one FK, not a new subsystem (§P) |
| Client/CRM relationships | PARTIAL — Person/Organization EXIST; "client" role is a Project FK, not a new entity (§O) |
| Consulting workflow (lead→proposal→project→report) | MISSING for pre-project stages; Project itself EXISTS for the engagement (§O) |
| Coffee Operations OS (harvest→...→cupping chain) | EXISTS as design (`DOMAIN_MODEL.md`), MISSING as code |
| Farm Management | PARTIAL — Location/Organization patterns EXIST; farm-specific fields (plots/blocks, infrastructure, equipment) MISSING |
| Harvest & Receiving | PARTIAL — fits into the existing chain; explicit `HarvestEvent`/`ReceivingEvent` fields MISSING |
| **Lot Genealogy** (split/merge/blend/sample lineage) | MISSING, genuinely new, highest-priority gap (§F) |
| Mass/Quantity Balance | MISSING, genuinely new — event-based ledger design (§G) |
| Processing/Fermentation Workbench | OVERLAPS EXISTING SYSTEM — a UI over already-designed Fermentation/Processing tables, not new schema |
| Protocols (versioned, execution, deviation) | EXISTS as design (Research OS) — reused directly, not duplicated (§J) |
| Sensor/data logger integration | OVERLAPS EXISTING SYSTEM — same manual/automated coexistence pattern as `EXTERNAL_DATA_ARCHITECTURE.md` |
| Drying Management | PARTIAL — named as a chain stage; timeline/measurement detail MISSING |
| Storage Management | PARTIAL — same as Drying |
| Inventory (operational) | MISSING, genuinely new, structurally separate from Commerce SKU inventory (§G, §51) |
| Sample Management | PARTIAL — canonical `Sample` EXISTS; blind-code/transfer/depletion detail MISSING |
| Sensory OS (cross-domain) | EXISTS as design — largely covered already |
| Coffee Cupping | EXISTS as design — one configured `SensoryProtocol` domain |
| Sensory Descriptors (hierarchical vocabulary) | MISSING, genuinely new (§K) |
| Blind Evaluation security | EXISTS (`RBAC.md` §7) — extend to AI tool access explicitly (§L) |
| Competition Mode | EXISTS as design — reuses Sensory `Assessment` |
| Panel Analytics | FUTURE/OPTIONAL — depends on real sensory-session volume |
| Process → Sensory connection (exploratory questions) | FUTURE — depends on Research OS + Sensory both existing |
| Data Analysis Workbench | FUTURE — depends on substantial operational data existing |
| Visualization components | FUTURE/OPTIONAL — implementation detail once data exists, not an architecture gap |
| Reporting Engine | MISSING, genuinely new, but reuses `StoryBlock`/versioning patterns (§N) |
| Report Versioning | MISSING — same versioning rule already applied to Protocol/Story, applied a third time |
| Recommendations (consulting) | MISSING, genuinely new but thin — reuses `Task` for follow-through (§O) |
| Client Portal | MISSING — OVERLAPS EXISTING SYSTEM (Partner Workspace's "role-aware view" pattern) |
| Producer/Partner Portal | EXISTS as design (Partner Workspace) — extending its permission set, not a new system |
| Professional SaaS readiness | FUTURE/OPTIONAL — design-now, build-later (§R) |
| Multi-Organization / multi-tenancy | PARTIAL — RBAC's Assignment/Scope model is inherently multi-subject; `organization` `ScopeType` is MISSING (§S) |
| Contextual Role/Permission model | EXISTS (`RBAC.md`) — already exactly `User → Assignment → Scope → Role Profile → Permission` |
| Tasks | EXISTS as design (`DOMAIN_MODEL.md` §8) — not new |
| Alerts | MISSING, genuinely new but thin (rule-based, §T) |
| Operator Dashboard | OVERLAPS EXISTING SYSTEM — same mechanism as Adaptive Intelligence review's Operator Intelligence (§T) |
| AI Operator Copilot | OVERLAPS EXISTING SYSTEM — same `AIProvider`/`ai.recommendation` mechanism (§U) |
| AI Analysis (completeness, anomaly, pattern) | OVERLAPS EXISTING SYSTEM — same suggestion loop |
| Forecasting/Prediction | NOT RECOMMENDED YET — explicitly experimental per input §42, agreed |
| API/Integration architecture (payments, accounting, shipping, calendar) | PARTIAL — `INTEGRATIONS.md` pattern EXISTS; specific new adapters MISSING (§W) |
| Mobile/Field UX | FUTURE — depends on Partner Workspace + offline/PWA (`MVP_ROADMAP.md` Slice 5, `CLAUDE.md` §40) |
| QR Identification | FUTURE/OPTIONAL — thin, low-complexity when actually needed |
| Audit Trail | EXISTS (`SECURITY.md` §6, `AuditEvent`) — extend coverage list to new tables, not a new mechanism |
| Data Corrections | OVERLAPS EXISTING SYSTEM — same original-entry/correction/reason pattern as any versioned record |
| Import/Export (CSV/XLSX) | MISSING, straightforward, not architecturally novel |
| Data Ownership (NN-owned vs. client-owned vs. public) | PARTIAL — `RBAC.md`'s classification axis EXISTS; needs explicit values/policy for consulting data (§Q) |
| Commerce + Traceability (product → source lot) | MISSING, depends on Lot Genealogy (§F) and Commerce both existing |
| Commerce + Inventory (operational vs. retail) | MISSING, genuinely new distinction (§G) |
| Experience Commerce | EXISTS as design — already correctly separated from Product |
| Service Commerce | MISSING, genuinely new (§P, §53) |
| Business/Operational/Research/Sensory/Content Analytics | FUTURE — five separate read-models sharing only a visualization layer, not one analytics system (§M) |

## D. Domain Boundaries

| Domain | Owning module (existing or recommended) |
|---|---|
| Commerce | `DOMAIN_MODEL.md` Commerce module, extended with `Offering` (§P) |
| CRM | Not a separate module — a thin relationship (Project.client_organization_id / client_person_id) on top of Person/Organization/Project (§O) |
| Consulting | Project System, with a `domain_tag` + a new pre-Project `Service`/`Proposal` pipeline (§O) |
| Farm Operations | Agricultural Traceability module, extended with Farm/Plot/Infrastructure entities (§H) |
| Coffee Operations | Agricultural Traceability module (already the primary owner) |
| Lot Genealogy | New sub-module within Agricultural Traceability — `traceability.lot_transformation` (§F) |
| Fermentation | Fermentation & Beverage module (already owns this) |
| Drying | Agricultural Traceability module, extended (§H) |
| Storage | Agricultural Traceability module, extended (§H) |
| Inventory | New: operational inventory in Agricultural Traceability/Commerce boundary, kept structurally distinct from Commerce SKU inventory (§G) |
| Samples | Canonical `Sample` (core layer), referenced by Research OS/Sensory/Competitions/Traceability — unchanged ownership, richer fields |
| Sensory | Sensory Evaluation module (already owns this), extended with Descriptor vocabulary (§K) |
| Research | Research OS module (already owns this) — Protocol/ProtocolVersion reused across module boundaries (§J) |
| Analytics | Not a module — five domain-scoped read-models (§M) |
| Reporting | New: a `reporting` schema reusable across every module that needs a versioned document output (§N) |

## E. Canonical Data Model Impact

**Reuse directly, no duplication:**

- `Person`, `Organization`, `Location`, `Project`, `Sample` — as always.
- `Task` (`DOMAIN_MODEL.md` §8) for consulting follow-through (§O) and
  operational to-dos (§37) — one entity, not two task systems.
- `Protocol`/`ProtocolVersion` (Research OS) for **both** experimental and
  operational processing protocols (§J) — one versioning mechanism.
- `Assignment`/`Scope`/`RoleProfile`/`Permission` (RBAC.md) for Client Portal
  and Producer/Partner Portal access — no new permission model.
- `ai.recommendation` (`AI_GOVERNANCE.md`) for AI Operator Copilot, AI
  Analysis, and Alerts' AI-suggested layer (§T, §U) — no parallel AI
  suggestion table, same conclusion as the Adaptive Intelligence review.
- `AuditEvent` for measurement/lot-genealogy/sensory-score/report change
  history — extend its coverage list (`SECURITY.md` §6), don't build a
  second audit mechanism.
- `EvidenceClaim` for any process↔sensory correlation a human promotes to
  research evidence (§26) — same human-mediated-connection rule as the
  other two reviews.
- `StoryBlock` (Adaptive Intelligence review) as the content-section
  mechanism for `Report` (§N) — reuse the rendering primitive, not a second
  templating system.

**Genuinely requires new entities:**

```
Offering                                                              (§E, §P — thin)
Lot   LotTransformation   LotTransformationInput   LotTransformationOutput  (§F)
QuantityEvent                                                          (§G)
HarvestEvent   ReceivingEvent                                          (§H)
Measurement (generalized, partitioned — extends the environmental.observation pattern) (§I)
ProtocolExecution   Deviation (reused Research OS shape, applied operationally) (§J)
Descriptor   DescriptorCategory                                        (§K)
StorageLot   StorageLocation   StorageEvent   StorageMeasurement       (input §17)
InventoryItem   InventoryMovement            (operational — distinct from Commerce SKU) (§G)
Report   ReportVersion   ReportPublication                             (§N)
Recommendation (consulting)                                            (§O)
ServiceInquiry   ServiceScope   Proposal                                (§O, §53 — pre-Project pipeline)
Alert                                                                   (§T — thin, rule-based)
```

**Deliberately not recommended as new entities:** a separate "ClientProfile"
(Organization/Person + a Project FK is sufficient, §O), a separate
operational "TaskManager" (reuse `Task`), a separate "OperationalProtocol"
(reuse `Protocol`/`ProtocolVersion`), a generic cross-domain "Analytics"
table (§M explicitly recommends against this).

## F. Lot Genealogy Architecture

This is the input document's most important correct observation: a `lotId`
field attached to records assumes lots move through stages 1:1, and coffee
doesn't — it splits, merges, and blends. Recommended model, in a new
`traceability` schema:

```
traceability.lot (
  id, lot_code, lot_type[cherry|processing|drying|green|roast|sample|other],
  origin_harvest_event_id (nullable), status, created_at, created_by
)

traceability.lot_transformation (
  id, transformation_type[split|merge|blend|stage_change|sample_extraction|
                          loss|disposal|sale],
  occurred_at, protocol_version_id (nullable — links to §J), operator_id,
  notes, created_at
)

traceability.lot_transformation_input  (transformation_id, lot_id, quantity, unit)
traceability.lot_transformation_output (transformation_id, lot_id, quantity, unit)
```

- **Split**: one input row, N output rows (N new `Lot` records), one
  `lot_transformation` row.
- **Merge/blend**: N input rows, one output row.
- **Stage change** (e.g. processing lot → drying lot, no physical split):
  one input, one output — still an explicit transformation row, not a
  mutated `lot_type` field, so the history is queryable the same way as any
  other transformation.
- **Sample extraction**: one input `Lot` row, output is a canonical
  `core.sample` row (not a `Lot`) — the transformation record is what links
  a `Sample` back to its source lot, satisfying "where did this sample come
  from" without `Sample` needing its own genealogy fields.
- **Loss/disposal/sale**: one input, zero or one output (a `sale` may output
  a reference to a `commerce.order_item`, connecting Lot Genealogy to
  Commerce per §P without merging the schemas).

This is a directed acyclic graph, not a tree — a blend genuinely has
multiple parents. Both traversal directions are ordinary recursive CTEs over
`lot_transformation_input`/`output`, so no graph database or new
infrastructure is justified (consistent with this project's general bias,
`DECISIONS.md` ADR-002/ADR-010, toward extending Postgres before adding a
new system). "Where did this sample come from" walks `output → input`
backward from the `Sample`'s originating transformation; "what did this
cherry lot become" walks `input → output` forward, following every
transformation the lot ever appeared as an input to.

**The one correctness rule that matters more than any specific column
choice:** `Lot` rows and `lot_transformation` rows are **append-only**. A
lot's current state is never edited in place — a stage change, a
measurement update, a correction is always a new transformation or a new
`quantity_event` (§G) referencing the existing lot, never an `UPDATE` to a
historical row. This is the same principle already governing
`AuditEvent`/`ai.recommendation`/Protocol versioning elsewhere in this
architecture, applied to the one place where getting it wrong would
silently corrupt traceability data no one would notice until a report
turned out to be wrong.

## G. Quantity / Inventory Architecture

**Event-based ledger, not a mutable weight field:**

```
traceability.quantity_event (
  id, lot_id, event_type[received|process_output|loss|sample_removed|
                          adjustment|transfer_in|transfer_out],
  quantity, unit, occurred_at, transformation_id (nullable, links to §F),
  recorded_by, data_quality[verified|provisional|unconfirmed], notes
)
```

A lot's current quantity is **computed** (sum of ledger entries), never
stored as an overwritable column — the same append-only principle as §F.
`data_quality` (reusing `DATA_ARCHITECTURE.md` §7's status vocabulary)
lets an estimated or incomplete figure be recorded honestly rather than
implying a precision the measurement doesn't have, directly satisfying the
input document's "do not imply scientifically exact mass balance where
measurements are incomplete."

**Operational inventory vs. Commerce inventory — kept structurally
separate, connected by lineage only**, per the input document's own §51
instruction:

- `traceability.inventory_item` / `inventory_movement` track physical
  operational stock (500 kg green coffee in a warehouse) tied to `Lot`.
- `commerce.product_variant`'s existing `SKU/Inventory` (`DOMAIN_MODEL.md`
  Commerce module) tracks sellable retail units (24 bags).
- The connection is a FK chain, not a shared table: a `ProductVariant`
  carries a nullable `source_lot_id`, so a bag's traceability walks
  `ProductVariant → Lot → LotTransformation (backward) → ... → Farm`
  (§P, §50) without operational and retail inventory ever being the same
  row with two different meanings.

## H. Coffee Processing Architecture

`DOMAIN_MODEL.md`'s existing chain (`Lot → HarvestEvent → Selection →
Processing → Fermentation → Drying → Storage → Transport → GreenSample →
RoastSession → Brewing → SensorySession`) already structurally covers
Harvest → Receiving → Processing → Fermentation → Drying → Storage. This
section's job is narrow: specify what §F/§G change about it.

- Every stage transition (Processing → Fermentation, Fermentation → Drying,
  etc.) is a `lot_transformation` row (§F), not a status field on `Lot` —
  this is the concrete mechanism, not a new stage list.
- `HarvestEvent`/`ReceivingEvent` get the explicit fields the input document
  lists in its §9 (date/time, farm, plot/block, cultivar, producer, method,
  cherry weight, Brix, temperature, condition, defects, photos, operator,
  notes) — `photos` is a `ContentEntityLink` to `MediaAsset` (Adaptive
  Intelligence review §D), not a new media mechanism.
- Farm/Plot/Block (§8) extend `Location`'s hierarchy (`DOMAIN_MODEL.md` §6's
  location hierarchy already supports arbitrary depth: country → province →
  district → locality → site) — a Plot is a `Location` with
  `location_type = 'plot'` and `parent_location_id` pointing to the Farm's
  `Location` row, not a new entity family.
- Not every farm uses every stage (input document's explicit caution) —
  satisfied structurally, since `lot_transformation` rows only exist for
  transitions that actually occurred; a farm that skips a formal drying
  stage simply has no `lot_transformation` of that type, no schema branch
  needed.

## I. Measurement Architecture

Generalizes the pattern `DATA_ARCHITECTURE.md` §6 already established for
`environmental.observation` (partitioned, provenance-columned) to a new
`traceability.measurement` table covering fermentation/drying/storage
readings:

```
traceability.measurement (
  id, variable, value, unit, occurred_at,
  source[manual|sensor], device_id (nullable), operator_id (nullable),
  fermentation_run_id (nullable), drying_lot_id (nullable),
  storage_lot_id (nullable), quality_context, created_at
) partition by range (occurred_at)
```

**Decision (flagged for §AA):** specific nullable FKs per possible parent
(fermentation/drying/storage), not a polymorphic `parent_type`/`parent_id`
pair — trades a slightly wider table for real foreign-key referential
integrity and simpler queries, consistent with this project's general
preference for explicit relational structure over loosely-typed polymorphic
associations. Manual and automated measurements coexist in the same table
by design (`source` column) — exactly the input document's §15 instruction,
and the identical shape `EXTERNAL_DATA_ARCHITECTURE.md` already uses for
external vs. own observations. No IoT integration is required to use this
table — a manual measurement with `source = 'manual'` and `device_id = null`
works from day one.

## J. Protocol Architecture

**Decision:** reuse Research OS's `Protocol → ProtocolVersion` for both
experimental *and* operational (processing) protocols — one entity, not two.
The versioning/immutability requirement is identical ("a processing protocol
should not be silently modified after experiments have used it," input §14
— word for word the same rule already governing Research OS protocols).

```
traceability.protocol_execution (
  id, protocol_version_id, executed_against_type[fermentation_run|
    drying_lot|lot_transformation], executed_against_id, started_at,
  ended_at, operator_id
)
traceability.deviation (
  id, protocol_execution_id, expected, actual, reason, recorded_by, recorded_at
)
```

The input document's worked example ("Expected: Ferment 48h. Actual: Stopped
at 42h. Reason: pH threshold / operator decision") is exactly a `Deviation`
row against a `ProtocolExecution`. AI cannot rewrite historical protocol
execution — already covered by `AI_GOVERNANCE.md` §2's blanket prohibition
on AI altering authoritative records; no new rule needed, just confirming
this table falls under it.

## K. Sensory OS Architecture

Cross-domain architecture (`SensoryProtocol`/`SensoryProtocolVersion` per
domain, `Assessment`/`AttributeResponse`, immutable submissions) already
exists as design and needs no revision here. **Genuinely new**: a structured
`Descriptor` vocabulary — previously "Descriptor/Defect" were flat concepts
in `DOMAIN_MODEL.md`.

```
sensory.descriptor (
  id, name, parent_descriptor_id (nullable, self-referencing hierarchy),
  category, domain, language, synonym_of (nullable), reference_note
)
```

Controlled vocabulary plus free-text observation coexist (input §22's
instruction) — `AttributeResponse` (already in `DOMAIN_MODEL.md`) keeps
both a `descriptor_id` (nullable, when the assessor picked from the
controlled list) and a `free_text` field (what the assessor actually typed),
never forcing a match that wasn't made. Coffee Cupping is one configured
`SensoryProtocolVersion` for the coffee domain — no separate cupping-specific
schema, matching `DOMAIN_MODEL.md`'s existing "never one universal form"
design intent applied to cupping specifically.

## L. Blind / Competition Security

No new mechanism — this section confirms coverage, per the same pattern as
the Adaptive Intelligence review's §L. `RBAC.md` §7's blind-code-mapping
restrictive permission (only Head Judge/Admin Role Profiles carry
`blind_mapping:view`) already means a Judge's resolved permission set cannot
reach sample identity, structurally, not just in the UI. The one thing worth
stating explicitly here, since the input document raises it directly (its
§23: "not through another API endpoint, UI component, or AI assistant"): an
AI Operator Copilot's grounded retrieval (§U, `AI_GOVERNANCE.md` §5) is
RBAC-scoped exactly like any other query — a Judge's AI assistant session
inherits the Judge's own resolved permissions, so it is structurally
incapable of answering "what's sample B's real identity" during blind
evaluation, the same way the Judge's own screen is. This isn't a new
control; it's confirmation that the existing control already covers the
AI-assistant attack surface the input document is right to worry about.

## M. Analytics Architecture

Five domains — Business, Operational, Research, Sensory, Content/Experience
— are **not** unified into one analytics table or service, per the input
document's own "may share infrastructure but should not be conceptually
mixed" instruction. Each domain queries its own module's tables through a
dedicated read-model/view; the only shared infrastructure is the
visualization component library (§28) and the provenance-preserving chart
convention already established (`ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md`
§24's "every chart carries units/source/sample identity/date/provenance"
applies here unchanged). This project has a `dataviz` skill/convention
available for implementation-time chart-styling consistency — worth noting
for whoever builds the actual charts, not an architecture decision.

## N. Reporting Architecture

Reuses the exact versioning discipline already established twice elsewhere
(Protocol versioning here at §J, Story versioning in the Adaptive
Intelligence review) — "a historical client report should not change
because underlying data was later corrected" is the same rule as "approved
protocols are versioned, not overwritten" (`CLAUDE.md` §3), applied a third
time to a third kind of record.

```
reporting.report          (id, report_type[lot|experiment|farm|consulting|
                            sensory], subject_entity_type, subject_entity_id,
                            status, created_by)
reporting.report_version   (id, report_id, version, generated_at,
                            generation_query jsonb, rendered_snapshot jsonb,
                            generated_by)
reporting.report_publication (id, report_version_id, surface[web|pdf|
                            client_portal|download], published_at)
```

Two things make this reproducible rather than a disconnected document: (1)
`generation_query` records what parameters/query produced the version, so a
report can be honestly regenerated and compared, not just re-typed; (2) each
`ReportVersion`'s content sections reuse `StoryBlock` types from the
Adaptive Intelligence review — `DATA_CHART`, `PROCESS_TRACE`,
`SENSORY_PROFILE`, `TIMELINE` are already specified there and map directly
onto Lot Report / Experiment Report / Farm Report / Consulting Report /
Sensory Report content (input §29's five report types) without a second
templating system.

## O. Consulting Architecture

**Decision:** Consulting is a `Project` (with a `domain_tag = 'consulting'`,
reusing `ProjectDomainTag` — the same multi-domain-tagging mechanism
already designed for "Las Nubes belongs to Coffee + Agriculture + Apiary +
..."), not a separate consulting-project system, directly answering the
input document's own §6 question. The engagement's *pre-Project* lifecycle
(Lead/Discovery/Scope/Proposal/Acceptance) genuinely has no home yet, since
a lead isn't a Project until accepted:

```
consulting.service_inquiry  (id, requester_person_id, requester_org_id,
                              description, status[lead|discovery|scoped|
                              proposed|accepted|declined], created_at)
consulting.proposal          (id, service_inquiry_id, scope_summary, price,
                              status, sent_at, decided_at)
```

On acceptance, `service_inquiry` resolves to a real `Project`
(`service_inquiry.resulting_project_id`) — everything downstream (field
work, data collection, analysis, report, recommendations, follow-up) is
ordinary Project/Research-OS/Reporting activity, not a separate consulting
data model. `Recommendation` (input §31) is a thin entity attached to a
Project, citing `EvidenceClaim`(s), with its own status/owner/due-date
lifecycle; "client accepts → Task → implementation → follow-up" (§31's
worked example) reuses the existing `Task` entity for the implementation
step rather than inventing a second one.

**Client/CRM** (input §5): "client" is not a new identity — it's a role
`Organization`/`Person` play with respect to a specific `Project`
(`Project.client_organization_id` / `client_person_id`, both nullable FKs).
This directly satisfies "avoid accidentally building a generic enterprise
CRM": there is no `ClientRelationship` entity accumulating arbitrary CRM
fields (communications, invoices as first-class generic objects) — only the
specific relationships Néctar Nómada's workflows actually need (purchases →
Commerce/Order, consulting → Project, samples/lots → Traceability, reports →
Reporting), each already owned by its proper module.

## P. Commerce Architecture

`Offering` (thin, new) is the shared catalog/discovery layer:

```
commerce.offering (
  id, offering_type[product|experience|service|consulting_engagement|
                    event|digital_deliverable|subscription],
  title, summary, status, price_summary, detail_entity_type, detail_entity_id
)
```

`Offering` exists so Discover/search/pricing-summary surfaces can list
everything commercially available in one query — it is deliberately **not**
a deep base class every commercial workflow inherits from. Each
`offering_type` keeps its own real workflow, exactly because the input
document's own §52/§53 correctly observe they're not interchangeable:

- `product` → existing `Product/ProductVariant → Cart → Order → OrderItem`.
- `experience` → existing `Experience → ExperienceSession → Booking →
  Participant`.
- `service`/`consulting_engagement` → §O's `ServiceInquiry → Proposal →
  Project` chain, ending in an invoice, not a checkout cart.
- `event` → existing `Event` module.
- `digital_deliverable`/`subscription` → not designed further here; no
  current use case (matches this review's general bias against speculative
  entity design, e.g. `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md`'s same
  restraint).

**Commerce → Operations** (input §4): a purchased `service`/
`consulting_engagement` Offering creates a `Project` via the §O acceptance
flow — one FK, not a parallel operational model, directly satisfying "do not
design Orders as an isolated e-commerce silo."

**Commerce + Traceability** (input §50): `ProductVariant.source_lot_id`
(§G) lets a customer-facing QR/traceability experience walk
`Product → RoastBatch(Lot) → GreenLot → ProcessingLot → HarvestEvent → Farm`
via the Lot Genealogy graph (§F) — but only the fields explicitly approved
for public disclosure (classification axis, `RBAC.md` §6) are shown; internal
notes, exact GPS, or unreviewed measurements are filtered the same way any
other classified record is, not a bespoke "public traceability" filter.

## Q. Client / Producer Portal

Both reuse the pattern `DOMAIN_MODEL.md` already established for Partner
Workspace: **not a separate data model — a role-aware view** over
`Assignment`-scoped data.

- **Producer/Partner Portal** = Partner Workspace, already designed, with
  permissions from input §33 (create field records, update lot data, record
  fermentation/drying, upload media, submit sensory data) expressed as
  `RoleProfile` permissions at `project` scope (`RBAC.md` §5's "Partner
  Field Collector" profile already anticipates this list closely) — no new
  mechanism, possibly an expanded permission set on an existing profile.
- **Client Portal** = a new customer-facing surface filtered to Projects
  where the viewer is the client (§O), showing status/farms/lots/recent
  data/sensory/reports/recommendations/tasks/visits/documents (input §32) —
  each of those is a query into an already-owned module (Traceability,
  Sensory, Reporting, Tasks), scoped by the same RBAC chain, not a new
  content aggregation system.
- **Data ownership** (input §49): the classification axis (`RBAC.md` §6)
  already distinguishes visibility levels; this document adds the policy
  layer on top — consulting/client-generated data defaults to
  `classification = 'partner'` or `'confidential'`, never automatically
  eligible for public storytelling (Adaptive Intelligence review's
  publish-gate pattern, §M there) without an explicit publication decision
  separate from the operational access grant.

Genuinely new requirement this section surfaces: a client with *multiple*
Projects needs either N project-scoped Assignments or one broader scope —
this is exactly the `organization` `ScopeType` gap in §S.

## R. Professional SaaS Readiness

**Design now** (already true, or cheap to keep true, without committing to
SaaS): Organization-scoped data ownership via existing FKs (Farm →
Organization, Project → client Organization); RBAC that never assumes a
single implicit "Néctar Nómada is the only tenant" — already the case,
since only `Platform Admin` has unbounded scope and every other Role
Profile is Assignment-scoped by construction (`RBAC.md` §3's containment
rule doesn't special-case "internal" vs. "external" users at all — a
producer's Partner Field Collector Assignment and a hypothetical future
client organization's staff Assignment are the same mechanism).

**Defer** (per input §34's own instruction, and this project's general
bias against unbuilt infrastructure): billing/subscription complexity,
per-organization white-labeling, self-service organization signup. None of
these are blocked by anything decided today — they're additive.

**Finding worth reporting plainly:** nothing in the current architecture
makes future multi-organization professional access architecturally
harder later. RBAC was never built around a single-tenant assumption in the
first place, because CLAUDE.md §10's Assignment/Scope model was already
designed for "contextual, narrowing grants" rather than "the app has one
owner and everyone else is a lesser role."

## S. Multi-Organization Architecture

**The concrete gap:** `RBAC.md` §2's `ScopeType` enum
(`platform | program | project | location | competition | session |
experience`) has no `organization` value. Today, a client or producer with
work spanning multiple Projects needs one Assignment per Project — workable
at small scale (a handful of Projects per Organization), but not what should
be built once a client organization or professional-tools tenant has many.

**Recommendation:** add `organization` as a `ScopeType`, with the same
containment rule already used for `program → project` (`RBAC.md` §3): an
`organization`-scoped Assignment covers every Project whose
`client_organization_id` (or owning `organization_id`, for a producer's own
farm-Projects) equals the scoped Organization — and, per the existing
narrowing rule, still does **not** reach Platform scope or unrelated
Organizations. This is a `RBAC.md` amendment to schedule alongside whichever
slice first needs multi-project client/producer access (likely once Client
Portal, §Q, is actually built) — not implemented now, per this phase's
constraint.

## T. Operator Experience

Directly extends the Adaptive Intelligence review's §G (Operator
Intelligence): the "ACTIVE FERMENTATIONS: 5 / DRYING LOTS: 7 / LOTS
REQUIRING MEASUREMENT: 2 / ..." dashboard (input §39) is a handful of
`COUNT`/filter queries over the tables designed in §F-K, not a new
subsystem. `Alert` (thin, new) is the deterministic half of this — a
rule-based row (`missing measurement`, `fermentation checkpoint`, `drying
measurement due`, etc., input §38) generated by a scheduled check, delivered
via the existing `Notification` entity. AI-contextualized suggestions layer
on top via `ai.recommendation`, and per the input document's own explicit
instruction, **AI suggestions must be visually/structurally distinguishable
from rule-based Alerts** — a `source` discriminator (`rule` vs. `ai`) on
whatever unifies them in the UI, not two indistinguishable notification
streams.

## U. AI Operator Copilot

Same architecture as the Adaptive Intelligence review's §H, applied to this
domain's data: RBAC-scoped grounded retrieval, the existing `AIProvider`
adapter, read-only tool execution (any write-shaped action — e.g. "generate
a draft client report" — produces an `ai.recommendation` a human approves,
never a direct write). The input document's own example queries map
directly onto this: "Which lots need attention today?" is a grounded query
over `Lot`/`Alert`; "Compare this fermentation with previous Geisha lots" is
a grounded retrieval + comparison, explicitly not a causal claim (§26's own
caution, matching the Research Intelligence safeguard already established in
the Adaptive Intelligence review — AI may identify patterns, must not imply
causality without evidence); "Generate a draft client report from approved
records" produces a `ReportVersion` in `draft` status via `ai.recommendation`,
never a `published` one.

## V. Mobile / Offline Field Architecture

Explicitly deferred, consistent with both prior reviews and `CLAUDE.md` §40
— this section exists to confirm that consistency, not to re-open it. The
"scan lot QR → lot opens → current stage recognized → likely next actions
shown → measurement recorded" flow (input §44) is a real, good UX pattern
once Partner Workspace + offline/PWA sync (`MVP_ROADMAP.md` Slice 5) exist —
not designed further here. **QR identification** (input §45) is
low-complexity whenever it's needed: a QR payload encodes a canonical
`Lot`/`Sample`/`Asset` ID (a UUID or short resolvable code) and nothing else
— no sensitive data directly in the payload, which is the same "no personal
or sensitive data in a URL/identifier exposed to unauthenticated contexts"
principle `SECURITY.md` already states for URLs generally, extended here
explicitly to physical QR codes since that surface wasn't anticipated when
`SECURITY.md` was written.

## W. Integration Boundaries

**Relationship to `EXTERNAL_DATA_ARCHITECTURE.md`:** sensor/data-logger
integration (input §15) is the identical manual/automated-coexistence shape
already designed there — no new adapter pattern. `INTEGRATIONS.md` §10
(`IoTIngestProvider`) already anticipated exactly this. Payment (already
`INTEGRATIONS.md` §6, Stripe per `DECISIONS.md` ADR-008), shipping,
accounting, and calendar (`INTEGRATIONS.md` §9, not yet implemented) extend
the same per-capability adapter convention with new capability interfaces
added when actually needed — not now.

**Relationship to `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md`:** Reporting
(§N) reuses `StoryBlock`; Client Portal content presentation could reuse the
same composition system once built; the AI Operator Copilot (§U) and that
review's Ask Néctar/AI Architecture (its §H) are the same underlying
mechanism applied to two different user populations (internal operator vs.
broader authorized users) — one `AIProvider` adapter, one `ai.recommendation`
governance loop, not two AI systems.

Per instruction, none of the three documents are merged — this section is
the only place cross-references live, and every reference above points to a
specific section rather than restating it.

## X. Implementation Phases

**FOUNDATIONAL** (shared prerequisite with the other two reviews' phases):
`Location`, `Organization`, `Project` (+ `ProjectDomainTag`), `Sample`.
Specific to this document: `Lot`, `LotTransformation` (+ input/output),
`QuantityEvent`, `HarvestEvent`/`ReceivingEvent`. This is the highest-value
Foundational addition of the three review documents, since almost
everything else in this one depends on it.

**MVP:** Processing Workbench UI over the Foundational tables; basic
Drying/Storage tracking (`StorageLot`/`StorageEvent`); Sample management
detail (blind code, transfer, depletion); operational `InventoryItem`/
`InventoryMovement` (no Commerce SKU integration yet).

**NEXT:** Coffee Cupping (one configured `SensoryProtocolVersion`, per
`MVP_ROADMAP.md` Slice 6's own sequencing — not moved earlier by this
document); `Descriptor` vocabulary; `Reporting` engine (reusing
`StoryBlock`); Consulting pre-Project pipeline (`ServiceInquiry`/
`Proposal`); Client Portal; `Offering` for `product`/`experience` (Commerce
already sequenced at Slice 3).

**ADVANCED:** Competition Mode; Panel Analytics; AI Operator Copilot; Data
Analysis Workbench; `Offering` extended to `service`/`consulting_engagement`;
`organization` `ScopeType` + multi-org Client Portal access.

**EXPERIMENTAL:** Live sensor/IoT ingestion; Forecasting/prediction (input
§42's own classification, agreed); Professional SaaS multi-tenant billing;
Mobile offline field companion (shared EXPERIMENTAL item with the Adaptive
Intelligence review).

## Y. First Vertical Slice

| Candidate | Depends on | Assessment |
|---|---|---|
| Coffee lot genealogy + processing workbench | Foundational only | Smallest dependency set; validates the one genuinely new architectural primitive (§F) everything else either builds on or is far less valuable without. |
| Fermentation logging | Foundational + Lot Genealogy (a fermentation run consumes/produces lots) | Valuable, but sits on top of #1 rather than being independent of it. |
| Coffee cupping / Sensory OS | Foundational + (for a real cupping) a traceable Sample, which itself needs Lot Genealogy for provenance | Largely pre-designed already (`DOMAIN_MODEL.md`/`RBAC.md`), but still benefits from #1 existing first. |
| Consulting project → report | Foundational + Reporting Architecture (§N) + Offering/Service chain (§O/P) | Larger dependency set; consulting also isn't the platform's stated differentiator (input §56's own boundary). |
| Commerce → operational project | Foundational + Commerce (Slice 3) + Operations | Largest dependency set of the five. |

**Recommendation: Coffee lot genealogy + processing workbench, first** —
the same reasoning pattern as the Adaptive Intelligence review's §O
(smallest dependency set, validates the one new primitive), and the
candidate every other item in this document either depends on directly or
benefits from indirectly.

## Z. Risks

- **Overbuilding / ERP creep** — the largest risk given this input
  document's 60-section scope. Mitigated by its own explicit §56 boundary
  (no full accounting, payroll, generic HR, generic CRM, full warehouse
  ERP, generic PM software, arbitrary IoT platform) — treated here as a
  firm commitment, not a suggestion to revisit under scope pressure.
- **Duplicated entities** — the specific risks found and closed in this
  review: a second Task system, a second protocol-versioning system, a
  `ClientRelationship` entity duplicating Organization/Person, an
  `Offering` built too deep instead of thin.
- **Permission leakage** — mitigated by keeping Project-scoped Assignments
  as the safe default until the `organization` `ScopeType` (§S) is actually
  built and tested; multi-org access should not be approximated with
  broader-than-necessary Assignments in the meantime.
- **Bad lot lineage** — the single highest-consequence correctness risk in
  this document: `Lot`/`LotTransformation` must stay strictly append-only
  (§F). A single in-place edit to a historical lot record breaks
  traceability silently, with no error, until someone notices a report
  doesn't add up.
- **Unreliable quantity tracking** — same append-only requirement applied
  to `QuantityEvent` (§G); never collapse the ledger into one overwritable
  "current quantity" without keeping the ledger as the source of truth
  underneath it.
- **Scientific integrity** — protocol versioning/deviation tracking (§J)
  must be enforced with the same rigor for operational protocols as for
  research protocols; no quietly-lower bar because it's "just processing."
- **Sensory protocol integrity** — the blind-coding safeguard (§L) must
  cover AI tool access explicitly, not only the human-facing UI.
- **Offline synchronization** — deferred (§V) but a real future risk if
  Partner Workspace forms are eventually built without a real
  conflict-resolution design.
- **Vendor lock-in** — payment/accounting/shipping/calendar adapters (§W)
  must go through `INTEGRATIONS.md`'s capability-interface discipline, same
  as every other external dependency in this platform.
- **Excessive complexity** — the specific risk named repeatedly in this
  review: `Offering` becoming a deep unifying abstraction instead of a
  thin catalog layer. Kept explicitly thin in §E/§P; revisit only if a
  concrete cross-offering-type feature demonstrably needs more.

## AA. Decisions Requiring Product-Owner Approval

1. **Add `organization` as a new `RBAC` `ScopeType`** (§S) — confirm,
   since it's a `RBAC.md` amendment, scheduled alongside Client Portal
   work rather than done now.
2. **Build `Offering` as a thin catalog/discovery layer**, not a deep
   shared commercial workflow (§E, §P) — confirm this scope.
3. **Reuse Research OS's `Protocol`/`ProtocolVersion` for operational
   (non-research) processing protocols too**, rather than a separate
   operational-protocol entity (§J) — confirm.
4. **Consulting is a `Project` with a domain tag**, not a separate
   consulting-project system (§O) — confirm.
5. **First vertical slice: Coffee lot genealogy + processing workbench**
   (§Y) — confirm or reprioritize against the other four candidates.
6. **Operational inventory stays structurally separate from Commerce SKU
   inventory**, connected only by lot-lineage FK (§G, input §51) — confirm.
7. **Professional SaaS / multi-tenancy: design-now, build-later posture**
   (§R) — confirm no earlier commitment (billing, white-labeling,
   self-service signup) is wanted.
8. **Specific nullable FKs (not a polymorphic parent reference) on the
   generalized `Measurement` table** (§I) — confirm this trade-off
   (referential integrity over table width) is the right one.

---

*Architecture review only. No entity added to the live schema, no
migration created, no dependency installed, no checkout/payment/billing/
sensor code touched, per the constraint given with this task.*
