# 08 — Panama Annex: Localization, Law and Calendar

**Prepared:** 2 Oct 2026 · **Evidence:** `research/R4_panama.md` (official Gaceta/MiAMBIENTE/MIDA/MITRADEL/MICI texts read via fetch) and `research/R5_business_cert.md` (EUDR, certifications). Legal items are **H confidence** unless marked. This annex overrides generic values in `01` for farms in Panama.

---

## 1. Regions and climate defaults

| Region code | Area | Altitude | Rain (mm/yr) | Notes |
|---|---|---|---|---|
| CHI-Boquete | Boquete | ~1,200–2,050 | 2,201–3,343 | Geisha frontier to ~2,050 m |
| CHI-TierrasAltas | Volcán, Cerro Punta, Paso Ancho | 1,000–2,000+ | 2,418–3,614 | — |
| CHI-Renacimiento | Santa Clara, Río Sereno | lower/mid | — | largest volume district (~60,000 qq forecast 2022-23) |
| PAN-CerroAzul | Cerro Azul (Panamá) | ≤ ~1,000 | **no official data** | below generic Arabica floor → warn, don't block |
| COC / PO / COL | Coclé, Panamá Oeste, Colón | low | — | robusta zones |

- Highland mean temperature 14–22 °C; rains May–Nov (peak Sep–Oct); **dry season Dec–Apr (~5 months)**; *bajareque* mist from mid-Nov (informal source).
- Chiriquí = 64 % of national output (2024-25). National ≈ 17,548 ha, 8,287 producers (2020-21).
- MIDA quality optimum 1,000–1,600 m (2011). App plausible range: **600–2,100 m**.
- **Don't flag 2,200–3,600 mm rain or 14 °C means as "unsuitable"** — they are normal for Tierras Altas.

## 2. Calendar (phenology-anchored)

| Template | Harvest start | Harvest end |
|---|---|---|
| Renacimiento / low-mid zones | Sep–Nov | Jan–Feb |
| Boquete & Tierras Altas, Caturra/Catuaí | Nov–Jan | Feb–Mar |
| High-altitude Geisha > 1,700 m | mid-Dec–Jan | Mar–Apr |
| Cerro Azul | user must fill | — |

- **Main flowering months: no official source.** Inference: Mar–May after rain onset; pre-rain flowerings after showers. → Record every flowering event per block (date, intensity %, preceding rain mm). It is the anchor for the calendar, harvest estimate and IPM thresholds.
- Year-to-year shift of ±2–4 weeks is documented (2025-26) → don't alert on it.
- **Current advisory (IMHPA 30 Sep 2026):** very strong El Niño through Feb 2027; below-normal Oct–Dec rain in Chiriquí; possibly early dry season. Deliver as a dated advisory; tag the season `el_nino`.
- Climate risk: excess harvest rain cut specialty output 20–30 % (2024-25) and an estimated 40–50 % (2025-26); Mesoamerican models project 55–62 % of suitable area lost by 2050, worst at 400–700 m (de Sousa 2019) → tag blocks < 1,200 m (and Cerro Azul) as higher exposure [NN inference].

## 3. Environmental law

**Riparian protection — Ley 1 de 1994 (Ley Forestal) — legal minimums, not recommendations:**

| Water feature | Natural forest (art. 23) | Planted forest (art. 24) |
|---|---|---|
| Spring, hilly terrain | 200 m radius | 100 m |
| Spring, flat terrain | 100 m | 50 m |
| River / stream | ≥ channel width, **never < 10 m each side** | 10 m each side |
| Lake / reservoir | up to 100 m | 10 m (artificial reservoir) |
| Aquifer recharge area | — | 50 m |

App: buffer mapped watercourses and springs in GIS; flag plots, new plantings, burns or agrochemical applications inside a buffer as **legal non-compliance**. Natural-forest use permits are suspended nationwide for 5 years (DM-0587-2024).

**Wastewater — DGNTI-COPANIT 35-2019** (continental waters): pH 5.5–8.5 · COD (DQO) 100 mg/L · ΔT ±3 °C · turbidity 30 NTU · BOD₅ and TSS **pending verification** (ACP uses 50 and 35 mg/L). Resolución 13/2025 modifies the norm (content not obtained). Characterization reports go to MiAMBIENTE (Annex B, with CIIU code); discharge-concession fee by volume and COD (DM-0015-2024). → Limit set `PA-COPANIT-35-2019`, configurable; push treat/infiltrate/no-discharge workflows.

**Water use** (DL 35/1966, DE 70/1973): *permiso* (≤ 1 yr, revocable) · *concesión transitoria* (3–5 yr) · *concesión permanente* (needs EIA + hydrological study). Store type, number, dates, max flow; remind before expiry.

