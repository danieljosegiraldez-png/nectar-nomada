# 03 — Module Map, Data Model & Requirements (v2)

How the reference package lands in the app. Candidate requirements: Claude Code first audits what exists and proposes only the delta. v2 adds capabilities A33–A48 (processing protocols, mill assets, instruments, authority profiles, Panama legal layer, EUDR, certifications as data) and revises rules with sourced values.

**Inputs:** `04_reference_parameters.json` (208 parameters, provenance + confidence) · `05_EVIDENCE_STUDY.md` (corrections) · `06_PROCESSING_TAXONOMY.md` + `master_data/processing_*.json` · `07_MILL_INFRASTRUCTURE_AND_MASTER_DATA.md` + `master_data/mill_assets.json`, `variables.json` · `08_PANAMA_ANNEX.md` · `master_data/agronomy_catalogs.json` · `master_data/activity_types.json`.

## Guiding principles (non-negotiable)
1. **Defaults, not rules.** Reference values seed a registry with provenance; override order **protocol → block → farm → tenant → authority profile → reference default**. No literal thresholds in business logic.
2. **Authority profiles.** Where institutes disagree (pH, IPM thresholds, holding time, layer depth, warehouse RH), the site's `authority_profile` (CENICAFE / ANACAFE / CODEX_ISO_SCA / custom…) selects defaults; all stay editable.
3. **Per-protocol processing.** Fermentation/drying limits live on the protocol step. Generic washed values fill only the generic fallback (test enforced).
4. **Protocols are step sequences of axis vectors** (A–I). Names are labels.
5. **Block is the agronomic unit; Asset is the processing unit.** Readings link to lot + step + asset allocation + instrument.
6. **Phenology-anchored calendar.** Flowering events per block drive calendar, harvest estimate (GDD) and IPM thresholds (DAF).
7. **Field capture pattern.** In field: checklist + protocol-required data + observations/actions (photo, audio, GPS, AI). Completion and reports off-field.
8. **Evidence discipline.** Every value traceable (who/when/where/instrument/method/calibration state). Every reference shows source + confidence; `low`/`NN` visibly flagged.
9. **Blocking only for safety and law.** References warn. Block only: vessel over-pressure, prohibited pesticides, legal buffers, child-labour rules, missing mandatory agrochemical fields, PHI violations, strip-pick merge without override.
10. **Versioned regulatory data.** Certification standards, price tables, wage tables, pesticide lists, competition rules carry effective dates.
11. **Bilingual es/en** with Spanish field vocabulary first-class (plateo, chupones, agobio, zoca, repela, reposo, broca, roya, ojo de gallo, baba, cps, tolva, sifón, correteo, tanque tina, guardiola, marquesina, pasera, bodega).

---

## A. Capability matrix (audit fills Status/Evidence)

