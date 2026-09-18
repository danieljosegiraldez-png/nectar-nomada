# Nectar Nomada research module: implementation contract

Version 1.0. Proposed product/data requirements, not a deployed application. Existing Smart Hive telemetry remains independent. Implement against the real platform repository and its tenancy/authentication model; no assumptions about its current framework or database are made.

## 1. User-facing workflow

Research library → select a question/crop → compare source methods and limits → create a local protocol → choose equipment/consumables → qualify method → allocate units → perform scheduled field tasks → annotate/review → follow fruit to harvest → analyse → publish a permission-controlled report.

Use plain labels such as “Open branch,” “Bagged before flowering,” “Unknown insect,” “Camera unavailable” and “Fruit lost—cause uncertain.” Scientific codes remain available in exports. Show which equipment is required, shared, optional or still unspecified. Never imply that an imported literature method has already been validated on this farm.

The literature detail view must show methods, materials actually extracted, results, statistical analysis when known, practical lessons, access depth, source link and unresolved details. Distinguish author conclusions from our interpretation. “Not extracted” is a valid visible state. A study can have multiple endpoints and contradictory directions; do not reduce it to positive/negative sentiment.

## 2. Reference content delivered

- `study_registry.json`: 40 source records; citation/date/DOI/link, access scope, design, findings, reported analysis and project interpretation.
- `method_catalogue.json`: eight proposed local workflows linked to source IDs and inventory IDs.
- `equipment_consumables_catalogue.json`: 34 planning entries with category, stage, pilot quantity, unit, scaling rule and procurement status.
- `research_reference_bundle.json`: combined import document, validated structurally against the accompanying schema's supported constraints by the included checker.
- `research-reference.schema.json`: JSON Schema 2020-12 for the reference bundle. Production must also run an independent standards-compliant validator.

These are seed reference records. Import idempotently by stable ID/version, dry-run changes, present provenance and retain prior versions. Do not create real studies, observations, orders, notifications or live device assignments merely by importing the catalogue. Never evaluate a scaling-rule string as executable code; calculate quantities through separately tested, allowlisted functions after required inputs are supplied.

## 3. Data entities and invariants

Every operational entity has UUID, tenant_id, created_at/by, revision, provenance and audit trail. References cannot cross tenants unless explicitly shared read-only. IDs in the literature catalogue are reference IDs, not global authorization tokens.

| Entity | Essential fields beyond common metadata | Validation / behavior |
|---|---|---|
| Literature study | reference ID, bibliographic metadata, access scope, extraction reviewer/date, source location, overlap group, licence/access status | Never invent absent values; reviewed extraction updates version |
| Evidence claim | study ID, endpoint, treatment/comparator, value/unit, absolute/relative/ratio scale, denominator, interval/uncertainty, source locator | Distinguish reported from calculated; require formula for recalculated effects |
| Local protocol | crop/genotype applicability, question, source IDs, departures, versions, outcomes, analysis plan, ethics/site permissions if applicable | Draft → reviewed → pilot → validated_local; no automatic upgrade from paper citation |
| Method execution | protocol/version, operator, date, target unit, actual steps/deviations, assets/lots used | Freeze version at execution, retain later corrections |
| Site hierarchy | farm/block/microparcel/plant, mapped positions, species/cultivar/genotype and confidence | Delivery address is separate from research coordinates |
| Floral unit | branch or cushion, flower/node/cohort, opening dates/range, bud/open counts and count method | Distinguish eligible buds from confirmed flowers; preserve uncertain denominator |
| Allocation | factor levels, assignment unit, measured unit, randomization list/seed, block, intended treatment | Allocation persists even if treatment is breached |
| Access interval | device/material lot, aperture_x/y/unit, install/open/close/remove times, closure state, integrity/evidence | “Bagged” without timing is insufficient; maintain uncertain prior access |
| Pollen transfer | recipient/donor IDs/genotypes, compatibility evidence, collection/transfer times, operator, dose/proxy, tool-cleaning, manipulation | Same-tree and cross-tree pollen distinguishable; incompatible/unknown donor visible |
| Observation session | planned/actual interval, usable time, flower visibility by interval, weather, observer/camera, sampling mode | Missing is not zero; flower-minute exposure calculated from actual intervals |
| Visit/annotation | parent clip/session, time/frame bounds, taxon/rank, confidence, flower part/contact/behavior, model/reviewer | Prediction and adjudicated annotation retained separately; unknown permitted |
| Specimen/lab sample | parent visit/floral unit, purpose, destructive flag, custody events, preservation/time, lab SOP, microscopy/barcode evidence | Destructive sample cannot silently remain a harvest-followed flower |
| Fruit observation | floral cohort, fruit ID where feasible, date, state, count, loss cause/confidence, detection uncertainty | No invented irreversible state from one obscured image; harvested items cannot be harvested twice |
| Harvest batch | independent replicate, cohort/treatment, ripe criterion, count/tare/gross/net mass, mass basis, instrument, moisture/processing | Validate compatible units; no pooling across replicates without explicit aggregation record |
| Quality result | processing batch, coded sample, test method, assessor, score units, blinding | Brix does not populate cup-quality fields |
| Inventory asset | exact model/serial, owner/site, calibration/check dates, condition, location | Unknown model allowed during planning, blocked when exact traceability required for execution |
| Consumable lot | material/SKU/lot, receipt, expiry if relevant, unit, stock/reserved/used/waste, cost/currency | Append stock transactions; explicit override/reconciliation rather than silent negative stock |
| Service/biological input | lab/taxonomist booking, donor material identity, quote/conditions | A donor flower is biological material, not interchangeable stock without identity |
| Intervention | colony species/strength/date or substrate/source/dose/location, baseline, control, spillover notes | Keep intended versus delivered treatment and actual exposure separate |
| Analysis/report | frozen dataset/hash, code/version, inclusion rules, model, effect/CI, diagnostics, reviewer, conclusion scope | Never overwrite raw data; each rerun produces a new result version |

