# Prompt Series — index and status

Numbered instruction files for Claude Code sessions. Each is a self-contained
task: read it, do what it says, stop where it says to stop.

**These are not architecture documents.** Architecture lives in
`docs/architecture/` and describes the system as it is designed. These files
instruct a session and go stale the moment they run. Do not cite a prompt file
as authority for how the platform works — cite `DECISIONS.md` or the relevant
architecture document.

**Executing these:** name the specific file. Do not point a session at this
folder and let it choose — several are v2, gated, or superseded, and it will
run them.

**Every session that runs a prompt file must update that file's own entry in
this README before finishing** — status, evidence, and anything left
incomplete. This index has gone stale before (see the 2026-08-12 audit that
produced this revision); the fix is procedural, not a one-time correction.

**Status vocabulary:** RUN (executed, complete) · PARTIAL (some of it landed,
see note) · SUPERSEDED (a later decision overrode it) · PENDING (not yet run)
· BLOCKED (cannot run, see note) · V2 (deliberately after v1).

---

## Where things stand

*(Last verified against repository evidence — commits, files, schema, code —
2026-08-12, in a read-only audit of every file in this series against its
actual output. See that audit's findings folded in below and throughout this
document; nothing here is from session memory alone.)*

Platform v1 is defined by a falsifiable test (ADR-039): *can the platform
carry one real 2026 harvest from cherry through to a cupping score and a lot
report that could be sent to a client?*

**Coffee's Phase 1 ticket sequence is complete.** T1–T10, T9.5, T12, T12.5,
T12.6, T13, and now **T14** are all built (`PHASE_1_TECHNICAL_EXECUTION_PLAN.md`
§34 — every row carries a DONE marker except T11, deferred to v1.1, not
cancelled). T14 shipped the full harvest-to-sensory E2E test
(`tests/traceability/e2e.test.ts`) and a DEMO seed chain
(`seedDemoTraceabilityChain` in `prisma/seed.ts`) that reaches an actual
scored cupping result — the literal shape of ADR-039's falsifiable test —
by calling the real T1–T13 service functions rather than hand-seeding rows.
It also fixed a real incident: a mid-verification test run left partial
fixture state that triggered an unfiltered `deleteMany` across ten tables
(Prisma silently drops `undefined` keys from a `where` clause). Recovered
via Neon PITR + reseed; fixed for good with a guard
(`tests/helpers/assertDefinedWhere.ts`) applied to all 155 `deleteMany`
call sites across every test file, with its own fail-fast-before-any-
database-call proof (`tests/helpers/e2e-cleanup-failsafe.test.ts`).

