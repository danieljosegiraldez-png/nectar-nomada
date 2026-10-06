# R2 — Coffee IPM: action thresholds, sampling protocols and controls (Central American Arabica, Panama notes)

Prepared 2026-10-01 for the farm-ref package (fills gap §17.2 of 01_DOMAIN_REFERENCE.md; feeds SOI.IPM.01–03 and `pest_disease_catalog`).

**Ground rules applied.** Every number below was read from the cited source during this session, through WebFetch extraction (a model summary of the page). Where I could not open the primary document, the row is marked **UNVERIFIED** or the item is left out. Confidence key: **H** = primary institutional or peer-reviewed source, number quoted directly; **M** = primary source, but the number came from a summary or the context is narrow; **L** = secondary, indirect, or not Central American. Several sources were blocked (403/429/robots): the CATIE/PROMECAFE "Estado del arte" rust review, the FAO "Manejo agroecológico de la roya", the CABI datasheet for *C. kahawae*, the full Rainforest Alliance 2020 Farm Requirements, and the IHCAFE ojo de gallo bulletin No. 12. Their contents are **not** reported here.

**Key cross-source finding.** Thresholds are **not universal**. They differ between institutions (Cenicafé, ANACAFÉ, UH-CTAHR) and depend on yield level, fruit age and the position of the borer inside the fruit. The app should therefore store each threshold as **(value, unit, basis, source_id)** under an authority profile chosen per farm, not as one hard-coded constant.

---

## 1. Coffee Berry Borer — broca (*Hypothenemus hampei*)

### Parameter table

