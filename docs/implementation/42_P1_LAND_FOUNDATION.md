# P1 — Land foundation: planting cohorts, cultivar vocabulary, multi-block harvest

Phase 1 of `docs/architecture/COFFEE_FIELD_OS_AUDIT.md` §26. Depends on P0
(merged, ADR-094) only in the sense that yield reporting is now trustworthy;
nothing here touches the quantity ledger.

**Context to read first:** the audit §5 (Farm/Block/Planting assessment), §8
(Harvest), and `30_F1_OPERACION_FINCA_ESQUEMA.md`, which this extends
directly rather than reworking.

**Written in English**, matching `41_P0_MASS_BALANCE.md` and the audit it
descends from. The field vocabulary inside it stays Spanish, as it does
everywhere else.

---

## 0. The data reality, and why it changes the shape of this ticket

Measured 2026-08-27 against the restored copy:

| | count |
| --- | --- |
| `Location` with `locationType = plot` | 8 |
| `Location` with `locationType = site` | 6 |
| `PlantingEvent` | **1** |
| `Specimen` | **0** |
| Distinct varietals recorded anywhere | **1** |

**The land model has essentially never been exercised.** F1 built the schema
deliberately ahead of the data — its own reasoning was that the plantones are
six months old and will not fruit until 2031, so the structure has to exist
before the observations do. That was right. But it means P1 would otherwise
stack a third unexercised layer on top of two, and the first time anyone finds
out whether the model fits would be years from now.

So this ticket is **not schema-only**. Loading the real Las Nubes and Cerro
Azul land data is part of it, and is the acceptance criterion that actually
matters. If the real data does not fit the model proposed here, the model is
wrong and should change before it is built on — that is the entire point of
doing it in this order.

Do §4 first if you want the shortest path to finding a design flaw.

---

## 1. `PlantingCohort` — the one genuine gap

A block contains multiple cultivars, planting years, ages and densities. Three
things partially answer that today and none answers it:

- `PlantingEvent` records *that* material arrived or went into the ground. It
  is an event, not a standing population, and there is exactly one row.
- `Specimen` tracks *individual* plants and traps, with sector and grid
  position. Right for the broca traps; far too granular for 4,000 trees.
- `Location.plantSpacingMeters` is a single value for a whole plot.

Nothing answers "what is planted in this block, how old is it, how dense".

```
PlantingCohort
  locationId          → Location(plot), required
  cultivarValueId     → VariableCatalogValue (§2), nullable
  plantedAt           DateTime?     — nullable; see precision below
  plantedPrecision    HarvestWindowPrecision?  — year | month | date
  plantCount          Int?
  densityPerHectare   Decimal?
  spacingMeters       Decimal?
  status              active | removed | renovated
  removedAt           DateTime?
  notes               String?
  provenanceClass     ProvenanceClass   — required, no default (ADR-038)
  dataQuality         DataQuality?
```

