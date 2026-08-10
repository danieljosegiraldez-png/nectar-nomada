# NÉCTAR NÓMADA — Phase 1 Technical Execution Plan Prompt
## Claude Code architecture-to-execution planning prompt

**Status:** Planning only. Do not implement during this pass.

**Sequencing note, added before this reaches Claude Code**: this must run
*after* the gap analysis (requested separately) has completed and its
findings are available. The gap analysis performs much of the same
"inspect what's actually built vs. planned/documented" work this plan also
needs — running them back-to-back, with gap analysis findings as direct
input here, avoids duplicating that inspection and avoids this plan being
built on assumptions the gap analysis might have already corrected.

---

# -1. REQUIRED INPUT — READ FIRST

Before starting the instructions below, read `GAP_ANALYSIS_2026-08-10.md`
in full. Its findings on internal consistency, broken cross-references, and
actual build state directly inform this plan — do not re-derive from
scratch what that report already established. If its findings conflict
with anything below, the gap analysis (grounded in the actual repository)
wins; flag the conflict rather than silently picking one.

**One specific confirmed decision from that review, required scope for
this plan, not optional**: the gap analysis found that `provenance_class`/
`source_reference`/`data_quality` — specified throughout the architecture
as "mandatory, not conventional" — has zero implementation anywhere;
built modules use a simpler `RecordStatus`/`ClassificationLevel` pair
instead. **Confirmed direction: build the full provenance vocabulary
properly, and produce a migration plan to retrofit it onto already-built
modules.** This belongs in this plan's Canonical Entity Decisions (§5) and
Database Change Plan (§36) sections specifically — Phase 1's own
foundational-principles list (§4) already names "provenance" as something
to preserve, so this isn't new scope, it's making that existing
requirement concrete. The retrofit migration plan should be produced here;
whether it's *executed* as part of Phase 1 or as a fast-follow is your
call to make explicitly in the plan, with reasoning, not left unstated.

---

# 0. PURPOSE

We have completed multiple architecture explorations for the Néctar Nómada platform.

The next step is NOT to add another broad architecture domain.

The next step is to convert the reconciled platform architecture into a technically executable Phase 1 plan focused on the smallest foundational implementation that proves the platform's core value.

The intended Phase 1 focus is:

1. canonical platform foundation;
2. organization/project/location integrity;
3. lot genealogy;
4. measurement/event architecture;
5. one end-to-end coffee operations vertical slice;
6. enough sensory/reporting linkage to validate the model;
7. operator usability;
8. strong provenance/auditability.

This should be designed so later modules—Research OS, Sensory OS, Commerce, Consulting, External Data, Content Intelligence, Ask Néctar, Brand/Marketing, Tourism and Professional Tools—can build on it without major rework.

---

# 1. FIRST INSTRUCTION

Before proposing implementation work:

1. Read `CLAUDE.md` completely.
2. Read the current architecture documents in `/docs/architecture/`.
3. Read at minimum, if present:
   - `PLATFORM_OVERVIEW.md`
   - `DOMAIN_MODEL.md` (critical — see explicit reconciliation requirement
     below; this already specifies an Agricultural Traceability chain)
   - `DATA_ARCHITECTURE.md`
   - `MVP_ROADMAP.md`
   - `RBAC.md`
   - `SECURITY.md`
   - `AI_GOVERNANCE.md`
   - `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md`
   - `BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md`
   - `BEVERAGE_SENSORY_PROTOCOLS.md`
   - `RESEARCH_ACTIVITY_CRITERIA.md`
   - the most recent `GAP_ANALYSIS_*.md` (per section -1 above)
   - any other document currently in `/docs/architecture/` — confirm the
     full list against the real filesystem rather than assuming any static
     list is complete or that every name above still applies exactly as
     written
4. Inspect the actual repository:
   - package structure;
   - Next.js app structure;
   - backend/API organization;
   - PostgreSQL schema;
   - ORM schema;
   - migrations;
   - seed data;
   - authentication;
   - RBAC;
   - audit functionality;
   - Project;
   - Person;
   - Organization;
   - Location;
   - Lot;
   - Sample;
   - Measurement;
   - Process;
   - Fermentation;
   - Sensory;
   - Report;
   - Media;
   - existing operator interfaces;
   - tests;
   - background jobs;
   - storage;
   - search;
   - observability.
