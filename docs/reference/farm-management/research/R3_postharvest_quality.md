# R3 — Post-harvest & Quality: Standards, Methods and Generic Reference Ranges

Prepared 2026-10-01 for the farm-ref package (`01_DOMAIN_REFERENCE.md` §9–10, §16–17; `02_ACTIVITY_TAXONOMY.md` HAR.*; `04_reference_parameters.json`).

**Scope.** This report covers standards, measurement methods and generic reference ranges. It does **not** set fermentation rules. The app's per-protocol thresholds (washed, natural, honey, CryoBloom cold-hold, yeast-inoculated) take precedence over every fermentation number below. Those numbers are context for validation and plausibility checks, not targets.

**Method and caveats.**
- Every number below came from a source fetched during this research. A cell reads "not found" where I could not verify a value.
- Paywalled ISO standards were read only from their official preview or sample pages (scope, method clauses).
- One source was blocked (SCA 104 full text, HTTP 404/403). Values I could only confirm from secondary sources are marked **secondary** and given lower confidence.
- Source types: `std` = standards body (SCA/ISO/Codex); `inst` = national research institute (Cenicafé, Anacafé, ICAFE, FNC); `peer` = peer-reviewed; `ext` = university extension; `ind` = industry/importer; `sec` = secondary (blog, wiki, tool).
- Confidence: H = primary standard or institute document read directly; M = peer-reviewed single study, or a primary source read only in part; L = secondary or inferred.

---

## 1. Ripeness

| Parameter | Value | Unit | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Ripeness stages (colour scale) | 8 stages: Verde 1–3, Verde-amarillo, Pintón, Maduro, Sobremaduro, Seco (182–231 days after flowering, Pantone-referenced) | stages | Cenicafé, *Cambios físicos y químicos durante la maduración del fruto* (Cenicafé 54(3):208-225) | https://www.cenicafe.org/es/publications/arc054(03)208-225.pdf | inst/peer | 2003 | H |
| Soluble solids rise linearly with ripening; maximum in overripe fruit | 23.83 at 224 daf (overripe) | °Brix | Cenicafé 54(3) | same | inst/peer | 2003 | H |
| Best cup quality window | semi-ripe → overripe (210–224 daf); avoid green and dry | — | Cenicafé 54(3) | same | inst/peer | 2003 | H |
| Brix by stage, cv. Caturra (mucilage, digital refractometer) | unripe 18.3 · semi-ripe 19.8 · ripe 21.2 · overripe 22.1 | °Brix | Martínez, Aristizábal & Moreno, *Vitae* 24(1):47-58 | https://www.redalyc.org/journal/1698/169853018006/html/ | peer | 2017 | M |
| Brix by stage, cv. Colombia | unripe 17.9 · semi-ripe 19.5 · ripe 21.5 · overripe 22.8 | °Brix | same | same | peer | 2017 | M |
| Unripe-fruit tolerance in harvested mass | < 2.5 % does not affect cup; from 2.5 % unripe, ~30 % of cups rejected (taints, ferment, stinker) | % by mass | same (cv. Colombia) | same | peer | 2017 | M |
| Harvest composition for > 80 pts | unripe < 2.5 %, semi-ripe < 25 %, ripe > 40 % | % | same | same | peer | 2017 | M |
| Floater % limit | **No authoritative numeric limit found.** The SCA/CQI grading form scores "Floater" as a Category 2 green defect (5 beans = 1 full defect). | — | SCA Washed Arabica Green Grading Form | https://static1.squarespace.com/static/587af1d4db29d69a1a226b95/t/62435404ad79c402b923dbe4/1648579588955/SCA+Washed+Arabica+Green+Grading+Form.pdf | std | n.d. | M |
| Cenicafé field tools | Mediverdes® (harvest-quality / % green), Cromacafé® (ripeness colour) — named, values not extracted | — | Peñuela-Martínez et al., *7P®* Avance Técnico | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/view/273 | inst | 2022 | M |

**Notes.**
- Brix figures depend on what was measured: mucilage drop, whole-pulp juice, or skin. Both studies above used mucilage or pulp extract. Cultivar and altitude shift the curve.
- The package's 15–25 °Brix band contains all values found (17.9–23.8). It works as an outer plausibility range. A 15 °Brix reading is below every published "unripe" value found.

---

## 2. Mass conversion factors and units