**Apiary now has its own, parallel v1 test**, scoped in
`22_APIARY_V1_SCOPING_REPORT.md` and revised in
`24_APIARY_SCOPING_REVISION_PROMPT.md`: *can the platform carry one apiary
through a season of inspections to a honey batch with a sensory result?*
The scope is settled — tickets **A0** (offline base mechanism) through **A8**
(DEMO seed + E2E test). **A1 (apiary site + Hive/Colony schema + RBAC),
A2 — REVISED (Colony origin + Inspection + ColonyEvent), and A3
(Harvest/extraction → HoneyBatch as `Lot`) are now done**
(`tests/apiary/hives.test.ts`, 10 tests; `tests/apiary/inspections.test.ts`,
8 tests; `tests/apiary/colonyEvents.test.ts`, 9 tests;
`tests/apiary/harvest.test.ts`, 8 tests — all real Neon). Inspection stays
a formal, structurally protected table (§1a); feeding/treatment/passing-
observation share a separate `ColonyEvent` log. A3's own test suite
confirmed §2's central claim by execution, not just architecture: the
real, unmodified `createSampleFromLot`/`recordMeasurement`/
`computeCurrentQuantity`/`requestLotAssetUpload`+`finalizeLotAssetUpload`
all work against a honey `Lot` with zero new downstream code. **A4
(Sensory linkage) folded into A3's own definition of done, per the
report's own recommendation, rather than becoming a standalone ticket** —
`getSensoryLinkageForSamples`'s zero-new-code claim now has a live proof
too, not just the source read that originally predicted it.
**A5 (Operator UI) is now done, and A0 (offline base mechanism) was folded
into it rather than becoming its own ticket** — `25_OFFLINE_OPTIONS_ANALYSIS.md`'s
Option B (vanilla IndexedDB draft queue, no service worker, explicit "Sync
now") turned out to be exactly A5's own offline-form problem, so building
one without the other made no sense. `InspectionForm` and
`ColonyEventQuickEntry` queue drafts locally and sync via a
`clientDraftId`-checked-before-insert idempotent action
(`app/actions/apiary.ts`); `HarvestForm`/`NewHiveForm`/`NewColonyForm`
stay online-only, per A0's own scope note. Live-verified against real
Neon: a draft queued while offline stays `pending` and un-synced; on
reconnect it auto-syncs and the real row appears. `/apiaries`,
`/apiaries/[id]`, and the per-hive/colony detail page are live in both
English and Spanish, and `HarvestForm` redirects straight into the
existing `/lots/[id]` page — no new HoneyBatch screen was needed, the
strongest practical confirmation yet of §2's "HoneyBatch is just a `Lot`"
argument. **A6 (photo attachment) is now done** — `Asset` gains
`hiveId`/`colonyId`/`inspectionId`/`colonyEventId` nullable FKs (no
`honeyBatchId`; a honey batch is a `Lot`, already covered by the existing
`lotId` FK), `lib/apiary/media.ts` mirrors T12.5's request/finalize shape
against `requireApiaryAccess`, and `ApiaryPhotoUploadForm` is wired into
all four attachment points plus an aggregated "Photos" gallery on the Hive
Detail page (`tests/apiary/media.test.ts`, 7 tests, real Neon).
Live-verified through the RBAC/storage-key-prefix steps against real Neon;
the actual object-storage PUT is unverified live in this environment — no
R2 credentials, the same limitation T12.5 already established, surfacing
as a clean, catchable error rather than a crash. **A7 (Projects,
Assignments, real people/organizations) is now done — real production
data, not demo.** Absorbed `26_CARGA_REAL_PASO1_PERSONAS_ORGANIZACIONES.md`
(never run; treated as replaced). Café and apiario are two *separate*
Projects on one physical site (Finca Las Nubes Cerro Azul), not one
Project with two domain tags — they're two different sociedades (Huerbsch
vs. Daniel Giráldez individually), and leaf-scope containment has to keep
them apart. Built `OrganizationMembership` — `DOMAIN_MODEL.md` §2 already
specified this table; it had never actually been built until now. Added a
narrower `colony_event:manage` permission (distinct from `apiary:manage`)
so a trainee (Kenis) can log `ColonyEvent` entries without also being able
to create an `Inspection` — a real RBAC gap the original A1/A2 apiary
permission model couldn't express. §8's 5 isolation requirements were
run live against real Neon through the real service-layer functions, not
a mock, and all passed. Pre-load cleanup removed the DEMO "Las Nubes" 2027
chain seeded by T14 (a name collision waiting to happen against the real
Project) and 71 orphaned rows left behind by earlier test runs whose
`afterAll` never completed — root-caused, not fixed (see the note below).
**A5.5 (service worker: the app opens with zero signal) is now done,**
built out of A1-A8 numeric order per direct instruction, ahead of A8.
`25_OFFLINE_OPTIONS_ANALYSIS.md`'s Option B (A5) only covers *losing*
connectivity mid-session; it never solves *arriving* at a zero-coverage
site and opening the app cold. `public/sw.js` precaches the app shell
(both locales' i18n messages, static assets) on first visit with signal,
cache-first for static/build assets, network-first-with-cache-fallback
for operator-route navigations (`/apiaries`, `/lots`), falling back to a
static, self-contained `public/offline.html` that reads the `NEXT_LOCALE`
cookie client-side rather than trying to solve locale-aware caching
inside the service worker itself. `public/manifest.webmanifest` makes the
app addable to a home screen — the prompt's own point that an operator in
the field can't be expected to remember a URL. §2's three data-protection
controls are all in: synchronous IndexedDB write before the UI confirms
"saved" (unchanged from A5, now also surfaced as a visible `saveError` in
`InspectionForm` and `ColonyEventQuickEntry` on write failure, not just
on sync failure), always-visible state (`OfflineSyncIndicator` now shows
last-successful-sync time and a storage-quota warning at >80% usage, not
just pending/errored counts), and drafts are never discarded locally
until the server confirms the row exists. §3's storage-quota warning uses
`navigator.storage.estimate()`. §4's three security decisions: Auth.js
session `maxAge` cut from Auth.js's ~30-day default to 7 days
(`lib/auth/config.ts`) — a uniform lever, not offline-specific, since
Auth.js has no offline-only session concept; app-level IndexedDB
encryption evaluated and explicitly rejected for v1 (reasoning in
`lib/apiary/offlineQueue.ts`'s comment above `purgeStaleDrafts` — a
device-bound key ends up reachable by anything that can drive the page,
so it protects against the wrong attacker) in favor of a two-stage
7-day-warning/21-day-purge mechanism, a narrow, explicitly-scoped
exception to `OFFLINE_FIELD_CAPABILITY.md` §3's "no expiry, ever" rule;
and fresh per-sync RBAC revalidation was confirmed live, not just by
reading the code — a scratch Assignment was created, used to sync one
Inspection successfully, revoked, and a second sync attempt against the
same (now-revoked) Assignment was confirmed rejected by both
`recordInspectionSyncAction` and `recordColonyEventSyncAction`, then the
scratch rows were deleted. This ticket's ADR is appended to `DECISIONS.md`
as ADR-046 (per C1 §2 — the number in this document's earlier drafts,
"ADR-046," turned out to still be the next one available, so it kept it).

**A8 (DEMO seed + E2E test) is now done — the last ticket in the original
A1-A8 set, so the apiary track's own build is complete.** The ADR
amendment justifying apiary's v1 inclusion is appended to `DECISIONS.md`
as ADR-046 (C1 §2), alongside ADR-044 (T12.6's own amendment) and ADR-047
(T12.5's Asset-schema decision, renumbered — its working number of "044"
was taken by ADR-044 itself by the time it was appended).
`tests/apiary/e2e.test.ts`
mirrors T14's own coffee E2E test structure: Hive → Colony → a season of
Inspections/ColonyEvents (including one recorded through the *offline*
path — a client-generated `clientDraftId`, retried exactly as a real
dropped-response resync would retry it, per §7's own addition to A8's
definition of done — confirmed to resolve to one row) → harvest → honey
`Lot` → `Sample` → an actual sensory score via the real, unmodified
`getSensoryLinkageForSamples` → RBAC denial on both a read and a write
path. All 6 assertions pass against real Neon.

`seedDemoApiaryChain()` in `prisma/seed.ts` (opt-in, `SEED_DEMO_CONTENT=
true`) gives the apiary track its own DEMO example — deliberately named
"DEMO Highland Apiary," not "Las Nubes." A7 deleted an earlier DEMO "Las
Nubes" tree specifically because it collided with the real "Las Nubes
Cerro Azul" Projects; reusing that name for apiary's own DEMO content
would have recreated the exact risk A7's cleanup existed to remove.
Verified running to completion and idempotently no-op on a second run,
against real Neon.

**Two pre-existing bugs found and fixed while building A8** (both
directly blocked verifying it, not scope creep): `seedDemoSensoryContent`
assumed its coffee cupping Protocol implied its DEMO Session still
existed — no longer true after A7 deleted that Session along with the
rest of the old "Las Nubes" tree; now self-heals by rebuilding the
session/samples/flight if the protocol survived but the session didn't.
`tests/apiary/harvest.test.ts`'s own `afterAll` never deleted the two
`Sample` rows (`{RUN_ID}-CUP-001`/`002`) it creates — a real per-run leak;
fixed, and 8 already-accumulated leaked rows were cleaned from Neon in
the same pass.

**Both issues A8 flagged here were fixed in the next turn (2026-08-13),
per direct instruction — see "Recommended order" item 2 below for the
full account.** In short: `seedDemoDiscoverContent`'s coffee DEMO tree is
now named "DEMO Cloudline," not "Las Nubes" — the actual `no_lot_access`
root cause (an Assignment-creation bug in `seedDemoTraceabilityChain` and
`seedDemoPartner`, not just the naming collision) was found and fixed
too, verified live against real Neon. And the 37 dangling `Scope` rows
were audited, cleaned, and their two remaining source files
(`tests/apiary/e2e-cleanup.ts`, already fixed during A8 itself, and
`tests/traceability/e2e-cleanup.ts`, fixed here) corrected — every other
file using the same "wrong-project user" pattern already cleaned up
correctly.

**A8's own live-browser verification, deferred at the time, was completed
2026-08-13** — logged in as a scratch Farm Operator scoped to the DEMO
Highland Apiary project, in both locales: the Hive/Colony detail page
correctly shows all 3 recorded activity entries in order; the honey
`Lot`'s own detail page shows the 22 kg harvest, the 0.3 kg sample, and
the sensory score (8, 3 responses) end to end — the platform's own
falsifiable "harvest through to a cupping score" claim, now confirmed
live in the running app for apiary, not just via direct DB/service-layer
queries. This pass found one real, pre-existing bug: the Lot Report page
(T13) claimed "origin unknown" for that same honey lot, even though its
own detail page correctly showed the harvest. `getLotReport`'s origin
query (`lib/traceability/reports.ts`) only ever checked `HarvestEvent`/
`ReceivingEvent` — `ApiaryHarvestEvent` (A3) was never wired in, a gap
that existed from A3 onward and had gone unnoticed because no honey lot's
report had been checked live until now. Fixed (query + report page +
new `originApiaryHarvestEntry`/`organizationUnknown` i18n keys), pinned
with a new regression test in `tests/apiary/harvest.test.ts`, and
re-verified correct in both locales after the fix.

**Fixed, not just investigated: why 71 rows were orphaned in Neon.**
`vitest.config.ts` set no `testTimeout`/`hookTimeout` — every test file
ran on Vitest's 10-second default for both. `DATABASE_URL` in `.env`
pointed at Neon's *direct* endpoint (no `-pooler` hostname suffix), and
Neon's serverless compute suspends after idle — the first query on a
fresh connection after a suspend has to wait for the compute to wake,
which repeatedly measured well past 10 seconds live in this session
(`tests/traceability/e2e.test.ts` and `reports.test.ts` both failed their
`beforeAll`/`afterAll` under the default timeout — including when run
alone, just the two of them — and passed cleanly once `--testTimeout=30000
--hookTimeout=30000` was set explicitly). `lib/db.ts`'s single cached
`PrismaClient` on `globalThis` is scoped per *process*, but Vitest's
default pool runs test files in parallel worker threads — each worker
gets its own process-local cache and therefore its own independent
connection pool, so a full run opens several fresh direct connections to
Neon at once, compounding the cold-start wait each file's hooks already
have to absorb within the same tight 10-second budget. When a `beforeAll`
or `afterAll` times out partway through, whatever `deleteMany` calls
hadn't run yet simply don't — that's the mechanism that left this
session's Person/Organization/Project/Location/Lot residue behind (17 + 6
+ 17 + 13 + 18 = 71, the exact figure found and removed during A7's
pre-load cleanup). **Fixed in the commit immediately after A7**:
`vitest.config.ts` now sets `testTimeout: 30000, hookTimeout: 30000`
explicitly, and `.env`'s `DATABASE_URL` was corrected to Neon's
`-pooler` endpoint — the value `.env.example` had already documented as
the intended one, confirmed empirically (`prisma migrate status` and the
full suite both run cleanly against it) rather than assumed. `.env` is
gitignored, so this fix never touches git; only `vitest.config.ts` was
committed.

**`17_DESIGN_TO_IMPLEMENTATION_AUDIT_PROMPT.md` (Parts A-F) is now run,
in full.** Read-only design-to-implementation audit: does the code actually
do what the architecture documents claim? Part A checked 7 enforcement
claims against live Neon grants and code — 3 held exactly as documented
(blind-mapping restriction, Lot/LotTransformation append-only in practice,
Media pipeline correctly unbuilt); 4 didn't (`ai_service`'s "SELECT scoped
like RBAC" claim, `audit_event`'s DB-level append-only claim, and two
provenance-column gaps). Part B built a coverage matrix across 15
architecture/planning documents; Parts C-E detailed the drift, found real
orphan code (two undocumented RBAC permissions, two undocumented Role
Profiles), and caught `GAP_ANALYSIS_2026-08-10.md`'s Traceability/Apiary
verdicts having gone backwards in three days. Part F consolidated all of it
into a punch list.

**`31_C1_CORRECCIONES_AUDITORIA.md` executed that punch list, in the order
the audit itself specified — consequence, not effort.** Separate commits per
section, all against real Neon:
- §1: `GAP_ANALYSIS_2026-08-10.md` marked historical with an unmissable header.
- §2: the two orphan ADRs (A5.5's offline decisions, T12.5's Asset schema)
  appended to `DECISIONS.md` as ADR-046/ADR-047; both draft files deleted.
