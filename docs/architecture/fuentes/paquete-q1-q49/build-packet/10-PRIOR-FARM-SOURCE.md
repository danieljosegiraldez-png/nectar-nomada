# Compare Farm Management Software

PRIOR CONTEXT, NOT A NEW IMPLEMENTATION ORDER. Preserve existing concepts; reconcile this history against the current repository and later discovery decisions. Attachments and canvas artifacts mentioned inside this source are not necessarily present; no missing artifact is claimed to have been inspected. Historical vendor claims require current verification.


## T001

Source turn: `599f5003-80b5-485b-90fd-aea6066eceaf`


### User

I needI dfto study the best software for coffee farm management that best applies to specialty coffee work, including traceability, planning and reporting

### Historical assistant

Yes. I would treat this as a benchmark study for the farm-management layer of the Néctar Nómada platform, not simply as a search for software to purchase.

I reviewed the current landscape specifically against specialty-coffee requirements: farm/block management, agronomy, harvest, microlots, experimental processing, traceability, planning, labor/costs, quality, reporting, and eventual integration with your existing Samples/Projects/Locations/fermentation/sensory architecture.

A particularly relevant finding is that a 2026 peer-reviewed study was conducted on more than 820 coffee farms in Chiriquí, Panama, specifically around precision-agriculture management and specialty-coffee traceability. That gives us a useful local scientific benchmark rather than relying only on generic farm ERP systems. citeturn1search1

### The strongest platforms to study

| Platform | Farm operations | Specialty processing | Traceability | Planning | QC / sensory | Reporting | Best use |
|---|---:|---:|---:|---:|---:|---:|---|
| **Oak** | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★ | ★★★★½ | **Best overall model for our farm OS** |
| **Cropster Origin** | ★★½ | ★★★★★ | ★★★★★ | ★★★½ | ★★★★★ | ★★★★★ | Processing + QC + green coffee |
| **Cropin Grow** | ★★★★★ | ★★ | ★★★★ | ★★★★★ | ★ | ★★★★★ | Agronomy / precision agriculture |
| **Farmforce** | ★★★★ | ★★ | ★★★★★ | ★★★ | ★ | ★★★★★ | Supply-chain/compliance |
| **Dimitra Connected Coffee** | ★★★★ | ★★★ | ★★★★★ | ★★★½ | ★★ | ★★★★½ | Traceability/compliance/geospatial |
| **RedEarthOne** | ★★★ | ★★★★ | ★★★★★ | ★★★ | ★★★★ | ★★★★ | Microlot/provenance focus |

These ratings are my assessment of suitability for your use case, rather than scores published by the vendors.

## 1. Oak is the one I would study most closely

