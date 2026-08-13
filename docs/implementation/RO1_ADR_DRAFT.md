# Draft ADR-051 — RO1: Research OS schema, PE-protocol variable modeling, statistical discipline

**Status:** DRAFT — not yet appended to `docs/architecture/DECISIONS.md`.
Per `docs/implementation/34_RO1_RESEARCH_OS.md` §10's explicit instruction:
same marker convention F1/S1/R1 used, so this doesn't become a fifth
orphan. Confirmed next available number: `DECISIONS.md`'s last entry is
ADR-050 (R1), so this drafts as **ADR-051**.

---

## Context

`29_BRECHAS_OPERACION_FINCA_INVESTIGACION_MIGRACION.md` §8 and the `17_`
audit (hallazgos 18 and 22) named the same gap twice: more than thirty PE
post-harvest protocols at Cafelino run real, controlled experiments —
isolated variables (water source, yeast, fermentation orientation, bag
position, volume, bed level), a declared control, one un-replicated run
per treatment — with nowhere to live. `Protocol`/`ProtocolVersion` generic
was never built (only Sensory's own specific version exists), and every
variable today lives as prose in a single `Comentarios` column ("GrainPro
Bag, Spontaneous Wild, vertical position 28 cm height cherry mass" — three
variables mixed in free text, unqueryable).

## Decisions

### §2 — `Recommendation` naming collision

The AI Layer already has a `Recommendation` model (Slice 7, `ai` schema:
`suggestionType`/`model`/`confidence`/`reviewer`) with an unrelated shape.
**Decision: the Research OS entity is named `ResearchRecommendation`**,
matching this chain's own `ResearchProgram`/`ResearchQuestion` prefix
rather than bolting "Research" on awkwardly elsewhere. The two models
never reference each other and share no fields beyond the English word.

### §3a — Catalog versus closed-enum, per variable, not guessed

The product owner decided, per variable, which of two shapes applies —
**respected exactly, not converted either direction**:

- **Catalog** (Recipiente/equipo de fermentado, Levadura/cultivo, Método de
  inoculación, Grado de proceso, Cuarto de secado): a named
  `VariableCatalog` + `VariableCatalogValue` rows, extendable by **insert,
  never migration** — the same data-not-schema pattern `RBAC.md` §2
  already proves for Role Profiles. `addVariableCatalogValue` is the
  mechanism; `lib/research/catalogs.ts` seeds the real starting values
  (matching `lib/rbac/catalog.ts`'s own seed-managed convention).
- **Closed enum** (Fuente de agua, Posición de masa): fixed, small,
  product-owner-confirmed vocabularies that genuinely aren't expected to
  grow. Stored as `ProtocolVariable.enumValues` (a native array), frozen
  at creation — changing the set means a new `ProtocolVersion`, not
  editing the row, the same immutability every other field on a version
  already has.

A generic `ProtocolVariableValueType` enum (`text | numeric | boolean |
catalog | closed_enum`) carries the distinction at the schema level;
`createProtocolVersion` validates that a `catalog` variable has a
`catalogId` and a `closed_enum` variable has non-empty `enumValues`,
rejecting the row otherwise.

### §3a-bis — Catalog value `definition` and `alias`, both optional

Every `VariableCatalogValue` gained two fields, applicable across every
catalog: **`definition`** (optional — required would slow field capture;
available because it standardizes language over time, the same reasoning
`SensoryDescriptor.expectedPerception`/`technicalCause` already proves for
R1's tasting vocabulary, applied here to process variables instead) and
**`aliasOfId`** (optional, self-referential, one level — an alias points
directly at its canonical row, never chains through another alias).

The real case the alias mechanism exists for: honey-by-color (`black
honey`, `red honey`, `yellow honey`, `light honey`) and semi-wash-by-
percentage (`Semi Wash 75%`, `50%`, `25%`) may name the same underlying
process (how much mucílago remains). **Deliberately not pre-linked in
`lib/research/catalogs.ts`'s seed data** — the ticket's own instruction is
explicit ("verificála con él en vez de asumir el mapeo de porcentajes a
colores"). The mechanism (`setVariableCatalogValueAlias`,
`compareTreatmentBatchesByVariable` resolving through `aliasOfId` before
diffing) is built and tested (§9.5) against a placeholder pair; the real
color-to-percentage correspondence is a **product-owner decision, not
assumed here** — flagged in this ADR's Consequences below.

### §3a — "Spontaneous Wild" is a `dataQuality` signal, not an organism name

`Spontaneous Wild` is absence of a known strain, not a cultivar — recording
it as an identified organism would assert knowledge nobody has (the same
distinction `23_RECIPES_FORMULATION_AND_DISTILLATION.md` §5c already
established for spontaneous fermentation/consortia). `VariableCatalogValue
.impliesUnknownIdentity` marks values like this one; when a treatment picks
one, `TreatmentBatchVariableValue.dataQuality` is **required** by
`createTreatmentBatch`'s own validation — never silently defaulted.

### §3a — Bed level is interpreted against its room, not stored as a bare number

A bed level alone doesn't say how much light a lot received — that depends
on which room. The solar room has 3 levels with light; the dark room has 6
levels with none. **Decision:** the drying room is a `Location` (reusing
F1's own exposure-attribute pattern) carrying `dryingRoomLightExposure`
and `dryingRoomBedLevelCount`; `ProcessingStage.locationId` records which
room a given stage ran in. `getBedLevelContext(processingStageId,
protocolVariableId)` resolves a numeric "nivel de cama" value against that
stage's room, so "level 1" in the solar room and "level 1" in the dark
room are never conflated (§9.8's own test).

### §4a/§4b — Declared control, and the no-replication discipline

**Control:** `Experiment.controlTreatmentBatchId` — declared, never
inferred, and validated to belong to a `TreatmentBatch` under that same
Experiment (`declareControlTreatmentBatch`).

**No replication:** every PE treatment runs once. The platform can say
"this treatment scored 87, the control scored 84" — it can never say "this
treatment produces on average 3 points more." **Decision:** `Conclusion`
gains `provenanceClass` (required, ADR-038 pattern) and `isComparative`
(boolean). `createConclusion` rejects `isComparative: true` paired with
`provenanceClass: "measured_fact"` — a single un-replicated run can never
earn measured-fact certainty about a *difference* between treatments. This
is the same `Evidence → EvidenceClaim → Interpretation → Conclusion` chain
`DOMAIN_MODEL.md` §4 already specifies, with one real enforcement point
added where the ticket's own statistical discipline required it.

### §4d — Bioprotection is constitutive of the method, not a free variable

MP72 and HDA54 are recommended strains for bioprotection during cold hold
prefermentativo (colonize without fermenting or transforming, washed out
before the next stage — mechanistically distinct from a fermentation
yeast). **Decision:** which strain is used is a catalog-typed
`ProtocolVariable` value *within one `ProtocolVersion`* — MP72 vs. HDA54 is
comparison inside the method, not two protocols. A future "no
bioprotection" control-negative run is the same `ProtocolVersion` with a
different (or absent-marked) catalog pick, not a new protocol. No schema
addition was needed here beyond the catalog mechanism §3a already builds.

### §4e/§4f — CryoBloom is a method, and experiments have lineage

Multiple PEs (PE-79/80, PE-97/98) ran the **same** prefermentative
protocol — only the strain varied, confirmed not a version change.
**Decision:** "all treatments that used CryoBloom" is answered as "all
`TreatmentBatch` rows under that one `ProtocolVersion`" — no marker field,
`ProtocolVariable.isControlled` (already built) is what distinguishes a
deliberately-varied factor from a protocol constant.

Separately, the six prior trials that led to experiments A/B/C are
**scientific derivation**, not a physical Lot split — deliberately modeled
apart from the Lot lineage DAG. `Experiment.derivedFromExperimentId` +
`derivationNote` (self-referential, declared via
`declareExperimentLineage`) record which experiment's findings shaped the
next design, and why.

### §4g — Declared limits are part of the record, not a separate document

The product owner's reference card names what isn't measured yet
(β-glucosidasa, GC-MS, LC-MS, comparative pH/°Brix, quantitative
microbiology, calibrated-panel formal cupping) as the honest boundary of
what the method can currently claim. **Decision:**
`Experiment.declaredLimitations` (free text, the product owner's own
wording, not forced into an invented checklist enum), set via
`updateDeclaredLimitations` and read back alongside the experiment's
results (`getExperimentDetail`).

### §3b — Cherry-study vocabulary: new infrastructure, not `SensoryDescriptor`

The "Estudio de cerezas" sheet's controlled vocabulary (Selección,
Flotado, Condición visual, Limpieza, Color, Firmeza, Densidad-bracket,
Tamaño/forma, Defectos de grano) is the same *shape* as R1's
`SensoryDescriptor`/`SensoryDescriptorResponse` — vocabulary controlled by
attribute, versioned under a protocol. **Evaluated and rejected as a
direct reuse**: `SensoryDescriptorResponse` is structurally coupled to
`Assessment` → `BlindSample` → a judging session context, and a
pre-processing cherry inspection has none of those — there is no judge, no
blind code, no session. **Decision:** reuse the *mechanism* §3a already
builds (`VariableCatalog`/`VariableCatalogValue`) instead of a third
parallel system. A new join table, `ProcessingStageObservation`, records a
categorical pick against a `ProcessingStage`. Brix, peso inicial, and
densidad-as-decimal stay ordinary `Measurement` rows (`MeasurementVariable`
already has `"brix"`) — only the genuinely categorical attributes went
through the catalog/observation path. Real content: only 2 of 6 rows in
the source sheet have values (Brix 17.53 pacamara lote 11, Brix 18.5
Geisha lote 10) — preserved as a template in incipient use; empty cells
are `missing_source_record`, never zero or estimated.

### §3b — How `ProtocolVersion` declares its required measurements

`ProtocolRequiredMeasurement` is either a numeric `MeasurementVariable`
reference (`variable` set, `catalogId` null — Brix/pH/humedad/peso/
densidad) or a categorical `VariableCatalog` reference (`catalogId` set,
`variable` null — the cherry-study picks), each paired with
`atProcessingStage` (free text, matched by string equality against
`ProcessingStage.name`). `completeProcessingStage`
(`lib/research/treatments.ts`) is the enforcement: it refuses to close a
stage until every required measurement/observation for that stage's name
has a corresponding `Measurement` or `ProcessingStageObservation` row —
"el sistema sabe qué medir" is this function, not a comment (§9.14).

### §5 — What got no screen

Per the ticket's own explicit scope, UI was built only for: create/version
a protocol with its catalog/enum/numeric variables and required
measurements; list/filter protocols by variable; execute a protocol
against a lot (`TreatmentBatch` + staged measurements); view a treatment's
results including its sensory linkage.

**No UI for:** `Publication`, `AnalysisPlan`/`AnalysisRun`/`AnalysisResult`,
`Deviation`/`CorrectiveAction`, `Approval`, the `Interpretation` →
`Conclusion` → `ResearchRecommendation` chain, control declaration,
experiment lineage, or declared limitations. All of these have real
schema and RBAC-checked, audited service functions
(`lib/research/programs.ts`, `evidence.ts`, `analysis.ts`,
`researchActivity.ts`) — callable from a script or a future screen without
redesign — deliberately not screen-connected, matching "el esquema existe;
las pantallas llegan cuando se usen."

### §6 — `RESEARCH_ACTIVITY_CRITERIA.md` support, not enforcement

Built: the `ResearchActivity` model (`isPaid`,
`researchQuestionStructured`, `complianceStatus`, `publicListingCopy`,
`consentFormCopy`, `languageFlagStatus`), the **Research Compliance
Reviewer** Role Profile (`research_activity:review`, deliberately excluding
`research:approve_protocol`/`execute_protocol` — this role reviews whether
an activity qualifies as research, it doesn't run research), and the
no-self-review rule enforced in code
(`canReviewResearchActivity` — structural, not just a permission grant,
the same mechanism `RBAC.md` §7 uses for blind-judge restrictions). **Not
applied**: no CryoBloom/gastro-tourism activity was reviewed against the
five-part test — that is `RESEARCH_ACTIVITY_CRITERIA.md` §9's own human
review, explicitly out of this ticket's scope.

## Consequences

- **Open, not resolved:** which honey-color name is genuinely equivalent
  to which semi-wash percentage. The alias mechanism is built and tested;
  the actual mapping needs the product owner's confirmation before any
  real catalog rows are linked with `setVariableCatalogValueAlias`.
- **Open, not resolved:** what the PE-77…PE-112 numbering itself encodes
  beyond lineage (`Protocol.externalIdentifier` stores it verbatim,
  `identifierConvention` is a free-text slot for the explanation once
  given).
- **Deferred by design, not oversight:** Publication, AnalysisPlan/Run/
  Result, Deviation/CorrectiveAction, Approval, and the Interpretation →
  Conclusion → ResearchRecommendation chain have no UI. Building it is a
  future ticket, triggered by actual use, not spec-completeness.
- **No PE data was imported.** The real CSVs live with the product owner,
  not in this repository; §7's field-mapping report (README) states what a
  clean PE-protocol CSV import would need and what's still unknown before
  writing it. No importer exists.
- **CryoBloom source material classification is named, not applied.** The
  product owner's CryoBloom presentation/protocol/Q&A/reference card carry
  an explicit "personal use, do not distribute" notice — if loaded, it must
  be `internal`, never `public` (`03_CRYOBLOOM_PUBLIC_CONTENT_PROMPT.md`'s
  existing discipline). Not loaded in this ticket.
