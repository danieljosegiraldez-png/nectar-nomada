# R4 — Panama-Specific Annex (Chiriquí highlands + Cerro Azul)

**Prepared:** 2026-10-01 · **Scope:** coffee farm-management app, Panama users · **Package read:** 01_DOMAIN_REFERENCE §17, 02_ACTIVITY_TAXONOMY §3, 04_reference_parameters.json (`env.riparian_buffer_m`)

**Method and reliability notes**
- Sources were WebSearch/WebFetch only. Direct downloads of PDFs from Gaceta Oficial and MiAMBIENTE servers were blocked by the network proxy, so every legal text was read through WebFetch's text extraction. Treat quoted article numbers as verified-by-extraction, not hand-checked against the printed Gaceta. Each row marks its confidence.
- **Confidence scale:** **H** = official primary text read; **M** = official secondary page or reputable press quoting officials; **L** = single non-official source, an old document, or an inference.
- Items marked **[NN]** are analyst inferences, not facts from a source.
- Gaps are marked **NOT FOUND**. Nothing in this report was filled in from memory.

---

## 1. Coffee regions of Panama

| Fact | Value | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| Chiriquí share of national coffee output | 64 % of coffee production in the 2024-25 agricultural cycle | MIDA, *Cierre Agrícola 2024-2025* | https://mida.gob.pa/wp-content/uploads/2025/07/CIERRE-AGRICOLA-2024-2025-1.pdf | Official | 2025 | H |
| National coffee area / producers | 17,548 ha; 8,287 producers; 222,971 qq (2020-21 cycle) | MIDA Dirección Nacional de Agricultura, via El Capital Financiero | https://elcapitalfinanciero.com/panama-produce-unas-17548-hectareas-de-cafe/ | Press citing official | 2021 | M |
| Area by province (same series) | Chiriquí 6,434.99 ha (1,154 producers); Coclé 4,715 ha; Panamá Oeste 2,300 ha; Colón 1,801 ha | MIDA | https://mida.gob.pa/se-preve-un-incremento-en-la-produccion-de-cafe-en-chiriqui/ | Official | 2022 | H |
| Chiriquí volume by district (forecast) | 2022-23 forecast of 110,000 qq: Renacimiento ~60,000 qq, Boquete ~30,000 qq (88,000 qq in 2021-22) | MIDA | same as above | Official | 2022 | H (forecast) |
| More recent Chiriquí figure | 154,280 qq from 7,714 ha; national output ~200,000 qq/yr "typically" | La Estrella, citing SCAP and official data | https://www.laestrella.com.pa/economia/scap-lluvias-mermaron-la-produccion-de-cafes-especiales-en-un-30-JF10374397 | Press | 2025 | M |
| Altitude band where most Arabica sits | "60 % of arabica between 800–1,200 m", the zone hit hardest by the 2024 rains | La Estrella / SCAP | same as above | Press | 2025 | M–L |
| Highland optimum (Tierras Altas study) | 1,000–1,600 m a.s.l. is optimal for quality coffee | MIDA, *Caracterización del Sistema Productivo de Café en Tierras Altas* | https://mida.gob.pa/wp-content/uploads/2021/07/SistemaProductivo-Cafe-Tierras-Altas-1.pdf | Official | 2011 | M (dated) |
| Chiriquí altitude range (industry) | 1,000–2,800 m a.s.l.; subregions Boquete, Volcán, Renacimiento | caficulturadepanama.org | https://www.caficulturadepanama.org/?lte-sections=regiones-cafetaleras | Industry | n.d. | L–M |
| Geisha's altitude frontier | Geisha planted at ~1,600 m in 2004; now up to ~2,050 m | LatinAmerican Post; EcoTV | https://latinamericanpost.com/business-and-finance/panama-geisha-worlds-most-expensive-coffee-braces-for-climate-swings/ | Press | 2026 | M |
| Example farm altitudes | Elida Estate land 5,200–8,500 ft, with coffee stopping at ~6,000 ft (~1,830 m); Café Eleta 3,937–4,921 ft (1,200–1,500 m) | Smithsonian Magazine | https://www.smithsonianmag.com/travel/experience-panamas-coffee-farming-tradition-in-the-chiriqui-highlands-180980663/ | Press | 2022 | M |
| Rainfall: Volcán/Cerro Punta | 2,418–3,613.5 mm/yr | MIDA Tierras Altas study | as above | Official | 2011 | M |
| Rainfall: Boquete | 2,201.2–3,343.1 mm/yr | MIDA Tierras Altas study | as above | Official | 2011 | M |
| Mean temperature (highlands) | 14–22 °C annual | MIDA Tierras Altas study | as above | Official | 2011 | M |
| Seasons (highlands) | Rains May–Nov, peaking Sep–Oct; dry season Dec–Apr | MIDA Tierras Altas study | as above | Official | 2011 | M |
| *Bajareque* | Fine wind-driven drizzle/mist that arrives with the NE trade winds from about mid-Nov | J. Donderis (social media) | https://x.com/donderisja/status/1289309863202508801 | Informal | 2020 | L |
| Varieties (Boquete, farm counts) | Caturra 79 farms, Catuaí 76, Typica 60, Geisha 19 (2011 data, before the Geisha boom) | MIDA Tierras Altas study | as above | Official | 2011 | M (stale) |
| Varieties promoted by MIDA for high elevations | Geisha, Pacamara, Catuaí, Typica; rust-resistant varieties advised | MIDA | https://mida.gob.pa/se-preve-un-incremento-en-la-produccion-de-cafe-en-chiriqui/ | Official | 2022 | H |
| Lowland/robusta zones | Panamá Oeste (improved robusta), Colón (robusta); MIDA robusta normative cost $2.05/kg (2025-26) | caficulturadepanama.org; nexo.la citing MIDA | https://nexo.la/cafe-margen-oportunidad-negocio/ | Industry/press | 2025-26 | L–M |
| Cerro Azul elevation | Massif tops out at ~1,007 m (Cerro Jefe); reached from 24 de Diciembre, Panamá district | Wikipedia | https://en.wikipedia.org/wiki/Cerro_Azul,_Panama | Tertiary | n.d. | L |
| Cerro Azul coffee climate, harvest, volume | **NOT FOUND** in official sources | — | — | — | — | — |

