# Comprehensive Gap Analysis — Instructions + Prompt

This is an audit task, not a build task. The goal is a clear-eyed picture
of what exists, what's consistent, what's missing, and what's worth
considering next — before more work piles on top of anything that might
need correcting first.

## Step 1 — Check current status first

Confirm what's currently running/in-progress before starting this. This
audit can run alongside other work without conflict (it's read-only), but
still worth knowing the baseline state going in.

## Step 2 — The prompt

```
I want a comprehensive gap analysis of this entire project — everything
built, everything specified, everything referenced across our planning
documents — before we continue. This is an audit, not implementation work.
Do not write or modify any code or architecture docs during this task,
only the analysis report itself.

Do the following, in order:

## Part 1 — Full inventory

List everything that currently exists:
- Every file in docs/architecture/, with a one-line summary of what each
  covers.
- Every entry in DECISIONS.md (ADR list).
- Current build state: which slices are actually implemented in code
  (not just planned), with their real status (tests passing, deployed,
  etc.) — pull this from the actual codebase, not from memory of past
  conversations.

## Part 2 — Internal consistency check across planning docs

Our planning documents were written across many sessions and reference each
other extensively. Check for:

- Broken or stale cross-references — e.g., a document citing "§6" of
  another document when that document has since been renumbered. Check
  every "per X.md §Y" and "extends X.md §Y" citation across all documents
  and confirm the referenced section still exists and says what's claimed.
- Promised updates that may not have happened — specifically check whether
  GUIDED_FIELD_STUDY_TOOL.md §8's offline note has been updated to
  reference OFFLINE_FIELD_CAPABILITY.md as the source of truth, since that
  update was flagged as needed but may not have been applied yet.
- Contradictions between documents — e.g., two documents making different
  claims about the same entity's fields, or different rules for the same
  scenario.
- Entities referenced in one document but never actually defined anywhere
  (a document says "reuses X" but X was never specified).

## Part 3 — Coverage against CLAUDE.md's original scope

Go through CLAUDE.md's full section list systematically. For each major
area it describes, classify it as:
- BUILT — implemented in actual code, working.
- SPECIFIED — has a planning doc, not yet built.
- PARTIALLY ADDRESSED — touched on within another document but never given
  its own real treatment (e.g., a module mentioned in passing).
- NOT ADDRESSED — appears in CLAUDE.md's original vision but has no
  planning document or implementation at all.

Pay particular attention to areas that may have been overlooked across our
many sessions — Events (distinct from Experiences), the full Research OS
build-out (Hypothesis/Protocol/Evidence/Analysis chain beyond what
CryoBloom-specific work covers), the Story & Knowledge Engine as its own
system, the actual AI Layer/assistant experience (distinct from
AI_GOVERNANCE.md's rules), Apiary/Honey module depth beyond what Specimen
tracking and Beverage Sensory Protocols touch, and Fermentation & Beverage
infrastructure (FermentationRun, etc.) beyond what's referenced in passing.

## Part 4 — Known technical debt and open items

Compile every "known gap," "not yet configured," "cosmetic doc lag," or
similar flag that's been raised across prior status checks and documents
(e.g., DATA_ARCHITECTURE.md §1's schema list needing updates per ADR-026,
Google OAuth being unconfigured, transactional email being unconfigured).
Don't re-solve these, just compile them into one current list so nothing
is only living in old conversation history.

## Part 5 — Worth exploring (opportunities, not gaps)

Separately from missing pieces, note anything that seems like a genuine
opportunity given what's already been built — a connection between two
existing pieces that hasn't been made yet, or a natural extension that
would be low-effort given existing infrastructure. Keep this section
honest and limited — don't pad it with speculative feature ideas that
don't follow from what's actually here.

## Output

Produce this as a new document: docs/architecture/GAP_ANALYSIS_[DATE].md.
Structure it clearly with the five parts above as sections. Be direct and
specific — cite exact file names, section numbers, and line-level issues
where relevant, not vague summaries. Where you're not certain something is
actually a problem (e.g., a cross-reference that might be intentional),
flag it as "worth confirming" rather than asserting it's wrong.

Do not fix anything found during this pass — flag it, don't resolve it.
This report is the deliverable; corrections happen in a follow-up session
once I've reviewed the findings.
```

## After you get the report

Bring the summary back here if you want a second read on anything
surprising or ambiguous it turns up — particularly useful for anything
flagged in Part 3 (scope gaps) where deciding priority is a real judgment
call, not just a fix.