| Parameter | Value | Unit | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Cherry : dry parchment (cps), washed | 4.94 (selected) / 4.89 (unselected); historic Uribe 1977: 4.50 | kg/kg | Montilla-Pérez et al., Cenicafé Avance Técnico 370, *Propiedades físicas y factores de conversión* (cv. Colombia) | https://biblioteca.cenicafe.org/bitstream/10778/358/1/avt0370.pdf | inst | 2008 | H |
| Cherry → parchment multiplier | 0.20 | kg cps / kg cherry | same | same | inst | 2008 | H |
| Cherry → green (almendra) multiplier | 0.16 (≈ 6.25 : 1) | kg/kg | same | same | inst | 2008 | H |
| Cherry → wet washed parchment ("café húmedo") | 0.39–0.41 | kg/kg | same | same | inst | 2008 | M |
| Dry parchment : green | 1.25 (stable 1977–2006); so green/parchment = 0.80 | kg/kg | same | same | inst | 2008 | H |
| Cherry : fresh pulp | 2.30–2.33 (pulp ≈ 43 % of fruit); pulp ≈ 40 % of fruit (wet basis) per Cenicafé 2015 | kg/kg | same; Cenicafé 66(1):46-60 | same; https://www.cenicafe.org/es/publications/5.Manejo.pdf | inst | 2008 / 2015 | H |
| Parchment moisture for conversions | 11–12 % (ISO 6673 basis) | % w.b. | AVT 370 | same | inst | 2008 | H |
| Bulk densities | fresh cherry 621.6 · fresh pulp 299.7 · parchment 391.4 · green 710.0 | kg/m³ | AVT 370 | same | inst | 2008 | H |
| Mucilage % of cherry | **Not verified** in the sources fetched | — | — | — | — | — | — |
| Natural / honey conversion factors | **No authoritative number found.** Derive from the app's own mass balance. | — | — | — | — | — | — |
| Factor de rendimiento (Colombia) | kg dry parchment needed for one 70 kg sack of excelso; reference factor **94** (raised from 88 when FNC returned to the usual formula) | kg cps / 70 kg | FNC Caldas | https://caldas.federaciondecafeteros.org/listado-noticias/a-partir-de-hoy-pasa-a-94-el-factor-de-rendimiento-para-liquidar-el-cafe-en-colombia/ | inst | n.d. (≈2020s; date not verified) | M |
| Guatemala: cherry : dry parchment | 5 : 1 (quintales) | qq/qq | Anacafé, *Guía de Rentabilidad Sustentable* | https://www.anacafe.org/uploads/file/81a9d8e4afa248758a35f078ca49dc29/Guia-Rentabilidad-Sustentable-2024.pdf | inst | 2024 | H |
| Guatemala: parchment : oro | 1.3 : 1 | qq/qq | same | same | inst | 2024 | H |
| Quintal (Honduras usage) | 100 lb (= 45.36 kg, derived); quintal oro factor 1.2; carga = 240 lb parchment ≈ 200 lb oro | lb | Tripartito (industry explainer) | https://tripartito.coffee/entendiendo-la-comercializacion-del-cafe-en-honduras-de-la-lata-a-la-carga-oro-quintal-oro-qq-qq-ps/ | ind | n.d. | L |
| ICAFE (Costa Rica) quintal | 46 kg green (café oro); export sack 69 kg | kg | ICAFE, *Estructura de costos de beneficiado 2015-16* | https://www.icafe.cr/wp-content/uploads/informacion_mercado/costos_actividad/beneficiado/ECBC1516.pdf | inst | 2016 | H |
| Fanega (Costa Rica) | 20 cajuelas ≈ 258 kg cherry → ~1 × 46 kg sack green; cajuela ≈ 12.9 kg | kg | Wikipedia "Cajuela de café" (no citation given) | https://es.wikipedia.org/wiki/Cajuela_de_caf%C3%A9 | sec | n.d. | L |
| Lata (cherry) | ≈ 25–30 lb cherry "depending on region" (Honduras) | lb | Tripartito | (above) | ind | n.d. | L |
| Lata — Panama | **No authoritative kg equivalent found.** Volumetric and farm-specific. | — | — | — | — | — | — |

---

## 3. Wet milling

| Parameter | Value | Unit | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Harvest → pulping | same day, **within the first 10 h after picking and in at most 4 h of pulping** (Spanish text ambiguous; read as max 10 h delay) | h | Anacafé/CEDICAFE Boletín Técnico, *Buenas prácticas de beneficiado húmedo* | https://www.anacafe.org/uploads/file/1296dfe8b18b492583788afbfb8420d9/Boletin-Tecnico-CEDICAFE-2018-10.pdf | inst | 2018 | H |
| Harvest → processing (OTA prevention) | "as soon as possible"; no numeric limit | — | Codex CXC 69-2009 | https://www.fao.org/input/download/standards/11250/CXP_069e.pdf | std | 2009 | H |
| Water: conventional fermentation + washing (4 rinses) | 4.17 | L / kg cps | Cenicafé 66(1):46-60 | https://www.cenicafe.org/es/publications/5.Manejo.pdf | inst/peer | 2015 | H |
| Water: Becolsub | 0.7–1.0 | L / kg cps | same | same | inst/peer | 2015 | H |
| Water: Ecomill (preliminary) | 0.4 | L / kg processed coffee | same | same | inst/peer | 2015 | M |
| Becolsub contamination avoided | > 90 % of load | % | same | same | inst/peer | 2015 | H |
| COD from pulping + transport | 82,080 mg/kg cherry (72 % of total) | mg COD/kg cherry | same | same | inst/peer | 2015 | H |
| COD from wash waters (mieles) | 31,920 mg/kg cherry (28 %); natural-fermentation washwater ≈ 26,500 ppm | mg/kg cherry; ppm | same | same | inst/peer | 2015 | H |
| Becolsub leachate | ≈ 110,000 ppm COD | ppm | same | same | inst/peer | 2015 | M |
| Wastewater generated (Mexico, conventional) | 8–10 L per kg coffee | L/kg | Cruz-Salomón et al., *Sustainability* 10:83 | https://www.mdpi.com/2071-1050/10/1/83 | peer | 2018 | M |
| Raw wastewater: COD | 1,185–45,955 | mg/L | same (literature ranges) | same | peer | 2018 | M |
| Raw wastewater: BOD₅ | 3,450–37,944 | mg/L | same | same | peer | 2018 | M |
| Raw wastewater: TSS / N / P | 7,000–10,900 / 37–700 / 4.4–70 | mg/L | same | same | peer | 2018 | M |
| Raw wastewater pH | 3–5 | pH | same; one sample at pH 4.5 / COD 2,980 mg/L in Springer *Appl. Water Sci.* 2024 | same; https://link.springer.com/article/10.1007/s13201-024-02118-1 | peer | 2018/2024 | M |
| Pulp fraction of cherry | ≈ 40–44 % (wet basis) | % | Cenicafé 2015; AVT 370 | (above) | inst | 2008/2015 | H |

