# Recipes, Formulation & Distillation — Néctar Nómada Digital Platform

Extends `DOMAIN_MODEL.md` §4 (Fermentation & Beverage, Research OS's
`Protocol → ProtocolVersion`, Agricultural Traceability) and
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §4-5 (the `material.*` wood chain,
which names `DistillationRun` as a known gap — specified here). Response
to `docs/implementation/23_RECIPES_FORMULATION_DISTILLATION_PROMPT.md`.

**Planning only, as instructed. No code, no schema, no migrations were
touched producing this document.**

**Not v1, and not scheduled.** v1 is defined by ADR-039's harvest test and
now includes apiary (`22_APIARY_V1_SCOPING_REPORT.md`); the
November-April window is production, not development time. This document
exists so the design is settled before brewing, distillation, or
formulation work is actually scheduled — the same reason every other
planning document in this set was written ahead of its build.

---

## 1. The central gap this fills

Every fact-bearing table this platform has built records **execution** —
this run, these inputs, these measurements. Nothing records **intent**: a
reusable formulation with target quantities, scalable by batch size,
against which an actual run can be compared. That is the difference
between a log and a recipe.

The pattern already exists three times: `Protocol → ProtocolVersion`
(Research OS, specified), `SensoryProtocol → SensoryProtocolVersion`
(built, Slice 6), `material.toast_char_protocol →
toast_char_protocol_version` (specified,
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §4). §2 below determines whether
a recipe is a fourth instance of that shape, a specialization, or
genuinely its own thing.

## 2. Recipe versus `Protocol` — the decision, with reasoning

**Decision: `Recipe`/`RecipeVersion` is a fourth instance of the
versioned-template pattern — its own dedicated table pair, not literal
rows in Research OS's `Protocol` table, and not a subtype/specialization
via inheritance.**

This mirrors `material.toast_char_protocol_version`'s own precedent
exactly, for the identical reason it was built that way: the *mechanism*
(versioned, immutable once referenced by an execution, `superseded_by`
per `DATA_ARCHITECTURE.md` §2) is fully shared, but the *content* is
domain-specific shape that has no home in `Protocol`'s own fields — an
ingredient list with proportional quantities and target process
parameters (mash schedule, hop schedule, target gravity) is not
expressible in a table designed for experimental procedure steps, any
more than toast/char levels were. `DOMAIN_MODEL.md` §4's own governing
rule applies without modification: shared infrastructure where semantics
are genuinely shared, domain-specific tables only where they diverge.
Reusing `Protocol` literally (inserting Recipe content into
Research-OS-shaped rows) would either force Recipe's ingredient lists
into a JSONB `attributes`-style escape hatch — exactly what
`DATA_ARCHITECTURE.md` §3 exists to bound, not license — or bloat
`Protocol` with columns meaningless to every non-recipe use of it.

```
formulation.recipe(id, name, beverage_class[beer|mead|wine|cider|
  fruit_wine|chicha|guarapo|sake|kombucha|craft_soda|distillate|
  coffee_fermentation|other], description, status, created_at, created_by)

formulation.recipe_version(id, recipe_id, version, superseded_by
  (self-FK, null = current),
  reference_batch_size, reference_batch_size_unit,
  target_carbonation[forced|natural_bottle|none|not_applicable] (nullable),
  process_notes, created_at, created_by)

formulation.recipe_ingredient(id, recipe_version_id,
  ingredient_name, role (nullable, e.g. "base malt", "bittering hop",
  "primary yeast" — free text, not a controlled vocabulary v1 doesn't need),
  quantity, quantity_unit, timing_note (nullable — "60 min boil",
  "day 3 addition"), source_lot_type (nullable, informational — "coffee
  Lot", "rice Lot" — not an FK; see below), notes)
```

**A new `formulation` schema**, not `traceability`, flagged as a decision
requiring confirmation (§10) rather than decided unilaterally — Recipe is
conceptually closer to Research OS's `Protocol` (an intent record) than
to Traceability's execution records, and `material.*` already established
that a genuinely new conceptual layer gets its own schema rather than
being folded into an existing one for convenience.

**Quantities are stored once, relative to `reference_batch_size`, not
duplicated as both absolute and percentage.** BeerSmith/Brewer's
Friend-style tools store recipes proportionally so they scale to any
target batch size — the platform gets this by storing each ingredient's
quantity *at the recipe's own stated reference size* and computing
`actual = recipe_quantity × (target_batch_size / reference_batch_size)`
at read/execution time. Storing a separate percentage column alongside
the absolute quantity would let the two drift out of sync on edit; one
stored number and one computed ratio cannot.

