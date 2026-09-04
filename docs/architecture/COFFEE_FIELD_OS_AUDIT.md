# Specialty Coffee Field OS — Repository Architecture Audit

**Scope:** repository-wide audit of `nectar-nomada-package` against the
Specialty Coffee Field OS specification. No implementation, no new models,
no migrations. Audit date 2026-08-27, against `prisma/schema.prisma`
(4,518 lines, 122 tables, 10 Postgres schemas, 44 migrations) and ADR-001
through ADR-092.

---

## 1. Executive Summary

The repository is **much closer than the specification assumes on the data
model, and much further away than it assumes on the delivery
architecture.** Almost every "propose the minimum generic normalized
model" instruction in the prompt describes something that already exists
and works. Almost every assumption that a mobile client could talk to this
system is wrong.

### The five real strengths

1. **The material lineage DAG already exists and is the right shape.**
   `Lot` / `LotTransformation` / `LotTransformationInput` /
   `LotTransformationOutput` is a normalized many-to-many transformation
   graph with per-contributor quantities. Split, merge, blend, multi-farm
   blend and arbitrary multi-step transformation are all expressible
   today, and `getLotLineage` already walks it in both directions with
   recursive CTEs. The prompt's candidate concepts (`LotLineage`,
   `MaterialTransformation`, `MaterialContribution`) are all **DUPLICATE
   RISK** — building them would create a second lineage system.

2. **Provenance discipline is unusually rigorous and already universal.**
   `ProvenanceClass` and `DataQuality` are required with **no default**
   (ADR-038) on every fact-bearing table, corrections are append-only
   (`Measurement.correctsId` + mandatory reason), `LotTransformation` has
   no update path by construction, and `AuditEvent` is append-only with
   before/after JSON. The spec's §40 auditability requirements are largely
   already met.

3. **RBAC is complete, enforced, and already has the right roles.**
   `Scope`/`RoleProfile`/`Permission`/`Assignment` with 11 seeded role
   profiles — including **Farm Operator**, already scoped to project *or
   location*, and **Project Viewer**. An independent `ClassificationLevel`
   gate is enforced alongside permission resolution (ADR-063, ADR-081).
   §39 is essentially satisfied.

4. **The protocol/standards engine largely exists.** `Protocol` →
   `ProtocolVersion` (draft/active/superseded, never overwritten) →
   `ProtocolVariable` + `ProtocolRequiredMeasurement`, plus
   `VariableCatalog`/`VariableCatalogValue` with aliases and definitions.
   `completeProcessingStage` already refuses to close a stage missing a
   required measurement. This is most of §19 and §20.

5. **An offline draft queue with idempotent server-side replay already
   works.** `lib/apiary/offlineQueue.ts` is a real IndexedDB queue with
   client-generated UUIDs, ordered replay, transport-failure vs
   server-rejection distinction, storage-quota estimation and a staleness
   purge. The server side checks `clientDraftId` before insert, so a
   retried sync is a no-op. A service worker and web manifest ship in
   `public/`. **This exists for exactly two tables** (`apiary.inspection`,
   `apiary.colony_event`) — but the pattern is proven, not theoretical.

### The seven structural gaps, in order of consequence

1. **Mass balance is not enforced, and the quantity ledger actively
   double-counts.** This is the most serious finding in the audit and it
   is a correctness bug in shipped code, not a missing feature. See §9.

2. **There is no API a mobile client could use.** Three route handlers
   exist in the entire repository: NextAuth, a CSV export, and the Stripe
   webhook. Every operational write is a Next.js Server Action taking
   `FormData`. See §17 and §18.

3. **No Field Session, no generic Field Event, and no GPS on any event.**
   Latitude/longitude exist on exactly one model (`Location`). See §6.

4. **Event time integrity is two-thirds missing.** `occurredAt` and
   `createdAt` are everywhere; `recordedAt` (device clock), device
   identity and sync timestamp are nowhere — except a single untyped
   `Measurement.deviceId` string. See §9 of the spec / §21 below.

5. **Selection is modeled as research observation, not as material.**
   Rejected coffee has no lot identity, no weight and no destination. See
   §11.

6. **Geospatial is schema-only.** `Location.geoPoint` is a real PostGIS
   column referenced by **zero lines of application code**. No polygons,
   no boundaries, no map library anywhere in the dependency tree.

7. **A documented, accepted offline architecture conflicts with the new
   direction.** `OFFLINE_FIELD_CAPABILITY.md` commits explicitly to
   "PWA, no separate native app", and `25_OFFLINE_OPTIONS_ANALYSIS.md`
   compared three options **none of which was native**. The Android +
   SQLite direction supersedes an accepted decision. See §58 Decision A.

### One more finding worth surfacing early

`Lot.lotCode` and `Sample.sampleCode` are **globally `@unique`**, not
unique per organization. That is simultaneously an offline-collision
hazard (two disconnected devices both minting `LN-027`) and a
multi-tenant defect (two farms cannot both have a lot "01"). It will
bite the moment either offline creation or a second real organization
arrives.

### Validation status (§55)

| Command | Result |
| --- | --- |
| `npx prisma validate` | **pass** (exit 0) |
| `npm run typecheck` | **pass** (exit 0) |
| `npm run lint` | **pass** (exit 0) |
| `npm test` | **pass** — 52 files, 531 tests |
| `npm run build` | **pass** (exit 0, local path skips migrate/seed) |

**Pre-existing failures: none. Audit-caused failures: none.** The audit
made no functional changes; the only file added is this document.

### Decision status

The five decisions in §58 that required product direction were **all
resolved on 2026-08-27**, each as recommended. The architecture is
settled; §26's phases are ready to execute against, starting with
Phase 0.

---

## 2. Current Relevant Architecture

What actually exists, stated without borrowing the spec's vocabulary.

**Deployment shape.** A single Next.js 16 / React 19 application. Not a
monorepo — no workspaces, no packages directory, one `package.json`.
Prisma 7 against one Neon Postgres with 10 module-owned schemas (`core`,
`commerce`, `experiences`, `partner`, `sensory`, `ai`, `competitions`,
`traceability`, `apiary`, `research`). PostGIS is enabled. Object storage
is Cloudflare R2 behind an `objectStorageProvider` adapter.

**Identity.** `Person` (the human, may have no email) is separate from
`UserAccount` (the login, unique per person). `ExternalIdentity` holds
provider links. Authority hangs off `UserAccount`. Auth.js v5 with a
**JWT session strategy, 7-day maxAge**, no database session table.

**Authorization.** `Assignment(userAccount, roleProfile, scope)` where
`Scope` is `platform|program|project|location|competition|session|
experience`. Permissions are a seeded catalog of `resourceType:action`
pairs. `ClassificationLevel` (`public|registered|partner|internal|
confidential|trade_secret`) is a second, independent axis checked
alongside permissions.

**Canonical entities.** `Person`, `Organization`, `Location` (self-
referential hierarchy, typed `country|province|district|locality|site|
plot|apiary_site`), `Project`, `Sample`, `Asset`.

**Material traceability** (`traceability` schema). `Lot` typed
`cherry|processing|drying|green|roast|sample|honey|other`, with **no
stage column** — current stage is always derived from transformation
history, deliberately (execution plan §8.2). `LotTransformation` typed
`split|merge|blend|stage_change|sample_extraction|loss|disposal|sale`,
append-only, optionally bracketing a `FermentationRun`, `DryingRun` or
`RoastSession`. `QuantityEvent` is an append-only quantity ledger.
`Measurement` is a generalized typed observation with a unit registry
(`lib/traceability/units.ts`) carrying canonical units and min/max ranges
per variable. `HarvestEvent` and `ReceivingEvent` are the two first-mile
lot origins. `StorageAssignment` is location history. `LabourEntry` and
`MaterialConsumptionEntry` capture crew-hours and inputs.
`PlantingEvent`, `Specimen` and `SpecimenObservation` cover standing land
assets.

**Research OS** (`research` schema). `ResearchProgram` → `ResearchQuestion`
→ `Hypothesis` → `Experiment` → `Protocol` → `ProtocolVersion` →
`TreatmentBatch` → `ProcessingStage` → observations/measurements, with
`Evidence` → `EvidenceClaim` → `Interpretation` → `Conclusion`, plus
`Deviation`/`CorrectiveAction`/`Approval` and `AnalysisPlan`/`AnalysisRun`.

**Sensory and Competitions.** Full configurable-protocol sensory stack
with blind coding gated by a dedicated permission, plus a competition
engine.

**The write surface.** `app/actions/*.ts` — 15 Server Action modules.
`app/actions/traceability.ts` alone exports 16 actions. Every one takes
`(prevState, FormData)` and returns `{ error?: string }`. Underneath sits
`lib/<module>/*.ts` — **typed service functions taking
`(userAccountId, input)`**, which perform their own RBAC checks and audit
writes. That separation is the single most important architectural asset
for the mobile plan.

**The read surface.** Server Components calling `lib/*` directly.

---

## 3. Capability Matrix

Columns follow §46; "Existing / where" merges the prompt's *existing
implementation* and *relevant files/models* columns, which carry the same
information.

