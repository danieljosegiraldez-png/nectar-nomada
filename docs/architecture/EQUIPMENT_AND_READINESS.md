# Equipment, Instrument Calibration, Readiness & Consumables

**Planning document. Not a build order.** Produced by
`docs/implementation/18_EQUIPMENT_AND_READINESS_PROMPT_REVISED.md`. No schema,
no migrations, no code. v2 — must not enter v1 or any current ticket.

---

## 0. Premises of the ticket that have drifted

`README.md`'s own rule: *"Before running any externally-drafted prompt: verify
its reading list against the actual repository."* Four of `18_`'s premises no
longer hold, and two of them change the answer rather than just the wording.

| `18_` says | Actually |
|---|---|
| "`material.vessel` already exists for barrels and staves" (§2), "it has real production rows" (§4) | **No `Vessel` model, no `material` schema, zero rows.** `material.vessel` is *specified* in `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §4 and never built. `FermentationRun.vesselNote` carries a comment saying exactly that: *"free text (\"Tank 3\") — no Vessel entity yet"* |
| "`Measurement` has no instrument reference today" (§7) | **`Measurement.deviceId` exists**, alongside `sourceType` (`manual \| device \| sensor \| lab \| import \| external_context \| derived`). It is an untyped string, not an FK |
| "`provenance_class` already includes `manufacturer_spec`" (§2) | The value is **`manufacturer_specification`** |
| "the existing attention vocabulary (`INFO / DUE / WARNING / BLOCKED / REVIEW_REQUIRED`)" (§6) | **Not established.** It appears only in `ADAPTIVE_OPERATOR_WORKSPACE_RESEARCH_PROMPT.md`, which has not been run. It is a *proposal*, not a vocabulary to map onto |

**Why the first two matter.**

The vessel question is not a migration question at all. Two *planning documents*
independently describe a physical-container concept, and neither is built. They
can be reconciled on paper at zero cost — which is a far better position than
`18_` assumed, and the reconciliation should happen before either is built
rather than after.

The `Measurement` question is easier than stated but subtler. There is already
a place to say which instrument produced a reading; it is simply untyped. The
design question is not "add an instrument reference" but "what happens to the
free-text `deviceId` values that already exist" — which is a provenance
question, not a schema one.

---

## 1. What this fills

`DOMAIN_MODEL.md` §3–5 names `Equipment/Calibration` in the Research OS chain
and never specifies it. Today the platform records equipment as free text at
the point of use — `FermentationRun.vesselNote`, `StorageAssignment.containerNote`,
`DryingRun.method` — which preserves the irreversible fact ("Tank 3") and
answers nothing about the tank itself.

Three questions are unanswerable and each has an operational cost:

1. **"Which fermenters are free *and* sound?"** — capacity and condition are
   not recorded, so readiness before an arriving harvest is guesswork.
2. **"Was this refractometer in calibration when it produced that reading?"** —
   a `measured_fact` from a drifted instrument is not a measured fact, and
   nothing today can tell the difference.
3. **"Do we have enough filters at Cerro Azul?"** — consumables have no
   per-site balance, so a shortage is discovered on arrival.

---

## 2. Equipment is one model, and vessels fold into it

**Recommendation: a single `Equipment` entity, with `material.vessel`'s planned
fields folded in as a subtype rather than built separately.**

`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §4 specifies
`material.vessel(id, format [barrel|cube|chip|stave|spiral|other], …)` for wood
aging. `18_` specifies fermenters, drying beds, pulpers, extractors and apiary
tooling. These are the same thing wearing different clothes: a durable physical
object, at a place, in a condition, sometimes in use by a run.

Building both produces exactly the divergence `README.md` warns about for
Resource. Since **neither exists yet**, folding them costs nothing now and
cannot be done cheaply later.

```
core.equipment
  id
  name                     "Fermenter 3", "Refractometer A", "Barrel 12"
  equipment_kind           vessel | instrument | tool | machine
  format                   nullable — barrel|cube|chip|stave|spiral|other, from material.vessel
  is_fixed_in_place        boolean — a beneficio's tank never transfers; a smoker does (§3)
  organization_id          owner
  project_id               nullable — partner engagements are their own Project
  classification           ClassificationLevel — `partner` for client-site equipment
  lifecycle_status         active | retired | disposed          (axis 1, §4)
  acquired_at, acquisition_note
  provenance_class, source_reference                            (ADR-038)
```

Manuals, certificates and photographs attach through **`core.asset`**, which
already carries checksum, MIME type, usage rights and the
`manufacturer_specification` provenance class. No document store is needed.

---

## 3. Custody is an event chain

A mutable `location_id` cannot answer "where was this in March", "who had it
last", or "did it come back". Same discipline as `LotTransformation` and
`QuantityEvent`: **append-only, current state derived.**

