# Draft ADR-049 — S1: external coffee (cupping without a full traceability chain)

**Status:** DRAFT — not yet appended to `docs/architecture/DECISIONS.md`.
Per `docs/implementation/32_S1_CAFES_EXTERNOS.md` §10's explicit instruction:
same marker convention F1 used, so this doesn't become a fourth orphan.

**Numbering note:** `DECISIONS.md`'s last *appended* entry is still ADR-047
(T12.5 Asset provenance) — on disk today, 048 is technically free. But
`docs/implementation/F1_ADR_DRAFT.md` already claims **ADR-048** and is
itself still un-appended. This draft claims **ADR-049** to avoid colliding
with it. Whichever of the two gets appended first: re-check the other
draft's claimed number before appending the second one — if F1 lands as
048, this one is 049 as planned; if this one somehow lands first, F1 keeps
048 and this one must NOT silently take it.

**Session note (read before appending):** three drafts have now sat
unappended in this codebase before being caught by a later audit —
`T12.5_ADR_DRAFT.md`, `ADR-037_DRAFT.md` (both fixed by C1 §2), and as of
this session, F1's own draft is still pending. Don't let this be a fifth.

---

## Context

`docs/implementation/32_S1_CAFES_EXTERNOS.md`. The platform's entire
traceability model assumes a `Sample` comes from a `Lot` via
`sample_extraction`. Real operation breaks that assumption constantly: a
client or contact hands over a coffee with only a farm name, a declared
varietal, a declared process, and a harvest year or month — no terrain
lot, no transformation chain, no measurements. It gets cupped anyway, and
that score is valid. This ticket builds the schema and service layer for
that case — no UI, matching F1's own "specify now, build the interface
later" precedent.

## Decisions

### §3 — `Sample` without a `Lot`, not a minimal `Lot`

Two structural options were on the table: (a) create a minimal `Lot` row
carrying only what's known, with `Sample` continuing to extract from it as
always; (b) let `Sample.sourceLotId` stay null and give `Sample` its own
declared-origin metadata directly.

**Decision: (b).** Evidence, not preference, decided this:

- `Sample.sourceLotId` is *already* nullable — T5's own schema comment
  states explicitly that DEMO Sensory/Competitions samples predate the
  `Lot` model and correctly carry `null` lineage, "never backfilled with a
  guess."
- `prisma/seed.ts`'s `seedDemoCuppingSession` already creates `Sample` rows
  directly with no `Lot`, and those samples already flow through the full
  real pipeline — `SensorySession` → `SensoryFlight` → `SensoryBlindSample`
  → `SensoryBlindMapping` → `Assessment`/`PanelResult` — with zero special
  casing anywhere in that chain. Every function along that path
  (`getSensoryLinkageForSamples` included) operates on `sampleIds` alone;
  none of it reads `sourceLotId`.
- A minimal `Lot` (option a) would have looked like a normal, traceable Lot
  everywhere except in the fine print of its own provenance fields — the
  exact confusion §3's own risk note warns about ("un `Lot` sin
  trazabilidad parece un `Lot` normal salvo que la procedencia lo diga
  claramente"). Option (b) makes the absence of a chain structurally
  visible (`sourceLotId IS NULL`) rather than something you'd only notice
  by reading every field closely.

New model `ExternalCoffeeOrigin`, 1:1 with `Sample` via a unique
`sampleId` FK, rather than adding these columns directly to `Sample` —
`Sample` already serves Sensory, Competitions, and Partner Workspace
uses that have nothing to do with coffee origin declarations; a
coffee-specific origin table keeps that generic table generic.

### §1 — producer, processor, brand: three independently nullable Organization FKs

`producerOrganizationId`, `processorOrganizationId`, `brandOrganizationId`
— the worked example is real: Agustín Gómez's Geisha, processed at
Cafelino's beneficio, presented under Néctar Nómada's own brand. None of
the three implies the others, and any one, two, or all three may be known.
Enforced in the service layer, not the schema, that at least one is
present (`recordExternalCoffeeSample` throws `at_least_one_organization_
required` otherwise) — a DB CHECK across three nullable FKs was considered
and rejected as unnecessary machinery for a rule the service layer already
owns everywhere else in this codebase (F1's `Specimen.sectorSimple`/
`gridRow` "at least one, not enforced as XOR" is the direct precedent).

Not limited to genuinely external coffee — §1's own text: "es el modelo
correcto para cualquier café donde producción y procesamiento se separan."
A `Lot`-backed `Sample` could carry an `ExternalCoffeeOrigin` too if that
need ever arises; today only the `Lot`-less path populates it, since
that's the actual gap this ticket closes.

### §2 — declared, not observed; dataQuality per fact, not per record

One `declaredProvenanceClass` for the whole declared bundle
(`manufacturer_specification` or `interpretation`, required, chosen at the
action layer — ADR-038's exact pattern, no default, no silent
`direct_observation`/`measured_fact` fallback).

**dataQuality is per field, not per record** — `varietalDataQuality`,
`processDataQuality`, `harvestWindowDataQuality` are three independent
columns, not one. §2's own calibration note is why: "la finca suele ser
confiable, el proceso a veces lo declara quien vende, y el varietal es lo
que más frecuentemente viene mal." Collapsing that into a single
record-level dataQuality would erase exactly the distinction the ticket
asks to preserve — two years from now, "this whole record is somewhat
reliable" tells you nothing about which specific fact to distrust.

