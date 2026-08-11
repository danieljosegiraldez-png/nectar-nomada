# Post-Gap-Analysis Cleanup — Instructions + Prompt

Small, independent, mechanical fixes surfaced by the gap analysis. None of
these require product-owner judgment except item 1, which needs a factual
check before it can be fixed correctly.

## Step 1 — Check current status first

Standard discipline — confirm nothing else is mid-flight before starting.

## Step 2 — The prompt

```
Fix the following, found by GAP_ANALYSIS_2026-08-10.md. These are
independent of each other — work through them in order, commit as you go
rather than one giant commit.

1. FABRICATED CITATION — investigate before fixing, don't just delete.
   COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md §M (lines 476-479) cites
   ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md §24 for the specific claim
   "every chart carries units/source/sample identity/date/provenance."
   That document has no numbered §24 and the word "chart" doesn't appear in
   it anywhere. Determine: is there a REAL section elsewhere (in that
   document or another) that actually supports this claim, in which case
   fix the citation to point at it correctly? Or was this genuinely
   invented, in which case remove the false citation and rewrite that
   passage to either (a) state the requirement as this document's own
   original design decision, clearly attributed as such, or (b) remove the
   claim if it doesn't actually hold. Do not leave a citation pointing at
   content that doesn't exist. Report which case this turned out to be.

2. Fix the five broken cross-references identified in
   GAP_ANALYSIS_2026-08-10.md §2.1 — each currently cites `DOMAIN_MODEL.md`
   or `PLATFORM_OVERVIEW.md` at a section number that only exists in
   `CLAUDE.md`. Redirect each to the correct source document, per the
   gap analysis's own mapping table.

3. Fix the malformed filename citation in MEDIA_INTELLIGENCE_PIPELINE.md
   §2 — currently cites `EXTERNAL_DATA_SOURCES.md` §25, which doesn't
   exist under that exact name. Confirm whether it should point to
   `NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md` §25 (Core External-Data
   Entities to Design — fits the ImportJob context) as the gap analysis
   suggests, and fix accordingly.

4. Update GUIDED_FIELD_STUDY_TOOL.md §8 — its offline-support bullet still
   poses the offline question as open and cites only MVP_ROADMAP.md §3,
   with no mention of OFFLINE_FIELD_CAPABILITY.md, which was written
   specifically to resolve it. Add the backlink.

5. Remove the stale comment at prisma/schema.prisma line 3 ("Only the
   `core` Postgres schema exists so far...") — the actual schemas array
   two lines below already lists seven schemas. Update or remove the
   comment to match reality.

6. Update DATA_ARCHITECTURE.md §1's schema list — currently reads
   `identity, commerce, research, sensory, competitions, environmental,
   content, project, partner, ai`. Replace with what's actually
   implemented (`core, commerce, experiences, partner, sensory, ai,
   competitions`), and note research/environmental as correctly-still-
   absent (not yet built) rather than silently dropping them from the
   document.

7. Add "Sensory Head Judge" to RBAC.md §5's prose Role Profile list —
   added in Slice 6 (ADR-030 decision 4), never added to this list.

8. Investigate whether 00_INSTRUCTIONS_AND_PROMPT.md and
   04_ADD_REMAINING_PLANNING_DOCS_PROMPT.md are genuine duplicates. If so,
   remove the stale one and note which was kept and why.

9. Commit the three untracked files currently sitting in the working tree:
   09_ADD_BRAND_MARKETING_PROMPT.md,
   NECTAR_NOMADA_BRAND_MARKETING_COMMUNITY_SALES_INPUT.md, and its
   ..._CORRECTED.md version. These have been uncommitted since they were
   added — get them into git properly.

10. Wire My Néctar's Sensory History section to real data — per
    GAP_ANALYSIS_2026-08-10.md Part 5, item 1. The placeholder copy at
    messages/en.json line 143 still reads "Empty — Sensory is a later
    vertical slice," but Sensory has been live for several slices.
    Assessment.evaluatorUserAccountId already ties every submitted
    assessment to a real UserAccount — query a logged-in Sensory Judge's
    own past assessments and replace the placeholder in
    app/my-nectar/page.tsx with a real section. Small, contained change.

After each fix, run typecheck/lint/tests to confirm nothing broke. Commit
each logical group separately with a clear message. Report back with a
summary of what changed, especially the outcome of item 1's investigation.
```