| # | Capability | Ref | Status | Evidence |
|---|---|---|---|---|
| A1 | Farm → Block hierarchy with polygon (PostGIS, WGS84, ≥ 6 decimals), area, altitude, slope % | 01 §1, 08 §8 | | |
| A2 | Block agronomic profile: variety mix, plant count, row × plant spacing → derived density, planting date, production system, shade % + method, pruning cycle | 05 §2 | | |
| A3 | Site climate: rainfall, temp, dry-season, weather station / manual log, extreme events, ENSO season tag, dated advisories | 05, 08 §2 | | |
| A4 | Soil & leaf analyses with sampling protocol, lab, method/units, interpretation **profile** stored | 04 soil/leaf | | |
| A5 | Nutrition plan (element vs oxide basis explicit), 2–3 rain-anchored splits, removal-based estimates, application log | 04 nutrition | | |
| A6 | Nursery: germinador → bag phase, stages, culls, selection checklist | 02 AGR.NUR | | |
| A7 | Establishment & renewal: holing, transplanting, infilling, survival | 02 AGR.EST | | |
| A8 | Canopy: pruning system enum, stumping cycle tracker (renovation = 100/cycle), stems/site, desuckering, shade regulation, agobio | 04 pruning | | |
| A9 | Conservation: barrier spacing by slope, contour, cover crops, mulch (incl. pulp), windbreaks, **legal riparian buffers (GIS)** | 04, 08 §3 | | |
| A10 | IPM: organism catalog (13), authority-profile thresholds, DAF-gated rules, scouting with position/parasitism, effectiveness follow-up | agronomy_catalogs | | |
| A11 | Agrochemical register: AI, FRAC/IRAC, RA list status, **Panama status (Jan-2026 ban)**, MIDA reg., label PHI/REI, PPE, container lot | 08 §4 | | |
| A12 | Phenology events per block (multiple flowerings, intensity, preceding rain), GDD accumulation | 04 phenology | | |
| A13 | Activity calendar engine: templates (anchor + offset) per region; due/overdue reminders | 02, 08 §2 | | |
| A14 | Harvest passes, picker deliveries, ripeness (mix %, Brix + matrix, floaters), unripe ≥ 2.5 % warning, strip-pick segregation | 04 harvest | | |
| A15 | Harvest-window estimator (GDD + flowering + history) replacing days/100 m | 05 §1 | | |
| A16 | **Processing protocol builder**: step sequence, axis vectors, setpoints, endpoints, measurement plan, inocula, additions, versioning | 06 §5 | | |
| A17 | **Protocol run execution**: actual steps, allocations to assets, time series, deviations | 06, 07 §4 | | |
| A18 | Drying records: structure, layer, load, turns, moisture (method), aw + °C, bean/air °C, interruptions | 07 §2.5 | | |
| A19 | Conditioning/storage: reposo, warehouse loggers, packaging, monthly re-checks, transport | 07 §2.6 | | |
| A20 | Mass balance & byproducts per lot, moisture-normalised, plausibility bands (washed only) | 04 massbalance | | |
| A21 | Green grading (SCA 350 g, Cat 1/2 equivalents table versioned), screen, density | 04 grading | | |
| A22 | Cupping: scoring-system enum (2004 / CVA 2024 / CoE / custom), CVA 4-record model, session protocol, cupper calibration | 04 cupping | | |
| A23 | Lot identity: microlots by block/variety/altitude/protocol; lot ↔ plot links | 06, 08 §8 | | |
| A24 | **Facility & asset registry** (≈ 90 types, attribute schemas per type) | 07 §2, mill_assets | | |
| A25 | **Instruments, sensors (positions), calibration events, calibration state at write time** | 07 §2.9, §4 | | |
| A26 | Maintenance & sanitation events per asset | 07 §4 | | |
| A27 | **Planning-time capability checks** (gas ports, thermal control, light exclusion, indirect firing, pressure rating) | 07 §4 | | |
| A28 | Water & wastewater: L/kg cps per stage, effluent volume, pH/COD/BOD₅/TSS, **COPANIT limit set**, water authorizations | 07 §2.7, 08 §3 | | |
| A29 | Labour: workers, crews, person-days per activity/block, family vs hired, piece-rate guard vs **minimum wage**, pay cycle, housing, **age rules** | 08 §5 | | |
| A30 | Costs by operation and block; with/without family labour; labour share | 04 cost | | |
| A31 | Sales/contracts: STG fields, C price & differential on contract date, price realization; Fairtrade price lookup by date | 04 market/cert | | |
| A32 | Certification readiness as **versioned data** (RA v1.4, Fairtrade, organic, Bird Friendly, C.A.F.E., 4C), deforestation cut-offs per scheme | 04 cert | | |
| A33 | **EUDR**: plot geometry rules, 2020 land-use evidence, DDS pack export (GeoJSON, HS 0901), 5-yr retention | 08 §8 | | |
| A34 | Traceability events (EPCIS-style: Object, Transformation, Aggregation, Transaction) | 04 trace | | |
| A35 | **Disclosure block** per protocol/lot with competition ruleset checks (BoP / CoE / WCC) | 06 §5 | | |
| A36 | Lot sheet / buyer doc: variety, elevation, protocol disclosure, cupping, traceability, story | 01 §12.2 | | |
| A37 | KPI dashboard (production, quality, efficiency, mill, financial, sustainability) — §C | §C | | |
| A38 | Reference parameter registry with provenance, confidence, override hierarchy, authority profiles, deprecated keys | 04 | | |
| A39 | Variety catalog with dated rust-resistance status, altitude band, propagation type | agronomy_catalogs | | |
| A40 | Units & conversions (kg canonical; lata/quintal/caja/arroba/cajuela per farm; manzana ↔ ha) | agronomy_catalogs | | |
| A41 | Carbon ledger: emissions vs removals separate, method tag, farm-gate → green boundary | 04 carbon | | |
| A42 | Export checklist (VUCE, MIDA phyto, ICO certificate, EUR.1, EUDR pack) | 08 §7 | | |
| A43 | Competition entries (event, score, rank, auction price/kg — excluded from benchmarks) | 08 §7 | | |
| A44 | Production-system reference view (ranges labelled, contradictions shown) | 04 production_systems | | |
| A45 | Value-addition hooks (agritourism, processing services, roasting) | 01 §12.3 | | |
| A46 | Inoculum inventory (product, lot, expiry, storage temperature log) | 04 inoculum | | |
| A47 | Advisory feed (dated, sourced: IMHPA ENSO, regulatory changes) | 08 §2 | | |
| A48 | Safety: CO₂/confined-space checklist for sealed vessels and cold rooms, chemical PPE | 07 §2.10 | | |