**App implications**
- `Farm.region` enum: `CHI-Boquete`, `CHI-TierrasAltas` (Volcán, Cerro Punta, Paso Ancho), `CHI-Renacimiento` (Santa Clara, Río Sereno), `CHI-other`, `PAN-CerroAzul`, `COC`, `PO`, `COL`, `other`. Seed each with editable climate defaults: rainfall range, dry-season months and altitude band.
- `Block.altitude_m` should be required. Cerro Azul blocks will often sit at 600–1,000 m, below the package's 1,000 m Arabica floor (01 §1.1). The app should warn, not block.
- Seed rainfall defaults from the MIDA ranges above, labelled "2011 MIDA reference". Offer IMHPA station data as the live source.

**Corrections to existing package**
- 01 §1.2 says 1,500–2,000 mm/yr is "ideal". The Chiriquí highlands get about 2,200–3,600 mm/yr, so a Panamanian default must not flag that as anomalous.
- 01 §1.1 gives Arabica 1,000–2,000 m. Panama Geisha now reaches ~2,050 m and Cerro Azul sits below 1,000 m. Widen to 600–2,100 m as the plausible range for Panama.

---

## 2. Phenology and calendar (Panama highlands)

| Fact | Value | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| Typical national harvest | Dec–Mar | Sucafina origin page | https://sucafina.com/apac/origins/panama | Trade | n.d. | M |
| District harvest timing | Renacimiento Nov–Dec; Boquete Dec–Jan (harvest start) | MIDA | https://mida.gob.pa/se-preve-un-incremento-en-la-produccion-de-cafe-en-chiriqui/ | Official | 2022 | H |
| Lower-altitude harvest | Begins **September** in lower zones | LatinAmerican Post | https://latinamericanpost.com/economy-en/panama-coffee-harvest-runs-on-indigenous-hands-and-vanishing-labor/ | Press | 2026 | M |
| High-altitude Geisha | Traditional window mid-Dec to April | LatinAmerican Post (producers W. Lamastus, R. Peterson) | https://latinamericanpost.com/business-and-finance/panama-geisha-worlds-most-expensive-coffee-braces-for-climate-swings/ | Press | 2026 | M |
| Year-to-year shift (2025-26) | 2025-26 highland harvest began Jan 2026; La Esmeralda ~2 weeks earlier than 2025, Lamastus ~4 weeks later; delayed flowering blamed on unusual cloudiness | EcoTV; LatinAmerican Post | https://www.ecotvpanama.com/nacionales/cafe-geisha-panama-arranca-cosecha-2025-2026-alta-expectativa-calidad-n6065565 | Press | 2026 | M |
| Main flowering months | **NOT FOUND** in an official Panamanian source. **[NN]** The dry season (Dec–Apr) followed by rain onset (May) implies main flowerings in roughly Mar–May, triggered by rain. Earlier "pre-rain" flowerings occur after showers. | — | — | Inference | — | L |
| Seasonal labor | Ngäbe and Buglé families pick most of the crop. About 10,000 people move to Renacimiento each season. Many continue across the border into Costa Rica, where (per USDA) Ngäbe-Buglé workers now harvest most of the Costa Rican crop. The labor pool is reported to be shrinking. | LatinAmerican Post; USDA FAS Costa Rica Coffee Annual 2025 | https://apps.fas.usda.gov/newgainapi/api/Report/DownloadReportByFileName?fileName=Coffee+Annual_San+Jose_Costa+Rica_CS2025-0010.pdf | Press; Official (US) | 2025-26 | M |

**App implications**
- Keep the phenology-anchored model (02 §3). Seed Panamanian **harvest templates** per region, each editable:
  - Renacimiento and other low/mid zones: start Sep–Nov
  - Boquete and Tierras Altas, Caturra/Catuaí: start Nov–Jan, end Feb–Mar
  - High-altitude Geisha (>1,700 m): start mid-Dec to Jan, end Mar–Apr
  - Cerro Azul: no data, so leave the template empty and require the user to fill it