```
core.equipment_transfer
  id, equipment_id
  from_location_id nullable — null for first deployment
  to_location_id
  moved_by_person_id
  occurred_at
  condition_at_handover    enum, see §4 — "it arrived broken" and "it broke
                           here" are different facts, and the handover record
                           is what distinguishes them
  note
```

Current location is `MAX(occurred_at)`'s `to_location_id`. `is_fixed_in_place`
equipment simply has one transfer, or none.

**Consumables do not reuse this.** A box of jars moving between sites is a
*balance decrement here, increment there* — a fungible quantity, not an
identified object with a custody chain. Reusing equipment transfer for
consumables would force per-jar identity that nobody wants to record. §8 gives
consumables their own movement concept.

---

## 4. Three orthogonal axes, never collapsed

`material.vessel`'s planned `status [available | in_use | retired]` conflates
three independent facts, which is why *"which fermenters are free and sound"*
cannot be asked of it. A fermenter can be in use **and** have a failing airlock.
"Retired" is a different kind of statement from either.

| Axis | Where it lives | Values |
|---|---|---|
| **Lifecycle** | column on `equipment` | `active \| retired \| disposed` |
| **Allocation** | **derived**, never stored | free, or in use by a specific run |
| **Condition** | latest `equipment_condition_report` | `operational \| needs_cleaning \| needs_maintenance \| faulty \| out_of_service` |

**Allocation is derived from the run, not set by hand.** A fermenter is in use
because a `FermentationRun` references it and has not ended — the same fact the
run already records. Storing it separately creates two sources of truth that
drift the first time someone forgets to clear a flag.

This is the one place where equipment must connect to existing tables: the
free-text `vesselNote` / `containerNote` / `equipmentNote` fields become
nullable `equipment_id` FKs **alongside** the existing text, never replacing it.
The text is the original record of what an operator wrote; the FK is an
interpretation of which object they meant. `DATA_ARCHITECTURE.md` §4 —
evidence is not relabelled in place.

```
core.equipment_condition_report
  id, equipment_id
  condition               enum above
  reported_by_person_id
  responsible_person_id   nullable — §6: reporter and resolver are usually
                          different people
  occurred_at, resolved_at nullable
  evidence_asset_id       nullable — a photo of the split seal
  note
```

---

## 5. Readiness — and yes, it should come first

**Recommendation: readiness before consumables in the build order.**

The reasoning is perishability, and it is decisive. Cherry arriving Thursday
does not wait for a repair queue. A consumables shortage is expensive and
recoverable — someone drives to town. A capacity shortfall discovered when the
cherry is already in the wet mill is **irreversible loss of a harvest**, which
is the same argument `20_CAPTURE_OR_LOSE_IT` used to justify jumping the queue,
and it applies here for the same reason.

Three views, in increasing value:

1. **Capacity now** — of N fermenters: allocated, free-and-sound, unavailable
   and why. Pure derivation from §4's three axes; no new storage.
2. **Readiness against known demand** — incoming harvest volume versus
   free-and-sound capacity, surfacing a shortfall *before* arrival. Demand is
   already knowable: `HarvestEvent` records volumes, and a planned harvest is
   the same shape as a recorded one.
3. **Readiness before departure** — the apiary case. Flag a faulty or missing
   tool *before* travelling somewhere it cannot be fixed.

View 3 needs to know what a task requires. **The thinnest version that works**
is a named requirement list, not a BOM:

```
core.task_equipment_requirement
  id, task_kind         "apiary_inspection", "harvest_day", "drying_turn"
  equipment_kind        or a specific equipment_id where it must be that item
  quantity              default 1
```

No assemblies, no substitutions, no per-project overrides. If that proves too
thin, it grows; a BOM cannot be un-built.

---

## 6. Urgency is contextual, and must be derived

The person who notices, the person who fixes, and the person who decides around
it are frequently three people. A processing specialist seeing a broken
fermenter with harvest pending is not filing a repair ticket — they are
choosing whether to delay, reroute, process smaller, or borrow capacity.

**Urgency is not a property of the fault.** A broken airlock in June is routine;
the same fault with cherry arriving Thursday is blocking. So urgency is
computed from operational context — pending harvest, active runs, perishability
— and never stored as a severity someone sets by hand. A stored severity is
wrong the moment the context changes, and nobody goes back to update it.

**On the attention vocabulary:** `18_` §6 asks to map onto
`INFO / DUE / WARNING / BLOCKED / REVIEW_REQUIRED` "rather than inventing a
parallel one". That vocabulary is *not established* — it exists only in an
unrun research prompt (§0). The instruction's intent still holds and is more
important than its letter: **do not invent a second vocabulary here.** This
document names no severity levels. Whichever vocabulary the operator-workspace
work settles on, readiness adopts it.

