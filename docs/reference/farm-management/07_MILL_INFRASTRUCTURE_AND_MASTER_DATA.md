# 07 — Wet & Dry Mill Infrastructure, Instruments and Master Data

**Prepared:** 2 Oct 2026 · **Data:** `master_data/mill_assets.json` (91 catalog entries + 26 equipment types), `master_data/variables.json` (84 variables with units, instrument, frequency, reference, source, confidence) · **Evidence:** `research/R7_mill_infrastructure.md` (81 URLs, ≈ 40 Cenicafé Avances Técnicos, Anacafé 2018, Codex CXC 69, ISO 8455/24115, Penagos, Fermentis).

**Why this area matters.** A protocol says *what* should happen; the installation decides *what actually happens*. Vessel material changes fermentation speed (stainless slowest, plastic fastest), a direct-fired dryer taints coffee with smoke, a solar dryer rewets coffee at night, and a probe in the plenum is not a probe in the coffee mass. The app therefore needs every installation as a **registered asset**, every reading tied to **an asset, a step and a calibrated instrument**, and protocols that declare **capabilities** they need rather than naming a tank.

Evidence tags: **[S]** source read · **[T]** trade knowledge, unverified · **[I]** inference. Where an area is mostly [T] it is flagged.

---

## 1. Twelve facts that shape the design

1. **Held cherry heats itself:** sacks reached 38–41 °C at 48 h. Log **mass core temperature** in holding and cold rooms. [S Cenicafé AT589]
2. **Holding limits disagree:** Anacafé pulp ≤ 10 h; Cenicafé 48 h with no score loss for selected ripe fruit → authority profile + mandatory mass-temperature log > 10 h.
3. **Vessel material is a process variable:** food-grade MDPE matched AISI 304 stainless in the cup at 63 % lower cost; avoid wood, corroding metal, flaking paint. [S AT431, AT422, AT496]
4. **Mucilage ≈ 22 % of depulped mass; titratable acidity** rises ≈ 900 → 3,000 (20 h) → 5,600–6,700 mg CaCO₃/L (36 h). [S]
5. **Mechanical drying:** air ≤ 50 °C static (≤ 60 °C rotary), ≈ 100 m³/min per t dry parchment, reverse air every 6–8 h, layer < 35–40 cm. With 50 °C air the **bean reached 48 °C** → alarm on bean temperature. [S]
6. **Direct firing = smoke/fuel taint.** Indirect heat exchanger only. [S AT371, AT454]
7. **Solar dryers:** 14 kg washed parchment/m² at 2 cm; ≥ 3–4 turns/day; **night rewetting below 20 % moisture**; polycarbonate covers dry 40–47 % faster and last > 8 years. [S]
8. **Don't stop drying early:** 36–48 h stop at ≈ 47 % moisture → earthy defect in 100 % of samples. Moisture-gated rule. [S AT562]
9. **Water ladder (L/kg dry parchment):** running channel 18.7–39 → tank 4.1–4.2 → hydrocyclone 1.9 → Becolsub 0.7–1.0 → Ecomill 0.3–0.5 → waterless pulping 0. [S]
10. **Wastewater 250–1,650× Panama's COD limit** (25,000–165,000 vs 100 mg/L). Default to zero-discharge workflows. [S + R4]
11. **Barrier packaging decides storage life:** high-barrier ≤ 12.3 % moisture after 1 year vs fique ≈ 15 %; 10–12 °C storage held quality 240 days. [S AT590]
12. **Instrument physics:** capacitance meters under-read warm coffee (equilibrate ≥ 30 min); aw rises ≈ 0.02 per +10 °C → store sample temperature with every moisture/aw reading. [S AT580, AT583]

---

## 2. Installation catalog (summary — full detail in `mill_assets.json`)