- Record `flowering_event` (date, block, intensity %, preceding rain mm). This is the main anchor and no official calendar exists to replace it. Allow several flowerings per season.
- Show year-over-year drift: a ±2–4 week shift in one season is documented, so do not raise an alert for it.
- Labor module: track crew origin as **optional** free text (e.g., comarca/community), never as an ethnicity field. Track housing assignment, arrival and departure dates, and family members on site (for the child-labor control in §5).

**Corrections to existing package**
- 02 §3 note "Central America harvests roughly Nov–Mar": for Panama, widen to **Sep–Apr** across regions.
- The VNT rule of +3–4 days ripening delay per +100 m is unverified for Panama. Keep it as an L-confidence predictor only.

---

## 3. Environmental regulation

| Fact | Value | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| Forest Law | Ley 1 de 3 de febrero de 1994 (Ley Forestal), GO 22,470 of 7 Feb 1994 | MiAMBIENTE DIFOR (PDF) | https://difor.miambiente.gob.pa/wp-content/uploads/2025/03/Ley-1-del-3-de-febrero-de-1994.pdf | Official law | 1994 | H |
| Art. 23 (natural forest): springs in hilly terrain | No forest use and no damaging trees within **200 m** radius of a water source | Ley 1/1994 art. 23 | same | Official law | 1994 | H |
| Art. 23: springs on flat terrain | **100 m** radius | same | same | Official law | 1994 | H |
| Art. 23: rivers and streams | A forest strip **≥ channel width, never < 10 m**, on each side | same; operationalized in Res. DM-0051-2017 art. 2(5) ("a ambos lados... no podrá ser menor a 10 metros") | https://faolex.fao.org/docs/pdf/pan164800.pdf | Official | 1994/2017 | H |
| Art. 23: lakes and reservoirs | Zone of up to **100 m** from the shore | same | same | Official | 1994 | H |
| Art. 24 (artificial/planted forests) | Springs (hilly) 100 m; springs (flat) 50 m; rivers/streams ≥10 m each side; aquifer recharge areas 50 m; artificial reservoirs 10 m from max water level. Limited harvest allowed only with trees marked by the authority and replanting in the next rainy season. | Ley 1/1994 art. 24 | same | Official law | 1994 | H |
| Status of these zones | "bosques especiales de preservación permanente" | Ley 1/1994 | same | Official law | 1994 | H |
| Natural-forest permits suspended | Res. DM-0587-2024 (GO 30197) suspends forest-use permits nationwide for **5 years** | MiAMBIENTE | https://miambiente.gob.pa/miambiente-suspende-por-cinco-anos-permisos-de-aprovechamiento-forestal/ | Official | 2024 | H |
| Amendment to art. 23 widths | **No amendment found** (search to Oct 2026) | — | — | — | — | M |
| Wastewater norm | DGNTI-COPANIT 35-2019, approved by MICI Resolución N° 58 of 27 Jun 2019, GO 28806-B (28 Jun 2019). Replaced COPANIT 35-2000. | vLex (metadata) | https://vlex.com.pa/vid/resolucion-n-58-aprueba-796327133 | Official (index) | 2019 | H |
| Modification | "Resolución N.° 13/2025" modifies COPANIT 35-2019. **Content NOT obtained.** | ChemReg index | https://chemreg.net/regulations/gmsds-feb25-10.pdf/view | Secondary index | 2025 | M (existence) |
| COPANIT 35-2019 limits (continental waters) — pH | 5.5–8.5 | UTP paper (Chitré WWTP), Table 2 | https://revistas.utp.ac.pa/index.php/apanac/article/download/3188/3826?inline=1 | Peer-reviewed (national) | ~2021 | M |
| — Temperature | ±3 °C of the receiving water's natural temperature | same | same | same | — | M |
| — DQO (COD) | 100 mg/L | same | same | same | — | M |
| — Turbidity | 30 NTU | same | same | same | — | M |
| — DBO5 (BOD5) | **Not verified for 2019.** ACP norm 2610HIP111, "updated considering COPANIT 35-2019", uses **50 mg/L**. COPANIT 35-2000 used 35 mg/L. | Panama Canal Authority | https://pancanal.com/wp-content/uploads/2022/11/Norma-2610HIP111-Descargas-de-efluentes.pdf | Official (ACP) | 2022 | L |
| — SST (TSS) | **Not verified for 2019.** ACP uses 35 mg/L; 35-2000 also 35 mg/L. | ACP; COPANIT 35-2000 (Res. 351, GO 24,115) | https://faolex.fao.org/docs/pdf/pan78325.pdf | Official | 2000/2022 | L–M |
| — Oils and grease / coliforms | ACP: 20 mg/L / 500 NMP per 100 mL fecal. 35-2000: 20 mg/L / 1,000 NMP per 100 mL total. | same | same | Official | — | L |
| Discharge-concession fee | Res. DM-0015-2024 (GO 30034): fee methodology for effluent discharge concessions, based on daily volume and COD | MiAMBIENTE / Gaceta | https://www.gacetaoficial.gob.pa/pdfTemp/30034/104786.pdf | Official | 2024 | H |
| Characterization reporting | Dischargers must submit COPANIT 35-2019 characterization (Annex B) to MiAMBIENTE, with the CIIU code declared | MiAMBIENTE form | https://miambiente.gob.pa/ma-documentos/formularios-diveda/FORMULARIO_DE_CARACTERIZACION_2022.pdf | Official | 2022 | H |
| Water use authorizations | Decreto Ley 35/1966 + DE 70/1973. **Permiso**: revocable, ≤1 yr. **Concesión transitoria**: 3–5 yrs. **Concesión permanente**: indefinite, non-transferable. Agricultural and agro-industrial uses qualify; a concession needs an approved EIA and a hydrological study. | UTP-CIHH guide | https://cihh.utp.ac.pa/documentos/2016/pdf/Guia_para_el_proceso_de_permisos_de_uso_y_concesiones_de_agua.pdf | Academic/official guide | 2016 | M |
| EIA regulation | **Decreto Ejecutivo N° 4 of 28 May 2026** (GO 30534-B) replaces the earlier EIA regulation. Categories I–III; activities listed by CIIU/CINU code in an exhaustive list (*lista taxativa*) covering agriculture and related activities. | CEPAL Observatorio P10; TVN | https://observatoriop10.cepal.org/es/instrumento/reglamento-proceso-evaluacion-impacto-ambiental-decreto-ejecutivo-no-4-2026 | Official summary | 2026 | H (existence) |
| Whether a wet mill (*beneficio*) needs an EIA, and at what size | **NOT FOUND.** The list entry for coffee processing was not retrievable. | — | — | — | — | — |

