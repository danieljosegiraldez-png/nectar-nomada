# NÉCTAR NÓMADA — Commerce, Operations & Professional Tools Architecture Input

**Purpose:** Product and architecture exploration for Claude Code.

**Status:** Architecture input only. Do not implement directly.

---

# 1. PURPOSE

Néctar Nómada is not only a public website, content platform, research platform, or online store.

The platform should eventually connect:

- commerce;
- products;
- services;
- consulting;
- experiences;
- tourism;
- farms;
- coffee lots;
- processing;
- fermentation;
- drying;
- storage;
- inventory;
- samples;
- sensory evaluation;
- research;
- analytics;
- reporting;
- clients;
- producers;
- implementation partners;
- operators.

These capabilities should share the same canonical data model rather than becoming disconnected applications.

The objective is to create a platform that can simultaneously support:

1. customers buying products;
2. travelers booking experiences;
3. producers managing coffee lots;
4. operators recording processing data;
5. consultants managing technical projects;
6. researchers analyzing experiments;
7. sensory professionals conducting evaluations;
8. judges conducting competitions;
9. clients receiving reports;
10. internal operators managing Néctar Nómada projects;
11. professional users using Néctar Nómada tools as an operational platform.

The architecture should therefore be evaluated as both:

**Explore Néctar Nómada**

and

**Néctar Nómada Professional Tools**

while preserving one underlying source of truth.

---

# 2. CORE ARCHITECTURAL PRINCIPLE

Conceptually:

```text
                    NÉCTAR NÓMADA
                          │
                 CANONICAL KNOWLEDGE
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
    COMMERCE          OPERATIONS         RESEARCH
        │                 │                  │
 Products           Farms / Lots        Experiments
 Services           Processing          Evidence
 Consulting         Fermentation        Analysis
 Experiences        Drying
                    Storage
        │                 │                  │
        └─────────────────┼──────────────────┘
                          │
                     SENSORY OS
                          │
                  ANALYTICS / REPORTS
                          │
                  INTELLIGENCE LAYER
                          │
       ┌──────────────────┼───────────────────┐
       │                  │                   │
 Operator AI        Creative AI        Research AI
       │                  │                   │
       └──────────────────┼───────────────────┘
                          │
                  EXPERIENCE ENGINE
                          │
     Customer / Producer / Consultant / Researcher / Public
```

The interface changes.

The underlying facts and traceability do not.

---

# 3. COMMERCE SHOULD NOT MEAN ONLY PRODUCTS

Do not model Néctar Nómada commerce as a conventional product catalog only.

The platform may commercially offer:

- physical products;
- coffee;
- honey;
- cacao;
- beverages;
- specialty products;
- tasting kits;
- educational kits;
- experiences;
- farm visits;
- expeditions;
- workshops;
- sensory sessions;
- events;
- consulting;
- fermentation consulting;
- processing consulting;
- farm assessment;
- sensory analysis;
- research services;
- beverage development;
- project-based technical services;
- reports;
- potentially professional software access or subscriptions.

Evaluate whether a canonical abstraction such as `Offering` is appropriate.

Potential structure:

```text
Offering
 ├─ Physical Product
 ├─ Experience
 ├─ Service
 ├─ Consulting Engagement
 ├─ Event
 ├─ Workshop
 ├─ Research Service
 ├─ Digital Deliverable
 └─ Subscription / Professional Access
```

Do not create this abstraction if the existing repository already solves the problem cleanly.

---

# 4. COMMERCE → OPERATIONS

A purchase or commercial agreement may initiate an operational workflow.

Example:

```text
Coffee Processing Assessment
        ↓
Client requests / purchases service
        ↓
Client + Organization
        ↓
Farm
        ↓
Project
        ↓
Lots
        ↓
Field assessment
        ↓
Processing records
        ↓
Sensory evaluation
        ↓
Analysis
        ↓
Recommendations
        ↓
Client report
        ↓
Follow-up
```

Commerce should therefore be capable of connecting to actual platform operations.

Do not design Orders as an isolated e-commerce silo.

---

# 5. CLIENT / CRM ARCHITECTURE

Evaluate how People and Organizations can act as clients without creating duplicate identities.

