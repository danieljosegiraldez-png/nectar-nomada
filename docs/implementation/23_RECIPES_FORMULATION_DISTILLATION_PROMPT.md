# Recipes, Formulation & Distillation — architecture pass

**Planning only.** No code, no schema, no migrations. Produce one architecture
document plus a decisions list, following the pattern of
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` and `GUIDED_FIELD_STUDY_TOOL.md`.

**Not v1, and not scheduled.** v1 is defined by ADR-039's harvest test and now
includes apiary; the November–April window is production, not development time.
This document exists so the design is settled and nothing needs redesigning
when brewing, distillation, or formulation work is actually scheduled — the
same reason every other planning document in this set was written before its
build.

---

## 1. Required reading

- `DOMAIN_MODEL.md` §4 — Fermentation & Beverage, Research OS
  (`Protocol → ProtocolVersion`), Agricultural Traceability
- `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F, §G, §I
- `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §4–5 — the `material.*` wood chain,
  and §5's explicit note that `DistillationRun` is a known gap
- `DECISIONS.md` — ADR-020 (esp. decisions 5, 6, 8), ADR-038, ADR-039
- `DATA_ARCHITECTURE.md` §2, §4
- `BEVERAGE_SENSORY_PROTOCOLS.md`
- The built implementation: `lib/traceability/fermentation.ts`, `drying.ts`,
  `lots.ts`

## 2. The central gap: the platform records what happened, not what was intended

Every fact-bearing table in this platform records execution — this run, these
inputs, these measurements. Nothing records **intent**: a reusable formulation
with target quantities, scalable by batch size, against which an actual run can
be compared.

That is the difference between a log and a recipe, and it is the one structural
thing this document must add.

**The pattern already exists in the platform.**
`Protocol → ProtocolVersion` (`DOMAIN_MODEL.md` §4, Research OS) and
`SensoryProtocol → SensoryProtocolVersion` (built, Slice 6) are both exactly
this shape: a versioned template, never overwritten, with executions referencing
the version they ran under. `material.toast_char_protocol_version`
(`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §4) is a third instance.

**Determine whether a recipe is a fourth instance of that pattern, a
specialization of `Protocol`, or genuinely its own entity** — and justify the
answer. Do not create a parallel versioning mechanism; the platform has one and
it works.

## 3. Reference research — patterns, never reproduction

Study **BeerSmith** and **Brewer's Friend** for operational and UX patterns
only. The standing rule in this repository applies exactly as it did for Beer
Awards Platform in `COMPETITIONS.md` and for Cropster/Airbnb elsewhere: extract
the underlying structural concept and build it as original tooling in this
platform's own words and structure. Do not reproduce their schemas, field
names, formula implementations, ingredient databases, style data, or interface
text.

Specific patterns worth studying and why:

- **Recipe versus session as separate objects.** The template and its execution
  are different records; the session references the version it ran under. This
  is what allows "we brewed this recipe eleven times, here is how run 7
  differed."
- **Recipe versioning and cloning.** Refining a recipe without losing prior
  iterations — the platform's `superseded_by` convention
  (`DATA_ARCHITECTURE.md` §2) already expresses this.
- **Scaling.** A recipe stored proportionally, scaled to a target batch size.
  This is why quantities need a percentage or ratio basis, not only absolute
  amounts. Applies equally to coffee fermentation, mead, and cane.
- **Equipment profiles.** The same recipe yields differently on different
  equipment — efficiency, boil-off, vessel losses. This connects directly to
  `18_EQUIPMENT_AND_READINESS_PROMPT_REVISED.md` and is an argument that
  equipment and recipe should be designed as one coherent pair, not
  independently. Say whether you agree.
- **Inventory deduction on execution.** Running a session consumes stock.
  Brewer's Friend documents a real limitation here — when the same ingredient
  appears twice in a recipe, its matching logic draws only from the first
  matching inventory line. Worth knowing before designing the same mechanism.

Report what each pattern maps onto in this platform, and what genuinely has no
home yet.

### 3a. Domain literature — facts are free, expression is not

Two standard works may be studied for the underlying process and
recipe-design knowledge they describe: **John Palmer's *How to Brew*** for
process mechanics, and **Randy Mosher's *Tasting Beer* and *Designing Great
Beers*** for recipe formulation and evaluation. Both authors are personal
acquaintances of the product owner, and Craft Brewing Supply — the sister
company in the same building — sells their books to its customers. The
relationship is one of professional support, and studying their work while
respecting their copyright is exactly what that relationship warrants.

The distinction that governs use here is **fact versus expression**, and it is
more permissive than the blanket rule applied to BJCP scoresheets, because the
material is different in kind:

- **Free to inform the model:** the technical facts of the craft. That mash
  conversion is enzymatic and temperature-dependent; that hop additions early
  in a boil yield bitterness and late additions yield aroma; that brewhouse
  efficiency varies by equipment; that gravity readings need temperature
  correction. These are domain knowledge, not authored content — Palmer and
  Mosher drew them from prior literature themselves. Standard published
  formulae and reference tables (IBU calculation, gravity-to-ABV conversion,
  water-to-grain ratios) are likewise public-domain technical fact.
