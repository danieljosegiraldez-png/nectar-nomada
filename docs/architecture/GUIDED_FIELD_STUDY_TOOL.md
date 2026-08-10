# Guided Field Study Tool — Néctar Nómada Digital Platform

Extends `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` (Specimen entity, field
identification workflow) and `CONSUMER_SENSORY_FEEDBACK.md` (precedent for a
structurally distinct, lighter-weight parallel system). Specifies a shared
guided-workflow engine for structured biodiversity/floral resource
field studies — built once, applied to apiary/apibotanic use and coffee
nano/micro-lot biodiversity studies simultaneously, not as two separate
tools.

Every decision below was made explicitly across 11 rounds of scoped
questions — nothing here is a silent default.

---

## 1. Scope and build order

- **One shared engine, both industries at once** — not apiary-first-then-
  coffee. Coffee's fields are additive to the same wizard (§7), not a
  separate build.
- **No bee→coffee pollination cross-link yet** — apiary studies and coffee
  studies stay structurally parallel for now, even though the real-world
  agronomy connects them (bee pollination affecting coffee fruit set).
  Revisit as a future cross-domain link once both sides are proven
  independently.
- **No lab verification yet** — pure field observation (no melissopalynology/
  pollen analysis, no soil lab test ingestion) for v1. The Research OS
  Evidence/Sample chain (`DOMAIN_MODEL.md` §4) is the eventual home for lab
  results when that's built out; this tool doesn't wait for it.

## 2. Methodological grounding

Real apibotanical/melissopalynological practice works at species-level,
landscape-scale floral resource surveys (which species are present and
foraged, their seasonal bloom timing, relative abundance) — validated where
possible against pollen analysis of the honey itself. This tool follows that
shape for its *species-level* entries, while also supporting individual
Specimen-level tracking per your explicit choice (§4) — a deliberately
higher-fidelity approach than the field-standard minimum, consistent with
this platform's traceability-first design.

## 3. Core entity: Study

```
field_study.study(id, industry_scope [apiary|coffee|other],
  project_id (nullable — Project link is optional, not required),
  location_id, area_definition_type [drawn_polygon|radius], area_geometry,
  status [draft|completed|locked], completed_at (nullable),
  edit_window_expires_at (nullable — completed_at + 48h),
  created_at)

field_study.study_contributor(study_id, person_id, role_in_session (nullable))
```

- Multiple contributors per session (you + Nathy in the field together),
  each entry within the study still attributable to whoever specifically
  logged it.
- Area defined by manual polygon draw **or** fixed radius from a center
  point — both available, default varies by industry (apiary defaults to
  radius from the apiary location, matching how foraging-range science
  normally works; coffee defaults to drawn polygon, matching irregular plot
  boundaries).
- `project_id` optional — a study can stand alone, not require an active
  Project.
- **Editing**: completed studies stay editable for 48 hours, then lock.
  Corrections after locking follow the same superseded-version pattern as
  everything else in the system (`DATA_ARCHITECTURE.md` §2). This is
  deliberately looser than formal Sensory Assessments (immutable
  immediately) — field data entry is more correction-prone in the field than
  a formal lab/panel submission, and a same-day/next-day grace window
  reflects that honestly rather than pretending field data is as final as a
  calibrated cupping score the moment it's typed.

## 4. Specimen-level entries (trees) vs. abundance-category entries
(ground cover / wildflowers)