- §3: audit trail added to 11 evidentiary write sites across
  `lib/traceability/*`, `lib/apiary/*`, `lib/sensory/service.ts` — live-
  verified producing real `AuditEvent` rows during the full test run (184
  tests).
- §4: six documents corrected to describe what's actually built rather than
  what was originally claimed (`AI_GOVERNANCE.md`, `SECURITY.md` ×2,
  `RBAC.md` ×3, `MVP_ROADMAP.md`, `DATA_ARCHITECTURE.md`) — every case was
  the document being wrong, not the code.
- §5: `generateDataCompletenessSuggestions` now excludes confidential/
  trade_secret Projects; two orphan-permission pairs got a documentation
  note instead of a speculative UI; `SECURITY.md` §1's email-verification
  claim was corrected rather than enforced (enforcing it today would have
  locked out every real Credentials-based account — no verification-email
  flow exists to have ever set the field); `tests/discover/service.test.ts`
  added 7 tests for the previously-untested public-read filter, surfacing
  one further real finding along the way (a public Story attached to a
  non-public Location still exposes that Location's details via the
  `location: true` include on the Story's own public page — flagged, not
  fixed, out of this ticket's scope).
- §7: `DOMAIN_MODEL.md` now carries a `[BUILT]`/`[PARTIAL]`/`[SPECIFIED]`/
  `[DEFERRED]` tag on every entity in §3-§5, and its own §7 stale summary
  (still listing Sensory/Competitions/Apiary as unbuilt) was corrected in
  the same pass — the exact failure this whole ticket exists to fix, found
  again while fixing it. New §8 proposes, without implementing, tying future
  audit passes to `PHASE_1_TECHNICAL_EXECUTION_PLAN.md` §36's Phase Gates.

Full `typecheck`/`lint`/test suite (202 tests, 23 files) passed after every
section. §6's explicit out-of-scope list (the "code is better than the doc"
drifts, and four items scoped as their own future tickets — sensory
descriptor/defect taxonomy, `CompetitionResult.rank`, rate limiting, refund
capability, `measurement` partitioning, `AssetStatus` vocabulary for the
media pipeline) was left untouched, as instructed.

