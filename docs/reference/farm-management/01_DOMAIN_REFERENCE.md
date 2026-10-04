# 01 — Coffee Farm Production & Management: Domain Reference

> **v2 status (2 Oct 2026): COVERAGE MAP ONLY.** This file digests the original VNT vendor article. Many of its numbers were corrected or deprecated after checking authoritative sources — see `05_EVIDENCE_STUDY.md` §2 and `04_reference_parameters.json` v2 (`deprecated_keys`). Where this file and 04/05/08 disagree, **04/05/08 win**.


**Source:** Vina Nha Trang (VNT), *"Coffee Production and Management: A Comprehensive Guide for Farm Optimization"*, published 31 Mar 2025, updated 1 Apr 2025.
URL: https://vinanhatrang.com/coffee-production-and-management-a-comprehensive-guide-for-farm-optimization/
Source tag used throughout the package: `VNT-2025`

> **Read this first — source quality.** VNT is a Vietnamese processing-equipment manufacturer; this is a vendor blog post, not peer-reviewed or standards-body material. It is a good *coverage map* (which domains a holistic farm app should touch) and a reasonable set of *starting defaults*. It is **not** an authority. Every number below is a configurable default with `confidence` metadata — never a hard-coded rule. Conflicts and weaknesses are listed in §17. Values marked **[NN note]** are additions by Néctar Nómada review, not from the source, and must be verified before use.

Content is paraphrased and restructured for engineering use. Numeric facts are carried exactly.

---

## 0. Context figures

| Item | Value | Notes |
|---|---|---|
| Global consumption growth | ~2 % / year | Market context only |
| Specialty price vs commodity | 3–5× | Wide, unsourced |
| Pressures named | Climate change, market volatility, labor shortages, shifting consumer preferences | Use as risk-register categories |

---

## 1. Site selection

### 1.1 Altitude
| Species | Range (m a.s.l.) |
|---|---|
| Arabica | 1,000–2,000 |
| Robusta | 200–800 |

- Higher altitude → denser bean, more complex acidity, **longer maturation, lower yield**.
- **Ripening delay ≈ 3–4 days per +100 m elevation.** → usable as a harvest-window predictor (see §9 calculations).

### 1.2 Climate
| Parameter | Value |
|---|---|
| Mean annual temp, Arabica | 18–22 °C |
| Mean annual temp, Robusta | 22–26 °C |
| Annual rainfall | 1,500–2,000 mm, ideally well distributed |
| Dry season | 2–3 months — beneficial for triggering flowering |

### 1.3 Soil
| Parameter | Value |
|---|---|
| pH | 5.5–6.5 |
| Drainage | Well-drained required (root-disease prevention) |
| Effective depth | ≥ 1 m |
| Organic matter | Higher is better (microbial activity, water retention); target band in §5 = 3–5 % |

### 1.4 Site-analysis inputs the source says to collect
- Soil test
- Climate data + historical weather incl. **extreme events**
- **Climate projection models** for new plantings (trees productive 20+ years)

---

## 2. Variety selection

### 2.1 Disease resistance
| Threat | Resistant material named |
|---|---|
| Coffee Leaf Rust (*Hemileia vastatrix*) | Catimor, Sarchimor, ICAFE 90 |
| Coffee Berry Disease | Ruiru 11, Batian |
| Nematodes | Robusta rootstock (grafting) |

### 2.2 Quality / productivity tiers
| Tier | Varieties |
|---|---|
| Exceptional cup | Gesha/Geisha, SL28, SL34, Bourbon, Typica |
| Balanced quality/yield | Caturra, Catuaí, Villa Sarchi, Pacas |

### 2.3 Architecture
| Habit | Varieties | Implication |
|---|---|---|
| Compact | Caturra, Catuaí, Catimor | Higher density possible |
| Tall | Typica, Bourbon, most traditional | Wider spacing |

Decision inputs: regional adaptability, local research institutions, neighboring-farm performance under the same microclimate.

---

## 3. Farm layout & infrastructure