| Parameter | Value | Unit | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Traditional sampling ("TREINTA" method) | 30 trees at random per lot, 1 branch per tree, count total and bored fruits | trees/lot | Montoya & Orozco, *Cenicafé* 56(3) | https://biblioteca.cenicafe.org/bitstream/10778/150/1/arc056(03)237-249.pdf | Peer-reviewed (Cenicafé journal) | 2005 | H |
| Alternative sampling (EBEL) | 2 % of the trees in the lot, systematic (every 50th tree); infestation estimated by regression from the share of infested trees | % of trees | same | same | Peer-reviewed | 2005 | M |
| Action threshold for applying *B. bassiana* or an insecticide (Cenicafé) | > 2.0 | % infested fruit in the field | Góngora, Avance Técnico 493 (Cenicafé) | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/2709/2614 | Extension (research institute) | 2018 | H |
| Accompanying conditions (Cenicafé) | Fruit > 120 days after flowering, and ≥ 50 % of adults in positions A/B (still entering the fruit) | days; % | same | same | Extension | 2018 | H |
| Economic damage threshold (FNC) | 5 | % infestation | FNC, "Separata roya / ¿Qué pasa con los frutos que se dejan caer al suelo?" | https://federaciondecafeteros.org/static/files/SEPARATAROYA.pdf | Extension | n.d. | M |
| Suggested economic threshold range | 1.5–2.5 | % infestation | Johnson et al. (review in *Insects*, citing Aristizábal) | https://pmc.ncbi.nlm.nih.gov/articles/PMC7763606/ | Peer-reviewed review | 2020 | H |
| ANACAFÉ sampling (2021) | 20 sites per 0.71–5 mz (0.5–3.5 ha); each site 1,750 m²; 5 central plants per site | sites; plants | ANACAFÉ, Seminario MIB | https://www.anacafe.org/uploads/file/0bf09a793fd84d9faddc842a6afdffc8/Seminario-MIB-2021.pdf | Extension (national institute) | 2021 | H |
| ANACAFÉ sampling (2025) | 20 sites × 5 producing plants × 20 fruits = 100 fruits per site | fruits | ANACAFÉ, Boletín MIB, March 2025 | https://www.anacafe.org/uploads/file/aafa6a4c82f2486faf5337b7e168a14f/Boletin-MIB-Marzo-2025.pdf | Extension | 2025 | H |
| ANACAFÉ thresholds for chemical control, scaled by yield | ≤ 20 qq pergamino → 5 %; 21–30 qq → 4 %; 31–40 qq → 3 % | % infestation | ANACAFÉ 2021 | (2021 URL above) | Extension | 2021 | H |
| ANACAFÉ low-pressure rule | < 4 % → *B. bassiana* only | % | ANACAFÉ 2025 | (2025 URL above) | Extension | 2025 | M |
| ANACAFÉ sampling window | < 1,000 m: 60–90 DAF; > 1,000 m: 75–90 DAF | days after flowering | ANACAFÉ 2021 | (2021 URL above) | Extension | 2021 | H |
| ANACAFÉ control window | days 61–134 after flowering: biological or chemical control; from day 135: avoid treatments (borer already inside) | DAF | ANACAFÉ 2025 | (2025 URL above) | Extension | 2025 | M |
| Critical colonisation period | 120–150 DAF (seed dry matter about 20 %) | DAF | Johnson et al. | PMC7763606 | Review | 2020 | H |
| Hawaii sampling | ≥ 30 trees per 2.5-acre plot (min. 12 trees/acre ≈ 30 trees/ha); 1 branch per tree with 30–120 green berries; dissect ~100 infested berries to assess A/B vs C/D position | trees/acre | Kawabata et al., UH-CTAHR IP-41 / IP-47 | https://www3.ctahr.hawaii.edu/oc/freepubs/pdf/IP-41.pdf ; https://www.hawaiicoffeeed.com/uploads/2/6/7/7/26772370/ip-47.pdf | University extension | 2017 / 2020 | H |
| Hawaii decision index | Combined infestation × % A/B alive index: < 1 do not spray; 1–1.99 consider; **2–4.99 critical, start spraying**; 5–9.99 losses; ≥ 20 focus on next crop | index (Table 1) | same | same | Extension | 2017/2020 | H (use the table as published) |
| Hawaii sampling frequency | start ~30 days after first flowering; every 2 weeks early in the season, at least monthly afterwards | days | IP-41 | same | Extension | 2017 | H |
| Trap lure | methanol:ethanol **1:1 or 3:1** (UH); **1:1** (ANACAFÉ) | v:v | IP-41; ANACAFÉ 2025; Johnson 2020 | as above | Extension / review | 2017–2025 | H |
| Trap density (monitoring) | ≥ 5 traps/acre (≈ 12/ha), hung 2–5 ft (0.6–1.5 m) high; change lure every 4–6 weeks; check every 2 weeks | traps/acre | IP-41 | same | Extension | 2017 | H |
| Trap density (ethological control) | 12 traps/mz (17/ha), at 1.50 m, 250 ml liquid, emptied every 2 weeks; 1 cm³ of trapped beetles ≈ 1,000 ± 50 borers | traps/ha | ANACAFÉ 2021 | (2021 URL) | Extension | 2021 | H |
| Trap removal rule | stop trapping once accumulated rainfall exceeds 200 mm | mm | ANACAFÉ CEDICAFÉ bulletin, Jan 2019 | https://www.anacafe.org/uploads/file/359297b756b547adb17050f0832eb931/Boletin-Tecnico-CEDICAFE-Enero-2019.pdf | Extension | 2019 | M |
| Mass-trapping density | 22–25 traps/ha | traps/ha | Johnson et al. | PMC7763606 | Review | 2020 | M |
| *B. bassiana* spray (Cenicafé) | 2×10¹⁰ conidia/L, 50 ml per tree → 1×10⁹ conidia per tree (≈ 5×10¹² per ha at 5,000 trees); product quality ≥ 1×10⁹ conidia/g, ≥ 95 % purity, > 90 % germination at 24 h; best conditions 23–28 °C and > 90 % RH | conidia | Cenicafé AT 493 | (URL above) | Extension | 2018 | H |
| *B. bassiana* (ANACAFÉ) | 4 kg/mz (≈ 5.7 kg/ha), directed spray, applied 05:30–09:00, starting with the rains (May) | kg/mz | ANACAFÉ 2021/2025 | as above | Extension | 2021/2025 | H (concentration of the product not stated) |
| *B. bassiana* (Hawaii) | 32 oz (1 qt) of BotaniGard ES / Mycotrol ESO per acre in ≥ 30 gal water; at least monthly or as the thresholds require | per acre | IP-47 | same | Extension | 2020 | H |
| Parasitoids (ANACAFÉ) | ≥ 3,500 parasitoids per mz, released gradually from day 1 to day 60 after flowering | insects/mz | ANACAFÉ 2025 | same | Extension | 2025 | M |
| Insecticides listed by ANACAFÉ (dose per mz / per ha) | isocycloseram 140/200 ml; thiamethoxam + chlorantraniliprole 315/450 ml; clothianidin 140/200 g | product | ANACAFÉ 2025 | same | Extension | 2025 | M (check national registration and the Rainforest Alliance lists before use) |
| Sanitation effect | Collecting fallen fruit with a basket cut next-season infestation by up to 73.6 % and kept it below the 5 % damage threshold; 85–96 % of fruit collected | % | Cenicafé AT 468 | https://biblioteca.cenicafe.org/handle/10778/706 | Extension | 2016 | H |
| Borer carry-over on the ground | 5–12 % of the farm's borer population stays in fruit on the ground; repase twice a year | % | FNC Separata | (URL above) | Extension | n.d. | M |
| Repase / strip-pick target | **No numeric "maximum fruits per tree" found in any accessible source.** UH says strip-pick *all* remaining cherry at the end of harvest. | — | IP-41/47 | — | — | — | — |
| Post-harvest | Wet mill screened; pulp piles tarped; traps kept at the mill; parchment dried to ≤ 10.7 % moisture; bags tied shut; delivery trucks washed. Infested fruit destroyed by bagging in sun ≥ 2 weeks, burial ≥ 6 in (15 cm), or freezing at ≤ −15 °C for ≥ 48 h | — | IP-41 | same | Extension | 2017 | H |

