# Apiary scoping — revision to §4's Inspection collapse, and two sections for review

**Report and revision only.** No code, no schema, no migrations. Update
`22_APIARY_V1_SCOPING_REPORT.md` where §1 requires it, then surface §2's two
sections for review. Do not begin building A1–A8.

---

## 1. The `Inspection` collapse is too tight — a real operational case breaks it

The scoping report collapsed `HealthObservation`, feeding, and treatment into
fields on `Inspection`, on the reasoning that they always occur during one. That
saves a table, and for the common case it is correct.

**But a confirmed operational fact breaks it:** a beekeeper visits an apiary to
feed, and that is not an inspection. No hive is opened, no brood pattern read,
no colony strength assessed, no inspection report produced. The same applies to
applying a treatment on a separate visit, or to an observation made in passing —
robbing activity, a dead-out noticed from outside, damage after weather.

If the model requires a `Inspection` row to record a feeding, one of two things
happens, and both are bad: the operator creates an empty inspection whose fields
are all null — which corrupts the inspection record as evidence, since a
formal inspection and a feeding stop become indistinguishable in the data — or
the operator does not record the feeding at all.

**Revise the model so that a visit and an inspection are different things.**
Evaluate at least these shapes and recommend one with reasoning:

- A lightweight `ApiaryVisit` (or equivalent) as the parent, with `Inspection`
  as one *optional* kind of activity that can occur during a visit, alongside
  feeding, treatment, and observation. A visit with only a feeding is complete
  and valid.
- Separate sibling event records (feeding, treatment, observation) attaching
  directly to `Hive` or `Colony`, with `Inspection` remaining its own formal
  record — no visit parent at all.
- Something better that the repository's existing patterns suggest.

Constraints on whichever shape is chosen:

- **A formal inspection must remain distinguishable as a formal inspection.**
  It is the record with evidentiary weight — the one that says a trained person
  opened the hive and assessed it. Do not let it become a container that
  anything can be filed under.
- **Feeding and treatment are interventions, not observations**, and the
  distinction matters: an observation records state, an intervention changes it.
  `SPECIMEN_AND_MATERIAL_TRACEABILITY.md` §2 already models
  `specimen_observation` with typed `observation_type`; check whether that
  pattern applies or whether interventions genuinely need their own shape.
- **Provenance per ADR-038.** An inspection is a `direct_observation`. A
  feeding is an `original_record` of an action taken. These are not the same
  class and the schema must be able to say so.
- Do not let this revision expand the table count materially. If the honest
  answer is one more table than the report proposed, say so and justify it —
  but three tables becoming eight defeats the reuse finding that made this
  scope viable.

Also revisit whether **treatment records need their own product/batch
identity** — which varroa treatment, which batch, applied at what dose. That is
irrecoverable field data of exactly the kind `20_` was about, and it has
regulatory and residue implications for honey. Recommend in or out of v1, with
the consequence stated.

## 2. Two sections to surface for review, unchanged

These were produced but not shown. Reproduce them in full, verbatim from the
report — do not summarize, revise, or improve them.

1. **The A1–A8 ticket breakdown**, with each ticket's scope, its size relative
   to the built T1–T12.6 tickets, and its dependencies.
2. **The deliberately-not-built list**, with the stated consequence of each
   omission.

If §1's revision changes any ticket in the breakdown, show the original and the
revision side by side rather than silently replacing it — the original is the
record of what was proposed before this correction.

## 3. Offline — reassess, do not assume it is deferrable

The report flags offline as more acute for apiary than for coffee, since
inspections happen at sites with no signal. That is likely understated.

Consider the real case: Kenneth works through twelve hives in sequence at Cerro
Azul with no connectivity. If nothing saves until he returns to signal, he
either loses the session or writes on paper and transcribes later — and
transcribed-that-evening data is not a `direct_observation`, which the
provenance model would then have to record honestly as weaker evidence.

`OFFLINE_FIELD_CAPABILITY.md` already specifies the full mechanism (PWA,
service worker, IndexedDB drafts, versioned conflict resolution). The question
is not what to build but whether A5's operator UI can honestly ship without it.

**Answer directly: can it, or is offline no longer deferrable for apiary
specifically?** If it is required, say what that adds to the breakdown. Do not
soften the answer to protect the scope.

## 4. Status correction to carry into the report

The prompt that produced the report described T12.6 and T13 as outstanding.
Both are now complete; only T14 remains for coffee. Correct this where the
report reasons from it — particularly any concurrency or sequencing conclusion
that assumed three coffee tickets still competing for the same weeks.

## 5. Deliverables

The revised `22_APIARY_V1_SCOPING_REPORT.md` with §1's model correction, §3's
offline answer, and §4's status fix — plus §2's two sections reproduced in this
session's output for review.

Report, then stop. Do not begin A1–A8, and do not begin T14.
