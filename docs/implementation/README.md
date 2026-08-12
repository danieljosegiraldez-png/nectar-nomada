# Prompt Series — index and status

Numbered instruction files for Claude Code sessions. Each is a self-contained
task: read it, do what it says, stop where it says to stop.

**These are not architecture documents.** Architecture lives in
`docs/architecture/` and describes the system as it is designed. These files
instruct a session and go stale the moment they run. Do not cite a prompt file
as authority for how the platform works — cite `DECISIONS.md` or the relevant
architecture document.

**Executing these:** name the specific file. Do not point a session at this
folder and let it choose — several are v2, gated, or superseded, and it will
run them.

**Every session that runs a prompt file must update that file's own entry in
this README before finishing** — status, evidence, and anything left
incomplete. This index has gone stale before (see the 2026-08-12 audit that
produced this revision); the fix is procedural, not a one-time correction.

**Status vocabulary:** RUN (executed, complete) · PARTIAL (some of it landed,
see note) · SUPERSEDED (a later decision overrode it) · PENDING (not yet run)
· BLOCKED (cannot run, see note) · V2 (deliberately after v1).

---

## Where things stand

*(Last verified against repository evidence — commits, files, schema, code —
2026-08-12, in a read-only audit of every file in this series against its
actual output. See that audit's findings folded in below and throughout this
document; nothing here is from session memory alone.)*

Platform v1 is defined by a falsifiable test (ADR-039): *can the platform
carry one real 2026 harvest from cherry through to a cupping score and a lot
report that could be sent to a client?*

Phase 1 tickets T1–T10, T9.5, T12, T12.5, T12.6, and T13 are all built.
**Only T14 remains** — the full coffee end-to-end test plus DEMO seed
(`PHASE_1_TECHNICAL_EXECUTION_PLAN.md` confirms T14 is the one ticket row
without a DONE marker). T11 (deviation tracking) is deferred to v1.1, not
cancelled.

