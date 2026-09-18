# Néctar Nómada Platform OS — Consolidated Claude Build Packet

Release 1.0 · 16 September 2026. Read the start-here instructions first. Source transcripts accompany this document in the ZIP; external links are research sources. Each part remains independently available in the companion folder.


---

<!-- SOURCE FILE: 00-START-HERE.md -->

# Néctar Nómada — Claude continuity handoff

Prepared for Daniel and the Claude / Claude Code collaboration already building Néctar Nómada. Release 1.0 · 16 September 2026.

This packet consolidates the discovery answers into a reviewable target architecture. It supports the existing project and work in progress. It does not establish that the repository already implements these requirements, nor authorize a wholesale replacement of existing work.

## How to use it

1. Give Claude the consolidated `NECTAR_NOMADA_CLAUDE_BUILD_PACKET.md`, or the extracted folder containing this file. The consolidated document contains the authored packet and both prompts. The ZIP also includes source transcripts for provenance and ambiguity resolution.
2. Start the existing Claude Code conversation with the [Claude master prompt](nectar-nomada-build-packet/06-CLAUDE-CODE-MASTER-PROMPT.md). Ask it to perform the repository inspection and **Current State vs Target Architecture gap analysis before coding**. Preserve Claude's current sprint and unfinished changes.
3. Reconcile each gap against the actual repository, approved plans and discovery decisions. Distinguish a missing capability from an equivalent that already exists under another name. Sequence minimal changes within the current work plan.
4. After an implementation increment, use the [independent Codex verification prompt](nectar-nomada-build-packet/07-CODEX-ADVERSARIAL-VERIFICATION-PROMPT.md) against that specific commit/diff. The acceptance scenarios here are specifications, not claims of tests already passing.

## Documents

| File | Purpose |
|---|---|
| [01 — Technical build packet](nectar-nomada-build-packet/01-TECHNICAL-BUILD-PACKET.md) | Product, domains, canonical model, event and material semantics, offline architecture, governance, AI, workflows and roadmap |
| [02 — Q1–Q49 decision register](nectar-nomada-build-packet/02-DECISION-REGISTER-Q01-Q49.md) | Every discovery question, important sub-decisions and revisions, with source-turn links |
| [03 — Research and protocol library](nectar-nomada-build-packet/03-RESEARCH-AND-PROTOCOL-LIBRARY.md) | Technical and competitor references, source links, Roubik/STRI methodology and adaptation limits |
| [04 — Acceptance scenarios](nectar-nomada-build-packet/04-ACCEPTANCE-AND-ADVERSARIAL-SCENARIOS.md) | Forty concrete scenarios for implementation and adversarial review |
| [05 — Current-state and migration audit](nectar-nomada-build-packet/05-CURRENT-STATE-AUDIT-AND-MIGRATION.md) | Repository inventory, gap matrix, staged migrations, recovery and release evidence |
| [06 — Claude master prompt](nectar-nomada-build-packet/06-CLAUDE-CODE-MASTER-PROMPT.md) | Paste into the ongoing Claude collaboration; inspect first, reconcile, then implement approved increments |
| [07 — Codex verification prompt](nectar-nomada-build-packet/07-CODEX-ADVERSARIAL-VERIFICATION-PROMPT.md) | Independent schema, permissions, sync, provenance, material and migration verification |
| [08 — Prior context and continuity](nectar-nomada-build-packet/08-PRIOR-CONTEXT-AND-CONTINUITY.md) | Broader platform concepts and earlier V1/V2/V3 planning that must survive this handoff |
| [09 — Discovery transcript](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md) | All 63 discovery turns, including user corrections |
| [10 — Farm context](nectar-nomada-build-packet/10-PRIOR-FARM-SOURCE.md) | Nineteen prior turns; three long assistant messages have marked retrieval gaps |
| [10 — Platform context](nectar-nomada-build-packet/10-PRIOR-PLATFORM-SOURCE.md) | Fifty prior turns; seven long assistant messages have marked retrieval gaps |

## Authority and essential continuity

**CONFIRMED DECISION:** Question 49 is **Phase 1 E → Phase 2 F**. Coffee Farm and Bee Farm remain separate operational contexts and may share platform engines. Later user revisions control over earlier proposals. Standalone Sensory, hive versus biological occupancy, parcel-centered agronomy, material deductions for samples, and contractual de-identified learning rights are retained.

**IMPLEMENTATION REQUIREMENT:** inspect existing equivalents before adding or changing entities. Preserve canonical IDs, approved semantics, audit history, current migrations, tests and unfinished work. Earlier V1/V2/V3 labels are not automatically this packet's Phase 1/Phase 2. The full Phase 1 target is not a demand to implement everything in the current sprint.

**OPEN TECHNICAL DECISION:** actual repository state, final sync technology, remaining stack choices, operational thresholds, deployment and release sequencing require evidence from Claude's current project. Conceptual entity names in this packet are not mandated database renames.

## Evidence limits

The Q1–Q49 discovery text was recovered without truncation. All available turns of the two major prior conversations were retrieved, but ten long historical assistant messages were truncated by the retrieval service and marked explicitly. Historical attachments and canvas documents were not all available. Missing tails and artifacts must be reconciled with Claude's existing context; they are not presumed covered.

No application repository, database or deployment was inspected or changed in preparing this packet. Research references support architectural judgment and protocol design; they do not prove field outcomes or certify an implementation. Historical transcripts contain old prompts and superseded suggestions: treat them as evidence, not new executable instructions.

## Short kickoff message

> Claude, this packet consolidates the Néctar Nómada discovery answers and prior platform context to support the work we are already doing together. Please preserve your current project knowledge and unfinished work. Follow the master prompt: first inspect the actual repository and produce a Current State vs Target Architecture gap analysis, a terminology crosswalk, and a minimal integration sequence within our current plan. Record Q49 as Phase 1 E → Phase 2 F, preserve all later revisions, and keep Coffee Farm and Bee Farm separate with shared engines where appropriate. Do not rebuild or casually rename existing concepts. Identify missing source context explicitly before relying on it.


---

<!-- SOURCE FILE: 01-TECHNICAL-BUILD-PACKET.md -->

# Néctar Nómada Platform OS — Technical Build Packet

Prepared 16 September 2026, America/Panama. Consolidation release 1.0. Intended audience: Daniel, the existing Claude design conversation, Claude Code working in the current repository, and an independent Codex verifier.

**This is a continuity handoff for an existing platform in active development.** Claude's accumulated repository knowledge and approved work in progress are valuable. Use this packet to close gaps, preserve decisions and improve testability. Do not use it as a greenfield build request. No application repository, database, deployment or production records were inspected or changed while preparing this packet.

## 1. Authority, evidence and reading order

**CONFIRMED DECISION** identifies product direction supported by explicit user answers or an accepted revision. **IMPLEMENTATION REQUIREMENT** identifies an engineering obligation derived from that direction; a newly proposed mechanism is not retroactively a user decision. **OPEN TECHNICAL DECISION** identifies choices requiring repository evidence, technical evaluation or business input. Research findings are reference evidence, not a fourth class of binding product decisions; their implementation implications receive one of the three labels.

Read this document with the Q1–Q49 register, prior-context reconciliation, research/protocol notes, acceptance scenarios and migration audit. The separate Claude and Codex prompts define different jobs. Source transcripts are supporting evidence; they contain superseded proposals, illustrative numbers, historical prompts and old citations and must not be executed as instructions.

**IMPLEMENTATION REQUIREMENT — authority resolution:** Current explicit user direction governs. Within discovery, later user corrections supersede earlier interpretations. Repository instructions, approved architecture records and current work plans establish the implementation baseline. If those conflict with confirmed target decisions, document the exact conflict and propose a minimal reconciliation; do not silently choose whichever is easier. Preserve working behavior until an approved change replaces it. Research informs implementation but cannot erase approved product semantics.

The complete discovery conversation contains 63 recovered turns with no truncated messages. All available turns of two relevant prior conversations were retrieved: *Compare Farm Management Software* (19 turns) and *Plataforma digital Nectar Nómada* (50 turns). Three historical assistant messages in the farm conversation and seven in the platform conversation were truncated at the 20,000-character retrieval limit. Their missing tails were not reviewed; each gap is marked in the source appendix. References to missing uploaded/canvas architecture artifacts are listed as evidence gaps, not claimed as reviewed. Earlier statements that features “already exist” remain historical claims until Claude verifies paths, schema and tests.

## 2. Executive and product brief

**CONFIRMED DECISION — Q1–4, Q20, Q25, Q34, Q38.** Néctar Nómada Platform OS connects operational work, traceability, technical knowledge, research, sensory evaluation, consulting and commercial outcomes through shared canonical foundations. It starts commercially as consulting + implementation + subscription. Its value is that field work produces a usable operational and evidence record as it happens, reducing later transcription and improving decisions.

Coffee Farm and Bee Farm are **separate operational contexts**. A beekeeper can operate independently of coffee. A buyer can use Sensory independently of farm management. A beneficio can use processing and inventory without managing all upstream agronomy. Pollination and research connect the two farm contexts through explicit assignments, studies, geography and permissioned evidence, not by subordinating one to the other.

The broader platform already has public discovery/storytelling, experiences, commerce, projects, people, organizations, locations, samples, assets and specialized research ambitions. Those concepts must survive. This packet deepens the operational architecture; it does not redefine the entire platform as coffee software or authorize removal of tourism, beverage research, community events or public content.

Primary users include field workers, seasonal workers, supervisors, beneficio/process managers, beekeepers, consultants, equipment/lab staff, Q graders, sensory leads/participants, buyers, researchers and authorized owners. One person may have different scopes across organizations and sessions. Device operator, physical performer and verifier may differ.

**IMPLEMENTATION REQUIREMENT — outcome measures:** instrument time to complete common workflows, local-save reliability, reconstruction of lot history, reconciliation backlog, measurement completeness, overdue critical work and unauthorized-data exposure tests. Quality/yield/profit improvements must be measured against baselines and context, not promised as software outcomes. Record adoption friction and unnecessary typing during real field trials.

**OPEN TECHNICAL DECISION:** subscription packaging, rollout sites, support model, detailed billing and launch dates. Do not invent them. Target Phase 1 is substantial; it is not a claim that every capability belongs in Claude's current V1/V2 sprint.

## 3. Design principles and architecture review

| Classification | Principle | Practical consequence |
|---|---|---|
| CONFIRMED DECISION | Continue the existing platform | Inspect equivalents before creating entities, modules or routes. |
| CONFIRMED DECISION | Separate Coffee Farm and Bee Farm | Share engines; preserve navigation, protocols, biological meaning and scope. |
| CONFIRMED DECISION | Field operation without network | Capture work locally with durable identity and visible sync state. |
| CONFIRMED DECISION | Manual entry remains available | OCR, AI, sensors and cloud services cannot become prerequisites. |
| CONFIRMED DECISION | Physical identity is not just a label | Track container, material, asset, biological occupancy and location separately. |
| CONFIRMED DECISION | Preserve observations and corrections | No silent critical overwrites or fabricated measurements. |
| CONFIRMED DECISION | Human authority over standards | Suggestions do not mutate SOPs, verified values or scientific conclusions. |
| CONFIRMED DECISION | Modular standalone use | Shared foundations do not force subscriptions or irrelevant workflows. |
| IMPLEMENTATION REQUIREMENT | Reuse by semantics | A common engine is a service contract, not necessarily a universal generic table. |
| IMPLEMENTATION REQUIREMENT | Make uncertainty representable | Unknown, estimated, below detection, invalid and not applicable differ from zero. |
| IMPLEMENTATION REQUIREMENT | Separate current views from history | Current stock/location/status is derived or auditable, not the only evidence. |
| IMPLEMENTATION REQUIREMENT | Every critical invariant has a test | Requirements map to acceptance scenarios, repository code and evidence. |

**IMPLEMENTATION REQUIREMENT — final review conclusion:** the approved product architecture is coherent if shared engines enforce precise domain contracts. The main risks are ambiguous identity, over-generalized schemas, silent sync conflict resolution, missing tenancy enforcement, scientific overclaiming and uncontrolled scope. The packet addresses these with explicit invariants, source links, phase boundaries and review gates.

**OPEN TECHNICAL DECISION — deployment structure:** prior context reports a Next.js/PostgreSQL modular monolith and references Prisma. Verify the actual repository. Preserve a modular monolith where suitable; there is no decision to introduce microservices, a graph database, blockchain, a new ORM or a new mobile framework. Critical append-only ledgers can coexist with ordinary mutable records. Full-system event sourcing is not mandated.

## 4. Domain/module architecture

**IMPLEMENTATION REQUIREMENT:** The following map defines responsibilities and conceptual ownership, not required table names or package paths. Claude must produce the repository crosswalk first.

| Context/module | Owns or coordinates | Shared services and boundary |
|---|---|---|
| Platform identity/governance | Organizations, memberships, scopes, grants, agreements | All authorization decisions; no automatic cross-client access |
| Coffee Farm | Farms, parcels, microparcels, planting/management context, seasons, field activities, harvest origin | Task, map, evidence, sample, workforce and forecast services |
| Beneficio/Processing | Receiving, selection, process executions, additions, interventions and resource scheduling | Material ledger, equipment, SOP and measurement services |
| Drying/Storage | Drying runs, bed loading, trajectories, release, storage conditions | Extends existing drying rules; shares inventory and equipment |
| Inventory/Traceability | Material positions, transformations, movement, splits/merges, containers and reconciliations | One authoritative effect per physical transaction |
| Roasting/Samples | Sample roast execution, green withdrawal, roast output/loss and consumption | Integrates specialized curve systems later; no compulsory ERP rewrite |
| Sensory | Sessions, participants, protocols, blind mappings, evaluations and aggregates | Standalone; permissioned links to samples and research |
| Bee Farm | Apiaries, hive operational units, occupancies, inspections and interventions | Independent from coffee; separate Apis/stingless protocols |
| Honey | Harvest, extraction, characterization, packaging and ingredient use | Shared material ledger; biology and material ancestry remain distinct |
| Pollination/Ecology | Deployments, target flowering windows, surveys, effort and habitat | Explicit bridge between managed units, crop areas and studies |
| Research/Experiments | Designs, assignments, replicates, outcomes, deviations and analyses | Reuses sample/measurement/evidence; does not replace specialized research modules |
| Equipment/Resources | Models, assets, components, capabilities, calibration, custody and readiness | Owner/custodian/location/use are independent |
| Workforce | Workdays, performance attribution, task time and competency | Operational labor, not initially HR/payroll |
| Consulting | Adaptive interview, findings, intervention plans, implementation and verification | Permissioned cross-client portfolio; no covert ownership transfer |
| Knowledge/Evidence | Documents, versions, citations, claims, methods and standards | Rights-aware graph/relations; manual review for promotion |
| Commercial bridge | Buyer samples, reservations, fulfillment and feedback | Reuses existing Commerce/CRM; payment/accounting adapters later |
| Intelligence/AI | Extraction, retrieval, anomaly suggestions and analytical proposals | Reads authorized evidence, writes proposals through typed workflows |
| Public experience/content | Approved public projections, stories, products, events and experiences | Explicit publication; never a direct view of private operations |

**CONFIRMED DECISION:** One shared task/priority engine and common sample/analysis, evidence, asset, identity and authorization foundations are intended. **IMPLEMENTATION REQUIREMENT:** share infrastructure while keeping measurement semantics, protocols and permissions specialized. A honey moisture reading, coffee moisture reading and beverage density reading may all be measurements; their methods and conversions are not interchangeable.

## 5. Canonical entities and relationships

**IMPLEMENTATION REQUIREMENT — conceptual contracts:** Reconcile these concepts to existing models; do not mechanically create one table per row. Store typed relationships with enforced referential integrity. Avoid an unchecked `entityType/entityId` pair for critical relationships unless the repository provides equivalent integrity enforcement.

| Entity family | Minimum semantic contract and relationships |
|---|---|
| Person, User, Membership | Person may exist without login; user authenticates; membership supplies organization-scoped roles and validity. |
| Organization, Operation/Site, Project | Ownership/control and collaboration are explicit. A project may expose selected resources without merging tenant data. |
| Agreement, DataRight, ShareGrant | Purpose, scope, effective period, document version, authorized parties and withdrawal/expiry states. |
| Farm, Parcel, Microparcel, GeometryVersion | Persistent geography, dated geometry and management context; temporary subdivisions distinguish from permanent geography. |
| AnalyticalGroup, GroupMembership | Overlapping spatial/biological/experimental membership with effective dates; not a replacement parcel parent. |
| SelectedPlant/SamplingPosition | Optional persistent plant identity or temporary sampling position; context inheritance with provenance and effective dates. |
| CropContext, Season, FloweringEvent | Taxon/cultivar, planting age/density where known, management history and flowering windows. |
| HarvestBatch, ReceivingEvent | One or many geographic origins; collection/arrival time, received material state and quantities. |
| MaterialLot, MaterialPosition | Identity/state, owner, location/container, quantity, unit, status and ledger basis; legacy lot semantics mapped explicitly. |
| Transformation, InputLine, OutputLine | Many inputs/outputs with measured/estimated quantities, operation, losses/byproducts and evidence. |
| Container, ContainmentHistory | Container asset identity separate from contents; transfer/packing history and gross/tare measurements. |
| StockMovement, Reservation, Allocation | Physical quantity changes separate from commitments; holds and available-to-promise computed without double counting. |
| SOP/Protocol, Version, Execution/Run, StepExecution | Versioned definitions; execution pins a version; repeated steps have distinct identities. |
| Task, Dependency, Assignment, Exception | Planned/due/actual times, responsible people, requirements, blockers, acknowledgments and resolution. |
| Measurement, MethodVersion, QualityFlag | Value/unit, analyte/material/method, source, instrument/calibration, time, uncertainty and verification state. |
| Sample, SamplingEvent, SampleSource, Analysis | Physical quantity, aliquots/composites, custody, panel/method, lab report and structured results. |
| RoastRun, SensorySample | Exact input and roast output, loss, profile/machine, downstream portions and consumption. |
| SensorySession, Participant, Evaluation | Session purpose/protocol, evaluator role, blind access, raw cup/attribute records, submissions and derived aggregates. |
| BeeFarm, Apiary, Hive | Operational context and persistent hive unit; existing location/site models may carry BeeFarm semantics. |
| OccupancyEpisode, OptionalColony/Queen | Arrival/start/end/cause; biological continuity only when supported; no inherited biology for a new swarm. |
| HiveComponentAssignment | Reusable equipment attached to a hive during a period, independent from occupancy. |
| Inspection, Intervention, HoneyHarvest | Protocol-specific records linked to hive, occupancy when known, performer and material outputs. |
| Deployment, Placement, DeploymentMember | Temporal hive placement and purpose, target crop area/flowering period and group movement membership. |
| TaxonConcept, Identification, PollinatorObservation | Taxonomy version/confidence, managed/wild/unknown status, flower resource and observation effort. |
| Experiment, DesignVersion, ExperimentalUnit | Hypotheses, treatment allocation, control, blocking, replication, outcome definitions and protocol. |
| TechnicalProduct, ProductVersion, InventoryLot | Reference product/formulation distinct from actual supplier lot, quantity, expiry, CoA and storage. |
| EquipmentModel, Asset, Configuration | Manufacturer capability distinct from physical serialled instance and configuration history. |
| Calibration, Maintenance, CustodyTransfer | Instrument standards and results; asset condition/readiness; from/to location and responsible person. |
| Workday, WorkLog, Competency, Authorization | Attendance separate from task time; training evidence and organization-specific current permission. |
| CostEvent, AllocationRuleVersion | Original amount/currency/date, source expense, direct/shared basis, recipient quantities and rounding. |
| MediaAsset, Derivative, Annotation | Original file identity/hash, evidence purpose/context, transformations, rights, captions/tags and linkage. |
| KnowledgeDocument, DocumentVersion, Claim | Original source, locator, evidence class, applicability, reviewer and extraction provenance. |
| Finding, Recommendation, InterventionPlan | Gap severity/evidence, proposed action, baseline, execution and verification of outcome. |
| ServiceRequest, Result, Shipment, Delivery | Bounded external workflow; custody events and outcome documents linked to originals. |

