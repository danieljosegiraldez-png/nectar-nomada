# Draft ADR-050 — R1: RoastSession and structured sensory descriptor/defect taxonomy

**Status:** DRAFT — not yet appended to `docs/architecture/DECISIONS.md`.
Per `docs/implementation/33_R1_ROASTSESSION_TAXONOMIA_SENSORIAL.md` §5's
explicit instruction: same marker convention F1/S1 used, so this doesn't
become a fourth orphan. Confirmed next available number: `DECISIONS.md`'s
last entry is ADR-049 (S1), so this drafts as **ADR-050**.

---

## Context

`docs/implementation/29_BRECHAS_OPERACION_FINCA_INVESTIGACION_MIGRACION.md`
§7a and `17_`'s Part C finding 4 named two gaps that need each other: no
typed record of *how* a coffee was roasted, and no structured vocabulary
for *what* was perceived beyond a plain number. The case that unifies
them is real: the same coffee roasted by different roasters on different
equipment, cupped side by side — the roaster is a variable of the
experiment, not just an actor, and a judge's "off-flavor, confianza
media, defecto de familia DMS" has nowhere to go but unstructured
comment text today, despite the platform's own Reference Standards &
Calibration system existing specifically to make that observation
precise and comparable.

## Decisions

### §1.3 — Roast curve: reuse `Measurement`, not a new time-series table or a file reference

Three options were on the table: discrete points, a dedicated time-series
table, or an opaque reference to the roaster's own equipment export.
**Decision: discrete points via the existing `Measurement` entity**
(`Measurement.roastSessionId`, additive, matching the exact per-parent-
table pattern already established for `fermentationRunId`/`dryingRunId`/
`storageAssignmentId`). First/second crack get real columns on
`RoastSession` itself (`firstCrackAt`/`secondCrackAt`) since every roast
log tracks those two checkpoints regardless of equipment; every other
curve point (bean/air temperature over time) is an ordinary `Measurement`
row. A dedicated time-series table was rejected as unbuilt machinery for
data volume this ticket has no evidence needs it (a roast produces tens
of points, not the sensor-frequency volumes `Measurement`'s own
architecture note reserves for a future partitioned table). An opaque
equipment-file reference was rejected because it would make the curve
unqueryable from within the platform — exactly the kind of "structured
information trapped as an attachment" problem this ticket exists to
avoid on the sensory side.

### §1.3 — Equipment: free text, no new entity

`RoastSession.equipmentNote` stays free text, matching
`FermentationRun.vesselNote`'s own precedent exactly.
`18_EQUIPMENT_AND_READINESS_PROMPT_REVISED.md` remains unbuilt (still
V2); building an `Equipment` entity now would be scope invented ahead of
being asked for, the same discipline this codebase has applied
consistently (F1 declined a `Species`/`Cultivar` taxonomy for the same
reason).

### §1's structural pattern — one `RoastSession` per execution, not the split-with-many-outputs shape reused directly

`RoastSession` follows FermentationRun/DryingRun's principle (an
execution record hanging off `LotTransformation` via a dedicated FK) but
not their exact two-call start/end shape, and not the already-verified
`split` transformation's exact shape either. Roasting is short and its
real capture point — every §4 scenario describes it — is "log the whole
session once it's done," so `recordRoastSession` is one call, matching
`HarvestEvent`'s own precedent for a short, bounded activity. Three
roasters roasting the same green lot three ways is recorded as three
separate `stage_change` `LotTransformation`s sharing the same input lot,
rather than reusing the verified `split`-with-three-outputs shape (§1.1)
directly — each roast is a genuinely separate execution the
one-`roastSessionId`-per-transformation FK can't express if they shared
one transformation row. This produces the identical queryable DAG either
way: `getLotLineage`'s recursive CTE follows
`lot_transformation_input`/`output` edges generically, indifferent to
whether three children came from one transformation row or three. `§1.1`'s
own "eso no se toca" instruction is honored — the generic split mechanism
itself is untouched; this ticket simply doesn't use it for this specific
case.

### §2 — One unified descriptor/defect table, matching the already-designed shape

`BEVERAGE_SENSORY_PROTOCOLS.md`'s defects-taxonomy section already
specified the shape (`sensory.honey_descriptor(id, family,
specific_descriptor, expected_perception, classification [positivo|
neutral|defecto], technical_cause nullable)`) — `SensoryDescriptor`
implements it as written, not redesigned into separate Descriptor/Defect
tables. A descriptor belongs to a `SensoryProtocolVersion`, the same
versioning discipline `SensoryAttribute` already follows. Confidence is a
new, separate axis on `SensoryDescriptorResponse` (nullable
low/medium/high) — additive alongside the existing numeric
`AttributeResponse` and `Assessment.comment` free text, never a
replacement for either.

### §2.3 — Real content only for honey; no fabrication for coffee/beer/mead

Loaded the real, product-owner-authored three-tier taxonomy (12 positive
families, 2 neutral, 6 defect families each with a real technical cause)
from `BEVERAGE_SENSORY_PROTOCOLS.md`'s current, non-superseded version —
unconditionally seeded in `prisma/seed.ts`'s `seedBeverageProtocolsContent()`
(reference content, same category as the honey rubric/attributes already
seeded there, not `SEED_DEMO_CONTENT`-gated placeholder data). Coffee,
beer, and mead get no descriptor rows, since no real vocabulary exists
for them yet — the ticket's own instruction ("el contenido ya está
escrito — no lo inventes") applies equally to not inventing content for
domains where nothing has been written.

### §2.4 — Existing evaluations: nothing to migrate

Checked live against Neon: `core.Assessment` currently has zero rows in
the shared database. There is nothing to leave alone or flag for human
review yet. The policy for when real evaluations do start accumulating
stands as the ticket states it: never auto-convert free text into
structured descriptors (inferring structure from prose is exactly the
kind of inference `AI_GOVERNANCE.md`/`CLAUDE.md` §3's provenance
discipline prohibits) — leave existing free-text comments as-is, and
optionally flag them as human-review candidates if a future ticket wants
to backfill structure with actual evaluator confirmation.

## Consequences

- Terroir-to-roast-to-cupping correlation (the platform's own falsifiable
  v1 test, ADR-039) gains one more real link: a roast profile is now a
  queryable fact, not a lot-code-and-notes guess.
- `getAltitudeRange`-style non-invention discipline extended to roasting
  and sensory: no roast-quality inference, no auto-tagged descriptors, no
  fabricated defect causes for domains without real content.
- Two pre-existing gaps were found while building this ticket, unrelated
  to R1's own scope, and spun off as separate background tasks rather
  than folded into these commits: `Measurement.fermentationRunId`/
  `dryingRunId`/`storageAssignmentId` existed as schema columns since
  T6/T7/T8 but were never actually wired through `recordMeasurement`
  (only `roastSessionId`, added by this ticket, was); and
  `FermentationRun`/`DryingRun`'s start/end functions were missed by C1
  §3's audit-trail pass and still record no `AuditEvent`.
- `~150-300` real coffee `Specimen` rows and the real broca traps (F1's
  own open item) remain independent of this ticket's own open item: no
  real `RoastSession` or `SensoryDescriptorResponse` data was loaded,
  since none was supplied — the mechanism is proven by tests only,
  against real Neon, the same way F1 and S1 proved their own mechanisms
  before real field data existed to load.
