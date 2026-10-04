# 06 — Coffee Processing Map: Every Method, Classified

**Prepared:** 2 Oct 2026 · **Data:** `master_data/processing_methods.json` (115 entries) and `master_data/processing_axes.json` · **Evidence:** `research/R6_processing_taxonomy.md` (42 sources, all fetched), cross-checked against the three guides you sent (Routes Coffee, 1Zpresso, Font Mag).

---

## 1. The core idea

Almost every "new" process name is a **combination of a few independent decisions**. If the app stores those decisions per step, every named method — existing or future — becomes an exact, comparable description, and names become labels.

**Nine axes (A–I) + two descriptors (J, K):**

| Axis | Decision | Values |
|---|---|---|
| **A Fruit state** | How much fruit is on the seed? | whole cherry · depulped (full / partial % / removed by fermentation / mechanical / enzymatic) · wet-hulled parchment · green |
| **B Oxygen** | How much oxygen? | open · submerged · sealed self-induced (SIAF) · sealed with valve · CO₂-flushed · N₂/Ar-flushed · vacuum |
| **C Temperature** | What thermal regime? | ambient · controlled · cold (< 15 °C) · **cold-hold pre-fermentation** · stepped · thermal shock · heated (> 30 °C) · frozen |
| **D Microbes** | Who ferments? | spontaneous · backslopped (mossto) · yeast *Saccharomyces* · yeast non-*Saccharomyces* · LAB · mould (koji) · mixed · bioprotection · indigenous isolate · animal gut |
| **E Additions** | What is added, and when? | none · own-coffee derivative (must, cascara, pulp) · processing aid (enzyme, salt, acid, sugar) · exogenous natural (fruit, spices, hops) · exogenous flavouring — each tagged **pre-green / post-green** |
| **F Physical** | Any physical intervention? | chilling · freezing · hot/cold immersion · agitation · pressure · ultrasound · ozone/UV |
| **G Drying** | How and where does it dry? | patio · raised bed · shaded bed · solar/parabolic · mechanical · dark room · two-stage (wet-hull) |
| **H After drying** | Any conditioning? | reposo · hermetic · aged · monsooned · barrel-aged · decaf |
| **I Animal passage** | — | civet · elephant · jacu bird · monkey |
| *J Duration* | derived | hours per step and total |
| *K Target outcome* | **descriptor, not an axis** | lactic · acetic · malic · winey · ester/fruit · clean |

**"Lactic", "acetic", "malic" are outcomes, not mechanics.** A "lactic process" is any combination that makes LAB dominate (sealed + cool + long, or LAB inoculation, or salt brine). A "malic" lot is a claim about the acid profile. In the app, those labels require measured acid data or must be published as "target profile".

**Axes are stored per step.** A and B change within a protocol (cherry sealed → depulped → washed), so "double anaerobic", "natural-then-washed" and CryoBloom are encoded exactly as ordered step vectors.

---

## 2. Families — what is genuinely a "class"

```
FRUIT-STATE FAMILIES (the only four classic classes — axis A)
 ├─ W  Washed            mucilage removed before drying (fermentation / mechanical / enzymatic)
 ├─ H  Honey / pulped natural   skin off, mucilage dried on (white→black by % retained)
 ├─ N  Natural            whole cherry dried
 └─ WH Wet-hulled         parchment removed at 20–24 % moisture

MODIFIERS (combine with any family)
 ├─ AN Anaerobic / sealed        axis B
 ├─ CM Carbonic maceration        axis B (whole cherry + CO₂)
 ├─ T  Temperature-defined        axis C/F (cold, cold-hold, frozen, thermal shock, heated)
 ├─ M  Microbial control          axis D (inoculation, backslop, bioprotection, koji)
 └─ P  Physical interventions     axis F

REGULATORY CLASS
 └─ E  Additions                 co-ferment, infused, processing aids  ← what competitions police

DRYING / POST-DRYING / OTHER
 ├─ G  Drying regimes (slow dry, dark room…) — often sold as "processes"
 ├─ X  Post-drying (aged, monsooned, barrel)
 ├─ Z  Animal passage
 ├─ L  Producer labels (not mechanisms)
 └─ D  Decaffeination (post-green)
```

