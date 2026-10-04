# 05 — Evidence Study: What Authoritative Sources Say (v2)

**Prepared:** 2 Oct 2026 · **Scope:** a check of every topic in `01` (VNT-2025 vendor guide) and `02` (activity inventory) against research institutes, standards bodies, law and peer-reviewed literature. Seven research reports (≈ 48,000 words, all URLs fetched) are in `research/`. This document is the **synthesis**: what was confirmed, what was wrong, what was missing, and what still needs a human check.

**How to use it.** Claude Code treats this file plus `04_reference_parameters.json` v2 as the **authoritative layer**. `01` stays as the coverage map of the original article. Where `01`/`02` and this file disagree, this file wins.

| Report | Topic | Key sources |
|---|---|---|
| R1 | Agronomy & nutrition | Cenicafé, Anacafé, WCR, DaMatta 2006, Unigarro 2025, IICA, MIDA 2011 |
| R2 | IPM thresholds & sampling | Cenicafé, Anacafé, UH-CTAHR, IHCAFE, Ferrucho 2024, RA Farming Annex v1.4 |
| R3 | Harvest, processing, drying, storage, grading, cupping, calibration | SCA standards, CVA 2024, ISO 6673/8455/4149/10470/24115, Codex CXC 69, Cenicafé, Anacafé |
| R4 | Panama annex | Ley 1/1994, COPANIT 35-2019, DE 13/2025, MIDA, MICI, EUDR, IMHPA |
| R5 | Certifications, labour, cost, market, carbon, traceability | RA v1.4, Fairtrade 2026, NOP, EU 2018/848, STG 2024, GS1 EPCIS 2.0 |
| R6 | Processing methods taxonomy | Hurtado Cortés 2024, Elhalis 2023, Fermentis, 40+ trade/producer sources |
| R7 | Wet/dry mill infrastructure & instrumentation | ~40 Cenicafé Avances Técnicos, Anacafé 2018, Codex, ISO, Penagos, Fermentis |

---

## 1. Headline findings

1. **The vendor article was right about the topics and often wrong about the numbers.** Of the ~55 v1 parameters, 15 are now deprecated (see `04 → deprecated_keys`), ~20 had their range or confidence changed, and ~150 new sourced parameters were added (208 total).
2. **Planting density was understated by 2–4×.** WCR: dwarf 5,000–6,000, tall 3,000–4,000 plants/ha (v1: 1,600–2,500 / 1,100–1,600).
3. **"3–4 days of ripening delay per 100 m" has no source.** Replace with a thermal-time model: ≈ 2,500–3,100 degree-days (base 10 °C) flowering → harvest. Cenicafé data imply ≈ 8–9 d/100 m if a constant is unavoidable.
4. **Nutrient rates were on an oxide basis without saying so.** P and K are P₂O₅ and K₂O. Splits are 2–3 per year tied to rain, not 3–4.
5. **IPM thresholds exist — they are just profile-dependent.** Cenicafé, Anacafé and UH-CTAHR publish different numbers; every broca and roya threshold depends on **days after flowering**. Ship as selectable profiles (`master_data/agronomy_catalogs.json`).
6. **CBD is not in the Americas.** It is a quarantine alert, not a routine disease; "antracnosis" in Panama means *Colletotrichum* spp. (a separate entry).
7. **Water use for washing was overstated ~10×.** Cenicafé: conventional tank washing 4.1–4.2 L/kg dry parchment; Becolsub 0.7–1.0; Ecomill 0.3–0.5.
8. **Water activity has a standard: SCA aw < 0.70.** 0.60 is only an importer soft target.
9. **Specialty threshold is 80 on the 2004 SCA form** (v1 said 85). The 2024 CVA has **no score cut-off** — specialty is defined by value. Never convert between scoring systems.
10. **Labour was understated 2–3×.** Published Central American specialty farms: 181–252 worker-days/ha/yr (v1: 40–120). Labour is 47–75 % of cost.
11. **Panama law changes several "recommendations" into legal minimums.** Riparian buffers (Ley 1/1994), discharge limits (COPANIT 35-2019: COD 100 mg/L vs raw aguas mieles 25,000–165,000 mg/L), minimum wage, minimum working age, a January-2026 pesticide ban.
12. **EUDR applies from 30 Dec 2026 to large/medium EU operators.** Panama is **standard risk**, so there is no simplified declaration: plot geolocation (polygon > 4 ha, 6 decimals) is needed for the 2026-27 harvest.

---

## 2. Corrections table (v1 → v2)

