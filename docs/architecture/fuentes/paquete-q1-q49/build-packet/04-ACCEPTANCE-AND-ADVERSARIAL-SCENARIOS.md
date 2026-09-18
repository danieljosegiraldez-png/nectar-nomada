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
