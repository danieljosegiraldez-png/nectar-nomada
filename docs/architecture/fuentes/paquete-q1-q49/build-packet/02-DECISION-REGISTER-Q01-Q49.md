# Complete discovery decision register — Q1–Q49

Classification: **CONFIRMED DECISION**, except paragraphs explicitly marked **IMPLEMENTATION REQUIREMENT** or **OPEN TECHNICAL DECISION**. “Confirmed” means approved product intent in the recovered conversation; it does not mean implemented, scientifically validated, contractually executed, or approved for immediate addition to Claude's current sprint.

Source: *Create Study Proposal*, conversation `6aa9e679-5070-83e8-869b-b232bd5b3e10`. T-numbers link to the full chronological source transcript. Each question's options appear in the preceding discussion. Letter choices are cumulative only where the original options were cumulative; the expanded descriptions below take precedence over a shorthand letter. Examples, illustrative numerical values, tentative entity names, and assistant recommendations are not universal operating limits.

## Q01 — Commercial model and learning

**CONFIRMED DECISION — D initially; C later is possible.** Start with consulting + implementation + OS subscription as an integrated service. Later allow SaaS + optional consulting/training as capabilities mature. Use successes, mediocre outcomes, failures, abandonment and inconclusive work to improve master tables, parameters, equipment/process knowledge and analysis. Separate client operational data, reference knowledge and aggregated learning; retain evidence quality. Q35 revises the early permissions framing into contractual de-identified learning rights.

Source: [T004](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t004). **OPEN TECHNICAL DECISION:** pricing, packaging, billing provider, readiness criteria for independent SaaS.

## Q02 — Adaptive assessment and cross-domain intelligence

**CONFIRMED DECISION — K, emphasizing A + C + F.** A preliminary interview determines depth across agronomy, receiving, processing, drying/storage, equipment/lab, quality/sensory, business, people, data/traceability and pollination/ecology. Connect agronomy → processing → sensory to decisions, not isolated reports. Evaluate costs, yield and market value alongside quality. A fixed “20–30 question” count was illustrative, not mandated.

Source: [T005](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t005).

## Q03 — Operator identity and shared devices

**CONFIRMED DECISION — E + shared devices + Performed by.** Role-specific views include seasonal/temporary workers. Support simple onboarding and authorized shared devices. Keep Recorded by, Performed by and Verified by distinct. Verification depends on risk/SOP, not every action. A person without their own phone/account may be attributed as performer by an authorized recorder; attribution must not impersonate authentication.

Source: [T006](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t006). **OPEN TECHNICAL DECISION:** PIN/QR/NFC assurance and device enrollment mechanism.

## Q04 — Contextual priority and execution

**CONFIRMED DECISION — F.** SOP-driven work can be adjusted by managers, with suggestions based on measurements, time, resources and dependencies. Operators primarily see **DO NOW / NEXT / WAITING**. Preserve expected versus actual workflow and reasons for significant deviations. Human authority remains explicit.

Source: [T007](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t007). **IMPLEMENTATION REQUIREMENT:** deterministic explainable priority rules must work without cloud AI; advanced scheduling remains staged by evidence and readiness.

## Q05 — Manual and assisted capture

**CONFIRMED DECISION — A + F, permission-controlled and validated.** Structured manual entry remains the reliable baseline and always available for critical measurements. Optional photo/OCR, voice, instruments and sensors populate the same structured records with provenance. Supervisors/process managers authorize capture modes by user, field, method and risk. Test paired manual/assisted observations and error magnitudes, including dangerous outliers; confidence scores alone do not establish accuracy. Raw evidence survives interpretation.

Source: [T008](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t008). **OPEN TECHNICAL DECISION:** exact capture policy, validation thresholds, providers and on-device capabilities.

## Q06 — Anomalies, validation and escalation

**CONFIRMED DECISION — F.** Apply logical validation, contextual comparison, risk-based confirmation/evidence, and supervisor escalation. Preserve unusual observations and identify the comparison population. Correct errors with original value, corrected value, actor, time and reason retained. Physically/logically invalid authoritative operations are blocked; anomalous raw evidence is retained for review.

Source: [T009](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t009). **IMPLEMENTATION REQUIREMENT:** separate quarantined observations from accepted ledger effects so preserving evidence never creates impossible stock.

