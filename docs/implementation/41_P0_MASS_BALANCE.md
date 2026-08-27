# P0 — Balance de masa: el lado de entrada del libro de cantidades

**Bloquea todo lo demás.** No es una funcionalidad faltante: es un error de
corrección en código en producción. Cada día que corre escribe más datos que
un arreglo posterior tiene que interpretar. `docs/architecture/COFFEE_FIELD_OS_AUDIT.md`
§9 documenta el hallazgo completo; este ticket lo cierra.

**Contexto obligatorio antes de empezar:** el audit §9, §11, §25 y §58
(decisiones B y C, ya resueltas por el product owner el 2026-08-27).

**Escrito en inglés** a diferencia de los tickets 30–40, porque depende
directamente del audit, que está en inglés, y no tiene material fuente en
español. Si preferís castellano, es un cambio barato.

---

## 1. The bug, precisely

`recordTransformation` (`lib/traceability/lots.ts:221`) creates a
`process_output` `QuantityEvent` for every output lot and **never creates a
corresponding decrement for any input lot.** A repository-wide search
confirms no code path anywhere produces `transfer_out`, `loss` or
`adjustment_decrease`. The same omission is repeated verbatim in
`endFermentationRun` (`fermentation.ts:199`), `endDryingRun`
(`drying.ts:187`) and `endRoastSession` (`roasting.ts:139`) — each of which
copied T1's pattern including its defect. `samples.ts:99` is the single
correct site: it writes `sample_removed`.

Consequence: after any material-moving transformation, the parent lot still
reports its full quantity while the children report theirs.
`computeCurrentQuantity` is correct; it is being fed only half a ledger.

**Do not fix this by making `computeCurrentQuantity` subtract outputs.**
The ledger is the source of truth and must stay complete on its own — a
derived correction would leave the stored history still wrong and would
break the moment anything else reads `quantity_event` directly (the export
and the report both do).

---

## 2. The trap: not every transformation moves material

**This is the part a naïve fix gets wrong, and it would be silently wrong.**

`startFermentationRun` and `startDryingRun` create a `stage_change`
`LotTransformation` with **one input and zero outputs** — a run-opening
marker recording that the lot entered the stage. Nothing has been converted
yet. `endFermentationRun` / `endDryingRun` create a *second* `stage_change`
with the same input lot and one output lot; that is the one that actually
converts material.

Decrementing on both would zero the lot the moment fermentation starts and
then decrement it again at the end.

**The rule to implement:**

| Transformation shape | Decrement inputs? |
| --- | --- |
| Has ≥1 output | **Yes** |
| `loss` / `disposal` / `sale` (no outputs by design) | **Yes** |
| `sample_extraction` | Already handled in `samples.ts` — do not double-write |
| Zero outputs and not loss/disposal/sale (run-opening marker) | **No** |

Express this as a named predicate (`movesMaterial(transformation)`), not as
an inline condition repeated at four call sites. All four `end*` functions
and `recordTransformation` must route through one shared helper.

---

## 3. How much to decrement — and the missing-quantity reality

Measured against the restored 2026-08-26 backup: **9 of 10 existing
transformation inputs carry a NULL quantity.** `LotTransformationInput.quantity`
and `.unit` are both nullable and almost nothing populates them. So "decrement
by the input quantity" is not implementable for most real rows.

**Rule:**

- **Full consumption** (`stage_change`, `merge`, `blend` — the input lot
  ceases to exist as itself): decrement by the input lot's **entire current
  computed balance**, via `computeCurrentQuantity`. This is knowable even
  when the input row's own quantity is NULL, which is exactly the case that
  matters. Event type `transfer_out`.
- **Partial consumption** (`split`): an explicit input quantity is
  **required** — validate and reject without one. You cannot infer how much
  of a lot a split consumed.
- **Lot with no ledger at all** (`recorded: false`, ADR-080): write **no
  decrement**. There is nothing to decrement, and inventing a zero event
  would convert "never weighed" into "weighed and empty" — the exact
  distinction ADR-080 exists to preserve. Record the transformation
  normally; the lineage is still true.

Every decrement inherits the transformation's `provenanceClass` and
`sourceReference`, same as the existing `process_output` seeding does.

---

## 4. Declared loss and unexplained difference

Additive columns on `LotTransformation`:

| Column | Type | Purpose |
| --- | --- | --- |
| `declaredLossQuantity` | `Decimal(10,3)?` | Process loss that becomes no output lot — mucilage, water, handling |
| `declaredLossUnit` | `String?` | |
| `declaredLossReason` | `String?` | |
| `unexplainedQuantity` | `Decimal(10,3)?` | Computed and **stored**: Σinputs − Σoutputs − declaredLoss |

