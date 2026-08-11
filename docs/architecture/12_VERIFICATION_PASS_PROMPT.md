# Verification Pass — Phase 1 reconciliation, T5 sample lineage, honey/mead content

**This task is strictly read-only.** Do not modify any code, create any
migration, edit any architecture document, or "fix" anything you find.
Produce a report only. Where a finding is uncertain rather than confirmed,
say so explicitly rather than asserting it — the same discipline
`GAP_ANALYSIS_2026-08-10.md` applied. If something looks broken, describe
it precisely and stop there; correcting it is a separate, explicitly-kicked-
off task.

All findings must be pulled from the actual repository (`git log`, `git
show`, `prisma/schema.prisma`, the live service layer), not from memory of
prior sessions or from what an architecture document says *should* be true.

---

## Required reading before starting

- `docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md`
- `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` — especially §F (Lot
  Genealogy), §G (Quantity/Inventory), §I (Measurement Architecture)
- `DECISIONS.md` ADR-020 — specifically decisions 5, 6, and 8
- `DOMAIN_MODEL.md` §4 (Agricultural Traceability)
- `GAP_ANALYSIS_2026-08-10.md`
- The current `prisma/schema.prisma`

---

## Part A — Did the Phase 1 plan reconcile against the approved lot model?

Background, stated plainly so this question is answerable rather than
leading: `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F already resolved
the lot-model question — a canonical `traceability.lot` plus
`lot_transformation` with separate `_input`/`_output` rows, forming a
directed acyclic graph (a blend genuinely has multiple parents), traversed
by recursive CTE, and **strictly append-only**. ADR-020 approved this, along
with decision 6 (operational inventory structurally separate from Commerce
SKU inventory, joined only by a `source_lot_id` lineage FK) and decision 8
(the generalized measurement table uses specific nullable parent FKs, not a
polymorphic `parent_type`/`parent_id` pair).

The Phase 1 prompt that produced the execution plan did **not** list
`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` in its reading list, and its
§7–8 asked for a fresh Option A / B / C comparison reconciled only against
`DOMAIN_MODEL.md`. So the plan may have re-derived decisions that were
already approved.

Report:

1. **Lot model.** Does the plan's lot structure match §F and ADR-020
   decision 5, or does it propose a competing one? Quote the plan's actual
   structure. If it diverges, name exactly how — particularly whether
   genealogy can represent a **merge/blend** (many-to-many), or whether it
   collapsed to a single mutable `parentLotId`, which the prompt itself
   warned against.
2. **Append-only.** Does the plan preserve `Lot`/`LotTransformation` as
   append-only, with stage changes as explicit transformation rows rather
   than an `UPDATE` to a `lot_type`/status field?
3. **Measurement table.** Nullable parent FKs (ADR-020 decision 8) or a
   polymorphic parent reference?
4. **Quantity.** Event-based ledger with computed current quantity (§G), or
   a mutable weight column?
5. **Missing input.** The corrected Phase 1 prompt required reading
   `BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md`, which has never been
   written. What did the plan actually do about that — flag it, proceed
   silently, or something else?
6. **Invented entities.** The prompt's §5 asked for KEEP/EXTEND/RENAME/
   MIGRATE/DEPRECATE/NEW classification of a list including
   `ProjectMembership`, `Role`, and `MediaAsset` — none of which are this
   platform's actual vocabulary (project access is `Assignment` + `Scope`;
   the entity is `RoleProfile`; the media entity is `Asset`, with
   `MediaAsset` only a *proposed* extension in
   `ADAPTIVE_INTELLIGENCE_EXPERIENCE_REVIEW.md` §D). Did the plan create or
   assume any of these three as real entities?

## Part B — T5 (Sample lineage extension), just completed

`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F specifies sample extraction
as a transformation: one input `Lot` row, with the output being a canonical
`core.sample` row rather than another `Lot` — the `lot_transformation`
record is what links a Sample back to its source, so `Sample` does not need
its own genealogy fields.

7. Does T5's implementation follow that pattern, or did it give `Sample` a
   direct parent-lot field (or its own separate lineage mechanism)? Show
   the actual schema and the actual query path used to answer "where did
   this sample come from."
8. Does T5 introduce anything that conflicts with Part A's findings — i.e.,
   is sample lineage built on the approved lot model or on a diverged one?
9. `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §2 and the rest of the
   architecture require `provenance_class`/`data_quality` on fact-bearing
   tables. The gap analysis found these have **zero implementation**
   anywhere. Did T5's new tables carry them, or follow the existing
   `RecordStatus`/`ClassificationLevel` pattern? Either answer is fine to
   report — the point is knowing which.

## Part C — Honey/mead content expansion (commit `4080633`)

That commit touched `BEVERAGE_SENSORY_PROTOCOLS.md` and `COMPETITIONS.md`,
which are the two documents most exposed to the project's standing
copyright rule. Confirm the rule held:

10. Show the diff for both files. For any **new** content, identify its
    source and whether it is (a) original material, (b) genuinely
    non-copyrighted regulatory/technical content properly cited, or (c)
    BJCP/AHA/SCA copyrighted text — scoresheets, style guidelines, fault
    lists, specific handbook wording — reproduced or closely paraphrased.
11. `BEVERAGE_SENSORY_PROTOCOLS.md` §3's mead section explicitly excludes
    AESHI's Chapter IV on the grounds that it is itself BJCP-sourced. Is
    that exclusion still intact after the expansion, or did Chapter IV
    material enter the document?
12. Does any new content assert an institutional attribution as confirmed
    fact where the source is actually unverified? The existing "UC Davis
    Adaptado" caveat in §3 is the model — attribution stated honestly as
    unconfirmed rather than asserted.

## Part D — Report format

Answer items 1–12 in order, each with the actual evidence (file path, line
range, schema excerpt, or commit hash) it rests on. Then close with:

- **Divergences found**, if any — described, not fixed.
- **Correction cost estimate** for each: is it a one-slice fix, or does it
  compound across already-built work?
- **What you could not determine** and why.

Do not append an ADR, do not update `DECISIONS.md`, and do not begin any
remediation. Report, then stop.
