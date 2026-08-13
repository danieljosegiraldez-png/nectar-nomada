# A0 — three offline options, sized and compared (response to `25_OFFLINE_OPTIONS_PROMPT.md`)

**Analysis and sizing only, as instructed. No code, no schema, no
migrations.** Comparison, then a recommendation with reasoning, then stop.
A0-A8 and T14 not started.

---

## 0. A finding that changes how all three options should be read

Before sizing anything: `OFFLINE_FIELD_CAPABILITY.md` §4's conflict-
resolution mechanism (`offline.sync_conflict`, versioned records held for
human review) exists for a specific write shape — **two people editing or
attaching to the same existing entity while both offline** (its own
worked example: two people tag the same tree). Checked directly against
what `Inspection` and `ColonyEvent` (`22_APIARY_V1_SCOPING_REPORT.md`
§1a) actually are: both are **append-only creates**. Recording an
inspection never edits an existing row, never attaches to a shared
mutable entity, and never collides with another inspection the way two
edits to one `Specimen` would — a second inspection of the same colony
on the same day is just a second, independently valid row, not a
conflict needing reconciliation. Even Kenis double-entering one
inspection by mistake produces two harmless rows, not corrupted data.

**This means §4's versioned conflict-resolution mechanism does not apply
to this write shape, for any of the three options below, regardless of
operator count.** What *does* apply, and is a different and much smaller
problem, is **idempotent sync** — preventing a retried sync from writing
the same draft twice (a client-generated draft ID, checked server-side
before insert). This single finding changes Option A's honest size
(§1), answers most of Option B's own "what breaks with a second
operator" question (§2), and is the reason this pass exists — the
original A0 sizing cited `offline.sync_conflict` as in scope without
this check.

---

## 1. Sizing, equal rigor, no option favored in advance

### Option A — full A0 as specified

**Verified directly, not assumed:** this codebase has zero PWA
infrastructure today — no service worker, no `manifest.json`, no `public/`
directory, no IndexedDB library dependency (`idb`, `dexie`, or similar) in
`package.json`, no PWA plugin in `next.config.ts`. Every other ticket
built so far (T1-T13, T12.5, T12.6) is server-rendered/server-action
based with zero client-side persistence layer. Option A is a genuinely
clean-slate build, not an extension of anything.

**Real size, with §0's correction applied:** service worker registration
and app-shell caching (new tooling, and Next.js App Router has no
first-class service-worker story — cache invalidation across Vercel
deploys is a known integration headache, not a solved problem this
project has faced before); an IndexedDB draft queue with a `sync_status`
state machine; a background-sync API integration; a storage-quota
warning UI; dual-ordered sync (structured data before media). **Not
included, per §0:** `offline.sync_conflict` and its resolution UI — the
single most complex piece of the originally-specified mechanism doesn't
apply to this write shape. Removing it shrinks Option A's honest scope
below what the original A0 row assumed, though it remains the largest of
the three by a wide margin.

**Uncertainty, distinct from size:** the service-worker/deploy-caching
interaction is the genuinely unknown part — sizeable even for an
experienced team, and this project has no prior instance of it to
calibrate against, unlike every other ticket's estimate in this series.
The IndexedDB draft queue itself is comparatively well-understood, "just"
new to this codebase.

### Option B — minimal local draft

IndexedDB (or, for this data volume, plain `localStorage` would also
technically suffice — noted as an even-lighter sub-option, not pursued
further here since IndexedDB's async API is the more defensible choice
once photos are attached later and outgrow `localStorage`'s sync,
string-only, ~5MB-per-origin ceiling) for the day's captures, an explicit
"sync now" control, no service worker, no app-shell caching, no automatic
conflict resolution.

**Does it work without a service worker?** This is genuinely two
different questions the prompt's framing treats as one, and they have
different answers:

- **Does already-recorded data survive a restart?** Yes, unconditionally,
  service worker or not — if (and only if) each submission writes to
  IndexedDB synchronously with the local "save," not merely to React
  state. A phone restart loses at most an in-progress, not-yet-submitted
  entry, the same as any web form anywhere.
- **Can Kenis *reopen* the app and keep working after a restart, while
  still offline?** No, not without a service worker — a fresh page load
  with no signal and no cached app shell simply fails to load, standard
  browser behavior. This is Option B's one real gap, and it is the
  correct target of the field-verification recommended in §2, not a
  reason to reject Option B outright.