### Sampling protocol for the app (default = Cenicafé "30 trees", with ANACAFÉ and UH variants)
1. Unit: one lot (management block) at a uniform flowering date.
2. Start ~30 DAF (UH) or in the ANACAFÉ window (60–90 / 75–90 DAF depending on altitude). Repeat every 2 weeks until ~150 DAF, then monthly until harvest.
3. Walk a zig-zag path and pick 30 trees at random (UH minimum: 12 trees/acre). On each tree take one productive branch in the middle third.
4. Count total green fruits and fruits with an entry hole. Infestation % = bored / total × 100.
5. Optional for spray decisions: dissect ~100 bored fruits and record the A/B versus C/D position and whether the borer is alive.
6. Decision: compare the result with the threshold of the authority profile the farm has chosen (table above). Apply only inside the window (fruit > 120 DAF and < ~135–150 DAF, with ≥ 50 % of borers in A/B).
7. Close the loop: record the next sampling result as the effectiveness of the intervention.

---

## 2. Coffee Leaf Rust — roya (*Hemileia vastatrix*)

| Parameter | Value | Unit | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Surveillance sample size (regional guide) | 15–30 plants, 2–4 branches per plant (more plants when watching for a breakdown of resistance) | plants | Avelino et al., *Guía para la vigilancia de la roya del café* (OIRSA, SENASICA, ICAFE, CATIE, CIRAD) | https://agritrop.cirad.fr/595182/1/Gu%C3%ADa%20vigilancia%20-%20VF.pdf | Institutional guide | 2019 | H |
| Mexican "T" design | 20 plants (10 along the border, 10 from the border to the centre), 10 leaves per plant | plants; leaves | same | same | Institutional | 2019 | H |
| SENASICA sentinel plot | ~1 ha; 100 plants (systematic) for plant-level severity; 20 plants ("5 de oros") × 10 leaves in 3 strata (3/4/3) | plants; leaves | DGSV-SENASICA, *Manual técnico para el manejo preventivo de la roya* | https://royacafe.lanref.org.mx/Documentos/GS_DS_Manualroyadelcafeto.pdf | Government manual | 2013 | H |
| ANACAFÉ sampling | 20 sites per 5 mz; each site ¼ mz (1,750 m²); 14 plants × 10 leaves (low, middle, upper strata and 4 cardinal points) = 140 leaves; incidence = infected leaves × 100 / 140 | leaves | ANACAFÉ, *Situación roya* | https://www.anacafe.org/uploads/file/a0782d43ce214d408c7077394059f17f/17-situacion-roya.pdf | Extension | 2015 | H |
| ANACAFÉ timing | sample 60–70 DAF of the main flowering; start sprays when fruit is 70–75 days old | DAF | same | same | Extension | 2015 | H |
| **ANACAFÉ threshold** | start the fungicide programme while incidence is **< 10 %** (control fails at higher incidence) | % leaves | same; CEDICAFÉ 2016–2021 report | same; https://www.anacafe.org/uploads/file/53becfe77b6f4528b94db9589bb54117/Manejo-de-plagas-y-enfermedades-2021-2016.pdf | Extension / research | 2015–2021 | H |
| ANACAFÉ programme | 4 applications at 45-day intervals (≈ 180 days of protection), timed by region and altitude between May and October | apps | ANACAFÉ 2015 | same | Extension | 2015 | H |
| CEDICAFÉ monitoring | 50 leaves at random from the central trees of each plot, every 14–15 days | leaves | CEDICAFÉ 2016–2021 | same | Research report | 2021 | M |
| **Cenicafé action threshold** | **15 % incidence** during the critical periods | % | Marín-Ramírez et al., Avance Técnico 581 | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/4508/4691 | Extension (research) | 2025 | H |
| Cenicafé economic damage level | 30 % incidence | % | same | same | Extension | 2025 | H |
| Cenicafé loss and defoliation | 30–50 % yield loss on susceptible varieties without control; defoliation once severity exceeds 35 % | % | same | same | Extension | 2025 | H |
| Cenicafé timing | fungicides between 60 and 180 DAF of the main flowering; typical schedule: start at 60 DAF, 2–3 applications 45 days apart (e.g. cyproconazole + azoxystrobin at 0.75 L/ha) | DAF | AT 581; Cenicafé "Manejo de enfermedades" web page | same; https://www.cenicafe.org/es/index.php/cultivemos_cafe/manejo_de_enfermedades | Extension | 2025 / n.d. | H |
| Disease cycle | about 30 days; 6–8 cycles per season depending on rain; optimum 22–23 °C | days | Virginio Filho & Astorga (CATIE), *Prevención y control de la roya* | https://worldcoffeeresearch.org/work/prevencion-y-control-de-la-roya-del-cafe-prevention-and-control-coffee-leaf-rust | Institutional manual | post-2012 (WCR page: written after the 2011–12 crisis) | M |
| Leaf severity scale (SAD) | 2.5, 5, 10, 20, 40, 80 % of leaf area | % | Capucho et al., *Plant Pathology* 60 | https://bsppjournals.onlinelibrary.wiley.com/doi/10.1111/j.1365-3059.2011.02472.x | Peer-reviewed | 2011 | H |
| SENASICA leaf classes | 0 = none; 1 = chlorotic points (0.5–1 %); 2 = 1–5 %; 3 = 6–20 %; 4 = 21–50 %; 5 = > 50 % | class | SENASICA 2013 | above | Government | 2013 | H |
| SENASICA plant classes / defoliation | plant: 0, 3, 10, 30, 60 %; defoliation: 0, 20, 40, 60, > 60 % | class | same | same | Government | 2013 | H |
| Alert system | OIRSA five-colour alert (blue, green, yellow, orange, red); levels depend on phenology and variety. **Cut-offs not retrieved.** | — | Avelino et al. 2019 | above | Institutional | 2019 | M |
| Regional early warning | PROCAGICA "Red Regional de Alerta Temprana" (procagica-rrat.net, models page); ICAFE weather-based risk system | — | web listing; guide 2019 | https://www.procagica-rrat.net/ | Institutional | — | L (site could not be opened) |
| Fungicide classes | Contact (preventive only): copper hydroxide, oxide or oxychloride; sulphur-lime; neem. Systemic (curative): triazoles (cyproconazole, epoxiconazole, triadimefon, hexaconazole, propiconazole) and strobilurin mixes | — | ANACAFÉ 2015 | above | Extension | 2015 | H |
| Resistance groups | copper = FRAC M01 (low risk); mancozeb M03 (low); triazoles (DMI) FRAC 3 (medium); strobilurins (QoI) FRAC 11 (**high**, cross-resistance across the group); carbendazim FRAC 1 (high) | FRAC | FRAC Code List 2024 | https://www.frac.info/media/kufnaceb/frac-code-list-2024.pdf | Industry standard | 2024 | H |
| Resistance breakdown | Lempira (a Catimor) fully resistant in 2016, diseased in 2017 (3 new pathotypes); Costa Rica 95, IHCAFE 90 and Colombian Catimor 8667 also showing rust; 16 new pathotypes in Honduras | — | Deras Perla, Zambolim, Ferreira Parreira (IHCAFE CIC-JAP), PROMECAFE WikiCafé | https://wikicafe.promecafe.net/index.php/NUEVOS_PAT%C3%93TIPOS_DE_HEMILEA_VASTATRIX_IDENTIFICADOS_EN_EL_CULTIVO_DEL_CAF%C3%89_EN_HONDURAS | Institutional / research | ~2018 | M |
| Epidemic context | Colombia −31 % (2008–2011), Central America −16 % (2013); drivers were low profitability plus reduced thermal amplitude | % | Avelino et al., *Food Security* | https://alliancebioversityciat.org/publications-data/coffee-rust-crises-colombia-and-central-america-2008-2013-impacts-plausible | Peer-reviewed | 2015 | H |
| Panama (MIDA) | monitor rust, ojo de gallo, anthracnose and broca; control before the rains; renovate with Sarchimores and Catuaí SH3; focus on Boquete, Volcán and Renacimiento (1,400–2,000 m). No numbers given. | — | MIDA press note | https://mida.gob.pa/2026/03/26/mida-recomienda-a-caficultores-monitorear-las-plantaciones/ | Government (press) | 2026 | M |

