# Adding the Media Intelligence Pipeline Doc — Instructions + Prompt

## Step 1 — Place the file

Copy `MEDIA_INTELLIGENCE_PIPELINE.md` into your project at:

```
docs/architecture/MEDIA_INTELLIGENCE_PIPELINE.md
```

## Step 2 — Commit it on its own

```bash
git add docs/architecture/MEDIA_INTELLIGENCE_PIPELINE.md
git commit -m "Add media intelligence pipeline architecture (Google Drive ingestion + AI-assisted content generation)"
```

## Step 3 — Check Slice 1 status before doing anything else

This document has zero urgency — it's Slice 7+ territory. Do not paste the
Step 4 prompt below into an active Claude Code session that's still mid-way
through Slice 1 (Identity) work. Wait for a clean stopping point: Slice 1
finished and committed, or at minimum no uncommitted work in progress.

## Step 4 — Hand it to Claude Code (once Slice 1 is at a clean stopping point)

```
I've added docs/architecture/MEDIA_INTELLIGENCE_PIPELINE.md — it extends the
Asset model (DOMAIN_MODEL.md §3), object storage conventions
(DATA_ARCHITECTURE.md §5), and the AI Suggestion lifecycle
(AI_GOVERNANCE.md) to cover non-destructive ingestion of existing brand/
expedition media from Google Drive, plus AI-assisted content generation
(marketing copy, storytelling, composited imagery) from that material.

Do NOT implement any of this now — it's sequenced for Slice 7 (AI) and
beyond per its own §6, well after current work.

Instead:

1. Read the full document, including §5 (credential approach: the platform
   authenticates as danieljosegiraldez@gmail.com, which now has the brand
   Drive's relevant folders shared into it, rather than a separate
   nectarnomada@gmail.com credential) and §5a (confirmed unorganized legacy
   content — the ingestion design assumes messy input, not clean folders).
2. Confirm the approach in §2-3 (Phase A ingestion, Phase B AI-assisted
   generation, both reusing existing Asset/AI Suggestion patterns) doesn't
   conflict with anything already decided in DOMAIN_MODEL.md or
   AI_GOVERNANCE.md — flag any conflict rather than silently reconciling it.
3. Log acceptance of this document in DECISIONS.md, same pattern as
   EXTERNAL_DATA_SOURCES.md: accepted as planning input now, implementation
   deferred to Slice 7+, not an immediate build order.

Stop after these three items and summarize what you found.
```

## Why this sequencing

Same reasoning as the external data sources doc: this is real, valuable
planning work that shouldn't get lost, but it doesn't compete with what
Claude Code is actively building. Filing it now (read, cross-check, log)
means it's ready and uncontested when Slice 7 actually comes up — you won't
be re-deriving these decisions months from now with less context than you
have today.

## What's NOT in this step

This does not start the Phase A ingestion job, does not touch Google Drive
programmatically from the platform side, and does not require you to
reorganize anything in Drive first. All of that is real future work — this
step is purely "get the plan into the repo and cross-checked."