**Apiary now has its own, parallel v1 test**, scoped in
`22_APIARY_V1_SCOPING_REPORT.md` and revised in
`24_APIARY_SCOPING_REVISION_PROMPT.md`: *can the platform carry one apiary
through a season of inspections to a honey batch with a sensory result?*
The scope is settled — tickets **A0** (offline base mechanism) through **A8**
(DEMO seed + E2E test) — but **none of A0–A8 is built yet**, and the ADR
amendment justifying apiary's v1 inclusion is still a draft sitting inside
the scoping report, not yet appended to `DECISIONS.md` (unlike ADR-044,
T12.6's own amendment, which is appended). A0 is flagged in its own scoping
as the largest unknown in the whole set — no service worker/PWA mechanism
exists anywhere in this codebase yet, which is why `25_` (not yet written)
exists: scope the offline options before A0 is committed to.

ADR-039 carries a clause worth repeating here: these tickets build the
*capability* to carry a harvest end to end. They do not constitute having
done so. A truthful "yes" on the v1 test needs a real harvest entered by a
real operator once T14 ships — and, for apiary, a real season actually
inspected by Kenneth once A0–A8 ship.

---

## The series

### Run

| File | Purpose |
|---|---|
| `00_FIRST_SESSION_PROMPT.md` | Bootstrapped the nine architecture docs |
| `01_ADD_EXTERNAL_DATA_SOURCES_PROMPT.md` | **PARTIAL.** The input was filed, but not as instructed: it landed under its original name (`NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md`, not the short `EXTERNAL_DATA_SOURCES.md` the prompt names) and inside Slice 1's own commit rather than its own commit as Step 2 required. The derived architecture doc exists under a third name, `EXTERNAL_DATA_ARCHITECTURE.md`. Content-complete; the filename/commit discipline the prompt asked for was not followed. |
| `02_ADD_MEDIA_PIPELINE_PROMPT.md` | Filed the media intelligence pipeline |
| `03_CRYOBLOOM_PUBLIC_CONTENT_PROMPT.md` | **SUPERSEDED by ADR-024.** `prisma/seed.ts` explicitly excludes CryoBloom from seed content — a real, ongoing research program is treated as too sensitive for even placeholder copy, the platform's own scientific-integrity principle applied to itself. Not an oversight; a later, opposite decision. |
| `04_ADD_REMAINING_PLANNING_DOCS_PROMPT.md` | Five planning docs; research-criteria review checklist |
| `05_ADD_SENSORY_PROTOCOLS_PROMPT.md` | Beverage sensory protocols and panel calibration |
| `06_ADD_COMPETITIONS_PROMPT.md` | Competitions operational layer, category-agnostic |
| `07_GAP_ANALYSIS_PROMPT.md` | Produced `GAP_ANALYSIS_2026-08-10.md` |
| `08_ADD_TOURISM_DESIGN_RESOURCES_PROMPT.md` | Episode design + partner resource library |
| `09_ADD_BRAND_MARKETING_PROMPT.md` | **PARTIAL.** Filed the raw input (and its corrected version, commit `c913595`) — but the prompt's own actual deliverable, `docs/architecture/BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md`, was never produced. Still listed under "Not yet written" below. |
| `10_POST_GAP_ANALYSIS_CLEANUP_PROMPT.md` | Ten mechanical fixes from the gap analysis |
| `11_UPDATE_HONEY_MEAD_CONTENT_PROMPT.md` | Real honey/mead content (commit `4080633`) |
| `12_VERIFICATION_PASS_PROMPT.md` | Verified Phase 1 lot model, T5 lineage, honey/mead copyright. **Came back clean** |
| `13_DEFINE_PLATFORM_V1_PROMPT.md` | Produced ADR-039, the v1 definition |
| `14_T9.5_PROVENANCE_RETROFIT_PROMPT_REVISED.md` | Removed the silent `direct_observation` default (ADR-038) |
| `15_DOCUMENTATION_CORRECTION_PASS_PROMPT.md` | Honey rubric rebuilt as original + attribution corrected; citation fixes; ADR-041/042 |
| `19_ADR_RECONCILIATION_AND_T13_AMENDMENTS.md` | Parts A and B landed in commits `ecdb45a` and `3c6d9eb`. **Part C (media readiness) is now closed, not open** — its recommendation was adopted: `21_T12.5_MEDIA_ATTACHMENT_PROMPT.md` and the T12.5 build that followed are exactly the consequence Part C asked to evaluate. No separate Part-C report file exists; the decision is evidenced by what it produced. |
| `20_CAPTURE_OR_LOSE_IT_PROMPT.md` | Produced `20_CAPTURE_OR_LOSE_IT_REPORT.md` (commit `fcc95e1`) and was then implemented as **T12.6** (commit `0e849c0`) — schema, `lib/traceability/operations.ts`, ADR-044 |
| `21_T12.5_MEDIA_ATTACHMENT_PROMPT.md` | Implemented as **T12.5** (commit `4ec5316`) — schema, `lib/traceability/media.ts`, UI, ADR-043 |
| `22_APIARY_V1_SCOPING_PROMPT.md` | Produced `22_APIARY_V1_SCOPING_REPORT.md` — apiary's v1 boundary, A1-A8 ticket breakdown, draft ADR amendment. *(Uncommitted — on disk, `git status` shows it untracked.)* |
| `23_RECIPES_FORMULATION_DISTILLATION_PROMPT.md` | Produced `docs/architecture/RECIPES_FORMULATION_AND_DISTILLATION.md` — `DistillationRun`/`SaccharificationRun`/`RoastSession` specified, `Recipe`/`RecipeVersion` designed, two worked traces. *(Uncommitted.)* |
| `24_APIARY_SCOPING_REVISION_PROMPT.md` | Revised `22_`'s report in place: `Inspection`/`ColonyEvent` model split, offline reassessed as non-deferrable (added ticket A0), status corrected. *(Uncommitted, like the report it revises.)* |

### Pending

**`17_DESIGN_TO_IMPLEMENTATION_AUDIT_PROMPT.md`** — read-only coverage audit:
does the code actually do what the documents claim? Part A checks the
*enforcement* claims (the `ai_service` role grant, blind-mapping
unreachability, append-only audit rows), which is where a false claim carries
real consequence. Run after v1 is defined and exercised, so deliberate
deferrals don't read as gaps.

### Blocked

**`16_ADAPTIVE_OPERATOR_WORKSPACE_PREAMBLE.md`** — opens with "prepend this to
`ADAPTIVE_OPERATOR_WORKSPACE_RESEARCH_PROMPT.md`". That file has never existed
at any path — reconfirmed in the 2026-08-12 audit. The preamble is sound on
its own (vocabulary map, four already-decided constraints, tool entitlement
derived not stored) but it is a preamble to nothing until the companion
research prompt is saved to that filename.

Two further caveats if it is ever revived: its **§6, line 135**, refers to
`recordedBy`, which ADR-038 rejected in favour of `operatorPersonId` —
confirmed still present at that exact line as of the audit; fix that first.
And it was written to *shape* T10's design; T10 shipped in `db9410b`, so its
remaining value is refinement and multi-role context-switching, not
architecture.

### V2

**`18_EQUIPMENT_AND_READINESS_PROMPT_REVISED.md`** — equipment, instrument
calibration, operational readiness, consumables. Explicitly not v1. Confirmed
still not run — no `EQUIPMENT_AND_READINESS.md` exists (checked directly
while scoping `23_`, and again in the 2026-08-12 audit). Two things in it
matter beyond equipment tracking: instrument calibration state should
*derive* a measurement's `data_quality` (an out-of-calibration refractometer
does not produce a `measured_fact`), and urgency is contextual rather than a
stored severity — a broken airlock in June is routine, the same fault with
cherry arriving Thursday is blocking.