**App implications**
- Replace the package's `env.riparian_buffer_m` (10–30 m) with a **water-feature-typed** rule set: `spring_hilly = 200 m`, `spring_flat = 100 m`, `river_stream = max(10 m, channel_width_m)` each side, `lake_reservoir = 100 m`. Add `forest_type: natural|planted` to use the art. 24 values. In GIS, buffer mapped watercourses and springs, then flag coffee plots, new plantings, burns, or agrochemical applications inside a buffer as **legal non-compliance** (H confidence), not just best practice.
- Store `water_authorization {type: permiso|transitoria|permanente, number, issued, expires, source, max_flow_lps}`. Remind before expiry (permiso ≤1 yr).
- Wet mill module: record effluent volume (m³/day) and lab results for pH, COD, BOD5, TSS and temperature, each with date and lab. Compare against a **configurable** limit set named `PA-COPANIT-35-2019`, pre-filled with pH 5.5–8.5, COD 100 mg/L, ΔT ±3 °C, and with BOD5/TSS shown as "pending verification". Aguas mieles routinely run thousands of mg/L COD, so the app should push "no direct discharge; treat or infiltrate" workflows.
- EIA status per facility: `eia {category, resolution_no, date}`, nullable.

**Corrections to existing package**
- 04 `env.riparian_buffer_m` (10–30 m, VNT, low confidence): replace with the Ley 1/1994 values above, H confidence. The 10 m figure is a legal **minimum** in Panama, not the low end of a recommendation.
- 01 §17 item 11 ("wastewater limits not covered"): now partially covered; BOD5/TSS 2019 values are still open.

---

## 4. Agrochemicals

| Fact | Value | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| Registering authority | MIDA, Dirección Nacional de Sanidad Vegetal (agrochemicals registry) | MIDA | https://mida.gob.pa/sanidad-vegetal-2/ | Official | current | H |
| Registration instruments listed | DE N° 12 (6 May 2022, abbreviated registration); DE N° 13 (6 May 2022); Manual de Registro Resuelto 019-01; RTCA for fertilizers | MIDA | same | Official | 2022 | H |
| Official registered-products list | "Listado de Insumos Fitosanitarios Registrados" (updated 14 Jun 2023) | MIDA | same | Official | 2023 | H |
| Historic prohibitions | Resuelto APL 074-ADM (1997): 61 pesticides prohibited. Resuelto DAL 024-ADM-2011: 11 prohibited, 13 restricted. Separate restrictions on endosulfan, paraquat, methomyl, chlorpyrifos, oxamyl. | MIDA | same | Official | 1997/2011 | H |
| 2026 HHP ban | Res. **OAL-003-ADM-2026** (20 Jan 2026) prohibits 8 highly hazardous pesticides: alachlor, benomyl, carbaryl, endosulfan, formaldehyde, imazalil, propachlor, spirodiclofen. This brings HHP removals to **20** in total. Coordinated through COTEPA. | MIDA press release (names); Infobae (resolution no.) | https://mida.gob.pa/2026/01/21/aumenta-la-lista-de-plaguicidas-de-uso-agricola-prohibidos-por-el-gobierno-nacional/ | Official + press | 2026 | H (names: MIDA) |
| Transition period | **18 months** to use up or withdraw stock (until ~Jul 2027) | Infobae | https://www.infobae.com/panama/2026/01/21/panama-prohibe-ocho-plaguicidas-por-riesgos-a-la-salud-y-al-ambiente/ | Press | 2026 | M |
| Discrepancy | Infobae lists **carbofuran** among the eight; MIDA's own list does not. Use MIDA's list. | — | — | — | — | — |
| Farm-level pesticide record obligation (Panama law) | **NOT FOUND** as a specific farm-record regulation | — | — | — | — | — |