**`30_F1_OPERACION_FINCA_ESQUEMA.md` is now run — schema and service layer
only, no UI, by explicit product-owner decision.** Implements four sections
of `29_BRECHAS_OPERACION_FINCA_INVESTIGACION_MIGRACION.md` (§4a stable
Location attributes, §4b microlots, §5 labour/material against a place,
§6 Specimens/traps) — a "dirección, no implementación" doc that itself
warns against building directly from it; F1 is that ticket. Schema:
`Location` gains sun/shade/altitude-range/slope/soil/spacing/description
plus `subdivisionReason` (replacing the single-value `altitudeMeters`,
confirmed zero populated rows before dropping it); new `Specimen`/
`SpecimenObservation`/`PlantingEvent` models; `LabourEntry`/
`MaterialConsumptionEntry` gain a nullable `locationId` so genuine
labour/material facts (holes dug, insumos applied) can be recorded
against a place with no batch yet, alongside the existing `Lot`-parent
path. RBAC: `location:manage_attributes`, `specimen:manage`/`view`, both
granted to Farm Operator (Bob/Sherry's real profile) and `specimen:view`
to Project Viewer. Broca traps are `Specimen.specimenType = "trap"`, not
a separate entity — the active→removed→reinstalled cycle lives entirely
in `SpecimenObservation` rows, reusing the one observation mechanism
rather than building a parallel one, per the ticket's own instruction.
27 new tests (`tests/traceability/f1.test.ts`), real Neon, alongside the
existing 210 (237 total, all passing).

Running F1's own §7 real-data verification surfaced a genuine RBAC gap:
Bob/Sherry/Daniel's real Farm Operator assignments on Cerro Azul are
project-scoped, but every new F1 permission check is location-scoped only
(`Location` carries no `projectId` for `lot:manage`'s usual project-or-
location fallback to reach). Fixed live against Neon — Bob and Sherry now
hold location-scoped Farm Operator on the Finca-level Location, all six
real Lote rows, and Beneficio; Daniel holds it on both real Apiario sites
— flagged as a standing design tension worth its own future ADR (see the
F1 draft ADR's Consequences section). Of `29_` §5's four real pending
facts, only one had every field the schema actually requires: the 600
Caturra seedlings received from Cafelino on 2026-08-08 (real
`PlantingEvent`, recorded against the Finca-level Location). The other
three — 600 planting holes, cleanup of apiary sites, the biochar
waterwheel activation — could not be recorded without fabricating
`LabourEntry`'s required `workerCount`/`hours` fields, which no source
document states; someone still needs to ask Sherry, Bob, or Kenis for
those numbers. Per the same discipline, no per-lot altitude/sun/shade
values were loaded onto any of the six real lots — the only real number
in the source docs (Cerro Azul altitude varies 600-650m *within* a lot)
is an unattributed illustrative example, not a confirmed measurement of
one specific lot, so it was recorded only as a sourced, general note on
the Finca-level Location's `description`, not as any lot's real
`altitudeMinM`/`altitudeMaxM`. **A future review querying any of the six
real Cerro Azul Lote Locations will find `sunExposure`/`altitudeMinM`/
`altitudeMaxM`/`slopeDescription`/`soilType` all null, repo-wide — this
is the documented outcome of the decision above, not data loss or a
broken migration (re-confirmed 2026-08-13, unrelated cleanup pass).**
**Appended as ADR-048** in `DECISIONS.md` —
see its Consequence section for the RBAC-gap follow-up
and the full list of what `29_` still leaves unbuilt (`RoastSession`,
defect classification, Research OS/PE protocols, map, water, climate,
meeting minutes, Kits Descubre Terroir, José Giráldez/Craft Brewing
Supply integration — all named in `29_` §7-§10, none in F1's scope).
A7's real data (both real projects, all six real lots, Beneficio, Cuarto
de secado, both real apiary sites) verified intact before and after every
write, and every TEST-prefixed verification artifact cleaned up — zero
residue.

**A follow-up data-integrity fix, 2026-08-13, found while working an
unrelated ticket (S1).** A7's own reuse of the pre-existing "Finca Rosina"
Organization for the real Cerro Azul farm was itself correct — real
`OrganizationMembership` rows for Bob/Sherry/Chris Huerbsch and the real
"Las Nubes Cerro Azul — Café" Project already pointed at it, matching
`27_A7_...md` §3's brand-name pre-approval by Sherry. But the org's own
`description` was never updated off its original "Boquete highlands /
DEMO placeholder" text, and `seedDemoDiscoverContent()` in `prisma/seed.ts`
kept matching that same organization by name on every
`SEED_DEMO_CONTENT=true` run — a real DEMO Product
(`demo-cloudline-coffee`) and a reparented DEMO Location (the original
"Finca Rosina" site, moved under real Cerro Azul instead of its intended
Boquete) were both found still attached to it, plus an orphaned
pre-cleanup leftover Product (`las-nubes-coffee`). Fixed against real
Neon: the real org's description corrected (sourced from §3, not
fabricated); a new `DEMO Amber Ridge` Organization created to carry the
DEMO identity forward; the DEMO Location and Product reassigned to it and
the Location reparented back to Boquete; the orphaned Product deleted;
`seedDemoDiscoverContent()` updated to seed `DEMO Amber Ridge` instead of
`Finca Rosina` going forward — the same "rename the DEMO side, never the
real side" pattern already used for "Las Nubes" → "DEMO Cloudline". The
real Location, all ten real child Locations, both real Projects, and the
three real `OrganizationMembership` rows were verified unchanged before
and after. See `22_APIARY_V1_SCOPING_REPORT.md`'s A7 row for the full
account.

**The root cause was fixed structurally, not just renamed, in the same
follow-up.** A renamed string only fixes the one collision found — it
does nothing to stop a *future* DEMO name landing on a *future* real
organization's name, and this exact mechanism had already bitten once
before (A8's "Las Nubes" collision). `findOrCreateOrganization` was
extracted out of `prisma/seed.ts` into a new `prisma/seedHelpers.ts` (so
it's importable by a test without triggering seed.ts's own
import-time `main()` — a full production seed run) and now checks, before
reusing any name-matched Organization, whether it already has real
backing (any `OrganizationMembership` row, or any real `Project`
referencing it as `organizationId`/`clientOrganizationId`); if so it
throws `DemoOrganizationCollisionError` instead of silently returning it.
`tests/seed/organizationGuard.test.ts` proves this against real Neon —
scratch fixtures, not a full seed run: the guard throws when a
name-matched org carries a real membership, throws when it carries a real
Project reference, and still reuses idempotently (and still creates a
fresh row) when there's no real backing, so normal `SEED_DEMO_CONTENT=true`
re-runs keep working. 4/4 pass; the full suite (255 tests, 26 files) and
`typecheck`/`lint` all pass after the change; scratch fixtures verified
cleaned, zero residue.

**`32_S1_CAFES_EXTERNOS.md` is now run — schema and service layer only, no
UI, same convention as F1.** Closes the gap where a coffee arrives already
cupping-worthy with no `Lot` behind it — a client sample, a competitor's
entry, green coffee handed over at a fair, with only a declared farm,
varietal, process, and harvest year/month. Structural decision (§3, with
reasoning in the draft ADR): `Sample.sourceLotId` stays null and a new
1:1 `ExternalCoffeeOrigin` table carries the declared metadata, rather
than building a minimal `Lot` — decided on direct evidence, not
preference: `sourceLotId` was already nullable (T5), and DEMO Sensory/
Competitions samples already flow through the full real cupping pipeline
(`SensorySession` → `SensoryFlight` → `SensoryBlindSample` →
`PanelResult`) with no `Lot` at all, so the mechanism this ticket needed
already existed end to end — it just had no entry point for real,
non-demo declared-origin data. `ExternalCoffeeOrigin` carries producer/
processor/brand as three independently nullable `Organization` FKs (§1's
worked example: Agustín Gómez's Geisha, processed at Cafelino, presented
under Néctar Nómada's own brand), one record-level `declaredProvenanceClass`
(manufacturer_specification/interpretation, ADR-038 pattern) but three
independent per-field `dataQuality` columns (varietal/process/harvest
window), since §2's own calibration note says their reliability genuinely
differs fact by fact. Harvest window is `year`/`month`/`date` precision
with the corresponding fields validated against it — never a fabricated
day out of "cosecha 2025." §5's classification/ownership requirement
("nace internal, tuyo," sharing only via explicit Assignment) needed zero
new code — `Sample.classification` already defaults to `internal`, and
there is no `organization` RBAC `ScopeType` in this codebase, so an
`Organization` FK on a record has never granted that organization's
members access. §6's "complete later, but don't pretend it was always
known" recommendation (in the draft ADR, with reasoning): per-fact
`*KnownAt` timestamp columns, not row-versioning — nothing in this schema
pins a reference to "this record as of version N" the way
`SensoryProtocolVersion`/`CompetitionResult` do, so full versioning
machinery would be pure overhead; `completeExternalCoffeeOrigin` stamps
only the field that actually changed. It also supports linking the real
`Lot` once traced, without clearing the declared-origin history. Created
the real **Lost Origin** organization (`organization_type: laboratory`,
id `f18965bd-46cc-459b-a469-3732442218ee`) via a one-time script, same
precedent as A7's other real organizations — never added to
`prisma/seed.ts`'s DEMO gate. 14 new tests
(`tests/traceability/s1.test.ts`), real Neon, covering all six of §9's
scenarios including a real minimal external-coffee sample reaching an
actual cupping score. Full suite now 251 tests, all passing.
**Appended as ADR-049** in `DECISIONS.md`, right after F1's own ADR-048.
No real external-coffee samples were loaded — none were supplied; §9's
verification proves the mechanism the same way F1 proved its own before
real field data existed to load.

**`33_R1_ROASTSESSION_TAXONOMIA_SENSORIAL.md` is now run — schema and
service layer only, no UI, same convention as F1/S1.** Two joined gaps
from `29_` §7a and `17_`'s Part C finding 4: no typed record of how a
coffee was roasted, and no structured vocabulary for what a judge
perceived beyond a plain number. `RoastSession` follows Fermentation/
DryingRun's principle (an execution record hanging off `LotTransformation`
via a dedicated `roastSessionId` FK) but is one call, not their start/end
pair — a roast's real capture point, every §4 scenario describes it, is
"log the whole session once it's done," the same shape `HarvestEvent`
already uses. Three roasters roasting the same green lot three ways is
recorded as three separate `stage_change` transformations sharing one
input lot, rather than reusing the already-verified `split`-with-three-
outputs shape directly — each roast is a genuinely separate execution the
one-FK-per-transformation shape can't express if they shared a
transformation row; `getLotLineage`'s recursive CTE produces the
identical queryable DAG either way. The roast curve reuses the existing
`Measurement` entity (new `roastSessionId` FK, additive, same convention
as `fermentationRunId`/`dryingRunId`/`storageAssignmentId`) rather than a
new time-series table or an opaque equipment-file reference; first/second
crack get real `RoastSession` columns since every roast log tracks those
two checkpoints. Equipment stays free text (`equipmentNote`), matching
`FermentationRun.vesselNote`'s own precedent — no Equipment entity exists
yet (`18_`, still V2). The same `roastSessionId` mechanism distinguishes a
pre-roast green-coffee measurement from an ordinary storage-phase one —
no new field needed, the FK's presence already says which moment.

`SensoryDescriptor`/`SensoryDescriptorResponse` implement the exact shape
`BEVERAGE_SENSORY_PROTOCOLS.md`'s defects-taxonomy section already
specified (one unified table: family, specific descriptor, expected
perception, classification positive/neutral/defect, nullable technical
cause) — not redesigned into separate tables. Loaded the real,
product-owner-authored three-tier honey taxonomy (12 positive families, 2
neutral, 6 defect families each with a real technical cause) into
`prisma/seed.ts`'s unconditional `seedBeverageProtocolsContent()` —
caught and fixed a real seeding bug along the way: the descriptor-seeding
code was originally nested inside `if (!existingHoney)`, which silently
never ran because the Honey protocol already existed in Neon from an
earlier session; moved to its own idempotency check keyed on the protocol
version. Coffee/beer/mead get no descriptor rows — no real vocabulary
exists for them yet, not fabricated to fill the gap. `submitAssessment`
gains an optional `descriptorResponses` array (with a nullable
low/medium/high confidence per response) alongside the existing numeric
`AttributeResponse` and `Assessment.comment` free text — additive, never
a replacement for either; existing callers omitting it are unaffected.
Checked live: `core.Assessment` has zero rows in the shared database, so
§2.4's "don't auto-convert existing free text" question has nothing to
migrate yet — the policy is recorded for when real evaluations start
accumulating.

11 new tests (`tests/traceability/roasting.test.ts`,
`tests/sensory/descriptors.test.ts`), real Neon, covering all five of
§4's verification scenarios. **Appended as ADR-050** in `DECISIONS.md`,
right after S1's own ADR-049. Two pre-existing gaps were found while building this
ticket and spun off as separate background tasks rather than folded into
these commits: `Measurement.fermentationRunId`/`dryingRunId`/
`storageAssignmentId` existed as schema columns since T6/T7/T8 but were
never wired through `recordMeasurement` until this ticket's own
`roastSessionId` addition prompted the check; and `FermentationRun`/
`DryingRun`'s start/end functions were missed by C1 §3's audit-trail pass
and still record no `AuditEvent`. What remains from `29_` after this
ticket: `RoastSession` (done) and the descriptor/defect taxonomy (done)
close §7a and the audit's Part C finding 4; still open — Research OS/PE
protocols, map/plano, water, climate, meeting-minutes entity, Kits
Descubre Terroir, José Giráldez/Craft Brewing Supply integration, defect
*classification* workflow beyond the vocabulary itself (§7b), and real
`RoastSession`/`SensoryDescriptorResponse` data — none was loaded, since
none was supplied; the mechanism is proven by tests only, the same way
F1/S1 proved their own mechanisms before real field data existed to load.

### RO1 — Research OS: full schema, PE-protocol variable modeling, screens only for what PE exercises

`34_RO1_RESEARCH_OS.md`. Full DOMAIN_MODEL.md §4 chain -- 24 entities
(ResearchProgram -> ResearchQuestion -> Hypothesis -> Experiment -> Protocol
-> ProtocolVersion -> TreatmentBatch -> ProcessingStage, Evidence ->
EvidenceClaim -> Interpretation -> Conclusion -> ResearchRecommendation,
AnalysisPlan/Run/Result, Publication, Deviation -> CorrectiveAction,
Approval, VariableCatalog/VariableCatalogValue, ProcessingStageObservation,
ResearchActivity) -- against the real §3a variable modeling the product
owner decided: catalog-typed (Recipiente, Levadura/cultivo, Método de
inoculación, Grado de proceso, Cuarto de secado -- extendable by insert,
never migration, same data-not-schema pattern RBAC.md §2 already proves
for Role Profiles) versus closed-enum (Fuente de agua, Posición de masa --
fixed, frozen per ProtocolVersion), each catalog value carrying an
optional definition and an optional aliasOfId (self-referential,
canonical-value resolution -- compareTreatmentBatchesByVariable resolves
through it before diffing). **RO1.1 correction (35_
RO1.1_HONEY_PORCENTAJE_CANONICO.md, ADR-052):** honey-by-color and
semi-wash-by-percentage are NOT aliased to each other -- industry sources
contradict each other on the mapping seriously enough (black honey
reported as anywhere from 50% to 100% mucílago retenido depending on the
source; yellow honey defined by retained mucílago in some sources and by
*removed* mucílago, inverted, in others) that loading a fixed
correspondence would assert a standard that doesn't exist. Percentage
(grado_proceso) is the canonical, comparable value; color is its own
separate catalog-typed variable (honey_color: black/red/yellow/white,
gold dropped by product-owner decision), recorded alongside the
percentage, never in its place, each color's definition stating
explicitly that the equivalence varies by region and producer. The alias
mechanism itself stays valid for other cases -- this specific one just
isn't one of them.
Spontaneous Wild is modeled as a dataQuality signal (absence of known
strain), not an organism name. Bed level is interpreted against its own
room (Location gains dryingRoomLightExposure/dryingRoomBedLevelCount,
ProcessingStage gains locationId) -- level 1 in the solar room and level 1
in the dark room are never conflated.

The §3b "Estudio de cerezas" categorical vocabulary (Selección, Flotado,
Condición visual, Limpieza, Color, Firmeza, Densidad-bracket, Tamaño/
forma, Defectos de grano) reuses the catalog mechanism, not R1's
SensoryDescriptor/SensoryDescriptorResponse -- that pair is structurally
coupled to Assessment/BlindSample/a judging session, and a pre-processing
cherry inspection has none of those. A new join table,
ProcessingStageObservation, records the categorical picks; Brix/peso/
densidad stay ordinary Measurement rows. ProtocolRequiredMeasurement
(numeric variable or catalog reference, at a named processing-stage
moment) is what a ProtocolVersion declares it needs measured, and
completeProcessingStage enforces it -- refuses to close a stage missing a
required reading or pick.

§4's statistical discipline: Experiment.controlTreatmentBatchId (declared,
validated to belong to the same experiment) makes the control explicit;
Conclusion.provenanceClass (required) + isComparative (boolean) is
enforced by createConclusion -- a comparative conclusion can never be
measured_fact, since no PE treatment is replicated. Bioprotection strain
(MP72/HDA54) is a catalog-typed variable within one ProtocolVersion, not a
separate protocol -- reusing §3a's mechanism, no new field.
CryoBloom-as-method is answered as "every TreatmentBatch under that
ProtocolVersion," using the already-built ProtocolVariable.isControlled to
distinguish a deliberately-varied factor from a protocol constant.
Experiment.derivedFromExperimentId + derivationNote record scientific
lineage between trials, deliberately separate from the Lot-transformation
DAG. Experiment.declaredLimitations (free text, the product owner's own
wording) records the method's stated boundary alongside its results, not
in a separate document.

UI built only for what §5 names: create/version a protocol with its
variables and required measurements; list/filter protocols by variable;
execute a protocol against a lot; view a treatment's results including its
sensory linkage (reusing getSensoryLinkageForSamples unmodified). No UI for
Publication, AnalysisPlan/Run/Result, Deviation/CorrectiveAction, Approval,
the Interpretation -> Conclusion -> ResearchRecommendation chain, control
declaration, experiment lineage, or declared limitations -- all have real,
RBAC-checked, audited service functions, deliberately not screen-connected
yet.

RESEARCH_ACTIVITY_CRITERIA.md's gate is supported, not applied: the
ResearchActivity model, the Research Compliance Reviewer Role Profile, and
the no-self-review rule (canReviewResearchActivity, enforced in code, the
same structural mechanism RBAC.md §7 uses for blind-judge restrictions)
are built; no CryoBloom/gastro-tourism activity was reviewed against the
five-part test -- that stays human review, out of scope here.

28 tests (tests/research/ro1.test.ts, RO1's original 23 plus RO1.1's own
four verification points from its §5), real Neon, covering all fifteen
of §9's verification scenarios plus RO1.1's honey-percentage-canonical
correction. **Appended as ADR-051** in DECISIONS.md,
right after R1's own ADR-050. Both open questions flagged in that ADR are
now closed by **ADR-052** (35_RO1.1_HONEY_PORCENTAJE_CANONICO.md): the
honey-color/semi-wash mapping is resolved by explicit non-mapping (§2
above -- a decision, not a gap), and the product owner has confirmed
**PE-77...PE-112 is sequence only** -- it encodes nothing beyond the
lineage the Lot/LotTransformation DAG already models
(Protocol.externalIdentifier stores it verbatim; no further parsing
work is needed against it). No PE data was
imported -- the real CSVs live with the product owner, not in this
repository; what a clean PE-protocol CSV import would need is reported in
the draft ADR's Consequences. What remains from `29_` after this ticket:
Research OS/PE protocols (done, mechanism only -- no real data loaded)
closes §8; still open -- map/plano, water, climate, meeting-minutes
entity, Kits Descubre Terroir, José Giráldez/Craft Brewing Supply
integration, and the actual PE CSV import once the product owner supplies
the files and confirms the open questions above.

### RO1.2 — Fermentation methods: orthogonal dimensions, wash medium, process-sensory evaluation

Extends RO1's own catalog mechanism, not a new module. The ticket's central
finding: fermentation "methods" the industry usually presents as one list
are actually independent axes — "anaeróbico no es un proceso, es una
condición de fermentación," combinable with any process flow, thermal
handling, or microbial source. Modeled as seven orthogonal dimensions a
treatment selects one value from each of (Flujo de proceso, Condición de
oxígeno, Manejo de temperatura, Fuente microbiana, Sustrato añadido,
Estado de la cereza, Medio de lavado), reusing RO1 §3a's
`VariableCatalog`/`ProtocolVariable`(catalog-typed)/
`TreatmentBatchVariableValue` mechanism unmodified — six new catalogs,
zero new schema for the dimensions themselves. The seventh, "Flujo de
proceso," turned out to already exist as `grado_proceso`
(Natural/Washed/Semi Wash 50%/75%) — reused, not duplicated; its one real
gap, "Honey," is added bare (no baked-in percentage, unlike Semi Wash's),
matching RO1.1/ADR-052's own restraint against inventing a
percentage without real data.

Two genuinely new relational structures, not data-only: wash medium
(`ProcessingStage.washMediumCatalogValueId`/`washMediumSourceLotId` —
"mosto de otro lote" is closer to inoculating than rinsing, PE-106/PE-107
"Doble Mosto Guacho," so which lot matters and is enforced both ways by
`recordWashMedium`) and `ProcessSensoryObservation` (sensory evaluation of
the *medium* — mosto/cereza/pergamino/grano — during processing, distinct
from `Assessment`'s finished-product cupping and RO1's own
`ProcessingStageObservation` physical-state check; field-language
descriptors recorded verbatim, never forced technical, same "let the
equivalence emerge from use" reasoning as RO1.1's honey color; a real
inference goes through the existing `Evidence` -> `EvidenceClaim` ->
`Interpretation` chain via a new `Evidence.processSensoryObservationId`
FK, never a same-row field). Every §2 method's own numeric field (cold
hold's six temperature checkpoints, thermal-shock cycles, vessel pressure,
brine concentration, water volume/ratio, and the rest) is a
`lib/traceability/units.ts` registry addition, not schema — CLAUDE.md's
own stated rule; the multi-stage "cereza entera anaeróbica sumergida ->
despulpado -> honey" scenario is a chained `LotTransformation` DAG across
two `TreatmentBatch` rows, never a compound catalog value, per §2's own
"Multi-etapa... no crees un valor de catálogo" instruction.

No new screens (RO1's existing UI reads this data unmodified, since it
flows through mechanisms already rendered). 11 tests
(`tests/research/ro1-2.test.ts`), real Neon, covering all of §5's
verification scenarios, full regression 321/321. Migration applied
directly against Neon (`prisma migrate diff --from-config-datasource`,
routing around a pre-existing migration-history ordering defect —
`20260813112712_ro1_statistical_discipline`'s folder timestamp predates
`20260813153349_ro1_research_os`, the migration that creates the
`research` schema its own SQL depends on; it applied fine in the real
order things were actually run, but breaks a from-scratch shadow-database
replay. Filed as its own ticket, `39_MIGRATION_HISTORY_ORDERING_BUG.md`
— see "Not yet written"/"Pending" below; not fixed here, deliberately, per
the product owner's own instruction. **Appended as ADR-053** in
`DECISIONS.md`, right after RO1.1's own ADR-052.
**`bioprotective_yeast_dose`'s unit, flagged incomplete in ADR-053, is now
confirmed by the product owner: `g/kg`, real CryoBloom reference figure 1
g/kg base + 30% adjustment ≈1.3 g/kg — closed by ADR-054**, the registry
entry and §5.4's test corrected to match.

**Incomplete fields still open, reported per §6, not silently assumed:**
`koji_substrate`/`rehydration_method`/valve type (maceración carbónica,
anaeróbico)/anaeróbico's purge gas are free text, not a controlled
vocabulary — the ticket names no fixed list for any of them. No specific
"Honey NN%" `grado_proceso` value is loaded. Every other method in §2 has
its full field list built.

### V1 — Vocabulary fix: Lote is terrain, Batch is harvested/processed coffee

A UI/i18n relabel, not a schema change (`Lot` stays `Lot` in the database —
renaming it would cost a migration over real production data for no
structural gain, per the ticket's own explicit instruction). The interface
had it backwards from the product owner's own usage: "Lots" meant harvested
coffee, and opening `/lots` (which the product owner reads as "my six
terrain lots") showed coffee batches instead. Every `Traceability`-namespace
key referring to harvested/processed coffee was relabeled **Batch** in both
languages (`en.json`: "Batch"; `es.json`: literal "Batch," the loanword the
product owner already uses for beer and mead — deliberately not translated,
to unify vocabulary across domains instead of inventing a coffee-specific
word) — `lotsTitle`, `createLotButton`, `lotListHeading`, `noLots`, every
`lotType_*`/`transformationType_*`/`quantityEventType_*` label, error and
confirmation strings, the report page, `Nav.lots`. `plotLabel` (the
terrain-plot dropdown in `HarvestForm.tsx`) was corrected from "Parcela" to
**"Lote"** in Spanish — the actual fix the product owner asked for — and
stays "Plot" in English.

**The link that was actually missing, not just the name (§2):**
`RecordHarvestEventInput.locationId` was already `string`, not nullable —
harvest already structurally required stating which terrain plot a batch
came from; this ticket adds a test (`tests/traceability/v1-vocabulary.test.ts`)
proving that's enforced at the data layer (Prisma/Postgres reject a
harvest recorded without one), not just the TypeScript type a caller could
bypass at runtime. What was genuinely missing was *visibility*: batch
detail (`app/lots/[id]/page.tsx`) and the batch report
(`app/lots/[id]/report/page.tsx`) now both render a dedicated "origin plot"
section showing the plot's F1 terrain conditions (sun exposure, shade,
altitude range, slope, soil) next to the batch's own results — F1 had
already modeled and fetched these fields (`getLotDetail`/`getLotReport`
both `include: { location: true }`); they were simply never rendered.

**§4's screen-split decision:** kept `/lots` as the batch listing
(relabeled "Batches") and added a new, separate `/plots` page
(`app/plots/page.tsx`) listing the user's accessible terrain plots and
their F1 conditions, reusing `getManageableContext().plotLocations`
unchanged (already built, already scoped, zero service-layer work). This
is the minimal option of the three the ticket named — not the third
(farm-as-entry-point, `29_` §3) — because the minimal fix unblocks the
product owner today without committing to the larger redesign `29_` §3
already flagged as separate, larger-scoped work; that redesign remains
noted, not built.

**§6.6 — real batches missing a terrain lot: zero.** Of 8 real (non-TEST)
`Lot` rows in production, **all 8 have `locationId` set** — confirmed by
direct query, not assumed, and not backfilled (inferring a past batch's
plot would be exactly the fabrication the provenance discipline
prohibits; the ticket's own instruction is to report the count and let
the product owner decide, not to guess). Real Location rows (the
Cerro Azul "Lote 1"–"Lote 6" plots, Jaramillo) currently have **no F1
attributes populated** — the "origin plot conditions" section will show
its empty state for real batches until that data is entered; this is
existing, unrelated state, not something this ticket's schema/UI change
altered.

**§6.7 — real data reconfirmed intact:** A7 (Cerro Azul's real
projects/lots/locations), F1 (Location F1 attributes, unpopulated but
present), S1 (`Lost Origin` organization), R1 (49 `RoastSession` rows),
RO1 (14 `VariableCatalog` rows) — all present, no test residue leaked
into production (`strayTestPrefixedLots: 0`, `strayTestOrgs: 0`).

5 new tests, real Neon, RUN_ID-scoped fixtures, full 310/310 regression
pass. No ADR — the ticket's own deliverables list didn't ask for one
(pure relabel plus a rendering addition, not a new structural decision),
so none was drafted.

---

## The series

### Run

| File | Purpose |
|---|---|
| `00_FIRST_SESSION_PROMPT.md` | Bootstrapped the nine architecture docs |
| `01_ADD_EXTERNAL_DATA_SOURCES_PROMPT.md` | **PARTIAL.** The input was filed, but not as instructed: it landed under its original name (`NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md`, not the short `EXTERNAL_DATA_SOURCES.md` the prompt names) and inside Slice 1's own commit rather than its own commit as Step 2 required. The derived architecture doc exists under a third name, `EXTERNAL_DATA_ARCHITECTURE.md`. Content-complete; the filename/commit discipline the prompt asked for was not followed. |
| `02_ADD_MEDIA_PIPELINE_PROMPT.md` | Filed the media intelligence pipeline |
| `03_CRYOBLOOM_PUBLIC_CONTENT_PROMPT.md` | **SUPERSEDED by ADR-024.** `prisma/seed.ts` explicitly excludes CryoBloom from seed content — a real, ongoing research program is treated as too sensitive for even placeholder copy, the platform's own scientific-integrity principle applied to itself. Not an oversight; a later, opposite decision. |
| `04_ADD_REMAINING_PLANNING_DOCS_PROMPT.md` | Five planning docs; research-criteria review checklist |
| `05_ADD_SENSORY_PROTOCOLS_PROMPT.md` | Beverage sensory protocols and panel calibration |
| `06_ADD_COMPETITIONS_PROMPT.md` | Competitions operational layer, category-agnostic |
| `07_GAP_ANALYSIS_PROMPT.md` | Produced `GAP_ANALYSIS_2026-08-10.md` |
| `08_ADD_TOURISM_DESIGN_RESOURCES_PROMPT.md` | Episode design + partner resource library |
| `09_ADD_BRAND_MARKETING_PROMPT.md` | **PARTIAL.** Filed the raw input (and its corrected version, commit `c913595`) — but the prompt's own actual deliverable, `docs/architecture/BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md`, was never produced. Still listed under "Not yet written" below. |
| `10_POST_GAP_ANALYSIS_CLEANUP_PROMPT.md` | Ten mechanical fixes from the gap analysis |
| `11_UPDATE_HONEY_MEAD_CONTENT_PROMPT.md` | Real honey/mead content (commit `4080633`) |
| `12_VERIFICATION_PASS_PROMPT.md` | Verified Phase 1 lot model, T5 lineage, honey/mead copyright. **Came back clean** |
| `13_DEFINE_PLATFORM_V1_PROMPT.md` | Produced ADR-039, the v1 definition |
| `14_T9.5_PROVENANCE_RETROFIT_PROMPT_REVISED.md` | Removed the silent `direct_observation` default (ADR-038) |
| `15_DOCUMENTATION_CORRECTION_PASS_PROMPT.md` | Honey rubric rebuilt as original + attribution corrected; citation fixes; ADR-041/042 |
| `19_ADR_RECONCILIATION_AND_T13_AMENDMENTS.md` | Parts A and B landed in commits `ecdb45a` and `3c6d9eb`. **Part C (media readiness) is now closed, not open** — its recommendation was adopted: `21_T12.5_MEDIA_ATTACHMENT_PROMPT.md` and the T12.5 build that followed are exactly the consequence Part C asked to evaluate. No separate Part-C report file exists; the decision is evidenced by what it produced. |
| `20_CAPTURE_OR_LOSE_IT_PROMPT.md` | Produced `20_CAPTURE_OR_LOSE_IT_REPORT.md` (commit `fcc95e1`) and was then implemented as **T12.6** (commit `0e849c0`) — schema, `lib/traceability/operations.ts`, ADR-044 |
| `21_T12.5_MEDIA_ATTACHMENT_PROMPT.md` | Implemented as **T12.5** (commit `4ec5316`) — schema, `lib/traceability/media.ts`, UI, ADR-043 |
| `22_APIARY_V1_SCOPING_PROMPT.md` | Produced `22_APIARY_V1_SCOPING_REPORT.md` — apiary's v1 boundary, A1-A8 ticket breakdown, draft ADR amendment. *(Uncommitted — on disk, `git status` shows it untracked.)* |
| `23_RECIPES_FORMULATION_DISTILLATION_PROMPT.md` | Produced `docs/architecture/RECIPES_FORMULATION_AND_DISTILLATION.md` — `DistillationRun`/`SaccharificationRun`/`RoastSession` specified, `Recipe`/`RecipeVersion` designed, two worked traces. *(Uncommitted.)* |
| `24_APIARY_SCOPING_REVISION_PROMPT.md` | Revised `22_`'s report in place: `Inspection`/`ColonyEvent` model split, offline reassessed as non-deferrable (added ticket A0), status corrected. *(Uncommitted, like the report it revises.)* |
| `25_OFFLINE_OPTIONS_PROMPT.md` | Produced `25_OFFLINE_OPTIONS_ANALYSIS.md` (commit `c03fa2a`) — sized and compared three options for A0 (full PWA, minimal IndexedDB draft queue, paper). Found the original A0 sizing wrongly included versioned conflict resolution, which doesn't apply to `Inspection`/`ColonyEvent`'s append-only write shape. Recommends **Option B** (minimal draft queue, no service worker), resizing A0 from the set's largest unknown down to small-medium, pending one field check (tab survival on Kenneth's device at Cerro Azul with no signal). Confirms A4's fold into A3 under the same scrutiny. |
| `17_DESIGN_TO_IMPLEMENTATION_AUDIT_PROMPT.md` | Read-only, Parts A-F all run. Part A: 3 of 7 enforcement claims held exactly as documented, 4 didn't (DB-level claims that were actually application-logic-only, or unbuilt). Part B: coverage matrix across 15 documents. Parts C-E: drift detail, orphan permissions/Role Profiles, `GAP_ANALYSIS_2026-08-10.md`'s build-status verdicts found to have gone backwards. Part F: consolidated punch list, executed as `31_C1_CORRECCIONES_AUDITORIA.md` — see "Where things stand" above for the full account. |
| `31_C1_CORRECCIONES_AUDITORIA.md` | Executed 17_'s Part F punch list, ordered by consequence not effort, one commit per section — see "Where things stand" above. |
| `27_A7_PROYECTOS_ASSIGNMENTS_DATOS_REALES.md` | Real Projects/Assignments/People/Locations for Cerro Azul — see A7 in "Where things stand" above. *(Filed late in this session; the ticket itself had already been executed.)* |
| `29_BRECHAS_OPERACION_FINCA_INVESTIGACION_MIGRACION.md` | "Dirección, no implementación" — investigation, not a ticket to build from directly. Four of its sections (§4a, §4b, §5, §6) implemented as `30_F1_OPERACION_FINCA_ESQUEMA.md`; the rest (§7-§10) remains unbuilt, see F1's entry above and its draft ADR's Consequences section. |
| `30_F1_OPERACION_FINCA_ESQUEMA.md` | Farm-operation schema/service layer — Location attributes, microlots, Specimen/traps, PlantingEvent, labour/material against a place. No UI, by explicit product-owner decision. See "Where things stand" above. |
| `32_S1_CAFES_EXTERNOS.md` | External coffee schema/service layer — `ExternalCoffeeOrigin`, `Sample` without a `Lot`. No UI, by explicit product-owner decision. See "Where things stand" above. |
| `33_R1_ROASTSESSION_TAXONOMIA_SENSORIAL.md` | `RoastSession` and structured sensory descriptor/defect taxonomy — schema/service layer only, no UI. See "Where things stand" above. |
| `34_RO1_RESEARCH_OS.md` | Research OS — 24-entity schema, PE-protocol variable modeling, catalog/statistical-discipline layer. §5-scoped UI only. See "Where things stand" above. |
| `35_RO1.1_HONEY_PORCENTAJE_CANONICO.md` | Corrected RO1 §3a-bis: no honey color↔percentage alias is loaded — percentage is canonical, color is a separate producer label. See "Where things stand" above and ADR-052. |
| `36_RO1.2_METODOS_FERMENTACION.md` | Fermentation methods as orthogonal dimensions — 6 new catalogs, wash medium, `ProcessSensoryObservation`. No new screens. Draft ADR-053, not appended. See "Where things stand" above. |
| `38_V1_VOCABULARIO_LOTE_BATCH.md` | Vocabulary fix — terrain "Lote"/"Plot" vs. harvested-coffee "Batch," plus the batch→origin-plot visibility this ticket found actually missing. New `/plots` page. No schema rename. See "Where things stand" above. |
| `40_I1_IMPORTADOR_PE_CAFELINO.md` | Cafelino PE importer — **RUN AGAINST PRODUCTION 2026-08-21**, after five rehearsals on a local restored copy. Actor is a real account holding Farm Operator + Research Lead, not the DEMO admin — all five permissions the import needs resolve at the Cafelino project scope, checked before running. Re-run on production reports 43 processed / 43 skipped and writes nothing. 41 unique PE codes (PE-91/PE-93 duplicated in source, deduped) plus 2 deduced lineage parents → 43 TreatmentBatches, 84 ProcessingStages, 43 Lots, 34 HarvestEvents, 376 variable values. Re-run is idempotent (43 processed / 43 skipped). Two bugs found and fixed by running it: `dataQuality` was never set for unknown-identity cultures, which aborted the run at PE-81 (ADR-053 makes it required for "Spontaneous Wild" — 4 rows, recorded `not_tested`); and the Lot was written before the TreatmentBatch that idempotency keys on, so a mid-run failure left an orphan Lot and the retry died on `lot_code` uniqueness — orphans are now adopted. Data gaps belong to the source, not the importer: `Cafe verde H%` is empty in 44/44 rows, `Parchment Bean H%` in 42/44, exit date in 40/43, and PE-107's "Guacho mostos" matches no catalogued culture (stored null, not guessed). |
| `37_S2_PROPOSITO_SENSORIAL_NAVEGACION.md` | Sensory purpose/subject model and navigation consolidation. `SensoryPurpose` (5) and `SensorySubject` (3) on `SensorySession`, both **nullable and unbackfilled** — §6 forbids classifying past sessions, and the six that predate the migration stay null. Comparability is enforced, not documented: `lib/sensory/purpose.ts` decides what may be aggregated with what, and `computePanelResult` now refuses a session with no declared purpose. Navigation drops from ten fixed entries to at most eight permission-filtered ones; Competitions and Calibration move inside `/sensory`; sign out and the locale switcher leave the destination row. `permissionKeysAnywhere` added to RBAC — display-only by construction, never an authorization answer. AI Suggestions stays a destination and is now hidden from viewers lacking `ai:review_suggestion` (it was previously offered to everyone and answered "no access" to almost all of them). Draft ADR-058, appended and marked DRAFT. **Migration written by hand:** `prisma migrate dev` cannot run at all while `39_MIGRATION_HISTORY_ORDERING_BUG.md` is open — its shadow database replays history from empty and dies on the ordering bug — so the SQL came from `prisma migrate diff` and was applied with `migrate deploy`. Applied to a local restored copy only, not production. |

### Pending

**`39_MIGRATION_HISTORY_ORDERING_BUG.md`** — **FIXED 2026-08-20.**
Renamed to `20260813162732_ro1_statistical_discipline`, its true
application time per production's own `_prisma_migrations`, with the
matching row updated in the same operation. `prisma migrate dev` works
again; history replays from empty with no drift. Original diagnosis, which
follows, is kept because it explains the problem. Found during RO1.2, and
for a while deliberately not fixed: `20260813112712_ro1_statistical_discipline`'s
folder timestamp predates `20260813153349_ro1_research_os`, the migration
that creates the `research` schema its own SQL depends on. Production
(Neon) is unaffected — `prisma migrate status` reports clean, because
`_prisma_migrations` just records what actually ran, in the actual order
it ran. But a from-scratch shadow-database replay (what `prisma migrate
dev` needs to generate a new migration, and what standing up any new
environment from the migration files alone would need) fails at that
exact point. RO1.2 routed around it with `prisma migrate diff
--from-config-datasource` (diffing directly against the live database)
instead of the normal flow — documented as a repeatable workaround in the
ticket's own §6, needed by every schema-changing session until this is
actually fixed. Not fixed here: the real fix touches either
`_prisma_migrations` on production or already-applied migration folder
names, both sensitive enough to need explicit product-owner sign-off
first (the ticket lays out three options, not yet chosen).

**`16_ADAPTIVE_OPERATOR_WORKSPACE_PREAMBLE.md`** — **unblocked.** Its
companion, `ADAPTIVE_OPERATOR_WORKSPACE_RESEARCH_PROMPT.md`, is now filed
(committed alongside this fix) — the preamble is no longer a preamble to
nothing. Its own §6, line 135's `recordedBy`/ADR-038 contradiction is also
fixed, corrected to `operatorPersonId`. Neither the preamble nor its
companion has actually been *run* yet, so this is pending, not done — and
the research prompt's own filed copy carries a status note worth reading
first: it was written to shape T10's design, which has since shipped
(`db9410b`), and its apiary data-model addendum is superseded by
`22_`/`24_`'s real model. Remaining value is refinement of what exists plus
design input for A5 and later multi-role context-switching, not greenfield
architecture.

### V2

**`18_EQUIPMENT_AND_READINESS_PROMPT_REVISED.md`** — equipment, instrument
calibration, operational readiness, consumables. Explicitly not v1. Confirmed
still not run — no `EQUIPMENT_AND_READINESS.md` exists (checked directly
while scoping `23_`, and again in the 2026-08-12 audit). Two things in it
matter beyond equipment tracking: instrument calibration state should
*derive* a measurement's `data_quality` (an out-of-calibration refractometer
does not produce a `measured_fact`), and urgency is contextual rather than a
stored severity — a broken airlock in June is routine, the same fault with
cherry arriving Thursday is blocking.