**Note on the package value.** Cenicafé's 4.17 L/kg cps is only ~0.85 L/kg cherry at a 4.9 : 1 ratio. Cruz-Salomón's 8–10 L/kg is not clearly per-cherry. The package's 10–20 L/kg cherry is far above both, and I found no authoritative support for it.

---

## 4. Fermentation monitoring (context only; protocol thresholds override)

| Parameter | Value | Unit | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Variables monitored in the literature | pH, temperature, time; Brix/sugars, lactic acid, ethanol; volume/density change | — | Hurtado Cortés et al., critical review | https://pmc.ncbi.nlm.nih.gov/articles/PMC11486863/ | peer | 2024 | H |
| pH endpoint, conventional washed (Nicaragua field study) | when the mass reaches **pH ≈ 5.0**, fermentation completes within ~2 h; **pH ≈ 4.0** indicates over-fermentation for the last 2–3 h | pH | Jackels & Jackels, *J. Food Sci.* 2005, as summarised in Elhalis, Cox & Zhao review | https://www.sciencedirect.com/science/article/pii/S2772502222002086 | peer (via review) | 2005/2023 | M |
| Field indicators recommended | reflectance strips for glucose, pH, lactic acid, ethanol (instead of the tactile "punto") | — | same | same | peer | 2005/2023 | M |
| Typical duration (generic, climate-dependent) | 6–72 h (Elhalis 2023); 12–72 h (Hurtado Cortés 2024) | h | (above) | (above) | peer | 2023/2024 | M |
| Temperature studied | 25–30 °C most controlled trials; 18–24.5 °C extended | °C | Hurtado Cortés 2024 | (above) | peer | 2024 | M |
| Fermaestro® (Cenicafé) | Truncated-cone device that objectively signals the washing point from the rise in mass volume (% threshold not extracted) | — | Peñuela-Martínez, Pabón & Sanz-Uribe, Avance Técnico 431 | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/view/271 | inst | 2013 | H (method) |
| Delay past endpoint | > 2 h after completion directly raises defects | h | Cenicafé, Huila book ch. 7 | https://biblioteca.cenicafe.org/bitstream/10778/4227/1/Cap07.pdf | inst | ~2019 | H |
| Fermaestro® trial outcome | recommended method: no defects, mean 81.6 SCA; 19 ± 0.5 °C ambient; drying 3–6 d from 53 % to 10–12 % | — | Sanz-Uribe & Velásquez-Henao, *Rev. Cenicafé* 73(1) | https://publicaciones.cenicafe.org/index.php/cenicafe/article/view/203 | inst/peer | 2022 | H |
| Tank depth (Anacafé) | 50 cm–1 m mass height; change water every 10–12 h (underwater fermentation) | cm; h | Anacafé 2018 | (above) | inst | 2018 | M |
| Titratable acidity (TA) | **No authoritative endpoint value found** | — | — | — | — | — | — |

---

## 5. Drying and conditioning

