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