### 3.1 Planting design
| Parameter | Value |
|---|---|
| Row orientation | North–south (max light interception) |
| Density, unshaded Arabica | 1,600–2,500 trees/ha |
| Density, shaded | 1,100–1,600 trees/ha |
| Block organization | Group varieties with similar management needs |
| Access routes | Planned for harvest logistics + maintenance |

### 3.2 Critical infrastructure (asset categories)
- Water systems — irrigation, processing, conservation structures
- Processing facility — central, with water + electricity
- Storage — clean, dry, well-ventilated
- Worker facilities — housing, sanitation, gathering space

### 3.3 Environmental management
| Element | Rule |
|---|---|
| Riparian buffer | 10–30 m along water bodies |
| Erosion control | Contour planting; **terracing on slopes > 15 %** |
| Windbreaks | Tree barriers vs prevailing winds |

Tools named: digital mapping, GIS, precision-agriculture principles.

---

## 4. Shade management

| Attribute | Full sun | Shade-grown |
|---|---|---|
| Yield | Often 30–50 % higher | Moderate |
| Time to first crop | Earlier | Later |
| Inputs (fert., irrigation) | Higher | Lower |
| Productive lifespan | 15–20 years | 25+ years |
| Climate vulnerability | Greater | Lower (temperature moderation) |
| Other | — | Slower maturation (quality), natural pest regulation, biodiversity, secondary income (timber, fruit) |

**Managed-shade options**
- Regulated shade: **25–30 % shade** with pruned, managed trees
- Stratified agroforestry: multiple canopy layers
- Temporal management: seasonal shade pruning timed to coffee phenology

Hybrid systems (shade intensity varying by microclimate within one farm) are recommended → app must support **shade % per block**, not per farm.

---

## 5. Soil fertility & nutrition

| Nutrient | Annual rate |
|---|---|
| N | 150–300 kg/ha/yr |
| P | 30–60 kg/ha/yr |
| K | 150–250 kg/ha/yr |
| Key micronutrients | B, Zn, Mg |
| Soil organic matter target | 3–5 % (cover crops, mulch, compost) |
| pH correction | Lime, calibrated to soil analysis |

**Application strategy**
- Split into **3–4 applications** aligned with phenological stages
- Pre-harvest: supports fruit filling + tree recovery
- Post-harvest: supports vegetative recovery
- Foliar: targeted micronutrients at critical stages

**Testing cadence**
- Basic soil analysis: **annually**
- Comprehensive nutrient analysis: **every 2–3 years**
- Program adjusted by: soil analysis, **tissue (leaf) sampling**, yield target, annual nutrient removal

---

## 6. Pruning

| System | Description |
|---|---|
| Single-stem | Vertical growth, selective lateral management |
| Multi-stem | **2–4** vertical stems per plant |
| Stumping / renovation | Full rejuvenation every **5–7 years** |
| Scheduled cycle | Renovate **20–25 % of farm per year** |

Objectives: light penetration, airflow (disease prevention), yield concentration, harvestable height, long-term productivity.
Timing: shortly **after harvest**, when carbohydrate reserves support regrowth.

---

## 7. Integrated Pest & Disease Management (IPM)

| Organism | Type | Controls named |
|---|---|---|
| Coffee Berry Borer (broca) | Pest | Trap monitoring; *Beauveria bassiana* biocontrol |
| Coffee Leaf Miner | Pest | Predator conservation; selective insecticide |
| Nematodes | Pest | Resistant varieties/rootstock; organic-matter management |
| Coffee Leaf Rust | Disease | Resistant varieties; fungicide program; nutrition |
| Coffee Berry Disease | Disease | Preventive copper sprays; resistant varieties |
| Root diseases | Disease | Drainage improvement; biocontrol agents |

**IPM logic sequence:** monitor/early detect → cultural practices → biological control (introduce + conserve) → **chemical only when an action threshold is exceeded** → post-harvest sanitation to break cycles.
Record: incidence, intervention, **effectiveness** (closed loop).
⚠ Source gives **no numeric thresholds** — see §17.

---

## 8. Climate adaptation

Farm level: variety diversification; more shade; better irrigation + water harvesting; windbreaks.
System level: intercropping; precision ag on microclimate data; soil-carbon building; cover crops (soil temp + erosion).
Enabler: **farm-specific climate monitoring** to track local trends.