**Not verified:** the commonly cited "PROMECAFE/IICA 30 plants × 3 branches" protocol. The documents that would hold it (CATIE "Estado del arte", and chapter 6 of the CATIE manual with the ANACAFÉ, CATIE, ICAFE and OIRSA methods) could not be read. Use the ANACAFÉ 140-leaf design or the Avelino 2019 range (15–30 plants × 2–4 branches) instead.

**Protocol.** Pick 14–30 plants per lot. On each plant take one branch from each of the low, middle and upper strata, and use the third or fourth leaf pair (the ANACAFÉ method takes 10 leaves in total). Count leaves with any sporulating or chlorotic lesion. Incidence % = infected leaves / leaves examined × 100. Optionally score severity on the Capucho or SENASICA scale. Repeat every 14–30 days from about 60 DAF. Decision: incidence ≥ the profile threshold (ANACAFÉ: begin before 10 %; Cenicafé: 15 % action, 30 % damage) → systemic fungicide (triazole or triazole + strobilurin, rotating FRAC groups). Below the threshold during the rains → protective copper programme.

---

## 3. Ojo de gallo / American leaf spot (*Mycena citricolor*) — important in humid, shaded Panamanian highlands

| Parameter | Value | Unit | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Geographic range | Americas only | — | SENASICA Ficha Técnica No. 49 | https://royacafe.lanref.org.mx/Documentos/FTNo49Mycenacitricolor.pdf | Government | 2014 | H |
| Favourable conditions | > 700 m (SENASICA); risk rises above 1,200 m (Avelino); 19–23 °C; ~20 °C with high humidity and low light; dense shade | m; °C | SENASICA 2014; Avelino, PROMECAFE slides | above; https://promecafe.net/wp-content/uploads/2019/10/Ojo-de-gallo.pdf | Gov / research | 2014; 2019 | H/M |
| Losses | at 49 % incidence: 19 % primary and 50 % secondary losses; Guatemala up to 35 % of production; Puerto Rico up to 75 % | % | Avelino (PROMECAFE); SENASICA | same | Research | — | M |
| **Action threshold** | start control while incidence is **< 10 %** | % | Lizardo, IHCAFE, *Enfermedades de importancia económica del café* (PROMECAFE) | https://promecafe.net/wp-content/uploads/2019/10/ENFERMEDADES-DEL-CAFE-CRCI.pdf | Extension (national institute) | 2018 | M |
| Variety susceptibility (Honduras) | More tolerant: Typica, Bourbon, Catuaí, Pacas, Caturra. More susceptible: IHCAFE 90, Lempira, Parainema, Catimores, Sarchimores | — | same | same | Extension | 2018 | M |
| Cultural control | avoid tall, dense timber shade (free-growing *Erythrina poeppigiana* raises drop kinetic energy by 377 %, *Cordia alliodora* by 325 %); prune; avoid > 5,000 plants/ha | — | Avelino (PROMECAFE) | above | Research | — | M |
| Chemical options (Central America) | cyproconazole (Alto) 500 ml/ha + validamycin (Cepex) 2 L/ha; tebuconazole (Silvacur) 700 ml/ha + validamycin 2 L/ha; Bordeaux mixture (1.5 kg CuSO₄ + 2 kg Ca(OH)₂ per 100 L); usually 3 applications | per ha | same | same | Research slides | — | M |
| Cenicafé timing ("gotera") | cyproconazole 30–60 DAF, or 15 days before the rains set in; 3 applications 30–45 days apart | DAF | Cenicafé "Manejo de enfermedades" | above | Extension | n.d. | M |
| Sampling | no standard numeric design retrieved; SENASICA uses fixed and mobile plots; CEDICAFÉ evaluated 20–100 plants every 2 weeks (leaves, branches, fruit) | — | SENASICA; CEDICAFÉ | above | — | — | L |