| Parameter | Value | Unit | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Final moisture (dry parchment / green) | 10–12 | % w.b. | Anacafé 2018; Cenicafé Huila ch. 7 (562 samples: 9.2–13.7 %, mean 11.3 %) | (above) | inst | 2018/~2019 | H |
| Max moisture (OTA prevention) | ≤ 12.5 | % w.b. | Codex CXC 69-2009 | (above) | std | 2009 | H |
| Moisture reference method | ISO 6673:2003: ~10 g test portion, 105 ± 1 °C, 16 h ± 0.5 h, duplicate; reads ~1.0 % lower than ISO 1446 | — | ISO 6673:2003 sample | https://cdn.standards.iteh.ai/samples/38375/65dea88d3d9e4129abb9b7fe1b84a080/ISO-6673-2003.pdf | std | 2003 | H |
| Water activity — SCA specialty | **< 0.70** aw | aw | SCA *Coffee Standards* (rev. 2018) | https://static1.squarespace.com/static/584f6bbef5e23149e5522201/t/5d936fa1e29d4d5342049d74/1569943487417/Coffee+Standards-compressed.pdf | std | 2018 | H |
| aw — shelf-stability soft limit (industry) | ≤ 0.60 ("convenient soft limit" for > 6 months); 0.60–0.90 microbial risk | aw | Royal Coffee, *Green Coffee Analytics I* | https://royalcoffee.com/green-coffee-analytics-relevance-to-roasters-buyers-and-producers-part-i-moisture-content-and-total-water-activity/ | ind | n.d. | L–M |
| aw — OTA fungi | OTA production window aw 0.80–0.95; growth not possible below 0.76–0.78 | aw | Codex CXC 69-2009 | (above) | std | 2009 | H |
| Moisture ↔ aw link | > 12.5 % moisture ≈ aw > 0.7 (risk) | — | Cenicafé Huila ch. 7 | (above) | inst | ~2019 | M |
| Layer depth, sun drying | 3–5 cm (= 25–35 kg/m²) | cm | Codex CXC 69-2009 | (above) | std | 2009 | H |
| Layer depth, natural drying (Anacafé) | ≤ 7 cm | cm | Anacafé 2018 | (above) | inst | 2018 | H |
| Turning | "constantly during daytime" (no interval given) | — | Codex | (above) | std | 2009 | H |
| Drying-yard time (OTA) | ≤ 5 days on the yard is enough to prevent OTA | d | Codex | (above) | std | 2009 | M |
| Mechanical dryer, static/silo | coffee mass ≤ 40 °C; air ≤ 50 °C | °C | Anacafé 2018 | (above) | inst | 2018 | H |
| Mechanical dryer, rotary (guardiola) | coffee mass ≤ 40 °C; air ≤ 60 °C | °C | Anacafé 2018 | (above) | inst | 2018 | H |
| Mechanical dryer air (Cenicafé) | ≤ 50 °C; grain ≤ 38 °C if seed viability is needed | °C | Cenicafé Huila ch. 7 | (above) | inst | ~2019 | H |
| Cooling after drying | rest 8–10 h covered before bagging | h | Anacafé 2018 | (above) | inst | 2018 | M |
| Reposo (stabilisation) | at least 3–4 weeks | weeks | Anacafé 2018 | (above) | inst | 2018 | M |

---

## 6. Storage

| Parameter | Value | Unit | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Warehouse climate (ISO) | ≈ 22 °C and RH ≤ 60 % | °C; % RH | ISO 8455:2011 sample | https://cdn.standards.iteh.ai/samples/44601/12370ba7638544edb01e8dff4582a93c/ISO-8455-2011.pdf | std | 2011 | H |
| Bag-to-wall distance | > 0.8 m | m | ISO 8455:2011 | same | std | 2011 | H |
| Clearance top row → ridge | ≥ 2 m | m | ISO 8455:2011 | same | std | 2011 | H |
| Storage moisture (ISO) | no fixed %; limits depend on method and apparatus | — | ISO 8455:2011 | same | std | 2011 | H |
| RH threshold (Codex) | keep < 60 %; > 80 % → coffee absorbs water | % RH | Codex CXC 69-2009 | (above) | std | 2009 | H |
| Origin warehouse (Anacafé) | 20 °C, 65 % RH | °C; % RH | Anacafé 2018 | (above) | inst | 2018 | M |
| Equilibrium | ≈ 12 % moisture at 70 % RH | % | Gautz, Smith & Bittenbender, CTAHR EN-3 | https://www3.ctahr.hawaii.edu/oc/freepubs/pdf/EN-3.pdf | ext | 2008 | M |
| Hermetic vs jute (7 months, humid Colombian farm store) | PICS hermetic bags kept moisture, aw and cup scores better than jute; 2- vs 3-layer made no significant difference | — | Donovan, Foster & Parra Salinas, *J. Stored Prod. Res.* 80 | https://www.sciencedirect.com/science/article/abs/pii/S0022474X18302820 | peer | 2019 | H |
| Moisture checks in storage | monthly | — | CTAHR EN-3 | (above) | ext | 2008 | M |

---

## 7. Green grading

