# Capture-or-lose-it — the irreversible slice of operational economics, before harvest

**One question, deliberately narrow:** what is the minimum set of fields that
must exist in the operator workbench before the 2026 harvest, so that the
season's true operational economics can be reconstructed later — even though
the analysis itself won't be built until v2?

**Planning and analysis only.** No code, no migrations, no schema changes in
this pass. The deliverable is a minimal specification plus a proposed
amendment to ADR-039 (v1 scope), for review.

**This has a real deadline.** Panama's coffee harvest runs roughly November
through March. Cost *analysis* can be built in 2027. How many hours went into
a January fermentation cannot be recovered in 2027. That asymmetry is the
entire reason this document exists and is separated from the wider economics
research.

---

## 1. The governing principle: capture physical facts, defer all money

Money can be applied retroactively. Physical and temporal facts cannot.

A labour rate can be decided next year and multiplied against hours recorded
this year. A market value can be assigned later to feed that was consumed
today. But if nobody records that the fermentation took eleven hours of
attended work, or that 4 kg of a specific yeast batch went into it, no future
system recovers it.

**So the inclusion test for this pass is exactly one question:** *if this is
not recorded during the harvest, can it be reconstructed afterwards from
records that will exist anyway?*

- If **yes** — defer it. It belongs in the v2 economics work.
- If **no** — it is a candidate for capture now.

Apply that test to every field. Do not include something because it would be
useful; include it only because it is irrecoverable. A short list that gets
filled in is worth far more than a complete one that gets skipped in the field.

## 2. Required reading

- `PHASE_1_TECHNICAL_EXECUTION_PLAN.md`, and T10's shipped implementation
  (`app/actions/traceability.ts`, `app/components/traceability/`)
- `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F, §G, §I
- `DECISIONS.md` — ADR-020 (esp. decisions 6 and 8), ADR-039 (v1 scope), and
  the T9.5 provenance ADR
- `DATA_ARCHITECTURE.md` §4
- `DOMAIN_MODEL.md` §3–4

Note: several documents named in the wider economics research prompt do not
exist in this repository (`PLATFORM_ARCHITECTURE_RECONCILIATION.md`,
`MASTER_IMPLEMENTATION_ROADMAP.md`, `AI_PERSONA_VOICE_GUIDE.md`, and
`EXTERNAL_DATA_SOURCES.md` under that exact name). Do not go looking for them
or infer their contents — verify what actually exists and say so.

## 3. Candidates to evaluate against the test

Evaluate each; do not assume any of them passes.

- **Labour time** — who worked, on what, for how long, against which lot or
  transformation. Strongest candidate: entirely irrecoverable.
- **Material consumption** — what inputs went into a lot or run, in what
  quantity, from which batch where batch identity matters (yeast, cultures,
  nutrients, treatments). Batch identity is irrecoverable and matters
  scientifically as well as economically — a fermentation result is not fully
  interpretable without knowing which culture batch produced it.
- **Equipment used** — which vessel, dryer, or instrument. Partly recoverable
  if runs already reference equipment; check what T6–T8 actually record.
- **Third-party and in-kind involvement** — that a partner supplied transport,
  or a farm provided the cherry, or equipment was borrowed. The *fact* is
  irrecoverable; the *valuation* is not and must be deferred.

For each: state whether it passes the test, what already exists in the schema
that covers it, and the minimum field set if it does pass.

## 4. Hard constraints

**Defer everything monetary.** No rates, no currency, no valuation, no cost
rollup, no allocation method, no reproduction cost. Those are v2 and are
recoverable later by construction. If a proposed field contains an amount of
money, it is almost certainly out of scope for this pass.

**No new inventory concept.** The platform already has Commerce SKU inventory
(built) and operational lot inventory (ADR-020 decision 6). A consumables
concept is being designed separately in
`18_EQUIPMENT_AND_READINESS_PROMPT_REVISED.md`. Do not create a fourth. If
material consumption needs a stock balance to be meaningful, say so as a
finding — do not build toward one here.

**Do not model Resource.** `18_` owns the Resource, custody, transfer, and
condition model. This pass may *reference* the need for an equipment link, but
must not design the equipment entity. Two prompts independently modelling
Resource guarantees divergence.

**No polymorphic parents.** ADR-020 decision 8 rejected `parent_type` /
`parent_id` in favour of specific nullable FKs per possible parent. Any new
table linking to lots, transformations, or runs follows that convention.

**Cost and quantity genealogy rides the existing DAG.** If consumption or
labour needs to follow a lot through splits and merges, it does so via
`lot_transformation` and its input/output rows — append-only, recursive CTE.
Do not propose a parallel lineage structure.

**Provenance applies.** Any new fact-bearing table carries `provenanceClass`,
`dataQuality`, `sourceReference`, and `operatorPersonId` per the T9.5 decision
— chosen explicitly at the call site, never defaulted silently. An operator's
recalled estimate of hours worked is not a `measured_fact`, and the schema
must be able to say so.

## 5. The UX constraint that decides whether this works

T10's workbench exists and operators will use it during harvest. Anything
added must survive a wet mill at 6am.

Address honestly: **optional fields are usually empty fields.** If labour time
is an optional box at the bottom of a form, it will be blank for most of the
season and the data will be worthless. Recommend where each field should be
required, defaulted, or genuinely optional — and where a required field would
instead cause operators to enter garbage to get past it, which is worse than
blank.

Give the actual proposed interaction, not a field list: what does an operator
tap, and how many times, to record that a fermentation run took four people
three hours and consumed 2 kg of a named yeast batch?

## 6. Deliverables

1. **The irreversibility analysis** — each candidate from §3 against §1's test,
   with the verdict and reasoning.
2. **A minimal field specification** for whatever passes, including where it
   attaches in the existing schema and what the migration would touch.
3. **A UX proposal** per §5, tied to the specific T10 forms it would change.
4. **An explicit "deliberately not captured" list** — with, for each item, the
   consequence of not having it. This matters as much as the inclusion list:
   it is the record of what was knowingly given up for the 2026 season.
5. **Draft amendment to ADR-039** (do not append) proposing whether this enters
   v1 scope. ADR-039 defined v1 by the harvest test; this is a genuine
   amendment to it, not an addition made in passing. If the recommendation is
   that it does *not* make v1, say so plainly and state what is lost — an
   explicit decision to forgo the 2026 season's economics data is a legitimate
   choice, but it should be a decision rather than a drift.
6. **A cost estimate in tickets**, relative to T12–T14, so the scheduling
   trade-off is visible.

## 7. What this is not

This is one slice of a much larger research prompt covering operational
economics, procurement, inventory valuation, cost perspectives, reporting, and
data sovereignty. Those are v2 and will be scoped separately. Do not attempt
them here, and do not let the analysis expand into them — the value of this
pass comes entirely from its narrowness and its deadline.

Report, then stop.
