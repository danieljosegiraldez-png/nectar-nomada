# Draft ADR-048 — F1: farm-operation data model (Location attributes, microlots, labour/material against a place, PlantingEvent, Specimen/traps)

**Status:** DRAFT — not yet appended to `docs/architecture/DECISIONS.md`.
Per `docs/implementation/30_F1_OPERACION_FINCA_ESQUEMA.md` §8's explicit
instruction: *"texto de ADR en borrador (no lo anexes)."* Confirmed next
available number against the real file: `DECISIONS.md`'s last entry is
ADR-047 (T12.5 Asset provenance), so this drafts as **ADR-048**.
Re-confirm at append time — sessions between now and then may claim it
first.

**Session note (read before appending):** this exact "draft, never
appended" pattern has already produced two permanent orphans once before
in this codebase — `T12.5_ADR_DRAFT.md` and `ADR-037_DRAFT.md`, both sitting
unappended for multiple sessions until C1 §2 finally caught and appended
them as ADR-046/047. Don't let this be a third. The next session touching
this ticket, or the next full-repo audit, should append this and delete
the file — not leave it as a fourth loose draft.

---

## Context

`docs/implementation/29_BRECHAS_OPERACION_FINCA_INVESTIGACION_MIGRACION.md`
(a "dirección, no implementación" investigation, itself never meant to be
built from directly) identified four real gaps in farm operations that the
existing traceability model — built around `Lot`/batch — couldn't express:
stable per-lot terroir attributes, human-driven microlot subdivision, work
and material consumption against a *place* rather than a batch, and
individual-plant/trap tracking with sector. F1 implements exactly the four
sections of `29_` that map to these gaps (§4a, §4b, §5, §6); it explicitly
does not touch `29_`'s other sections (`RoastSession`, defect
classification, Research OS, map, water, climate — see the F1 execution
report for the full list of what remains unbuilt).

## Decisions

### 1. Labour/material against a Location: extend, don't create a new entity (29_ §5)

Four real, undocumented facts triggered this: 600 planting holes being dug,
cleanup of apiary sites, 600 seedlings received, a biochar-fermentation
waterwheel activated. None of these are against a `Lot` — T12.6's
`LabourEntry`/`MaterialConsumptionEntry` require one.

**Decision: add a nullable `locationId` FK to both existing tables** rather
than building a new entity, and build a **separate small `PlantingEvent`**
entity for the arrival/planting-specific facts (varietal, quantity, source
organization) that don't fit either table's shape.

**Reasoning:**
- `ReceivingEvent` (T4) was considered and rejected as a home for
  "receiving 600 seedlings" — it produces a coffee `Lot` and carries
  cherry-specific fields (`cherryWeightKg`, `brix`, `temperatureC`).
  Forcing seedlings through it would conflate two different kinds of
  "receiving," the same mistake CLAUDE.md §18 warns against for
  Species/Cultivar.
- `LabourEntry`/`MaterialConsumptionEntry` already model exactly the right
  shape for genuine labour-hours and material-consumption facts (workers,
  hours, task note / material name, batch label, quantity) — a hole-digging
  or a fumigation is structurally identical whether it happens against a
  `Lot` or a `Location`. Only the parent changes. A discriminated-union
  parent (`LabourEntryParent`/`MaterialConsumptionParent`, now five and
  three variants respectively) keeps this in the existing RBAC/audit path
  (`lot:manage`, reused rather than a new permission) rather than
  duplicating the whole entry shape.
- `PlantingEvent` is new because "600 Caturra seedlings received from
  Cafelino" is a different kind of fact — origin, varietal, and quantity of
  material entering the farm — matching `HarvestEvent`/`ReceivingEvent`'s
  own precedent of a purpose-built small entity rather than overloading
  `LabourEntry`.
- Both a whole-lot treatment (Sherry fumigating Lote 2 entirely) and a
  targeted one (three specific plants treated for roya) must coexist as
  valid, distinct records — the location-parent `LabourEntry`/
  `MaterialConsumptionEntry` covers the former; `SpecimenObservation`
  (decision 3, below) covers the latter.
- Costs deliberately excluded, per `20_CAPTURE_OR_LOSE_IT_REPORT.md`'s own
  standing criterion — capture physical facts now, defer monetary value to
  the not-yet-built operational-economics model.

### 2. Microlots: `Location.parentLocationId`, two non-negotiable rules (29_ §4b)