---

## 9. Harvest

### 9.1 Ripeness indicators
| Indicator | Target |
|---|---|
| Color | Full red/yellow (variety-dependent) |
| Brix | 15–25 % soluble solids in ripe cherry |
| Firmness | Slight give, not mushy |
| Flotation | **< 5 % floaters** |

### 9.2 Harvest planning
Selective multi-pass picking; block-based planning on homogeneous ripening; trained crews with quality incentives; damage-free containers.
Record: harvest timing, **yield by block**, resulting quality → year-over-year protocol refinement.

### 9.3 Picking methods
| Method | Throughput (kg cherry / person-day) | Ripe selection | Fit |
|---|---|---|---|
| Selective hand | 50–80 | 95 %+ possible | Specialty, uneven ripening |
| Strip | 150–200 | Mixed | Commercial, uniform ripening |
| Mechanical | n/a | Depends on separation tech | Flat, uniform; viable at **≥ 50 ha** |

Hybrid: different method per block according to quality potential/market destination.

---

## 10. Processing & QC

### 10.1 Methods
| Method | Profile | Water | Equipment | Critical control points |
|---|---|---|---|---|
| Washed | Clean, bright, varietal clarity | **10–20 L / kg cherry** | Pulper, ferment tanks, wash channels | Ferment time; wash thoroughness |
| Natural | Fruit-forward, heavy body, winey | Minimal | Sorting tables, large drying area | Cherry selection; drying mgmt |
| Honey / pulped natural | Sweet, medium body, complex acidity | Moderate | Pulper w/ mucilage control, drying beds | Mucilage retention; drying rate |

Selection drivers: volume, water availability, climate, target market.

### 10.2 QC by stage
| Stage | Controls |
|---|---|
| Field | Visual maturity standards; cherry receiving inspection; flotation density sort |
| Processing | Fermentation monitoring (**time, pH, temperature**); drying moisture **target 10–12 %**; process-water quality testing |
| Storage/prep | Moisture stability check; defect analysis/removal; sample roast + cupping |
| Cupping | Regular lot evaluation; **SCA 100-point** scale; flavor-profile documentation |

Principle: link production data ↔ quality outcomes digitally (feedback loop).

---

## 11. Business management

### 11.1 Labor
Structures: core permanent team; seasonal harvest/pruning crews; contractors; shared community labor pools.
Productivity: task-based pay **with quality incentives**; standards + training; ergonomic tools; H&S protocols.
Seasonal: early recruitment/retention; housing + transport logistics; staggered planting to extend harvest; mechanize suitable tasks.
Worker-welfare and low turnover named as quality drivers.

### 11.2 Record-keeping (minimum dataset)
| Domain | Records |
|---|---|
| Production | Block yield + quality; inputs (**type, rate, timing, method**); labor activity + productivity; pest/disease incidence + interventions |
| Financial | Cost by operation **and** by area; revenue by grade **and** buyer; seasonal cash flow; investment + depreciation |
| Implementation | Digital platform; mobile capture; certification-compliance integration; GIS-linked |

Design principle stated: comprehensive **but usable** — data must drive decisions, not create admin burden.

### 11.3 Cost control
Fixed: equipment sharing; right-sized infrastructure; preventive maintenance; energy efficiency (solar drying, water recycling).
Variable: precision inputs from soil tests; IPM; selective mechanization; processing water efficiency.

| Scale | Ha | Strategy |
|---|---|---|
| Small | < 5 | Labor optimization, shared infrastructure |
| Medium | 5–20 | Focused capital, specialization |
| Large | > 20 | Vertical integration, mechanization |

Lowest cost ≠ highest profit in differentiated markets.

### 11.4 Certifications
| Scheme | Focus | Documentation | Premium (source) | Best fit |
|---|---|---|---|---|
| Organic | No synthetics, soil building | Full input records, buffer zones, organic farm plan | 20–40 % | Low-input, shaded farms |
| Fair Trade | Labor, community investment | Financial transparency, democratic governance | "Fixed premium" | Co-ops, small-producer groups |
| Rainforest Alliance / UTZ | Environment + social | Biodiversity plan, agrochemical mgmt, worker welfare | 5–15 % | Larger farms |