**App implications**
- Maintain a `pesticide_status_PA` table keyed by active ingredient: `{registered, prohibited, restricted, prohibited_with_phaseout(until)}`, with source and resolution number, editable by an administrator.
- Block selection of prohibited active ingredients. Warn on restricted ones and on the phase-out list (with the deadline).
- Keep the package rule from 02 §5 (product, active ingredient, rate required). Add `MIDA_registration_no`, `pre_harvest_interval_days`, `applicator`, `PPE_used`, and a `buffer_zone_check` against the riparian polygons in §3.

**Corrections to existing package**
- 01 §17 item 7 (certification may be dated): add that national prohibited lists changed in Jan 2026. Compliance checklists must be versioned by date.

---

## 5. Labor

| Fact | Value | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| Current minimum-wage decree | **Decreto Ejecutivo N° 13 of 31 Dec 2025**, in force **16 Jan 2026** (GO 30438, 6 Jan 2026) | Gaceta Oficial via Asamblea Legispan; La Prensa | https://s3-legispan.asamblea.gob.pa/legispan/GACETAS/2020/2026/30438_2026.pdf | Official | 2026 | H |
| Agriculture rate (national, both regions) | "Agricultura, ganadería, caza, silvicultura, acuicultura, pesca (nacional)": **B/.1.64/h small enterprise; B/.2.10/h large enterprise (11+ workers)**. No coffee-specific line. | DE 13/2025 art. 2 | same | Official | 2026 | H |
| Region placement | **Región 1** includes Boquete, Bugaba, Tierras Altas, Dolega, David, Panamá district (which covers Cerro Azul) and Chepo. All other districts are Región 2. Renacimiento is not in the Región 1 list, so it is Región 2. | DE 13/2025 art. 3 | same | Official | 2026 | H (Renacimiento by exclusion: M) |
| Region relevance for agriculture | The agriculture rate is national, so region does not change it. Region does change the domestic-worker rate (B/.350 R1 / B/.320 R2 per month). | DE 13/2025 | same | Official | 2026 | H |
| Agricultural workers in the Labor Code | Arts. 234–235, "Trabajadores del campo". Pay must be made at the work site in periods of **≤15 days**. Where workers live on site the employer provides housing; for permanent workers it must be **free, adequate and hygienic**, sized to the family, with land for raising livestock. The landowner is jointly liable if a lessee/colono cannot pay. | Laboremia (Código de Trabajo text) | https://blog.laboremia.com/leyes-detalle/codigo-del-trabajo-titulo-vii-contratos-especiales | Secondary legal | current | M–H |
| Minimum working age | 14 years, non-hazardous work only. Max 6 h/day and 36 h/week, daytime 7:00–17:00, no overtime, no work that affects schooling. A labor-insertion permit from MITRADEL/DIRETIPAT is required. | MITRADEL | https://www.mitradel.gob.pa/mitradel-supervisa-empresas-para-cumplimiento-de-las-normas-en-materia-de-contratacion-de-menores-de-edad/ | Official | 2025 | H |
| Hazardous work | Minimum age 18 (Family Code art. 510; Labor Code art. 118, per US DOL). Hazardous-work list: DE 19/2006, updated by DE 1 of 5 Jan 2016. DOL names coffee among sectors with child labor and notes schooling disrupted by family harvest migration from the Comarca. | US DOL ILAB 2016 | https://www.dol.gov/sites/dolgov/files/ILAB/child_labor_reports/tda2016/Panama2016Report.pdf | Foreign govt | 2016 | M |
| Picking pay (official normative cost) | MIDA normative cost sheets (Tierras Altas >1,000 m, Aug 2018): harvest paid **B/.2.00 per lata** (Caturra) and **B/.2.50 per lata** (Typica); daily wage (*jornal*) B/.15.00 | MIDA *Industriales* cost sheets | https://mida.gob.pa/wp-content/uploads/2020/05/Industriales.pdf | Official | 2018 | M (stale) |
| Current picking pay | **NOT FOUND** in any official or reliable 2024–26 source | — | — | — | — | — |