**EIA:** Decreto Ejecutivo 4 of 28 May 2026 (categories I–III). Whether a wet mill is listed, and at what size — **not found**. Store `eia {category, resolution_no, date}` per facility.

## 4. Agrochemicals

- Registration: MIDA Dirección Nacional de Sanidad Vegetal (DE 12 & 13 of 2022; registered-products list updated Jun 2023).
- Prohibited: Resuelto APL 074-ADM (1997, 61 products); DAL 024-ADM-2011 (11 prohibited, 13 restricted); separate restrictions on endosulfan, paraquat, methomyl, chlorpyrifos, oxamyl.
- **Res. OAL-003-ADM-2026 (20 Jan 2026):** bans alachlor, benomyl, carbaryl, endosulfan, formaldehyde, imazalil, propachlor, spirodiclofen (20 HHPs removed in total), 18-month phase-out (~Jul 2027). Use MIDA's list (press also named carbofuran).
- App: `pesticide_status_PA` table by active ingredient (registered / restricted / prohibited / phase-out-until, with resolution); **block prohibited AIs**, warn on restricted/phase-out; require MIDA registration no., PHI, applicator, PPE, buffer check.

## 5. Labour

| Rule | Value | Source |
|---|---|---|
| Minimum wage, agriculture (national) | **B/.1.64/h** (≤ 10 workers) · **B/.2.10/h** (11+) | DE 13/2025, in force 16 Jan 2026 |
| Region | Boquete, Tierras Altas, Bugaba, Dolega, David, Panamá district = Región 1; Renacimiento = Región 2 (agriculture rate is national) | DE 13/2025 art. 3 |
| Pay interval | ≤ 15 days, at the work site | Código de Trabajo art. 235 |
| Housing | permanent workers: free, adequate, hygienic, family-sized | arts. 234–235 |
| Minimum age | 14 non-hazardous with MITRADEL permit (≤ 6 h/day, 36 h/week, 07:00–17:00, no overtime); **18 for hazardous** | MITRADEL 2025; DE 1/2016 list |
| Picking pay reference | B/.2.00 (Caturra) – 2.50 (Typica) per lata; jornal B/.15 — **2018, historical** | MIDA 2018 |

App rules: wage tables by effective date; **piece-rate guard** (latas × rate ÷ hours ≥ hourly minimum); pay-cycle warning > 15 d; housing register; date of birth for every worker — block < 14, enforce adolescent limits and hazardous-task blocks (agrochemicals, machinery, heavy loads); children on site recorded as dependents, never workers. Crew origin is optional free text (community/comarca), **never an ethnicity field**.

## 6. Units

| Unit | Default | Confidence |
|---|---|---|
| kg | canonical | — |
| lata (cherry) | 13.6 kg (MIDA "≈ 30 lb") | medium — calibrate per farm |
| quintal | 45.36 kg (100 lb) | low — official Panama definition not found; 46 kg is the CR convention |
| caja | none | user-defined |
| export sack | 60 / 69 kg | high |

Every conversion carries its source; mass balance comes from the farm's own weighings.

## 7. Market & export

- Best of Panama: 2025 record **US$30,204/kg** (Esmeralda washed Geisha, 20 kg lots); 2026 top **US$18,004/kg** (Elida Geisha, 15 kg lots; total US$3.04 M, 50 lots). → Auction prices are **outliers**, never KPI benchmarks.
- Export checklist: VUCE notice (MICI) · MIDA phytosanitary certificate · ICO certificate of origin (MICI) · EUR.1 for EU · EUDR geolocation pack · FDA registration for US.
- ICE "C": Panama trades at par.

## 8. EUDR (Reg. 2023/1115 as amended by 2025/2650)

- Applies **30 Dec 2026** (large/medium) and **30 Jun 2027** (micro/small); soluble coffee added from 30 Dec 2027.
- Cut-off 31 Dec 2020; geolocation ≥ 6 decimals; **polygon for plots > 4 ha**, point otherwise; records 5 years; HS 0901.
- **Panama = standard risk** → no simplified declaration; full plot geolocation for EU buyers during the 2026-27 harvest.
- App: `Plot.geometry` required for EU-bound lots; `land_use_2020_12_31` evidence; flag plots planted after 2020 (Geisha frontier moved ~1,600 → ~2,050 m); every green lot links to its plot IDs; DDS pack export (GeoJSON).

## 9. Still open

COPANIT BOD₅/TSS and Res. 13/2025 · EIA entry for *beneficios* · DE 1/2016 hazardous-task wording · official quintal/caja · current picking rates · Cerro Azul climate · IDIAP/MIDA numeric agronomy guidance · BoP 2026 rules on inoculation/additions (ask SCAP).
