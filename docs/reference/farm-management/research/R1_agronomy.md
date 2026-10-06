# R1 — Agronomy & Nutrition: verification of the farm-ref package against authoritative sources

**Scope:** 01_DOMAIN_REFERENCE.md §1–6, §17 and the agronomy keys in 04_reference_parameters.json (VNT-2025 baseline).
**Date of research:** 2026-10-01. **Method:** WebSearch + WebFetch of institute/extension/peer-reviewed pages. Values are reported only where they were read in a source. Values marked **[derived]** are arithmetic conversions or calculations I made from sourced numbers; they are labelled as such and are not source claims.

**Access limits (read first):** The ICAFE *Guía Técnica para el Cultivo del Café* (icafe.cr, both versions) and most `biblioteca.cenicafe.org` / `cenicafe.org` PDFs could not be fetched: SSL errors, timeouts, or a permission prompt that nobody answered. Cenicafé material was reached through `publicaciones.cenicafe.org` and academia.edu mirrors instead. **No ICAFE primary numbers are in this report.** The only Costa Rican figures come from a former-ICAFE consultant's site, marked low/medium. A CATIE-authored shade-% recommendation was not found. No IDIAP/MIDA (Panama) agronomic *recommendations* were found, only characterisation data.

## Source register

| ID | Source | Type | Year | URL |
|---|---|---|---|---|
| DAMATTA06 | DaMatta & Ramalho, *Braz. J. Plant Physiol.* review (cites Alègre 1959, Camargo 1985, Haarer 1958) | peer-reviewed | 2006 | https://www.scielo.br/j/bjpp/a/bDfpJwLr4xLcznSwy4b9zkf/?lang=en |
| UNIGARRO25 | "Flowering and Fruiting of *Coffea arabica* L.: A Comprehensive Perspective from Phenology", *Plants* 14(21):3396 (Cenicafé authors) | peer-reviewed review | 2025 | https://www.mdpi.com/2223-7747/14/21/3396 |
| UNIGARRO26 | Unigarro et al., Cenicafé 1 ripening, *Crops* 6(4):75 | peer-reviewed | 2026 | https://www.mdpi.com/2673-7655/6/4/75 |
| CEN-AT194 | Salazar-Gutiérrez, Arcila et al., Cenicafé Avance Técnico 194 (fruit growth) | institute | 1993 | https://biblioteca.cenicafe.org/bitstream/10778/1045/1/avt0194.pdf |
| CEN-AT272 | Vélez-Arango et al., Cenicafé AT 272 (flowering/harvest at 3 altitudes) | institute | 2000 | https://biblioteca.cenicafe.org/bitstream/10778/794/1/avt0272.pdf |
| CEN-AT2090 | Gómez & Suárez, Cenicafé "Clima y suelo para el cafeto" | institute (old) | 1979 | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/view/2090 |
| MAGA-GT | MAGA Guatemala (DIGEGR), Ficha técnica agroclimática café | government | n.d. (~2024 upload) | https://guatemalanosedetiene.gt/wp-content/uploads/2024/06/FICHA-TECNICA-AGROCLIMATICA-CAFE.pdf |
| MIDA11 | Valdespino & Jaramillo, MIDA Panama, Caracterización sistema productivo café Tierras Altas | government | 2011 | https://mida.gob.pa/wp-content/uploads/2021/07/SistemaProductivo-Cafe-Tierras-Altas-1.pdf |
| IDIAP20 | IDIAP Panama, project "Mejoramiento de variedades de café" (Río Sereno) | institute | 2020–23 | https://proyectos.idiap.gob.pa/uploads/adjuntos/PIIA_MEJORAMIENTO_DE_VARIEDADES_DE_CAFE.pdf |
| CEN-SADDIAZ20 | Sadeghian & Díaz, Rev. Cenicafé 71(1):21–31, soil acidity correction | peer-reviewed (institute journal) | 2020 | https://publicaciones.cenicafe.org/index.php/cenicafe/article/view/13 |
| CEN-AT497 | Sadeghian, Cenicafé AT 497, soil analysis interpretation (academia.edu mirror) | institute | 2018 | https://www.academia.edu/96397058/ |
| CEN-AT515 | Sadeghian, Cenicafé AT 515, leaf analysis guide (academia.edu mirror) | institute | 2020 | https://www.academia.edu/96397049/ |
| CEN-AT533 | Sadeghian & Duque, Cenicafé AT 533, optimal nutrient doses | institute | 2021 | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/121/82 |
| CEN-AT506 | González-Osorio & Sadeghian, Cenicafé AT 506, fertiliser splitting | institute | 2019 | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/view/135 |
| CEN-EXTR07 | Sadeghian, Mejía & Arcila, Cenicafé 57(4):251–261, nutrient removal by harvest | peer-reviewed (institute journal) | 2006/2007 | https://biblioteca.cenicafe.org/handle/10778/117 |
| SAD-SE | Sadeghian, "Manejo integrado de nutrientes…", *Suelos Ecuatoriales* 44(2):74–89 | peer-reviewed | year not confirmed | https://dialnet.unirioja.es/descarga/articulo/7831475.pdf |
| CEN-ZN21 | Salamanca-Jiménez, Salazar & Sadeghian, *Entramado* (Zn response) | peer-reviewed | 2021 | https://www.redalyc.org/journal/2654/265470004018/html/ |
| RB-B24 | Ramirez-Builes et al., *Agronomy* 14(3):474, boron (Yara-affiliated authors) | peer-reviewed (industry authors) | 2024 | https://www.mdpi.com/2073-4395/14/3/474 |
| ANA-FERT | ANACAFÉ / R. Rodas, "Fertilización al suelo" (table from Anacafé & INPOFOS 2017) | institute | 2017+ | https://www.anacafe.org/uploads/file/b04fcafce8a54b5d804dde3462b59828/03-Fertilizaci%C3%B3n-al-suelo.pdf |
| ANA-ENM | ANACAFÉ CEDICAFÉ, Fertilización y enmiendas 2016–2021 | institute | 2021 | https://www.anacafe.org/uploads/file/c15d3267ff1849de8c38cf6cfae68a77/Fertilizacion_y_enmiendas-2016-2021.pdf |
| ANA-CAL19 | Girón, CEDICAFÉ boletín, "Uso y cálculo de enmiendas" | institute | 2019 | https://www.anacafe.org/uploads/file/c67898deb44b4ce2bdaa49e85b1ffcf6/Boletin-CEDICAFE-Abril-2019.pdf |
| ANA-GUIA | ANACAFÉ Guía Técnica de Caficultura 2013–14 (third-party mirror) | institute (mirror) | 2014 | https://pdfcoffee.com/guia-caficultura-anacafe-13-14-version-final-4-pdf-free.html |
| ANA-VAR | ANACAFÉ Guía de variedades y selección de semilla | institute | ~2021 | https://www.anacafe.org/uploads/file/bb091944490b490482f329b0ea0ec6bd/Guia-variedades-y-seleccion-semilla.pdf |
| ANA-DENS | ANACAFÉ *El Cafetal* No. 41, densidades de siembra | institute | 2015 | https://www.anacafe.org/uploads/file/97d4875bcd2643a28419e1d2e67f1693/El-Cafetal-08.pdf |
| ANA-SMT | ANACAFÉ Sistemas de Manejo de Tejido (web) | institute | n.d. | https://www.anacafe.org/SMT/ |
| ANA-PODA18 | ANACAFÉ CEDICAFÉ Boletín Técnico 2018-05 | institute | 2018 | https://www.anacafe.org/uploads/file/cb4d3da75f7f44d8832dd0fc1c0437d0/Boletin-Tecnico-CEDICAFE-2018-05.pdf |
| IHCAFE-OIRSA | Pineda (IHCAFE) & Urias (OIRSA), Manejo de tejido | institute / regional org | 2017 | https://www.oirsa.org/contenido/2018/Sanidad_Vegetal/Manuales%20OIRSA%202015-2018/MANEJO%20DE%20TEJIDO%20OIRSA%202017%20(1).pdf |
| IHCAFE-SOIL | López, Erazo et al. (IHCAFE), soils of Honduras (PROMECAFE talk) | institute | 2019 | https://promecafe.net/wp-content/uploads/2021/10/Juan-R.-Lopez.pdf |
| CEN-AT463 | Rendón, Cenicafé AT 463, renovation systems | institute | 2015 | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/317/382 |
| CEN-AT500 | Rendón, Cenicafé AT 500, renovation by zoca | institute | 2019 | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/141/105 |
| CEN-CICLOS25 | Rendón & Salazar, Cenicafé cartilla "Ciclos de renovación" | institute | 2025 | https://publicaciones.cenicafe.org/index.php/libros_manuales/article/download/3173/3237 |
| CEN-DENS23 | Rendón, "La densidad de siembra en los sistemas de producción de café en Colombia" | institute | 2023 | https://publicaciones.cenicafe.org/index.php/memorias/article/view/519 |
| CEN-AT309 | Duque, Arboleda & Arcila, Cenicafé AT 309, colinos descopados | institute | 2003 | https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1778/5176 |
| CEN-AT379 | Cenicafé AT 379, sombrío según oferta ambiental (Farfán & Jaramillo) | institute | 2009 | https://www.cenicafe.org/es/publications/avt0379.pdf |
| CEN-ARV | Cenicafé, Sistemas de producción, cap. 5 (weeds & erosion) | institute | n.d. | https://www.cenicafe.org/es/documents/LibroSistemasProduccionCapitulo5.pdf |
| WCR | World Coffee Research variety catalog | institute (international) | live, accessed 2026-10 | https://varieties.worldcoffeeresearch.org/ |
| PERU-RUST | Julca-Otiniano et al., new *H. vastatrix* races in Peru (DOAJ) | peer-reviewed | ~2022 | https://doaj.org/article/fe70dad2e9944c4ea41e1ba3d404543f |
| SMBC-BF | Smithsonian Migratory Bird Center, Bird Friendly norms | standard | n.d. (current) | https://nationalzoo.si.edu/sites/default/files/documents/bf_norms_english_accessible.pdf |
| RA-CH | Coffee & Conservation blog summary of RA 2020 SAS shade criteria | secondary | 2020 | https://www.coffeehabitat.com/2020/07/new-rainforest-alliance-shade-criteria/ |
| RA-ENV | Rainforest Alliance Environment Annex (states SAS 2020 expired 2026-03-01) | standard | 2026 | https://knowledge.rainforest-alliance.org/docs/environment-annex |
| KOUT22 | Koutouleas et al., *Agron. Sustain. Dev.* meta-analysis of shade × yield | peer-reviewed | 2022 | https://link.springer.com/article/10.1007/s13593-022-00788-2 |
| BELLOW03 | Bellow & Nair, *Agric. For. Meteorol.* 114:197–211, light-assessment methods | peer-reviewed | 2003 | https://www.sciencedirect.com/science/article/abs/pii/S0168192302001739 |
| IICA-DR | IICA, Manual de producción sostenible de café en República Dominicana | intergovernmental (IICA) | 2019 | https://repositorio.iica.int/bitstreams/70cf2f76-9de8-41ba-9c64-2f1e36019f80/download |
| FHIA | FHIA Honduras, Guía de producción de café con sombra de maderables | extension (foundation) | n.d. | https://fhia.org.hn/wp-content/uploads/guia_produccion_-cafe_con_sombra_de_maderables.pdf |
| CRS | CRS Proyecto RENACER, "La sombra en el café" | NGO extension | ~2021 | https://asa.crs.org/wp-content/uploads/2021/05/La-Sombra-en-el-Cafe.pdf |
| FAO-EC84 | FAO, Manual para prácticas de conservación de suelos (Ecuador) | intergovernmental | 1984 | https://www.fao.org/4/ar758s/ar758s.pdf |
| UH-CTAHR | Univ. Hawai'i CTAHR, coffee leaf & soil sampling (AS-3) | university extension | 1997/2016 | https://www.hawaiicoffeeed.com/uploads/2/6/7/7/26772370/coffee_leaf_and_soil_sampling_and_nutrient_levels.pdf |
| GUARCONI17 | Guarçoni, *Coffee Science* 12(3):327–336, base saturation for coffee | peer-reviewed | 2017 | https://biblioteca.incaper.es.gov.br/digital/bitstream/item/2746/1/BRT-saturacaoporbaseparaocafeeiro-guarconi.pdf |
| RAMIREZ-CR | J. Ramírez (ex-ICAFE consultant), CT-22 (cites Ramírez 2009, ICAFE) | consultant / secondary | n.d. | https://ramirezcaficulturadesdecostarica.com/ct-22 |
| UNA-NI | Universidad Nacional Agraria (Nicaragua) diploma module, coffee nutrition | university extension | 2023 | https://cenida.una.edu.ni/relectronicos/RENP35M966.pdf |

