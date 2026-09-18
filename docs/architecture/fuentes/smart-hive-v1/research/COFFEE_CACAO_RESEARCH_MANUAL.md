# Nectar Nomada coffee and cacao pollination research manual

Version 1.0 — 2026-09-16. Consolidated planning, field-method and software-requirements edition. This manual includes an evidence catalogue of 40 records; it is not a claim to have found every study, reanalysed their raw data or completed a formal systematic review. Some records are abstract-level; the catalogue marks the access and extraction limits. Local trials and taxonomic validation have not yet been performed.

## Read and use this package

1. Use this manual to select a research question and crop-specific workflow.
2. Consult [the evidence catalogue](STUDY_EVIDENCE_CATALOGUE.md) for published methods, results and lessons, including null results and trade-offs.
3. Use [equipment and consumables](EQUIPMENT_AND_CONSUMABLES.md) to plan the non-hive kit.
4. Use [field forms](FIELD_FORMS.md) for actual observations and [software requirements](RESEARCH_SOFTWARE_REQUIREMENTS.md) for the platform implementation.
5. Import study_registry.json, method_catalogue.json and equipment_consumables_catalogue.json as **proposed reference content**, not as fabricated farm records. The accompanying JSON schema describes the combined reference bundle.

Published observations are evidence about the settings studied. Our field procedures, inventory quantities, database design and acceptance targets are new proposals. An unextracted sample size, exact mesh or laboratory procedure remains unknown; a missing value is not permission to guess.

## 1. What the evidence supports—and what it does not

Coffee and cacao require separate protocols. Coffee work includes bee exclusions, single visits, forest gradients, colony additions and cup quality. Cacao work includes very small flower visitors, donor compatibility, pollen quantity/quality, habitat manipulation and loss of young pods. A stingless-bee hive can provide useful coffee context; it must not be presented as a proven cacao pollination intervention simply because it is nearby.

The evidence catalogue deliberately retains counterexamples: no fruit-set effect with a fruit-mass effect (C09), quality trade-offs (C13), more cherelles without more mature pods (K01/K07), and context-dependent community effects (R02). These support a design that measures outcomes separately rather than assuming all improvements move together. See the linked primary sources in those records.

Two recent cacao records deserve side-by-side reading: K12 identifies promising crawling visitors using several indicators; K13 emphasizes reproductive-part behavior and pollen carriage by biting midges. Their regions and evidence differ. Our software must preserve those disagreements and allow `unknown`; it must not decide that every ant is a pollinator or that every non-midge is irrelevant.

**Evidence ladder:** observed visitor → observed floral contact → measured pollen carriage → measured deposition/viability → fertilization evidence → early fruit set → surviving mature harvest → measured quality/economic outcome. Each step needs its own observation or analysis. A camera label is not evidence of all later steps.

## 2. Choose the experiment before buying equipment

| Question | Proposed design | Primary outcome | What this does not establish |
|---|---|---|---|
| Can we see and identify local visitors? | One-plant optical/annotation pilot; known-scale and expert checks | Detectability and identification at supported rank | Yield benefit or hive origin |
| Does insect access change production? | Randomized matched OPEN/EXCL cohorts, optional validated SHAM | Mature crop mass per declared initial denominator | Which species or managed colony caused the difference |
| Is natural pollination below attainable levels? | OPEN versus SUPP_CROSS plus handling control when appropriate | Mature harvest and fruit retention | Cost-effective benefit from adding hives |
| Is a visitor effective per visit? | Virgin receptive flower, witnessed visit, re-isolation; no-visit/positive controls | Pollen deposition or separately tracked fruit outcome | Population contribution without visitation frequency |
| Does a particular cacao donor work? | Recipient × donor cross design, self/open controls | Set, survival, seed quantity/quality | Universal compatibility across clones/environments |
| Does colony or habitat management help? | Replicated independent intervention/control units, baseline and concurrent follow-up | Harvest/cost effect and visitor response | Causation from a simple near/far correlation |
| Does pollination improve quality? | Keep biological replicates separate through standardized processing and blind assessment | Predeclared seed/cup/sensory metrics | Quality inferred from Brix or cherry size alone |