5. Inspect Git status and avoid discarding working code.

Do not assume architecture documents accurately describe the current implementation.

The repository is the implementation truth.

---

# 2. REQUIRED DELIVERABLE

Create:

`/docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md`

If `/docs/implementation/` does not exist, create the documentation directory only.

Do NOT implement production features during this planning pass.

After creating the document, report back with:

1. what already exists and can be retained;
2. what must change before Phase 1;
3. the final Phase 1 scope;
4. the recommended first implementation ticket;
5. migrations/schema changes expected;
6. major risks;
7. decisions requiring product-owner approval.

Then stop.

---

# 3. PRIMARY PHASE 1 OBJECTIVE

Phase 1 should prove that Néctar Nómada can manage a real traceable specialty-coffee workflow from field material to sensory result without duplicating data or losing lineage.

Target conceptual flow:

```text
Organization / Farm
        ↓
Location / Plot
        ↓
Harvest
        ↓
Source Lot
        ↓
Receiving
        ↓
Processing Lot
        ↓
Fermentation
        ↓
Drying
        ↓
Storage
        ↓
Green Lot
        ↓
Sample
        ↓
Roast / Brew or Cupping preparation
        ↓
Sensory Session
        ↓
Result / Report
```

The exact implementation should be reconciled against existing domain models.

Do not blindly create stage-specific tables if the existing lineage architecture supports a cleaner approach.

---

# 4. FOUNDATIONAL PRINCIPLES

Phase 1 must preserve:

- canonical IDs;
- provenance;
- audit history;
- immutable historical lineage;
- versioned protocols where relevant;
- correction history;
- role-based access;
- multi-organization readiness;
- human-entered versus automated observations;
- measured versus derived data;
- operational versus research interpretation.

Avoid:

- generic ERP design;
- generic warehouse software;
- premature SaaS billing;
- premature AI agents;
- premature external API integrations;
- premature 3D/media infrastructure.

---

# 5. CANONICAL FOUNDATION REVIEW

Before proposing Phase 1 implementation, confirm whether the following canonical entities already exist and whether they are sufficient:

```text
Person
User
Organization
OrganizationMembership
Location
Project
ProjectMembership
Role
Permission
Assignment
MediaAsset
AuditEvent
```

For each classify:

```text
KEEP
EXTEND
RENAME
MIGRATE
DEPRECATE
NEW
```

Do not create duplicates.

---

# 6. ORGANIZATION / FARM / LOCATION MODEL

A farm should not be duplicated across modules.

Evaluate:

```text
Organization
  type = Farm / Producer / Processor / Roaster / etc.

Location
  farm property
  plot/block
  processing site
  drying site
  storage site
```

Determine whether Farm should be:

- Organization subtype;
- specialized domain entity linked to Organization;
- both, with clear responsibility.

Do not encode geographic identity only as text strings.

Prepare for PostGIS where justified, but do not introduce it solely for future possibilities if current architecture does not need it yet.

---

# 7. LOT GENEALOGY — CRITICAL

**Required reconciliation, non-optional**: `DOMAIN_MODEL.md`'s existing
Agricultural Traceability section already specifies a chain — `Lot →
HarvestEvent → Selection → Processing → Fermentation → Drying → Storage →
Transport → GreenSample → RoastSession → Brewing → SensorySession`. This
section's Option A/B/C comparison (§8 below) must explicitly reconcile
against that existing specification, not propose a fresh model in
isolation. If the existing chain already satisfies the requirements below,
say so plainly and use it — do not create a competing model for its own
sake. If it needs extension or a different structural approach (e.g., the
Option B/C event-based pattern below), name exactly what changes and why,
as a reconciliation, not a replacement decided in a vacuum.

Lot genealogy is one of the most important Phase 1 components.

The system must answer both:

> Where did this material come from?

and:

> What did this material become?

Support:

```text
CREATE
TRANSFORM
SPLIT
MERGE
BLEND
TRANSFER
SAMPLE
LOSS
ADJUSTMENT
DISPOSE
SALE / RELEASE
```

Example:

```text
Harvest Lot H-001
    ↓ split
Processing Lot P-001
Processing Lot P-002
Control Lot P-003
```

Later:

```text
P-001
↓
Dry material
↓
Green Lot G-001
↓
Sample S-001
↓
Cupping
```

And:

```text
G-001 ─┐
       ├→ Blend B-001
G-004 ─┘
```

Do not implement genealogy as a single mutable `parentLotId` if that cannot support merges and many-to-many transformations.

---

# 8. LOT MODEL DESIGN DECISION

Explicitly compare at least these approaches:

## Option A — Stage-specific entities

```text
HarvestLot
ProcessingLot
DryingLot
StorageLot
GreenLot
```

## Option B — One canonical Lot + stage/status/events

```text
Lot
LotTransformation
LotStage
```

## Option C — Hybrid

Canonical `Lot`
+
specialized stage execution entities such as:

```text
FermentationRun
DryingRun
StorageAssignment
```

Recommend the approach best suited to:

- coffee traceability;
- future honey/cacao/beverage use;
- reporting;
- inventory;
- research;
- maintainability.

Document the tradeoff.

---

# 9. QUANTITY / MASS EVENTS

Do not overwrite one weight field repeatedly.

Use event-based quantity tracking where appropriate.

Potential:

```text
LotQuantityEvent
```

with:

```text
timestamp
lot
event_type
quantity
unit
measurement_source
operator
related_transformation
confidence/quality
notes
```

Example:

```text
500 kg cherry received
285 kg wet parchment produced
92 kg dry parchment
75 kg green
1.5 kg samples removed
```

Missing measurements must remain missing.

Do not infer mass loss automatically unless explicitly calculated as a derived metric.

---

# 10. MEASUREMENT ARCHITECTURE — CRITICAL

Phase 1 must define one coherent measurement model.

Potential dimensions:

```text
Measurement
- subject
- variable
- value
- unit
- timestamp
- source_type
- source_device
- operator
- protocol
- quality
- note
```

Subjects may include:

```text
Lot
FermentationRun
DryingRun
StorageLocation
Sample
Environment
```

Variables may include:

```text
temperature
pH
Brix
RH
moisture
water_activity
weight
pressure
gravity
```

Do not hardcode all variables into one huge table with dozens of nullable columns.

Also avoid storing everything as arbitrary JSON when typed semantics are important.

Recommend the correct hybrid.

---

# 11. MEASUREMENT SOURCE TYPES

Preserve distinctions among:

```text
MANUAL
DEVICE
SENSOR
LAB
IMPORT
EXTERNAL_CONTEXT
DERIVED
```

Phase 1 may implement only MANUAL and possibly DEVICE-ready architecture.

Do not integrate sensors yet unless repository already has stable support.

---

# 12. UNIT HANDLING

Define:

- canonical units;
- source units;
- conversion policy;
- validation;
- display units.

Never lose original reported unit.

Example:

```text
source_value
source_unit
normalized_value
normalized_unit
```

only if justified by existing architecture.

Avoid duplicate conversion logic across modules.

---

# 13. EVENT MODEL

Operational events should capture what happened.

Potential events:

```text
HARVESTED
RECEIVED
LOT_CREATED
LOT_SPLIT
LOT_MERGED
PROCESS_STARTED
FERMENTATION_STARTED
INOCULATED
MEASURED
SAMPLED
TRANSFERRED
FERMENTATION_ENDED
DRYING_STARTED
TURNED
COVERED
UNCOVERED
DRYING_ENDED
STORED
MOVED
SAMPLE_CREATED
CUPPING_CREATED
```

Determine whether a generic domain-event model is useful or whether typed operational entities + audit events are safer.

Do not confuse business events with infrastructure message-bus events.

---

# 14. HARVEST / RECEIVING

Phase 1 should support enough receiving context to create a real source lot.

Potential data:

- farm;
- plot/block;
- harvest date/time;
- cultivar/species;
- mixed cultivar support;
- cherry weight;
- Brix;
- temperature;
- condition;
- ripeness;
- operator;
- notes;
- media.

Do not fabricate missing details in seed data.

Use DEMO fixtures only.

---

# 15. PROCESS EXECUTION

Separate planned protocol from actual execution.

Potential:

```text
ProcessProtocol
ProcessProtocolVersion
ProcessExecution
ProcessStepExecution
Deviation
```

Reuse Research OS protocol/version architecture if already suitable.

Do not create a duplicate protocol engine.

---

# 16. FERMENTATION RUN

Phase 1 should support:

- linked input lot(s);
- vessel;
- process/protocol;
- start/end;
- operator;
- inoculation if used;
- measurements;
- interventions;
- observations;
- output lot(s).

Potential interventions:

```text
INOCULATION
AGITATION
PURGE
ADDITION
SAMPLE
TRANSFER
TERMINATION
OTHER
```

Do not force every fermentation to be inoculated.

---

# 17. DRYING RUN

Support enough structure to validate operations:

- input lot;
- method;
- location/bed;
- start/end;
- layer depth where relevant;
- turning events;
- cover/uncover;
- moisture;
- water activity;
- ambient temperature/RH;
- output lot.

Do not make all fields mandatory.

---

# 18. STORAGE

Support:

- lot;
- storage location;
- container/bag;
- start/end;
- movements;
- temperature/RH where available;
- moisture/water activity where available;
- sample extraction;
- current quantity.

Preserve location history.

---

# 19. SAMPLE MANAGEMENT

Samples should retain lineage.

Potential:

```text
Sample
- code
- sample_type
- source_lot
- source_event
- quantity
- unit
- created_at
- storage
- status
```

Support future blind codes separately.

Do not use blind code as canonical sample identity.

---

# 20. SENSORY LINKAGE

Phase 1 does NOT need to implement the entire Sensory OS if it does not already exist.

But the coffee vertical slice should be able to link:

```text
Sample
→ SensorySession
→ Assessment(s)
→ Aggregate/Result
```

If current Sensory OS exists, use it.

If not, define the minimum integration boundary required for Phase 1 and defer full sensory implementation to its planned phase.

---

# 21. OPERATOR WORKBENCH

Phase 1 should include a practical operator interface.

A user opening a lot should be able to understand:

```text
IDENTITY
ORIGIN
CURRENT STAGE
LINEAGE
QUANTITY
PROCESS
MEASUREMENTS
OPEN TASKS
SAMPLES
SENSORY
MEDIA
AUDIT
```

This is more important than building many dashboards.

---

# 22. LOT PAGE

Recommend one canonical Lot Detail screen.

Potential sections:

```text
Overview
Lineage
Timeline
Processing
Measurements
Drying
Storage
Samples
Sensory
Media
Tasks
History
```

Only show sections relevant to the lot.

---

# 23. ACTIVE OPERATIONS VIEW

Create or plan an operator view answering:

```text
What is active?
What changed?
What needs attention?
```

Potential cards:

- active fermentations;
- drying lots;
- lots requiring measurements;
- samples awaiting sensory;
- incomplete traceability.

Avoid decorative KPI dashboards with no actionability.

---

# 24. FIELD / MOBILE REQUIREMENTS

Phase 1 forms should be designed for phone use.

Requirements:

- large touch targets;
- fast measurement entry;
- timestamp default;
- optional note;
- photo attachment;
- QR-ready identity;
- offline draft architecture;
- minimal repeated fields.

Do not build full offline sync unless roadmap already places it in Phase 1.

But avoid architecture that makes offline support impossible.

---

# 25. QR READINESS

Design canonical IDs so QR can later resolve:

- lot;
- sample;
- vessel;
- drying bed;
- storage location.

Do not encode sensitive operational data directly in QR content.

---

# 26. RBAC

Phase 1 must enforce server-side authorization.

Potential users:

- Néctar Nómada admin;
- project manager;
- researcher;
- farm operator;
- partner;
- sensory evaluator.

Use existing contextual assignment model.

Avoid global role shortcuts.

---

# 27. AUDITABILITY

Important actions must be auditable:

- lot creation;
- transformation;
- measurement;
- correction;
- sample creation;
- protocol/deviation;
- sensory submission;
- quantity adjustment.

Determine which existing audit infrastructure can be reused.

---

# 28. DATA CORRECTION

Operators will make mistakes.

Support corrections without destroying history.

Potential:

```text
original value
corrected value
reason
corrected_by
corrected_at
```

Do not make immutable operational records impossible to correct.

---

# 29. RESEARCH OS BOUNDARY

Operational records may support research.

But:

```text
Operational Measurement
≠
Approved Research Evidence
```

Research OS should explicitly adopt/reference operational records when used as evidence.

Do not automatically promote all processing data into EvidenceClaim.

---

# 30. EXTERNAL DATA BOUNDARY

Do not implement external weather/satellite APIs in Phase 1 unless already required.

