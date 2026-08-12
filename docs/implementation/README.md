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

**Coffee's Phase 1 ticket sequence is complete.** T1–T10, T9.5, T12, T12.5,
T12.6, T13, and now **T14** are all built (`PHASE_1_TECHNICAL_EXECUTION_PLAN.md`
§34 — every row carries a DONE marker except T11, deferred to v1.1, not
cancelled). T14 shipped the full harvest-to-sensory E2E test
(`tests/traceability/e2e.test.ts`) and a DEMO seed chain
(`seedDemoTraceabilityChain` in `prisma/seed.ts`) that reaches an actual
scored cupping result — the literal shape of ADR-039's falsifiable test —
by calling the real T1–T13 service functions rather than hand-seeding rows.
It also fixed a real incident: a mid-verification test run left partial
fixture state that triggered an unfiltered `deleteMany` across ten tables
(Prisma silently drops `undefined` keys from a `where` clause). Recovered
via Neon PITR + reseed; fixed for good with a guard
(`tests/helpers/assertDefinedWhere.ts`) applied to all 155 `deleteMany`
call sites across every test file, with its own fail-fast-before-any-
database-call proof (`tests/helpers/e2e-cleanup-failsafe.test.ts`).

**Apiary now has its own, parallel v1 test**, scoped in
`22_APIARY_V1_SCOPING_REPORT.md` and revised in
`24_APIARY_SCOPING_REVISION_PROMPT.md`: *can the platform carry one apiary
through a season of inspections to a honey batch with a sensory result?*
The scope is settled — tickets **A0** (offline base mechanism) through **A8**
(DEMO seed + E2E test). **A1 (apiary site + Hive/Colony schema + RBAC) and
A2 — REVISED (Colony origin + Inspection + ColonyEvent) are now done**
(`tests/apiary/hives.test.ts`, 10 tests; `tests/apiary/inspections.test.ts`,
8 tests; `tests/apiary/colonyEvents.test.ts`, 9 tests — all real Neon).
Inspection stays a formal, structurally protected table (§1a); feeding/
treatment/passing-observation share a separate `ColonyEvent` log.
**A0, A3–A8 remain unbuilt.** The ADR amendment
justifying apiary's v1 inclusion is still a draft sitting inside the
scoping report, not yet appended to `DECISIONS.md` (unlike ADR-044,
T12.6's own amendment, which is appended). A0 was originally flagged as
the largest unknown in the whole set; `25_OFFLINE_OPTIONS_ANALYSIS.md` has
since sized all three options and recommends Option B (a minimal IndexedDB
draft queue, no service worker), resizing A0 down to small-medium —
pending one field check (does Kenneth's phone keep a tab alive offline at
Cerro Azul). A0 itself is still unbuilt; only its sizing is settled.

ADR-039 carries a clause worth repeating here: these tickets build the
*capability* to carry a harvest end to end. They do not constitute having
done so. A truthful "yes" on the v1 test needs a real 2026 harvest entered
by a real operator who isn't Daniel — T14's own DEMO chain proves the
mechanism composes (cherry → lot → sample → session → score, verified live
via `getLotReport`), it does not itself answer ADR-039's question. Same
distinction for apiary: a real season actually inspected by Kenneth, once
A0–A8 ship.

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
| `25_OFFLINE_OPTIONS_PROMPT.md` | Produced `25_OFFLINE_OPTIONS_ANALYSIS.md` (commit `c03fa2a`) — sized and compared three options for A0 (full PWA, minimal IndexedDB draft queue, paper). Found the original A0 sizing wrongly included versioned conflict resolution, which doesn't apply to `Inspection`/`ColonyEvent`'s append-only write shape. Recommends **Option B** (minimal draft queue, no service worker), resizing A0 from the set's largest unknown down to small-medium, pending one field check (tab survival on Kenneth's device at Cerro Azul with no signal). Confirms A4's fold into A3 under the same scrutiny. |

### Pending

**`16_ADAPTIVE_OPERATOR_WORKSPACE_PREAMBLE.md`** — **unblocked.** Its
companion, `ADAPTIVE_OPERATOR_WORKSPACE_RESEARCH_PROMPT.md`, is now filed
(committed alongside this fix) — the preamble is no longer a preamble to
nothing. Its own §6, line 135's `recordedBy`/ADR-038 contradiction is also
fixed, corrected to `operatorPersonId`. Neither the preamble nor its
companion has actually been *run* yet, so this is pending, not done — and
the research prompt's own filed copy carries a status note worth reading
first: it was written to shape T10's design, which has since shipped
(`db9410b`), and its apiary data-model addendum is superseded by
`22_`/`24_`'s real model. Remaining value is refinement of what exists plus
design input for A5 and later multi-role context-switching, not greenfield
architecture.

**`17_DESIGN_TO_IMPLEMENTATION_AUDIT_PROMPT.md`** — read-only coverage audit:
does the code actually do what the documents claim? Part A checks the
*enforcement* claims (the `ai_service` role grant, blind-mapping
unreachability, append-only audit rows), which is where a false claim carries
real consequence. Run after v1 is defined and exercised, so deliberate
deferrals don't read as gaps.

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

1. **Confirm A0's field precondition** — `25_OFFLINE_OPTIONS_ANALYSIS.md`
   recommends Option B (minimal IndexedDB draft queue) contingent on one
   check: does Kenneth's phone keep a tab alive offline at Cerro Azul. An
   afternoon test, not a build task.
2. **A0**, sized small-medium per `25_`'s findings — the base offline
   mechanism every other apiary ticket depends on.
3. **A3–A8 (apiary)** — A1/A2 are done; coffee's own ticket sequence is
   closed (T14 done), so this no longer runs "alongside" anything; it's
   simply the one remaining build track.
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
