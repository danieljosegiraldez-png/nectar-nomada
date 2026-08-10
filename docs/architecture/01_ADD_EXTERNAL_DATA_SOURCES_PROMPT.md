# Adding External Data Sources to the Repo — Instructions + Prompt

## Step 1 — Place the file

Copy `NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md` into your project at:

```
docs/architecture/EXTERNAL_DATA_SOURCES.md
```

## Step 2 — Commit it on its own

Keep this as a separate commit from any in-progress Slice 1 work, so it's
easy to identify in history:

```bash
git add docs/architecture/EXTERNAL_DATA_SOURCES.md
git commit -m "Add external data source research inventory (via ChatGPT research pass)"
```

## Step 3 — Hand it to Claude Code (paste into your active session)

This is scoped as a read-and-integrate task — it does **not** ask Claude Code
to implement anything, and does not interrupt Slice 1 (Identity) work:

```
I've added docs/architecture/EXTERNAL_DATA_SOURCES.md — an external data
source research inventory covering weather, satellite/remote sensing,
biodiversity, soil, hydrology, air quality, commodity markets, tourism,
Panama government open data, certification bodies, stock imagery, and
research/scientific metadata APIs. It includes licensing warnings, a
provenance schema, an adapter architecture proposal, and a P0/P1/P2 priority
roadmap. It ends with explicit instructions addressed to you.

Do NOT implement any of these integrations now — Slice 1 (Identity) is still
in progress and takes priority.

Instead:

1. Read the full document.
2. Add a short pointer section to INTEGRATIONS.md referencing this file as
   the source of truth for future external-data adapters, rather than
   duplicating its content there.
3. Confirm the ExternalProvider / ExternalDataset / ExternalObservation /
   ExternalImportJob entity family it proposes (§25) is compatible with the
   canonical entity layer and provenance model already defined in
   DOMAIN_MODEL.md and DATA_ARCHITECTURE.md — flag any conflict rather than
   silently reconciling it.
4. Log this as a new entry in DECISIONS.md: external data integration is
   deferred until after Slice 1 (and likely several slices after that, since
   Environmental Data isn't scheduled until later in MVP_ROADMAP.md) — this
   document is accepted now as a planning artifact, not a build order.

Stop after these four items and summarize what you found, especially any
compatibility conflict in item 3.
```

## Why this sequencing

The data-source document explicitly says not to implement every provider
(§26, §28) and proposes its own vertical-slice-style rollout once the time
comes (one REST provider, one Panama CKAN/OGC provider, one
scientific/raster provider, one biodiversity provider — as proof-of-
architecture, not a implementation of the whole list). That rollout belongs
inside your `MVP_ROADMAP.md`'s Environmental Data work, which is scheduled
well after Slice 1. Filing it now — read, cross-check, log — keeps the
research from getting lost without derailing what Claude Code is currently
building.
