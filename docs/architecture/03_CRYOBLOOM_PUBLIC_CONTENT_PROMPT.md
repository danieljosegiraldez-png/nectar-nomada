# CryoBloom Vol. 1 — Public Project Content — Instructions + Prompt

## Step 1 — Check Slice 2 status first

Ask Claude Code directly: "What's the current status of Slice 2 (Public
Discovery)? Does it build and run? Is real seed/demo data in place?"

Do not paste the Step 2 prompt below into a session with uncommitted,
in-progress Slice 2 work — wait for a clean stopping point, same discipline
as every prior step.

## Step 2 — Hand Claude Code the CryoBloom content (once Slice 2 is stable)

```
Slice 2 is stable — I want to populate it with real content for one project:
CryoBloom Series Geisha Vol. I, replacing generic DEMO seed data for this
specific project with the real thing.

Source material is in Google Drive (shared into danieljosegiraldez@gmail.com,
per MEDIA_INTELLIGENCE_PIPELINE.md), well-organized under a
"CRYOBLOOM SERIES" structure: 0.Project Management, 1.Investigación,
2.Audiovisual, 3.Diseño, 4.Kit CryoBloom, 5.Marketing, 6.Eventos.

Before writing any ingestion or display code, do the following in order:

1. CLASSIFICATION PASS FIRST, before any public rendering exists. Two
   documents in the research folder are explicitly marked internal-only by
   the team itself ("documento de uso personal, no distribuir en mesa" /
   "uso interno — no leer en voz alta como guion"). Set up the classification
   scheme (SECURITY.md §4) so anything from 1.Investigación defaults to
   `internal`, not `public`, unless I explicitly mark a specific item
   otherwise. Do not infer public/internal status from folder location alone
   — ask me to confirm classification for anything ambiguous rather than
   guessing.

2. NO FABRICATED RESULTS. The project's own calendar shows the first two
   CryoBloom sensory sessions (Aug 15, Sept 15) are still "Pendiente" — not
   yet completed. There is no real panel/sensory result data yet, even
   though the team's planning docs describe wanting comparative radar
   ("telaraña") charts per protocol eventually. Do not generate placeholder
   charts, mock sensory scores, or invented results for this project. The
   public page should show the project narrative, protocol design (A/B/C —
   what's being tested, not results), team, and existing real media —
   and nothing presented as a finding or result that hasn't happened yet.

3. PEOPLE ARE REAL, NAMED INDIVIDUALS. Team/collaborator profiles (Daniel
   Giráldez, Nathaly Rubio, Sebastian Barra, Oliver, Gabriel Cruz, Roberto
   Ameglio, Luis Sotillo, Kurt Daniel Ngo, and interview subjects including
   Agustín Gómez and Elsi de Gómez) map to Person + OrganizationMembership +
   ProjectMembership (DOMAIN_MODEL.md §1-2). Create these as real canonical
   Person records tied to this Project, but do NOT auto-publish public
   bio/profile pages for any of them yet — I need to confirm each person's
   consent to be featured publicly before their profile goes live. Default
   new Person profiles created this way to non-public status; I'll flag
   which ones are cleared to publish.

4. CONTENT MAPPING — use existing modules, don't invent new ones:
   - Polished packaging/flyer designs (already-produced marketing assets,
     e.g. the "CRYOBLOOM SERIES GEISHA VOL. I" designs) → Story &
     Knowledge Engine content + core.asset, classification = public.
   - Interview transcripts (once conducted/transcribed) → Story/Interview/
     Transcript entities (DOMAIN_MODEL.md §4).
   - Protocol A/B/C design description (the "what's being tested," not raw
     data) → public-facing Project/Story narrative content, sourced from
     the team's own presentation script material, not the internal QA/
     reference-card docs.
   - Photo/video/audiovisual → Asset ingestion per
     MEDIA_INTELLIGENCE_PIPELINE.md Phase A, scoped to ONLY the CryoBloom
     Series Drive folder (not the wider Drive) for this pass.
   - The project management calendar (Excel/Sheets) is operational tracking,
     not research or public content — do not surface it publicly; it may be
     useful later for Partner Workspace (Slice 5) task tracking, not now.

5. Build the public Project + Story page(s) for CryoBloom Vol. I using only
   content cleared in steps 1-4 above. Where something is ambiguous or
   unreviewed, leave it out rather than guessing — an incomplete public page
   is fine; a wrongly-public internal document is not.

Stop after the classification pass (step 1) and summarize what you're
treating as public vs. internal vs. deferred before building any display
code, so I can correct anything before it's built rather than after.
```

## Why this is scoped the way it is

This mirrors the same discipline used for the broader Media Intelligence
Pipeline and external data sources docs — real, valuable content, but
sequenced so nothing gets exposed prematurely. The three real risks here
(internal docs marked as such by your own team, no real results existing
yet, real people's public consent) are the kind of thing worth catching
before a page renders, not after.
