# Capture-or-lose-it — report (read-only, no changes made)

Confirmed the pasted prompt matches [`docs/implementation/20_CAPTURE_OR_LOSE_IT_PROMPT.md`](docs/implementation/20_CAPTURE_OR_LOSE_IT_PROMPT.md) exactly — already in the repo. Also found [`21_T12.5_MEDIA_ATTACHMENT_PROMPT.md`](docs/implementation/21_T12.5_MEDIA_ATTACHMENT_PROMPT.md) already drafted (not yet executed, not in the task list) — it recommends T12.5 land before T13 for the identical "capture window closes" reason this prompt applies to labour/materials. Noted where relevant below; not otherwise in scope here.

Verified per §2: `PLATFORM_ARCHITECTURE_RECONCILIATION.md`, `MASTER_IMPLEMENTATION_ROADMAP.md`, `AI_PERSONA_VOICE_GUIDE.md`, and `EXTERNAL_DATA_SOURCES.md` (exact name) do not exist. `NECTAR_NOMADA_EXTERNAL_DATA_SOURCES.md` does exist under a different name — not substituted, per instruction to just verify and say so.

---

### 1. Irreversibility analysis

**Labour time — PASSES, strongest candidate.** Confirmed by fresh schema read: nothing anywhere records attendance, headcount, or duration. `FermentationIntervention`/`DryingTurnEvent` record that an event occurred and who logged it (`createdBy`), never who worked or for how long. No payroll/timesheet system exists in the platform to reconstruct this from later. Entirely irrecoverable, as the prompt predicts.

**Material consumption — PASSES for the fact; the prompt's own hard constraint blocks the mechanism that would make it fully useful.** `FermentationRun.inoculationNote` is free text only — unstructured, not queryable, no batch/quantity fields. The *fact* (what, how much, which batch) is capturable today only as prose, which satisfies irreversibility technically but not usefully. A structured quantity+batch record passes the test; a stock-balance-linked one does not belong in this pass (§4 hard constraint — no fourth inventory concept, that's `18_`'s job).

**Equipment used — mostly already captured, one small gap.** Confirmed via fresh read of `FermentationRun`/`DryingRun`/`StorageAssignment`: `vesselNote` (fermentation) and `containerNote` (storage) are free-text fields **already built** in T6/T8 — the irreversible fact (which tank, which bag) is already preserved. `DryingRun` has `method` (free text — "raised_bed"/"patio"/"mechanical") and `locationId`, but no equivalent free-text field identifying *which* physical bed/dryer among several at the same location. That's the one real gap, and it's a one-column addition mirroring an existing pattern, not new schema surface. No `Resource`/`Equipment` entity exists yet (confirmed: `grep` for `model Resource|model Equipment` in `schema.prisma` returns nothing) — consistent with `18_` owning that model, not built yet.