## Q07 — SOP governance, deviations and experiments

**CONFIRMED DECISION — F with controlled SOP governance.** Execution authority does not grant SOP-authoring authority. A manager overrides a specific execution with reason and observations; historical runs stay pinned to the SOP version used. Néctar may suggest revisions based on repeated deviations and outcomes. Authorized technical personnel publish new versions. Support hypotheses, controls, treatments, replicates and downstream quality/sensory linkage through a shared experiment engine.

Source: [T010](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t010). Phase-specific experimental depth is clarified by Q16, Q20 and Q31.

## Q08 — Beneficio resource model

**CONFIRMED DECISION — F, full operational target.** Model equipment, zones, capacity, availability, sanitation, dependencies, labor, water, energy, throughput and cleaning/changeover. Link forecast demand to bottlenecks and eventual costs/scenarios. Manufacturer capacity and observed sustainable capacity remain separate, with conditions and evidence.

Source: [T011](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t011). **OPEN TECHNICAL DECISION:** staged scheduling/optimization implementation. F was approved as target; no separate Q08 phase split was specified.

## Q09 — Solutions and commercial relationships

**CONFIRMED DECISION — Q9A: Phase 1 B → Phase 2 D → later/third phase F.** First diagnose and show solution classes. Then compare engineering adequacy using equipment/reference evidence. Later add the complete solution engine covering scheduling, training/SOP, infrastructure, equipment and experiments, with economic comparisons. Do not collapse these three stages into two.

**CONFIRMED DECISION — Q9B: 4.** Architect for neutral comparison, disclosed distribution and other commercial models without committing to one. User reports representing Fermentis/SafCoffee and selling other Fermentis products; reselling Lallemand/others must not be labeled official distributorship without evidence. Separate technical evidence from commercial relationships and record relationship validity over time.

Sources: [T012](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t012), [T013](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t013). These business relationships are user-reported context, not externally certified in this packet.

## Q10 — Evidence-ranked recommendations

**CONFIRMED DECISION — F.** Recommendations disclose manufacturer, literature, approved Néctar SOP, client-history and aggregated-field evidence, applicability and confidence. Learning can improve suggestions but cannot silently rewrite authoritative standards. Capture successful, acceptable, failed, abandoned and inconclusive outcomes with reasons and objective data; avoid learning only from successes.

Source: [T014](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t014).

## Q11 — Geography, material identity and selected plants

**CONFIRMED DECISION — revised parcel-centered model.** Farm → Field Parcel → optional Microparcel is the ordinary operating hierarchy. Field geography is distinct from Harvest Batch and Processing Batch. Do not populate all plants individually. Flag a selected plant when needed for unusual phenotype, agronomy, samples, research, harvest or sensory traceability; preserve inherited contextual history without inventing individual measurements.

**CONFIRMED DECISION — Q11B: C.** Separate permanent geography, temporary seasonal/experimental microparcels and overlapping analytical groups. One area can participate in several studies without changing permanent geography. Composite samples and mixed-origin harvests need many-to-many provenance, with measured proportions only when known.

Revision: the earlier tree-centered expansion is superseded; optional individual traceability survives. Sources: [T015](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t015), [T016](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t016), [T017](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t017).

## Q12 — Mapping

**CONFIRMED DECISION — Phase 1 D → Phase 2 F.** Farm/parcel polygons, optional microparcels and useful rows/grids allow selection for tasks, sampling, treatments, harvest groups and studies. Selected plants remain exceptions. Phase 2 adds spatial/longitudinal layers for yield, flowering, fruit set, disease, soil/foliar analysis, interventions, pollinators, environment and quality/commercial outcomes.

Source: [T017](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t017). **OPEN TECHNICAL DECISION:** map technology, offline tiles and geometry editing/versioning.

## Q13 — Harvest identity before receiving

**CONFIRMED DECISION — Phase 1 D → Phase 2 F.** Create harvest batches in the field, link parcel/microparcel origin, label sacks/bins/containers with offline identities and receive by scan or manual lookup. Full harvest-container transport custody, departure/arrival weights, discrepancies and transfer evidence deepen in Phase 2. Phase 1 identity must already accommodate that future chain.

Source: [T018](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t018). Q38/Q48 require other custody workflows in Phase 1; this does not silently promote every Q13 detail.