### Farm, land and planting

| Capability | Existing / where | Status | Gap | Recommended action | Migration risk | Offline implications | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Farm entity | `Location(site)` + `Organization(farm)`; F1 terroir fields | EXISTING | none material | Reuse; do **not** add `Farm` | none | Reference data, pull-only | — |
| Block / plot | `Location(plot)` + `parentLocationId`; sun, shade, altitude range, slope, soil, spacing | EXISTING | no polygon/boundary | Reuse; add geometry later | low (additive) | Pull-only; needs offline vector tiles eventually | P2 |
| Block boundary geometry | `Location.geoPoint` (Point only), **zero code references** | PARTIAL | no polygon, no GIS code, no map lib | Add `geography(Polygon)` additively when maps land | low | Large payloads — selective sync | P3 |
| Planting cohort | `PlantingEvent` (event), `Specimen` (individual plant) | PARTIAL | no standing cohort entity: cultivar × year × density per block | New `PlantingCohort`; see §5 | low (additive) | Reference data, pull-only | P1 |
| Cultivar / species taxonomy | free text (`varietal`, `commonName`, `cultivarNotes`) | MISSING | no controlled vocabulary | Use `VariableCatalog`, not new tables | none | Pull-only | P2 |
| Certifications | `Person.sensoryCertifications` (sensory only) | MISSING | no farm/org certification | Defer | — | — | DEFER |

### Tasks, sessions and events

| Capability | Existing / where | Status | Gap | Recommended action | Migration risk | Offline implications | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Task | `partner.Task` — project-scoped, title, dueDate, status, one assignee | PARTIAL | no farm/block/cohort target, no template, no dependency, no recurrence, no planned/actual time, no required evidence; assignee is a `UserAccount`, which field crew do not have | Extend `Task`, don't fork it; add `Person` assignee | medium (assignee semantics) | Assigned tasks must pull; status is *controlled update* | P1 |
| Task template | — | MISSING | — | New, small | low | Pull-only | P2 |
| Field session | — | MISSING | no envelope grouping a visit's events | New `FieldSession`; see §6 | low (additive) | Created offline; core | P1 |
| Generic field event | many specialized tables (`QuantityEvent`, `FermentationIntervention`, `DryingTurnEvent`, `SpecimenObservation`, `ColonyEvent`, `ProcessingStageObservation`) | PARTIAL / DUPLICATE RISK | no chronological envelope, no GPS, no unified timeline | Add `FieldEvent` as a **timeline spine that references** existing rows — do not replace them | low | Core offline object | P1 |
| GPS on events | `Location.latitude/longitude` only | MISSING | no point capture on any observation, asset or event | Add lat/lon/accuracy to `FieldEvent` + `Asset` | low (additive) | Captured offline, always | P1 |
| Event time integrity | `occurredAt` + `createdAt`; `Measurement.deviceId` (string) | PARTIAL | no `recordedAt`, no device FK, no `syncedAt` | Add the three; see §21 | low (additive, nullable) | Prerequisite for sync | P0 |

### Material, mass balance and lineage

| Capability | Existing / where | Status | Gap | Recommended action | Migration risk | Offline implications | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lot / batch identity | `Lot`; one coherent model already | EXISTING | `lotCode` globally unique | Scope uniqueness per org; see §9 | **medium — real data** | Blocks offline creation | P0 |
| Split / merge / blend lineage | `LotTransformation` + Input/Output joins; `getLotLineage` recursive CTEs | EXISTING | none | Reuse verbatim | none | Splits/merges are *critical* conflicts | — |
| Multi-farm blend | many-to-many inputs with per-input quantity | EXISTING | percentages are derived, not stored | Compute, don't store | none | Critical class | — |
| Quantity ledger | `QuantityEvent`, append-only, summed | PARTIAL | see next row | — | — | Append-mostly | — |
| **Mass balance invariant** | `recordTransformation` writes outputs only | **CONFLICT** | **inputs are never decremented; material is double-counted after every split/merge/stage change; no tolerance; no test** | Fix before anything else; see §9 | **high — needs backfill decision** | Must be enforced server-side, never client-side | **P0** |
| Material state taxonomy | derived from transformation history; `LotType` is coarse | PARTIAL | no `DEPULPED`/`WET_PARCHMENT`/`DRY_PARCHMENT` vocabulary | `VariableCatalog`, not an enum | low | Pull-only | P2 |
| Selection event | `cereza_seleccion` / `cereza_flotado` catalogs as `ProcessingStageObservation` | PARTIAL / DUPLICATE RISK | categorical only — no weights, no rejected-material identity | Model as `LotTransformation`; see §11 | low | Core offline op | P1 |
| Rejected material | — | MISSING | floaters/green/debris vanish | Rejected output = a real `Lot` | low | Core | P1 |
| Yield / conversion factors | derivable from the DAG | PARTIAL | no reporting | Compute in reports | none | Server-side | P2 |

### Process, quality and research

| Capability | Existing / where | Status | Gap | Recommended action | Migration risk | Offline implications | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fermentation | `FermentationRun` + `FermentationIntervention` + `Measurement` | EXISTING | no vessel entity (free text `vesselNote`); no water/gas/pressure columns — but those are `Measurement` variables | Reuse; add variables to the unit registry | none | Append-mostly | — |
| Drying | `DryingRun` + `DryingTurnEvent` + `Measurement` | EXISTING | `method` is free text | Optionally catalog it | low | Append-mostly | — |
| Storage | `StorageAssignment` + `Measurement` | EXISTING | container is free text | Reuse | none | Controlled update | — |
| Processing pathways (washed/natural/honey/anaerobic) | `ProtocolVersion` + `ProtocolVariable` + `VariableCatalog` | EXISTING | none | Reuse — this is the configurable-stages system §22 asks for | none | Pull-only | — |
| Protocol scheduling (T0, T+6h, T+12h) | `ProtocolRequiredMeasurement.atProcessingStage` (free-text stage name) | PARTIAL | **no time offsets, no sequencing, no notification** | Add offset + sequence | low (additive) | Drives offline local notifications | P1 |
| Operating standards (max floaters 5%) | `ReferenceStandard` is **sensory compound thresholds**, a different concept despite the name | MISSING / DUPLICATE RISK | no acceptance thresholds, no versioned operating standard | New `OperatingStandard` + version; reuse the `ProtocolVersion` versioning shape | low | Pull-only, cached | P2 |
| Deviation / override | `Deviation` + `CorrectiveAction` + `Approval` | PARTIAL | bound to `TreatmentBatch`/`ProcessingStage` only; no standard-breach linkage; no override actor/reason record | Widen parents additively | low | Critical class | P2 |
| Sample | `core.Sample`, `sampleType` free text, `sourceLotId` + `sourceTransformationId` | EXISTING | none | Reuse — covers cherry/parchment/green/soil/leaf/water/micro | none | Created offline | — |
| Physical QC | `Measurement` + unit registry (moisture, water activity, density) | PARTIAL | no defect-count/screen-grade structure | `VariableCatalog` + `Measurement` | low | Append-mostly | P2 |
| Sensory / cupping | full `sensory` schema | EXISTING | none | Reuse | none | Out of offline scope | — |
| Experiment architecture | `Experiment` → `Protocol` → `TreatmentBatch` → `ProcessingStage`, with control declaration and experiment lineage | EXISTING | no explicit `Replicate` level | `TreatmentBatch` already serves as replicate; confirm before adding | none | Pull-only | P3 |
| Experiment ⊂ production | `TreatmentBatch.lotId` — same `Lot`, same DAG | EXISTING | none | Reuse; §30's requirement is already met | none | — | — |
| Agronomy | `LabourEntry` + `MaterialConsumptionEntry` + `SpecimenObservation`, all with `locationId` | PARTIAL | no fertilization/pruning/irrigation vocabulary | Generic activities + `VariableCatalog`; **no agronomy domain** | low | Core offline | P2 |

### Media, sync, platform

| Capability | Existing / where | Status | Gap | Recommended action | Migration risk | Offline implications | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Asset / media | `core.Asset` — 15 nullable parent FKs, derivative chain, checksum, R2 presigned upload | EXISTING | no GPS, no annotations/tags/severity, no duration, no upload-state, no local-file lifecycle | Extend `Asset`; **never** a second media system | low (additive) | Separate queue from structured data | P1 |
| Media annotation | — | MISSING | — | New `AssetAnnotation` | low | Offline-created | P2 |
| Offline draft queue | `lib/apiary/offlineQueue.ts` + `clientDraftId` on 2 apiary tables | PARTIAL | covers 2 of ~30 operational tables; no generic mechanism | Generalize into a real sync protocol; see §18 | low (additive column per table) | The whole point | P0 |
| Service worker / PWA | `public/sw.js`, `manifest.webmanifest`, `offline.html` | PARTIAL | app-shell only, routes `/apiaries` and `/lots` | Keep for web; separate from the Android track | none | Web-side only | P2 |
| **API for a native client** | 3 route handlers total (auth, export, Stripe) | **MISSING** | no REST/tRPC/GraphQL; all writes are `FormData` Server Actions | Add a versioned JSON API over the existing `lib/*` services | none (additive) | Absolute prerequisite | **P0** |
| Mobile auth | Auth.js JWT, 7-day, browser cookie | PARTIAL | no device authorization, no refresh, no revocation, no operator switching | See §19 | low | Must survive days offline | P0 |
| Monorepo / shared code | single Next.js app, no workspaces | MISSING | nothing shareable with a native app | Convert to workspaces when the app starts, not before | low | Enables schema/enum sharing | P1 |
| Audit trail | `AuditEvent` append-only, before/after JSON | EXISTING | no device/import source | Add `sourceInterface` values + device | low | Records sync origin | P2 |
| Reporting | `getLotReport` computes live from the DAG | PARTIAL | no farm/harvest/quality/experimental reports; no versioned report store | Derive from normalized data; see §22 | none | Server-only | P2 |
| i18n | next-intl, ES + EN, 20 namespaces | EXISTING | none | Reuse; ES is already the operator language | none | Bundle strings locally | — |