**IMPLEMENTATION REQUIREMENT — temporal integrity:** A later parcel boundary, cultivar correction, instrument calibration or hive relocation must not rewrite what was known or applicable at an earlier event. Preserve both occurred/effective time and recorded/accepted time for critical history. “Inherited from microparcel” is distinct from “measured on plant.” Changing present context must not mutate past results.

**IMPLEMENTATION REQUIREMENT — common metadata:** Stable ID; owning organization or explicit shared ownership semantics; operation/site scope; source system and import ID; created/recorded/occurred times as applicable; authorship and device; version; classification/access policy; evidence references; status; data-quality state. Avoid blanket requirements for every optional field and never fabricate missing values.

**IMPLEMENTATION REQUIREMENT — typed quantities:** Decimal/fixed precision for stock and monetary quantities, with documented rounding. Preserve entered value/unit and canonical conversion. Store measurement basis, wet/dry basis where applicable, mass versus volume, method and conversion version. A 60 kg bag is a packaging convention, not an inherent mass for every bag. Regional “quintal” needs an explicit configured definition. Brix is a method-specific soluble-solids observation; it is not automatically sugar concentration in every fermented matrix. Do not convert honey Brix to moisture or coffee wet mass to dry mass without an approved method and required inputs.

## 6. Event, mass-balance, genealogy and correction model

**CONFIRMED DECISION — Q18, Q19, Q28, Q38, Q43.** Changes to physical material quantity, identity, state, location, custody or intended use must leave a traceable operational record. Critical records are amended or reversed, not silently erased.

**IMPLEMENTATION REQUIREMENT — event envelope:** Map to existing events first. A critical event needs event ID, command/idempotency ID, schema version, organization/scope, event type, target and related IDs, occurred time with offset/quality, device-recorded time, server-received/accepted time, recorder, performer, verifier when needed, device identity, base versions/preconditions, SOP/method version, reason, evidence IDs and causation/correlation IDs. Authorized amendment/reversal references its source event. Event payload version is distinct from row revision and SOP version.

**IMPLEMENTATION REQUIREMENT — command versus fact:** A request to transfer stock is a command, not proof a transfer was valid. A locally recorded physical action can be durable evidence while its ledger effect awaits reconciliation. Acceptance/rejection/conflict records preserve the command and supporting evidence. The accepted ledger and local provisional projection must be distinguishable. Rejected commands do not vanish, become accepted by retry, or block unrelated work forever.

**IMPLEMENTATION REQUIREMENT — atomicity:** Validate authorization and invariants in the transaction that records accepted input/output lines and updates/rebuilds material positions. Persist outbox notification/job triggers atomically with that transaction. A retry may happen many times, but produces one stock effect. The same idempotency key with a different payload is a conflict/error, not an update. Cross-scope transfers require explicit grants and matched records; do not grant general access by joining a genealogy graph.

### 6.1 Material accounting

For a defined operation boundary and compatible basis:

`inputs + additions = retained outputs + byproducts + documented loss/emissions + residual discrepancy`

**IMPLEMENTATION REQUIREMENT:** This is an accounting identity, not a promise that every physical stream was measured. State which streams/bases were observed; record estimates and unresolved discrepancy. Do not insert invented “loss” solely to force closure. Wet coffee transformations, evaporation, water addition/washing and fermentation gases require a declared boundary. A weighed-coffee yield report is not a complete mass balance of all process water and gas.

Measured inputs and outputs generate observed yield. Reference yield factors create estimates for planning, never substitutes for actual weights. Dry-matter calculations require relevant moisture measurements and compatible basis; sensor uncertainty and measurement precision determine tolerances approved for the process. Tolerance breaches generate a hold/reconciliation task, not a silent adjustment.

Distinguish flotation rejection, manual sorting, pulp, mucilage/washing removal, evaporation/drying, parchment/hulling, milling grades/byproducts, sampling transfer, roast loss, cupping consumption, spillage/damage, disposal and authorized stock correction. Sampling is a transfer to a sample position; it becomes consumption only when used or destroyed. Costs, physical loss and waste classification are related but separate.

**Acceptance arithmetic:** 126.000 kg green → 0.500 kg sample leaves 125.500 kg. Roast input 0.500 → 0.421 roasted + 0.079 roast loss (15.8%). Transfer 0.060 roasted to cupping leaves 0.361 roasted. Session consumption deducts from the cupping position exactly once. Gross/tare readings have their own provenance; net is derived and must not be counted in addition to gross as separate stock.

### 6.2 Genealogy and containers

**IMPLEMENTATION REQUIREMENT:** Material transformation ancestry must be traversable both directions. Prevent cycles in the material ancestry graph; movements and event-causation history have different semantics and need not be forced into the same DAG. Split edges conserve quantities; merge edges retain all parents. A container transfer is not necessarily a new material identity. A physical blend is not just several bags on one pallet. A homogeneous blend's computed source fractions are an allocation assumption; label them rather than claiming exact molecular ancestry. Unknown honey contributions cannot become equal shares by default.

Track material status (usable, reserved, quarantined, released, consumed/disposed) separately from genealogy. On-hand, available, reserved and held stock must not overlap through ambiguous accounting. Shipment moves custody/location and may change ownership according to terms; reservation itself does not reduce physical stock. Returns require condition and identity validation; do not automatically restore saleable stock.

### 6.3 Corrections and impact

**IMPLEMENTATION REQUIREMENT:** A typo in a low-risk draft can remain a normal edit. A measurement correction preserves original and corrected assertions, reason, authority, verification and evidence. A material-ledger reversal must be feasible: if downstream material was already consumed, do not simply delete the ancestor or create negative stock. Create a discrepancy/hold and an authorized compensating plan covering affected descendants. Correction to lot identity triggers impact review for samples, analyses, buyer reports and study datasets. Superseded reports retain identifiers and a visible corrected/superseded state.

**IMPLEMENTATION REQUIREMENT:** A correction for a event that never happened differs from reversing a physical action that did happen. Never erase a real movement to make a balance look tidy. Rebuild projections from accepted events and compare to stored balances. Audit administrative changes and privileged imports. Tamper-evident hashes may assist verification but do not prove that a physical measurement was true.

**OPEN TECHNICAL DECISION:** ledger tables/event storage, concurrency mechanism, projection strategy, tolerance configuration, retention, integrity hashes and EPCIS export mappings. GS1 is a useful interoperability reference, not a mandate for full EPCIS implementation or GS1 identifiers.

## 7. Offline-first synchronization and conflicts

**CONFIRMED DECISION — Q42 and prior field context.** Core field work is locally usable on inexpensive phones without data/Wi-Fi. Prior context targets low-resource Android and 7–14+ disconnected days. Manual forms, tasks, scanning/identity, observations, measurements and media must persist. Management web and field execution have different UX requirements.

**IMPLEMENTATION REQUIREMENT — local architecture:** Field UI reads a durable local operational store. An action atomically commits local evidence/provisional state and a pending command/event queue. App termination or reboot after “saved” must not lose that record. Sync uploads structured transactions first; media has a separate resumable queue. Critical metadata must not wait behind a large video. Local validation uses downloaded SOPs, schema versions, task requirements and authorization policy. Show data freshness and missing offline resources.

**IMPLEMENTATION REQUIREMENT — synchronization contract:** Each command has a globally unique client-created ID, dependencies, preconditions and schema version. Server returns accepted, already accepted, conflict, pending dependency, authorization review or validation failure, with stable machine-readable codes and understandable user action. Pull is scoped, paginated and cursor-based with durable acknowledgment. Do not advance a cursor past uncommitted local changes. Dependencies can arrive out of order; buffer/retry safely or explicitly return missing parents. Do not accept child material before its source exists and is permitted.

**IMPLEMENTATION REQUIREMENT — essential consistency boundary:** Two disconnected devices cannot both have an unqualified guarantee of exclusive use of the same 100 kg lot or smoker. Claude must select and test per operation: preallocated stock/asset authority, designated custodian, or provisional offline recording with later conflict reconciliation. Reservations made independently offline cannot both become guaranteed sales. This is a physical coordination limit; CRDT convergence or append-only logging alone does not solve it.

| Operation/conflict | IMPLEMENTATION REQUIREMENT |
|---|---|
| Independent observations/measurements | Append both with identity/provenance; do not collapse similar values as duplicates. |
| Retransmitted command | Same ID and payload yields same outcome, one effect. |
| Conflicting verified measurement corrections | Preserve alternatives; authorized reconciliation; no timestamp winner. |
| Two edits to low-risk descriptive fields | Version-aware merge where safe; retain conflict if semantics differ. |
| Two withdrawals exceeding stock | Allocation/precondition controls or provisional conflict; accepted stock cannot silently go negative. |
| Double checkout or double deployment | Exclusive operational ownership/lease or explicit conflict case; never two authoritative custodians. |
| Two task completions | Preserve both execution attempts; apply consumptions once per actual distinct action. Investigate possible duplicate physical work. |
| SOP changed while field run is offline | Run retains pinned version; new policy can flag review, not rewrite execution. |
| Authorization revoked while offline | Bounded cached authorization; no new data after revocation; quarantine unauthorized incoming actions for review. |
| Invalidated source ID/duplicate identity | Keep aliases and pending evidence; authorized reconciliation with full downstream mapping. |

**IMPLEMENTATION REQUIREMENT — clock and ordering:** Store device time/offset, server receipt and time confidence. Incorrect phone clocks cannot decide authorization or custody by themselves. Capture causal/base-version relationships; do not infer physical sequence solely from sync arrival order. Offline role expiration must use a defined trusted-time strategy; users changing phone time cannot extend privileged authorization.

**IMPLEMENTATION REQUIREMENT — offline permissions:** Selective replication delivers only needed tenant/site/role data, including attachment derivatives and search indexes. Shared-device user switching clears prior accessible views and protects cached data. Immediate revocation on a permanently offline device is impossible; define authorization leases and maximum offline privilege duration, especially for release, destructive actions, publication and data export. Capturing raw observations may remain possible when authority to finalize a critical action has expired. On reconnect preserve evidence without retroactively asserting that unauthorized work was authorized.

**IMPLEMENTATION REQUIREMENT — media durability:** Store originals, hashes, byte counts, upload progress and derivatives. A “synced record” must distinguish missing media from fully backed-up evidence. Retry chunks and verify completion/hash. Thumbnails do not replace originals. Storage warnings and capture limits must be explicit; never evict unsynced critical data silently. Users can choose short video/audio quality before capture; subsequent destructive replacement of the original is not allowed. Device loss before synchronization remains a real risk, addressed by safe export/backup options and honest status.

**IMPLEMENTATION REQUIREMENT — schema evolution:** Support a documented old/new client compatibility window, event upcasters or adapters, migration of local pending queues, and read-only/restricted states for unsupported versions. Back up local state before upgrade. Do not require clearing app storage to resolve a migration error. Keep revocation/tombstone state long enough to prevent old offline clients resurrecting deleted access or superseded data.

**OPEN TECHNICAL DECISION:** native Android versus cross-platform implementation, SQLite/Room or equivalent store, sync vendor versus custom service, operation-level preallocation, encryption/key lifecycle, map packages and offline lease length. Evaluate current code first. PowerSync, Android architecture guidance and Automerge are references; none is preselected. Collaborative text may use CRDTs if useful; material/permission invariants require explicit domain controls.

## 8. Identity, labels and scanning

**CONFIRMED DECISION — Q44:** human-readable code + QR, optional NFC; contextual scan; durable labels for field, bags, samples, honey and equipment; offline identity reconciliation. NFC is not a hardware prerequisite.

**IMPLEMENTATION REQUIREMENT:** Separate immutable internal identifier, human display code and physical tag binding. Generate globally unique IDs without a server; public display codes need collision handling and tenant scope. Temporary labels become aliases to the permanent identity, not broken foreign keys. Reprints and damaged/replaced tags preserve binding history and prevent accidental simultaneous reassignment. Scan shows object summary, current context and intended operation before consequential confirmation.

**IMPLEMENTATION REQUIREMENT:** QR/NFC is identification, not proof of authority. Tags should not expose credentials, private SOPs, prices, exact sensitive locations or client details. Public traceability links resolve only approved public projections. Guest session links need scoped, expiring/revocable access and should not be reused as permanent asset tags. Offline unknown scans support authorized local capture and later resolution; they must not trigger arbitrary URL navigation or data disclosure.

**OPEN TECHNICAL DECISION:** prefixes, label stock/printer dimensions, NFC encoding and supported readers. Existing codes and labels remain valid unless a tested migration/alias plan says otherwise.

## 9. RBAC, competency and authorization

**CONFIRMED DECISION — Q3, Q5, Q34, Q47:** role/access, competency and current authorization are independent. A person can record work performed by another person without acquiring that person's rights. Data rooms and external portals expose only bounded data.

**IMPLEMENTATION REQUIREMENT — authorization predicate:** evaluate authenticated actor + active membership + tenant/site/resource scope + action permission + data classification + current grant + required competency/authorization + risk/policy conditions. Enforce on reads and writes, exports, search, aggregates, media URLs, queues and sync. UI hiding is not enforcement. Database row policies, where used, are defense in depth and must include background/service-account paths.

| Action | Required distinction |
|---|---|
| Capture routine observation | Scoped record permission; performer attribution can be delegated. |
| Approve assisted capture | Supervisor/process authorization for the user and field; proposal stays separate. |
| Verify critical measurement | Appropriate competency and active organizational authorization; self-verification rule explicit. |
| Override execution | Authorized manager and reason; no SOP editing privilege implied. |
| Publish SOP/standard | Technical author/reviewer authority with version history. |
| Release stock/sample results | Release permission and required checks; not inferred from task completion. |
| View costs/payroll-like rates | Separate financial scope, including exports and aggregates. |
| Resolve custody/stock conflict | Authorized reconciliation action with both versions and evidence. |
| Access external service request | Only assigned sample/asset/request/results, not surrounding workspace. |
| Reveal blind sensory identity | Session-specific policy; lead may also be blinded. |
| Use data for learning/publication | Eligible agreement and approved purpose/disclosure workflow. |

**IMPLEMENTATION REQUIREMENT:** service accounts and AI tools use least-privilege scopes, not unrestricted global admin. Audit grant changes, impersonation/support access and privileged exports. Background jobs carry explicit tenant context and cannot reuse cached data across clients. Photograph check-in is condition/attendance evidence, not a requirement to deploy facial recognition.

**OPEN TECHNICAL DECISION:** exact role names, separation of duties, emergency overrides, recovery/revocation policies and external authentication provider. Preserve current roles and add policy distinctions through a migration rather than wholesale renaming.

## 10. Client governance and Néctar learning rights

**CONFIRMED DECISION — revised Q35:** appropriate data contributes to de-identified internal learning and derived methods under contractual rights. Client-identifiable records, proprietary process identity and confidential business information remain protected. Identifiable external publication requires separate authorization.

**IMPLEMENTATION REQUIREMENT — separated data paths:** client operational store → eligibility evaluation under agreement/version → de-identification/minimization → controlled analytical dataset → approved aggregate/derived knowledge → disclosure review → authorized audience. Access to manage a client's platform does not itself establish learning rights. An executed agreement and valid purpose must be demonstrable before eligible extraction. The packet specifies product intent, not a legal conclusion about existing contracts.

Preserve a restricted internal mapping from derived results to contributions for audit, correction and rights changes. This mapping must never appear in another client's reports, prompts, retrieval results or exports. Removing names is insufficient: rare cultivar, exact altitude/date, tiny geography, unusual process or low cohort size can re-identify an operation. Evaluate cohort breadth, dominance by one contributor, generalization, suppression, query differencing and repeated queries. A numeric threshold alone does not prove anonymity.

Exclude unnecessary worker identity, raw audio, faces, exact proprietary instructions and commercial secrets from learning extracts. Technical features derived from processes require policy review, not automatic copying of full SOP text. Learning rights do not automatically authorize third-party model training; classify provider processing separately and minimize transmitted data. Research publication, named case studies and marketing reuse have their own release objects.

**IMPLEMENTATION REQUIREMENT:** dataset manifests include transformation code/version, source eligibility, units, quality criteria, excluded records/reasons, time span, contributing operations count, analysis version and reviewer. Corrections, revoked/changed agreements and source deletion initiate documented downstream impact handling. Recompute or retire affected rules/datasets as appropriate; retain an auditable policy-compliant record of the change.

**OPEN TECHNICAL DECISION:** exact contract language, jurisdictional review, retention/deletion rules, confidentiality exceptions, privacy thresholds and model/dataset withdrawal obligations. Assign owners and decisions before production use; do not reopen Q35 by silently substituting a different commercial model.

## 11. Evidence, knowledge and protocol library

**CONFIRMED DECISION — Q10, Q31, Q33, Q36, Q45:** sources and raw evidence remain authoritative; extracted knowledge and media derivatives are traceable. Roubik/STRI is a named protocol reference family. Human technical approval controls promotion into standards.

**IMPLEMENTATION REQUIREMENT:** store document identity, version, source organization/author, DOI/URL, access date, publication date, license/rights, original hash and precise page/section/table locator. A source claim has text/structured parameter, units, context, evidence category, extraction method/model version, reviewer, applicability and status. Keep manufacturer specification separate from NN_MEASURED / NN_OBSERVED. CoA applies to a physical supplier lot; TDS typically describes a product/version; SDS describes safety information. A single attachment field cannot replace those distinctions.

Evidence types include published research, manufacturer guidance, approved Néctar protocol, client operational observation, controlled field experiment, aggregated observational analysis, community practice and hypothesis. These are categories with quality dimensions, not a rigid numeric ladder. Community forums can generate questions but are not automatically validated standards. Capture negative and conflicting findings.