[Oak Coffee Estate Management](https://www.oak.farm/?utm_source=chatgpt.com)

Oak surprised me. It is considerably closer to what we have been discussing for Las Nubes than the more famous coffee platforms.

It models the **estate as an operating system**, rather than treating coffee primarily as inventory.

Its land model includes blocks, hierarchy, area, crop, secondary crops, varietal, plant count, spacing, planting date, replanting history, elevation, soil and shade. Importantly, those records connect to labor, harvest, costs and traceability. citeturn2search5

Then it adds daily operational planning:

**Farm → block → crop/variety → activity → worker → inputs/cost → harvest**

The Daily Planner has assignments, priorities, due times, checklists, attachments, comments, status and completion confirmation. citeturn2search0

This is directly applicable to Las Nubes:

> Block 04 → Catuai → fertilization → biochar treatment B → workers → labor hours → input quantity → cost → completion → subsequent harvest/yield/quality.

Where Oak becomes particularly interesting is its new specialty-coffee module. It tracks:

**plant/block → harvest → lot → processing → fermentation → transformations → green coffee → QC → sale**

It explicitly supports washed, natural, honey, anaerobic and custom experimental processes; fermentation variables such as temperature, pH and duration; unlimited custom parameters; lot splitting and merging; harvest workers; cupping; buyers; and traceability reports. citeturn2search8

That is extremely close to the architecture we've been defining independently.

For example:

```text
LAS NUBES
│
├── Block CA-04
│   ├── Catuai
│   ├── 620 plants
│   ├── 2019 planting
│   ├── 790–815 masl
│   └── Treatment: reactive biochar
│
├── Harvest
│   └── 2027-01-17
│       ├── 186 kg cherry
│       ├── workers
│       └── ripeness / Brix
│
└── LOT LN-27-017
    │
    ├── Split A → Washed
    ├── Split B → Black Honey
    └── Split C → Experimental
                     │
                     ├── fermentation
                     ├── pH curve
                     ├── temperature
                     ├── drying
                     └── storage
```

The lineage survives the split. That's essential for CryoBloom-type experimental work.

Oak also links activity records to cost analysis, including cost/activity, productivity by worker/group, seasonal activity patterns and block-level analysis. citeturn2search6 Its financial system then produces labor, expense, income and block-wise reporting. citeturn2search9

That's a very strong reference architecture.

---

## 2. Cropster Origin remains the benchmark for coffee quality

[Cropster Origin](https://www.cropster.com/packages/origin-pricing/?utm_source=chatgpt.com)

I would not use Cropster as the primary conceptual model for the **farm**, but I would absolutely use it as the reference for what happens after cherries start entering the specialty-coffee production system.

Cropster Origin understands:

**supplier → harvest → reception → batch → process/stages → lot building → milling → green inventory → sample → physical analysis → cupping → sale**

Its Origin documentation explicitly includes processes, batches, processing stages, coffee separation, lot building and milling. citeturn2search12

And its quality layer is much more mature than conventional farm-management software: moisture, density, screen size, defects, custom cupping descriptors, multiple cupping protocols, quality comparison, sample traceability and offline cupping. citeturn2search11turn1search10

It also already produces a Harvest Report covering origin, volumes, processing dates and seasonal production. citeturn2search15

So I see:

**Oak = reference for Farm OS**

**Cropster = reference for Coffee Production/QC OS**

That distinction matters.

---

## 3. Cropin is the agronomy benchmark

[Cropin Grow](https://www.cropin.com/cropin-grow-smartfarm-plus/?utm_source=chatgpt.com)

Cropin is less interesting for experimental specialty processing but substantially stronger in large-scale agronomy.

It supports geotagged plots, field records, crop health, input use, workflows, tasks, weather advisories, pest/disease alerts, dashboards and BI. citeturn0search3

Its coffee implementation adds satellite imagery, IoT, weather forecasting, yield estimation, irrigation advice and crop-health monitoring. citeturn0search6

This is therefore the platform I would study for the future Las Nubes:

**Field Intelligence layer**

```text
Weather
   ↓
Farm → Block → Plants
   ↑       ↑
Satellite  Sensors
   ↓       ↓
Disease / stress / irrigation / nutrition
             ↓
        Recommendations
             ↓
           Tasks
```

This is much closer to what we have discussed for NDVI/radar/weather/soil/data-loggers than Cropster.

---

## 4. Farmforce and Dimitra solve another problem

[Farmforce](https://farmforce.com/?utm_source=chatgpt.com)

Farmforce is strongest where the problem becomes:

**thousands of farmers → supplier verification → certification → compliance → traceability → export**

It provides field/farmer traceability, barcode-based supply-chain provenance, certification/auditing and sustainability monitoring. citeturn0search1

Likewise, [Dimitra Connected Coffee](https://dimitra.io/platform-overview/?utm_source=chatgpt.com) focuses on farm records, mapping, harvest/lot tracking, traceability and buyer/compliance documentation, with satellite and environmental/compliance capabilities layered above it. citeturn2search14

Those become much more relevant if Néctar Nómada eventually manages **networks of independent farms** rather than primarily individual estates.

---

# The Panama research changes one part of our design

The Chiriquí study is worth reading closely.

The researchers implemented their architecture across **820+ Panamanian coffee farms**, combining georeferenced farm information with sample provenance, mobile data collection and laboratory analysis. citeturn1search1

Critically, they argue for linking:

```text
Farm
 ↓
Geographic coordinates
 ↓
Plot
 ↓
Variety
 ↓
Sample
 ↓
Photographic evidence
 ↓
Laboratory analysis
 ↓
Quality / chemical fingerprint
```

They also designed for intermittent rural connectivity and data synchronization, rather than assuming permanent connectivity. citeturn1search1

That validates several parts of the architecture we've already been developing: Locations, Samples, Assets, provenance and environmental data should not be separate databases. They need stable relational identities.

---

# What I would build into our platform

The research suggests we should **not copy any single product**. The best architecture for your specialty-coffee work is essentially:

```text
                 NÉCTAR NÓMADA COFFEE OS

                         FARM
                          │
        ┌─────────────────┼──────────────────┐
        ↓                 ↓                  ↓
      BLOCK            PEOPLE             ASSETS
        │
        ↓
   PLANTING / CROP
 variety • age • spacing • shade • soil
        │
        ├──────────────→ AGRONOMY
        │                treatments
        │                nutrition
        │                biochar
        │                pruning
        │                disease
        │
        └──────────────→ HARVEST
                          │
                          ↓
                       CHERRY LOT
                          │
                    split / merge
                          │
                          ↓
                       PROCESS
                          │
             ┌────────────┼─────────────┐
             ↓            ↓             ↓
        FERMENTATION    DRYING       STORAGE
             │            │             │
             └────────────┴─────────────┘
                          ↓
                      GREEN LOT
                          │
                ┌─────────┼─────────┐
                ↓         ↓         ↓
             SAMPLE     QC       ROAST
                │
                ↓
             CUPPING
                │
                ↓
             REPORT
```

But there is one major addition I would make that none of these systems handles sufficiently for what you're doing:

**EXPERIMENT**

It should be a first-class entity.

So a CryoBloom or Las Nubes experiment isn't merely notes attached to a lot:

```text
Experiment
 ├── hypothesis
 ├── protocol
 ├── control
 ├── treatments
 ├── replicates
 ├── variables
 ├── observations
 ├── samples
 ├── sensory results
 ├── analytical results
 └── statistical analysis
```

And each experimental treatment points back to the exact coffee lineage.

That is where our system can become considerably more useful for specialty coffee R&D than conventional farm-management software.

## My current ranking for our project

For **Las Nubes / Néctar Nómada**, I would benchmark the systems in this order:

**1. Oak — Farm operations + specialty traceability**

**2. Cropster Origin — Processing + lots + QC + reporting**

**3. Cropin — Precision agronomy + geospatial + sensors + decision support**

**4. Chiriquí 2026 PAMS research — Panama-specific scientific traceability architecture**

**5. Dimitra — multi-producer/geospatial/compliance**

**6. Farmforce — scaled supplier network/compliance**

The key conclusion is therefore not "use Cropster." It's more interesting:

> **Oak + Cropster + Cropin are essentially three different thirds of the system we've been trying to define.**

Oak knows **how the farm operates**. Cropster knows **what specialty coffee becomes after harvest**. Cropin knows **what is happening agronomically and spatially to the crop**.

Our existing Néctar Nómada model already has a fourth dimension that none of those handles particularly well: **experimental research linking processing variables, fermentation, environmental observations, samples and sensory outcomes.**

I think the next useful step is to do a **feature-by-feature teardown of Oak, Cropster Origin and Cropin**—probably 100–150 individual capabilities—and map each one against our current V1/V2/V3 data model as `already implemented / partially implemented / missing / deliberately exclude`. That would give us a concrete specification to hand to Claude Code rather than simply adding farm-management features ad hoc.

## T002

Source turn: `33042135-a17f-4d24-9393-07bbcf365b5a`


### User

I agree, with all this in mind, build a prop to use to then give to claude code, whats next?

### Historical assistant

The immediate next step is to give Claude Code a **repository audit + architecture specification prompt**. It should not start building screens yet. First it must understand what your existing V1/V2 already supports, compare that against the farm-management architecture we just defined, and produce the implementation gap map.

Use this as the first prompt.

:::writing{variant="document" id="61427" title="Claude Code Prompt — Specialty Coffee Farm Management Architecture Audit"}
# Néctar Nómada — Specialty Coffee Farm Management Architecture Audit

You are working inside the existing Néctar Nómada platform repository.

The goal is to evolve the platform into a serious specialty-coffee farm, processing, traceability, research, planning, and reporting operating system.

Do **not** begin by creating new UI pages or blindly adding database models.

Your first task is to understand the existing architecture, audit the repository comprehensively, compare what exists against the target domain model described below, identify gaps and overlaps, and propose the safest implementation path.

## 1. Product Context

Néctar Nómada is not intended to become a generic farm ERP.

It is being designed around specialty agricultural production, especially coffee, with deep support for:

- farm and estate management
- specialty coffee production
- experimental processing
- fermentation
- drying
- traceability
- agronomy
- harvest management
- samples
- quality control
- sensory evaluation
- research experiments
- planning
- costs and labor
- reporting
- geographic and environmental data
- producer collaboration
- eventual IoT / weather / satellite integration

The system already has a canonical architecture centered around concepts such as:

- People
- Organizations
- Locations
- Projects
- Samples
- Assets

There are also existing modules related to coffee, fermentation, sensory analysis, products, experiences, projects, locations, organizations, weather, and traceability.

Preserve that architecture wherever possible.

Do not create duplicate domain concepts merely because the proposed model below uses different terminology.

---

# 2. Reference Systems

We have reviewed several current farm and coffee management platforms.

Use them as **conceptual benchmarks only**.

Do not copy proprietary code, workflows, schemas, UI, wording, or implementation.

### Oak

Useful reference for:

- estate management
- farm/block hierarchy
- planting information
- daily farm activities
- worker assignments
- labor tracking
- inputs
- costs
- harvest
- lot lineage
- specialty coffee processing
- fermentation
- lot splits and merges
- reporting

### Cropster Origin

Useful reference for:

- cherry reception
- batches
- lots
- processing stages
- green coffee inventory
- milling
- samples
- physical QC
- cupping
- quality history
- harvest reporting
- specialty coffee terminology

### Cropin

Useful reference for:

- agronomy
- field intelligence
- plot geolocation
- weather
- crop health
- satellite data
- tasks
- disease observations
- yield forecasting
- input recommendations

### Farmforce / Dimitra

Useful primarily for:

- multi-farm networks
- producer traceability
- compliance
- certifications
- supplier networks
- geospatial verification
- chain of custody

Néctar Nómada should eventually be capable of supporting multiple independent farms, but we should not introduce enterprise supply-chain complexity prematurely.

---

# 3. Core Architectural Principle

The fundamental coffee lineage should eventually be traceable as:

Farm  
→ Block  
→ Planting  
→ Harvest  
→ Cherry Lot  
→ Process  
→ Fermentation / Drying / Storage  
→ Green Lot  
→ Sample  
→ QC / Cupping  
→ Roast / Product / Sale

However, this must not necessarily be implemented as twelve isolated database tables.

First inspect the current schema and determine which existing entities already satisfy these concepts.

Reuse existing models wherever the semantics are correct.

---

# 4. Target Domain Model

Evaluate the existing codebase against the following conceptual domains.

## A. Farm

Represents the agricultural production estate.

Potential attributes:

- organization
- geographic location
- boundaries
- elevation range
- climate context
- total area
- planted area
- production areas
- infrastructure
- certifications
- ownership / management
- active crops

A Farm may already be representable using the existing `Location`, `Project`, and/or `Organization` architecture.

Do not create a `Farm` model automatically.

Determine the best canonical representation.

---

## B. Block / Plot

A defined agricultural production area inside a farm.

Potential data:

- identifier
- geometry / polygon
- area
- elevation
- slope
- orientation
- shade
- soil type
- irrigation
- planting density
- crop
- varietal composition
- plant count
- planting date
- replanting history

Blocks must remain historically stable because harvest provenance depends on them.

---

## C. Planting

Represents the biological planting state of a block.

Possible attributes:

- crop
- species
- cultivar / variety
- rootstock if applicable
- plant count
- spacing
- planting date
- plant age
- density
- mortality
- replacement history

Important:

A physical block may contain multiple cultivars or plant ages.

Therefore do not assume:

`Block = Variety`

The data model must support multiple planting cohorts inside the same block.

---

# 5. Agronomy

The platform should eventually capture activities such as:

- fertilization
- compost
- biochar
- microbial treatments
- pruning
- weed management
- pest management
- disease observations
- shade management
- irrigation
- soil amendments
- foliar applications
- plant replacement
- sampling
- soil testing
- leaf testing

An agronomic activity should potentially contain:

- farm
- block
- planting
- activity type
- date
- responsible person
- workers
- inputs
- quantity
- unit
- equipment
- cost
- observations
- attachments
- weather context
- completion status

Investigate whether the existing task/activity architecture can support this rather than creating a coffee-only duplicate.

---

# 6. Farm Planning and Work Management

Evaluate support for:

- planned activities
- recurring activities
- assigned worker
- work crew
- priority
- due date
- status
- dependencies
- expected labor
- actual labor
- expected input use
- actual input use
- cost
- completion evidence
- notes
- attachments

The system should eventually answer questions such as:

- What must be done this week?
- Which blocks require pruning?
- Which treatments are overdue?
- What labor was spent on Block A?
- What did fertilization cost per hectare?
- Which agronomic treatments correlate with yield or quality?

---

# 7. Harvest

Harvest should connect agricultural provenance to coffee processing.

Potential structure:

Harvest Event

- farm
- block(s)
- planting(s)
- date
- cultivar(s)
- workers
- cherry weight
- ripeness
- Brix
- cherry condition
- collection method
- field observations

One harvest event may create one or more processing lots.

---

# 8. Coffee Lot Traceability

This is critical.

The system must eventually support **lot lineage as a graph**, not simply parent-child ownership.

Required future operations include:

### Split

One cherry lot becomes:

- Washed
- Honey
- Natural
- Experimental

### Merge

Multiple compatible lots may become one combined lot.

### Transformation

Coffee changes state:

Cherry  
→ depulped coffee  
→ parchment  
→ dried parchment  
→ green coffee  
→ roasted coffee

Traceability must preserve lineage across these changes.

Determine how the current Sample / Lot / Batch / Process architecture works and whether a generic lineage model already exists.

Do not create another competing lot system unless absolutely necessary.

---

# 9. Coffee Processing

The process architecture must support both traditional and experimental workflows.

Examples:

- washed
- natural
- honey
- black honey
- anaerobic
- carbonic maceration
- submerged fermentation
- yeast inoculation
- LAB inoculation
- thermal treatments
- cold fermentation
- CryoBloom-type protocols
- combinations or custom protocols

Avoid hardcoding coffee processing into a rigid enum if the current system already supports configurable process definitions.

A process may contain stages.

Example:

Reception  
→ flotation  
→ sorting  
→ depulping  
→ fermentation  
→ washing  
→ drying  
→ conditioning  
→ storage

---

# 10. Fermentation

This is one of the platform's most important differentiators.

Evaluate current fermentation architecture carefully before changing anything.

Possible measurements include:

- start/end
- temperature
- pH
- Brix
- dissolved oxygen
- pressure
- CO₂
- inoculation
- microbial culture
- dosage
- water quantity
- coffee quantity
- tank
- ambient temperature
- agitation
- gas management
- sensory observations

Time-series readings must eventually support:

- manual readings
- Tilt
- data loggers
- IoT
- imported CSV
- APIs

Avoid baking individual sensor brands into the core domain model.

---

# 11. Drying

Potential data:

- method
- African beds
- patio
- mechanical dryer
- greenhouse
- solar dryer
- layer depth
- coffee mass
- moisture
- water activity
- temperature
- humidity
- turning frequency
- start/end date
- drying duration
- final moisture

Drying may involve several stages or locations.

---

# 12. Storage

Support provenance after drying.

Potential concepts:

- warehouse
- room
- shelf
- bag
- GrainPro
- vacuum
- barrel
- freezer
- cold storage
- storage temperature
- RH
- entry date
- exit date
- quantity remaining

Inventory and traceability should remain connected.

---

# 13. Green Coffee

The system should ultimately know:

- originating lot(s)
- current quantity
- physical location
- moisture
- water activity
- density
- screen size
- defects
- grade
- harvest
- cultivar
- process
- producer
- farm
- storage
- samples
- sensory results

---

# 14. Samples

Samples are already a canonical concept in Néctar Nómada.

Protect this architecture.

Samples should be capable of referencing:

- cherry
- fermenting material
- parchment
- green coffee
- roasted coffee
- soil
- leaves
- water
- microbial cultures
- honey
- fermentation media
- other agricultural products

Do not create coffee-only sample infrastructure if the current generic Sample model can accommodate the use case.

---

# 15. Quality Control

Evaluate existing capabilities for:

### Physical QC

- moisture
- water activity
- density
- screen size
- defect count
- color
- mass

### Sensory

- cupping
- SCA-based protocols
- hedonic evaluation
- custom research protocols
- descriptive sensory
- panelists
- blind samples
- replicates
- score aggregation

Quality results must remain attached to the correct Sample and Lot lineage.

---

# 16. EXPERIMENT — First-Class Domain

This is a major strategic requirement.

Néctar Nómada must treat research experiments as something more sophisticated than notes attached to a batch.

An Experiment should conceptually support:

- title
- objective
- hypothesis
- research question
- farm
- project
- researcher(s)
- protocol
- control
- treatment groups
- replicates
- independent variables
- dependent variables
- controlled variables
- observations
- samples
- measurements
- sensory results
- analytical results
- attachments
- conclusions
- status
- dates
- version history

Potential hierarchy:

Experiment  
→ Treatment  
→ Replicate  
→ Sample  
→ Observation / Measurement

The architecture must allow experiments such as:

- yeast vs spontaneous fermentation
- fermentation temperature treatments
- biochar treatments
- different drying methods
- different storage conditions
- cultivar × treatment studies
- coffee plant nutrition experiments
- CryoBloom experiments

Do not implement this yet unless the existing system clearly lacks it and the schema proposal has been approved.

First audit the current research/experiment architecture.

---

# 17. Environmental Data

Eventually support:

- weather
- rainfall
- temperature
- RH
- solar radiation
- soil moisture
- soil temperature
- wind
- forecast
- historic weather
- satellite imagery
- NDVI
- radar
- thermal imagery

Environmental observations should be associated with:

- location
- block
- timestamp

Do not duplicate existing weather/location infrastructure.

---

# 18. Reporting

The reporting architecture should eventually be capable of producing:

### Farm reports

- planted area
- cultivar distribution
- plant age
- agronomic activities
- labor
- inputs
- costs

### Harvest reports

- cherry volume
- yield/block
- cultivar
- picking dates
- harvest workers

### Production reports

- process volumes
- conversion ratios
- fermentation
- drying
- losses
- lot inventory

### Quality reports

- physical QC
- sensory
- lot comparisons
- treatment comparisons

### Experimental reports

- treatments
- replicates
- measurements
- statistics
- sensory outcomes

### Traceability reports

Farm  
→ block  
→ harvest  
→ lot  
→ processing  
→ storage  
→ sample  
→ quality  
→ product

Reporting should use normalized underlying data.

Avoid storing duplicate calculated values unless necessary for performance.

---

# 19. Offline / Field Operation

Coffee farms often have unreliable connectivity.

Evaluate how easily the existing architecture could eventually support:

- mobile-first workflows
- offline data capture
- synchronization
- queued events
- conflict handling

Do not implement offline mode during this audit.

Identify architectural constraints that would make it difficult later.

---

# 20. Permissions

Farm data may belong to multiple organizations.

Evaluate whether existing authorization can eventually represent:

- owner
- farm manager
- agronomist
- field worker
- processor
- researcher
- sensory evaluator
- roaster
- buyer
- public visitor

The same entity may have:

- private operational data
- partner-visible data
- public provenance data

Preserve the existing classification/privacy architecture.

---

# 21. Auditability

Important operational records should eventually support:

- who created it
- who modified it
- timestamp
- source
- import provenance
- previous value / change history where appropriate

Investigate current audit infrastructure.

---

# 22. Your Assignment

Perform a repository-wide audit.

Start by inspecting:

- Prisma schema
- migrations
- domain services
- API routes
- server actions
- TypeScript types
- validation schemas
- forms
- dashboards
- reporting
- permissions
- classifications
- locations
- organizations
- projects
- samples
- fermentation
- sensory
- weather
- inventory
- existing coffee models
- test coverage

Search comprehensively.

Do not assume a feature does not exist merely because its name differs.

---

# 23. Produce a Capability Matrix

For every major capability described above classify it as:

### EXISTING

Current architecture already supports it correctly.

### PARTIAL

Some infrastructure exists but requires extension.

### MISSING

No meaningful implementation exists.

### DUPLICATE RISK

A proposed feature overlaps significantly with an existing domain concept.

### DEFER

Useful, but not appropriate for the current implementation phase.

For each row provide:

- capability
- current implementation
- relevant model/files
- status
- gap
- recommended action
- migration risk
- priority

---

# 24. Produce a Domain Mapping

Map these conceptual terms against the existing canonical models:

Farm  
Block  
Planting  
Agronomic Activity  
Task  
Harvest  
Cherry Lot  
Process  
Process Stage  
Fermentation  
Drying  
Storage  
Green Lot  
Sample  
QC  
Cupping  
Experiment  
Treatment  
Replicate  
Observation  
Measurement  
Weather Observation

Example:

| Concept | Existing representation | Recommendation |
|---|---|---|
| Farm | Location + Project + Organization | Reuse existing composition |
| Sample | Sample | Keep canonical |
| ... | ... | ... |

Do not force a one-model-per-concept architecture.

---

# 25. Traceability Review

Explicitly determine whether the current schema can support:

### one-to-many split

Lot A  
→ Lot B  
→ Lot C

### many-to-one merge

Lot A + Lot B  
→ Lot C

### multi-step transformation

Cherry  
→ parchment  
→ green  
→ roasted

If not, propose a generic lineage architecture.

Prefer something conceptually similar to:

`EntityTransformation`

or

`LotLineage`

with relationships between source and destination entities.

Do not implement until you have evaluated the existing model.

---

# 26. Experiment Architecture Review

Determine whether current Projects, Samples, Measurements, Protocols, or other models already support experimental research.

If not, propose the minimum normalized schema required for:

Experiment  
→ Treatment  
→ Replicate  
→ Sample  
→ Measurement

Avoid overengineering.

---

# 27. Reporting Architecture Review

Determine whether reporting currently relies on:

- database queries
- stored summaries
- analytics tables
- view models
- materialized data
- API aggregation

Recommend how farm and coffee reporting should integrate with the existing system.

---

# 28. Recommended Implementation Phases

After the audit, propose phases.

A likely structure is:

## Phase A — Canonical Farm Foundation

- farm/block mapping
- planting cohorts
- agronomic activities
- farm tasks

## Phase B — Harvest + Lot Lineage

- harvest events
- lot provenance
- split
- merge
- transformation

## Phase C — Coffee Processing

- process stages
- fermentation
- drying
- storage

## Phase D — Quality

- green QC
- samples
- cupping
- quality history

## Phase E — Experimental Research

- experiment
- treatment
- replicate
- measurement

## Phase F — Planning / Economics

- workers
- labor
- inputs
- costs
- activity economics

## Phase G — Field Intelligence

- weather
- sensors
- satellite
- agronomic alerts

Do not assume this order is correct.

Recommend changes based on the actual repository.

---

# 29. Critical Engineering Constraints

Maintain:

- existing canonical entity architecture
- organization ownership
- classification/privacy controls
- public/private separation
- nullable relationships where appropriate
- backward compatibility
- existing URLs where possible
- current production data
- existing tests
- TypeScript safety
- Prisma referential integrity
- internationalization
- existing Discover/public architecture

Avoid:

- premature microservices
- duplicate farm/location models
- duplicate sample systems
- duplicate people/users
- hardcoded coffee-specific logic where generic agricultural infrastructure already works
- massive schema rewrites
- destructive migrations
- large UI builds before the information architecture is stable

---

# 30. Validation

Before recommending implementation changes run:

- Prisma validation
- TypeScript typecheck
- lint
- tests
- production build

Report pre-existing failures separately from failures caused by proposed changes.

For this first pass, do not modify production code unless a trivial correction is necessary to perform the audit.

---

# 31. Final Deliverable

Return:

## 1. Executive Summary

What already exists and how close the current platform is to the target.

## 2. Current Architecture

Describe the actual relevant architecture discovered in the repository.

## 3. Capability Matrix

Existing / Partial / Missing / Duplicate Risk / Defer.

## 4. Domain Mapping

Proposed conceptual coffee/farm entities mapped against current canonical models.

## 5. Schema Gaps

Only genuine missing concepts.

## 6. Traceability Assessment

Especially splits, merges, and transformations.

## 7. Experiment Architecture Assessment

How research should integrate with existing Samples and Projects.

## 8. Reporting Assessment

How farm/coffee analytics should work.

## 9. Permissions / Classification Assessment

How internal, partner, and public data should be separated.

## 10. Recommended Ar


**SOURCE GAP: This historical assistant message was truncated at the retrieval limit. Its remaining text was not reviewed. Reconcile with the original conversation or Claude’s existing context.**


## T003

Source turn: `4eef568c-c2f9-48c6-b78d-78e22d3e4fca`


### User

how aboht as a new software, application n phone as we want to work as an operator without data services or wifi and be functional and then link up when you can or needed

### Historical assistant

Yes. For your use case, I would change the product definition from “web platform with mobile support” to an **offline-first field operating system**.

That means the phone application must be fully useful with zero data service and zero Wi-Fi. Connectivity becomes a synchronization opportunity, not a requirement.

The core rule should be:

> The operator works against a local database on the phone. The cloud is a synchronized copy and coordination layer.

That is materially different from most farm-management apps.

For Néctar Nómada, I would design it as three coordinated applications rather than one responsive website:

1. **Field Operator App — phone-first, offline-first**
2. **Web Management Console — planning, configuration, analytics, reporting**
3. **Sync/API layer — reconciliation between devices and cloud**

The operator app should be able to do all of these while completely offline:

- identify farm, block and planting
- see assigned work
- create agronomy records
- record labor
- record inputs
- harvest coffee
- create cherry lots
- scan or generate QR codes
- start processing lots
- record fermentation readings
- record pH, Brix, temperature and observations
- take photographs
- record drying observations
- record moisture / Aw
- transfer coffee between locations
- collect samples
- create field observations
- complete checklists
- record GPS coordinates
- record timestamps
- attach operator identity
- save signatures or confirmations
- view recently synchronized farm data
- view SOPs and protocols
- continue experiments already downloaded to the phone

Nothing in those workflows should depend on calling the server.

A basic architecture would be:

```text
                     CLOUD
                         │
              PostgreSQL / API
                         │
                 Sync Engine
                    ↕       ↕
             Phone A       Phone B
                │             │
          Local SQLite   Local SQLite
                │             │
          Operator UI    Operator UI
```

The phone should therefore contain a real local relational database, not just browser cache.

I would strongly favor:

**React Native + Expo + SQLite** for the field app.

That keeps you close to your existing TypeScript/Next.js ecosystem while giving proper device capabilities:

- camera
- GPS
- local files
- QR/barcode scanning
- Bluetooth later
- notifications
- background sync where supported
- proper SQLite
- Android and iOS
- eventual BLE sensor integration

I would not make a PWA the primary operator application. A PWA can be useful as a secondary lightweight interface, but for remote farms, sensors, long offline periods, photographs, background operations and local database reliability, native/mobile is the stronger design.

The local architecture becomes something like:

```text
Mobile App

UI
│
├── Today
├── Farm
├── Blocks
├── Harvest
├── Lots
├── Processing
├── Fermentation
├── Drying
├── Samples
├── Experiments
└── Sync

        ↓

Local Application Services

        ↓

SQLite
│
├── cached master data
├── operational records
├── pending mutations
├── measurements
├── attachments metadata
└── sync state

        ↓

Sync Queue
│
├── CREATE
├── UPDATE
├── DELETE
├── ATTACHMENT
└── ACKNOWLEDGE
```

The critical design decision is the **sync queue**.

Every offline action should be stored locally first.

For example, Danny records:

```text
pH = 3.62
Lot = LN-27-014
Fermentation = F-003
Time = 14:26
```

The application immediately writes:

```text
measurement_id
fermentation_id
type = pH
value = 3.62
unit = pH
recorded_at = device timestamp
recorded_by = operator
device_id
sync_status = PENDING
```

The operator gets an immediate success state.

No server call is necessary.

Later:

```text
Internet detected
       ↓
Sync queue starts
       ↓
Server receives record
       ↓
Server validates permission + version
       ↓
Server stores record
       ↓
Phone receives ACK
       ↓
sync_status = SYNCED
```

This should apply to almost every field operation.

The second important principle is that each important object needs a **globally unique ID generated on-device**.

Do not wait for PostgreSQL to create sequential IDs.

Use something like UUIDv7 or another sortable globally unique identifier.

That means two phones can independently create records offline without collisions.

For example:

```text
Phone A creates:
Harvest 019c...

Phone B creates:
Harvest 019d...
```

When both reconnect, the records can coexist.

For your application, I would also make synchronization **selective** rather than downloading the whole database.

Before traveling to Las Nubes, for example, an operator could select:

```text
Download for offline use

☑ Las Nubes
  ☑ Blocks
  ☑ Plantings
  ☑ Current harvest
  ☑ Open lots
  ☑ Current experiments
  ☑ SOPs
  ☑ Tasks
  ☑ Last 30 days measurements
```

That creates a local operational package.

Then you can remain offline for hours or days.

This also matters as the system expands to several farms.

A worker at Las Nubes does not need Kiva Estate, Cafelino, honey operations, brewery production and every experiment stored on their phone.

There is another distinction I would make in the data model:

```text
REFERENCE DATA
Downloaded from cloud

OPERATIONAL DATA
Created or edited locally

MEDIA
Queued separately

TIME-SERIES DATA
Optimized for bulk synchronization
```

Photographs deserve their own synchronization behavior. A phone may have a weak signal sufficient to synchronize text records but not 150 MB of photographs.

So synchronization might show:

```text
SYNC STATUS

Records
✓ 184 / 184

Measurements
✓ 426 / 426

Photos
↑ 7 / 38

2.3 MB remaining records
148 MB media pending
```

And you can configure:

**Sync records over cellular; media only over Wi-Fi.**

That would be useful in Panama.

The operator experience should also be very different from the management web interface.

A field worker should not see a miniature ERP.

The home screen could look conceptually like:

```text
LAS NUBES
Thursday 27 August

Offline ●
Last sync: yesterday 18:42

TODAY

3 Tasks
2 Lots in fermentation
1 Drying check due
4 Harvest blocks active

[ Scan QR ]

[ Record Harvest ]

[ Measurement ]

[ Field Activity ]
```

If someone scans the QR on a fermenter:

```text
LN-26-CAT-041
Black Honey

FERMENTATION
22h 14m

Last readings

pH       3.74
Temp     23.6°C
Brix     11.2

[ + Reading ]

[ Observation ]

[ Photo ]
```

That is the kind of operator interface I would target.

The system should also make **QR identity fundamental**.

Physical objects can carry IDs:

```text
Block
Harvest container
Cherry lot
Fermenter
Drying bed
Bag
Sample
Storage bin
Roasted lot
```

Scanning the physical tag should open its locally cached record even with no internet.

Later Bluetooth/NFC could complement QR.

For experiments, offline operation becomes even more valuable.

Imagine a CryoBloom experimental protocol:

```text
EXP-027
Cold fermentation — Catuai

Treatment B
Replicate 2

Next observation
14:30

Required:
□ pH
□ temperature
□ Brix
□ aroma observation
□ photograph
```

The phone becomes a protocol execution instrument, not just a notebook.

It can also warn locally:

```text
Reading overdue: 18 min
```

because schedules are already downloaded.

No cloud is needed to determine that.

There is one architecture issue Claude should treat very seriously: **conflicts**.

Suppose Danny changes a lot's storage location offline while another operator changes the same record.

Not every conflict should be solved with “last write wins.”

I would establish three classes:

```text
APPEND-ONLY
Measurements
Observations
Photos
Activity logs

Normally no conflict.


CONTROLLED UPDATE
Lot status
Storage location
Task status

Version checking required.


CRITICAL
Lot merge
Lot split
Inventory adjustment
Ownership/classification

Explicit conflict handling.
```

That is much safer.

And for scientific work, I would make measurements and observations essentially immutable after synchronization. Corrections should create:

```text
original measurement
        ↓
correction record
        ↓
reason
operator
timestamp
```

rather than silently replacing scientific data.

This becomes particularly important if Néctar Nómada is eventually used for published experiments, quality claims or producer reports.

So I would slightly change the plan we just prepared for Claude.

Before building the farm layer, we should add an architectural requirement:

> **Every new operational coffee/farm module must be designed to be synchronizable and executable offline.**

That means server-only assumptions are an architectural defect.

The target architecture becomes:

```text
                     NÉCTAR NÓMADA

                         CLOUD
              ┌────────────┴────────────┐
              │                         │
        Management Web              API / Sync
        Next.js                         │
              │                         │
          PostgreSQL                Sync Engine
                                        │
                       ┌────────────────┼────────────────┐
                       ↓                ↓                ↓
                   Operator A       Operator B       Researcher
                    Mobile           Mobile           Mobile
                       │                │                │
                    SQLite           SQLite           SQLite
```

Then later:

```text
Tilt
Data logger
Weather station
Bluetooth meter
Scale
Temperature probe
        ↓
Operator Phone
        ↓
Local DB
        ↓
Cloud when connected
```

That last part is particularly powerful because the **phone can become the field gateway**.

A BLE temperature logger does not itself need internet. It can synchronize with the operator's phone; the phone stores the data locally; days later the phone uploads it to Néctar Nómada.

That would fit the type of farm and fermentation work you're building substantially better than requiring every sensor to have Wi-Fi.

So I would now amend our Claude Code specification before Phase A with four non-negotiable architectural constraints:

- **offline-first mobile operator application**
- **local SQLite as operational source while offline**
- **UUID-based distributed identity + explicit sync state**
- **sync-safe domain design for every new farm/coffee entity**

Then, before Claude writes the first farm feature, I would have it design the **offline/synchronization contract** alongside the canonical Farm → Block → Planting architecture.

That avoids a very expensive mistake: building the entire system as conventional online CRUD and later trying to retrofit offline operation.

## T004

Source turn: `c81eac0a-8651-4036-936d-bdeb726da604`


### User

the important thing is that we are working with places with dificult access and we want the hardware to be able to support it with basic smart phones as the operators are limited economically and in places with lack of access and difficult weather and conditions

### Historical assistant

Exactly. That requirement should sit above almost every other product decision.

This is not merely an “offline mode.” The field application should be designed around the assumption that the operator may have:

- an inexpensive Android phone,
- 2–4 GB RAM,
- limited storage,
- older Android,
- no mobile data for hours or days,
- intermittent electricity,
- weak GPS,
- high humidity/rain,
- gloves or wet hands,
- poor lighting,
- limited technical training,
- and no ability to replace expensive hardware easily.

So I would redefine the target as a **low-resource, offline-first field application for difficult agricultural environments**.

### Hardware target

I would explicitly tell Claude that the application must be usable on a baseline device approximately like this:

| Constraint | Design target |
|---|---:|
| Platform | Android first |
| RAM | **2 GB minimum target** |
| Storage | 32 GB-class device |
| Free storage required | preferably <500 MB before photos |
| CPU | inexpensive 4–8 core ARM |
| Screen | ~5–6.5", 720p acceptable |
| Network | none required for normal operation |
| Camera | basic Android camera |
| GPS | basic phone GPS |
| NFC | not required |
| BLE | optional |
| Biometrics | not required |
| Android | support relatively old devices where practical |

I would not make iPhone parity a Phase 1 requirement. We can build iOS eventually, but the deployment reality makes **Android the primary field platform**.

### More importantly: the phone must never feel like a small version of the web ERP

The field UI should be extremely simple.

An operator should see things such as:

```text
FINCA LAS NUBES

SIN CONEXIÓN
Última sincronización: ayer

HOY

[ Cosecha ]

[ Actividad de campo ]

[ Medición ]

[ Escanear lote ]

3 tareas pendientes
```

Not twenty navigation menus.

For example, recording a harvest could be:

```text
COSECHA

Bloque
[ Catuai Norte ▼ ]

Peso
[ 42.5 ] kg

Madurez
[ Buena ▼ ]

Brix
[ 19.4 ]

[ FOTO ]

[ GUARDAR ]
```

Tap **Guardar** and it is finished.

No internet. No waiting spinner. No server dependency.

### SQLite becomes essential

I would keep the basic architecture:

```text
ANDROID PHONE

Simple UI
    ↓
Local application logic
    ↓
SQLite
    ↓
Sync queue
    ↓
Internet whenever available
    ↓
Cloud
```

The important distinction is:

> **SQLite is not a cache.**

While that operator is in the field, SQLite is the operational database.

The cloud might not hear about that harvest for three days.

That's acceptable.

### We should design for days offline, not minutes offline

I would establish something like:

**Design target: 7–14 days of complete field operation without connectivity.**

The phone should retain:

- assigned farm
- blocks
- plantings
- current harvest
- active lots
- current experiments
- tasks
- SOPs
- essential reference information
- recent history
- measurements
- photos
- pending changes

Then when it sees connectivity:

```text
NO INTERNET
Day 1
Day 2
Day 3
Day 4
        ↓

EDGE / 3G / Wi-Fi detected

        ↓

SYNC SMALL DATA FIRST

12 harvest records
86 measurements
24 activities
7 lots

        ↓

SYNC MEDIA LATER

173 photos
```

This becomes extremely important.

A 15 KB fermentation record is operationally much more important than a 7 MB photograph.

So sync priority should be:

```text
1. IDs / metadata
2. Critical transactions
3. Measurements
4. Activities
5. Inventory / lot states
6. Notes
7. Thumbnails
8. Full-resolution media
```

The operator can therefore get almost the entire database synchronized over a very poor cellular connection without waiting for photos.

### Images should be aggressively managed

Cheap phones will fill their storage quickly.

The app should therefore avoid preserving giant 12–20 MP images unnecessarily.

For ordinary documentation:

```text
Original camera image
        ↓
resize
        ↓
~1600–2000 px
        ↓
JPEG/WebP compression
        ↓
perhaps 300–700 KB
```

For technical documentation requiring greater detail we can explicitly flag:

**Keep high resolution**

But it should not be the default.

And the app should create small thumbnails locally.

That prevents something like 2,000 field photographs from turning into 15–20 GB.

### Battery needs to be treated like another scarce resource

This is easy to overlook.

We should avoid:

- constant GPS tracking,
- persistent background network requests,
- continuous Bluetooth scans,
- animated maps,
- video backgrounds,
- unnecessary polling,
- keeping the CPU awake,
- frequent automatic location acquisition.

Instead:

```text
Operator opens record
        ↓
Request GPS once
        ↓
Acquire position
        ↓
Store it
        ↓
GPS stops
```

Likewise for BLE.

Scan when the operator asks to connect a logger rather than continuously searching.

This matters when somebody needs the phone to survive an entire day and may not have reliable electricity.

### Maps also need an offline strategy

A normal Google Maps-style implementation would be inadequate.

We should eventually support an offline farm map package:

```text
LAS NUBES OFFLINE MAP

Farm boundary
Block polygons
Roads
Trails
Water
Buildings
Processing area
Sampling points
```

Once downloaded, those vectors remain on the phone.

GPS operates without cellular data, so the operator could still see:

```text
You are here ●

        Block 7
      ┌────────┐
      │        │
      │   ●    │
      │        │
      └────────┘
```

even with zero signal.

We should avoid huge satellite imagery downloads as a basic requirement. Vector farm geometry is tiny by comparison.

### QR is especially appropriate

QR works beautifully with this economic constraint because it requires no special hardware.

A $70–150 Android phone already has the necessary camera.

Physical tags can be extremely inexpensive:

```text
[QR]

LN-B04
CATUAI
```

Scan:

```text
BLOCK B04

600 Catuai
Harvest active

[ Harvest ]
[ Activity ]
[ Observation ]
```

Similarly:

```text
QR → fermentation tank
QR → drying bed
QR → sample
QR → coffee bag
QR → storage location
```

We don't need RFID readers, industrial scanners or expensive IoT infrastructure to begin.

### Operators should not have to type much

Another major design principle:

> Minimize text entry.

Prefer:

- large buttons
- predefined activities
- numeric keypads
- dropdowns
- radio selections
- QR scans
- photo evidence
- automatic timestamp
- automatic operator identity
- automatic farm context
- automatic units
- optional voice note later

Rather than:

```text
Describe what you did today:
______________________________
______________________________
```

For example:

```text
ACTIVITY

[ Pruning ]
[ Fertilizing ]
[ Weeding ]
[ Biochar ]
[ Pest ]
[ Shade ]
[ Other ]

Block:
[ B04 ]

Workers:
[ 3 ]

Duration:
[ 4.5 h ]

[ SAVE ]
```

Much faster and more reliable.

### Language and literacy need consideration too

Even when workers can read, agricultural terminology may vary.

We can support:

```text
✂ Pruning / Poda

🌱 Planting / Siembra

🧺 Harvest / Cosecha

💧 Irrigation / Riego
```

The icon is supplemental—the text remains—but the visual consistency makes the app faster to learn.

Later the system can support Spanish, English and possibly localized vocabulary.

### We should also plan for device failure

A cheap Android device can break, get wet, fall or disappear.

Therefore synchronization isn't merely cloud convenience. It is disaster recovery.

The application should clearly show:

```text
SYNC

✓ Farm records backed up
✓ Lots backed up
✓ Measurements backed up

⚠ 17 photos not backed up
```

The operator should understand whether important work is protected.

We could even create a field workflow where managers encourage operators:

> When you return somewhere with Wi-Fi, open Sync.

The application handles the rest.

### Environmental ruggedness should mostly come from inexpensive accessories

I would not make the software dependent on purchasing rugged industrial tablets.

Instead the deployment kit could eventually be:

```text
Basic Android phone
+
$10–20 rugged waterproof case
+
screen protector
+
10,000–20,000 mAh power bank
+
QR labels
```

That is far more scalable across farms than $700–1,500 ruggedized devices.

It also fits the economic reality you're describing.

### This changes how we should judge every feature

Every future feature should pass a simple test:

> Can an operator use this on a low-end Android phone, in rain, with no signal, without needing technical support?

For example:

**Good**

```text
Scan QR
Enter pH
Save
```

**Bad**

```text
Open web dashboard
Load farm
Load project
Select experiment
Select processing phase
Open data table
Add row
Wait for API
```

Same underlying information. Completely different operational design.

### I would add a formal “Field Hardware Profile” to the specification

Something along these lines:

```text
FIELD OPERATING PROFILE — TIER 1

Device:
Low-cost Android smartphone

Connectivity:
None assumed.

Offline endurance:
Minimum design target 7 days.
Prefer 14+ days.

RAM:
2 GB target minimum.

Storage:
Conservative use.
Media compression mandatory.

Interaction:
One-handed.
Large touch targets.
Minimal text entry.

Environment:
Rain, humidity, dirt, bright sunlight,
poor lighting, gloves/wet hands.

Power:
Battery-conscious.
No continuous GPS/BLE/network polling.

Data entry:
Local-first.
Never block save on network availability.

Identification:
QR/camera first.

Sensors:
Phone sensors + optional BLE.
No proprietary hardware dependency.

Maps:
Offline vector data.

Sync:
Resumable.
Incremental.
Bandwidth-aware.
Prioritized.

Critical data:
Sync before media.

Failure:
Application must survive interrupted sync,
app termination and device restart.

User:
Minimal software training assumed.
```

That specification should become **non-negotiable architecture**, alongside data traceability and experimental integrity.

And this suggests a slightly different implementation sequence than what I proposed earlier:

```text
1. Domain architecture
        ↓
2. Offline data + sync architecture
        ↓
3. Low-resource Android prototype
        ↓
4. Farm → Block → Activity
        ↓
5. Harvest
        ↓
6. Lot traceability
        ↓
7. Processing / fermentation
        ↓
8. Experiments
        ↓
9. Advanced maps/sensors
        ↓
10. Rich analytics/web management
```

I would actually prototype **Farm → Block → Activity → Save Offline → Synchronize** very early. If that runs reliably on a cheap 2 GB Android phone with zero connectivity, then we've validated the hardest architectural premise before building the rest.

That should now be incorporated into the Claude Code master brief as a core product constraint, not as a later mobile feature.

## T005

Source turn: `900c6ca7-6275-48da-81da-d642120dfeb8`


### User

operator may have to take photos, videos, establish tasks, dates hours sequence data gathering during these farm activities and or analysis observations made using phone gps, audiovisual etc

### Historical assistant

Then the operator app should be designed around an **activity session / field event timeline**, not just isolated forms.

For every farm activity, analysis, harvest, experiment, or observation, the operator should be able to create a session such as:

```text
FIELD SESSION
Las Nubes
Block B04
Activity: Biochar application
Operator: Juan
Started: 07:42
GPS: captured
Offline: yes
```

During that session, the phone can accumulate a chronological record:

```text
07:42  Session started
07:43  GPS position captured
07:48  Photo
07:55  Task completed: apply treatment
08:02  Observation added
08:14  pH measurement
08:31  Photo
08:47  Video
09:05  Worker count updated
09:17  Task completed
09:22  Session closed
```

That timeline becomes the primary evidence trail.

The key architecture should therefore include several related concepts:

```text
Activity / Session
    │
    ├── Tasks
    ├── Events
    ├── Measurements
    ├── Observations
    ├── Photos
    ├── Videos
    ├── GPS observations
    ├── People / workers
    ├── Equipment
    └── Attachments
```

A task should not merely be `done/not done`. It should support:

```text
Task
├── planned start
├── due date
├── expected duration
├── actual start
├── actual finish
├── sequence/order
├── dependency
├── assigned operator
├── status
├── location/block
├── required measurements
├── required evidence
└── completion notes
```

That matters for experimental work.

For example:

```text
Fermentation protocol

1. Receive coffee
2. Measure Brix
3. Measure pH
4. Inoculate
5. Photograph tank
6. Measure pH after 6 h
7. Measure temperature after 6 h
8. Repeat at 12 h
9. Stop fermentation at target condition
```

The app should understand the sequence.

It can locally tell the operator:

```text
NEXT

Measure pH
Due: 14:30

Required:
[ pH ]
[ temperature ]
[ photo ]

[ RECORD ]
```

No internet is necessary because the protocol and schedule are already stored locally.

For research, I would go further and make scheduled observations a first-class concept:

```text
Observation Schedule

T0
T+6 h
T+12 h
T+18 h
T+24 h
```

Each scheduled point can specify required data:

```text
T+12 h

pH          required
Temperature required
Brix        optional
Photo       required
Aroma       required
Video       no
```

The app then becomes a field research assistant.

Photos should automatically capture metadata such as:

```text
photo_id
activity_id
operator_id
captured_at
GPS
device_id
farm
block
lot
experiment
task
sync_status
```

The operator should not have to type any of that.

Video requires more careful handling because of storage.

I would support three modes:

```text
PHOTO
default evidence

SHORT VIDEO
15–60 seconds
field observation / process documentation

EXTENDED VIDEO
explicitly selected
for important documentation only
```

The normal field workflow should encourage short video clips rather than unrestricted recording.

A 30-second compressed clip can document:

- cherry maturity
- worker technique
- fermenter condition
- drying-bed condition
- runoff
- weather
- plant symptoms
- pest damage
- infrastructure failure

without creating enormous storage requirements.

The media pipeline should be:

```text
Capture
   ↓
Local file
   ↓
Generate thumbnail
   ↓
Compress copy
   ↓
Link metadata
   ↓
Queue for upload
```

And the app must never prevent the operator from continuing because video has not uploaded.

For GPS, I would support more than just a single coordinate.

There are at least four useful modes:

```text
POINT
sample location
plant observation
disease finding

AREA
block polygon
treatment zone

PATH
farm walk
inspection route

EVENT LOCATION
where an activity occurred
```

But continuous GPS tracking should be optional because of battery consumption.

A farm inspection might work as:

```text
START WALK

GPS every:
[ 30 sec ]
[ 1 min ]
[ 5 min ]
```

whereas a normal activity uses only one GPS reading.

For difficult weather, the user interface should also provide a **rapid capture mode**.

For example, while walking through the farm:

```text
[ PHOTO ]

[ VOICE NOTE ]

[ OBSERVATION ]

[ SAMPLE ]

[ ISSUE ]
```

One tap.

If the operator sees rust symptoms:

```text
[ ISSUE ]

Category:
Disease

Severity:
[ Low ] [ Medium ] [ High ]

[ PHOTO ]

GPS automatically captured

[ SAVE ]
```

That could take less than ten seconds.

Voice notes could become very useful as well. They are much faster than typing in rain or while walking.

Initially we can simply preserve the audio.

Later, when connectivity is available:

```text
Voice note
   ↓
sync
   ↓
transcription
   ↓
searchable text
```

But transcription should never be required to create the observation.

The raw audio remains the source record.

This also suggests creating a generic **Field Event** model.

Conceptually:

```text
FieldEvent
├── id
├── type
├── occurred_at
├── recorded_at
├── operator
├── location
├── GPS
├── farm
├── block
├── activity
├── task
├── harvest
├── lot
├── experiment
├── sample
├── notes
├── structured payload
└── sync metadata
```

Then:

```text
Photo
Measurement
Observation
TaskCompletion
GPSPoint
SampleCollection
Video
VoiceNote
```

can all participate in one chronological event stream.

That would give you an extremely powerful report later.

Instead of a static farm log, you could reconstruct:

```text
LAS NUBES
January 14, 2027

07:31
Harvest started — Block B07

07:36
GPS confirmed

08:13
Photo — cherry maturity

09:42
184 kg received

09:51
Brix 20.3°

10:16
Lot LN-27-014 created

10:29
Depulping started

10:42
Fermentation F-118 started

16:43
pH 4.21
Temperature 23.8 °C

16:44
Photo

22:43
pH 3.78
Temperature 22.9 °C
```

That is useful operationally, scientifically and commercially.

It also helps traceability because every action has:

**who / what / where / when / related lot / related experiment.**

There is another requirement I would add: distinguish between the actual event time and the time it was entered.

For example:

```text
occurred_at = 14:00
recorded_at = 14:23
```

An operator may make the measurement and only enter it twenty minutes later.

For scientific work, those should not be treated as identical.

Similarly:

```text
device_time
server_time
timezone
```

should be preserved enough to detect incorrect phone clocks.

For sensitive measurements, the app could flag:

```text
Device clock differs from server by 17 minutes.
```

after synchronization.

Media should also preserve basic provenance.

We should avoid editing the original evidence silently.

For example:

```text
Original media
    ↓
immutable

Derived media
    ├── thumbnail
    ├── compressed image
    └── report version
```

That way a photograph used in an experiment remains traceable to the original capture.

Tasks and field sessions should also support **templates**.

Instead of creating everything manually:

```text
TEMPLATE
Coffee Harvest

□ Identify block
□ Record workers
□ Record start time
□ Capture cherry photo
□ Record weight
□ Record Brix
□ Create cherry lot
□ Close harvest
```

Or:

```text
TEMPLATE
Fermentation Monitoring

Every 6 hours:
□ pH
□ temperature
□ Brix
□ aroma observation
□ photo
```

Or:

```text
TEMPLATE
Disease Inspection

For each finding:
□ GPS
□ plant/block
□ severity
□ photo
□ notes
```

That would allow you to create protocols on the management web application and push them to operator phones before entering difficult areas.

The overall architecture therefore becomes:

```text
                  MANAGEMENT WEB

Plan
Protocols
Experiments
Task templates
Assignments
Reporting

                        ↓ sync

                   OPERATOR PHONE

                    OFFLINE DB
                        │
        ┌───────────────┼────────────────┐
        │               │                │
      Tasks          Sessions        Protocols
        │               │                │
        └───────────────┼────────────────┘
                        ↓
                  FIELD EVENTS
                        │
     ┌──────────┬───────┼───────┬──────────┐
     ↓          ↓       ↓       ↓          ↓
   Photo      Video   GPS   Measurement Observation
     │          │       │       │          │
     └──────────┴───────┴───────┴──────────┘
                        ↓
                    Sync Queue
                        ↓
                      Cloud
```

I would add this requirement to the Claude Code architecture brief explicitly:

> **The mobile operator application is not a mobile CRUD frontend. It is a field data-capture and protocol-execution system. Tasks, scheduled observations, media, measurements, GPS and chronological events must all work offline and remain attributable to their operator, place, farm activity, sample, lot or experiment.**

This is probably one of the most important product differentiators we have identified so far. It connects farm management, traceability and research into the same operational workflow instead of forcing operators to maintain separate notebooks, camera folders, WhatsApp messages and spreadsheets.

## T006

Source turn: `8c5c435e-01e6-47c7-9baf-8c0fc1d1ffac`


### User

photos could have observations comments free text and keywords? important that everything is traceable, so the weight of the cherries from which lot, microlot, blend of lots and or farms, harvest processing "selection" floating to remove floaters, then selection via removing unripe and green and or other such as defective cherries or that dont meet standards defined by admin

### Historical assistant

Yes. I would make all of that explicit in the data model, because this is where a traceability system either becomes scientifically useful or degrades into loose notes.

For photos and videos, each media item should support both structured and unstructured annotation:

```text
MediaAsset
├── id
├── type = photo | video | audio
├── captured_at
├── operator
├── GPS
├── farm
├── block
├── harvest
├── lot / microlot
├── process stage
├── task / activity
├── experiment
├── observation
├── free_text_comment
├── keywords / tags
├── severity or classification
├── original_file
├── derived/compressed_file
└── audit / sync metadata
```

The important distinction is that `free_text_comment` and `keywords` should not replace structured data. They complement it.

For example:

```text
PHOTO
Lot: LN-27-H04
Stage: cherry selection
Observation:
"High proportion of underripe fruit from north edge of block."

Keywords:
underripe
green-cherry
selection
block-north
harvest-quality
```

That makes the photo searchable later by lot, process stage, observation type, keyword, date, block, operator or experiment.

For the coffee itself, I would model the system around **material lineage plus mass balance**.

The core principle should be:

> Every transformation of coffee must state what material entered, what operation occurred, what material exited, and what was removed or lost.

So:

```text
Harvest
    ↓
Cherry Lot
    ↓
Selection / Sorting
    ↓
Accepted Cherry Lot
    +
Rejected Material
```

A lot should never simply “change weight” without an explanation.

For example:

```text
CHERRY LOT
LN-27-014

Origin:
Farm: Las Nubes
Block: B04
Cultivar: Catuai
Harvest date: 2027-01-14

Incoming weight:
186.4 kg
```

Then flotation:

```text
SELECTION EVENT
Type: flotation

Input:
186.4 kg cherry

Outputs:
171.8 kg accepted cherries
8.7 kg floaters
3.4 kg leaves/stems/debris
2.5 kg handling/loss

Mass balance:
186.4 kg
```

Then hand selection:

```text
SELECTION EVENT
Type: manual cherry sorting

Input:
171.8 kg

Outputs:
160.2 kg accepted ripe cherry
6.1 kg underripe/green
2.8 kg overripe
1.2 kg damaged
0.9 kg insect-damaged
0.6 kg other reject

Mass balance:
171.8 kg
```

That is much more powerful than recording:

> "sorted cherries"

because we can later calculate:

```text
Initial cherry:       186.4 kg
Final selected:       160.2 kg

Selection yield:       85.9%
Total rejection:       14.1%
```

And compare that against quality later.

The same logic should continue through processing:

```text
Cherry
↓
Selected cherry
↓
Depulped coffee
↓
Fermented coffee
↓
Washed parchment
↓
Wet parchment
↓
Dry parchment
↓
Milled green
↓
Sorted green
↓
Roasted coffee
```

At each step:

```text
input quantity
output quantity
reject quantity
loss
unit
measurement method
timestamp
operator
equipment
```

This creates a real chain of custody and conversion history.

For microlots and blends, the lot lineage needs to support both **splitting** and **merging**.

Example split:

```text
HARVEST LOT
LN-H27-004
420 kg cherry

        ↓

Split

Lot A — 140 kg → Washed
Lot B — 140 kg → Black Honey
Lot C — 140 kg → Experimental
```

The system must retain:

```text
LN-H27-004
├── LN-H27-004-A
├── LN-H27-004-B
└── LN-H27-004-C
```

And every downstream sample still knows it came from the same original harvest.

For a merge:

```text
Lot A
Farm Las Nubes
Block 03
75 kg

+

Lot B
Farm Las Nubes
Block 04
62 kg

        ↓

Blend / Merge

Lot C
137 kg
```

The lineage graph becomes:

```text
A ──┐
    ├── C
B ──┘
```

If coffees from different farms are combined, that must remain visible permanently.

For example:

```text
Blend BL-017

60%
Las Nubes
Lot LN-027

40%
Kiva Estate
Lot KV-119
```

We should never collapse that to simply:

```text
Origin: Panama
```

internally.

Public-facing provenance can be simplified if desired, but the internal chain should retain the exact contributors and percentages.

This suggests an important distinction between:

```text
LOT
```

and:

```text
LOT COMPONENT
```

Conceptually:

```text
Lot
├── id
├── material state
├── quantity
├── unit
├── status
└── lineage

LotComponent
├── source_lot
├── destination_lot
├── quantity
├── percentage
└── transformation
```

That lets us reconstruct a blended lot exactly.

Your point about "selection" should also become a proper process family rather than free-text.

I would define:

```text
SELECTION / SORTING
```

with subtypes such as:

```text
flotation
manual cherry sorting
ripeness selection
density sorting
size grading
color sorting
defect sorting
optical sorting
screen grading
manual green sorting
other
```

Each selection event has:

```text
input material
selection method
selection standard
accepted output
rejected outputs
operator
equipment
time
location
media
observations
mass balance
```

Then the important part you mentioned: the standard should be defined by the administrator.

So instead of hardcoding:

```text
Reject all green cherry
```

we should have something like:

```text
SelectionStandard
```

For example:

```text
STANDARD
Specialty Cherry Intake v3

Applies to:
Catuai
Harvest intake

Accept:
ripe red cherry
ripe burgundy cherry

Reject:
green
underripe
dry
fermented
mold
insect damaged
broken
foreign material

Thresholds:
Floaters ≤ 5%
Green cherries ≤ 2%
Defective cherries ≤ 1%
```

Then an admin can create different standards.

For example:

```text
Standard A
Commercial Specialty

Standard B
Competition Lot

Standard C
Experimental Lot

Standard D
Natural Process Intake
```

The operator does not need to interpret the whole specification.

The app can simply show:

```text
SELECTION STANDARD
Competition Lot

Check:
✓ Ripe cherry
✓ Remove green
✓ Remove underripe
✓ Remove dry
✓ Remove insect-damaged
✓ Remove floaters

Max green:
1%

Max floaters:
2%
```

Then record actual results.

That gives us an important comparison:

```text
Standard:
≤ 2% floaters

Observed:
4.7%

Result:
OUT OF STANDARD
```

The app should not necessarily block the lot.

Instead it can flag:

```text
⚠ Does not meet Competition Lot standard
```

and require an action:

```text
[ Re-sort ]
[ Downgrade lot ]
[ Admin override ]
[ Accept for experiment ]
```

An override should be fully traceable:

```text
override_by
override_at
reason
comment
```

No silent bypass.

The same approach can work for every process stage.

Admin-defined standards could eventually cover:

```text
Harvest
- ripeness
- Brix
- defects

Flotation
- maximum floaters

Fermentation
- pH target
- time limits
- temperature range

Drying
- moisture
- water activity
- drying time

Green QC
- defects
- density
- screen
- moisture

Storage
- RH
- temperature
- maximum duration
```

Then the platform becomes more than data collection.

It becomes a controlled operating system:

```text
PROTOCOL
       ↓
STANDARD
       ↓
OPERATOR TASK
       ↓
FIELD OBSERVATION
       ↓
MEASUREMENT
       ↓
PASS / FLAG / FAIL
       ↓
ACTION
```

Photos can then serve as evidence attached to any one of those events.

For example:

```text
Selection Event
├── 186.4 kg input
├── flotation
├── 8.7 kg floaters
├── Standard: Specialty Intake v3
├── result: FAIL
│
└── Evidence
    ├── photo 1: flotation tank
    ├── photo 2: floaters
    └── observation:
        "High floater percentage after rain."
```

And keywords:

```text
floaters
rain
low-density
harvest-intake
quality-deviation
```

Later you could ask the system:

> Show me every harvest from Las Nubes where floaters exceeded 5%.

Or:

> Show photos associated with high green-cherry rejection.

Or:

> Compare sensory score against percentage of rejected cherry.

Or:

> Which blocks consistently produce the highest selection yield?

This is where your experimental and operational systems converge.

I would therefore add four first-class concepts to the architecture:

```text
LotLineage
SelectionEvent
SelectionStandard
MaterialMovement
```

And I would impose five invariants:

```text
1. No unexplained lot weight changes.

2. Every split and merge preserves origin.

3. Every selection records accepted and rejected material.

4. Every standard used is versioned.

5. Every override is attributable and auditable.
```

If we implement those correctly, then cherries harvested from one block, multiple blocks, multiple farms, microlots, blends, experimental splits and rejected materials can all remain reconstructable from field to final coffee.

## T007

Source turn: `d9781c73-4a04-4da6-a9a7-bb5dff3ec235`


### User

ok, lets now compare with existing software you mentioend and studied, whats next?

### Historical assistant

Yes. Now we have enough definition of our intended system to do a much more useful comparison. I rechecked the current vendor documentation rather than relying only on the earlier survey.

The conclusion is becoming clearer: **Oak is our closest competitor/reference for estate operations; Cropster Origin is the strongest reference for coffee material/quality; Dimitra is the closest reference for low-connectivity deployment at scale; Cropin is the reference for agronomy/geospatial intelligence.** None appears to combine all four with the research/experimental depth we're defining.

### Revised comparison against our actual requirements

| Capability | Oak | Cropster Origin | Dimitra | Cropin | Our target |
|---|---:|---:|---:|---:|---:|
| Farm/block structure | ★★★★★ | ★★ | ★★★★ | ★★★★★ | ★★★★★ |
| Plantings/varieties | ★★★★★ | ★★ | ★★★★ | ★★★★ | ★★★★★ |
| Field activities | ★★★★★ | ★ | ★★★★ | ★★★★★ | ★★★★★ |
| Task planning | ★★★★★ | ★★ | ★★★★ | ★★★★★ | ★★★★★ |
| Harvest | ★★★★★ | ★★★★★ | ★★★★ | ★★★ | ★★★★★ |
| Cherry quality separation | ★★★★ | **★★★★★** | ★★★ | ★★ | **★★★★★+** |
| Lot split/merge | **★★★★★** | ★★★★★ | ★★★★ | ★★★ | **★★★★★** |
| Process traceability | **★★★★★** | **★★★★★** | ★★★★ | ★★ | **★★★★★** |
| Fermentation variables | ★★★★½ | ★★★★ | ★★ | ★ | **★★★★★** |
| QC/cupping | ★★★★ | **★★★★★** | ★★★★ | ★★ | **★★★★★** |
| GPS/geospatial | ★★★★ | ★★ | ★★★★★ | **★★★★★** | ★★★★★ |
| Offline field work | unclear/full extent | limited by workflow | **★★★★★** | strong field focus | **core requirement** |
| Photos/evidence | ★★★★ | ★★★ | ★★★★ | ★★★★ | **★★★★★** |
| Scientific experiments | ★★ | ★★★ | ★★ | ★★ | **★★★★★** |
| Protocol execution | ★★★ | ★★★ | ★★★ | ★★★★ | **★★★★★** |
| Low-end Android priority | not clearly core | not core | **strong** | field-oriented | **core requirement** |
| Mass balance | ★★★★ | **★★★★★** | ★★★ | ★★ | **★★★★★** |
| Admin-defined standards | ★★★★ | **★★★★★** | ★★★★ | ★★★★ | **★★★★★** |
| Audiovisual field timeline | limited | limited | limited | limited | **★★★★★** |

These are comparative assessments, not vendor-published scores.

There are several findings worth changing our architecture around.

**Oak confirms our lot-lineage direction.** Its current specialty coffee module explicitly supports harvest quantity/quality at block or even plant level, worker attribution, custom processing methods, fermentation parameters, lot creation, merges, splits and transformation history through green coffee. citeturn0search0 Oak also already combines daily planning, checklists, attachments, comments, due times, assignments and confirmation of completion. citeturn0search12

[Oak](https://www.oak.farm/?utm_source=chatgpt.com)

So we should not spend engineering effort merely recreating Oak. Our differentiation needs to go further.

**Cropster just validated your cherry-selection requirement almost exactly.** Cropster Origin allows reception to separate incoming coffee by quality—including unripe, ripe, over-ripe and dry material—and supports recording the parts by actual weight, percentage estimate, or supplier separation. It also supports configurable quality formats, yield factors and error tolerances between expected and actual quantities. citeturn0search9

That tells me our `SelectionEvent` idea is correct, but we can take it further.

Cropster essentially handles:

```text
RECEPTION
186 kg
   ↓
SEPARATION
   ├── ripe
   ├── unripe
   ├── overripe
   └── dry
```

Our proposed system should generalize this to:

```text
MATERIAL
186 kg cherry
        ↓
SELECTION EVENT
        │
        ├── Standard used: CS-Competition-v3
        ├── Method: flotation
        ├── Operator
        ├── Time
        ├── GPS
        ├── Photos
        ├── Observations
        │
        ├── 171 kg sinkers
        └── 15 kg floaters
                    ↓
              rejection reason
```

and then allow another selection:

```text
171 kg
   ↓
MANUAL SELECTION
   ├── 160 kg accepted
   ├── 6 kg green
   ├── 3 kg overripe
   └── 2 kg defective
```

That is essentially **Cropster-style coffee separation + Oak-style lot lineage + our evidence/audit architecture**.

[Cropster Origin](https://www.cropster.com/packages/origin-pricing/?utm_source=chatgpt.com)

Cropster also remains much stronger as a reference for the downstream quality side: green inventory, sample tracking, laboratory analysis, cupping and blending/marketing decisions. citeturn0search11

### Dimitra becomes more important after what you just specified

I would move Dimitra higher in our benchmark.

They explicitly describe their field product as mobile-first and designed for **low connectivity, shared devices and large producer networks**, with offline data capture followed by synchronization. citeturn0search6

Even more concretely, Connected Coffee documents an Android app and explicitly provides an **offline farm-registration workflow**. citeturn0search3

[Dimitra Connected Farmer](https://dimitra.io/connected-farmer/?utm_source=chatgpt.com)

This is much closer to the socioeconomic deployment model you're describing than Cropster.

We should therefore study Dimitra specifically for:

```text
LOW-COST PHONE
       +
LOW CONNECTIVITY
       +
FIELD WORKER
       +
FARM MAPPING
       +
OFFLINE CAPTURE
       +
LATER SYNC
       +
MULTIPLE PRODUCERS
```

Their Connected Coffee product also covers farm records, harvest/lot tracking, quality and end-to-end traceability. citeturn0search13turn0search14

Where we should differentiate is **depth of specialty processing and research**, not basic offline farm registration.

### Cropin remains the model for agronomy

Cropin currently emphasizes geotagged plots, crop/input records, workflows, assigned tasks, customizable dashboards, crop-health monitoring, weather advisories and pest alerts. citeturn0search7turn0search10

[Cropin](https://www.cropin.com/?utm_source=chatgpt.com)

That's where we should look when we reach:

```text
Block
 ↓
Agronomic history
 ↓
Weather
 ↓
Disease
 ↓
Treatment
 ↓
Yield
 ↓
Quality
```

rather than inventing those interaction patterns ourselves.

## So what's next?

I would **not send Claude Code another implementation prompt yet**.

We need one intermediate artifact: a **competitive functional specification**.

Instead of saying:

> "Build farm management."

we define approximately 120–200 atomic requirements and tag every one:

```text
REQUIREMENT
OFF-001

Operator can create a field observation
without network connectivity.

Priority: P0
Role: Operator
Offline: REQUIRED
Hardware: low-end Android
Evidence: optional
GPS: optional
Sync: required
Audit: required
```

Another:

```text
HAR-014

Operator records incoming cherry weight.

Must reference:
farm
harvest
source block(s)
lot
operator
timestamp

Optional:
GPS
photo
comment

Offline: REQUIRED
```

Another:

```text
SEL-008

Selection operation may create multiple
outputs from one input lot.

Example:
180 kg input

→ 164 kg accepted
→ 7 kg green
→ 5 kg floaters
→ 4 kg defective

System verifies mass balance.
```

And:

```text
MED-011

Photo may reference:
farm
block
planting
harvest
lot
process
selection
task
experiment
sample

Supports:
free text
keywords
structured observation
GPS
timestamp
operator
```

Then we compare every requirement against:

**Oak / Cropster / Dimitra / Cropin / current Néctar Nómada**.

The resulting matrix will expose exactly where we're simply matching the market versus where we have a genuine product advantage.

I already see five areas that should become the product's differentiating core:

**1. Offline-first evidence architecture.** Not merely "works offline": measurements, tasks, GPS, photos, short video, voice, timestamps and observations all remain linked to the operational event.

**2. Material mass-balance traceability.** Every kg of cherry has lineage through selection, rejection, split, merge, fermentation, drying, milling and blending.

**3. Protocol + standards engine.** Admin defines what should happen; operator executes it; system records deviations.

**4. Experimental research.** Treatment → replicate → sample → measurement → sensory outcome, directly connected to normal farm production.

**5. Timeline reconstruction.** We can reconstruct exactly what happened to a coffee:

```text
FARM
 ↓
BLOCK
 ↓
HARVEST
 ↓
WEIGHT
 ↓
PHOTO
 ↓
FLOTATION
 ↓
SELECTION
 ↓
WEIGHT
 ↓
MICROLOT
 ↓
PROCESS
 ↓
FERMENTATION
 ↓
MEASUREMENTS
 ↓
DRYING
 ↓
STORAGE
 ↓
SAMPLE
 ↓
CUPPING
 ↓
PRODUCT
```

Every node can answer:

**Who? When? Where? What? How much? According to which protocol? What evidence exists? What happened next?**

That is a substantially stronger product definition than "coffee farm management software."

I recommend we build that **master requirements/competitive matrix next**, before returning to Claude Code. Once locked, it becomes the product specification against which Claude's existing-repository audit and every subsequent implementation phase can be tested.

## T008

Source turn: `ebf7f01c-e0ca-4695-b30a-ecf5194fd65c`


### User

should I copy paste any of that in mention above?

### Historical assistant

Not yet. The earlier Claude Code audit prompt is still valid, but our discussion since then added several requirements important enough that I would **not send the old prompt unchanged**.

The additions that need to be incorporated are:

- Offline-first is a fundamental architecture requirement, not a later feature.
- Low-cost Android phones and constrained hardware are the baseline.
- 7–14+ days without connectivity should be viable.
- Local database is operational storage, not merely cache.
- Resumable/bandwidth-aware synchronization and conflict handling.
- Offline photos, short videos, audio/voice notes, GPS and annotations.
- Field sessions and chronological event timelines.
- Tasks, scheduled measurements and protocol sequences.
- `occurred_at` versus `recorded_at` and complete operator/device provenance.
- Material mass balance from cherry onward.
- Lot/microlot split, merge and multi-farm blending.
- Selection events: flotation, manual sorting, defects, green/unripe/overripe, etc.
- Accepted and rejected material as traceable outputs.
- Admin-defined, versioned selection/quality standards.
- Deviations, failures and auditable overrides.
- QR-first physical identification.
- Experiments/treatments/replicates integrated with ordinary farm operations.
- Offline vector maps and selective GPS use.
- Media synchronization separated from critical structured-data synchronization.
- Immutable/auditable scientific observations and corrections.

So I recommend **not assembling pieces from my previous messages manually**. There is enough now that doing so risks contradictions and duplicated requirements.

The next artifact should be a single consolidated **Néctar Nómada Specialty Coffee Field OS — Product & Technical Requirements Specification**, incorporating the competitive research plus everything we have defined. Then we derive the Claude Code repository-audit prompt from that specification.

In other words:

**Product specification → repository audit → gap analysis → architecture decisions → Phase 1 implementation prompt → code.**

That is the cleaner sequence now.

## T009

Source turn: `5331378b-ed04-4e12-b95c-9f82fcfb2d9b`


### User

proceed

### Historical assistant

Yes. I’ll consolidate it now. One correction from the fresh comparison is important: Cropster discontinued its dedicated Origin mobile app in October 2024, although its cupping app retains offline functionality. That makes our offline operator architecture more strategically distinct than I initially framed it. citeturn0search3turn0search4 Oak, meanwhile, is particularly strong on estate operations and coffee lot splits/merges, while Cropster Origin remains a strong benchmark for reception, separation, processing states, yield factors and quality. citeturn0search0turn0search5turn0search8

Below is the specification I would freeze before we return to Claude Code.

:::writing{variant="document" id="58314" title="Néctar Nómada Specialty Coffee Field OS — Product & Technical Requirements Specification v0.1"}
# Néctar Nómada Specialty Coffee Field OS
## Product & Technical Requirements Specification — v0.1

**Status:** Architecture baseline  
**Purpose:** Product definition, competitive benchmark and basis for Claude Code repository audit  
**Primary environment:** Specialty coffee farms, remote agricultural operations and experimental processing facilities

---

# 1. Product Definition

Néctar Nómada Specialty Coffee Field OS is an **offline-first agricultural operating, traceability and research system** designed specifically for specialty coffee and difficult field environments.

It is not simply:

- farm ERP software,
- a coffee-processing database,
- a cupping application,
- a traceability website,
- or a mobile version of a management dashboard.

It combines:

**farm management + field execution + specialty coffee processing + material traceability + quality control + scientific experimentation + audiovisual evidence + planning + reporting.**

The fundamental design assumption is that field operators may work:

- without mobile data,
- without Wi-Fi,
- for multiple days,
- using inexpensive Android smartphones,
- in rain, humidity, mud and difficult terrain,
- with limited electricity,
- with limited technical training.

The application must therefore remain operational without cloud connectivity.

---

# 2. Core Architectural Principle

The operator works against a **local operational database**.

The cloud is used for:

- synchronization,
- coordination,
- management,
- backup,
- analytics,
- reporting,
- administration,
- cross-device collaboration.

Network availability must never be required for ordinary field data capture.

Conceptually:

```text
                 CLOUD PLATFORM

          PostgreSQL / Management Web
                     │
                 Sync API
                     │
              Synchronization
                     │
       ┌─────────────┼─────────────┐
       ↓             ↓             ↓
   Operator A    Operator B    Researcher
    Android       Android       Android
       │             │             │
    SQLite        SQLite        SQLite
```

---

# 3. Target Hardware Profile

## FIELD DEVICE — TIER 1

Primary platform:

**Android smartphone**

Target minimum environment:

- approximately 2 GB RAM
- inexpensive ARM processor
- approximately 32 GB device storage
- 720p-class display acceptable
- basic rear camera
- standard Android GPS
- Wi-Fi
- basic cellular connectivity when available

Not required:

- NFC
- biometric hardware
- high-end camera
- industrial scanner
- permanent mobile data
- permanent Wi-Fi
- proprietary farm hardware

Optional:

- Bluetooth Low Energy
- external sensors
- data loggers
- digital scales
- temperature probes

The application should remain practical when used with an inexpensive:

- rugged case
- screen protector
- power bank
- printed QR labels

---

# 4. Offline Requirement

Target:

**7–14+ days of normal field operation without connectivity.**

Offline operation must include:

- farms
- blocks
- plantings
- assignments
- tasks
- protocols
- harvests
- lots
- processing
- measurements
- observations
- photos
- short videos
- voice/audio notes
- GPS observations
- samples
- experiments
- standards
- selection records
- material movements

A network request must not be required to save a normal field record.

---

# 5. Mobile Architecture

Preferred conceptual architecture:

```text
Operator UI
    ↓
Local application services
    ↓
SQLite
    ↓
Local event / mutation queue
    ↓
Synchronization engine
    ↓
Cloud API
```

SQLite is not merely a cache.

While offline, it is the operational data store.

Every synchronizable entity must use a globally unique identifier that can be generated without contacting the server.

Sequential server-generated identifiers must not be required for field operations.

---

# 6. Synchronization

Synchronization must be:

- incremental
- resumable
- idempotent
- bandwidth-aware
- interruption-safe
- retryable
- observable by the operator

Priority should approximately be:

1. identifiers and metadata
2. critical operational transactions
3. measurements
4. harvest/lot changes
5. inventory/material movements
6. activities/tasks
7. observations
8. text
9. thumbnails
10. photographs
11. videos/full media

A weak cellular connection should be sufficient to synchronize critical structured records without waiting for large media uploads.

Media synchronization may be restricted to Wi-Fi.

---

# 7. Offline Package

Operators should be able to download only the operational context required for a trip or assignment.

Example:

```text
OFFLINE PACKAGE — LAS NUBES

Farm
Blocks
Plantings
Current harvest
Active lots
Current experiments
Tasks
Protocols
Selection standards
SOPs
Recent measurements
Offline map
```

The entire organizational database should not be required on every phone.

---

# 8. Field Operator UX

The mobile application is **not a miniature ERP**.

Primary actions should be extremely fast.

Example:

```text
LAS NUBES

OFFLINE
Last sync: yesterday 18:42

TODAY

[ Harvest ]

[ Field Activity ]

[ Measurement ]

[ Scan QR ]

3 tasks pending
2 fermentations active
```

Design principles:

- large touch targets
- minimal typing
- one-handed operation
- predefined selections
- numeric entry
- QR scanning
- automatic timestamps
- automatic operator identity
- automatic context where safe
- simple navigation
- low visual complexity

---

# 9. Canonical Agricultural Lineage

The system should ultimately reconstruct:

```text
Farm
 ↓
Block
 ↓
Planting
 ↓
Harvest
 ↓
Cherry Lot
 ↓
Selection
 ↓
Processing
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
Quality / Sensory
 ↓
Roast / Product / Sale
```

Not every conceptual object necessarily requires its own database model.

Existing canonical platform entities should be reused wherever semantically appropriate.

---

# 10. Farm

Farm data may include:

- organization
- geographic location
- boundary
- elevation
- production area
- infrastructure
- climate context
- certifications
- ownership/management
- active crops

Do not automatically create a separate `Farm` model if the existing Location/Organization/Project architecture can represent it cleanly.

---

# 11. Blocks

Blocks/plots should support:

- identifier
- geometry
- area
- elevation
- slope
- orientation
- shade
- soil
- crop
- infrastructure
- irrigation
- notes
- photos

Blocks must remain historically stable enough to preserve provenance.

---

# 12. Planting Cohorts

Do not assume:

`Block = Variety`

One block may contain multiple:

- cultivars
- planting years
- plant ages
- planting densities

A planting cohort may contain:

- species
- cultivar
- plant count
- spacing
- planting date
- density
- mortality
- replacement history

---

# 13. Tasks

Tasks should support:

- title
- type
- farm
- block
- planting
- lot
- process
- experiment
- assigned operator
- crew
- priority
- planned date
- planned time
- due date
- expected duration
- actual start
- actual finish
- sequence
- dependency
- required observations
- required measurements
- required evidence
- status
- notes

Tasks must function offline.

---

# 14. Field Sessions

An operator may start an activity/session.

Example:

```text
FIELD SESSION

Farm: Las Nubes
Block: B04
Activity: Biochar application
Operator: Juan

Started: 07:42
GPS captured
Offline
```

Everything occurring during that session can become part of its timeline.

---

# 15. Field Event Timeline

Field activity should be reconstructable chronologically.

Example:

```text
07:42 Session started
07:43 GPS captured
07:48 Photo
07:55 Task completed
08:02 Observation
08:14 Measurement
08:31 Photo
08:47 Video
09:05 Worker count changed
09:22 Session closed
```

Events may include:

- measurement
- observation
- photograph
- video
- audio
- GPS
- task completion
- sample collection
- material movement
- issue
- deviation
- selection event

---

# 16. Event Time Integrity

Distinguish:

- occurred_at
- recorded_at
- device timestamp
- synchronization timestamp

For example:

```text
Measurement performed: 14:00
Entered into phone: 14:23
Uploaded: next day 09:17
```

Those are not equivalent events.

Device clock discrepancies should be detectable after synchronization.

---

# 17. GPS

Support:

### Point

- sample
- plant
- disease observation
- infrastructure
- activity

### Area

- block
- treatment area
- affected zone

### Path

- inspection walk
- survey route

### Event location

Location where a specific action occurred.

Continuous GPS should be optional because of battery requirements.

---

# 18. Offline Mapping

Support lightweight offline farm maps.

Priority:

- farm boundaries
- block polygons
- roads
- trails
- buildings
- processing areas
- water
- sampling points

Offline vector geometry should be preferred over mandatory high-resolution satellite imagery.

---

# 19. Media Evidence

Photos, videos and audio are first-class operational evidence.

Every media asset should be capable of referencing:

- operator
- timestamp
- GPS
- farm
- block
- planting
- harvest
- lot
- process stage
- selection
- task
- experiment
- sample
- observation

---

# 20. Media Annotation

Every photo/video may support:

### Free text

Example:

> High percentage of underripe cherries from north side of block after heavy rain.

### Keywords / tags

Example:

```text
underripe
green-cherry
rain
selection
block-north
quality-deviation
```

### Structured classification

Example:

```text
Observation type: Harvest quality
Severity: Medium
Issue: Underripe fruit
```

Free text and keywords complement structured fields; they do not replace them.

---

# 21. Media Storage

Normal photographs should be compressed locally.

Preserve:

- original when required
- optimized image
- thumbnail
- metadata

Video should encourage short clips for normal field documentation.

Long/high-resolution recording should require explicit selection.

Media upload must never block field operation.

---

# 22. Voice Notes

Operators should be able to record observations verbally.

Audio is stored locally.

Later:

```text
Audio
 ↓
Sync
 ↓
Optional transcription
 ↓
Searchable text
```

Transcription must not be required for recording the observation.

---

# 23. QR Identification

QR should be the primary inexpensive physical identification technology.

QR identities may represent:

- block
- harvest container
- lot
- fermenter
- drying bed
- sample
- bag
- storage position
- equipment

Scanning must work offline against locally synchronized identities.

---

# 24. Harvest

Harvest records should support:

- farm
- block(s)
- planting(s)
- date
- cultivar(s)
- workers
- quantity
- unit
- Brix
- maturity
- quality observations
- collection method
- photos
- GPS
- operator
- timestamps

Harvest may originate from:

- one block
- multiple blocks
- one planting cohort
- multiple compatible cohorts

The provenance must survive subsequent processing.

---

# 25. Material Lot

A lot represents an identifiable quantity of material.

Material states may include:

- cherry
- selected cherry
- depulped coffee
- mucilage coffee
- wet parchment
- dry parchment
- dry cherry
- green coffee
- roasted coffee

Every lot should have:

- identity
- current material state
- quantity
- unit
- lineage
- location
- status

---

# 26. Mass Balance

Fundamental invariant:

**No unexplained lot weight change.**

A transformation must identify:

- input material
- output material
- rejected material
- measured loss where applicable

Example:

```text
186.4 kg cherry
      ↓
Flotation
      ↓
171.8 kg accepted
  8.7 kg floaters
  3.4 kg debris
  2.5 kg handling/loss
```

Mass balance:

```text
186.4 = 171.8 + 8.7 + 3.4 + 2.5
```

Tolerance rules may apply.

---

# 27. Selection Events

Selection is a first-class processing operation.

Methods may include:

- flotation
- manual cherry sorting
- ripeness sorting
- density sorting
- size grading
- color sorting
- optical sorting
- defect sorting
- screen grading
- manual green sorting
- custom method

A selection event should contain:

- input lot
- input quantity
- method
- standard used
- operator
- equipment
- time
- GPS/location
- accepted outputs
- rejected outputs
- observations
- media
- mass balance

---

# 28. Selection Outputs

Example:

```text
171.8 kg input

160.2 kg accepted ripe cherry
  6.1 kg green/underripe
  2.8 kg overripe
  1.2 kg damaged
  0.9 kg insect damaged
  0.6 kg other reject
```

Rejected material must remain traceable rather than disappearing from inventory history.

---

# 29. Admin-Defined Standards

Administrators should be able to define versioned operational standards.

Example:

```text
SPECIALTY CHERRY INTAKE v3

Accept:
ripe red
ripe burgundy

Reject:
green
underripe
dry
mold
insect damaged
foreign material

Maximum floaters: 5%
Maximum green: 2%
Maximum defective: 1%
```

Different standards may exist for:

- commercial specialty
- premium
- competition
- experimental
- specific farms
- specific cultivars
- specific processes

---

# 30. Standards Engine

Standards may eventually cover:

### Harvest
- Brix
- maturity
- defects

### Selection
- floaters
- green fruit
- defective fruit

### Fermentation
- pH
- temperature
- time

### Drying
- moisture
- water activity
- duration

### Green QC
- moisture
- density
- defects
- screen

### Storage
- temperature
- RH
- duration

---

# 31. Deviations

If a result violates a standard:

```text
Maximum floaters: 2%

Observed:
4.7%

STATUS:
OUT OF STANDARD
```

Possible actions:

- re-sort
- downgrade
- hold
- use experimentally
- reject
- administrator override

An override must contain:

- operator/admin
- timestamp
- reason
- comment

No silent bypass.

---

# 32. Lot Splitting

Example:

```text
Harvest Lot
420 kg

       ↓ split

140 kg → Washed
140 kg → Black Honey
140 kg → Experimental
```

All descendants retain original harvest provenance.

---

# 33. Lot Merging

Multiple lots may be combined.

Example:

```text
Lot A — 75 kg
Lot B — 62 kg

      ↓ merge

Lot C — 137 kg
```

Lineage must retain both source lots.

---

# 34. Multi-Farm Blends

A resulting lot may contain coffee from multiple farms.

Example:

```text
Blend BL-017

60% Las Nubes
    Lot LN-027

40% Kiva Estate
    Lot KV-119
```

Internal traceability must never collapse this to merely:

`Origin: Panama`

The complete composition must remain recoverable.

---

# 35. Lot Lineage

Lot lineage must therefore support a graph:

```text
A ──┐
    ├── D
B ──┤
    │
C ──┘
```

and:

```text
D
├── E
├── F
└── G
```

This supports arbitrary:

- split
- merge
- blend
- transformation

---

# 36. Processing

Processing must support both conventional and experimental methods.

Examples:

- washed
- natural
- honey
- black honey
- anaerobic
- submerged
- inoculated
- carbonic
- cold fermentation
- thermal treatment
- custom experimental process

Avoid rigid architecture that assumes a fixed number of processing methods.

---

# 37. Process Stages

Processes may contain configurable stages.

Example:

```text
Reception
 ↓
Flotation
 ↓
Manual selection
 ↓
Depulping
 ↓
Fermentation
 ↓
Washing
 ↓
Drying
 ↓
Conditioning
 ↓
Storage
```

Each stage may contain:

- tasks
- measurements
- observations
- standards
- evidence
- material transformations

---

# 38. Fermentation

Support measurements such as:

- pH
- Brix
- temperature
- pressure
- dissolved oxygen
- CO₂ where available
- ambient temperature

And operational variables such as:

- coffee mass
- water quantity
- tank
- inoculum
- microorganism
- dosage
- agitation
- gas management
- start/end
- observations

---

# 39. Scheduled Measurements

Protocols may specify:

```text
T0
T+6 h
T+12 h
T+18 h
T+24 h
```

Each point may require:

```text
pH          required
temperature required
Brix        optional
photo       required
aroma       required
```

The schedule must execute locally without internet.

---

# 40. Drying

Potential data:

- method
- African bed
- patio
- greenhouse
- solar dryer
- mechanical dryer
- layer depth
- coffee mass
- moisture
- water activity
- temperature
- humidity
- turning
- start/end
- duration

Drying may have multiple stages.

---

# 41. Storage

Support:

- warehouse
- room
- shelf
- bag
- GrainPro
- vacuum
- barrel
- cold storage
- freezer
- temperature
- RH
- entry
- exit
- remaining quantity

Storage movements must preserve lot identity.

---

# 42. Samples

Samples remain a canonical cross-domain concept.

Possible sample types:

- cherry
- fermenting coffee
- parchment
- green coffee
- roasted coffee
- soil
- leaf
- water
- microorganism
- fermentation media
- honey
- other agricultural materials

Avoid a separate coffee-only sample system if the existing generic architecture can support this.

---

# 43. Quality Control

Physical QC may include:

- moisture
- water activity
- density
- screen
- defects
- color
- mass

Sensory may include:

- cupping
- SCA protocols
- custom protocols
- hedonic evaluation
- descriptive sensory
- blind samples
- panelists
- replicates
- score aggregation

---

# 44. Experiment — First-Class Domain

Research is a major differentiator.

Experiment should conceptually support:

- objective
- hypothesis
- research question
- protocol
- control
- treatments
- replicates
- variables
- researchers
- observations
- measurements
- samples
- sensory
- analytical results
- media
- conclusions
- versioning

Conceptual hierarchy:

```text
Experiment
    ↓
Treatment
    ↓
Replicate
    ↓
Sample
    ↓
Measurement / Observation
```

---

# 45. Experiment + Production Integration

Experimental coffee should not leave the ordinary traceability chain.

Example:

```text
Harvest
 ↓
Cherry Lot
 ↓
Split
 ├──────────────┐
 ↓              ↓
Control       Treatment
 ↓              ↓
Process       Process
 ↓              ↓
Sample        Sample
 ↓              ↓
Cupping       Cupping
```

Both remain traceable to the original harvest.

---

# 46. Agronomy

Support activities such as:

- fertilization
- compost
- biochar
- microbial treatment
- pruning
- weed management
- pest management
- disease observation
- shade management
- irrigation
- soil amendment
- foliar application
- replacement
- soil sampling
- leaf sampling

An activity may contain:

- block
- planting
- operator
- workers
- input
- quantity
- equipment
- labor
- cost
- observations
- photos
- GPS
- weather context

---

# 47. Sensors

External sensors should be optional extensions.

Potential sources:

- Bluetooth temperature probe
- data logger
- Tilt
- digital scale
- weather station
- moisture meter

The phone may function as a field gateway:

```text
Sensor
 ↓ BLE
Phone
 ↓
SQLite
 ↓ when connected
Cloud
```

Do not require the sensor itself to have internet connectivity.

---

# 48. Auditability

Operational and scientific records should preserve:

- creator
- operator
- creation timestamp
- occurrence timestamp
- modification timestamp
- device
- source
- synchronization history

Important scientific measurements should not be silently overwritten.

Corrections should preserve:

```text
original
 ↓
correction
 ↓
reason
 ↓
operator
 ↓
timestamp
```

---

# 49. Conflict Str


**SOURCE GAP: This historical assistant message was truncated at the retrieval limit. Its remaining text was not reviewed. Reconcile with the original conversation or Claude’s existing context.**


## T010

Source turn: `cd2c4e11-59fd-414a-b5fc-b541a0e93384`


### User

proceed

### Historical assistant

:::writing{variant="document" id="84521" title="Claude Code Repository Audit v2 — Néctar Nómada Specialty Coffee Field OS"}
# Claude Code Repository Audit v2
## Néctar Nómada Specialty Coffee Field OS

You are working inside the existing Néctar Nómada repository.

Your task is to perform a **repository-wide architecture audit** against the approved product specification for the new Specialty Coffee Field OS.

Do **not** begin implementation.

Do **not** create new UI pages.

Do **not** add Prisma models yet.

Do **not** modify migrations unless a trivial non-functional correction is required to complete the audit.

The goal of this phase is to determine exactly how much of the required architecture already exists, where it can be extended safely, where duplicate concepts would be created, and what the smallest coherent implementation path should be.

---

# 1. Product Direction

The platform is evolving into a system combining:

- specialty coffee farm management
- field execution
- planning
- offline operation
- harvest
- cherry selection
- material mass balance
- lot/microlot traceability
- processing
- fermentation
- drying
- storage
- samples
- QC
- sensory
- experimentation
- agronomy
- audiovisual evidence
- geospatial observations
- reporting

The web application remains the management/control/reporting environment.

A new **offline-first Android operator application** is intended for field execution.

The mobile application must eventually work on basic Android hardware with no data connectivity for days at a time.

---

# 2. Critical Product Constraint

This is not a web application with an eventual offline mode.

The architecture must support:

```text
MANAGEMENT WEB
     │
     ↓
Cloud API / PostgreSQL
     │
     ↓
Synchronization layer
     │
     ↕
Android Operator App
     │
     ↓
Local SQLite
```

The mobile application's local database is an operational data store, not merely a cache.

Every new operational domain concept must therefore be evaluated for:

- offline creation
- local persistence
- synchronization
- globally unique identity
- conflict handling
- auditability
- partial connectivity
- selective synchronization

---

# 3. Repository Audit Scope

Inspect the repository comprehensively.

At minimum inspect:

- Prisma schema
- migrations
- seed data
- domain services
- server actions
- API routes
- validation schemas
- TypeScript types
- public/private service layers
- classification logic
- permissions
- organizations
- people/users
- locations
- projects
- samples
- assets
- media
- coffee models
- harvest models
- process models
- fermentation
- measurements
- sensory/cupping
- experiments/research
- tasks
- activities
- inventory
- products
- lots/batches
- weather
- geospatial fields
- reporting
- dashboards
- audit/change history
- test fixtures
- test coverage
- internationalization
- public Discover architecture

Search broadly.

Do not assume something is missing because its terminology differs from the product specification.

---

# 4. Canonical Existing Architecture Must Be Preserved

The platform already uses canonical concepts including:

- People
- Organizations
- Locations
- Projects
- Samples
- Assets

Preserve these wherever appropriate.

The audit must explicitly identify where new coffee/farm concepts should be:

- new models
- specializations
- relationships
- compositions of existing models
- configuration rather than schema

Avoid creating parallel concepts such as:

- a second user/person system
- a second organization system
- a second sample system
- a second media system
- a coffee-specific location system
- a second public/private classification mechanism

---

# 5. Domain Concepts to Audit

Map the current repository against the following conceptual domain.

---

## A. Farm

Determine whether Farm should be represented by:

- Location
- Project
- Organization
- a composition of these
- or a genuine new model

Farm may require:

- organization
- coordinates
- boundary
- elevation
- production area
- infrastructure
- active crops
- certifications
- management

Do not create `Farm` merely because the product specification uses that word.

---

## B. Block / Plot

Determine current support for:

- block identifier
- farm relationship
- geometry/polygon
- area
- elevation
- slope
- orientation
- soil
- shade
- crop
- irrigation
- notes
- media

Blocks must preserve historical provenance.

---

## C. Planting Cohort

Requirement:

A block may contain multiple:

- cultivars
- planting years
- plant ages
- densities

Audit whether existing models can support this.

Potential concept:

```text
Block
  ├── Planting Cohort A
  ├── Planting Cohort B
  └── Planting Cohort C
```

Do not assume `Block = Cultivar`.

---

# 6. Tasks / Planning

Audit support for:

- task templates
- task assignment
- planned start
- due date
- planned time
- actual start
- completion
- sequence
- dependencies
- priority
- responsible operator
- crew
- required observations
- required measurements
- required media/evidence
- recurrence
- completion status

Determine whether the existing platform already has a generic task/activity model.

---

# 7. Field Session

Evaluate whether current structures can support:

```text
Field Session
├── farm
├── block
├── operator
├── task/activity
├── start/end
├── GPS
└── chronological events
```

A session may represent:

- harvest
- pruning
- fertilization
- inspection
- fermentation monitoring
- drying work
- experiment execution
- sampling
- farm maintenance

---

# 8. Field Event

We need a generic chronological event architecture.

Potential field events:

- observation
- measurement
- photo
- video
- audio note
- GPS point
- sample collection
- task completion
- issue
- deviation
- selection event
- material movement

Determine whether an existing generic event/activity/observation model could serve this role.

Avoid creating many redundant specialized event tables unless justified.

---

# 9. Event Time Integrity

Audit current timestamp semantics.

We need to distinguish where appropriate:

- `occurredAt`
- `recordedAt`
- `createdAt`
- `updatedAt`
- device timestamp
- synchronization timestamp

Example:

```text
Actual measurement: 14:00
Entered on phone:   14:23
Synced to server:   next day 09:17
```

Determine whether current models can preserve this distinction.

---

# 10. Media / Assets

Audit existing Asset/media architecture deeply.

Required future field media support:

- photo
- video
- audio
- thumbnail
- compressed/derived file
- original file where required

Media should be relatable to:

- farm
- block
- planting
- harvest
- lot
- process stage
- task
- field session
- observation
- experiment
- sample

Media annotation requirements:

- free-text comments
- keywords/tags
- structured classification
- severity
- operator
- timestamp
- GPS

Determine whether the current `Asset` system can support this without duplication.

---

# 11. Harvest

Audit current harvest support.

Future harvest event should potentially record:

- source farm
- source block(s)
- source planting cohort(s)
- cultivar(s)
- date/time
- workers
- cherry weight
- maturity
- Brix
- quality observations
- GPS
- photos
- collection method
- operator

A harvest may originate from one or several source blocks.

---

# 12. Lot / Microlot

Determine what existing models correspond to:

- lot
- batch
- production lot
- material batch
- green inventory lot
- sample lot
- product lot

We need one coherent material identity/lineage architecture.

Avoid introducing another lot model if an existing one can be generalized.

---

# 13. Material State

Traceability must understand that material transforms.

Potential states:

```text
CHERRY
SELECTED_CHERRY
DEPULPED
FERMENTING
WET_PARCHMENT
DRY_PARCHMENT
DRY_CHERRY
GREEN
ROASTED
```

Determine whether this should be:

- enum
- configurable taxonomy
- process-state model
- material type relation
- existing ontology

Do not hardcode prematurely.

---

# 14. Material Mass Balance

Critical invariant:

> No unexplained material quantity change.

Audit whether existing models can record transformations with:

- input lot
- input quantity
- accepted output(s)
- rejected output(s)
- process loss
- quantity
- unit
- measurement time
- operator
- tolerance

Example:

```text
186.4 kg cherry
→ 171.8 kg accepted
→ 8.7 kg floaters
→ 3.4 kg debris
→ 2.5 kg process/handling loss
```

Determine whether current inventory/transformation models can support this.

---

# 15. Lot Lineage Graph

The system must support both:

### Split

```text
Lot A
├── Lot B
├── Lot C
└── Lot D
```

### Merge / Blend

```text
Lot A ──┐
Lot B ──┼── Lot D
Lot C ──┘
```

Also support arbitrary multistep transformation.

Explicitly determine whether the current schema can support:

- one-to-many
- many-to-one
- many-to-many lineage
- quantities contributed by source
- percentages
- provenance across farms

If not, propose the minimum generic normalized model.

Candidate concepts may include:

- `LotLineage`
- `MaterialTransformation`
- `MaterialContribution`

Do not implement yet.

---

# 16. Multi-Farm Blend

A final lot may contain coffee from multiple farms.

Example:

```text
Blend BL-017

60% Las Nubes / LN-027
40% Kiva Estate / KV-119
```

The internal lineage must preserve exact contributors.

Evaluate current architecture for this capability.

---

# 17. Selection Event

This is a first-class specialty coffee operation.

Potential methods:

- flotation
- manual cherry sorting
- ripeness sorting
- density sorting
- color sorting
- optical sorting
- size sorting
- defect sorting
- screen grading
- green sorting
- custom

Selection event must support:

- input lot
- method
- input weight
- outputs
- rejection categories
- applied standard
- operator
- time
- location
- equipment
- observations
- photos/video
- mass balance

Determine whether this belongs inside:

- generic processing stage
- material transformation
- a specialized selection model
- configurable process action

Recommend the cleanest architecture.

---

# 18. Rejected Material

Rejected material must not simply disappear.

Examples:

- floaters
- green cherry
- underripe
- overripe
- dried cherry
- damaged
- insect-damaged
- mold
- debris
- foreign material

Determine how rejected material should be modeled.

It may remain:

- traceable inventory
- waste
- secondary product
- compost stream
- discarded material

Do not assume every rejection is waste.

---

# 19. Selection / Quality Standards

Administrators should eventually define versioned standards.

Example:

```text
Specialty Cherry Intake v3

Max floaters       5%
Max green          2%
Max defective      1%
```

Standards may apply by:

- organization
- farm
- crop
- cultivar
- process
- product tier
- experiment
- customer
- competition

Audit whether current configuration/protocol systems could support this.

---

# 20. Protocols

Audit existing SOP/protocol architecture.

A protocol may define:

- stages
- order
- required tasks
- measurements
- scheduled observations
- evidence requirements
- standards
- timing
- optional/required steps

Example:

```text
T0     pH + temperature + Brix + photo
T+6h   pH + temperature
T+12h  pH + temperature + photo
```

Protocols must eventually execute offline.

---

# 21. Deviations and Overrides

Required future capability:

```text
Standard:
Floaters ≤ 2%

Observed:
4.7%

STATUS:
OUT OF STANDARD
```

Possible outcomes:

- reprocess
- re-sort
- downgrade
- hold
- use experimentally
- reject
- admin override

Overrides must record:

- actor
- timestamp
- reason
- notes

Audit existing approval/audit/change-history infrastructure.

---

# 22. Coffee Processing

Audit current process architecture.

Required flexibility includes:

- washed
- natural
- honey
- black honey
- anaerobic
- carbonic
- submerged
- inoculated
- cold fermentation
- thermal processes
- custom experimental protocols

Processes should ideally consist of configurable stages rather than hardcoded pathways.

---

# 23. Fermentation

Inspect current fermentation architecture carefully.

Future requirements may include:

- start/end
- lot
- process stage
- tank
- coffee quantity
- water quantity
- microorganism
- inoculum
- dosage
- pH
- Brix
- temperature
- pressure
- oxygen
- CO₂
- agitation
- gas management
- observations
- photos
- scheduled measurements

Do not duplicate existing fermentation concepts.

---

# 24. Time-Series Measurements

Audit whether measurements are currently generic.

We need future support for:

- pH
- temperature
- Brix
- moisture
- water activity
- RH
- pressure
- CO₂
- oxygen
- soil moisture
- soil temperature
- rainfall
- weight
- arbitrary future analytical measurements

Sources may include:

- manual
- Bluetooth sensor
- data logger
- CSV
- API
- weather station

Sensor brands should not be embedded in the core data model.

---

# 25. Drying

Audit support for:

- drying stage
- lot
- method
- location
- African bed
- greenhouse
- patio
- solar dryer
- mechanical dryer
- layer depth
- turning
- moisture
- Aw
- temperature
- RH
- duration
- observations
- evidence

---

# 26. Storage

Audit support for:

- warehouse
- room
- shelf
- bag
- container
- cold storage
- freezer
- barrel
- GrainPro
- vacuum
- location changes
- temperature
- RH
- quantity remaining
- entry/exit timestamps

Storage must preserve material identity.

---

# 27. Samples

Samples are already a canonical Néctar Nómada concept.

Audit whether current Sample architecture can represent:

- cherry
- parchment
- green coffee
- roast
- fermenting material
- soil
- leaf
- water
- microbiological sample
- honey
- fermentation media

Do not introduce coffee-specific duplicate samples.

---

# 28. QC and Sensory

Audit existing quality systems.

Potential physical QC:

- moisture
- Aw
- density
- screen
- defects
- color
- weight

Potential sensory:

- cupping
- SCA protocols
- hedonic evaluation
- descriptive sensory
- panelists
- blind samples
- replicates
- custom protocols

Quality results must connect back to exact Sample and Lot lineage.

---

# 29. Experiment Architecture

This is strategically important.

Audit current support for:

- experiment
- hypothesis
- treatment
- control
- replicate
- protocol
- variable
- observation
- measurement
- sample
- analytical result
- sensory result

Target conceptual hierarchy:

```text
Experiment
  ↓
Treatment
  ↓
Replicate
  ↓
Sample
  ↓
Measurement / Observation
```

Determine whether existing:

- Projects
- Samples
- Protocols
- Measurements
- Sensory sessions

already cover parts of this.

Propose only the minimum missing normalized concepts.

---

# 30. Experiment + Production

Experimental coffee must remain within normal production traceability.

Example:

```text
Harvest Lot
   ↓ split
Control      Treatment A      Treatment B
   ↓              ↓               ↓
Process         Process           Process
   ↓              ↓               ↓
Samples        Samples           Samples
   ↓              ↓               ↓
Cupping        Cupping           Cupping
```

Audit whether current architecture can represent this without artificial separation.

---

# 31. Agronomy

Audit support for:

- fertilization
- compost
- biochar
- pruning
- irrigation
- shade
- weed management
- pest control
- disease observation
- microbial treatment
- soil amendments
- leaf/soil sampling

Determine whether these should use generic activities/tasks or a new agronomy domain.

---

# 32. Geospatial

Audit:

- latitude/longitude
- point geometry
- polygons
- farm boundary
- block boundary
- geospatial libraries
- map components
- GIS support
- PostGIS or alternatives
- map providers

Future mobile requirements include offline vector maps.

Do not implement map changes during this audit.

---

# 33. Offline Mobile Architecture

The new operator app will likely require:

- React Native or equivalent
- Android-first deployment
- SQLite
- local files
- camera
- GPS
- QR scanning
- optional BLE
- background/foreground synchronization
- local notification scheduling

Audit the current repository structure and determine:

- whether a monorepo already exists
- whether packages can be shared
- what TypeScript domain logic could be shared
- what validation schemas can be shared
- what API contracts could be shared
- how auth currently works
- how a native app could authenticate securely
- whether the repo should become a monorepo if it is not already

Do not create the mobile app yet.

---

# 34. Low-End Hardware Constraints

All mobile recommendations must assume:

- approximately 2 GB RAM
- limited CPU
- approximately 32 GB storage
- constrained battery
- intermittent connectivity
- potentially old Android devices

Evaluate proposed technologies for:

- startup time
- memory use
- bundle size
- database size
- battery consumption
- background execution limitations

Do not recommend technologies that require flagship hardware.

---

# 35. Local Media Constraints

Photos/videos may accumulate offline for many days.

Recommend architecture for:

- local storage
- file metadata
- thumbnails
- compression
- upload queue
- retry
- resumable upload
- Wi-Fi-only media upload option
- garbage collection after verified upload

Structured data must synchronize independently of media.

---

# 36. Offline Identity

Every offline-created entity needs a globally unique identifier.

Audit current ID strategy.

Determine whether existing IDs are:

- integer
- cuid
- uuid
- uuidv7
- another scheme

Recommend whether current strategy is safe for multi-device offline creation.

Avoid requiring a server-generated ID before a record can exist.

---

# 37. Synchronization Requirements

Design analysis only.

Audit what backend infrastructure exists for future sync.

We need eventual support for:

- pull synchronization
- push synchronization
- incremental changes
- retries
- idempotency
- tombstones/deletion
- versioning
- conflicts
- media synchronization
- device identity
- server acknowledgement

Determine how much can reuse current API/service architecture.

---

# 38. Sync Conflict Categories

Recommend strategy for three categories:

### Append-Mostly

- measurement
- observation
- photo
- event

### Controlled Update

- task status
- storage position
- lot status

### Critical

- split
- merge
- inventory correction
- standard override
- classification/privacy changes

Do not default all conflicts to last-write-wins.

---

# 39. Permissions

Audit existing permission and classification architecture for roles such as:

- owner
- manager
- agronomist
- field operator
- processor
- researcher
- sensory evaluator
- roaster
- buyer
- public visitor

Operational records may be:

- private
- organization-visible
- partner-visible
- public provenance

Preserve existing classification/privacy mechanisms.

---

# 40. Auditability

Determine support for:

- creator
- modifier
- operator
- timestamps
- revision history
- change history
- import source
- device source
- corrections
- overrides

Scientific measurements should not be silently overwritten.

Recommend whether append-only correction records are needed.

---

# 41. Reporting

Audit the current reporting architecture.

Determine support and future path for:

### Farm
- planted area
- cultivar distribution
- plant age
- tasks
- activities
- labor
- costs

### Harvest
- volume
- yield/block
- cultivar
- worker
- cherry quality
- selection yield

### Processing
- mass balance
- process stages
- fermentation
- drying
- conversion ratio

### Quality
- physical QC
- sensory
- lot comparison

### Experimental
- treatment
- replicate
- measurement
- sensory
- statistics

### Traceability
- complete lineage

---

# 42. Competitive Reference Systems

Use these systems as conceptual benchmarks only.

Do not copy proprietary schemas or implementation.

## Oak

Reference for:

- estate/block management
- activities
- labor
- planning
- harvest
- specialty process tracking
- lot splits/merges
- traceability

## Cr


**SOURCE GAP: This historical assistant message was truncated at the retrieval limit. Its remaining text was not reviewed. Reconcile with the original conversation or Claude’s existing context.**


## T011

Source turn: `23ebb823-d2e4-4a73-b004-baef85ede09a`


### User

ok waiting om claude

## T012

Source turn: `d6f03c19-a7c2-4f7e-8f6d-c3090d974e0c`


### User

ok waiting on claude

### Historical assistant

Once Claude returns the audit, paste the full response here. I’ll check its claims against the architecture we defined, flag any weak assumptions or duplicate-model risks, and turn the approved result into the first implementation prompt.

## T013

Source turn: `33d6f9f6-fca1-400f-9113-68b49e1cf5e3`


### User

make a list of the softwares and links to access information and demo

### Historical assistant

Here is the shortlist I would use for our competitive research. I verified the current official pages and demo/trial options.

| Priority | Software | Why we should study it | Access / demo |
|---|---|---|---|
| **1** | [Oak Coffee Estate Management](https://oak.farm/?utm_source=chatgpt.com) | Closest overall comparison: blocks, crops, workers, activities, daily planning, harvest, specialty processing, lot management, traceability, inventory and finances. Runs on Android/iOS/web. citeturn0search2 | Official site has **Get Started**; pricing/onboarding are public. |
| **2** | [Cropster Origin](https://www.cropster.com/packages/origin-pricing/?utm_source=chatgpt.com) | Best benchmark for cherry reception, separation, processing, lots, green inventory, samples, QC, cupping and reporting. | **Free trial** available directly from the Origin page. citeturn0search3 |
| **3** | [Cropster Origin Documentation](https://help.cropster.com/origin/?utm_source=chatgpt.com) | Very useful because we can inspect workflows without buying it: processes, batches, stages, coffee separation, lot building, milling and harvest reports. | Documentation is publicly accessible. |
| **4** | [Dimitra Connected Coffee Mobile App](https://dimitra.io/connected-coffee-mobile-app/?utm_source=chatgpt.com) | Particularly important for our **low-cost Android/offline operator** design. Their documentation includes offline farm registration, plantations/seedlings and field tutorials. Android 10+ is currently specified. citeturn0search8 | Public tutorial/demo material on the official site. |
| **5** | [Cropin Demo](https://www.cropin.com/request-a-demo/?utm_source=chatgpt.com) | Best benchmark for agronomy, geotagged farms, satellite intelligence, field operations, crop monitoring, weather and larger-scale planning. | Official **Request a Demo** form. citeturn0search1 |
| **6** | [Farmforce](https://farmforce.com/?utm_source=chatgpt.com) | Important for farmer/farm/field traceability, barcode workflows, mobile field collection, supplier networks, certification and multi-farm operations. citeturn0search9 | Official site contains **Request a Custom Demo**. |
| **7** | [RedEarthOne](https://www.redearthone.com/?lang=en&utm_source=chatgpt.com) | Secondary benchmark for general farm management. Useful to compare onboarding and simpler farm UX against the enterprise systems. | Has both **Free forever** access and **Book a demo**. citeturn0search14 |

I would test them in this order: **Oak → Cropster Origin → Dimitra → Cropin → Farmforce → RedEarthOne**.

For our specific project, I would spend the most hands-on time with **Oak, Cropster and Dimitra**. Oak shows us how a mature coffee estate-management workflow is structured; Cropster shows us how specialty-coffee material, separation, lots and QC are handled; Dimitra is particularly valuable for seeing how someone else has approached Android field collection and offline operation.

One especially useful resource while we wait for Claude is [Cropster's Origin Getting Started guide](https://help.cropster.com/en_US/origin-lab/getting-started-with-cropster-origin?utm_source=chatgpt.com). It exposes details such as Supply Network entities—field, farm, association, cooperative, community, wet mill and dry mill—and the configuration of reception, coffee separation, quality formats, yield factors and error tolerances. citeturn0search5

For **Oak**, I would request access specifically saying we want to evaluate **Land & Crop, Daily Planner, Harvest & Traceability, Activities, Inventory and mobile field operation**. Their current platform explicitly includes all of those areas. citeturn0search2

For **Cropin**, request the demo around **Cropin Grow + Trace + field operations**, not their entire AI product portfolio. Their demo page specifically covers farm digitization, geotagging, QR traceability, satellite monitoring and business intelligence. citeturn0search1turn0search4

For **Farmforce**, ask to see the workflow from **farmer/farm/field → harvest/purchase → barcode → aggregation → traceability**, particularly how their mobile app behaves in weak connectivity. Their public material confirms web/mobile data collection and farmer/farm/field-level barcode traceability. citeturn0search9

I would also create a standardized **demo evaluation sheet** before we try them, so we ask every platform the same 40–60 questions—offline behavior, phone requirements, harvest weights, cherry selection, split/merge, photos/video, GPS, mass balance, standards, protocols, experiments, sync conflicts, etc. That will give us comparable evidence rather than impressions from sales demos.

## T014

Source turn: `c7cb6121-ef15-4012-b5ca-0b12c9b157a7`


### User

cc

### Historical assistant

If “cc” was accidental, no issue. If you meant something specific by it, send the rest.

## T015

Source turn: `5fec46f2-5a62-4754-bdc7-e7cba4145ae1`


### User

.l

### Historical assistant

Please continue.

## T016

Source turn: `52faced8-eb7a-49e4-9702-82cb5c7c909a`


### User

l

### Historical assistant

¿Sí? Te leo.

## T017

Source turn: `f2f65bab-5952-40e1-a19f-77908c814cd4`


### User

give me the links to the softwares suggested to study

### Historical assistant

Here are the direct official links to the software I recommend studying, in priority order:

1. **Oak — Coffee Estate Management**  
   [Oak Coffee Estate Management](https://www.oak.farm/?utm_source=chatgpt.com)  
   Closest reference for coffee estate operations: blocks, workers, activities, harvest, inventory, finances and traceability. citeturn0search16

2. **Cropster — Origin / Coffee Operations**  
   [Cropster](https://www.cropster.com/?utm_source=chatgpt.com)  
   [Cropster Origin documentation](https://help.cropster.com/en_US/origin-operations?utm_source=chatgpt.com)  
   Important for reception, batches, cherry separation, processing stages, lot building, milling, QC and coffee traceability. citeturn0search3turn0search15

3. **Dimitra — Connected Coffee / Connected Farmer**  
   [Dimitra](https://dimitra.io/?utm_source=chatgpt.com)  
   Important to investigate specifically for low-connectivity/mobile field deployment and smallholder-oriented workflows.

4. **Cropin — Grow / Trace / Apps**  
   [Cropin](https://www.cropin.com/?utm_source=chatgpt.com)  
   [Cropin Apps](https://www.cropin.com/cropin-apps/?utm_source=chatgpt.com)  
   Strong reference for geotagged farms, field operations, agronomy, farmer records, monitoring and QR traceability. citeturn0search1turn0search10

5. **Farmforce — Farm & Supply-Chain Traceability**  
   [Farmforce](https://farmforce.com/?utm_source=chatgpt.com)  
   Worth studying for multi-farm/smallholder networks, field data, compliance and farm-to-buyer traceability.

6. **RedEarthOne — Offline-first Farm Management**  
   [RedEarthOne](https://www.redearthone.com/?utm_source=chatgpt.com)  
   This one has become particularly relevant to our project because it explicitly describes an **offline-first field app** where records are captured on the handset and synchronized when signal returns. It also currently offers free access/demo options. citeturn0search4

For our project, I would personally open **Oak, Cropster, Dimitra and RedEarthOne first**. Those four give us the most useful comparison against the combination we're defining: **specialty coffee + farm operations + traceability + offline field operator**.

## T018

Source turn: `39205bb1-cb1e-48a5-a153-8e44979d0937`


### User

You are a specialist in start ups new businesses and investment with 30 years as a chief finsncial officer and now looking at selecting a project that could bank with the growth of small coffee farmers that want to Excel and have all the tools my know how , colaborations with others and technology can offer.

### Historical assistant

Viewed as an investment thesis rather than only a software project, I think there is a potentially investable business here—but I would narrow the proposition considerably.

I would not invest initially in “another coffee farm management platform.” I would invest in an **operating system that helps small and emerging specialty-coffee producers become better producers, prove what they did, improve quality, and gain access to higher-value markets.**

The timing is interesting. Coffee supports about **12.5 million farming families worldwide**, according to the International Coffee Organization. citeturn0search11 At the same time, traceability requirements are becoming materially more important: coffee remains covered by the EU Deforestation Regulation, with the principal application dates now December 30, 2026 for large/medium operators and June 30, 2027 for most micro/small operators. citeturn0search0turn0search3 World Bank work also documents a very practical problem: small coffee businesses can lack both the technical and financial capacity for compliance, while paper-based traceability is inadequate for the emerging requirements. citeturn0search50

That creates a market opening, but **compliance alone is not a sufficiently attractive company**. Compliance becomes commoditized and customers resent paying for it.

The more interesting proposition is:

> **Help a small farmer produce better coffee, operate professionally, retain institutional knowledge, demonstrate provenance and quality, and become more valuable to buyers—using equipment they can actually afford.**

That is a much stronger company.

### Where I see the opportunity

Our competitive research shows pieces of the solution already exist.

[Oak](https://www.oak.farm/?utm_source=chatgpt.com) is an important benchmark for estate management and coffee operations.

[Cropster](https://www.cropster.com/?utm_source=chatgpt.com) is the benchmark I would study for specialty-coffee processing, quality, lots and professional coffee workflows.

[Cropin](https://www.cropin.com/?utm_source=chatgpt.com) demonstrates what sophisticated agronomy, geospatial information and enterprise agricultural intelligence can become.

[Dimitra](https://dimitra.io/?utm_source=chatgpt.com) is particularly relevant to the low-connectivity/smallholder deployment problem.

[Farmforce](https://farmforce.com/?utm_source=chatgpt.com) demonstrates traceability and farmer/supply-chain management at scale.

I would **not** try to beat all five companies at everything.

I would choose a wedge they don't collectively solve particularly elegantly:

**small specialty producer → field operations → quality improvement → evidence → traceability → buyer-ready coffee.**

And I would build outward from there.

### The farmer should feel the value before the exporter does

This is crucial.

A farmer shouldn't open our app and see:

> EUDR compliance  
> ESG reporting  
> blockchain traceability  
> supply-chain analytics

Those things may matter to somebody financing or purchasing the coffee, but they are not necessarily why a producer wakes up at 5:30 a.m.

The producer should see:

```text
TODAY

Catuai Norte
Harvest starts 7:00

Block 04
Pruning overdue

Lot 26-014
Fermentation reading due 10:30

Drying Bed 3
Moisture check due

[ START WORK ]
```

That is value.

Then, without asking the farmer to become a data scientist, the same actions create the underlying traceability.

### That changes the business model

I would not rely primarily on charging impoverished farmers $20–50/month.

That creates an immediate adoption problem.

I would build a **multi-sided model**.

At the bottom:

```text
SMALL FARMER
Free / very inexpensive
```

Then:

```text
SPECIALTY PRODUCER
Professional tools
$5–15/month equivalent
```

But the economically attractive customers are higher in the chain:

```text
COOPERATIVE
PROCESSOR / BENEFICIO
EXPORTER
ROASTER
NGO / DEVELOPMENT PROGRAM
GOVERNMENT
FINANCIAL INSTITUTION
```

They pay to manage networks.

For example:

```text
Exporter
$500–2,000/month

        ↓

300 farmers

        ↓

Farm data
Harvest
Traceability
Quality
Lots
Documentation
```

Now the unit economics become more interesting.

A cooperative with 1,000 farmers doesn't necessarily want 1,000 individual subscriptions. It wants a **network operating system**.

### There is potentially an even more valuable layer

Once we have several seasons of trustworthy operational data, we begin creating something much harder to replicate.

Consider what we eventually know:

```text
Farm
+
GPS
+
Altitude
+
Variety
+
Agronomy
+
Weather
+
Harvest maturity
+
Brix
+
Selection losses
+
Processing
+
Fermentation
+
Drying
+
Green QC
+
Cupping
+
Price
```

Across thousands of lots.

Now we can begin asking:

> Which practices actually increase quality?

> Which farms are improving?

> Which producers consistently execute protocols correctly?

> Which lots are likely to cup above 85?

> Which processing approaches work for Catuai at 800 m?

> Which producers are operationally reliable?

> Which farms are candidates for financing?

That's when this stops being a simple SaaS company.

It starts becoming an **agricultural intelligence network**.

### And that opens financial services

This is where I would be particularly interested from a CFO/investor perspective.

Small farmers frequently suffer from an information asymmetry problem.

A bank sees:

```text
Small coffee farmer
No formal financial statements
Seasonal income
Agricultural risk
```

and prices the risk accordingly—or simply declines to lend.

Our system could eventually show:

```text
Farm operating history
3 seasons

Production
↑ 14%

Selection yield
↑ 9%

Quality
84.2 → 85.7 → 86.4

Buyer contracts
3

Harvest forecast
12,400 kg

Inventory
verified

Agronomic compliance
92%

Traceability
complete
```

That does **not** automatically make someone creditworthy, and I would be careful not to build an opaque "farmer credit score."

But it can create verified operating evidence that lenders currently lack.

That creates potential partnerships with:

- agricultural banks,
- microfinance,
- equipment financing,
- crop insurers,
- exporters providing pre-harvest financing,
- development banks.

And those institutions may pay for the information infrastructure rather than requiring the farmer to pay.

### Marketplace comes later

Another obvious temptation would be:

> Let's connect farmers directly with buyers.

Eventually, yes.

Not initially.

Marketplaces are difficult because they require simultaneous liquidity on both sides.

First build:

**the system producers use to produce better coffee.**

Then:

**the system buyers trust to understand that coffee.**

Then a transaction layer becomes much more defensible.

Imagine a buyer seeing:

```text
MICROLOT LN-27-041

Catuai
Las Nubes, Panama
812 m

Harvest
Jan 17

Cherry Brix
20.4°

Selection
Initial      184.6 kg
Accepted     163.2 kg
Floaters       8.4 kg
Underripe      7.2 kg
Other          5.8 kg

Process
Black Honey

Drying
17 days

Final moisture
10.4%

Cupping
86.25

[ FULL TRACEABILITY ]

[ REQUEST SAMPLE ]
```

Now the traceability has commercial value rather than being a QR-code gimmick.

### There is also an AI opportunity, but AI should not be the product

I would resist positioning this as an "AI coffee platform."

AI should sit quietly above the operational data.

For example:

> "Floaters from Block 7 increased from 3.8% to 7.1% over the last three harvests."

Or:

> "Lots dried for 15–18 days under these conditions averaged +1.2 sensory points compared with faster drying."

Or:

> "Your fermentation is approaching the temperature range associated with previous quality deviations."

That's useful AI because it acts on the producer's own data.

Eventually:

```text
OBSERVE
   ↓
MEASURE
   ↓
LEARN
   ↓
RECOMMEND
   ↓
EXECUTE
   ↓
MEASURE AGAIN
```

That feedback loop could become the real moat.

### The offline architecture is commercially important

The low-end Android/offline requirement we've been defining is not merely an engineering constraint.

It's part of the business strategy.

A system designed in San Francisco that assumes:

```text
iPhone
5G
unlimited data
constant charging
```

has structurally excluded much of the addressable producer market.

Our target is closer to:

```text
$80–150 Android
2 GB RAM
No signal
Power bank
QR labels
Camera
GPS
```

Yet that inexpensive hardware can collect remarkably sophisticated information.

That democratization is compelling.

### I would therefore define the company in three stages

**Stage 1 — Coffee Operating System**

Farm, blocks, tasks, harvest, lots, selection, processing, measurements, media, traceability and reports.

The farmer becomes operationally better.

**Stage 2 — Coffee Intelligence Network**

Benchmarking, agronomic insights, quality correlations, process recommendations, forecasting and anonymized peer benchmarking.

The farmer becomes technically better.

**Stage 3 — Coffee Economic Network**

Buyer discovery, verified lots, sample requests, financing, insurance, input procurement and potentially transaction services.

The farmer becomes economically better connected.

That sequence matters.

I would not build Stage 3 before proving Stage 1.

### The investment thesis I would test

If I were evaluating this as a new venture, my hypothesis would be:

> There is room for an affordable, offline-first specialty-coffee operating system that turns ordinary farm activities into verified production, quality and traceability data, then uses that dataset to improve producer performance and connect high-performing small farmers to buyers, expertise and eventually capital.

I would consider that sufficiently interesting to fund a **focused validation stage**, but not yet sufficiently proven for a large capital commitment.

The next work should therefore change from product ideation to **venture validation**.

We need to determine five numbers before getting carried away with development:

1. **Who actually pays?**
2. **How much will they pay?**
3. **What painful workflow causes them to adopt?**
4. **What does onboarding one farm cost us?**
5. **Does producer performance/retention improve enough that organizations keep paying?**

If those five work, the technology we've been defining can support a substantial business. If they don't, adding another 100 software features will not fix the economics.

I would make our next document a proper **Investment & Venture Thesis v1**: target customer hierarchy, TAM/SAM/SOM, competitor positioning, pricing hypotheses, farmer acquisition economics, cooperative/exporter economics, 3-year operating model, capital requirements, milestones, defensibility, risks and explicit go/no-go criteria. That would let us evaluate this project as an investment rather than becoming attached to it simply because we can build it.

## T019

Source turn: `0afcbb2e-a208-40c2-9dab-cffa01e924d0`


### User

Is this project or how to look and recelos for this to be also a selling and marketable product

### Historical assistant

Yes. I would change the framing slightly.

What we have been designing can become a marketable product, but right now it risks becoming a very sophisticated system optimized around your own operations. The commercial opportunity is to extract the **repeatable problem** from your know-how and turn that into a product other coffee producers and organizations can deploy without needing you personally.

The product should therefore not be marketed as “Néctar Nómada's farm software.” The commercial proposition is closer to:

> **An offline-first operating system for specialty coffee producers that helps farms plan work, improve processing and quality, prove traceability, and turn production data into better commercial decisions.**

That is sellable.

The crucial shift is from building features to designing a **product system** with several customer levels:

| Customer | Problem they pay to solve | Product |
|---|---|---|
| Small producer | Organize farm/harvest/process and improve quality | Free/low-cost Field App |
| Advanced specialty farm | Control microlots, experiments, QC and costs | Pro |
| Beneficio / processor | Manage many lots/producers and processing | Processing Pro |
| Cooperative | Coordinate hundreds of producers | Organization |
| Exporter | Provenance, lots, quality, supplier management | Enterprise |
| Roaster/buyer | Trusted provenance, samples, QC and sourcing | Buyer |
| NGO / government program | Digitize and improve producer networks | Institutional |
| Research organization | Experiments, protocols and datasets | Research |

This is where I think we need to research next.

We have researched **software competitors**. Now we need to research the **market itself**: who buys agricultural software in coffee, how they procure it, pricing, adoption barriers, implementation costs, what cooperatives/exporters already pay for, what farmers actually use, what fails in rural digitization, and where specialty coffee creates willingness to pay beyond commodity agriculture.

I would divide that research into four questions.

**First: Who is the beachhead customer?** My current hypothesis is that the individual small farmer is the **user**, but probably should not be the primary payer. A better first commercial customer may be a specialty exporter, beneficio, cooperative, development organization, or a larger producer managing multiple farms. They have both a financial incentive and enough resources to deploy the system to farmers.

That gives us:

```text
             CUSTOMER / PAYER
        Exporter / Coop / Beneficio
                   │
            pays subscription
                   │
                   ↓
               PLATFORM
                   │
          deploys Field App
                   │
          ┌────────┼────────┐
          ↓        ↓        ↓
       Farmer   Farmer   Farmer
```

This can produce much healthier economics than trying to collect $5 from thousands of farmers.

**Second: what is the minimum product someone will actually buy?** I don't think the answer is our entire specification.

A commercially viable V1 might only need:

```text
Farm / Producer
      ↓
Blocks
      ↓
Harvest
      ↓
Cherry reception
      ↓
Selection + weights
      ↓
Microlot
      ↓
Processing
      ↓
Measurements
      ↓
Drying
      ↓
Green lot
      ↓
QC
      ↓
Traceability report
```

plus:

```text
Offline Android
Photos
GPS
Tasks
QR
Sync
```

That alone is already a substantial commercial product.

Experiments, AI, satellite intelligence, financial services, marketplace and sophisticated agronomy can follow.

**Third: what is the measurable ROI?** This is perhaps the most important commercial question.

We shouldn't sell:

> "We provide traceability."

We should eventually be able to demonstrate things like:

> Reduce lost production records by X%.

> Reduce time spent preparing traceability reports by X hours.

> Identify processing losses worth $X per harvest.

> Increase percentage of coffee reaching premium grade.

> Reduce rejected cherry.

> Improve microlot segregation.

> Allow one manager to supervise X more producers.

> Reduce errors in farmer payments.

> Document coffee sufficiently to sell it to higher-value buyers.

Those are things customers budget for.

And our mass-balance concept becomes commercially significant here.

Imagine a beneficio processing 1 million kg of cherry annually.

If our system discovers or prevents even a **1% unexplained yield discrepancy**, that's 10,000 kg of material accounted for. Suddenly the software isn't an administrative expense—it protects economic value.

**Fourth: what becomes defensible?** Software features alone aren't enough. Oak or Cropster can add features.

Our defensibility could eventually be the combination of:

```text
OFFLINE FIELD EXECUTION
          +
SPECIALTY COFFEE DOMAIN MODEL
          +
PROCESS / MASS-BALANCE DATA
          +
QUALITY / SENSORY DATA
          +
EXPERIMENTAL DATA
          +
MULTI-SEASON HISTORY
          ↓
COFFEE INTELLIGENCE
```

The dataset becomes increasingly difficult to replicate.

A farmer who has five years of:

- block history,
- treatments,
- harvests,
- selection yields,
- processing,
- fermentation curves,
- drying,
- weather,
- green QC,
- sensory scores,
- buyers,
- prices

has a valuable digital operating history.

And if 5,000 producers use the platform, we can potentially identify patterns no individual farm could see.

That creates a genuine network/data advantage.

I would also **separate the commercial software brand from Néctar Nómada** eventually. Néctar Nómada can be the first laboratory/customer and prove the system in real production, but a Colombian cooperative or Ethiopian exporter shouldn't feel they are buying another Panamanian coffee company's internal system.

Conceptually:

```text
NEW SOFTWARE COMPANY
        │
        ├── Platform
        │
        ├── Field App
        │
        └── Intelligence
             │
     ┌───────┼────────┐
     ↓       ↓        ↓
Néctar    Coop A   Exporter B
Nómada
```

Néctar Nómada becomes **Customer Zero** and the proving ground.

That is actually advantageous because we can develop against real harvests, real workers, real fermentation, real processing and real quality outcomes instead of designing hypothetical workflows. 

### What I would research before investing heavily

We should now temporarily stop adding software requirements and conduct a **commercial validation study** covering:

- Global specialty-coffee production and number/type of addressable farms.
- Latin America first: Panama, Colombia, Costa Rica, Guatemala, Honduras, El Salvador, Peru, Brazil, etc.
- Number and economics of cooperatives, beneficios and specialty exporters.
- Existing software pricing.
- Who pays for Cropster/Oak/Dimitra/Farmforce and why.
- Adoption problems and churn.
- Rural smartphone penetration and Android hardware characteristics.
- Connectivity constraints.
- Digital literacy.
- Current workflows: notebook, Excel, WhatsApp, ERP, Cropster, paper.
- Traceability/compliance requirements.
- Buyer requirements.
- Specialty differentiation and premium realization.
- Cost of onboarding a farm.
- Training requirements.
- Support cost.
- SaaS willingness-to-pay.
- Institutional procurement.
- NGO/development funding.
- Exporter/cooperative deployment economics.

Then build a competitive positioning map:

```text
                         SPECIALTY COFFEE DEPTH
                                  ↑
                                  │
                    Cropster      │      OUR TARGET
                                  │          ★
                                  │
       Oak                        │
                                  │
GENERAL FARM ─────────────────────┼──────────────→
                                  │
             Cropin               │
                                  │
                   Dimitra        │
                                  │
                                  ↓
                         COMMODITY / GENERAL
```

But there should be another axis in our investment analysis:

```text
                    HIGH-END / CONNECTED
                           ↑
                           │
                           │
                           │
                           │
                           │
                           │
LOW-COST / OFFLINE  ←──────┼──────→ EXPENSIVE
             ★
        OUR TARGET
```

That lower-left/right positioning—**sophisticated specialty-coffee capabilities delivered through inexpensive, offline hardware**—is the hypothesis I would investigate particularly hard.

So yes: I think there is a plausible standalone product/company here. But before we decide what the commercial product should cost or how large the opportunity is, the next research should be **market validation rather than more software design**.

I can do that research as an investor-style study next: **market size → customer segmentation → competitive pricing → willingness to pay → business models → unit economics → go-to-market → 3/5-year scenarios → investment requirements → risks → go/no-go recommendation**. That would tell us whether we should build this merely for our own ecosystem or deliberately build it from day one as a sellable SaaS/platform.