## Q14 — Receiving and research sampling

**CONFIRMED DECISION — Phase 1 D → Phase 2 F.** SOP-configurable receiving fields are Required / Recommended / Optional / Not applicable. Operational receiving can vary by purpose. Advanced research sampling captures design, frame, sample size, criteria, individual/composite observations, instruments, replicates and custody. A single Brix value is not equivalent to a documented multi-cherry sample.

Source: [T019](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t019). Q31 independently requires formal pollination-study structure in Phase 1.

## Q15 — Selection and incoming quality

**CONFIRMED DECISION — Phase 1 D + E → Phase 2 F.** Record received material, flotation removals, sorting outputs by configurable defect category, accepted mass, evidence and visual standards. Compare by source, cultivar, harvest and crew/supplier where recorded. Phase 2 relates picking, selection intensity, labor, losses, process, green/sensory quality and realized value.

Source: [T020](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t020).

## Q16 — Processing and fermentation

**CONFIRMED DECISION — Phase 1 through E → Phase 2 F.** Versioned configurable SOPs, process types/steps, vessels, material mass, additions/inoculum genealogy, pH/Brix/temperature/time series, observations, monitoring tasks and anomaly handling. Processes can repeat or combine steps; do not hard-code washed/honey/natural as fixed sequences. Phase 2 expands formal comparative process experiments and outcome intelligence.

Source: [T021](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t021).

## Q17 — Drying and release

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Asset/bed assignment, loading density/layer depth, turning and measurement tasks, environment, moisture trajectory, instrument/calibration provenance, final moisture/Aw where available, stabilization and authorized release. Phase 2 adds predictions with uncertainty and evidence, including expected capacity release.

Source: [T022](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t022). Existing drying logic must be inspected and extended, not replaced by a simplified checklist.

## Q18 — Physical inventory and genealogy

**CONFIRMED DECISION — F in Phase 1.** Full material genealogy supports transformations, splits/merges, containers, locations, movements, withdrawals and downstream destinations with mass balance. A container is not a lot. Samples are physical withdrawals and receive identity; quantities cannot disappear into attachment metadata.

Source: [T023](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t023).

## Q19 — Roast samples, cupping consumption and merma

**CONFIRMED DECISION — revised Phase 1 B + D + mandatory sample inventory/mass balance → Phase 2 F.** Native sample-roast/QC and comparisons retain exact roast-to-sensory lineage. Model detailed curves as an extension; integrations/deeper curve ingestion follow. All withdrawals, hulling/parchment removal, roast loss, roasted inventory and cupping consumption affect the ledger now. Distinguish transformation loss, byproducts, sampling, consumption, damage and corrections. Full production-roastery ERP was not approved by this decision.

Source: [T024](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t024). User explicitly strengthened the original recommendation; sample accounting cannot wait for Phase 2.

## Q20 — Standalone sensory sessions

**CONFIRMED DECISION — revised standalone engine in Phase 1.** Single or multiple users; independent Q graders, buyers, roasters, clients, guests and event participants; session owner/lead/participant roles; configurable versioned methods, blinded/random codes, exact sample genealogy when available, preserved individual evaluations, notes/media, basic aggregation and export. Farm subscriptions or farm roles are not prerequisites. Unknown external sample lineage stays unknown.

Phase 2: advanced statistics/design, evaluator longitudinal profiles, agreement/repeatability, buyer preferences and cross-domain intelligence. Supersedes an internal-panel-centered interpretation. Sources: [T025](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t025), [T026](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t026).

## Q21 — Farm operations

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Geospatial observations, condition/severity and media can generate tasks/interventions. Preserve agronomic history and recurring seasonal programs for nutrition, shade, disease and sampling. Reuse the platform task/SOP/priority engines. Phase 2 connects interventions to flowering, yield, quality, sensory and economics.

Source: [T027](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t027).

## Q22 — Sample and analysis engine

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Shared sample architecture covers soil, foliar, water, tissue/genetics, microbiology, coffee and honey through configurable panels/units. Record sampling provenance, method, depth where relevant, lab/method, raw reports and verified structured results. Report extraction is optional, supervised capture. Phase 2 connects successive analyses and interventions to outcomes.

Source: [T028](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t028).

## Q23 — Costs and profitability

