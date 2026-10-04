# R7 — Mill Infrastructure & Instrumentation: Asset Catalog, Variables and Data Model

Prepared 2026-10-02 for the farm-ref package (Néctar Nómada / Boquete). Companion to `R3_postharvest_quality.md` (standards, setpoints, calibration) and `R6_processing_taxonomy.md` (processing axes A–I, step model §7). R7 describes the **physical installations** that R6's `ProtocolStep.vessel` and R3's measurement fields point to.

---

## 0. How to read this report

**Evidence tags.** Every claim carries one.

| Tag | Meaning |
|---|---|
| **[S:id]** | Read directly in a source fetched this session. `id` points to §7. |
| **[S:R2] / [S:R3] / [S:R4] / [S:R6]** | Verified by a sibling report from its own cited source (for CryoBloom, from your protocol notes as recorded in R6). Not re-read here. |
| **[T]** | Trade or engineering knowledge, widely used, but **not verified** against a fetched source this session. |
| **[I]** | My inference, arithmetic or design recommendation. |

**Method and limits.**
1. WebSearch was exhausted. I used WebFetch on the seed URLs and navigated site indexes: the Cenicafé *Avances Técnicos* archive and site search (≈ 40 bulletins, 1976–2026), Penagos product pages, Fermentis pages and one data sheet, Bühler, GrainPro and eCFR.
2. **Blocked or empty:** pinhalense.com.br (robots.txt failed twice); Cenicafé AT 164 and AT 548 are image-only (abstracts used); the Anacafé 2024 guide and ICAFE cost study hold almost no equipment data; Fermentis' coffee page has no vessel guidance; GrainPro publishes no permeability specs.
3. **Uneven coverage.** Wet mill, drying, fermentation tanks, wastewater and moisture measurement are well sourced, mostly Cenicafé under Colombian conditions. Dry-mill settings, sealed-vessel gas instruments, cold-room design, sanitizers and worker safety are mostly [T].
4. **Alignment.** R3 owns standard setpoints (final moisture, aw, warehouse climate, cupping, pH/refractometer calibration); I cite it unless new evidence refines a value. Your protocol thresholds (CryoBloom, SafCoffee lots) override every generic number here.
5. No URL was constructed; §7 lists only URLs fetched successfully.

---

## 1. Twelve findings that shape the app