`unexplainedQuantity` is stored rather than derived because it is the value
an audit asks about years later, and recomputing it from a history that has
since been corrected would give a different answer than what was true at the
time. NULL when any input lot has no ledger — unknown, never zero.

**Out of tolerance is not an error.** Operators estimate weights; a hard
rejection at 0.3 kg drives people back to paper, and a field tool that
refuses real data stops being used. Behaviour:

- Within tolerance → record normally.
- Outside tolerance → record normally **and raise a `Deviation`** (widen its
  parents additively to accept a `lotTransformationId`; today it only hangs
  off `TreatmentBatch`/`ProcessingStage`). The existing
  `Deviation`/`CorrectiveAction`/`Approval` machinery is exactly right for
  this and must not be duplicated.
- A caller may pass an explicit override, which requires a new permission
  (§6) and records actor, timestamp and reason.

**Tolerance lives on `Organization`** as a real nullable column
`massBalanceTolerancePct Decimal(5,2)?`, not inside `Organization.attributes`
(Json). Attributes is documented as type-specific data validated at the
application layer; a tolerance is load-bearing for a data invariant and
should not be reachable only through an unvalidated blob. Falls back to a
single exported platform default constant when NULL.

---

## 5. Rejected material as real Lots (audit §58 Decision B)

Resolved: every rejection stream is a real output `Lot`. This ticket does
**not** build the selection operation itself (that is Phase 3) — but the
mass-balance work must be shaped so selection needs no rework:

- Rejected outputs are ordinary `LotTransformationOutput` rows with their own
  `Lot`, so §3's decrement rule already covers them with no special case.
- Do **not** add a rejection-category column here. It arrives with the
  `selection` transformation type in Phase 3.

---

## 6. New permission — `lot:override_balance`

Add to `lib/rbac/catalog.ts`:

- Granted to: **Platform Admin** only, in this ticket.
- **Deliberately NOT granted to Farm Operator.** The operator records what
  the scale says; accepting a discrepancy is someone else's call. This is
  the same separation A7 applied when it withheld `apiary:manage` from the
  Apiary Colony Event Recorder.
- ADR-091 makes a permission with no reachable use a test failure — so the
  override path must actually be wired to a caller in this ticket, not left
  as a catalog entry pointing nowhere.

---

## 7. `lotCode` uniqueness per organization

`Lot.lotCode` is globally `@unique`, which is both an offline-collision
hazard (two disconnected devices minting `PE-79`) and a multi-tenant defect
(two farms cannot both number a lot `01`).

**The data is clean** — verified 2026-08-27 against the restored backup: 43
lots, **0 with a NULL `organizationId`**, **0 duplicate lot codes**. So the
migration itself is low-risk.

**Decided by the product owner, 2026-08-27: make `organizationId` required.**
`Lot.organizationId` is nullable in the schema even though no row uses that,
and a lot with no owning organization is meaningless under multi-tenancy.
Then `@@unique([organizationId, lotCode])`, replacing the global unique.

This is a nullable→required migration, the class audit §25 step 7 warns
against — **safe here only because the backfill is empty**, which is a fact
about today's data, not a permanent property. Therefore:

1. **Re-verify immediately before writing the migration**, against a fresh
   restore, not against this document:
   `SELECT count(*) FROM traceability.lot WHERE organization_id IS NULL;`
   must return 0. If it does not, stop and escalate — do not backfill a
   guessed organization.
2. Assert no duplicate `(organization_id, lot_code)` pairs exist before
   adding the constraint.
3. `SET NOT NULL` and the unique swap go in **one** migration, so no
   intermediate state exists where the old global constraint is gone and the
   new scoped one is not yet present.

**`Sample` is a different case and must not inherit this decision by
assumption.** `core.sample` currently holds **zero rows**, so "0 NULLs"
tells you nothing about how the table will actually be used. And unlike a
Lot, a Sample legitimately may have no organization: the S1 external-coffee
path exists precisely for a green sample someone hands you at a fair, with
`sourceLotId` NULL and an `ExternalCoffeeOrigin` instead of lineage.

So for `Sample.sampleCode`: scope it with **`@@unique([organizationId, sampleCode])`
as a partial unique index**, leaving `organizationId` nullable. Two org-less
samples could theoretically collide; that is a smaller problem than forcing
an organization onto a sample that genuinely has none, which would push
someone toward inventing one.

---

## 8. Historical remediation (audit §58 Decision C)

**Correction to the audit's own §9 figure.** Five lots were consumed as
transformation inputs without a decrement, but they are not five equivalent
cases:

| Lot | Ledger events | Ledger says | Actually affected? |
| --- | --- | --- | --- |
| PE-79 | 1 | 45.4 kg | **Yes — overstated** |
| PE-80 | 1 | 45.4 kg | **Yes — overstated** |
| PE-90 | 1 | 54.5 kg | **Yes — overstated** |
| PE-97 | 0 | — | No — never weighed (`recorded: false`) |
| PE-98 | 0 | — | No — never weighed (`recorded: false`) |

All three overstated lots are `cherry`, all belong to **Cafelino**, and they
account for the full 145.3 kg. PE-97 and PE-98 have no ledger at all, so per
ADR-080 they already report honestly as "not recorded" and need no
remediation — §3's rule will correctly write no decrement for them.

**So the remediation scope is three lots, not five.**

Steps:

1. Set `dataQuality = conflicting` on the three, with a reason naming this
   ticket. (`Lot` has no `dataQuality` column today — either add one,
   additive and nullable, or record the flag as a `QuantityEvent` note. Prefer
   the column: it is queryable and reporting needs to filter on it.)
2. Exclude `conflicting` lots from any yield or conversion figure, and label
   them visibly rather than hiding them.
3. **Do not synthesize quantities.** These are Cafelino PE lots from the
   25/26 season imported by I1; if the true consumed weights are recoverable
   from the source CSVs or from Cafelino directly, enter them as genuine
   corrections. If they are not, the lots stay flagged permanently. That is
   the honest outcome and it is acceptable.

---

## 9. Tests

`tests/traceability/massBalance.test.ts`, same real-Postgres,
`RUN_ID`-scoped-fixture discipline as `harvest.test.ts`.

Conservation:
1. After a `stage_change` with an output, the input lot's computed quantity
   is zero and the output lot carries the material.
2. After a `split` with explicit input quantity, input decremented by exactly
   that amount; remainder stays.
3. After a `merge` of three lots, all three read zero and the output carries
   the sum.
4. Total material across a full DEMO lineage equals the harvested quantity
   plus adjustments, minus declared loss — the actual invariant.

The trap (§2):
5. `startFermentationRun` writes **no** decrement; the lot keeps its quantity
   for the duration of the run.
6. `endFermentationRun` writes exactly one decrement. Start-then-end
   decrements the lot exactly once, not twice.
7. Same for drying and roasting.

Missing data (§3):
8. A lot with no `QuantityEvent` produces no decrement and no zero event;
   `computeCurrentQuantity` still reports `recorded: false` afterwards.
9. A `split` without an explicit input quantity is rejected.

Tolerance and override:
10. Within tolerance → no `Deviation`.
11. Outside tolerance → exactly one `Deviation` linked to the transformation.
12. Override without `lot:override_balance` is denied; with it, succeeds and
    records actor and reason.
13. `unexplainedQuantity` is stored and correct; NULL when an input has no
    ledger.

Uniqueness (§7):
14. Two lots with the same `lotCode` under **different** organizations both
    insert. Under the **same** organization, the second is rejected.

Idempotency (forward-looking, cheap now):
15. Replaying the same transformation with the same `clientDraftId` produces
    no duplicate quantity events. *(Only if `clientDraftId` is added to
    `LotTransformation` in this ticket — see "Not in scope".)*

---

## 10. Verification scenarios

Run against the local restored copy (`npm run test:db -- up`), never
production:

1. The DEMO Las Nubes chain reconciles end to end: every leaf lot's quantity
   plus declared loss plus unexplained equals the harvested cherry weight.
2. `getLotReport` over that chain shows no lot reporting more material than
   its ancestry provided.
3. The three Cafelino lots are flagged `conflicting` and excluded from yield
   figures.
4. A full fermentation cycle (start → readings → end) leaves the source lot
   at zero and the parchment lot carrying the material, with exactly two
   `stage_change` transformations and exactly one decrement.

---

## 11. ADR

Write one covering: why the ledger's input side was missing at four call
sites and not caught (no conservation test existed, and
`computeCurrentQuantity` was correct in isolation — the bug lived in what
never called it); the `movesMaterial` rule and why run-opening
transformations are excluded; why out-of-tolerance records rather than
rejects; and why the three Cafelino lots are flagged rather than backfilled.

---

## Not in scope

- The `selection` transformation type and rejection categories — Phase 3.
- `OperatingStandard` and versioned thresholds — Phase 3.
- The JSON API, `Device`, `clientDraftId` generalization, sync — Phase 4.
  **Except:** if adding `clientDraftId` to `LotTransformation` is trivial
  alongside this migration, take it — it is additive, nullable, unique, and
  the pattern already exists on `apiary.inspection`. Test 15 then applies.
- `PlantingCohort`, `FieldSession`, `FieldEvent` — Phases 1–2.
- Any UI beyond what test 11's `Deviation` needs to be visible.
- Cross-unit conversion. One canonical unit per lot ledger stays the rule;
  `mixed_units` still throws.