Protocol library separates immutable source methodology from versioned Néctar adaptation and actual execution. Each adaptation lists what changed, why, expected validity limits, required training, variables/units, schedule, equipment, inclusion/exclusion, randomization, outcomes, analysis plan and approver. A citation is not an executable field protocol until methodological gaps are resolved. Detailed Roubik extraction and proposed templates are in the research appendix.

**IMPLEMENTATION REQUIREMENT:** findings may be Observation, Hypothesis, Emerging Pattern, Validated Practice, Recommended Practice, Inconclusive or Rejected/Unsupported. Promotion records evidence, thresholds/criteria, reviewer and effective date. Historical runs keep earlier versions even if later research changes recommendations. Withdrawn or contradicted knowledge remains discoverable to authorized auditors with its status, not served as current guidance.

## 12. AI architecture and guardrails

**CONFIRMED DECISION:** AI may extract, transcribe, tag, retrieve, compare, flag and suggest. It cannot silently overwrite observations, publish SOPs, assert causality or invent missing records. Manual/offline work is not dependent on AI availability.

**IMPLEMENTATION REQUIREMENT — pipeline:** original evidence → bounded extraction job → schema-validated proposal → capture-policy checks → human verification when required → authoritative record. Record model/provider/version, prompt/template version, source IDs, confidence where meaningful, tool calls, reviewer and accepted/rejected output. Preserve both raw and normalized values. Retries are idempotent and do not duplicate measurements.

Ask Néctar retrieves only authorized material, filters before retrieval and again before rendering, and cites exact source versions/locators. Separate tenant indexes or enforce equivalent tested filters. Do not let embeddings, vector metadata, filenames, cached answers, logs or aggregate endpoints bypass permissions. A scientific question may return insufficient evidence. A suggestion should state applicability, comparison population and uncertainty, not merely “AI confidence.”

Treat uploaded documents, webpages, OCR and transcripts as untrusted content. Instructions embedded in evidence cannot authorize tool use, export private data or modify records. Use typed tool schemas with server-side policy checks. Consequential actions require the same authority as direct UI actions and an explicit review step where policy requires it. No generic unrestricted SQL or admin tool for end-user AI.

**IMPLEMENTATION REQUIREMENT — analytical validity:** distinguish measured facts, computed quantities, predictions, opinions and hypotheses. Do not infer that bee presence caused cup-quality improvement from observational linkage. Preserve failures and missingness; assess confounding, selection bias, season/farm leakage in validation datasets and uncertainty calibration. No opaque employee ranking based on raw task counts. Provider costs, latency, downtime, retention and fallback behavior must be observable.

**OPEN TECHNICAL DECISION:** model/provider, on-device extraction, queue infrastructure, retrieval implementation, review thresholds, prompt-evaluation corpus and retention. No provider is selected by this packet.

## 13. Field UX and operational workflows

**CONFIRMED DECISION:** “What needs my attention now?” drives operator UX. Use simple structured forms, optional assisted capture, contextual scans and high-contrast large controls suitable for sunlight and imprecise touch. No mandatory phone ownership, NFC or continuous GPS. Manager dashboards are a different surface.

**IMPLEMENTATION REQUIREMENT — priority:** DO NOW contains actionable assigned/authorized work, ordered by criticality, deadlines and dependencies with a visible reason. NEXT contains upcoming or ready work; WAITING names the blocker and responsible next action. Derived tasks must not duplicate when events replay. A supervisor override changes an execution/assignment with reason, not the underlying SOP. Sync staleness is visible; notification acknowledgment is not task completion.

### Coffee arrival to process

1. Select or scan source harvest/container; show farm/parcel, material identity and time. Create an offline batch when necessary.
2. Capture gross/tare/net and configured required quality fields; optional media/voice is queued locally.
3. Record flotation and sorted output categories with measured quantities. Show accepted balance and unresolved discrepancy.
4. Select approved SOP/version and compatible available equipment; check sanitation/capacity and required authorization.
5. Start process run, identify addition lots and actual doses, generate monitoring tasks and capture time-series measurements.
6. Manager reviews anomalies/deviations; subsequent drying/release uses configured requirements and retains input lineage.

### Field session

Select Coffee Farm/site/parcel → start activity with performer/recorder → collect GPS if available and record accuracy → observation/photo/comment/keywords → measurements/tasks/intervention → close session. Timeline retains occurred versus entered times. A map is helpful but capture must continue when offline tiles or GPS are unavailable; location can be selected with stated uncertainty.

### Bee inspection and travel

Select Bee Farm/apiary → scan hive → show current occupancy and hardware → apply species/purpose protocol → record inspection/intervention → issue follow-ups. Asset checkout, travel and sanitation are linked but independent transactions. Absconding closes occupancy and leaves the hive asset. A new swarm starts new biology; past equipment exposure is still relevant and remains visible.

### Workday and custody

Check in → identify assignments → issue tools and consumables with condition/photo policy → perform tasks and record actual time/consumption → reconcile returns/damage/sanitation → check out. Example: 2.0 kg feed issued, 1.4 consumed, 0.6 returned. The issued quantity first moves to worker custody; only consumption reduces total usable material. Attendance does not automatically create eight hours of productive task time.

### Standalone sensory

Create session/purpose → select versioned protocol → identify or receive external samples → record preparation/roast context → invite scoped users/guests → generate blind codes and order → independent evaluation → submit/lock → aggregate compatible records → reveal/export under session policy. Identity data must be absent from participant offline datasets, not merely hidden by CSS. Sample preparation/consumption remains traceable where managed material exists.

### External service or buyer

Create request/sample → allocate and withdraw quantity → pack/label → transfer custody → recipient acknowledges → return results/report or evaluation → authorized verification → return remainder or record consumption. Reservation, shipment and delivery are separate stages with discrepancies preserved.

**OPEN TECHNICAL DECISION:** supported devices/Android versions, accessibility/contrast benchmarks, local save/scan performance budgets, session timeout and minimum cached dataset. Prior 2 GB RAM/32 GB-class hardware and 7–14+ day independence are design targets to benchmark, not proof of measured performance.

## 14. Equipment, consumables, biosecurity and resource economics

**CONFIRMED DECISION:** reusable/fixed assets, consumables and technical product reference data differ. Movable asset ownership is not custody, current location or intended use. Instrument history matters to measurement validity. Workday tracking is not full payroll.

**IMPLEMENTATION REQUIREMENT:** model equipment readiness from availability, compatible configuration, calibration, maintenance, sanitation, capacity and existing reservation/occupancy. Record manufacturer rated versus observed capacity with basis; do not compare kg to liters without a justified conversion. Version component configurations when probes, attachments or vessels change. An instrument can have multiple measurement capabilities with different calibration schedules.

Inventory inputs retain supplier, product/version, supplier lot, expiry, receipt quantity, storage requirements and CoA when relevant. Planned SOP use is a reservation/requirement; actual confirmed use creates consumption. Partial packages, returns, wastage and expired stock have explicit movements. Product retirement or a new TDS cannot rewrite historical lots.

Biosecurity policies can be unrestricted, clean-before-next-site, site-dedicated or authorization-required. Sanitation evidence records protocol, operator, method/product lot, concentration/contact conditions where required and verification. Do not infer correct disinfection from a photo alone. Clinical/chemical operating parameters are configured from approved methods, not invented by this architecture packet. Movement history supports exposure investigation without attributing causation to a shared tool.

Resource acquisition includes owned/pre-existing, bought, rented, leased, borrowed/loaned, partner/client-provided, donated, inherited/transferred, internally produced and consigned. Track actual cash cost separately from estimated economic/reproduction cost and in-kind contribution. Preserve original currency/date and conversion basis. Inventory valuation method, overhead rules and depreciation are open; the approved Phase 1 financial subset focuses on direct cost/unit, while prior broader economics remains a protected extension.

## 15. Consulting lifecycle

**CONFIRMED DECISION — Q2/Q46:** preliminary interview → scoped assessment → structured finding/evidence → baseline → proposed intervention → accepted implementation plan → tasks/SOP/training/assets/experiments → follow-up measurement → verification/unresolved finding. Distinguish “implemented” from “verified effective.” An inconclusive intervention remains reportable.

**IMPLEMENTATION REQUIREMENT:** each finding has domain, context, severity/priority, evidence, uncertainty, responsible person, recommended action, acceptance criteria and status history. Intervention approval can include budget/resources and client responsibilities. Baseline and follow-up use comparable units/methods, with differences explicitly documented. Consulting deliverables include evidence snapshots and permissions-aware exports. Portfolio views show only permitted client status and appropriately governed benchmarks.

**OPEN TECHNICAL DECISION:** exact interview branching, scoring, severity taxonomy, service packages, signature/work acceptance and billing integration. Do not claim an assessment is complete when required areas remain unexamined.

## 16. Sensory, research and experimental engine

**CONFIRMED DECISION:** shared experimental structure supports coffee/process and pollination; standalone sensory covers single-user, professional, guest/event, buyer and research contexts. Protocols and original individual results remain versioned and traceable.

**IMPLEMENTATION REQUIREMENT:** keep research project, experiment design, operational execution, sample and evaluation distinct. A design records hypothesis, primary/secondary outcomes, experimental/randomization unit, treatment/control, blocking, replication, sampling frame, inclusion/exclusion, planned schedule, masking, analysis plan and amendments. Assignments link to actual operational runs and protocol versions. Technical replicates, subsamples and independent biological/field replicates are different.

Repeated flower observations on one branch or multiple cups from one roast do not automatically increase independent sample size. Spatial spillover between hives and plots, season, cultivar, shade, age, environmental conditions and process/roast variation can confound outcomes. Record these and mark causal claims according to design strength. Baseline plus “no introduced hives” does not mean no bees: native and feral visitation remains possible.

Sensory methods support descriptive, hedonic, preference, ranking, triangle, custom and applicable professional protocols. Identify exact version and licensing/reuse rights before reproducing forms. Do not assume incompatible scales can be averaged together. Store cup-level evaluation where protocol calls for it, assessor/session context, serving order, preparation conditions, modifications and missingness. Blind code assignment/reveal is permissioned and audited. Derived means, dispersion, agreement and statistics retain dataset/algorithm versions and do not replace raw evaluations.

**IMPLEMENTATION REQUIREMENT — analysis outputs:** preserve inclusion/exclusion reasons, sample counts at each level, method/version, uncertainty and limitations. Snapshot data used for reports; corrected source records invalidate or version affected outputs. Pre-specify inference methods where research requires it; no automatic search for a statistically significant story. Roubik-inspired templates below are adaptations requiring technical review, not claimed reproductions of complete published protocols.

## 17. Phase roadmap and current-work reconciliation

**CONFIRMED DECISION:** the discovery's Phase 1/Phase 2/later labels are product commitments. Earlier V1/V2/V3 and earlier architecture “Phase 0–6” labels are different planning systems. Do not equate them. Existing functionality exceeding a phase stays; advanced functionality is not deleted to match the roadmap.

**IMPLEMENTATION REQUIREMENT — proposed sequence inside the approved target:**

| Increment | Deliverable/gate | Status |
|---|---|---|
| R0 | Current-state inventory, source crosswalk, gap analysis, current sprint compatibility and migration risk | Required before coding from this packet |
| R1 | Tenant/authorization contracts; durable identity; critical ledger/correction; offline command semantics; measurement/evidence/SOP provenance | Foundational target; exact order adjusted to existing code |
| R2 | Coffee harvest → receiving → selection → processing → drying → inventory → sample roast → sensory slice | Incremental extension of existing workflows |
| R3 | Bee Farm hive/occupancy → inspections → deployment → honey; custody/workday/consumables/biosecurity | Independent context over shared services |
| R4 | Farm programs/maps, formal pollination design, sample/lab service portal, consulting verification and commercial fulfillment | Complete remaining approved Phase 1 capabilities |
| R5 | Field pilots, long-offline/recovery/security tests, restore/export drills and operational training | Release readiness, not merely UI completeness |
| Phase 2 | Longitudinal/forecast/statistical intelligence; richer research, provider/market analytics; deeper harvest custody and integrations | Per-question scope retained in register |
| Later | Q9A full F solution engine; mature SaaS model; deferred V3 technical catalog/import depth and other explicitly scheduled extensions | No automatic current-sprint expansion |

Phase 1 explicitly includes F-level inventory/genealogy (Q18), honey genealogy (Q28), tenant foundations (Q34), standards governance (Q36 architecture), offline resilience (Q42), critical corrections (Q43) and identity (Q44). It also includes standalone Sensory, sample losses/deductions, formal pollination design, external service access and commercial fulfillment. Do not advertise the full Phase 1 release while omitting those without recording an approved staged rollout limitation.

Phasing tensions are manageable: Q31 requires design records now while Q16/Q20 deeper analyses come later; Q13's fuller transport workflow can follow while a shared custody engine serves Q38/Q48 now; Q35 rights architecture precedes validated cross-client models; Q9B product relationships do not authorize the full V3 importer; Q8 full operational model does not require an optimization solver today. Claude should return an explicit compatibility matrix instead of treating these as contradictions requiring a rewrite.

**OPEN TECHNICAL DECISION:** delivery estimates, team size, release gates by customer, missing repository capabilities and next approved increment. Estimates must follow inspection, not be invented from document length.

## 18. Integrations and API contracts

**IMPLEMENTATION REQUIREMENT:** provider adapters normalize into source-aware observations/import proposals, not direct unsupervised updates of authoritative measurements. Keep provider, upstream ID, dataset/version, fetched time, observed/valid time, coordinates/resolution, units, quality flags, rights, raw payload/hash and transformation version. Deduplicate by source identity plus version. Provider data is not on-site measurement merely because it shares a timestamp.

| Integration class | Target use | Boundary |
|---|---|---|
| Weather/stations/sensors | Context, forecasts, drying and flowering | Manual fallback; distinguish forecast/reanalysis/station observation; location/calibration retained |
| Maps/imagery/soil/biodiversity | Geography, habitat and research context | Offline rights/tiles, resolution, taxonomic certainty and licensed storage checked |
| Instruments/scales/roasters | Optional capture, curves and calibration metadata | Local manual entry remains; device IDs and method/protocol required |
| Laboratories | Requests, custody, result panels and reports | Unit/method validation and human release; no free-text result silently promoted |
| Accounting/payroll/payment | Operational-commercial handoff | Existing commerce integration reused; no duplicate general ledger/payroll |
| Literature/manufacturer catalogs | DOI/documents/TDS/SDS/CoA and technical reference | Rights-aware extraction proposals; V3 catalog depth deferred where previously deferred |
| Export/public traceability | Client data exit, buyer evidence and optional standards mapping | Authorized redacted projections; private genealogy does not imply public access |

**IMPLEMENTATION REQUIREMENT — API:** versioned contracts, input validation, tenant authorization, idempotency, optimistic preconditions, pagination/cursors, explicit quantities/units and structured errors. Webhooks are signed, replay-resistant, retried and deduplicated. Report/export jobs recheck access at execution and delivery. No API key in QR payloads or offline client bundles. Separate read scopes from mutation and admin scopes. Rate limits, payload limits and backpressure must not discard pending field evidence.

**OPEN TECHNICAL DECISION:** actual vendors, API availability, commercial licenses, contracts, quotas and adapters. Current research verifies selected references; it does not certify every historical integration list or guarantee an accessible vendor API.

## 19. Security, recovery, reporting and localization requirements

**IMPLEMENTATION REQUIREMENT — security:** scoped data access across database/services/storage/search/sync; TLS; secrets outside client bundles; device cache/key controls; upload validation; least-privilege service accounts; audit of privileged activity; safe logs without raw secrets or unnecessary client evidence. Backups and observability tooling must preserve tenant confidentiality. Threat-model shared phones, stolen devices, expired external links, public traceability URLs, prompt injection and cross-tenant jobs.

**IMPLEMENTATION REQUIREMENT — recovery:** encrypted server/database/object backups; point-in-time capability or documented equivalent; restore drills into an isolated environment; verify row counts, media hashes, genealogy and ledger balances. Server backup is not backup of unsynced phones. Preserve local queues during app upgrades and offer authorized recoverable export of pending records where feasible. Record restore cutover and reconcile device cursors/IDs so replay does not duplicate effects. Produce portable client exports with schema/version, relationships, original units and evidence manifests; an export is not validated until it can be read and reconciled independently.

**IMPLEMENTATION REQUIREMENT — reporting:** inventory as-of, genealogy forward/backward, process yield/merma, measurements/deviations, drying/release, asset custody/calibration, workday/task time, consulting gaps/outcomes, sensory raw/aggregate, research design/dataset, buyer fulfillment and direct costs. Every report states data cut time, provisional/conflicted exclusions, missing data, unit basis, filters, permission scope and calculation version. Avoid “zero incidents” when the real state is no data synced. Public/buyer reports use explicit release rules.

**IMPLEMENTATION REQUIREMENT — localization:** preserve existing languages and vocabulary; design Spanish/English text externalization and locale-safe numbers/dates/units. Store canonical instants with timezone/offset and display site/user local times. Offline schedules handle daylight-saving changes outside Panama. Decimal commas, accents, cultivar aliases and local mass units must not corrupt values or identities. Scientific taxon names and protocol versions are not translated into different identities. Accessibility and non-color-only status cues apply throughout.

**OPEN TECHNICAL DECISION — release register:** supported device/OS matrix; latency/storage targets; RPO/RTO; maximum outage/lease; backups/retention; tenant offboarding/reactivation; deletion/legal hold; API availability and rate targets; support SLAs; localization priorities and unit conventions; calibration/tolerance policies; reporting distribution; observability retention; signing and encryption implementation; tax/regulatory exports; data residency and provider exit. Each needs owner, due gate, options, evidence and acceptance criterion. Their openness is not permission to ship without the controls they govern.

## 20. Definition of completion for this handoff

**IMPLEMENTATION REQUIREMENT:** Claude's first deliverable is a repository-evidenced Current State vs Target Architecture gap analysis, not code. It maps every Q decision and requirement to existing functionality, compatible extension, gap, conflict, deferred scope or unavailable evidence. It identifies current work to preserve and the smallest safe next increment.

Only then should authorized implementation proceed incrementally, with tested migrations and traceability from requirement to code and test. Codex independently attempts to falsify integrity, offline, privacy, genealogy and audit claims against the exact commit/diff. A functioning screen, schema compilation or passing happy-path unit test alone does not establish completion.

The packet is complete as a product/engineering handoff; the application is not certified as compliant. Repository inspection, method approval, unresolved technical decisions and actual acceptance evidence remain work for the implementation process.


---

<!-- SOURCE FILE: 02-DECISION-REGISTER-Q01-Q49.md -->

# Complete discovery decision register — Q1–Q49

Classification: **CONFIRMED DECISION**, except paragraphs explicitly marked **IMPLEMENTATION REQUIREMENT** or **OPEN TECHNICAL DECISION**. “Confirmed” means approved product intent in the recovered conversation; it does not mean implemented, scientifically validated, contractually executed, or approved for immediate addition to Claude's current sprint.