**Dependency, flagged not solved:** all signalling here needs `Notification`
(`DOMAIN_MODEL.md` §5), specified and unbuilt — confirmed: no `Notification`
model exists. The same dependency blocks the tourism waitlist, recurring
field-study reminders, and Alerts. Four consumers now wait on one unbuilt
entity. That convergence is itself the argument for building it, and is noted
rather than worked around with a bespoke mechanism.

---

## 7. Instrument calibration

### Naming — no overloading

`CalibrationSession`, `CalibrationResult`, `ReferenceStandard`,
`SelfCreatedStandardDetail` and `EvaluatorSensitivityProfile` exist and mean
**panel** calibration: validating human evaluators (ADR-035, built). Instrument
calibration is a different act on a different subject.

**Recommendation: an `Instrument` prefix as the disambiguator**, which reads
correctly in isolation and sorts together:

- `instrument_calibration` — the event
- `instrument_calibration_standard` — what it was checked against

Not `Calibration*`, which collides; not `Verification*`, which loses the
domain's own word for it.

```
core.instrument_calibration
  id, equipment_id            → equipment where equipment_kind = 'instrument'
  performed_at, performed_by_person_id
  standard_id                 nullable — what it was checked against
  result                      pass | fail | pass_with_adjustment
  measured_deviation, unit    nullable
  next_due_at
  certificate_asset_id        nullable — core.asset, provenance
                              manufacturer_specification where issued by a lab
  note
```

### Linking a Measurement to its instrument

`Measurement.deviceId` already exists as free text, with `sourceType` already
distinguishing `device` / `sensor` / `lab` from `manual`.

**Recommendation: add a nullable `instrument_id` FK alongside `deviceId`, and
backfill nothing.** The existing strings are what operators actually wrote;
they stay untouched as original record. New readings populate the FK. Old rows
keep a text value and a null FK, which is an honest statement that the link was
never structured — not a gap to be filled by guessing which "refractometer"
someone meant.

Migration implication: one nullable column on a table with real production rows
(38 measurements today). Additive, no backfill, no rewrite. Materially smaller
than `18_` anticipated, because the hard part — deciding to record the device
at all — was already done.

### Decision 1 — block or downgrade? **Recommend downgrade.**

An out-of-calibration instrument should **not** block recording a measurement.
It should drive `data_quality` down by derivation.

Blocking is stricter and loses. In the field it gets routed around: the
operator writes the number on paper and enters it later, at which point the
platform has a reading with *worse* provenance, no instrument link, and no
record that calibration was ever in question. The fact is captured either way;
blocking only decides whether the platform learns the truth about it.

Downgrading is consistent with the platform already having a `data_quality`
axis at all. `verified` requires an in-calibration instrument; a reading from a
lapsed one is `provisional` — automatically, not because someone remembered.

The accumulation risk `18_` names is real and is answered by §5's readiness
view: instruments past due are visible *as a readiness problem*, next to the
faulty airlock, rather than discovered later in the data.

### Decision 2 — retroactive calibration failure. The hardest one.

When an instrument fails a check, every measurement since its last good check
is suspect. `DATA_ARCHITECTURE.md` §4 and `AI_GOVERNANCE.md` §6 forbid silently
relabelling evidence, and rewriting `data_quality` in place would be exactly
that — destroying the record of what was believed at recording time.

**Recommendation: a derived review queue that never touches the measurement.**

```
core.measurement_review_flag
  id, measurement_id
  raised_by_calibration_id   → the failing instrument_calibration
  reason                     'instrument_failed_calibration'
  raised_at
  reviewed_by_person_id, reviewed_at   nullable
  outcome                    nullable — confirmed | superseded | retained_with_limitation
  note
```

A failing calibration raises one flag per affected measurement — those with
`instrument_id` matching, `occurredAt` between the last passing calibration and
this failure. The measurement rows are untouched. Resolution is human: confirm
the value, supersede it with a re-measurement, or retain it with limitation
(which `data_quality` already expresses as `verified_with_limitation`).

Three properties this preserves:

- **The original reading is never altered.** What was recorded stays recorded.
- **The doubt is first-class and queryable**, not a note someone might read.
- **Resolution is attributable** — who reviewed it, when, and what they decided.

The unbounded case is real: a sensor failing after six months could flag
thousands of readings. Mitigations, in preference order: require calibration
intervals short enough that the window is bounded; flag at the
`instrument × window` level and expand lazily; cap and escalate rather than
generating a queue nobody can clear. Choosing among these needs real calibration
intervals, which do not exist yet — so it is named, not decided.

---

## 8. Consumables — the third inventory concept

Reagents, filters, gloves, jars, lids, labels, hive frames, foundation,
treatments. Consumed, never sold.

**The boundary, stated explicitly as ADR-020 decision 6 did for the other two:**

