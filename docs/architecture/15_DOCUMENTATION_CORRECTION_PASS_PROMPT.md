# Documentation Correction Pass — attribution, cross-references, decision log

**Documentation only.** No code, no schema, no migrations, no changes to
anything under `lib/`, `app/`, or `prisma/`. If a fix appears to require a
code change, stop and report it rather than making it. Do not begin T10.

Land this as one commit (or a small number of clearly-scoped ones), not
four separate passes.

**Verify before assuming:** confirm the next available ADR number and the
current contents of every file named below against the live repository.
Line numbers and section numbers cited here come from a snapshot and may
have moved.

---

## Part A — Honey rubric: correct the attribution, build the enhanced original

`BEVERAGE_SENSORY_PROTOCOLS.md`'s honey 100-point competition rubric and
three-tier defect taxonomy currently carry a hedge attributing them to
"UC Davis-attributed training material and general honey sensory
literature," with a note that the institutional origin is unverified.

**That hedge is wrong in the direction nobody checks for.** The material is
Daniel's own work. The platform's attribution discipline exists to stop it
claiming what isn't its own — it should equally stop it disclaiming what
is. An unverifiable institutional hedge in front of the author's own
material is an accuracy failure, not a conservative one.

Two things to do:

1. **Correct the attribution** to record Daniel Giráldez as the author.
   Where his training background is genuinely relevant context, it can be
   stated as background ("developed by the author, informed by professional
   sensory training") — but the rubric is not to be presented as derived
   from an institution whose involvement cannot be confirmed.

2. **Rebuild it as an enhanced original.** Not a relabelling of the
   existing text: restructure the point allocation, category definitions,
   and wording in the platform's own voice and the author's own current
   thinking, the same way `COMPETITIONS.md` §4a built original tooling from
   an operational pattern. This resolves any residual question about
   phrasing inherited from training materials, and produces a better
   artifact than the compiled version it replaces. Preserve the existing
   version per the platform's version-preservation rule
   (`DATA_ARCHITECTURE.md` §2) rather than deleting it.

**AESHI is a separate, still-open question — do not touch it.** The mead
source is currently described with more confidence than anything else in
the document ("a real trade-association manual grounded in actual
Spanish/EU law") and carries no equivalent hedge. That characterization is
awaiting Daniel's confirmation. Flag it in your report as open; do not add
a hedge, remove one, or alter the AESHI content in this pass. The Chapter IV
exclusion stays exactly as it is.

## Part B — Review the skipped `TOURISM_EXPERIENCES.md` diff

Commit `4080633` changed `TOURISM_EXPERIENCES.md` (+60/-6) alongside the two
files already reviewed. The verification pass correctly treated it as out of
scope because it wasn't named. Review it now against the same three
questions applied to the others:

- Is new content original, properly-cited non-copyrighted material, or
  third-party copyrighted text reproduced or closely paraphrased?
- §13's mead course content draws on real curricula and names real faculty
  (Bernardo Sequeira, Luis Valdez, Marcelino Guevara, Gustavo Berrios) —
  confirm named individuals appear as factual collaborator references, not
  as invented quotes, endorsements, or attributed opinions (CLAUDE.md §54).
- Is any institutional attribution asserted as fact where the source is
  actually unverified?

Report findings. Correct only clear attribution errors; anything ambiguous
goes in the report for Daniel to decide.

## Part C — The `EXTERNAL_DATA_SOURCES.md` cross-reference

No file has that name. It appears in at least five places:
`GUIDED_FIELD_STUDY_TOOL.md` §5, `MAP_AND_TERRITORY.md` §6 and §10, and the
reading lists of `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_PROMPT_CORRECTED.md` and
`NECTAR_NOMADA_BRAND_MARKETING_COMMUNITY_SALES_INPUT_CORRECTED.md`. Search
the whole repository — that list may be incomplete.

**Do not blanket-replace.** Two real documents are candidates
(`NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md`, the source catalog, and
`EXTERNAL_DATA_ARCHITECTURE.md`, the adapter/architecture review), and the
right target differs per reference. `GUIDED_FIELD_STUDY_TOOL.md` §5 cites
GBIF/iNaturalist *adapters*, which is architecture; `MAP_AND_TERRITORY.md`
§6 cites a Sentinel Hub/Copernicus adapter, likewise. Check what each
reference actually points at and resolve it to the document that genuinely
contains that content.

Note that `EXTERNAL_DATA_ARCHITECTURE.md`'s own opening already flags this
filename mismatch — it was known and never propagated.

## Part D — Decision log housekeeping

1. **Four planning documents end with "Log acceptance in `DECISIONS.md`"
   and have no entry there**: `MAP_AND_TERRITORY.md`,
   `OFFLINE_FIELD_CAPABILITY.md`, `DRIVE_ORGANIZATION_SCHEME.md`,
   `TOURISM_DESIGN_RESOURCES.md`. Log them, following the existing pattern
   for accepted planning input (accepted as domain-model/planning input,
   sequencing deferred, not an immediate build order). One ADR covering all
   four is fine if that matches how prior batches were logged — check
   ADR-026's precedent.

2. **The Publer reversal is unlogged.**
   `NECTAR_NOMADA_BRAND_MARKETING_COMMUNITY_SALES_INPUT_CORRECTED.md` states
   explicitly that the shift to Publer should be its own `DECISIONS.md`
   entry *because it reverses a previously-recorded decision*. Searching
   `DECISIONS.md` for "Publer" currently returns nothing. Log it, including
   what it reverses.

3. **`ADR-037_DRAFT.md` is sitting in `lib/rbac/`.** That's application
   code; an ADR there is invisible to anyone reading the architecture set
   and will drift from `DECISIONS.md`, which is the source of truth for
   "why." Append its content to `DECISIONS.md` as a properly-numbered ADR
   (verify the number against the live file) and delete the draft rather
   than leaving a second copy.

4. **Credential lists omit BJCP.** `BEVERAGE_SENSORY_PROTOCOLS.md` §7.3 and
   `COMPETITIONS.md` §5 both enumerate Daniel's sensory credentials
   ("UC Davis / AROXA-Cara / FlavorActiV," "UC Davis/FlavorActiV/Cicerone")
   without BJCP certification — which is both real and the credential most
   relevant to the licensing questions those documents discuss. Add it.

## Part E — Report

List every change made, with file and section. Separately list anything you
found but did **not** change, and why — particularly anything ambiguous in
Part B, and the AESHI item from Part A. Note any additional occurrences of
the Part C filename beyond the five named.

Do not begin T10, and do not touch T9.5's work if it has already landed.