---

## 4. Anthracnose (*Colletotrichum* spp.) in the Americas, and Coffee Berry Disease (*C. kahawae*)

| Parameter | Value | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| **CBD presence** | *C. kahawae* "restricted to some African countries"; quarantine pest absent from Colombia, Brazil, Honduras, Peru, Guatemala and other producers; "a severe threat to the Americas" | Ferrucho et al., *Plant Disease* (PCR detection for the quarantine fungus) | https://apsjournals.apsnet.org/doi/10.1094/PDIS-09-23-1788-SR | Peer-reviewed | 2024 | H |
| American anthracnose: epidemiology | leaf incidence 9.84 % (April) rising to 35.66 % (August); correlates with minimum temperature (r = 0.88); 28.38 % yield loss in untreated plots | CEDICAFÉ 2016–2021 (Guatemala) | (ANACAFÉ URL above) | Research report | 2017–18 data | M |
| Conditions and control | rainy season, ~22 °C, poor drainage, nutritional imbalance or water deficit. Control: balanced nutrition, copper oxychloride, systemic fungicides | Lizardo, IHCAFE | above | Extension | 2018 | M |

*Note:* the CEDICAFÉ report names the organism *Colletotrichum coffeanum*, an older and ambiguous name. Record it in the catalog as "*Colletotrichum* spp. (*C. gloeosporioides* complex)", and keep it separate from *C. kahawae*.

---

## 5. Coffee leaf miner — minador (*Leucoptera coffeella*)

| Parameter | Value | Unit | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Sampling (Cenicafé) | 30 trees per affected lot; 3 branches per tree from the middle third; count total leaves and mined leaves | trees | Constantino et al., Avance Técnico 409 | https://biblioteca.cenicafe.org/bitstream/10778/330/1/avt0409.pdf | Extension | 2011 | H |
| Formula | % mined leaves = mined leaves × 100 / total leaves | — | same | same | — | 2011 | H |
| Economic damage threshold | 30 % mined leaves; **20 %** for first-year plantings during flowering or fruit set | % | same | same | Extension | 2011 | H |
| Chemical only if | > 30 % infestation **and** parasitism < 20 % (check parasitism on 100 leaves with active mines); otherwise re-monitor every 8 days | % | same | same | Extension | 2011 | H |
| ANACAFÉ sampling | every 14 days from February to May; zig-zag over ¼ mz; 10 plants × 5 leaves = 50 leaves | leaves | ANACAFÉ CEDICAFÉ, Jan 2019 | (URL above) | Extension | 2019 | H |
| ANACAFÉ threshold | ≥ 15 live larvae in the 50-leaf sample from ¼ mz | larvae | same | same | Extension | 2019 | H |
| Season | population peak late April (Guatemala); declines once the rains are established | — | same | same | — | 2019 | M |

---

## 6. Nematodes (*Meloidogyne* spp., *Pratylenchus* spp.)