---

## 4. Canonical Domain Mapping

| Product concept | Existing representation | Decision |
| --- | --- | --- |
| Farm | `Location(site)` + `Organization(farm)` | **Reuse.** Do not create `Farm`. |
| Block / plot | `Location(plot)`, `parentLocationId` | **Reuse.** Already carries terroir attributes. |
| Microlot (terrain) | `Location` child + `subdivisionReason` | **Reuse.** Already built (F1 §2). |
| Planting cohort | — | **New model.** The one genuine land-side gap. |
| Cultivar | free text | **Configuration** via `VariableCatalog`. |
| Task | `partner.Task` | **Extend.** Do not fork. |
| Field session | — | **New model.** |
| Field event | many specialized tables | **New spine**, referencing existing rows. |
| Harvest | `HarvestEvent` | **Extend** (multi-block sources, GPS, workers). |
| External intake | `ReceivingEvent` | **Reuse.** |
| Lot / batch / microlot | `Lot` | **Reuse — single canonical material identity.** |
| Lineage | `LotTransformation` + Input/Output | **Reuse.** Do not add `LotLineage`. |
| Selection event | `ProcessingStageObservation` (categorical only) | **Reuse `LotTransformation`** + a new type value. |
| Rejected material | — | **A `Lot`.** Same machinery, new lot type. |
| Material state | derived from history | **Configuration**, not an enum. |
| Operating standard | — | **New model.** `ReferenceStandard` is a different concept. |
| Protocol / SOP | `Protocol` + `ProtocolVersion` | **Reuse.** Add timing only. |
| Fermentation / drying / storage | `FermentationRun` / `DryingRun` / `StorageAssignment` | **Reuse.** |
| Measurement | `Measurement` + unit registry | **Reuse.** Add variables, not tables. |
| Sample | `core.Sample` | **Keep canonical.** |
| QC / cupping | `sensory` schema | **Reuse.** |
| Experiment / treatment / replicate | `Experiment` / `TreatmentBatch` | **Reuse.** |
| Media | `core.Asset` | **Extend.** Never a second media system. |
| People / orgs / permissions | `Person` / `Organization` / `Assignment` | **Keep canonical.** |
| Agronomy activity | `LabourEntry` + `MaterialConsumptionEntry` | **Extend** with a typed activity vocabulary. |

---

## 5. Farm / Block / Planting Assessment

**Farm and block are solved.** `Location` is a typed self-referential
hierarchy that already includes `plot`, already carries the terroir
attributes F1 added (sun exposure, shade bracket, altitude min/max, slope,
soil, plant spacing), already supports subdivision into microlots with a
recorded reason, and is already an RBAC scope target — which matters more
than it sounds, because a location-scoped Farm Operator Assignment only
works because `Lot.locationId` exists. Creating a `Farm` or `Block` model
would fracture that and orphan every location-scoped assignment.

**Planting cohort is the one real gap.** The requirement — a block
containing multiple cultivars, planting years, ages and densities — has
three partial answers today and no complete one:

- `PlantingEvent` records *that* material arrived or went into the ground
  (type, varietal free text, quantity, source org). It is an event, not a
  standing population.
- `Specimen` tracks *individual* plants and traps, with sector and grid
  position. Too granular for 4,000 trees.
- `Location.plantSpacingMeters` is a single value on the whole plot.

None of them answers "what is planted in this block, how old is it, how
dense". Recommendation: a small `PlantingCohort` — block (`locationId`),
cultivar (catalog value), planting year/date, plant count, density,
status — with `PlantingEvent` gaining an optional FK to it, and `Specimen`
optionally belonging to one. Additive, no backfill, no destructive change.

**Do not build a Species/Cultivar taxonomy.** `VariableCatalog` already
does controlled vocabularies with aliases, definitions and display order,
and is already used for process variables. A cultivar catalog is a row in
it, not a new subsystem.

---

## 6. Task / Field Session / Event Assessment

**Extend `partner.Task`; do not build a parallel task system.** It has
project scope, status, assignee, due date and classification, and the
partner workspace already uses it. What it lacks: a farm/block/cohort
target, task templates, dependencies, sequence, recurrence, planned vs
actual time, required observations/measurements/evidence, and a crew
concept. One further issue: `assignedToUserAccountId` points at a
`UserAccount`, and field operators frequently have no login. Assignment
should be able to name a `Person`.

**Introduce `FieldSession`.** Nothing today groups "Kenneth went to Las
Nubes block 3 on Tuesday morning and did these eleven things". The
existing event tables are each anchored to their own domain parent
(a run, a colony, a stage), never to a visit. A session — farm, block,
operator, task, start/end, GPS track or point — is the natural offline
transaction boundary and the natural unit of selective sync.

**Introduce `FieldEvent` as a spine, not a replacement.** The temptation
is to build one generic event table and migrate the specialized ones into
it. Do not. `FermentationIntervention`, `DryingTurnEvent`,
`SpecimenObservation`, `QuantityEvent` and `ProcessingStageObservation`
each carry domain-specific typed columns that a generic table would
degrade into JSON — precisely what CLAUDE.md §49 forbids. Instead
`FieldEvent` should be a thin chronological record (session, occurredAt,
recordedAt, GPS, operator, event kind, optional nullable FK to the
domain row it corresponds to), giving one queryable timeline over
heterogeneous events without owning their semantics. This mirrors the
`Asset` pattern — many nullable parent FKs, ADR-020 decision 8 — which
this codebase has applied consistently fifteen times and which the team
clearly knows how to operate.

---

## 7. Asset / Media Assessment

`core.Asset` is strong: metadata-only (binaries in R2), unique storage
key, SHA-256 checksum, MIME, size, creator, `capturedAt`, derivative
chain for thumbnails, provenance class required, classification, and 15
nullable parent FKs covering lots, harvests, measurements, runs, samples,
hives, colonies, inspections, colony events, specimens, treatment batches
and processing stages. Upload is a presigned-PUT flow: request URL →
client PUTs to R2 → finalize creates the row, with a key-prefix check on
finalize.

What field media needs and this does not have:

- **GPS.** `Asset.locationId` is an FK to a `Location` *entity*. A photo
  taken at a point on a hillside has no `Location` row and should not
  create one. Needs `latitude`/`longitude`/`accuracyM` columns.
- **Annotation.** No comments, tags, structured classification or
  severity. Needs a small `AssetAnnotation` child table.
- **Upload lifecycle.** `AssetStatus` is `draft|approved|archived` —
  editorial state, not transfer state. There is no
  pending/uploading/uploaded/verified, no retry count, no resumable
  upload, no local-file pointer, no post-verification garbage collection.
- **Audio/video specifics.** No duration, no codec, no compression
  lineage beyond the generic derivative link.
- **Ordering.** The presigned flow requires connectivity *before* the row
  exists. Offline capture must invert this: create the `Asset` row from
  local metadata at sync time, then upload the binary on Wi-Fi.

**Structured data must sync independently of media** — a fermentation
reading must not be blocked behind a 40 MB video. Two queues, one
`clientDraftId` linking them.

---

## 8. Harvest Assessment

`HarvestEvent` exists and creates its `Lot` atomically, carrying plot
(`locationId`, required), farm (`organizationId`), project, harvest time,
cherry weight, Brix, temperature, condition, ripeness notes, operator and
provenance. `LabourEntry` attaches crew-hours. `ADR`-level discipline is
already applied.

Gaps against §11:

- **One plot only.** `locationId` is a single required FK. A harvest
  drawing from several blocks cannot be expressed. Needs a
  `HarvestEventSource` join carrying block, cohort and contributed weight.
- **No planting cohort or cultivar link** — `cultivarNotes` is free text,
  and the schema comment explicitly flags a `LotCultivarComposition` join
  as the future answer.
- **No GPS, no photos-at-capture path, no collection method.**
- **Workers are an aggregate headcount** by deliberate design (T12.6:
  "four people, three hours", not a timesheet). If per-picker payment is
  ever wanted, that is a new decision, not a bug.

---