**Genuinely distinct mechanisms** (different physics or biology): mucilage removal by fermentation vs machine vs enzyme · whole-cherry intracellular (carbonic) vs extracellular fermentation · wet-hulling · monsooning · koji (mould enzymes) · thermal shock · co-fermentation (new sugars + microbes) · infusion (flavour transfer) · decaf · animal gut.

---

## 3. Full method list (115)

Evidence: **S** read in a source · **K** trade knowledge · **U** your protocol · **?** uncertain. ★ = added in v2 from the guides you sent.

### W — Washed (11)
| ID | Method | Aliases | Defining parameters | Ev. |
|---|---|---|---|---|
| W01 | Washed, dry-tank fermentation | lavado, fully washed, wet process | 6–72 h spontaneous; pH ≈ 5 → done ≤ 2 h | S |
| W02 | Underwater washed | fermentación sumergida | 50–100 cm mass; change water 10–12 h | S/K |
| W03 | Kenyan double fermentation | double washed, 72-hour | ~24 h dry + 18–24 h wet + soak | S/K |
| W04 | Ethiopian washed | — | 36–72 h, raised beds | K |
| W05 | Extended / slow / cold washed | long ferment washed | 36–96 h, ≤ 20 °C | S/K |
| W06 | Mechanical demucilage | eco-pulped, Becolsub, Ecomill, semi-washed (BR) | no fermentation; 0.3–1.0 L/kg cps | S |
| W07 | Fermaestro-controlled washed | — | endpoint = −12 % volume | S |
| W08 | Enzymatic demucilage | pectinase | 2–3 h; processing aid → disclose | S/K |
| W09 | "Hybrid washed" | — | meaning unpublished | ? |
| W10 | Natural-then-washed | washed natural, anaerobic washed | cherry phase → pulp → wash | S/K |
| W11 | Naked bed + fully washed | naked fermentation | 24 h on bed, Sunrise Orange, washed (CryoBloom B) | U |

### N — Natural (11)
| ID | Method | Aliases | Defining parameters | Ev. |
|---|---|---|---|---|
| N01 | Traditional natural | dry process, seco, cereja | 20–30 d drying | S |
| N02 | Raised-bed natural | African-bed | mesh beds | K |
| N03 | Slow-dry / shade natural | secado lento | shade cloth | K |
| N04 | Dark-room natural | cuarto oscuro | 18 °C, dehumidifier, darkness | S |
| N05 | Greenhouse / parabolic natural | marquesina | solar dryer | S |
| N06 | Mechanically dried natural | guardiola, silo | bean ≤ 40 °C | S |
| N07 | Natural aerobic | — | open heap/container pre-ferment | S |
| N08 | Raisin / overripe natural | pasa | overripe cherry (Brix ~24) | K |
| N09 | "Supernatural" | — | unverified | ? |
| N10 | Slow natural (Lacerda) | — | sealed, no water, 144 h (= anaerobic natural) | S |
| N11 ★ | Extended-fermentation natural | 20-day natural | ripe cherry ≥ 20 d, semi-sealed | S (guide) |

### H — Honey / pulped natural (11)
| ID | Method | Mucilage retained | Ev. |
|---|---|---|---|
| H01 | White honey | ~10 % | S |
| H02 | Yellow / golden honey | ~25 % | S |
| H03 | Red honey | ~50 % | S |
| H04 | Black honey | 75–100 % | S |
| H05 | Pink / orange / purple honey | unspecified | S/? |
| H06 | Pulped natural (*cereja descascado*) | ~100 %, Brazil | S |
| H07 | Anaerobic honey | sealed, then honey-dried | S |
| H08 | Honey with pulp/mucilage re-addition | own-coffee addition | K/? |
| H09 | Semi-dry (scientific) | partial | S |
| H10 ★ | Extended-fermentation honey ("Passion honey") | > 80 %, 3–4 wk slow dry | S (guide) |
| H11 ★ | Raisin honey (two-phase) | whole-cherry dry → pulp → second ferment/dry | S (guide) |