Begin with the one-plant coffee pilot already requested. A cacao pilot is an additional crop-specific activity, not an automatic extrapolation of the coffee camera's performance. Pilot results determine required equipment, workload and statistical replication for the main study.

## 3. Common requirements and experimental discipline

Freeze crop/genotype, target taxa, farm and season, question, independent unit, treatment factors, primary outcome, sample-size rationale and missing-data rules before outcome analysis. The study site is unknown; Florida 33195 is only the delivery destination.

Select comparable plants/branches before randomization. Retain allocation seed/list and photograph the selected cohort. Tag supporting tissue and map flowers/nodes rather than tying labels to petals. Record baseline flower/bud counts, prior flowers/fruits, shade, weather, irrigation, pruning, sprays, disease and nearby colonies. Avoid intervention-induced changes in visitor access except those defined by the treatment.

A branch treatment on one plant has a shared plant environment. A tree-level habitat intervention can affect several branches and neighboring trees. Colony additions can spill across nominal microparcel boundaries. Store the unit receiving treatment separately from the unit measured; do not treat each flower, video frame or observation day as an independent replicate.

Choose replication with pilot variance, desired effect and clustering in mind. No power calculation is supplied because those inputs are not known. The reported sizes in the evidence catalogue are descriptions of prior studies, not our required sample sizes. A design review must distinguish a practical method pilot from a trial capable of causal inference.

## 4. Netting qualification and an update to the earlier pilot specification

The earlier coffee guide's 150–200 µm material is **one candidate for qualification, not a final procurement specification**. The evidence map includes coffee experiments with substantially coarser apertures (C09/C12). This does not mean coarse netting excludes cacao's smaller visitors or all coffee visitors. Choose the target group first; then test exclusion, seams, closures, pollen permeability, airflow and handling.

Record physical aperture in both dimensions, material, thread properties when supplied, color, dimensions, supplier/lot, supports, closure method, photographs and installation/removal times. Mesh count alone is insufficient. Use a qualified single material within a comparison or model material as a declared factor. A SHAM can diagnose some support/shading effects but cannot perfectly reproduce a sealed sleeve.

Run a fit/ventilation trial on non-study flowers. Log paired microclimate and inspect after rain/wind. Reject rubbing, trapped insects, ingress, condensation injury or ambiguous closures. Do not let the bag touch reproductive structures. Take bag breaches seriously: record their time and uncertainty, keep the original assignment, and apply the predefined analysis rule. Replacing a torn bag does not erase previous exposure.

## 5. Coffee protocol

The complete coffee-specific procedure is included in Appendix A below. It retains the user's one-plant OPEN/EXCL pilot and separate entrance/flower views. Extend it using method P03 for a single-visit question or P04 for pollen supplementation only after training and approval of the crop-specific manipulation procedure.

The previously selected HQ camera/16 mm lens remains a coffee optical-pilot candidate. Pass the actual smallest-insect, flower-depth, protective-window, shade and motion tests before purchasing replicated sets. For identification, prioritize sharp landed-visitor frames; flying trajectories and counts need separate validation.

## 6. Cacao protocol: distinct flower and donor tracking

### 6.1 Set up a cacao feasibility pilot

Identify each recipient tree and clone/genotype when known; record `unknown` rather than guessing from pod appearance. Map flower cushions on the trunk/branches, with height and position. Assign individual flower IDs within a dated flowering cohort. Record existing pod burden, plant health and local microclimate. Select accessible locations without assuming that their flowering/fruit behavior represents the entire tree.

Use OPEN and EXCL for access questions. For limitation/compatibility questions, use OPEN, SUPP_CROSS and SELF as scientifically appropriate, with compatible donor candidates and a handling control. Optional insect-only or crawling/flying-access factors need validated devices and their own SOP. Do not use adhesive barriers or altered stems casually: they can affect several visitor groups and other ecological processes.

Before allocating experimental flowers, demonstrate that the chosen isolation device keeps the target visitors out without crushing cushions, retaining water or substantially changing the environment. Use individual or cushion-scale isolation that fits the geometry, not an oversized coffee branch bag by default. The sleeve/device SKU remains a pilot outcome.

### 6.2 Daily flowering and controlled treatment