**Owns the Resource model.** The wider operational-economics research (not yet
filed here) also models Resource, custody, and acquisition. Two prompts
independently modelling Resource guarantees divergence — this one owns it.

---

## Data sovereignty — closed, 2026-08-20/21

The gap this README called "the one with the least margin for error" is no
longer open. What exists now, all verified rather than asserted:

- **Backups off the provider** — `pg_dump` to Google Drive, weekly via launchd,
  with retention. ADR-055.
- **Restore testing that is not ceremonial** — every backup is restored into a
  throwaway PostgreSQL and diffed against a per-table row census before it
  counts as verified. The test suite now runs on a restored copy too, so the
  restore path is exercised on every run rather than annually.
- **Secrets custody** — `.env` sealed under a passphrase held only in a
  password manager, recovery drilled. ADR-057. A restored database is not a
  restored system without it.
- **A Neon exit runbook** — restoring into stock PostgreSQL 18 is documented
  and demonstrated, not assumed.

What remains is listed below: producer-facing export, and exit runbooks for
Vercel and R2.

---

## Not yet written

- **Brand/marketing architecture review** — `09_`'s own actual deliverable
  (`BRAND_MARKETING_COMMUNITY_SALES_ARCHITECTURE.md`), still missing. The
  input document is filed and unblocked by ADR-037; the review itself was
  never run.