### WH — Wet-hulled (1)
WH01 *giling basah*: pulp → overnight ferment → wash → dry to 20–24 % → hull wet → dry to 12–13 %. (1Zpresso says 25–50 % at hulling — conflict; record measured value.)

### AN — Anaerobic / sealed (10)
| ID | Method | Defining parameters | Ev. |
|---|---|---|---|
| A01 | Anaerobic natural | sealed cherry, valve, 24–96 h (Liberica to 720 h) | S |
| A02 | Anaerobic washed | depulped sealed → wash | K |
| A03 | Anaerobic honey | = H07 | S |
| A04 | Anaerobic Slow Dry (ASD) | 120 h tank → shaded beds (Panama) | S |
| A05 | SIAF self-induced | no gas flush; 27–87 h, 16.5–30 °C | S |
| A06 | Double / triple anaerobic | sequential sealed stages | K |
| A07 | River-flow fermentation | bags in river at 12 °C; dark-room 18 °C (Panama) | S |
| A08 | Anaerobic pre-fermentation | short sealed phase first (LPET) | S |
| A09 | Nitrogen / inert-gas flush | N₂/Ar — **not** carbonic | K/S |
| A10 | Bioreactor / agitated | closed, controlled, stirred | S |

### CM — Carbonic maceration (4)
C01 natural CM (Šestić & Merizalde, WBC 2015; 24–120 h; 38 °C/120 h → 85 SCA) · C02 washed CM · C03 CM with one-way valve (tropical) · C04 biodynamic + CM.
**Definition rule:** carbonic maceration = **whole cherry** in CO₂. Depulped + CO₂ = "CO₂-flushed anaerobic".

### T — Temperature (7)
| ID | Method | Which step is cold/hot | Parameters | Ev. |
|---|---|---|---|---|
| T01 | Cold fermentation | the fermentation | 10–13 °C (Monteblanco); 15–20 °C (Panama) | S |
| T02 | **Cold-hold pre-fermentation (CryoBloom)** | **before** fermentation, intact cherry | 9–12 °C + *M. pulcherrima* bioprotection | U |
| T03 | Frozen cherry | pre-fermentation freeze | — | K/S |
| T04 | Thermal shock | hot then cold immersion after sealed stage | no published values (Bermúdez) | S/? |
| T05 | Heated fermentation | fermentation > 30 °C | e.g. CM 38 °C | S |
| T06 | Stepped / dynamic | ≥ 2 setpoints | — | I |
| T07 | Lager-yeast cold fermentation | fermentation, *S. pastorianus* | 8–18 °C, 7 d, 1 g/kg (Cool Blue) | S/U |

Note: the Routes guide's "cryogenic processing" is a label covering T02/T03.

### M — Microbial control (18)
M01 spontaneous · M02 **backslopping / mossto** (own must from previous batch) · M03 SafCoffee Green Origins · M04 Sunrise Orange · M05 Deep Amber (+enzyme) · M06 Cool Blue · M07 LALCAFÉ Oro/Intenso/Cima/BSC · M08 LALCAFÉ Bactifresh (LAB) · M09 non-*Saccharomyces* yeasts (*Torulaspora, Pichia, Hanseniaspora, Meyerozyma, Candida, Yarrowia*) · M10 bioprotection *M. pulcherrima* · M11 LAB inoculation (*L. plantarum, Leuconostoc, Pediococcus*) · M12 **lactic process** (sealed > 80 h, cool; spontaneous or inoculated) · M13 salt-brine lactic (2–3 % salt) · M14 yeast + LAB co-inoculation · M15 terroir-isolated starters · M16 **koji** (*Aspergillus oryzae* on cherries) · M17 other moulds · M18 SCOBY/kombucha (unverified).