Unit conversions used in [derived] values: 1 manzana (mz) = 0.6987 ha; 1 qq = 100 lb = 45.36 kg; 1 lb/mz = 0.649 kg/ha; 1 qq/mz = 64.9 kg/ha; P→P2O5 ×2.291; K→K2O ×1.205; Mg→MgO ×1.658.

---

## 1. Arabica climate envelope, altitude and ripening time

| Parameter | Value | Unit/basis | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Optimum mean annual temp, arabica | 18–21 | °C | DAMATTA06 (Alègre 1959) | [link](https://www.scielo.br/j/bjpp/a/bDfpJwLr4xLcznSwy4b9zkf/?lang=en) | peer-reviewed | 2006 | high |
| Mean annual temp, moderate–very high production | 18–23 | °C | UNIGARRO25 | [link](https://www.mdpi.com/2223-7747/14/21/3396) | peer-reviewed | 2025 | high |
| Favourable mean annual temp (Colombia) | 19–21.5 | °C | CEN-AT2090 | [link](https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/view/2090) | institute | 1979 | medium |
| Optimal temp (Guatemala) | 18–22 | °C | MAGA-GT | [link](https://guatemalanosedetiene.gt/wp-content/uploads/2024/06/FICHA-TECNICA-AGROCLIMATICA-CAFE.pdf) | government | n.d. | medium |
| Upper threshold: accelerated ripening, quality loss | >23 | °C mean | DAMATTA06 (Camargo 1985) | as above | peer-reviewed | 2006 | high |
| Continuous exposure causing depressed growth/abnormalities | 30 | °C | DAMATTA06 (Franco 1958); MAGA-GT ">30 °C wilting" | as above | peer-reviewed / gov | 2006 | medium |
| Lower threshold: growth drops sharply | <17 | °C mean annual | UNIGARRO25 | as above | peer-reviewed | 2025 | high |
| Frost: plant death within hours | <0 | °C | MAGA-GT | as above | government | n.d. | medium |
| Flower-bud development optimum | 23/18 | °C day/night | UNIGARRO25 | as above | peer-reviewed | 2025 | high |
| Optimum annual rainfall | 1,200–1,800 | mm/yr | DAMATTA06 (Alègre 1959) | as above | peer-reviewed | 2006 | high |
| Annual rainfall (Guatemala) | 1,400–2,000 | mm/yr | MAGA-GT | as above | government | n.d. | medium |
| Rainy days (sun-grown, Colombia) | 160–200 | days/yr | CEN-AT2090 | as above | institute | 1979 | low (old) |
| Dry spell to stimulate flowering | 2–4 | months | DAMATTA06 (Haarer 1958) | as above | peer-reviewed | 2006 | high |
| Water-deficit threshold for bud release | soil Ψ < −1.4; predawn leaf Ψ −1.2 | MPa | UNIGARRO25 | as above | peer-reviewed | 2025 | high |
| Rain to trigger anthesis | 5–10 resumes growth; >14 for adequate flowering | mm | UNIGARRO25 | as above | peer-reviewed | 2025 | high |
| Relative humidity | 65–85 | % | MAGA-GT | as above | government | n.d. | medium |
| Temperature lapse rate | 0.5–0.6 | °C per 100 m | MAGA-GT | as above | government | n.d. | medium |
| Observed site temps, Colombia | 1,100 m: 23.2; 1,400 m: 21.4; 1,900 m: 17.1 | °C mean | CEN-AT272 | [link](https://biblioteca.cenicafe.org/bitstream/10778/794/1/avt0272.pdf) | institute | 2000 | high |
| → implied lapse across those sites **[derived]** | ≈0.76 | °C/100 m | from CEN-AT272 | — | derived | — | medium |
| Thermal time, flowering → harvest (Caturra) | ≈2,500 | GDD, base 10 °C | UNIGARRO25 | as above | peer-reviewed | 2025 | high |
| Thermal time, var. Colombia (BBCH 60→88) | 2,836 | GDD, base 10 °C | UNIGARRO25 | as above | peer-reviewed | 2025 | high |
| Thermal time range, other arabica progenies | 2,587–2,935 | GDD, base 10 °C | UNIGARRO26 | [link](https://www.mdpi.com/2673-7655/6/4/75) | peer-reviewed | 2026 | high |
| Thermal time to max sucrose (Brazil) | Mundo Novo 2,790; Obatã 3,090 | GDD | UNIGARRO25 (citing Brazilian work) | as above | peer-reviewed | 2025 | medium |
| Days anthesis → harvest, typical | 220–243 (overall 180–330) | days | UNIGARRO25 | as above | peer-reviewed | 2025 | high |
| Same cultivar across 15 Colombian sites | 204–266 | days | UNIGARRO25 | as above | peer-reviewed | 2025 | high |
| Cool high sites vs warm | ripening 2–3 months later | — | UNIGARRO25 | as above | peer-reviewed | 2025 | high |
| Flowering → maturity, average | 32 weeks (8 months) | weeks | CEN-AT194 | [link](https://biblioteca.cenicafe.org/bitstream/10778/1045/1/avt0194.pdf) | institute | 1993 | high |
| …by altitude | <1,200 m: 28–30 wk; >1,700 m: 34–36 wk | weeks | CEN-AT194 | as above | institute | 1993 | high |
| Phase I/II/III | wk 1–8 pinhead; wk 9–26 rapid growth (endosperm hard after wk 17 ≈120 d); wk 27–32 ripening | weeks | CEN-AT194 | as above | institute | 1993 | high |
| Flowering → harvest, Guatemala | ≈224 (stages 50+70+60+44) | days | MAGA-GT (citing ANACAFÉ 2014) | as above | government | n.d. | medium |
| Panama Tierras Altas: coffee altitude | 700–2,500; quality optimum 1,000–1,600 | m a.s.l. | MIDA11 | [link](https://mida.gob.pa/wp-content/uploads/2021/07/SistemaProductivo-Cafe-Tierras-Altas-1.pdf?csrt=3380512377760675682) | government | 2011 | medium |
| Panama Tierras Altas: temp / rainfall | 14–22 °C; 2,000–5,000 mm (Boquete 2,201–3,343; Volcán–Cerro Punta 2,418–3,614) | °C; mm/yr | MIDA11 | as above | government | 2011 | medium |
| Panama Tierras Altas: dry / rainy season | Dec–Apr dry; May–Nov rainy, peak Sep–Oct | months | MIDA11 | as above | government | 2011 | medium |

**Ripening delay per 100 m [derived].** No source states "days per 100 m", including the VNT-cited 3–4 days/100 m. Two sourced ways to estimate it:
- *Empirical (Cenicafé):* 28–30 wk below 1,200 m vs 34–36 wk above 1,700 m is about 6 weeks over about 500 m, so **≈8–9 days per 100 m**.
- *Thermal time:* days ≈ 2,500 / (T_mean − 10). With a 0.55–0.6 °C/100 m lapse, the delay is **≈15–17 days per 100 m at a 20 °C site** and **≈23–25 days per 100 m at 18 °C**. The effect is non-linear and grows at cooler sites.

The VNT figure therefore **under-estimates the delay by a factor of about 2–6**. Recommendation: replace the constant with a GDD model using base 10 °C and a target of about 2,500 GDD, made variety-configurable (2,500–3,100). Feed it farm or block temperature logs. Where there is no logger, use T_mean estimated by lapse rate.

### Corrections to existing package
- `site.ripening_delay_days_per_100m`: 3–4 → **deprecate**. Add `phenology.gdd_flowering_to_harvest` = 2,500 (range 2,500–3,100), `phenology.gdd_base_c` = 10, `site.lapse_rate_c_per_100m` = 0.55–0.6, and `phenology.days_flowering_to_harvest` = 204–266 typical (180–330 outer). If a constant must be kept, use ≈8–9 d/100 m (derived, medium).
- `site.mean_temp_c.arabica`: 18–22 → **optimum 18–21** (DAMATTA06), **suitable 17–23** (UNIGARRO25). Add `site.temp_c.arabica_quality_risk_above` = 23.
- `site.rainfall_mm_year`: 1,500–2,000 → **optimum 1,200–1,800** (DAMATTA06). Add a flag rather than a hard maximum: Panamanian highland farms receive 2,200–3,600+ mm (MIDA11) and should not be scored "out of range" by default.
- `site.dry_season_months`: 2–3 → **2–4** (Haarer via DAMATTA06). Add `phenology.anthesis_trigger_rain_mm` = 5–10 (minimum) / >14 (adequate).
- `site.altitude_m.arabica`: 1,000–2,000 is acceptable as a generic range. For Panama, add the MIDA reference band (700–2,500 cultivated; 1,000–1,600 "quality optimum") and the per-variety WCR altitude bands (§9).
- `site.mean_temp_c.robusta`: 22–26 is **confirmed** (Matiello 1998 via DAMATTA06; Willson 1999 gives 24–30).

### Conflicts/notes
- Temperature optima come from old primary sources (Alègre 1959) relayed through reviews. They are still the standard citation.
- MIDA reports Tierras Altas means of 14–22 °C, so parts of Boquete and Volcán sit below the 17 °C "growth drops" line. That fits slow ripening and Geisha quality at height, but the app should not label such blocks unsuitable.
- Simple daily-mean GDD methods differ by method. UNIGARRO's group compared four methods (Unigarro et al. 2017, *Agron. Colomb.*). Store the method used with each record.

---

## 2. Soil: pH, acidity, organic matter, base saturation, liming

| Parameter | Value | Unit/basis | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| pH for 95–100% relative growth (seedlings, 5 Colombian soils) | 4.9–5.7 | pH (water) | CEN-SADDIAZ20 | [link](https://publicaciones.cenicafe.org/index.php/cenicafe/article/view/13) | peer-reviewed | 2020 | high |
| Al saturation for 95–100% growth | <12 | % | CEN-SADDIAZ20 | as above | peer-reviewed | 2020 | high |
| Exchangeable Al for 95–100% growth | <1.1 | cmolc/kg | CEN-SADDIAZ20 | as above | peer-reviewed | 2020 | high |
| Base saturation for 95–100% growth | 21–45 | % | CEN-SADDIAZ20 | as above | peer-reviewed | 2020 | high |
| Ca / Mg for 95–100% growth | Ca 5.1–11.2; Mg 0.9–2.1 | cmolc/kg | CEN-SADDIAZ20 | as above | peer-reviewed | 2020 | high |
| Soil interpretation, Colombia (low / medium / high) | pH <5.0 / 5.0–5.5 / >5.5; Al <0.5 / 0.5–1.0 / >1.0 cmolc/kg; Al sat. <15 / 15–30 / >30 %; OM <8 / 8–16 / >16 %; base sat. <20 / 20–30 / >30 %; P <10 / 10–20 / >20 mg/kg; K <0.2 / 0.2–0.4 / >0.4; Ca <1.5 / 1.5–3.0 / >3.0; Mg <0.6 / 0.6–0.9 / >0.9 cmolc/kg; S <6 / 6–12 / >12 mg/kg | as stated | CEN-AT497 | [link](https://www.academia.edu/96397058/) | institute | 2018 | high (Colombia) |
| Soil sampling | 0–20 cm; 10–15 sub-samples (<2 ha), 15–20 (larger); 3–4 months after last fertiliser/amendment | — | CEN-AT497 | as above | institute | 2018 | high |
| Problem thresholds | pH <5.0 and Al³⁺ >1.0 | cmolc/kg | SAD-SE | [link](https://dialnet.unirioja.es/descarga/articulo/7831475.pdf) | peer-reviewed | n.c. | high |
| pH range (Colombia, old) | 4.8–6.0 | pH | CEN-AT2090 | as above | institute | 1979 | low |
| pH range (Guatemala) | 4.5–6.0 | pH | MAGA-GT | as above | government | n.d. | medium |
| Adequate levels (Guatemala) | pH 5.5–6.5; acidity saturation 0–19 %; Ca/Mg 3.7–5.29; CEC 5–15 cmol(+)/L | — | ANA-CAL19 | [link](https://www.anacafe.org/uploads/file/c67898deb44b4ce2bdaa49e85b1ffcf6/Boletin-CEDICAFE-Abril-2019.pdf) | institute | 2019 | medium-high |
| Liming trigger (Guatemala) | pH <5.5 **and** exch. acidity >1.17 cmol(+)/L; or acidity sat. >19 %; or sum of bases <5 cmol(+)/L | — | ANA-CAL19 | as above | institute | 2019 | medium-high |
| Lime dose by acidity saturation (Guatemala, 0–20 cm) | 21–30 %: 4–5 oz/plant; >40 %: 5–7 oz/plant (20–40 cm, >40 %: 7 oz CaSO4/plant) | oz per plant | ANA-CAL19 | as above | institute | 2019 | medium |
| Lime timing | just before / at onset of rains; ≥1 month before fertilising | — | ANA-CAL19 | as above | institute | 2019 | medium |
| Permissible acidity saturation, coffee (Costa Rica) | 25 | % | RAMIREZ-CR (cites Ramírez 2009, ICAFE) | [link](https://ramirezcaficulturadesdecostarica.com/ct-22) | consultant | n.d. | low-medium |
| CR rule of thumb without soil test | 2,000–3,000 kg CaCO3/ha every 2–3 yr | kg/ha | RAMIREZ-CR | as above | consultant | n.d. | low |
| Lime per plant, DR | 8 oz CaCO3/plant every 2–3 yr | oz/plant | IICA-DR | [link](https://repositorio.iica.int/bitstreams/70cf2f76-9de8-41ba-9c64-2f1e36019f80/download) | IICA | 2019 | medium |
| Base-saturation liming formula (Brazil) | NC (t/ha) = (Ve − Va)·T/100; T = CEC at pH 7 | t/ha CaCO3 eq. | GUARCONI17 | [link](https://biblioteca.incaper.es.gov.br/digital/bitstream/item/2746/1/BRT-saturacaoporbaseparaocafeeiro-guarconi.pdf) | peer-reviewed | 2017 | high (Brazil) |
| Target Ve for coffee | 60 % "most accepted" (Alvarez & Ribeiro 1999); proposed 90 / 70 / 60 % for T <4.3 / 4.3–8.6 / 8.6–15 cmolc/dm³; target pH 5.8–6.0 | % | GUARCONI17 | as above | peer-reviewed | 2017 | high (Brazil) |
| Honduras soils (n = 50,045) | mean pH 5.15; OM 5.4 %; Al 0.98 cmol/kg; P 4.73 ppm | — | IHCAFE-SOIL | [link](https://promecafe.net/wp-content/uploads/2021/10/Juan-R.-Lopez.pdf) | institute | 2019 | high (descriptive) |
| Panama Tierras Altas soils | Inceptisols, volcanic, "slightly acidic, well-drained" (no numbers) | — | MIDA11 | as above | government | 2011 | low |
| Effective depth | >70 cm excellent; <30 cm poor | cm | CEN-AT2090 | as above | institute | 1979 | medium |
| Effective depth (DR) | ≥0.7 | m | IICA-DR | as above | IICA | 2019 | medium |

### Corrections to existing package
- `soil.ph`: 5.5–6.5 → split into `soil.ph.optimal_growth` = **5.0–5.7** (Cenicafé 4.9–5.7) and `soil.ph.lime_below` = **5.0 (Colombia) / 5.5 (ANACAFÉ)**. The 5.5–6.5 band is ANACAFÉ's "adequate" band. Show it as an alternate regional profile, not the global default.
- **Add** `soil.al_saturation_pct.max` = 12–15 (Cenicafé growth optimum / "low" class). Use ANACAFÉ 19% and CR 25% as regional alternatives for the liming trigger.
- **Add** `soil.al_exch_cmolc_kg.max` = 1.0 (Cenicafé "high" >1.0; growth optimum <1.1).
- **Add** `soil.base_saturation_pct` = 21–45 (Cenicafé). Brazilian base-saturation liming targets 60% (or 60–90% by CEC). Store the liming *method* (`al_saturation` | `base_saturation` | `table_per_plant`) as configuration.
- **Add** `soil.liming.formula_base_saturation` = NC = (Ve − Va)·T/100, Ve default 60%. A Cochrane/RAS-type Al formula could not be verified from a primary source. Leave it user-configurable.
- `soil.organic_matter_pct`: 3–5 → **do not use as a global target.** Cenicafé classes 8–16% as "medium" in Colombian Andisols, while Honduran coffee soils average 5.4%. Make OM interpretation soil-order/region-specific. Use 3–5 only as a weak generic lower bound (low confidence).
- `soil.min_depth_m`: 1.0 → **0.7** (Cenicafé ">70 cm excellent"; IICA-DR ≥0.7 m).
- `soil.test_interval_*`: no authoritative interval found. Keep at low confidence. Add the Cenicafé sampling rule: 3–4 months after the last application, 0–20 cm.

### Conflicts/notes
- Cenicafé (pH 4.9–5.7 optimum) and ANACAFÉ / Brazil (5.5–6.5; 5.8–6.0) differ substantially. This reflects soil mineralogy (Andisols vs Ultisols/Oxisols) and method. Make the profile selectable per farm.
- Units differ: Cenicafé reports cmolc/kg, ANACAFÉ and Costa Rica report cmol(+)/L. Do not mix thresholds across extraction methods.
- No Panamanian (IDIAP) soil interpretation tables were found.

---

## 3. Nutrition

### 3a. Annual rates and splits

| Parameter | Value | Unit/basis | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| N, optimal economic (biological) | 292.7 (301.7) | kg N/ha/yr (element) | CEN-AT533 | [link](https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/121/82) | institute | 2021 | high |
| …context | 7,500–10,000 plants/ha, <30% shade; yield ≈6,724 kg dry parchment/ha | — | CEN-AT533 | as above | institute | 2021 | high |
| K2O, optimal economic (biological) | 264.5 (273.5) | kg K2O/ha/yr (oxide) | CEN-AT533 | as above | institute | 2021 | high |
| P2O5 | up to 60 (response infrequent) | kg P2O5/ha/yr (oxide) | CEN-AT533 | as above | institute | 2021 | high |
| MgO, optimal economic (biological) | 51.6 (52.1) | kg MgO/ha/yr (oxide) | CEN-AT533 | as above | institute | 2021 | high |
| S | 50–60 (economic 50–55) | kg S/ha/yr | CEN-AT533 | as above | institute | 2021 | high |
| By soil fertility (low / medium / high), technified | N 300 / 280 / 260; P2O5 60 / 40 / 20; K2O 300 / 260 / 180; MgO 60 / 40 / 15 | kg/ha/yr | SAD-SE | as above | peer-reviewed | n.c. | high |
| Guatemala by yield: <50 / 50–100 / 100–150 / 150–225 / >225 qq cherry/mz | N & K2O: 150 / 200 / 300 / 400 / 500; P2O5: 25 / 40 / 50 / 60 / 70 | lb/mz/yr (oxide for P, K) | ANA-FERT (Anacafé & INPOFOS 2017) | [link](https://www.anacafe.org/uploads/file/b04fcafce8a54b5d804dde3462b59828/03-Fertilizaci%C3%B3n-al-suelo.pdf) | institute | 2017 | high |
| …converted **[derived]** | yield <3,245 / 3,245–6,490 / 6,490–9,740 / 9,740–14,600 / >14,600 kg cherry/ha → N & K2O ≈97 / 130 / 195 / 260 / 325; P2O5 ≈16 / 26 / 32 / 39 / 45 kg/ha | kg/ha/yr | derived | — | derived | — | medium |
| Splits, Guatemala | 2/yr: May–Jun and Aug–Sep; 3/yr (cold, late-harvest zones): + Oct–Nov | — | ANA-FERT | as above | institute | 2017 | high |
| Splits, Colombia | traditionally 2 equal splits every 6 months; AT 506 tested more frequent splitting | — | CEN-AT506 | [link](https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/view/135) | institute | 2019 | medium (result not read) |
| Splits, DR | 3/yr: after harvest, after main flowering, before harvest | — | IICA-DR | as above | IICA | 2019 | medium |
| Zn rates tested | soil ZnO 5–20 kg Zn/ha/yr; foliar EDTA 0.045–0.18 kg Zn/ha/yr; **no yield response** at 3 sites | kg Zn/ha/yr | CEN-ZN21 | [link](https://www.redalyc.org/journal/2654/265470004018/html/) | peer-reviewed | 2021 | high |
| Zn correction where deficient | short-term ~1 kg/ha foliar Zn chelate; long-term 3–5 kg/ha/yr soil ZnO | kg/ha | CEN-ZN21 | as above | peer-reviewed | 2021 | medium (product vs element ambiguous) |
| Zn critical levels | soil <1 mg/kg; leaf 6–12 mg/kg (9 = limit) | mg/kg | CEN-ZN21 | as above | peer-reviewed | 2021 | high |
| B rate with yield effect | 1.1 kg B/ha/yr (+77 kg CaO) gave +37% over 5 yr (Brazil-type trial) | kg B/ha/yr | RB-B24 | [link](https://www.mdpi.com/2073-4395/14/3/474) | peer-reviewed (industry authors) | 2024 | medium |

### 3b. Nutrient removal by harvest

| Parameter | Value | Unit/basis | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Removal per 1,000 kg green (almendra, 11% moisture) ≡ 1,250 kg dry parchment | N 30.9; P 2.3; K 36.9; Ca 4.3; Mg 2.3; S 1.2 | kg, **element** basis | CEN-EXTR07; SAD-SE | [link](https://biblioteca.cenicafe.org/handle/10778/117) | peer-reviewed | 2006/07 | high |
| Micronutrients, same basis | Fe 107; Mn 61; B 50; Cu 33; Zn 18 | g per 1,000 kg green | CEN-EXTR07 | as above | peer-reviewed | 2006/07 | high |
| Same, oxide basis **[derived]** | P2O5 5.3; K2O 44.5; MgO 3.8 | kg per 1,000 kg green | derived | — | derived | — | high (arithmetic) |

Removal per tonne of **cherry** was not found stated in a source. The app should derive it from its own cherry:green mass balance (see §17 item 10). Do not hard-code it.

### 3c. Leaf-tissue sufficiency and sampling

| Nutrient | Cenicafé AT 515 (Colombia, critical range) | ANACAFÉ CEDICAFÉ (Guatemala, optimal) | UH CTAHR (Hawai'i) | UNA-NI citing Winston et al. 2005 |
|---|---|---|---|---|
| N % | 2.36–2.78 | 2.3–2.8 | 2.5–3.5 | 2.5–3.0 |
| P % | 0.14–0.20 | 0.11–0.15 | 0.15–0.30 | 0.15–0.20 |
| K % | 1.58–2.15 | 1.9–2.5 | 2.0–3.0 | 2.1–2.6 |
| Ca % | 0.75–1.29 | 1.1–1.5 | 0.8–1.6 | — |
| Mg % | 0.18–0.45 | 0.29–0.35 | 0.30–0.50 | 0.25–0.40 |
| S % | 0.15–0.19 | 0.16–0.25 | 0.20–0.40 | — |
| B mg/kg | 29–55 | 41–90 | 25–75 | 40–100 |
| Zn mg/kg | 6–12 | 14–18 | 15–150 | 15–30 |
| Fe mg/kg | 54–121 | 91–105 | 75–300 | — |
| Mn mg/kg | 106–278 | 50–150 | 50–500 | — |
| Cu mg/kg | 8–17 | 6–9 | 10–30 | — |
| Source / year / type / conf. | [AT 515](https://www.academia.edu/96397049/), 2020, institute, **high** | [ANA-ENM](https://www.anacafe.org/uploads/file/c15d3267ff1849de8c38cf6cfae68a77/Fertilizacion_y_enmiendas-2016-2021.pdf), 2021, institute, medium (origin of ranges not stated) | [UH-CTAHR](https://www.hawaiicoffeeed.com/uploads/2/6/7/7/26772370/coffee_leaf_and_soil_sampling_and_nutrient_levels.pdf), 1997/2016, extension, medium | [UNA-NI](https://cenida.una.edu.ni/relectronicos/RENP35M966.pdf), 2023, extension, medium |

Additional boron reference: RB-B24 gives a normal range of 60–80 mg/kg, deficiency below 45 and an application indicator below 60 (3rd–4th leaf pair).

| Sampling protocol | Value | Source | Conf. |
|---|---|---|---|
| Leaf position | 3rd or 4th node (leaf pair) from the tip of plagiotropic branches, mid-canopy | CEN-AT515; UH-CTAHR; IICA-DR; UNA-NI | high (consensus) |
| Sample size | 20 random plants × 4 branches (cardinal points) = 80 leaves per lot | CEN-AT515 | high |
| Sample size (alternatives) | 1–2 leaves from ≥15 trees (UH); 100 leaves from 25–100 plants (UNA-NI) | UH-CTAHR; UNA-NI | medium |
| Timing | ~6 months before the (main) harvest (Cenicafé); at flowering / before flowering (UH, IICA-DR) | CEN-AT515; UH-CTAHR; IICA-DR | medium (sources differ) |

### Corrections to existing package
- `nutrition.n_kg_ha_yr`: 150–300 → keep the range, mark it **element N**, and make it yield-driven. Default to **~290 kg N/ha at ≥7,500 plants/ha, full sun** (Cenicafé). The low end of ~100–130 kg/ha fits low-yield or shaded systems (ANACAFÉ ladder [derived]). Raise confidence to medium.
- `nutrition.p_kg_ha_yr`: 30–60 → rename **`nutrition.p2o5_kg_ha_yr`**, range **20–60 (oxide)** (Cenicafé "up to 60"; SAD-SE 20–60). The VNT figure is almost certainly P2O5.
- `nutrition.k_kg_ha_yr`: 150–250 → rename **`nutrition.k2o_kg_ha_yr`**, range **180–300 (oxide)**, default ~265 for high-density sun (Cenicafé).
- **Add** `nutrition.mgo_kg_ha_yr` = 15–60, default ~50 (Cenicafé). **Add** `nutrition.s_kg_ha_yr` = 50–60.
- **Add** `nutrition.zn` with note "no yield response in Colombian trials; correct only if leaf Zn <9 mg/kg; 3–5 kg/ha/yr soil". **Add** `nutrition.b_kg_ha_yr` ≈1.1 (medium; single industry-linked study).
- `nutrition.split_applications`: 3–4 → **2–3** (ANACAFÉ, Cenicafé, IICA-DR). Timing is anchored to the onset of rains and to post-flowering, not to the calendar. No authority found recommends 4 splits as the default.
- **Add** `nutrition.removal_per_t_green` = {N 30.9, P 2.3, K 36.9, Ca 4.3, Mg 2.3, S 1.2 kg; Fe 107, Mn 61, B 50, Cu 33, Zn 18 g}, element basis (Cenicafé).
- **Add** `leaf.sufficiency.<nutrient>` using the Cenicafé AT 515 table as default (high), with an alternate regional profile. **Add** `leaf.sampling` = {pair: 3rd–4th from tip, mid-canopy; n: 20 plants × 4 = 80 leaves/lot}.

### Conflicts/notes
- Leaf ranges disagree materially, especially Zn: 6–12 (Cenicafé) vs 14–18 (ANACAFÉ) vs 15–150 (Hawai'i). Ranges are lab-, variety- and region-specific. The app must store the reference profile used with each interpretation.
- High-density Colombian N rates (~300 kg/ha) are calibrated for 7,500–10,000 plants/ha in full sun. They over-state needs for shaded Geisha at 3,000–4,000 plants/ha. No authoritative Panamanian rate was found.
- RB-B24's authors are fertiliser-industry employees. It is peer-reviewed but should be treated as medium confidence.

---

## 4. Planting density and spacing

| Parameter | Value | Unit/basis | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Dwarf (Caturra, Catuaí, Pacamara, Obatã, Marsellesa, CR 95) | 5,000–6,000 | plants/ha (single stem) | WCR | [link](https://varieties.worldcoffeeresearch.org/varieties/caturra) | institute | accessed 2026 | high |
| Tall (Geisha-Panama, Typica) | 3,000–4,000 | plants/ha (single stem) | WCR | [link](https://varieties.worldcoffeeresearch.org/varieties/geisha-panama) | institute | 2026 | high |
| Centroamericano H1; Catimor 129 | 3,000–4,000 | plants/ha | WCR | [link](https://varieties.worldcoffeeresearch.org/varieties/centroamericano) | institute | 2026 | high |
| Guatemala dwarf | 2 × 1 m; max 3,500 plants/mz (≈5,000/ha [derived]) | m; plants | ANA-GUIA | [link](https://pdfcoffee.com/guia-caficultura-anacafe-13-14-version-final-4-pdf-free.html) | institute (mirror) | 2014 | medium |
| Guatemala tall | 2.40 × 1.20 m; max 2,400 plants/mz (≈3,435/ha [derived]) | m; plants | ANA-GUIA | as above | institute (mirror) | 2014 | medium |
| Guatemala trial | 2 × 1 m single plant out-yielded wider spacings (2.5 × 1.2 m, 3 × 0.67 m etc.) for Caturra/Bourbon | — | ANA-DENS | [link](https://www.anacafe.org/uploads/file/97d4875bcd2643a28419e1d2e67f1693/El-Cafetal-08.pdf) | institute | 2015 | medium |
| DR dwarf / tall | 2 × 1 m (5,000/ha); 2 × 1.5–2 m (2,500–3,355/ha) | m; plants/ha | IICA-DR | as above | IICA | 2019 | medium |
| Honduras (with timber shade) | 2.0 × 1.25 m (4,000/ha) mid-altitude; 2.0 × 1.0 m (5,000/ha) high altitude | m; plants/ha | FHIA | [link](https://fhia.org.hn/wp-content/uploads/guia_produccion_-cafe_con_sombra_de_maderables.pdf) | extension | n.d. | medium |
| Colombia optimum (low/intermediate stature) | 8,000–10,000 | plants/ha | CEN-DENS23 | [link](https://publicaciones.cenicafe.org/index.php/memorias/article/view/519) | institute | 2023 | high (Colombia) |
| Colombia: high vs low density | high >7,500; low <4,000 plants/ha; at low density keep ≥2 stems/site | plants/ha | CEN-CICLOS25 | [link](https://publicaciones.cenicafe.org/index.php/libros_manuales/article/download/3173/3237) | institute | 2025 | high |
| Max stem density after zoca | 10,000 | stems/ha | CEN-AT500 | [link](https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/141/105) | institute | 2019 | high |
| Planting slope limit (DR) | <40% recommended | % slope | IICA-DR | as above | IICA | 2019 | medium |

### Corrections to existing package
- `layout.density_trees_ha.unshaded_arabica` (1,600–2,500) and `.shaded` (1,100–1,600) → **replace with per-habit defaults**: dwarf/compact **5,000–6,000**, tall **3,000–4,000** (WCR). Allow up to 10,000 plants or stems/ha for technified full-sun dwarf systems (Cenicafé). The VNT numbers are below every authoritative Central American recommendation found.
- `layout.spacing_m.arabica`: 2.5 (single value) → **row × plant pairs**: dwarf 2.0 × 1.0 m; tall 2.4 × 1.2 m (ANACAFÉ) or 2.0 × 1.5–2.0 m (IICA-DR). Store `row_m` and `plant_m` separately and compute density.
- `production_systems.traditional.density_trees_ha` [1,000–1,500]: no authority supports this as a recommendation. Keep it only as a descriptor of rustic systems (low).
- `layout.row_orientation` N–S: no authoritative support found. Slope sources recommend contour planting (§8). Default to `contour` on slopes.

### Conflicts/notes
- WCR's 3,000–4,000 for Centroamericano and Catimor 129 vs 5,000–6,000 for other dwarfs reflects their vigour. Defaults should be variety-level, not habit-level.

---

## 5. Shade

| Parameter | Value | Unit/basis | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|---|
| Bird Friendly: canopy cover | ≥40 | % canopy cover | SMBC-BF | [link](https://nationalzoo.si.edu/sites/default/files/documents/bf_norms_english_accessible.pdf) | standard | current | high |
| Bird Friendly: canopy height | main canopy ≥12 m; upper stratum ≥15 m | m | SMBC-BF | as above | standard | current | high |
| Bird Friendly: diversity | backbone species ≤60% of shade trees; remaining 40% ≥10 species, each ≥1% | — | SMBC-BF | as above | standard | current | high |
| Bird Friendly: strata | lower ≈20%, backbone ≈60%, emergent ≈20% of foliage volume | % | SMBC-BF | as above | standard | current | high |
| Bird Friendly: riparian buffer | ≥5 m each side (streams); 10 m (rivers) | m | SMBC-BF | as above | standard | current | high |
| Rainforest Alliance SAS 2020 | no core shade requirement; 15% natural vegetation cover on farm (shade-tolerant crops) by year 6 (mandatory improvement); optional smart meter 40% canopy, 12 native species/ha | % | RA-CH (secondary) | [link](https://www.coffeehabitat.com/2020/07/new-rainforest-alliance-shade-criteria/) | secondary | 2020 | medium |
| RA status | SAS 2020 **expired 2026-03-01**; replaced by Regenerative Agriculture Standard v1.0 (shade criteria not retrieved) | — | RA-ENV | [link](https://knowledge.rainforest-alliance.org/docs/environment-annex) | standard | 2026 | high |
| Optimal shade, Colombia | 35–45%; max ~45% without yield loss; regional optima 19.6–43.1% by sunshine hours; subtract natural cloudiness | % | CEN-AT379 (Farfán & Jaramillo 2009) | [link](https://www.cenicafe.org/es/publications/avt0379.pdf) | institute | 2009 | high |
| Meta-analysis, yield vs shade | 10–40% little negative effect; 40–70% yield declines for most cultivars; >70% lowest. Bourbon & Mundo Novo optimum 25–45%; Catuaí/Catimor/Caturra neutral–positive; Kona Typica declines at all levels | % shade | KOUT22 | [link](https://link.springer.com/article/10.1007/s13593-022-00788-2) | peer-reviewed | 2022 | high |
| Guatemala | 40–60% shade said to reduce fertiliser demand | % | ANA-PODA18 | [link](https://www.anacafe.org/uploads/file/cb4d3da75f7f44d8832dd0fc1c0437d0/Boletin-Tecnico-CEDICAFE-2018-05.pdf) | institute | 2018 | medium |
| DR | 30% (high zones) to 60% (low zones) | % | IICA-DR | as above | IICA | 2019 | medium |
| CRS Guatemala | arabica 600–1,800 m: 70→30% (falling with altitude); Timor-hybrid derivatives 50–30% | % | CRS | [link](https://asa.crs.org/wp-content/uploads/2021/05/La-Sombra-en-el-Cafe.pdf) | NGO extension | ~2021 | low-medium |
| Shade tree spacing | Inga 8 × 8 m (156/ha) or 10 × 10 (100/ha); Erythrina ("pito") 6 × 6 m (278/ha); timber 12 × 12 to 15 × 15 m (44–69/ha); musaceae 4 × 4 to 6 × 6 m | m; trees/ha | FHIA | as above | extension | n.d. | medium |
| Shade tree spacing (DR / Colombia) | Inga ("guama") 10–12 × 8–10 m; *Inga edulis* 12 × 12 m (Colombia) | m | IICA-DR; CEN-AT379 | as above | IICA / institute | 2019 / 2009 | medium |
| Common species | *Inga* spp., *Erythrina* spp. (poró / pito), *Gliricidia sepium*, *Grevillea robusta*, *Cordia alliodora*, musaceae | — | CRS; CEN-AT379; FHIA | as above | — | — | high (consensus) |
| Shade canopy height above coffee | 2–3 m | m | FHIA | as above | extension | n.d. | low-medium |
| Measurement method | spherical densiometer gap fraction was the best predictor of PAR transmission; hemispherical photos better only in open stands (<500 trees/ha); PAR sensors most direct but impractical | — | BELLOW03 | [link](https://www.sciencedirect.com/science/article/abs/pii/S0168192302001739) | peer-reviewed | 2003 | high |
| Regulation timing | start of rainy season, or post-harvest | — | CRS | as above | NGO | ~2021 | medium |

### Corrections to existing package
- `shade.regulated_pct` (25–30) vs `shade.regulation_target_pct` (40–50): resolve to `shade.target_pct` = **35–45 default** (Cenicafé; KOUT22 shows declines above ~40%). Make it configurable per block from 20–60 by altitude and cultivar. Lower targets suit higher, cloudier sites (IICA-DR, CRS, CEN-AT379).
- **Add** `cert.bird_friendly` = {canopy ≥40%, height ≥12 m, ≥10 species beyond backbone, backbone ≤60%, buffers 5/10 m}.
- **Add** `cert.rainforest_alliance` with a note that SAS 2020 expired 2026-03-01; RA 2020 values are historical only.
- **Add** `shade.measurement_method` enum {densiometer (default), hemispherical_photo, PAR_sensor, visual}, with point count user-defined (no authoritative sampling count found).
- `shade.full_sun_yield_uplift_pct` (30–50): not found in an authoritative source. KOUT22 shows effects are cultivar-dependent and often neutral at 10–40% shade. Keep at low confidence or remove.
- `lifespan_years.*`: not verified. Keep low.

---

## 6. Pruning and renovation (Spanish names)

| System | Key values | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| **Zoca común** (renovation stumping) | cut at **30 cm**; cycle **4–5 harvests**; renew **20%** of area/yr (area in fifths: 80% producing, 20% renewed); 1–3 stems/site to ≤10,000 stems/ha; done after harvest in the dry period | CEN-AT463; CEN-CICLOS25; CEN-AT500 | [AT463](https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/317/382) | institute | 2015 / 2025 / 2019 | high |
| Renovation cycle | **60–84 months (5–7 yr)**; 18–24 months establishment; area ÷ cycle-years per year | CEN-CICLOS25 | [link](https://publicaciones.cenicafe.org/index.php/libros_manuales/article/download/3173/3237) | institute | 2025 | high |
| **Poda pulmón** | stem cut at **60 cm**; max **2 harvests** | CEN-AT463 | as above | institute | 2015 | high |
| **Poda calavera** | main stem at **1.8 m**, laterals cut to **10–20 cm**; max 2 harvests | CEN-AT463; CEN-CICLOS25 | as above | institute | 2015 / 2025 | high |
| **SMT** (sistema de manejo de tejido, by row or block) | same number of plants pruned every year; **3- or 5-yr cycles**; cut height tall varieties 50 cm; dwarf 80 cm (short cycle) / 50 cm (long cycle); immediately post-harvest | ANA-SMT | [link](https://www.anacafe.org/SMT/) | institute | n.d. | high |
| **Poda selectiva/parcial** | **15–25%** of plants per year; tissue-renewal cycle **4–7 yr** | ANA-PODA18 | [link](https://www.anacafe.org/uploads/file/cb4d3da75f7f44d8832dd0fc1c0437d0/Boletin-Tecnico-CEDICAFE-2018-05.pdf) | institute | 2018 | high |
| **Poda por ciclos/calles** (DR) | 3-yr (1/3 per yr), 4-yr (1-3-2-4, 25%), 5-yr (1-3-5-2-4, 20%); **recepa 30–40 cm**; high pruning 1.0 m (dwarf) / 1.2 m (tall); after 4–5 harvests, right after harvest | IICA-DR | as above | IICA | 2019 | medium-high |
| **Descope / despunte** (Honduras) | cut at **1.55–1.75 m (ideal 1.70)**; 2–3 yr after planting | IHCAFE-OIRSA | [link](https://www.oirsa.org/contenido/2018/Sanidad_Vegetal/Manuales%20OIRSA%202015-2018/MANEJO%20DE%20TEJIDO%20OIRSA%202017%20(1).pdf) | institute | 2017 | high |
| **Poda alta / poda media** | 1.70–1.90 m / 1.50 m; deshije May–Jun and Oct–Nov | IHCAFE-OIRSA | as above | institute | 2017 | high |
| **Recepa** | for exhaustion of all strata; trunk >1 inch diameter; "last option" | IHCAFE-OIRSA | as above | institute | 2017 | high |
| **Agobio** | bend main stem to ~45° 5–6 months after field planting; keep **2–3** vigorous orthotropic shoots; remove terminal after 6–12 months; "use very limited" today | IHCAFE-OIRSA | as above | institute | 2017 | high |
| **Capa** (nursery topping) | cut above 5th leaf pair in nursery to form multiple stems | IHCAFE-OIRSA | as above | institute | 2017 | medium |
| Colinos descopados (nursery decapitation) | decapitate ~3 months after bagging → 2 stems; plant at 5.5–6 months | CEN-AT309 | [link](https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1778/5176) | institute | 2003 | high |
| **Esqueletamiento / esqueletizado** | named by ANACAFÉ as an increasingly adopted system; **no numeric spec found** | ANA-GUIA | as above | institute (mirror) | 2014 | low |
| Timing (all) | at end of harvest | ANA-GUIA; ANA-SMT; CEN-AT463 | — | — | — | high |

### Corrections to existing package
- `pruning.stumping_cycle_years`: 5–7 → **confirmed** (Cenicafé 60–84 months; 4–5 harvests). Raise to high. Add `pruning.zoca_cut_height_cm` = 30 (recepa 30–40).
- `pruning.annual_renovation_pct`: 20–25 → **15–33** depending on cycle (20% for 5-yr, 25% for 4-yr, 33% for 3-yr; ANACAFÉ selective 15–25%). Store it as `100/cycle_years`, not a fixed range.
- `pruning.multistem_count`: 2–4 → **1–3 stems/site**, constrained to ≤10,000 stems/ha (Cenicafé). Agobio keeps 2–3 shoots. 4 stems was not found in an authoritative source.
- **Add** an enum `pruning.system` = {zoca, poda_pulmon, poda_calavera, recepa, descope, poda_alta, poda_media, agobio, capa, esqueletamiento, poda_selectiva, poda_por_ciclos/calles/lote}, each with default cut heights from the table.

---

## 7. Nursery (germinador / almácigo)

| Parameter | Value | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| Seedling emergence in germinador | from ~35 days after sowing | ANA-GUIA | [link](https://pdfcoffee.com/guia-caficultura-anacafe-13-14-version-final-4-pdf-free.html) | institute (mirror) | 2014 | medium |
| Transplant to bag at *soldadito* | ~60 days after sowing (non-grafted) | ANA-GUIA | as above | institute (mirror) | 2014 | medium |
| *Mariposa* stage | ~60 days, for grafted material | ANA-GUIA | as above | institute (mirror) | 2014 | low-medium (as extracted) |
| Germinador seed rate | 1 lb seed/m²; 1,000–1,200 viable seedlings/lb | IICA-DR | [link](https://repositorio.iica.int/bitstreams/70cf2f76-9de8-41ba-9c64-2f1e36019f80/download) | IICA | 2019 | medium |
| Bag size | 6 × 10 or 7 × 10 in (one plant); 8 × 10 in (two plants) [≈15 × 25 / 18 × 25 / 20 × 25 cm, derived] | ANA-GUIA | as above | institute (mirror) | 2014 | medium |
| Bag size (DR) | 6 × 8 in black polyethylene, gauge 200, 12–14 holes | IICA-DR | as above | IICA | 2019 | medium |
| Almácigo duration | 6–7 months | ANA-GUIA; IICA-DR | as above | institute | 2014 / 2019 | high (agreement) |
| Age at field planting (Colombia) | 5.5–6 months | CEN-AT309 | [link](https://publicaciones.cenicafe.org/index.php/avances_tecnicos/article/download/1778/5176) | institute | 2003 | high |
| Age eligible in CR renewal programme | 6–12 months | ICAFE regulation (FAOLEX) | [link](https://faolex.fao.org/docs/pdf/cos71603.pdf) | government regulation | 2007 | medium |
| Selection at transplant | ≥3–4 leaf pairs; 2–4 cruces (branch pairs); straight, vigorous, healthy stem; well-developed roots | ANA-GUIA | as above | institute (mirror) | 2014 | medium |
| First nursery fertilisation | at *cola de perico* stage (~1 month after bagging) | ANA-GUIA | as above | institute (mirror) | 2014 | medium |

### Corrections to existing package
- `nursery.duration_months`: 6–9 → **6–7 typical** (bag phase), range **5.5–12** (Cenicafé to CR regulation). Add `nursery.germinador_days` ≈ 60 (to soldadito) as a separate phase.
- **Add** `nursery.bag_size_in` (6 × 8 to 8 × 10), `nursery.min_leaf_pairs_at_planting` = 3–4, and `nursery.selection_criteria` as a checklist.
- Not found: Cenicafé root-discard criteria (e.g., "cola de cerdo" root deformity rates) and Cenicafé bag dimensions. The Cenicafé nursery pages timed out.

---

## 8. Erosion and soil conservation

| Parameter | Value | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| Live/dead barrier spacing by slope | 5% → 25 m; 10% → 20 m; 15% → 18 m; 20–25% → 15 m; 30–35% → 12 m; 40–55% → 9 m; 60% → 6 m | IICA-DR | [link](https://repositorio.iica.int/bitstreams/70cf2f76-9de8-41ba-9c64-2f1e36019f80/download) | IICA | 2019 | medium-high |
| Barrier spacing (Honduras) | 15–25% slope → one barrier every ~16 m (≈8 coffee rows); contour planting above 20% | FHIA | [link](https://fhia.org.hn/wp-content/uploads/guia_produccion_-cafe_con_sombra_de_maderables.pdf) | extension | n.d. | medium |
| Practices named for coffee | dead and live barriers, contour planting, individual terraces, hillside ditches (acequias de ladera), infiltration trenches | IICA-DR; ANA-GUIA | as above | — | — | high |
| Generic slope limits | contour cultivation up to 50% (add ditches/strips above 10%); strip cropping <20%; diversion ditches >20%; bench terraces near-total control | FAO-EC84 | [link](https://www.fao.org/4/ar758s/ar758s.pdf) | intergovernmental | 1984 | medium (not coffee-specific, old) |
| Soil-loss tolerance (Colombia) | 1 t/ha/yr | CEN-ARV | [link](https://www.cenicafe.org/es/documents/LibroSistemasProduccionCapitulo5.pdf) | institute | n.d. | medium |
| Integrated weed management | soil loss reduced 95–97% vs conventional weeding (Gómez 1990) | CEN-ARV | as above | institute | n.d. | medium |
| Recommended max slope for planting (DR) | <40% | IICA-DR | as above | IICA | 2019 | medium |

### Corrections to existing package
- `env.terrace_slope_threshold_pct` = 15 → **no authoritative source sets terraces at 15%.** Replace it with `conservation.barrier_spacing_m_by_slope` (IICA-DR table) and `conservation.contour_planting_min_slope_pct` = 10–20 (FAO-EC84 / FHIA). Keep terraces (individual or bench) as a user-chosen practice for steep blocks. **No numeric terrace threshold was found.**
- **Add** `conservation.soil_loss_tolerance_t_ha_yr` = 1 (Cenicafé) and `weed.management` = integrated / selective (noble covers).
- `env.riparian_buffer_m` 10–30: Bird Friendly requires ≥5 m on streams and 10 m on rivers. Panamanian legal minimums were not researched here (see R4).

---

## 9. Varieties relevant to Panama (WCR catalog unless noted)

| Variety | Stature | Rust (WCR) | Optimal altitude at 5–15°N (Panama ≈8–9°N) | Density (plants/ha) | First crop | Notes | URL |
|---|---|---|---|---|---|---|---|
| Geisha (Panama) | Tall | Intermediate resistance | >1,300 m (quality) | 3,000–4,000 | Yr 4 | Yield low; quality exceptional. ANACAFÉ: >1,400 m, "moderately resistant" | [link](https://varieties.worldcoffeeresearch.org/varieties/geisha-panama) |
| Typica | Tall | Low / susceptible | >1,300 m | 3,000–4,000 | Yr 4 | ANACAFÉ ~4 m tall | [link](https://varieties.worldcoffeeresearch.org/varieties/typica) |
| Caturra | Dwarf | Low / susceptible | >1,300 m | 5,000–6,000 | Yr 3 | Bourbon mutation | [link](https://varieties.worldcoffeeresearch.org/varieties/caturra) |
| Catuaí | Dwarf | Low / susceptible | >1,300 m | 5,000–6,000 | Yr 3 | Mundo Novo × Caturra (IAC) | [link](https://varieties.worldcoffeeresearch.org/varieties/catuai) |
| Pacamara | Dwarf | Low / susceptible | >1,300 m | 5,000–6,000 | Yr 3 | Pacas × Maragogipe | [link](https://varieties.worldcoffeeresearch.org/varieties/pacamara) |
| Obatã (red) | Dwarf | Intermediate | 700–1,300 m | 5,000–6,000 | Yr 3 | Sarchimor (Timor Hybrid 832/2 × Villa Sarchi) | [link](https://varieties.worldcoffeeresearch.org/varieties/obata-red) |
| Marsellesa | Dwarf | Intermediate | 700–1,300 m | 5,000–6,000 | Yr 3 | Sarchimor (same parentage) | [link](https://varieties.worldcoffeeresearch.org/varieties/marsellesa) |
| Centroamericano (H1) | Dwarf | Highly resistant | >700 m | 3,000–4,000 | Yr 2 | F1 hybrid (T5296 × Rume Sudan); **clonal propagation only**; +22–47% yield vs standard varieties | [link](https://varieties.worldcoffeeresearch.org/varieties/centroamericano) |
| Catimor 129 | Dwarf | Intermediate | >1,300 m | 3,000–4,000 | Yr 2 | Caturra × Timor Hybrid 1343 | [link](https://varieties.worldcoffeeresearch.org/varieties/catimor-129) |
| Costa Rica 95 (Catimor) | Dwarf | **Low / susceptible** (confirmed susceptible in Costa Rica) | 700–1,300 m | 5,000–6,000 | Yr 3 | Resistance breakdown documented | [link](https://varieties.worldcoffeeresearch.org/varieties/costa-rica-95) |

Supporting facts:
- **Resistance breakdown, Peru (PERU-RUST):** Catimor lines are susceptible to 2 new races and to races XXXIV and XXXV. WCR's standing caveat: "a variety that is resistant… today may not be resistant tomorrow."
- **ANACAFÉ (ANA-VAR) altitudes, Guatemala:** Typica 1,300–1,800; Caturra 600–1,300; Catuaí 1,070–1,675 (centre/north); Pacamara 1,000–1,500+; Marsellesa 710–1,230; Centroamericano 820–1,060 (trial sites); Geisha >1,400 m. These are Guatemalan trial/recommendation zones and do not transfer directly to Panama.
- **Panama (MIDA11):** a 228-farm survey found Catuaí, Caturra, Typica and Geisha dominant, plus Bourbon, Catimor, Mundo Novo and San Ramón. No rootstocks were used.
- **Panama (IDIAP20):** Río Sereno germplasm trial of 28 lines (e.g., Catiguá MG-2, Oro Azteca, Lempira, Colombia 3/4, SL-28), targeting ≥25 qq dry parchment/ha with rust tolerance.

### Corrections to existing package
- `variety_catalog`:
  - Add **Pacamara, Obatã, Marsellesa, Centroamericano (H1, clonal-only), Catimor 129, Costa Rica 95** with WCR habit, rust, altitude and density.
  - Geisha: add `rust: intermediate`, `density: 3000–4000`, `first_crop_year: 4`.
  - Sarchimor: `habit: dwarf`.
  - Catimor: change `resistance: ["CLR"]` → **`CLR: line-dependent (Catimor 129 intermediate; CR 95 susceptible; breakdown reported in Peru)`**. Add a `resistance_status_date` and a "verify locally" flag.
- "ICAFE 90" was not verified in WCR. Keep it with low confidence.
- Add the per-variety `optimal_altitude_m_by_latitude_band` field from WCR. Dwarf rust-resistant Sarchimors are rated for **700–1,300 m at Panama's latitude, below most Boquete specialty altitudes**.

---

## Summary of what could not be found
- ICAFE primary numbers (guide inaccessible): liming formula, fertiliser ladder, densities.
- Any stated "days of ripening delay per 100 m".
- Nutrient removal per tonne of *cherry*.
- An authoritative 15% terrace threshold.
- CATIE's own shade-% recommendation.
- Cenicafé seedling-discard criteria.
- A numeric specification for esqueletamiento.
- Current Rainforest Alliance (Regenerative Agriculture Standard 2026) shade criteria.
- Any IDIAP/MIDA fertiliser, density or shade recommendations for Panama.
