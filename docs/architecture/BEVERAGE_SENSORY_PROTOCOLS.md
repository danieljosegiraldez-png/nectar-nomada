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
| Mead | BJCP Mead Scoresheet | Copyrighted, BJCP, Inc. | Adapt-original |
| Honey | ISO 4121/5492/8586/8589 (general sensory methodology), International Honey Commission odour/aroma wheel, published academic literature (Apidologie and similar) | ISO standards are purchasable documents; underlying methodology/vocabulary widely published in open academic literature | Original, grounded in cited open literature — least licensing constraint of the priority batch |
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

### Honey (grounded in ISO/academic literature)
- Attribute categories informed by published honey sensory research: visual
  (color, clarity), olfactory (aroma intensity and character), olfactory-
  gustatory (flavor), tactile (crystallization texture, viscosity) — the
  four-category structure used across the academic honey-sensory literature
  cited in §1.
- Supports both **descriptive** (semi-quantitative, detailed descriptors)
  and **conformity** (does this unifloral honey match its claimed botanical
  origin's expected profile) modes — both documented approaches in the
  honey sensory literature, and the conformity mode connects directly to
  your Specimen/bloom-tracking work (`SPECIMEN_AND_MATERIAL_TRACEABILITY.md`)
  for verifying a honey batch's claimed floral origin.

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
  {certifying_body, certification_name, level_or_rank, date_earned,
  expiry_date (nullable), certificate_reference})

sensory.evaluator_sensitivity_profile(person_id, reference_standard_id,
  demonstrated_threshold (nullable), known_anosmic (boolean, nullable),
  last_calibration_date, confidence_level [not_tested|tested_once|
  regularly_calibrated])
```

This extends the `Expertise`/`Certifications` fields already specified on
`Person` (`CLAUDE.md` §9) with real structure — your own UC Davis, AROXA/
Cara, and FlavorActiV credentials populate this exactly as real,
verifiable data, the same as Kurt's Q-Grader certification already
mentioned in your CryoBloom team context.

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
