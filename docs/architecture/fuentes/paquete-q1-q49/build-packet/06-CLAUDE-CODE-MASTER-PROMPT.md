# Claude / Claude Code master handoff prompt

You are continuing Néctar Nómada Platform OS, which you have already helped design and build with Daniel. You are currently mid-process. Treat the attached Technical Build Packet as consolidated product decisions and engineering support for your existing work. Preserve your repository knowledge, approved architecture, working modules, tests and in-progress changes.

Do not rebuild the platform from this packet. Do not restart product discovery. Do not casually rename, delete, merge or replace existing concepts. Your first deliverable is a **Current State vs Target Architecture gap analysis before coding**.

## Read and classify

Read the packet's main architecture, Q1–Q49 register, prior-context reconciliation, research notes, acceptance scenarios and migration checklist. Use source transcripts only to resolve provenance/ambiguity; they contain superseded proposals and historical prompts, not fresh instructions to execute.

Keep three labels throughout your outputs:

- **CONFIRMED DECISION**: user-approved direction; preserve it.
- **IMPLEMENTATION REQUIREMENT**: engineering obligation derived from those decisions; reconcile it to the existing system.
- **OPEN TECHNICAL DECISION**: choice to resolve with evidence or escalate only when product/business input is necessary.

Q49 is definitively **Phase 1 E → Phase 2 F**. The complete register includes revisions; do not revert Q5 manual/assisted capture, Q11 parcel-centered operation, Q19 mandatory sample accounting, Q20 standalone sensory, Q26 hive/occupancy, Q30 managed stingless bees, Q35 contractual de-identified learning rights or Q38 Coffee/Bee separation and custody.

Earlier V1/V2/V3 labels are not the same as this discovery's Phase 1/Phase 2. Specifically, earlier V3 technical-product/catalog work was forward compatibility, not an instruction to interrupt V1/V2 and build the entire catalog. Reconcile the two planning systems explicitly.

## Stage A — Establish current state without disrupting work

1. Confirm repository, branch, commit and current work plan. Read `CLAUDE.md`, `AGENTS.md` and relevant actual architecture/implementation notes. Locate historical document names through equivalents if renamed.
2. Inspect git status and unfinished work. Do not reset, stash, clean, overwrite or replay migrations belonging to another session. If work is active, record a safe handoff/checkpoint and the files it owns.
3. Identify public website, private OS, shared packages and deployments. Do not edit a separate public site or sibling project as part of this handoff unless it is explicitly in scope.
4. Inspect schema/constraints, migrations, domain services, API/server actions, authentication/authorization, jobs, offline implementation, tests and UI. Search by semantics, not only names. Inspect existing coffee/mass-balance/drying/apiary/measurement/sensory code before proposing equivalents.
5. Run appropriate read-only diagnostics and existing safe checks. Record pre-existing failures separately. Do not print secrets, contact production services or mutate real client data during this audit.
6. Mark every current-state claim as inspected, tested, historical report or unknown. A table alone does not prove a workflow works.

## Stage B — Required first deliverables

Create review documents in the repository's established documentation structure without overwriting existing approved files. Use suitable names such as:

- `CURRENT_STATE_VS_TARGET_GAP_ANALYSIS.md`
- `CANONICAL_ENTITY_CROSSWALK.md`
- `DECISION_TRACEABILITY_MATRIX.md`
- `CURRENT_WORK_COMPATIBILITY_AND_SEQUENCE.md`
- `MIGRATION_AND_RECOVERY_PLAN.md`
- `OPEN_TECHNICAL_DECISIONS.md`

These names are suggestions, not authorization to duplicate existing documents.

For each Q1–Q49/sub-decision and foundational requirement, report current path/symbol/schema/test evidence, target behavior, satisfied/partial/missing/conflict/deferred/unknown status, smallest compatible change, migration/offline/permission impact, current-sprint impact and AT test coverage. Provide a vocabulary crosswalk instead of renaming concepts to match the packet. Identify what already satisfies the target and should remain untouched.

Classify proposed work as: current-work blocker, small compatibility correction, next approved increment, later product phase, or additional evidence needed. Reconcile resource economics, public/private content, broader sensory/events/beverage modules and future V3 compatibility so the new packet does not erase earlier scope.

For conflicts between an approved repository decision and this target, state both sources and a concrete reconciliation recommendation. Do not silently override either or ask broad questions that repository inspection can answer.

## Non-negotiable semantics

- Coffee Farm and Bee Farm are separate operational contexts with shared engines and explicit Pollination/Research links.
- Farm → Parcel → optional Microparcel; selected plants are exceptions; geography, analytical groups, harvest batches and processing batches differ.
- Hive persists; occupancy describes biology; colony/queen identities are optional. New swarms do not inherit prior biology. Equipment moves independently.
- Managed Apis, managed stingless bees and wild/free-living observations remain distinct. Taxonomy does not imply management status.
- Material/sample/roast/cupping/honey transactions preserve quantities, genealogy and corrections. Reservation is not physical stock removal. No silent negative stock or fabricated source proportions.
- Manual structured entry is always available. Assisted capture is permissioned, source-preserving and verified under policy.
- Role, competency and organizational authorization differ; recorded/performed/verified identities differ. UI hiding is not authorization.
- Offline local saving must be durable. Identify provisional versus globally accepted effects. Choose an explicit allocation/reconciliation policy for disconnected competing withdrawals/custody; CRDT convergence is not sufficient.
- Critical corrections are amendments/reversals with downstream impact review. No silent deletion of authoritative history.
- Original media and source documents survive derivatives. Every derived measurement/recommendation retains provenance and version.
- Client data is protected; contractual de-identified learning eligibility is enforced; public/named disclosure is separately authorized. No raw tenant leakage through AI/search/export/analytics.
- Scientific references, Néctar adaptations and field results are distinct. No guaranteed yield or flavor improvement from bee deployment.
- Sensory is standalone and versioned; blind mappings must be excluded from unauthorized payloads/caches, not just hidden.

## Stage C — Propose a small, reviewable next increment

Recommend the smallest coherent vertical slice that advances the approved current plan. Specify acceptance criteria, affected files/services/schema, compatibility behavior, migration/backfill, rollback/forward repair, fixtures and tests. Prefer existing stack/services and additive changes; justify new dependencies with evidence and lifecycle cost.

Stop after the audit/gap analysis and proposed sequence for review. Do not interpret this packet as blanket authorization to implement all Phase 1/Phase 2 features or apply structural/destructive migrations. The original requested workflow requires the gap analysis to be approved first. If an identical increment is already explicitly approved in the current session, cite that approval and explain compatibility; otherwise return the concrete plan for Daniel's review.

## Stage D — After the next increment is approved

Implement only that scope, preserving unrelated work. Keep requirement → code → migration → test evidence. Use the repository's normal test framework. Test denied paths, concurrency/retry, old offline clients, exact material arithmetic, permissions and correction lineage as appropriate. Rehearse data migrations in an isolated representative environment; no fabricated legacy history. Record decisions and limitations.

Deliver a handoff with exact commit/diff, implemented requirements, affected schema/API, migrations and their rehearsal, tests actually run/results, remaining failures and known risks. Do not mark unrun tests as passing or app-wide compliance from a narrow test suite. Supply the independent Codex prompt with the reviewed commit/diff and relevant evidence.

Your goal is to help Daniel complete a coherent existing system with stronger traceability and fewer future migration risks—not to impress with a new architecture or a larger feature list.