Ensure measurement/context architecture can later relate to:

```text
ExternalObservation
```

without treating it as primary project measurement.

---

# 31. AI BOUNDARY

Do not implement Ask Néctar in Phase 1 unless already planned and low-risk.

Ensure the domain model supports future read-only questions such as:

- Which lots are active?
- Which measurements are missing?
- Trace sample S-001 backward.
- Compare two fermentations.
- Show deviations from protocol.

AI must not be required for the core workflow.

---

# 32. REPORTING BOUNDARY

Phase 1 should make data reportable.

Recommend a minimal:

```text
Lot Summary / Lot Report
```

that can reproduce:

- origin;
- lineage;
- processing;
- measurements;
- drying;
- storage;
- samples;
- sensory summary if available.

The report can initially be web-rendered.

PDF can remain deferred if not already supported.

---

# 33. TESTING STRATEGY

Define required tests before implementation.

At minimum:

## UNIT

- lineage transformations;
- quantity calculations;
- unit conversion;
- validation.

## INTEGRATION

- lot creation;
- split/merge;
- measurements;
- process execution;
- sample creation.

## RBAC

- authorized operator;
- unauthorized organization;
- partner scope;
- blind sensory protection where applicable.

## END-TO-END

One complete coffee workflow.

---

# 34. DEMO DATA

Use DEMO fixtures only unless verified real project data already exists in repository.

Do not fabricate:

- experimental measurements;
- coordinates;
- sensory scores;
- partner facts;
- prices;
- dates.

If using project names for demonstration, label data clearly DEMO unless the values are verified.

---

# 35. MIGRATION STRATEGY

The execution plan must identify:

```text
KEEP
EXTEND
RENAME
MIGRATE
DEPRECATE
REMOVE_LATER
```

for existing schema.

No destructive migration without explicit rationale.

---

# 36. DATABASE PLAN

The execution plan should propose exact schema changes at a planning level.

For each proposed entity:

```text
name
purpose
existing/new
key fields
relationships
indexes
constraints
audit/version needs
migration risk
```

Do not generate migrations yet.

---

# 37. API PLAN

Define required service/API boundaries.

Potential:

```text
LotService
LotGenealogyService
MeasurementService
ProcessExecutionService
SampleService
SensoryLinkService
```

Do not create services merely for aesthetic architecture.

Use existing modular-monolith conventions.

---

# 38. UI PLAN

Define only screens required for the Phase 1 vertical slice.

Potential:

1. Active Operations
2. Lot List
3. Lot Detail
4. Create Lot
5. Record Measurement
6. Record Process/Fermentation
7. Record Drying
8. Record Storage Movement
9. Create Sample
10. Sensory linkage/result view
11. Lot Report

Avoid designing dozens of unrelated screens.

---

# 39. IMPLEMENTATION TICKETS

Break Phase 1 into small tickets.

Each ticket should include:

```text
Goal
Dependencies
Files/modules affected
Schema impact
API impact
UI impact
Tests
Definition of Done
Risk
```

Recommend ordering.

---

# 40. PHASE 1 GATES

Define gates such as:

## GATE A — Canonical model approved

## GATE B — Genealogy tests pass

## GATE C — Measurement model validated

## GATE D — Operator workflow functional

## GATE E — End-to-end trace works

## GATE F — RBAC verified

## GATE G — Lot report reproducible

Do not move to advanced features before core gates pass.

---

# 41. SUCCESS CRITERIA

The first vertical slice succeeds if a user can:

1. create/select a farm/location;
2. create a harvest/source lot;
3. split or transform the lot;
4. record processing/fermentation;
5. record structured measurements over time;
6. transition into drying;
7. transition into storage;
8. create a sample;
9. link a sensory result/session;
10. trace the sample back to origin;
11. trace the source lot forward;
12. see the full timeline;
13. generate/view a reproducible lot summary;
14. perform all of this under proper RBAC/audit controls.

---

# 42. WHAT SHOULD BE DEFERRED

Unless already required by the current roadmap, explicitly defer:

- full commerce;
- Publer integration;
- social/community automation;
- complex AI agents;
- external satellite/weather integration;
- 360/3D;
- advanced media processing;
- predictive fermentation;
- predictive sensory;
- full SaaS billing;
- generalized agriculture ERP;
- advanced IoT ingestion;
- autonomous recommendations;
- complex marketing attribution.