**CONFIRMED DECISION — Phase 1 C + direct unit economics from E → Phase 2 D + F.** Attribute inputs, services, labor/time and direct costs by parcel/batch without duplicate entry. Financial capture is optional and separately permissioned. Phase 2 adds configurable shared/overhead allocations and deeper profitability. Retain process-state denominators; cherry cost/kg is not green cost/kg.

Source: [T029](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t029). Earlier resource-economics context remains relevant; valuation algorithms remain open.

## Q24 — Rolling harvest forecast

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Human estimates plus flowering/fruit-development observations inform timing, expected volumes, labor and processing capacity. Update forecast versus actual as harvest arrives. Phase 2 adds predictive models only with sufficient longitudinal data and explicit uncertainty.

Source: [T030](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t030).

## Q25 — Standalone beekeeping

**CONFIRMED DECISION — Phase 1 C + foundations of D/E → Phase 2 F.** Beekeeping is an independent vertical with inspections, movements, interventions, feeding, equipment, tasks, costs, harvest and inventory. Basic deployment/pollination assignment and ecological links start early; integrated agricultural intelligence follows. Q26 revises mandatory colony/queen genealogy into hive-centered operations with optional biological identities.

Source: [T031](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t031).

## Q26 — Hive versus colony

**CONFIRMED DECISION — Q26A: C.** Hive is persistent operational identity; Occupancy Episode describes the bees occupying it over time. Apiary → Hive → Occupancy → optional identified colony/queen. Absconding, death or removal closes occupancy; a later swarm starts another. Reusable chambers/supers/feeders/sensors move independently. Queen status can be an observation without a queen entity. Detailed biology is optional, like selected coffee plants.

Sources: [T032](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t032), [T033](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t033). The original colony-centered proposal was challenged, then replaced; no separate Q26B approval exists.

## Q27 — Hive inspections

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Fast routine capture with purpose/species-specific structured protocols, observations, interventions and follow-ups. Include queen evidence, brood, stores, population, behavior and health observations when appropriate; do not demand invasive inspection merely because fields exist. Phase 2 adds trajectories and outcomes by occupancy.

Source: [T034](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t034).

## Q28 — Honey genealogy

**CONFIRMED DECISION — F in Phase 1.** Hive/apiary harvest → supers/containers → extraction → settling/storage → packaging and downstream mead/spirits/other transformations. Gross/tare/net, wax/cappings, filtration, losses, samples and measured characterization are traceable. Apiary-level shortcut is allowed; missing individual hive weights stay unknown or explicitly estimated, never invented.

Source: [T035](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t035). This mandates ingredient genealogy, not simultaneous implementation of every beverage production module.

## Q29 — Temporal deployment

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Preserve positions, arrival/departure, purpose, people, transport and pre/post inspection, with group moves retaining each hive identity. Link pollination assignments to target crop/area and flowering windows. Phase 2 adds spatial/longitudinal research; changing a current location field is insufficient.

Source: [T036](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t036).

## Q30 — Managed stingless bees and wild pollinators

**CONFIRMED DECISION — revised Phase 1 C + D + E foundations → Phase 2 F.** Distinguish managed Apis, managed stingless-bee units (including Trigona/Melipona where identified) and naturally occurring/free-living pollinators. Species-specific management, deployment and standardized observation coexist. Taxon is configurable; management status is separate from taxonomy. Record baseline activity before deployment and observation effort. Phase 2 studies control, Apis, stingless and mixed deployments with appropriate experimental design.

Sources: [T037](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t037), [T038](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t038). Wild pollinators are not owned inventory; wild stingless nests are not automatically managed hives.

## Q31 — Pollination experiment design and Roubik

**CONFIRMED DECISION — Phase 1 D + E → Phase 2 F.** Shared Experiment Engine records hypothesis, experimental unit, treatment/control, replication, sampling, frequency, criteria and predefined outcomes plus cultivar, age, flowering, shade, weather, habitat, agronomy and baseline pollinators. Phase 2 extends the full outcome chain through coffee/sensory. David W. Roubik/STRI Panama Coffea arabica methodology is a named reference family in a versioned Pollination Protocol Library.

Sources: [T039](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t039), [T040](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t040). **IMPLEMENTATION REQUIREMENT:** separate published methods from Néctar adaptations; source findings are not guaranteed local outcomes.

