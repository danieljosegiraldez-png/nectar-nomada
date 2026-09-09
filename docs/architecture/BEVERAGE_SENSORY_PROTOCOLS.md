# Beverage Sensory Protocols & Style Guides — Néctar Nómada Digital Platform

Extends `DOMAIN_MODEL.md` §4 (Sensory Evaluation: `SensoryProtocol →
SensoryProtocolVersion`, explicitly configurable per domain, never one
universal form) and `CONSUMER_SENSORY_FEEDBACK.md` (the separate consumer-
facing pathway). Specifies concrete sensory protocol content for multiple
beverage categories — coffee, beer, mead, honey now; wine, cacao, chocolate,
spirits, rum, gin, infused liquors, water, and non-alcoholic beverages
structured but deferred.

**Governing rule, before anything else**: real sensory scoresheets are
frequently copyrighted, trademarked professional standards (BJCP, SCA,
WSET), not open content. This document never reproduces those forms
verbatim. Every protocol version must cite what it's grounded in
(`source_reference`), and the platform's own forms are built as originals
inspired by public sensory-science structure — never presented as *being*
an official BJCP/SCA/WSET form unless actually licensed to do so.

---

## 1. Standards & Licensing Registry

For each category, the real current standard-setting body/framework,
copyright status, and this platform's approach:

| Category | Real standard(s) | Copyright status | Platform approach |
|---|---|---|---|
| Specialty coffee | SCA Coffee Value Assessment (CVA-102/103/104/105) — officially replaced the 2004 cupping form (Nov 2024), current global standard; Coffee Quality Institute (CQI) Q Grader program; FlavorActiV coffee sensory tools (CQI-partnered) | SCA/CQI proprietary; CVA forms/terminology are SCA copyrighted material | Adapt-original, structurally informed by CVA's separation of Descriptive vs. Affective assessment; pursue SCA licensing if/when justified by scale |
| Beer | BJCP Beer Scoresheet; Meilgaard Beer Flavor Wheel (1979, adopted by ASBC/MBAA as industry standard); AROXA and FlavorActiV beer flavor standards (calibration, not scoring) | Copyrighted (BJCP, Inc.; ASBC/MBAA); AROXA/FlavorActiV standards are commercial products | Adapt-original for scoring structure; reference (never reproduce) the Meilgaard wheel's category structure; calibration system (§7) tracks real commercial reference standards as external product data, not invented content |
| Mead | BJCP Mead Scoresheet (organoleptic/sensory content only); AESHI (Asociación Española de Hidromiel) *Manual de Buenas Prácticas del Hidromiel* — real regulatory/technical content: classification taxonomy, raw material specs, production process, Spanish/EU legal framework | BJCP copyrighted (sensory content only — AESHI's own Ch. IV is explicitly BJCP-sourced, same restriction applies); AESHI's raw-material specs, classification, and process content is real regulatory material, usable as reference; Spanish law/customs codes are illustrative of a compliance-framework model, NOT directly applicable in Panama | Adapt-original for sensory scoring; AESHI's classification taxonomy and physicochemical specs used directly as real technical reference (§3 below); Panama-specific legal compliance is a separate question requiring a Panama-licensed attorney, not assumed from the Spanish model |
| Honey | ISO 4121/5492/8586/8589 (general sensory methodology), International Honey Commission odour/aroma wheel, published academic literature (Apidologie and similar); additional real training/competition material received directly (100-pt competition rubric, defects taxonomy, real field-sample dataset) — institutional "UC Davis" attribution on the training material is unverified, see §3 note | ISO standards are purchasable documents; underlying methodology/vocabulary widely published in open academic literature; received competition rubric and field schema treated as your own working documents, not third-party copyrighted material | Original, grounded in cited open literature plus real received training/competition/field-intake content — least licensing constraint of the priority batch |
| Wine | WSET Systematic Approach to Tasting (SAT); Court of Master Sommeliers deductive grid; **UC Davis Wine Aroma Wheel** (Ann C. Noble, UC Davis) — the foundational wine aroma wheel, widely cited academically | WSET/CMS trademarked; UC Davis wheel is Noble's copyrighted work, historically made available for educational/research citation — verify current terms before any use, do not assume free reproduction | Deferred — adapt-original when built, citing the Noble wheel's structure rather than reproducing it |
| Cacao | Heirloom Cacao Preservation Fund fine-flavor evaluation; Cocoa of Excellence scoresheet | Organization-specific, license status to confirm when built | Deferred |
| Chocolate | International Chocolate Awards scoresheet | Competition-specific, license status to confirm when built | Deferred |
| Spirits (general) | ISO 13299 general sensory methodology; Beverage Testing Institute; FlavorActiV spirits tools | ISO purchasable; BTI/FlavorActiV proprietary | Deferred |
| Rum | No single centralized body — various competition/distiller flavor wheels (e.g. Foursquare, rum competition scoresheets) | Fragmented, case-by-case | Deferred — more original-content freedom given no dominant single standard |
| Gin | IWSC scoresheet; various distiller-published flavor wheels | Fragmented | Deferred |
| Infused liquors/spirits | No established standard | N/A | Deferred — likely adapted from general spirits framework when built |
| Water (fine/still) | Fine Water Society-style classification (TDS, mineral character, mouthfeel); FlavorActiV water sensory tools | Less formalized industry-wide; FlavorActiV proprietary | Deferred |
| Non-alcoholic | FlavorActiV non-alcoholic sensory tools; UC Davis published NAB (non-alcoholic beer) sensory research | FlavorActiV proprietary; academic research citable | Deferred |

**Licensing decision, per your direction**: mixed approach — pursue an
actual licensing relationship with a standards body **only where realistic**
(this is a real business/legal step outside what this document or Claude
Code can resolve — it requires actually contacting SCA/BJCP/WSET/AROXA/
FlavorActiV, which is your action item, not an architectural one).
Everywhere else: build original, clearly-attributed, structurally-informed
forms.

**Supplier note**: FlavorActiV is your current reference-standard supplier;
you also create and sell your own kits. §7.1's data model treats suppliers
as open `Organization` records rather than a fixed list — FlavorActiV,
AROXA, and Néctar Nómada itself as a standards creator/seller are all just
Organizations, so adding or changing suppliers over time is a data
operation, not an architecture change.

## 2. Priority build order

**First batch, confirmed**: Coffee (CVA-adapted), Beer & Mead (BJCP-adapted),
Honey (ISO/academic-grounded). All other categories get placeholder
structure (§4) but no real content until individually requested.

## 3. Protocol structure (shared shape, category-specific content)

Reuses the existing `SensoryProtocol`/`SensoryProtocolVersion` entities
(`DOMAIN_MODEL.md` §4) — no new schema needed, just populated content:

```
sensory.protocol: add
  standard_source_reference text (e.g. "Adapted from SCA Coffee Value
    Assessment structure (CVA-103 Descriptive, CVA-104 Affective);
    not an official SCA form"),
  standard_license_status [adapted_original|licensed|pending_license]
```

Every protocol version must populate `standard_source_reference` — this is
non-negotiable, consistent with the platform's provenance discipline
(`DATA_ARCHITECTURE.md` §4) applied to protocol design itself, not just
collected data.

### Coffee (adapted from CVA structure)
- Separates **Descriptive Assessment** (what the coffee tastes like — the
  CVA-103 concept) from **Affective Assessment** (how much the evaluator
  values it — the CVA-104 concept) as two distinct sections, matching CVA's
  key innovation of not collapsing description and preference into one score.
- Attribute categories: fragrance/aroma, flavor, aftertaste, acidity, sweetness,
  mouthfeel, and an overall affective/hedonic rating — general categories
  used broadly in coffee cupping, not CVA's exact proprietary intensity-scale
  wording.
- Reuses `SensorySample`/`BlindCode` (already modeled) for blind cupping.

### Beer & Mead (adapted from BJCP structure)
- Separate protocol versions for Beer and Mead (matching BJCP's own
  separation into distinct scoresheets, not one combined form).
- Attribute categories: aroma, appearance, flavor, mouthfeel, overall
  impression — the general structural shape used broadly across brewing
  judging, not BJCP's exact proprietary scoring rubric or style-specific
  numeric point allocations.
- Style-reference linkage: rather than reproducing BJCP's style guidelines
  text, the protocol references style categories generically (e.g. "Panama-
  style lager," tying back to your own `RESEARCH_ACTIVITY_CRITERIA.md`-
  gated cultural-identity research work) — your own style definitions, not
  BJCP's.

#### Mead — expanded with real classification, specs, and fermentation model

Source: AESHI (Asociación Española de Hidromiel) *Manual de Buenas Prácticas
del Hidromiel* — a real trade-association manual grounded in actual Spanish/
EU law, not compiled training material. **Important scope limit**: this
manual's own Chapter IV (organoleptic properties) is explicitly sourced
"de la guía BJCP para hidromiel 2015" — that content gets the same
adapt-original, never-reproduce treatment as every other BJCP reference in
this document (§1). What follows below is the *other* content — raw
material specs, classification, production process — which is AESHI's own
regulatory/technical material, not BJCP's.

**Classification taxonomy** — significantly more precise than a generic
"BJCP framework" reference:

```
mead.style_classification(
  sweetness_category [seco|semi_dulce|dulce],
  -- by final specific gravity: seco 0.990-1.010, semi_dulce 1.010-1.025,
  -- dulce 1.025-1.050
  raw_material_style [metheglin|tradicional|melomel|cyser|pyment|bochet|
    capsicumel|braggot|acerglyn|other],
  -- metheglin = herbs/spices; tradicional/"show mead" = water+honey only;
  -- melomel = fruit-fermented, with named subtypes cyser (apple) and
  -- pyment (grape); bochet = caramelized/toasted honey; capsicumel =
  -- chili peppers; braggot = honey + cereal malt (45-55% sugars from each,
  -- the one exception to the general 40%-max-non-honey-sugar rule below)
  carbonation [plano|espumoso|gasificado]
  -- still | naturally effervescent | artificially carbonated
)
```

**Raw material specs, from actual regulatory thresholds** — worth keeping
as real numbers, not vague guidance:

```
mead.honey_raw_material_acceptance(
  moisture_pct_max = 18,           -- matches the exact threshold already
                                    -- cited as a fermentation-defect cause
                                    -- in the honey defects taxonomy above —
                                    -- now confirmed as a real regulatory
                                    -- number, not an arbitrary figure
  diastase_index_min = 8,          -- freshness/overheating indicator
  sugar_content_floral_min = 60,   -- g/100g
  sugar_content_honeydew_min = 45, -- g/100g
  ph_range = [3.5, 4.5],
  acidity_max_meq_kg = 50,
  hmf_max_mg_kg = 40               -- hydroxymethylfurfural, freshness
                                    -- indicator, forms from sugar
                                    -- dehydration (especially fructose)
)

mead.finished_product_specs(
  abv_min_pct = 1,                 -- max = yeast-strain tolerance
  ph_range = [3.3, 4.1],
  volatile_acidity_max_g_l = 1.4   -- as acetic acid
)
```

**Fruit/cereal sugar contribution rule**: non-honey fermentable sugars
capped at 40% of total for commercial producers (measured as dry residue;
density-based calculation method specified in the source), except braggot's
45-55% cereal allowance. Post-stabilization sweetening from other sugar
sources capped at 20%, doesn't require front-label declaration but must
appear in the ingredient list.

**Water chemistry targets** (for mead production specifically): Calcium
40-60 ppm (double for braggot mash), Sodium <100 ppm, Bicarbonates <20 ppm,
Chloride <300 ppm (adds smoothness/perceived sweetness; above 300 ppm is
yeast-inhibiting), Sulfates (adds astringency/perceived bitterness — keep
low unless the style specifically calls for it).

**Fermentation phase model** — real, useful vocabulary for the still-unbuilt
`FermentationRun` entity (flagged as a gap elsewhere):

```
fermentation.phase [latente_adaptacion|induccion|tumultuosa_exponencial|
  estacionaria|declive_muerte_celular]
```

- **Latente/adaptación** (~12-24h): near-imperceptible growth, yeast
  adapting to environment
- **Inducción** (~1-2 days): yeast multiplication begins, budding activity,
  CO2 forming but mostly staying dissolved; minimal gravity change;
  typically *Saccharomyces apiculatus* initiates until ~5% ABV
- **Tumultuosa/exponencial** (up to ~30 days): the major sugar-to-alcohol
  conversion, visible bubbling, rapid cell increase, heat release; typically
  elliptical yeast strains dominate; sharp density drop
- **Estacionaria**: births ≈ deaths, population stable
- **Declive/muerte celular** (up to ~6 months): fermentation slows as sugar
  depletes and alcohol rises, CO2 production drops

**Yeast species**: *Saccharomyces cerevisiae* and *bayanus* for standard
production; other yeasts/bacteria permitted for experimental styles — this
is the regulatory-document version of the same principle already in
`AI_GOVERNANCE.md`/elsewhere: don't force every fermentation to use a
single "standard" organism.

### Honey — expanded with real competition, defect, and field-data content

**Attribution, corrected (documentation correction pass):** the 100-point
competition rubric and three-tier defect taxonomy below are Daniel
Giráldez's own work — developed and refined through his own honey
judging and training practice, informed by his professional sensory
background (UC Davis / AROXA-Cara / FlavorActiV, §7.3), not derived from
or reproducing a specific UC Davis publication. An earlier version of
this document hedged the attribution toward "UC Davis-attributed
training material... institutional origin unverified" — that hedge ran
in the wrong direction: the platform's attribution discipline exists to
stop the platform claiming work that isn't its own, and it applies
equally to *disclaiming* work that is. Where UC Davis-style training
informed the author's own thinking, that's real, relevant background —
but the rubric itself is not presented as a UC Davis document. The
originally compiled rubric/taxonomy text is preserved below (per
`DATA_ARCHITECTURE.md` §2's version-preservation rule) rather than
deleted; the versions immediately following this note are the current,
enhanced-original ones, restructured in the platform's own voice from
the same underlying facts and point values.

- Attribute categories informed by published honey sensory research: visual
  (color via Pfund scale, clarity, brightness), olfactory (aroma intensity
  and character, warmed-sample technique), olfactory-gustatory (flavor,
  retronasal perception), tactile (crystallization texture, viscosity) —
  the four-category structure used across the academic honey-sensory
  literature cited in §1.
- Supports both **descriptive** (semi-quantitative, detailed descriptors)
  and **conformity** (does this unifloral honey match its claimed botanical
  origin's expected profile) modes — both documented approaches in the
  honey sensory literature, and the conformity mode connects directly to
  your Specimen/bloom-tracking work (`SPECIMEN_AND_MATERIAL_TRACEABILITY.md`)
  for verifying a honey batch's claimed floral origin. **Pollen analysis
  (melissopalynology)** — now confirmed as a real intake field (see
  `field_sample` schema below) — is the actual verification method for
  conformity mode, not just a theoretical connection.

#### Competition scoring rubric (100 points) — current version, enhanced original

Six criteria, weighted toward aromatic/flavor complexity and freedom from
defect — the two dimensions that separate a technically clean honey from
one that actually stands out in competition:

```
sensory.honey_competition_score(
  aroma_positivo          integer, -- 0-20: aromatic richness — how many distinct, recognizable notes are present and how clearly they read
  sabor_y_gusto           integer, -- 0-20: the tasting experience itself — sweetness quality, acid/bitter balance, how cleanly and harmoniously the flavor comes together
  textura_boca            integer, -- 0-15: mouthfeel — viscosity appropriate to the honey type, no excess astringency, no unpleasant hard crystallization
  apariencia              integer, -- 0-10: visual appeal on a white background — color, brightness, clarity
  persistencia_equilibrio integer, -- 0-15: how long the flavor lasts and how well every attribute holds together as a whole, not just individually
  ausencia_defectos       integer, -- 0-20: freedom from fermentation, mold, smoke, rancidity, or contamination — the ceiling every other score sits under
  total                   integer  -- sum, 0-100
)
```

Quality bands read the total, not any single criterion: **90-100
Excelente** (clean, no defects, a profile that stands out) · **80-89 Muy
buena** (clean and complex, without quite reaching standout) · **70-79
Buena** (sound honey with minor issues) · **below 70**, a sample carrying
real defects or too indistinct to place.

Judging environment matters as much as the rubric itself: 20-25°C,
neutral white light, no perfume or scented product nearby, neutral
plastic or stainless spoons, water and a plain cracker between samples —
the same sensory-booth discipline `SECURITY.md`/`RBAC.md` already assume
for a formal blind competition (`COMPETITIONS.md`).

#### Defects taxonomy — three-tier classification, current version, enhanced original

A binary good/bad split loses information a judge actually needs — this
taxonomy keeps a third tier for character that reads as neutral depending
on context, and ties every defect back to its real cause rather than
leaving it as an unexplained label:

```
sensory.honey_descriptor(id, family, specific_descriptor, expected_perception,
  classification [positivo|neutral|defecto], technical_cause (nullable))
```

**Positivo** — descriptor families a judge wants to find: floral (rose,
jasmine, orange blossom), fruity (apple, peach, melon), citrus (lemon,
grapefruit, orange), vegetal (grass, green stem, artichoke), herbal
(thyme, basil, fennel), resinous (pine, balsam, sap), hive-character
(fresh wax, fresh propolis — becomes a defect past a certain intensity),
malty (baked bread, cereal), toasted (caramelized sugar — becomes a
defect if it came from overheating rather than the honey's own
character), lactic (yogurt-like lactic acid), controlled-fermentation
esters (geraniol, citronellol), and desirable phenolics (clove/4-vinyl
guaiacol, in moderation).

**Neutral** — reads as context-dependent, not automatically a mark
against the sample: mild controlled fermentation, light fermented-floral
character, faint alcohol notes (white wine, cider). This matters
specifically for honey destined for mead production, where a trace of
fermentation character isn't the defect it would be in honey judged for
the table.

**Defecto** — every family here carries a real, specific cause, not just
a label:

- **Unwanted fermentation** — harvested above 18% moisture, poor sealing,
  air exposure; reads as acetic acid, uncontrolled yeast character.
- **Undesirable organic acids** — *Clostridium* or organic-matter
  contamination; reads as butyric/isovaleric acid (cheese, vomit, sweat).
- **Chemical contamination** — unsuitable containers, cleaning chemicals
  not fully rinsed; reads as chlorine or solvent.
- **Microbiological contamination** — ambient humidity, contact with wet
  surfaces; reads as stable, wet leather, or **Brettanomyces** (see note
  below).
- **Advanced oxidation** — prolonged oxygen exposure, excess heat; reads
  as rancid, old butter.
- **Thermal contamination** — excessive heat used to decrystallize; reads
  as bitter, burnt sugar, smoke.

**On *Brettanomyces*, deliberately not a universal rule**: it correctly
reads as a contamination/defect signal in standard honey evaluation, as
classified above. It's also a wild yeast genus some fermentation
traditions use on purpose (lambic beers, certain wild ferments) — given
the platform's own wild-yeast bioprospecting work, "defect" here is
specific to honey evaluation, not a blanket statement about the organism.

#### Superseded — prior compiled version (preserved, not deleted)

Per `DATA_ARCHITECTURE.md` §2's version-preservation rule: the rubric and
defect taxonomy above supersede the text below, which was the original
compiled version carrying the now-corrected UC Davis hedge. Kept for
historical reference, not for current use.

<details>
<summary>Original rubric and defect taxonomy (superseded)</summary>

```
sensory.honey_competition_score(
  aroma_positivo        integer, -- 0-20: intensity/complexity, descriptor richness
  sabor_y_gusto          integer, -- 0-20: sweetness quality, acid/bitter balance, clean/harmonic expression
  textura_boca           integer, -- 0-15: appropriate viscosity, pleasant mouthfeel, no excess astringency/hard crystals
  apariencia              integer, -- 0-10: color appeal, brightness, clarity, evaluated on white background
  persistencia_equilibrio integer, -- 0-15: flavor duration, harmony across all attributes
  ausencia_defectos       integer, -- 0-20: absence of fermentation/mold/smoke/rancidity/contamination
  total                   integer  -- sum, 0-100
)
```

Quality tiers: 90-100 Excelente (no defects, standout profile) · 80-89 Muy
buena (clean, complex) · 70-79 Buena (minor issues) · <70 muestra con
defectos o poco destacada.

Tasting conditions specified alongside the rubric: 20-25°C, neutral white
light, no external perfumes/odors, neutral plastic or stainless spoons,
water and plain crackers between samples.

```
sensory.honey_descriptor(id, family, specific_descriptor, expected_perception,
  classification [positivo|neutral|defecto], technical_cause (nullable))
```

**Positivo** families: floral (rosa, jazmín, azahar), frutal (manzana,
durazno, melón), cítrico (limón, toronja, naranja), vegetal (pasto, tallo
verde, alcachofa), herbal (tomillo, albahaca, hinojo), resinoso (pino,
bálsamo, savia), animal/colmena (cera nueva, propóleo fresco — becomes
defect if excessive), malteado (pan horneado, cereal), tostado (azúcar
caramelizado — becomes defect if from overheating), lácticos (ácido láctico
tipo yogur), ésteres de fermentación controlada (geraniol, citronelol),
fenoles deseables (clavo/4-vinil guayacol, specified moderate).

**Neutral** (context-dependent, not automatically negative): fermentación
controlada (ligeramente alcohólico), floral fermentado leve, notas
alcohólicas leves (vino blanco, sidra).

**Defecto** families: Fermentación indeseada — cosecha con humedad >18%,
mal tapado, exposición al aire; ácido acético, levadura descontrolada.
Ácidos orgánicos indeseables — contaminación con *Clostridium*, restos
orgánicos; ácido butírico/isovalérico (queso, vómito, sudor). Contaminación
química — envases inadecuados, limpieza con químicos no enjuagados; cloro,
disolvente. Contaminación microbiológica — humedad ambiental, contacto con
superficies húmedas; establo, cuero mojado, Brettanomyces. Oxidación
avanzada — exposición prolongada al oxígeno, calor excesivo; rancio,
mantequilla vieja. Contaminación térmica — calentamiento excesivo para
descristalizar; sabor amargo, azúcar quemada, ahumado.

</details>

#### Training protocol and calibration exercises

- 5-phase training sequence: familiarization with floral origins → common
  descriptor/defect identification → reference-standard practice (jasmine,
  orange, propolis) → 0-5 intensity scale training → inter-panelist
  calibration. This is a lighter-weight version of the Reference Standards &
  Panel Calibration system already specified in §7 — the same underlying
  concept (calibrate against known references), scaled appropriately for
  honey rather than requiring AROXA-grade purchased standards for every
  session.
- Exercises: aroma recognition (essential oils/extracts in jars), described
  comparison using known monofloral honeys, 0-5 intensity scaling with
  mean/deviation recording, triangle test (three samples, one different,
  identify the odd one out).
- Panelist preparation rules: no perfumes/scented products, no coffee/
  cigarettes/strong food before tasting, rinse with water between samples
  (plain white bread as neutral option), evaluate in silence, use objective
  language (avoid "rico"/"feo" — evaluate attributes, not just liking).

#### Field/intake data schema — real, complete, from actual sample records

A real example dataset (two representative entries, Chiriquí and Veraguas)
confirms the actual field schema used for honey sample intake — this is
concrete enough to build the intake form/table directly from:

```
apiary.field_sample(
  sample_id text,              -- convention: PA-[PROVINCIA]-[AÑO]-[SEQ],
                                -- e.g. "PA-CHIR-2024-001" — real, already in use
  collection_date date,
  apiary_name text,
  apiary_code text,
  beekeeper_name text,
  beekeeper_contact text,
  active_hive_count integer,
  harvest_method text,         -- e.g. centrífuga, manual
  province text, district text, corregimiento text,
  altitude_masl integer,
  gps_coordinates point,
  ecosystem_type text,         -- e.g. montaña/cordillera, manglar/pacífico
  climate_zone text,
  predominant_flora text,      -- free text, candidate for Specimen linkage
                                -- per SPECIMEN_AND_MATERIAL_TRACEABILITY.md
  season text,
  honey_type text,             -- multifloral | monofloral
  color text,
  crystallization text,        -- ninguna | parcial | [degree]
  moisture_content_pct numeric,
  ph numeric,
  electrical_conductivity numeric,
  water_activity numeric,      -- Aw
  pollen_analysis text,        -- real melissopalynology breakdown, e.g.
                                -- "Mangle rojo (85%), otras (15%)" — this is
                                -- the actual conformity-mode verification
                                -- data referenced above, not hypothetical
  aroma_intensity text,
  primary_notes text,
  texture text,
  defects_present text,
  evaluators text,              -- e.g. "Panel Santa Fe" — a named field panel
  sensory_evaluation_date date,
  collection_vessel text,       -- e.g. balde plástico grado alimenticio, tambor metálico
  storage_conditions text,
  transport text,
  additional_notes text
)
```

This schema is significantly more complete than what was previously
specified for honey intake — it adds real **physicochemical lab
parameters** (moisture%, pH, electrical conductivity, water activity) that
are genuine honey quality/authenticity indicators, distinct from sensory
descriptors, and weren't in this document before. `electrical_conductivity`
in particular is a real, standard method for distinguishing floral origin
categories (e.g., the Veraguas mangrove example shows conductivity 0.9 vs.
Chiriquí's 0.35 — mangrove/coastal honeys typically run higher) — worth
treating this field as genuinely diagnostic, not just descriptive.

The two example records also demonstrate the schema working end-to-end:
one clean high-altitude coffee-adjacent multifloral honey with no defects,
and one coastal mangrove monofloral honey with a real, correctly-flagged
fermentation defect from poor post-harvest handling — a good worked example
of the whole system catching a real quality problem, not just theoretical
capability.

## 4. Deferred categories — placeholder structure only

```
sensory.protocol(id, product_type, status = 'planned_not_built', ...)
```

Wine, cacao, chocolate, spirits (general), rum, gin, infused liquors, water,
and non-alcoholic all get a `SensoryProtocol` row with `status =
'planned_not_built'` — they exist as recognized evaluation categories the
platform is designed to support, so nothing needs redesigning when one of
them actually gets built, but none carry real attribute content or scales
until specifically requested.

## 5. Relationship to Consumer Sensory Feedback

This document specifies the **expert/technical** protocol content
(`sensory.Assessment`, calibrated evaluators). `CONSUMER_SENSORY_FEEDBACK.md`
already specifies the separate, structurally distinct consumer-hedonic
pathway — and already notes that its own attribute sets vary by product
type. Once real expert protocols exist here for coffee/beer/mead/honey, the
consumer-facing forms for those same categories can be designed with
genuinely informed (simpler, hedonic) attribute sets drawn from the same
underlying category knowledge — still never merged into the same data or
score, per `CLAUDE.md` §49, just informed by the same domain understanding.

## 6. Sequencing

Fits with Slice 6 (Sensory) per `MVP_ROADMAP.md` — this document specifies
what Slice 6 should actually contain for the first three categories, rather
than Slice 6 starting from a blank slate. Log acceptance in `DECISIONS.md`,
same pattern as every other planning document — implementation deferred to
Slice 6, not an immediate build order. The licensing outreach (§1) is a
parallel action item for you, not blocking this document's filing.

---

## 7. Reference Standards & Panel Calibration — the professional-grade layer

Descriptor lists and scoring structure (§3) are necessary but not
sufficient for a program that holds up to UC Davis, AROXA/Cara Technology,
and FlavorActiV-trained expectations. What those programs actually do that
a descriptor list alone doesn't: **calibrate tasters against known,
precisely-dosed reference standards**, so a panel's results are traceable
to demonstrated, tested perceptual ability — not just self-reported
familiarity with a flavor vocabulary.

### 7.1 Reference standards — open to any supplier, including your own

```
sensory.reference_standard(id, compound_name, sensory_descriptor,
  category [beer|wine|coffee|honey|spirits|water|other],
  typical_threshold_value, threshold_unit,
  standard_origin [commercial_third_party|self_created|adapted_from_commercial],
  supplier_organization_id (nullable, FK to core.Organization — not a closed
    enum; AROXA, FlavorActiV, or any future supplier are each their own
    Organization record, same as any other Organization in the platform),
  supplier_product_reference (nullable, when commercial),
  data_sheet_reference (nullable, when commercial),
  commerce_product_id (nullable, FK to core.Product — set when this standard
    is itself a kit you sell), notes)
```

**Kept deliberately open** — `supplier_organization_id` is not a closed
list of AROXA/FlavorActiV/etc. Any current or future supplier is just
another `Organization` record, consistent with how every other organization
in this platform is modeled (`DOMAIN_MODEL.md` §3). Your currently-used
supplier (FlavorActiV) is one Organization row, not a hard-coded value —
switching or adding suppliers later is a data change, not a schema change.

**Self-created standards get real provenance too, not a pass**:
`standard_origin = 'self_created'` doesn't exempt a standard from the
platform's evidence discipline — it changes what evidence looks like:

```
sensory.self_created_standard_detail(reference_standard_id, composition_notes,
  creation_method, base_material_source, validated_against
  [none|commercial_standard_comparison|expert_panel_consensus|triangle_test],
  validation_reference (nullable — e.g. "compared against AROXA DMS standard,
  N=8 panel, see [record]"), created_by_person_id, created_at)
```

A self-created standard's threshold/descriptor claims should be traceable
to *some* validation method, same as any other evidence in this system
(`DATA_ARCHITECTURE.md` §4) — "I made this and I know what's in it" is
recorded as `creation_method`/`composition_notes`, but `validated_against`
is what lets someone (including future-you) know whether a given standard's
claimed threshold has actually been checked against something external, or
is still provisional.

**Raw-ingredient extraction as a self-created standard method** — worth
naming explicitly as a real `creation_method` value, distinct from
compounding a standard from purchased isolates:

```
sensory.self_created_standard_detail.creation_method includes:
  'aqueous_extraction_ratio' — a fixed ingredient-to-water ratio, steeped
  and tasted directly to isolate one raw material's character in isolation
  from a finished product
```

This is a real, published technique — not BJCP's, attributed to Briess
Malt & Ingredients Co. (a commercial malt producer), publicly presented at
the 2017 National Homebrewers Conference. The core idea generalizes well
beyond malt: any raw ingredient can be evaluated the same way — steep at a
controlled ratio, taste directly, isolate what that specific input
contributes before it's combined with everything else in a finished
beverage. Directly usable for panelist training on base malts for beer,
but the same method applies to honey varietals or any other raw material
where isolating one ingredient's contribution matters — not limited to one
category. `base_material_source` and `composition_notes` should record the
ratio and prep method used, same as any other self-created standard.

**Commercial link**: when a reference standard is also a product you sell
(`commerce_product_id` set), it's simultaneously a `core.Product` (with its
own price, inventory, listing per `DOMAIN_MODEL.md` §4's Commerce module)
*and* a `sensory.reference_standard` used internally for calibration —
one record, two roles, not duplicated data. This is the same canonical-
entity-reuse principle running through the whole platform, applied to a kit
that's both a sellable product and a real piece of your own sensory
infrastructure.

### 7.2 Calibration sessions — distinct from tasting sessions

```
sensory.calibration_session(id, session_date, category, conducted_by_person_id,
  reference_standards_used jsonb (array of reference_standard_id + actual
  concentration used, since a trainer may dose below/above the standard
  product's default concentration for a given exercise), notes)

sensory.calibration_result(id, calibration_session_id, evaluator_person_id,
  reference_standard_id, correctly_identified (boolean),
  perceived_descriptor_given text, perceived_intensity_rating (nullable),
  actual_concentration_presented, notes)
```

A calibration session is not a product evaluation — it's a **panelist
capability test**, structurally distinct from `SensorySession`
(`DOMAIN_MODEL.md` §4), which evaluates products. Calibration sessions
evaluate people's demonstrated perceptual ability against known standards.

### 7.3 Evaluator qualification and known sensitivity profile

```
core.person: add sensory_certifications jsonb (array of
  {certifying_body, certification_name, level_or_rank (nullable),
  date_earned (nullable), expiry_date (nullable),
  certificate_reference (nullable)})

sensory.evaluator_sensitivity_profile(person_id, reference_standard_id,
  demonstrated_threshold (nullable), known_anosmic (boolean, nullable),
  last_calibration_date, confidence_level [not_tested|tested_once|
  regularly_calibrated])
```

**`date_earned` became nullable on 2026-09-08** (Daniel's decision). It was
required, and the empirical case against that is Kurt Ngo: recorded as a CQI Q
Grader — a real, documented credential — with no date, because nobody knew it.
Requiring the date did not produce a dated row; it produced one that could not
even be read, and which later kept the external-report screen from opening at
all. Only `certifying_body` and `certification_name` are required now: without
those two there is nothing being asserted. An undated row is a placeholder that
states the credential it knows and stays silent about what it does not — its
holder confirms the date when they sign in. Adding the date later **completes**
that row rather than duplicating the credential.

This extends the `Expertise`/`Certifications` fields already specified on
`Person` (`CLAUDE.md` §9) with real structure — your own UC Davis, AROXA/
Cara, FlavorActiV, and BJCP credentials populate this exactly as real,
verifiable data, the same as Kurt's Q-Grader certification already
mentioned in your CryoBloom team context. BJCP is the credential most
directly relevant to this document's own licensing discussion (§1) —
worth listing alongside the others rather than omitted (documentation
correction pass).

**Why this matters specifically**: AROXA's own documentation notes that
some panelists are genuinely anosmic (smell-blind) to specific compounds —
a rigorous panel needs to know this per-panelist, not discover it
mid-evaluation. `evaluator_sensitivity_profile` is what makes a panel's
aggregate results actually trustworthy: an evaluator's assessment of a
DMS-related off-flavor carries different weight if their calibration
history shows they reliably detect DMS at low concentrations versus if
they've never been tested against it, or are known-insensitive to it.

### 7.4 What this does and doesn't do

For third-party standards (`standard_origin = 'commercial_third_party'`),
this system records and structures data — it doesn't manufacture or
substitute for the real product; you still need to actually purchase
FlavorActiV (or another supplier's) kits to run calibration sessions
against them.

For your own standards (`standard_origin = 'self_created'`), this system
is genuinely tracking **your own real production and sales process** — the
composition, validation, and commercial listing of kits you actually make.
This is not a hypothetical extensibility point; it's core infrastructure
for a real part of your business.

### 7.5 Sequencing

This is properly part of Slice 6 alongside §1-6, not a later addition —
without it, "Sensory Evaluation" in this platform would be descriptor
collection, not a professional-grade panel program. Given your own
credentials across these bodies, this is worth building from the start
rather than retrofitting once real panel data exists.