---

# 43. RISK REVIEW

Evaluate:

- lot genealogy complexity;
- overly generic models;
- stage-specific duplication;
- nullable-table explosion;
- excessive JSON;
- poor unit semantics;
- permission leakage;
- cross-organization access;
- audit gaps;
- mass-balance false precision;
- research/operations confusion;
- mobile usability;
- migration complexity;
- premature abstraction.

---

# 44. REQUIRED DOCUMENT STRUCTURE

`PHASE_1_TECHNICAL_EXECUTION_PLAN.md` should contain:

1. Executive Summary
2. Current Repository State
3. Existing Capabilities to Retain
4. Phase 1 Scope
5. Explicit Non-Scope
6. Canonical Entity Decisions
7. Farm / Organization / Location Model
8. Lot Genealogy Architecture
9. Quantity / Mass Architecture
10. Measurement Architecture
11. Unit Architecture
12. Event Architecture
13. Harvest / Receiving
14. Processing / Protocol Execution
15. Fermentation
16. Drying
17. Storage
18. Samples
19. Sensory Integration Boundary
20. Research OS Boundary
21. External Data Boundary
22. AI Boundary
23. Operator UX
24. Mobile / Field Requirements
25. RBAC
26. Audit / Correction Model
27. Reporting
28. Database Change Plan
29. API / Service Plan
30. UI Screen Plan
31. Testing Strategy
32. Seed / Demo Strategy
33. Migration Strategy
34. Implementation Ticket Breakdown
35. Dependency Graph
36. Phase Gates
37. Success Criteria
38. Risks
39. Open Questions
40. Product-owner Decisions Required
41. Recommended First Ticket

---

# 45. REQUIRED ENTITY MATRIX

Include:

```text
Entity
Current Status
Recommendation
Domain Owner
Purpose
Key Relationships
Migration Impact
Phase 1 Required?
```

---

# 46. REQUIRED LOT LINEAGE DIAGRAM

Include at least one diagram showing:

```text
Harvest
→ Lot
→ Split
→ Fermentation
→ Drying
→ Storage
→ Green Lot
→ Sample
→ Sensory
```

and one merge/blend example.

---

# 47. REQUIRED MEASUREMENT MATRIX

Include:

```text
Variable
Subject Type
Source Type
Typical Unit
Canonical Unit
Phase 1?
Validation
```

At minimum:

- temperature;
- pH;
- Brix;
- RH;
- moisture;
- water activity;
- weight.

---

# 48. REQUIRED API/TICKET MATRIX

Include:

```text
Ticket
Dependency
Domain
Schema
Backend
Frontend
Tests
Risk
Definition of Done
```

---

# 49. FIRST IMPLEMENTATION TICKET

Recommend ONE first ticket.

The first ticket should establish maximum architectural leverage with minimum user-facing complexity.

Candidate examples:

A. Canonical Lot + LotTransformation schema and tests

B. Measurement architecture and units

C. Organization/Farm/Location cleanup

Choose based on repository state.

Do not assume A is automatically first.

---

# 50. IMPORTANT CONSTRAINTS

During this planning phase:

DO NOT:

- modify production code;
- create migrations;
- install dependencies;
- alter authentication;
- implement UI;
- implement APIs;
- add integrations;
- add AI;
- change live data;
- delete existing architecture.

Documentation/planning only.

Small documentation directory creation is allowed.

---

# 51. FINAL RESPONSE

After creating:

`/docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md`

report only:

1. What already exists and can be retained.
2. What must be corrected before implementation.
3. Final Phase 1 scope.
4. Recommended first implementation ticket.
5. Expected schema/migration impact.
6. Major risks.
7. Product-owner decisions required.
8. Explicit reconciliation: how the Lot Genealogy decision (§7-8) relates to
   DOMAIN_MODEL.md's existing Agricultural Traceability chain — extends it,
   uses it as-is, or diverges from it, with reasoning either way.
9. Any findings from the gap analysis report (per section -1) that changed
   or constrained this plan, named explicitly.
10. The provenance vocabulary build-out and retrofit migration plan (per
    section -1) — what the full schema looks like, which built modules need
    migration, and whether that migration is in-scope for Phase 1 itself
    or explicitly sequenced right after it.

Then stop.

Do not begin implementation until I approve the plan.