**`recipe_ingredient.source_lot_type` is informational text, not an
FK — deliberately.** A recipe is written before any specific Lot exists
to reference ("2kg of criollo rice" is a recipe statement; "Lot
RICE-2027-04, 2.1kg actually used" is an execution fact). Binding
ingredients to real inventory is an execution-time concern — see §5's
`recipeVersionId` placement below, not a recipe-authoring one. This
matches Brewer's Friend's own documented limitation directly: forcing a
recipe's ingredient rows to resolve against real inventory at
authoring time is exactly the design that produces its "duplicate
ingredient matches only the first line" bug. The platform avoids the
entire failure class by never attempting that resolution automatically —
see §4.

**How an execution references the version it ran under — corrected from
this document's own required reading.** `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`
§J sketches a `protocol_execution(executed_against_type,
executed_against_id, ...)` wrapper table for linking a `ProtocolVersion`
to whatever it was run against — a polymorphic parent pair. That sketch
predates ADR-020 decision 8, which explicitly rejected exactly this shape
in favor of specific nullable FKs, and every table built since
(`Measurement`, `Asset`, `LabourEntry`, `MaterialConsumptionEntry`) has
followed the later rule, not the earlier sketch. This document does not
propose a `recipe_execution` wrapper. Instead: **`LotTransformation`
gains one nullable `recipe_version_id` column.** Every run-shaped entity
this document specifies (`FermentationRun`, `DistillationRun`, a new
`SaccharificationRun`, §5a) already creates its start/end activity via
`LotTransformation` rows — confirmed directly against
`lib/traceability/fermentation.ts`, where `startFermentationRun`/
`endFermentationRun` both create `lotTransformation` rows tagged with
`fermentationRunId`. One additive column on the table every execution
path already writes to covers every case, including the one with no
specialized run entity at all (§5d's craft soda, via a plain `blend`
transformation). This is simpler than the three-or-more separate columns
an earlier draft of this reasoning considered adding to each run entity
individually, and it is the same "reuse the DAG node everything already
passes through" instinct §7 asks this document to apply.

**Expected-versus-actual comparison is out of this document's scope,
deliberately.** `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §J's
`Deviation` table ("Expected: Ferment 48h. Actual: Stopped at 42h") is
T11's own named scope (Process/Deviation tracking), correctly deferred
to v2 per ADR-039 and unchanged by this document. A `RecipeVersion`'s
target values sitting next to a run's actual `Measurement`/
`FermentationIntervention` history is already enough raw material for
T11 to compare against once it's built — this document does not invent
its own comparison mechanism, which would duplicate T11's job before T11
exists.

## 3. Reference patterns — BeerSmith/Brewer's Friend, mapped onto this platform

Studied for operational and UX structure only, per the standing rule
already applied to Beer Awards Platform (`COMPETITIONS.md`) and
Cropster/Airbnb elsewhere — the underlying concept, rebuilt in this
platform's own words and schema, never their field names or formulas
reproduced.

| Pattern | Maps onto | Notes |
|---|---|---|
| Recipe vs. session as separate objects | `RecipeVersion` vs. the execution run (§2) | Already the platform's own instinct (`Protocol`/`ProtocolVersion` vs. execution) — this is confirmation, not new ground. |
| Recipe versioning and cloning | `version`/`superseded_by` (`DATA_ARCHITECTURE.md` §2) | "Cloning" is a service-layer convenience (copy a version's fields into a new draft), not new schema. |
| Scaling | `reference_batch_size` + computed ratio (§2) | No stored percentage column — see §2's reasoning against duplication. |
| Equipment profiles | Deliberately **not** designed here — see §9 | Real coupling, wrong document to resolve it in; `18_EQUIPMENT_AND_READINESS_PROMPT_REVISED.md` hasn't been executed yet (confirmed — no `EQUIPMENT_AND_READINESS.md` exists in the repository). |
| Inventory deduction on execution | Lot-tracked ingredients: existing `QuantityEvent`/`LotTransformation`. Non-lot-tracked (sugar, hops, chemicals): `MaterialConsumptionEntry` (T12.6, built) | No new mechanism for either case — see below. |

**The Brewer's Friend duplicate-ingredient bug doesn't apply here,
because the mechanism it would apply to isn't built, and this document
doesn't propose building it.** Brewer's Friend's limitation is in
*automatic* inventory matching — when a recipe names an ingredient twice,
its resolver draws only from the first matching stock line. This
platform has no automatic ingredient-to-inventory resolver at all, by
design: a non-lot-tracked consumable's use is *recorded*, manually, per
occurrence, via `MaterialConsumptionEntry` — the exact mechanism T12.6
already built and verified for fermentation/drying material consumption,
extended here by reference, not reinvented. `MaterialConsumptionEntry`'s
own free-text `materialName`/`batchLabel` shape (no FK to a `Consumable`
entity, since none exists — `18_EQUIPMENT_AND_READINESS_PROMPT_REVISED.md`
§8 owns that future model) is reused wholesale for recipe-driven
consumption too. There is no automatic matching step to have the bug in.

### 3a. Domain literature — facts free, expression not

The distinction governing this document's use of published brewing
literature is **fact versus expression**, more permissive than the rule
applied to BJCP scoresheets (`BEVERAGE_SENSORY_PROTOCOLS.md` §1) because
the material differs in kind. Free to inform this model: that mash
conversion is enzymatic and temperature-dependent; that hop timing in a
boil trades bitterness for aroma; that a gravity reading needs
temperature correction; that brewhouse efficiency varies by equipment —
domain knowledge, not authored content, and public-domain technical fact
in the case of standard formulae (IBU, gravity-to-ABV, water-to-grain
ratios). Not reproduced: any author's prose, worked examples, table
layouts, or descriptive vocabulary as they constructed it.

Where this document's design reflects **John Palmer's *How to Brew***
(process mechanics — mash chemistry, saccharification timing) or
**Randy Mosher's *Tasting Beer* / *Designing Great Beers*** (formulation
and evaluation structure), both are cited here by name as the
grounding — the same attribution discipline `TOURISM_DESIGN_RESOURCES.md`
already applies to Victor Jiménez and SERNATUR. Where a design choice in
this document instead reflects the product owner's own twenty-five years
of homebrewing, twelve as a professional brewer, and CRBF Beer School
training, rather than a published source, it is attributed to him — the
honey rubric in commit `c913595` is the standing precedent, and the
discipline runs both directions: this platform should neither claim
Palmer's or Mosher's expression as its own, nor disclaim the product
owner's own domain expertise as though it needed a book behind it. The
staged-substrate-addition reasoning in §5b and the culture-identity
model in §5c are the product owner's own domain judgment applied to this
platform's existing structure, not drawn from either book.

## 4. `DistillationRun` — specified

Follows `FermentationRun`'s exact shape and lifecycle conventions
(`lib/traceability/fermentation.ts`), with one deliberate correction
noted below.

```
model DistillationRun {
  id, stillType [pot|alembic|column|hybrid|other],
  chargeVolume, chargeUnit,
  heatSource (nullable, free text — "direct fire"/"steam"/"electric";
    not worth an enum at this scale),
  startedAt, endedAt (nullable),
  operatorPersonId (nullable),
  notes,
  createdAt, createdBy
}

enum DistillationCutType { heads, hearts, tails, other }
enum StrengthUnit { abv_pct, proof }

model DistillationCut {
  id, distillationRunId,
  cutType DistillationCutType,
  volume, volumeUnit,
  strength, strengthUnit StrengthUnit,
  strengthTemperatureC (nullable — "a reading without its temperature is
    not a measurement," per this document's own source prompt, applied
    literally: a strength reading with no temperature is not recorded
    as a strength reading),
  collectedAt,
  provenanceClass, dataQuality,
  notes,
  createdAt, createdBy
}
```

**Lifecycle, matching `FermentationRun` exactly:** `startDistillationRun`
creates the run plus a `stage_change` `LotTransformation` (input: the
Lot being charged — a fermented wash, a guarapo sub-lot, whatever the
source is; zero outputs, nothing changes identity yet). `recordCut` is
the simple typed log entry during the run, mirroring
`recordFermentationIntervention`. `endDistillationRun` sets `endedAt`
once and creates the second `stage_change` transformation, output: a new
`Lot` (`lotType: distillate`), seeding its `QuantityEvent` exactly as
`endFermentationRun` already does for its own output lot.

**Yield is computed, never stored** — the same principle
`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §G already established for
`Lot` quantity generally: charge quantity and output quantity are both
already `QuantityEvent`-ledger facts once the run's transformations
exist; yield is `output / charge`, a query, not a column that could
drift from the numbers it's supposed to summarize.

**Multiple passes need no new field.** A second pass's
`startDistillationRun` simply takes the first pass's *output* `Lot` as
its own input `lotId` — the existing `LotTransformation` chain (already
proven for coffee's fermentation → drying sequence) already expresses
"this run followed that one" without a dedicated `priorPassRunId`
self-FK. An earlier draft of this section proposed exactly that FK before
recognizing the lineage walk (`getLotLineage`, built in T1) already
answers "how many passes has this spirit had" for free — flagged here
as a considered-and-rejected addition, consistent with this whole
document's reuse-before-creating discipline.

**Deliberate correction, not a blind copy:** `FermentationRun`'s own
closest analog, `FermentationIntervention`, does not carry
`provenanceClass` — checked directly against `prisma/schema.prisma`, a
real gap T9.5's retrofit didn't reach (ADR-038 named five specific
tables and stopped there; `22_APIARY_V1_SCOPING_REPORT.md` §1a found the
same gap independently while designing `ColonyEvent`). `DistillationCut`
gets `provenanceClass`/`dataQuality` regardless, per ADR-038 applied
again, and per this document's own §1 required reading ("provenance
fields required per ADR-038") stated as an instruction, not a suggestion.

Provenance/nullable-parent-FK conventions throughout: ADR-020 decision 8
(specific nullable FKs, never polymorphic), applied without exception.

## 5. The beverage classes, and the three assumptions they break

Not a completeness exercise — these are Néctar Nómada's real or intended
production. Traced against the model built so far (§2, §4, and the
already-built Fermentation/Drying/Lot machinery).

**What's shared, what stays specialized**, per `DOMAIN_MODEL.md` §4's own
governing principle: `FermentationRun`, `DistillationRun`,
`RecipeVersion`, `Lot`/`LotTransformation`, `Measurement`, `Sample` are
shared infrastructure across every class below — none of them needs a
parallel implementation. Beer's mash schedule, wine's must composition,
and sake's koji propagation are domain-specific *content* (recipe
ingredient rows, `Measurement.variable` values, the new
`SaccharificationRun.agent` field, §5a) layered on that shared
infrastructure, never a second copy of the infrastructure itself.

- **Beer** (mash, hop additions by time, water treatment) — mash is
  §5a's `SaccharificationRun`; hop additions by time are exactly the
  staged-addition gap §5b's sake trace surfaces and this document
  recommends fixing (`FermentationIntervention` gaining an optional
  Lot/quantity reference) — beer needed the same fix sake did, sake's
  trace just found it first.
- **Mead, wine, cider** — already real work here
  (`TOURISM_EXPERIENCES.md` §13's mead course); `FermentationRun` as
  built already covers this without modification.
- **Fruit wines** — same as wine; the fruit is a `Lot` (harvested or
  received) feeding a `FermentationRun`, no new mechanism.
- **Chicha / chicha fuerte** — traditional (salivary amylase) and modern
  (malting) both saccharify before fermenting; §5a's `SaccharificationRun`
  covers both with the same table, `agent` distinguishing them.
- **Guarapo** — traced in full, §7 (Trace 1). Terminal-and-intermediate
  forking confirmed to hold on the existing multi-output `split`
  mechanism.
- **Sake** — traced in full, §7 (Trace 2), and breaks two real
  assumptions, addressed directly in §5b.
- **Kombucha** — a consortium culture (§5c) with a secondary bottle
  fermentation; `carbonationMethod` (§5d) is `natural_bottle`, no new
  mechanism beyond that field.
- **Craft sodas** — the independence test, §5d. Passes: no
  `FermentationRun` involved at all.
- **Rum and other distillates** — §4, `DistillationRun` directly.
- **Caramelization of cane juice** (miel → melaza → raspadura → panela)
  — traced in full, §7 (Trace 1's caramelization branch). A sequence of
  `stage_change` transformations, endpoint-triggered by `Measurement`
  (Brix/temperature), not time — zero new mechanism, addressed fully in
  §6.
- **Coffee fermentation protocols** — CryoBloom's cold hold (defined
  culture, dose, temperature range) is exactly what `RecipeVersion` + a
  `FermentationRun` referencing it (§2's `recipeVersionId`) already
  expresses; this is the first real consumer of the Recipe/Protocol
  distinction this document exists to build.

### 5a. Saccharification — specified once, as its own step

Nothing in the built schema expresses converting starch to fermentable
sugar. Beer's malt enzymes, sake's koji (*Aspergillus oryzae*),
chicha's salivary amylase or malting are one shared step with different
agents, not three domain-specific solutions.

```
enum SaccharificationAgent { malt_enzymes, koji, salivary_amylase, other }

model SaccharificationRun {
  id, agent SaccharificationAgent,
  startedAt, endedAt (nullable),
  targetTemperatureC (nullable), targetDurationMinutes (nullable),
  targetConversionNote (nullable — free text; a numeric target-gravity
    style field isn't universal enough across malt/koji/salivary agents
    to force into one column),
  operatorPersonId (nullable),
  provenanceClass, dataQuality,
  notes,
  createdAt, createdBy
}
```

Same lifecycle shape as `FermentationRun`/`DistillationRun`: start
creates a `stage_change` transformation (input: the substrate lot, zero
outputs); end creates the second transformation, output: a new `Lot`
where the saccharified material is itself a distinct traceable
intermediate (koji rice — see §5b) — or, for beer's mash, the output
*is* the wort feeding directly into a separate `FermentationRun`,
exactly matching how coffee's own Processing → Fermentation is already
two separate `stage_change` transformations rather than one entity doing
both jobs.

For the **serial** case (beer, chicha, most saccharification: convert,
then ferment), this is the whole story — one `SaccharificationRun`
precedes and feeds one `FermentationRun`. The **parallel** case (sake) is
addressed directly in §5b, not forced into this same serial shape.

### 5b. Sake — breaks sequence and vocabulary; resolved without a new "parallel run" concept

Two distinct problems, both real.

**Problem 1 — koji and yeast run simultaneously, not serially.** Resolved
by *not* modeling simultaneity as two concurrently-active run rows at
all. Koji-making happens first and separately: a `split` transformation
takes a portion of steamed rice as its own sub-`Lot`, and a
`SaccharificationRun` (agent: `koji`) converts it, producing a distinct
`Lot` (`lotType: koji`) — fully serial, §5a's ordinary case. What
actually runs "in parallel" is enzymatic activity *within* the main
mash (the moromi), not two competing database rows — koji, once added to
the moromi, keeps converting starch while yeast simultaneously ferments
what's already converted. That's representable as **one ongoing
`FermentationRun`** whose intervention history records each addition of
koji and rice, addressed in Problem 2 below. No new "concurrent run"
concept is needed because nothing in the data model actually needs to
represent two processes racing each other in real time — it needs to
represent what was added, when, and how much, which is an event-log
problem, not a concurrency problem.

**Problem 2 — staged substrate additions (*sandan jikomi*, three
additions over several days) — and the real gap this surfaces.**
`FermentationIntervention` as currently built
(`interventionType`/`occurredAt`/`notes` only, confirmed against
`prisma/schema.prisma`) has no way to record *what* was added or *how
much*. This blocks sake's three-stage build, and — worth stating plainly,
since it changes the size of the finding — it **already blocks beer's own
hop-addition-by-time pattern named in §3**, on infrastructure that has
shipped and is in production use for coffee today, simply never yet
exercised in a way that needed a quantity attached to an `addition`
intervention. This is the single most concrete finding this document
makes, and it is exactly the kind of break the source prompt asked to be
reported plainly rather than designed around silently.

**Recommended fix, additive only:** `FermentationIntervention` gains two
nullable columns — `addedLotId` (references `Lot`, specific nullable FK,
ADR-020 decision 8 pattern again) and `quantity`/`unit`. Sandan jikomi's
three additions become three `addition`-type intervention rows against
one ongoing `FermentationRun`, each optionally referencing the
rice/koji/water `Lot` and amount added — the moromi keeps one continuous
identity throughout, matching how sake is actually practiced (one batch,
staged, not three separate batches), and mass balance (§6) becomes
answerable by summing intervention quantities alongside the run's
start/end `QuantityEvent`s. A heavier alternative was considered and
rejected: modeling each addition as its own `merge`-type
`LotTransformation` producing a new intermediate Lot at every stage.
Rejected because it creates three extra Lot identities for what is, in
practice, one physical batch — technically defensible, but a needless
genealogy-display cost for no corresponding traceability gain the
lighter fix doesn't already provide. Flagged for product-owner
confirmation in §10 regardless, since it's a real design choice, not an
obvious one.

**The rice is a `Lot`, not an ingredient — confirmed.** Criollo rice
varieties from partner farms have origin, variety, harvest, and a
producer, the identical shape coffee cherry has from a finca. Sake
extends the existing farm-to-glass chain at its entry point; it needs no
new mechanism there, only the same small per-domain harvest-event table
already recommended for apiary's honey harvest and for cane (§7, Trace 1)
— `HarvestEvent`'s own columns (`cherryWeightKg`, `brix`, `condition`)
are coffee-cherry-specific by name even though the underlying concept
(harvested mass, quality reading) is generic. This is the same finding
made independently three times now (apiary, cane, sake) — a real signal,
flagged as an open question in §10 rather than resolved here, since
resolving it means touching `HarvestEvent`, a table with real production
rows, which is out of a planning document's authority to decide
unilaterally.

### 5c. `Culture` — three genuinely different epistemic states, not one field

**The epistemic point matters more than the taxonomy:** "spontaneous"
means the organisms are unknown, which is a `data_quality` statement
(`DATA_ARCHITECTURE.md` §4), not a culture name. A model that records
`culture = "spontaneous"` as though it were an identified organism
asserts knowledge nobody has — exactly the sentinel-value failure mode
`DATA_ARCHITECTURE.md` §4 already prohibits for any missing fact.

Two orthogonal axes, not one field, and not a `spontaneous` value sitting
in the same vocabulary as `defined` as though they were peers:

```
enum CultureStructure { single_strain, consortium, unknown_structure }

model CultureComponent {
  id,
  fermentationRunId (nullable), saccharificationRunId (nullable)
    — specific nullable FKs, ADR-020 decision 8, not a polymorphic parent,
    consistent with Measurement's own multi-parent precedent,
  organismName (nullable — null means genuinely not identified, not
    "unknown" as a string),
  strainLabel (nullable — e.g. "SafOno MP-72"), supplier (nullable),
  batchLabel (nullable — capture-or-lose-it identity per T12.6's own
    precedent, when a defined strain's specific batch matters),
  role (nullable, free text — "primary yeast", "koji mold", "acetic
    bacteria" — useful for consortia, not a controlled vocabulary),
  identifiedAt (the date this specific identification was made — can be
    long after the run itself, see below),
  provenanceClass, dataQuality,
  createdAt, createdBy
}
```

`CultureStructure` is a *structural* fact (one organism, a community, or
we don't even know that much) carried on the run itself.
`CultureComponent` rows carry *identity*, zero or more per run — a
defined single-strain fermentation might have exactly one row (name,
supplier, batch); a kombucha SCOBY or sake's koji-plus-yeast system might
have several (`role` distinguishing them); a spontaneous fermentation has
**zero** `CultureComponent` rows at the time of the run, which is the
honest representation, not a row that says "spontaneous."

**How a later identification attaches without rewriting what was
recorded** — the case explicitly named: a wild isolate from the Boquete
bioprospecting work, eventually characterized months after the run it
came from. The answer is purely additive: a new `CultureComponent` row
is inserted whenever identification happens, with its own `identifiedAt`
independent of the run's `startedAt`, `provenanceClass` reflecting how it
was identified (`scientific_evidence` for a lab characterization,
distinct from the `direct_observation` the run itself was logged
under), pointing back at the already-existing, untouched
`FermentationRun`. Nothing about the original run record changes — the
run simply accumulates a second `CultureComponent` row alongside its
absence-of-identity-at-the-time, both permanently visible in order,
which is the same "never rewrite, add a new version instead" discipline
`DATA_ARCHITECTURE.md` §2's `superseded_by` pattern already runs on,
applied here by insertion rather than supersession since there's nothing
to supersede — an absence of knowledge isn't a prior version of a fact,
it's the honest absence of one.

### 5d. Craft sodas — the independence test, and it passes

A craft soda has a recipe, ingredients, batch scaling, forced
carbonation, a finished product, and **no `FermentationRun` anywhere.**
This is the cleanest test of whether recipe is genuinely decoupled from
fermentation or accidentally welded to it.

It passes cleanly, and passes *because* §2 put `recipeVersionId` on
`LotTransformation` itself rather than on any specialized run entity.
A soda batch is a `blend`-type `LotTransformation` (N lot-tracked
ingredient inputs, plus free-text `MaterialConsumptionEntry` rows for
non-lot-tracked ones, one output Lot) carrying its own
`recipeVersionId` directly — no `FermentationRun`, no `SaccharificationRun`,
no `DistillationRun` involved at any point. If `recipeVersionId` had
instead been added separately to each of those three run entities (an
earlier draft of §2 considered exactly that), craft soda would have had
nowhere to attach its recipe at all, which would have been the tell that
the design was still coupled. It isn't.

**Carbonation needs no new table.** `RecipeVersion.targetCarbonation`
(§2) states intent. The achieved value is a `Measurement` — the existing,
already-generalized table, gaining one new allowed `variable` value
(`carbonation_co2_volumes`, a unit-registry data addition in
`lib/traceability/units.ts`, not a schema change) — applicable across
beer, mead, cider, kombucha, and soda alike, exactly as the source prompt
names. Kombucha's secondary bottle fermentation is simply a second,
ordinary `FermentationRun` (or a staged intervention within one, §5b's
fixed mechanism); forced carbonation is a `stage_change` transformation
with no biological run behind it at all, matching how the mechanism
genuinely differs while the recorded fact (achieved CO2 volumes) stays
one shared `Measurement` variable regardless of how it got there.

## 6. Mass balance and yield

Cane juice to concentrate loses most of its mass; a distillation run
yields a fraction of its charge. **The existing `QuantityEvent` ledger
already covers both, fully, with no extension needed** — this is worth
stating as confidently as the finding deserves, rather than hedging
where the evidence is clear.

Input quantity, output quantity, and loss are each already expressible:
every `stage_change` in a chain (miel → melaza → raspadura → panela,
charge → cuts → distillate) is a `LotTransformation` with its own input
and output `QuantityEvent` rows; loss is the arithmetic difference,
computed at read time (a report concern), never a stored column that
could drift from the ledger it's supposed to summarize — the same
"computed, never stored" principle already governing a `Lot`'s current
quantity generally (`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §G).
Brix and temperature at each caramelization stage are already
expressible via the existing `Measurement` table's generic
`variable`/`value`/`unit` shape — no new fields required there either.

**Endpoint-triggered stages need no new mechanism.** That "a target Brix
or temperature endpoint... distinguishes" miel from melaza from raspadura
from panela doesn't require an automated trigger — it requires an
operator to end a stage when a `Measurement` they just took says the
condition is met, exactly how coffee's own fermentation-to-drying
transition already works today (an operator decision, informed by
readings, recorded as a `stage_change` at the moment it's made). Nothing
about the caramelization chain asks the schema to do anything coffee's
existing chain doesn't already do.

## 7. Two worked traces

### Trace 1 — Cane: harvest → trapiche → fork (caramelization / fermentation) → fermented guarapo forks again (bottling / distillation) → barrel aging on tracked laurel → sensory

1. **Harvest.** Cane is harvested from a farm plot — structurally
   identical to coffee cherry (origin, weight, a couple of quality
   readings, `resultingLotId`), but `HarvestEvent`'s literal columns
   (`cherryWeightKg`, `brix`, `condition`) are coffee-cherry-named. Same
   finding as §5b's rice case and `22_APIARY_V1_SCOPING_REPORT.md`'s
   honey-harvest case — a small per-domain harvest-event table, not a
   forced reuse of coffee's own. Flagged once here, not repeated at
   length; see §10 for the open "generalize after three instances"
   question this now genuinely raises.
2. **Trapiche (juice extraction).** A `stage_change` transformation,
   input: harvested cane `Lot`, output: cane-juice `Lot`
   (`lotType: cane_juice`, one new enum value). Fully covered.
3. **Juice forks to caramelization and fermentation.** A `split`
   transformation, one input (the cane-juice `Lot`), two outputs. This
   is the exact multi-output mechanism already verified for a green
   coffee lot roasted three ways, applied here without modification —
   **confirmed holds**, per the source prompt's own request to confirm
   it.
4. **Caramelization: miel → melaza → raspadura → panela.** A chain of
   `stage_change` transformations (four new `LotType` values), each
   endpoint justified by a `Measurement` (Brix/temperature) per §6 — zero
   new mechanism.
5. **Fermentation.** An ordinary `FermentationRun` (built, T6) —
   guarapo's yeast is likely `single_strain` or `spontaneous` per §5c;
   the model already carries either honestly.
6. **Fermented guarapo forks to bottling (terminal) and distillation.**
   A second `split` transformation, one input, two outputs — the same
   already-proven mechanism as step 3, **confirmed holds**, directly
   satisfying the source prompt's own claim that this is "the same DAG
   node with two children already proven for roast lots."
7. **Distillation.** `DistillationRun` (§4, this document's own new
   entity) — input: the distillation-bound guarapo sub-lot, cuts
   recorded per §4's `DistillationCut`, output: a `distillate` `Lot`.
8. **Barrel aging on laurel (*Cordia alliodora*) from a tracked
   `Specimen`.** The wood chain (`SPECIMEN_AND_MATERIAL_TRACEABILITY.md`
   §4-5) reused wholesale: `Specimen → WoodHarvest → CuringBatch →
   ToastCharProtocolVersion → Vessel → AgingRun`, `AgingRun.baseProductReference`
   pointing at the distillate `Lot` from step 7
   (`base_product_type: spirit`). Zero new mechanism — this is, per the
   source prompt's own framing, the platform's most distinctive claim: a
   chain from an individual tree to a finished glass, already fully
   specified before this document existed.
9. **Sensory.** `createSampleFromLot` (T5, built, domain-agnostic)
   produces a `Sample` from the aged distillate `Lot`;
   `getSensoryLinkageForSamples` (T12, built) surfaces the result. Zero
   new mechanism.

**Trace does not break.** Every step is covered by an existing mechanism,
at most one new `LotType` enum value per stage, and this document's own
`DistillationRun`.

### Trace 2 — Sake: criollo rice → polish → koji → staged moromi → press → sensory (the trace most likely to break, and where it does)

1. **Criollo rice as a `Lot`.** Confirmed holds, per §5b — same
   harvest-event naming friction as Trace 1's step 1, not repeated.
2. **Polishing.** A `stage_change` transformation (raw rice `Lot` →
   polished rice `Lot`), achieved polish ratio recorded as a
   `Measurement` (`rice_polish_ratio_pct`, one unit-registry addition).
   Zero new mechanism.
3. **Koji propagation.** A `split` transformation carves off a rice
   sub-`Lot`; a `SaccharificationRun` (§5a, agent: `koji`) converts it,
   output: a `koji` `Lot`. Fully covered by this document's own new
   entity.
4. **Parallel saccharification + fermentation, three staged additions
   (*sandan jikomi*).** **This is where the trace breaks, exactly as
   expected.** Resolved in §5b: one ongoing `FermentationRun`, three
   `addition`-type `FermentationIntervention` rows — but only once
   `FermentationIntervention` gains the `addedLotId`/`quantity`/`unit`
   columns §5b recommends. Without that fix, the three additions are
   recordable only as timestamped free-text notes, with no queryable
   link to which `Lot` (rice sub-lot, koji, water) or how much was added
   at each stage — real information loss for exactly the process this
   trace exists to test. Reported plainly, per the source prompt's own
   instruction, rather than designed around silently.
5. **Pressing (separating sake from lees).** A `stage_change`
   transformation, output: sake `Lot` (pre-filtration), one new enum
   value. Zero new mechanism.
6. **Sensory.** Same as Trace 1's step 9. Zero new mechanism.

**Trace breaks exactly once, at step 4, and the break has a small,
additive, already-specified fix (§5b).** Everything else — rice as a
farm-origin `Lot`, koji as a serial `SaccharificationRun`, the "parallel"
framing dissolving once staged additions are the actual unit of record —
holds without new architecture.

## 8. What is already proven and must be reused — confirmed, not redesigned

Per the source prompt's own explicit instruction:

- **The fork.** One input, several outputs at one transformation node —
  verified twice over in §7 (cane's two separate forks), using the
  identical code path as a green coffee lot roasted three ways.
- **The wood chain.** `wood_harvest → curing_batch → toast_char_protocol
  → vessel → aging_run`, reused wholesale in Trace 1, step 8, with no
  modification.
- **Sensory linkage.** `Sample` is canonical; every trace in this
  document reaches Sensory through T12's existing mechanism, unmodified.
- **Provenance.** Required, no default, chosen per operation — applied
  to every new table this document specifies (`DistillationCut`,
  `SaccharificationRun`, `CultureComponent`), with one gap in the
  precedent it borrows from (`FermentationIntervention`'s missing
  `provenanceClass`) deliberately not repeated (§4).
- **Typed execution records — `RoastSession` belongs in this document.**
  The gap the source prompt names for `RoastSession` ("the fork is
  representable but the distinction is not queryable, because 'light
  filter' versus 'medium espresso' lives only in a lot code and
  free-text notes") is the identical shape of problem `DistillationRun`
  exists to fix for distillation, raised explicitly earlier in this
  session's own discussion of roasting a single green lot three ways.
  Specifying both while the pattern is fresh is cheaper than re-deriving
  it later:

  ```
  model RoastSession {
    id, roastLevel (free text or a small enum — light/medium/dark/custom),
    chargeWeight, chargeWeightUnit, chargeTemperatureC (nullable),
    firstCrackAt (nullable), dropAt, dropTemperatureC (nullable),
    operatorPersonId (nullable),
    provenanceClass, dataQuality,
    notes, createdAt, createdBy
  }
  ```

  One deliberate simplification versus `FermentationRun`/`DistillationRun`'s
  two-transaction start/end shape: roasting is a single, short session
  (minutes, not days), so **one** `stage_change` transformation created
  at drop is sufficient — input: the green `Lot`, output: a new
  `lotType: roast` `Lot`. A "light filter, medium espresso, sample
  roast" three-way split from one green lot is three separate
  `RoastSession`s, each its own `split`-with-one-output transformation
  off the same source `Lot` — exactly what was already confirmed
  representable earlier in this session, now given a queryable typed
  record (roast level, drop temperature, development timing) instead of
  living only in a lot code and free text. Development-time ratio is
  **computed** from `firstCrackAt`/`dropAt`/`startedAt` at read time, not
  stored, same principle as §4's and §6's yield calculations.

## 9. Equipment profiles — coupled in concept, not in this document

**Agreed, conceptually: the same recipe yields differently on different
equipment** (efficiency, boil-off, vessel losses), and `material.vessel`
already exists for barrels and staves, directly adjacent to whatever
Equipment's own model eventually becomes. **Disagreed, procedurally: this
document should not be designed together with
`18_EQUIPMENT_AND_READINESS_PROMPT_REVISED.md` right now**, because that
prompt has not been executed — no `EQUIPMENT_AND_READINESS.md` exists in
the repository, and its own open questions (whether `material.vessel`
becomes an Equipment subtype, its three-axis lifecycle/allocation/
condition state model) are unresolved. Coupling this document's design
to an architecture that hasn't made its own foundational decisions yet
would mean guessing at those decisions here, informally, rather than
letting `18_`'s own pass make them properly.

What this document does instead, consistent with how `FermentationRun`
already handles the same gap: equipment stays **free text on the
execution**, not a field on `RecipeVersion`. `FermentationRun.vesselNote`
already exists for exactly this reason ("Tank 3" — no `Vessel` entity
yet, per its own schema comment) and `DistillationRun`/
`SaccharificationRun` (§4, §5a) both follow the identical pattern
deliberately. Once `18_`'s own architecture lands, an
efficiency/loss factor per equipment item could feed back into recipe
scaling math — noted here as the forward connection the source prompt is
right to flag, not built now, and not this document's decision to make
unilaterally.

## 10. Access / RBAC

Follows the established `Assignment → Scope → RoleProfile → Permission`
mechanism verbatim, no new machinery.

- **`DistillationRun`, `SaccharificationRun`, `RoastSession` writes**
  reuse `lot:manage` exactly as `FermentationRun`/`DryingRun` already do
  — scoped via the affected `Lot`'s project/location, same gate, no new
  permission.
- **`RecipeVersion` authorship is a distinct concern from execution, and
  gets its own permission — `recipe:manage`/`recipe:view`.** Deciding
  what *should* happen (writing or versioning a recipe) is a materially
  different trust level than *running* one — an operator trusted to
  execute a `FermentationRun` against an approved recipe need not also
  be trusted to change what that recipe specifies, the same distinction
  Research OS's own `Protocol` approval already draws from its
  execution. This is a real, meaningful split worth naming rather than
  folding into `lot:manage` wholesale, flagged for confirmation in §11
  since it's a new permission, not a reuse.
- **Partner-site access** for any of this occurring at a client
  engagement (a partner brewery, a client apiary's mead work) reuses
  `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §7's pattern verbatim —
  Project-per-engagement, `classification = partner`, leaf-scope
  containment. No new mechanism.

## 11. Decisions requiring product-owner input

Separated out per the source prompt's own instruction — not resolved
here, listed for approval or redirection.

1. **`formulation` as a new schema name for `Recipe`/`RecipeVersion`**
   (§2) — confirm, or place it elsewhere (e.g. folded into
   `traceability` despite the conceptual mismatch argued against in §2).
2. **`FermentationIntervention` gains `addedLotId`/`quantity`/`unit`**
   (§5b) — the single concrete schema change this document recommends
   against already-shipped infrastructure. Low migration risk (every
   Traceability table is empty in production as of this document, per
   ADR-039's own status findings), but real, and worth explicit sign-off
   given it touches a table already in use by coffee's built
   fermentation flow.
3. **The staged-addition alternative** (§5b) — the lighter fix
   (intervention gains optional Lot/quantity) versus the heavier one
   (each addition is its own `merge` transformation producing a new
   intermediate Lot). This document recommends the lighter fix; the
   heavier one is a real, considered alternative if richer per-addition
   genealogy display turns out to matter more than this document
   estimates it will.
4. **The `CultureComponent` model** (§5c) — a genuinely new design, not
   an extension of anything already built, and philosophically the
   highest-stakes recommendation in this document (getting the
   epistemics of "unknown" wrong would misrepresent evidence, not just
   under-model a feature). Worth explicit review before it's ever built.
5. **Per-domain harvest-event tables versus eventual generalization**
   (§5b, §7 Trace 1 step 1) — the same naming/shape friction found
   independently three times now (apiary honey, cane, sake rice) against
   coffee-named `HarvestEvent` columns. This document recommends
   continuing the per-domain-table pattern already set for apiary (a
   "rule of three" argument for revisiting generalization has now been
   met, but revisiting it means touching a production table, which is
   not this document's call to make alone).
6. **`RoastSession`'s inclusion in this document** (§8) — recommended
   yes, specified in full; confirm it belongs here rather than in its
   own separate pass.
7. **`recipe:manage` as a new permission** (§10) — recommended, not a
   reuse of an existing one; confirm before it enters any RBAC catalog
   seed.

## 12. Scope discipline

**Not in scope, named so they don't creep in:** commercial brewery
production planning, TTB or regulatory excise reporting, keg and
tap-room inventory, packaging line management, batch costing (belongs to
the operational-economics work, not this document), and any ingredient
or style database sourced from a third party. This is a solo-maintained
platform whose v1 is already committed through April — this document
specifies the smallest coherent thing that makes formulation and
distillation representable, not a brewery management suite.

## 13. Sequencing

**After v1.** v1 is defined by ADR-039's harvest test, now amended to
include apiary's own season-to-honey-batch test
(`22_APIARY_V1_SCOPING_REPORT.md` §6). Nothing in this document enters
v1, T11-T14, or any current ticket. This is planning input for whenever
brewing, distillation, sake, or cane work is actually scheduled — v1.1
or later, unscheduled, exactly as the source prompt's own header states.

**For `DECISIONS.md`, once reviewed:** log as accepted planning input,
not a build order — the same pattern ADR-026 already used ("Five
planning docs accepted: specimen/material traceability, ...") and
ADR-041 repeated for a second batch. A future entry here would read
something like: *"`RECIPES_FORMULATION_AND_DISTILLATION.md` accepted as
planning input — `Recipe`/`RecipeVersion` as a fourth versioned-template
instance, `DistillationRun`/`SaccharificationRun`/`RoastSession`
specified, the `FermentationIntervention` addition-quantity gap found and
its fix specified, `CultureComponent`'s three-way epistemic model
accepted. No build authorized by this entry."*

---

**End of document.** Planning only, as instructed — no code, schema, or
migration produced. §11's seven decisions are the actual output requiring
product-owner attention; everything else in this document is settled
design, not open questions.