## Q32 — Environmental monitoring

**CONFIRMED DECISION — Phase 1 D + E → Phase 2 F.** Manual observations, external weather, site stations and individual sensors are distinct sources. Retain placement, time, method/calibration and integration into farm, bee, processing and drying events. Hardware is optional. Phase 2 provides contextual environmental intelligence.

Source: [T041](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t041).

## Q33 — Knowledge and evidence graph

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Documents have source, author, organization, date/version, topic and DOI/URL; link to methods, assets, products, SOPs, experiments and recommendations. Extracted fields remain source-linked proposals until verified. Phase 2 Ask Néctar answers from authorized evidence with citations and evidence distinctions. Existing Ask Néctar functionality is preserved and audited, not removed because of this phasing.

Source: [T042](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t042).

## Q34 — Organizations and collaboration

**CONFIRMED DECISION — F architecture from Phase 1.** Multi-operation organizations, people with different memberships/roles, explicitly scoped external collaborators and bounded project/data rooms; consulting portfolio over permitted data. Ownership and access differ. Advanced portfolio intelligence can follow without retrofitting isolation.

Source: [T043](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t043).

## Q35 — Contractual learning rights, revised

**CONFIRMED DECISION — revised model, replacing the earlier opt-in framing.** Protect identifiable client operations, documents, proprietary process identity and confidential commercial information. Agreements establish Néctar rights to appropriate de-identified internal learning, aggregation, benchmarking, model/method development and service improvement. Derived knowledge retains internal provenance; external disclosure must not reveal contributors or reproduce proprietary recipes. Identifiable publication/case studies are separately authorized.

Sources: [T044](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t044), [T045](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t045). **IMPLEMENTATION REQUIREMENT:** eligibility must be backed by an applicable agreement/version; product intent is not proof that an agreement has been signed. **OPEN TECHNICAL DECISION:** disclosure thresholds, retention and rights-change handling.

## Q36 — Promoting knowledge to standards

**CONFIRMED DECISION — F with mandatory technical approval.** Observation → Hypothesis → Emerging Pattern → Validated Practice → Néctar Recommended Practice, with Inconclusive and Rejected/Unsupported states. Evidence quantity/diversity/quality and applicability boundaries matter. Authorized humans promote versioned SOPs, ranges, protocols or rules; AI cannot do this silently.

Source: [T046](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t046).

## Q37 — Measurement quality

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Asset/model/serial/manuals; calibration/maintenance with standards/buffers, lot/expiry, operator and evidence; measurement links to instrument, method, sample and historical calibration status. Preserve but flag questionable measurements. Phase 2 analyzes drift, inter-instrument differences and uncertainty; use this foundation for assisted-capture validation.

Source: [T047](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t047).

## Q38 — Consumables plus asset custody, revised

**CONFIRMED DECISION — Phase 1 E + Asset Custody & Movement.** Inputs, operational consumables, manufacturer lots/expiry, expected versus confirmed actual consumption, reusable/fixed assets, check-out/in, custody/location history, employee attribution, condition and optional/SOP-required photos. Coffee Farm and Bee Farm remain separate operational contexts even when people/assets cross sites. Separate owner, custodian, location and usage. Returns reconcile issued versus consumed amounts.

Phase 2 adds procurement forecasting, utilization, loss/damage, maintenance and logistics intelligence. Source: [T048](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t048).

## Q39 — Operational workday

**CONFIRMED DECISION.** Attendance/check-in/out, optional or required evidence, assigned site/tasks, equipment/supply issue and return, work attribution and labor allocation. Attendance time is not automatically productive task time. Initially stop short of full HR/payroll; later integration remains possible.

Source: [T049](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t049).

## Q40 — Sanitation and biosecurity

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Cleaning/dirty/unavailable status, movement policies, sanitation SOP execution, product/method/concentration where applicable, time/person/evidence and biological-context rules. Apply to relevant tools, instruments, PPE and people. Capture history now; Phase 2 reconstructs possible exposure paths without declaring causation.

Source: [T050](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t050).

## Q41 — Alerts and escalation

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Role- and severity-based notifications with SOP escalation, acknowledgment and resolution. Actual work remains a task/exception, not a disappearing notification. Phase 2 adds intelligent grouping and prioritization while preserving underlying events.