| Concept | What it counts | Status |
|---|---|---|
| Commerce SKU inventory | things sold to customers | built |
| Operational lot inventory (`traceability.inventory_item` / `inventory_movement`) | quantities of a `Lot` | ADR-020 decision 6 |
| **Consumable stock** | supplies consumed by operations | **this document** |

Never one table with three meanings.

```
core.consumable_item      id, name, unit_of_measure, note
core.consumable_balance   id, consumable_item_id, location_id, on_hand, par_level
                          — the same consumable at three sites is three
                            balances, not one
core.consumable_movement  id, consumable_item_id, location_id, delta,
                          occurred_at, reason (received|consumed|transferred|
                          adjusted|discarded), person_id, note
```

`on_hand` is a materialised sum of movements, not an independently edited
number — the same "derived, not stored twice" discipline as §4's allocation.
Low stock is `on_hand < par_level`, evaluated per site.

**Relationship to `MaterialConsumptionEntry`**, which already exists and
records what was consumed by a fermentation or drying run: that table stays.
It is the *irreversible operational fact* (`20_`'s whole point) and must not
depend on stock bookkeeping existing. A future link from a consumption entry to
a consumable movement is optional and additive — capture must never require the
inventory to be correct.

---

## 9. Access and RBAC

`18_` §9 asks whether partner-site equipment works without new permission
machinery. **It does. Confirmed, not assumed.**

- Each engagement is its own `Project` (`SPECIMEN_AND_MATERIAL_TRACEABILITY.md`
  §7), and equipment carries `project_id`.
- Equipment at a client site carries `classification = partner`.
- `RBAC.md` §3 and `lib/rbac/resolve.ts` give leaf scopes **exact identity
  only** — a `project` assignment never covers a sibling project, and never a
  location/competition/session leaf. Cross-client visibility is therefore
  already impossible without a second assignment.
- Classification remains an independent AND-gate on top.

New permissions needed: `equipment:view`, `equipment:manage`,
`equipment:report_condition` (deliberately separate — anyone working with a
machine should be able to report it faulty without being able to retire it),
and `consumable:manage`. No new *machinery*, only new verbs.

**One finding, and it belongs to ADR-059 rather than here.** The classification
AND-gate is not applied on the traceability read path, and every Lot is
`internal` while Farm Operator can clear only `partner`. If equipment relies on
classification for client separation, that gate must actually be enforced —
otherwise the separation is nominal. Equipment does not introduce this problem
and should not be the place it is fixed, but it does depend on the answer.

---

## 10. Sequencing

Within v2, and after Research OS, which is built.

1. **`Equipment` + custody + the three axes** (§2–§4). Everything else needs
   the entity to exist. Absorbs `material.vessel` before it is built.
2. **Readiness views** (§5). Highest value, derived — little new storage.
   Ahead of consumables, for the perishability reason in §5.
3. **Instrument calibration + the `Measurement` FK** (§7). Independent of
   readiness; can run in parallel.
4. **Consumables** (§8). Genuinely valuable, never irreversible — a miscount is
   discovered and corrected.

**Blocked on `Notification`** for anything that signals rather than displays.
Views in §5 are useful without it — someone looking sees the state. Pushing a
warning to someone *not* looking is what needs it, and that is where the value
mostly is. Four consumers now wait on that one entity.

**Explicitly not built, so it does not creep in** (`18_` §9): work-order
routing and approval chains, meter-triggered preventive maintenance,
spare-parts reorder automation, vendor and PO management, depreciation and
asset accounting, technician scheduling. Not a CMMS. Not a LIMS. Facilities,
buildings and vehicles are out, and are a plausible later extension of
`Equipment` rather than a new concept.

**Ampliado el 2026-09-19 (ADR-172):** rutinas por calendario que avisan, sobre
equipos e instalaciones; lo demás de esta lista sigue fuera.

**Ampliado otra vez el 2026-09-19 (ADR-177):** la misma rutina por calendario
cuelga también de un lugar sin equipo detrás —beneficio, instalación de secado
o bodega—, con el producto que se usó cada vez enlazado como un consumo más.

---

## 11. Decisions requiring product-owner input

Neither is resolved here.

1. **Out-of-calibration instruments: block or downgrade?** (§7 decision 1.)
   Recommended: downgrade, because blocking gets routed around in the field and
   the platform ends up knowing less.
2. **Retroactive review at scale** (§7 decision 2.) The mechanism is
   recommended; the bounding strategy needs real calibration intervals, which
   do not exist yet.
3. **Reprioritisation** (§5.) Recommended: readiness before consumables. This
   contradicts the original priority ranking, which put maintenance scheduling
   third, and the argument is perishability.
4. **Folding `material.vessel` into `Equipment`** (§2.) Recommended, and
   currently free — both are unbuilt. It stops being free the moment either
   ships.
