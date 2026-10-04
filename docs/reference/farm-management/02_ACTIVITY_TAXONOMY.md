# 02 — Farm Activity Taxonomy (Year-round Operator Activities)

> **v2 changes (2 Oct 2026)** — the activity codes below are stable and seeded in `master_data/activity_types.json` (40 activities). Values corrected by the evidence study (`05`):
> - **AGR.NUR.04** nursery: germinador ≈ 60 d + bag phase 6–7 months (outer 5.5–12); bags 6×8–8×10 in; plant at 3–4 leaf pairs.
> - **AGR.EST.02** spacing: store row × plant (dwarf 2.0 × 1.0 m; tall 2.4 × 1.2 m); density dwarf 5,000–6,000, tall 3,000–4,000 plants/ha (WCR).
> - **AGR.CAN.01** stumping 5–7 yr confirmed (zoca cut 30 cm); renovation % = 100 / cycle; **AGR.CAN.03** shade default 35–45 % (20–60 configurable); **AGR.CAN.04** = *agobio* (keeps 2–3 shoots; confirmed term).
> - **SOI.NUT.01** leaf sampling 3rd–4th pair, 80 leaves/lot; soil 0–20 cm, 3–4 months after last application. **SOI.NUT.02** P/K are P₂O₅/K₂O; 2–3 splits tied to rain onset and post-flowering.
> - **SOI.ECO.03** no 15 % terrace rule; barrier spacing by slope (IICA-DR). Panama riparian buffers are legal minimums (`08` §3).
> - **SOI.IPM.01** must record **DAF of main flowering**, CBB position (A/B vs C/D) and leaf-miner parasitism; thresholds by authority profile (`master_data/agronomy_catalogs.json`). CBD = Africa-only quarantine alert; add ojo de gallo, anthracnose, Cercospora, mal de hilachas, Phoma, mal rosado, Rosellinia.
> - **SOI.IPM.02** add FRAC/IRAC group, RA list status, Panama status (Jan-2026 ban), MIDA reg. no., label PHI/REI, container lot.
> - **SOI.IPM.03** traps: methanol:ethanol 1:1 or 3:1, traps/ha, height, lure change, catch volume; repela target user-set.
> - **HAR.PCK.02** unripe ≥ 2.5 % → warning; picker throughput 50–360 kg/day (compute from logs).
> - **HAR.PRI.02** warn > 10 h (Anacafé); 24 h outer flag; Cenicafé 48 h profile requires mass core temperature logging.
> - **HAR.PRI.03** generic washed 6–72 h, pH info-only; protocols rule (see `06`).
> - **HAR.PRI.04** water 4.1–4.2 L/kg dry parchment conventional; 0.3–1.0 ecological (not 10–20 L/kg cherry).
> - **HAR.DRY.02** ≥ 3–4 turns/day (not hourly). **HAR.DRY.03** 10–12 %, hard flag > 12.5 %, aw fail ≥ 0.70 (+ sample °C). **HAR.DRY.04** cool 8–10 h before bagging; reposo ≥ 21 d.
> - **OPS.AST.01** calibration rules in `07` §2.9; **OPS.AST.02** COPANIT 35-2019 limits; **OPS.ADM.01** Panama wage/age/pay rules (`08` §5).
> - New step types for processing (cold hold, inoculation, immersion, etc.) live in `master_data/processing_axes.json`, not in this taxonomy.