Source: *Create Study Proposal*, conversation `6aa9e679-5070-83e8-869b-b232bd5b3e10`. T-numbers link to the full chronological source transcript. Each question's options appear in the preceding discussion. Letter choices are cumulative only where the original options were cumulative; the expanded descriptions below take precedence over a shorthand letter. Examples, illustrative numerical values, tentative entity names, and assistant recommendations are not universal operating limits.

## Q01 — Commercial model and learning

**CONFIRMED DECISION — D initially; C later is possible.** Start with consulting + implementation + OS subscription as an integrated service. Later allow SaaS + optional consulting/training as capabilities mature. Use successes, mediocre outcomes, failures, abandonment and inconclusive work to improve master tables, parameters, equipment/process knowledge and analysis. Separate client operational data, reference knowledge and aggregated learning; retain evidence quality. Q35 revises the early permissions framing into contractual de-identified learning rights.

Source: [T004](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t004). **OPEN TECHNICAL DECISION:** pricing, packaging, billing provider, readiness criteria for independent SaaS.

## Q02 — Adaptive assessment and cross-domain intelligence

**CONFIRMED DECISION — K, emphasizing A + C + F.** A preliminary interview determines depth across agronomy, receiving, processing, drying/storage, equipment/lab, quality/sensory, business, people, data/traceability and pollination/ecology. Connect agronomy → processing → sensory to decisions, not isolated reports. Evaluate costs, yield and market value alongside quality. A fixed “20–30 question” count was illustrative, not mandated.

Source: [T005](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t005).

## Q03 — Operator identity and shared devices

**CONFIRMED DECISION — E + shared devices + Performed by.** Role-specific views include seasonal/temporary workers. Support simple onboarding and authorized shared devices. Keep Recorded by, Performed by and Verified by distinct. Verification depends on risk/SOP, not every action. A person without their own phone/account may be attributed as performer by an authorized recorder; attribution must not impersonate authentication.

Source: [T006](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t006). **OPEN TECHNICAL DECISION:** PIN/QR/NFC assurance and device enrollment mechanism.

## Q04 — Contextual priority and execution

**CONFIRMED DECISION — F.** SOP-driven work can be adjusted by managers, with suggestions based on measurements, time, resources and dependencies. Operators primarily see **DO NOW / NEXT / WAITING**. Preserve expected versus actual workflow and reasons for significant deviations. Human authority remains explicit.

Source: [T007](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t007). **IMPLEMENTATION REQUIREMENT:** deterministic explainable priority rules must work without cloud AI; advanced scheduling remains staged by evidence and readiness.

## Q05 — Manual and assisted capture

**CONFIRMED DECISION — A + F, permission-controlled and validated.** Structured manual entry remains the reliable baseline and always available for critical measurements. Optional photo/OCR, voice, instruments and sensors populate the same structured records with provenance. Supervisors/process managers authorize capture modes by user, field, method and risk. Test paired manual/assisted observations and error magnitudes, including dangerous outliers; confidence scores alone do not establish accuracy. Raw evidence survives interpretation.

Source: [T008](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t008). **OPEN TECHNICAL DECISION:** exact capture policy, validation thresholds, providers and on-device capabilities.

## Q06 — Anomalies, validation and escalation

**CONFIRMED DECISION — F.** Apply logical validation, contextual comparison, risk-based confirmation/evidence, and supervisor escalation. Preserve unusual observations and identify the comparison population. Correct errors with original value, corrected value, actor, time and reason retained. Physically/logically invalid authoritative operations are blocked; anomalous raw evidence is retained for review.

Source: [T009](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t009). **IMPLEMENTATION REQUIREMENT:** separate quarantined observations from accepted ledger effects so preserving evidence never creates impossible stock.

## Q07 — SOP governance, deviations and experiments

**CONFIRMED DECISION — F with controlled SOP governance.** Execution authority does not grant SOP-authoring authority. A manager overrides a specific execution with reason and observations; historical runs stay pinned to the SOP version used. Néctar may suggest revisions based on repeated deviations and outcomes. Authorized technical personnel publish new versions. Support hypotheses, controls, treatments, replicates and downstream quality/sensory linkage through a shared experiment engine.

Source: [T010](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t010). Phase-specific experimental depth is clarified by Q16, Q20 and Q31.

## Q08 — Beneficio resource model

**CONFIRMED DECISION — F, full operational target.** Model equipment, zones, capacity, availability, sanitation, dependencies, labor, water, energy, throughput and cleaning/changeover. Link forecast demand to bottlenecks and eventual costs/scenarios. Manufacturer capacity and observed sustainable capacity remain separate, with conditions and evidence.

Source: [T011](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t011). **OPEN TECHNICAL DECISION:** staged scheduling/optimization implementation. F was approved as target; no separate Q08 phase split was specified.

## Q09 — Solutions and commercial relationships

**CONFIRMED DECISION — Q9A: Phase 1 B → Phase 2 D → later/third phase F.** First diagnose and show solution classes. Then compare engineering adequacy using equipment/reference evidence. Later add the complete solution engine covering scheduling, training/SOP, infrastructure, equipment and experiments, with economic comparisons. Do not collapse these three stages into two.

**CONFIRMED DECISION — Q9B: 4.** Architect for neutral comparison, disclosed distribution and other commercial models without committing to one. User reports representing Fermentis/SafCoffee and selling other Fermentis products; reselling Lallemand/others must not be labeled official distributorship without evidence. Separate technical evidence from commercial relationships and record relationship validity over time.

Sources: [T012](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t012), [T013](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t013). These business relationships are user-reported context, not externally certified in this packet.

## Q10 — Evidence-ranked recommendations

**CONFIRMED DECISION — F.** Recommendations disclose manufacturer, literature, approved Néctar SOP, client-history and aggregated-field evidence, applicability and confidence. Learning can improve suggestions but cannot silently rewrite authoritative standards. Capture successful, acceptable, failed, abandoned and inconclusive outcomes with reasons and objective data; avoid learning only from successes.

Source: [T014](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t014).

## Q11 — Geography, material identity and selected plants

**CONFIRMED DECISION — revised parcel-centered model.** Farm → Field Parcel → optional Microparcel is the ordinary operating hierarchy. Field geography is distinct from Harvest Batch and Processing Batch. Do not populate all plants individually. Flag a selected plant when needed for unusual phenotype, agronomy, samples, research, harvest or sensory traceability; preserve inherited contextual history without inventing individual measurements.

**CONFIRMED DECISION — Q11B: C.** Separate permanent geography, temporary seasonal/experimental microparcels and overlapping analytical groups. One area can participate in several studies without changing permanent geography. Composite samples and mixed-origin harvests need many-to-many provenance, with measured proportions only when known.

Revision: the earlier tree-centered expansion is superseded; optional individual traceability survives. Sources: [T015](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t015), [T016](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t016), [T017](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t017).

## Q12 — Mapping

**CONFIRMED DECISION — Phase 1 D → Phase 2 F.** Farm/parcel polygons, optional microparcels and useful rows/grids allow selection for tasks, sampling, treatments, harvest groups and studies. Selected plants remain exceptions. Phase 2 adds spatial/longitudinal layers for yield, flowering, fruit set, disease, soil/foliar analysis, interventions, pollinators, environment and quality/commercial outcomes.

Source: [T017](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t017). **OPEN TECHNICAL DECISION:** map technology, offline tiles and geometry editing/versioning.

## Q13 — Harvest identity before receiving

**CONFIRMED DECISION — Phase 1 D → Phase 2 F.** Create harvest batches in the field, link parcel/microparcel origin, label sacks/bins/containers with offline identities and receive by scan or manual lookup. Full harvest-container transport custody, departure/arrival weights, discrepancies and transfer evidence deepen in Phase 2. Phase 1 identity must already accommodate that future chain.

Source: [T018](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t018). Q38/Q48 require other custody workflows in Phase 1; this does not silently promote every Q13 detail.

## Q14 — Receiving and research sampling

**CONFIRMED DECISION — Phase 1 D → Phase 2 F.** SOP-configurable receiving fields are Required / Recommended / Optional / Not applicable. Operational receiving can vary by purpose. Advanced research sampling captures design, frame, sample size, criteria, individual/composite observations, instruments, replicates and custody. A single Brix value is not equivalent to a documented multi-cherry sample.

Source: [T019](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t019). Q31 independently requires formal pollination-study structure in Phase 1.

## Q15 — Selection and incoming quality

**CONFIRMED DECISION — Phase 1 D + E → Phase 2 F.** Record received material, flotation removals, sorting outputs by configurable defect category, accepted mass, evidence and visual standards. Compare by source, cultivar, harvest and crew/supplier where recorded. Phase 2 relates picking, selection intensity, labor, losses, process, green/sensory quality and realized value.

Source: [T020](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t020).

## Q16 — Processing and fermentation

**CONFIRMED DECISION — Phase 1 through E → Phase 2 F.** Versioned configurable SOPs, process types/steps, vessels, material mass, additions/inoculum genealogy, pH/Brix/temperature/time series, observations, monitoring tasks and anomaly handling. Processes can repeat or combine steps; do not hard-code washed/honey/natural as fixed sequences. Phase 2 expands formal comparative process experiments and outcome intelligence.

Source: [T021](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t021).

## Q17 — Drying and release

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Asset/bed assignment, loading density/layer depth, turning and measurement tasks, environment, moisture trajectory, instrument/calibration provenance, final moisture/Aw where available, stabilization and authorized release. Phase 2 adds predictions with uncertainty and evidence, including expected capacity release.

Source: [T022](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t022). Existing drying logic must be inspected and extended, not replaced by a simplified checklist.

## Q18 — Physical inventory and genealogy

**CONFIRMED DECISION — F in Phase 1.** Full material genealogy supports transformations, splits/merges, containers, locations, movements, withdrawals and downstream destinations with mass balance. A container is not a lot. Samples are physical withdrawals and receive identity; quantities cannot disappear into attachment metadata.

Source: [T023](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t023).

## Q19 — Roast samples, cupping consumption and merma

**CONFIRMED DECISION — revised Phase 1 B + D + mandatory sample inventory/mass balance → Phase 2 F.** Native sample-roast/QC and comparisons retain exact roast-to-sensory lineage. Model detailed curves as an extension; integrations/deeper curve ingestion follow. All withdrawals, hulling/parchment removal, roast loss, roasted inventory and cupping consumption affect the ledger now. Distinguish transformation loss, byproducts, sampling, consumption, damage and corrections. Full production-roastery ERP was not approved by this decision.

Source: [T024](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t024). User explicitly strengthened the original recommendation; sample accounting cannot wait for Phase 2.

## Q20 — Standalone sensory sessions

**CONFIRMED DECISION — revised standalone engine in Phase 1.** Single or multiple users; independent Q graders, buyers, roasters, clients, guests and event participants; session owner/lead/participant roles; configurable versioned methods, blinded/random codes, exact sample genealogy when available, preserved individual evaluations, notes/media, basic aggregation and export. Farm subscriptions or farm roles are not prerequisites. Unknown external sample lineage stays unknown.

Phase 2: advanced statistics/design, evaluator longitudinal profiles, agreement/repeatability, buyer preferences and cross-domain intelligence. Supersedes an internal-panel-centered interpretation. Sources: [T025](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t025), [T026](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t026).

## Q21 — Farm operations

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Geospatial observations, condition/severity and media can generate tasks/interventions. Preserve agronomic history and recurring seasonal programs for nutrition, shade, disease and sampling. Reuse the platform task/SOP/priority engines. Phase 2 connects interventions to flowering, yield, quality, sensory and economics.

Source: [T027](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t027).

## Q22 — Sample and analysis engine

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Shared sample architecture covers soil, foliar, water, tissue/genetics, microbiology, coffee and honey through configurable panels/units. Record sampling provenance, method, depth where relevant, lab/method, raw reports and verified structured results. Report extraction is optional, supervised capture. Phase 2 connects successive analyses and interventions to outcomes.

Source: [T028](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t028).

## Q23 — Costs and profitability

**CONFIRMED DECISION — Phase 1 C + direct unit economics from E → Phase 2 D + F.** Attribute inputs, services, labor/time and direct costs by parcel/batch without duplicate entry. Financial capture is optional and separately permissioned. Phase 2 adds configurable shared/overhead allocations and deeper profitability. Retain process-state denominators; cherry cost/kg is not green cost/kg.

Source: [T029](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t029). Earlier resource-economics context remains relevant; valuation algorithms remain open.

## Q24 — Rolling harvest forecast

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Human estimates plus flowering/fruit-development observations inform timing, expected volumes, labor and processing capacity. Update forecast versus actual as harvest arrives. Phase 2 adds predictive models only with sufficient longitudinal data and explicit uncertainty.

Source: [T030](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t030).

## Q25 — Standalone beekeeping

**CONFIRMED DECISION — Phase 1 C + foundations of D/E → Phase 2 F.** Beekeeping is an independent vertical with inspections, movements, interventions, feeding, equipment, tasks, costs, harvest and inventory. Basic deployment/pollination assignment and ecological links start early; integrated agricultural intelligence follows. Q26 revises mandatory colony/queen genealogy into hive-centered operations with optional biological identities.

Source: [T031](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t031).

## Q26 — Hive versus colony

**CONFIRMED DECISION — Q26A: C.** Hive is persistent operational identity; Occupancy Episode describes the bees occupying it over time. Apiary → Hive → Occupancy → optional identified colony/queen. Absconding, death or removal closes occupancy; a later swarm starts another. Reusable chambers/supers/feeders/sensors move independently. Queen status can be an observation without a queen entity. Detailed biology is optional, like selected coffee plants.

Sources: [T032](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t032), [T033](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t033). The original colony-centered proposal was challenged, then replaced; no separate Q26B approval exists.

## Q27 — Hive inspections

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Fast routine capture with purpose/species-specific structured protocols, observations, interventions and follow-ups. Include queen evidence, brood, stores, population, behavior and health observations when appropriate; do not demand invasive inspection merely because fields exist. Phase 2 adds trajectories and outcomes by occupancy.

Source: [T034](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t034).

## Q28 — Honey genealogy

**CONFIRMED DECISION — F in Phase 1.** Hive/apiary harvest → supers/containers → extraction → settling/storage → packaging and downstream mead/spirits/other transformations. Gross/tare/net, wax/cappings, filtration, losses, samples and measured characterization are traceable. Apiary-level shortcut is allowed; missing individual hive weights stay unknown or explicitly estimated, never invented.

Source: [T035](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t035). This mandates ingredient genealogy, not simultaneous implementation of every beverage production module.

## Q29 — Temporal deployment

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Preserve positions, arrival/departure, purpose, people, transport and pre/post inspection, with group moves retaining each hive identity. Link pollination assignments to target crop/area and flowering windows. Phase 2 adds spatial/longitudinal research; changing a current location field is insufficient.

Source: [T036](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t036).

## Q30 — Managed stingless bees and wild pollinators

**CONFIRMED DECISION — revised Phase 1 C + D + E foundations → Phase 2 F.** Distinguish managed Apis, managed stingless-bee units (including Trigona/Melipona where identified) and naturally occurring/free-living pollinators. Species-specific management, deployment and standardized observation coexist. Taxon is configurable; management status is separate from taxonomy. Record baseline activity before deployment and observation effort. Phase 2 studies control, Apis, stingless and mixed deployments with appropriate experimental design.

Sources: [T037](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t037), [T038](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t038). Wild pollinators are not owned inventory; wild stingless nests are not automatically managed hives.

## Q31 — Pollination experiment design and Roubik

**CONFIRMED DECISION — Phase 1 D + E → Phase 2 F.** Shared Experiment Engine records hypothesis, experimental unit, treatment/control, replication, sampling, frequency, criteria and predefined outcomes plus cultivar, age, flowering, shade, weather, habitat, agronomy and baseline pollinators. Phase 2 extends the full outcome chain through coffee/sensory. David W. Roubik/STRI Panama Coffea arabica methodology is a named reference family in a versioned Pollination Protocol Library.

Sources: [T039](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t039), [T040](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t040). **IMPLEMENTATION REQUIREMENT:** separate published methods from Néctar adaptations; source findings are not guaranteed local outcomes.

## Q32 — Environmental monitoring

**CONFIRMED DECISION — Phase 1 D + E → Phase 2 F.** Manual observations, external weather, site stations and individual sensors are distinct sources. Retain placement, time, method/calibration and integration into farm, bee, processing and drying events. Hardware is optional. Phase 2 provides contextual environmental intelligence.

Source: [T041](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t041).

## Q33 — Knowledge and evidence graph

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Documents have source, author, organization, date/version, topic and DOI/URL; link to methods, assets, products, SOPs, experiments and recommendations. Extracted fields remain source-linked proposals until verified. Phase 2 Ask Néctar answers from authorized evidence with citations and evidence distinctions. Existing Ask Néctar functionality is preserved and audited, not removed because of this phasing.

Source: [T042](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t042).

## Q34 — Organizations and collaboration

**CONFIRMED DECISION — F architecture from Phase 1.** Multi-operation organizations, people with different memberships/roles, explicitly scoped external collaborators and bounded project/data rooms; consulting portfolio over permitted data. Ownership and access differ. Advanced portfolio intelligence can follow without retrofitting isolation.

Source: [T043](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t043).

## Q35 — Contractual learning rights, revised

**CONFIRMED DECISION — revised model, replacing the earlier opt-in framing.** Protect identifiable client operations, documents, proprietary process identity and confidential commercial information. Agreements establish Néctar rights to appropriate de-identified internal learning, aggregation, benchmarking, model/method development and service improvement. Derived knowledge retains internal provenance; external disclosure must not reveal contributors or reproduce proprietary recipes. Identifiable publication/case studies are separately authorized.

Sources: [T044](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t044), [T045](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t045). **IMPLEMENTATION REQUIREMENT:** eligibility must be backed by an applicable agreement/version; product intent is not proof that an agreement has been signed. **OPEN TECHNICAL DECISION:** disclosure thresholds, retention and rights-change handling.

## Q36 — Promoting knowledge to standards

**CONFIRMED DECISION — F with mandatory technical approval.** Observation → Hypothesis → Emerging Pattern → Validated Practice → Néctar Recommended Practice, with Inconclusive and Rejected/Unsupported states. Evidence quantity/diversity/quality and applicability boundaries matter. Authorized humans promote versioned SOPs, ranges, protocols or rules; AI cannot do this silently.

Source: [T046](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t046).

## Q37 — Measurement quality

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Asset/model/serial/manuals; calibration/maintenance with standards/buffers, lot/expiry, operator and evidence; measurement links to instrument, method, sample and historical calibration status. Preserve but flag questionable measurements. Phase 2 analyzes drift, inter-instrument differences and uncertainty; use this foundation for assisted-capture validation.

Source: [T047](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t047).

## Q38 — Consumables plus asset custody, revised