**App implications**
- Payroll defaults: `min_wage_hourly = 1.64` if `employer_size ≤ 10`, else `2.10` (DE 13/2025, effective 2026-01-16). Store wage tables by effective date. Panama revises minimum wages roughly every two years.
- **Piece-rate guard:** for each worker-day, compute `latas × rate_per_lata ÷ hours_worked` and warn if it falls below the applicable hourly minimum. Piece rates are user-configured; ship no default, or show MIDA 2018 B/.2.00–2.50 labelled "historical reference".
- Pay-cycle check: warn if a worker's pay interval exceeds 15 days (Código de Trabajo art. 235).
- Housing register: `unit_id`, occupancy, family size, water/sanitation checklist, inspection date.
- Child-labor control: record date of birth for every worker. Block any worker under 14. For ages 14–17, require a MITRADEL permit number, cap hours at 6/day and 36/week, and block tasks tagged `hazardous` (agrochemical application, chainsaw/machinery, heavy loads; extend from the DE 1/2016 list once read). Children accompanying families on site are recorded as dependents, never as workers.

**Corrections to existing package**
- 01 §11.1 (labor) is generic. Add the Panama specifics above.
- 01 §9.3 throughput (50–80 kg cherry/person-day): no Panama source found. Keep it L confidence. Track it in latas per day instead.

---

## 6. Units used in Panama

| Unit | Value | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| **Lata** (cherry) | "peso aproximado por lata **30 libras**" of cherry (≈13.6 kg) | MIDA cost sheets (2018) | https://mida.gob.pa/wp-content/uploads/2020/05/Industriales.pdf | Official | 2018 | H (as MIDA's approximation) |
| **Quintal (qq)** | Panamanian coffee prices and production are reported in quintales. **The kg equivalent was not found in an official Panamanian source.** Common usage is 100 lb (45.36 kg). The "46 kg" figure is the Central American quintal-oro convention and was **not verified for Panama**. | MIDA reports; Panamá América | https://www.panamaamerica.com.pa/node/914696 | — | — | L |
| Form of quintal in MIDA output stats | Not stated (oro vs pergamino vs uva) | MIDA Cierre Agrícola | (see §1) | Official | 2025 | — |
| **Caja** | **NOT FOUND** in official sources | — | — | — | — | — |
| *Libra de café en uva* | Pound of cherry. MIDA prices cherry per lata (B/.7–8 per lata in 2018). | MIDA 2018 | as above | Official | 2018 | M |
| Auction lots | BOP 2025: 20 kg lots; BOP 2026: 15 kg lots | Newsroom Panama; Infobae | (see §7) | Press | 2025-26 | M |

**App implications**
- Store **kg** as the canonical unit. Show `lata`, `caja`, `quintal` and `libra` as **per-farm configurable** units with `kg_per_unit` and `coffee_state ∈ {cherry, parchment_wet, parchment_dry, green/oro}`.
- Defaults: `lata(cherry) = 13.6 kg` (MIDA ≈30 lb, editable; farms should calibrate by weighing). `quintal = 45.36 kg` (L confidence, editable). `caja`: no default, so the user must define it.
- Every conversion carries its source. Mass balance (cherry → parchment → green) should come from the farm's own weighings (consistent with 01 §17 item 10).

**Corrections to existing package**
- None conflict. Add this unit table as the Panama localization.

---

## 7. Market context and export