| Topic | v1 (source) | v2 (source, confidence) |
|---|---|---|
| Arabica mean temperature | 18–22 °C (VNT) | Optimum 18–21; suitable 17–23 (DaMatta 2006; Unigarro 2025 — high). Tierras Altas 14–22 °C: don't label cool blocks unsuitable |
| Rainfall | 1,500–2,000 mm (VNT) | Optimum 1,200–1,800 (DaMatta — high). Chiriquí highlands 2,200–3,600 mm (MIDA) → **flag, never block** |
| Dry season | 2–3 months | 2–4 generic; Panama highlands ~5 months (Dec–Apr) |
| Ripening vs altitude | 3–4 d/100 m | Deprecated → GDD model 2,500–3,100 °C·d (Unigarro 2025) |
| Soil pH | 5.5–6.5 | Profile-dependent: Cenicafé optimum 5.0–5.7 (lime < 5.0); Anacafé adequate 5.5–6.5 (lime < 5.5) |
| Soil OM | 3–5 % target | Not a global target (Andisols 8–16 % = "medium") |
| Soil depth | ≥ 1 m | ≥ 0.7 m (Cenicafé, IICA) |
| N / P / K | 150–300 / 30–60 / 150–250 kg | N 100–300 (≈290 high-density sun); **P₂O₅** 20–60; **K₂O** 180–300; + MgO 15–60, S 50–60, removal per t green |
| Fertiliser splits | 3–4 | 2–3 (Anacafé, Cenicafé, IICA — high) |
| Density | 1,600–2,500 / 1,100–1,600 | Dwarf 5,000–6,000; tall 3,000–4,000 (WCR — high); technified ≤ 10,000 |
| Spacing | 2.5 m (single value) | Row × plant: dwarf 2.0 × 1.0; tall 2.4 × 1.2 (Anacafé) |
| Row orientation | N–S | Contour on slopes (no support for N–S) |
| Terraces | slope > 15 % | No authoritative threshold. Barrier spacing by slope: 5 % → 25 m … 60 % → 6 m (IICA-DR) |
| Shade | 25–30 % vs 40–50 % | Default 35–45 %, configurable 20–60 (Cenicafé; yield falls above ~40 % — KOUT22) |
| Pruning | stems 2–4; renovate 20–25 %/yr | Stems 1–3 (≤ 10,000 stems/ha); renovation = 100 / cycle years; stumping 5–7 yr confirmed; zoca cut 30 cm |
| Nursery | 6–9 months | Germinador ≈ 60 d + bag phase 6–7 months (outer 5.5–12) |
| IPM thresholds | none | Profiles: CBB Cenicafé > 2 % (> 120 DAF, ≥ 50 % A/B); Anacafé 3–5 %. CLR Anacafé < 10 %; Cenicafé 15 % action / 30 % damage. CLM 30 % mined & parasitism < 20 % |
| CBD | routine disease, copper | Africa-only quarantine pest — alert & report |
| Ripeness | Brix 15–25 | Keep as plausibility; reference by stage; **warn unripe ≥ 2.5 %** (Martínez 2017) |
| Floaters | < 5 % (medium) | Value kept, confidence **low** (no standard) |
| Pulping delay | ≤ 24 h | Warn > 10 h (Anacafé); Cenicafé 48 h hold OK for selected ripe fruit **with mass-temperature logging** |
| Washing water | 10–20 L/kg cherry | 4.1–4.2 L/kg cps conventional; 0.3–1.0 ecological |
| Fermentation (generic washed) | 12–36 h | 6–72 h literature; pH ≈ 5 → done within 2 h; info-only |
| Drying endpoint | 10–12 % | Confirmed (high) + hard flag > 12.5 % (Codex) |
| aw | null | Fail ≥ 0.70 (SCA); warn 0.65 (NN); optional 0.60 |
| Turning | hourly | ≥ 3–4 turns/day (Cenicafé) |
| Mechanical drying | — | Air ≤ 50 °C static / ≤ 60 °C rotary; **bean ≤ 40 °C**; 100 m³/min/t; no direct firing |
| Cupping scale | SCA 100-pt, specialty 85 | Enum (2004 form / CVA 2024 / CoE / custom); 80 for 2004 form only |
| Certifications | RA 5–15 % premium; FT "fixed premium" | RA v1.4 negotiated premium; FT minimum 1.80 → **2.00 US$/lb from 1 Dec 2026**, premium 0.20, organic +0.40 |
| Labour | 40–120 person-days/ha | 181–252 (specialty CA) |
| Riparian buffer | 10–30 m | Panama legal: springs 200/100 m, rivers ≥ max(10 m, channel width) each side, lakes 100 m |

---

## 3. What the research added that v1 did not have

