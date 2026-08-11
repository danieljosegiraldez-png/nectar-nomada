# Equipment, Instrument Calibration, Readiness & Consumables — architecture pass (REVISED)

**Supersedes `18_EQUIPMENT_AND_CALIBRATION_PROMPT.md`.** That version modelled
equipment as static and treated maintenance as a scheduling concern. Both were
wrong. Commit this over it.

**Planning only.** No code, no schema, no migrations. Produce one architecture
document plus a decisions list, following the pattern of
`SPECIMEN_AND_MATERIAL_TRACEABILITY.md` and `GUIDED_FIELD_STUDY_TOOL.md`.

**This is v2.** It must not enter v1, T11–T14, or any current ticket. Specify
now so nothing needs redesigning later.

---

## 1. Required reading

- `DOMAIN_MODEL.md` §3–5 — note `Equipment/Calibration` is *named* in the
  Research OS chain and never specified; note `Notification` (§5) is
  specified and unbuilt
- `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §4 (`material.*`) and §7 (client sites)
- `DATA_ARCHITECTURE.md` §2 and §4 — versioning, provenance, `data_quality`
- `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F, §G, §T; `DECISIONS.md` ADR-020
- `BEVERAGE_SENSORY_PROTOCOLS.md` §7 — existing *panel* calibration
- `COMPETITIONS.md` §4c; `RBAC.md` §3, §6

## 2. Reuse before creating

`core.asset` already stores documents — manuals and certificates attach via
Asset. `provenance_class` already includes `manufacturer_spec`. `material.vessel`
already exists for barrels and staves; decide whether vessels become a subtype
of Equipment or stay separate, and justify it rather than building a parallel
concept silently.

**Naming collision, mandatory:** `CalibrationSession` / `CalibrationResult` /
`EvaluatorSensitivityProfile` exist and mean **panel** calibration — validating
human evaluators (ADR-035, built). Instrument calibration needs different terms.
Propose them; do not overload.

## 3. Equipment is mobile — custody is an event chain, not a column

Real behaviour to model: a beekeeper carries a smoker and harvest tools from one
apiary to another; a fermenter stays at one beneficio for years; an instrument is
purchased centrally, deployed to a farm project, then transferred elsewhere.

**A mutable `location_id` cannot express this.** It loses "where was this in
March," "who had it last," and "did it come back." Model transfer as an
append-only event, the same discipline as `lot_transformation` and
`QuantityEvent`:

- Where an item currently is, is *derived* from its transfer history, not
  stored as an overwritable field.
- Each transfer records origin, destination, who moved it, when, and condition
  at handover — since "it arrived broken" and "it broke here" are different
  facts and the custody chain is what distinguishes them.
- Some equipment is fixed-in-place and never transfers. Model that as a
  property of the item, not as a separate entity type.

Address: consumables move too (a box of jars sent to a site), so decide whether
consumable movement reuses this mechanism or is its own stock-transfer concept,
and say which.

## 4. Three orthogonal state axes — do not collapse them

`material.vessel.status [available | in_use | retired]` conflates three
independent facts. A fermenter can be *in use* and have a *broken airlock* at
the same time; "retired" is a different kind of statement from either. Because
they are collapsed, "which fermenters are free **and** sound" is currently
unanswerable.

Specify at least:

- **Lifecycle** — active / retired / disposed
- **Allocation** — free, or in use by a specific run (which fermentation, which
  drying run), derived from the run rather than set by hand where possible
- **Condition** — operational / needs cleaning / needs maintenance / faulty /
  out of service, with who reported it, when, and the evidence

Recommend whether `material.vessel` migrates onto this model or stays as-is,
and state the migration implication if it does — it has real production rows.

## 5. Readiness and capacity — likely the highest-value output

The originally-stated priority ranking put maintenance scheduling third. The
operational reality described is not scheduling; it is **readiness**:

> Six fermenters in process, two drying beds in use, one bed needs cleaning, a
> fermenter's airlock won't seal — and harvest is arriving Thursday. Cherry is
> perishable. It does not wait for a repair queue.

Maintenance *feeds* readiness; readiness is what someone actually acts on.
Specify it as a first-class view:

- **Capacity right now**: of N fermenters, how many are allocated, free-and-
  sound, or unavailable and why.
- **Readiness against a known demand**: incoming harvest volume versus available
  sound capacity, surfacing a shortfall *before* the cherry arrives, not when it
  is sitting in the wet mill.
- **Readiness before departure** — the apiary case: flag that a needed tool is
  faulty or missing *before* travelling to a site where it cannot be fixed.
  Requires knowing what a given task needs, which implies a light
  task-to-equipment requirement concept. Recommend the thinnest version that
  works; do not build a full BOM.