### E — Additions (7)
E01 co-fermentation (fruit, cacao pulp, musts) · E02 infused (flavourings, oils, spices) · E03 flavoured roasted · E04 sugar-fed (panela) · E05 own-coffee substrate (cascara, must) · E06 wine/beer yeast or hops · E07 salt/acids.

### P — Physical (8)
P01 ultrasound · P02 ozone/UV sanitation · P03 pressure · P04 agitation · P05 gas control · P06 chill/freeze · P07 hot/cold immersion · P08 ★ "molecular fermentation" (Routes label, no details — unverified).

### G — Drying regimes (8), X — Post-drying (4), Z — Animal (4), L — Labels (3), D — Decaf (8)
G01 patio · G02 raised bed · G03 shaded/slow · G04 solar/parabolic · G05 mechanical · G06 dark room · G07 two-stage · G08 reposo — X01 monsooned · X02 aged · X03 barrel-aged · X04 hermetic — Z01 kopi luwak · Z02 Black Ivory · Z03 jacu · Z04 monkey — L01 Ninety Plus "Makers" · L02 Esmeralda Special · L03 named farm processes — D01 Roselius · D02 MC direct · D03 MC/EA indirect · D04 EA sugarcane · D05 Swiss Water · D06 Mountain Water · D07 supercritical CO₂ · D08 triglyceride.

---

## 4. Same process, different names — synonym clusters

| Cluster | Names that are effectively the same | Record this instead of trusting the name |
|---|---|---|
| S1 Sealed whole cherry | anaerobic natural, slow natural, SIAF natural, ASD (ferment phase), extended natural (semi-sealed) | duration, temperature, valve vs self-induced, drying |
| S2 Carbonic | CM, CO₂ maceration, CO₂-flushed anaerobic (N₂ flush is *not* carbonic) | fruit state, gas, temperature |
| S3 Honey colours | white/yellow/golden/red/black/pink honey, pulped natural, semi-dry, passion honey | **mucilage retained %**, drying speed/shade |
| S4 Double washed | Kenyan, double fermentation, 72-hour | stages, hours, soak |
| S5 Mechanical washed | eco-pulped, Becolsub, Ecomill, demucilaged, semi-washed (BR) | removal mode |
| S6 Natural-then-washed | washed natural, hybrid washed (?), anaerobic washed | cherry-phase O₂ and hours |
| S7 Cold | cold fermentation, cryo, cryo-maceration, cold soak, cryogenic, frozen cherry, Cool Blue | **which step is cold**, setpoint, organism |
| S8 Lactic | lactic process, LAB process, yogurt process, salt-brine | inoculum, salt %, final pH, lactic acid g/L |
| S9 Backslopping | mossto, mosto, lixiviado, previous-batch starter | source batch, ratio |
| S10 Co-ferment / infused | co-ferment, infused, fruit fermentation, flavoured | substances, form, **timing vs green** |
| S11 Slow dry | slow dry, shade dry, dark room, secado lento | days, RH, temperature, light |
| S12 Aged | aged, vintage, monsooned (distinct), barrel (distinct) | time, RH, container |
| S13 Outcome labels | lactic, acetic, malic, winey, tropical, funky | measured acids/ethanol + CVA CATA |

**Your protocols, encoded:**
- **CryoBloom A** — WC cold-hold 9–12 °C + bioprotection → depulp → washed.
- **CryoBloom B** — WC cold-hold → depulp → naked aerobic bed 24 h + Sunrise Orange → 100 % washed → raised bed.
- **CryoBloom C** — WC cold-hold → washed at 1,500 m.
- CryoBloom's variable (pre-fermentative cold hold + bioprotection) is distinct from cold fermentation (T01) and lager-yeast fermentation (T07); keep `cold_hold` as its own step type so it can precede any fermentation.