**CONFIRMED DECISION — Phase 1 E + Asset Custody & Movement.** Inputs, operational consumables, manufacturer lots/expiry, expected versus confirmed actual consumption, reusable/fixed assets, check-out/in, custody/location history, employee attribution, condition and optional/SOP-required photos. Coffee Farm and Bee Farm remain separate operational contexts even when people/assets cross sites. Separate owner, custodian, location and usage. Returns reconcile issued versus consumed amounts.

Phase 2 adds procurement forecasting, utilization, loss/damage, maintenance and logistics intelligence. Source: [T048](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t048).

## Q39 — Operational workday

**CONFIRMED DECISION.** Attendance/check-in/out, optional or required evidence, assigned site/tasks, equipment/supply issue and return, work attribution and labor allocation. Attendance time is not automatically productive task time. Initially stop short of full HR/payroll; later integration remains possible.

Source: [T049](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t049).

## Q40 — Sanitation and biosecurity

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Cleaning/dirty/unavailable status, movement policies, sanitation SOP execution, product/method/concentration where applicable, time/person/evidence and biological-context rules. Apply to relevant tools, instruments, PPE and people. Capture history now; Phase 2 reconstructs possible exposure paths without declaring causation.

Source: [T050](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t050).

## Q41 — Alerts and escalation

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Role- and severity-based notifications with SOP escalation, acknowledgment and resolution. Actual work remains a task/exception, not a disappearing notification. Phase 2 adds intelligent grouping and prioritization while preserving underlying events.

Source: [T051](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t051).

## Q42 — Distributed offline operation

**CONFIRMED DECISION — F as foundational Phase 1 architecture.** Durable offline creation, visible sync state, no silent overwrite, append-first operational events, authorized conflict resolution retaining versions/authors/devices/times, resilient IDs, inventory and custody reconciliation. Sophistication can be incremental; identity and sync semantics cannot be postponed.

Source: [T052](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t052). **IMPLEMENTATION REQUIREMENT:** clearly distinguish locally recorded, provisional and globally accepted actions; unrestricted disconnected devices cannot guarantee exclusive use of the same physical stock/asset without allocation or later reconciliation.

## Q43 — Risk-based corrections

**CONFIRMED DECISION — F for critical records, not universal immutability.** Low-consequence edits stay simple. Operational records retain correction history. Critical measurements, research, custody, inventory and genealogy require amendments/reversals with reason and risk-appropriate authority. Never silently erase original critical evidence.

Source: [T053](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t053).

## Q44 — Identity, QR and NFC

**CONFIRMED DECISION — F in Phase 1.** Human-readable IDs plus QR by default, optional NFC, workflow-context scanning, purpose-specific label templates and temporary-to-permanent offline reconciliation. Original field identity remains resolvable. Machine-readable identity is never the only identity.

Source: [T054](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t054). **OPEN TECHNICAL DECISION:** identifier syntax/prefixes; proposed CF/AP/H/HB/PB/SMP/EQ examples were not locked.

## Q45 — Media evidence

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Attach contextual author/time/object/location where available, purpose, annotations and optional AI extraction under capture policy. Preserve original media; compression, edits, annotations and transcripts are derivatives with provenance. Phase 2 adds longitudinal visual comparison and deeper computer vision.

Source: [T055](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t055).

## Q46 — Consulting implementation lifecycle

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Structured findings with severity, evidence and recommendations produce projects/tasks, equipment needs, SOP changes, training or experiments. Establish baselines and verify outcomes: gap → evidence → intervention → implementation → follow-up → result. States include open/planned/underway/implemented/verified/unresolved. Phase 2 learns across eligible engagements.

Source: [T056](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t056).

## Q47 — Competency and authorization

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Separate access role, demonstrated/trained competency and current organizational authorization. Support training, renewal/reassessment and SOP-enforced requirements for sensitive actions/verification. Phase 2 studies measurement consistency and training effectiveness without simplistic automated employee scores.

Source: [T057](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t057).

## Q48 — External services

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Contacts → service requests → sample/asset custody → results/documents → verification → return or consumption. Limited external links/accounts allow receipt/results/actions without exposing unrelated client data. Reuse permissions, evidence and material engines. Phase 2 adds provider turnaround, costs, methods and performance intelligence.

Source: [T058](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t058).

## Q49 — Commercial traceability

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Phase 1 includes destination/buyer, quantity/format/price/currency/date/basic terms, reservation/allocation without premature stock removal, exact buyer-sample genealogy and feedback, packaging/containerization, shipment and delivery. Phase 2 analyzes quality/process/origin, buyer feedback, price, repeat purchase and production cost. This is an operational-commercial bridge; not an instruction to build full accounting/CRM or replace existing Commerce.