Future fuller extraction adds full author lists, journal/pages, funding/conflicts, sample-size hierarchy, model equations, missing-data procedures and exact equipment only after source verification. These optional fields must not be fabricated during import.

## 4. Calculations and alerts

Allowlisted calculations: fruit set with declared denominator; retention; visits per flower-minute; harvest mass per initial flower/bud/tree; dry-basis quantities only with valid conversion inputs; absolute and relative contrasts; labor time and cost. Reject impossible units and zero denominators as “undefined,” never infinity or zero benefit.

Flag unresolved compatibility, expired instrument check, missed bag action, bag breach, low camera quality, unsynced clocks, missing harvest identity and unverified backup. Alerts are operational, not biological diagnoses. User notification channels/preferences follow the platform's existing permissions; importing this packet sends no messages.

Store scheduled observation effort even when no recording exists. Report completion rate, usable-footage rate, unknown-identification rate and classifier precision/recall separately. Training/validation partitions must group related frames by visit/session and preferably independent site/date; record split definitions and external validation status. Do not claim species accuracy from family-level labels or mAP50.

## 5. Permissions, offline collection and provenance

Owner/research lead: approve local protocol, access and report release. Field operator: assigned records/tasks and inventory use. Taxonomist/lab: assigned sample/media access and reviewed determinations. Analyst: authorized exports/frozen snapshots. Viewer: approved report/document versions only. Public methods may be separate from private coordinates, raw videos, farmer identities and colony locations.

Offline creates client UUIDs and original timestamps; retries deduplicate by client ID, never by date alone. Concurrent edits create a reviewable conflict; do not silently overwrite field observations. Preserve deletion/tombstone and correction audit. Upload media using authenticated resumable transfers; verify hash/size and durable copy before offering local removal. Use signed short-lived media URLs and server-side tenant filtering.

A claimed observation stores its source: manual, instrument, model prediction, literature-reported or derived. Derived records link inputs, model/formula and version. Raw images and instrument files remain immutable; redacted/public copies are separate derivatives.

## 6. Required implementation acceptance tests

1. Import all 40/8/34 reference records twice without duplication; fail an unknown foreign key and preserve old versions on update.
2. Keep incomplete planning quantities null and visibly unresolved; no automatic zero-quantity purchase approval.
3. Select cacao P04 and require donor/recipient/compatibility and local-SOP fields; a coffee-only qualified bag must not automatically pass cacao qualification.
4. A breached EXCL unit retains its original assignment, records the breach and is handled according to the chosen analysis policy.
5. A missing clip adds no false zero-visitor record; a manually reviewed valid empty clip can represent zero visits with known effort.
6. For synthetic input only, 4 flowers visible for 2 usable minutes creates 8 flower-minutes; 2 visits gives 0.25 visits/flower-minute. Reject zero exposure for a rate.
7. Synthetic change 2%→7% displays +5 percentage points and +250% relative; twice baseline displays +100%.
8. Prevent a flower destructively sampled for pollen from being counted as an intact harvested cohort member without an explicit validated exception.
9. Separate wet/dry mass and reject an unsupported conversion; keep processing replicates independent.
10. Preserve family-level unknown species, original AI label and expert correction; don't auto-generate effective-pollinator claims.
11. Reject cross-tenant data/media access and audit privileged changes; offline retries and conflicts remain visible.
12. Reproduce a report from its frozen snapshot and code version; include null findings, exclusions and remaining uncertainty.

These are acceptance requirements for Claude Code, not tests of an existing server. This packet's checker validates only its reference content and links.