## 9. Material Lot + Mass Balance Assessment — **critical**

### The lineage half is right

`Lot` is the single material identity. `LotTransformation` +
`LotTransformationInput` + `LotTransformationOutput` is a normalized
many-to-many graph with `quantity`/`unit` on each contribution edge. Every
output is a *new* `Lot` row — nodes are never mutated. `getLotLineage`
walks ancestors and descendants with two recursive CTEs over the join
tables, indifferent to graph shape.

### The quantity half is broken

`QuantityEvent` is an append-only ledger; a lot's quantity is
`SUM(QuantityEvent)` via `computeCurrentQuantity`, with additive types
(`received`, `process_output`, `transfer_in`, `adjustment_increase`) and
subtractive types (`loss`, `sample_removed`, `transfer_out`,
`adjustment_decrease`). The design is correct.

**The implementation only ever writes the additive half.** In
`lib/traceability/lots.ts:221`, `recordTransformation` creates a
`process_output` event for each output lot. It creates **no
corresponding decrement for any input lot.** A repository-wide search for
write paths confirms it: `transfer_out`, `loss` and
`adjustment_decrease` are never produced by any code path. `harvest.ts`,
`fermentation.ts`, `drying.ts`, `roasting.ts` and `apiary/harvest.ts` all
write `received` or `process_output` only. The single exception is
`samples.ts:99`, which correctly writes `sample_removed`.

The consequence, concretely:

```
Harvest 186.4 kg cherry           → Lot A ledger: +186.4  →  186.4 kg
Split A into B (171.8) and C (14.6)
  → Lot B ledger: +171.8          →  171.8 kg
  → Lot C ledger: +14.6           →   14.6 kg
  → Lot A ledger: unchanged       →  186.4 kg   ← still full
Total material now visible in the system: 372.8 kg from 186.4 kg of cherry.
```

Every split, merge, blend and stage change inflates the total. Because
`getLotReport` aggregates across lineage ancestry, reported figures
compound the error rather than cancelling it.

Three further absences make this worse rather than incidental:

1. **`LotTransformationInput.quantity` and `.unit` are both nullable**, so
   a transformation may legally record no input quantity at all.
2. **There is no balance check anywhere** — no comparison of input sum to
   output sum, no tolerance, no declared-loss field, no
   unexplained-difference concept.
3. **No test covers it.** `tests/traceability/quantity.test.ts` exercises
   `recordQuantityEvent` and `computeCurrentQuantity` in isolation with
   hand-written events; `lots.test.ts` covers lineage shape. Nothing
   asserts conservation across a transformation.

### How quantities should be represented

Keep the ledger. Make transformations write both sides, inside the
existing transaction:

- For each input: a `transfer_out` (full consumption) or `loss` event for
  the quantity actually consumed.
- For each output: the existing `process_output`.
- Add `declaredLossQuantity` + `lossReason` to `LotTransformation` for
  process loss that becomes no output lot.
- Compute `unexplained = Σinputs − Σoutputs − declaredLoss` and store it
  as a **first-class recorded value, not an error**. Operators estimate
  weights; a hard rejection at 0.3 kg drives people back to paper. A
  configurable per-organization tolerance decides whether an
  out-of-balance transformation is `verified`, flagged, or requires an
  override with actor and reason — which is exactly what the existing
  `Deviation`/`Approval` machinery is for.

Rejected material (floaters, green, debris) becomes a **real output
`Lot`** with its own type. It then keeps identity, weight and a
destination, and can be sold, composted or reprocessed without leaving
the traceability chain — §18's requirement satisfied with no new
machinery.

### Measured blast radius

Quantified against the restored copy of the 2026-08-26 verified backup
(newest `Lot.created_at` is 2026-08-21, so production is expected to
match):

| Metric | Value |
| --- | --- |
| Lots total | 43 |
| Transformations | 10 |
| Quantity events | 16 |
| Lots consumed as an input and never decremented | 5 |
| — of those, lots with a ledger (**genuinely overstated**) | **3** — PE-79, PE-80, PE-90, all Cafelino `cherry` |
| — of those, lots with no `QuantityEvent` at all | 2 — PE-97, PE-98 |
| **Material overstated** | **145.3 kg** (45.4 + 45.4 + 54.5) |

PE-97 and PE-98 were never weighed, so per ADR-080 they already report
honestly as `recorded: false` and need no remediation. **Remediation scope
is three lots, not five.**

Two further facts that shape the fix, both measured:

- **9 of 10 existing transformation inputs carry a NULL quantity**, so
  "decrement by the input quantity" is not implementable for most real
  rows. Full-consumption transformations must decrement by the input lot's
  *computed balance* instead.
- **Run-opening transformations must not decrement at all.**
  `startFermentationRun`/`startDryingRun` create a `stage_change` with one
  input and **zero outputs**; only the closing transformation converts
  material. A fix that decrements on every transformation would zero the
  lot the moment fermentation starts and decrement it again at the end.

Small enough to correct by hand, which is what makes §58 Decision C's
resolution viable — see there.

---

## 10. Lot Split / Merge / Blend Assessment

**Fully supported, today, with no schema change.**

- **Split:** one transformation, one input, N outputs.
- **Merge/blend:** one transformation, N inputs, one output. Per-source
  contribution lives on each `LotTransformationInput.quantity`.
- **Many-to-many:** N inputs and M outputs on the same transformation.
- **Multi-step:** the recursive CTEs traverse arbitrary depth.
- **Multi-farm blend:** inputs may be lots from different organizations;
  `getLotReport` already resolves origin events across all ancestors,
  explicitly plural because "a blend transformation genuinely has multiple
  parents".
- **Percentages:** derivable from input quantities. Store the quantities,
  compute the percentages — storing both invites divergence.

One caveat: `recordTransformation` inherits organization/project/location
from `inputLots[0]` for every output. For a genuine multi-farm blend that
silently attributes the blend to whichever lot happened to be first. Not
wrong for splits; wrong for blends. Worth an explicit rule.

**Do not create `LotLineage`, `MaterialTransformation` or
`MaterialContribution`.** All three are DUPLICATE RISK.

---

## 11. Selection Architecture Assessment

Selection exists today only as *research observation*: `catalogs.ts`
defines `cereza_seleccion` and `cereza_flotado` (values including
`sin_flotadores`) as `VariableCatalog`s, recorded as
`ProcessingStageObservation` rows — categorical picks attached to a
processing stage. That captures *what was observed*. It captures no
weight, produces no material, and leaves rejected coffee with no
existence in the system.

**Recommendation: a selection is a `LotTransformation`, not a new entity.**

It has exactly the shape the transformation graph already handles: one
input lot, multiple typed outputs with quantities, plus method, operator,
time, location and equipment. Concretely:

- Add a `selection` value to `LotTransformationType`.
- Add `selectionMethod` (catalog: flotation, manual, ripeness, density,
  colour, optical, size, defect, screen, custom) and `equipmentNote` to
  `LotTransformation` — nullable, only meaningful for that type.
- Each rejection stream is an **output `Lot`** with a rejection-category
  catalog value: floaters, green cherry, underripe, overripe, dried
  cherry, damaged, insect-damaged, mould, debris, foreign material.
- Mass balance then applies automatically, because it is the same
  transformation path §9 fixes.
- The existing `cereza_seleccion`/`cereza_flotado` observations remain
  valid and complementary — qualitative assessment alongside quantitative
  outturn.

A specialized `SelectionEvent` table would need its own inputs, outputs,
quantities, lineage edges and mass balance — a second transformation
system, differing only in vocabulary.

---

## 12. Standards + Protocol Architecture Assessment

**Protocols: largely built.** `Protocol` → `ProtocolVersion`
(draft/active/superseded, `supersededByVersionId`, never overwritten) →
`ProtocolVariable` (typed text/numeric/boolean/catalog/closed_enum, with
`isControlled` distinguishing deliberately varied factors from merely
recorded ones) and `ProtocolRequiredMeasurement` (either a numeric
variable or a categorical catalog pick, declared per stage).
`completeProcessingStage` refuses to close a stage missing a required
measurement. `VariableCatalog`/`VariableCatalogValue` supports aliases,
definitions, display order and an `impliesUnknownIdentity` flag.

Two protocol gaps:

- **No timing.** `ProtocolRequiredMeasurement.atProcessingStage` is a
  free-text stage name matched by string equality. The spec's
  `T0 / T+6h / T+12h` schedule cannot be expressed. Needs an offset and a
  sequence — additive, and the prerequisite for the operator app
  scheduling local notifications offline.
- **No evidence requirement.** A protocol cannot demand a photo.

