# P3 — Selección: cherry sorting as a material operation, not a note

Phase 3 of `docs/architecture/COFFEE_FIELD_OS_AUDIT.md` §26, and the slice the
audit's own §57 named as the **most architecturally meaningful first thing to
build**. It was blocked on P0; P0 shipped, so it isn't any more.

**Context to read first:** the audit §11 (Selection architecture assessment),
§18 (Rejected material), §57, and §58 Decision B — already resolved: every
rejection stream is a real output `Lot`. Plus ADR-094, whose mass-balance
machinery this is the first real consumer of.

---

## 0. Why this one, and why now

Selection is the first specialty-coffee operation the platform cannot express.

What exists today is `cereza_seleccion` and `cereza_flotado` — `VariableCatalog`
values recorded as `ProcessingStageObservation` rows. Those capture *what was
observed*: "heterogénea leve", "5–10% flotadores". They capture **no weight,
produce no material, and leave rejected coffee with no existence in the
system.** Floaters that get sold as commercial grade are, as far as the
database is concerned, not there.

It is also the operation that proves ADR-094 was worth doing. Selection is
mass-conserving by nature — accepted + rejected + declared loss = input — so it
is the exact shape the tolerance machinery was built for, and the first
transformation where an out-of-balance figure means something real rather than
a yield.

Everything here is unblocked and needs no product-owner input, which is why it
goes now while §0 of P2, P1 §4's land data and the owner details are still
waiting.

---

## 1. A selection is a `LotTransformation`

Not a new entity. It already has exactly the shape the graph handles: one input
lot, several typed outputs with quantities, plus method, operator, time,
location and equipment.

- Add `selection` to `LotTransformationType`.
- Add `selection` to **`CONSERVING_TYPES`** in `lib/traceability/balance.ts`.
  This is the load-bearing line of the whole ticket: it is what makes accepted
  + rejected + declared loss reconcile against the input, raise a `Deviation`
  outside tolerance, and require `lot:override_balance` to accept a gap.
- Add to `LotTransformation`, both nullable and only meaningful for this type:
  `selectionMethodValueId` (catalog) and `equipmentNote` (free text, matching
  `FermentationRun.vesselNote`'s precedent — no Equipment entity exists).

A specialised `SelectionEvent` table was considered and rejected in the audit:
it would need its own inputs, outputs, quantities, lineage edges and mass
balance — a second transformation system differing only in vocabulary.

---

## 2. Two new catalogs

`seleccion_metodo` — flotación, manual, madurez, densidad, color, óptica,
tamaño, defectos, criba, verde, otro.

`rechazo_categoria` — flotadores, cereza verde, sobremadura, cereza seca,
dañada, broca, moho, materia extraña, pergamino defectuoso, otro.

Catalogs rather than enums, for the reason P1 and P2 both established: this
vocabulary will grow with real practice, and growth should be a seed entry plus
a re-seed rather than a migration. `otro` in both, always paired with a free
note — F1 §1's rule.

---

## 3. Rejected material is a real `Lot` — but its `lotType` stays physical

§58 Decision B settled that each rejection stream becomes an output `Lot`, so
it keeps identity, weight, storage and a sale path, and mass balance falls out
of §1 with no special case.

**Divergence from the audit's §25, stated deliberately.** That section proposed
"a new `LotType` for rejected material". Do not. `LotType` describes the
material's *stage* — cherry, processing, drying, green — and a lot of floaters
is physically still cherry; a rejected parchment is still parchment. Folding a
quality judgement into the stage enum would make `lotType` mean two things at
once, and the moment you have rejected *parchment* the enum can no longer say
so.

Instead add `Lot.rejectionCategoryValueId` (nullable, → `rechazo_categoria`).
Stage and quality become two axes, which is the same separation `dataQuality`
already has from `status`. "Is this sellable coffee or a reject" is then one
nullable column, and a floater lot still correctly reports as cherry.

**Not every rejection is waste** (audit §18). A rejected lot can be stored,
sold via the existing `sale` transformation, composted via `disposal`, or
reprocessed by being an input to another transformation. All of that works
already once it is a Lot; none of it works if rejection is an attribute.

---

## 4. Service

`recordSelection` in `lib/traceability/lots.ts` — a wrapper expressing the
operation in domain terms over `recordTransformation`, not a parallel path:

```
recordSelection(userAccountId, {
  inputLotId, inputQuantity, unit,          // quantity REQUIRED — see below
  selectionMethodValueId, equipmentNote,
  accepted: { lotCode, lotType, quantity },
  rejected: [{ lotCode, lotType, quantity, rejectionCategoryValueId }, ...],
  declaredLossQuantity, declaredLossReason,
  occurredAt, operatorPersonId, provenanceClass,
  acceptUnexplained,                        // needs lot:override_balance
})
```

**The input quantity is required.** `balance.ts` already refuses a partial
consumption without one, and a selection whose input was never weighed cannot
reconcile against anything — the whole point of the operation is the outturn.

Every rejected output must carry a `rejectionCategoryValueId`. A rejected lot
with no reason is the thing this ticket exists to stop.

---

## 5. Standards are **not** in this ticket

The audit pairs selection with `OperatingStandard` ("Specialty Cherry Intake
v3: max floaters 5%"). Split them.

Selection is unblocked and self-contained. Standards need someone to decide
what the real thresholds are, which is a product-owner conversation nobody has
had — the same gap that stalls P1 §4. Building a threshold engine with no real
thresholds would repeat exactly the mistake P2 §0 identifies: infrastructure
for users and data that don't exist yet.

Once selections are recorded, the observed distribution *is* the input to that
conversation. Do this first, then ask.

---

## 6. UI — one form, on the batch page

The batch page already suggests a next action (ADR-096). Selection becomes one
of them for a `cherry` lot.

Input lot and weight, method, accepted weight, N rejection rows each with
category and weight, declared loss — and **a running balance that updates as
the operator types**, showing the unexplained difference before they submit.
That last part is the difference between a tolerance that teaches and one that
scolds after the fact.

Spanish first, as every operator surface is.

---

## 7. Tests

- Accepted + rejected + declared loss = input → no `Deviation`, `unexplained` 0.
- A 20% gap → exactly one `Deviation`, transformation still recorded.
- Input lot decremented to zero; each output carries its weight.
- Every rejected output is a real `Lot`, queryable, with its category.
- A rejected lot can be sold (`sale`) and stored (`StorageAssignment`) — proves
  §18's "not every rejection is waste".
- Selection with no input quantity is refused.
- Rejected output with no category is refused.
- `lot:override_balance`: denied for Farm Operator, allowed for Platform Admin,
  and the reason lands on a `CorrectiveAction`.
- Lineage: `getLotLineage` from a floater lot reaches the original harvest.
- `conservesMass("selection")` is true.

## 8. Migration

Additive. New enum value on `LotTransformationType`; new nullable columns
`lot_transformation.selection_method_value_id`,
`lot_transformation.equipment_note`, `lot.rejection_category_value_id`; two
seeded catalogs. No backfill.

## Not in scope

- `OperatingStandard` and versioned thresholds — §5.
- Optical/mechanical sorter integration. `equipmentNote` is free text.
- Green-stage defect grading and screen size — audit §14's physical QC, later.
- Reprocessing workflows beyond what the existing transformation types give.