Potential client relationships:

```text
Person / Organization
        ↓
Client Relationship
 ├─ purchases
 ├─ consulting projects
 ├─ farms
 ├─ locations
 ├─ samples
 ├─ lots
 ├─ sensory sessions
 ├─ experiences
 ├─ reports
 ├─ invoices
 ├─ proposals
 └─ communications
```

Determine what CRM capabilities genuinely belong inside Néctar Nómada.

Avoid accidentally building a generic enterprise CRM.

Focus on relationships necessary for Néctar Nómada workflows.

---

# 6. CONSULTING WORKFLOW

Consulting should be a first-class workflow.

Potential lifecycle:

```text
LEAD / REQUEST
↓
DISCOVERY
↓
SCOPE
↓
PROPOSAL
↓
ACCEPTANCE
↓
PROJECT
↓
FIELD / TECHNICAL WORK
↓
DATA COLLECTION
↓
ANALYSIS
↓
REPORT
↓
RECOMMENDATIONS
↓
FOLLOW-UP
↓
CLOSED / ONGOING
```

A consulting project may involve:

- farms;
- producers;
- lots;
- experiments;
- sensory evaluations;
- media;
- documents;
- tasks;
- recommendations;
- deliverables.

Determine whether this can extend the existing Project model rather than creating a separate consulting-project system.

---

# 7. COFFEE OPERATIONS OS

Coffee should be treated as a major professional operational domain.

A useful conceptual chain is:

```text
FARM
 ↓
BLOCK / PLOT
 ↓
HARVEST
 ↓
CHERRY LOT
 ↓
RECEIVING
 ↓
PROCESSING LOT
 ↓
FERMENTATION
 ↓
DRYING
 ↓
STORAGE
 ↓
GREEN LOT
 ↓
SAMPLE
 ↓
ROAST
 ↓
CUPPING
 ↓
SALE / PRODUCT / EXPERIMENT
```

Do not assume every farm uses every stage.

The system must support flexible workflows while maintaining traceability.

---

# 8. FARM MANAGEMENT

Evaluate support for:

- farms;
- properties;
- plots/blocks;
- cultivars;
- crop context;
- harvests;
- field visits;
- agronomic observations;
- environmental observations;
- biodiversity observations;
- apiaries;
- infrastructure;
- equipment;
- tasks;
- operators;
- project relationships.

Do not attempt to build a complete generic agricultural ERP.

Néctar Nómada's differentiation should remain centered on:

**specialty production + processing + experimentation + traceability + sensory quality + research.**

---

# 9. HARVEST & RECEIVING

Potential records include:

```text
Harvest
HarvestEvent
ReceivingEvent
```

Possible fields/data:

- date/time;
- farm;
- plot/block;
- cultivar;
- producer;
- harvest method;
- cherry weight;
- Brix;
- temperature;
- cherry condition;
- ripeness observations;
- defects;
- photos;
- operator;
- notes.

Determine how harvest events create or feed lots.

---

# 10. LOT GENEALOGY

This is a critical requirement.

Do not simply attach a `lotId` to records.

Coffee changes form and may split or merge.

Example:

```text
300 kg Cherry Lot A
        ↓
      SPLIT
   ┌────┼────┐
   │    │    │
Treatment A
Treatment B
Control
```

Later:

```text
Treatment A
      ↓
Drying Lot
      ↓
Green Lot
      ↓
Sample
      ↓
Roast
      ↓
Cupping
```

Or:

```text
Lot A ──┐
        ├── Blend X
Lot B ──┘
```

The system should preserve ancestry.

Evaluate a proper lot genealogy model supporting:

- creation;
- transformation;
- split;
- merge;
- blend;
- loss;
- sample extraction;
- processing;
- movement;
- sale;
- disposal.

A user should be able to ask:

> Where did this sample come from?

and trace it backward.

Or:

> What did this cherry lot become?

and trace it forward.

---

# 11. MASS / QUANTITY BALANCE

Do not repeatedly overwrite one `weight` field.

Evaluate event-based quantity tracking.

Example:

```text
500 kg cherry received
↓
processing
↓
285 kg wet parchment
↓
drying
↓
92 kg dry parchment
↓
milling
↓
75 kg green coffee
↓
samples
↓
roasting
↓
sales
```

The system should be capable of tracking:

- input quantity;
- output quantity;
- process loss;
- samples removed;
- inventory adjustment;
- lot split;
- lot merge;
- transfers.

Do not imply scientifically exact mass balance where measurements are incomplete.

Preserve actual measurements and uncertainty.

---

# 12. PROCESSING WORKBENCH

An operator should be able to open a lot and work from one processing interface.

Example:

```text
LOT CB-026

Origin
Farm
Cultivar
Harvest

RECEIVING
Weight
Brix
Temperature
Condition

PROCESS
Method
Start
Equipment
Operators

FERMENTATION
Measurements
Interventions
Timeline

DRYING
Method
Measurements
Timeline

STORAGE
Location
Conditions

SAMPLES
Current samples

SENSORY
Latest results

RESEARCH
Related experiment

MEDIA
Photos / video

TASKS
Pending actions
```

This should become an operational workspace rather than a collection of disconnected forms.

---

# 13. FERMENTATION WORKBENCH

Fermentation should support structured time-series data.

Potential measurements:

- temperature;
- pH;
- Brix;
- pressure;
- dissolved oxygen when applicable;
- gravity where applicable;
- environmental temperature;
- relative humidity;
- other defined measurements.

Potential events:

- tank loaded;
- inoculation;
- ingredient/addition;
- agitation;
- purge;
- sampling;
- measurement;
- intervention;
- transfer;
- termination.

Potential context:

- vessel;
- volume;
- coffee mass;
- water;
- inoculum;
- microorganisms;
- protocol;
- operator;
- ambient environment.

Do not encode the entire process as text notes.

Preserve structured observations plus narrative notes.

---

# 14. PROTOCOLS

Evaluate reusable protocols.

Example:

```text
Protocol
↓
Protocol Version
↓
Execution
↓
Deviation
```

A processing protocol should not be silently modified after experiments have used it.

Historical executions should remain linked to the version actually used.

Support intentional deviations.

Example:

```text
Expected:
Ferment 48 h

Actual:
Stopped at 42 h

Reason:
Observed pH threshold / operator decision
```

Do not allow AI to rewrite historical protocol execution.

---

# 15. SENSOR / DATA LOGGER INTEGRATION

The architecture should be capable of receiving automated measurements later.

Potential sources:

- temperature logger;
- RH logger;
- Tilt or fermentation sensors;
- weather station;
- scale;
- moisture meter;
- water activity meter;
- other IoT equipment.

Do not require IoT integration for MVP.

Design measurement architecture so manual and automated measurements can coexist.

Every measurement should preserve:

```text
value
unit
timestamp
source
device
operator when manual
quality/context
```

---

# 16. DRYING MANAGEMENT

Drying is a distinct operational stage.

Potential records:

- drying method;
- drying location;
- African bed;
- patio;
- greenhouse;
- mechanical dryer;
- layer depth;
- start weight;
- moisture;
- water activity;
- ambient temperature;
- RH;
- turning events;
- cover/uncover events;
- rain events;
- daily observations;
- duration;
- final weight;
- final moisture;
- final water activity.

Drying data should be visualizable as a timeline.

---

# 17. STORAGE MANAGEMENT

Green coffee quality continues evolving after drying.

Potential records:

```text
StorageLot
StorageLocation
StorageEvent
StorageMeasurement
```

Possible information:

- bag/container;
- packaging;
- warehouse;
- physical position;
- temperature;
- RH;
- moisture;
- water activity;
- weight;
- storage age;
- movement;
- sample extraction.

The system should preserve storage history rather than only current location.

---

# 18. INVENTORY

Inventory must understand lot identity and genealogy.

Potential inventory domains:

- cherry;
- parchment;
- green coffee;
- roasted coffee;
- honey;
- cacao;
- ingredients;
- beverages;
- packaging;
- finished products;
- samples.

However, do not automatically build a complete warehouse-management system.

Determine the minimum inventory architecture required for:

traceability
operations
commerce
samples
research

---

# 19. SAMPLE MANAGEMENT