---

## 5. Data model for the app

```jsonc
ProcessingProtocol { id, name, version, aliases[], family_primary (display only),
  steps: [ProtocolStep], endpoints[], disclosure: Disclosure,
  evidence[], status: draft|trial|validated|retired }

ProtocolStep { seq, step_type,          // see processing_axes.json step_types (23)
  vector: {A, mucilage_retained_pct?, B, gas?, C, setpoints_c[], D, inocula[], E, additions[], F[], G?, H?, I?},
  vessel_requirement: {class, sealable, gas_ports, thermal_control, light_exclusion},  // capabilities, NOT a specific asset
  setpoints: {temp_c_min, temp_c_max, duration_h_min, duration_h_max, pressure_kpa_max?, agitation_rpm?},
  measurements_plan: [{variable_code (V-*), frequency}],
  endpoints: [{variable, operator, value, unit, logic_group}] }

Inoculum { organism, strain?, product?, supplier?, category, dose_value, dose_unit,
  rehydration {water_ratio, temp_c, minutes}?, lot_number, expiry, regulatory_note? }

Addition { substance, category, form, amount, unit, timing: pre_green|post_green, step_seq }

ProtocolRun (per lot) → actual steps, Allocation to real assets (see 07), MeasurementRecords, Deviations
```

**Disclosure block** (per protocol and per lot): public process label · fruit-state sequence · oxygen regimes · min/max ferment temperature · total ferment hours · inoculants (empty = spontaneous) · backslopping · **all additions incl. salt, enzymes, sugar** · exogenous flavour contact · post-green treatments · animal passage · ruleset checks `[{ruleset: BoP-2026|CoE-2026|WCC-2026, eligible: yes|no|unknown, basis, checked_on, by}]` · consumer statement.

**Default rules:**
- Any `exogenous_*` addition → BoP = `no` (2024 exclusion), user confirms current year.
- Any inoculant or bioprotection → BoP = `unknown` until SCAP ruling recorded.
- Any `post_green` addition → WCC = `no`.
- Outcome labels (lactic/malic/acetic) require measured data or "target profile" wording.
- Generic washed fallback values (6–72 h, pH info) **never** apply to a non-generic protocol (test required).

---

## 6. Measurement plan by step (summary — full variable list in `master_data/variables.json`)

| Step | Variables |
|---|---|
| Reception | kg, °Brix + matrix, ripeness mix %, floaters %, cherry core °C, harvest→reception h |
| Cold hold / freeze | chamber °C & RH, cherry core °C series, hold h, bioprotectant dose |
| Pulping / demucilage | gap, damage %, unpulped %, pulp-in-coffee %, mucilage retained %, L/kg cps |
| Fermentation | mass °C & ambient °C, pH, °Brix, TA, Fermaestro volume, headspace CO₂/O₂, pressure, DO, EC, odour |
| Inoculation / addition | product, lot, dose, rehydration °C/min; substance, mass, timing |
| Thermal immersion | water °C in/out, contact time, mass:water |
| Washing | L, rinses, soak h, water °C |
| Drying | moisture % (method), aw + °C, bean °C, air °C/RH, layer cm, turns, light (dark room), days |
| Reposo / storage | days, container, T/RH logger, monthly moisture & aw |
| Grading / cupping | defects, screen, density; CVA descriptive/affective |

---

## 7. Open points for you

1. Confirm BoP/CoE 2026 rulings on SafCoffee inoculation, *M. pulcherrima* bioprotection, enzymes and own-coffee must.
2. Define your own meanings for any house names (e.g. if you use "hybrid washed", "lactic", "malic") so they map to vectors.
3. Thermal shock and mossto have no published parameters — enter your own if you run them.