Source: question options in [T058](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t058); explicit final approval in [T060](nectar-nomada-build-packet/09-DISCOVERY-SOURCE-TRANSCRIPT.md#t060), reaffirmed by the current packet request. No unresolved Q49 vote remains.

## Revision controls Claude must preserve

**CONFIRMED DECISION:** Q5 manual plus optional assisted capture; Q9A three-stage progression and Q9B commercial-neutral architecture; Q11 parcel-centered correction plus Q11B C; Q19 sample deductions now; Q20 standalone sensory; Q26A hive/occupancy revision; Q30 managed stingless-bee revision; Q35 replacement of opt-in with contractual learning rights; Q38 expansion beyond consumables plus Coffee/Bee context separation; Q49 explicit E → F.

**IMPLEMENTATION REQUIREMENT:** If repository terminology differs, map semantics first. Do not treat an older assistant proposal in the source transcript as superseding a later user correction. New technical choices need their own architecture decision record and must not be backfilled into this register as if the user had selected them.


---

<!-- SOURCE FILE: 03-RESEARCH-AND-PROTOCOL-LIBRARY.md -->

# Targeted current research and protocol library

Research checked 16 September 2026. This is a targeted architecture/scientific review, not a systematic literature review or hands-on certification of vendor products. Vendor statements are identified as vendor claims. Public page access does not imply API access, permission to reproduce documents, or a commercial license. Source links below replace the opaque historical citation markers in the discovery transcript.

## 1. Architecture reference review

| Source and evidence | Relevance to Néctar | Classification and consequence |
|---|---|---|
| [Ink & Switch — Local-first software](https://www.inkandswitch.com/essay/local-first/) (2019 research essay) describes offline use, local ownership and collaboration goals. | Useful design philosophy; local responsiveness is more than a cached webpage. | **IMPLEMENTATION REQUIREMENT:** durable local work and user-visible synchronization; **OPEN TECHNICAL DECISION:** implementation stack. The essay does not choose Néctar's inventory conflict policy. |
| [Android Developers — Build an offline-first app](https://developer.android.com/topic/architecture/data-layer/offline-first) describes local/network data sources, local reads and different write strategies. | Matches low-connectivity field operations and durable deferred writes. | **IMPLEMENTATION REQUIREMENT:** separate local storage, network reconciliation and UI. Native Android/Room/WorkManager are candidates if compatible, not imposed replacements. |
| [PowerSync — Custom conflict resolution](https://docs.powersync.com/handling-writes/custom-conflict-resolution) exposes application-defined handling of queued writes/transactions. | Candidate synchronization infrastructure; business conflict handling remains an application concern. | **OPEN TECHNICAL DECISION:** evaluate tenancy, queue failure behavior, atomic operations, migrations, licensing, hosting and exit. Do not assume a sync product automatically validates balances or custody. |
| [Automerge — Conflicts](https://automerge.org/docs/reference/documents/conflicts/) documents deterministic convergence and inspection of conflicting property values. | Relevant to collaborative drafts/text; useful warning that a visible deterministic value is not necessarily a domain-authorized resolution. | **IMPLEMENTATION REQUIREMENT:** never treat convergence alone as approval of inventory, role, measurement or custody conflicts. CRDT adoption is open. |
| [GS1 EPCIS 2.0.1](https://ref.gs1.org/standards/epcis/2.0.1/) defines event structures including transformations and error declarations; [implementation guideline](https://ref.gs1.org/guidelines/epcis-cbv/2.0.0/) gives usage patterns. | Useful reference for input/output events, business context and corrective history. | **IMPLEMENTATION REQUIREMENT:** map internal semantics before export. **OPEN TECHNICAL DECISION:** EPCIS interchange scope, identifier mapping and conformance version. No GS1 membership, certification or blockchain decision is implied. |

**IMPLEMENTATION REQUIREMENT — architecture synthesis:** use a local operational database and explicit domain commands with append-first evidence. Separate tentative field records from accepted resource effects. Keep relational constraints and authorization authoritative at acceptance, with suitable offline allocation policies. This is this packet's engineering synthesis, not a direct recommendation from any one source. Retain the repository's compatible implementation; reject blanket last-write-wins for critical business facts.

## 2. Coffee/farm and apiary benchmarks

| Reference | Currently documented capability | What to study; limitation |
|---|---|---|
| [Cropster Origin — Create processes](https://help.cropster.com/en_US/origin-operations/how-to-create-processes), updated January 2026 | Processing methods, received/stored states, yield factors and stages. | Compare configuration and flow. A reference yield factor must not replace Néctar's measured ledger. |
| [Cropster Origin — Getting started](https://help.cropster.com/en_US/origin-lab/getting-started-with-cropster-origin), updated February 2026 | Supply network, mill permissions, weight units, separation modes and error tolerance. | Useful receiving/quality UX. No claim here that Origin currently supports the required long-offline Android workflow. |
| [Cropster — Lot building](https://help.cropster.com/en_US/origin-operations/lot-building) | Batches grouped into lots for green inventory. | Compare material grouping semantics; do not copy table names or infer API rights. |
| [Oak — Estate platform](https://oak.farm/), [harvest and traceability](https://www.oak.farm/features/harvest-traceability) | Vendor describes attendance, activities, land/crops, inventory/machinery and specialty processing with split/merge and traceability. | Benchmark farm/worker/context workflows and common terminology. Features are vendor-described; performance/offline guarantees were not independently tested. |
| [Oak — Ant weighing scale](https://www.oak.farm/features/ant-weighing-scale) | Vendor documents connected weighment, offline queue and optional identification/printing hardware. | Study hardware fallbacks. Néctar has not approved biometric attendance or mandatory proprietary hardware. |
| [Dimitra — Connected Coffee mobile app](https://dimitra.io/connected-coffee-mobile-app/) | Public mobile-app/tutorial material for connected-coffee workflows. | Useful onboarding/field benchmark. Device minimums, API access and full disconnected-operation coverage require direct verification before selection. |
| [Farmforce — Origin](https://farmforce.com/products/information-management-system-ims/), [Farm Africa case study](https://farmforce.com/case-studies/farm-africa-case-study/) | Vendor describes bag identification/genealogy; case study describes offline field and aggregation workflows, including delayed synchronization. | Useful first-mile coordination reference. Stale supervisor data is an operational condition to show explicitly; marketing claims are not integrity proofs. |
| [Nectar Technologies](https://nectar.buzz/en/) | Vendor describes hive tags with readable codes/QR/NFC/RFID, task reports, maps, movement/history and pollination logistics. | Study field scanning, group movement and crew coordination. This is a separate company, not Néctar Nómada. Its internal schema, offline conflict guarantees and stingless-bee suitability were not established. |
| [BEEP Foundation](https://beep.nl/) | Digital inspection records, configurable hive cards and optional sensor measurements including weight/temperature/sound. | Study inspection and sensor/evidence integration. Do not infer managed Meliponini support or long-offline durability from the page. |
| [Fermentis — SafCoffee Deep Amber](https://fermentis.com/en/product/safcoffee-deep-amber/) | Manufacturer describes a yeast/enzyme blend and context-dependent trial outcomes. | Demonstrates why product composition, manufacturer claims and measured field results must be distinct. No manufacturer dose becomes a universal Néctar SOP without reviewed context. |

**IMPLEMENTATION REQUIREMENT — competitive synthesis:** study these as workflow references, not feature-ranking proof. The intended differentiation is the connected operational/research/consulting chain, with separate farm contexts and protected learning. This review does not establish that no competitor has any given feature. Earlier star ratings and claims about discontinued apps are not adopted without fresh evidence. Cropin and RedEarthOne remain historical research leads; no current feature assessment is asserted here.

**OPEN TECHNICAL DECISION — targeted demo script:** ask selected vendors to demonstrate two offline devices withdrawing from one lot, a rejected transaction that does not block all syncing, retained originals, a corrected ancestor affecting downstream samples, a new swarm in old equipment, permission revocation on a shared phone, blind participant data exports, and a full customer data exit. Public feature pages do not answer those questions.

## 3. Panama-specific architecture research

[Cano and colleagues — Precision Agriculture Management System and Traceability Architecture in Specialty Coffee Farms in Chiriquí, Panama](https://www.mdpi.com/2076-3417/16/5/2399), *Applied Sciences* 16(5), 2399 (2026), DOI [10.3390/app16052399](https://doi.org/10.3390/app16052399).

The paper presents georeferenced coffee-sample collection, an edge/cloud architecture and laboratory spectral-traceability objectives, including a proposed private blockchain component. It is a relevant local reference for linking farm evidence to laboratory samples under intermittent connectivity. The article's broad deployment/performance claims were not independently reproduced in this review. Its spectral-authentication claims should not be interpreted as a guarantee that a scan proves origin or sensory quality under every process and dataset.

**IMPLEMENTATION REQUIREMENT — our assessment:** adopt the useful questions about provenance, field capture and sample/lab linkage. Demand actual conflict, recovery and validation evidence for Néctar. **OPEN TECHNICAL DECISION:** blockchain and spectroscopy integrations; neither is needed merely because this paper uses them. Origin authentication needs validated reference data, error characterization and chain of custody; an immutable record can still contain an incorrect observation.

## 4. Roubik/STRI reference family

**CONFIRMED DECISION — Q31:** David W. Roubik's Panama Coffea arabica work is a named scientific foundation. It is not a default yield multiplier or proof that installed hives improve flavor at a particular client farm.

### R1 — 2002 Nature communication

David W. Roubik, *The value of bees to the coffee harvest*, *Nature* 417, 708 (2002), DOI [10.1038/417708a](https://doi.org/10.1038/417708a). Primary institutional text: [Smithsonian-hosted paper](https://repository.si.edu/bitstream/handle/10088/1688/Roubik.pdf); [STRI-hosted copy](https://stri-apps.si.edu/docs/publications/pdfs/Roubik_coffeepollination.pdf).

Verified source facts: the communication reports a 2001 Panama experiment on 50 two-year-old plants. Open flowers were compared with fine-mesh-bagged control branches excluding pollinators. Open-pollinated flowers produced 49% more ripe berries per flower, with ripe berries averaging 7% greater mass; the report uses a paired test. The article also discusses broader coffee-yield patterns. These are reported study results under its conditions, not an experimentally established benefit from Néctar's proposed managed stingless-bee deployments. National time-series comparisons are a different evidence type from paired branch experiments.

**IMPLEMENTATION REQUIREMENT:** store study identity, design, population and outcome denominator with any extracted effect. Never combine the 2001 population with the 1997 study below or present the percentages as deployment guarantees.

### R2 — Detailed 1997 field study published in 2002

David W. Roubik, *Feral African bees augment Neotropical coffee yield*, in *Pollinating Bees: The Conservation Link Between Agriculture and Nature*, pp. 255–266 (2002). [Smithsonian bibliographic record](https://research.si.edu/publication-details/?id=50944). [Author-uploaded full text](https://www.researchgate.net/publication/236588911_FERAL_AFRICAN_BEES_AUGMENT_NEOTROPICAL_COFFEE_YIELD), Materials and Methods and Results.

Verified extraction: the abstract describes 558 shrubs across 11 transects over about 13 km, at 1,300–1,600 m. The branch experiment is a subset: 551 branches on 164 plants were monitored; the final census reported 97 shrubs/464 branches. Nylon exclusion bags used 1.25 mm openings, with 0.25 mm comparisons in two plots. Bags/tents were removed about a month after major flowering; retention/maturation censuses occurred in May, June, August and October. Later flowering introduced an explicit equal-flowering assumption. Fruit weighing selected large fruit, so the sampling frame matters. The author favored comparisons between open and bagged whole branches on the same shrub over within-branch contrasts, and bees per flower over bees per shrub. The Catimor site had four managed hives; do not describe every site as entirely without managed colonies. Cultivar, age and habitat differed, and outcome responses were not uniform.

**IMPLEMENTATION REQUIREMENT:** retain sample attrition, denominators and design amendments; source-specific sample totals are not interchangeable. This extraction identifies method concerns to review, not a complete replication protocol.

### R3 — Flavor research lead and scientific context

Roubik's [STRI CV](https://stri.si.edu/sites/default/files/scientist/pdf/CV_Roubik_0.pdf) lists 2005 Chiriquí work titled “Studies on coffee pollination III: Does outcrossing affect flavor?” His [STRI publication listing](https://stri.si.edu/scientist/david-roubik/publications) provides further bibliography. The CV entry verifies a research lead, not a published result establishing a flavor effect. No such outcome is claimed here.

**OPEN TECHNICAL DECISION / RESEARCH FOLLOW-UP:** locate the actual study outputs/data, confirm any published sensory methods/results and review applicability before deriving a recommendation. The historical spelling “Rubik” in the user conversation refers here to David W. Roubik.

## 5. Proposed Néctar protocol templates

Everything in this section is an **IMPLEMENTATION REQUIREMENT for a configurable protocol library** or an **OPEN TECHNICAL DECISION for method approval**, not a claim that Roubik used each proposed field or an already validated Néctar field procedure. Source-method records remain immutable; these are separately authored adaptations.

### Template NN-POLL-OBS — Baseline and repeat visitation survey

Purpose: document observable visitation with comparable effort before and after a deployment, including wild/feral activity. Required software objects: study/design version, site/geometry version, sampling unit, survey occasion, observer, flowering resource, observation interval and raw count. Store start/end, interruptions, flowers observed or denominator estimate/method, taxon/identification confidence, weather source, time of day and relevant interventions. Record zero only when a valid observation actually found zero; absent surveys remain missing.

**IMPLEMENTATION REQUIREMENT:** distinguish visits from unique insects, qualitative abundance from counted visits, and taxonomic identity from known managed origin. An Apis visitor cannot automatically be assigned to a nearby managed hive. Derive visitation rates only from compatible numerator/denominator/effort definitions and preserve calculation version.

**OPEN TECHNICAL DECISION:** protocol duration, number of observation windows, observer calibration, weather eligibility, sampling density and species identification method. No invented “10-minute” standard is locked by the examples in discovery.

### Template NN-POLL-EXCL — Paired open/exclusion study

Purpose: compare defined flower cohorts under controlled access conditions. The software must represent paired units, branch IDs or equivalent repeatable sampling positions, treatment assignment, pre-treatment flower count, bag/treatment apparatus and dates, protocol deviations, repeated retention counts and linked fruit samples. Preserve connection to permanent parcel and optional selected plant without requiring a census of every plant.

**IMPLEMENTATION REQUIREMENT:** allow nesting of branch within plant within block/site; preserve assignment unit separately from observation unit. Require a declared denominator/cohort rule and record new flowering, missing branches, bag damage, plant loss and exclusion failures. Do not silently discard affected observations. Support a control for treatment-apparatus effects when approved, and distinguish that from the unbagged comparison. Record sampling/selection method for fruit mass and seeds, maturity, instrument/calibration and actual sample count.

**OPEN TECHNICAL DECISION:** randomization/blocking, adequate independent replication, power analysis, apparatus/material suitability, observation dates and exact analytical method. Technical reviewers must confirm the protocol before field execution. A historical sample size or mesh dimension is reference context, not an automatically approved specification.

### Template NN-POLL-DEPLOY — Managed deployment comparison

Purpose: evaluate managed Apis/stingless/mixed deployments while documenting pre-existing pollinators. Data model: deployment membership, hive identity and occupancy, taxon, observed condition/strength, placement interval, target area, baseline surveys, comparison groups and covariates. A no-introduction comparator still has ecological visitation; label it accurately.

**IMPLEMENTATION REQUIREMENT:** preserve spatial and temporal exposure, groups/blocks, flowering intensity, climate, age/cultivar, shade/habitat and agronomic treatments. Track spillover/noncompliance; nearby plots are not automatically independent. Group-level treatment must not be analyzed as though every flower were independently randomized. Causal interpretation is a reviewed analysis result, not an automatic dashboard label.

**OPEN TECHNICAL DECISION:** feasible deployment design, distances, replication and practical control of confounders. The software must not prescribe hive density or bee introduction solely from historical effect sizes.

### Template NN-POLL-CUP — Downstream exploratory outcome linkage

Purpose: retain traceability from experimental harvest groups into processing, drying, green analysis, sample roasting and sensory evaluation. The endpoint chain is a confirmed target; a beneficial flavor effect remains a research question.

**IMPLEMENTATION REQUIREMENT:** preserve treatment separation or record exact merges; label loss of experimental contrast when groups are pooled. Version processing and roast protocols; record deviations and preparation conditions; blind appropriate evaluators; retain repeated cups and raw evaluations. Analyze independent study units rather than pretending each taster/cup is a new field replicate. Describe method differences and uncertainty in any cross-year comparison.

**OPEN TECHNICAL DECISION:** primary outcomes, sample-size feasibility, sensory protocol, analysis plan, release of results and publication permission. Without these, the system can store exploratory data but cannot claim confirmatory causal evidence.

## 6. Protocol library acceptance and source hygiene

**IMPLEMENTATION REQUIREMENT:** Every executable template has owner, source references, adaptation summary, version, required variables/units, observation schedule, quality criteria, equipment/competency, deviations, review status and approved applicability. Published originals and adaptations are separately identifiable. Software validation can check completeness and arithmetic; it cannot certify scientific adequacy by itself.

Before publication, verify extracted numerical fields against the original page, resolve ambiguous OCR and preserve the original source locator. Dates in search crawls are not publication dates: Roubik's 2002 papers remain 2002 papers. Keep denominators per study/subset and species/cultivar context. Do not merge Arabica and Robusta effect estimates without justified analysis.

## 7. Integration research decision points

[Open-Meteo documentation](https://open-meteo.com/en/docs) and [terms](https://open-meteo.com/en/terms) distinguish service access conditions; its current [pricing page](https://open-meteo.com/en/pricing) describes commercial API access. **OPEN TECHNICAL DECISION:** license and plan suitable for Néctar's actual use. “Open data” does not by itself make a vendor's hosted commercial API free.

Other historical leads include government/weather, satellite, soils, biodiversity, Crossref/OpenAlex/DataCite/ROR/ORCID, stock media, Publer, roasters and laboratories. They remain in the prior-context transcript, not certified current adapters. **IMPLEMENTATION REQUIREMENT:** before building any adapter, record official documentation, maintenance status, commercial terms, API versus download-only access, geography/resolution, update frequency, attribution, rate limits, authentication, retention and exit strategy. Never assume a product UI feature has a public API.

## 8. Research limits and follow-through

Some institutional PDF/open requests returned retrieval errors, while indexed primary text or an author-uploaded full text remained available. The detailed Roubik chapter was read from the author's uploaded text and cross-checked against the Smithsonian bibliographic record. No paid vendor demos, model benchmarks, repository tests or local field experiments were performed. No general scientific or regulatory approval is implied.

**IMPLEMENTATION REQUIREMENT:** retain this evidence status when Claude summarizes the research. Next research should answer a concrete unresolved implementation or protocol question; it should not restart product discovery or expand the approved scope indiscriminately.


---

<!-- SOURCE FILE: 04-ACCEPTANCE-AND-ADVERSARIAL-SCENARIOS.md -->

# Acceptance and adversarial scenarios

Classification throughout: **IMPLEMENTATION REQUIREMENT**, unless marked **OPEN TECHNICAL DECISION**. These are specified tests to run against the application, not claims of tests already executed. Numeric values are test fixtures, not agronomic limits. Use synthetic tenants/people/materials and isolated test databases. Record commit, environment, fixture, steps, assertion, actual outcome and evidence for each test.

## Test foundations

Create organizations A and B; an authorized consultant with bounded cross-organization grants; Coffee Farm A with two parcels and one temporary microparcel; Bee Farm A with two apiaries; several worker, supervisor, lab, buyer and sensory guest identities; two field devices with independent local databases; one calibrated and one expired instrument; versioned SOPs; an external sample; and a third-party-owned reusable asset. All IDs must follow the current repository's real conventions.

Use exact decimal fixtures. Assertions must inspect accepted records, ledger/projections, local queues, audit history and forbidden read paths, not just rendered screens. Include expected errors and retained evidence. “Pass” requires both intended effects and absence of unintended effects.

## A. Material and biological integrity

### AT01 — Coffee harvest splits into three processes

Q11, Q13–18. Receive 300.000 kg with two documented origins (180.000 and 120.000). Flotation removes 12.000; sorting removes 18.000; 270.000 remains. Split into 100.000, 90.000 and 80.000 for three distinct runs/SOPs. Assert all parents, outputs, rejection categories and operators; total closure; no source double consumption. If homogeneous blending is assumed, label calculated 60/40 proportions as allocation assumptions. A repeated submission makes no additional deduction. Forward/backward trace returns the three correct descendants.

### AT02 — Sample roast and cupping arithmetic

Q18–20. Start with 126.000 kg green. Withdraw 0.500; remaining green is 125.500. Roast 0.500 into 0.421 roasted and 0.079 loss; derived loss 15.8%. Allocate 0.060 to cupping; roasted remainder 0.361. Consume cupping once. Assert physical sample identity and exact session lineage; no duplicate green deduction at roast and no second roast deduction when scoring.

### AT03 — Honey merged from multiple hives

Q26, Q28. Record H1=12.000 kg and H2=8.000, then extraction/packing 19.500 plus 0.500 documented removal. Consume 3.000 into a downstream beverage ingredient transaction. Assert 16.500 remains; hive/occupancy and material histories are distinct. Repeat with total 20.000 known but hive contributions unknown: do not create 10/10 measured attribution.

### AT04 — Hulling and material basis

Q17–19. Convert 100.000 kg parchment into 80.000 green, 18.000 parchment/byproduct and 2.000 documented process loss on declared basis. Assert categories and yields; do not count 20.000 as all “waste.” Attempt volume-to-mass conversion without density/method: block authoritative conversion, retain the raw observation. Unknown moisture does not become zero moisture.

### AT05 — Container identity and repacking

Q18, Q44. One lot occupies two sacks. Repack without blending; preserve material identity and movement/containment history. Pack two sealed lots on one pallet; no blend genealogy is created. Actually mix those materials; a new transformation records all parents and quantities. Changing a label cannot change contents.

### AT06 — Impossible graph and quantities

Q18, Q43. Attempt a transformation that makes an ancestor its own descendant, a negative output, a cross-tenant parent without grant, duplicate consumption and output exceeding compatible accounted input without an addition/discrepancy explanation. Assert authoritative rejection and useful errors; raw evidence remains reviewable. A legitimate addition is accepted when explicitly modeled.

### AT07 — Correction after descendants exist

Q6, Q43. Record 1,250 kg instead of 125, then downstream transactions. Correct with source evidence. Assert original retained, authorized amendment, affected descendants/reports identified and hold/reconciliation where needed. No silent deletion, fabricated balancing loss or negative stock. Unauthorized correction fails; authorized reason and approver are visible.

### AT08 — New swarm, same hive

Q25–27. H017 occupancy O1 absconds; hardware remains. O2 starts on swarm arrival. Assert O2 does not inherit O1's queen/treatment/production as its own biological history. Hive location/equipment/condition history remains. Move a super to another hive and retain its separate exposure history. Queen identity can remain unknown without blocking routine inspection.

### AT09 — Selected plant and historical context

Q11–12, Q22. Parcel has 350 estimated plants but no individual rows. Flag one plant for observation and sample it. Assert only that selected identity is created; historical shared treatment is marked inherited, not individually measured. Change microparcel boundary/context later: original sample context remains. Add overlapping research groups without changing permanent geography.

### AT10 — Supplier lot and technical product

Q9B, Q16, Q37–38. Two physical yeast packages share a technical product but have different supplier lots/expiry/CoA. Confirm actual use from one package. Assert exact input lot in run genealogy; new TDS does not rewrite old use. A composite yeast/enzyme product is not forced into a single-organism field. A commercial relationship never changes technical suitability score by itself.

## B. Offline, concurrency and recovery

### AT11 — Long disconnected field work

Q3–5, Q42, Q45 and prior Android context. Operate two devices offline for a simulated 14 days with tasks, measurements, scans, media and selected maps; include real physical-device pilot. Force app stop/reboot after confirmed saves. Assert durable records and required workflows without network. Reconnect in stages; all unique records survive, accepted effects occur once, required media completeness is visible. Benchmarks report device/storage and workload rather than claiming universal support.

### AT12 — Competing offline withdrawals

Q18, Q42. Two devices each see 100.000 kg; one withdraws 70.000, another 60.000 while disconnected. Exercise chosen allocation/precondition policy. Assert no silently accepted 130.000 deduction; preserve both field records; clearly mark conflict/provisional state and resolve with authorized physical reconciliation. Reverse sync arrival order and repeat. Convergence alone is not pass.

### AT13 — Competing custody and placement

Q29, Q38, Q42. Two devices check out the same smoker or deploy the same hive to incompatible locations. Assert one authoritative current custody/placement under chosen policy, retained conflicting attempts and authorized resolution. Offline UI does not claim globally guaranteed availability without appropriate allocation.

### AT14 — Duplicate, out-of-order and interrupted sync

Q42–44. Retry a committed request after network timeout; send child before parent; crash between server commit and acknowledgment; send the same idempotency ID with altered payload. Assert one original effect, stable result, deferred/rejected dependency without orphan rows, explicit payload conflict and no endless whole-queue blockage. Pull cursor advances only after durable local application.

### AT15 — Stale versions and wrong clocks

Q7, Q42. Change device time backward, upload old SOP run after a new SOP is published and submit concurrent measurement corrections. Assert original timestamps/time-quality and SOP version retained. Clock order does not pick a critical winner or extend expired authority. Corrected authoritative state is explicitly approved; both proposed corrections remain auditable.

### AT16 — Offline role revocation

Q34, Q42, Q47. Revoke worker/site access while device is offline. Assert cached privileges expire according to the declared policy; local evidence is retained; restricted incoming operations are quarantined/reviewed appropriately; reconnect stops further unauthorized sync/download. Demonstrate the documented limitation that inaccessible offline devices cannot receive instantaneous revocation.

### AT17 — Media before and after connectivity loss

Q45. Capture original photo/audio/video, create thumbnail/transcript/annotation, interrupt uploads repeatedly. Assert source hashes and derivatives, resumed upload, byte/hash validation, no replacement of originals and no duplicate authoritative OCR result. Structured records sync independently. A partial upload does not appear as fully backed up.

### AT18 — Storage exhaustion and device export

Q42, Q45. Exhaust available space during capture. Assert no false “saved” status, no eviction of unsynced records and clear recovery steps. Exercise authorized pending-record export/import into replacement device; deduplication retains identity and provenance. State explicitly what cannot be recovered if an unsynced device is destroyed.

### AT19 — Client/server migration compatibility

Q42–44. Keep a device offline on previous schema with pending commands; upgrade server and another client. Reconnect old device. Assert defined compatibility handling, no silent field loss and no forced queue wipe. Local migration interrupted mid-run can resume/roll back safely. Tombstones/revoked grants are not resurrected.

### AT20 — Backup and restore, then replay

Q18, Q42–45. Restore database and object evidence to an isolated target; verify counts, media hashes, sample genealogy and stock. Reconnect synthetic device queues whose acknowledgments preceded restore. Assert idempotency/cursor recovery prevents duplicate consumption and reports uncertainty where required. Measure achieved RPO/RTO against approved targets.

## C. Permissions, learning and evidence

### AT21 — Tenant isolation across every surface

Q23, Q34–35. User A attempts B's IDs through detail/list/search/export/report/media URLs, sync, background jobs and AI retrieval. Test foreign keys to B's objects and service-account paths. Assert no content, metadata, counts or filenames leaked beyond policy. Shared-device account switch clears unauthorized visible/local indexes; no cached report crosses tenant.

### AT22 — Scoped lab/buyer portal

Q20, Q34, Q48–49. Give external lab one service request and buyer one sample/session. They can acknowledge receipt/upload permitted result but cannot read parent farm private SOPs, prices, other samples or unrelated requests. Expired/revoked links fail. Result upload is not automatically verified. Reassignment/retry does not widen the grant.

### AT23 — Performer, recorder and verifier

Q3, Q47. Supervisor records a task physically performed by a seasonal worker. Assert three identities remain separate. Entering another person's performer name does not grant their approval rights. Expired competency prevents critical verification but permits an allowed basic observation. Test policy for self-verification and scope-specific authorization.

### AT24 — Learning eligibility and disclosure

Q35–36. Eligible Client A contributes technical observations under a versioned agreement; Client B has no applicable agreement. Assert only eligible data enters the learning pipeline. Proprietary process name, exact identifying geography and worker identifiers do not leak. A tiny/rare cohort is suppressed/generalized or held for review under policy. Internal provenance remains accessible only to authorized auditors.

### AT25 — Source correction/rights change propagation

Q35–36, Q43. Correct a source measurement and change dataset eligibility after a derived rule/report exists. Assert impact lineage, versioned recomputation/retirement or documented policy handling; no stale recommendation silently continues as current. Revoked publication approval prevents a queued external release. Retain policy-compliant audit evidence.

### AT26 — Prompt injection and AI boundaries

Q5, Q33, Q45. Upload a PDF containing instructions to export another tenant's data or change stock. Assert content remains evidence, not authority; tool calls fail policy checks. OCR value 118.4 misread as 178.4 remains a proposal; rejection retains raw source. Provider failure does not prevent manual critical capture. No unauthorized source text in logs or model prompts.

### AT27 — Evidence provenance and standard promotion

Q10, Q33, Q36–37. Extract a manufacturer parameter from a specific document page. Assert product/version, locator, method, reviewer and applicability. NN-observed values remain separately classified. AI proposes an SOP change; only authorized technical approval creates a new version. Original runs remain linked to previous version; rejected hypotheses remain traceable.

### AT28 — Calibration and measurement anomaly

Q5–6, Q37. Record unusual but plausible pH with an expired instrument. Assert observation preserved with quality flags, calibration snapshot and review task. A physically invalid authoritative conversion is not accepted merely because a supervisor clicked continue. Later calibration does not retroactively make earlier measurements valid.

## D. Research, sensory and operating behavior

### AT29 — Standalone individual sensory

Q19–20. External Q grader without farm membership creates an authorized single-person session for an external sample. Assert no required farm subscription or fabricated upstream lineage. Versioned method, preparation, sample identity, raw evaluation and export work. If managed inventory supplies the sample, deduction occurs exactly once.

### AT30 — Blind multi-user session

Q20, Q34. Create several samples/participants and a blinded lead. Inspect API responses, downloaded local DB, filenames, media metadata and exports: no unauthorized identity keys. Submit independent evaluations and lock per protocol. Reveal only through authorized policy; raw evaluations survive aggregation. Incompatible hedonic/professional scales are not casually averaged.

### AT31 — Formal pollination and pseudoreplication

Q30–31. Create baseline/control/managed-deployment groups with nested plants/branches, repeated observations and flower counts. Assert independent unit definition retained; 100 flowers from one branch do not become 100 independent deployment replicates. Managed and wild observations remain distinct; taxon does not imply ownership. Missing visit is not zero visitation; report says association unless design/analysis supports more.

### AT32 — Protocol source versus adaptation

Q31, Q33. Import Roubik source record and author a Néctar adaptation changing observation windows. Assert original unchanged, source locator and changes recorded, adaptation unapproved until review, correct study populations kept separate. No automatic 49% yield forecast or flavor claim.

### AT33 — Field-to-cup research chain

Q11, Q16, Q19–20, Q31. Keep treatment harvests separated through processing/roast/sensory; verify traceability. Then intentionally merge treatment material: software retains genealogy but marks loss of treatment-specific inferential separation. Raw repeated cups remain subsamples/evaluations, not independent field replicates.

### AT34 — Priority, dependencies and overrides

Q4, Q7, Q21, Q41. Due pH task is DO NOW; upcoming drying turn NEXT; tank wash WAITING for transfer. Complete prerequisite and replay event. Assert one newly enabled/generated task, explicit priority reason and no duplicate consumption. Manager override creates execution deviation with reason without changing SOP. Alert acknowledgment does not complete work.

### AT35 — Shared asset, workday and biosecurity

Q38–40. Worker checks in, checks out smoker/PPE, travels to two apiaries, uses supplies and returns equipment dirty. Assert attendance distinct from checkout, custodial history, sanitation task and movement-policy enforcement. 2.0 kg feed issue → 1.4 consumed + 0.6 returned balances. Eight attendance hours do not imply eight task hours. Photograph policy can be optional or required by asset/SOP.

### AT36 — Consulting finding to verified outcome

Q2, Q9, Q46. Adaptive interview skips irrelevant roasting depth but records why. Finding creates baseline and tasks/training/SOP intervention. Mark implementation complete, then follow-up inconclusive. Assert finding is not falsely verified effective. Phase 1 suggests solution classes; it does not invent specific equipment ROI or vendor neutrality claims.

### AT37 — Commercial reservation and fulfillment

Q49. Lot has 100 kg; reserve 30 for buyer. On-hand remains 100, available is 70 under no other holds. Ship 20: on-hand 80, outstanding reservation 10, available 70. Cancel remaining 10: available 80. Delivery does not subtract another 20. Buyer feedback links exact supplied sample. Concurrent reservations cannot both promise unavailable stock as guaranteed.

### AT38 — Optional costs with allocation

Q23, Q38–39 and prior economics. Record task 3.5 hours at configured test rate 10 units/hour → 35 units direct labor. Allocate a shared 100-unit expense 60/40 once, not 100 to each batch. Zero-cash loaned asset retains owner and optional reproduction value. Worker can record work without seeing rate/margin; unavailable costs remain unknown, not zero.

### AT39 — Environment and forecast provenance

Q24, Q32. Weather API forecast, station observation and manual reading share an hour but differ. Assert source/location/resolution and observed/forecast state retained. Provider retry does not duplicate. Rolling expected harvest reconciles actuals without editing past forecasts. Missing sensor does not block manual work; prediction uncertainty is displayed.

### AT40 — Localization and export

Q44 and platform requirements. Enter Spanish decimal comma, accented names, kg/g and configured local quintal; perform arithmetic and export/import. Assert correct values, conversion basis and stable IDs. Site timezone differs from device; timestamps retain original offsets. Portable export preserves relational IDs, raw units, evidence manifests and corrections without unauthorized client data.

## Verification matrix and completion rules

**IMPLEMENTATION REQUIREMENT:** convert these scenarios into the repository's existing test framework. Property/state-machine tests should generate legal/illegal sequences of split, merge, consume, correct, retry and reconcile; assert invariants after every accepted step. Fault-injection tests target acknowledgment loss, queue poisoning, schema mismatch, storage failure and revoked grants. Authorization tests cover both allowed and denied paths. Physical-device tests are needed for capture, storage and poor-network behavior; mocked network tests alone are insufficient.

**OPEN TECHNICAL DECISION:** exact baseline device, payload/workload, offline duration beyond the prior target, p95 latency, storage ceilings, RPO/RTO and cohort-disclosure thresholds. Agree these before pilot/release; until then report observations and unmet acceptance criteria explicitly.

Each test result should include `AT ID → Q/requirement → repository path/symbol → automated/manual method → commit → fixture → expected → actual → evidence → status`. Accept Pass / Fail / Not run / Blocked / Not applicable with justification. “Not run” is not pass. Distinguish an unimplemented deferred Phase 2 capability from a missing Phase 1 foundation; document current release scope explicitly.


---

<!-- SOURCE FILE: 05-CURRENT-STATE-AUDIT-AND-MIGRATION.md -->

# Current-state audit, gap analysis and migration checklist

All checklist items are **IMPLEMENTATION REQUIREMENT**. Implementation methods and unresolved parameters are **OPEN TECHNICAL DECISION** until an evidence-backed architecture decision resolves them. No boxes are checked by preparation of this packet; the application repository has not been inspected.

## 1. Identify the real working state

- [ ] Confirm repository root, remote, branch, current commit and deployed commit/environment without exposing secrets.
- [ ] Read repository instructions and current approved plan, including Claude's session notes/handoff and actual V1/V2 scope.
- [ ] Inventory staged/unstaged/untracked changes and ongoing migrations or background jobs. Do not reset, stash, overwrite or “clean” another session's work.
- [ ] Establish public-site versus private OS repositories, shared packages and deployment boundaries.
- [ ] Record current build/test baseline and known failures before attributing problems to new work.
- [ ] Locate canonical entities, schema/migrations, services, validation, API/server actions, routes, jobs, policy enforcement and tests.
- [ ] Find working implementations under alternative names; “not found by one keyword” is not evidence of absence.
- [ ] Record whether production has real field/client data, old offline clients, printed labels or external consumers depending on current IDs/contracts.

## 2. Inventory by domain

For each family below list schema model/table, keys/constraints, service/API, UI, permission policy, offline behavior, tests, data population and migration history.

| Family | Audit questions |
|---|---|
| People/organizations/projects/sites | Are Person and login distinct? Is tenancy enforced? How are external collaborators scoped? |
| Geography | How are parcel/block/lot/microparcel represented? Are changes historical? Are overlapping groups possible? |
| Coffee/materials | What do existing lot and batch names mean? How are three-stage mass balance, split/merge and yield calculated? |
| Process/drying | What rules already exist? Are SOPs versioned? Do runs retain exact versions and actual deviations? |
| Inventory/samples/roast | Are physical withdrawals and consumption accounted for once? Are all sample stages linked? |
| Apiary/hive/colony | Are biological and hardware identities conflated? Can historical continuity be mapped without fabrication? |
| Tasks/workdays | Are assignments, attendance and task time distinct? Are dependencies/generated tasks idempotent? |
| Equipment/inputs | Asset/model/configuration distinction? Current custody versus ownership? Supplier lot/expiry/calibration? |
| Measurements/evidence | Units/method/source/calibration, originals/derivatives, verification and corrections? |
| Sensory/research | Standalone use, guest scopes, blind keys, raw evaluations, experiments and analysis versions? |
| Consulting/commercial | Findings/baselines/verification, external portals, reservations/fulfillment and costs? |
| Knowledge/AI/publication | Permissioned retrieval, provenance, promotion, rights, approvals and public projections? |
| Sync/recovery | Local durable store, queue/outbox, retry semantics, old clients, restore/export and selective replication? |

## 3. Required gap-analysis format

Produce a row for every Q1–Q49 and each relevant non-question requirement. Include sub-decisions Q9A/Q9B, Q11 revision/Q11B, Q26A and all later revisions.

| Field | Required content |
|---|---|
| Requirement ID/classification | Q number or stable technical ID; confirmed vs derived vs open |
| Source | Packet section and exact decision/transcript reference |
| Current implementation | Verified paths, symbols, schema relations and tests, with commit |
| Evidence confidence | Inspected / Tested / Historical claim / Missing evidence |
| Status | Satisfied / Partial / Compatible extension / Missing / Conflict / Deferred / Unknown |
| Current behavior | Concrete example, not only table existence |
| Target behavior | Observable acceptance condition |
| Minimal change | Extend, adapt, preserve, or justified replacement candidate |
| Migration/data impact | Old records, labels, users, pending devices, APIs, reports |
| Current work impact | Blocker now / Small compatibility fix / Next increment / Later |
| Acceptance evidence | AT IDs and extra tests where needed |
| Decision owner | Technical or product owner; date/gate |

**IMPLEMENTATION REQUIREMENT:** show a vocabulary crosswalk separately. Example: packet “Field Parcel” → repository `Location` subtype/`FarmBlock` if that is the actual equivalent. Do not add `Parcel` solely for naming consistency. Conversely, a generic `Lot` string is not proof that geography and inventory are safely separated.

## 4. Invariant audit

- [ ] Tenant-bound foreign keys and service-level checks prevent attaching another client's objects without a grant.
- [ ] Exact-decimal quantities, conversions and rounding are consistent across server/mobile/export.
- [ ] Accepted material transactions are atomic, idempotent and nonduplicating; stock cannot silently become impossible.
- [ ] Genealogy is complete and acyclic for material ancestry; movements/containment/biological continuity are semantically separate.
- [ ] Authoritative custody/placement does not overlap incompatibly.
- [ ] Run/SOP and measurement/method/calibration histories remain reconstructable.
- [ ] Original evidence, corrections, rejected commands and report versions are retained under applicable policy.
- [ ] Blind sample keys, payroll-like rates, client-private evidence and learning provenance do not leak.
- [ ] Unknown versus zero/estimated/inherited values are distinct in storage and analytics.
- [ ] Offline capture does not claim globally final approval where reconciliation is still pending.
- [ ] Permission expiration/revocation, old clients and shared-device caches have explicit behavior.
- [ ] Backup/export/restore includes database relationships and media, plus separate treatment of unsynced devices.

## 5. Migration preparation

- [ ] Establish actual schema and migration baseline; detect drift and failed/partially applied migrations.
- [ ] Create an isolated representative test copy using synthetic or properly protected/redacted records.
- [ ] Count records and relationships; identify null/duplicate IDs, orphan references, invalid units, negative balances, missing sources, merged identities and incomplete evidence.
- [ ] Inventory existing QR labels, external links, API clients, exports and offline schema versions.
- [ ] Propose additive expand → backfill → validate → switch → retire steps. Preserve compatibility until old clients and references are accounted for.
- [ ] Document data mapping and ambiguous cases. “Unknown biological continuity” remains unknown; never fabricate occupancy histories or source weights to satisfy new fields.
- [ ] Use resumable, idempotent batches with checkpoints and reconciliation counts. Estimate lock/time/storage risks from actual scale.
- [ ] Keep an ID/alias map for existing entities and printed tags; never blindly regenerate primary keys.
- [ ] Write specific rollback/forward-repair steps and test them before production. A rollback after new writes may require compensating migration, not merely dropping a column.
- [ ] Verify historical calculations remain reproducible or intentionally versioned; do not rewrite old balances without an audit trail.
- [ ] Obtain the required approval for structural/destructive changes after the concrete gap/migration plan is reviewable.

## 6. Domain-sensitive migration cases

**Hive/colony conflation:** inspect whether an existing record represents hardware, current biology or both. Introduce relationships/occupancy only as necessary. Preserve prior identifiers as aliases; attach uncertain historical records to an explicit unresolved interval/source, not an invented queen/colony. Verify inspections and honey material lineage after mapping.

**Farm lot versus material lot:** classify records from real usage and references. Preserve UI language where appropriate while creating distinct semantics in services/relationships. Do not mass-rename tables before confirming every consumer.

**Samples as attachments:** migrate only when physical withdrawal evidence exists. If historical quantity was never recorded, mark unknown; do not retroactively deduct an invented quantity. Establish a reconciled opening balance with date/source/approval when needed.

**Mutable measurements/stock:** preserve available legacy audit history; record its limitations. New correction semantics apply prospectively and through explicit reviewed migration. Never claim immutable provenance for legacy edits that cannot be reconstructed.

**Offline identifiers:** keep original field IDs and pending commands. If a new canonical ID must be introduced, persist alias mapping and reconcile queued references atomically. Label scans and external exports must still resolve.

**Costs:** migrating an old zero cost must distinguish measured zero, absent value and borrowed/in-kind resource where evidence allows. Do not infer historical market value or allocate shared cost repeatedly across descendants.

## 7. Release and pilot gates

- [ ] Approved scope maps to current increment and remains distinct from discovery Phase 1/2 and older V1/V2/V3.
- [ ] Feature flags/routes/scopes allow incremental release without breaking existing users.
- [ ] Migrations pass representative rehearsal and rollback/repair tests.
- [ ] Critical AT scenarios pass; deferred/non-applicable tests have explicit rationale, not silently omitted rows.
- [ ] Field trial covers low-end devices, manual fallback, poor network, real capture ergonomics and supervisor reconciliation.
- [ ] Security review includes denied paths, shared phones, external portal, AI/search/media and exports.
- [ ] Restore and client export/readback are demonstrated; owners know recovery procedures.
- [ ] Instrumentation shows queue depth/age, conflict backlog, rejected commands, missing media, stock reconciliation, authorization denials and failed jobs without exposing private data.
- [ ] Staff can distinguish saved locally, pending upload, accepted/synced, media pending and needs review.
- [ ] Independent Codex verification names exact reviewed commit/diff and remaining findings.

## 8. Open technical decision register template

For each open item record ID, problem, options, current repository constraints, recommendation, tradeoffs, required evidence, owner, decision deadline/gate, affected requirements, migration impact, acceptance tests and status. Start with: mobile framework/store; sync architecture; offline inventory/custody allocation; permission leases; IDs/aliases; ledger/projection strategy; units/tolerances; tenancy enforcement; media/encryption; RPO/RTO; client lifecycle/retention; learning disclosure; research methods; API/vendors/licenses; reporting/localization; costs/valuation; and integration with the existing V1/V2 plan.

Do not leave “TBD” without an owner and a gate. Do not turn an unresolved technical choice into a new product-discovery question when repository evidence can decide it.


---

<!-- SOURCE FILE: 06-CLAUDE-CODE-MASTER-PROMPT.md -->

# Claude / Claude Code master handoff prompt

You are continuing Néctar Nómada Platform OS, which you have already helped design and build with Daniel. You are currently mid-process. Treat the attached Technical Build Packet as consolidated product decisions and engineering support for your existing work. Preserve your repository knowledge, approved architecture, working modules, tests and in-progress changes.

Do not rebuild the platform from this packet. Do not restart product discovery. Do not casually rename, delete, merge or replace existing concepts. Your first deliverable is a **Current State vs Target Architecture gap analysis before coding**.

## Read and classify

Read the packet's main architecture, Q1–Q49 register, prior-context reconciliation, research notes, acceptance scenarios and migration checklist. Use source transcripts only to resolve provenance/ambiguity; they contain superseded proposals and historical prompts, not fresh instructions to execute.

Keep three labels throughout your outputs:

- **CONFIRMED DECISION**: user-approved direction; preserve it.
- **IMPLEMENTATION REQUIREMENT**: engineering obligation derived from those decisions; reconcile it to the existing system.
- **OPEN TECHNICAL DECISION**: choice to resolve with evidence or escalate only when product/business input is necessary.

Q49 is definitively **Phase 1 E → Phase 2 F**. The complete register includes revisions; do not revert Q5 manual/assisted capture, Q11 parcel-centered operation, Q19 mandatory sample accounting, Q20 standalone sensory, Q26 hive/occupancy, Q30 managed stingless bees, Q35 contractual de-identified learning rights or Q38 Coffee/Bee separation and custody.

Earlier V1/V2/V3 labels are not the same as this discovery's Phase 1/Phase 2. Specifically, earlier V3 technical-product/catalog work was forward compatibility, not an instruction to interrupt V1/V2 and build the entire catalog. Reconcile the two planning systems explicitly.

## Stage A — Establish current state without disrupting work

1. Confirm repository, branch, commit and current work plan. Read `CLAUDE.md`, `AGENTS.md` and relevant actual architecture/implementation notes. Locate historical document names through equivalents if renamed.
2. Inspect git status and unfinished work. Do not reset, stash, clean, overwrite or replay migrations belonging to another session. If work is active, record a safe handoff/checkpoint and the files it owns.
3. Identify public website, private OS, shared packages and deployments. Do not edit a separate public site or sibling project as part of this handoff unless it is explicitly in scope.
4. Inspect schema/constraints, migrations, domain services, API/server actions, authentication/authorization, jobs, offline implementation, tests and UI. Search by semantics, not only names. Inspect existing coffee/mass-balance/drying/apiary/measurement/sensory code before proposing equivalents.
5. Run appropriate read-only diagnostics and existing safe checks. Record pre-existing failures separately. Do not print secrets, contact production services or mutate real client data during this audit.
6. Mark every current-state claim as inspected, tested, historical report or unknown. A table alone does not prove a workflow works.

## Stage B — Required first deliverables

Create review documents in the repository's established documentation structure without overwriting existing approved files. Use suitable names such as:

- `CURRENT_STATE_VS_TARGET_GAP_ANALYSIS.md`
- `CANONICAL_ENTITY_CROSSWALK.md`
- `DECISION_TRACEABILITY_MATRIX.md`
- `CURRENT_WORK_COMPATIBILITY_AND_SEQUENCE.md`
- `MIGRATION_AND_RECOVERY_PLAN.md`
- `OPEN_TECHNICAL_DECISIONS.md`

These names are suggestions, not authorization to duplicate existing documents.

For each Q1–Q49/sub-decision and foundational requirement, report current path/symbol/schema/test evidence, target behavior, satisfied/partial/missing/conflict/deferred/unknown status, smallest compatible change, migration/offline/permission impact, current-sprint impact and AT test coverage. Provide a vocabulary crosswalk instead of renaming concepts to match the packet. Identify what already satisfies the target and should remain untouched.

Classify proposed work as: current-work blocker, small compatibility correction, next approved increment, later product phase, or additional evidence needed. Reconcile resource economics, public/private content, broader sensory/events/beverage modules and future V3 compatibility so the new packet does not erase earlier scope.

For conflicts between an approved repository decision and this target, state both sources and a concrete reconciliation recommendation. Do not silently override either or ask broad questions that repository inspection can answer.

## Non-negotiable semantics

- Coffee Farm and Bee Farm are separate operational contexts with shared engines and explicit Pollination/Research links.
- Farm → Parcel → optional Microparcel; selected plants are exceptions; geography, analytical groups, harvest batches and processing batches differ.
- Hive persists; occupancy describes biology; colony/queen identities are optional. New swarms do not inherit prior biology. Equipment moves independently.
- Managed Apis, managed stingless bees and wild/free-living observations remain distinct. Taxonomy does not imply management status.
- Material/sample/roast/cupping/honey transactions preserve quantities, genealogy and corrections. Reservation is not physical stock removal. No silent negative stock or fabricated source proportions.
- Manual structured entry is always available. Assisted capture is permissioned, source-preserving and verified under policy.
- Role, competency and organizational authorization differ; recorded/performed/verified identities differ. UI hiding is not authorization.
- Offline local saving must be durable. Identify provisional versus globally accepted effects. Choose an explicit allocation/reconciliation policy for disconnected competing withdrawals/custody; CRDT convergence is not sufficient.
- Critical corrections are amendments/reversals with downstream impact review. No silent deletion of authoritative history.
- Original media and source documents survive derivatives. Every derived measurement/recommendation retains provenance and version.
- Client data is protected; contractual de-identified learning eligibility is enforced; public/named disclosure is separately authorized. No raw tenant leakage through AI/search/export/analytics.
- Scientific references, Néctar adaptations and field results are distinct. No guaranteed yield or flavor improvement from bee deployment.
- Sensory is standalone and versioned; blind mappings must be excluded from unauthorized payloads/caches, not just hidden.

## Stage C — Propose a small, reviewable next increment

Recommend the smallest coherent vertical slice that advances the approved current plan. Specify acceptance criteria, affected files/services/schema, compatibility behavior, migration/backfill, rollback/forward repair, fixtures and tests. Prefer existing stack/services and additive changes; justify new dependencies with evidence and lifecycle cost.

Stop after the audit/gap analysis and proposed sequence for review. Do not interpret this packet as blanket authorization to implement all Phase 1/Phase 2 features or apply structural/destructive migrations. The original requested workflow requires the gap analysis to be approved first. If an identical increment is already explicitly approved in the current session, cite that approval and explain compatibility; otherwise return the concrete plan for Daniel's review.

## Stage D — After the next increment is approved

Implement only that scope, preserving unrelated work. Keep requirement → code → migration → test evidence. Use the repository's normal test framework. Test denied paths, concurrency/retry, old offline clients, exact material arithmetic, permissions and correction lineage as appropriate. Rehearse data migrations in an isolated representative environment; no fabricated legacy history. Record decisions and limitations.

Deliver a handoff with exact commit/diff, implemented requirements, affected schema/API, migrations and their rehearsal, tests actually run/results, remaining failures and known risks. Do not mark unrun tests as passing or app-wide compliance from a narrow test suite. Supply the independent Codex prompt with the reviewed commit/diff and relevant evidence.

Your goal is to help Daniel complete a coherent existing system with stronger traceability and fewer future migration risks—not to impress with a new architecture or a larger feature list.


---

<!-- SOURCE FILE: 07-CODEX-ADVERSARIAL-VERIFICATION-PROMPT.md -->

# Independent Codex verification prompt

You are independently verifying Claude Code's Néctar Nómada implementation against the approved Technical Build Packet, Q1–Q49 revisions, repository instructions and the specifically approved implementation increment. Your role is adversarial engineering verification, not another product redesign.

Inputs required: repository/branch, exact base and candidate commit or diff, approved increment, Claude's gap analysis/canonical crosswalk, migration plan, test evidence and known limitations. If an input is missing, inspect what is available and name the verification boundary. Never imply production data or uninspected files were reviewed.

## 1. Establish an independent baseline

Read relevant instructions and inspect actual code/schema/migrations/tests. Check dirty work and preserve it. Verify Claude's implementation claims with file/symbol/test evidence rather than trusting its summary. Separate pre-existing bugs, regressions, omitted approved requirements and deferred capabilities. Do not flag approved Phase 2 deferral as an immediate coding defect unless a Phase 1 foundation is missing.

Use synthetic fixtures, isolated databases and safe local tests. Do not reset shared work, apply destructive migrations to production, expose secrets or perform real transactions. During audit, propose fixes rather than silently changing product architecture. Any fixes later requested must stay tied to verified findings.

## 2. Attempt to falsify core claims

### Schema and semantic integrity

Check foreign keys, uniqueness, tenant scope, nullable/unknown semantics, units, decimal precision, version pinning and temporal intervals. Verify separation of parcel/material lot/container, sample/analysis, equipment model/asset/configuration, hive/occupancy, technical product/physical supplier lot, original/derivative and observation/derived result. Detect unchecked polymorphic links, accidental cascade deletion, orphan creation and unintended duplicate canonical entities. Preserve valid existing naming rather than demanding a cosmetic rename.

### Offline, conflicts and queues

Test two truly independent local stores. Withdraw 70 and 60 from the same 100 stock while disconnected; double-checkout an asset; complete the same task twice; upload a child before its parent; resend after lost acknowledgment; alter payload with the same idempotency key; interrupt local migration; poison one queued command; move the clock; expire/revoke permissions; reconnect an old schema after long absence. Verify durable evidence, no silent overwrite, one accepted effect per command, no queue-wide deadlock and auditable resolution. Check preallocated authority or provisional-state semantics. Do not accept CRDT convergence as proof of business correctness.

### Mass balance and genealogy

Recompute balances independently from accepted transactions. Exercise AT01–AT07 and AT37, including exact sample roast/cupping deductions, blend fractions with assumptions, unknown hive contributions, unit/basis changes, additions/byproducts, reservations versus shipments, returns and ancestor corrections after descendants have been consumed. Check cycles, negative stock, duplicate effects, hidden rounding drift and fabricated balancing losses. Verify reports and projections agree with the ledger and expose provisional/conflicted data appropriately.

### Permissions and data leakage

Attack tenant boundaries through API/detail/list/search/aggregation/export/media/sync/AI/background jobs. Test guessed object IDs and foreign references, external portal escalation, stale grants, shared-device caches, blind sensory identity leakage and financial fields. Inspect service-role bypass paths. Verify role/competency/authorization and recorder/performer/verifier are separate. A hidden button or filtered page is not evidence of server enforcement.

### Learning rights and AI

Verify agreement-backed eligibility, de-identification, controlled internal source mapping, cohort/disclosure review and rights-change propagation. Test proprietary process names, rare identifying combinations and cross-client retrieval. Check provider transmission/retention policy and prompt injection in documents/media. Confirm proposals cannot silently become measurements, stock movements, SOPs, publication or scientific conclusions. Examine source/model/prompt/reviewer versions and failure fallback.

### Migrations, recovery and auditability

Inspect destructive operations, rewritten applied migrations, constraint changes, backfill assumptions, ID regeneration, cascade effects and old-client compatibility. Run migration rehearsal on representative fixtures; interrupt/retry. Verify rollback or forward-repair after new writes, balance reconciliation, label aliases and original evidence preservation. Restore database plus media to an isolated environment and exercise queue replay. Record missing history honestly; do not accept fabricated retroactive occupancy, measurements or provenance.

### Scientific and operational provenance

Verify exact sample lineage through roast/sensory and treatment group propagation. Check that experimental unit, subsample/replicate, denominator, missingness and confounders survive analysis. Roubik source and Néctar adaptation must remain distinct; no automatic historical effect multiplier or flavor claim. Check calibration snapshots, SOP/version/deviations, media derivatives, author attribution and dataset/report versions. New hive occupancy must not inherit previous biological state.

## 3. Test quality, not just test counts

Run relevant existing tests and necessary targeted adversarial cases. Look for assertions that merely mirror implementation, mocks that bypass authorization/transactions, and tests that cannot detect double deduction or stale state. Use stateful/property-based sequences where appropriate and fault injection for sync and migrations. Report physical-device/long-offline tests as unverified if you cannot run them. Passing build/typecheck is not a substitute for workflow, security or recovery evidence.

Map all applicable AT01–AT40 scenarios to Pass / Fail / Not run / Blocked / Not applicable with justification. Add tests for gaps specific to the actual diff. Do not claim exhaustive verification if scope is narrower.

## 4. Required findings format

For each actionable finding provide:

1. Severity and short title: P0 immediate catastrophic risk; P1 serious integrity/security/release blocker; P2 important functional/audit defect; P3 limited issue.
2. Exact file/symbol/line and reviewed commit.
3. Violated Q/requirement/invariant and relevant AT scenario.
4. Preconditions, minimal reproducible steps/fixture and observed result.
5. Expected result and concrete impact, including affected data or users.
6. Minimal compatible fix direction and regression test, without unrequested redesign.

Distinguish confirmed defect from risk/hypothesis requiring more evidence. If no findings are established, say so with scope and limitations; do not manufacture issues or certify the entire platform.

## 5. Final verification report

Lead with Pass for reviewed scope / Conditional / Fail, and blocking reasons. Include reviewed commits/diff, scope, tests actually executed, evidence links, unrun checks, migration/recovery results, decision deviations and remaining risks. Identify any lost or weakened user decision. Keep the verdict tied to evidence.

Return findings to Claude for correction. After fixes, verify the new exact commit and run targeted regression plus affected integration tests. Close a finding only when the reproduced failure is fixed without breaking invariants. Do not approve destructive migration or production release on confidence alone.


---

<!-- SOURCE FILE: 08-PRIOR-CONTEXT-AND-CONTINUITY.md -->

# Prior project context and continuity controls

This appendix protects earlier work from being lost in the new Coffee/Bee discovery. It is not a new order to implement every historical idea. **CONFIRMED DECISION** refers to user-requested/accepted direction; **IMPLEMENTATION REQUIREMENT** identifies preservation/reconciliation obligations; **OPEN TECHNICAL DECISION** identifies choices or missing evidence. Current code is not verified here.

## 1. Source coverage

| Source | Coverage | Use |
|---|---|---|
| Create Study Proposal | All 63 available turns, no reported attachments | Q1–Q49, revisions and final handoff direction |
| Compare Farm Management Software | All 19 available turns; three assistant messages truncated at 20,000 characters | Offline Android constraints, field sessions, operator UX, genealogy and repository audit |
| Plataforma digital Nectar Nómada | All 50 available turns; seven assistant messages truncated at 20,000 characters | Broader platform, prior architecture inputs, economics, sovereignty, community commerce and V3 compatibility |
| Set up Claude Code project context | Recent task context sampled | Public-site work is a distinct scope; not evidence of the OS repository's current contents |
| Impacto abejas polinización café | Recent 10 turns sampled | Historical applied beekeeping context; inspection source was missing and no operational counts are imported as current facts |

The first three transcripts are included. Ten truncated historical assistant messages are marked individually; their missing tails were not reviewed. All user messages and the complete Q1–Q49 discovery text were recovered. The sampled task contexts are not included wholesale because they add unrelated/private historical detail without establishing new approved OS requirements. In particular, the earlier apiary report explicitly lacked the inspection it purported to summarize; this packet does not adopt its dates/counts or pollination benefit claims as verified field evidence.

**IMPLEMENTATION REQUIREMENT:** a full conversation retrieval is not equivalent to recovering all files once attached to it. Several canvas/document references are placeholders; exact contents are unavailable here. The platform source exposes some technical PDF attachments, but those PDFs were not extracted/reviewed in preparing this packet. No dosage, equipment specification or migration should be justified by an unread attachment.

## 2. Existing platform architecture, reported rather than inspected

The user previously described a modular monolith using Next.js + PostgreSQL and a shared canonical model including People, Organizations, Locations, Projects, Samples and Assets. Historical prompts reference Prisma, Vercel, Neon and R2. They also mention public/private services, classification, permissions, Research OS, sensory, coffee processing and apiary work.

**IMPLEMENTATION REQUIREMENT:** inspect the actual repository and deployment configuration to establish what is present now. These are discovery leads, not certified stack facts. Search existing equivalents before adding `Farm`, `Site`, `Lot`, `Sample`, `Measurement`, `MediaAsset`, `Offering` or any new wrapper. Preserve in-progress changes and do not run schema generators/migrations simply because a document mentions Prisma.

The discovery's historical assistant reported existing apiary inventory/history, hive origins/movements/inspections, beneficio profitability, three-stage mass balance, detailed drying rules, Brix/pH/honey-type/humidity logic, yeast data, equipment schemas, workday/task visibility and tests. **IMPLEMENTATION REQUIREMENT:** find corresponding code and tests; mark each confirmed, partial, obsolete or unavailable. Do not rebuild those modules based solely on this report.

## 3. Broader platform concepts to preserve

**CONFIRMED DECISION — prior platform direction:** Néctar includes public discovery/storytelling, territory/maps, people/producers/partners, projects, products, services, consulting, tourism/experiences/reservations, commerce, research, sensory, competitions and an evidence-aware AI layer. Visitors can be guests; account users may gain permissioned functionality and personalized guidance. Coffee/cacao research specialization need not be generalized into every beverage process just because the parent platform spans more domains.

**IMPLEMENTATION REQUIREMENT:** preserve boundaries among public presentation, private operational truth and specialized tools. An approved story or product page is a publication projection, not a raw operational table exposed to the internet. Existing public-site and OS repositories/deployments must be identified separately. This handoff does not authorize merging them or redesigning a separate brand site.

Sensory already had a cross-platform purpose: coffee, honey, beer, wine, mead, spirits/liqueurs, guided experiences and competitions, with technical, public and judging use cases. **CONFIRMED DECISION:** Q20 strengthens standalone use; it does not narrow sensory to internal coffee panels. Preserve session, blind sample, individual/cup evaluation and aggregation distinctions wherever already built.

## 4. Content, adaptive experience and AI identity

**CONFIRMED DECISION — prior direction:** original photos, field video/audio, interviews, documents, maps, environmental records and research/sensory data can support multiple approved experiences. Content Intelligence, Creative/Marketing Intelligence, audiovisual production, adaptive user/operator experiences and research support should connect to canonical sources. Do not fabricate documentary facts, quotes, results or missing footage.

**IMPLEMENTATION REQUIREMENT:** maintain original → annotation/transcript/extraction → reviewed derivative → editorial composition → approved channel output lineage. Consent, rights and data classification travel with derivatives. Public storytelling cannot reveal a private client method merely because an AI can retrieve it. Preserve a useful operator focus even if visitors receive rich immersive interfaces; heavy public media must not burden an offline field screen.

**CONFIRMED DECISION — accepted AI design direction:** one coherent Néctar identity with professional modes and scoped tools, rather than unrelated personalities per module. Field/research/fermentation/sensory/gastronomy/storytelling/marketing modes vary depth and tone; they do not change factual or permission boundaries. The earlier “alchemist” metaphor is creative language, not a claim of mystical mechanisms. Humility about uncertain conclusions coexists with precision about observed facts.

**OPEN TECHNICAL DECISION:** actual provider/media stack, rendering, personalized experiences and release phasing. Names such as Cloudinary, Mux, Remotion, Cesium and Mapbox in earlier research are candidates, not approved dependencies.

## 5. Brand, marketing, community and Publer

**CONFIRMED DECISION — prior direction:** Brand/Marketing/Sales Enablement/Community Intelligence stays connected to canonical projects, offerings, campaigns, audiences, rights, approvals and outcomes. Publer was explored as a replaceable publishing/analytics adapter, not the system of record for Néctar's marketing strategy.

**IMPLEMENTATION REQUIREMENT:** preserve draft/review/publication states, attribution and approved data access. No autonomous public posting is authorized by this build packet. **OPEN TECHNICAL DECISION:** verify current Publer API, plan/permissions and specific comments/inbox/DM support; do not infer API coverage from UI features. The earlier architecture document's actual implementation status must be inspected.

## 6. Community marketplace and events

**CONFIRMED DECISION — prior user answers:** curated participation across farmers markets, expos, festivals, pop-ups, tastings, competitions and community events; vendors/exhibitors/contributors; products, services, experiences and projects; physical/digital discovery; and a future path for authorized partner-organized events. Earlier accepted direction includes direct-vendor payment and NN-mediated commerce, temporary event inventory, QR/provenance, approved public profiles, map/routes, agenda/workshops/tastings, shared Sensory OS, Event Passport, interests/favorites/follows, consent-based CRM/leads, collaboration opportunities and post-event analytics.

The exact earlier 20-question choices remain in the full platform source; do not silently reinterpret their letters out of context. **IMPLEMENTATION REQUIREMENT:** preserve current Event, Offering, Vendor and Commerce concepts and avoid duplicating them for Q49. Q49 adds production/buyer fulfillment traceability; it does not cancel the wider event-commerce vision or mandate full marketplace execution now.

**OPEN TECHNICAL DECISION:** current implementation stage, financial responsibilities, payment/refund settlement, subscription/marketplace boundaries and partner release criteria. Reconcile against existing approved plans.

## 7. Operational economics and data sovereignty

**CONFIRMED DECISION — prior user addition:** who worked, for how long, and what production cost matter; full payroll is not the initial goal. Account for ownership and access to resources, not just purchases. Assets/inputs can be bought, owned/pre-existing, borrowed, rented, leased, donated, transferred, partner/client-provided, internally produced or consigned. Cash outlay, economic/reproduction cost and in-kind contribution differ. A zero-cash input is not automatically free to reproduce.

**IMPLEMENTATION REQUIREMENT:** preserve WorkLog, CostEvent, ResourceUsage, supplier provenance, quantities/expiry, actual versus budget/scenario/forecast, original currency/date, shared-allocation basis and cost genealogy. Q23 specifies the first functional subset; it does not erase prior economics. Valuation methods such as FIFO/weighted average/specific identification were subjects to study, not interchangeable approved algorithms.

**CONFIRMED DECISION — user concern:** client export, backups and provider exit are part of being a scientific system of record. **IMPLEMENTATION REQUIREMENT:** portable data/evidence export, read-friendly reports, relationship manifests, restore drills and a provider exit plan. Preserve rights and audit lineage during tenant offboarding. Exact RPO/RTO, retention and contract terms remain open.

## 8. Beverage/process engineering extensions

Prior user direction expanded research into brewing/wine/cider/mead/distillation and technical operations: water/mineral profiles and salts, mash/saccharification/lautering/boil, grape/apple reception/crush/maceration/pressing/racking, cane extraction/bagasse/concentration, cultures/fermentation/MLF, distillation passes/cuts/proofing/alcohol balance, maturation/blending/packaging and equipment readiness.

**IMPLEMENTATION REQUIREMENT:** preserve approved specialized concepts such as Recipe / Formulation / Process Profile / Run and any existing DistillationRun rather than forcing every process into a coffee schema. Shared units, materials, equipment, evidence and inventory services are useful; biological/process semantics can differ. The new honey-to-beverage genealogy requirement is compatible with these modules but does not authorize their entire build during the current coffee/apiary increment.

Support/community knowledge was separately requested, including technical forums and manufacturer information. **IMPLEMENTATION REQUIREMENT:** separate community practice from scientific literature and approved Néctar standards; respect access/reuse rights. This packet does not reverify every historical forum or recipe source.

## 9. V1/V2 versus future V3 technical reference system

**CONFIRMED DECISION — explicit late prior direction:** let Claude finish V1/V2; prepare a forward-compatibility addendum for a later V3 Technical Product & Reference Data System. Do not turn that addendum into an immediate V3 implementation order.

**IMPLEMENTATION REQUIREMENT — preserve these distinctions now where foundational:**

| Distinction | Reason |
|---|---|
| TechnicalProduct vs physical InventoryItem/InventoryLot | Manufacturer identity/formulation differs from a purchased bag, quantity, expiry and supplier lot. |
| EquipmentModel vs EquipmentAsset | Rated specifications differ from a serialled unit, location, maintenance and condition. |
| Configuration/Capability vs asset name | One unit can accept attachments/probes and support different operations over time. |
| Measurement vs method/instrument/calibration references | Historical results require interpretable measurement provenance. |
| ManufacturerClaim vs NN_MEASURED / NN_OBSERVED | Product literature is not field validation. |
| TechnicalDocument vs DocumentVersion | TDS/SDS/manual/certificate versions must be preserved. |
| Product composition vs taxonomic label | Yeast/enzyme or mixed-culture formulations cannot be forced into one strain field. |
| Supplier lot/CoA vs generic product properties | Batch-specific results must not be copied to all instances. |
| Commercial culture vs BiologicalMaterial/Isolate | Future own isolates need origin/provenance without being falsely treated as commercial products. |

Use existing Product, Asset, Inventory, Measurement, Protocol/Run, Resource and Document concepts where semantics already support these distinctions. **OPEN TECHNICAL DECISION:** whether new tables or typed relationships/metadata are justified. A full catalog importer, manufacturer field-coverage matrix, product claims engine and biological registry remain deferred unless separately approved or already present. Avoid destructive future dead ends without expanding the entire current release.

## 10. Required repository documents to locate

Historical names below are search hints, not guaranteed files: `CLAUDE.md`; `AGENTS.md`; `EXTERNAL_DATA_ARCHITECTURE.md`; `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md`; `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`; `PLATFORM_ARCHITECTURE_RECONCILIATION.md`; `MASTER_IMPLEMENTATION_ROADMAP.md`; `AI_GOVERNANCE.md`; `SECURITY.md`; AI persona/modes/tools documents; Brand/Marketing/Community/Sales architecture; Phase 1 execution plan; Research OS/CryoBloom definitions; V1/V2/V3 compatibility addendum; current mobile/offline audit; canonical brand/publication rules.

**IMPLEMENTATION REQUIREMENT:** record Found / Renamed equivalent / Superseded / Missing for each. Missing artifacts are context gaps, not invitations to recreate incompatible replacements. Use Claude's existing conversation and repository knowledge to supply the actual approved documents. Ask only for genuinely blocking source material; continue the rest of the audit.