| Fact | Value | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| BOP 2025 record | **US$30,204/kg** (≈US$13,700/lb), washed Geisha, Hacienda La Esmeralda (Boquete). 20 kg lot sold for US$604,080 to Julith Coffee (Dubai). Auction total US$2,861,200, 50 lots. | Newsroom Panama; LatinAmerican Post | https://newsroompanama.com/2025/08/07/30000-per-kilo-is-the-price-for-panamanian-geisha-coffee-from-boquete-breaking-a-record/ | Press | 2025 | M–H |
| BOP 2026 result | Top lot **US$18,004/kg**, Elida Geisha (Lamastus Family Estates), 15 kg lot = US$270,060, buyer JD.com. Total US$3,041,940; 50 lots (40 Geisha, 10 other varieties); Geisha floor >US$1,500/kg; other varieties >US$897/kg; held 23–24 Sep 2026. | Infobae | https://www.infobae.com/panama/2026/09/25/subasta-mundial-del-cafe-de-alta-gama-de-panama-supera-los-3-millones-en-ventas/ | Press | 2026 | M |
| SCAP role | Organizes Best of Panama | Infobae; LatinAmerican Post | as above | Press | 2026 | H |
| Export volume (context) | ~50,000 bags of 60 kg/yr exported | US ITA Market Intelligence | https://www.trade.gov/index.php/market-intelligence/panama-coffee-industry | Foreign govt | 2023-24 | L–M |
| Exporter registration | Notice to the VUCE (MICI's single foreign-trade window) with legal representative ID and *Aviso de Operación* | MICI, *Requisitos de exportación – Café* | https://mici.gob.pa/wp-content/uploads/2023/03/REQUISITOS-DE-EXPORTACION-PRODUCTOS-CAFE%CC%81.pdf | Official | 2023 | H |
| Phytosanitary | MIDA phytosanitary license/certificate. Green coffee: issued at the farm location. Roasted: B/.10, via siterpa.mida.gob.pa. Collected at VUCE. | MICI | same | Official | 2023 | H |
| ICO certificate of origin | Requested through VUCE; issued by **MICI** (Dirección Nacional de Promoción de las Exportaciones); basis DE 53/1985, DE 130/2012, ICA 2007 | MICI; Panamá Digital | https://www.panamadigital.gob.pa/InformacionTramite/certificado-de-origen-organizacion-internacional-del-cafe-oic | Official | current | H |
| Other origin certificates | EUR.1 (EU) via VUCE; DUCA-F for Central America; non-preferential via VICOMEX/SIGA. Fees: export declaration B/.5; origin cert B/.2. | MICI | as above | Official | 2023 | H |
| US-bound | FDA facility registration; free-sale certificate for roasted coffee (B/.18) | MICI | as above | Official | 2023 | H |

**App implications**
- `Lot` fields: `competition_entries[] {event: BOP|CoE|other, year, score, rank, auction_price_per_kg, lot_kg, buyer}`.
- Export checklist per shipment: VUCE notice ✔, MIDA phytosanitary ✔, ICO certificate ✔, preferential origin certificate (EUR.1 for EU) ✔, EUDR geolocation package (§8) ✔. Each step gets a document number and an attachment.
- Treat auction prices as **outliers**. Never use them as price benchmarks in cost/margin KPIs.

**Corrections to existing package**
- 01 §0 "specialty 3–5× commodity" is unrepresentative for Panama Geisha. Add a note that Panama auction lots run to orders of magnitude above that.

---

## 8. EUDR (Regulation (EU) 2023/1115 as amended)

| Fact | Value | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| Amending act | Regulation (EU) 2025/2650, published in the OJ on 23 Dec 2025 | Stibbe | https://www.stibbe.com/publications-and-insights/the-amended-eudr-what-has-changed-and-what-has-remained | Law firm | 2025 | H |
| Application dates | **30 Dec 2026**: large and medium operators/traders (and micro/small operators already under the EU Timber Regulation). **30 Jun 2027**: other micro and small operators. | European Commission news, 13 Jul 2026 | https://environment.ec.europa.eu/news/commission-updates-product-scope-and-tools-support-eudr-2026-07-13_en | Official EU | 2026 | H |
| Simplification review | Due by 30 Apr 2026; Commission package completed May 2026; July 2026 delegated act changed product scope (adds **soluble coffee** from 30 Dec 2027). Implementing act on the Information System includes simplified declarations. | EC news | same | Official EU | 2026 | H |
| Cut-off date | Deforestation-free means no deforestation after **31 Dec 2020** (art. 2(13)) | EUR-Lex consolidated text, 26 Dec 2025 | https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02023R1115-20251226 | Official EU | 2025 | H |
| Geolocation | Art. 2(28): latitude/longitude with **≥6 decimal places**; **plots > 4 ha require a polygon** (non-cattle); otherwise at least one point | same | same | Official EU | 2025 | H |
| Simplified regime | Art. 4a: one-off simplified declaration for **micro/small primary operators in low-risk countries**; postal address or geolocation allowed | same | same | Official EU | 2025 | H |
| Record retention | 5 years (art. 4(3); art. 9(1)) | same | same | Official EU | 2025 | H |
| **Panama's risk tier** | **Standard risk.** Panama is not listed as low or high risk in Implementing Reg. (EU) 2025/1093, so art. 4a simplification is **not** available for Panamanian origin. For comparison, Costa Rica is low risk. | EUR-Lex 2025/1093 | https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ%3AL_202501093 | Official EU | 2025 | H |

**App implications**
- `Plot.geometry` is required for EU-destined lots. Point allowed if area ≤ 4 ha, polygon required if > 4 ha. Enforce 6-decimal precision, WGS84, GeoJSON export in the EU Information System format.
- `Plot.land_use_2020_12_31` evidence field: satellite reference, attachment, declaration. Flag plots planted after 2020 (common at the high-altitude Geisha frontier, which moved from ~1,600 to ~2,050 m) for deforestation-check review.
- Lot-to-plot traceability: every green lot links to the plot IDs that produced its cherry. Mixed lots carry all plot geometries.
- Retain records for 5 years minimum. Planning dates: EU buyers (large/medium) will demand data for shipments placed on the market from **30 Dec 2026**, which overlaps the 2026-27 harvest.

**Corrections to existing package**
- 01 §17 item 11 lists EUDR as a gap. It is now specified above.

---

## 9. Climate risk

| Fact | Value | Source | URL | Type | Year | Conf. |
|---|---|---|---|---|---|---|
| ENSO pattern in Panama | El Niño brings **less rain on the Pacific slope (incl. Chiriquí)** and more on the Caribbean slope, plus +1–2 °C temperature anomalies. 1997 deficits reached 500–600 mm (Aug–Oct) in Chiriquí/Veraguas. The deficit is sharper in the first year of an event. | IMHPA/ETESA, *El Niño y La Niña* | https://www.imhpa.gob.pa/uploads/documentos/ninoynina.pdf | Official | n.d. | H |
| **Current outlook** | IMHPA (30 Sep 2026): **very strong El Niño through Feb 2027**. Oct–Dec rain **below normal in western and eastern Chiriquí**. Possible **early dry-season onset in December**. Short severe rain events still likely. Compared to 1982-83 and 2015-16. | Metro Libre citing IMHPA | https://www.metrolibre.com/nacionales/imhpa-pronostica-el-nino-muy-fuerte-hasta-febrero-de-2027-y-advierte-cambios-en-las-lluvias-de-octubre-a-diciembre-AE26117733 | Press citing official | 2026 | M–H |
| Observed 2026 deficit | Up to 60 % less Pacific rainfall; eastern Chiriquí hard hit; coffee named as affected | La Estrella citing IMHPA | https://www.laestrella.com.pa/economia/el-nino-reduce-hasta-60-las-lluvias-en-el-pacifico-de-panama-y-presiona-al-agro-GE25213588 | Press | 2026 | M |
| Excess-rain damage (La Niña-type years) | Nov 2024 rains cut specialty output 20–30 % (≈US$20 M loss). In 2025-26 SCAP estimated −40–50 %, La Esmeralda −30 %. Harvest rain splits and drops cherries. | La Estrella; LatinAmerican Post | (see §1, §2) | Press | 2025-26 | M |
| Regional suitability projection | Mesoamerica: 55–62 % of current coffee-suitable area unsuitable by 2050 (RCP 4.5), worst at 400–700 m, partial gains above ~1,800 m | de Sousa et al. 2019, *Sci. Rep.* | https://www.nature.com/articles/s41598-019-45491-7 | Peer-reviewed | 2019 | H (regional) |
| Altitude shift | Suitable Arabica band shifting from 400–2,000 m to 800–2,500 m by the 2050s (SRES A2). Panama not modelled separately. | Ovalle-Rivera et al. 2015, *PLoS ONE* | https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0124155 | Peer-reviewed | 2015 | M (not Panama-specific) |
| Chiriquí-specific suitability projection | **NOT FOUND** | — | — | — | — | — |

**App implications**
- `climate_regime` season tag (El Niño / La Niña / neutral, from IMHPA bulletins) stored per season, so yield and flowering analyses can be stratified.
- Alert rules, all thresholds user-set:
  - Dry spell after flowering (El Niño years): days without rain > N
  - Heavy rain during harvest: daily mm > N, which triggers a "prioritize ripe picking / cherry split check" task
- For the 2026-27 season: prompt Chiriquí users to plan irrigation/water storage and expect an early dry season (IMHPA). Do not hard-code this; deliver it as a dated advisory.
- Risk register: tag blocks at **< 1,200 m** and especially Cerro Azul (< 1,000 m) as higher exposure, given the projected losses at low and mid altitude. **[NN inference from regional studies]**

**Corrections to existing package**
- 01 §1.2 "dry season 2–3 months beneficial": Chiriquí's dry season is ~5 months (Dec–Apr), and El Niño can lengthen it. Store the regime per farm.

---

## Consolidated corrections to the existing package

1. **04 `env.riparian_buffer_m`**: replace 10–30 m (VNT, low) with the typed Ley 1/1994 art. 23/24 rule set (springs 200/100 m; rivers ≥ max(10 m, channel width) per side; lakes 100 m). Confidence H.
2. **01 §1.1 and §1.2**: add Panama defaults (altitude 600–2,100 m plausible; rainfall 2,200–3,600 mm in the highlands; dry season Dec–Apr).
3. **02 §3 Panama note**: harvest spans Sep (low zones) to Apr (high Geisha). Flowering months are not officially documented, so they must be farm-recorded.
4. **01 §11.1 Labor**: add minimum wage B/.1.64 or B/.2.10 per hour (DE 13/2025), the 15-day pay cycle, free housing for permanent workers (arts. 234–235), and minimum age 14 non-hazardous / 18 hazardous.
5. **01 §17 item 11**: wastewater is now COPANIT 35-2019 (pH 5.5–8.5, COD 100 mg/L, ΔT ±3 °C; BOD5/TSS pending verification). EUDR is now specified.
6. **Agrochemicals**: add the national prohibited list (1997, 2011, Jan 2026 resolutions) with an 18-month phase-out to ~Jul 2027.
7. **Units**: lata ≈ 30 lb cherry (MIDA); quintal kg equivalent unverified. Make every unit configurable.
8. **EUDR**: Panama is standard risk with no simplified declaration; full geolocation is needed from 30 Dec 2026 for large/medium EU buyers.

## Open items (need a human check of primary text)
- Full COPANIT 35-2019 limits table and the content of Resolución 13/2025. Get it from MICI-DGNTI or the printed GO 28806-B.
- The DE 4/2026 *lista taxativa* entry for coffee processing (*beneficio*), with its size threshold and EIA category.
- DE 1/2016 hazardous-tasks list: wording on agrochemicals and loads for adolescents.
- Official kg definition of the quintal in Panama, and the meaning of *caja* in local practice.
- Current (2025-26) picking rate per lata. Best sourced from SCAP or producer surveys.
- Cerro Azul agro-climatic data: IMHPA stations, plus local partner data.