**Standards: genuinely missing, and a naming trap.**
`sensory.ReferenceStandard` sounds like the answer and is not — it models
aroma/taste reference compounds with detection thresholds, for panelist
calibration. The Field OS needs *operating acceptance standards* ("Specialty
Cherry Intake v3: max floaters 5%, max green 2%"), versioned, applicable
by organization/farm/crop/cultivar/process/tier/customer/competition.
That is a new `OperatingStandard` + `OperatingStandardVersion` +
threshold rows — but it should **reuse the `ProtocolVersion` versioning
shape** rather than inventing a fifth versioning mechanism, which the
codebase has explicitly warned against ("no inventes un quinto mecanismo
de versionado").

**Deviations/overrides: partially there.** `Deviation` +
`CorrectiveAction` + `Approval` exist with append-only discipline, but
`Deviation` hangs only off `TreatmentBatch`/`ProcessingStage` — not off a
lot, transformation or standard breach — and there is no record of
*override actor, timestamp and reason* as a distinct act. `Approval`'s
generic `entityType`/`entityId` pair is the right precedent to widen.

---

## 13. Processing / Fermentation / Drying Assessment

Strong and directly reusable. The design decision worth preserving: runs
carry **no `lotId`**. Which lot is fermenting is expressed through the
`stage_change` `LotTransformation` that brackets the run
(`LotTransformation.fermentationRunId` / `dryingRunId` / `roastSessionId`).
That keeps material identity in one place.

Requirements from §22–§25 mapped:

- **Washed / natural / honey / anaerobic / carbonic / inoculated / cold:**
  `ProtocolVariable` + `VariableCatalog` values, not enum values or
  columns. RO1.2 already models wash medium as its own dimension with a
  source-lot FK for mosto.
- **pH / Brix / temperature / pressure / O₂ / CO₂ / moisture / Aw / RH:**
  `Measurement` rows. The unit registry in `lib/traceability/units.ts`
  already carries canonical units and min/max per variable, including
  water volumes, ratios, wash-medium pH/Brix/temperature and cold-hold
  temperatures. Adding a variable is a registry entry, not a migration.
- **Inoculum / microorganism / dosage:** `FermentationRun.inoculated` +
  `inoculationNote`, plus `MaterialConsumptionEntry` with material name,
  batch label, quantity and unit. Batch identity is already treated as
  the irrecoverable fact.
- **Vessel / tank / bed / dryer:** free text (`vesselNote`,
  `containerNote`, `DryingRun.method`). No `Vessel` or `Equipment`
  entity exists; one is specified but unbuilt. Acceptable for now,
  a natural later FK swap.
- **Turning, covering:** `DryingTurnEvent`, typed.
- **Sensor sources:** `MeasurementSourceType` already has
  `manual|device|sensor|lab|import|external_context|derived`, with only
  `manual` written today — deliberately future-proofed. `deviceId` is a
  free string; a real `Device` entity is needed for sync, not for
  measurement.

---

## 14. Sample / QC / Sensory Assessment

`core.Sample` is canonical and should stay so. `sampleType` is free text,
so cherry, parchment, green, roast, fermenting material, soil, leaf,
water, microbiological and honey all fit with no schema change. Lineage
is already exact: `sourceLotId` + `sourceTransformationId`, paired with a
`sample_extraction` transformation, and `samples.ts` correctly writes the
`sample_removed` quantity event. `ExternalCoffeeOrigin` handles coffee
arriving with no lot behind it.

The full sensory stack — configurable protocols, versions, attributes,
sessions, flights, blind samples with a permission-gated mapping table,
immutable assessments with supersession, panel results, descriptors,
calibration and evaluator sensitivity profiles — exists and needs
nothing.

Physical QC is the softer spot: moisture, water activity and density are
`Measurement` variables, but defect counts, screen grades and colour
grading have no structure. `VariableCatalog` + `Measurement` covers them
without new tables.

**Do not create coffee-specific samples.**

---

## 15. Experiment Architecture Assessment

Nearly complete. `ResearchProgram` → `ResearchQuestion` → `Hypothesis` →
`Experiment` → `Protocol` → `ProtocolVersion` → `TreatmentBatch` →
`ProcessingStage` → `Measurement`/`ProcessingStageObservation`/
`ProcessSensoryObservation`, then `Evidence` → `EvidenceClaim` →
`Interpretation` → `Conclusion` → `Publication`, with `AnalysisPlan`/
`AnalysisRun`/`AnalysisResult` and `Deviation`/`Approval`. `Experiment`
declares an explicit control `TreatmentBatch` and tracks derivation from
prior experiments, with `declaredLimitations` recording what is *not*
measured.

The spec's hierarchy maps as: Experiment → (ProtocolVersion) →
TreatmentBatch **as treatment and replicate** → Sample → Measurement. The
only arguably missing level is an explicit `Replicate` between treatment
and sample. Before adding one, confirm whether `TreatmentBatch` already
serves — two batches under the same `ProtocolVersion` with identical
variable values *are* replicates. Adding a level that duplicates that
would be DUPLICATE RISK.

**§30 (experiment inside production) is already satisfied.**
`TreatmentBatch.lotId` points at a real `Lot` on the same DAG, so a
harvest lot split into control and treatments is ordinary lineage. No
artificial separation exists to remove.

---

## 16. Agronomy Assessment

**Use generic activities. Do not create an agronomy domain.**

`LabourEntry` (worker count, hours, task note, in-kind provider) and
`MaterialConsumptionEntry` (material name, batch label, quantity, unit)
both already accept a `locationId` parent precisely so that work with no
lot behind it — digging holes, applying biochar to a plot — has somewhere
to live. `SpecimenObservation` handles per-plant health, bloom and trap
checks. `PlantingEvent` handles planting and material receipt.

What is missing is **vocabulary, not structure**: fertilization,
compost, biochar, pruning, irrigation, shade management, weed control,
pest control, disease observation, microbial treatment, soil amendment,
leaf/soil sampling. A `VariableCatalog` of activity types plus a typed
FK from `LabourEntry`/`MaterialConsumptionEntry` covers all of it. Soil
and leaf sampling are already `Sample` rows with a `locationId`.

---

## 17. Offline Mobile Architecture Assessment

### The blocking finding

**There is no API.** `find app/api -name route.ts` returns exactly three
files: `auth/[...nextauth]`, `export`, and `webhooks/stripe`. Every
operational write in the platform is a Next.js Server Action consuming
`FormData` and returning `{ error?: string }` — a React Server Components
transport, not an interface a native client can call. Before any Android
work begins, a JSON API must exist.

### The good news

The service layer is already the correct seam. `lib/traceability/*.ts`,
`lib/apiary/*.ts` and `lib/research/*.ts` export typed functions taking
`(userAccountId, input)` that perform their own RBAC resolution, their
own validation and their own audit writes. The Server Actions are thin
`FormData` adapters over them. **A REST layer is a second adapter over
the same services, not a rewrite** — and because authorization lives in
the services rather than the actions, a mobile client cannot bypass it.

### Recommended architecture

**Repository:** convert to npm workspaces when the mobile app actually
starts — `apps/web`, `apps/mobile`, `packages/domain`,
`packages/api-contract`. Not before; a premature monorepo is churn.

**Framework:** React Native, Android-first. Expo's managed workflow eases
camera, GPS, filesystem, background tasks and OTA updates; verify the bare
minimum SDK against the 2 GB / old-Android constraint before committing.
Do **not** choose Flutter (no TypeScript sharing with the domain package,
which is the main reuse argument) and do **not** choose a Capacitor
wrapper around the existing PWA (it inherits WebView memory behaviour on
exactly the low-end hardware §34 targets).

**Local database:** SQLite via `expo-sqlite` or `op-sqlite`. A relational
mirror of the operational subset — not the full 122 tables. Roughly:
locations, planting cohorts, tasks, field sessions, field events, lots,
transformations, quantity events, measurements, fermentation and drying
runs and their events, samples, asset metadata, plus cached reference
data (catalogs, protocol versions, standards, people, permissions). This
is an operational store, not a cache: it is authoritative for
locally-created rows until they sync.

**Selective download:** by assignment. An operator pulls the farms and
blocks their `Assignment` scopes reach, open lots and active runs at
those sites, tasks assigned to them, and reference data. Not the whole
database. Reference data by version/etag; operational data by cursor.

**Media:** local file storage with a metadata row, a thumbnail generated
on capture, compression before upload, a **separate upload queue** from
the structured-data queue, resumable multipart upload, a Wi-Fi-only
toggle, and garbage collection only after server-side checksum
verification.

**Low-end hardware:** budget a bundle under ~30 MB, cold start under ~3 s,
SQLite under ~500 MB with media held as files rather than blobs, batched
writes, no background polling — sync on connectivity change, on app
foreground, and on explicit tap.

---

## 18. Synchronization Model

The existing apiary queue already establishes most of the right
behaviour. Generalize it rather than replacing it.

**Identity.** Every operational table gets a `clientDraftId` (unique,
nullable), following `apiary.inspection`'s exact precedent. Primary keys
stay `gen_random_uuid()` server-side defaults — but note these are UUID
columns, so a client *may* supply an id today with no migration. The
`clientDraftId` route is preferable: it keeps the server authoritative
over PKs while making replay idempotent, and it is already proven.

**Blocking prerequisite:** `Lot.lotCode` and `Sample.sampleCode` are
globally `@unique`. Two offline devices minting the same code collide on
sync, and two organizations cannot use the same numbering. Change to
`@@unique([organizationId, lotCode])`, or generate codes server-side at
sync and let the device carry a provisional label.

**Push.** Batched mutations, ordered by device sequence, each with
`clientDraftId`, `recordedAt` (device), `deviceId`, and the operator's
`personId`. Server responds per mutation:
`applied | duplicate | rejected(reason) | conflict`. Duplicates are
success. Rejections are terminal and surfaced — the apiary queue already
draws exactly this distinction between "the request never arrived" (stay
queued) and "the server ran and refused" (mark error, show the operator).

**Pull.** Per-table cursor on `updatedAt` plus a monotonic change
sequence. Several operational tables have no `updatedAt` (`Lot`,
`Measurement`, `QuantityEvent`, `LotTransformation` are append-only by
design) — for those, `createdAt` plus id ordering suffices; do not add
`updatedAt` to append-only tables just to satisfy a sync cursor.

**Deletion.** Almost nothing here should hard-delete. Use the existing
`RecordStatus.archived` as the tombstone; append-only tables need no
deletion path at all.

**Conflict policy by category** (§38 — do not default to last-write-wins):

| Category | Examples | Policy |
| --- | --- | --- |
| **Append-mostly** | measurements, observations, photos, field events, quantity events, interventions | No conflict possible. Idempotent insert by `clientDraftId`. Two operators recording the same tank at the same minute is two true readings, not a conflict. |
| **Controlled update** | task status, storage position, lot status, run end time | Server-side state machine with a version/etag. A transition from an unexpected prior state is rejected with the current state returned, not silently overwritten. |
| **Critical** | split, merge, blend, selection, inventory correction, standard override, classification change | **Never resolved automatically.** Server-authoritative: the device submits an intent, the server validates mass balance and RBAC and may refuse. Genuine collisions become a review queue — which is what the unbuilt `offline.sync_conflict` design already anticipated. |

**Media.** Independent queue, independent retry, resumable, linked to
structured rows by `clientDraftId` so a photo can arrive days after the
observation it documents.

**Time integrity.** Every synced row carries `occurredAt` (when it
happened, operator-stated), `recordedAt` (device clock at entry),
`createdAt` (server receipt) and a device reference. Capture device clock
offset at sync so drift is correctable later rather than silently
corrupting a fermentation curve.

---

## 19. Authentication / Offline Authorization

**Current:** Auth.js v5, credentials (argon2) + Google, **JWT session
strategy with a 7-day maxAge**, no database session table, browser cookie
transport. `UserAccount` holds authority; `Assignment` grants roles. The
7-day window was already chosen with offline operators in mind — the
config comment says so — but Auth.js has no offline-specific concept and
applies it uniformly.

**Cookie-based JWT sessions do not fit a native app that must work for
days offline.** Recommended model, none of which weakens authorization:

- **Initial login** online, credentials, against a new token endpoint.
- **Device registration** at first login: a `Device` record (id, operator,
  organization, platform, registered-at, last-seen, revoked-at) issued a
  long-lived **refresh token bound to that device**.
- **Short-lived access tokens** (minutes to hours) minted from the refresh
  token whenever there is connectivity.
- **Offline operation** proceeds on a locally cached, signed
  **authorization snapshot** — the operator's resolved permissions and
  scope set, with its own expiry (a fortnight is a reasonable ceiling).
  The device enforces the snapshot locally to decide what to *offer*;
  **the server re-checks every mutation at sync time**, so a stale
  snapshot can never grant real authority. Locally-permitted writes that
  the server refuses come back as rejections the operator sees.
- **Revocation:** revoking a device invalidates its refresh token at once
  and its queued mutations are refused at sync. Because the local snapshot
  has an expiry, a stolen offline device stops being able to *stage* work
  after the ceiling even if it never reconnects.
- **Operator switching:** a shared mill phone should allow attribution
  switching, but a PIN verified offline is **attribution, not
  authentication** — say so explicitly in the design and keep the device
  token as the actual authorization. Do not let a PIN unlock broader
  permissions than the device's registered operator set.
- Keep the existing `A5.5` staleness purge concept: unsynced drafts
  warned at 7 days, purged at 21, since they sit in plaintext local
  storage.

---

## 20. Permission / Classification Assessment

Mobile operations must run through the same `lib/*` service functions the
web uses, which already call `requireLotAccess` / `can()` and enforce the
`ClassificationLevel` gate. A REST layer that reimplements authorization
would create a second, divergent policy — the failure mode ADR-063 and
ADR-081 were both written to fix.

The role vocabulary is already close to §39: Platform Admin, Content/Ops
Coordinator, Research Lead, Research Contributor, Research Compliance
Reviewer, Partner Field Collector, Sensory Judge, Sensory Head Judge,
**Farm Operator**, Project Viewer, Apiary Colony Event Recorder. Missing
against the spec: agronomist, processor, roaster, buyer — all of which
are new `RoleProfile` seed rows, not schema changes.

Two mobile-specific rules to hold:

1. **Selective sync must be permission-derived**, not convenience-derived.
   A device pulls only what its operator's `Assignment` scopes reach — the
   classification gate applies to what is downloaded, not just what is
   displayed. Data on a device is data that has left the server.
2. **Classification changes are a critical-category conflict** and must
   never be applied from a device without server confirmation.

---

## 21. Auditability Assessment

Already strong: `AuditEvent` is append-only (no application role holds
UPDATE/DELETE), records actor, operation, entity type/id, before/after
JSON, reason and `sourceInterface`. Corrections are append-only
throughout — `Measurement.correctsId` with a mandatory reason,
`Assessment.supersedesAssessmentId`, `ProtocolVersion` supersession,
`LotTransformation` with no update path by construction.
`ProvenanceClass` and `DataQuality` are required, no default, on every
fact-bearing table.

Required additions for field operation:

- **`recordedAt`** (device clock at entry) alongside `occurredAt` and
  `createdAt`, plus **`syncedAt`** and a **device reference** on
  operationally-captured rows. Today only `Measurement.deviceId` exists,
  as an untyped string.
- **Import/sync source** on `AuditEvent` — a new `sourceInterface` value
  and a device id, so "who wrote this and through what" stays answerable.
- **Append-only corrections are already the rule** and should be extended
  to any new operational table rather than allowing in-place edits.
- **Override records** (§21 of the spec) need actor, timestamp, reason
  and the standard version overridden — currently absent as a distinct
  act.

---

## 22. Reporting Architecture Assessment

Today: one report, `getLotReport`, computed live from normalized data —
origin events across ancestry, human-readable lineage, lineage-wide
processing and measurements. There is no report storage, no scheduling,
no farm/harvest/quality/experimental reports, and a versioned
`reporting.report`/`report_version` system is sketched but deliberately
deferred.

Recommendation: **keep deriving from normalized data.** The DAG plus the
quantity ledger plus measurements can answer every §41 report without new
storage — *once mass balance is correct*, which is the actual blocker for
yield and conversion reporting rather than any missing report table.

Sequence: fix §9 → add derived views for mass balance and conversion
ratio → farm reports (planted area by cohort, cultivar distribution, plant
age, labour) → harvest reports (volume, yield per block, selection
outturn) → quality → experimental. Introduce report *versioning* only when
someone needs to reproduce a report as it read on a past date; that is a
real requirement for certification and export, and worth revisiting then
rather than pre-building.

---

## 23. Performance / Scalability Risks

Actual risks, not speculative ones:

1. **Lineage CTEs have no depth limit.** `getLotLineage` recurses over
   `lot_transformation_input/output` with no cycle guard. Nothing today
   creates a cycle (outputs are always new lots), but a future correction
   path could. Add a depth cap and a visited set.
2. **`getLotReport` walks the full ancestry and refetches processing and
   measurements across it.** Fine at 51 lots; quadratic-ish as blends
   deepen over seasons.
3. **`Measurement` will become the largest table by far** and its indexes
   are all single-column parent FKs. High-frequency fermentation series
   will want `(fermentationRunId, occurredAt)` and
   `(lotId, variable, occurredAt)` composites. Add on evidence, not
   speculatively.
4. **`computeCurrentQuantity` loads every event for a lot into memory**
   and sums in TypeScript. Correct and readable; becomes a `SUM` in SQL
   when lots accumulate thousands of events.
5. **`AuditEvent` grows unboundedly** with before/after JSON on every
   evidentiary write, and sync will multiply the write rate. Needs a
   retention or partitioning plan before mobile traffic arrives.
6. **Sync fan-out.** A device syncing 5 days of work submits hundreds of
   mutations; validating each independently with its own RBAC resolution
   will be slow. Batch the scope resolution once per sync request.
7. **No `updatedAt` on several operational tables** constrains
   cursor-based pull, as noted in §18.

---

## 24. Schema Gaps — genuine missing canonical concepts

Only concepts nothing existing can carry. For each: purpose, key
relations, why reuse fails, and whether it is needed now.

**`PlantingCohort`** — the standing population in a block. Relations:
`Location(plot)`, cultivar catalog value, optional `PlantingEvent`s and
`Specimen`s. Why not reuse: `PlantingEvent` is an event, `Specimen` is an
individual, `Location` holds one spacing value. **Needed: Phase 1.**

**`FieldSession`** — the envelope for one visit. Relations: `Location`,
`Person`, `Task`, `Organization`, start/end, GPS. Why not reuse: no
existing table groups heterogeneous events by visit. **Needed: Phase 2.**

**`FieldEvent`** — the chronological spine. Relations: `FieldSession`,
`Person`, GPS, event kind, nullable FKs to the domain rows it indexes.
Why not reuse: specialized event tables are domain-anchored and cannot be
queried as one timeline. **Needed: Phase 2.**

**`Device`** — a registered operator device. Relations: `Person`,
`Organization`, refresh-token state, revocation. Why not reuse:
`Measurement.deviceId` is an untyped string with no lifecycle. **Needed:
Phase 4 (before any sync).**

**`OperatingStandard` + `OperatingStandardVersion` + thresholds** —
versioned acceptance criteria. Relations: `Organization`/`Location`/
cultivar/process/tier scope, threshold rows referencing measurement
variables or catalog values. Why not reuse: `ReferenceStandard` is
sensory compound thresholds; `ProtocolVersion` declares what to measure,
not what passes. **Needed: Phase 3.**

**`AssetAnnotation`** — comments, tags, severity on media. Relations:
`Asset`, `Person`, optional catalog value. Why not reuse: `Asset` has no
annotation surface. **Needed: Phase 3.**

**`HarvestEventSource`** — multi-block/multi-cohort harvest contribution.
Relations: `HarvestEvent`, `Location`, `PlantingCohort`, weight. Why not
reuse: `HarvestEvent.locationId` is singular and required. **Needed:
Phase 3.**

**`TaskTemplate`** — reusable task definitions with required
observations/measurements/evidence. **Needed: Phase 2.**

Everything else the specification asks for is an **extension of an
existing model, a `VariableCatalog` entry, or a new `RoleProfile` seed
row** — not a new table.

---

## 25. Migration Strategy — lowest risk sequence

Every step additive unless marked. Existing production data must stay
valid.

1. **Additive columns, nullable, no backfill.** `recordedAt`, `syncedAt`,
   device reference, GPS on `Asset` and new event tables; `clientDraftId`
   on operational tables (unique, nullable — exactly the `a5` migration's
   shape). Zero risk.
2. **New tables with no FKs into existing required columns.**
   `PlantingCohort`, `FieldSession`, `FieldEvent`, `Device`,
   `OperatingStandard*`, `AssetAnnotation`, `TaskTemplate`,
   `HarvestEventSource`. Zero risk.
3. **New enum values.** `LotTransformationType += selection`, new
   `LotType` for rejected material, new `MeasurementSourceType` usage.
   Postgres enum additions are additive; Prisma handles them. Low risk.
4. **Mass balance write-path fix.** No schema change to fix the code.
   Adding `declaredLossQuantity`/`lossReason`/`unexplainedQuantity` to
   `LotTransformation` is additive. **The historical-data decision is the
   risk, not the migration** — see §58 Decision C.
5. **`lotCode` uniqueness change.** Drop the global unique, add
   `@@unique([organizationId, lotCode])`. **Requires care:** `Lot.organizationId`
   is nullable, so a partial index or a backfill of organization is needed
   first. Verify no duplicate codes exist before switching. Medium risk,
   real production data.
6. **`Task.assignedTo` accepting a `Person`.** Add a nullable
   `assignedToPersonId` alongside the existing account FK rather than
   changing the existing column. Low risk.
7. **Never:** change primary key types, make an existing nullable column
   required without a backfill, or remove an enum value.

---

## 26. Recommended Implementation Phases

Ordered by repository dependency, not by the prompt's order. The largest
divergence: **mass balance comes before everything**, because yield
reporting, selection, standards and the operator app all produce or
consume quantities, and every day the current behaviour runs it writes
more data that a future fix has to reason about.

**Phase 0 — Correctness (blocking).**
Fix the transformation write path so inputs are decremented. Add declared
loss and unexplained-difference recording with per-organization tolerance.
Add mass-balance tests. Scope `lotCode` uniqueness per organization.
Per §58 Decision C: mark the 3 overstated lots `dataQuality = conflicting`,
exclude them from yield reporting, and correct them individually with real
figures — never synthesized ones. Ticket:
`docs/implementation/41_P0_MASS_BALANCE.md`. *Nothing else should start
first.*

**Phase 1 — Land foundation.**
`PlantingCohort`. Cultivar `VariableCatalog`. Extend `HarvestEvent` with
multi-source contribution. Web-only, online-only. Proves the model
against real Las Nubes data before any mobile complexity.

**Phase 2 — Operator core.**
Extend `Task` (block/cohort target, `Person` assignee, planned vs actual,
required evidence). `TaskTemplate`. `FieldSession`. `FieldEvent` with GPS.
Time-integrity columns everywhere. Still web-first — build the operator
surface on desktop/PWA where it is cheap to iterate.

**Phase 3 — Quality and selection.**
`selection` transformation type with rejection-category output lots
(depends on Phase 0). `OperatingStandard` + versions. Widen `Deviation`
and add override records. `AssetAnnotation`. Physical QC vocabulary.

**Phase 4 — API and sync foundation.**
Versioned JSON API over the existing `lib/*` services. `Device` +
token/refresh/revocation. `clientDraftId` generalized. Batch push
endpoint with per-mutation results and the three conflict categories.
Cursor-based pull with permission-derived selective download. Separate
media queue with resumable upload. **Exercise all of it from the existing
PWA first** — a real client against a real sync protocol, with none of the
native uncertainty.

**Phase 5 — Android operator app.**
Workspace conversion, React Native/Expo, SQLite mirror, camera/GPS/QR,
local notifications for protocol schedules, Wi-Fi-only media, low-end
device validation on real hardware.

**Phase 6 — Reporting and research depth.**
Farm, harvest, processing, quality, experimental and full-traceability
reports derived from normalized data.

**Phase 7 — Geospatial.**
Polygons, map library, offline vector tiles. Deliberately last: highest
cost, and every other capability works without it.

---

## 57. First Coherent Implementation Slice

**Recommended slice: close the mass-balance hole end to end, on the
selection operation.**

This is deliberately *not* the prompt's suggested farm→block→task→
observation→photo slice. That slice exercises CRUD and offline identity
but touches nothing structurally at risk — farm and block already exist
and work. The selection slice validates the domain architecture at its
weakest real point *and* produces the first operation whose offline
semantics are genuinely hard (it is a critical-category mutation with a
server-side invariant). If the architecture can carry this, the rest
follows; if it cannot, better to find out now.

- **Schema changes.** `LotTransformationType += selection`. On
  `LotTransformation`: `selectionMethodCatalogValueId` (nullable),
  `equipmentNote`, `declaredLossQuantity`, `lossUnit`, `lossReason`,
  `unexplainedQuantity`. New `LotType` value for rejected material. A
  `seleccion_metodo` and a `rechazo_categoria` `VariableCatalog` with
  seeded values. One additive migration; no backfill.
- **Existing models reused.** `Lot`, `LotTransformation`,
  `LotTransformationInput`/`Output`, `QuantityEvent`, `VariableCatalog`,
  `Location`, `Person`, `Assignment`, `Asset`, `AuditEvent`. No new
  entity.
- **Service changes.** `recordTransformation` writes input-side
  `transfer_out`/`loss` events inside the existing transaction; computes
  and stores unexplained difference; consults a per-organization
  tolerance; raises a `Deviation` when out of tolerance. A new
  `recordSelection` wrapper in `lib/traceability/lots.ts` expressing the
  operation in domain terms.
- **API requirements.** None yet — Server Action only. The API layer is
  Phase 4; proving the domain first keeps the two risks separate.
- **Permission rules.** `lot:manage` on the input lot's scope, unchanged.
  An out-of-tolerance override requires a new `lot:override_balance`
  permission held by Platform Admin and a new processor/manager profile,
  **not** by Farm Operator — the operator records what they see; someone
  else accepts a discrepancy.
- **Validation.** Every input quantity required for a selection (nullable
  in general, required here). Non-negative magnitudes. Single unit per
  transformation. Rejection category required on each rejected output.
- **UI/web changes.** One selection form on the batch detail page: input
  lot and weight, method, accepted output weight, N rejection rows with
  category and weight, declared loss, and a live running balance showing
  the unexplained difference as the operator types.
- **Mobile implications.** Establishes the critical-conflict pattern:
  the device submits an intent, the server owns the invariant. Confirms
  that a mass-balance rule can never be enforced client-side.
- **Tests.** Conservation across split/merge/selection; parent lot
  decremented to zero on full consumption; unexplained difference
  computed and stored; within-tolerance passes silently;
  out-of-tolerance raises a `Deviation`; override requires the new
  permission and records actor and reason; rejected outputs are real lots
  with correct lineage; idempotent replay by `clientDraftId` produces no
  duplicate events.
- **Seed/demo data.** A DEMO selection on the existing Las Nubes chain:
  186.4 kg cherry → 171.8 accepted + 8.7 floaters + 3.4 debris + 2.5
  declared loss + 0.0 unexplained.
- **Acceptance criteria.** After a selection, the sum of all leaf-lot
  quantities plus declared loss plus unexplained equals the input
  quantity, for every lot in the DEMO chain; the parent lot reports its
  consumed quantity, not its original one; and a report over the chain
  reconciles.

---

## 58. Architectural Decisions — Resolved

Only decisions repository inspection cannot settle. **All five were taken
by the product owner on 2026-08-27**, each matching this audit's
recommendation. The options and reasoning below are retained as the record
of what was weighed.

| # | Decision | Resolution |
| --- | --- | --- |
| **A** | Native vs PWA | **Native (React Native/Expo), sequenced behind the sync protocol.** Phase 4 builds the API and sync and exercises them from the existing PWA; Phase 5 adds the native client, and stays optional if field trials show the PWA holds. **Recorded as ADR-093**, which supersedes `OFFLINE_FIELD_CAPABILITY.md` §1; that document now carries the supersession notice, and its §2–§7 remain in force. |
| **B** | Rejected material | **Every rejection stream is a real output `Lot`**, carrying a rejection-category catalog value, with auto-generated lot codes so operators incur no extra taps. Follows the `LotType.honey` precedent. |
| **C** | Existing out-of-balance data | **Flag, exclude, correct by hand.** Mark the **3** genuinely overstated lots (PE-79, PE-80, PE-90 — see §9) `dataQuality = conflicting`, exclude them from yield reporting, fix the write path forward, and enter genuine corrections where the true weights are recoverable. **No quantity is ever synthesized.** |
| **D** | Operator identity | **Device token carries authority; `Person` carries attribution.** A PIN or picker selects who to attribute a record to and is labelled as attribution, never authentication. A PIN can never widen permissions beyond the device's registered operator set. Forced by data reality: most `Person` rows have no email. |
| **E** | Device mirror scope | **Operational + protocol execution (~25 tables).** Refines Option A below: the mirror follows the *field vs desk* line, not schema boundaries — `TreatmentBatch`, `ProcessingStage`, `ProcessingStageObservation` and `ProcessSensoryObservation` live in the `research` schema but are field-native, so PE protocols execute offline. Sensory, competitions and commerce stay off the device. |

**On E's sensory exclusion:** size is the lesser reason.
`SensoryBlindMapping` is deliberately gated behind a permission Sensory
Judges do not hold, so a judge's *resolved permissions* genuinely cannot
query blind identities (ADR-081). Replicating blind-coded samples to a
device would make that guarantee depend on client-side enforcement —
precisely the failure mode that ADR exists to prevent.

### Decision A — Native Android app vs extending the PWA

`OFFLINE_FIELD_CAPABILITY.md` §1 states the platform's accepted position:
"Progressive Web App... **not a separate native app**", justified by
single-deployable, low-ops discipline. `25_OFFLINE_OPTIONS_ANALYSIS.md`
compared three options, **none of them native**. The new specification
reverses this.

- **Option A — Android + React Native + SQLite** (as specified). True
  offline operational store, reliable background sync, real camera/GPS/
  BLE/QR, local notifications, survives days offline. Costs: a second
  codebase, app-store or sideload distribution, a monorepo conversion,
  and a documented architectural decision reversed.
- **Option B — extend the existing PWA.** A service worker, an IndexedDB
  queue and an idempotent server path already exist and work. Far
  cheaper, one deployable, consistent with the accepted decision.
  Genuinely weaker on: iOS (irrelevant here), background sync
  reliability, multi-day storage durability under memory pressure,
  BLE, and reliable local notification scheduling on old Android.

**Recommendation: Option A, but sequenced behind a working sync
protocol** — Phase 4 builds the API and sync against the existing PWA,
Phase 5 adds the native client. That gets the architecture proven by a
real client before the native uncertainty is introduced, and if the PWA
turns out to be sufficient in the field, Phase 5 becomes optional rather
than sunk. Either way, **supersede `OFFLINE_FIELD_CAPABILITY.md`
explicitly with a new ADR** rather than letting the repository hold two
contradictory positions.

### Decision B — Rejected material: lot or attribute?

- **Option A — every rejection stream is a real `Lot`.** Full identity,
  weight, lineage, storage, sale or composting. Mass balance falls out
  automatically. Cost: many small lots, more rows, more lot codes.
- **Option B — rejection quantities as attributes of the selection
  transformation.** Fewer rows, simpler UI. Cost: rejected material
  cannot be stored, moved, sold or reprocessed, and §18's "not every
  rejection is waste" is unsatisfiable.

**Recommendation: Option A**, with an operator-facing default that
auto-generates rejection lot codes so the extra identity costs no extra
taps.

### Decision C — What to do about existing out-of-balance data

Production holds lots recorded under the double-counting behaviour. Once
the write path is fixed, historical rows stay wrong unless something is
done.

- **Option A — leave history untouched, fix forward.** Honest, zero risk,
  no fabricated data. Historical yield figures stay unreliable and must
  be labelled so.
- **Option B — backfill compensating `adjustment_decrease` events** with
  `provenanceClass = interpretation` and a reason. Makes totals reconcile,
  and does so *visibly* rather than by rewriting history — consistent
  with this codebase's append-only correction discipline. But it infers
  quantities nobody measured, which CLAUDE.md §3 forbids for facts.
- **Option C — mark affected lots `dataQuality = conflicting`** and
  exclude them from yield reporting until reviewed.

**Recommendation: C, then A.** Flag the affected rows so nothing silently
reports a wrong number, fix forward, and let a human correct individual
lots where the true figures are actually known. Do not synthesize
quantities.

### Decision D — Operator identity on shared devices

Does a mill/field operator get a real `UserAccount`, or is attribution by
`Person` against a device-level login?

- **Option A — real accounts for everyone.** Uniform authorization, clean
  audit. Requires an email or username per worker; most `Person` rows in
  this database have no email at all.
- **Option B — device authorization + `Person` attribution** (PIN or
  picker). Matches field reality. But attribution is then not
  authentication, and the audit trail records who *claimed* to act.

**Recommendation: Option B, stated honestly in the model** — a
`recordedByPersonId` that means attribution, and a separate device/account
identity that carries authority. Do not let the two blur, and do not let
a PIN widen permissions.

### Decision E — How much of the 122-table schema the device mirrors

- **Option A — operational subset only** (~20 tables). Small, fast, fits
  low-end hardware.
- **Option B — broader mirror** including sensory and research. Enables
  offline cupping and protocol authoring; materially larger and slower.

**Recommendation: Option A.** Sensory evaluation happens at a table with
power and connectivity, not at a fermentation tank.

---

## 59. Not Implemented — *as of 2026-08-27, the day this audit was written*

No models were added, no migrations generated, no mobile app scaffolded,
no speculative code written. The only repository change is this document.
All five validation commands pass, unchanged from before the audit.

**This section has not been true since 2026-08-27, and the paragraph above
is kept only as the record of the audit's own footprint.** See §60 for what
has actually been built since. A reader who takes §59 at face value will
re-plan work that already shipped; one session nearly did on 2026-09-04.

---

## 60. Phase status — measured 2026-09-04, not reported

Verified against `prisma/migrations/`, `prisma/schema.prisma` and
`DECISIONS.md`, because this document froze on the day it was written and
every status claim in it aged badly.

| Phase | State |
| --- | --- |
| **0 — Correctness (mass balance)** | **Shipped.** `20260827193000_p0_mass_balance`, ADR-094. |
| **1 — Land foundation** | **Shipped.** `20260827214500_p1_land_foundation`, ADR-095. `PlantingCohort` and `HarvestEventSource` exist. |
| **2 — Operator core** | **Closed, deliberately incomplete.** `FieldSession`, `FieldEvent`, process targets and the time-integrity columns shipped (`20260828131007`, `20260828131500`, ADR-098/099/101); `20260904150000` added GPS on `Asset` (§6) and `clock_offset_ms` (§5). **§1 (extend `Task`) and §2 (`TaskTemplate`) were deliberately not built — see ADR-107.** |
| **3 — Quality and selection** | **Partial.** The selection slice of §57 shipped (`20260828143000_p3_selection`, ADR-103). Still missing: `OperatingStandard` and versioned thresholds, `Deviation` override records, `AssetAnnotation`, physical QC vocabulary (green-stage defects, screen size). |
| **4 — API and sync** | **Not started.** No `Device` model; `app/api` holds only auth, export and the Stripe webhook; `clientDraftId` exists only inside the apiary module and was never generalised. |
| **5 — Android operator app** | **Not started.** No native client anywhere in either repository. |
| **6 — Reporting** | **Not started.** `getLotReport` is still the only report. |
| **7 — Geospatial** | **Not started**, as planned. `schema.prisma` still records in a comment that no boundary polygon exists. |

**The §26 sequence still holds; only §57's slice was reordered ahead of the
rest of Phase 3.** The one place where reality diverges from this document's
plan is Phase 2, and ADR-107 gives the reason: the model §1 would extend has
never carried a row, and neither has the half of Phase 2 that shipped.
