# Farm-to-Green Reference Package — v2 (2 Oct 2026)

Reference and master data for the coffee app: farm management, processing, wet/dry mill infrastructure and Panama localization. Built for Claude Code (`00_CLAUDE_CODE_PROMPT.md`) and for people reviewing the domain.

## Files

| File | What it is |
|---|---|
| `00_CLAUDE_CODE_PROMPT.md` | Prompt to paste into Claude Code (audit → plan → implement → verify) |
| `01_DOMAIN_REFERENCE.md` | Digest of the original VNT article — **coverage map only** (v1 numbers superseded) |
| `02_ACTIVITY_TAXONOMY.md` | 40 coded field activities in 4 classes, with v2 corrections banner |
| `03_MODULE_MAP_AND_REQUIREMENTS.md` | Capability matrix A1–A48, data model, KPIs, validation rules |
| `04_reference_parameters.json` | 208 sourced parameters (+15 deprecated v1 keys), authority profiles, Panama templates |
| `05_EVIDENCE_STUDY.md` | What authoritative sources say; corrections v1 → v2; conflicts; open items |
| `06_PROCESSING_TAXONOMY.md` | Every processing method (115), 9-axis classification, synonym clusters, protocol model |
| `07_MILL_INFRASTRUCTURE_AND_MASTER_DATA.md` | Wet mill, fermenters, drying, storage, dry mill, lab, wastewater; variables; asset model |
| `08_PANAMA_ANNEX.md` | Regions, calendar, law (buffers, wastewater, pesticides, labour), units, export, EUDR |
| `09_PROCESS_MANAGEMENT_COCKPIT.md` | Home-page cockpit spec: clocks, routing engine, capacity 14 d, mix vs target, alerts, UX quality bar |
| `mockup/` | Three concept screens (Inicio, Ruteo, Lote) as visual/behavioural reference |
| `master_data/processing_axes.json` | Axes A–K, 23 step types, families |
| `master_data/processing_methods.json` | 115 methods with axis encodings, synonym clusters, guide cross-check |
| `master_data/mill_assets.json` | 91 installation catalog entries + 26 equipment types with attributes and maintenance |
| `master_data/variables.json` | 84 measurement variables (unit, instrument, step, frequency, reference, source, confidence) |
| `master_data/agronomy_catalogs.json` | 13 organisms with IPM profiles; 25 varieties; units |
| `master_data/activity_types.json` | 40 activity types seeded from 02 |
| `research/R0–R7` | Source inventory and seven full research reports with URLs |

## What changed from v1
- Every v1 number checked against institutes, standards, law and literature (R1–R5). 15 v1 keys deprecated, ~20 corrected, ~150 added.
- New: complete processing taxonomy (R6 + the Routes, 1Zpresso and Font Mag guides).
- New: mill infrastructure and instrumentation master data (R7).
- New: Panama legal and administrative layer; EUDR; certifications as dated data.

## Confidence
`high` = law, standard, institute or peer-reviewed source read directly · `medium` = single study, vendor or consistent practice · `low` = vendor/secondary/inferred. `NN` = Néctar Nómada addition — verify. References warn; only safety and law may block.