| Parameter | Value | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| Nemaya rootstock | *C. canephora* T3561 × T3751 (PROMECAFE–CIRAD–CATIE). Resistant to *M. exigua*, *M. arenaria*, *M. paranaensis*; tolerant to *Pratylenchus* spp. Rootstock use only; grafting has no effect on cup quality | World Coffee Research variety catalog | https://varieties.worldcoffeeresearch.org/varieties/nemaya | Institutional | n.d. | H |
| Grafting vs nematicide | Guatemala, *Pratylenchus*-infested site at 900 m: grafted plants on *C. canephora* gave ≈ 250 % more yield over 3 harvests. Terbufos suppressed nematodes only until year 2 and did not raise yield | Villain et al., *Nematropica* | https://journals.flvc.org/nematropica/article/download/69590/67250 | Peer-reviewed | 2000 | H |
| *M. exigua* | galls visible on roots; chlorosis and defoliation above ground; survives about 6 months without a host (fallow longer than 6 months before replanting); IAPAR 59 carries the Mex-1 gene | Wikipedia (secondary) | https://en.wikipedia.org/wiki/Coffee_root-knot_nematode | Secondary | — | L |
| **Numeric thresholds** (nematodes per g of root or per 100 cm³ of soil) | **None found in accessible sources.** Diagnosis should be lab-based: composite root plus rhizosphere soil sample from symptomatic and asymptomatic plants | — | — | — | — | — |

---

## 7. Other diseases linked to nutrition, shade or microclimate

| Organism | Key facts and numbers | Source | URL | Year | Conf. |
|---|---|---|---|---|---|
| **Mancha de hierro / Cercospora** (*Cercospora coffeicola*) | Low N and high K without Ca increase severity (Pozza et al. 2000/2001); RH > 85 %, 10–25 °C, excess sun. Control: balanced nutrition, liming, shade. Cenicafé: 2–3 applications (cyproconazole, pyraclostrobin, or cyproconazole + azoxystrobin) at 60–90 and 120 DAF; nursery 2 × 2.0 g DAP per bag at 2 and 4 months | Lizardo (IHCAFE) 2018; Cenicafé web page | promecafe.net PDF above; cenicafe.org page above | 2018 / n.d. | M |
| **Mal de hilachas** (*Corticium/Pellicularia koleroga*) | RH > 90 %, 25–30 °C, 3,000–4,000 mm rain per year, excess shade, high density (Cenicafé); RH 85–95 %, 20–24 °C (IHCAFE). Control: prune and burn affected branches, open the canopy; copper oxychloride 5–12 g/L, or mancozeb + copper 1.5–2 kg/ha, every 30 days from the start of the rains; systemic hexaconazole and cyproconazole reported **ineffective** in Central America | Cenicafé ficha 17; Lizardo 2018 | https://biblioteca.cenicafe.org/bitstream/10778/993/19/17.%20Mal%20de%20hilachas%20Ara%C3%B1era.pdf | n.d. | M |
| **Phoma** (*P. costarricensis*, "derrite/quema") | > 1,200 m, cold wind, high RH, high N:K. Rain is the only significant driver (CEDICAFÉ 2015–16, 100 plants, 44 biweekly readings); start preventive control in April (low inoculum) above 900 m; use windbreaks | Lizardo 2018; CEDICAFÉ 2016–2021 | above | 2018–21 | M |
| **Root rots** (*Rosellinia bunodes*, *R. pepo*) | linked to decomposing organic matter; remove affected plants early and treat the planting hole and neighbouring plants | Lizardo 2018 | above | 2018 | M |
| **Mal rosado** (*Erythricium salmonicolor*) | Cenicafé: general spraying if > 10 % of branches in the productive third are affected; 2–3 applications 45 days apart | Cenicafé web page | above | n.d. | M |
| ***Xylella fastidiosa*** ("crespera") | first reported on coffee in Costa Rica in 2001; leaf deformation, mosaic, flower and berry abortion; leafhopper vectors (transmission by 8 species later confirmed in Costa Rica) | EPPO Reporting Service; PMC article | https://gd.eppo.int/reporting/article-3010 ; https://pmc.ncbi.nlm.nih.gov/articles/PMC13331132/ | 2001 / recent | M. Record as a watch-list item, not a routine scouting target. |
| *Fusarium* | no Central American coffee threshold or protocol found → leave out of the default catalog | — | — | — | — |

---

## 8. Agrochemical records, PHI/REI, PPE and certification