Samples are critical.

Potential sample types:

- cherry;
- fermentation;
- parchment;
- green coffee;
- roasted coffee;
- brewed coffee;
- honey;
- beverage;
- laboratory;
- sensory sample.

A Sample should retain provenance to its source lot/process/project.

Support:

- sample creation;
- sample code;
- blind code;
- quantity;
- storage;
- transfer;
- analysis;
- sensory use;
- depletion/disposal.

---

# 20. SENSORY OS

Sensory evaluation should be treated as a major professional system.

Domains may include:

- specialty coffee;
- honey;
- beer;
- wine;
- mead;
- specialty liqueurs;
- spirits;
- other products.

Potential modes:

```text
QUALITY CONTROL
RESEARCH
COMPETITION
DESCRIPTIVE ANALYSIS
HEDONIC / CONSUMER
TRAINING
CALIBRATION
PRODUCT DEVELOPMENT
```

Do not force all domains into one identical scoring form.

Use shared sensory architecture with domain-specific protocols.

---

# 21. COFFEE CUPPING

Coffee cupping should support professional workflows.

Potential session structure:

```text
CuppingSession
        ↓
Samples
        ↓
Blind Codes
        ↓
Assessors
        ↓
Protocol
        ↓
Individual Assessments
        ↓
Descriptors
        ↓
Intensity
        ↓
Scores
        ↓
Defects
        ↓
Notes
        ↓
Aggregation
        ↓
Analysis
```

The system should support protocol versioning.

Do not hardcode one scoring standard into the entire Sensory OS.

---

# 22. SENSORY DESCRIPTORS

Evaluate a structured sensory vocabulary.

Possible architecture:

```text
Descriptor
Category
Parent Descriptor
Synonym
Language
Domain
Reference
```

Example:

```text
Fruit
 ├─ Citrus
 │   ├─ Lemon
 │   └─ Orange
 └─ Tropical
     ├─ Mango
     └─ Pineapple
```

Allow controlled vocabulary plus free observations where appropriate.

Preserve what the assessor actually entered.

---

# 23. BLIND EVALUATION

Blind integrity is critical.

The system must support:

- randomized codes;
- restricted sample identity;
- role-based reveal;
- session locking;
- controlled result reveal;
- competition rules;
- audit trail.

A judge should not be able to discover information through another API endpoint, UI component or AI assistant that the sensory interface intentionally hides.

Authorization must exist at the data layer, not only the frontend.

---

# 24. COMPETITION MODE

Evaluate competition support for:

- specialty coffee;
- honey;
- beer;
- wine;
- mead;
- specialty liqueurs / spirits.

Potential concepts:

```text
Competition
Category
Flight
Entry
Judge
HeadJudge
ScoreSheet
Result
Award
```

Do not build competition management unless it can reuse Sensory OS primitives cleanly.

---

# 25. PANEL ANALYTICS

Potential analysis:

- mean;
- median;
- dispersion;
- assessor agreement;
- descriptor frequency;
- intensity distribution;
- sample comparison;
- repeated evaluation;
- temporal sensory evolution.

Advanced statistics should be introduced only where scientifically appropriate.

Do not generate meaningless analytics simply because data exists.

---

# 26. PROCESS → SENSORY CONNECTION

This is a core differentiator.

A user should eventually be able to explore:

```text
HARVEST
↓
PROCESS
↓
FERMENTATION
↓
DRYING
↓
STORAGE
↓
ROAST
↓
CUPPING
↓
SENSORY
```

Potential questions:

> How did these three processing treatments compare sensorially?

> Which fermentation conditions occurred in lots later described as highly floral?

> How did this lot change after three months of storage?

AI may identify patterns.

It must not imply causality without evidence.

---

# 27. DATA ANALYSIS WORKBENCH

Professional users need more than dashboards.

Explore an analysis workspace capable of selecting:

```text
Projects
Lots
Treatments
Samples
Measurements
Sensory Sessions
Time Ranges
Locations
```

and producing comparisons.

Potential analysis types:

- time-series;
- treatment comparison;
- process comparison;
- sensory comparison;
- environmental comparison;
- lot evolution;
- harvest comparison;
- storage evolution.