Principle: compliance embedded in the management system, not a parallel activity.

---

## 12. Market access & value addition

### 12.1 Channels
- Traditional: local intermediaries, co-ops, exporters/traders, auctions
- Direct trade: roaster/importer relationships; quality aligned to buyer preference; digital communication + story; **sample distribution + quality authentication**
- Hybrid: segment quality across channels; specialty importers; regional producer groups; direct sale of top microlots
Success factors: consistency, reliability, transparency, logistics capability.

### 12.2 Specialty positioning
| Pillar | Elements |
|---|---|
| Quality | **85+ points**; distinctive attributes; process specialization; microlot separation + identity preservation |
| Story | Farm history, producer, unique practices, environmental + community work |
| Technical docs | Lot sheet (variety, elevation, process); cupping notes; practice transparency; **traceability** |
| Relationships | Competitions; origin visits; social media; industry events |

### 12.3 Vertical integration by scale
| Scale | Options |
|---|---|
| Small | Micro-roasting, local market, **agritourism / farm experiences**, producer groups |
| Medium | Regional brand, export license, direct export logistics, **processing services to neighbors** |
| Large | Origin roasting, branded retail, multi-farm consolidation, café at origin |

---

## 13. Case studies (illustrative — unverified)

| Case | Scale | Interventions | Reported outcomes |
|---|---|---|---|
| Finca La Esperanza, Huila, Colombia | 15 ha | Variety diversification (Caturra, Colombia, Gesha, Pink Bourbon); transitional shade; ripeness incentives; lot separation by variety + altitude; multiple processes | Cup 78–82 → 86–90; premium 10 % → 80–120 %; 14 roasters / 4 continents; carbon-certification revenue |
| Kikai Cooperative, Tanzania | 1,200 members | Digital member tracking; village QC committees; tiered quality payment; central wet mill + mechanical drying; women's coffee program | Cup 82 → 86; farmer price +47 % in 3 yrs; water −60 %; women's lot +15 %; 92 % retention |
| Fazenda São Francisco, Minas Gerais, Brazil | 120 ha | Soil mapping + variable-rate fert.; drone monitoring; mechanical harvest + optical sorting; automated drying w/ remote monitoring; blockchain traceability | Fertilizer −22 % at same yield; harvest labor efficiency +35 %; drying energy −40 %; mechanized-natural premium line; CO₂/kg green −28 % |

Use as **feature-pattern inspiration only**; do not seed as benchmarks.

---

## 14. Production-system comparison

| Aspect | Traditional | Technified | Organic |
|---|---|---|---|
| Density (trees/ha) | 1,000–1,500 | 5,000–10,000 | 2,000–3,000 |
| Shade | Natural forest | Full sun / minimal | Diverse, managed |
| Varieties | Typica, Bourbon | Compact high-yield | Disease-resistant traditional |
| Fertilization | Limited/sporadic | Intensive, scheduled | Organic inputs, cover crops |
| Pest mgmt | Reactive | Preventive chemical | Biological + cultural |
| Yield (kg green/ha) | 600–900 | 1,500–3,000 | 900–1,500 |
| Labor (person-days/ha/yr) | 60–80 | 40–60 | 80–120 |
| Input cost (USD/ha/yr) | 500–900 | 1,500–2,500 | 1,000–1,800 |
| Quality potential | Variable, can be very high | Consistent commercial | Good–excellent |
| Environmental impact | Moderate | Higher land/water | Lower, + biodiversity |
| Climate resilience | Moderate–high | Lower | Higher |
| Productive lifespan (yr) | 25–40 | 15–20 | 20–30 |
| Premium potential | Variable | Limited | 20–40 % |
| Best fit | Small, steep, specialty | Flat, mechanizable, commercial | Sensitive areas, specialty |

---

## 15. Annual management calendar (as published)

