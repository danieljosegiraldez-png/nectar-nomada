# Adding the Remaining Planning Docs — Instructions + Prompt

Covers five documents not yet sent to Claude Code:
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md`, `CONSUMER_SENSORY_FEEDBACK.md`,
`GUIDED_FIELD_STUDY_TOOL.md`, `TOURISM_EXPERIENCES.md`, and
`RESEARCH_ACTIVITY_CRITERIA.md`.

(If `EXTERNAL_DATA_SOURCES.md`, `MEDIA_INTELLIGENCE_PIPELINE.md`, or the
CryoBloom public-content prompt were already sent in an earlier session,
Claude Code will simply see those files already exist — no harm in this
prompt mentioning them for completeness.)

---

## Step 1 — Check current status first

Same discipline as every prior step: ask Claude Code what's currently
running (which Slice, is the working tree clean) before adding anything.
Do not paste Step 3 into a session with uncommitted, in-progress work.

## Step 2 — Place all five files

```
docs/architecture/SPECIMEN_AND_MATERIAL_TRACEABILITY.md
docs/architecture/CONSUMER_SENSORY_FEEDBACK.md
docs/architecture/GUIDED_FIELD_STUDY_TOOL.md
docs/architecture/TOURISM_EXPERIENCES.md
docs/architecture/RESEARCH_ACTIVITY_CRITERIA.md
```

Commit them together, on their own, separate from any in-progress slice work:

```bash
git add docs/architecture/SPECIMEN_AND_MATERIAL_TRACEABILITY.md \
        docs/architecture/CONSUMER_SENSORY_FEEDBACK.md \
        docs/architecture/GUIDED_FIELD_STUDY_TOOL.md \
        docs/architecture/TOURISM_EXPERIENCES.md \
        docs/architecture/RESEARCH_ACTIVITY_CRITERIA.md
git commit -m "Add five planning docs: specimen/material tracing, consumer sensory feedback, guided field study tool, tourism experiences, research activity criteria"
```

## Step 3 — Hand Claude Code the prompt

This is scoped as read-and-cross-check, same as every prior planning doc —
**no implementation**, and it ends with a specific compliance action, not
just a summary.

```
I've added five architecture planning documents to docs/architecture/. Read
them in this order, since later ones build on earlier ones:

1. SPECIMEN_AND_MATERIAL_TRACEABILITY.md — individual specimen tracking
   beneath Location, plus a wood/material processing chain shared across
   beverage domains.
2. CONSUMER_SENSORY_FEEDBACK.md — a second, structurally separate sensory
   pathway (QR-triggered consumer feedback) distinct from the expert Sensory
   Evaluation engine, per CLAUDE.md §49's rule against combining consumer
   liking with technical judging.
3. GUIDED_FIELD_STUDY_TOOL.md — a guided workflow engine for apibotanic and
   coffee biodiversity field studies, built on the Specimen entity from
   document 1.
4. TOURISM_EXPERIENCES.md — extends Experiences & Reservations for eco/
   gastro/heritage/agricultural tourism, including a researched decision to
   decline direct OTA (Viator/GetYourGuide) integration for now, and reuse
   of the Consumer Sensory Feedback system (document 2) for live tastings.
5. RESEARCH_ACTIVITY_CRITERIA.md — the most important one to read carefully.
   This defines the substance test that distinguishes genuine research
   activities from commercial activities carrying research language, a
   dedicated independent Research Compliance Reviewer role, and — critically
   — an explicit requirement in its §9 that this criteria be applied
   retroactively to CryoBloom and the gastro-tourism activities in document 4
   BEFORE any new activity-related work proceeds.

Do NOT implement anything from documents 1-4 yet — standard planning-doc
discipline, same as prior sessions.

For document 5 specifically, do the following now, not later:

a. Confirm you understand the five-part substance test (§1) and the
   fee-based tiering (§2-3) — flag anything unclear rather than guessing.
b. Confirm the Research Compliance Reviewer Role Profile (§4) is compatible
   with the existing RBAC chain (RBAC.md) — it should be a straightforward
   addition (Role Profile is data, not schema, per RBAC.md §2), but flag if
   anything conflicts.
c. Do NOT perform the actual retroactive review yourself — that requires a
   human Compliance Reviewer (Daniel Silvera, undany@gmail.com, per team
   context), not an AI judgment call, consistent with AI_GOVERNANCE.md's
   "AI cannot approve scientific conclusions" principle applied here to
   compliance conclusions specifically. Instead, prepare a clear summary
   checklist of what needs review for CryoBloom and for the Tourism
   Experiences gastro-tourism design against the five-part test (§1), so
   the actual human review can happen efficiently.

Cross-check all five documents against DOMAIN_MODEL.md, RBAC.md, and
AI_GOVERNANCE.md for conflicts, and log acceptance of all five in
DECISIONS.md — same pattern as every other planning document: accepted as
planning input, implementation deferred, not an immediate build order.

Stop after item (c) above and give me the retroactive-review checklist
directly — that's the actual next action item, not just a summary.
```

## What happens after this

The retroactive review checklist Claude Code prepares goes to Daniel Silvera
as the independent Compliance Reviewer. Per `RESEARCH_ACTIVITY_CRITERIA.md`
§9, no new activity-related feature work proceeds until that review is
complete — this is a real gate, not a formality, and it's the one piece of
this whole batch that isn't just "file it and move on."