Recommend whether readiness should be reprioritized above consumables in the
build order, with reasoning.

## 6. Cross-role dependency and urgency

The person who *notices* a problem, the person who *fixes* it, and the person
who must *decide around it* are frequently three people. A processing
specialist seeing a broken fermenter with harvest pending is not filing a
repair ticket — they are choosing whether to delay, reroute, process a smaller
batch, or borrow capacity. Both surfaces read the same underlying fact.

Specify:

- Condition reports carry a responsible party for resolution, distinct from the
  reporter, and distinct again from those who need visibility.
- **Urgency is contextual, not a property of the fault.** A broken airlock in
  June is routine; the same fault with cherry arriving Thursday is blocking.
  Derive urgency from operational context (pending harvest, active run,
  perishability) rather than storing a static severity someone sets by hand.
- Map onto the existing attention vocabulary
  (`INFO / DUE / WARNING / BLOCKED / REVIEW_REQUIRED`) rather than inventing a
  parallel one.

**Dependency to flag, not solve:** all signalling here needs `Notification`
(`DOMAIN_MODEL.md` §5), which is specified and unbuilt — the same dependency
blocking the tourism waitlist, recurring field-study reminders, and Alerts.
Note the convergence; do not design a bespoke mechanism.

## 7. Instrument calibration and its link to provenance

A reading recorded as `measured_fact` from an out-of-calibration refractometer
is not a measured fact. `data_quality` already carries `verified`,
`verified_with_limitation`, and `provisional` — calibration state should drive
those by derivation, not by someone remembering.

Specify the instrument entity, the calibration event (when, by whom, against
what reference, result, next due, certificate as an `Asset`), and **how a
`Measurement` links to the instrument that produced it**. Note that
`Measurement` has no instrument reference today; adding one touches a table
with real production rows — state the migration implication rather than
treating it as a casual addition.

Two product decisions to raise, not silently resolve:

1. **Does an out-of-calibration instrument block a measurement, or downgrade
   it?** Blocking is stricter but gets routed around in the field; downgrading
   is honest but accumulates weak data. Recommend one, with reasoning.
2. **What happens retroactively when an instrument fails calibration?** Every
   measurement since its last good check is suspect. Evidence is never silently
   relabelled (`DATA_ARCHITECTURE.md` §4, `AI_GOVERNANCE.md` §6) — propose a
   mechanism that flags affected measurements for human review without
   rewriting recorded values or provenance in place. This is the hardest design
   question here; treat it as such.

## 8. Consumables and par stock

A **third** inventory concept, distinct from Commerce SKU inventory (built) and
operational lot inventory (ADR-020 decision 6, deliberately separate). Reagents,
filters, gloves, jars, lids, labels, hive frames, foundation, treatments.

Item definition, unit of measure, par level, on-hand, in/out movements,
low-stock signal, and **per-site balances** — the same consumable at three sites
is three balances, not one. These are consumed, never sold; state the boundary
explicitly as ADR-020 decision 6 did.

## 9. Scope

**In:** measuring instruments and processing equipment (pulpers, fermenters,
drying beds, extractors, brewing and packaging equipment, apiary tooling),
across Néctar Nómada's own sites **and partner/client sites**.

Partner access inherits `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §7 — each
engagement is its own Project, equipment carries `classification = partner`, and
leaf-scope containment (`RBAC.md` §3) already prevents cross-client visibility.
Confirm this holds without new permission machinery; if not, that is a finding.

**Out:** facilities, buildings, vehicles. Note as possible later extension.

**Explicitly not a CMMS or LIMS.** Out of scope, named so they don't creep in:
work-order routing and approval chains, meter/runtime-triggered preventive
maintenance, spare-parts reorder automation, vendor and PO management,
depreciation and asset accounting, technician scheduling and labour tracking.

Every architecture review in this set names scope creep as the top practical
risk for a solo maintainer. Design the smallest thing that makes calibration
trustworthy, readiness visible, and consumables countable.

## 10. Deliverables

`EQUIPMENT_AND_READINESS.md` (renamed from the superseded prompt's
`EQUIPMENT_AND_CALIBRATION.md`, since readiness is now central), structured like
the other planning documents: what it fills, entities with field sketches, reuse
of existing infrastructure, access/RBAC, sequencing, and — separately — the
decisions requiring product-owner input, including both in §7 and the
reprioritization question in §5.

End with a sequencing note placing it in v2 relative to Research OS and
`Notification`, plus a line for `DECISIONS.md` logging it as accepted planning
input, not a build order.