| Parameter | Value | Unit | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Sample size (SCA) | 350 | g green | SCA *Coffee Standards* | (above) | std | 2018 | H |
| Roasted sample (quakers) | 100 g roasted grade; "# of quakers" field | g | SCA Washed Arabica Green Grading Form | (above) | std | n.d. | H |
| Specialty: Category 1 defects | 0 | count | SCA *Coffee Standards* | (above) | std | 2018 | H |
| Specialty: total full defects | ≤ 5 per 350 g | full defects | Cropster (secondary, citing SCA); Wikipedia citing SCA | https://www.cropster.com/blog-post/green-grading-coffee/ | sec | n.d. | M |
| Older SCAA rule (300 g sample) | Specialty ≤ 5 full defects, no primary; Premium ≤ 8; moisture 9–13 % | — | FAO Annex 7 (reproducing SCAA) | https://www.fao.org/4/x6939e/x6939e13.htm | std (FAO) | ~2000s | M (superseded sample size) |
| Cat 1 equivalents (beans = 1 full defect) | full black 1 · full sour 1 · dried cherry/pod 1 · fungus 1 · foreign matter 1 · severe insect damage 5 | beans | SCA Grading Form | (above) | std | n.d. | H |
| Cat 2 equivalents | partial black 3 · partial sour 3 · parchment 5 · floater 5 · immature/unripe 5 · withered 5 · shell 5 · broken/chipped/cut 5 · hull/husk 5 · slight insect damage 10 | beans | same | same | std | n.d. | H |
| Grading lighting | ≥ 4000 K / 1200 lx | — | SCA *Coffee Standards* | (above) | std | 2018 | H |
| Moisture for specialty grade (SCA) | Not confirmed verbatim in SCA Standards; FAO/SCAA 9–13 %; Cropster cites SCA "10–12 %" | % | (above) | (above) | mixed | — | L |
| Screen-size tolerance (5 %) | **Not verified in any fetched source.** Do not hard-code. | — | — | — | — | — | — |
| Screen numbering | screen *n* = n/64 inch → n × 0.397 mm (e.g., 18 = 7.14 mm, derived arithmetic) | mm | derived | — | — | — | H (arithmetic) |
| ISO defect method | ISO 4149:2005: 300 g lab sample; olfactory and visual exam, foreign matter and defects; quality impact via ISO 10470 coefficients | g | ISO 4149 sample | https://cdn.standards.iteh.ai/samples/35894/533d9575a9e54ea187c3bf559102b721/ISO-4149-2005.pdf | std | 2005 | H |
| ISO 10470 coefficients | sensorial-concern coefficient 0 / 0.5 / 1 (e.g., black = 1, insect-damaged = 0.5); 5 defect categories | — | ISO 10470:2004 sample | https://cdn.standards.iteh.ai/samples/40401/20de40b0572a47a2aa1cc57a0ecac29a/ISO-10470-2004.pdf | std | 2004 | H |
| ISO 9116:2004 | Guidelines on how to write green-coffee specifications (content not extracted) | — | ISO catalogue | https://www.iso.org/standard/39373.html | std | 2004 | M |
| National moisture caps | Colombia ≤ 12 %; several producers ≤ 12.5 %; Italy ≤ 13 % | % | ICO ICC-122-12, *National quality standards* | https://www.ico.org/documents/cy2017-18/icc-122-12e-national-quality-standards.pdf | std (ICO) | 2018 | H |
| Density method | free-flow bulk density, ISO 6669:1995 (routine); graduated cylinder | g/mL | ISO catalogue; Royal Coffee | https://www.iso.org/standard/13098.html ; https://royalcoffee.com/green-coffee-analytics-part-iv-density/ | std / ind | 1995 / n.d. | M |
| Density benchmarks (one importer) | free-settled: low ≈ 0.64, average ≈ 0.67, high > 0.69 g/mL; displacement 1.16–1.19 g/mL | g/mL | Royal Coffee | same | ind | n.d. | L |

---

## 8. Cupping: 2004-form protocol and the CVA

| Parameter | Value | Unit | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Ratio | 8.25 g ± 0.25 g whole bean per 150 mL (0.055 g/mL) | g/mL | SCA *Coffee Standards* | (above) | std | 2018 | H |
| Roast time / rest | 8–12 min roast; cup 8–24 h after roasting | min; h | same | same | std | 2018 | H |
| Roast colour | ~58 whole bean / 63 ground on Agtron gourmet scale (± 1); SCA Standards also give 63 ± 1 | Agtron | SCAA Cupping Protocols 2005; SCA Standards | https://atlanticspecialtycoffee.com/wp-content/uploads/SCAA-Cupping-Protocols-2005.pdf | std | 2005/2018 | H |
| Grind | 70–75 % passes US 20-mesh | % | same | same | std | 2005/2018 | H |
| Water | TDS ideal 125–175 ppm (not < 100 or > 250); ~93 °C (200 °F; 92.2–94.4 °C per SCA Standards) | ppm; °C | same | same | std | 2005/2018 | H |
| SCA brewing-water table | calcium hardness 50–175 ppm CaCO₃; pH target 7.0 (6–8); chlorine none | — | SCA *Coffee Standards* | (above) | std | 2018 | M (table only partly extracted) |
| Steep / evaluate | 3–5 min before breaking; evaluate from ~70 °C (8–10 min after infusion) | min; °C | SCAA 2005 | (above) | std | 2005 | H |
| Cups per sample | ≥ 5 | cups | SCAA 2005 | (above) | std | 2005 | H |
| Defect deductions (2004 form) | taint intensity 2, fault intensity 4 (× cups) | pts | SCAA 2005 | (above) | std | 2005 | H |
| Score bands | 80–84.99 Very Good · 85–89.99 Excellent · 90–100 Outstanding | pts | SCA cupping form via Wikipedia (2005 protocol uses 80–84 / 85–89 / 90–94 / 95–100 with "Premium"/"Specialty" labels) | https://en.wikipedia.org/wiki/Specialty_coffee | sec / std | — | M |
| CVA structure | 4 assessments: Physical, Descriptive, Affective, Extrinsic; replaces the single cupping score in contracts | — | SCA, *A System to Assess Coffee Value* | https://static1.squarespace.com/static/584f6bbef5e23149e5522201/t/667182ffdde8a5081afc2d8c/1718715138872/SCA+-+A+System+to+Asssess+Coffee+Value+-+June+2024+(Secured).pdf | std | 2024 | H |
| Standard numbers | 102 Sample Prep & Tasting Mechanics; 103 Descriptive (2024); 104 Affective (2024); 105 Extrinsic (2025); Physical based on 2004 green grading | — | SCA CVA page; SCA 103/105 PDFs | https://sca.coffee/value-assessment | std | 2024–25 | H |
| Descriptive (SCA 103-2024) | intensity on 0–15 scales (marks between integers allowed) + CATA lists (fragrance/aroma; flavour/aftertaste; main tastes ≤ 2; mouthfeel ≤ 2); **no quality score** | — | SCA 103-2024 | https://static1.squarespace.com/static/584f6bbef5e23149e5522201/t/671f86dbe069633d51f3d6e6/1730119387854/AW_SCA-103_Descriptive-Assessment_Sept2024_Secured.pdf | std | 2024 | H |
| Affective (SCA 104-2024) | 9-point "impression of quality" scale (1 Extremely low … 5 Neither … 9 Extremely high), 8 sections; converted to a 100-point scale | — | SCA System doc | (above) | std | 2024 | H |
| Affective formula | S = 0.65625 × Σh(8 sections) + 52.75 − 2·(non-uniform cups) − 4·(defective cups); rounded to 0.25; all-9 = 100, all-5 = 79 | pts | **secondary:** GitHub cata-cafe; lafamiliacafe calculator (both cite SCA 104); SCA official calculator exists | https://github.com/ricardovelezd27/cata-cafe ; https://sca.coffee/cuppingscore | sec | 2024–25 | M (arithmetic checks pass; primary text not read) |
| New specialty definition | "a coffee or coffee experience that is recognized for its distinctive attributes, resulting in a higher value within the marketplace" (no 80-point cutoff in the definition) | — | SCA System doc | (above) | std | 2024 | H |