| Months | Activities |
|---|---|
| Dec–Jan | Soil testing, fertilization planning, nursery establishment |
| Feb–Mar | Pruning, shade management, plantation renewal |
| Apr–May | Pre-flowering fertilization, set up pest monitoring |
| Jun–Jul | Flowering management, initial pest control, irrigation planning |
| Aug–Sep | Fruit-development support, disease prevention |
| Oct–Nov | Harvest prep, processing-equipment maintenance |
| Region-dependent | Harvest; post-harvest tree care |

⚠ Generic/unanchored to a hemisphere or region. **Do not hard-code months.** Model the calendar as offsets from phenological anchor events (main flowering, harvest start/end) per farm/block — see 03.

---

## 16. KPIs (as published — formulas are NN additions)

| Family | KPI | Proposed formula **[NN note]** |
|---|---|---|
| Production | Yield / ha | Σ green kg ÷ productive ha (block or farm) |
| | Yield / tree | Σ cherry kg ÷ productive trees |
| | Cherry-to-green ratio | cherry kg in ÷ export-ready green kg out (per lot) |
| Quality | Avg cup score | volume-weighted mean SCA score per season |
| | % in each quality tier | green kg per tier ÷ total green kg |
| Efficiency | Labor productivity | kg cherry ÷ person-day (by task type) |
| | Input-use efficiency | kg green ÷ kg N applied (and per input) |
| | Water per kg | L process water ÷ kg cherry (and ÷ kg green) |
| Financial | Cost / kg | Σ costs (allocated) ÷ kg green |
| | Price realization | realized price ÷ reference price (e.g., NY "C" diff or internal list) |
| | Gross margin / ha | (revenue − variable costs) ÷ ha |
| Sustainability | SOM trend | slope of soil OM % across tests per block |
| | Biodiversity indicators | shade spp. count, canopy layers, bird/pollinator surveys (user-defined) |
| | Carbon sequestration | user-entered or model-derived; flag method |

---

## 17. Internal conflicts, gaps and cautions (audit of the source)

1. **Density contradiction.** §3 gives unshaded 1,600–2,500 trees/ha, but §14 gives technified 5,000–10,000 and organic 2,000–3,000 (above the "shaded" 1,100–1,600). Store density as ranges **per production system + shade class**, never one global range.
2. **No IPM action thresholds.** The source says "when thresholds are exceeded" but gives none. Thresholds (e.g., % CBB infestation, % rust incidence) must come from a regional authority or the user — leave as required configuration, empty by default.
3. **Fermentation is named but not parameterized** (time/pH/temp without values). The app already runs per-protocol thresholds (washed, CryoBloom, yeast-inoculated, etc.). Do **not** import any global fermentation rule from this source.
4. **Drying spec is moisture-only.** 10–12 % is consistent with common practice, but no water-activity (aw) target is given. **[NN note]** Many specialty buyers also specify aw (commonly ≤ ~0.60–0.65); verify against current SCA/buyer specs before adding.
5. **Brix 15–25 %** is a very wide band; treat as an outer plausibility range, with variety/altitude-specific targets user-defined.
6. **Calendar is region-agnostic** (see §15). In Panamanian highland conditions harvest windows and flowering differ from any fixed month table. **[NN note]**
7. **Certification info may be dated.** **[NN note]** Rainforest Alliance and UTZ merged (2018) and now operate under a single Rainforest Alliance standard; Fairtrade combines a Minimum Price with a Premium rather than only a "fixed premium". Verify current scheme rules before building compliance checklists.
8. **Economic figures** (input costs, labor days, premiums) are unsourced, undated (assume 2025 USD) and not Panama-specific → display as "reference ranges", never as targets.
9. **Case-study outcomes** are not verifiable → do not use as benchmarks or marketing claims.
10. **Cherry-to-green ratio** named without value. **[NN note]** Commonly cited around 5–6:1 for washed Arabica, varying by process/variety; derive from the app's own mass-balance data instead of a constant.
11. **Not covered by the source** (potential gaps the app may need from other sources): flowering/phenology records, green grading (defect counts per SCA green protocol), screen size, density of green, storage aw/temperature logging, nursery management, water-discharge/wastewater treatment limits, traceability standards (e.g., EUDR geolocation), worker-safety records detail.