Allow data export when permissions permit.

---

# 28. VISUALIZATION

Potential reusable visualization components:

- line charts;
- scatter plots;
- distributions;
- timelines;
- sensory radar;
- descriptor maps;
- process traces;
- lot genealogy;
- Sankey-like transformation views;
- maps;
- environmental overlays;
- comparison tables.

Every technical visualization should preserve:

- units;
- source;
- sample/lot identity;
- date/time;
- provenance;
- uncertainty/quality where relevant.

---

# 29. REPORTING ENGINE

Reports should be reproducible views of canonical data.

Do not make reports isolated documents manually disconnected from the database.

Potential report types:

## LOT REPORT

- origin;
- harvest;
- process;
- fermentation;
- drying;
- storage;
- sensory;
- media;
- traceability;
- observations.

## EXPERIMENT REPORT

- question;
- hypothesis;
- treatments;
- methods;
- measurements;
- environment;
- sensory;
- analysis;
- limitations;
- conclusions.

## FARM REPORT

- production;
- lots;
- processing;
- quality;
- environment;
- sensory trends;
- observations;
- recommendations.

## CONSULTING REPORT

- client;
- objective;
- assessment;
- evidence;
- findings;
- recommendations;
- action plan;
- follow-up.

## SENSORY REPORT

- session;
- protocol;
- samples;
- panel;
- results;
- descriptors;
- variability;
- conclusions where appropriate.

Reports may later render to:

- web;
- PDF;
- client portal;
- downloadable data.

---

# 30. REPORT VERSIONING

Published reports should be versioned.

Potential:

```text
Report
ReportVersion
ReportSection
ReportPublication
```

A historical client report should not change because underlying data was later corrected.

A new report version should be generated.

---

# 31. RECOMMENDATIONS

Consulting recommendations should be structured objects where useful.

Potential:

```text
Recommendation
Evidence
Priority
Owner
DueDate
Status
FollowUp
Outcome
```

This allows a consulting report to become operational.

Example:

```text
Recommendation
↓
Client accepts
↓
Task
↓
Implementation
↓
Follow-up observation
↓
Outcome
```

---

# 32. CLIENT PORTAL

Evaluate a client-facing portal.

A consulting client might see:

```text
PROJECT
STATUS

FARMS

LOTS

RECENT DATA

SENSORY

REPORTS

RECOMMENDATIONS

TASKS

UPCOMING VISITS

DOCUMENTS
```

Only authorized data should be visible.

Do not expose internal research notes or unrelated Néctar Nómada information.

---

# 33. PRODUCER / PARTNER PORTAL

Implementation partners may need operational access.

Potential permissions:

- create field records;
- update lot data;
- record fermentation;
- record drying;
- upload media;
- view assigned projects;
- view recommendations;
- submit sensory data;
- access reports.

Permissions should be organization/project scoped.

Avoid global roles that accidentally expose unrelated clients.

---

# 34. PROFESSIONAL SAAS POSSIBILITY

Do not assume this must be commercialized immediately.

But design architecture so Néctar Nómada could eventually offer professional access.

Potential product:

**Néctar Nómada Coffee Tools**

Possible modules:

- farm management;
- lot traceability;
- fermentation logging;
- drying;
- storage;
- cupping;
- sensory analysis;
- reporting;
- AI-assisted analysis.

Potential users:

- coffee producers;
- processors;
- consultants;
- laboratories;
- roasters;
- researchers.

Do not design billing/subscription complexity until product strategy requires it.

Avoid architectural decisions that make multi-organization professional access impossible later.

---

# 35. MULTI-TENANCY / ORGANIZATION BOUNDARIES

This requires careful review.

If professional tools are eventually used by multiple farms/clients:

```text
Organization A
  Projects
  Farms
  Lots
  Users

Organization B
  Projects
  Farms
  Lots
  Users
```

Néctar Nómada may have authorized access to both through consulting relationships.

Determine whether the existing architecture already supports organization-scoped ownership and permissions.

Do not implement full SaaS multi-tenancy during this architecture phase.

Identify what must be true now to avoid a painful migration later.

---

# 36. ROLE / PERMISSION MODEL

