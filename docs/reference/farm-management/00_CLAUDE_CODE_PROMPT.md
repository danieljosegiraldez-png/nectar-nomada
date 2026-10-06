# Claude Code Prompt — Néctar Nómada OS: Coffee Farm & Beneficio Module (v2.1)

> Put this whole folder at `docs/reference/farm-management/` in the repo, then paste everything below the line into Claude Code from the repo root.

---

## Role
You are a senior engineer, product designer and coffee agronomy / post-harvest domain analyst working on the **Néctar Nómada platform (OS)** — specifically its **coffee farm & beneficio module**. Your job: audit the app against the reference package in `docs/reference/farm-management/`, report gaps, and implement approved additions so the app covers the **whole cycle** — site → nursery → establishment → canopy → soil/leaf/IPM → phenology → harvest → **processing protocols** → **wet mill, fermentation, drying, storage, dry mill installations and instruments** → grading/cupping → labour/costs/sales → certification/EUDR → KPIs — with Panama localization. **Top priority is the beneficio manager's experience: the process-management cockpit (`09`) becomes the module's home page, and the module's UX must improve radically** — faster to read, faster to capture, impossible to miss what matters.

## Reference package (read in this order before touching code)
1. `README.md` — index and what changed v1 → v2.
2. `05_EVIDENCE_STUDY.md` — **authoritative corrections**. Where 01/02 disagree with 04/05/08, 04/05/08 win.
3. `04_reference_parameters.json` — 208 parameters with `source`, `confidence`, `profile`, `alt`, `legal`; plus `deprecated_keys` and Panama templates.
4. `06_PROCESSING_TAXONOMY.md` + `master_data/processing_axes.json` + `master_data/processing_methods.json` — 9-axis model, 23 step types, 115 named methods, 13 synonym clusters, protocol/disclosure data model.
5. `07_MILL_INFRASTRUCTURE_AND_MASTER_DATA.md` + `master_data/mill_assets.json` + `master_data/variables.json` — ≈ 90 installation types, 84 variables, asset/instrument/calibration/allocation data model, capability checks.
6. `08_PANAMA_ANNEX.md` — regions, calendar templates, Ley 1/1994 buffers, COPANIT 35-2019, pesticide bans, wages/age rules, units, export, EUDR.
7. `master_data/agronomy_catalogs.json` — 13 organisms with authority-profile thresholds and sampling, 25 varieties with dated rust status, units.
8. `master_data/activity_types.json` + `02_ACTIVITY_TAXONOMY.md` — 40 coded field activities (with v2 corrections banner).
9. `03_MODULE_MAP_AND_REQUIREMENTS.md` — capability matrix A1–A48, candidate data model, KPIs, validation rules (with severities), out of scope.
10. `01_DOMAIN_REFERENCE.md` — original vendor article digest (coverage map only).
11. `research/R1–R7` — full evidence with URLs. Consult when a value's basis matters.
12. **`09_PROCESS_MANAGEMENT_COCKPIT.md`** — home-page cockpit spec from the manager interview: clocks, routing engine, 14-day capacity, mix vs target (green-equivalent), stage models per process, alert tiers & escalation, lot genealogy & ownership (own / bought / multi-farm / toll), UX quality bar (§12), screens still to design (§13).
13. **`mockup/`** — three `.dc.html` screens (Inicio, Ruteo, Lote) from the approved concept, with invented demo data. They are a **visual and behavioural reference**, not code to copy: rebuild them with the platform's own stack and components.

