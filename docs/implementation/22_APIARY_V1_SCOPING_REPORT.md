# Apiary in v1 — scoping report (response to `22_APIARY_V1_SCOPING_PROMPT.md`)

**Scoping only, as instructed. No code, no schema, no migrations were
touched producing this report.** Five deliverables per the prompt's §6,
in order. Boundary analysis first, because it decides the size of
everything after it.

**Status note, current as of 2026-08-12** — the prompt's §2 framed this
against "coffee's T12.6, T13, T14 still outstanding in the same window."
That has moved since the prompt was written: **T12.6 and T13 are now both
done** (committed `a7b07e6` and the just-committed T12.6 work). **Only T14
(full E2E test + DEMO seed) remains outstanding for coffee.** This
meaningfully reduces the concurrency risk §2 was flagging — apiary's build
window no longer has to interleave with two other in-flight coffee
tickets, only one, and T14 touches seed scripts and a test file, not the
Traceability UI apiary's own tickets would touch. Recorded here so the
sequencing discussion in §3 below starts from the real state, not the
prompt's.

---

## 1. The boundary analysis (§3 test against each item)

> **Test: can the platform carry one apiary through a season of
> inspections to a honey batch with a sensory result?**

Going through the proposed-in list literally, then the proposed-out list,
then what's missing from both.

### Proposed in — verdicts

| Item | Verdict | Reasoning |
|---|---|---|
| `Apiary`, `Hive`, `Colony` | **Split verdict — see §2.** `Apiary` is not a new entity; `Hive`/`Colony` are. | Detailed below — this is the single largest reuse finding in this pass. |
| `Inspection` | **Pass, required, and it's the real deliverable.** | It's the verb in the test itself ("a season of inspections"). Everything else in this report exists to support this one form being fast and honest. |
| `HealthObservation` and interventions (feeding, treatment) | **Pass on substance, fail on shape as separately proposed.** Recommend collapsing into fields on `Inspection`, not separate tables. | Nothing in the source material describes feeding or treatment happening independently of a physical visit to the hive — they're observed and administered *during* an inspection, the same relationship `FermentationIntervention` has to `FermentationRun`, except here the "intervention" and the "routine check" are usually the same visit, not a separate event type. Three proposed tables collapse to fields on one. See §2. |
| Colony origin (purchased/captured/split; fact only, not full mechanics) | **Pass, required — and it's a capture-or-lose-it fact, same class as T12.6.** | A colony's origin, once forgotten, is not reconstructable from anything else the platform records. This is the same reasoning ADR-044 already applied to labour hours and material batch identity — worth naming explicitly in the ADR draft (§6) rather than treating as a fresh justification. |
| `Harvest → HoneyBatch` | **Pass, required — literally named in the test.** | See §2 for whether `HoneyBatch` is a new table or a `Lot`. |
| Sensory linkage, reusing T12's mechanism | **Pass, required — literally named in the test ("with a sensory result").** | Cheaper than it looks if `HoneyBatch` is a `Lot` — see §2. |

### Proposed out — do these hold?

All four hold, and I found no reason to move any of them back in:

- **Full colony division mechanics / queen genealogy** — confirmed
  correctly deferred. Kenneth populates Apiary 2's two empty hives by
  nucleus purchase this season, not splitting, so division mechanics are
  never exercised. Recording the *fact* of origin (§1 above) costs a
  column; recording the *mechanics* of division costs a DAG. Correct to
  defer the DAG, wrong to defer the fact — the boundary in the prompt's
  own §3 already draws this line correctly.
- **Pollination projects** — correctly out. No relationship to "inspection
  to honey batch to sensory result" at all; this is a different workflow
  Colony/Apiary would eventually feed into, not a dependency of this test.
- **Honey processing, packaging, path to Commerce Product** — correctly
  out, and consistent with an existing decision, not a new one: ADR-039
  already stops coffee's own v1 at "a cupping score and a lot report,"
  explicitly excluding Commerce SKU/Product linkage for coffee too. This
  isn't an apiary-specific gap; it's the same v1 boundary coffee already
  has, applied consistently.
- **Apibotanical/floral studies** — correctly out. `GUIDED_FIELD_STUDY_TOOL.md`
  is a substantial, separately-scoped feature; nothing in this ticket
  needs it, and nothing this ticket builds blocks it later (a `Colony`'s
  eventual forage/bloom correlation is a future join, not a structural
  dependency).

### What the test requires that neither list names

Two real gaps, both operational rather than schema:

1. **Partner-site RBAC/access setup is assumed but never listed as an
   item.** Three of five named testers work three different sites
   (Kenneth/Cerro Azul, Chayanne/Kiva-Toabré, Mickelle/San Juan). Without
   this, nobody can log in and use anything else in this ticket. It's not
   new architecture (`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §7 already
   specifies the exact pattern — Project-per-engagement,
   `classification = partner`, leaf-scope containment), but it is real
   setup work with its own sequencing position. Added as its own ticket
   in §3.
2. **Provenance/data-quality baseline is assumed by §4 but not gated as
   its own checklist item.** Every new fact-bearing table
   (`Colony`, `Inspection`, the harvest/extraction event) needs
   `provenanceClass` required-no-default and `dataQuality` nullable, per
   ADR-038 applied a fourth time. Not a separate ticket — folded into
   whichever ticket creates each table, exactly as T12.6 did.

One more worth flagging even though it's outside the literal test text:
**photo attachment** is mentioned in §4 (reuse section) as something to
follow T12.5's pattern, but it never actually appears in §3's own checklist
of what the test requires. Strictly, the test ("inspections... honey
batch... sensory result") doesn't name photos. But the same capture-or-
lose-it logic that pulled T12.5 (media) and T12.6 (labour/consumption)
into coffee's v1 over the falsifiable-test line applies at least as
strongly here — a photo of a diseased frame taken mid-inspection is
exactly as irrecoverable as anything else on this list, arguably more so
than labour hours, since a description in a text note can't substitute
for what a photo shows. I recommend including it (sized small — see §3,
ticket A6), but flag it honestly as outside the literal test, same as
T12.5/T12.6 both were for coffee.

---

## 1a. Revision (2026-08-12): the `Inspection` collapse was too tight

Correction to §1's verdict on `HealthObservation`/feeding/treatment (the
table row above, left unedited as the original record) and to §2's
"genuinely new" description of `Inspection`. A confirmed operational fact
breaks the original collapse: **a beekeeper visits an apiary to feed, and
that is not an inspection.** No hive is opened, no brood pattern read, no
colony strength assessed. The same is true of a treatment applied on its
own visit, or an observation made in passing — robbing activity, a
dead-out noticed from outside, weather damage. Requiring an `Inspection`
row to record any of these forces a choice between two bad outcomes: an
empty inspection whose fields are all null (which corrupts the inspection
record as evidence — a real assessment and a feeding stop become
indistinguishable in the data), or the feeding goes unrecorded.

**The three shapes considered:**

1. **`ApiaryVisit` as parent, `Inspection` as one optional activity kind
   among several under it.** Rejected. It adds a structural layer
   (`ApiaryVisit`) on top of four activity tables underneath it
   (`Inspection`, `Feeding`, `Treatment`, `Observation`) — five new tables
   for this piece alone, on top of `Hive`/`Colony`. That's eight-plus
   total, the exact table-count explosion §2's reuse finding was written
   to avoid. It also solves a problem that doesn't need solving: nothing
   in the source material requires knowing that a feeding and an
   inspection happened on "the same visit" as a first-class fact — that's
   recoverable by querying same-operator, same-day, same-apiary rows if
   ever needed, not a relationship worth a parent table.
2. **Separate sibling tables (`Feeding`, `Treatment`, `Observation`)
   attaching directly to `Colony`, `Inspection` remaining its own formal
   record.** Right shape, wrong table count. This is four new event
   tables (`Inspection` plus three siblings) plus `Hive`/`Colony` plus the
   harvest event — seven total. Correct in principle, more tables than
   the distinction actually requires.
3. **What I'm recommending instead: `Inspection` stays exactly as formal
   and exactly as protected as the original design intended, but `Feeding`/
   `Treatment`/passing `Observation` merge into one new typed table —
   `ColonyEvent`, discriminated by an `eventType` enum
   (`feeding | treatment | passing_observation | other`) — rather than
   three separate sibling tables.**

**Why this is the right cut, not a shortcut.** The prompt asks whether
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §2's `specimen_observation`
pattern (one table, typed `observation_type` enum, provenance columns)
applies, or whether interventions need their own shape. Checked directly:
`specimen_observation`'s own type vocabulary
(`bloom_start|bloom_peak|bloom_end|health|material_harvested|other`) is
exclusively state-observations — nothing in that table's design mixes in
an action-taken fact, which is a real signal that this repository's own
existing convention treats "one typed table" as an observation-only
pattern, not a general-purpose catch-all. That argues against folding
feeding/treatment into a `specimen_observation`-style table alongside
passing observations without comment. But it doesn't argue for three
separate tables either — the repository has a second, equally established
pattern that fits better here: **one table, typed by an enum, holding a
set of type-specific nullable columns**, exactly the shape
`FermentationIntervention` (`interventionType`:
`inoculation|agitation|purge|addition|sample|transfer|termination|other`),
`DryingTurnEvent` (`eventType`: `turned|covered|uncovered|other`), and
`QuantityEvent` (`eventType`) already use. `ColonyEvent` is that pattern
applied here — `feeding` and `treatment` are two of its type values,
`passing_observation` is a third, sharing one table because none of the
three carries `Inspection`'s specific evidentiary claim ("a trained
person opened the hive and assessed it") that made mixing dangerous in
the first place. The corruption risk in the original design was specific
to `Inspection`'s unique evidentiary weight, not a general problem with
sharing a table — once `Inspection` is structurally walled off (a
different table, with a type vocabulary that has no `inspection` value
in `ColonyEvent` and no `feeding`/`treatment` value in `Inspection`), the
DB schema itself makes the original bug impossible, not just discouraged
by convention.

One divergence from the precedent I'm borrowing the shape from, worth
flagging explicitly rather than silently inheriting: **`FermentationIntervention`
and `DryingTurnEvent` do not carry `provenanceClass`** (checked directly
against `prisma/schema.prisma` — neither column exists on either table,
a gap T9.5's retrofit didn't reach, since ADR-038 named five specific
tables and stopped there). `ColonyEvent` and the revised `Inspection`
both get `provenanceClass` regardless, per ADR-038 applied a fourth/fifth
time — I'm reusing this precedent's *table shape*, not its incomplete
provenance coverage.

**The distinction that matters — observation vs. intervention, and why
it doesn't need separate tables to be real.** An inspection and a
passing observation record state; a feeding or treatment changes it.
This shows up as a real, enforced difference in `provenanceClass`
default, not as a schema fork: the action layer fixes
`provenanceClass = direct_observation` for `Inspection` rows and for
`ColonyEvent` rows where `eventType = passing_observation` (a state fact,
witnessed), and `provenanceClass = original_record` for `ColonyEvent`
rows where `eventType = feeding` or `treatment` (a record of an action
taken) — the user's own framing of "a feeding is an `original_record` of
an action taken" maps onto an already-real `ProvenanceClass` enum value
with no invention needed. This is the same non-operator-selectable,
fixed-per-call-site pattern T12.6 already used (`provenanceClass` fixed
at the action layer, not offered as a picker) — extended here to two
different fixed defaults depending on `eventType`, still zero picker UI,
still zero schema fork.

**Revised shapes:**

```
model Inspection {
  id, colonyId, occurredAt, operatorPersonId
  outcome            InspectionOutcome   // nothing_unusual | issue_observed — NOT NULL, unconditional
  broodPatternNote   String?
  queenSighted       Boolean?
  storesLevel        String?
  temperamentNote    String?
  pestDiseaseFlags   String?
  note               String?
  provenanceClass    ProvenanceClass     // fixed direct_observation at the action layer
  dataQuality        DataQuality?
  createdAt, createdBy
}

enum ColonyEventType { feeding, treatment, passing_observation, other }

model ColonyEvent {
  id, colonyId, eventType ColonyEventType, occurredAt, operatorPersonId
  feedingMaterial     String?   // e.g. "sugar syrup 1:1" — feeding only
  feedingQuantity     Decimal?
  feedingUnit         String?
  treatmentProduct    String?   // e.g. "Apivar" — treatment only
  treatmentBatchLabel String?   // treatment only — required at the service layer, see below
  treatmentDose       Decimal?
  treatmentDoseUnit   String?
  note                String?   // passing_observation's payload; free text on any type
  provenanceClass     ProvenanceClass   // action layer: feeding/treatment -> original_record; passing_observation -> direct_observation
  dataQuality         DataQuality?
  createdAt, createdBy
}
```

`outcome` moving to a true `NOT NULL` column (rather than the
service-layer-conditional requirement the original single-table design
would have needed) is a genuine improvement the split enables, not just
a consequence of it — it's the same reasoning ADR-038 decision 1 already
argued for `provenanceClass` ("required makes the compiler/schema the
enforcement mechanism, not a runtime convention"), reapplied here at the
DB level: an `Inspection` row without a stated outcome is now
structurally impossible, not just discouraged.

**Table-count honesty, per the prompt's own instruction.** This is **one
more table than the original report proposed** — `Hive`, `Colony`,
`Inspection`, `ColonyEvent` (four new structural tables, up from three)
plus the unchanged harvest/extraction event table (one) — **five new
tables total, not four.** Justified by the operational fact that broke
the original design; not free, stated plainly rather than minimized. It
does not reopen the case for the eight-plus-table literal reading of
`DOMAIN_MODEL.md` §4 — three of those eight-plus concepts
(`HealthObservation`, `Feeding`, `Treatment`) still collapse into one
table, just not into `Inspection`.

**Treatment batch/product identity — recommend in v1, not deferred.**
The prompt asks directly whether treatment needs its own product/batch
identity given regulatory and residue implications for honey. Yes,
include `treatmentProduct`/`treatmentBatchLabel`/`treatmentDose`/
`treatmentDoseUnit` on `ColonyEvent` now, with `treatmentBatchLabel`
required whenever `eventType = treatment` (service-layer validation,
same shape as `MaterialConsumptionEntry.batchLabel`'s existing
requiredness in T12.6 — the DB column stays nullable since it's
meaningless for the other three event types, but `recordColonyEvent`
rejects a treatment row missing it, mirroring
`recordMaterialConsumptionEntry`'s own validation). This is the same
capture-or-lose-it class of fact ADR-044 already named for labour hours
and material batch identity — irrecoverable once the season passes — but
the consequence of *not* capturing it is more severe here than for
fermentation's yeast batch: if a residue issue surfaces in honey later
and there is no record of which product, batch, or dose was applied to
which colony, the only honest response is to treat every colony's honey
as suspect, since there is no way to isolate which ones actually received
the treatment in question. Fermentation material lacking a batch record
degrades a quality investigation; a missing treatment record here can
force discarding or quarantining honey that was never actually at risk,
alongside honey that was. `feedingMaterial`/`feedingQuantity`/`feedingUnit`
stay optional and unstructured (free text, no required identity) —
sugar syrup doesn't carry the same regulatory class of risk, and forcing
identity capture there would be exactly the friction §5 warns against
for no corresponding benefit.

RBAC is unaffected by this revision: `ColonyEvent` writes reuse the same
`apiary:manage` permission `Inspection` and `Hive`/`Colony` already use
(A1), the same "one permission covers every write in this domain,
`lot:manage` already does this for six different Traceability write
paths" reasoning T12.6 established.

---

## 2. The one architectural decision underneath everything: is `HoneyBatch` a `Lot`?

This determines whether the ticket breakdown in §3 is small or large, so
it gets its own section rather than being buried in the table above.

**Recommendation: yes — `HoneyBatch` should be a `Lot` with a new
`LotType` value (e.g. `honey`), created via a new small harvest/extraction
event, not a parallel `HoneyBatch`/`Extraction`/`Storage` chain built from
scratch.**

This directly extends the reasoning already established earlier in this
session for `RoastSession` (roasting a green coffee lot three ways is
representable as a `stage_change`/`split` `LotTransformation` producing
distinct output `Lot` rows, `lotType: "roast"`, each carrying its own
downstream identity) — the same shape: a physically distinct output
material becomes a new `Lot`, not a new parallel table, whenever the
existing `Lot` machinery already does everything that output needs.

**What reuse buys, at zero additional schema cost, if `HoneyBatch` is a `Lot`:**

- `Sample.sourceLotId` already exists and already works — a honey sample
  reaches Sensory exactly the way `createSampleFromLot`
  (`lib/traceability/samples.ts:56`) already handles for coffee. §3's
  "Sensory linkage, reusing T12's mechanism" item becomes close to zero
  backend work, not a new integration.
- `QuantityEvent` (the ledger), `Measurement`, `StorageAssignment`, and
  T12.5's `Asset` attachment (nullable `lotId` FK, already generic) all
  apply to a honey-batch `Lot` unmodified — no new tables for weight
  tracking, no new photo-attachment plumbing, no new storage-location
  tracking.
- T13's `getLotReport` mechanism becomes reusable later (v1.1, not
  claimed here) for a honey-batch report with zero new report-generation
  code — noted as a future benefit, not scoped into this pass.

**What it costs:**

- `LotType`'s current enum (`cherry, processing, drying, green, roast,
  sample, other`) is implicitly coffee-stage-shaped. Adding `honey` is a
  one-line additive enum value (same migration shape as every prior
  `LotType`/`RecordStatus`-style addition in this project), but Lot
  Detail's UI (`app/lots/[id]/page.tsx`) has coffee-specific section
  copy (Cosecha, Fermentando, etc.) that would need honey-aware
  branching wherever it renders stage-specific labels. Real, but
  contained — a UI-layer cost, not a schema-layer one, and it doesn't
  touch any existing coffee row or query.
- `HarvestEvent`'s actual columns (`cherryWeightKg`, `brix`, `condition`,
  `ripenessNotes`) are coffee-cherry-specific and don't fit an apiary
  harvest regardless of what the *output* type is. A new small event
  table is needed either way — reusing `Lot` doesn't remove this cost,
  it only means that new event table produces a `Lot` via
  `resultingLotId` (mirroring `HarvestEvent`'s own shape) instead of
  inventing a `HoneyBatch` table that then needs its own copies of
  `QuantityEvent`/`Measurement`/`StorageAssignment`/`Asset` wiring.

Net: one new small event table either way; the only real choice is
whether everything *downstream* of that event reuses four already-built
subsystems for free or duplicates them. Reuse wins clearly.

### What is genuinely new — `Apiary`, `Hive`, `Colony`, `Inspection`

Unlike `HoneyBatch`, these are not consumable/transforming material moving
through a DAG — they're persistent physical infrastructure plus a
recurring log against it, which is a different shape than anything `Lot`
models.

- **`Apiary` is not a new table.** It's a site — a physical place holding
  hives, the same relationship a farm has to its plots. `Location` already
  supports arbitrary hierarchy (`parent_location_id`,
  `location_type`: country/province/district/locality/site) specifically
  so a new kind of "place" doesn't need its own table. An `Apiary` is a
  `Location` row (`locationType` gains a value, e.g. `apiary_site`,
  `parentLocationId` = the property/farm it sits on). Zero new tables.
  **Naming flag:** `OrganizationType` already has an `apiary` value
  (an *organization* that operates an apiary business — e.g. how Kenneth's
  operation might be typed). That is a different concept from the
  *physical site* being proposed here as a `Location`. They don't collide
  in the schema (different tables, different enums), but the name overlap
  is worth being deliberate about in any UI copy or documentation that
  uses "apiary" for both, so a future reader doesn't conflate "this
  Organization is typed apiary" with "this Location is an apiary site."
- **`Hive`** — genuinely new. A physical, addressable structure ("H-014")
  that outlives any single colony occupying it. Small table:
  identifier, `locationId` (the Apiary), install date, status
  (active/empty/retired).
- **`Colony`** — genuinely new, and genuinely distinct from `Hive` even
  though they're 1:1 most of the time: a colony can die, swarm, or be
  requeened while the physical hive box persists, and origin (§1) is a
  fact about the colony, not the box. Small table: `hiveId` (current),
  origin fields, status (active/dead/absconded), started-at.
- **`Inspection`** — genuinely new, and the highest-value table in this
  entire ticket, since it's both the highest-frequency write and the one
  the whole falsifiable test is actually testing. `colonyId`,
  `occurredAt`, `operatorPersonId`, `provenanceClass`/`dataQuality`
  (ADR-038 pattern, fourth application), plus the collapsed
  health/feeding/treatment fields from §1, plus an `outcome` field
  distinguishing "nothing unusual" from "issue observed" — the field the
  entire form design in §4 is built around.
  **Correction, 2026-08-12 — superseded, see §1a.** The collapse
  described above (feeding/treatment as `Inspection` fields) does not
  survive an operational case a beekeeper visit to feed with no
  inspection taking place. `Inspection` keeps its own fields exactly as
  listed here minus health/feeding/treatment; those move to a new
  `ColonyEvent` table. Left standing above as the original record, not
  deleted.

This cuts the schema surface implied by a literal reading of `DOMAIN_MODEL.md`
§4's full chain (`Apiary → Hive → Colony → Inspection`, `Queen`, `Feeding`,
`Treatment`, `HealthObservation`, `Bloom/Flora`, `Harvest → HoneyBatch →
Extraction → Storage` — eight-plus entities) down to **three new tables**
(`Hive`, `Colony`, `Inspection`) **plus one new small harvest/extraction
event table plus one `LotType` enum value** — everything else is either a
`Location` row, a `Lot` row, or a field, not a table.
**Correction, 2026-08-12 — see §1a.** The revised count is **four new
tables** (`Hive`, `Colony`, `Inspection`, `ColonyEvent`), not three — one
more than originally found, justified in §1a. The reuse finding itself
(cutting an eight-plus-entity literal reading down sharply) still holds;
only the exact count moved by one.

---

## 3. Ticket breakdown

Numbered `A1`-`A8` (Apiary), not continuing coffee's `T`-sequence, since
this is a separate vertical with its own dependency chain that only
touches coffee's tickets at the RBAC/Location layer, not at any coffee-
specific table.

**On sizing:** relative to T1-T12.6 only, not calendar time. This session
has no reliable velocity data to convert "relative to T8" into "N weeks" —
each built ticket in this project's history also included a live-Neon
verification pass and an implicit review checkpoint, and the actual
constraint on the 11-week window is more likely reviewer/approval
bandwidth per ticket than build time. I'm not going to fabricate a
calendar estimate to answer §6's "be honest about whether it fits"
literally — the honest answer is that fit depends on a variable this
report has no data for. What I can say concretely: the schema surface is
small (§2's finding), which is the input most likely to make the calendar
question tractable, whatever the actual per-ticket review cadence turns
out to be.

**Revision note, 2026-08-12:** §1a's model correction changes A2's scope.
The table below shows A2 **as originally proposed**, immediately followed
by **A2 — REVISED**, rather than silently replacing the original row —
the original is the record of what this report proposed before the
correction. A new **A0** ticket is also added, required by §7's offline
reassessment below (not part of the original A1-A8 set).

| Ticket | Depends on | Schema | Backend | Frontend | Size, relative to built tickets |
|---|---|---|---|---|---|
| **A0 — Offline base mechanism** *(added 2026-08-12, see §7)* | None (infrastructure, can start in parallel with A1) | `offline.draft_record`, `offline.sync_conflict` per `OFFLINE_FIELD_CAPABILITY.md` §3-4, scoped to A5's forms only — no map-tile caching (`MAP_AND_TERRITORY.md`'s own need, not required here) | Service worker + IndexedDB draft queue + sync + versioned conflict resolution (never last-write-wins, per `OFFLINE_FIELD_CAPABILITY.md` §4) | Persistent offline indicator; "sync now" control | **Large — the single biggest unknown in this whole set.** Nothing built so far in this project touches a service worker or PWA infrastructure at all; there is no in-repo precedent to size against, unlike every other ticket in this table. Likely larger than A5. Flagged, not minimized. |
| **A1 — Apiary site + Hive/Colony schema + RBAC** | None (parallel to coffee's T14) | `Location.locationType` gains `apiary_site` (additive enum value, same shape as T4's `plot` addition); new `Hive`, `Colony` tables; `Permission` gains an `apiary` subject (`manage`/`view`), reusing the existing `Assignment → Scope → RoleProfile → Permission` mechanism verbatim | `lib/apiary/hives.ts`: createHive, createColony (mirrors `lib/traceability/lots.ts`'s shape, much smaller — no DAG) | None yet (T10-style UI is A5) | **Small — between T8 and T9.** Two small tables, no transformation DAG, RBAC catalog addition is data, not new mechanics. |
| **A2 — Colony origin + Inspection schema/service** *(as originally proposed — superseded below)* | A1 | New `Inspection` table (collapsed shape per §2 — health/feeding/treatment as fields, not child tables); `Colony` gains origin fields | `lib/apiary/inspections.ts`: recordInspection | None yet (A5) | **Small-medium, closer to T8 than T6.** One table despite many columns; no second table the way `FermentationIntervention` needed one, because the collapse in §1/§2 removed that need. |
| **A2 — REVISED (2026-08-12): Colony origin + Inspection + ColonyEvent schema/service** | A1 | New `Inspection` table (formal only, per §1a) **and** new `ColonyEvent` table (`feeding`/`treatment`/`passing_observation`, per §1a) — two tables, not one; `Colony` gains origin fields | `lib/apiary/inspections.ts`: recordInspection; `lib/apiary/colonyEvents.ts`: recordColonyEvent (validates `treatmentBatchLabel` required when `eventType = treatment`, mirroring `recordMaterialConsumptionEntry`) | None yet (A5) | **Small-medium, between T8 and T6 — one step up from the original estimate.** Two tables instead of one, but both small and no transformation DAG; still well short of T6's size (which paired a run *and* built a second table for a fundamentally different reason — a long-lived process, not a type-discriminated log). |
| **A3 — Harvest/extraction → HoneyBatch as `Lot`** | A1, A2 (revised) | `LotType` gains `honey` (additive enum value, same shape as `roast`); new small `ApiaryHarvestEvent`-equivalent table (mirrors `HarvestEvent`'s shape: `colonyId`, `extractedWeightKg`, `framesHarvested`, `resultingLotId`, provenance) | `lib/apiary/harvest.ts`: recordApiaryHarvest, producing a `Lot` via the *existing* `recordTransformation`-adjacent pattern already proven for coffee's `HarvestEvent` | None yet (A5) | **Small, comparable to T4's schema layer alone** (T4 built two event tables; this is one, since Receiving has no apiary analogue in this scope). |
| **A4 — Sensory linkage** | A3 | None | Near-zero — `createSampleFromLot` (`lib/traceability/samples.ts:56`) already accepts any `Lot`; `getSensoryLinkageForSamples` (`lib/traceability/lots.ts:603`) already works off `Sample`, domain-agnostic | Folds into A5's Lot/HoneyBatch detail view, not a separate screen | **Near-zero — may not warrant a standalone ticket.** Listed separately here for traceability against §3's own checklist item, but recommend folding into A3's definition of done rather than tracking as its own line once actual work starts. |
| **A5 — Operator UI: Inspection form + ColonyEvent quick-entry + Hive/Colony views + Harvest→HoneyBatch UI** | A0, A1-A4 | None | Server actions mirroring `app/actions/traceability.ts`'s pattern | New `/apiaries`, `/apiaries/[id]`, per-hive/colony detail, the Inspection form and `ColonyEvent` quick-entry points (§4 design, revised) — built offline-aware from the start per §7, not retrofitted | **Medium-large, comparable to T10, larger than originally estimated.** The first UI surfacing everything above, same integration-gap risk T10's own row called out, now also carrying the offline-aware requirement A0 provides — real added surface versus the original estimate, not just a dependency line. |
| **A6 — Photo attachment** | A5 | `Asset` gains `hiveId`/`colonyId`/`inspectionId`/`colonyEventId` nullable FKs (a `honeyBatchId` is unnecessary — it's a `Lot`, so the existing `lotId` FK already covers it, another small reuse win from §2) | Extends `lib/traceability/media.ts`'s existing request/finalize functions — same functions, new parent-kind cases, not new functions | Reuse `PhotoUploadForm.tsx` wholesale, wired into four new attachment points | **Low, comparable to T12.5 but smaller** — T12.5 built the whole pattern from nothing across 6 points; this is 4 more points on an existing pattern. |
| **A7 — Partner-site setup (Chayanne, Mickelle)** | A1 (RBAC only — can start in parallel with A2-A6) | None (data/config only) | None | None | **Operational, not really a build ticket** — creating Projects (each carrying both relevant `ProjectDomainTag`s, e.g. Cerro Azul keeps `coffee` and gains `apiary`, since CLAUDE.md §8 / `ProjectDomainTag` already models a project belonging to multiple domains at once), Assignments, `classification = partner` per `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §7 verbatim. No new architecture — comparable to T9's "mostly pre-completed" note. |
| **A8 — DEMO seed + E2E test** | A1-A6 | Seed script additions only | None | None | **Medium, mirrors T14 directly**, plus one addition per §7: the E2E test's definition of done should include at least one `Inspection` or `ColonyEvent` recorded via the offline path and confirmed to sync, not just the online path. |

**Sequencing against coffee's remaining T14:** A1-A4 (schema/service layer)
touch no file T14 touches (T14 is seed-script + test-file only, scoped to
the coffee chain). A5 (the UI ticket) and A8 (seed/E2E) are the two most
likely to want the same attention T14 needs, since both are
integration-proving passes. If sequencing pressure shows up anywhere, it
will be there, not in A1-A4. **A0 changes this picture** — it's
infrastructure with no coffee-side analogue, so it doesn't compete with
T14 for the same files, but it is now the largest unknown in the entire
sequencing plan (see §7), and A5 cannot start in earnest ahead of it.

---

## 4. The inspection form design

Per the prompt's own framing: everything else in this ticket is
scaffolding around this one form, used dozens of times a season,
one-handed, in gloves, in sun, often with no signal.

**Required vs. optional, explicitly:**

*Required:* `colonyId` (pre-filled, see below — never operator-selected
per entry), `occurredAt` (defaults to now), `operatorPersonId` (defaults
to self, same pattern as `LabourEntryForm`'s "Reportado por"), and one
field that decides the entire rest of the form's shape: **`outcome`** —
`nothing_unusual` or `issue_observed`. Nothing else is required. This is
deliberate: §5 warns that a required field an operator can't answer
produces garbage that looks like data, and there is no apiary-inspection
fact besides "I looked and nothing was wrong" that is always true and
always answerable in the field.

*Optional, shown only when `outcome = issue_observed`:* brood pattern
note, queen sighted (bool), stores/honey level, temperament note,
pest/disease flags, feeding given (bool + note), treatment given (bool +
note), free-text note, photo (A6). None of these render at all for the
common case — this is the direct fix for §5's own warning that an
optional field costing the same tap-count as a required one gets skipped
regardless of whether something was actually observed.

**Correction, 2026-08-12 — superseded by §1a's model split.** "Feeding
given" and "treatment given" no longer live inside the `Inspection`
form's expanded-details section — per §1a, an inspection and a feeding
are different facts, and a beekeeper who only feeds should never be
routed through the `Inspection` form at all. Revised: the same Colony
page that hosts the `Inspection` form's one-tap/expand pair also hosts
three lightweight, independent quick-entry points — **"Log feeding,"
"Log treatment," "Log observation"** — siblings of the `Inspection`
form, not nested inside it, each posting directly to `recordColonyEvent`
with `eventType` fixed by which button was tapped (never operator-
selected, same "fix the common case, don't ask" discipline as
`provenanceClass` throughout this project). "Log feeding" is two field-
taps (material, quantity) plus submit, matching `LabourEntryForm`'s own
golden-path shape. "Log treatment" is three field-taps (product, batch
label, dose) plus submit, one more than feeding specifically because
`treatmentBatchLabel` is required (§1a) — an honest cost for an honest
requirement, not minimized to match feeding's tap count. "Log
observation" is a single free-text field plus submit. None of these three
entry points share a screen state with the `Inspection` form or with each
other; a beekeeper who only feeds twelve hives in sequence taps "Log
feeding" twelve times and never opens the inspection form once.

**Pre-filled from context:** the form is only ever reachable from a
specific Colony's own page (`/apiaries/[apiaryId]/hives/[hiveId]`, or
equivalent), never from a bare "new inspection" entry point that asks the
operator to select apiary/hive/colony first. `colonyId` is a hidden
field, exactly the pattern `LabourEntryForm`/`MaterialConsumptionForm`
already use for their parent IDs. Standing at H-014, the hive is already
known by virtue of which page is open.

**The actual tap sequence, routine case:** one tap on a prominent
"Nothing unusual" button that submits immediately (occurredAt=now,
operator=self, outcome=nothing_unusual, everything else null) — **one
tap, not two.** This goes one step further than T12.6's own "2 taps + 1
submit" golden path, because §5 explicitly names "nothing unusual" as the
single most common outcome and the one most likely to be skipped if it
costs the same as a detailed entry — the only way to guarantee it never
costs more than the alternative (skipping it, i.e. not inspecting at all
or not recording that you did) is to make it cost less than any other
option on the screen. A secondary, visually smaller "Record details"
control expands the optional-fields case — same collapsed-by-default
pattern T12.6 already used for the in-kind labour checkbox, applied here
to the exceptional case instead of an optional add-on.

**Offline note — revised, 2026-08-12, see §7.** The original report
framed this as "don't build it here, but don't preclude it," on the
prompt's own §5 instruction. §7 below revisits that directly and
concludes it doesn't hold for apiary specifically: offline support is now
in scope as ticket A0, a prerequisite for A5, not a future-proofing note.
What's unchanged and still true: every entry point in this design — the
one-tap `Inspection` submit, the expanded-details submit, and all three
`ColonyEvent` quick-entry points added above — is a single POST with no
server round-trip mid-flow, which is exactly the shape
`OFFLINE_FIELD_CAPABILITY.md` §3's `draft_record` model wraps. That
design property is now load-bearing rather than a nice-to-have: it's what
makes A0 a wrapper around already-correctly-shaped forms rather than a
form redesign.

---

## 5. Deliberately not built — and the consequence of each

Mirroring T12.6's own "deliberately not captured" note, since the same
discipline (log what's cut and why, so it can't quietly reappear without
a reason later) applies here.

- **Full colony division mechanics / queen genealogy.** Consequence: if a
  colony is split mid-season despite the plan not calling for it this
  year, that event has no structured record — origin captures a flat
  fact (purchased/captured/split), not a parent-child link. Recoverable
  in v1.1 only if the fact was noted informally elsewhere; otherwise
  genuinely lost, same irreversibility class as everything else on this
  list, but judged acceptable because the plan states it won't happen
  this season.
- **Pollination projects.** Consequence: none — zero time-boxed data at
  risk, unrelated workflow.
- **Honey processing, packaging, path to Commerce Product.** Consequence:
  none specific to apiary — `HoneyBatch` stops exactly where coffee's
  `Lot` already stops for v1 (a batch with a sensory result, not a
  sellable SKU). A batch that becomes a jarred product later has no
  `HoneyBatch → Product` FK yet, same boundary ADR-039 already drew for
  coffee.
- **Apibotanical/floral studies.** Consequence: no forage/bloom
  correlation captured this season, even though a batch's eventual
  flavor is bloom-driven. Zero overlap cost with its own future build —
  nothing here blocks `GUIDED_FIELD_STUDY_TOOL.md` later.
- **`HealthObservation`/feeding/treatment as separate tables** (collapsed
  to `Inspection` fields, §2). Consequence: "all treatments across all
  colonies this season" is a filtered query over `Inspection` rows, not a
  clean join against a dedicated table — a real reporting limitation, but
  not required by the falsifiable test, and reversible in v1.1 by
  normalizing out once real usage shows the flattened shape is limiting.
  **Correction, 2026-08-12 — superseded, see §1a.** This premise no
  longer holds: feeding/treatment/passing observation are not collapsed
  into `Inspection`; they're a separate `ColonyEvent` table. The revised,
  smaller consequence: "all treatments this season" is now a filtered
  query over `ColonyEvent` rows (`WHERE eventType = 'treatment'`), not a
  clean join against a dedicated `Treatment` table — a real but much
  smaller limitation than the original bullet described, and the same
  v1.1 reversibility applies if usage ever shows the shared-table shape
  limiting.
- **Full offline/PWA.** Consequence, and the one I'd flag as more acute
  here than for coffee: the prompt's own §5 says inspections happen
  "often with no signal," more directly than anything in coffee's
  operator-UI assumptions (`ADR-039`'s deferral list assumes
  connectivity generally, not "often absent" specifically). An
  inspection at a hive with no signal must be remembered and entered
  later from memory — converting what should be a same-day
  `direct_observation` into, at best, a next-day recollection with lower
  `dataQuality`. This is exactly the failure mode ADR-044's
  capture-or-lose-it reasoning exists to prevent, and it's a real,
  named risk this scoping pass is choosing to accept for v1 rather than
  building the offline layer now — worth the reviewer weighing
  explicitly, not just inheriting coffee's existing deferral by default.
  **Correction, 2026-08-12 — reassessed, see §7. No longer on this
  list.** Direct reassessment concluded offline is not honestly
  deferrable for apiary specifically — it has moved into scope as ticket
  A0. Left here, struck from "deliberately not built," because the
  original entry undersold its own finding — this bullet already named
  the right risk, it just filed the conclusion in the wrong list.

---

## 6. Draft ADR amendment to ADR-039 (draft only — not appended to `DECISIONS.md`)

---

**ADR-DRAFT — Amendment to ADR-039: apiary enters v1 scope, on a
different basis than any item already on its deferred list**

*Revised 2026-08-12 to reflect §1a's `Inspection`/`ColonyEvent` model
correction and §7's offline reassessment — this draft has not been
appended to `DECISIONS.md` and remains under review, so it is corrected
in place rather than carrying a separate superseded copy, unlike the
ticket table in §3.*

**Context.** ADR-039 deferred "Apiary/honey structured schema" out of v1
on the reasoning that architecture-only-per-`DOMAIN_MODEL.md`-§4, no
tables exist, not required by the falsifiable test. That reasoning was
sound when written and has nothing wrong with it as architecture — it is
now outdated for a reason that has nothing to do with architecture
either: the platform's actual named pilot testers are mostly beekeepers.
Of five named testers (Kenneth/Cerro Azul, Chayanne/Kiva-Toabré,
Mickelle/San Juan on apiary; Bob and Sherry/Cerro Azul on coffee), three
of five work apiary. Deferring apiary as ADR-039 currently does leaves
three of five pilot users with nothing to use. The v1 test was written
before the users were named — this is exactly the situation in which a
logged decision should be revisited openly rather than quietly
overridden, per `CLAUDE.md` §61's own decision protocol.

**The amendment itself.** Unlike T12.6's amendment (ADR-044), which
justified labour-time/material-consumption capture entering v1 on a
narrow *capture-or-lose-it* basis (the falsifiable test didn't need them,
but the calendar window to capture them closes permanently), apiary's
justification is different and should not be conflated with that one:
**apiary enters v1 because the population of people who will actually use
v1 requires it, not because the falsifiable test requires it or because
data would otherwise be irrecoverably lost.** The falsifiable test itself
is not amended — "carry one real 2026 harvest from cherry through to a
cupping score and a lot report" still stands unchanged for coffee. This
amendment adds a **second, parallel v1 boundary** specific to apiary,
proposed as:

> Can the platform carry one apiary through a season of inspections to a
> honey batch with a sensory result?

Both tests must pass for v1 to be complete; neither substitutes for the
other. This is a different kind of amendment than ADR-044's, and is
recorded as such explicitly, so a future reader doesn't assume every
ADR-039 amendment shares one justification.

**What this scoping pass found, and would build (A0-A8, full detail in
`22_APIARY_V1_SCOPING_REPORT.md`).** Four new tables (`Hive`, `Colony`,
`Inspection`, `ColonyEvent`), not the eight-plus a literal reading of
`DOMAIN_MODEL.md` §4 implies — `Apiary` is a `Location` row, not a new
table, and `HealthObservation`/feeding/treatment collapse into one typed
`ColonyEvent` table (`eventType`: feeding/treatment/passing_observation)
rather than three separate ones, while `Inspection` remains its own
formal, structurally protected record — a real operational case (a
feeding visit is not an inspection) ruled out folding them together, per
§1a. `HoneyBatch` is a `Lot` (new `LotType` value `honey`) rather than a
parallel chain, reusing
`Sample`/`Measurement`/`StorageAssignment`/`Asset`/`QuantityEvent`
unmodified — the same reasoning already established this session for
`RoastSession` (a physically distinct output becomes a new `Lot`, not a
new parallel table, when the existing `Lot` machinery already covers what
it needs). One new small harvest/extraction event table
(`colonyId`/`extractedWeightKg`/`resultingLotId`, mirroring
`HarvestEvent`'s shape). Every new fact-bearing table carries
`provenanceClass` required-no-default per ADR-038, applied a fourth and
fifth time, with per-type defaults (`direct_observation` for inspections
and passing observations, `original_record` for feeding/treatment) fixed
at the action layer, not operator-selectable. `ColonyEvent` additionally
carries `treatmentProduct`/`treatmentBatchLabel`/`treatmentDose` for
treatment rows — batch identity required, given the regulatory/residue
stakes honey carries that fermentation material does not. Colony origin
is captured as a flat fact (purchased/captured/split), full division
mechanics and queen genealogy explicitly deferred to v1.1 since this
season's testers won't exercise them. RBAC reuses the existing
`Assignment → Scope → RoleProfile → Permission` mechanism verbatim (new
`apiary` permission subject, extending the existing `Farm Operator`
profile rather than adding a parallel role, since the same person —
Kenneth — works both coffee and apiary at one site). Partner-site access
for Chayanne and Mickelle reuses `SPECIMEN_AND_MATERIAL_TRACEABILITY.md`
§7's pattern verbatim — Project-per-engagement, `classification =
partner`, no new architecture. **Offline support (`OFFLINE_FIELD_CAPABILITY.md`'s
base mechanism, scoped to this ticket's forms) is in scope as a
prerequisite (A0), not deferred** — §7 concluded the "often no signal"
condition named in the source material is the primary use case for this
ticket's core form, not an edge case, and shipping without it would mean
the platform's central deliverable here doesn't actually work where it's
meant to be used.

**What remains deferred, unchanged from this report's §5 except
offline.** Full colony division/queen genealogy, pollination projects,
honey processing/packaging/Commerce Product linkage, and apibotanical/
floral studies (its own feature, `GUIDED_FIELD_STUDY_TOOL.md`). Full
offline/PWA is no longer on this list — see above and §7.

**Consequence, stated plainly per the prompt's own instruction not to
present this as a free addition.** This expands v1 scope and moves real
risk: four new tables, one new `LotType` value, one new small event
table, a full offline base mechanism (A0 — the single largest unknown in
this entire set, with no in-repo precedent to size against), and a full
new Operator Workbench surface (A5, sized comparable to T10 — the largest
single ticket coffee's v1 needed, now larger still once built
offline-aware) all enter the same window coffee's remaining T14 sits in.
The schema surface is smaller than a literal reading of `DOMAIN_MODEL.md`
§4 would suggest, which is this report's main schema-level finding — but
the addition of A0 means the overall ticket set is not smaller than it
first looked, only smaller *on the schema axis specifically*. "Smaller
than it looked" was never the same claim as "free," and after this
revision it is even more clearly not the whole picture.

---

## 7. Offline reassessment (2026-08-12 revision): is it still deferrable?

**Direct answer: no. Offline support is not honestly deferrable for
apiary's Operator UI (A5), specifically, even though it remains correctly
deferred for coffee's.**

The original report (§5) filed this as a flagged risk under "deliberately
not built," inheriting coffee's existing ADR-039 deferral by default. On
direct reassessment, that's the wrong bucket. The test case makes this
concrete: Kenneth works through twelve hives in sequence at Cerro Azul
with no connectivity. If nothing saves until he returns to signal, one of
two things happens — the session's data is lost outright, or he writes on
paper and transcribes that evening, which does not recover a
`direct_observation`, it manufactures a same-day recollection wearing a
`direct_observation`'s clothing unless the schema is honest enough to
downgrade `dataQuality` for it (and even then, it's strictly worse data
than what a working sync mechanism would have captured).

The distinction that matters, and the reason the answer differs from
coffee's: ADR-039's deferral of full offline/PWA assumed "v1's operator
UI assumes connectivity" as a *background* condition workable most of the
time, with occasional gaps. The apiary prompt's own §5 states the
opposite as the *normal* condition for this specific form — "often with
no signal" describes the primary use case for the highest-frequency write
this whole ticket exists to enable, not an edge case around its margins.
Shipping A5 "online-only, connectivity assumed" doesn't mean "offline is
a future improvement" the way it did for T10 — it means the form doesn't
reliably work in the condition it's most often used in, which is a
different and more serious claim than a deferred nice-to-have.

**What this adds to the breakdown:** ticket **A0** (§3, added above),
scoped narrowly to what A5 actually needs — the `offline.draft_record`/
`offline.sync_conflict` mechanism, service worker, and IndexedDB draft
queue from `OFFLINE_FIELD_CAPABILITY.md` §1-4, wired to the `Inspection`
and `ColonyEvent` forms specifically. Explicitly **not** in A0's scope:
map-tile caching (`MAP_AND_TERRITORY.md`'s own need, unrelated to this
ticket) or offline support for any coffee-side or other Partner Workspace
form — building the full cross-cutting generality
`OFFLINE_FIELD_CAPABILITY.md` eventually specifies, ahead of any other
form actually needing it, would be exactly the speculative over-build
`CLAUDE.md` §49 warns against. `OFFLINE_FIELD_CAPABILITY.md` §8's own
sequencing note already anticipated this: "build the base mechanism once
Field Study Tool or Partner Workspace forms are actually being
implemented (whichever comes first triggers building this)." A5 is that
trigger — this isn't a new architectural decision, it's executing a
contingency this document already named in the abstract, now that a
concrete "first" has arrived.

**Sequencing consequence, stated directly rather than softened:** A0 is
sized as the largest unknown in the entire A0-A8 set (§3) — nothing built
in this project to date touches a service worker or PWA mechanism, so
there is no in-repo precedent to calibrate against, unlike every other
ticket in this breakdown. A5 should not start in earnest ahead of it,
since building the Inspection/`ColonyEvent` forms "online-first" and
retrofitting offline afterward risks exactly the rework T13's own
"print-friendly from the start" lesson was about avoiding — cheaper to
build the right shape from the first pass than to bolt it on. This is a
genuine, material addition to the scope this report originally proposed,
not a footnote, and it is reported as such rather than minimized to
protect the "tractable" framing §2 and §3 otherwise support.

---

**End of report, revised 2026-08-12.** Per the prompt's §6: report, then
stop. No build started; A0-A8 have not been begun, and T14 has not been
started either, per this revision's own closing instruction.
