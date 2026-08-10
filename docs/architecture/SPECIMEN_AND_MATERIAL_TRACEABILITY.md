# Specimen Tracking & Material Traceability — Néctar Nómada Digital Platform

Extends `DOMAIN_MODEL.md` §3-4 (canonical entities, Agricultural Traceability,
Apiary/Honey, Fermentation & Beverage) and `PLATFORM_OVERVIEW.md` §6 (Map &
Territory). Specifies two things not yet modeled: individual specimen-level
tracking beneath `Location`, and a wood/material processing chain shared
across every beverage domain rather than duplicated per-domain.

---

## 1. The core gap this fills

The current model tracks `Location` at farm/site granularity — good for "where
is Kiva Estate," not granular enough for "this specific Geisha tree, tracked
individually, connects a bloom event to a honey batch *and*, eighteen months
later, to a barrel-aged coffee lot."

This matters because it's a literal instance of the platform's own founding
principle (`CLAUDE.md` §2): the same canonical entity, referenced across
completely different modules, never recreated. A tree is currently invisible
to the data model — everything about it gets flattened into farm-level
Location data, losing the specimen-level connections you're describing.

## 2. New entity: Specimen

```
core.specimen(id, location_id, species_id, cultivar_id (nullable),
  common_name, planted_date (nullable, may be unknown for wild/existing trees),
  status [active|removed|dead], notes, created_at, created_by)
```

- `location_id` — nests under an existing `Location` (a farm has many
  Specimens; a Specimen has exactly one home Location, though material
  harvested from it may travel elsewhere — see §4).
- `species_id`/`cultivar_id` — reuses the `Species`/`Cultivar` tables already
  specified for coffee (`DOMAIN_MODEL.md` §4) — a Specimen isn't
  coffee-specific; the same table handles a Geisha coffee tree, a native
  hardwood, a flowering ornamental relevant to apiary foraging, or a fruit
  tree used in fermentation.
- Point coordinates on a Specimen (distinct from its parent Location's
  centroid) are optional but supported — useful for farms precise enough to
  map individual trees, not required for less mapped sites.

```
core.specimen_observation(id, specimen_id, observation_type
  [bloom_start|bloom_peak|bloom_end|health|material_harvested|other],
  observed_at, observer_person_id, notes, provenance_class, data_quality)
```

Reuses the same provenance/data-quality columns as every other fact-bearing
table (`DATA_ARCHITECTURE.md` §4) — a bloom observation is a `direct_observation`
by a named Person, not a guess, same discipline as everything else in the
system.

## 3. Why this fixes the apiary/botanical case directly

Your example: a specific tree flowering → bees foraging it → honey harvested
during that bloom window. With Specimen in place:

```
Specimen (the tree)
  → SpecimenObservation (bloom_start, bloom_peak, bloom_end — dated)
  → [existing] Apiary/Hive foraging context (proximity, timing correlation)
  → [existing] Harvest → HoneyBatch
```

The HoneyBatch doesn't need a new field — it already can reference `Location`
and timing; adding a `primary_forage_specimen_ids` (many-to-many, since bees
forage multiple sources) linking table lets you say "this batch's dominant
bloom window overlapped this Specimen's flowering," which is honest
(correlational, not a claim that 100% of the honey came from that one tree)
and traceable.

## 4. New chain: Wood & Material Processing (shared across every beverage domain)

This is the piece with no home yet. Modeled once, referenced by coffee,
spirits, wine, beer, mead, and rum — not duplicated five times.

