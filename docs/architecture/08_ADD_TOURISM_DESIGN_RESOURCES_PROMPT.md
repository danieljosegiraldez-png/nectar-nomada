# Adding Tourism Design Resources — Instructions + Prompt

Covers two files: an **update** to `TOURISM_EXPERIENCES.md` (§10 extended
with episode-based design, grounded in SERNATUR's official methodology) and
a **new** file, `TOURISM_DESIGN_RESOURCES.md` (a real partner-facing
resource library, not just internal guidance).

## Step 1 — Check current status first

Same discipline as always. One thing worth confirming specifically: per the
last status check, Slice 4's gastro-tourism extensions (including the
original `pairing_course` structure) were **not yet built** — only
core-slice booking mechanics were. Confirm this is still accurate before
proceeding, since if `pairing_course` has since been implemented in actual
schema, the §10 rename/extension below would need to be a real migration,
not just a planning-doc update.

## Step 2 — Place the files

```
docs/architecture/TOURISM_EXPERIENCES.md    (overwrite — updated §10)
docs/architecture/TOURISM_DESIGN_RESOURCES.md   (new)
```

```bash
git add docs/architecture/TOURISM_EXPERIENCES.md docs/architecture/TOURISM_DESIGN_RESOURCES.md
git commit -m "Extend Tourism Experiences with episode-based design (SERNATUR methodology); add partner-facing Tourism Design Resources library"
```

## Step 3 — Hand Claude Code the prompt

```
I've updated docs/architecture/TOURISM_EXPERIENCES.md (§10 only — pairing
courses are now generalized to "episodes," grounded in Chile's official
SERNATUR tourism design methodology: episode sequencing, nuclear vs.
auxiliary actions, dramatic-curve pacing, five structuring elements) and
added a new docs/architecture/TOURISM_DESIGN_RESOURCES.md — a real,
partner-facing resource library teaching this same methodology through
Partner Workspace, not just internal guidance.

First, confirm: has core.experience_pairing_course (or any equivalent)
actually been implemented in schema/migrations yet? Per the last status
check it should not have been (Slice 4's gastro-tourism extensions were
listed as not-yet-built planning input), but confirm directly against the
real migration history before proceeding — if it has been implemented,
flag this as needing a real migration rather than a documentation-only
update, and stop for my input before doing anything further.

Assuming it has NOT been implemented yet (the expected case):

1. Read both documents fully.
2. Confirm the generalized episode structure in TOURISM_EXPERIENCES.md §10
   doesn't conflict with anything else already specified for the
   Experiences module.
3. Confirm TOURISM_DESIGN_RESOURCES.md's content-rendering approach
   (reusing Story & Knowledge Engine, DOMAIN_MODEL.md §4) is compatible
   with how that engine is currently specified — flag if a resource
   library has different enough needs (e.g., structured exercise/
   deliverable tracking per resources.tourism_design_exercise) that it
   needs its own lighter content type rather than fully reusing Story's
   model.
4. Note in DECISIONS.md: TOURISM_DESIGN_RESOURCES.md §2c flags a real,
   available future opportunity (cross-producer "beer/craft routes"
   rendered on the map, extending MAP_AND_TERRITORY.md's existing route
   capability) that is explicitly NOT being built now — log it as a named
   future option, not implemented, so it doesn't get lost or accidentally
   assumed into scope later.

This is Slice 4 (Experiences, extension) and Slice 5 (Partner Workspace,
for the resource library's access model) territory — standard
planning-doc discipline: do not implement, cross-check, log acceptance in
DECISIONS.md.

Stop after cross-checking and summarize what you found, especially item 3
(whether the resource library needs its own content type) and confirmation
on the migration-safety question from the start of this prompt.
```

## Why the migration-safety check comes first

This is the one document in the recent batch where "is anything already
built against the old structure" is a real, checkable risk, not just
caution for its own sake — `pairing_course` was a real, named table in the
original `TOURISM_EXPERIENCES.md`, and Slice 4 is genuinely live in
production. Worth confirming before anything else happens here.