---

## B. Data-model additions (candidates — adapt to existing schema)

```
ReferenceParameter   key, min, max, value(json), unit, sourceTags[], confidence, note, profile?, alt(json), legal(bool), deprecated(bool)
ParameterOverride    key, scopeType(protocol|block|farm|tenant), scopeId, value…, reason, setBy, setAt
AuthorityProfile     code, name, description ; Site.authorityProfile
Block (extend)       altitudeM, slopePct, rowSpacingM, plantSpacingM, densityDerived, productionSystem, shadePct, shadeMethod,
                     plantingDate, pruningSystem, lastStumpingDate, cycleYears, regionCode
BlockVariety         blockId, varietyId, plantCount, plantedAt
Variety              name, habit, rustStatus, rustStatusDate, verifyLocally, altitudeBand, densityDefault, firstCropYear, propagation
PhenologyEvent       blockId, type, date, intensityPct, precedingRainMm, media[]
GddSeries            blockId, date, tmin, tmax, method, cumulative
ActivityType         code, class, type, name_es, name_en, requiredFields(json schema), checklist(json)
ActivityTemplate     activityTypeCode, regionCode?, anchor, offsetDaysMin/Max, recurrence
ActivityRecord       activityTypeCode, blockId, date, workers[], personDays, inputs[], observations, actionsTaken, media[], gps, status
SoilAnalysis / LeafAnalysis   blockId, sampleId, lab, method, units, depthCm, results(json), interpretationProfile
InputApplication     blockId, product, activeIngredient, fracIracGroup, raListStatus, paStatus, midaRegNo, rate, unit, method,
                     targetOrganism, phiDays, reiHours, applicator, ppe, containerLot, bufferCheck
Organism             code, name_es, name_en, sci, type, americas(bool), samplingProtocols(json), thresholdsByProfile(json)
ScoutingRecord       blockId, organismCode, profile, protocol, plantsN, unitsPerPlant, incidencePct, severity, daf, cbbPositionABPct, parasitismPct, gps, media
InterventionFollowUp scoutingId, interventionId, date, incidenceAfter, effective
HarvestPass / PickerDelivery   (+ ripenessMix json, brix, brixMatrix, floatersPct, harvestEndTs)
ProcessingProtocol / ProtocolStep / Inoculum / Addition / Disclosure / RulesetCheck   (06 §5)
ProtocolRun / RunStep / Deviation
Facility / Asset / Component / Sensor / Instrument / CalibrationEvent / MaintenanceEvent / SanitationEvent / Allocation   (07 §4)
MeasurementRecord    variableCode, value, unit, method, instrumentId, sensorId, allocationId, lotId, runId, stepSeq, sample(json),
                     calibrationState, qcFlags[]
Variable             code, name, unit, instrumentType, step, frequency, reference(json), source, confidence
GreenGrading / CuppingSession / CuppingRecord (2004 | CVA descriptive | CVA affective | CoE)
WaterAuthorization / EffluentSample / LimitSet(PA-COPANIT-35-2019)
Worker (dob, permits) / Crew / WorkDay (activity, block, hours, latas, pay) / WageTable(effective dates) / HousingUnit
PesticideStatusPA(ai, status, resolution, until)
CertificationScheme / StandardVersion / Requirement / EvidenceLink ; PriceTable(scheme, product, value, from, to)
Plot.eudr (geometry, areaHa, landUse20201231Evidence) ; DdsExport
TraceEvent (EPCIS type, what, when, where, why, how)
CarbonEntry (scope, kgCO2e, method, emissionsOrRemoval, baselineRef)
Advisory (source, date, region, text, validUntil)
Unit (code, kgFactor|haFactor, state, region, source, editable)
```

---

## C. KPIs (computed, never stored as truth)