**What this means for the data model.**
1. A CVA session is not one score. It has four child records (physical, descriptive, affective, extrinsic).
   - Descriptive data is vectors: 0–15 intensities plus CATA multi-select tags.
   - Affective data is eight 1–9 values plus non-uniform and defective cup counts, from which the 100-point score is computed.
2. Store the raw inputs and a `scoring_system` enum (`sca_2004_form`, `sca_cva_affective_2024`, `coe`, `custom`). Do not convert scores between systems.
   - A CVA affective score of 79 is the neutral midpoint. It is not equivalent to 79 on the 2004 form.
3. Quality tiers (80/85/90) are a display convention tied to `scoring_system`. They are not part of the CVA definition, so make them configurable (the package already says this).
4. Extrinsic data (origin, process, certifications) already lives in the app's lot and traceability tables. Link to it rather than duplicating it.

---

## 9. Calibration

| Parameter | Value | Unit | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Moisture meter calibration standard | ISO 24115:2012: adjust and calibrate with reference samples whose moisture is set by ISO 6673 | — | ISO 24115 sample | https://cdn.standards.iteh.ai/samples/44603/55f959bd9a884557b24ef123726ab237/ISO-24115-2012.pdf | std | 2012 | H |
| No. of reference samples | ≥ 5, spanning 8.5–13.5 %, spaced 0.7–1.3 points apart | % | same | same | std | 2012 | H |
| Uncertainty | expanded uncertainty with k = 2 (95 %); bias adjustment | — | same | same | std | 2012 | H |
| Re-calibration interval | not specified by ISO; re-check reference-sample moisture if stored | — | same | same | std | 2012 | H |
| Oven vs meter | oven (105 °C) is the reference and needs no calibration; meter repeatability is the "real accuracy"; 1 % error = 1 lb water per 100 lb bag | — | CTAHR EN-3 | (above) | ext | 2008 | M |
| ISO 6673 vs ISO 1446 | ISO 6673 ≈ 1.0 % lower; ISO 1446 is the basic reference for calibrating | % | ISO 6673 | (above) | std | 2003 | H |
| Meter type note | the meter curve differs for parchment vs green; use the correct grain setting | — | (practice; no source fetched) | — | — | — | L |
| pH meter | 2-point calibration with buffers bracketing the sample (4 & 7 for fermentation); calibrate at least once on each day of use; accept slope 95–105 %; record temperature (measure at 20–25 °C unless compensated) | — | US EPA OPP SOP EQ-01-08 | https://19january2021snapshot.epa.gov/sites/static/files/2018-01/documents/eq-01-08.pdf | std (gov SOP) | 2017 | H |
| Refractometer | zero with distilled/deionised water daily before use, after battery change, during long series, or after environmental change; ATC 10–40 °C; accuracy ± 0.2 % Brix (HI96801) | — | Hanna HI96801 manual | https://www.documentation.hannainst.com/manuals/preview/1853 | ind (manufacturer) | n.d. | M |

---

## Recommended data fields and validation rules for the app