- **Not to be reproduced:** their expression of that knowledge. Their prose,
  chapter organization, worked examples, table layouts as they constructed
  them, and — with particular care — Mosher's descriptive sensory vocabulary,
  which is authored creative work. `BEVERAGE_SENSORY_PROTOCOLS.md` §1 already
  establishes exactly this discipline for sensory language; apply it here
  without loosening it.

**Cite them by name where their work informed a design decision**, the same way
`TOURISM_DESIGN_RESOURCES.md` cites Victor Jiménez and SERNATUR — attribution
to a real practitioner, in this platform's own words.

**One further source worth naming honestly: the product owner's own practice.**
Twenty-five years of homebrewing, twelve as a professional brewer, and CRBF
Beer School recipe-design training. Where the model reflects that experience
rather than a published source, attribute it to him — the honey rubric in
commit `c913595` is the precedent. Attribution accuracy runs both directions:
the discipline that stops this platform claiming what is not its own should
equally stop it disclaiming what is.

## 4. `DistillationRun` — the named gap, now specified

`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §5 flags this as a small gap "worth
adding when spirits work is actually scheduled," the same shape as
`FermentationRun`. Specify it:

- Still type (pot/alembic, column, hybrid), charge volume and source, heat
  source.
- **Cuts** — heads, hearts, tails — as a real structured record with volume and
  strength per cut, not free text. This is the distinguishing data of a
  distillation run and the thing that makes one run comparable to another.
- Strength measurement (ABV or proof) with temperature correction, since a
  reading without its temperature is not a measurement.
- Yield against charge, connecting to the mass-balance concern in §6.
- Multiple distillation passes where relevant, and how a second pass references
  its first.

Follow `FermentationRun`'s existing shape and conventions — provenance fields
required per ADR-038, nullable parent FKs never polymorphic (ADR-020 decision
8), append-only.

## 5. The beverage classes this must cover — and the three assumptions they break

These are real or intended production at Néctar Nómada, not a completeness
exercise. Trace each against the model and report where it breaks.

- Beer (mash profile, hop additions by time, water treatment)
- Mead, wine, cider — already real work here
  (`TOURISM_EXPERIENCES.md` §13's mead course)
- **Fruit wines**
- **Chicha and chicha fuerte** — fermented maize beverages
- **Guarapo** — fermented cane juice, **both as a terminal product and as an
  intermediate feeding distillation.** A single guarapo lot forking to bottling
  and to a still is the same DAG node with two children already proven for
  roast lots; confirm it holds.
- **Sake** — from partner-grown criollo rice varieties, using koji
- **Kombucha**
- **Craft sodas**
- Rum and other distillates
- **Caramelization of cane juice** — miel de caña → melaza → raspadura →
  panela are *stages of one continuous process*, not alternative products, and
  a target Brix or temperature endpoint is what distinguishes them
- Coffee fermentation protocols — CryoBloom's cold hold is already a
  formulation with a defined culture, dose, and temperature range

**Do not force these into one schema if doing so destroys meaning.**
`DOMAIN_MODEL.md` §4 already establishes the principle: shared infrastructure
where semantics are genuinely shared, domain-specific tables only where they
diverge (beer `MashProfile` versus wine `MustComposition`). Say clearly what is
shared and what must stay specialized.

Three of these break assumptions the current model actually holds. Address each
directly — they are the reason this section exists.

### 5a. Saccharification is a step the platform cannot represent

Nothing in the schema expresses **converting starch to fermentable sugar before
or during fermentation.** Beer's mash does it with malt enzymes; sake does it
with koji (*Aspergillus oryzae*); traditional chicha does it with salivary
amylase, modern chicha with malting. These are one shared step with different
agents — and none of beer, sake, or chicha is representable without it.

Specify it once, as its own step with a named agent and its own conditions
(temperature, duration, target conversion), rather than three domain-specific
solutions. Determine whether it is a stage of `FermentationRun`, a separate run
entity in the same family, or a transformation in its own right.

### 5b. Sake breaks the sequence, not just the vocabulary

Two structural problems, both real:

- **Parallel, not serial.** In sake, koji saccharification and yeast
  fermentation run *simultaneously* in the same vessel. A model that assumes
  saccharify-then-ferment cannot represent it.
- **Staged substrate additions.** Traditional sake builds the mash in three
  additions (*sandan jikomi*) over several days. If `FermentationRun` assumes
  one initial substrate charge and one inoculation, it does not fit. Note that
  staged addition is not unique to sake — it is the same shape as a fed-batch
  fermentation, and arguably as hop additions by time.

**The rice is a `Lot`, not an ingredient.** Criollo rice varieties from partner
farms have origin, variety, harvest, and a producer — exactly the same shape as
coffee cherry from a finca. Sake extends the existing farm-to-glass chain rather
than needing a new one at that end. Confirm the model already carries this.

### 5c. `Culture` as a single defined organism does not hold

Three genuinely different cases, currently collapsible into one field:

- **Defined culture** — a named strain with a supplier and batch (SafŒno MP-72,
  a lager strain), already how CryoBloom and the Cafelino PE-lot work operate.
- **Consortium** — a kombucha SCOBY is a bacteria-yeast community, not a
  strain. Koji plus yeast in sake is a defined multi-organism system.
- **Spontaneous** — ambient microbiota. Chicha espontánea, the "Spontaneous
  Wild" lots in the Cafelino PE-lot log, and the Boquete wild-yeast
  bioprospecting work all sit here.

The epistemic point matters more than the taxonomy: **"spontaneous" means the
organisms are unknown**, which is a `data_quality` statement
(`DATA_ARCHITECTURE.md` §4), not a culture name. A model that records
`culture = "spontaneous"` as though it were an identified organism asserts
knowledge nobody has. Recommend how the distinction is carried, and how a later
identification (a wild isolate eventually characterized) attaches without
retroactively rewriting what was originally recorded.

### 5d. Craft sodas — formulation with no fermentation at all

A craft soda has a recipe, ingredients, batch scaling, forced carbonation, and
a finished product — and no `FermentationRun` anywhere. Kombucha's secondary
bottle fermentation and a soda's forced carbonation are also different
mechanisms reaching a similar end.

This is the cleanest test of whether **recipe is genuinely independent of
fermentation** or accidentally coupled to it. If the formulation model requires
a fermentation run to exist, it is coupled and should be fixed. Carbonation —
forced, natural, or none — is a real attribute that applies across beer, mead,
cider, kombucha, and soda alike.

## 6. Mass balance and yield — more visible here than in coffee

Cane juice to concentrate loses most of its mass; a distillation run yields a
fraction of its charge. The platform's existing discipline about unit context —
never a bare `cost/kg`, always `cost/kg cherry` versus `cost/kg green` — matters
more in these chains than in coffee's.

Address how input quantity, output quantity, loss, and yield are recorded
against a transformation, and whether the existing `QuantityEvent` ledger
already covers it or needs extension.

## 7. What is already proven and must be reused

Do not redesign any of the following:

- **The fork.** One input, several outputs at one transformation node, is
  already verified — one `LotTransformation`, one `LotTransformationInput`,
  several `LotTransformationOutput` rows, one DAG node with several children.
  Cane juice splitting to bottling, caramelization, and fermentation uses the
  identical code path as a green lot roasted three ways.
- **The wood chain.** `wood_harvest → curing_batch → toast_char_protocol →
  vessel → aging_run` is specified in
  `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §4. A rum aged on Cordia alliodora
  cubes from a tracked `Specimen` needs no new mechanism — note this explicitly,
  since it is the platform's most distinctive claim: a chain from an individual
  tree to a finished glass.
