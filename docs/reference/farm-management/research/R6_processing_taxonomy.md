# R6 — Coffee Post-Harvest Processing: Exhaustive Method Map, Orthogonal Classification and App Data Model

Prepared 2026-10-02 for the farm-ref package (Néctar Nómada / Boquete). Companion to `R3_postharvest_quality.md` (measurement standards) and `01_DOMAIN_REFERENCE.md` §10.

---

## 0. How to read this report (evidence rules)

**Evidence tags.** Every row or claim carries one of these tags.

| Tag | Meaning |
|---|---|
| **[S#]** | Read directly from a source fetched during this research. The number points to the reference list in §9. |
| **[K]** | Practitioner or domain knowledge that is widely repeated in the trade but was **not verified against a fetched source this session**. Treat as plausible, not authoritative. |
| **[I]** | My inference or synthesis, for example a classification decision or an encoding. |
| **[U]** | Your own protocol, as recorded in your project notes (CryoBloom, Cafelino trials). |
| **[?]** | Uncertain or contested. The name exists but its meaning or attribution could not be pinned down. |

**Research limits this session. Read these before relying on the coverage.**
1. **The general web-search budget was exhausted when this task started.** Discovery ran through site-internal search (Perfect Daily Grind), direct fetches of known producer and supplier pages, and two peer-reviewed reviews already in the package.
2. **Europe PMC's API rate-limited me (HTTP 429) and could not be read.** As a result, peer-reviewed coverage rests mainly on two reviews: Hurtado Cortés et al. 2024 [S1] and Elhalis, Cox & Zhao 2023 [S2].
3. **Pages I could not read:**
   - Wikipedia was blocked by a permission prompt.
   - Coffee Review is disallowed by robots.txt.
   - Barista Magazine returned HTTP 429.
   - The Lallemand LALCAFÉ product pages could not be located.
   - The Best of Panama and Cup of Excellence rules **text** was not reachable. The CoE rules page loaded but contained no additive clause.
   - World Coffee Championships rules are published as PDFs that I did not open.
4. **Not used:** De Bruyn 2017, Schwan & Fleet, and Pereira et al. were not fetched. Their findings appear only where [S1] or [S2] summarise them.
5. **No URL here was constructed.** Every URL in §9 was fetched successfully.

**Count.** The report catalogues **111 entries** with stable IDs, in 14 families plus a separate decaf class:

| Group | Entries |
|---|---|
| Processing methods and variants (W 11, N 10, H 9, WH 1, AN 10, CM 4, T 7, M 18, E 7, X 4, Z 4) | 85 |
| Drying regimes (G) | 8 |
| Physical-intervention techniques (P; several cross-reference T and AN rows) | 7 |
| Proprietary or person-named labels (L) | 3 |
| Decaffeination (D) | 8 |
| **Total** | **111** |

Several of these names are synonyms (see §6), so the number of genuinely distinct mechanisms is much smaller.

---

## 1. Executive frame: three things the literature and trade agree on

1. **Most "new" process names are combinations of a few independent decisions.** The decisions are:
   - how much fruit stays on the seed;
   - how much oxygen the mass gets;
   - temperature;
   - who the microbes are;
   - what is added;
   - physical interventions;
   - how and where it dries;
   - post-drying conditioning.

   [S29] already frames co-ferment discussion along control level, external substrates, pH/temperature management and "microbial library" approaches. [S1] and [S2] organise the science along the same lines: process type × microbial control × time and temperature.
2. **"Lactic", "acetic", "malic", "alcoholic/winey" and "yogurt" are target metabolic or sensory outcomes, not mechanics.**
   - Lactic outcomes come from LAB dominance, which can be reached spontaneously (sealed, cool, long) or by inoculation [S6, S13].
   - [S2] reports that yeast inoculation raises citric, malic, succinic and lactic acids (Bressani 2020, via [S1]).
   - A process called "malic" is therefore a claim about the acid profile, not a distinct apparatus [I].
3. **The regulatory fault line is substrate addition, and the timing of that addition relative to the green-coffee stage.**
   - World Coffee Championships rules evolved from "no additives … between harvest and extraction" (rule quoted in 2021 [S20]) to a 2024 framing in which additives introduced **after the green stage** are prohibited, while co-ferments and infusions **before** green are allowed [S18, S19].
   - Best of Panama 2024 excluded coffees "altered from their natural DNA expression… by using foreign additives" [S4, S18, S19].
   - The exact current (2026) BoP and CoE wording on **inoculated yeast** was **not retrieved** [?]. This is material for your SafCoffee lots. Confirm with SCAP in writing before entering an inoculated lot.

---

## 2. Method catalogue

**Column key.**

| Column | Content |
|---|---|
| **ID** | Stable code for the app |
| **Mechanism / parameters** | Pre-treatment, pulping, mucilage retained, vessel, O₂, temperature, duration, inoculum, additions, endpoints, washing, drying |
| **Sensory** | Typical cup outcome |
| **Risk** | Defects and failure modes |
| **Status** | Competition or disclosure status |
| **Ev.** | Evidence tags |

### 2.1 Family W — Washed (mucilage removed before drying)

| ID | Canonical name · aliases | Origin / popularised by | Mechanism / parameters | Sensory | Risk | Status | Ev. |
|---|---|---|---|---|---|---|---|
| W01 | **Washed, dry-tank fermentation** · *lavado*, fully washed, *beneficio húmedo*, wet process | Standard in Colombia for "100+ years" [S11]; Central America, Africa [S13] | Pulp; ferment the depulped mass with no added water; spontaneous yeasts, LAB and Enterobacteriaceae [S2]. **Duration** 6–72 h [S2], 12–72 h [S1]. **Endpoint** pH ≈ 5 means done within ~2 h; pH ≈ 4 means over-fermentation (Jackels 2005 via [S2]). Field tests: glucose, pH, lactic acid and ethanol strips [S2]. Wash (Cenicafé conventional: 4.17 L/kg dry parchment [S40]). Dry to 10–12 % | Clean, bright, varietal clarity; floral, caramel, fruity [S2, S13] | Over-fermentation ("stinker", vinegar); delay > 2 h past endpoint raises defects [R3/Cenicafé] | Unrestricted | S1, S2, S13, S40 |
| W02 | **Underwater fermentation washed** · *fermentación sumergida* | Common in Central America [K] | As W01 but submerged. Anacafé: mass height 50 cm–1 m; change water every 10–12 h [S40 via R3] | Cleaner and slower than dry tank [K] | Higher water use; wastewater | Unrestricted | S40, K |
| W03 | **Kenyan double fermentation** · double washed, "Kenyan process", "72-hour process" [K] | Kenya, Burundi, Rwanda [S12] | Pulp; ferment up to ~24 h; wash; second ferment or soak up to ~24 h [S13]; often a final soak and grading in channels [K]. The "72 h" label (≈ 24 h dry + 24 h wet + soak) is trade usage [K] | "Exceptionally clean … even more so than standard washed" [S12]; brighter [S13] | Long residence; water use | Unrestricted | S12, S13, K |
| W04 | **Ethiopian washed** · *ye-tațeba* [?] | Ethiopian washing stations [K] | Disk-pulp; dry or underwater ferment (often 36–72 h at highland temperatures); soak; raised African beds [K] | Floral, tea-like, citrus [K] | Station variability | Unrestricted | K |
| W05 | **Extended / slow washed** · long ferment washed, cold washed | Specialty microlots [K] | W01 or W02 run long (36–96 h), often cool (≤ 20 °C). Below 20 °C a washed ferment can run to 36 h; warmer runs risk defects within 24 h [S26] | Increased complexity and sweetness [K] | Acetic and solvent notes if warm | Unrestricted | S26, K |
| W06 | **Mechanical demucilage** · eco-pulped, *desmucilaginado mecánico*, Becolsub, Ecomill®, "semi-washed" (Brazil usage) | Cenicafé (Becolsub, Ecomill) [S40] | Pulp, then remove mucilage mechanically with **no fermentation**. Water: Becolsub 0.7–1.0 L/kg cps; Ecomill 0.4 L/kg [S40]; Becolsub avoids > 90 % of contamination load [S40] | Clean, less fermentation character [K] | Bean damage; lower complexity | Unrestricted | S40 |
| W07 | **Fermaestro®-controlled washed** | Cenicafé (Avance Técnico 431, 2013) [S40] | Truncated-cone device signals the washing point from the rise in mass volume. Trial: no defects, mean 81.6 SCA at 19 ± 0.5 °C [S40] | Defect-free, standard washed | — | Unrestricted | S40 |
| W08 | **Enzymatic demucilage** · pectinase-assisted | Industrial practice [K]; enzyme+yeast blends exist (SafCoffee Deep Amber = *S. cerevisiae* + enzyme blend [S3b]) | Pectinolytic enzymes speed mucilage breakdown; duration cut to hours [K] | Neutral to clean [K] | Disclosure: an exogenous **processing aid** [I] | Additive-adjacent; disclose [I] | S3b, K |
| W09 | **"Hybrid washed"** | Name used in Café Granja La Esperanza product names (e.g., "Sudan Rumé Hybrid Washed") [S36] | **Meaning not published on the page [?].** Trade usage usually means a sealed or anaerobic phase (cherry or depulped) followed by washing [K] | — | — | Name only | S36, ? |
| W10 | **Natural-then-washed** · washed natural, cherry pre-fermentation + wash, "anaerobic washed" when sealed | Specialty microlots [K]; the LPET "anaerobic pre-fermentation" [S11] | Whole cherry ferments (open or sealed) for hours to days, is pulped, then washed and dried like W01 [K/I] | Fruit intensity with washed clarity [K] | Pulping soft cherry | Unrestricted | S11, K |
| W11 | **Naked / bed fermentation then fully washed** · *naked fermentation* | Your CryoBloom arm B [U] | Depulped, no water, aerobic layer on an African bed with frequent turning for 24 h, inoculated with SafCoffee Sunrise Orange, then 100 % washed [U] | Target: tropical fruit [S3d] | Uneven heat in mass | Inoculated: check BoP [?] | U, S3d |

### 2.2 Family N — Natural / dry (whole cherry dried)

| ID | Canonical name · aliases | Origin | Mechanism / parameters | Sensory | Risk | Status | Ev. |
|---|---|---|---|---|---|---|---|
| N01 | **Traditional natural** · dry process, *natural*, *seco*, *cereja* (BR), unwashed | Yemen, Ethiopia, Brazil [S13] | Whole cherry dried on patio or ground, turned regularly, to 10–12 % [S13]. Dry-process fermentation happens during drying: 20–30 d at 10–28 °C. Pichia, Debaryomyces, Bacillus, Aspergillus, Penicillium and Fusarium present [S2] | Fruity, sweet, full body, winey [S13]; buttery, nutty [S2] | Mould, OTA, phenolic and ferment defects | Unrestricted | S2, S13 |
| N02 | **Raised-bed natural** · African-bed natural | Ethiopia, East Africa; now Panama [K] | As N01 on mesh beds (airflow under the mass) [K] | Cleaner fruit [K] | — | Unrestricted | K |
| N03 | **Slow-dry / shade-dried natural** | Panama, Colombia specialty [K] | Shade-cloth or covered beds; slower water loss over weeks [K]; see A04 | Rounder, more integrated [K] | Mould if humidity is high | Unrestricted | K |
| N04 | **Dark-room drying** · *secado en cuarto oscuro* | Panama (Lamastus, Hartmann, Savage, Carmen Estate cited) [S10] | Dried "in total darkness" with a large dehumidifier and fans; "no sunlight, or at high temperatures" [S10]. One Panama example dried at **18 °C** [S21] | Preserves florals [S21] | Energy; slow | Unrestricted | S10, S21 |
| N05 | **Greenhouse / parabolic / solar-dryer natural** · *marquesina*, *secador parabólico* | Colombia (Hacienda El Obraje) [S24] | Overnight rest in bags, then 2 d greenhouse, then ~28 d concentrated heat; mechanical drying as weather backup [S24] | — | Overheating | Unrestricted | S24 |
| N06 | **Mechanically dried natural** · guardiola, silo | Large estates [K] | Rotary dryer: bean ≤ 40 °C, air ≤ 60 °C; static: air ≤ 50 °C [S40 via R3] | Flatter if too hot [K] | Scorching | Unrestricted | S40 |
| N07 | **Natural aerobic** · aerobic natural, *natural aeróbico* | Inmaculada Coffee Farms (Colombia), earlier phase [S11] | Whole cherry fermented in open (aerobic) heaps or containers before drying [S11, K] | Fruit-forward | Acetic notes | Unrestricted | S11 |
| N08 | **Raisin / overripe natural** · *pasa*, *uva pasa*, "raisin process" | Colombia, Central America trade term [K] | Cherries picked or held past ripe (Brix rises to max in overripe: 23.8 °Brix at 224 daf [R3/Cenicafé]); sometimes partly dried on the tree [K] | Jammy, boozy [K] | Ferment and phenolic defects | Unrestricted | K, R3 |
| N09 | **"Supernatural"** | Marketing term [?] | **Could not be verified.** The only hit was Steiner's "supernatural energy" in a biodynamic context [S32] | — | — | — | ? |
| N10 | **Slow natural** (J. Lacerda) | Sítio Santa Rita, Brazil; reported 2016 [S15] | Cherries in **airtight containers, no water, no oxygen, 144 h**, then dried. Control 80 pts vs 90 pts; lifted 900–1,100 m coffees [S15]. *Mechanically this is anaerobic natural (A01) [I]* | Aroma, flavour, acidity ↑ [S15] | — | Unrestricted | S15 |

### 2.3 Family H — Honey and pulped natural (skin off, mucilage dried on)

| ID | Name · aliases | Origin | Mechanism / parameters | Sensory | Ev. |
|---|---|---|---|---|---|
| H01 | **White honey** | Costa Rica, late 2000s, after 2008 water restrictions [S5, S13] | ~10 % mucilage retained; "akin to a washed" [S5] | Clean, light sweetness | S5 |
| H02 | **Yellow honey** (also "golden") | Costa Rica | ~25 % mucilage [S5]; often faster, sunnier drying [K] | Lighter than red | S5, K |
| H03 | **Red honey** | Costa Rica | ~50 % [S5]; slower or shaded drying [K] | Medium sweetness and body | S5 |
| H04 | **Black honey** | Costa Rica | 75–100 %, "most similar to natural" [S5]; slowest drying, often covered [K] | Heavy, fruit | S5 |
| H05 | **Pink / orange / golden / purple honey** | Emerging [S5] | % and drying "remain unspecified" [S5] | — | S5, ? |
| H06 | **Pulped natural** · *cereja descascado/descascada* ("peeled cherry"), semi-dry (Brazil), CD | Brazil, ~1996 [S14] | Remove skin only; dry with almost all mucilage; suits low humidity [S14]. Semi-dry microbiota per [S2]: Pichia anomala, Rhodotorula, *S. bayanus*, *T. delbrueckii*, LAB; 10–15 d [S2] | Natural body with washed sweetness and acidity [S14] | S2, S14 |
| H07 | **Anaerobic honey** | Specialty [S5] | Depulped mass sealed before honey drying [S5, K] | "Dial[s] down the over-funk" [S5] | S5 |
| H08 | **Honey with pulp or mucilage re-addition** | [?] trade | Pulp or mucilage reintroduced to depulped beans before drying or fermentation [K/I]. Own-coffee substrate; see axis E | — | K, ? |
| H09 | **Semi-dry process** (scientific category) | Literature term [S1, S2] | Mechanical removal of exocarp and part of the mucilage; 16–352 h fermentation phases reported, ambient 14.6–28.2 °C or 28 °C [S1] | Variable | S1, S2 |

Standardisation warning: one producer's "red" may differ significantly from another's [S5]. **For the app, store `mucilage_retained_pct` (measured or estimated) and drying regime. Treat the colour as a label only [I].**

### 2.4 Family WH — Wet-hulled

| ID | Name · aliases | Origin | Mechanism / parameters | Sensory | Risk | Ev. |
|---|---|---|---|---|---|---|
| WH01 | **Wet-hulled** · *giling basah* | Indonesia (Sumatra, Sulawesi) [S8] | Pulp; ferment overnight in tanks or rice bags; wash; sun-dry in parchment 2–3 d to **20–24 % moisture**; hull wet; dry green to **12–13 %** [S8] | "Syrupy body, … low acidity" [S8] | *Kuku kambing* ("goat's nail") split ends; moisture damage [S8] | S8 |

### 2.5 Family AN — Anaerobic / sealed-vessel

| ID | Name · aliases | Origin | Mechanism / parameters | Sensory | Risk | Ev. |
|---|---|---|---|---|---|---|
| A01 | **Anaerobic natural** · sealed-cherry fermentation | Spread c. 2015 onward [K] | Whole cherry in sealed tank, bag or barrel, often with a one-way valve; days; then natural drying [S13, K]. Durations "up to 96 h" in general use [S13]; Liberica 120 h (bright) to 360–720 h (winey) at 25 °C [S27] | Fruitier, more body [S13] | Alcohol, solvent, "over-funk" | S13, S27 |
| A02 | **Anaerobic washed** | [K] | Depulped (with mucilage) sealed, then washed and dried [K] | Fruit plus clarity | Acetic if leaks | K |
| A03 | **Anaerobic honey** | — | See H07 | — | — | S5 |
| A04 | **Anaerobic Slow Dry (ASD)** | Panama [S10] | "Fermented in a tank for **120 hours**, and then dried on raised, shaded beds" [S10] | Complex, winey [K] | Long exposure | S10 |
| A05 | **SIAF — self-induced anaerobic fermentation** | Brazilian research line [S1] | Sealed vessel where microbial CO₂ displaces O₂ (no gas flush); example 87 h at ~30 °C, natural, SCA 80+ [S1]; 27–87 h at 16.5–24 °C reported [S1] | Specialty, complex [S1] | — | S1 |
| A06 | **Double / triple anaerobic** · two-stage anaerobic | Colombian experimental producers [K] | Sequential sealed stages, e.g., cherry anaerobic, then depulped anaerobic, often with different temperatures or added must [K] | Intense | Cumulative over-ferment | K |
| A07 | **River-flow fermentation** | Panama [S21] | Fresh cherries sealed in silage bags submerged in running river water, held at **12 °C**; dark-room drying at 18 °C [S21] | "Fruitier … instead of wine-like" [S21] | Bag integrity | S21 |
| A08 | **Anaerobic pre-fermentation** | La Palma y El Tucán, an accidental discovery [S11] | Short sealed phase before the main process [S11] | — | — | S11 |
| A09 | **Inert-gas / nitrogen flush** | [K] | Headspace purged with N₂ or Ar (not CO₂), so it is not "carbonic" [I] | — | — | K |
| A10 | **Bioreactor / agitated closed fermentation** | Campotech helical-agitator bioreactors (1,250 L, heating and cooling); Palinialves rotating cylinders (stainless, 10,000 L, rpm-controlled) [S1] | Closed, temperature-controlled, agitated [S1]; *L. plantarum* in a 30 °C stirred-tank bioreactor cut fermentation from 24 h to 10 h (de Carvalho Neto 2018) [S1, S2] | 91.5 vs 85.5 SCA (inoculated vs spontaneous, that study) [S1] | Capex; "innovations lack sufficient scientific evidence" [S1] | S1, S2 |

### 2.6 Family CM — Carbonic maceration

| ID | Name · aliases | Origin | Mechanism / parameters | Sensory | Ev. |
|---|---|---|---|---|---|
| C01 | **Carbonic maceration (natural)** · CM, *maceración carbónica* | Wine: Beaujolais, 1930s; coffee: **Saša Šestić with Camilo Merizalde**, WBC 2015 [S22, S7, S20] | CO₂ flushed into sealed, airtight tanks of cherries to remove residual oxygen [S10]; dried on raised beds [S22]. Research: 24–120 h; **38 °C/120 h → 85 SCA** [S1] | Bright, winey, layered [S10, S22] | S1, S10, S22 |
| C02 | **Washed carbonic maceration** | Experimental after 2015 [S39] | CM phase, then pulp and wash [S39, K] | Fruit with clarity | S39 |
| C03 | **CM with one-way valve, tropical** | Karana (Indonesia) [S23] | CO₂ flush, airtight vessel with a one-way valve, temperature tightly controlled [S23] | — ; vinegary risk in humid tropics [S23] | S23 |
| C04 | **Biodynamic + CM** | Panama [S10] | CM on biodynamically farmed cherries (agronomy axis, not processing) [S10, S32] | — | S10, S32 |

**Definitional conflict.** [S10] describes CM on whole cherries. [S22] says "de-pulp cherries, seal in tanks, flush with CO₂". In winemaking, carbonic maceration means **intact** berries (intracellular fermentation) [K]. **Recommendation [I]:** reserve "carbonic maceration" for whole-cherry CO₂ saturation, and encode depulped CO₂-flushed tanks as "CO₂-flushed anaerobic" with `pulp_state = depulped`.

### 2.7 Family T — Temperature-defined processes

| ID | Name · aliases | Origin | Mechanism / parameters | Sensory | Ev. |
|---|---|---|---|---|---|
| T01 | **Cold fermentation** · *fermentación en frío* | Finca Monteblanco (Huila) [S24]; Panama producers [S10] | Monteblanco: 10–13 °C; avoid > 25–30 °C, which produces undesirable alcohols [S24]. Panama: 15–20 °C "for sweeter lactic fermentation" [S10] | Sweet, clean, lactic | S10, S24 |
| T02 | **Cold-hold pre-fermentation** · cryo-maceration, cold soak (wine analogue), **CryoBloom** | Your protocol [U]; the wine cold-soak analogue [K] | Intact cherries treated with *Metschnikowia pulcherrima* (Fermentis SafŒno™ Bioprotect MP-72) and held at **9–12 °C** before fermentation; arms A/B/C then differ by fermentation approach and site [U] | Target: aromatic preservation | U |
| T03 | **Frozen cherry** · cryo, ultra-cold | Experimental [K] | Freezing whole cherries ruptures cells and releases sugars on thaw [K] | — | K, ? |
| T04 | **Thermal shock** | **Diego Bermúdez, Finca El Paraíso (Cauca, Colombia)**: "well-known for creating the thermal shock process" [S17, S18] | Defined as "controlling the temperature of different fermentations to influence the final cup profile" [S11]; "two-stage thermal shock fermentation" on Pink Bourbon, used at the 2023 WBC by Isaiah Sheese [S17]. Commonly described as hot-water immersion then cold-water immersion after an anaerobic stage [K/?]. **No published temperatures or times found** | Elevated, clean fruit and floral [S17] | S11, S17, ? |
| T05 | **Heated / warm fermentation** | Research [S1] | E.g., CM at 38 °C [S1]; "hydro" or hot fermentation labels unverified [?] | — | S1, ? |
| T06 | **Stepped / dynamic temperature** · temperature ramp | [I] | Program with ≥ 2 temperature setpoints. T04 is a special case [I] | — | I |
| T07 | **Lager-yeast cold fermentation** | Fermentis SafCoffee Cool Blue (*S. pastorianus*) [S3c]; your Cafelino Cool Blue lots (e.g., PE-86) [U] | 8–18 °C, 7 days below 18 °C, 1 g/kg [S3c] | Clean, sweet, bright; vanilla, peanut [S3c] | S3c, U |

### 2.8 Family M — Microbial control (inoculation and culture types)

| ID | Name · aliases | Organism / product | Parameters (as published) | Claimed outcome | Ev. |
|---|---|---|---|---|---|
| M01 | **Spontaneous** (default) | Native microbiota | — | Terroir-variable | S2 |
| M02 | **Backslopping / "mossto" / "mosto"** · must re-use, *mosto*, *lixiviado* | Liquid or must from a previous batch of fermented cherries or pulp used to seed the next batch [K]. Attribution to specific Colombian producers is common but **not verified here** [?] | Unpublished [?] | Intense fruit [K] | K, ? |
| M03 | **SafCoffee Green Origins** | *S. cerevisiae* (Fermentis) | 1 g/kg cherry or depulped; 20–30 °C; 60 h at > 18 °C, 24–48 h at > 25 °C; rehydrate 10× water at 15–35 °C for 15–30 min [S3a] | Caramel, chocolate, varietal [S3a] | S3a |
| M04 | **SafCoffee Sunrise Orange** | *S. cerevisiae* | 1 g/kg; 20–30 °C; 60 h / 24–48 h [S3d] | Tropical fruit, passion fruit, citrus [S3d] | S3d |
| M05 | **SafCoffee Deep Amber** | *S. cerevisiae* + enzyme blend | 2 g/kg; 8–30 °C; ≤ 7 d at 8–15 °C, 60 h at 15–25 °C, 24–48 h above 25 °C; > 5×10⁹ cfu/g [S3b] | Floral, spicy, fruity; sweetness and mouthfeel [S3b] | S3b |
| M06 | **SafCoffee Cool Blue** | *S. pastorianus* | See T07 [S3c] | — | S3c |
| M07 | **LALCAFÉ Oro / Intenso / Cima / BSC** (Lallemand) | *S. cerevisiae* strains [S26] | Not retrieved | Intenso red fruit; Oro "exotic"; BSC fast mucilage breakdown for clean cups; Cima mentioned in studies [S25] | S25, S26 |
| M08 | **LALCAFÉ Bactifresh** | LAB [S25] | Not retrieved | Brightness, clarity [S25] | S25 |
| M09 | **Non-*Saccharomyces* yeast inoculation** | *Torulaspora delbrueckii* CCMA 0684; *Candida parapsilosis* CCMA 0544; *Meyerozyma caribbica* CCMA 0198; *Pichia fermentans* YC5.2; *Hanseniaspora uvarum*; *Pichia kudriavzevii*; *Yarrowia lipolytica* [S1, S2] | 16 h (Bressani 2020); 24 h (Pregolini 2021) [S1] | Esters (ethyl and isoamyl acetate); *Y. lipolytica* ↑ phenols [S1, S2] | S1, S2 |
| M10 | **Bioprotection yeast** | *Metschnikowia pulcherrima* (SafŒno MP-72) [U] | Applied to intact cherries before cold hold [U]. Your notes record a US GRAS notice covering fresh coffee cherry up to 1 g/kg [U], **not re-verified here** | Microbial stabilisation | U |
| M11 | **LAB inoculation** | *Lactobacillus/Lactiplantibacillus plantarum* (LPBR01, CCMA 1065); *Leuconostoc mesenteroides* CCMA 1105; *Pediococcus acidilactici* LPBC161 [S1] | 30 °C bioreactor 10 h [S1] | Fruity esters; creamy [S1, S2] | S1, S2 |
| M12 | **Lactic process** · *proceso láctico* | La Palma y El Tucán; recognised after Jooyeon Jeon's 2019 WBC win with their Sidra [S6] | Sealed tanks, **> 80 h**, lowered temperature; LAB (e.g., *L. mesenteroides*) multiply naturally, or are inoculated; up to 90 % of glucose and fructose consumed; pH falls [S6]. [S13] instead defines it as "adding lactic acid cultures" | Creamy, buttery, yogurt, floral, fruity [S6, S13] | S6, S13 |
| M13 | **Salt-brine lactic** | [S6] | 2–3 % salt brine favours halotolerant LAB [S6] | — ; salt is an exogenous additive [I] | S6 |
| M14 | **Yeast + LAB co-inoculation** | *P. fermentans* + *P. acidilactici* [S1]; Frinsa Estate LAB isolated from civets + yeast, anaerobic bags [S23] | 24 h [S1] | Sweet spice, fruit candy [S23] | S1, S23 |
| M15 | **Terroir-isolated (indigenous) starters** | So So Good (Mikael Jasin), Indonesia; isolates analysed at Bandung Institute of Technology [S23] | pH-monitored [S23] | Replicable regional profiles | S23 |
| M16 | **Koji fermentation** | *Aspergillus oryzae*. Kaapo Paavolainen, Christopher Feran, Elias Bayter Montenegro (El Vergel Estate, Tolima), spores from Koichi Higuchi (Higuchi Matsunosuke Shoten) [S7, S19] | Spores on **cherries** during fermentation in shade. Koji applied to green coffee gave "undesirable umami" and failed [S7]. Times and temperatures unpublished | Body, aftertaste, refined acidity, +1–2 pts [S7] | S7 |
| M17 | **Other moulds** | *Rhizopus oligosporus*, *Aspergillus niger* (research) [S2] | — | Organic acids, pyrazines, nutty [S2] | S2 |
| M18 | **SCOBY / kombucha / water-kefir cultures** | [K/?] | Not found in fetched sources | — | ? |

### 2.9 Family E — Substrate additions (co-fermentation and infusion)

| ID | Name · aliases | Definition | Typical substrates | Status | Ev. |
|---|---|---|---|---|---|
| E01 | **Co-fermentation** · co-ferment, *cofermentado* | "External organic substrates (such as fresh fruit pulp, musts, or cacao pulp) are added during fermentation" [S4]. Adds both new microbes **and** new sugars [S4] | Passion fruit, cacao pulp [S4]; mandarin skin, peach, fruit ferments, musts [S19] | WCC 2024: allowed if added before green stage [S18, S19]. BoP 2024: excluded [S4, S18] | S4, S18, S19 |
| E02 | **Infused** | "Flavouring agents or additives … concentrated fruit powders or extracts, spices, essential oils, or synthetic flavourings" [S4] | Cinnamon (WBC 2018 Amsterdam, Boston Brewers Cup 2019), tartaric acid + cinnamon sticks, tropical fruit flavouring, essential oils (rose) [S20] | Ecuador La Loja 2019 disqualification after testing [S20]; BoP exclusion [S18] | S4, S20 |
| E03 | **Flavoured** (roasted) | Chemical additives sprayed on roasted beans [S18] | — | Out of green processing scope | S18 |
| E04 | **Sugar-fed ferment** | Panela, molasses or sugar added [K] | — | Exogenous; disclose [I] | K |
| E05 | **Own-coffee substrate re-addition** | Cascara, pulp, mucilage, must from the same farm's coffee [K/I] | — | Not "foreign" in species, but still an addition. Ruling unclear [?] | K, ? |
| E06 | **Wine / beer yeast or hops co-ferment** | [K] | — | Hops = exogenous; yeast = M class [I] | K |
| E07 | **Salt / acids** | Brine (M13); tartaric acid [S6, S20] | — | Exogenous | S6, S20 |

Industry signals:
- Calls for co-ferment as **its own category** (Luis Sánchez) [S28].
- FNC adopted the SCA CVA, which allows scoring co-ferments [S19].
- Detection: gas chromatography, and cupping **green** coffee for jasmine, rose or cinnamon before roasting [S20].
- Persistent transparency problem [S30, S31].

### 2.10 Family P — Physical and technological interventions

| ID | Name | Notes | Ev. |
|---|---|---|---|
| P01 | Ultrasound-assisted fermentation | Research topic; not found in fetched sources | K, ? |
| P02 | Ozone / UV cherry sanitation | Pre-treatment sanitation; not found in fetched sources | K, ? |
| P03 | High pressure / pressurised tanks | One-way valves build mild overpressure [S23]; high-pressure processing not found | S23, K |
| P04 | Agitation / rotation | Rotating cylinders, helical agitators [S1] | S1 |
| P05 | Gas regime control (CO₂ / N₂) | See C01, A09 | S10 |
| P06 | Chilling or freezing | See T02, T03 | U, K |
| P07 | Hot or cold water immersion | See T04 | S17, ? |

### 2.11 Family G — Drying regimes (an axis, also sold as named processes)

| ID | Regime | Parameters | Ev. |
|---|---|---|---|
| G01 | Patio (concrete, brick, tarp) | 3–5 cm layer (Codex); ≤ 7 cm natural (Anacafé); turn constantly [R3] | S40/R3 |
| G02 | Raised / African bed | Mesh beds, airflow [K]; used in ASD [S10] | S10 |
| G03 | Shade or covered bed ("slow dry") | Shaded raised beds [S10] | S10 |
| G04 | Greenhouse / parabolic / solar dryer | El Obraje [S24] | S24 |
| G05 | Mechanical (guardiola, silo) | Bean ≤ 40 °C; air ≤ 50 °C static, ≤ 60 °C rotary [R3] | R3 |
| G06 | Dark room / dehumidified | 18 °C, dehumidifier and fans [S10, S21] | S10, S21 |
| G07 | Two-stage (wet-hulled) | 20–24 % moisture, then hull, then 12–13 % [S8] | S8 |
| G08 | Reposo / stabilisation | ≥ 3–4 weeks (Anacafé) [R3]; 1–4 months (La Esperanza) [S36] | R3, S36 |

### 2.12 Family X — Post-drying conditioning

| ID | Name · aliases | Parameters | Sensory | Ev. |
|---|---|---|---|---|
| X01 | **Monsooned Malabar** · monsooning | India (Malabar); 3–4 months of exposure to monsoon winds and rain, rotated [S9] | Earthy, spicy, heavy body [S9] | S9 |
| X02 | **Aged green / vintage** · Sumatran aged | Years possible [S9] | Thick mouthfeel, almost no acidity [S9] | S9 |
| X03 | **Barrel-aged green** (whiskey, wine, rum) | 2 weeks to 1 month; barrel-wood moisture drives the timeline [S9] | Dark chocolate, cherry, port, oak, jam [S9] | S9 |
| X04 | Hermetic / vacuum storage | PICS bags beat jute over 7 months [R3] | Preserves | R3 |

Distinguish "aged" from "old": old coffee is baggy, papery, woody [S9]. **Barrel aging happens at the green stage, so under WCC's post-green rule it may count as an additive after green [I/?].**

### 2.13 Family Z — Animal passage

| ID | Name | Facts | Status | Ev. |
|---|---|---|---|---|
| Z01 | **Kopi luwak** (civet) | Asian palm civet (*luwak*); strongly discouraged in specialty on welfare grounds and authenticity doubts [S33] | Welfare controversy | S33 |
| Z02 | **Black Ivory** (elephant) | Surin, Thailand; elephants eat ripe Arabica cherries (beans grown in Chiang Rai); beans collected from dung ~1 day later; a few hundred kg per year [S34] | Niche | S34 |
| Z03 | **Jacu bird coffee** | Brazil (Fazenda Camocim is the usual attribution) [K]; [S32] names Camocim only as biodynamic | — | K |
| Z04 | **Monkey-spit / monkey-parchment** | India and Taiwan accounts [K/?] | — | ? |

Encode these as axis I = animal passage. Each acts as an uncontrolled whole-cherry, gut-microbiota fermentation followed by washing and drying [I].

### 2.14 Proprietary or person-named labels (not mechanisms)

| ID | Label | What it is | Ev. |
|---|---|---|---|
| L01 | Ninety Plus "Maker" lots (Perci, Nekisse, Silvia, Kemgin, Juliette, Hachira, Lotus) | Lots named after champion baristas who picked and processed experimental batches with "superpickers" at Ninety Plus Ethiopia, 2016 [S37] | S37 |
| L02 | Esmeralda Special | High-elevation Geisha microlot line (1,600–1,800 m) with refined fermentation and drying; parameters not published [S35] | S35 |
| L03 | Finca Deborah, Lamastus, Elida named processes | Home pages describe no named process [?] | ? |

### 2.15 Decaffeination (separate post-green class)

| ID | Process | Facts | Ev. |
|---|---|---|---|
| D01 | Roselius | Ludwig Roselius, 1903; brine steam + benzene (abandoned) [S16] | S16 |
| D02 | Methylene chloride, direct | Steam, then solvent rinse (~10 h) [S16] | S16 |
| D03 | Methylene chloride / EA, indirect | Hot-water soak, then solvent on the water [S16] | S16 |
| D04 | Ethyl acetate ("sugarcane", "natural EA") | Descafecol (Colombia) a prominent pioneer; EA from sugarcane + spring water, gentle heat [S16] | S16 |
| D05 | Swiss Water® | Green coffee extract + carbon filtration; chemical-free; Delta, BC [S16, S41] | S16, S41 |
| D06 | Mountain Water | Descamex (Mexico), 1987; water + filtration [S16] | S16 |
| D07 | Supercritical CO₂ | 300+ atm [S16] | S16 |
| D08 | Triglyceride (coffee-oil) | Historic [K] | K |

Thresholds per [S16]: ≥ 97 % removal (US), 99.9 % (EU). EU and US residual-solvent limits were not verified this session.

---

## 3. Orthogonal classification scheme

Each protocol is a vector of values on **nine primary axes** (A–I), plus two derived descriptors (J, K) that are **not** classification axes.

| Axis | Question | Allowed values (enum) |
|---|---|---|
| **A. Fruit state** (what is removed before fermentation and drying) | How much fruit is on the seed at each stage? | `whole_cherry` · `depulped_mucilage_full` (pulped natural, black honey) · `depulped_mucilage_partial` (with `mucilage_pct`) · `depulped_mucilage_removed_fermentation` · `depulped_mucilage_removed_mechanical` · `depulped_mucilage_removed_enzymatic` · `parchment_hulled_wet` · `green` (post-milling stages) |
| **B. Oxygen regime** | — | `aerobic_open` · `submerged` (water-limited O₂) · `sealed_self_induced` (SIAF) · `sealed_valve` · `co2_flushed` · `inert_gas_flushed` · `vacuum` |
| **C. Temperature regime** | — | `ambient_uncontrolled` · `controlled_constant` (setpoint °C) · `cold` (< 15 °C) · `cold_hold_prefermentation` · `stepped` (list of setpoints) · `thermal_shock` (hot/cold immersions) · `heated` (> 30 °C) · `frozen` |
| **D. Microbial control** | — | `spontaneous` · `backslopped` (own must/mosto) · `inoculated_yeast_sacch` · `inoculated_yeast_non_sacch` · `inoculated_lab` · `inoculated_mold` · `inoculated_mixed` · `bioprotection` · `indigenous_isolate` · `animal_gut` |
| **E. Substrate additions** | — | `none` · `own_coffee_derivative` (must, cascara, pulp, mucilage) · `processing_aid` (enzymes, salt, acid) · `exogenous_natural` (fruit, cacao pulp, spices, hops, sugars) · `exogenous_flavouring` (extracts, essential oils, synthetic). Each addition also carries `timing: pre_green / post_green` |
| **F. Physical interventions** | — | `none` · `chilling` · `freezing` · `hot_immersion` · `cold_immersion` · `agitation` · `pressure` · `ultrasound` · `ozone_uv` |
| **G. Drying regime** | — | `patio` · `raised_bed` · `shaded_bed` · `greenhouse_solar` · `mechanical` · `dark_room_dehumidified` · `two_stage_wet_hull` · combos with % time |
| **H. Post-drying conditioning** | — | `reposo` · `hermetic_storage` · `aged_green` · `monsooned` · `barrel_aged` (barrel type) · `decaffeinated` (D-class) |
| **I. Biological passage** | — | `none` · `civet` · `elephant` · `bird_jacu` · `monkey` |
| *J. Duration (derived)* | Total and per-stage hours | numeric |
| *K. Target outcome (descriptor)* | Not an axis: what the producer aims for | `lactic` · `acetic` · `malic` · `alcoholic/winey` · `ester/fruit` · `clean` |

**Why these are orthogonal [I].** Any value on one axis can, in principle, combine with any value on another. A sealed whole-cherry vessel (A=`whole_cherry`, B=`sealed_valve`) can run at any temperature (C), with or without inoculum (D), with or without fruit (E), then dry any way (G). Some combinations are practically rare. For example, `submerged` × `whole_cherry` exists as river-flow fermentation, but only inside sealed bags.

**Stage-wise encoding.** A and B often change **within** a protocol: cherry sealed, then depulped, then washed. The axis vector is therefore attached to **each step**, and the protocol summary is the ordered sequence of step vectors. This is what turns "double anaerobic", "natural-then-washed" and CryoBloom from ad-hoc names into exact descriptions.

---

## 4. Encoding of named methods as axis combinations

Abbreviations: WC = whole cherry, DP-full / DP-part / DP-rem = depulped with full, partial or removed mucilage. Arrows separate steps.

| Method | A | B | C | D | E | F | G | H/I |
|---|---|---|---|---|---|---|---|---|
| W01 Washed dry-tank | DP-full → DP-rem(ferment) | aerobic_open | ambient | spontaneous | none | — | patio/raised | reposo |
| W02 Underwater washed | DP-full → DP-rem | submerged | ambient | spontaneous | none | — | any | reposo |
| W03 Kenyan double | DP-full → DP-rem → soak | aerobic_open → submerged | ambient | spontaneous | none | — | raised_bed | reposo |
| W06 Eco-pulped / Becolsub | DP-rem(mechanical) | — | — | none | none | — | any | — |
| W08 Enzymatic | DP-rem(enzymatic) | aerobic_open | ambient | spontaneous | processing_aid | — | any | — |
| W10 Natural-then-washed | WC → DP-rem | aerobic or sealed → aerobic | ambient | spontaneous | none | — | any | — |
| N01 Natural | WC | aerobic_open (drying) | ambient | spontaneous | none | — | patio | — |
| N04 Dark-room natural | WC | aerobic | cool (18 °C dry) | spontaneous | none | — | dark_room | — |
| N10 Slow natural (Lacerda) | WC | sealed_self_induced (144 h) | ambient | spontaneous | none | — | patio/bed | — |
| H01–H04 Honey | DP-part(10/25/50/75–100 %) | aerobic_open | ambient | spontaneous | none | — | raised / shaded | — |
| H06 Pulped natural | DP-full | aerobic | ambient | spontaneous | none | — | patio | — |
| WH01 Wet-hulled | DP-full → DP-rem → parchment_hulled_wet | aerobic | ambient | spontaneous | none | — | two_stage_wet_hull | — |
| A01 Anaerobic natural | WC | sealed_valve | ambient/controlled | spontaneous | none | — | any | — |
| A04 ASD | WC (assumed [?]) | sealed (120 h) | ambient | spontaneous | none | — | shaded_bed | — |
| A05 SIAF | WC or DP | sealed_self_induced | ~30 °C | spontaneous | none | — | any | — |
| A07 River-flow | WC | sealed_valve | controlled 12 °C (river) | spontaneous | none | cold_immersion | dark_room 18 °C | — |
| C01 Carbonic maceration | WC | co2_flushed | controlled | spontaneous | none | — | raised_bed | — |
| T01 Cold fermentation | DP or WC | sealed/aerobic | cold 10–13 °C | spontaneous or inoculated | none | chilling | any | — |
| T04 Thermal shock | WC/DP (multi-stage) | sealed → immersion | thermal_shock | often inoculated or backslopped [K] | often own-must [K] | hot_immersion + cold_immersion | any | — |
| M02 Mossto | DP or WC | sealed | any | backslopped | own_coffee_derivative | — | any | — |
| M12 Lactic (LPET-style) | WC or DP | sealed | cool | spontaneous (LAB-dominant) or inoculated_lab | none | — | any | — |
| M13 Salt-brine lactic | DP | submerged | cool | spontaneous LAB | processing_aid (salt) | — | any | — |
| M16 Koji | WC | aerobic | controlled | inoculated_mold | none | — | any | — |
| E01 Fruit co-ferment | DP or WC | sealed | any | spontaneous + fruit microbes | exogenous_natural (pre_green) | — | any | — |
| E02 Infused | any | any | any | any | exogenous_flavouring | — | any | — |
| X01 Monsooned Malabar | (green/dried cherry) | — | humid ambient | spontaneous | none | — | — | monsooned |
| X03 Barrel-aged | green | barrel | ambient | — | barrel wood (post_green) | — | — | barrel_aged |
| Z01 Kopi luwak | WC | gut | body temp | animal_gut | — | — | any | civet |
| **CryoBloom A** [U] | WC (cold hold) → DP-rem | ? (hold) → aerobic | cold_hold 9–12 °C → ambient | bioprotection (M. pulcherrima) | none | chilling | per site | reposo |
| **CryoBloom B** [U] | WC (cold hold) → DP-full on African bed 24 h → DP-rem (100 % wash) | ? → aerobic_open (naked) | cold_hold → ambient | bioprotection → inoculated_yeast_sacch (Sunrise Orange) | none | chilling; turning | raised_bed | — |
| **CryoBloom C** [U] | WC (cold hold) → washed | ? → aerobic | cold_hold → ambient (1,500 m) | bioprotection | none | chilling | — | — |
| **Cafelino Cool Blue** [U, S3c] | WC or DP | (per lot) | cold 8–18 °C | inoculated_yeast_sacch (*S. pastorianus*) | none | chilling | — | — |

**Note for your protocols [I].** CryoBloom's own variable is the pre-fermentative cold hold with bioprotection (C = `cold_hold_prefermentation`, D = `bioprotection`). It is distinct from T01 cold fermentation and from T07 lager-yeast fermentation. All three are "cold" processes, but they act at different steps and use different organisms. Keep them as separate `step_type`s so a cold hold can be combined with any downstream fermentation.

---

## 5. Families: what is genuinely distinct

Grouping by the **dominant distinguishing axis** [I]:

1. **Fruit-state families (axis A).** Washed (W), Honey / Pulped natural (H), Natural (N), Wet-hulled (WH). These are the only "classic" process classes, and they map one-to-one to A.
2. **Oxygen-regime modifiers (axis B).** Anaerobic (A01–A09) and carbonic maceration (C01–C03). These **modify** a fruit-state family ("anaerobic natural", "anaerobic washed"). They are not a parallel fourth class.
3. **Temperature modifiers (axis C/F).** Cold, cold-hold, frozen, thermal shock, heated.
4. **Microbial-control modifiers (axis D).** Spontaneous, backslopped, inoculated (yeast, LAB, mould, mixed), bioprotection, animal gut.
5. **Addition class (axis E).** Co-fermented, infused, processing-aid. This is the **regulatory** class.
6. **Drying regimes (axis G).** Slow dry, dark room, greenhouse and so on. These are often marketed as process names.
7. **Post-drying conditioning (axis H).** Monsooned, aged, barrel-aged, decaf.
8. **Biological passage (axis I).** Animal-processed.

**Genuinely distinct mechanisms**, meaning different physics or biology:
- mucilage removal by fermentation vs by mechanics vs by enzymes;
- whole-cherry intracellular (carbonic) vs extracellular fermentation;
- wet-hulling (hulling at 20–24 % moisture);
- monsooning (green rehydration);
- koji (a mould with amylolytic and proteolytic enzymes, not yeast or LAB);
- thermal shock (a deliberate thermal gradient across tissue);
- co-fermentation (new sugars plus new microbes);
- infusion (flavour transfer without fermentation);
- decaffeination;
- animal gut passage.

---

## 6. Synonym and marketing clusters

| Cluster | Names that are effectively the same process | Distinguishing parameter to record instead |
|---|---|---|
| **S1 Sealed whole-cherry ferment** | anaerobic natural, sealed-cherry fermentation, "slow natural" (Lacerda), SIAF-natural, "anaerobic slow dry" (fermentation phase), barrel-fermented natural | duration, temperature, valve or self-induced, drying regime |
| **S2 Carbonic family** | carbonic maceration, CM, CO₂-flushed anaerobic, "CO₂ maceration" | `pulp_state` (true CM = whole cherry), gas, temperature |
| **S3 Honey colours** | white/yellow/golden/red/black/pink/purple honey, pulped natural, *cereja descascado*, semi-dry (BR), "miel" | `mucilage_retained_pct`, drying shade and speed |
| **S4 Double washed** | Kenyan process, double fermentation, double washed, "72-hour" | stages and hours, soak |
| **S5 Mechanical washed** | eco-pulped, semi-washed (BR), demucilaged, Becolsub, Ecomill, "fully washed" (when pulped and demucilaged) | `mucilage_removal_mode` |
| **S6 Natural-then-washed** | washed natural, hybrid washed [?], anaerobic washed, "cherry pre-fermentation, washed" | cherry phase O₂ and duration |
| **S7 Cold** | cold fermentation, cryo-fermentation, cryo-maceration, cold soak, "cryo" | **which step is cold** (pre-hold vs ferment vs dry), setpoint |
| **S8 Lactic** | lactic process, lactic fermentation, LAB process, "yogurt process", salt-brine lactic | inoculum (none vs LAB), salt %, final pH, lactic acid g/L |
| **S9 Backslopping** | mossto, mosto, must re-use, *lixiviado* inoculation, "previous-batch starter" | source batch ID, volume ratio |
| **S10 Co-ferment / infused** | co-ferment, co-fermented, infused, "fruit fermentation", flavoured (misused) | **exact substances, form, timing vs green** |
| **S11 Slow dry** | slow dry, shade dry, ASD drying phase, *secado lento*, dark room (variant) | drying-days, RH, temperature, light |
| **S12 Aged** | aged, vintage, Sumatran aged, monsooned (distinct mechanism), barrel-aged (distinct: wood contact) | time, RH, container |
| **S13 Target-outcome labels (not processes)** | "lactic", "acetic", "malic", "winey", "alcoholic", "tropical" | measured acids and ethanol, sensory |

---

## 7. Recommended app data model

### 7.1 Core entities (JSON-schema-style sketch)

```jsonc
ProcessingProtocol {
  id, name, version, owner_org,
  aliases: [string],                // e.g., ["Kenyan", "double washed"]
  family_primary: enum(W|N|H|WH|AN|CM|T|M|E|P|G|X|Z|D),  // display only
  summary_vector: AxisVector,       // derived: union of step vectors
  steps: [ProtocolStep],            // ordered
  endpoints: [Endpoint],            // global endpoints (e.g., final moisture)
  disclosure: Disclosure,
  evidence: [{source_id, url, tag: S|K|I|U}],
  status: draft|trial|validated|retired
}

AxisVector {
  fruit_state, mucilage_retained_pct?, mucilage_removal_mode?,
  oxygen_regime, gas?,
  temperature_regime, setpoints_c?: [number],
  microbial_control, inocula?: [Inoculum],
  additions?: [Addition],
  physical?: [enum],
  drying_regime?, post_drying?: [enum], biological_passage?
}

ProtocolStep {
  seq, step_type: enum(
    reception, sorting_floatation, sanitation, cold_hold, freezing,
    pulping, demucilage, fermentation, immersion_hot, immersion_cold,
    inoculation, addition, washing, soaking, drying, hulling_wet,
    reposo, storage, aging, monsooning, barrel_aging, decaf, milling),
  vector: AxisVector,               // the axis values during THIS step
  vessel: {type: tank|bag|barrel|bioreactor|bed|patio|silo|room,
           material, volume_l, valve: bool, headspace_pct},
  setpoints: {temp_c_min, temp_c_max, duration_h_min, duration_h_max,
              agitation_rpm?, pressure_kpa?},
  inoculum?: Inoculum,
  additions?: [Addition],
  measurements_plan: [MeasurementSpec],
  endpoints: [Endpoint],            // e.g., pH ≤ x OR Brix drop ≥ y OR t ≥ z
  notes
}

Inoculum {
  organism_genus, species, strain_code?, product_name?, supplier?,
  category: yeast_sacch|yeast_non_sacch|lab|mold|mixed|bioprotection|backslop,
  dose_value, dose_unit: g_per_kg_cherry|g_per_hl|ml_per_kg|cfu_per_g,
  rehydration: {water_ratio, temp_c, minutes}?,
  lot_number, expiry, regulatory_note?   // e.g., GRAS notice reference
}

Addition {
  substance, category: own_coffee_derivative|processing_aid|
            exogenous_natural|exogenous_flavouring,
  form: fresh|pulp|juice|powder|extract|oil|solid,
  amount, unit, timing: pre_green|post_green, step_seq
}

Endpoint { variable, operator, value, unit, logic_group }
```

Execution records (Batch / Lot) instantiate a protocol version and store **actuals**. A `ProtocolRun` carries `planned_step` → `actual_step` with time series. Deviations are first-class records.

### 7.2 Standard measurement variables by step

| Step | Variables (unit) | Notes |
|---|---|---|
| Reception | cherry mass (kg); °Brix + matrix; ripeness mix %; floaters %; cherry core temp (°C); harvest→reception time (h); plot, variety, altitude | R3 §1 |
| Sorting / floatation | floaters removed (kg, %); water used (L) | — |
| Sanitation / pre-treatment | agent, concentration, contact time, rinse | ozone/UV fields optional |
| Cold hold / freezing | chamber setpoint; cherry core temp series; time to target; hold duration; RH; bioprotectant dose | CryoBloom |
| Pulping / demucilage | pulper gap; mass in/out; mucilage retained % (gravimetric estimate); water (L/kg cps) | Becolsub benchmarks [S40] |
| Fermentation | time series of mass temp, ambient temp, pH, °Brix, titratable acidity (mL NaOH), ethanol and lactic strips, volume change (Fermaestro), headspace CO₂ % / O₂ %, vessel pressure, dissolved O₂ (optional), odour notes; start/end timestamps; agitation | pH ≈ 5 / ≈ 4 info-only [S2]; protocol endpoints override |
| Inoculation | product, lot, dose, rehydration water temp and minutes, time of addition | [S3] |
| Addition | substance, form, mass, timing vs green | drives disclosure |
| Immersion (thermal) | water temp in/out, contact time, mass:water ratio | thermal shock |
| Washing / soaking | water (L), cycles, soak h, water temp, conductivity (optional) | — |
| Drying | moisture % (method), aw (+ °C), bean mass temp, air temp, RH, layer depth, turns, light (lux) for dark room, drying days, regime % split | R3 §5 |
| Wet hulling | moisture at hulling (target 20–24 %) | [S8] |
| Reposo / storage | days; container; temp, RH logger; monthly moisture and aw | R3 §6 |
| Aging / monsoon / barrel | duration; RH; barrel type and history; turning | [S9] |
| Green grading | defects, screen, density, moisture, aw, colour, odour | R3 §7 |
| Cupping | CVA descriptive (incl. CATA "fermented", "winey"), affective, cupper | R3 §8 |

### 7.3 Disclosure block (one per protocol and per lot)

The disclosure block follows SCA CVA extrinsic transparency and BoP and WCC rules.

```jsonc
Disclosure {
  process_label_public: string,            // e.g., "Washed – cold-hold pre-fermentation"
  fruit_state_sequence: [enum],            // auto from steps
  oxygen_regimes: [enum],
  max_ferment_temp_c, min_ferment_temp_c, total_ferment_h,
  inoculants: [{species, product, supplier, dose}],   // empty = spontaneous
  backslopping: bool, backslop_source,
  additions_present: bool,
  additions: [{substance, category, timing}],         // ALL, incl. salt, enzymes, sugars
  exogenous_flavour_contact: bool,                    // fruit/spice/flavouring/wood
  post_green_treatment: [enum],                        // aging, barrel, monsoon, decaf
  animal_passage: enum,
  ruleset_checks: [{ruleset: "BoP-2026"|"CoE-2026"|"WCC-2026"|..., 
                    eligible: yes|no|unknown, basis_text, checked_on, checked_by}],
  consumer_statement: string,              // plain-language, generated + editable
  evidence_attachments: [photo/log ids]    // time-stamped reception, Brix, etc.
}
```

**Default validation rules [I]:**
- `additions_present = true` with category `exogenous_*` → auto-flag BoP as `no`, based on the 2024 exclusion [S4, S18]. The user must confirm against the current year's rules.
- Any inoculant → BoP `unknown` until the user records the SCAP ruling. **Wording for inoculated yeast was not retrieved [?].**
- Any addition with `timing = post_green` → WCC `no` [S18, S19].
- "Lactic", "acetic" or "malic" labels require measured acid data, or the public label must say "target profile".

---

## 8. Gaps, contradictions and recommended next checks

1. **BoP 2026 and CoE rule texts.** Retrieve the official PDF from SCAP and from the Alliance for Coffee Excellence, specifically wording on (a) commercial yeast and LAB inoculation, (b) own-coffee derivatives (must, cascara), (c) enzymes and salt. Only the BoP 2024 exclusion of "foreign additives" is confirmed, via press [S4, S18, S19].
2. **WCC current wording.** The PDF was not opened. The 2021 quote ("between harvest and extraction") [S20] and the 2024 "post-green" framing [S18, S19] differ, so verify the 2026 text.
3. **Thermal shock and mossto parameters.** No primary description found. Treat as producer-proprietary. Encode with `stepped`/`thermal_shock` and `backslopped`, with user-entered parameters.
4. **"Hybrid washed", "supernatural", "hydro", "malic maceration"** are unverified meanings. Keep them as alias strings mapped to vectors only after the producer confirms.
5. **Carbonic maceration definition conflict** (whole vs depulped) [S10 vs S22]. Use `pulp_state` rather than the name.
6. **Lactic definition conflict** (spontaneous LAB [S6] vs added cultures [S13]). Use `microbial_control`.
7. **Peer-reviewed depth.** The next session (with a search budget) should pull SIAF (Brazilian studies), CM at 38 °C, and *M. pulcherrima* coffee studies. Rate-limited Europe PMC was the blocker this session.
8. **Your Metschnikowia GRAS reference** [U] was not re-verified. Check the FDA GRAS notice inventory before citing it publicly.

---

## 9. References (all fetched successfully during this research, 2026-10-01/02)

| # | Source | URL |
|---|---|---|
| S1 | Hurtado Cortés V., Bahamón Monje A.F., Bustos Vanegas J.D., Gutiérrez Guzmán N. (2024). *Challenges in coffee fermentation technologies: bibliometric analysis and critical review.* J. Food Sci. Technol. | https://pmc.ncbi.nlm.nih.gov/articles/PMC11486863/ |
| S2 | Elhalis H., Cox J., Zhao J. (2023). *Coffee fermentation: Expedition from traditional to controlled process and perspectives for industrialization.* Applied Food Research | https://www.sciencedirect.com/science/article/pii/S2772502222002086 |
| S3 | Fermentis — coffee applications page | https://fermentis.com/en/fermentation/other-beverages/coffee/ |
| S3a | SafCoffee™ Green Origins | https://fermentis.com/en/product/safcoffee-green-origins/ |
| S3b | SafCoffee™ Deep Amber | https://fermentis.com/en/product/safcoffee-deep-amber/ |
| S3c | SafCoffee™ Cool Blue | https://fermentis.com/en/product/safcoffee-cool-blue/ |
| S3d | SafCoffee™ Sunrise Orange | https://fermentis.com/en/product/safcoffee-sunrise-orange/ |
| S4 | PDG (2025). Co-ferments vs. yeast inoculation | https://perfectdailygrind.com/2025/11/co-ferment-coffee-yeast-inoculation-differences/ |
| S5 | PDG (2025). How honey processing is evolving | https://perfectdailygrind.com/2025/01/how-honey-processing-is-evolving-in-specialty-coffee/ |
| S6 | PDG (2023). Lactic fermentation: what roasters need to know | https://perfectdailygrind.com/2023/10/lactic-fermentation-coffee-roasters/ |
| S7 | PDG (2022). What is koji fermented coffee? | https://perfectdailygrind.com/2022/03/what-is-koji-fermented-coffee/ |
| S8 | PDG (2015). Indonesian wet hulled coffee | https://perfectdailygrind.com/2015/10/indonesian-wet-hulled-coffee-processing/ |
| S9 | PDG (2022). What is aged coffee? | https://perfectdailygrind.com/2022/08/what-is-aged-coffee/ |
| S10 | PDG (2021). Carbonic maceration & biodynamic farming: experimental processing in Panama | https://perfectdailygrind.com/2021/06/experience-trial-and-error-experimental-coffee-processing-in-panama/ |
| S11 | PDG (2023). How do we really define experimental processing? | https://perfectdailygrind.com/2023/11/define-experimental-coffee-processing-fermentation/ |
| S12 | PDG (2017). A video guide to double washed processing | https://perfectdailygrind.com/2017/05/a-video-guide-to-double-washed-processing/ |
| S13 | PDG (2022). Exploring trends in experimental coffee processing | https://perfectdailygrind.com/2022/10/exploring-trends-in-experimental-coffee-processing/ |
| S14 | PDG (2016). Understanding pulped natural coffee | https://perfectdailygrind.com/2016/06/coffee-processing-understanding-pulped-natural-coffee/ |
| S15 | PDG (2016). Slow naturals: how controlled fermentation came to Brazil | https://perfectdailygrind.com/2016/08/slow-naturals-how-controlled-fermentation-came-to-brazil/ |
| S16 | PDG (2022). How is decaf coffee made? | https://perfectdailygrind.com/2022/11/how-is-decaf-coffee-made/ |
| S17 | PDG (2023). Pink Bourbon: a new darling of specialty coffee? | https://perfectdailygrind.com/2023/10/pink-bourbon-specialty-coffee/ |
| S18 | PDG (2024). There's space for infused coffees – but transparency is key | https://perfectdailygrind.com/2024/08/market-for-infused-coffees-transparency/ |
| S19 | PDG (2026). Why is Colombia producing so many co-fermented coffees? | https://perfectdailygrind.com/2026/02/why-colombia-produces-co-fermented-coffees/ |
| S20 | PDG (2021). What's the problem with infused coffees? | https://perfectdailygrind.com/2021/08/infused-coffees-experiments-with-fermentation/ |
| S21 | PDG (2024). Just how much diversity is there within Geisha in Panama? | https://perfectdailygrind.com/2024/10/diversity-in-gesha-coffee-panama-processing/ |
| S22 | PDG (2023). Specialty coffee has the wine industry to thank for its influence on processing | https://perfectdailygrind.com/2023/12/specialty-coffee-wine-processing-fermentation/ |
| S23 | PDG (2020). Three examples of innovative coffee processing in Indonesia | https://perfectdailygrind.com/2020/09/three-examples-of-innovative-indonesian-coffee-processing-indonesia-coffee/ |
| S24 | PDG (2019). How Colombian coffee producers are experimenting with processing | https://perfectdailygrind.com/2019/04/how-colombian-coffee-producers-are-experimenting-with-processing/ |
| S25 | PDG (2022). How can controlled fermentation enhance coffee flavour and quality? | https://perfectdailygrind.com/2022/11/controlled-fermentation-coffee-flavour-and-quality/ |
| S26 | PDG (2019). How to ensure consistency in coffee fermentation & processing | https://perfectdailygrind.com/2019/04/how-to-ensure-consistency-in-coffee-fermentation-processing/ |
| S27 | PDG (2026). Why processing is helping push liberica into the spotlight | https://perfectdailygrind.com/2026/08/coffee-processing-liberica/ |
| S28 | PDG (2025). Why co-fermented coffees are becoming a category of their own | https://perfectdailygrind.com/2025/09/co-ferment-coffee-becoming-own-category-processing/ |
| S29 | PDG (2026). Co-ferments are huge – but how will processing change? | https://perfectdailygrind.com/2026/07/how-will-coffee-processing-change-from-co-fermentation/ |
| S30 | PDG (2026). Co-fermented coffees might be divisive, but there is a market | https://perfectdailygrind.com/2026/04/market-for-co-fermented-coffees/ |
| S31 | PDG (2026). The love-hate relationship with co-ferments | https://perfectdailygrind.com/2026/05/issues-with-co-ferment-coffees/ |
| S32 | PDG (2022). Exploring biodynamic coffee production | https://perfectdailygrind.com/2022/01/exploring-biodynamic-coffee-production/ |
| S33 | PDG (2016). Kopi luwak explained | https://perfectdailygrind.com/2016/02/kopi-luwak-the-worlds-shittiest-coffee-explained-in-90-seconds/ |
| S34 | Black Ivory Coffee (official site) | https://www.blackivorycoffee.com/ |
| S35 | Hacienda La Esmeralda (official site) | https://haciendaesmeralda.com/ |
| S36 | Café Granja La Esperanza (official site) | https://cafegranjalaesperanza.com/ |
| S37 | PDG (2016). Makers and superpickers: experimental Ninety Plus coffee in Ethiopia | https://perfectdailygrind.com/2016/05/makers-and-superpickers-experimental-ninety-plus-coffee-in-ethiopia/ |
| S38 | Cup of Excellence — rules and protocols page (no additive clause found) | https://cupofexcellence.org/rules-protocols/ |
| S39 | PDG (2017). Experimental processing: washed carbonic maceration | https://perfectdailygrind.com/2017/04/experimental-processing-1-video-on-washed-carbonic-maceration/ |
| S40 | Cenicafé / Anacafé sources, as compiled in R3: Cenicafé 66(1) water & Becolsub/Ecomill; Fermaestro AVT 431; Anacafé CEDICAFE 2018 | https://www.cenicafe.org/es/publications/5.Manejo.pdf ; https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/view/271 ; https://www.anacafe.org/uploads/file/1296dfe8b18b492583788afbfb8420d9/Boletin-Tecnico-CEDICAFE-2018-10.pdf |
| S41 | Swiss Water Decaf (official site) | https://www.swisswater.com/ |
| S42 | World Coffee Championships — rules portal (rule PDFs not opened) | https://wcc.coffee/rules-regulations |

R3 = `/home/claude/research/R3_postharvest_quality.md` (same package).