Observe local bud opening and receptive timing before fixing the working schedule. Bag selected unopened flowers according to the validated local protocol. Identify donor and recipient before manipulation; log operator, collection/transfer time, donor condition, isolation and any floral damage. Maintain separate tools or validated clean-and-dry cycles between donor identities. Use the crop specialist's demonstrated transfer procedure rather than assuming a brush, finger or arbitrary number of anthers gives a known pollen dose.

For SELF, pollen comes from the prescribed same recipient genotype/flower relationship; record exactly which. For CROSS, log donor tree/genotype, not simply “another flower.” Unknown or suspected incompatible crosses are exploratory and must be labelled. Pollen age, storage and dose proxies are explicit fields. Measured pollen grains are stored separately from the number of donor anthers used.

Re-isolate and remove isolation according to a predefined, locally verified receptive-period rule. A previously visited flower cannot be relabelled virgin. Retain all handling-control observations. The detailed manipulation, receptivity and compatibility SOP is a local qualification requirement—not a missing step to be invented from an abstract.

### 6.3 Visitor evidence and specimens

Frame a single flower or small cushion with the camera. Measure the smallest target insect at the object plane. The coffee optical setup may be inadequate: cacao requires its own macro scale, depth, weather and illumination tests. Start a daylight/dusk coverage pilot and assess whether additional periods are needed; scheduled short clips can miss rare brief visits. Preserve scheduled effort and detection failures. If event triggering is used, retain random untriggered windows to estimate missed activity.

Score flower part contacted, activity, entry into reproductive structures, taxon/rank, confidence and visibility. Do not score invisible contact as absent. If specimens or pollen evidence are needed, allocate separate flowers/visits so collection does not silently alter the yield cohort. Pollen-on-body, stigma deposition and viable pollen are distinct assays. Review preservation order with the laboratory: K13 specifically illustrates fresh pollen assessment before ethanol preservation. Store raw microscopy images and taxonomist decisions.

### 6.4 Track losses and harvest

Record the fate of every allocated flower/cohort: unopened, opened, abscised, early set, growing cherelle, wilted, visibly damaged/diseased, missing/unknown, mature, harvested. A proposed schedule is a locally validated early-set visit (K08 used six days), then weekly during early development and a fixed later follow-up through maturity; freeze the actual calendar before starting. It must fit local phenology and labor capacity, not assume coffee's schedule transfers.

Count early set and final harvest with explicit denominators. Record pod burden and competing cohorts. Distinguish suspected physiological wilt from disease/predation with evidence and allow uncertain cause. Do not relabel every missing pod as pollination failure. At harvest, preserve tree/treatment/cohort identity, measure pod and wet-seed quantities, and record marketable versus rejected output.

For dry-bean outcomes, specify fermentation, drying, moisture method and mass basis. Do not compare freshly wet beans with dry commercial yield or combine treatment batches before weighing. Tiny pilot samples may be insufficient for representative fermentation or sensory assessment; retain a quality-feasibility status rather than generating unsupported flavor conclusions.

### 6.5 Habitat and colony interventions

Use a separate protocol for litter/husk/banana-substrate treatments. Record locally approved material source, health status, dose/mass, moisture, location, distance to trees, date and replenishment. Review disease and pest consequences with the farm agronomist before deploying organic material. Add concurrent controls and replicated treatment units; monitor both early set and harvest. K04 and K07 show why a positive substrate response in one setting cannot be assumed in another.

A managed stingless colony is not the default cacao intervention. Establish local visitor effectiveness first. If testing it, document the hypothesis explicitly, use suitable independent controls, and retain negative/null results. Neither camera timing nor nearby hive activity proves a cacao visitor originated in that colony.

## 7. Analysis and conclusions

Prespecify one primary contrast/outcome and label secondary/exploratory comparisons. Preserve raw denominators, not only percentages. For fruit set, use successes and eligible trials; for visits, use recorded flower-time exposure; for repeated fruit loss, retain observation dates and states. Mixed or hierarchical models must reflect actual randomization and nesting, with suitable checks for dispersion and model fit. A simple paired pilot plot is often more defensible than a poorly replicated significance test.

Report effect size and uncertainty, absolute versus relative changes, and unit/denominator. Example: a change from 2% to 7% is +5 percentage points and +250% relative—not “5% improvement.” A ratio of two is a doubling (+100%), not +200%. Do not combine fresh cherry mass, pod number, dry beans, fruit-set percentage and image-detector F1 into one improvement score.