No new entity — a microlot is a `Location` with `locationType` inherited
from its parent and `parentLocationId` pointing at it, exactly the pattern
already proven for `plot` and `apiary_site` (A1).

**Rule 1 — no retroactive reassignment.** A batch harvested before a
microlot existed can only ever be attributed to the whole parent lot.
Nothing in this codebase reassigns an existing `Lot`/`HarvestEvent`'s
`locationId`, and `createMicrolot` doesn't add that capability — this rule
is enforced by omission, not by a check.

**Rule 2 — the system never detects microlots, and must not try to.**
Evaluated and explicitly rejected: detecting an internal difference would
require the difference to already exist as separately-harvested data,
which means a human already made the subdivision decision — detection
would be circular. `getAltitudeRange()` is the one arithmetic-only
exception the ticket allows: it returns the raw
`altitudeMaxM - altitudeMinM`, never a boolean against an invented
threshold. Human observation decides; the system only records the
decision and can surface the raw number that motivated it.

### 3. Broca traps modeled as `Specimen`, not a separate entity (29_ §5-§6)

The product owner's own open question — resolved here rather than left
pending, per the ticket's direct instruction.

**Decision:** `Specimen.specimenType` (`plant` | `trap`) discriminates a
trap from a plant. The active → removed → reinstalled lifecycle is **not**
a third/fourth `Specimen.status` value — status stays exactly
`active`/`removed`/`dead` (the last plant-only) — and the cycle instead
lives entirely in `SpecimenObservation` rows (`installed`/`removed`/
`reinstalled`), which also drive the status transition in the service
layer (`recordSpecimenObservation`). Capture-count trap readings
(`trap_check`, with a required `captureCount`) live in the same
observation table, read back as a series via `getTrapCheckSeries`.

**Reasoning:** the ticket's own instruction — *"no inventes un mecanismo
nuevo si el existente sirve"* — applied literally. A trap's state history
(when installed, when pulled for cleaning, when put back, what it caught
each check) is structurally identical to the observation log a tagged
plant already needed (bloom stage, health, material harvested). One
mechanism, two specimen types, discriminated by `specimenType`, not by
nulling out plant-only fields on a trap or vice versa.

Both sector mechanisms (`sectorSimple`: alto/medio/bajo, and
`gridRow`/`gridPosition`) are accepted simultaneously, never forced into a
choice — a `Specimen` "puede tener uno, el otro, los dos, o ninguno," per
the product owner's own words. Position, not GPS — canopy defeats GPS
precision in the field, the same problem
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §6 already had to solve.

No `species_id`/`cultivar_id` FK — `DOMAIN_MODEL.md` §4 specifies a
Species/Cultivar taxonomy that has never been built. Rather than building
that taxonomy now (not asked for by this ticket, and a real scope
expansion), `Specimen.commonName`/`varietalNote` and
`PlantingEvent.varietal` stay free text, same discipline CLAUDE.md §18
requires for not confusing species with cultivar prematurely.

### 4. Schema without interface, by explicit product-owner decision (29_ §6)

F1 ships migration, service layer (`lib/traceability/locations.ts`,
`specimens.ts`, `plantingEvents.ts`, the `operations.ts` location-parent
extension), RBAC (`location:manage_attributes`, `specimen:manage`/`view`),
and tests — **no UI**. The seedlings are six months old and won't fruit
until 2031; observations can be recorded manually in the field until an
interface exists. This mirrors `DOMAIN_MODEL.md` §7's own standing
principle: specifying ahead of building is the point of modeling in
advance, not a deferred obligation.

## Consequences

- Terroir correlation (altitude/sun/shade against cupping scores) becomes
  possible once real per-lot attribute values are entered — none are yet;
  see the F1 execution report's real-data-loading section.
- The RBAC gap this ticket's own real-data verification surfaced (Farm
  Operator assignments for the real Cerro Azul operators were
  project-scoped; every new F1 check requires location-scoped access,
  since `Location` carries no `projectId`) is now fixed for the real
  accounts that needed it, but is a standing design tension worth a future
  ADR of its own: should `location`/`specimen` RBAC checks fall back to
  project scope the way `lot:manage` already does via
  `scopeTargetsFor()`, or should Farm Operator assignments themselves
  become location-scoped as the norm? Not decided here — flagged for the
  product owner.
- ~150-300 real `Specimen` rows (stratified sampling across Lote 1-3) and
  the 30 real broca traps remain to be created by an actual person in the
  field with actual position/sector data — this ticket built the
  mechanism and proved it against real Neon, it did not and could not
  fabricate that field data.
