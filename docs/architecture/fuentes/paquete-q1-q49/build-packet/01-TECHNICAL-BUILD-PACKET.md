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