## Before reading code — this repo's rules come first
1. Follow `CLAUDE.md` exactly as it says to start: read `SESSION_STATE.md`, run `bash scripts/open-decisions.sh`, and bring me any open decisions **before proposing work**.
2. **This package is reference input, not a normative spec.** Precedence in this repo (from `docs/beneficio/README.md`): `CLAUDE.md` + house rules → `docs/beneficio/00_conventions.md` → **`03_public_api.md` (the naming contract)** → `00_reglas_del_modulo.md` → engines `10`–`13` → `20`–`22` rubrics → *then* this package. When this package and a normative doc disagree, the normative doc wins; list the disagreement for me instead of changing either.
3. **Names come from `03_public_api.md`.** Map every entity, enum, field and state proposed here (protocol steps, axes, assets, variables, alerts…) onto existing names. If something has no declared name, **stop and ask**; never invent it.
4. **Decisions already taken that this package must fit:** ADR-181 (coffee thresholds come from the **recipe/protocol**; the `00 §8` profiles are templates — this package's `04` values are references, never thresholds); ADR-053 (anaerobic is a **condition, not a process** — matches this package's axis model, use it to resolve the PE-77/78 profile issue); calibration is verified **by contrast against a standard, not by calendar** (`02_calibration §3`); lot codes follow Daniel's convention (`PE-90` → `PE-90-A`, `lib/traceability/codigosDerivados.ts`) — the mockup's `L-0407` style is placeholder only. `[PROVISIONAL]` items in `docs/beneficio` are Daniel's to close.
5. **Three rubrics weigh equally**: functional, veracity (`21` — every figure must be decomposable to its source) and pedagogical (`22` — the operator must ferment better, not just record more). The cockpit must pass all three. Read `docs/arquitectura/propuesta-ux-campo.md` and reconcile it with `09` before designing anything; where they differ, list it for me.
6. **Git hygiene:** other sessions work in this repo. Never `git add -A`/`git add .`; stage files by explicit path. Work on a branch; never commit to `main`.
7. The **separate coffee-only program** (another repo) is out of scope unless I approve consulting it.
8. Respect platform-wide decisions already recorded in this repo, including: the **field capture pattern** (checklist + protocol data + observations/actions in the field; completion off-field); **notifications** — each person picks their channel (WhatsApp, email, app push, Google Calendar) **and every action and alert is also logged to the registered Néctar Nómada WhatsApp**; **client reports** are a web page with a link plus on-demand PDF from a defined template, not stored beforehand. If the repo's records differ from this summary, the repo wins — flag the difference.

## Non-negotiable rules
1. **No hard-coded agronomic or processing thresholds.** Seed the registry from `04`; override order **protocol → block → farm → tenant → authority profile → reference default**.
2. **Authority profiles** resolve institutional disagreements (Cenicafé vs Anacafé vs Codex/ISO/SCA…). Never pick one silently.
3. **Processing thresholds stay per protocol step.** Generic washed values apply only to the generic fallback. Add a test proving they never apply to CryoBloom, inoculated or other custom protocols.
4. **Protocols = ordered steps with axis vectors** (A–I) from `processing_axes.json`. Method names are labels/aliases. Lactic/acetic/malic are target outcomes needing measured data.
5. **Protocols declare capabilities; runs allocate real assets.** Headspace, layer depth, load and airflow are derived from the allocation.
6. **Every measurement** links to lot + step + asset allocation + instrument/sensor position, stores method and sample temperature where relevant, and gets `calibration_state` at write time.
7. **Never present references as facts or recommendations.** UI shows "reference · source · confidence"; `low` and `NN` visibly flagged. Never recommend products or doses.
8. **Block only for safety and law** (vessel over-pressure, prohibited pesticides, legal riparian buffers, child-labour rules, PHI, mandatory agrochemical fields, EUDR geometry for EU packs, strip-pick merge without override). Everything else warns.
9. **Regulatory and market data are versioned by effective date** (wage tables, pesticide lists, certification standards, Fairtrade prices, competition rules).
10. **Field capture pattern:** in field only checklist + protocol-required data + observations/actions (photo, audio/video, GPS, practical AI). Completion and reports off-field. Fast for trained users.
11. **Bilingual es/en** with Spanish field vocabulary first-class.
12. Follow existing conventions (migrations, ADR format, tests, ticket naming). Migrations additive and reversible. Never touch production data. Don't refactor unrelated code.
13. **The UX quality bar is a requirement, not polish** (`09 §12`): phone-first, 5-second glance, red issues above the fold, sunlight-legible contrast, ≥ 44 px targets, one-hand capture, every alert states action + deadline + owner, explicit empty/loading/offline/error states, Spanish-first copy with field vocabulary.

## Phase 1 — Audit (read-only)
Produce `docs/reference/farm-management/AUDIT_<date>.md`:
- Capability matrix A1–A48 (`03 §A`) with Status (exists / partial / missing / n/a) and evidence (files, models, routes).
- Map the 40 activity codes, 23 processing step types, and the asset/instrument model to existing entities, or "missing".
- Encode the app's **existing protocols** (washed, natural, honey, CryoBloom A/B/C, SafCoffee lots, any others) as axis-vector step sequences and list what the current schema cannot express.
- List every hard-coded threshold or global processing rule found, with file/line.
- Conflicts between this package and current code/ADRs.
- Risks: changes touching traceability, mass balance, existing protocols, or live data.
- **UX audit of the current beneficio screens** against `09 §12` and the mockup: route list or screenshots; what a manager can and can't see in 5 seconds; taps counted for the common tasks (reception, fermentation reading, moisture reading, routing a lot); missing states (empty / loading / offline / error).
**Stop and present a summary.**