1. **Held cherry heats itself.** Fruit mass in burlap sacks reached 28.5–31.0 °C at 24 h and 38.0–40.6 °C at 48 h (mass, not chamber, temperature; the control of the 15/20 °C conditions is not described) [S:AT589]. Log **mass core temperature** in holding areas and cold rooms [I].
2. **Holding-time authorities disagree.** Anacafé: pulp within 10 h of picking [S:ANA18]. Cenicafé: a 48 h hold of selected ripe fruit raised fruity descriptors with no score loss (81.8–83.5 SCA) [S:AT589]. Codex: "as soon as possible" [S:R3]. Store limits per **authority profile**, as R2 does for pests [I].
3. **Vessel material is a process variable.** Fermentation ran longest in stainless steel (heat loss), shortest in plastic (insulation) [S:AT431]. Use inert, smooth, round-cornered, washable vessels, not wood, corroding metal or flaking paint [S:AT422]. An MDPE tank matched AISI 304 in the cup at 63 % lower cost [S:AT496].
4. **Two R3 gaps now have sources.** Mucilage is 0.4–2.0 mm thick and ≈ 22 % of depulped-coffee mass [S:HUI7], ≈ 12 % of cherry mass [I, via AT370's 1.81 factor]. Titratable acidity rises from ≈ 860–1,000 to ≈ 3,000 mg CaCO₃/L at 20 h and 5,600–6,700 at 36 h [S:AT422, AT563]. °Brix endpoints conflict (§6): info only.
5. **Mechanical drying references agree:** air ≤ 50 °C, ≈ 100 m³/min per t dry parchment, air reversal every 6–8 h, layer < 35–40 cm [S:AT576, AT380, AT282, HUI7]; crystallised beans above 50 °C [S:AT576]. With 50 °C air the bean reached 48 °C near 11 % moisture [S:AT576], so Anacafé's 40 °C mass limit [S:ANA18] needs **bean-temperature** logging [I].
6. **Direct firing is its own hazard class.** Combustion gases cause smoky ("ahumado") cups, fuel contamination and discoloured beans; use external combustion with a heat exchanger [S:AT371, AT454]. Cenicafé does not recommend direct propane firing [S:AT282].
7. **Solar-dryer numbers are robust:** 14 kg washed coffee/m² at 2 cm [S:AT577] (13 kg/m² [S:HUI7]); ≥ 3–4 turns/day; night rewetting below 20 % moisture [S:AT577]; solid polycarbonate covers cut drying time 40–47 % and last > 8 years [S:AT575].
8. **Do not interrupt early drying.** After 6 h (≈ 47 % moisture, aw > 0.90), 36–48 h stops gave an earthy defect in 100 % of samples [S:AT562]; Anacafé recommends an 8–10 h nightly stop with gradual cool-down [S:ANA18]. Use a moisture-gated rule (§6) [I].
9. **Water ladder (L/kg dry parchment):** running channel 18.7–39 → tank washing 4.1–4.2 → hydrocyclone 1.9 → Becolsub 0.7–1.0 → Ecomill 0.3–0.5 → waterless pulping 0 [S:AT241, AT216, AT408, AT405, AT432, AT164].
10. **Wastewater is 250–1,650× Panama's COD limit** (25,000–165,000 mg/L [S:AT537, AT538, AT280] vs 100 mg/L [S:R4]). Default to zero-discharge workflows: washwater into pulp, lime + settling, primary anaerobic treatment, green filters [I].
11. **Barrier packaging decides storage life.** Over 365 days high-barrier bags held ≤ 12.3 % moisture while fique/paper reached ≈ 15 %; 10–12 °C storage kept quality 240 days, warm stores 60–240 days [S:AT590].
12. **Instrument physics matters.** Capacitance meters under-read warm coffee (equilibrate ≥ 30 min) and GravimetSM2 reads within 0.5 % of ISO 6673 [S:AT580]; aw rises ≈ 0.02 per 10 °C at constant moisture [S:AT583]. Store measurement temperature with every moisture/aw reading [I].

---

## 2. Catalog by area (deliverable a)

**Column key.** *Design reference* = sizing/specification values from sources; *Failure modes* = what goes wrong and what to clean or service. Operating variables and setpoints are in §3 (V-codes); attributes to store are in §4 and §5.3. Units: **@** = arroba (12.5 kg dry parchment); **cps** = *café pergamino seco* (dry parchment); **baba** = depulped coffee with mucilage.

### 2.1 Reception & cherry handling

| Code | Asset (EN · ES · PT) | Function / subtypes | Design reference | Failure modes / hygiene / maintenance |
|---|---|---|---|---|
| REC-SCL | Reception scale · báscula · balança | Weighs each delivery: platform, hanging or truck scale [T] | Volume units (lata, cajuela) are farm-specific, so record kg [S:R3] | Drift: check with test weights [T] |
| REC-HOP | Hopper · tolva (seca/húmeda), recibidor · moega | Buffer before pulping; **dry** (gravity) or **wet** (water-fed) [T] | 45° walls; treated dry wood; sized on 2 % of annual production as daily peak; cherry 610 kg/m³ [S:AT058] (621.6 [S:AT370]); < 500 @/yr: the pulper's own hopper suffices [S:AT058] | Clean daily [S:ANA18]. Greased gauge-6 plastic covers caught 7,714 borers/m²; regrease each harvest [S:AT297]. Self-heating [S:AT589] |
| REC-HLD | Holding area · reserva, estopas, canastillas · área de espera | Pre-pulping hold; deliberate cherry rest (R6 FFFD, CryoBloom) | Trial containers: burlap sacks; also bags, crates, hoppers, hermetic containers [S:AT589] | Mass 38–41 °C after 48 h in sacks [S:AT589]; a rest batch rising 8.8 °C to 34.2 °C cupped "sucio" [S:AT554] |
| REC-PCL | Air pre-cleaner · prelimpiador neumático · pré-limpeza | Removes leaves, sticks, soil | Penagos AP-20: 20,000 L cherry/h, 5 HP, 520 kg [S:PEN-AP20] | Replaceable wear parts [S:PEN-AP20] |
| REC-SIF | Siphon / flotation tank · tanque sifón, criba de flotes · separador hidráulico | Separates floaters (dry, empty, borer-damaged) from sinkers | Penagos: up to 1,500–32,000 kg/h; float strainer; 3–8" outlets; CR or stainless [S:PEN-SIF]. Water 1.6 L/kg cherry, clean, not recirculated [S:AT454] | Clean daily [S:ANA18]; dirty water favours OTA [S:CX69] |
| REC-DST | Wet destoner · despedregador · despedregador | Stone trap before the pulper | Stainless 304 + PVC, 500 × 2,880 mm [S:PEN-DST] | Stones damage pulpers [S:PEN-DST] |
| REC-SRT | Cherry sorting · selección manual u óptica · catação | Hand table or optical sorter [T] | For modified fermentations: ≥ 80 % ripe, < 2.5 % unripe, no overripe [S:AT554] | — |
| TRN-* | Transport · transporte hidráulico, sinfín, elevador, gravedad · transporte | Channel/fruit pump, screw, bucket elevator, gravity | Gravity, screw or cable-disc conveying saves > 50 % of water [S:AT187]. Screw capacity m = 15π(Di² − d²)·p·ρ·N·fc, cherry ρ 616.5 kg/m³; dosing screws 2–4" at 84–172 rpm [S:AT405]. Upper floor above 500 @/yr [S:AT058] | Water transport of pulp contaminates water [S:AT187] |

### 2.2 Pulping

| Code | Asset | Function / subtypes | Design reference | Failure modes / hygiene / maintenance |
|---|---|---|---|---|
| PUL-DRM | Horizontal drum pulper · despulpadora de cilindro horizontal · despolpador horizontal | Pressure and friction of cylinder against breast (*pechero*) and jacket (*camisa*) [S:HUI7]; manual or motor; 1–6 jets (*chorros*) | Works without water [S:AT164, PEN-DH4]. Cenicafé-INGESEC 300: 300 kg/h, Ø 14 × 22 cm cylinder at 232 rpm, gap set with galvanised shims [S:AT294]. Penagos DH-4: 400–450 kg/h, 0.75 HP [S:PEN-DH4]. No. 3 machine: 1 HP at 150–180 rpm [S:AT058] | Damage, unpulped fruit, pulp in coffee, coffee in pulp (V-PUL) [S:AT294]; "guayaba" defect from maladjustment or poor floater removal [S:HUI7]. Sample coffee and pulp, recalibrate as needed, respect capacity; clean after each shift [S:ANA18] |
| PUL-VRT | Vertical pulper · despulpadora vertical · despolpador vertical | Higher capacity, waterless | Penagos DV-255: 2,000–2,500 kg/h, 2 HP, stainless jacket, grey-iron breasts; claims < 2 % damage/"cascareo" [S:PEN-DV255] | As PUL-DRM |
| PUL-DSC | Disc pulper · despulpadora de discos · despolpador de disco | East African stations [T] (R6 W04) | — | [T] |
| PUL-REP | Re-passer · repasadora · repassador | Second pass for unpulped/green cherries [T] | — | Green fruit adds bitterness [T] |
| PUL-SCR | Screen · zaranda/criba · peneira rotativa | Separates pulped coffee from unpulped fruit and pulp | Rotary 60 cm Ø × 2 m at 30 rpm serves four No. 3 pulpers [S:AT058]; built into Penagos UDC units (1,000–1,200 kg/h, zero water) [S:PEN-UDC] | Overload sends first-quality coffee to seconds [S:ANA18] |
| PUL-PCV | Pulp conveyor · transporte de pulpa · transporte de polpa | Screw or gravity, no water | Screw conveying [S:AT187]; Becolsub screw mixes pulp and mucilage [S:AT405] | Pulping + water transport of pulp = 82,080 mg COD/kg cherry, 72 % of load [S:CEN66] |

### 2.3 Mucilage removal, washing & classification

| Code | Asset | Function / subtypes | Design reference | Failure modes / hygiene / maintenance |
|---|---|---|---|---|
| DEM-UPF | Upflow demucilager · desmucilaginador (Deslim, DELVA) · desmucilador | Removes mucilage without fermentation | Granjerito: 744 kg cherry/h, 0.89 kW, 870 rpm, 1.09 L/kg cps, 0.68 % damage; Granjero: 2,400 kg/h, 4.85 kW, 0.6 L/kg cps, 0.8 % [S:AT217]. DELVA 1,000–10,000 kg/h [S:PEN-DELVA] | Residual mucilage ferments in the dryer [S:HUI7]. Rest 24 h in clean water changed every 6–8 h; ripe fruit only [S:ANA18] |
| DEM-BCS | Becolsub · Becolsub · — | Waterless pulper + Deslim + screw mixing pulp and mucilage | 300–2,500 kg cherry/h; 0.7–1.0 L/kg cps; flow set by orifice plate (1/8" at 200 mm head → 0.87 ± 0.16 L/kg cps), rotameter (1.5–15 L/min) or 4.5–8 W pump [S:AT405]; avoids ≈ 90 % of pollution [S:CEN66] | Leachate ≈ 110,000 ppm COD [S:CEN66]; re-*aforo* (timed volume) on drift [S:AT405] |
| DEM-ECM | Ecomill · Ecomill® · — | Natural fermentation in a 60° cone tank, then mechanical washing | Models 500/1,500/3,000: 435–2,817 kg/h; 0.32–0.53 L/kg cps; 1.6–4.0 hp; damage 0.10–0.56 %; removal > 95 %; 16–20 h fermentation or 2–3 h with pectinase; daily full wash of stainless parts [S:AT432] | Washwater COD 130,000–165,000 mg/L [S:AT538] |
| DEM-ENZ | Enzyme dosing · dosificación de enzimas · — | Pectinase processing aid (R6 W08) | 2–3 h fermentation [S:AT432]; SM-1 bioreactor accepts enzymes [S:PEN-SM1] | Disclose as processing aid [I] (R6 W08) |
| WSH-TINA | Tanque tina · tanque tina · — | Ferment-and-wash tank, rounded corners | 120.5 × 92.5 cm top, 104 × 72 cm bottom, 85 cm deep ≈ 600 L for a 600 kg-cherry peak; two tanks; 30 % free volume; V_baba (L) = 0.666 × kg cherry; central drain, 1½" ball valve, 3/16" holes at 1 cm; light colours; 4 rinses 5–10 cm above mass; 4.1 L/kg cps vs 25 traditional [S:AT408] | Residues to anaerobic treatment [S:AT408] |
| WSH-CHN | Washing channel · canal de correteo / semisumergido · canal de lavagem | Washing + density grading | 30 × 30 cm, tiled, 0.5 % slope, 5–20 m [S:AT058]. Running: 18.7 L/kg, 450 kg/h, 18.9 % good beans lost; semi-submerged 3.2 L/kg [S:AT241] | Highest water use [S:AT241] |
| WSH-HCY | Hydrocyclone · hidrociclón · hidrociclone | Pump-fed density separation | Ø 35 cm, 73° cone, inlet 13.8–34.5 kPa, 1,640 kg/h, 1.9 L/kg, 71.6 % impurities removed, 12.4 % good beans lost [S:AT241] | — |
| WSH-WSR | Mechanical washer · lavador (Ecowasher) · lavador | Washes fermented coffee | Ecowasher 1500: 1,000–1,500 kg/h, 1 HP, 0.5 L/kg cps [S:PEN-EW1500] | Drain and spread at once; piled washed coffee gives post-fermentation and "cebolla" [S:ANA18]; reused water stains beans [S:HUI7] |

### 2.4 Fermentation vessels & thermal control

In R6, the vessel is an attribute of a step. R7 makes it an **asset** with its own material, geometry, ports and thermal behaviour [I].

| Code | Asset | Function / subtypes | Design reference | Failure modes / hygiene / maintenance |
|---|---|---|---|---|
| FER-OPN | Open tank · tanque/pila de fermentación · tanque de fermentação | Dry or underwater; concrete, tiled, epoxy, stainless-lined or plastic [S:HUI7, AT422] | 1 m³ per 24 @ cps at 12 h; floor 8 % to outlet; knife gate with grille [S:AT058]. Mass 50 cm–1 m with good drainage; underwater: change standing water every 10–12 h, pool ≤ 72 h [S:ANA18] | No wood, corroding metal or flaking paint [S:AT422]; clean daily [S:ANA18]; shade and ventilate [S:AT554] |
| FER-CON | Conical tank · tanque cónico · tanque cônico | Self-emptying (Ecomill type) | FDA-approved MDPE, cylinder Ø 1.22 × 1.50 m (1.75 m³) + 0.80 m cone at 60° (0.38 m³), 0.23 m outlet, ≈ 1.45 t coffee; dry discharge 41.8 t/h (63.4 stainless 430); > 20 yr; 63 % cheaper than AISI 304; same cup [S:AT496] | Weak-acid resistant, less so to strong acids [S:AT496] |
| FER-SLD | Sealed tank / bioreactor · biorreactor hermético · biorreator | Anaerobic, SIAF, CO₂/N₂-flushed, carbonic (R6 axis B) | Penagos SM-1: 300–5,000 L, hermetic wafer valves, CO₂/N₂ quick connector, **0–15 psi (0–103 kPa) adjustable**, 71–132 L leachate tank, manhole [S:PEN-SM1]. BioMáster PRO adds logged pH, soluble-solids and temperature sensors and yeast/bacteria dosing [S:PEN-BM]. Sealable drains; insulated, refrigerated jackets [S:AT454] | Warm closed systems: phenolic/earthy taints [S:AT454]; O₂-restricted runs: herbal notes, excess acetic/butyric/propionic risk [S:AT554]. CO₂ asphyxiation in rooms and pits [T] |
| FER-DRM | Drums & barrels · bidones, canecas, barricas · bombonas, barris | HDPE, stainless, wood | Food-contact polyolefins: 21 CFR 177.1520 (extractables, density classes) [S:CFR] | Wood not recommended [S:AT422]; check prior contents [T] |
| FER-BAG | Bags · bolsas herméticas / de ensilaje · sacos herméticos | Sealed whole-cherry and river-flow ferments [S:R6 A07] | GrainPro sells hermetic storage bags, no fermentation specs [S:GP] | Punctures, uneven temperature [T] |
| FER-IBC | IBC tote · IBC · contentor IBC | 1,000 L HDPE in cage [T] | — | Never ex-chemical totes [T] |
| FER-ACC | Fittings · válvula de alivio, airlock, muestreo, termopozo · válvulas | One-way CO₂ release, relief, gas inlet, sampling, probe wells | One-way valves in tropical carbonic maceration [S:R6 C03]; 0–15 psi [S:PEN-SM1] | Stuck valve: over-pressure or air ingress; inspect gaskets each run [T] |
| THM-JKT | Jacket + chiller · chaqueta, chiller de glicol · camisa | Mass temperature control | Insulated, refrigerated jackets; trials at 15 ± 1 °C [S:AT454] | Glycol leaks [T] |
| THM-CR | Cold room · cuarto frío · câmara fria | Cherry cold hold (CryoBloom 9–12 °C [S:R6]); baba < 8 °C [S:AT422]; green at 10–12 °C [S:AT590] | Cenicafé room: 10.3–12.2 °C, 60–90 % RH [S:AT590] | Condensation on removal; seals, defrost, alarms [T] |
| THM-FRZ | Freezer · congelador · freezer | Frozen-cherry protocols (R6 T03) | Borer kill: ≤ −15 °C for ≥ 48 h [S:R2] | — |
| THM-BTH | Immersion bath · tanque de choque térmico · banho | Thermal shock (R6 T04) | No published temperatures [S:R6] | Uneven contact [T] |
| FER-YST | Yeast fridge & rehydration vessel · nevera · — | SafCoffee storage and starter | Storage and rehydration values in V-FER-14–17; rehydrate in clean, ideally sanitised equipment; submerged ferments ≤ 1 cm water above mass; dry ferments sprayed evenly [S:FER-CB, FER-CBT, FER-DA] | Clumping if stirred roughly [S:FER-DA] |

**Fermentation-room note.** Modified fermentations changed mass temperature by −4.5 to −1.0 °C in controlled conditions and up to +8.8 °C in the field [S:AT554]; coffee-zone ambient spans 12–34 °C [S:AT422]. Log mass and ambient temperature every run [I].

### 2.5 Drying installations

| Code | Asset | Function / subtypes | Design reference | Failure modes / hygiene / maintenance |
|---|---|---|---|---|
| DRY-PAT | Patio · patio (cemento, ladrillo, asfalto, tierra, lona) · terreiro | Open sun drying | Cement, ≥ 1 % slope; 1 m² per 5 @ cps/yr at 3.5 cm loads [S:AT058]; 27 m²/t cps [S:AT281]. Acceptable: cement, brick, tarpaulin, bamboo/sisal mats, raised mesh tables [S:CX69] | Bare soil unsuitable in rainy areas; plastic canvas stays humid underneath; surface must be cleanable [S:CX69]. Not on a hot patio (parchment cracks), avoid > 40 °C, don't mix days [S:ANA18]. Treading, dirt, ash [S:AT371] |
| DRY-BED | Raised bed / tray · cama africana, pasera · terreiro suspenso | Mesh beds, airflow underneath | Cenicafé pasera: 150 × 100 cm, 65 cm high, black PE 4 × 4 or Red 5000 mesh, 3 cm, 90 kg cherry (18.75 kg cps), stackable at 30 cm, gauge-6 cover vented both faces [S:AT345]. East-African beds ≈ 0.8–1 m high, ≤ 1.2 m reach [T] | Lower stacked tray dries slower (142 vs 79 h) [S:AT345] |
| DRY-CBD | Covered/shaded bed · cama cubierta, polisombra · terreiro coberto | Slow/shade dry (R6 G03) | 80 % shade mesh added 4.6–6.3 d (up to +72 %), no cup gain [S:AT577] | Mould at high humidity [T] |
| DRY-PAR | Parabolic / tunnel / marquesina · secador parabólico, túnel · secador solar | Plastic greenhouse dryer | Parabolic: 6.5 × 4.0 × 2.10 m, 50 cm side openings, N–S axis, ≤ 3 cm, 19.5 kg wet/m², 260 kg cps, 7–15 d, cover 3–5 yr [S:AT305]. Doors open early, ~20 % mid-drying, closed at night/rain; river stones under floor; perimeter drain; away from odours [S:AT577] | Night rewetting below 20 % moisture [S:AT577]. Clean covers with water, no detergent; paint frames white [S:AT305, AT577]. Coloured covers slow drying [S:AT577] |
| DRY-MOD | Modular polycarbonate dryer · secador solar modular · — | Automated solar dryer | 2 × 2 m modules; solid 3 mm PC 96 → 90 % transmission, > 8 yr vs PE film every 2–3 yr; 40–47 % faster; inside 17–45 °C, 70–79 % RH; solar extractor on hygrostat at > 95 % RH inside (off if > 95 % outside), 0.072 kWh/cycle [S:AT575] | Lower sheet at night [S:AT575] |
| DRY-ELB | Rolling roof / carts · casa elba, carros · — | Movable cover or rolling trays | Carts ≤ 3 cm; parabolic dries 23.5 % faster than carts [S:AT281]. Casa elba geometry not found [T] | Late covering in rain [T] |
| DRY-DRK | Dark/controlled room · cuarto oscuro deshumidificado · sala climatizada | Dark, cool, dehumidified (R6 N04, G06) | Large dehumidifier + fans, total darkness; Panama example at 18 °C [S:R6] | Dehumidifier sizing not sourced; condensate drainage [T] |
| DRY-SIL | Static-layer silo · silo secador (1–3 niveles) · secador de camada fixa | Batch drying through a fixed layer | ≤ 40 cm [S:AT282, HUI7]; < 35 cm, stacked ≤ 75 cm [S:AT576]. Cenicafé 2-chamber silo 60–500 @; 3-level 12–500 @, 0.1–0.3 m/level, 20–24 h, batch out every 8 h; fans 2–5 HP for 80–160 m³/min at 6.2 cm H₂O [S:AT282]. Penagos SC: 10–20 @ cps, 0.75–1 HP, 2 lb gas per 12.5 kg cps [S:PEN-SC] | Damp coffee left in a stopped silo: dirty, mouldy, earthy, phenolic, smoky [S:AT371]. Remove Gravimet before stirring blades run [S:AT580] |
| DRY-ROT | Rotary drum · guardiola · secador rotativo | Perforated rotating drum | Pre-dry 8–10 h; fill Pinhalense-type drums 100 % (+10–12 % batch, no stripping or shine) [S:ANA18]. Penagos SG-7/9: 7–9 m³, 2,625–3,775 kg cps, 5–7 HP + 5 HP fan, multi-fuel [S:PEN-SG]; QDryer 900 L, 4 rpm, LPG 1 kg/@ [S:PEN-QD] | Part-filled drums strip/polish parchment [S:ANA18] |
| DRY-VRT | Vertical dryer · secadora vertical · secador vertical | Column dryer | Penagos Ecodryer: 5,000–15,000 L wet parchment/day, stainless exchanger, automatic fuel feed, 75–90 kg cisco/m³, 15–35 HP [S:PEN-ED] | [T] |
| DRY-FUR | Furnace / heat exchanger · hornilla, intercambiador, quemador · fornalha | Cisco, pulp, wood, coal, LPG, diesel, electric, solar | kJ/kg: cisco 17,936; coal 33,440; wood (20 % m.c.) 15,412 [S:AT380]; dried pulp 16.5 MJ/kg, 3.5 % ash [S:AT591]. Exchanger target > 50 % efficiency and < 50 % of the grain layer's air resistance (tested 45–52 %); thermostat 48–52 °C [S:AT380] | Combustion gases, stored fuels, direct firing → discoloured, crystallised, smoky beans [S:AT371]; coal sulphur forms acid [S:AT282] |
| DRY-COV | Covers & tools · carpas, rastrillo · lonas, rodo | Night/rain protection, turning | Rake: 8 × 4 cm teeth, 105°, 3 m handle [S:AT281]; cuts drying time 25 % [S:AT577] | Ventilate wet coffee at night; heap and cover after 1 d (parchment) / 3 d (cherry) [S:CX69] |

**Naturals.** Whole cherry brings 58.2 % more mass to dry and needs ≈ 2.3× the solar area of washed coffee per unit green [S:AT557].

### 2.6 Conditioning, storage, packaging & transport

| Code | Asset | Function / subtypes | Design reference | Failure modes / hygiene / maintenance |
|---|---|---|---|---|
| STO-BIN | Rest bins · reposo, cajones de madera · tulhas | Moisture equalisation | Cool 8–10 h under sacks, never bag hot; rest ≥ 3–4 weeks [S:ANA18] | Bin design not sourced [T] |
| STO-WHS | Warehouse · bodega · armazém | Parchment/green storage | ISO: ≈ 22 °C, RH ≤ 60 %, > 0.8 m from walls, ≥ 2 m to ridge, insulated roof, waterproof walls and foundations, insulated pipes, rodent/bird-proof, dark with aisle-only lights, short wall to the sun [S:ISO8455]. Codex: damp-proof cement floor, no flooding, pipes away from coffee, high ceiling, no sun or heat sources [S:CX69]. Anacafé: wooden pallets, 50 cm from walls, 20 °C / 65 % RH [S:ANA18] | Segregate odorous, chemical, dusty goods and rejects; organic apart from fumigated lots [S:ISO8455]; no non-food materials [S:CX69]. Broom-clean; pest programme by a recognised agency [S:ISO8455] |
| STO-CLD | Cold store (green) · cuarto frío · câmara fria | Long-term quality | 10–12 °C held quality 240 d; low T with 69–77 % RH reached one year [S:AT590] | Condensation when warmed [T] |
| STO-PKG | Packaging · fique, yute, bolsa hermética, vacío · juta, big bag | Bags and liners | From 11.8 %: fique/paper ≈ 15 % after 365 d; PE-EVOH, vacuum PE-PAV, PE-doble, PP-PVC, PE-Multi, PE-Max ≤ 12.34 %; fibre bags 7.6–9.0 % discoloured after 240 d; weevil *Araecerus fasciculatus* in fique; high-barrier beyond 60 d [S:AT590]. Clean jute sacks [S:ANA18] | Rehumidification [S:AT590] |
| TRN-CTR | Containers & trucks · contenedor · contêiner | Shipping | Clean, dry, undamaged; cross-stacked bags; absorbent top/side cover; liners off the roof; vents free; ≤ 12.5 % throughout [S:CX69]. Port ≤ 72 h; moisture before loading and on arrival [S:ISO8455] | Condensation in non-breathing sealed containers [S:ISO8455] |

### 2.7 Byproducts & wastewater

Panama's discharge limits are in R4: COPANIT 35-2019 sets pH 5.5–8.5 and COD 100 mg/L; BOD₅ and TSS are pending verification [S:R4].

| Code | Asset | Function / subtypes | Design reference | Failure modes / hygiene / maintenance |
|---|---|---|---|---|
| BYP-PIT | Pulp pit / covered compost · fosa de pulpa techada · fossa de compostagem | Pulp → humus | Volume (m³) = 0.002 × annual kg cps (500 @ → 2 × 2 × 3 m); zinc lean-to roof; cement floor 2 % outwards; concave drain floor with central grate; compartments turned; 4–6 months [S:AT068]. Ecomill structure ≈ 4 × 2 m, plastic-lined walls, impermeable 2 % floor, ≥ 500 L leachate tank [S:AT538] | Borer emergence: greased covers [S:AT297]; leachate runoff [S:AT068] |
| BYP-WAB | Washwater into pulp · aguas mieles sobre pulpa · — | Zero discharge for low-water mills | 2–3 kg pulp per L retains 83–89 % in 24 h; recycled leachate 100 % by 35 h; spray daily by 2" hose or pump [S:AT538]. Becolsub retains ≈ 66 % of mucilage in pulp [S:AT405] | Overloading yields leachate [S:AT538] |
| BYP-VRM | Vermicompost · lombricompost · vermicompostagem | *Eisenia foetida* on pulp | 5 kg worms decomposed 1 m³ fresh pulp in 80 d; humus showed reversible nursery toxicity [S:AT161] | — |
| BYP-FUEL | Dried pulp fuel · pulpa seca combustible · — | Replaces cisco | 78.2 % → 8 % moisture in a 3 mm-polycarbonate solar tunnel; 19.2 % yield; 0.39–0.45 kg/kg cps; S 0.10 %, Cl 0.05 %; store in sealed clean plastic bags [S:AT591] | Rewets in jute [S:AT591] |
| BYP-CSC | Cascara drying · secado de cáscara · casca | Food-grade cascara | Off-ground, food-contact surfaces, food-safety plan [T] | Mould, OTA [T] |
| WW-SET | Lime + settling · tratamiento con cal, sedimentador · decantador | Primary treatment | Raw tina washwater pH 3–4, COD 25,000, TSS 2,700 mg/L; Ca(OH)₂ 4.0–5.2 g/L → pH 7.9–8.1, TSS −75–81 %, COD −37–49 %; jar test 120 rpm 5 min + 60 rpm 25 min, settle 24 h; then Fe/Al coagulants (pH 5–11) [S:AT537] | Lime burns: eye/skin PPE [T] |
| WW-STLB | Primary leachate system · STLB · — | Becolsub leachate | Solids tank (UCI) 2 × 1 × 1 m, flooded, packed with 15 cm guadua pieces (48.2 m²/m³, 77.8 % porosity) behind 3 mosquito-mesh layers; drying bed 2 × 1 × 0.5 m on 30 cm gravel; pre-acidifying filter 5.5 × 1 × 1 m of hand stone + 5 cm limestone (4 : 1), 85 cm level. COD 110,000 → 36,200 ppm (−67 %), BOD −73 %, outlet pH > 5; 1 labour-day/yr; re-plaster UCI every 2 yr [S:AT280] | Sludge 74 L (50 g TSS/L) per 33.5 t cherry [S:AT280] |
| WW-SMTA | Anaerobic reactors · SMTA, biodigestor, UASB · reator anaeróbio | Secondary treatment, biogas | Tina residues go to SMTA [S:AT408]; biodigesters for washwater [S:AT187]. Retention/loading not found [T] | Raise pH first [S:AT537] |
| WW-GRF | Green filter · filtro verde · fertirrigação | Zero discharge by evapotranspiration | Pretreated water on fast-growing trees/grasses tolerant of partial saturation [S:AT548] | Loading rates not extracted |
| WW-EVP | Leachate evaporation · evaporación en secador · — | Leachate → fertiliser | Dried product N 2.87 %, K 4.24 %, pH 5.6, EC 8.36 mS/cm [S:CEN66]; Ecomill dried "honey" 26.5 kg/t cherry [S:AT432] | — |

### 2.8 Dry mill

Weakest-sourced area (Pinhalense blocked; Cenicafé writes for farms that sell parchment). Machine settings are [T] unless tagged.

| Code | Asset (EN · ES · PT) | Function / subtypes | Design reference | Failure modes / hygiene / maintenance |
|---|---|---|---|---|
| DML-PCL | Pre-cleaner · prelimpiadora · pré-limpeza | Screens + aspiration for dust, sticks, stones [T] | — | Dust; partitions or extractor fans where cleaning shares a store [S:CX69] |
| DML-DST | Destoner · despedregadora · despedregador | Density/air stone removal [T] | — | Huller damage [T] |
| DML-HPG | Parchment huller · trilladora, morteadora · descascador | Friction or impact hulling [T] | Washed hulling loss 17.75–18.40 % [S:AT370]; cps : green 1.25 [S:R3] | Breakage from wrong gap or moist coffee; heat [T] |
| DML-HCH | Dry-cherry huller · descascadora de natural · descascador de coco | Removes dried skin, pulp, parchment | Husk 54.6 % of dry-cherry mass, green 45.4 % [S:AT557] | Husk at 16.8 % moisture vs whole cherry 10–12 % [S:AT557] |
| DML-POL | Polisher · pulidora · polidor/brunidor | Removes silverskin [T] | — | Heat [T] |
| DML-CAT | Pneumatic separator · catadora · catador | Removes light beans by air [T] | — | — |
| DML-SCR | Screen grader · clasificadora por zarandas · classificador de peneiras | Round holes in 1/64" steps; oval slots for peaberries | Multi-tier sloped vibrating screens; European Prep ≤ 5 % below screen 15 [S:RC2] | Wear, blinding [T] |
| DML-GRV | Gravity table · mesa densimétrica · mesa densimétrica | Removes light, chipped, hollow beans and foreign matter by angle and vibration [S:RC3, RC4] | — | Good-bean loss if mis-set [T] |
| DML-OPT | Optical sorter · seleccionadora electrónica · selecionadora óptica | Removes discoloured, immature, insect-damaged beans; glass, stones, plastic, sticks | RGB and infrared (SORTEX A LumoVision), paired with mechanical cleaning [S:BUH]; > US$100,000, hundreds of bags/day [S:RC3]; UV for stinkers [T] | Reject-stream losses; calibration [T] |
| DML-HND | Hand sorting · escogida manual · catação manual | Final visual sort | ≈ one 60 kg bag per sorter per day [S:RC3]; light ≥ 4000 K/1,200 lx [S:R3] | Fatigue, lighting [T] |
| DML-MAG/MTD | Magnet, metal detector · imán, detector · ímã, detector | Tramp metal [T] | — | Test pieces [T] |
| DML-BAG | Bagging scale · báscula ensacadora · ensacadeira | Net weight | Quintal 46 kg (CR); export sack 69 kg [S:R3] | Verification [T] |

### 2.9 Lab & instruments

| Code | Instrument | Design reference / method | Calibration / maintenance |
|---|---|---|---|
| LAB-MMC | Capacitance moisture meter · determinador de humedad · medidor de umidade | Senses capacitance, temperature, bulk density; repeatability is the real accuracy [S:CTAHR]. Under-reads warm coffee: equilibrate ≥ 30 min [S:AT580]. Cenicafé MH-2 used for washed coffee [S:AT481] | ISO 24115: ≥ 5 reference samples 8.5–13.5 %, 0.7–1.3 points apart, conditioned 72 h airtight, ≥ 3 readings each, k = 2 [S:ISO24115]. Annual pre-harvest cross-check vs ISO 6673 [S:CX69]; measure at room temperature [S:AT371] |
| LAB-OVN | Oven · estufa | ISO 6673 105 °C/16 h (R3); farm method 105 °C ± 5 °F, 24 h, 100 g, scale 1:1,000 [S:CTAHR] | Method needs no calibration [S:CTAHR]; verify oven temperature [T] |
| LAB-GRV | Gravimet / GravimetSM2 | Solar: 4 × 100 g baskets pooled to 400 g → 210.1–212.4 g at 10–12 %, ± 0.57 % [S:AT577]. Silo: 200 g → 104–105 g [S:HUI7]. SM2: 700 g drained (52–53 %) → 370–375 g; Ø 15.7 cm, 43.5 % perforated, mid-layer; ± 0.5 % [S:AT580] | Scale check [T]; start from drained coffee [S:AT580] |
| LAB-AW | aw meter · medidor de aw | AquaLab named [S:RC1]. At 10–12 %: parchment 0.618, green 0.6175; 0.606 at 15 °C → 0.625 at 25 °C [S:AT583] | Salt standards [T]; log sample temperature [I] |
| LAB-DEN | Densimeter (free-settled) · densímetro | Fill marked volume, weigh, divide [S:RC4]; ISO 6669 (R3) | Fixed cylinder and funnel [T] |
| LAB-REF/PH/TA | Refractometer, pH meter/strips, titration kit | Strips ± 0.2–0.3 pH; TA in mg CaCO₃/L [S:AT422] | Daily 2-point pH and refractometer zero [S:R3] |
| LAB-FMT | Fermaestro® | 500 mL truncated cone, d 14/88 mm, h 206 mm, holes < 6 mm, ≥ 55 % open; fill flush with fresh baba (≤ 10 % pulp), narrow end up; drop 3× from 3 cm before reading; endpoint void > 85 mm (−11.9 to −13.1 % volume, > 96 % mucilage removed) [S:AT431] | Replace if deformed [T] |
| LAB-CRP | CERPER-2 kit | 2–3 kg composite (top/middle/bottom); 1 kg after float removal; lab pulper (no water), lab demucilager, MH-2; 20–30 min; Rf floats 9.0; reference factor 92.8 [S:AT481] | — |
| LAB-THM/LOG | Probes, data loggers | Mass core, plenum, ambient positions [I]; inside/outside T/RH in solar dryers [S:AT575] | Reference check [T] |
| LAB-GAS/PRS/DO/EC | CO₂/O₂ meter, pressure gauge, DO meter, EC/TDS meter | Vessels to 15 psi [S:PEN-SM1]; leachate EC 8.36 mS/cm [S:CEN66] | NDIR zero/span; gauge check [T] |
| LAB-FLW | Flow meters · rotámetro, medidor de agua | Rotameter 1.5–15 L/min, orifice, timed volume [S:AT405]; built-in meter on ECOLINE [S:PEN-ECO] | Re-*aforo* each season [I] |
| LAB-WX | Weather station · estación meteorológica | Annual sunshine 1,061–1,399 h → 15.5 d solar drying; 1,400–1,800 h → 10.6 d [S:AT577]; PCE-SPM1 meter for cover transmission [S:AT575] | Pyranometer cleaning [T] |
| LAB-RST/GRD/AGT/SCS/UV/CUP | Roaster, grinder, Agtron, screens, UV lamp, cupping room | Protocol values in R3 [S:R3]; screens n/64" [S:RC2] | Agtron tile; screen wear [T] |

### 2.10 Utilities & site

| Code | Asset | Design reference | Notes |
|---|---|---|---|
| UTL-WSRC | Water source & treatment | Potable: no enterobacteria or heavy metals, no dissolved solids, colourless, odourless, pH 6–8 [S:AT454]; clean water for processing [S:CX69, ANA18] | Test log per source and season [I] |
| UTL-WST | Water storage | Daily peak = 2 % of annual production; at the old 20 L/kg cps that was 2,500–25,000 L/day for 500–5,000 @/yr [S:AT058] | Size on measured L/kg cps [I] |
| UTL-PWR/FUEL | Power, fuel store | Costa Rican mills: 14.44 kWh, 0.080 m³ firewood, 0.416 m³ water per 46 kg unit [S:ICF]; label and segregate fuels [S:AT371] | — |
| UTL-SAN | Sanitation (POES) | Sanitation SOPs, hygiene, pest control, records [S:AT351]; daily cleaning and daily checks of fluids, bolts, lubrication [S:ANA18] | Agents/concentrations not sourced [T] |
| UTL-SAF | Safety | Protective measures and industrial safety required [S:AT351]; guards, lockout, PPE for lime/acids, CO₂ monitors in fermentation and cold rooms [T] | Closed tanks = confined spaces [T] |

---

## 3. Variables & indicators master list (deliverable b)

**Code prefixes.** V-REC reception · V-HLD hold · V-PUL pulping · V-WAT water · V-DEM demucilage · V-FER fermentation · V-WSH washing · V-DRY drying · V-CND conditioning · V-STO storage · V-TRN transport · V-WW wastewater · V-BYP byproducts · V-DML dry mill · V-INS instruments.

**Confidence.** H = institute document or standard read directly; M = single study, vendor, or a partly read source; L = trade knowledge or inference.

**Rule.** Values in the reference column are plausibility references only. Your protocol setpoints override them.

| Code | Variable | Unit | Instrument | Where / step | Frequency | Reference range or setpoint | Source | Conf. |
|---|---|---|---|---|---|---|---|---|
| V-REC-01 | Cherry mass received | kg | REC-SCL | reception | each delivery | — | [T] | L |
| V-REC-02 | Harvest → pulping time | h | timestamps | reception → pulping | each lot | Anacafé profile: warn > 10 h. Cenicafé profile: 24–48 h hold with no score loss | [S:ANA18, AT589] | H |
| V-REC-03 | Cherry mass core temperature | °C | probe / logger | holding, cold hold | at intake, then ≤ every 4 h [I] | No generic limit. Observed 28–31 °C at 24 h and 38–41 °C at 48 h in sacks | [S:AT589] | M |
| V-REC-04 | Ripeness mix | % | colour card | reception | each lot | ≥ 80 % ripe; < 2.5 % unripe; overripe excluded from modified fermentations | [S:AT554]; R3 | H |
| V-REC-05 | °Brix (mucilage) | °Brix | refractometer | reception | each lot | Ripe 14.6–18.6 (mean 17.05); half-ripe 14.1; overripe 20.1 | [S:AT422]; other cultivars in R3 | M |
| V-REC-06 | Floaters removed | % mass | REC-SIF + scale | flotation | each lot | No authoritative limit | [S:R3] | — |
| V-REC-07 | Cherry : parchment ratio (CERPER) | kg/kg | LAB-CRP | reception (central mills) | each delivery | Washed reference 4.94; floats 9.0 | [S:AT370, AT481] | H |
| V-REC-08 | Cherry classification water | L/kg cherry | water meter | flotation | each lot | 1.6, clean, not recirculated | [S:AT454] | M |
| V-HLD-01 | Cold-room air temperature | °C | logger | cold hold | ≤ 15 min [I] | Protocol (CryoBloom 9–12 °C [S:R6]); < 8 °C keeps baba [S:AT422] | — | M |
| V-HLD-02 | Cold-room RH | % | logger | cold hold | ≤ 15 min | Not sourced | [T] | L |
| V-HLD-03 | Hold duration | h | timestamps | hold | each lot | Protocol | [I] | — |
| V-PUL-01 | Mechanically damaged beans | % | sample count | pulping | start of shift and after each adjustment [I] | < 1 % (NTC 2090) | [S:AT294] | H |
| V-PUL-02 | Unpulped fruit in pulped coffee | % | sample | pulping | as above | < 1 % | [S:AT294] | H |
| V-PUL-03 | Pulp in pulped coffee | % | sample | pulping | as above | < 2 % | [S:AT294] | H |
| V-PUL-04 | Coffee in pulp | % | sample | pulping | as above | 0 % | [S:AT294, ANA18] | H |
| V-PUL-05 | Pulper gap / shim setting | mm | feeler gauges | pulping | on adjustment | Depends on variety and fruit size | [S:AT294, HUI7] | M |
| V-WAT-01 | Water used per stage | L | water meter / timed volume | all wet steps | each batch | — | [S:AT405] | H |
| V-WAT-02 | Specific water use | L/kg cps | derived | wet mill | each batch | Ecomill 0.3–0.5; Becolsub 0.7–1.0; tank 4.1–4.2; hydrocyclone 1.9; channel 18.7–39 | [S:AT432, AT405, AT408, AT216, AT241] | H |
| V-WAT-03 | Water flow to demucilager | L/min | rotameter / timed volume | demucilage | start of shift | Becolsub 300: 0.70–1.00; Granjero: 4.0 + 2.0 | [S:AT405, AT217] | H |
| V-DEM-01 | Damage after demucilage | % | sample | demucilage | each shift | Ecomill 0.10–0.56; Deslim-type 0.49–0.8 | [S:AT432, AT216, AT217] | M |
| V-DEM-02 | Mucilage removal | % | Fermaestro / visual | end of demucilage or fermentation | each batch | Ecomill > 95 %; > 96 % at the Fermaestro endpoint | [S:AT432, AT431] | H |
| V-FER-01 | Mass temperature | °C | probe at mass core + logger | fermentation | continuous, or ≤ 2 h [I] | Protocol. Defect risk above 34 °C with long times | [S:AT554] | M |
| V-FER-02 | Ambient temperature | °C | logger | fermentation room | continuous | Coffee zone 12–34 °C day/night | [S:AT422] | M |
| V-FER-03 | pH | pH | meter / strips | fermentation | start; every 4–6 h near the end [I]; end | Info only. Solid: 5.0–5.3 → 3.7–3.9. Submerged: 5.3–5.6 → 3.9–4.2 | [S:AT454, AT422] | H |
| V-FER-04 | °Brix (mucilage or liquid) | °Brix | refractometer | fermentation | start, end | Info only; sources conflict (§6). Solid end 12–14 [AT454] vs 15–17 [AT422]. Submerged liquid end 8.0–9.0 [AT454] vs 5.8–7.9 [AT422] | [S:AT454, AT422] | M |
| V-FER-05 | Titratable acidity | mg CaCO₃/L | titration | fermentation | start, end | ≈ 860–1,000 at start; ≈ 3,000 at 20 h; 5,600–6,700 at 36 h | [S:AT422, AT563] | M |
| V-FER-06 | Fermaestro void / volume drop | mm / % | LAB-FMT | fermentation | hourly near the endpoint [I] | Endpoint > 85 mm; −11.9 to −13.1 % | [S:AT431] | H |
| V-FER-07 | Time past endpoint | h | timestamps | fermentation | each batch | Warn > 2 h | [S:HUI7] | H |
| V-FER-08 | Headspace CO₂ | % v/v | NDIR meter | sealed fermentation | per protocol | Protocol | [T] | L |
| V-FER-09 | Headspace O₂ | % v/v | O₂ meter | sealed fermentation | per protocol | Protocol | [T] | L |
| V-FER-10 | Vessel pressure | kPa (psi) | gauge / transducer | sealed fermentation | ≤ hourly [I] | ≤ vessel rating; SM-1 adjustable 0–103 kPa (0–15 psi) | [S:PEN-SM1] | M |
| V-FER-11 | Dissolved O₂ | mg/L | DO meter | submerged | optional | — | [T] | L |
| V-FER-12 | Conductivity | mS/cm | EC meter | submerged liquid, washwater | optional | — | [T] | L |
| V-FER-13 | Fill mass & headspace | kg; % | scale + derived | loading | each run | Tanque tina: 30 % free volume. Headspace = 1 − (kg/ρ)/V, with ρ cherry 616–622 and baba 803–827 kg/m³ | [S:AT408, AT370] | H |
| V-FER-14 | Inoculum dose | g/kg | scale | inoculation | each run | 1 g/kg (Cool Blue, Green Origins, Sunrise Orange); 2 g/kg (Deep Amber) | [S:FER-CB, FER-DA; R6] | H |
| V-FER-15 | Rehydration water temperature & time | °C; min | thermometer, timer | inoculation | each run | Cool Blue 10–25 °C; Deep Amber 15–35 °C; 15–30 min; 10× water | [S:FER-CB, FER-DA] | H |
| V-FER-16 | Yeast storage temperature | °C | fridge logger | yeast store | continuous | < 25 °C up to 6 months; < 15 °C long term; opened ≤ 4 °C for ≤ 7 days | [S:FER-CBT] | H |
| V-FER-17 | Water above mass / water changes | cm; h | ruler; log | submerged | each change | Fermentis: ≤ 1 cm above the mass. Anacafé: change every 10–12 h | [S:FER-CBT, ANA18] | M |
| V-FER-18 | Submerged water ratio | L per 100 kg | meter | submerged | each run | 30 L per 100 kg baba (50 % also tested) | [S:AT454, AT422] | M |
| V-WSH-01 | Rinses and water level | n; cm | log | washing | each batch | 4 rinses, 5–10 cm above the mass; water split 30/20/20/30 % | [S:AT408, AT422] | H |
| V-WSH-02 | Washing water | L/kg | meter | washing | each batch | 1.7 (submerged) to 2.0 (solid) per kg of fresh coffee (basis as reported) | [S:AT454, AT422] | M |
| V-DRY-01 | Moisture | % w.b. | oven / capacitance / Gravimet | drying, reposo | Sun: daily from day 4. Mechanical: hourly after 12 h | End 10–12 %; never > 12.5 % | [S:AT371]; R3 | H |
| V-DRY-02 | Gravimet mass | g | LAB-GRV + scale | drying | near the end | Targets under LAB-GRV | [S:AT577, AT580, HUI7] | H |
| V-DRY-03 | Water activity (+ sample temperature) | aw; °C | LAB-AW | end of drying, reposo | each lot | 0.61–0.63 at 10–12 % moisture; > 0.65 above 12 % | [S:AT583]; < 0.70 [S:R3] | H |
| V-DRY-04 | Bean / mass temperature | °C | probe | mechanical drying | hourly | ≤ 40 °C; ≤ 38 °C for seed | [S:ANA18, HUI7] | H |
| V-DRY-05 | Drying-air temperature (plenum) | °C | thermometer / thermostat | mechanical drying | continuous | Static ≤ 50 °C (thermostat 48–52); rotary ≤ 60 °C | [S:AT576, AT380, ANA18] | H |
| V-DRY-06 | Specific airflow | m³/min per t cps | fan curve / anemometer | mechanical drying | at commissioning, then yearly [I] | ≈ 100 (98–102); older value 66 | [S:AT576, AT380, AT562, AT282] | H |
| V-DRY-07 | Layer depth | cm | ruler | all drying | each load | Solar: 2 cm (≤ 3–4). Patio: 3–5 (Codex), ≤ 7 (Anacafé). Silo: < 35–40. Naturals, mechanical: < 50 | [S:AT577, AT371, CX69, ANA18, AT576, AT557] | H |
| V-DRY-08 | Load per area | kg/m² | derived | solar / patio | each load | 13–14 kg washed/m² at 2 cm; ≤ 20 kg wet parchment at 3 cm; 25–35 at 3–5 cm | [S:HUI7, AT577, AT371, CX69] | H |
| V-DRY-09 | Turns | n/day | log | solar / patio | daily | ≥ 3–4 a day; every 3–4 h for the first 3 days; every 2 h at 4 cm | [S:AT577, AT371, HUI7] | H |
| V-DRY-10 | Air reversal interval | h | log | silo | each reversal | 6–8 (older range 6–12) | [S:AT576, AT282] | H |
| V-DRY-11 | Dryer internal T/RH | °C; % | logger | solar dryer, dark room | ≤ 15 min | Run the extractor when inside RH > 95 % | [S:AT575] | M |
| V-DRY-12 | Ambient T/RH; sunshine or radiation | °C; %; h or W/m² | weather station | site | continuous | Annual sunshine band predicts drying days | [S:AT577] | M |
| V-DRY-13 | Drying duration | h, d | derived | per lot | — | Mechanical at 50 °C: 29.5 h from 53 %. Solar: 10.6–15.5 d. Naturals: solar 11–27 d, mechanical 8–12 d | [S:AT576, AT577, AT557] | H |
| V-DRY-14 | Time spent between aw 0.95 and 0.80 | d | derived from moisture curve | drying | per lot | ≤ 4 d (industry guidance) | [S:RC1] | L |
| V-DRY-15 | Fuel use | kg/kg cps | scale / meter | mechanical drying | per batch | Cisco ≈ 0.35–0.62; dried pulp 0.39–0.45; coal 2.8–3.8 kg/@; LPG ≈ 1 kg/@ | [S:AT380, AT576, AT591, PEN-QD] | M |
| V-DRY-16 | Electricity | kWh/kg cps | energy meter | mechanical drying | per batch | Reported 0.59 at 50 °C (unit as extracted; verify) | [S:AT576] | L |
| V-DRY-17 | Drying interruption | h | log | drying | each event | Avoid. 36–48 h at ≈ 47 % moisture → earthy in 100 % of samples | [S:AT562] | H |
| V-DRY-18 | Patio surface temperature | °C | IR thermometer | patio | midday | Avoid > 40 °C | [S:ANA18] | M |
| V-DRY-19 | Moisture uniformity | CV % | repeated readings | silo exit | per batch | 0.90–2.18 % after solar pre-drying + silo | [S:AT380] | M |
| V-CND-01 | Cooling before bagging | h | log | after drying | per lot | 8–10 h, covered | [S:ANA18] | M |
| V-CND-02 | Reposo (rest) | d | log | reposo | per lot | ≥ 21 d | [S:ANA18; R3] | M |
| V-STO-01 | Warehouse temperature | °C | logger | storage | ≤ 1 h | ≈ 22 (ISO); 20 (Anacafé); 10–12 extends shelf life | [S:ISO8455, ANA18, AT590] | H |
| V-STO-02 | Warehouse RH | % | logger | storage | ≤ 1 h | ≤ 60 (ISO). Above 80, coffee absorbs water (Codex). 69–77 acceptable at low temperature (Cenicafé) | [S:ISO8455, CX69, AT590] | H |
| V-STO-03 | Lot moisture & aw drift | %; aw | LAB-MMC, LAB-AW | storage | monthly | Stay within 10–12 % | [S:CTAHR, ANA18] | M |
| V-STO-04 | Pest monitoring | count | traps / inspection | storage | weekly [T] | No infestation in coffee entering storage | [S:ISO8455 §4.1.1] | M |
| V-STO-05 | Bag-to-wall and ridge clearance | m | tape | storage | audit | Wall > 0.8 m; ridge ≥ 2 m | [S:ISO8455] | H |
| V-TRN-01 | Moisture at loading and arrival | % | meter | transport | each shipment | ≤ 12.5 % everywhere | [S:CX69, ISO8455] | H |
| V-TRN-02 | Port dwell | h | log | transport | each shipment | ≤ 72 h | [S:ISO8455] | H |
| V-WW-01 | Effluent volume | L/d | meter | wastewater | daily | Ecomill 1.1–1.3 L/kg cps; Becolsub leachate 0.6–1.0 L/kg | [S:AT538, AT280] | H |
| V-WW-02 | pH (raw / treated / discharged) | pH | meter | wastewater | daily [I] | Raw 3–4; after lime 7.9–8.1; STLB outlet > 5; discharge 5.5–8.5 | [S:AT537, AT280; R4] | H |
| V-WW-03 | COD | mg/L | lab | wastewater | each campaign or monthly [I] | Raw 25,000–165,000; discharge limit 100 | [S:AT537, AT538, AT280; R4] | H |
| V-WW-04 | BOD₅, TSS | mg/L | lab; Imhoff cone [T] | wastewater | each campaign | Raw TSS 2,700; limits pending (R4) | [S:AT537; R4] | M |
| V-WW-05 | Lime dose | g/L | scale | primary treatment | each batch | Ca(OH)₂ 4.0–5.2 | [S:AT537] | M |
| V-BYP-01 | Pulp : washwater ratio, retention | kg/L; % | scale / meter | pulp structure | daily | 2–3 kg/L; 83–89 % retained within 24 h | [S:AT538] | M |
| V-BYP-02 | Pulp pit age | months | log | pit | monthly | 4–6 months to humus | [S:AT068] | M |
| V-BYP-03 | Dried pulp moisture | % | meter / oven | pulp fuel | per batch | ≤ 8 % | [S:AT591] | M |
| V-DML-01 | Hulling loss / outturn | % | scales | hulling | per lot | Washed 17.75–18.40 %; natural husk 54.6 % | [S:AT370, AT557] | H |
| V-DML-02 | Screen distribution | % per screen | LAB-SCS | grading | per lot | European Prep: ≤ 5 % below screen 15 | [S:RC2] | M |
| V-DML-03 | Rejects by stage | % | scales | catador, gravity table, optical, hand | per lot | — | [T] | L |
| V-DML-04 | Throughput | kg/h | scale / timer | each machine | per run | Hand sorting ≈ 60 kg per person per day | [S:RC3] | M |
| V-DML-05 | Free-settled density | g/mL | LAB-DEN | grading | per lot | 0.64 low to 0.69+ high (one importer) | [S:RC4] | L |
| V-INS-01 | Readings taken on in-calibration instruments | % | derived | all | monthly | Target 100 % | [I] | — |
| V-INS-02 | Moisture-meter bias vs ISO 6673 | % points | reference samples | lab | before harvest, and on drift | Expanded uncertainty at k = 2 | [S:ISO24115, CX69] | H |

---

## 4. Equipment master list (deliverable c)

| Code | Type | Subtypes | Attributes to store | Maintenance / calibration |
|---|---|---|---|---|
| REC-SCL | Reception scale | platform, hanging, truck | capacity_kg, readability_g, legal class | Weekly test-weight check; legal verification [T] |
| REC-HOP | Hopper | dry, wet; wood, steel, concrete | volume_m3, wall_angle_deg, material, water_fed, cover | Clean daily [S:ANA18]; regrease cover each harvest [S:AT297] |
| REC-HLD | Holding area | shade, sacks, crates, bins, hermetic | capacity_kg, container_type, shaded, ventilated | Wash crates [T] |
| REC-SIF | Siphon / flotation | tank, floater screen, with drainer | capacity_kg_h, dims, material, outlet_in, recirculation | Clean daily [S:ANA18] |
| REC-PCL / REC-DST | Pre-cleaner, wet destoner | air, water | capacity, power_kw, dims | Replace wear parts [S:PEN-AP20] |
| TRN-* | Conveyors | channel, fruit pump, screw, bucket elevator, gravity | capacity_kg_h, diameter_mm, pitch_mm, rpm, water_l_min | Daily lubrication and bolt check [S:ANA18] |
| PUL-* | Pulper | horizontal drum, vertical, disc; manual or motor | capacity_kg_h, chorros, motor_kw, rpm, water_free, jacket/breast material, gap_mm | Daily inspection; recalibrate with shims based on sampling [S:AT294, ANA18] |
| PUL-SCR | Screen | rotary, reciprocating | diameter_m, length_m, rpm, aperture_mm | Check apertures for wear [T] |
| DEM-* | Demucilager / washer | upflow (Deslim, DELVA), Becolsub, Ecomill, Ecowasher, enzyme doser | capacity_kg_h + basis, motor_kw, rotor_rpm, water_l_kg_cps, flow_control | Flow *aforo* each season; daily wash [S:AT405, AT432] |
| WSH-* | Tanque tina, channel, hydrocyclone | — | volume_l, dims, slope_pct, drain_in, finish/colour, hydrocyclone geometry, inlet_kpa | Clean daily [S:ANA18] |
| FER-OPN / FER-CON | Open / conical tank | tiled or epoxy concrete, stainless 304/430, MDPE/HDPE | material, food_contact_ref, volume_l, geometry, cone_deg, floor_slope_pct, outlet_d, insulation, shade, location | Clean daily [S:ANA18]; inspect lining for cracks [T] |
| FER-SLD (+ DRM, BAG, IBC) | Sealed vessel | tank, bioreactor, drum, barrel, bag, IBC | As above, plus pressure_rating_kpa, relief_set_kpa, one_way_valve, gas_ports, sample/probe ports, manway, leachate_tank_l, jacket, agitation, sensors | Check valves and gaskets each run; test relief valve [T] |
| THM-* | Thermal | jacket + chiller, cold room, freezer, bath, yeast fridge | setpoint_range_c, capacity_kw, refrigerant, volume_m3, alarm | Probe check; defrost; seals [T] |
| DRY-PAT | Patio | concrete, brick, asphalt, earth, tarp | area_m2, slope_pct, surface, drainage, covers available | Clean daily [S:ANA18] |
| DRY-BED / DRY-CBD | Raised or covered bed | PE mesh, shade cloth, metal mesh; stacked trays | area_m2, height_cm, width_m, mesh_material, mesh_opening_mm, shade_pct, cover, tiers | Replace mesh [T]; clean covers [S:AT577] |
| DRY-PAR / MOD / ELB | Solar dryer | parabolic, tunnel, marquesina, modular PC, casa elba, carts | area_m2, dims, orientation, cover material + thickness/gauge, transmission_new_pct, install_date, vents, extractor + RH setpoint, floor, river stones | Replace cover (PE 2–5 yr; PC > 8 yr) [S:AT575, AT305, AT281]; clean with water, never detergent [S:AT577] |
| DRY-DRK | Dark / controlled room | dehumidified, HVAC | volume_m3, dehumidifier_l_day, fans, light_exclusion, setpoints | Clean filters and coils [T] |
| DRY-SIL / ROT / VRT | Mechanical dryer | static (1–3 levels), guardiola, vertical | capacity_kg_cps, layer_max_cm, chambers, airflow_m3_min, fan_kw, static_pressure, drum_rpm, air_reversal, control | Clean daily [S:ANA18]; yearly airflow check [I]; verify thermostat [T] |
| DRY-FUR | Furnace / heat exchanger | indirect exchanger, direct burner; cisco, pulp, wood, coal, LPG, diesel | fuel, firing, efficiency_pct, hopper_kg, autonomy_h, thermostat band | Operate per design [S:AT371]; leak-test exchanger for smoke entering the air stream; remove ash [T] |
| STO-BIN | Rest bins | wood, ventilated | capacity_kg, material | Clean between lots [T] |
| STO-WHS / STO-CLD | Warehouse, cold store | ventilated, insulated, refrigerated | area_m2, roof_insulated, ridge_clearance_m, floor_dpc, pallets, lighting, zones (organic, rejects), pest contract | Broom-clean; pest programme [S:ISO8455] |
| STO-PKG | Packaging | fique/jute/sisal; hermetic multilayer (PE-EVOH, PE-PAV, PE-doble, PP-PVC); vacuum | type, barrier class, capacity_kg, reuse_count | Inspect for punctures [T] |
| BYP-* | Byproduct units | pit, washwater absorption, worms, fuel store, cascara beds | volume_m3, roof, floor_slope_pct, leachate_tank_l, cover | Regrease covers [S:AT297]; turn pulp [S:AT068] |
| WW-* | Wastewater units | lime + settling, STLB, SMTA/UASB, lagoon, green filter, drying bed | volume_m3, dims, packing, design HRT_d, design_flow_l_d, discharge point, permit ref | STLB: 1 labour-day a year; re-plaster UCI every 2 years [S:AT280]; remove sludge [T] |
| DML-* | Dry-mill machines | pre-cleaner, destoner, parchment or cherry huller, polisher, catador, screen grader, gravity table, optical sorter (RGB/IR/UV), hand belt, magnet, metal detector, bagging scale | capacity_kg_h, power_kw, screens installed, camera types, reject settings | Wear parts, screen checks, sorter calibration, metal test pieces [T] |
| LAB-* | Instruments | see §2.9 | make, model, serial, range, resolution, accuracy, calibration policy | Per §2.9 |

---

## 5. Recommended data model (deliverable d)

### 5.1 Hierarchy

```
Site (farm; altitude; coordinates; weather_station; authority_profile)
 └─ Facility (wet_mill | fermentation_room | cold_storage | drying_yard | dryer_house |
              dry_mill | warehouse | lab | wastewater | utility)
     └─ Asset (asset_type = code from §4; attributes = JSON by type, §5.3)
         ├─ Component (valve, jacket, fan, furnace, cover; its own maintenance)
         └─ Sensor (a fixed instrument channel at a named position)
Instrument (mobile or fixed) ── CalibrationEvent
Asset ── MaintenanceEvent, SanitationEvent
Allocation (Asset × ProtocolRun step × Lot × time window × fill)
MeasurementRecord (variable × value × Instrument/Sensor × Allocation × step × Lot)
```

### 5.2 Core entities

```jsonc
Site { id, name, farm_id, lat, lon, altitude_m, timezone,
       weather_station_asset_id?,
       authority_profile: "ANACAFE"|"CENICAFE"|"CODEX"|"custom" }   // picks default thresholds

Facility { id, site_id, type, name, floor_area_m2?, covered: bool,
           climate_controlled: bool, notes }

Asset { id, facility_id, asset_type,            // e.g. "FER-SLD"
        subtype,                                 // e.g. "bioreactor", "guardiola"
        name, manufacturer?, model?, serial?, year?,
        status: "active"|"idle"|"under_repair"|"retired",
        capacity: {value, unit, basis},          // {1500, "kg/h", "cherry"}
        food_contact?: {material, grade?, compliance_refs: ["21CFR177.1520", ...]},
        attributes: {...},                       // §5.3, validated per asset_type
        components: [Component], sensors: [Sensor],
        maintenance_plan: [{task_code, interval_days|interval_hours|per_season, source_ref}],
        sanitation_plan: [{procedure_id, frequency: "per_batch"|"daily"|"per_season"}],
        documents: [file_id], photos: [file_id] }

Instrument { id, instrument_type,               // LAB-* code
             make, model, serial, range: {min, max, unit}, resolution, accuracy,
             principle?,                          // "capacitance", "NDIR", "dew_point"
             grain_curve?,                        // moisture meters: "parchment"|"green"|"cherry"
             fixed_asset_id?,
             calibration_policy: {method, standard_ref, interval_days?,
                                  before_season: bool, on_events: ["battery", "drop", "drift"]} }

Sensor { id, instrument_id, asset_id,
         position: "mass_core"|"mass_top"|"mass_bottom"|"plenum"|"exhaust"|"headspace"|
                   "liquid"|"ambient_in"|"ambient_out"|"surface",
         depth_cm?, logging_interval_s, logger_id? }

CalibrationEvent { id, instrument_id, ts, method,
                   reference_items: [{id, value, uncertainty}],
                   pre: {bias, slope?}, post: {bias, slope?}, expanded_uncertainty_k2?,
                   result: "pass"|"fail"|"adjusted", next_due, by, certificate_file? }

MaintenanceEvent { id, asset_id, component_id?, ts,
                   type: "preventive"|"corrective"|"inspection",
                   task_code, hours_meter?, parts: [], findings, by }

SanitationEvent { id, asset_id, ts, procedure_id, agent?, concentration?, contact_min?,
                  rinse_water_source?, verification: "visual"|"ATP"|"swab"|"none", by }

Allocation { id, asset_id, lot_id, protocol_run_id, step_seq, start_ts, end_ts?,
             fill_mass_kg?, fill_volume_l?, area_used_m2?,
             derived: {headspace_pct?, layer_depth_cm?, load_kg_m2?, airflow_m3_min_t?} }

MeasurementRecord { id, ts, variable_code,      // V-* from §3
                    value, unit,
                    method,                      // "ISO6673_oven"|"capacitance"|"gravimet"|...
                    instrument_id?, sensor_id?, allocation_id?, asset_id?,
                    lot_id, protocol_run_id?, step_seq?,
                    sample: {position?, mass_g?, temp_c?, equilibrated_min?},
                    operator, source: "manual"|"logger"|"import",
                    calibration_state: "valid"|"expired"|"unknown",   // derived at write time
                    qc_flags: [] }

Deviation { id, protocol_run_id, step_seq, variable_code, expected, observed,
            severity, action, by }
```

**Change to R6.** Replace the inline `ProtocolStep.vessel {type, material, volume_l, valve, headspace_pct}` with two parts. The **protocol** keeps a `vessel_requirement` (capabilities needed). The **run** records an `Allocation` to a real asset. Headspace and layer depth then become derived values, not typed-in ones [I].

### 5.3 Asset attributes by type (JSON)

```jsonc
"FER-*": {                                  // open, conical, sealed, drum, barrel, bag, IBC
  vessel_class: "open_tank|conical_tank|sealed_tank|bioreactor|drum|barrel|bag|ibc",
  material: "concrete_tiled|concrete_epoxy|ss304|ss316|ss430|mdpe|hdpe|pp|wood_oak|multilayer_film",
  geometry: {shape, length_m?, width_m?, diameter_m?, height_m, cone_angle_deg?,
             floor_slope_pct?, corner_radius_mm?},
  nominal_volume_l, working_volume_l, max_fill_kg: {cherry?, depulped?},
  closure: {type: "open|lid|manway|clamp|tie", gasket_material?},
  pressure: {rating_kpa?, relief_set_kpa?, one_way_valve: bool, airlock_type?},
  gas_ports: [{gas: "CO2|N2|Ar", connector}],
  ports: [{type: "drain|sample|probe|leachate|cip|inlet|outlet", size_in, height_cm}],
  leachate_tank_l?, agitation: {type?, rpm_range?},
  thermal: {insulation?, jacket: bool, medium?: "glycol|water", chiller_asset_id?, control_range_c?},
  light_exclusion: bool, location: "indoor|outdoor_shaded|outdoor_sun|cold_room",
  colour?: "light|dark" }                   // AT408: light colours make residue visible

"DRY-SIL|DRY-ROT|DRY-VRT": {
  dryer_class, capacity_kg_cps_batch, capacity_l?, chambers?, layer_max_cm?, drum_rpm?,
  airflow_m3_min, static_pressure_pa?, fan: {type, power_kw}, air_reversal: bool,
  heat_asset_id, control: {type: "manual|thermostat|PID", band_c?},
  sensor_positions: ["plenum", "mass_core", "exhaust"] }

"DRY-FUR": { fuel: [], firing: "indirect_exchanger|direct", exchanger_type?, efficiency_pct?,
             hopper_kg?, autonomy_h?, ash_handling? }

"DRY-PAT|BED|CBD|PAR|MOD|ELB|DRK": {
  structure_class, area_m2,
  surface: "concrete|brick|asphalt|earth|tarp|pe_mesh|shade_cloth|metal_mesh|bamboo",
  mesh_opening_mm?, height_above_ground_cm?, bed_width_m?, tiers?, slope_pct?,
  cover: {material: "pe_film|pc_solid|pc_alveolar|shade_net|none", thickness_mm?, gauge?,
          uv: bool, shade_pct?, transmission_new_pct?, installed_on?},
  orientation_deg?, vents: {side_opening_cm?, doors?}, extractor: {present, rh_setpoint_pct?},
  night_protection: "cover|heap_and_cover|lower_sheet|closed_room",
  ground_treatment?: "river_stones|drain",
  dehumidifier_l_day?, hvac_setpoints?: {t_c, rh_pct}, light_exclusion?: bool }

"PUL-*": { pulper_class: "horizontal_drum|vertical|disc", chorros?, capacity_kg_h, motor_kw?,
           drive: "manual|electric|combustion", rpm?, water_free: bool,
           jacket_material?, breast_material?, adjustment: "shims|screw", gap_mm? }

"DEM-*|WSH-*": { class: "upflow|becolsub|ecomill|washer|tina|channel|hydrocyclone|enzyme_doser",
                 capacity_kg_h, basis, motor_kw?, rotor_rpm?, water_l_kg_cps?,
                 flow_control?: "orifice|rotameter|pump|valve", dims?, inlet_kpa? }

"REC-*": { class: "dry_hopper|wet_hopper|siphon|pre_cleaner|destoner|scale|holding",
           volume_m3?, wall_angle_deg?, material?, capacity_kg_h?,
           cover?: "greased_plastic|none", water_recirculation?: bool }

"THM-*": { class: "cold_room|chiller|freezer|bath|yeast_fridge", volume_m3?, setpoint_range_c,
           capacity_kw?, refrigerant?, rh_control?: bool, alarm: bool }

"STO-*": { class: "bin|warehouse|cold_store|packaging", area_m2?, roof_insulated?,
           ridge_clearance_m?, floor_dpc?, pallet_type?, zones?: [], lighting?: "aisles_only|general",
           pest_contract_ref?, barrier_class? }

"WW-*|BYP-*": { class, volume_m3?, dims?, packing_media?, design_flow_l_d?, hrt_d?, roof?,
                floor_slope_pct?, leachate_tank_l?, discharge_point?, permit_ref? }

"DML-*": { class, capacity_kg_h, power_kw?, screens?: [n_64ths], camera?: ["RGB","IR","UV"],
           reject_setting? }
```

### 5.4 Linking measurements, protocol steps and calibration

1. **Calibration state at write time.** `calibration_state = valid` only if the instrument's last `CalibrationEvent` passed and `next_due ≥ ts`; otherwise flag the record (R3 rule) [S:R3]. Capacitance moisture readings are also flagged "warm sample" unless `equilibrated_min ≥ 30` [S:AT580]; aw readings require `sample.temp_c` [S:AT583].
2. **Allocation gives readings meaning.** Linking a reading to an `Allocation` (asset × run step) tells the app whether a probe value is mass core, plenum or headspace [I].
3. **Setpoints come from the protocol** (R6 `ProtocolStep.setpoints`). §3 references drive **warnings only**; safety (pressure ≤ vessel rating) and legal limits (discharge, R4) may block [I].
4. **Capability check at planning** [I]: `co2_flushed` needs `gas_ports` and a sealable closure; a below-ambient setpoint needs `thermal.jacket` or a cold room; dark-room drying needs `light_exclusion`; mechanical drying without an `indirect_exchanger` furnace raises the AT371 smoke-risk warning.
5. **Authority profile.** The site's `authority_profile` picks defaults where sources disagree (§6) [I].

### 5.5 Derived checks and KPIs

- **Headspace %** = 100 × (1 − (fill_kg/ρ)/V). Bulk densities ρ (kg/m³): cherry 616–622; baba 803–827; washed 694–702; drained 678–687; dry parchment 386–391; green 707–710 [S:AT370].
- **Layer depth (cm)** = load (kg/m²) / ρ × 100. Check: 14 kg/m² of drained parchment (687 kg/m³) ≈ 2.0 cm, which matches AT577's 2 cm [I].
- **Gravimet target mass** m_t = m₀ × (1 − w₀)/(1 − w_t). Check: 700 g at 52.5 % → 369–378 g for 10–12 %, consistent with AT580's 370–375 g [I].
- **Tank volume:** V_baba (L) = 0.666 × kg cherry [S:AT408]. This agrees with AT370 densities (1 kg cherry → 0.55 kg baba → 0.67 L) [I].
- **Specific airflow** = airflow_m3_min / (batch kg cps / 1000), compared with ≈ 100 [S:AT576].
- **Water** (L/kg cps) per stage and in total; **COD load** (kg/day) = volume × COD [I].
- **Drying rate** (%-points/day); time spent between aw 0.95 and 0.80; fuel (kg/kg cps); energy (kWh/kg cps) [I].
- **Pulper and demucilager quality indices** (V-PUL, V-DEM); **reject %** by dry-mill stage [I].
- **Mass balance per asset** (kg in vs out), tied to R3's conversion factors [S:R3].
- **Instrument compliance %** (V-INS-01) [I].

---

## 6. Contradictions and open gaps

**Contradictions, with a suggested app rule for each [I unless tagged]:**

1. **Holding time.** Anacafé 10 h [S:ANA18] vs Cenicafé 48 h without score loss [S:AT589].
   - Rule: default to the profile's limit, and always require V-REC-03 (mass core temperature) when the hold exceeds 10 h.
2. **°Brix endpoints.** AT454 (solid 12–14; submerged 8–9) vs AT422 (solid 15–17; submerged 5.8–7.9).
   - Rule: information only; protocol endpoints rule.
3. **Mass vs air temperature.** Anacafé sets mass ≤ 40 °C [S:ANA18]; with Cenicafé's 50 °C air, beans reached 48 °C [S:AT576].
   - Rule: alarm on bean temperature, not on air temperature alone.
4. **Drying interruptions.** Anacafé recommends an 8–10 h nightly stop [S:ANA18]; Cenicafé says do not interrupt [S:AT562].
   - Rule: warn on any interruption while moisture > 30–40 % (aw > 0.90), and allow a planned nightly stop below that, with a cool-down log. The 30–40 % gate is my inference, based on AT562's tested states (≈ 42–47 %) and AT380's solar pre-drying to ≈ 40 % before silo finishing.
5. **Warehouse RH.** ISO ≤ 60 % [S:ISO8455]; Anacafé 65 % [S:ANA18]; Cenicafé found 69–77 % acceptable at low temperature [S:AT590]. Store RH limits as a function of temperature.
6. **Wall distance.** ISO > 0.8 m vs Anacafé 0.5 m. Default to ISO.
7. **Airflow.** 66 m³/min/t (2000) [S:AT282] vs ≈ 100 (2009–2025) [S:AT380, AT576, AT562]. Use 100.
8. **Solar layer depth.** Codex 3–5 cm [S:CX69] vs Cenicafé 2 cm (≤ 3, up to 4 with turning every 2 h) [S:AT577, AT371].
9. **Wooden vessels.** Cenicafé advises against them [S:AT422], yet barrel ferments are trade practice [S:R6]. Allow them, but attach a higher-risk sanitation plan.

**Open gaps:** dry-mill machine settings (huller gaps, polisher heat, catador airflow); SMTA design values (retention, loading); green-filter loading rates; cold-room design and condensation; sanitizer agents and concentrations; CO₂ exposure limits and confined-space rules; cascara food safety; casa elba and East-African bed geometry; plastic-drum pressure ratings; glycol systems; optical-sorter specs; Pinhalense data (blocked).

**Package updates suggested:**
- R3 gap #3 (mucilage %): partly closed [S:HUI7].
- R3 gap #5 (TA): reference trajectories now available [S:AT422, AT563].
- Add `drying.airflow_m3_min_t = 100`, `drying.air_reversal_h = 6–8`, `drying.solar_load_kg_m2 = 14` and `holding.mass_temp_logging_required = true`.

---

## 7. Sources (all fetched successfully, 2026-10-02)

**Institutional, standards and industry.**

| ID | Source | URL |
|---|---|---|
| ANA18 | Anacafé / CEDICAFE (2018). *Boletín técnico: buenas prácticas de beneficiado húmedo* | https://www.anacafe.org/uploads/file/1296dfe8b18b492583788afbfb8420d9/Boletin-Tecnico-CEDICAFE-2018-10.pdf |
| ANA24 | Anacafé (2024). *Guía de Rentabilidad Sustentable* (only a 5 : 1 cherry : parchment factor; no equipment data) | https://www.anacafe.org/uploads/file/81a9d8e4afa248758a35f078ca49dc29/Guia-Rentabilidad-Sustentable-2024.pdf |
| CX69 | Codex CXC 69-2009, OTA prevention in coffee | https://www.fao.org/input/download/standards/11250/CXP_069e.pdf |
| CEN66 | Ramírez, Oliveros & Sanz (2015). *Rev. Cenicafé* 66(1):46–60 | https://www.cenicafe.org/es/publications/5.Manejo.pdf |
| HUI7 | Pabón & Osorio. Cenicafé Huila book, ch. 7 | https://biblioteca.cenicafe.org/bitstream/10778/4227/1/Cap07.pdf |
| AT370 | Montilla-Pérez et al. (2008). Avance Técnico 370 | https://biblioteca.cenicafe.org/bitstream/10778/358/1/avt0370.pdf |
| ICF | ICAFE (2016). *Estructura de costos de beneficiado 2015-16* | https://www.icafe.cr/wp-content/uploads/informacion_mercado/costos_actividad/beneficiado/ECBC1516.pdf |
| ISO8455 | ISO 8455:2011 sample | https://cdn.standards.iteh.ai/samples/44601/12370ba7638544edb01e8dff4582a93c/ISO-8455-2011.pdf |
| ISO24115 | ISO 24115:2012 sample | https://cdn.standards.iteh.ai/samples/44603/55f959bd9a884557b24ef123726ab237/ISO-24115-2012.pdf |
| CTAHR | Gautz, Smith & Bittenbender (2008). CTAHR EN-3 | https://www3.ctahr.hawaii.edu/oc/freepubs/pdf/EN-3.pdf |
| RC1 | Royal Coffee, *Green Coffee Analytics* Part I (moisture, aw) | https://royalcoffee.com/green-coffee-analytics-relevance-to-roasters-buyers-and-producers-part-i-moisture-content-and-total-water-activity/ |
| RC2 | Royal Coffee, Part II (screen size) | https://royalcoffee.com/blogs/blog/green-coffee-analytics-part-ii-screen-size |
| RC3 | Royal Coffee, Part III (visual defects) | https://royalcoffee.com/blogs/blog/green-coffee-analytics-part-iii-visual-defects |
| RC4 | Royal Coffee, Part IV (density) | https://royalcoffee.com/green-coffee-analytics-part-iv-density/ |
| CFR | 21 CFR 177.1520, Olefin polymers (eCFR) | https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-177/subpart-B/section-177.1520 |

**Cenicafé *Avances Técnicos*.** Found by navigating the archive (https://publicaciones.cenicafe.org/index.php/avances_tecnicos/issue/archive) and the site search (https://publicaciones.cenicafe.org/index.php/avances_tecnicos/search/search?query=secado).

| ID | Title (year) | URL |
|---|---|---|
| AT058 | Normas para el diseño de beneficiaderos (1976) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/2120/5484 |
| AT068 | Fosas para pulpa de café (1977) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/2109/5474 |
| AT161 | Pulpa y lombriz roja californiana (1991), abstract only | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/view/2006 |
| AT164 | Despulpado de café sin agua (1991), abstract only | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/view/2003 |
| AT187 | Manejo del agua en el beneficio húmedo (1993) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1974/5355 |
| AT216 | El desmucilaginado mecánico del café (1995) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1932/5327 |
| AT217 | Desmucilaginadores mecánicos de café (1995) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1931/5326 |
| AT241 | Lavado y clasificación en el hidrociclón (1997) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1905/5300 |
| AT280 | Tratamiento primario de lixiviados Becolsub (2000) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1815/5246 |
| AT281 | Utilice la energía solar para secar café (2000) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1814/5245 |
| AT282 | El secado mecánico del café (2000) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1813/5243 |
| AT294 | Nueva despulpadora (2001) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1798/5222 |
| AT297 | Broca en tolvas y fosas (2002) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1792/5194 |
| AT305 | Construya el secador solar parabólico (2002) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1782/5180 |
| AT345 | Paseras solares de bajo costo (2006) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1696/5128 |
| AT351 | Aseguramiento de la calidad e inocuidad (2006) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1687/5120 |
| AT371 | Riesgos para la calidad e inocuidad en el secado (2008) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1662/5078 |
| AT380 | Energía en el secado mecánico (2009) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1654/5062 |
| AT405 | Flujos de café y agua en el módulo Becolsub (2011) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1363/1543 |
| AT408 | Construya su tanque tina (2011) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/513/568 |
| AT422 | Factores, procesos y controles en la fermentación (2012) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/495/549 |
| AT431 | Método Fermaestro (2013) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/271/330 |
| AT432 | ECOMILL® (2013) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/485/530 |
| AT454 | Fermentación controlada del café (2015) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/325/388 |
| AT481 | Método CERPER-2 (2017) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/295/356 |
| AT496 | Tanque de fermentación en plástico, Ecomill (2018) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/170/135 |
| AT537 | Uso de cales para aguas residuales (2022) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/163/129 |
| AT538 | Aguas residuales del lavado con Ecomill (2022) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/164/130 |
| AT548 | Filtros verdes (2023), abstract only | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/view/298 |
| AT554 | Métodos de fermentación modificados (2023) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/532/614 |
| AT557 | Procesamiento por vía seca, cafés naturales (2023) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/882/1072 |
| AT562 | Interrupción del secado mecánico (2024) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1541/1700 |
| AT563 | Fermentaciones prolongadas del mucílago (2024) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1543/4430 |
| AT575 | Secadores solares modulares (2025) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/4161/4290 |
| AT576 | Temperatura del aire de secado (2025) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/4192/4400 |
| AT577 | Manejo del café en el secado solar (2025) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/4247/4638 |
| AT580 | Método GravimetSM2 (2025) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/4317/4639 |
| AT583 | Actividad de agua y calidad (2026) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/5051/5699 |
| AT589 | Reserva de los frutos y calidad (2026) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/5752/6617 |
| AT590 | Almacenamiento y empaque del excelso (2026) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/5753/6618 |
| AT591 | Pulpa de café como biocombustible (2026) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/5755/6614 |

**Vendors (product pages; vendor claims).**

| ID | Page | URL |
|---|---|---|
| PEN-SIF | Penagos, tanque sifón | https://penagos.com/productos/tanque-sifon/ |
| PEN-AP20 | Penagos, prelimpiador AP-20 | https://penagos.com/productos/prelimpiador-neumatico-ap-20/ |
| PEN-DST | Penagos, despedregador | https://penagos.com/productos/despedregador/ |
| PEN-TRN | Penagos, preclasificación y transporte (category) | https://penagos.com/categoria-producto/accesorios-de-preclasificacion-y-transporte-de-cafe/ |
| PEN-DH4 | Penagos, DH-4 | https://penagos.com/productos/despulpadora-horizontal-dh-4/ |
| PEN-DV255 | Penagos, DV-255 | https://penagos.com/productos/despulpadora-vertical-dv-255/ |
| PEN-UDC | Penagos, UDC-2000 | https://penagos.com/productos/unidad-de-despulpe-y-clasificacion-udc-1specialtycoffees/ |
| PEN-ECO | Penagos, ECOLINE-400 | https://penagos.com/productos/unidad-de-beneficio-ecologico-para-cafe-ecoline-400/ |
| PEN-DELVA | Penagos, DELVA | https://penagos.com/productos/desmucilaginador-elevador-lavador-vertical-ascendente-delva/ |
| PEN-EW1500 | Penagos, Ecowasher 1500 | https://penagos.com/productos/ecowasher-1500/ |
| PEN-TF | Penagos, tanques de fermentación (category) | https://penagos.com/categoria-producto/tanques-de-fermentacion/ |
| PEN-SM1 | Penagos, biorreactores herméticos | https://penagos.com/productos/biorreactores-hermeticos/ |
| PEN-BM | Penagos, BioMáster PRO | https://penagos.com/productos/biomaster/ |
| PEN-SG | Penagos, secadora rotativa SG | https://penagos.com/productos/secadora-rotativa-sg/ |
| PEN-SC | Penagos, secadora de silo SC | https://penagos.com/productos/secadora-de-silo-sc/ |
| PEN-QD | Penagos, QDryer 900 L | https://penagos.com/productos/secadora-qdryer900/ |
| PEN-ED | Penagos, Ecodryer | https://penagos.com/productos/ecodryer/ |
| FER-COF | Fermentis, coffee page (no vessel guidance) | https://fermentis.com/en/fermentation/other-beverages/coffee/ |
| FER-CB | Fermentis, SafCoffee Cool Blue | https://fermentis.com/en/product/safcoffee-cool-blue/ |
| FER-CBT | Fermentis, Cool Blue technical data sheet | https://cdn.bfldr.com/G7S7MSWL/as/kn5sqq6qf8kkvs5bt7vkgjn/SafCoffee_Cool_Blue_TDS_-_Technical_Data_Sheet |
| FER-DA | Fermentis, SafCoffee Deep Amber | https://fermentis.com/en/product/safcoffee-deep-amber/ |
| BUH | Bühler, coffee optical sorting | https://www.buhlergroup.com/global/en/process-technologies/Optical-Sorting/Coffee-sorting.html |
| GP | GrainPro, hermetic bags (no specs published) | https://www.grainpro.com/grainpro-bags |

Sibling reports: R2, R3, R4 and R6 in `/home/claude/research/`.