Source: [T051](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t051).

## Q42 — Distributed offline operation

**CONFIRMED DECISION — F as foundational Phase 1 architecture.** Durable offline creation, visible sync state, no silent overwrite, append-first operational events, authorized conflict resolution retaining versions/authors/devices/times, resilient IDs, inventory and custody reconciliation. Sophistication can be incremental; identity and sync semantics cannot be postponed.

Source: [T052](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t052). **IMPLEMENTATION REQUIREMENT:** clearly distinguish locally recorded, provisional and globally accepted actions; unrestricted disconnected devices cannot guarantee exclusive use of the same physical stock/asset without allocation or later reconciliation.

## Q43 — Risk-based corrections

**CONFIRMED DECISION — F for critical records, not universal immutability.** Low-consequence edits stay simple. Operational records retain correction history. Critical measurements, research, custody, inventory and genealogy require amendments/reversals with reason and risk-appropriate authority. Never silently erase original critical evidence.

Source: [T053](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t053).

## Q44 — Identity, QR and NFC

**CONFIRMED DECISION — F in Phase 1.** Human-readable IDs plus QR by default, optional NFC, workflow-context scanning, purpose-specific label templates and temporary-to-permanent offline reconciliation. Original field identity remains resolvable. Machine-readable identity is never the only identity.

Source: [T054](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t054). **OPEN TECHNICAL DECISION:** identifier syntax/prefixes; proposed CF/AP/H/HB/PB/SMP/EQ examples were not locked.

## Q45 — Media evidence

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Attach contextual author/time/object/location where available, purpose, annotations and optional AI extraction under capture policy. Preserve original media; compression, edits, annotations and transcripts are derivatives with provenance. Phase 2 adds longitudinal visual comparison and deeper computer vision.

Source: [T055](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t055).

## Q46 — Consulting implementation lifecycle

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Structured findings with severity, evidence and recommendations produce projects/tasks, equipment needs, SOP changes, training or experiments. Establish baselines and verify outcomes: gap → evidence → intervention → implementation → follow-up → result. States include open/planned/underway/implemented/verified/unresolved. Phase 2 learns across eligible engagements.

Source: [T056](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t056).

## Q47 — Competency and authorization

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Separate access role, demonstrated/trained competency and current organizational authorization. Support training, renewal/reassessment and SOP-enforced requirements for sensitive actions/verification. Phase 2 studies measurement consistency and training effectiveness without simplistic automated employee scores.

Source: [T057](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t057).

## Q48 — External services

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Contacts → service requests → sample/asset custody → results/documents → verification → return or consumption. Limited external links/accounts allow receipt/results/actions without exposing unrelated client data. Reuse permissions, evidence and material engines. Phase 2 adds provider turnaround, costs, methods and performance intelligence.

Source: [T058](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t058).

## Q49 — Commercial traceability

**CONFIRMED DECISION — Phase 1 E → Phase 2 F.** Phase 1 includes destination/buyer, quantity/format/price/currency/date/basic terms, reservation/allocation without premature stock removal, exact buyer-sample genealogy and feedback, packaging/containerization, shipment and delivery. Phase 2 analyzes quality/process/origin, buyer feedback, price, repeat purchase and production cost. This is an operational-commercial bridge; not an instruction to build full accounting/CRM or replace existing Commerce.

Source: question options in [T058](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t058); explicit final approval in [T060](09-DISCOVERY-SOURCE-TRANSCRIPT.md#t060), reaffirmed by the current packet request. No unresolved Q49 vote remains.

## Revision controls Claude must preserve

**CONFIRMED DECISION:** Q5 manual plus optional assisted capture; Q9A three-stage progression and Q9B commercial-neutral architecture; Q11 parcel-centered correction plus Q11B C; Q19 sample deductions now; Q20 standalone sensory; Q26A hive/occupancy revision; Q30 managed stingless-bee revision; Q35 replacement of opt-in with contractual learning rights; Q38 expansion beyond consumables plus Coffee/Bee context separation; Q49 explicit E → F.

**IMPLEMENTATION REQUIREMENT:** If repository terminology differs, map semantics first. Do not treat an older assistant proposal in the source transcript as superseding a later user correction. New technical choices need their own architecture decision record and must not be backfilled into this register as if the user had selected them.