Economics uses measured marketable output, actual local price/date/currency, materials, labor, maintenance, equipment depreciation and opportunity costs. Historical study returns do not become our forecast. Labor efficiency can be reported as minutes per treated flower and cost per incremental marketable unit, with uncertainty and a defined counterfactual.

The literature catalogue is an evidence map, not a newly computed pooled effect. Reviews reuse primary studies; related publications may share farms or experiments. Check overlap before any future meta-analysis. Do not count the 2024 camera preprint and its 2025 publication twice. Catalogue K15 uses the published version.

## 8. Workload, inventory and software use

The equipment catalogue contains 34 entries across reusable assets, instruments, consumables, biological material and services. Method catalogue P01–P08 connects these to source studies. Selecting a method should generate a proposed checklist and material reservation, then require operator review; it must not automatically buy equipment or schedule manipulations.

Plan labor from a timed pilot: setup, daily sleeve checks, pollination, observation, manual annotation, fruit follow-up, processing and QA. Media review may exceed recording labor. Budget expert verification separately from AI model execution. Camera uptime, field completeness and identification accuracy are different performance metrics.

The software specification distinguishes research references from local protocols, local executions and conclusions. No research portal or external publication has been deployed by this packet. The JSON bundle supplies versioned content for implementation and review.

## 9. Required local decisions before a replicated launch

- Site, coffee cultivar/cacao genotypes and target bee/visitor taxa.
- Study objective, independent units, treatment allocation and statistically justified sample size.
- Qualified mesh/isolation device and object-plane camera performance.
- Crop-specific receptivity, donor compatibility and manipulation technique.
- Accessible-flower denominator and methods for uncertain counts.
- Field/lab personnel, specimen permissions where applicable, QA and workload.
- Primary harvest measure, processing/quality facilities and missing-data rules.

These decisions remain visible in the platform as setup requirements. They are not reasons to fabricate a complete purchasing order or falsely release a protocol as field-validated.

## Appendix A. Full coffee field protocol

The following is the earlier operational coffee protocol, incorporated for one-file use. Section 4 above clarifies that its fine-mesh candidate is provisional, and the cacao workflow above must not be inferred from it. Its original version/date remain for provenance.

### Coffee pollination experiment: requirements, method and field equipment

Version 0.1 — 2026-09-16. Prepared for Nectar Nomada. Scope: equipment and experimental work **besides the Smart Hive Node**, including branch netting, cameras, measurements and records. Status: proposed field protocol for a one-plant feasibility pilot, followed by a separately designed replicated experiment. This document is not represented as Roubik's exact protocol or as a completed validation.

**Evidence notation:** [R] source-supported background; [D] proposed design or operating target; [U] unresolved before the applicable experiment begins. Unless marked [R], procedures, quantities and thresholds below are [D].

#### 1. Questions and limits

The pilot asks whether we can reliably film and classify coffee-flower visitors, keep pollinator-exclusion sleeves intact, count a defined flower cohort and follow its fruit outcomes. The subsequent study asks whether open branches differ from insect-excluded branches in fruit set and harvested cherry mass per initial flower.

[R] Roubik's 2002 publication compared open and fine-mesh-bagged branches of coffee plants in Panama. It supports the open-versus-exclusion approach, but the brief publication does not specify all materials and operational details needed here. [Roubik, *The value of bees to the coffee harvest*](https://stri-sites.si.edu/docs/publications/pdfs/Roubik_coffeepollination.pdf).

An open-versus-bagged comparison measures differences associated with insect access **and any remaining bag effects**. It does not isolate the contribution of our managed stingless-bee colony. That requires a separate replicated colony-addition/control design accounting for background colonies and overlapping foraging areas. One plant, many flowers on that plant, or three nearby hives are not automatically independent replicates. Entrance and flower videos cannot establish an individual insect's hive of origin.

[R] FAO's pollination-deficit handbook provides a broader framework for site selection, pollination treatments and production measurements. Our one-plant pilot is not a substitute for that replicated field design. [FAO handbook, 2011](https://www.fao.org/4/i1929e/i1929e.pdf).

#### 2. Information to freeze before the trial