**What breaks with a second operator?** Per §0: essentially nothing,
structurally. Each operator's device queues its own drafts independently;
two operators' inspections never need to reconcile against each other
regardless of connectivity, since neither is editing a shared entity.
Chayanne or Mickelle joining in v1.1 changes nothing about this
mechanism's correctness — it was never actually a multi-operator-
conflict problem for this write shape.

**How much of Option A is reusable if built now?** Nearly all of it. The
IndexedDB draft schema and the "queue on submit, sync on demand" client
logic *are* Option A's core — Option A adds a service worker wrapper
(offline page-loading) and swaps the manual sync button for automatic
background sync on top of the same queue, not a redesign underneath it.
Option B is a genuine subset of Option A, not throwaway work.

### Option C — paper, honest provenance

**Zero build.** The vocabulary Option C needs already exists — nothing to
add. `provenanceClass` stays `direct_observation`: Kenis genuinely did
observe the hive directly, and `provenanceClass` states what *kind* of
fact this is (an observation, not a guess), not how promptly it was
recorded. What degrades is `dataQuality` — `provisional` fits a same-
evening transcription honestly (checked against
`prisma/schema.prisma`'s `DataQuality` enum: `verified`,
`verified_with_limitation`, `provisional`, `unconfirmed`, `conflicting`,
`superseded`, `working_hypothesis`, `not_tested`,
`missing_source_record` — `provisional` and `verified_with_limitation`
both already exist and both fit depending on how confident Kenis is in
his own memory). `Inspection.occurredAt` already means "when the
inspection happened," separate from `createdAt` ("when the row was
written") — the schema already anticipated a delayed recording without
needing a new field.

**What's actually lost:** exact timing (an estimated "around 2pm"
instead of a precise timestamp, honestly reflected by `dataQuality`
rather than a false-precision value); fine brood-pattern/health detail
that fades between hive and kitchen table; and, real but smaller than it
first appears — a phone camera still works with no signal, so a photo
*can* still be taken at the hive and attached later during transcription;
only the immediate in-app attachment is what's actually delayed, not the
photo itself.

**Friction, and the risk it names honestly:** zero *new* field friction
(Kenis already carries some way to take notes), but Option C doesn't
reduce total work — it moves and delays it. Twelve hives on paper become
twelve re-entries that evening, which is *more* total effort than either
built option (both of which capture directly, needing no re-entry at
all). Batched, delayed data entry is exactly the kind of task most likely
to get partially finished — "I'll do the rest tomorrow" is a real,
concrete risk this option carries that neither A nor B does.

---

## 2. Comparison

