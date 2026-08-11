# Equipment, Instrument Calibration, Consumables & Maintenance — architecture pass

**Planning only.** No code, no schema, no migrations. Produce one
architecture document and a decisions list, following the same pattern as
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` and `GUIDED_FIELD_STUDY_TOOL.md`.

**This is v2.** It must not enter v1, T11–T14, or any current ticket. The
v1 boundary is the harvest test (`13_DEFINE_PLATFORM_V1_PROMPT.md`); nothing
here is required to pass it. Specify now so nothing needs redesigning later
— the same reason the other planning documents exist.

---

## 1. Required reading

- `DOMAIN_MODEL.md` §3–4 — canonical entities; note `Equipment/Calibration`
  is *named* in the Research OS chain and never specified
- `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` — especially §4 (`material.*`) and
  §7 (client-site access)
- `DATA_ARCHITECTURE.md` §4 — provenance and `data_quality` vocabulary
- `BEVERAGE_SENSORY_PROTOCOLS.md` §7 — the existing calibration system
- `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §G, and `DECISIONS.md`
  ADR-020 decision 6 — inventory separation
- `COMPETITIONS.md` §4c — the existing supply checklist
- `RBAC.md` §3, §6

## 2. Reuse before creating — what already exists

- **`material.vessel`** already has an `available | in_use | retired`
  lifecycle for barrels, cubes, and staves. That is equipment-shaped.
  Determine whether vessels are a *subtype* of Equipment or stay separate,
  and justify either way — do not silently build a parallel concept.
- **`core.asset`** already stores documents. Manuals, spec sheets, and
  calibration certificates attach to Equipment via Asset; no new document
  store.
- **`provenance_class` already includes `manufacturer_spec`** — the
  vocabulary anticipated equipment documentation before anything was
  designed for it. Use it.
- **`COMPETITIONS.md` §4c `supply_checklist_item`** is a small,
  competition-scoped supplies concept. Decide whether consumables
  generalize it or stay separate.

**Naming collision, mandatory to resolve:** `CalibrationSession`,
`CalibrationResult`, and `EvaluatorSensitivityProfile` already exist and
mean **panel calibration** — training and validating human evaluators
(ADR-035, built). Instrument calibration is a different concept and must
use different terms. Propose them explicitly; do not overload the existing
names.

## 3. Priority 1 — Instrument calibration, and its link to provenance

This is the piece with real consequence, and the reason this document is
worth writing now rather than later.

A moisture reading recorded as `provenance_class = 'measured_fact'` from a
refractometer that is out of calibration **is not a measured fact.** The
`data_quality` axis already carries `verified`, `verified_with_limitation`,
and `provisional` (`DATA_ARCHITECTURE.md` §4) — an instrument's calibration
state is precisely what should drive those values, derived rather than
depending on a human remembering.

Specify:

- The instrument entity: identity, type, location/site, ownership, current
  calibration state, calibration interval, responsible person.
- The calibration event: when, by whom, against what reference, result,
  next-due date, and the certificate as an `Asset`.
- **How a `Measurement` links to the instrument that produced it** — and
  whether that link is required or optional. Note that T1–T10's
  `Measurement` currently has no instrument reference at all; adding one is
  a real change to an existing table, so state the migration implication.
- **The derivation rule**: how an instrument's calibration state at the
  time of a measurement affects that measurement's `data_quality`.

Two genuine product decisions to raise, not silently resolve:

1. **Does an out-of-calibration instrument block a measurement, or
   downgrade it?** Blocking is stricter but will be worked around in the
   field; downgrading is honest but permits accumulating weak data.
   Recommend one, with reasoning.
2. **What happens retroactively when an instrument is found out of
   calibration?** Every measurement since its last good calibration is now
   suspect. The platform's rule is that evidence is never silently
   relabelled (`DATA_ARCHITECTURE.md` §4, `AI_GOVERNANCE.md` §6) — so
   propose a mechanism that flags affected measurements for human review
   without rewriting their recorded values or provenance in place. This is
   the hardest design question in this document; treat it as such.

## 4. Priority 2 — Consumables and par stock

A **third** inventory concept, distinct from Commerce SKU inventory (built)
and operational lot inventory (ADR-020 decision 6, deliberately separate).
Reagents, filters, gloves, jars, lids, labels, hive frames, foundation,
treatment products.

Specify: item definition, unit of measure, par level, current on-hand,
in/out movements, low-stock signal, and per-site stock (the same consumable
at three sites is three balances, not one).

Follow the existing separation discipline — these are consumed by
operations and never sold, so they do not belong in Commerce's tables.
State the boundary explicitly, as ADR-020 decision 6 did.

## 5. Priority 3 — Maintenance

Scheduled and unscheduled maintenance on equipment: what was done, when, by
whom, cost if tracked, next due.

**Dependency to flag, not solve:** due-date signalling needs the
`Notification` entity, which is specified in `DOMAIN_MODEL.md` §5 and not
built. It is the same unbuilt dependency blocking the tourism waitlist
claim window, recurring field-study reminders, and Alert delivery. Note the
convergence; do not design a bespoke reminder mechanism here.

Keep this deliberately thin. See §8.

## 6. Priority 4 — Manuals and equipment records

Assets attached to Equipment, with `provenance_class = 'manufacturer_spec'`
for vendor documentation. Should be the shortest section in the document.

## 7. Scope: instruments and processing equipment; partner sites included

**In:** measuring instruments (refractometers, pH meters, scales, moisture
meters, thermometers, data loggers) and processing equipment (pulpers,
fermentation vessels, dryers, extractors, brewing and packaging equipment,
apiary tooling).

**Out:** facilities themselves, vehicles, and buildings. Note them as a
possible later extension; do not model them.

**Partner and client sites are in scope.** This inherits the access pattern
already established in `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §7 — each
client engagement is its own Project, equipment at a client site carries
`classification = partner` (or `confidential`), and leaf-scope containment
(`RBAC.md` §3) already guarantees a client cannot see another client's
equipment. Confirm this holds without new permission machinery; if it
doesn't, that is a finding worth stating.

## 8. Scope discipline — what this is not

This is **not** a CMMS or a LIMS. Explicitly out of scope, named so they
don't creep in: work-order routing and approval chains, meter- or
runtime-triggered preventive maintenance, spare-parts inventory with
reorder automation, vendor and purchase-order management, depreciation and
asset accounting, technician scheduling and labour tracking.

Every architecture review in this set names scope creep as the top
practical risk for a solo maintainer. Design the smallest thing that makes
instrument calibration trustworthy and consumables visible.

## 9. Deliverables

`EQUIPMENT_AND_CALIBRATION.md`, structured like the other planning
documents: what it fills, entities with field sketches, how it reuses
existing infrastructure, access/RBAC, sequencing, and — separately — the
decisions genuinely requiring product-owner input, including the two named
in §3.

End with a sequencing note placing it in v2 relative to Research OS, since
`Equipment/Calibration` sits inside that chain in `DOMAIN_MODEL.md` §4, and
a line for `DECISIONS.md` logging it as accepted planning input, not a
build order.