**Ripeness / receiving (HAR.PCK, HAR.PRI.01)**
- `brix_sample` (°Brix, 1 dp) with `brix_matrix` enum: mucilage / pulp-juice / whole-cherry, and `refractometer_id`.
  - Hard bounds 5–35; plausibility warning outside 15–25.
  - Targets are per-variety or per-protocol only.
- `ripeness_mix`: % unripe / semi-ripe / ripe / overripe / dry; must sum to 100 ± 1.
  - Default warn when unripe ≥ 2.5 % (Martínez 2017, cv. Colombia). Label as a "literature reference", configurable.
- `floaters_pct`: no authoritative default; leave tenant-configurable.

**Mass balance**
- Record stages separately: `kg_cherry`, `kg_wet_parchment`, `kg_dry_parchment` (+ `moisture_pct`), `kg_green_export`, `kg_rejects`.
  - Compute ratios per lot, not from constants.
- Normalise to a reference moisture before comparing ratios: wet basis, w₂ = w₁·(1−m₁)/(1−m₂).
- Plausibility bands, washed only: cherry/cps 4.5–5.0 and cps/green ≈ 1.25 (Cenicafé, cv. Colombia).
  - Warn outside, never block. No defaults for natural or honey.
- Unit table with `unit_code`, `kg_factor`, `product_state`, `region`, `source`:
  - quintal oro CR = 46 kg; quintal (lb) = 45.36 kg.
  - Leave lata and fanega as user-defined per farm, because no authoritative Panama value was found.

**Wet mill (HAR.PRI.02–05)**
- `harvest_end_ts`, `pulp_start_ts` → elapsed hours.
  - Default warning at > 10 h (Anacafé). Keep the existing 24 h as a hard outer flag.
- `water_l` metered, with KPIs per kg cherry **and** per kg cps. Benchmarks: Becolsub 0.7–1.0 L/kg cps; conventional washing ≈ 4.2 L/kg cps.
- Optional wastewater log: `cod_mg_l`, `bod5_mg_l`, `ph`, `tss_mg_l`, `discharge_point`. No default limits (regulatory, Panama-specific).

**Fermentation (HAR.PRI.03)**
- Time series: `ts`, `ph`, `temp_c`, `brix`, `ta_ml_naoh` (optional), `fermaestro_volume_change` (optional), `meter_id`.
- Validation is plausibility only: pH 2.5–7.5; temperature 0–50 °C.
- Endpoints come from `protocol_id` only. The generic washed fallback may display Jackels' pH ≈ 5 → ~2 h, and pH ≈ 4 = over-fermentation as **informational text**, never as alarms on custom protocols.

**Drying (HAR.DRY)**
- `layer_depth_cm`: warn > 5 cm on patio/bed (Codex 3–5 cm), configurable.
- `turn_events[]`.
- `dryer_air_temp_c` and `bean_mass_temp_c`, separately: warn when mass > 40 °C or air > 50 °C (static) / 60 °C (rotary). Flag mass > 38 °C if `seed_lot = true`.
- `moisture_pct` with `method` (ISO 6673 oven / capacitance meter / other) and `meter_id`. Endpoint 10–12 %; hard flag > 12.5 %.
- `aw` (2 dp) with `aw_temp_c` and `aw_instrument_id`. Defaults: warn ≥ 0.65, fail ≥ 0.70 (SCA). Optional tenant target ≤ 0.60 (industry).
- `reposo_start`, `reposo_days`: warn < 21 d (Anacafé 3–4 weeks), configurable.

**Storage**
- Warehouse logger: `temp_c`, `rh_pct`. Warn RH > 60 % (ISO 8455 / Codex); critical RH > 80 % (Codex absorption).
- `packaging` enum: jute, sisal, hermetic_multilayer (GrainPro/PICS), vacuum, other.
- Monthly re-check of moisture and aw per lot.

**Green grading**
- `sample_g` (default 350); `cat1_counts{}` and `cat2_counts{}` per defect type, then full defects computed from an equivalents table stored as **versioned reference data** (above).
- `quakers_per_100g_roast`.
- `screen_distribution{size: %}`; screen ↔ mm computed as n × 25.4/64.
- `bulk_density_g_ml` with `method` (ISO 6669 free-flow / displacement).
- `moisture_pct`, `aw`, `color`, `odor_ok`.
- Specialty-grade flag = cat1 = 0 AND full defects ≤ 5 AND aw < 0.70. Quakers and screen tolerance are configurable, with no default.

**Cupping**
- `session` → `scoring_system`, `protocol_version`, `roast_agtron`, `roast_time_min`, `rest_h`, `ratio_g_per_150ml`, `water_tds_ppm`, `cups_n`.
- 2004 form: 10 attribute scores, cup flags, taint/fault entries. Total = sum − (2 × taint cups) − (4 × fault cups).
- CVA:
  - descriptive: 0–15 intensities + CATA tags;
  - affective: 8 × 1–9 + `nonuniform_cups` + `defective_cups`, score computed with the SCA 104 formula (verify against the official calculator before release);
  - physical links to the green grading record; extrinsic links to the lot.
- Cupper calibration: `cupper_id` with credential and date.

