# Updating Three Existing Docs with Real Honey/Mead Content — Instructions

Covers **updates** to three documents already in your repo, not new
additions: `BEVERAGE_SENSORY_PROTOCOLS.md` (honey and mead sections
substantially expanded with real competition/defect/field-data/
classification content), `COMPETITIONS.md` (small addition confirming
honey/mead have real scoring content, not just placeholder categories),
`TOURISM_EXPERIENCES.md` (a new §13 documenting your real mead-making
course as a worked example, renumbering old §13 Sequencing to §14).

## Step 1 — Check current status, confirm nothing conflicts

Standard discipline. Given these three files were already processed in
earlier sessions, specifically confirm: has anything been built yet that
depends on the *old* section numbering in `TOURISM_EXPERIENCES.md`
(old §13 Sequencing is now §14)? If any other document cites
`TOURISM_EXPERIENCES.md §13` expecting Sequencing content, that citation
needs updating too — check before assuming it's clean.

## Step 2 — Place the updated files (overwrite)

```
docs/architecture/BEVERAGE_SENSORY_PROTOCOLS.md
docs/architecture/COMPETITIONS.md
docs/architecture/TOURISM_EXPERIENCES.md
```

```bash
git add docs/architecture/BEVERAGE_SENSORY_PROTOCOLS.md \
        docs/architecture/COMPETITIONS.md \
        docs/architecture/TOURISM_EXPERIENCES.md
git commit -m "Expand honey/mead sensory content with real competition rubric, defects taxonomy, field-intake schema, AESHI mead classification; document real mead course as worked example"
```

## Step 3 — Hand Claude Code the prompt

```
I've updated three existing documents with real content received directly
(not researched) — honey/mead sensory training materials, a real
competition scoring rubric, a real field-sample dataset, and a real AESHI
(Spanish mead association) regulatory manual.

Read all three updated files fully, then specifically verify:

1. BEVERAGE_SENSORY_PROTOCOLS.md's new honey competition rubric (§3, 100-pt
   scale) and mead classification (§3, sweetness/raw-material/carbonation
   taxonomy) — confirm these integrate cleanly with the existing
   sensory.protocol / sensory.honey_competition_score / mead.style_
   classification schema shapes without conflicting with anything already
   implemented for coffee/beer.
2. The new apiary.field_sample schema (honey intake) — check whether this
   overlaps with or should reuse anything already in
   SPECIMEN_AND_MATERIAL_TRACEABILITY.md's Specimen/SpecimenObservation
   entities, particularly the predominant_flora field (candidate for
   Specimen linkage, noted explicitly in the doc) and the pollen_analysis
   field (the actual verification data for the "conformity mode" already
   specified in BEVERAGE_SENSORY_PROTOCOLS.md's honey section). Do not
   silently merge these schemas — flag the relationship and let me decide
   how tightly coupled they should be.
3. COMPETITIONS.md's updated example section — no schema change here, just
   confirm the honey/mead scoring content it now references actually
   exists in the updated BEVERAGE_SENSORY_PROTOCOLS.md.
4. TOURISM_EXPERIENCES.md's renumbering (old §13 Sequencing → new §14) —
   per Step 1, confirm no other document's citations broke.
5. Copyright boundary check, specifically: confirm nothing from
   BEVERAGE_SENSORY_PROTOCOLS.md's new mead content reproduces or closely
   paraphrases BJCP's 2015 Mead Guidelines — the document explicitly
   excludes AESHI's Chapter IV (organoleptic properties) for exactly this
   reason; verify that exclusion was actually respected in what's now
   written, not just stated as an intention.

This remains planning-doc content — do not implement schema/migrations
yet, this is Slice 6 (Sensory)/Competitions-phase scope per existing
sequencing. Log the update in DECISIONS.md as an amendment to the existing
ADR entries for these three documents (reference the original ADR numbers
if you can find them), not a fresh acceptance entry.

Stop after verification and report back, especially on items 2 and 5.
```

## Why item 5 gets special attention

This is the one item worth being genuinely careful about, not just
procedural. The whole point of excluding AESHI's BJCP-sourced chapter was
to keep the platform's copyright discipline intact — worth an explicit
verification pass rather than trusting that the boundary was drawn
correctly just because it was *intended* to be.