| KPI | Formula | Grain |
|---|---|---|
| Yield / ha | Σ kg green ÷ productive ha | block, farm, season |
| Yield / plant | Σ kg cherry ÷ productive plants | block |
| Cherry : parchment : green | from weighings, moisture-normalised | lot, protocol |
| Avg cup score | volume-weighted, **per scoring system** | season, block, variety, protocol |
| Tier distribution | kg per tier (STG bands) ÷ total | season |
| Labour productivity | kg cherry ÷ person-day; kg/h | crew, method, task |
| Person-days / ha | Σ person-days ÷ ha (family vs hired) | farm, block |
| N efficiency | kg green ÷ kg N (element) | block |
| Water intensity | L ÷ kg cps per stage and total | lot, protocol, asset |
| COD load | effluent L × COD | day, facility |
| Drying KPIs | %-points/day, days aw 0.95→0.80, fuel kg/kg cps, kWh/kg cps | lot, asset |
| Pulper / demucilager quality | damage %, unpulped %, pulp-in-coffee % | shift, asset |
| Dry-mill rejects | % by stage | lot |
| Cost / kg green | allocated costs ÷ kg green (with/without family labour) | block, farm |
| Labour share | labour cost ÷ total cost | farm |
| Price realization | realized FOB ÷ reference (C + diff or STG band) | lot, buyer |
| Gross margin / ha | (revenue − variable cost) ÷ ha | block, farm |
| SOM trend | slope of OM % (same method) | block |
| Renovation rate | ha renovated ÷ ha vs 100/cycle | farm |
| Stumping due | lastStumping + cycle < today | block |
| IPM effectiveness | interventions effective ÷ total | organism, product, FRAC group |
| Calibration compliance | readings with valid calibration ÷ all | instrument, facility |
| Protocol adherence | steps within setpoints ÷ total; deviations | run, protocol |
| Carbon intensity | kg CO₂e ÷ kg green (method-tagged), removals separate | farm, season |

Each KPI shows its reference (source + confidence); pass/fail only against a user-set target.

---

## D. Validation & alert rules (v2)

| Rule | Default | Severity |
|---|---|---|
| Moisture/aw reading with expired calibration | — | warn + flag |
| Capacitance reading of warm sample (< 30 min equilibration) | — | flag |
| aw without sample temperature | — | reject |
| Harvest→pulp elapsed | > 10 h (Anacafé) / 24 h outer | warn |
| Cherry hold > 10 h without mass core temperature | — | warn |
| Unripe in delivery | ≥ 2.5 % | warn |
| Floaters | > 5 % (low confidence) | info |
| Strip-pick cherry into selective lot | — | **block** (override + reason) |
| Agrochemical missing AI/rate/PHI/applicator | — | **block** |
| Prohibited AI (Panama list, RA prohibited) | — | **block** |
| Restricted / phase-out AI; RA risk-mitigation | — | warn + checklist |
| Harvest inside label PHI | — | **block** |
| Application / planting / burn inside legal riparian buffer | Ley 1/1994 | **block (legal)** |
| Scouting ≥ profile threshold within DAF window | profile | alert (chosen channel + central log) |
| CBD suspicion | — | biosecurity alert → MIDA/APA |
| Fermentation generic range applied to non-generic protocol | — | **forbidden (test)** |
| Time past protocol endpoint | > 2 h | warn |
| Sealed vessel pressure ≥ rating | asset rating | **block / alarm** |
| Mass temperature in fermentation | > 34 °C with long times | warn |
| Mechanical drying bean temperature | > 40 °C (> 38 seed) | alarm |
| Drying air | > 50 °C static / > 60 rotary | warn |
| Direct-fired dryer allocated | — | warn (smoke risk) |
| Drying stopped while moisture > 30–40 % | — | warn |
| Moisture at bagging | outside 10–12 %; > 12.5 % hard flag | warn / flag |
| aw | ≥ 0.65 warn; ≥ 0.70 fail | warn / fail |
| Reposo | < 21 d | warn |
| Warehouse RH | > 60 % (T-dependent); > 80 % critical | warn / alert |
| Effluent vs COPANIT limit set | pH 5.5–8.5, COD 100 | **legal flag** |
| Water authorization expiring | 30 d before | reminder |
| Worker under 14 / adolescent hours / hazardous task | Panama rules | **block** |
| Piece-rate below hourly minimum wage | DE 13/2025 | warn |
| Pay interval > 15 days | Código de Trabajo | warn |
| EU-bound lot plot > 4 ha without polygon / < 6 decimals | EUDR | **block export pack** |
| Plot planted after 2020-12-31 without land-use evidence | EUDR | warn |
| Exogenous addition on BoP-entered lot | — | eligibility = no |
| Inoculant/bioprotection on BoP-entered lot | — | eligibility = unknown until ruling |
| Outcome label (lactic/malic/acetic) without measured data | — | publish as "target profile" |
| Soil test older than interval | 12 mo (low) | info |
| Activity overdue vs template | template | reminder |

---

## E. Out of scope / do not build
- Agronomic **recommendation engines** (doses, spray decisions, product suggestions). Record; never prescribe.
- Benchmarks from case studies or auction prices.
- Certification or competition **compliance claims** — readiness checklists and eligibility flags only.
- Fixed-month calendars.
- Converting scores between scoring systems.