## Phase 2 — Plan (after my approval)
Write `ADR-XXXX Farm-to-green reference integration` and a ticket list. Suggested priority:
- **P0 (UX slice first):** the cockpit home — H1 status, H2 clocks, H3 routing inbox — on real data, with stage models per process and alert tiers; plus parameter registry + authority profiles + provenance UI; protocol step/axis model (+ migration of existing protocols); facility/asset/instrument/sensor/calibration model; MeasurementRecord linkage; phenology events + GDD.
- **P1:** IPM (organisms, profiles, DAF-gated scouting, effectiveness); agrochemical register with Panama/RA status; harvest passes & ripeness; drying/storage records with derived values; capability checks; disclosure block + ruleset checks; inoculum inventory.
- **P2:** variety catalog; soil/leaf analyses with profiles; nutrition (oxide basis); canopy/renovation tracker; labour with Panama wage/age rules; costs; sales (STG, C price, Fairtrade lookup); green grading & CVA cupping; mass balance; KPI dashboard.
- **P3:** wastewater & water authorizations (COPANIT limit set); EUDR plot rules & DDS export; EPCIS trace events; certification as versioned data; carbon ledger; export checklist; advisories; nursery; conservation/buffers GIS.
Each ticket: scope, schema delta, acceptance criteria, tests, rollback, reference sections. **Stop and present the plan.**

## Phase 3 — Implement (ticket by ticket, after approval)
- Seed `ReferenceParameter` from `04` exactly (keep source, confidence, profile, alt, legal, deprecated). Seed `Variable` from `variables.json`, asset types and attribute schemas from `mill_assets.json` / `07 §4`, organisms/varieties/units from `agronomy_catalogs.json`, activity types from `activity_types.json`, axes/step types/methods from `processing_*.json`.
- KPIs as computed queries/views (`03 §C`); validation rules with severities (`03 §D`).
- Tests: unit (density from spacing, GDD harvest estimate, headspace/layer/Gravimet derivations, moisture normalisation, KPIs, CVA formula *flagged unverified*), integration (override + profile resolution, protocol isolation, calibration state, capability checks, legal blocks), seed tests (every parameter has source + confidence; every method maps to valid axis values).
- After each ticket: update `CLAUDE.md`/specs, record in the decision log, report what changed, what was verified, what remains.

## Phase 4 — Verify
Run full tests + type-check. Walk two end-to-end scenarios with realistic data:
1. **Field → green:** block profile → flowering event → generated calendar → CBB scouting above Cenicafé threshold at 130 DAF → intervention + follow-up → harvest passes with ripeness check → green grading → CVA cupping → KPIs.
2. **CryoBloom B run:** cold room allocation (9–12 °C, mass core probe) → bioprotection dose → pulping → naked bed 24 h with Sunrise Orange (rehydration logged) → washing (L/kg cps) → raised-bed drying with calibrated meter, aw + temperature → reposo → disclosure block showing BoP eligibility "unknown" pending ruling.
Report results and anything not implemented, with reasons.

## Do not
- Build recommendation engines or suggest products.
- Use case studies or auction prices as benchmarks.
- Claim certification or competition compliance — readiness/eligibility flags only.
- Invent values where the package says `null`, "pending verification", or "user-configured".
- Convert cupping scores between scoring systems.

## Open questions to raise with me (don't guess)
1. Default authority profile per site (Cenicafé vs Anacafé vs custom).
2. Shade target default per production system on our farms.
3. BoP/CoE 2026 rulings on SafCoffee inoculation, *M. pulcherrima* bioprotection, enzymes, own-coffee must — I will ask SCAP.
4. Our own meanings for house process names (e.g. "hybrid washed", "lactic", "malic") so they map to axis vectors.
5. Whether nursery, labour/payroll, wastewater and export modules are in scope for the commercial product.
6. The real installations to register first (Cafelino, Las Nubes Cerro Azul, Boquete sites) and their instruments.