**Instruments / calibration (OPS.AST.01)**
- `instrument` (type, serial, range) and `calibration_event` (date, standards used, pre/post bias, slope for pH, pass/fail, next_due).
- Default validity windows (tenant-configurable):
  - pH: same day.
  - Refractometer zero: same day.
  - Moisture meter: per ISO 24115 with ≥ 5 reference samples; suggest a check each season and after any ISO 6673 drift > 0.5 points. Interval is NN guidance, not from a standard.
- Readings taken with an expired instrument → warn and flag the record.

---

## Corrections to the existing package (`04_reference_parameters.json`)

| Key (old) | Old value | Proposed (new) | Basis |
|---|---|---|---|
| `harvest.ripe_brix_pct` | 15–25, VNT, low | keep 15–25 as `plausibility`; add `harvest.brix_by_stage_reference` = {unripe 17.9–18.3, semi 19.5–19.8, ripe 21.2–21.5, overripe 22.1–23.8}, `matrix: mucilage`, source Martínez 2017 + Cenicafé 54(3), conf M | §1 |
| `harvest.max_floaters_pct` | max 5, conf medium | keep value but **downgrade to low**; note "no standards-body limit found" | §1 |
| — (new) | — | `harvest.max_unripe_pct_warning` = 2.5, source Martínez 2017 (Vitae), conf M | §1 |
| `process.depulp_max_hours_after_harvest` | 24 h | add `process.depulp_warn_hours` = 10 (Anacafé 2018, conf H); keep 24 as outer flag | §3 |
| `process.washed_water_l_per_kg_cherry` | 10–20, VNT, low | **replace** with `process.water_l_per_kg_cps` = {conventional_wash: 4.17, becolsub: [0.7, 1.0], ecomill: 0.4} (Cenicafé 2015, H). Mark old key deprecated: no authoritative support, and ≥ 10× higher | §3 |
| `process.washed_fermentation_hours_generic` | 12–36 | literature span is 6–72 h (Elhalis 2023) / 12–72 h (Hurtado Cortés 2024). Keep it as generic fallback only; add `process.washed_ph_endpoint_info` = {complete_within_2h_at: 5.0, overferment_at: 4.0, source: Jackels 2005 via Elhalis 2023, use: info-only} | §4 |
| `drying.final_moisture_pct` | 10–12, medium | keep 10–12, **raise to high** (Anacafé, Cenicafé); add `drying.max_moisture_pct` = 12.5 (Codex) and `drying.moisture_method` = "ISO 6673:2003" | §5 |
| `drying.water_activity_max` | null | **0.70** (SCA Coffee Standards, H) as fail; add `drying.water_activity_warn` = 0.65 (NN) and `drying.water_activity_target_optional` = 0.60 (industry, L) | §5 |
| `drying.turn_interval_min` | 60, low | keep low; note Codex says "constantly during daytime", no numeric interval | §5 |
| — (new) | — | `drying.layer_depth_cm` = 3–5 (Codex, H); `drying.layer_depth_cm_max_anacafe` = 7 | §5 |
| — (new) | — | `drying.mech_bean_temp_max_c` = 40; `drying.mech_air_temp_max_c` = {static: 50, rotary: 60}; `drying.seed_bean_temp_max_c` = 38 | §5 |
| — (new) | — | `drying.reposo_days_min` = 21 (Anacafé 3–4 wk, M) | §5 |
| — (new) | — | `storage.rh_max_pct` = 60, `storage.temp_c_ref` = 22 (ISO 8455, H); `storage.rh_critical_pct` = 80 (Codex) | §6 |
| — (new) | — | `grading.sample_g` = 350; `grading.specialty` = {cat1: 0, full_defects_max: 5, aw_max: 0.70}; equivalents table §7 | §7 |
| `quality.specialty_min_score` | 85, low | set default **80**, valid only for `scoring_system = sca_2004_form`; for CVA no score cut-off (definition is value-based) | §8 |
| `quality.cupping_scale` | "SCA 100-point" | enum [`sca_2004_form`, `sca_cva_2024`, `coe`, `custom`], default `sca_cva_2024` for new sessions | §8 |
| — (new) | — | `cupping.protocol` = {g_per_150ml: 8.25, agtron_ground: 63, roast_min: [8, 12], rest_h: [8, 24], water_tds_ppm: [125, 175], cups_min: 5} | §8 |
| KPI "Cherry-to-green ratio" (§16) | unvalued | plausibility (washed): cherry/green ≈ 6.25, cherry/cps 4.5–5.0, cps/green 1.25 (Cenicafé AVT 370); computed per lot at normalised moisture | §2 |
| §17 item 4 (aw NN note "≤ 0.60–0.65") | NN note | SCA standard is **< 0.70**; 0.60 is an industry soft target | §5 |

**Remaining gaps and uncertainty**
1. SCA 104 affective formula: primary text not read; arithmetic is consistent.
2. SCA specialty moisture % and screen-size 5 % tolerance: not confirmed verbatim.
3. Mucilage fraction of cherry: not verified.
4. Panama *lata*: no authoritative kg equivalent.
5. TA endpoints: none found.
6. FNC factor-94 date: not verified.
7. Natural and honey conversion factors: none found.