- **Operational economics, full pass** — merge with `18_` so Resource is
  designed once. `20_` is the urgent slice already extracted from it.
- ~~**Client/producer data export**~~ — **built 2026-08-21**, ADR-059.
  `lot:export` plus `/api/export` returns a dated zip of the caller's lots,
  measurements, samples and panel results as CSV and JSON. Scope reuses
  `resolveLotVisibility`, so it cannot contain more than the app already
  shows. Deliberately applies no classification AND-gate — every Lot is
  `internal` and Farm Operator can only clear `partner`, so a gate would
  return nothing to the person it is for. That inconsistency is recorded in
  ADR-059 as a real defect awaiting a decision, not resolved inside an export
  feature.
- **Vercel and R2 exit runbooks** — the Neon one exists (restore into stock
  PostgreSQL, `BACKUP_AND_RECOVERY.md`); the other two providers do not have
  theirs written.

---

## Recurring failure worth knowing about

Several prompts drafted outside this repository named files that do not exist
(`PLATFORM_ARCHITECTURE_RECONCILIATION.md`, `MASTER_IMPLEMENTATION_ROADMAP.md`,
`AI_PERSONA_VOICE_GUIDE.md`, `EXTERNAL_DATA_SOURCES.md` under that exact
name), or used vocabulary this platform does not use (`ProjectMembership`,
`Role`, `MediaAsset`, `capability`). The Phase 1 prompt also omitted the
document that already answered its central question — it worked out only
because the session went and found `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md`
§F unprompted.