- **Phenology as the anchor of everything**: flowering events per block (date, intensity, preceding rain), GDD tracking, and DAF-gated IPM rules.
- **Leaf analysis**: sampling protocol (3rd–4th leaf pair, 80 leaves/lot) and sufficiency profiles (labs disagree — store the profile used).
- **Variety catalog** with dated rust-resistance status (breakdown documented for CR 95, Lempira, IHCAFE 90, Catimor lines).
- **12 Panama-relevant organisms** (ojo de gallo, Cercospora, mal de hilachas, Phoma, mal rosado, Rosellinia, anthracnose, *Xylella* watch).
- **Green grading** (SCA 350 g, Category 1/2 equivalents), screen sizes, density, ISO moisture method, ISO 24115 meter calibration, pH/refractometer calibration.
- **CVA 2024** data model (descriptive 0–15 + CATA; affective 1–9 × 8; physical; extrinsic).
- **Mass-balance factors** and bulk densities (Cenicafé AT370) for derived headspace, layer depth and plausibility checks.
- **Complete processing taxonomy** (115 named methods, 9 axes, 13 synonym clusters) — see `06`.
- **Wet/dry mill infrastructure** (≈ 90 asset types, 84 variables with setpoints) — see `07`.
- **Panama legal/administrative layer** — see `08`.
- **Certification as versioned data**, deforestation cut-offs per scheme, EUDR fields, EPCIS event model, carbon ledger separation.

---

## 4. Conflicts the app must model (not resolve)

| Conflict | Sources | App rule |
|---|---|---|
| Soil pH optimum | Cenicafé 4.9–5.7 vs Anacafé 5.5–6.5 | Site `authority_profile` chooses |
| Leaf Zn sufficiency | 6–12 / 14–18 / 15–150 mg/kg | Store profile per interpretation |
| CBB threshold | Cenicafé 2 % vs Anacafé 3–5 % | Profile; both DAF-gated |
| CLR threshold | Anacafé < 10 % vs Cenicafé 15 % | Profile |
| Cherry holding | Anacafé 10 h vs Cenicafé 48 h | Profile + mandatory mass temperature > 10 h |
| Fermentation °Brix endpoint | Cenicafé AT454 vs AT422 | Info only; protocol endpoints rule |
| Drying interruption | Anacafé nightly stop vs Cenicafé never early | Moisture-gated: warn > 30–40 % (NN gate) |
| Solar layer depth | Codex 3–5 cm vs Cenicafé 2 cm | Profile by structure type |
| Warehouse RH | ISO ≤ 60 % / Anacafé 65 % / Cenicafé 69–77 % at low T | RH limit as function of temperature |
| Wall clearance | ISO 0.8 m vs Anacafé 0.5 m | Default ISO |
| Carbonic maceration definition | whole cherry vs depulped | Record fruit state; name is a label |
| Lactic process definition | spontaneous LAB vs added culture | Record microbial control |
| Wet-hull moisture | 20–24 % (PDG) vs 25–50 % (1Zpresso) | Record measured value |

---

## 5. Still open — needs a human check of primary text

1. Full COPANIT 35-2019 limits table (BOD₅, TSS) and Resolución 13/2025 content.
2. DE 4/2026 EIA *lista taxativa*: is a *beneficio* listed, at what size/category?
3. Best of Panama 2026 / CoE / WCC current wording on **inoculated yeast, bioprotection, enzymes, salt, own-coffee must** — material for SafCoffee and CryoBloom lots. Ask SCAP in writing.
4. FDA GRAS notice for *Metschnikowia pulcherrima* on coffee cherry (cited in your CryoBloom notes) — re-verify before public use.
5. Official kg definitions of quintal and caja in Panama; current picking rate per lata.
6. Rainforest Alliance ground riparian widths; RA 2026 regenerative standard shade criteria.
7. SCA 104 affective formula — verify against the official calculator.
8. Thermal-shock and mossto parameters (producer-proprietary; none published).
9. Dry-mill machine settings, sealed-vessel gas instruments, sanitizer agents, CO₂ confined-space limits (mostly trade knowledge in R7).
10. Cerro Azul agro-climatic data (no official source found).
11. IDIAP/MIDA numeric recommendations for Panama (fertiliser, density, shade) — none found.

---

## 6. Research limits (be honest about coverage)

- ICAFE's technical guide, several CATIE/FAO/CABI pages and pinhalense.com.br could not be read.
- The session's web-search budget ran out during R5–R7; later work used direct fetches of known institutional URLs and site navigation. Peer-reviewed coverage of experimental processing rests mainly on two 2023–2024 reviews.
- Every number in `04` carries a source and confidence; items marked `NN` or `low` are visually flagged in the app and must not drive blocking rules.