**Third-party / in-kind involvement — partially passes.** `HarvestEvent.organizationId` and `ReceivingEvent.organizationId` already capture the dominant case (whose farm, whose delivery) — no gap there, already built. The residual gap is ad hoc in-kind contribution *during processing* (a borrowed tank, a partner's transport) that has no natural event to attach to today. Real but narrow.

---

### 2. Minimal field specification

Two new append-only tables in the `traceability` schema, plus one additive column. Both new tables follow `Measurement`'s own precedent exactly: **specific nullable FKs per possible parent, no polymorphic pair** (ADR-020 decision 8), and both carry `provenanceClass` (required, no default — ADR-038) plus `dataQuality` (nullable) as **separate axes** — the prompt's own line, "an operator's recalled estimate of hours worked is not a `measured_fact`," is a `dataQuality` distinction (`provisional` vs `verified`), not a `provenanceClass` one; a same-day headcount tally and a next-morning recollection can both legitimately be `direct_observation`, differing only in how much they're trusted. Worth stating explicitly since the two columns are easy to conflate.

**`traceability.labour_entry`**
```
id, harvestEventId?, receivingEventId?, fermentationRunId?, dryingRunId?  (one set, nullable each — no lotId; every parent already sits on the genealogy DAG, so labour inherits lineage for free without a second attachment point)
workerCount        int        required
hours              decimal    required
taskNote           text       nullable
providedByOrganizationId  uuid? → Organization   (in-kind flag, rides this table rather than a new one)
occurredAt         timestamptz  (defaults to now, editable)
operatorPersonId   uuid → Person   (who's reporting — reuses T9.5's observer pattern)
provenanceClass    required, no default
dataQuality        nullable
createdAt/createdBy   standard columns
```
Deliberately **not** attached to `lotId` directly — attaching to the specific run/event it belongs to is both more precise and already DAG-connected, avoiding the double-attachment ambiguity a broader `lotId` FK would invite.

**`traceability.material_consumption_entry`**
```
id, fermentationRunId?, dryingRunId?   (scoped to the two stages the prompt names — yeast/cultures/nutrients/treatments)
materialName    text     required
batchLabel      text     required-within-the-form (the one irrecoverable identity fact — see §3)
quantity        decimal  nullable
unit            text     nullable
occurredAt, operatorPersonId, provenanceClass (required), dataQuality (nullable), notes
```
`materialName`/`batchLabel` are free text now, **not** an FK to a `Consumable` entity — none exists. When `18_` ships one, these text fields are a natural later FK-swap target; that migration is `18_`'s to write, not this one's, per the hard constraint.

**Additive column:** `DryingRun.equipmentNote` (text, nullable) — identical shape to `vesselNote`/`containerNote`, closing the one equipment gap from §1.

**Migration footprint:** 2 new tables (standard columns, indexes on each parent FK), 1 new nullable column. Nothing existing changes required-ness; no backfill; fully additive, matching this session's established risk tolerance for schema changes.

---

### 3. UX proposal

Both new forms live as small, always-optional inline actions inside the Lot Detail page's existing **Active Fermentation** and **Active Drying** sections ([app/lots/[id]/page.tsx](app/lots/[id]/page.tsx)) — the same sections that already host `recordFermentationInterventionFormAction` and `endFermentationFormAction`, mirroring their compact, no-modal style rather than `MeasurementForm`'s larger block. Harvest/Receiving have no persistent "active" state, so their labour form appears as a one-time optional prompt right after the harvest/receiving event is recorded.

**Recording "four people, three hours" on the active fermentation run:**
1. Tap the People field, type `4`.
2. Tap the Hours field, type `3`.
3. Tap Submit.

Task note and the "Reported by" person select are left at their defaults (blank note; self, matching `MeasurementForm`'s existing `getObserverCandidates` pattern) — two field-taps and one submit-tap for the golden path. The observer select is present but need not be touched unless someone is logging another person's tally after the fact — exactly the "recalled estimate" case the prompt names, which is why it's overridable rather than fixed.

**Recording "2 kg of a named yeast batch":**
1. Tap Material, type the name.
2. Tap Batch label, type it (placed first in visual priority since it's the field that matters most — the irrecoverable identity fact).
3. Tap Quantity, type `2`.
4. Unit defaults to a pre-filled `kg` (confirm-tap, not type-tap, in the common case).
5. Tap Submit.

No `provenanceClass` dropdown on this form (unlike `MeasurementForm`, which has a genuinely ambiguous case) — the action layer hard-codes `direct_observation`, matching how T9.5 handled every call site except the one with real ambiguity. A dropdown here is exactly the kind of friction §5 warns against for a fact that isn't actually in question.

**Required/optional/defaulted, stated explicitly:**
- The whole labour form and the whole consumption form are **optional to open at all** — never blocking `startFermentationAction`/`endFermentationFormAction`. Bolting required fields onto an already-adopted, already-working form risks exactly the garbage-data failure mode §5 names.
- Within the labour form, `workerCount`+`hours` are required *together* once opened — a lone number without the other is meaningless.
- Within the consumption form, `materialName`+`batchLabel` are required once opened; `quantity`/`unit` stay optional — "I pitched about 2 kg, no scale at the tank" is worth recording with a note rather than a fabricated precise number (`DATA_ARCHITECTURE.md` §4's own "never a guessed number" line).
- `providedByOrganizationId` is a collapsed toggle, off by default — zero cost for the dominant in-house-labour case, one extra tap only when it applies.

**Explicitly not touched:** `HarvestForm`, `ReceivingForm`, `StorageForm`'s own submission flows — no new fields added to any of them.

---

### 4. Deliberately not captured

- **Named individual identity per labour entry** (vs. aggregate headcount) — only total person-hours per operation survives; no per-person work history or productivity is reconstructable later.
- **Clock-in/clock-out timestamps** — only a duration total is captured; "was the crew on-site during the hottest part of the day" is unanswerable later.
- **Structured `Resource`/Equipment identity** (real FK, calibration, condition) — deferred to `18_` entirely; this pass adds prose only. Equipment utilization or outcome-vs-equipment-history analysis is not reconstructable from this data.
- **Stock-linked material consumption** (decrementing a known balance) — this pass captures the fact, not a live inventory. "How much yeast do we have left" cannot be answered from these rows; that needs `18_`'s consumable stock balance.
- **Labour/consumption during Storage and Sample stages** — out of scope for both new tables. Any attended work moving lots in the warehouse or extracting samples goes uncaptured for 2026. Plausibly smaller in magnitude than harvest/fermentation/drying labour, but a real, deliberate gap, not an oversight.
- **Any monetary field** — rates, cost, valuation, depreciation. Entirely deferred by design; this is the governing principle itself, not a shortfall.
- **In-kind equipment/transport as a structured, queryable record** — captured only as prose inside `vesselNote`/`equipmentNote`, not as its own linked fact. "Which organizations contributed in-kind resources" is answerable only by reading free text, not by querying.

---

### 5. Draft amendment to ADR-039 (for review — not appended)

> **Amendment to ADR-039 — the capture-or-lose-it clause**
>
> ADR-039's deferral list (T11, Notification, Research OS migration, etc.) shares one property: none of it forecloses anything by waiting. A notification system built in v1.1 works exactly as well as one built in v1; a deviation-tracking ticket added mid-harvest doesn't lose deviations that hadn't happened yet.
>
> Labour time and batch-identified material consumption during the 2026 harvest do not share that property. Neither is required by the v1 falsifiable test (a cupping score and lot report need neither), so by the test alone both would defer exactly like T11 and Notification. But unlike every item on that list, the window to capture them closes permanently on a fixed calendar (Panama's harvest, roughly November 2026–March 2027) — a labour tally not recorded during a January fermentation cannot be added in March, let alone in 2027 when the v2 economics work is actually built.
>
> **Decision: labour-time and material-consumption capture (§2 of this document) enter v1 scope, on this narrow basis — not because the falsifiable test requires them, but because deferring them does not preserve the option the way every other deferred item does.** This is the same reasoning already applied to media attachment (`21_T12.5_MEDIA_ATTACHMENT_PROMPT.md`) — the two are independent applications of one principle, not two unrelated exceptions, and this ADR amendment should be read as naming that principle once rather than re-deriving it per ticket.
>
> No change to any other item on ADR-039's deferred list. No change to the v1 test itself. This amendment adds one criterion for *what else* can justify v1 inclusion beyond passing the test: irreversibility against a fixed calendar window, argued explicitly, not invoked casually.

---

### 6. Cost estimate, relative to T12–T14

Call the ticket **T12.6**, sequenced after `21_`'s T12.5 (media), before T13 — same reasoning, same deadline, and both touch the same Lot Detail sections, so doing media first and labour/consumption second (or genuinely bundling them, a call left open rather than presumed here) avoids re-opening the same forms twice.

Size: 2 new tables + 1 column (all additive) + 2 service functions (`lib/traceability/fermentation.ts`/`drying.ts`/`harvest.ts`, reusing the existing `getObserverCandidates` pattern rather than inventing a new one) + 2 small inline UI forms + i18n + tests + live verification. No object storage, no credential blocker, no offline consideration — meaningfully smaller than T12.5. Comparable in size to **T8** (`StorageAssignment`) — one of the smaller tickets in the T1–T9 series, well under T9.5 or T12.5's footprint. **T14**'s existing DEMO-seed responsibility gains a small addition (seed at least one labour entry and one consumption entry against the fabricated harvest chain) rather than new ticket work.
