# Néctar Nómada — Claude continuity handoff

Prepared for Daniel and the Claude / Claude Code collaboration already building Néctar Nómada. Release 1.0 · 16 September 2026.

This packet consolidates the discovery answers into a reviewable target architecture. It supports the existing project and work in progress. It does not establish that the repository already implements these requirements, nor authorize a wholesale replacement of existing work.

## How to use it

1. Give Claude the consolidated `NECTAR_NOMADA_CLAUDE_BUILD_PACKET.md`, or the extracted folder containing this file. The consolidated document contains the authored packet and both prompts. The ZIP also includes source transcripts for provenance and ambiguity resolution.
2. Start the existing Claude Code conversation with the [Claude master prompt](06-CLAUDE-CODE-MASTER-PROMPT.md). Ask it to perform the repository inspection and **Current State vs Target Architecture gap analysis before coding**. Preserve Claude's current sprint and unfinished changes.
3. Reconcile each gap against the actual repository, approved plans and discovery decisions. Distinguish a missing capability from an equivalent that already exists under another name. Sequence minimal changes within the current work plan.
4. After an implementation increment, use the [independent Codex verification prompt](07-CODEX-ADVERSARIAL-VERIFICATION-PROMPT.md) against that specific commit/diff. The acceptance scenarios here are specifications, not claims of tests already passing.

## Documents

| File | Purpose |
|---|---|
| [01 — Technical build packet](01-TECHNICAL-BUILD-PACKET.md) | Product, domains, canonical model, event and material semantics, offline architecture, governance, AI, workflows and roadmap |
| [02 — Q1–Q49 decision register](02-DECISION-REGISTER-Q01-Q49.md) | Every discovery question, important sub-decisions and revisions, with source-turn links |
| [03 — Research and protocol library](03-RESEARCH-AND-PROTOCOL-LIBRARY.md) | Technical and competitor references, source links, Roubik/STRI methodology and adaptation limits |
| [04 — Acceptance scenarios](04-ACCEPTANCE-AND-ADVERSARIAL-SCENARIOS.md) | Forty concrete scenarios for implementation and adversarial review |
| [05 — Current-state and migration audit](05-CURRENT-STATE-AUDIT-AND-MIGRATION.md) | Repository inventory, gap matrix, staged migrations, recovery and release evidence |
| [06 — Claude master prompt](06-CLAUDE-CODE-MASTER-PROMPT.md) | Paste into the ongoing Claude collaboration; inspect first, reconcile, then implement approved increments |
| [07 — Codex verification prompt](07-CODEX-ADVERSARIAL-VERIFICATION-PROMPT.md) | Independent schema, permissions, sync, provenance, material and migration verification |
| [08 — Prior context and continuity](08-PRIOR-CONTEXT-AND-CONTINUITY.md) | Broader platform concepts and earlier V1/V2/V3 planning that must survive this handoff |
| [09 — Discovery transcript](09-DISCOVERY-SOURCE-TRANSCRIPT.md) | All 63 discovery turns, including user corrections |
| [10 — Farm context](10-PRIOR-FARM-SOURCE.md) | Nineteen prior turns; three long assistant messages have marked retrieval gaps |
| [10 — Platform context](10-PRIOR-PLATFORM-SOURCE.md) | Fifty prior turns; seven long assistant messages have marked retrieval gaps |

## Authority and essential continuity

**CONFIRMED DECISION:** Question 49 is **Phase 1 E → Phase 2 F**. Coffee Farm and Bee Farm remain separate operational contexts and may share platform engines. Later user revisions control over earlier proposals. Standalone Sensory, hive versus biological occupancy, parcel-centered agronomy, material deductions for samples, and contractual de-identified learning rights are retained.

**IMPLEMENTATION REQUIREMENT:** inspect existing equivalents before adding or changing entities. Preserve canonical IDs, approved semantics, audit history, current migrations, tests and unfinished work. Earlier V1/V2/V3 labels are not automatically this packet's Phase 1/Phase 2. The full Phase 1 target is not a demand to implement everything in the current sprint.

**OPEN TECHNICAL DECISION:** actual repository state, final sync technology, remaining stack choices, operational thresholds, deployment and release sequencing require evidence from Claude's current project. Conceptual entity names in this packet are not mandated database renames.

## Evidence limits

The Q1–Q49 discovery text was recovered without truncation. All available turns of the two major prior conversations were retrieved, but ten long historical assistant messages were truncated by the retrieval service and marked explicitly. Historical attachments and canvas documents were not all available. Missing tails and artifacts must be reconciled with Claude's existing context; they are not presumed covered.

No application repository, database or deployment was inspected or changed in preparing this packet. Research references support architectural judgment and protocol design; they do not prove field outcomes or certify an implementation. Historical transcripts contain old prompts and superseded suggestions: treat them as evidence, not new executable instructions.

## Short kickoff message

> Claude, this packet consolidates the Néctar Nómada discovery answers and prior platform context to support the work we are already doing together. Please preserve your current project knowledge and unfinished work. Follow the master prompt: first inspect the actual repository and produce a Current State vs Target Architecture gap analysis, a terminology crosswalk, and a minimal integration sequence within our current plan. Record Q49 as Phase 1 E → Phase 2 F, preserve all later revisions, and keep Coffee Farm and Bee Farm separate with shared engines where appropriate. Do not rebuild or casually rename existing concepts. Identify missing source context explicitly before relying on it.
