# Adding Brand, Marketing, Community & Sales Architecture Input — Instructions

## Step 1 — Check current status first

Same discipline as always: confirm what Claude Code is currently working on
before handing over a document this large. This is a substantial architecture
task (50-section required document structure, multiple capability matrices) —
expect it to take a while once started.

## Step 2 — Place the file

```
docs/architecture/NECTAR_NOMADA_BRAND_MARKETING_COMMUNITY_SALES_INPUT.md
```

(Use the **corrected** version — `..._CORRECTED.md` — not the original
upload. The corrected version fixes five invented file references that
don't exist in your actual repo, confirms the Publer decision explicitly
so Claude Code doesn't need to ask, and adds two specific cross-check
requirements against MEDIA_INTELLIGENCE_PIPELINE.md and
AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md.)

```bash
git add docs/architecture/NECTAR_NOMADA_BRAND_MARKETING_COMMUNITY_SALES_INPUT.md
git commit -m "Add brand/marketing/community/sales architecture input (Publer adapter, corrected file references)"
```

## Step 3 — Hand Claude Code the prompt

The document itself contains the full instruction set (it's written
directly to Claude Code, same format as the AI Persona document) — paste
its own Section 1 ("First instruction to Claude Code") as your message, or
simply say:

```
I've added docs/architecture/NECTAR_NOMADA_BRAND_MARKETING_COMMUNITY_SALES_INPUT.md
to docs/architecture/. Follow its own instructions exactly — read CLAUDE.md
and this document completely, inspect the actual repository (do not assume
any proposed capability is missing), then create
docs/architecture/BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md per the
document's required structure (its own §91). Do not implement anything —
architecture and behavioral design only, per its own §97 constraints. Follow
its final response format (§98) exactly, including the two additional
conflict-check items appended to that section.
```

## Why this one needed correction before sending

Same root cause as the AI Persona document: it was drafted by ChatGPT
without direct access to your actual repository, so it guessed at
plausible-sounding file names instead of your real ones. It also assumed
Publer adoption without you having confirmed that decision was still
current — worth having resolved explicitly before Claude Code builds a
capability matrix around a vendor choice that might have been stale.