Potential actors:

- public user;
- customer;
- client;
- producer;
- farm operator;
- processor;
- consultant;
- researcher;
- sensory assessor;
- judge;
- head judge;
- content operator;
- project manager;
- organization administrator;
- Néctar Nómada administrator.

Avoid relying only on global roles.

Evaluate contextual permissions:

```text
User
→ Organization
→ Project
→ Role
→ Permissions
```

A person may have different roles in different projects.

---

# 37. TASKS & OPERATIONAL ACTIONS

Operational data should be capable of generating tasks.

Examples:

- measure pH;
- turn drying coffee;
- collect sample;
- schedule cupping;
- review sensory session;
- approve report;
- visit farm;
- follow up recommendation.

Tasks should connect to canonical objects.

Example:

```text
Task
→ Project
→ Lot
→ Fermentation
→ Operator
```

Do not build an unrelated generic task manager.

---

# 38. ALERTS

Potential alerts:

- missing measurement;
- fermentation checkpoint;
- drying measurement due;
- storage measurement due;
- sensory session incomplete;
- report awaiting approval;
- recommendation overdue;
- inventory discrepancy.

Alerts should be deterministic where possible.

AI suggestions should be clearly distinguishable from rule-based alerts.

---

# 39. OPERATOR DASHBOARD

The dashboard should answer:

WHAT IS HAPPENING?

WHAT NEEDS ATTENTION?

WHAT CHANGED?

WHAT SHOULD I DO NEXT?

Potential:

```text
ACTIVE FERMENTATIONS
5

DRYING LOTS
7

LOTS REQUIRING MEASUREMENT
2

SENSORY SESSIONS PENDING
3

CLIENT REPORTS DUE
2

FIELD VISITS THIS WEEK
4
```

Then AI may add contextual suggestions.

---

# 40. AI OPERATOR COPILOT

Eventually:

> Which lots need attention today?

> Compare this fermentation with previous Geisha lots.

> Prepare tomorrow's field visit briefing.

> Which samples are ready for cupping?

> What data is missing from Project X?

> Generate a draft client report from approved records.

> Show all recommendations still open for this farm.

The AI must operate through permission-aware tools.

It should cite or link to canonical records.

---

# 41. AI ANALYSIS

AI can assist with:

- data completeness;
- anomaly detection;
- pattern discovery;
- comparison suggestions;
- report drafting;
- research questions;
- operational summaries.

AI must distinguish:

```text
RECORDED FACT
CALCULATED RESULT
STATISTICAL RESULT
AI INTERPRETATION
AI RECOMMENDATION
```

Never silently merge them.

---

# 42. FORECASTING / PREDICTION

Do not build predictive models merely because data is available.

Potential future uses may include:

- drying duration estimation;
- quality-risk signals;
- harvest planning;
- sensory prediction;
- inventory forecasting.

These require sufficient validated historical data.

Classify as advanced/experimental unless evidence supports earlier use.

---

# 43. API / INTEGRATION ARCHITECTURE

Professional operations may eventually connect to:

- sensors;
- weather;
- external laboratories;
- payment systems;
- accounting;
- calendar;
- email;
- shipping;
- mapping;
- media systems.

Do not directly couple domain logic to external providers.

Use adapter boundaries where appropriate.

This architecture should remain compatible with the separate:

`EXTERNAL_DATA_ARCHITECTURE.md`

and:

`ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md`

Do not merge those documents during this phase.

Identify overlaps and interfaces.

---

# 44. MOBILE / FIELD UX

Field workflows must work well on phones.

Prioritize:

- fast entry;
- large controls;
- timestamp defaults;
- QR scanning;
- photo capture;
- offline draft;
- queued synchronization;
- minimal repeated entry;
- context-aware forms.

Example:

operator scans lot QR

→ lot opens

→ current stage recognized

→ likely next actions shown

→ measurement recorded.

Avoid desktop forms squeezed onto mobile screens.

---

# 45. QR IDENTIFICATION

Evaluate QR identifiers for:

- lots;
- samples;
- fermentation vessels;
- drying beds;
- storage bags;
- equipment;
- products.

QR should resolve canonical IDs.