### 2.1 Reception & cherry handling
| Code | Installation | Key design / setpoints |
|---|---|---|
| REC-SCL | Reception scale | record kg; local volume units are farm-calibrated |
| REC-HOP | Hopper — dry (gravity) / wet (water-fed) | 45° walls; sized at 2 % of annual production as daily peak; cherry 610–622 kg/m³; greased covers catch borers |
| REC-HLD | Holding area / cherry rest | log mass core °C; shaded, ventilated |
| REC-PCL | Air pre-cleaner | leaves, sticks, soil |
| REC-SIF | Siphon / flotation tank | 1.6 L/kg cherry clean water, not recirculated; clean daily |
| REC-DST | Wet destoner | protects pulpers |
| REC-SRT | Cherry sorting (hand / optical) | ≥ 80 % ripe, < 2.5 % unripe for modified fermentations |
| TRN-* | Transport: hydraulic, screw, bucket elevator, gravity | dry conveying saves > 50 % water |

### 2.2 Pulping
PUL-DRM horizontal drum (waterless capable; gap set by shims) · PUL-VRT vertical (2,000–2,500 kg/h) · PUL-DSC disc [T] · PUL-REP re-passer · PUL-SCR rotary screen · PUL-PCV pulp conveyor (screw, no water).
**Quality limits (NTC 2090 / Cenicafé):** damaged < 1 %, unpulped < 1 %, pulp in coffee < 2 %, coffee in pulp 0 %.

### 2.3 Mucilage removal, washing, classification
DEM-UPF upflow demucilager (Deslim, DELVA) · DEM-BCS Becolsub · DEM-ECM Ecomill (60° cone, > 95 % removal) · DEM-ENZ enzyme dosing (disclose) · WSH-TINA tanque tina (≈ 0.666 L/kg cherry, 30 % free volume, 4 rinses) · WSH-CHN canal de correteo · WSH-HCY hydrocyclone · WSH-WSR mechanical washer.

### 2.4 Fermentation vessels & thermal control — **all types**
| Code | Vessel class | Oxygen regimes it supports | Store |
|---|---|---|---|
| FER-OPN | Open tank (tiled/epoxy concrete, stainless, plastic) | aerobic open, submerged | material, volume, geometry, floor slope 8 %, drain, shade, location |
| FER-CON | Conical self-emptying tank (MDPE/stainless) | aerobic, submerged | cone angle, outlet Ø, food-contact ref |
| FER-SLD | **Sealed tank / bioreactor** | sealed self-induced, sealed with valve, CO₂-flushed, N₂-flushed, vacuum | pressure rating (e.g. 0–103 kPa), relief set-point, one-way valve, gas ports, sample/probe/leachate ports, manway, jacket, agitation, sensors |
| FER-DRM | Drums / barrels (HDPE, stainless, wood) | sealed/valve | prior contents, food-contact (21 CFR 177.1520 for polyolefins) |
| FER-BAG | Hermetic / silage bags | sealed, vacuum, submerged-in-river | gauge, puncture checks |
| FER-IBC | IBC tote (1,000 L) | sealed/open | never ex-chemical |
| FER-ACC | Fittings: airlock, one-way valve, relief valve, sampling port, thermowell | — | inspect gaskets each run |
| THM-JKT | Jacket + glycol chiller | controlled constant, cold, stepped | control range, medium, chiller |
| THM-CR | **Cold room** (cherry cold-hold, baba < 8 °C, green 10–12 °C) | cold-hold pre-fermentation (CryoBloom 9–12 °C) | setpoint range, RH control, alarm, defrost |
| THM-FRZ | Freezer | frozen cherry; borer kill ≤ −15 °C ≥ 48 h | — |
| THM-BTH | Immersion bath | thermal shock (hot/cold) | water volume, heater/chiller |
| FER-YST | Yeast fridge + rehydration vessel | inoculation | storage < 15 °C long-term; opened ≤ 4 °C ≤ 7 d |

**Safety:** sealed tanks and pits are confined spaces; CO₂ accumulates in fermentation and cold rooms → CO₂ monitor + ventilation [T]. Pressure never above vessel rating (blocking rule).