**Decision**: every tree gets individually tagged as a full `Specimen`
(reusing `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §2's entity and §6's
GPS+photo matching workflow) — not a lighter species-level default. This was
an explicit override of the field-standard-minimum recommendation, in favor
of the platform's general traceability-first approach.

**Practical exception, also explicit**: genuinely numerous ground cover/
wildflower species use abundance category instead of individual tagging —
tagging hundreds of individual wildflowers isn't practical even with a fast
capture flow. This split is based on plant growth habit, not a blanket rule:

```
core.species: add growth_habit [tree|shrub|herbaceous_groundcover|vine|other]
```

Workflow logic: `growth_habit = tree` (or other individually-distinguishable
woody types) → prompt to create/match a Specimen per individual found.
`growth_habit = herbaceous_groundcover` (or similar) → skip individual
tagging, capture one **species-level entry** instead:

```
field_study.floral_entry(id, study_id, species_id, abundance_category
  [rare|occasional|abundant], forage_type [nectar|pollen|both] (nullable —
  optional, capture if known, per real apibotanical distinction),
  representative_photo_asset_id (nullable), notes, logged_by_person_id,
  logged_at)
```

**Abundance is purely subjective** — the surveyor's own field judgment, no
auto-suggestion based on tag count. Kept simple deliberately.

## 5. Species identification

Both available: **AI-assisted suggestion from a photo (via the GBIF/
iNaturalist adapters already documented in `EXTERNAL_DATA_SOURCES.md`)**, with
the surveyor confirming or correcting — and **manual entry always works**
independent of whether AI suggestion is used. This is a straightforward
application of the AI Suggestion lifecycle (`AI_GOVERNANCE.md` §4) — species
ID suggestions are `pending` until confirmed, never auto-accepted as fact.

## 6. Notable specimens

```
core.specimen: add is_notable (boolean, default false),
  notable_reason_category [heritage_tree|rare_species|wood_source_candidate|other],
  notable_reason_notes (nullable)
```

Flagged in the moment by whoever's tagging, with a reason category required
(not just a bare toggle) — this connects directly to
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md`'s wood-sourcing use case:
`wood_source_candidate` as a notable-reason is the literal link between this
tool and that one, without building the full cross-reference machinery yet.

Only notable specimens get individual photos in the generated report (§9) —
routine specimens/species get one representative image at species level.

## 7. Coffee-specific fields (same wizard, additive)

Confirmed: same shared wizard, coffee adds optional fields rather than
requiring a separate build:

```
field_study.study: add coffee_canopy_cover_pct (nullable),
  coffee_shade_tree_ratio (nullable), coffee_soil_texture_note (nullable),
  coffee_pollinator_activity_note (nullable)
```

Exact final field list is a detail to confirm once the apiary version is
built and validated in real use — these four are the concrete starting set
based on what you described (biodiversity, environmental conditions,
nutrition impact on nano/micro-lot outcomes).

## 8. Field capture UX

- **Voice memos** — supported alongside photo/text notes, **auto-transcribed
  to text via AI** for searchability (audio retained alongside the
  transcript, not replaced by it — transcription is an assistive addition,
  consistent with `AI_GOVERNANCE.md` §1's allowed "assist data
  interpretation" capability, never treated as more authoritative than the
  original audio).
- **GPS pin correction** — when GPS is unreliable (real issue under dense
  canopy at these sites), the surveyor can manually adjust the pin on a map.
  **Explicit, named exception to the platform's general non-destructive
  rule**: the corrected pin overwrites the original reading; the original
  GPS coordinate is not retained. Reasoning, recorded here per `CLAUDE.md`
  §61(D)'s decision-logging requirement: a GPS accuracy correction is
  treated as a UI-level noise correction (closer to fixing a typo) rather
  than a revision to scientific evidence — distinct from how every other
  fact-bearing record in this system behaves, and worth remembering
  precisely because it's the exception, not the pattern.
- **Offline support** — draft-then-sync, same approach as the platform's
  general field-work offline capability. **Resolved**:
  `OFFLINE_FIELD_CAPABILITY.md` (written specifically because this section
  and `MAP_AND_TERRITORY.md` both independently needed offline support) now
  specifies this in full — PWA-based local drafting (§1-2), a real draft
  lifecycle (§3), versioned conflict resolution rather than silent overwrite
  (§4), storage-quota handling (§5), and sync behavior (§6) — superseding
  the earlier open question of whether this tool needed its own lighter
  local-draft mechanism pulled forward ahead of a general architecture.
  This tool's field capture forms use that mechanism directly, not a
  separate one.

## 9. Recurring studies

- Cadence: **both** — an initial baseline study, then lighter recurring
  seasonal/yearly check-ins at the same site.
- **Pre-populated confirmation checklist**: starting a new study at a site
  with prior Specimens automatically surfaces them as a "still here?"
  checklist — confirm present, or mark `status = removed` (reusing the
  status field already in `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §2). This
  avoids relying purely on GPS+photo matching to prevent duplicates on
  repeat visits, and gives the change-over-time reporting (§9 report spec)
  real data to work from.
- Diversity index is recalculated fresh per study visit, based on that
  visit's confirmed-active specimens/entries — historical studies' indices
  are not retroactively altered by a later visit's removals.
- **Reminders**: the platform notifies (via the existing `Notification`
  entity, `DOMAIN_MODEL.md` §5) when a site is "due" for its next recurring
  check-in, based on a configurable interval per site/study.

## 10. Diversity index

**Recommended and adopted: approximate Shannon diversity index (H')** — the
field standard in ecological/melissopalynological floral surveys, chosen
over simple species count (loses abundance-balance information) and over
Simpson's index (equally valid, Shannon is the more commonly referenced
default in this literature).

Explicitly labeled **approximate** in all output: Shannon's formula
technically wants precise proportional abundance; this implementation uses
the abundance category (rare/occasional/abundant) as a weighted proxy rather
than exact counts, since that's what's actually captured in the field. This
is a real, useful metric — not a precise scientific measurement — and is
presented that way everywhere it appears, consistent with the platform's
provenance discipline (`provenance_class = 'interpretation'`, not
`measured_fact`).

## 11. Report generation

- Every completed study can generate a **branded PDF report** — same visual
  identity as other Néctar Nómada documents (warm coffee-brown #6B4226,
  Calibri, ruled letterhead).
- **Contents**: species/specimen inventory, abundance summary, approximate
  diversity index (clearly labeled as such), a **map visualization** of
  entry/specimen locations, and — for recurring studies — a **change-over-
  time section** (new species/specimens since the last study at this site,
  species/specimens no longer observed).
- **Photos**: individual specimen photos included only for `is_notable`
  specimens; routine entries get one representative photo per species.
- **Classification**: starts `internal` (or `draft`), same human-promotion
  discipline as every other content type in this system — could become
  public Story content later (e.g. showcasing an apiary's biodiversity), but
  never auto-published.
- **Raw data export**: study data (species list, abundance, specimens) is
  also exportable as CSV/Excel, separate from the formatted PDF — useful for
  your own further analysis outside the platform.

## 12. Environmental context

Weather auto-attachment is **optional, not automatic** — available to pull
in for a study session's date/location (via the Weather API adapter already
specified in `INTEGRATIONS.md` §2), but not forced onto every session by
default.

## 13. Access and RBAC

Both internal team and external partners (e.g. Luis at Kiva Estate) can
perform studies — no approval gate before a study counts as complete. This
follows the same Assignment/Scope pattern already established in
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §7 for client apiary sites: a
partner's study at their own site is visible to them and to Néctar Nómada
staff with a matching Project-scoped Assignment, not to other partners.

## 14. Sequencing

This is a substantial feature — genuinely more than a single vertical slice.
Reasonable placement: after Specimen tracking is proven (per
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §9's own sequencing, alongside
Slice 5/Partner Workspace), this Guided Field Study Tool follows as its own
focused effort, reusing that Specimen groundwork rather than rebuilding it.
Coffee-specific fields (§7) ship in the same build, not as a later add-on.

Log as accepted domain-model input in `DECISIONS.md` when this is added to
the repo, same pattern as every other planning document — not an immediate
build order.