Do not encode sensitive information directly in the QR payload.

---

# 46. AUDIT TRAIL

Professional data needs auditability.

Record important changes:

- who;
- what;
- when;
- previous value;
- new value;
- reason where appropriate.

Especially important for:

- measurements;
- lot genealogy;
- sensory scores;
- competition results;
- reports;
- research conclusions.

---

# 47. DATA CORRECTIONS

Scientific/operational records sometimes require correction.

Do not force users to preserve obvious entry errors forever.

Instead distinguish:

original entry
correction
corrected by
correction time
reason

Preserve auditability.

---

# 48. IMPORT / EXPORT

Professional users may already have spreadsheets.

Evaluate:

- CSV import;
- structured templates;
- validation;
- preview before import;
- duplicate detection;
- error reporting.

Export may include:

- CSV;
- XLSX;
- PDF reports;
- JSON/API later.

Do not create a system that traps client data.

---

# 49. DATA OWNERSHIP

Clarify ownership and access.

Potential distinctions:

- Néctar Nómada-owned data;
- client-owned data;
- jointly generated project data;
- public data;
- licensed external data.

Do not assume all consulting data can become public storytelling content.

Publication permissions must remain separate from operational access.

---

# 50. COMMERCE + TRACEABILITY

Physical products should be capable of connecting back to source lots.

Example:

```text
Coffee Product
↓
Roast Batch
↓
Green Lot
↓
Processing Lot
↓
Harvest
↓
Farm
```

A customer-facing QR experience can therefore use real traceability.

But internal/private data must be filtered before public presentation.

---

# 51. COMMERCE + INVENTORY

Determine how product inventory should relate to operational inventory.

Do not necessarily use the same inventory object for:

500 kg green coffee

and:

24 retail coffee bags.

But preserve lineage.

Example:

```text
Green Lot
↓
Roast Batch
↓
Packaging Batch
↓
Retail Inventory
↓
Order
```

---

# 52. EXPERIENCE COMMERCE

Tourism/experience booking requires different commercial semantics than products.

Potential:

```text
Experience
↓
Session / Date
↓
Capacity
↓
Reservation
↓
Participant
↓
Payment
↓
Attendance
↓
Follow-up
```

Do not force reservations into physical-product inventory logic.

---

# 53. SERVICE COMMERCE

Consulting/services may require:

```text
Service
↓
Inquiry
↓
Qualification
↓
Scope
↓
Quote
↓
Acceptance
↓
Project
↓
Deliverables
↓
Invoice
```

Do not force consulting into conventional checkout if a proposal workflow is more appropriate.

---

# 54. ANALYTICS

Distinguish:

## BUSINESS ANALYTICS

sales
bookings
services
clients
conversion

## OPERATIONAL ANALYTICS

lots
processing
inventory
tasks
production

## RESEARCH ANALYTICS

experiments
measurements
comparisons

## SENSORY ANALYTICS

samples
panels
descriptors
quality

## CONTENT / EXPERIENCE ANALYTICS

engagement
story interaction
media

These may share infrastructure but should not be conceptually mixed.

---

# 55. KEY BUSINESS QUESTION

The architecture should allow Néctar Nómada to answer:

> What value did this project create?

Potential dimensions:

- product;
- revenue;
- quality improvement;
- sensory outcome;
- research insight;
- producer value;
- operational improvement;
- content;
- tourism;
- education;
- relationship.

Do not reduce every project to financial ROI.

---

# 56. PRODUCT STRATEGY BOUNDARY

Claude should explicitly identify what Néctar Nómada should NOT build.

Examples may include:

- full accounting;
- payroll;
- generic HR;
- generic enterprise CRM;
- full warehouse ERP;
- generic project-management software;
- arbitrary IoT platform.

Prefer integrations where commodity software already solves the problem.

Build deeply where Néctar Nómada has differentiated domain knowledge.

---

# 57. REQUIRED ARCHITECTURE REVIEW

Before implementation:

1. read `CLAUDE.md`;
2. read this document completely;
3. inspect the existing repository;
4. inspect database/schema;
5. inspect existing commerce;
6. inspect existing Projects;
7. inspect Research OS;
8. inspect Sensory functionality;
9. inspect People/Organizations;
10. inspect Locations;
11. inspect Samples;
12. inspect Products/Experiences;
13. inspect permissions;
14. inspect reporting;
15. inspect current operator interfaces;
16. inspect relevant architecture documents.

Do not assume these capabilities are missing.

---

# 58. CREATE

Create:

`/docs/architecture/COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`

Do not implement production functionality during this phase.

---

# 59. REQUIRED DOCUMENT STRUCTURE

The architecture review should include:

## A. Executive Summary

How commerce, operations and professional tools should fit the current platform.

## B. Existing Repository State

What already exists.

## C. Capability Matrix

For every proposed capability classify:

```text
EXISTS
PARTIAL
MISSING
OVERLAPS EXISTING SYSTEM
FUTURE / OPTIONAL
NOT RECOMMENDED
```

## D. Domain Boundaries

Recommend boundaries for:

Commerce
CRM
Consulting
Farm Operations
Coffee Operations
Lot Genealogy
Fermentation
Drying
Storage
Inventory
Samples
Sensory
Research
Analytics
Reporting

## E. Canonical Data Model Impact

Identify which existing entities should be reused.

Identify genuinely necessary new entities.

Avoid duplication.

## F. Lot Genealogy Architecture

Design transformation, split, merge, blend and sampling lineage.

## G. Quantity / Inventory Architecture

Design event-based quantity tracking.

## H. Coffee Processing Architecture

Harvest → receiving → processing → fermentation → drying → storage.

## I. Measurement Architecture

Manual + automated time-series measurements.

## J. Protocol Architecture

Versioning and execution.

## K. Sensory OS Architecture

Cross-domain architecture plus coffee cupping.

## L. Blind / Competition Security

Authorization and reveal rules.

## M. Analytics Architecture

Operational, research and sensory analysis.

## N. Reporting Architecture

Reproducible reports from canonical data.

## O. Consulting Architecture

Inquiry → project → analysis → report → recommendation → follow-up.

## P. Commerce Architecture

Products, experiences, services and consulting.

## Q. Client / Producer Portal

Permissions and information architecture.

## R. Professional SaaS Readiness

What should be designed now versus deferred.

## S. Multi-Organization Architecture

Evaluate existing organization/project ownership.

## T. Operator Experience

Daily workflows and dashboards.

## U. AI Operator Copilot

Grounded, permission-aware assistance.

## V. Mobile / Offline Field Architecture

Operational field requirements.

## W. Integration Boundaries

Relationship to External Data and Adaptive Intelligence architecture.

## X. Implementation Phases

Classify:

FOUNDATIONAL
MVP
NEXT
ADVANCED
EXPERIMENTAL

## Y. First Vertical Slice

Compare at minimum:

1. Coffee lot genealogy + processing workbench
2. Fermentation logging
3. Coffee cupping / Sensory OS
4. Consulting project → report
5. Commerce → operational project

Recommend the first end-to-end slice.

## Z. Risks

Include:

- overbuilding;
- ERP creep;
- duplicated entities;
- permission leakage;
- bad lot lineage;
- unreliable quantity tracking;
- scientific integrity;
- sensory protocol integrity;
- offline synchronization;
- vendor lock-in;
- excessive complexity.

## AA. Decisions Requiring Product-Owner Approval

Only ask decisions that genuinely require product direction.

Do not ask questions that can be answered by inspecting the repository.

---

# 60. IMPORTANT CONSTRAINT

DO NOT IMPLEMENT YET.

During this phase:

- do not modify production code;
- do not create migrations;
- do not change the database schema;
- do not install dependencies;
- do not implement checkout;
- do not add payment providers;
- do not implement SaaS billing;
- do not implement sensors;
- do not build new interfaces.

Architecture review only.

After creating:

`/docs/architecture/COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`

report back with:

1. what relevant capabilities already exist;
2. the most important missing architectural pieces;
3. your recommended canonical model changes;
4. your recommended first vertical slice;
5. what should explicitly NOT be built yet;
6. overlaps or conflicts with existing architecture;
7. decisions requiring my approval.

Then stop and wait for approval.