| | Build size | Uncertainty | Solves | Doesn't solve | What's lost | Reusable toward A |
|---|---|---|---|---|---|---|
| **A — full, corrected per §0** | Largest by a wide margin; no in-repo precedent for the service-worker piece specifically | High, concentrated in service-worker/deploy-caching interaction | Everything, including reopening the app fully offline | Nothing structural | Nothing | — (it's the target) |
| **B — minimal local draft** | Small; IndexedDB + a sync button, new to this codebase but well-understood | Low, with one open question: does the tab survive a typical session without restart? | Data durability across restarts; multi-operator scaling (per §0, for free) | Reopening the app fully offline after a restart (open question, not a known failure) | Nothing certain — contingent on the tab-survival answer | Nearly all of it |
| **C — paper** | Zero | Zero (nothing to build) | Guaranteed to exist before November, by construction | Timing precision, fine detail, in-the-moment photo attachment | Real: exact time, memory-faded detail | Nothing — it's a parallel process, not a foundation |

**The deciding criterion, stated in the prompt itself: which option makes
it most likely the December-April season actually gets recorded?** A
half-built Option A landing mid-season is worse than well-kept paper. A
fragile Option B that silently drops data on restart would be worse than
both — but §1's analysis found Option B is *not* silently fragile in the
way that phrasing warns against: already-submitted data survives a
restart regardless of the service-worker question. The real risk Option
B carries is narrower and checkable, not the open-ended fragility the
prompt is right to guard against in principle.

## 3. Recommendation

**Option B, as the default — with one field-verifiable precondition
before treating A0 as closed.**

The eleven-week window named in `22_APIARY_V1_SCOPING_PROMPT.md` §2 is
the deciding fact, not a preference for simplicity on its own: Option A
is explicitly sized as this set's largest unknown, with its riskiest
piece (service-worker/deploy caching) being genuinely novel to this
project. Committing to it now risks precisely the "half-finished PWA in
December" failure this pass exists to avoid. Option C is buildable
before November trivially — by not building anything — but §1's honest
accounting shows it *increases* total effort (delayed re-entry) and
carries the one risk this whole exercise (`22_`'s §7, ADR-044's own
reasoning) was written to prevent: data that never gets fully
transcribed.

Option B sits between them with a size this project can actually finish
before the season starts, loses nothing already recorded to a restart,
and is not a dead end — it's the honest majority of Option A, reusable
outright rather than replaced.

**The one thing to verify before finalizing A0's scope, and it is a
field check, not a build task:** does Kenis's own phone/browser
reliably keep a tab alive through a normal inspection session at Cerro
Azul with no signal, or does the OS discard it? This is answerable in an
afternoon with his actual device, not a redesign question. Two outcomes:

- **Tab survives reliably** → Option B as specified is sufficient. A0
  closes at this size.
- **Tab does not survive reliably** → the fix is *not* to escalate
  straight to full Option A. It is one narrow addition — a service
  worker that caches the app shell only, so the page can be reopened
  offline — with no background-sync API and no conflict-resolution
  layer, since §0 already established the latter doesn't apply here.
  This is a smaller increment on top of Option B, not a jump to Option
  A's full scope.

This isn't declining to choose — it's refusing to guess at a fact
(Kenis's actual device behavior) this document has no way to know, per
the same discipline that governs every other undecided fact in this
project. The recommendation is Option B either way; the open question is
only whether one small addition rides along with it.

## 4. Consequences for the A0-A8 breakdown

- **Does A0 still exist as a ticket, and at what size?** Yes, redefined
  rather than eliminated: IndexedDB draft queue, a "sync now" control, a
  persistent offline indicator, and a storage-quota warning — dropping
  the service worker (pending §3's field check), the background-sync
  API, and `offline.sync_conflict` entirely (§0). Resized from "the
  single largest unknown in the whole set, likely larger than A5" down
  to **small-medium — closer to T8's size than to the original
  estimate.** Genuine novelty remains (no client-side persistence layer
  exists in this codebase yet), so this isn't a claim of zero risk, only
  a smaller and more honestly-scoped one.
- **Does A5 still depend on it, or can it start before?** Still depends
  on it — A5's forms should still be built calling the offline-aware
  submit path from the start, per `22_`'s own "built offline-aware from
  the start, not retrofitted" reasoning, which this revision doesn't
  change. What changes is the sequencing *pressure*: a small A0 is no
  longer the dominant risk in the set — A5 itself remains the largest
  ticket, as it was before A0 existed at all.
- **Does A8's definition of done change?** No — "at least one Inspection
  or ColonyEvent recorded via the offline path and confirmed to sync"
  still applies, and is if anything easier to test deterministically
  under Option B's explicit "sync now" than it would have been under
  Option A's nondeterministic background-sync timing.
- **Does the sequence change relative to T14?** No material change to
  `22_`'s own conclusion — A1-A4 already didn't touch any file T14
  touches. A0's resized scope makes it less likely to become a
  standalone bottleneck phase before A5, but the underlying sequencing
  shape (A1-A4 parallel-safe with T14; A0/A5/A8 are the integration-risk
  tickets) is unchanged.

## 5. A4 — confirmed, not rejected

`22_`'s recommendation to fold A4 (Sensory linkage) into A3's definition
of done rather than track it as its own ticket is **confirmed**, applying
this same pass's own rigor rather than accepting the original claim at
face value. Re-checked directly: `createSampleFromLot`
(`lib/traceability/samples.ts:56`) already accepts any `Lot` with no
coffee-specific assumption in its signature, and
`getSensoryLinkageForSamples` (`lib/traceability/lots.ts:603`) already
operates on `Sample` with no domain branching. Given `22_`'s own central
decision that `HoneyBatch` *is* a `Lot` (not a parallel entity), A4
requires literally zero new code once A3 exists — there is no unit of
implementation work here to justify a standalone ticket line, only a
verification checkbox. Unlike A0, where this pass's rigor changed the
original sizing, A4's original near-zero assessment holds up unchanged
under the same scrutiny.

---

**End of analysis.** Per the prompt's own instruction: report, then stop.
No construction started on A0-A8 or T14.
