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

**Status vocabulary:** RUN (executed, complete) · PENDING (not yet run) ·
BLOCKED (cannot run, see note) · V2 (deliberately after v1).

---

## Where things stand

Platform v1 is defined by a falsifiable test (ADR-039): *can the platform
carry one real 2026 harvest from cherry through to a cupping score and a lot
report that could be sent to a client?*

Phase 1 tickets T1–T10 and T9.5 are built. **T12, T13, T14 remain** — sensory
linkage, lot report, end-to-end test plus DEMO seed. T11 (deviation tracking)
is deferred to v1.1, not cancelled.

ADR-039 carries a clause worth repeating here: these tickets build the
*capability* to carry a harvest end to end. They do not constitute having done
so. A truthful "yes" on the v1 test needs a real harvest entered by a real
operator once T12–T14 ship.

---

## The series

### Run

| File | Purpose |
|---|---|
| `00_FIRST_SESSION_PROMPT.md` | Bootstrapped the nine architecture docs |
| `01_ADD_EXTERNAL_DATA_SOURCES_PROMPT.md` | Filed the external data source inventory |
| `02_ADD_MEDIA_PIPELINE_PROMPT.md` | Filed the media intelligence pipeline |
| `03_CRYOBLOOM_PUBLIC_CONTENT_PROMPT.md` | CryoBloom Vol. I public content, classification-first |
| `04_ADD_REMAINING_PLANNING_DOCS_PROMPT.md` | Five planning docs; research-criteria review checklist |
| `05_ADD_SENSORY_PROTOCOLS_PROMPT.md` | Beverage sensory protocols and panel calibration |
| `06_ADD_COMPETITIONS_PROMPT.md` | Competitions operational layer, category-agnostic |
| `07_GAP_ANALYSIS_PROMPT.md` | Produced `GAP_ANALYSIS_2026-08-10.md` |
| `08_ADD_TOURISM_DESIGN_RESOURCES_PROMPT.md` | Episode design + partner resource library |
| `09_ADD_BRAND_MARKETING_PROMPT.md` | Filed the brand/marketing input |
| `10_POST_GAP_ANALYSIS_CLEANUP_PROMPT.md` | Ten mechanical fixes from the gap analysis |
| `11_UPDATE_HONEY_MEAD_CONTENT_PROMPT.md` | Real honey/mead content (commit `4080633`) |
| `12_VERIFICATION_PASS_PROMPT.md` | Verified Phase 1 lot model, T5 lineage, honey/mead copyright. **Came back clean** |
| `13_DEFINE_PLATFORM_V1_PROMPT.md` | Produced ADR-039, the v1 definition |
| `14_T9.5_PROVENANCE_RETROFIT_PROMPT_REVISED.md` | Removed the silent `direct_observation` default (ADR-038) |
| `15_DOCUMENTATION_CORRECTION_PASS_PROMPT.md` | Honey rubric rebuilt as original + attribution corrected; citation fixes; ADR-041/042 |

### Pending

**`17_DESIGN_TO_IMPLEMENTATION_AUDIT_PROMPT.md`** — read-only coverage audit:
does the code actually do what the documents claim? Part A checks the
*enforcement* claims (the `ai_service` role grant, blind-mapping
unreachability, append-only audit rows), which is where a false claim carries
real consequence. Run after v1 is defined and exercised, so deliberate
deferrals don't read as gaps.

**`19_ADR_RECONCILIATION_AND_T13_AMENDMENTS.md`** — *largely superseded.* Its
Part A (append the stale ADR drafts) and Part B (T13 print-friendly, T11
deferral) both landed in commits `ecdb45a` and `3c6d9eb`. **Part C is still
open**: the media readiness question — `core.asset` has zero rows, no R2
credentials exist anywhere, and whether the pilot harvest includes field
photographs needs deciding before T14's seed work.

**`20_CAPTURE_OR_LOSE_IT_PROMPT.md`** — the only prompt here with a real
deadline. Panama's harvest runs roughly November–March. Cost *analysis* can be
built in 2027; hours worked in January 2027 cannot be recovered. Asks one
narrow question: what minimum fields must exist in the operator workbench
before harvest so the season is reconstructable later? Capture physical facts,
defer all money.

### Blocked

**`16_ADAPTIVE_OPERATOR_WORKSPACE_PREAMBLE.md`** — opens with "prepend this to
`ADAPTIVE_OPERATOR_WORKSPACE_RESEARCH_PROMPT.md`". That file has never existed
at any path. The preamble is sound on its own (vocabulary map, four
already-decided constraints, tool entitlement derived not stored) but it is a
preamble to nothing until the companion research prompt is saved to that
filename.

Two further caveats if it is ever revived: its §6 refers to `recordedBy`, which
ADR-038 rejected in favour of `operatorPersonId` — fix that first. And it was
written to *shape* T10's design; T10 shipped in `db9410b`, so its remaining
value is refinement and multi-role context-switching, not architecture.

### V2

**`18_EQUIPMENT_AND_READINESS_PROMPT_REVISED.md`** — equipment, instrument
calibration, operational readiness, consumables. Explicitly not v1. Two things
in it matter beyond equipment tracking: instrument calibration state should
*derive* a measurement's `data_quality` (an out-of-calibration refractometer
does not produce a `measured_fact`), and urgency is contextual rather than a
stored severity — a broken airlock in June is routine, the same fault with
cherry arriving Thursday is blocking.

**Owns the Resource model.** The wider operational-economics research (not yet
filed here) also models Resource, custody, and acquisition. Two prompts
independently modelling Resource guarantees divergence — this one owns it.

---

## Not yet written

- **Operational economics, full pass** — merge with `18_` so Resource is
  designed once. `20_` is the urgent slice already extracted from it.
- **Data sovereignty and provider exit** — backup that isn't provider-native,
  client export, restore testing, Neon/Vercel/R2 exit runbooks. Independent of
  harvest timing, and the gap with the least margin for error: a provider
  failure today would be unrecoverable.
- **Brand/marketing architecture review** — the one large input document with
  no review companion. Unblocked by ADR-037.

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

1. `20_` — deadline-driven, decide before harvest
2. `19_` Part C — media readiness, before T14's seed work
3. T12 → T13 → T14
4. Credentials (Stripe, R2, Google OAuth — all unset in production)
5. **One real harvest, one real operator who isn't Daniel**
6. `17_` — audit, once there is real usage to audit against
7. v2: data sovereignty, then economics merged with `18_`

Step 5 is the actual milestone. It will answer questions no further
architecture pass can.