**Before running any externally-drafted prompt: verify its reading list
against the actual repository, and check its vocabulary against
`DOMAIN_MODEL.md` and `RBAC.md`.** Asking for a KEEP/NEW classification of
entities that do not exist is how invented entities enter a schema.

---

## Recommended order from here

1. **Apiary's own A1-A8 ticket sequence is now closed** — A0 folded into
   A5 and A4 folded into A3 (both confirmed live, no standalone build);
   A8 was the last remaining ticket. Coffee's own sequence closed earlier
   at T14. Both verticals' build tracks are done; no more architecture or
   ticket work answers what's left (see #3 below).
2. **`SEED_DEMO_CONTENT=true`'s "Las Nubes" collision is fixed, not just
   flagged, as of 2026-08-13.** `seedDemoDiscoverContent`'s coffee DEMO
   tree — site, project, org, plot, warehouse, stories, products,
   experiences, lot codes, sample codes — is renamed "DEMO Cloudline"
   throughout (`prisma/seed.ts`), the same identity-separation A8 already
   gave apiary's own DEMO chain. Root-caused and fixed the actual
   `no_lot_access` crash this collision was causing, not just its
   symptom: the seed operator's Assignment was only ever created inside
   the "Person is brand new" branch in both `seedDemoTraceabilityChain`
   and `seedDemoPartner` — once that Person survived a Project's own
   deletion/recreation (exactly what A7's cleanup did to the old "Las
   Nubes" Project), the reused account kept an Assignment scoped to a
   Project id that no longer existed. Both functions now check for an
   Assignment scoped to *the current* Project id unconditionally, the
   same pattern `seedDemoApiaryChain` (A8) already used. Verified live
   against real Neon: a full `SEED_DEMO_CONTENT=true` run completes
   end to end with no crash, a second run is a clean no-op, no row is
   named "Las Nubes," and the real `Las Nubes Cerro Azul — Café`/
   `— Apiario` Projects are untouched throughout.
3. **The 37 dangling project-scoped `Scope` rows are cleaned, and the
   root cause found and fixed where it was still live.** All 37 were
   orphans (no Assignment referenced any of them) from a "wrong-project"
   negative-RBAC-test pattern used across ~18 test files: create a second
   Project + Scope, assert access denied, clean up. Auditing all of them
   found only two files actually missing the second project's own Scope
   in their `afterAll` — `tests/apiary/e2e-cleanup.ts` (A8's own, fixed
   during A8 itself) and `tests/traceability/e2e-cleanup.ts` (T14's,
   fixed here) — every other file already covered both projects
   correctly. Both now derive Scope ids from the Assignments *before*
   deleting them, rather than assuming a single known `projectId` covers
   every Scope a test created. A full 194-test suite run after the fix
   left one single dangling Scope (down from 37) — cleaned, but not
   forensically traced to a specific file; worth a second look only if it
   recurs at scale.
4. **Credentials.** R2 is set and verified working (2026-08-20 —
   authenticated against the real bucket, which is empty). Stripe and Google
   OAuth remain unset in production, so cart, checkout, bookings and social
   sign-in stay built-but-dead. Both need keys issued from those dashboards;
   there is nothing to copy from `.env`, where they are empty too.
5. **The real milestone**: a real apiary season actually inspected by
   Kenis, Chayanne, and Daniel — the real people and Projects now exist
   (A7) — and, in parallel, a real 2026 coffee harvest entered by a real
   operator who isn't Daniel. Both are what actually answer ADR-039's test
   and apiary's own. No further architecture pass answers either question.

`17_` (the coverage audit) and the rest of v2 (data sovereignty, economics
merged with `18_`) follow once there is real usage in both domains to audit
against.