- **Sensory linkage.** `Sample` is canonical; a distillate reaches Sensory the
  same way a coffee sample does, via T12's existing mechanism.
- **Provenance.** Required, no default, chosen per operation.
- **Typed execution records.** The `RoastSession` gap identified for coffee —
  the fork is representable but the distinction is not queryable, because
  "light filter" versus "medium espresso" lives only in a lot code and free-text
  notes — is the same gap this document fills for distillation. Note the
  parallel; recommend whether `RoastSession` should be specified here alongside
  `DistillationRun`, since they are the same shape of problem.

## 8. Scope discipline

**Not in scope:** commercial brewery production planning, TTB or regulatory
excise reporting, keg and tap-room inventory, packaging line management, batch
costing (that belongs to the operational-economics work), and any ingredient or
style database sourced from a third party.

This is a solo-maintained platform whose v1 is already committed through April.
Design the smallest coherent thing that makes formulation and distillation
representable, not a brewery management suite.

## 9. Deliverables

`RECIPES_FORMULATION_AND_DISTILLATION.md`, structured like the other planning
documents: the gap it fills, entities with field sketches, what it reuses versus
what is genuinely new, access/RBAC, sequencing, and — separately — the decisions
requiring product-owner input.

Include explicitly:

- The recipe-versus-`Protocol` decision from §2, with reasoning.
- Whether equipment profiles argue for designing this together with
  `18_EQUIPMENT_AND_READINESS`.
- Whether `RoastSession` belongs in this document.
- **Two worked traces**, showing which existing entities carry each step and
  where new ones are genuinely required. Where a trace breaks, that break is
  the most valuable finding in the document — report it plainly rather than
  designing around it silently.

  1. **Cane:** one harvest through trapiche, the juice forking to
     caramelization and to fermentation, the fermented guarapo itself forking
     to bottling as a terminal product and to distillation, then barrel aging
     on laurel from a tracked `Specimen`, then sensory.
  2. **Sake:** partner-grown criollo rice as a `Lot` with real origin, through
     polishing, koji propagation, parallel saccharification and fermentation
     with three staged substrate additions, then pressing, then sensory. This
     is the trace most likely to break, which is why it is required.

End with a sequencing note placing this after v1, and a line for `DECISIONS.md`
logging it as accepted planning input, not a build order.