```
material.wood_harvest(id, specimen_id (nullable — may be wild-sourced,
  not always a tracked Specimen), species_id, harvested_at, harvested_by,
  quantity, quantity_unit, location_id, notes, provenance_class)

material.wood_curing_batch(id, wood_harvest_id, curing_method
  [air_dried|kiln_dried|other], start_date, end_date (nullable — ongoing),
  target_moisture_pct (nullable), achieved_moisture_pct (nullable), notes)

material.toast_char_protocol(id, name, description, status)
material.toast_char_protocol_version(id, protocol_id, version,
  toast_level [light|medium|medium_plus|heavy|custom],
  char_level [none|char_1|char_2|char_3|char_4|custom],
  temperature_target, duration_target, method_notes, superseded_by)

material.vessel(id, format [barrel|cube|chip|stave|spiral|other],
  wood_curing_batch_id, toast_char_protocol_version_id,
  previous_contents (nullable — e.g. 'ex-bourbon', 'ex-rum', 'virgin'),
  previous_contents_source (nullable, free text or FK if tracked),
  capacity, capacity_unit, status [available|in_use|retired], notes)

material.aging_run(id, vessel_id, base_product_type
  [coffee|spirit|wine|beer|mead|rum|other],
  base_product_reference (FK to whichever domain's batch/lot — see §5),
  start_date, end_date (nullable), target_notes, actual_notes,
  provenance_class, data_quality)
```

This is the same pattern as `SensoryProtocol`/`SensoryProtocolVersion`
(`DOMAIN_MODEL.md` §4) — a versioned protocol (toast/char profile) applied
via a session/run, not hard-coded. A toast/char profile can be reused across
many `aging_run`s; each run tracks its own actuals.

## 5. Cross-domain reference, not duplication

`material.aging_run.base_product_reference` points at whatever the relevant
domain's own batch/lot table is:

- Coffee: green coffee `Lot` (already exists) — this is the "café añejado en
  barrica caturra y catuai" case, already in your commerce product list.
  Roasting happens *after* the aging run completes, so `RoastSession`
  (already modeled) references the aged `Lot`, preserving the full chain:
  `Specimen → WoodHarvest → CuringBatch → ToastCharProfile → Vessel →
  AgingRun (coffee Lot inside) → RoastSession → Sensory`.
- Fermented beverages (mead, wine, beer, cider): `FermentationRun` (already
  modeled, `DOMAIN_MODEL.md` §4) — an aging run references a completed or
  in-progress FermentationRun, since barrel-aging is typically a later stage.
- Spirits (rum, other distillates): needs a lightweight `DistillationRun`
  entity, not yet modeled — flagged here as a small gap, same shape as
  FermentationRun, worth adding when spirits work is actually scheduled
  (you already have real experiments — Panama Geisha coffee vodka
  maceration, sugar wash protocols — that would want this).

No domain module needs its own separate "barrel aging" implementation — they
all reference the same `material.*` tables, exactly the pattern
`DOMAIN_MODEL.md` §4 already uses for Sensory/Competitions sharing one
evaluation engine instead of parallel ones.

## 6. Field identification workflow (GPS + photo, no physical tag)

Decision, informed by real field practice: specimens are identified by GPS
coordinate + photo, not a physical tag on the tree. This is deliberately
lightweight — no tagging hardware, no field equipment beyond a phone — but it
creates a real problem worth solving explicitly rather than leaving to
chance: **how does the system know a new observation is the same tree as one
logged three months ago, rather than silently creating a duplicate
Specimen?**

Proposed mechanism — a **candidate-match step** at observation-logging time,
not a hard requirement for a perfect match:

1. When someone logs a new observation, the app checks existing Specimens
   within a configurable proximity radius (default ~15–20m, tunable per
   Location — dense plantings need a tighter radius than scattered wild
   trees).
2. If candidate Specimens exist nearby, the field app shows their most
   recent photo(s) side-by-side with the new one and asks: *"Is this the
   same tree?"* — yes (attach to existing Specimen), no (create new), or
   unsure (create new but flag `possible_duplicate_of` for later review).
3. If no candidates are nearby, a new Specimen is created automatically —
   opportunistic logging (per your answer) means this can't require upfront
   registration; the first observation *is* the specimen's creation.

```
core.specimen: add possible_duplicate_of (nullable, self-FK),
  duplicate_review_status [unreviewed|confirmed_distinct|merged] (nullable)
```

Because logging is opportunistic (no scheduled routine), the mobile capture
flow needs to be genuinely fast — GPS auto-captured, one photo, optional
note, submit. Anything heavier than that will just not get used in the
field, per CLAUDE.md's own "low cognitive load, mobile usability" priority
for operational surfaces.