**Source:** Activity inventory supplied by Daniel Giráldez (1 Oct 2026). It is a compiled summary citing 17 web sources (VNT, coffeeandhealth.org, Blue Turaco, Sweet Maria's, Perfect Daily Grind, Equiano, Vikaspedia, ACIAR, NDA South Africa, sustainable-supply-chains.org, plus Facebook/Scribd/ResearchGate items).
Source tag: `ACT-INV-2026`

> **Source quality.** Secondary compilation; several citations are social posts or Scribd uploads. Strongest underlying references: ACIAR harvest & processing unit (2025), NDA South Africa production guidelines, Sweet Maria's timetable. Use this file as the **activity taxonomy** (what operators do and when, by class) — the numbers inside it are defaults to verify, not rules. Conflicts with `VNT-2025` are listed in §6.

Key framing from the source: calendar months vary by hemisphere and altitude (e.g., **Central America harvest ≈ November–March**), but the operational sequence is constant → the app should model **sequence + phenological anchors**, then map to months per farm.

---

## 1. Class structure (4 classes → 11 activity types → 40 activities)

Proposed stable codes for the app (`CLASS.TYPE.ACTIVITY`). Codes are NN additions for implementation.

### Class AGR — Agronomy & Crop Management
Seasonality: cyclical (post-harvest & rainy season) · Objective: structural growth, rejuvenation · Labor: medium–high

**AGR.NUR — Propagation & nursery (pre-planting)**
| Code | Activity | Data to capture | Defaults / notes |
|---|---|---|---|
| AGR.NUR.01 | Substrate preparation | Mix ratio (soil:compost/manure), sanitation method (solarization), date | Sun exposure to kill soil-borne pathogens |
| AGR.NUR.02 | Seed-bed sowing | Seed lot, variety, certification ref, qty, bed ID | Certified seed |
| AGR.NUR.03 | Transplant to bags | Stage (*soldadito*/"soldier" or *mariposa*/"butterfly"), count, bag size | |
| AGR.NUR.04 | Nursery maintenance | Watering, weeding, shade checks | Duration **6–9 months** |
| AGR.NUR.05 | Culling / selection | Count discarded, reason (weak, root deformity e.g. bent taproot) | Before field transport |

**AGR.EST — Plantation establishment & renewal**
| Code | Activity | Data | Defaults |
|---|---|---|---|
| AGR.EST.01 | Site selection & mapping | Altitude, soil pH, slope %, polygon | pH 5.5–6.5 |
| AGR.EST.02 | Holing / pit digging | Hole count, dimensions, spacing | Spacing ~**2.5 m Arabica**, ~**3 m Robusta**; dig **months before rains** for aeration |
| AGR.EST.03 | Transplanting | Plants, variety, block, date | At onset of rainy season |
| AGR.EST.04 | Infilling (replanting) | Replaced count, cause (dead / diseased / stunted) | Feeds survival-rate KPI |

**AGR.CAN — Canopy & architecture (post-harvest phase)**
| Code | Activity | Data | Defaults |
|---|---|---|---|
| AGR.CAN.01 | Pruning & stumping | Trees treated, type (selective / stump), block % | VNT: stump every 5–7 yr; renovate 20–25 %/yr |
| AGR.CAN.02 | Desuckering / thinning | Trees, frequency | Remove water shoots (*chupones*) |
| AGR.CAN.03 | Shade-tree regulation | Shade % before/after, species | **40–50 %** here vs **25–30 %** in VNT — see §6 |
| AGR.CAN.04 | Branch bending / training | Trees, method | Source term "Agrobiolo guiding" is unclear — treat as *agobio* (bending the main stem/verticals to force lateral/multi-stem growth); confirm with user |

### Class SOI — Soil Health & IPM
Seasonality: regular intervals year-round · Objective: nutrition + biological protection · Labor: medium

**SOI.NUT — Nutrition & amendments**
| Code | Activity | Data | Defaults |
|---|---|---|---|
| SOI.NUT.01 | Soil sampling | Zone/block, depth, lab, sample ID, results | VNT: annual basic, full every 2–3 yr |
| SOI.NUT.02 | Macronutrient application | Product, formula, rate kg/ha, method, phenological window | Windows: **pre-flowering, fruit-set** |
| SOI.NUT.03 | Foliar feeding | Product, Zn/B content, rate, stage | For flowering + fruit development |
| SOI.NUT.04 | Liming | Product (calcitic / dolomitic), rate, target pH | Calibrated to analysis |

**SOI.ECO — Weed & ecosystem**
| Code | Activity | Data | Notes |
|---|---|---|---|
| SOI.ECO.01 | Manual weeding / slashing | Area, tool, labor days | Around tree base (*plateo*) |
| SOI.ECO.02 | Mulching | Material (prunings, organic matter, **coffee pulp**), area | Links to pulp-recycling byproduct flow |
| SOI.ECO.03 | Terracing & cover cropping | Type (contour ridge, grass strip, terrace, cover species), length/area | VNT: terrace on slopes > 15 % |

**SOI.IPM — Disease & pest control**
| Code | Activity | Data | Notes |
|---|---|---|---|
| SOI.IPM.01 | Phytosanitary scouting | Organism (CBB/broca, CLR/roya, CBD…), sampling method, incidence %, severity, GPS | Action thresholds = user/authority config |
| SOI.IPM.02 | Fungicide / insecticide application | Product, active ingredient, organic/synthetic, rate, PHI/REI, operator, PPE | Before & during fruit development; certification-relevant |
| SOI.IPM.03 | Trapping & cultural control | Trap count, lure (alcohol), catches; fallen/mummified fruit collected (*repela/pepena*) | Breaks borer life cycle |

### Class HAR — Harvest & Post-Harvest
Seasonality: high season (geography-dependent) · Objective: quality preservation, value extraction · Labor: **critical / very high**

**HAR.PCK — Harvesting**
| Code | Activity | Data | Defaults |
|---|---|---|---|
| HAR.PCK.01 | Pre-harvest prep | Paths cleared, containers cleaned | |
| HAR.PCK.02 | Selective picking | Picker, block, pass #, kg cherry, ripeness sample | Multiple rounds over a **2–4 month** window |
| HAR.PCK.03 | Strip picking (final pass) | kg, ripeness mix | Last pass; segregate from specialty lots |

**HAR.PRI — Wet/dry primary processing**
| Code | Activity | Data | Defaults |
|---|---|---|---|
| HAR.PRI.01 | Flotation sorting | Floaters kg / %, sinkers kg | VNT: < 5 % floaters |
| HAR.PRI.02 | De-pulping | Time from harvest, pulper ID, kg in/out | **≤ 24 h after harvest** (outer limit; specialty practice is usually same-day — NN note) |
| HAR.PRI.03 | Fermentation | Protocol ID, tank, time, pH, temp, Brix | Source: **12–36 h** — generic washed default only; app protocols override |
| HAR.PRI.04 | Washing & soaking | Water volume, soak time | VNT: 10–20 L/kg cherry (washed) |
| HAR.PRI.05 | Pulp recycling | kg pulp, destination (compost pit), date | Feeds mass balance + SOI.ECO.02 |

**HAR.DRY — Drying & conditioning**
| Code | Activity | Data | Defaults |
|---|---|---|---|
| HAR.DRY.01 | Spreading on patio / raised beds | Surface type, layer depth, area | Raised "African" beds or concrete patio |
| HAR.DRY.02 | Turning | Turn log | Source: **~hourly** — treat as guideline, configurable |
| HAR.DRY.03 | Moisture testing | Meter ID, reading, time | Endpoint **10–12 %** stabilized |
| HAR.DRY.04 | Bagging & conditioning (*reposo*) | Bag type (jute/sisal/hermetic), warehouse, rest days | Ventilated storage |

### Class OPS — Infrastructure & Business
Seasonality: continuous / daily · Objective: compliance, upkeep, finance · Labor: low–medium

**OPS.AST — Assets & infrastructure**
| Code | Activity | Data | Notes |
|---|---|---|---|
| OPS.AST.01 | Equipment servicing & calibration | Asset, task, calibration result, next due | Pulpers, demucilagers, dryers, **moisture meters** — before harvest |
| OPS.AST.02 | Water-system management | Drainage, sediment ponds, wastewater filtration; checks + readings | Environmental compliance |

**OPS.ADM — Administration & finance**
| Code | Activity | Data | Notes |
|---|---|---|---|
| OPS.ADM.01 | Labor management | Recruitment, onboarding, housing, payroll, attendance | Seasonal pickers |
| OPS.ADM.02 | Traceability & records | Harvest volumes, lot codes, chemical records, co-op transactions | Single source of truth |
| OPS.ADM.03 | Financial planning | Cash flow, credit lines, input costs vs sales | Seasonal budget |

---

## 2. Class summary (as given)

| Class | Frequency | Objective | Labor intensity |
|---|---|---|---|
| Agronomy & crop mgmt | Cyclical (post-harvest, rainy season) | Structure + rejuvenation | Medium–high |
| Soil health & IPM | Regular intervals | Nutrition + protection | Medium |
| Harvest & post-harvest | High season | Quality + value | Critical / very high |
| Infrastructure & business | Continuous | Compliance, upkeep, finance | Low–medium |

---

## 3. Phenology-anchored sequence (NN synthesis of VNT-2025 + ACT-INV-2026)

Model the year as phases relative to anchors, then resolve to dates per farm/block:

| Phase | Anchor | Typical activities |
|---|---|---|
| P0 Nursery | Planting date − 6–9 mo | AGR.NUR.* |
| P1 Post-harvest recovery | Harvest end → +~8 wks | AGR.CAN.*, SOI.NUT.01, post-harvest fertilization, SOI.IPM.03 (*repela*) |
| P2 Pre-flowering | Before expected main flowering | SOI.NUT.02 (pre-flower), SOI.NUT.03 (B/Zn), AGR.EST.02 holing, set up monitoring |
| P3 Flowering & rains | Main flowering date; rain onset | AGR.EST.03 transplanting, AGR.EST.04 infilling, SOI.ECO.* |
| P4 Fruit set & filling | Flowering + ~1–4 mo | SOI.NUT.02 (fruit-set), SOI.IPM.01/02 disease prevention, CBB trapping |
| P5 Pre-harvest | Harvest start − ~4–6 wks | OPS.AST.01, HAR.PCK.01, labor recruitment (OPS.ADM.01) |
| P6 Harvest & processing | Harvest window (2–4 mo) | HAR.* |
| Continuous | — | OPS.ADM.*, OPS.AST.02, scouting |

Offsets marked "~" are NN placeholders: store as editable per-farm templates. Arabica flowering-to-ripe is commonly cited at ~7–9 months (NN note — varies strongly with altitude; VNT gives +3–4 days per +100 m).

**Panama context (NN note, to verify per farm):** source states Central America harvests roughly Nov–Mar; highland Chiriquí/Boquete lots, especially Geisha at higher elevation, often run later in that window.

---

## 4. Byproduct & resource links surfaced by this inventory
- Pulp → compost → mulch / fertilizer (closes loop with SOI.ECO.02 and SOI.NUT.02; relevant to mass balance)
- Wastewater → sediment ponds / filtration (OPS.AST.02) — record volumes and treatment
- Moisture-meter calibration (OPS.AST.01) gates the validity of HAR.DRY.03 readings

## 5. Data-integrity rules implied
- A HAR.DRY.03 reading should reference a meter whose last calibration is within its validity window (warn otherwise).
- HAR.PRI.02 should compute and display harvest→pulp elapsed time; flag > configured limit (default 24 h).
- HAR.PCK.03 strip-pick cherry must not merge into selective-pick specialty lots without an explicit override + reason.
- SOI.IPM.02 entries require product, active ingredient and rate (certification and food-safety evidence).
- AGR.CAN.03 shade % stored per block with measurement method (densiometer, photo, estimate).

## 6. Conflicts with VNT-2025 and cautions
| Topic | VNT-2025 | ACT-INV-2026 | Resolution |
|---|---|---|---|
| Target shade | 25–30 % (regulated shade) | 40–50 % | Both are context-dependent; store per block with a system-type default; never hard-code |
| Spacing / density | 1,600–2,500 trees/ha unshaded | ~2.5 m Arabica (≈1,600/ha at 2.5×2.5 m square — NN calc) | Store row × plant spacing; derive density |
| Fermentation | time/pH/temp, no numbers | 12–36 h | Generic washed fallback only; app's per-protocol thresholds win |
| Drying endpoint | 10–12 % | 10–12 % | Consistent; add aw as optional field |
| Turning | — | hourly | Configurable guideline |
| Pulping | — | within 24 h | Configurable limit, default 24 h |
| Calendar | Fixed months | Varies; Central America Nov–Mar harvest | Phenology-anchored model (§3) |

Terminology flags: "Agrobiolo guiding" (likely *agobio*), "depalpers" (likely demucilagers / pulpers) — confirm before using as UI labels.