Any declared value requires its own dataQuality — `varietal: "Geisha"`
with no `varietalDataQuality` is rejected (`requireDataQualityIfValuePresent`)
rather than silently left unrated.

### §4 — harvest window: never fabricate a day

`harvestWindowPrecision` (`year`/`month`/`date`) is authoritative;
`harvestYear`/`harvestMonth`/`harvestDay` are validated against it
(`validateHarvestWindow`) so "cosecha 2025" can never silently become
"2025-01-01." Considered and rejected: a single `harvestWindowStart`/
`harvestWindowEnd` date-range pair — computing an implied range from a
year-only or month-only declaration (Dec 31 vs. Jan 1, days-in-month) adds
calendar-arithmetic surface area for a display/query convenience nothing
in this ticket's scope actually needs yet, and risks the exact fabricated-
precision problem §4 explicitly warns against (an inferred boundary looks
like a real date to anything reading the column later without also
reading the precision field). The three explicit nullable integer columns
plus the precision enum are honest about exactly what's known and nothing
more.

### §5 — classification and ownership: no new mechanism needed

`Sample.classification` already defaults to `internal`; `createdBy` is
already the creating `UserAccount`. §5's "nace internal, tuyo" and
"compartir es permiso explícito por caso, vía Assignment" both fall out of
mechanisms that already exist and needed no schema change:

- There is no `organization` `ScopeType` in this codebase (`lib/rbac/
  types.ts` lists exactly platform/program/project/location/competition/
  session/experience) — linking `producerOrganizationId` at a coffee
  therefore grants that organization's members *nothing*. Access is
  purely Assignment-based, same as every other record in the platform;
  an `Organization` FK on a record has never been a scope-granting
  mechanism here, and this ticket doesn't add one.
- §9.2's own test confirms this by construction: three distinct
  organizations attached to one `ExternalCoffeeOrigin` row, queryable
  independently, with no access implication attached to any of them.

### §6 — completing a record later: dated-knowledge fields, not versioning

**Recommendation: per-fact `*KnownAt` timestamp columns, not row
versioning** (the same choice this ticket's §6 explicitly asked to be
made with reasoning, mirroring F1's own §6 microlot-rules precedent of
being asked to decide rather than assume).

Reasoning: this codebase's existing versioning machinery
(`SensoryProtocolVersion`, and CLAUDE.md §3's "Version preservation"
principle generally) exists because *other* approved artifacts pin a
reference to a specific version — a `CompetitionResult` or a
`SensorySession` names the exact `ProtocolVersion` it was scored against,
and that reference must keep resolving to the same content forever.
Nothing in this schema, or plausibly ever, points at "this
`ExternalCoffeeOrigin` as of version 3" — there is no downstream consumer
that needs an old version to keep resolving. Building parallel version
tables (`ExternalCoffeeOriginVersion`) for an entity with no pinned
references would be machinery with no consumer.

A per-fact `knownAt` column answers the actual question §6 asks —
*"completar no puede parecer que se sabía desde el principio"* — directly:
`varietalKnownAt`/`processKnownAt`/`harvestWindowKnownAt` each record when
that specific fact was learned, stamped to `now()` only when that
specific field is newly set or genuinely changes
(`completeExternalCoffeeOrigin`'s `varietalChanged`/`processChanged`/
`harvestWindowChanged` guards — completing the process doesn't touch the
varietal's own timestamp). `§9.5`'s test proves this: completing one field
leaves an untouched field's `knownAt` bit-for-bit identical to what it was
at creation.

§6's other named example — linking the real `Lot` once traced —
`completeExternalCoffeeOrigin(..., { linkToLotId })` sets
`Sample.sourceLotId` without deleting or clearing the
`ExternalCoffeeOrigin` row. How a record started (declared, not traced)
stays true history even after the gap closes — the same "never silently
mutate away evidence of a prior state" instinct behind every audit-trail
decision already made in this codebase (C1 §3).

### §8 — Lost Origin

Real organization (`organization_type: laboratory`), created directly
against Neon via a one-time script — matching A7/F1's own precedent for
loading real, named entities (never through `prisma/seed.ts`'s DEMO gate,
which is reserved for fictional placeholder content per CLAUDE.md §54).
Id: `f18965bd-46cc-459b-a469-3732442218ee`.

## Consequences

- RBAC reuses `sample:manage` exactly as `createSampleFromLot` (T5)
  already does — no new permission. A `projectId`/`locationId` passed at
  creation scopes the record the normal way; omitting both falls back to
  platform scope via the existing `scopeTargetsFor()` helper (same
  fallback `Lot` itself uses).
- §7's out-of-scope list stands as written: no UI, no third-party
  self-submission form, no CSV importer, no cross-organization data-
  sovereignty resolution (deferred to whenever that gets designed, per
  `29_`'s own note).
- Real per-lot Cerro Azul attribute data (F1's own open item) and this
  ticket's own real external-coffee content are independent gaps — this
  ticket did not load any real external-coffee samples, since none were
  supplied; the mechanism is proven by tests only, exactly as F1 proved
  its own mechanism before real field data existed to load.