**Reuse `HarvestWindowPrecision`** (`year | month | date`, already in the
schema for S1's external coffee) rather than inventing a second precision
vocabulary. "Sembrado en 2019" and "sembrado el 14 de marzo de 2019" are
different claims, and a producer usually knows the first and not the second —
forcing a full date would manufacture precision that does not exist.

**`cultivarValueId` is nullable and must stay so.** A block whose cultivar
nobody is sure of is an ordinary situation, and `unknown` recorded honestly
beats a guess promoted to a fact (CLAUDE.md §3).

**Relationships, both optional and both additive:**

- `PlantingEvent.plantingCohortId` — the event that established or added to a
  cohort. Nullable: the one existing row predates cohorts and must stay valid
  with NULL, never backfilled with a guess.
- `Specimen.plantingCohortId` — a tracked individual belongs to a cohort. Also
  nullable; traps belong to no cohort at all.

**Renovation is a new cohort, not an edit.** When a block is stumped and
replanted, the old cohort goes `removed` with a `removedAt` and a new one
starts. The history of what stood there stays true — same version-preservation
rule as everything else in this schema.

---

## 2. Cultivar vocabulary — a `VariableCatalog`, not a taxonomy

Twenty `VariableCatalog`s exist and every one is a process vocabulary
(`cereza_flotado`, `medio_lavado`, `levadura_cultivo`, …). There is **no**
cultivar catalog, and varietal lives as free text in four places:
`PlantingEvent.varietal`, `Specimen.varietalNote`,
`HarvestEvent.cultivarNotes`, and `Sample.declaredVarietal`.

Add a `cultivar` catalog through the existing mechanism. **Do not build
Species/Cultivar tables** — `DOMAIN_MODEL.md` §4 specifies them, F1 and RO1
both deliberately declined to build them, and `VariableCatalog` already
supports what is actually needed: controlled values, aliases pointing at a
canonical row, definitions, and display order.

Seed at minimum what the farms actually grow — Caturra, Catuaí, Castillo,
Geisha, Pink Bourbon, Typica, Bourbon — plus whatever §4's real data turns up.
Add `desconocido` explicitly, with `impliesUnknownIdentity = true`: that flag
exists for exactly this and is already honoured by
`lib/research/treatments.ts`.

**Aliases matter here more than usual.** "Catuaí" / "Catuai" / "Catuaí Rojo"
are the same plant written three ways, and the alias mechanism resolves them
to one canonical row without destroying what someone actually typed.

**Do not migrate the existing free-text columns yet.** Leave them; let the
catalog populate through new writes, and revisit consolidating once there is
enough real data to see which spellings actually occur. Rewriting four columns
against 1 row of data would be guessing.

---

## 3. `Location.areaHectares` — missing, and blocking a whole report class

`Location` carries sun exposure, shade bracket, altitude range, slope, soil
and plant spacing after F1, but **no area**. So "planted area", "yield per
hectare" and "cultivar distribution by area" — the audit §41 farm reports —
cannot be computed at all, not even approximately.

One nullable `Decimal` column. Additive, no backfill.

Deliberately **not** derived from a boundary polygon: no polygon exists (the
audit §32 found `geoPoint` referenced by zero lines of code), and a producer
knows their block's hectares long before anyone walks its perimeter with GPS.
When polygons arrive in Phase 7, this column becomes the declared value to
reconcile the computed one against — which is more useful than either alone.

---

## 4. Load the real land data — do this first

`HarvestEvent.locationId` is already required, so every batch already names
its plot. What is missing is everything above the batch.

For Las Nubes Cerro Azul and Finca Las Nubes Jaramillo, load: each plot's
area, its cohorts (cultivar, planting year, plant count, density), and link
the existing `PlantingEvent` (the 600 Caturra plantones from Cafelino) to the
cohort it established.

**Ask the product owner for the real figures. Do not infer them.** The audit's
§9 remediation is a live example of what inferred quantities cost: three lots
are flagged `conflicting` in production right now precisely because nobody
wants a plausible number standing in for a measured one.

Where a figure genuinely is not known — and for a block planted before anyone
was recording, it often will not be — record the cohort with the fields that
are known and leave the rest NULL, with `dataQuality` saying so. A cohort with
a cultivar and no plant count is useful. A cohort with an invented plant count
is worse than nothing.

---

## 5. `HarvestEventSource` — a harvest from several blocks

`HarvestEvent.locationId` is a single **required** FK, so a harvest drawing
from several blocks cannot be expressed. Today that is survivable because
picking is small; it stops being survivable the moment a day's pick from three
blocks goes into one tank, which is normal practice.

```
HarvestEventSource
  harvestEventId      → HarvestEvent, required
  locationId          → Location(plot), required
  plantingCohortId    → PlantingCohort, nullable
  cherryWeightKg      Decimal?
```

**Keep `HarvestEvent.locationId` as it is.** Do not make it nullable and do
not remove it. It stays the primary plot — the one a single-block harvest
names, and the one the V1 vocabulary ticket's own test asserts is structurally
required. `HarvestEventSource` rows are additional contributions, and a
single-block harvest simply has none. That keeps every existing row valid and
every existing query correct, which a nullable-and-migrate approach would not.

Sum of source weights should reconcile against `HarvestEvent.cherryWeightKg`
— but **report the difference, do not enforce it**. This is intake, not a
conserving transformation; P0's ADR-094 Decision 4 is the precedent, and the
reason is the same one: an alarm that fires on ordinary practice gets switched
off.

---

## 6. What this unlocks

Reporting only, no new machinery: planted area by cultivar, plant age
distribution, yield per hectare and per cohort, and cultivar performance
across seasons — the last of which is the first question a producer actually
asks and the platform currently cannot answer at all.

Yield per cohort is only trustworthy because P0 fixed the ledger. Before
ADR-094 every one of these numbers would have been inflated by whatever
transformations sat between the harvest and the measurement.

---

## 7. Tests

- A cohort with a cultivar and no plant count is valid; `dataQuality` records
  why.
- Two cohorts on one plot with different cultivars and planting years coexist.
- Renovation: old cohort `removed` with `removedAt`, new cohort `active`, and
  the old one is still queryable with its original values intact.
- `PlantingEvent` with NULL `plantingCohortId` stays valid — the pre-existing
  row is the fixture.
- Cultivar alias resolution: "Catuai" resolves to the canonical "Catuaí".
- `desconocido` requires `dataQuality`, matching `impliesUnknownIdentity`'s
  existing rule.
- A harvest from three blocks records three `HarvestEventSource` rows and its
  primary `locationId` unchanged; source weights summing short of
  `cherryWeightKg` is recorded, not rejected.
- RBAC: Farm Operator can manage cohorts within their scope; a
  wrong-project operator cannot.

---

## 8. Migration

Entirely additive. No backfill, no nullable→required, nothing destructive.

New: `traceability.planting_cohort`, `traceability.harvest_event_source`.
Added columns: `core.location.area_hectares`,
`traceability.planting_event.planting_cohort_id`,
`traceability.specimen.planting_cohort_id`.
Seed: the `cultivar` VariableCatalog and its values.

New permissions are **not** needed — `lot:manage` and
`location:manage_attributes` already cover this, and Farm Operator holds both.
Adding one with nowhere to be used would fail the ADR-091 build check.

---

## Not in scope

- Block boundary polygons and any map work — Phase 7.
- Migrating the four existing free-text varietal columns onto the catalog —
  see §2; not enough data to do it honestly yet.
- Species/Cultivar taxonomy tables — specified in `DOMAIN_MODEL.md` §4,
  declined twice already, declined again.
- Per-picker payment or named labour. `LabourEntry` records aggregate
  headcount and hours by deliberate design (T12.6); changing that is a
  product decision, not a P1 detail.
- Field sessions, field events, GPS on events — Phase 2.