| Requirement | Record before use |
|---|---|
| Coffee | Species, cultivar, approximate age, plant condition, management and flowering flush ID; arabica and canephora must not be treated as biologically interchangeable |
| Bees | Managed stingless-bee species, colony history and likely local visitors; smallest target insect and required identification level |
| Site | Country, farm, block/microparcel map, slope, shade, plant spacing, coordinates with controlled access, distance to hive and other colonies |
| Study question | Visitor documentation, insect-access comparison, pollination deficit, or managed-colony effect; select a primary question |
| Treatments | Codes, allocation method, sleeve specification, bagging/removal rules and optional sham treatment |
| Outcomes | Primary outcome, denominator, follow-up dates, ripeness definition, missing-data rules and intended effect size |
| Responsibilities | Field lead, camera/data lead, taxonomic reviewer and statistical reviewer |

The shipping ZIP 33195 is a procurement destination; it is **not assumed to be the experiment location**. Coffee cultivar and bee species remain [U]. Avoid fixing final mesh, sample size or species-classification claims before these are known.

#### 3. Treatments and experimental units

| Code | Treatment | Purpose |
|---|---|---|
| OPEN | Tagged branch/cohort accessible to normal visitors | Observed insect visitation and fruit outcome |
| EXCL | Matched cohort enclosed before flowers open, with insect-exclusion sleeve | Comparison under insect exclusion; not assumed to exclude airborne pollen |
| SHAM, optional | Same support/handling with a deliberately open sleeve arrangement documented in photographs | Diagnose some enclosure/handling effects; an open sleeve cannot perfectly reproduce a closed sleeve's microclimate |
| SUPP, later optional | Open flowers receiving a botanist-approved supplemental compatible-pollen treatment | Separate question about pollen limitation; requires its own donor, timing and handling protocol |

Do not include SUPP in the basic kit or improvise hand pollination without a crop-specific procedure. Flower visitation, apparent reproductive-part contact, pollen deposition, fruit set and mature yield are separate observations.

**One-plant pilot:** select one matched pair of healthy branches at comparable height, exposure and bud stage, then randomize which receives OPEN and EXCL. Add one SHAM branch only if the plant has a reasonably comparable third branch. Photograph eligibility and allocation before bagging. A second pair can test repeatability of handling but does not create another independent plant.

**Replicated study:** distribute matched treatment sets across multiple plants and blocks, randomize within each matched set, record the randomization seed/list, and balance camera observation effort across sets. Plan sample size using the chosen effect size, pilot baseline/variance and clustering. Do not choose a sample size solely from available bags. Flowers are nested within branches, branches within plants, and plants within blocks. A single plant yields descriptive pilot results only.

#### 4. Netting and branch supports

Buy a small sample of **plain, untreated, breathable insect-exclusion sleeve material** first. Obtain the manufacturer’s physical aperture dimensions in micrometres or millimetres, polymer, thread diameter if available, light transmission, dimensions, seam method and outdoor durability. “150 mesh,” “mosquito-proof” and “organza” alone are not adequate specifications; mesh count is not the same as opening size.

A **150–200 µm aperture material is a pilot candidate**, not a claim that this is Roubik's mesh or the optimum for this coffee. Its ventilation and exclusion performance must be tested. Coarser material may suffice for the target bees but admit other small visitors; much finer material can further alter airflow and pollen passage. Define whether EXCL means all relevant flower visitors or only a particular size group.