**Consequence worth naming honestly**: this approach will produce some
duplicate/fragmented specimens over time — that's the accepted tradeoff for
avoiding physical tagging infrastructure. The `duplicate_review_status` field
and periodic admin review (not automatic merging — merging specimen history
is exactly the kind of destructive operation that needs a human, per the
platform's anti-fabrication/no-silent-mutation discipline) is the mitigation,
not a guarantee of perfect uniqueness from day one.

## 7. Client apiary consulting sites — access and privacy

Bloom→honey tracking spans both your own production and client apiary
consulting engagements (Kiva Estate, Katrin/Pedasí, future clients) — these
need different access handling, which is a direct application of the RBAC
model already built (`RBAC.md`), not new architecture:

- Each client engagement is its own `Project` (Kiva Estate is already a
  named project in your existing work; Katrin/Pedasí would be another),
  with its own `Location`(s) and `Specimen`s scoped underneath.
- Specimens and observations at a client site carry `classification =
  partner` (or `confidential` if the client requires it) rather than
  `internal` or `public` — visible to Néctar Nómada staff with a Project-
  scoped Assignment to that engagement, and to the client themselves if
  they're given their own Partner Workspace Assignment, but not to other
  clients or the general public.
- This means a client (e.g. Luis Sotillo at Kiva Estate) could, if you want,
  see their *own* site's specimen/bloom data through Partner Workspace
  (Slice 5) without any risk of seeing another client's data — the scope
  containment rule (`RBAC.md` §3: leaf/project scopes don't leak sideways)
  already guarantees this by construction.
- Your own production sites default to `internal` (visible to your team) or
  `public` (if you want bloom-to-harvest storytelling content on Discover
  pages) — a per-Location or per-Project default classification, overridable
  per record.

No new permission model needed — this is Slice 1's RBAC applied to a new
data type, which is exactly the point of building RBAC generically in the
first place rather than per-module.

## 8. Map & Territory implications

Per `PLATFORM_OVERVIEW.md` §6 (location pages dynamically expose connected
information), a Specimen becomes a mappable point beneath its Location, and
its detail page can dynamically show:

```
Specimen (a named/numbered tree)
  → Bloom history (SpecimenObservation timeline)
  → Related HoneyBatch(es) (via forage correlation, §3)
  → Related WoodHarvest(s) (if material was ever taken from it)
    → Curing → Toast/Char profile used
    → Vessel(s) made from it
      → Aging runs (which coffee lots, which ferments, which spirits aged in it)
        → Resulting Products
```

This is a genuinely compelling map interaction — clicking a single tree on a
farm map surfaces everything downstream of it, which is a distinctive feature
most agricultural platforms don't have, because most don't track below
farm-level granularity.

## 9. Sequencing

None of this blocks current work. Confirmed priority (per direct decision):
**apiary bloom→honey traceability builds first**, wood/material processing
follows once that's proven.

- **Specimen + SpecimenObservation + client-site RBAC (§7)**: the priority
  build. Fits alongside Slice 5 (Partner Workspace), since client apiary
  consulting access depends on Partner Workspace Assignments existing.
  Could reasonably start as its own focused slice once Slice 5 lands, using
  the field identification workflow (§6) as the actual mobile capture UX.
- **Wood & Material Processing chain**: fits with Slice 6 (Sensory) or
  shortly after, since aging runs feed directly into sensory evaluation
  the same way roasting/brewing/fermentation already do. Deliberately
  sequenced after specimen tracking is proven in the field with the
  (simpler) apiary case before extending to wood harvest/curing/toast
  tracking.
- **DistillationRun**: flagged as a small future gap, not urgent — add when
  spirits work is actually scheduled, following the same shape as
  FermentationRun.

As with the other planning docs, this should be logged in `DECISIONS.md` as
accepted domain-model input, not an immediate build order — it specifies the
shape now so nothing needs redesigning when Apiary, Wood/Cooperage, or
Spirits work actually comes up in the roadmap.