| Item | Finding | Source | URL | Year | Conf. |
|---|---|---|---|---|---|
| REI definition | "the time immediately after a pesticide application when entry into the treated area is restricted"; set by the label; when products are mixed, the **longer** REI applies | US EPA Worker Protection Standard | https://www.epa.gov/pesticide-worker-safety/restrictions-protect-workers-after-pesticide-applications | current | H |
| PHI / REI under Rainforest Alliance | "Recommended pre-harvest and re-entry intervals for all agrochemicals used are known and respected"; the longest interval applies when products are mixed; **no default hours** | RA Sustainable Agriculture Standard **draft** v1.0 (criterion 2.6.12; numbering changed in the final 2020 standard) | https://cgspace.cgiar.org/bitstreams/2227d5f7-712f-47d0-af94-93e93c92cc54/download | 2018 draft | M |
| Application record fields | Base: product brand name, date, location, quantity/dose, applicator. Improvement level: active ingredient, container lot, surplus mix and its disposal, target pest | same draft (2.6.9, 2.6.17) | same | 2018 | M |
| Monitoring record fields | pest, disease, weed or natural enemy; date; location; incidence; weather; crop condition. Pesticide use "based on documented thresholds" | same draft (2.5.2; Annex 1) | same | 2018 | M |
| RA pesticide lists | Farming Annex v1.4 (A-07-SCRL-B-FA, binding from 1 Mar 2026): **Prohibited list 163 a.i.** (FAO/WHO HHP criteria); Obsolete list 24; **Risk-Mitigation list 166** (allowed only with the listed mitigations); Exceptional Use Policy (decided twice a year) | RA Knowledge Hub | https://knowledge.rainforest-alliance.org/docs/farming-annex-v14 | 2025 (pub.) | H |
| RA PPE | as the label/MSDS prescribes; if the label is silent, basic protective clothing plus eye protection and a respirator; baseline and periodic cholinesterase tests for anyone handling organophosphates or carbamates | same | same | 2025 | H |
| RA buffers | aerial: 30 m from roads, human activity and ecosystems, 15 m per riverbank; drone: ≥ 10 m (5 m by exception); ground: barrier or non-application zone, **no fixed width** | same | same | 2025 | H |
| ANACAFÉ fungicide intervals | systemic 60 days; contact 45–60 days; botanical 14–15 days | CEDICAFÉ 2016–2021 | above | 2021 | M |

The full 2020 Farm Requirements (current requirement numbers 4.x) could not be opened. Confirm the field list against v1.4 of the Farm Requirements before building a certification checklist.

---

## 9. Generic IPM data model (definitions)

- **Incidence** = share of units (leaves, fruits, branches or plants) showing any symptom or attack: `affected_units / examined_units × 100` (Avelino et al. 2019; Cenicafé AT 409 formula).
- **Severity** = share of tissue area affected, or an ordinal class (Capucho 2011 diagram 2.5–80 %; SENASICA leaf classes 0–5, plant classes 0–4, defoliation classes 0–4).
- **Infestation (CBB)** = bored fruits / fruits examined × 100, optionally with the **position mix** (A/B vs C/D) and the share alive (UH).
- Each observation needs: `organism_code, lot_id, date, phenology_DAF, protocol_id, units_examined, units_affected, severity_class[], sample_points (GPS), observer`.
- Each threshold needs: `organism_code, metric (incidence|infestation|mined_leaf|larvae_count|index), value, comparator, phenology_window (DAF min–max), condition (e.g. AB ≥ 50 %, parasitism < 20 %, yield class), action_type, authority_source_id`.

---

## Recommended app catalog entries

| code | name_es | name_en | scientific | Americas | sampling protocol (default) | default threshold (source) |
|---|---|---|---|---|---|---|
| CBB | Broca del café | Coffee berry borer | *Hypothenemus hampei* | yes | 30 trees/lot × 1 branch, count bored/total; biweekly from ~30 DAF (Cenicafé 2005; UH IP-47) | > 2 % infested **and** fruit > 120 DAF **and** ≥ 50 % in A/B (Cenicafé AT 493, 2018). Alt. profile ANACAFÉ: 3–5 % by yield class (2021) |
| CLR | Roya del café | Coffee leaf rust | *Hemileia vastatrix* | yes | 14 plants × 10 leaves per ¼ mz site, 3 strata (ANACAFÉ 2015) or 15–30 plants × 2–4 branches (Avelino 2019) | ANACAFÉ: start the programme before 10 % incidence. Cenicafé: 15 % action / 30 % economic damage (AT 581, 2025) |
| ALS | Ojo de gallo | American leaf spot | *Mycena citricolor* | yes (Americas only) | no standard design; reuse the leaf protocol of CLR and record lesions per leaf | < 10 % incidence → start control (IHCAFE, Lizardo 2018) — confidence M |
| ANT | Antracnosis | Anthracnose | *Colletotrichum* spp. (*C. gloeosporioides* complex) | yes | leaf, branch and fruit incidence every 2 weeks (CEDICAFÉ) | none found → user config |
| CBD | Enfermedad de la cereza del café (CBD) | Coffee berry disease | *Colletotrichum kahawae* | **no** (Africa only, quarantine) | none (biosecurity watch) | any suspicion → report to MIDA/APA (Ferrucho et al. 2024) |
| CLM | Minador de la hoja | Coffee leaf miner | *Leucoptera coffeella* | yes | 30 trees × 3 mid-third branches, % mined leaves (Cenicafé AT 409) | 30 % mined leaves (20 % in young plantings) and parasitism < 20 % (Cenicafé 2011). Alt. ANACAFÉ: ≥ 15 live larvae per 50 leaves |
| NEM | Nematodos | Nematodes | *Meloidogyne* spp., *Pratylenchus* spp. | yes | lab analysis of roots and soil from symptomatic patches | none found → user/lab config. Prevention: Nemaya rootstock |
| CER | Mancha de hierro | Brown eye spot | *Cercospora coffeicola* | yes | leaf incidence (CLR protocol) | none found. Check nutrition (N, K, Ca) first |
| THB | Mal de hilachas | Thread blight | *Corticium (Pellicularia) koleroga* | yes | branch incidence | none found. Cultural control first |
| PHO | Derrite / quema por Phoma | Phoma leaf blight | *Phoma costarricensis* | yes | 100 plants biweekly (CEDICAFÉ) | none found. Preventive programme in April at > 900 m |
| PNK | Mal rosado | Pink disease | *Erythricium salmonicolor* | yes | % affected branches in the productive third | > 10 % branches → general spray (Cenicafé) |
| ROS | Llaga radical | Rosellinia root rot | *Rosellinia bunodes*, *R. pepo* | yes | plant counts (wilting) | any case → remove and treat the site |
| XYL | Crespera | Coffee leaf scorch | *Xylella fastidiosa* | yes (Costa Rica 2001) | symptom watch | watch-list only |