[R] BugDorm describes a commercial cage material with a 170 µm aperture, demonstrating a source category for fine netting; that cage listing is **not an approved branch-sleeve part number**. [Manufacturer reference](https://shop.bugdorm.com/index.php?cPath=1_43_14&view=all). Ask a scientific supplier for branch sleeves or suitable fabric with documented aperture. [MIDCO's pollination-bag page](https://midcoglobal.com/product/pollination-bags/) offers configurable materials/sizes, but compatibility, price and delivery to 33195 need a quote. No specific Amazon sleeve has been verified.

[R] An experimental comparison of exclusion fabrics found that fabric choice changed pollen penetration. Therefore, an insect barrier cannot be treated as a neutral enclosure or automatically as a pollen barrier. [Neal & Anderson, 2004](https://pmc.ncbi.nlm.nih.gov/articles/PMC4242310/).

Select sleeve size from the **measured branch envelope**, allowing growth and clearance without petals touching wet netting. Trial approximately 30 × 50 cm and 40 × 60 cm sleeves only if those sizes fit; these are sizing candidates, not mandatory dimensions. Use smooth lightweight hoops/supports and soft adjustable ties. Inspect the base closure, seams and cable/probe entries; no gaps, crushing or girdling. Avoid glue, scented products, insecticides and sticky traps near flowers. Do not use airtight plastic bags or bird netting as substitutes.

##### Sleeve qualification before experimental flowers are enclosed

1. Measure/sample apertures with magnification and a scale or obtain a traceable material specification; retain a labelled material swatch and lot ID.
2. Fit a sleeve on a non-study branch. Confirm wind does not rub flowers or collapse the fabric onto them; check drainage after rain.
3. Check closures and seams against the smallest target visitors. Run observational exclusion checks under natural exposure; no visible ingress is useful evidence but not proof of absolute exclusion.
4. Log temperature/RH inside a trial sleeve and at a paired open branch for at least 48 hours, including sunny and shaded conditions. Compare sensors side-by-side before fitting. Keep probes similarly positioned and out of direct solar radiation; document any measurement shading.
5. Predefine acceptable microclimate differences with the research lead before examining fruit outcomes. Flag sustained differences exceeding approximately 2°C or 10 RH percentage points during the pilot for redesign/review; these are diagnostic triggers, **not validated biological tolerances**. Condensation, flower injury or repeated ingress is a failure regardless of those numbers.

#### 5. Non-hive equipment and pilot quantities

Quantities below serve **one plant, one OPEN/EXCL pair and an optional SHAM**, not a statistically powered trial. Required instrument values are purchasing specifications/targets, not verified claims for an unnamed product.

| Item | Pilot quantity | Minimum useful specification / purpose |
|---|---:|---|
| Trial branch sleeves | 6 total | Two candidate sizes/material samples, spares for qualification and damage; freeze one qualified material for study comparisons |
| Smooth sleeve supports | 3 sets | Hold fabric clear without altering branch position excessively |
| Soft adjustable ties and closure clips | 1 small pack each | Reusable, non-girdling; inspect as stems grow |
| Weatherproof plant/branch/node tags | 30 | Unique IDs readable in photographs; tag supporting wood, not petals |
| Field notebook, pencil, permanent marker, clipboard | 1 set | Water-resistant records; digital backup daily |
| Smartphone with clock/GPS and field forms | 1 | Map, timestamps, setup photographs; offline operation |
| Measuring tape; millimetre ruler | 1 each | Layout, branch dimensions, camera scale reference |
| Hand lens | 1 | Approximately 10× for damage/visitor inspection; not a substitute for a taxonomic microscope |
| T/RH loggers with small probes | 2; 3 if SHAM monitored simultaneously | One per compared treatment; target specified accuracy ≤0.5°C and ≤3% RH, 1–5 min intervals; synchronized clocks |
| Rain gauge | 1 per site | mm scale, level installation in suitable exposure; record reading time |
| Portable wind meter | 1 shared | Approximately 0.1 m/s display resolution; record actual manufacturer accuracy and sampling method |
| Ambient thermometer/weather reference | Existing site station or 1 | Context outside sleeves; hive brood temperature is not branch temperature |
| Precision balance | 1 shared | At least 200 g capacity, 0.01 g readability for individual cherries; verify repeatability and accuracy with check masses |
| Bench balance | Optional, 1 shared | Approximately 2 kg capacity, 0.1 g readability for larger harvest batches |
| Traceable check masses | 1 set | Span expected fruit/batch measurements, e.g. 1, 10 and 100 g; selected to match balance accuracy needs |
| Labelled harvest containers and trays | 10 pilot containers + spares | Separate each treatment/date; identify tare, avoid condensation and crushing |
| Digital caliper | Optional, 1 | 0.1 mm sufficient display resolution for repeatable fruit dimensions; record orientation |
| Refractometer | Optional, 1 | Range covering expected cherry juice; record Brix resolution/accuracy and temperature correction; exploratory outcome only |
| Distilled water, lens cloths, clean cleaning supplies | 1 set | Instrument cleaning/zeroing as appropriate; keep cleaning residues off study flowers |
| HQ flower camera + 16 mm lens | 1 each | See linked camera specification and optical acceptance tests |
| Entrance camera | 1 | Camera Module 3 Standard candidate; contextual colony activity |
| Recorder, storage, independent power, housings, mounts | 1 complete set | Dual-camera capture verified; two verified copies of raw clips; no mounting load on hive scale |
| Expert reference photography/identification access | 1 arranged service | Entomologist and, when needed, microscope/reference collection access |
| Insect collection net/vials | Conditional only | Only if reference specimens are necessary and collection is authorized; collect outside scored observation periods |

A pollination exclusion sleeve and an insect-catching net are different tools. Collection can disturb visitor abundance; never catch or bait insects in a treatment during its scored observation session. Do not assume a camera or hand lens alone resolves every stingless-bee species.

**Lean purchase priority:** sleeves/supports/tags, paired T/RH loggers, flower-camera pilot, ruler/notebook, suitable balance/check masses and harvest containers. Borrow the wind meter and specialist identification equipment if possible. Add calipers, Brix and detailed seed-processing equipment only if those outcomes are predeclared.

For scaling, number of exclusion sleeves = plants × exclusion branches per plant × simultaneous flowering cohorts, plus approximately 20% replacements/qualification spares; round up. Add SHAM materials separately. Replacing a breached sleeve does not restore an uncontaminated treatment retrospectively. Quote exact supplier SKUs and shipping to Florida 33195 before ordering; this document does not claim a complete price-verified shopping cart.

#### 6. Field method and timeline

##### Before the flowering flush

1. Map plants and neighboring colonies, identify cultivar and record shade, pruning, irrigation and recent agricultural treatments. Define the target cohort and final ripeness rule.
2. Label block, microparcel, plant, branch and selected nodes. Use overview and close photographs so flowers can be linked to later fruits without attaching tags directly to delicate flowers.
3. Count eligible unopened buds in the cohort; record existing fruit and previously opened flowers separately. Randomize treatment allocation after selecting comparable branches.
4. Complete camera and sleeve qualification. Compare loggers together and check balance zero/repeatability with masses. Record instrument serials, settings and calibration/check dates.
5. Fit EXCL **before the cohort opens**; inspect for trapped insects and document closure. A cohort first bagged after visiting insects had access cannot represent exclusion from the start. Log it as a deviation or select a new cohort by the predefined rule.

##### During flowering

6. Check at least daily near expected opening, increasing visits as local flowering timing requires. Record newly opened flowers from the original cohort without opening EXCL. Use visible node mapping and exterior photographs. If the chosen material prevents reliable counting, resolve the counting method during qualification; do not unzip the experimental bag to count.
7. Keep separately: eligible buds, confirmed opened flowers and uncertain openings. Primary denominators must use a comparable method across treatments. If exact opened counts are unavailable for EXCL, report that limitation and use the predeclared eligible-bud outcome consistently; never silently label bud counts as flower counts.
8. Film the same defined OPEN flower cluster. Start with six two-minute windows distributed across daylight for feasibility, then refine effort before the full study. Rotate/randomize timing within morning/midday/afternoon strata and record actual effort, weather and visible flower counts. Match effort across compared plants and avoid selecting only busy periods.
9. Record visitor arrival, group/species when supportable, flower/node visited, duration, visible floral contact, departure and identification confidence. Set a visit boundary rule before annotation: continuous attendance is one visit, while movement among flowers is recorded as flower contacts. Interrupted/out-of-frame identity stays uncertain.
10. Keep a daily EXCL integrity photograph. Record tears, visitors inside, rubbing, condensation, bag opening, branch damage and maintenance. Photograph SHAM as configured. Do not treat missing footage as zero visitors.
11. After all flowers in the target cohort have passed the locally established receptive period, remove sleeves according to the predefined rule and record time. Determine that rule with crop expertise; do not invent a universal number of days. If sleeves remain until harvest, that is a different treatment also affecting pests/microclimate and must be named accordingly. Exclude later flowering cohorts from the original cohort.

##### Fruit set through harvest

12. As an initial schedule, inspect approximately 14 and 28 days after the cohort's peak flowering, then monthly until ripening and more frequently around harvest. These are planning intervals to adjust for local development before study launch. Record exact days after flowering and the same fruit-set criterion for both treatments.
13. Count attached developing fruit, aborted/lost fruit where distinguishable, damage and unobservable positions. Initial fruit set and mature harvested fruit are separate outcomes. Record later natural loss rather than treating early fruit set as yield.
14. Harvest the predefined ripe cohort in repeated passes as necessary. Use labelled separate containers, record harvest time, weigh after a consistent short delay and before water loss differs substantially. Record fruit count, total fresh cherry mass and individual masses for the preselected subsample or all pilot cherries. No selection of only large/intact fruit after seeing results.
15. If measuring Brix, fruit dimensions or seed mass, use a fixed subsampling and preparation procedure. Brix is exploratory soluble-solids information, not a measure of cup quality. Green-bean mass requires standardized processing and moisture measurement; omit that claim if these facilities are unavailable.

#### 7. Records and calculations

Use linked records rather than one unstructured note. Preserve originals and corrections with dates/reasons.

| Record | Required fields |
|---|---|
| Study | study/protocol version, objective, site, species/cultivar, season, lead, primary outcome |
| Allocation | block, microparcel, plant, branch/node, treatment, randomization list, cohort, eligibility counts |
| Bag | material/lot/aperture, dimensions, install/remove UTC and local offset, integrity, support, openings/deviations |
| Observation | clip/session ID, start/end, usable seconds, visible open flowers, weather, visitor/contact counts, classifier/observer, confidence |
| Visitor | visit ID, clip/frame or time range, taxon at supported rank, unknown flag, contact category, duration, reviewer |
| Follow-up | date/days since flowering, fruit counts/status, damage, missing/uncertain counts |
| Harvest | treatment/cohort, date, initial denominator, harvested count/mass, instrument ID, tare, processing delay, subsample rule |
| Quality | equipment checks, failed sessions, treatment breach, missing-data reason, corrections and decisions |

Calculations:

- Confirmed-flower fruit set = developing fruits / confirmed opened flowers in the defined cohort. Keep eligible-bud set as a separately named measure if needed.
- Mature fruit retention = harvested cohort fruits / the same declared initial denominator.
- Fresh cherry yield per initial flower = cumulative harvested fresh cherry mass / confirmed initial flowers; use a separately labelled per-bud measure if that is the denominator available.
- Mean cherry mass = harvested mass / harvested count, interpreted alongside fruit number.
- Visits per flower-minute = visits / sum of visible open flowers × usable minutes across observation intervals. Split intervals if flower visibility changes materially.
- Report absolute OPEN–EXCL differences and uncertainty; relative differences require a meaningful nonzero comparator.

#### 8. Analysis, exclusions and acceptance

For one plant, show raw paired outcomes, representative original images and practical failures. Do not attach population-level significance claims. For replication, predefine a model respecting branch/plant/block clustering; a binomial model may suit fruit counts with their denominators and an appropriately checked count model may suit visits with flower-minute exposure. Confirm assumptions, overdispersion and sample size with the statistical reviewer. Frames and repeated observations of one visit are not independent biological samples.

Predefine integrity rules: a bag torn during receptivity is a compromised exclusion treatment; branch loss and unreadable footage are missing/deviating data, not zero biological responses. Retain all allocation records and report sensitivity analyses under stated handling of breaches rather than deleting inconvenient results. Blind fruit weighing and image review to treatment when practical; retain disagreements and unknown identifications.

Proceed from pilot to replication only when: closures remain intact; enclosure effects have been assessed; flower/cohort identity can be followed; camera quality supports the promised taxonomic level; field records reconcile; harvest weighing is repeatable; observation effort is practical; and the revised design/sample size is recorded before outcome analysis. A failed pilot is useful evidence for redesign.

#### 9. Related project documents

- [Camera, recording and identification acceptance](../docs/VIDEO_MICROPARCEL_EXTENSION.md)
- [Florida procurement plan](../docs/FLORIDA_PURCHASE_PLAN.md)
- [Claude Code engineering handoff](../CLAUDE_CODE_HANDOFF.md)

This protocol can operate with manual field records and local video even without Nectar Nomada OS. The Smart Hive Node supplies complementary colony/environment context; it does not replace branch-level controls, flower denominators, independent identification or harvest measurements.