### 2.5 Drying installations — **all types**
| Code | Structure | Key design values |
|---|---|---|
| DRY-PAT | Patio (cement ≥ 1 % slope, brick, asphalt, tarp; **bare earth unsuitable**) | layer 3–5 cm (Codex), ≤ 7 cm (Anacafé); avoid surface > 40 °C; 27 m²/t cps |
| DRY-BED | Raised / African bed / pasera | Cenicafé pasera 150 × 100 cm, 65 cm high, PE mesh, 3 cm layer, stackable; East-African ≈ 0.8–1 m high [T] |
| DRY-CBD | Covered / shaded bed (slow dry) | 80 % shade added 4.6–6.3 d, no cup gain [S] |
| DRY-PAR | Parabolic / tunnel / marquesina | 6.5 × 4.0 × 2.1 m, N–S axis, ≤ 3 cm, 19.5 kg wet/m², 7–15 d; cover 3–5 yr; clean with water only |
| DRY-MOD | Modular polycarbonate solar dryer | 3 mm PC, > 8 yr; extractor on hygrostat at > 95 % RH inside |
| DRY-ELB | Rolling roof (casa elba) / carts | carts ≤ 3 cm; geometry not sourced [T] |
| DRY-DRK | **Dark / controlled room** | darkness, dehumidifier, fans; example 18 °C; sizing not sourced [T] |
| DRY-SIL | Static silo (1–3 levels) | layer < 35–40 cm; 2–5 HP fans for 80–160 m³/min; air reversal 6–8 h |
| DRY-ROT | Rotary drum (guardiola) | pre-dry 8–10 h; fill 100 % (part-filled strips parchment); air ≤ 60 °C |
| DRY-VRT | Vertical column dryer | stainless exchanger, auto fuel feed |
| DRY-FUR | Furnace / heat exchanger | **indirect only**; cisco 17.9 MJ/kg, dried pulp 16.5 MJ/kg; thermostat 48–52 °C |
| DRY-COV | Covers, rakes | heap & cover at night; rake cuts drying time 25 % |

### 2.6 Conditioning & storage
STO-BIN reposo bins (cool 8–10 h before bagging; rest ≥ 21 d) · STO-WHS warehouse (ISO 8455: ≈ 22 °C, RH ≤ 60 %, > 0.8 m from walls, ≥ 2 m to ridge, pallets, dark, pest programme, segregate odours/chemicals/organic) · STO-CLD green cold store (10–12 °C) · STO-PKG packaging (jute/sisal/fique vs high-barrier multilayer vs vacuum) · TRN-CTR containers (≤ 12.5 % moisture, liners, port dwell ≤ 72 h).

### 2.7 Byproducts & wastewater
BYP-PIT covered pulp pit (V m³ = 0.002 × annual kg cps; 4–6 months to humus) · BYP-WAB washwater absorbed on pulp (2–3 kg pulp/L, 83–89 % retained in 24 h → zero discharge for low-water mills) · BYP-VRM vermicompost · BYP-FUEL dried pulp fuel · BYP-CSC cascara drying (food-safety plan [T]) · WW-SET lime + settling (Ca(OH)₂ 4–5.2 g/L → pH ≈ 8) · WW-STLB primary leachate system (−67 % COD) · WW-SMTA anaerobic reactor/biodigester · WW-GRF green filter · WW-EVP leachate evaporation → fertiliser.
**Panama:** discharge must meet COPANIT 35-2019 (pH 5.5–8.5, COD 100 mg/L, ΔT ±3 °C; BOD₅/TSS pending) — raw aguas mieles are pH 3–4, COD 25,000–165,000 mg/L.