---

## Corrections to the existing package

1. **CBD entry is mislabelled.** In `pest_disease_catalog`, CBD carries `name_es: "Antracnosis de la cereza"`. In the Americas, "antracnosis" means *Colletotrichum* spp., which is present. Rename CBD to "Enfermedad de la cereza del café (CBD)", set `region_presence: Africa only; quarantine pest`, and cite Ferrucho et al. 2024. Add a separate **ANT** entry for *Colletotrichum* spp. that is visible in Panama.
2. **§7 of the domain reference lists CBD with "preventive copper sprays"** as if it were a routine disease. In Panama it should be a biosecurity alert, not a spray programme.
3. **"Resistant varieties" for CLR needs a caveat.** Resistance derived from Timor Hybrid has broken down in the field (Lempira, Costa Rica 95, IHCAFE 90, Catimor 8667 in Honduras). Store `resistance_status` per variety with a date, and keep scouting resistant lots. Avelino 2019 recommends more plants per sample when watching for breakdown.
4. **Add the missing Panama-relevant diseases:** ojo de gallo (Americas only; MIDA lists it for Boquete and Volcán), Cercospora, mal de hilachas, Phoma and anthracnose. All are tied to shade, altitude or nutrition, so link them to SOI.NUT and shade records.
5. **§17.2 can now be partly filled.** Ship authority profiles (Cenicafé, ANACAFÉ, UH-CTAHR) with the thresholds above as **selectable defaults**, not empty fields, and keep them editable.
6. **SOI.IPM.01 must record phenology (DAF of the main flowering).** Every CBB and CLR threshold above is gated by fruit age (CBB > 120 DAF, ANACAFÉ window 61–134 DAF; CLR 60–180 DAF). Without a flowering date per lot, the thresholds cannot be applied.
7. **SOI.IPM.01 should capture the CBB position (A/B vs C/D) and natural-enemy parasitism (CLM)**, because both are conditions inside the thresholds.
8. **SOI.IPM.03 lure field** should be structured as `methanol:ethanol ratio` (1:1 or 3:1), `traps/ha`, `height_m`, `lure_change_date`, and `catch_volume_cm3` (≈ 1,000 borers per cm³, ANACAFÉ). Add the ANACAFÉ rule "stop trapping after 200 mm of accumulated rain" as an optional rule.
9. **Repela/pepena target.** No source gives a "max fruits left per tree" number. Record `fruits_collected` and `fruits_remaining_sample` and let the user set the target. Do not hard-code one.
10. **SOI.IPM.02 needs more fields:** `FRAC/IRAC group` (to drive rotation warnings: QoI high risk, DMI medium, copper low), `RA list status` (prohibited / risk-mitigation / none, from Farming Annex v1.4), `PHI_days` and `REI_hours` **from the label** (no default exists in the RA standard), `container_lot`, `surplus_disposal`, `target_organism`. The NEM control "Robusta grafting" should name **Nemaya** (WCR).
11. **Profile rule:** insecticides that ANACAFÉ lists (e.g. clothianidin, thiamethoxam) must be checked against MIDA registration and the RA lists before the app suggests them. The app should never recommend a product, only record one.

---

### Open items / not found
- Exact OIRSA alert-level cut-offs; the PROMECAFE 30 × 3 rust protocol; MIDA/IDIAP numeric guidance for Panama; numeric nematode thresholds; Fusarium; the IHCAFE ojo de gallo bulletin No. 12 (2020).
- A Panama CBB news item (IDIAP/MIDA, Capira and Colón, "80 % → 2 %" goal) was found but is undated: https://elcapitalfinanciero.com/coordinan-acciones-para-enfrentar-la-broca-del-cafe/ — L.