**Owns the Resource model.** The wider operational-economics research (not yet
filed here) also models Resource, custody, and acquisition. Two prompts
independently modelling Resource guarantees divergence — this one owns it.

---

## Not yet written

- **`25_` — offline options for apiary's A0.** Scope the actual options
  before A0 (offline base mechanism) is committed to — `22_APIARY_V1_SCOPING_REPORT.md`
  §7 concluded offline is not deferrable for apiary's Operator UI
  specifically, but did not evaluate implementation options in depth. No
  in-repo service-worker/PWA precedent exists to size A0 against, which is
  exactly what makes scoping it first worthwhile.
- **Brand/marketing architecture review** — `09_`'s own actual deliverable
  (`BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md`), still missing. The
  input document is filed and unblocked by ADR-037; the review itself was
  never run.
- **Operational economics, full pass** — merge with `18_` so Resource is
  designed once. `20_` is the urgent slice already extracted from it.
- **Data sovereignty and provider exit** — backup that isn't provider-native,
  client export, restore testing, Neon/Vercel/R2 exit runbooks. Independent of
  harvest timing, and the gap with the least margin for error: a provider
  failure today would be unrecoverable.

---

## Recurring failure worth knowing about

Several prompts drafted outside this repository named files that do not exist
(`PLATFORM_ARCHITECTURE_RECONCILIATION.md`, `MASTER_IMPLEMENTATION_ROADMAP.md`,
`AI_PERSONA_VOICE_GUIDE.md`, `EXTERNAL_DATA_SOURCES.md` under that exact
name), or used vocabulary this platform does not use (`ProjectMembership`,
`Role`, `MediaAsset`, `capability`). The Phase 1 prompt also omitted the
document that already answered its central question — it worked out only
because the session went and found `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`
§F unprompted.

**Before running any externally-drafted prompt: verify its reading list
against the actual repository, and check its vocabulary against
`DOMAIN_MODEL.md` and `RBAC.md`.** Asking for a KEEP/NEW classification of
entities that do not exist is how invented entities enter a schema.

---

## Recommended order from here

1. **`25_`** — not yet written; scope apiary's offline options before
   committing to A0's build.
2. **Decide A0**, informed by `25_`'s findings — the base offline mechanism
   every other apiary ticket depends on.
3. **A1–A8 (apiary) alongside T14 (coffee)** — confirmed non-conflicting in
   `22_APIARY_V1_SCOPING_REPORT.md` §3: A1-A4's schema/service layer touches
   no file T14 touches, so the two can run in the same window rather than
   queuing behind each other.
4. **Credentials** (Stripe, R2, Google OAuth — all unset in production as of
   the last verified check).
5. **The real milestone**: a real apiary season actually inspected by
   Kenneth, not a demo — and, in parallel, a real 2026 coffee harvest entered
   by a real operator who isn't Daniel. Both are what actually answer
   ADR-039's test and apiary's own. No further architecture pass answers
   either question.

`17_` (the coverage audit) and the rest of v2 (data sovereignty, economics
merged with `18_`) follow once there is real usage in both domains to audit
against.