### 2.8 Dry mill (weakest-sourced area — mostly [T])
DML-PCL pre-cleaner · DML-DST destoner · DML-HPG parchment huller (washed hulling loss 17.75–18.4 %) · DML-HCH dry-cherry huller (husk 54.6 % of dry cherry) · DML-POL polisher · DML-CAT pneumatic separator (catadora) · DML-SCR screen grader (n/64"; European prep ≤ 5 % below screen 15) · DML-GRV gravity/density table · DML-OPT optical sorter (RGB/IR/UV) · DML-HND hand sorting (~60 kg/person/day; light ≥ 4000 K, 1,200 lx) · DML-MAG/MTD magnet, metal detector · DML-BAG bagging scale (60/69 kg sacks).

### 2.9 Lab & instruments
| Code | Instrument | Calibration rule |
|---|---|---|
| LAB-MMC | Capacitance moisture meter | ISO 24115: ≥ 5 reference samples 8.5–13.5 % set by ISO 6673 oven; check before each harvest and on drift > 0.5 pt; equilibrate warm samples ≥ 30 min |
| LAB-OVN | Oven (ISO 6673: 105 °C, 16 h) | reference method; verify oven temperature |
| LAB-GRV | Gravimet / GravimetSM2 | target mass m_t = m₀ (1 − w₀)/(1 − w_t); ±0.5 % vs ISO |
| LAB-AW | aw meter | salt standards; log sample °C |
| LAB-DEN | Free-settled densimeter | fixed cylinder/funnel |
| LAB-REF | Refractometer | zero daily with distilled water (±0.2 °Brix) |
| LAB-PH | pH meter | 2-point (pH 4 & 7) each day of use; slope 95–105 % |
| LAB-TA | Titration kit | mg CaCO₃/L |
| LAB-FMT | Fermaestro | endpoint void > 85 mm |
| LAB-CRP | CERPER kit (cherry:parchment) | reference factor |
| LAB-THM / LOG | Probes, T/RH data loggers | reference check; positions: mass core/top/bottom, plenum, exhaust, headspace, ambient |
| LAB-GAS / PRS / DO / EC | CO₂/O₂ (NDIR), pressure, dissolved O₂, conductivity | zero/span [T] |
| LAB-FLW | Flow meters, rotameters | re-*aforo* each season |
| LAB-WX | Weather station / pyranometer | sunshine hours predict solar drying days |
| LAB-RST/GRD/AGT/SCS/UV/CUP | Sample roaster, grinder, Agtron, screens, UV lamp, cupping room | per SCA protocol (R3) |

### 2.10 Utilities & site
UTL-WSRC water source & tests (potable: no enterobacteria/heavy metals, pH 6–8) · UTL-WST storage (size on measured L/kg cps) · UTL-PWR/FUEL energy & fuel store (segregate fuels) · UTL-SAN sanitation SOPs (POES) · UTL-SAF safety (machine guards, lockout, PPE for lime/acids, CO₂ monitors, confined spaces) [T].

---

## 3. Master variables (84) — structure

Full list in `master_data/variables.json`. Prefixes: V-REC reception · V-HLD hold · V-PUL pulping · V-WAT water · V-DEM demucilage · V-FER fermentation (18 variables incl. mass/ambient °C, pH, °Brix, TA, Fermaestro, headspace CO₂/O₂, pressure, DO, EC, fill & headspace, inoculum dose, rehydration, yeast storage) · V-WSH washing · V-DRY drying (19 incl. moisture, Gravimet, aw + °C, bean °C, plenum °C, airflow, layer, load, turns, air reversal, dryer T/RH, ambient/radiation, duration, aw-window days, fuel, kWh, interruptions, patio surface °C, uniformity) · V-CND conditioning · V-STO storage · V-TRN transport · V-WW wastewater · V-BYP byproducts · V-DML dry mill · V-INS instrument compliance.

Each variable carries: unit · instrument · step · frequency · reference range/setpoint · source · confidence. **References warn; only safety (pressure ≤ rating) and legal limits (discharge, Panama) may block.** Protocol setpoints always override references.

---

## 4. Data model

```
Site (farm, coordinates, altitude, weather station, authority_profile)
 └─ Facility (wet_mill | fermentation_room | cold_storage | drying_yard | dryer_house |
              dry_mill | warehouse | lab | wastewater | utility)
     └─ Asset (asset_type = catalog code; attributes JSON validated per type)
         ├─ Component (valve, jacket, fan, furnace, cover — own maintenance)
         └─ Sensor (fixed instrument channel at a named position)
Instrument ── CalibrationEvent
Asset ── MaintenanceEvent, SanitationEvent
Allocation (Asset × ProtocolRun step × Lot × time window × fill)
MeasurementRecord (variable_code × value × unit × method × Instrument/Sensor × Allocation × step × Lot)
Deviation (run, step, variable, expected, observed, severity, action)
```

Key entities (JSON sketch — full schemas in R7 §5.2–5.3):

```jsonc
Asset { id, facility_id, asset_type, subtype, name, manufacturer?, model?, serial?, year?,
        status, capacity {value, unit, basis},
        food_contact? {material, grade, compliance_refs[]},
        attributes {...},          // per type: e.g. FER-*: vessel_class, material, geometry, volumes,
                                   // closure, pressure {rating_kpa, relief_set_kpa, one_way_valve},
                                   // gas_ports[], ports[], agitation, thermal {jacket, chiller, range},
                                   // light_exclusion, location
        maintenance_plan[], sanitation_plan[], documents[], photos[] }

Instrument { id, instrument_type, make, model, serial, range, resolution, accuracy, principle,
             grain_curve?, calibration_policy {method, standard_ref, interval_days, before_season, on_events[]} }

Sensor { id, instrument_id, asset_id,
         position: mass_core|mass_top|mass_bottom|plenum|exhaust|headspace|liquid|ambient_in|ambient_out|surface,
         depth_cm?, logging_interval_s }

MeasurementRecord { ts, variable_code, value, unit, method, instrument_id?, sensor_id?, allocation_id?,
                    lot_id, protocol_run_id?, step_seq?, sample {position, mass_g, temp_c, equilibrated_min},
                    operator, source: manual|logger|import,
                    calibration_state: valid|expired|unknown,   // computed at write time
                    qc_flags[] }
```

**Change to the processing model (06):** protocols declare a `vessel_requirement` (capabilities); each run records an `Allocation` to a real asset. Headspace %, layer depth, load/m² and specific airflow then become **derived**, not typed.

### Derived values
- Headspace % = 100 × (1 − (fill_kg / ρ) / V) — ρ cherry 616–622, baba 803–827, washed 694–702, dry parchment 386–391, green 707–710 kg/m³.
- Layer depth (cm) = load (kg/m²) / ρ × 100.
- Gravimet target mass = m₀ × (1 − w₀)/(1 − w_t).
- Tank volume = 0.666 L × kg cherry (+30 % free).
- Specific airflow = m³/min ÷ (batch t cps) vs ≈ 100.
- Water L/kg cps per stage; COD load kg/day = volume × COD.
- Drying rate %-points/day; days between aw 0.95 and 0.80; fuel kg/kg cps; kWh/kg cps.
- Mass balance per asset (in vs out) against conversion factors.

### Planning-time capability checks
- `co2_flushed` / `inert_gas_flushed` step → asset must have gas ports + sealable closure.
- Below-ambient setpoint → jacket or cold room.
- Dark-room drying → `light_exclusion = true`.
- Mechanical drying without indirect exchanger → smoke-risk warning.
- Pressure setpoint > vessel rating → **block**.
- Capacitance moisture reading without `equilibrated_min ≥ 30` → "warm sample" flag; aw without sample °C → reject.

---

## 5. Gaps (need sources or your own data)

Dry-mill machine settings · SMTA/UASB design loads · green-filter loading · cold-room design and condensation · sanitizer agents and concentrations · CO₂ exposure limits / confined-space rules · cascara food safety · casa elba and East-African bed geometry · plastic-drum pressure ratings · glycol systems · optical-sorter specs · Pinhalense data (site blocked). Your own installations (Cafelino, Las Nubes, Boquete sites) should be entered as the first real assets — that will also validate the attribute schemas.
