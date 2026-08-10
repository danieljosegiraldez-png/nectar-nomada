# Consumer Sensory Feedback — Néctar Nómada Digital Platform

Extends `DOMAIN_MODEL.md` §4 (Sensory Evaluation) and `PLATFORM_OVERVIEW.md`
§14 (My Néctar — "My Tastings, Sensory History," previously specified with no
data source defined). This document specifies a **second, structurally
separate sensory pathway**: lightweight, QR-triggered consumer feedback,
distinct from the expert/technical Sensory Evaluation engine
(`DOMAIN_MODEL.md` §4) and Competitions (§4).

---

## 1. Why this must stay structurally separate (not a smaller version of the
same thing)

`CLAUDE.md` §49 explicitly forbids "combine consumer liking with technical
judging." This isn't a minor style note — it's the single most important
constraint on this feature. A customer's quick hedonic response to a honey
jar and a calibrated Q-grader's CVA cupping score are different kinds of
evidence with different provenance, and collapsing them into one number would
misrepresent both.

Concretely, this means:

- **Separate tables**, not a "simplified mode" of `sensory.Assessment`.
- **Separate provenance class**: consumer responses are never
  `direct_observation` or `scientific_evidence` (the classes used for expert
  Assessments) — they get their own class, `consumer_hedonic_feedback`, added
  to the provenance enum (`DATA_ARCHITECTURE.md` §4).
- **Comparison, not merging, in the UI**: when a consumer's result is shown
  against an expert panel result (§6), they render as two independently
  labeled overlays on the same chart — never averaged, never combined into
  one score.

## 2. New entities

```
consumer_sensory.form(id, name, product_type_scope
  [honey|coffee|beer|mead|wine|spirits|other], status)

consumer_sensory.form_version(id, form_id, version, scale_min, scale_max,
  scale_labels [e.g. 'none','low','medium','high' mapped across 0-5],
  superseded_by)

consumer_sensory.attribute(id, form_version_id, name, display_order,
  applicable_species_id (nullable — lets a honey form's attribute set differ
  from a coffee form's, and even vary by specimen/varietal if needed))
```

Same versioning pattern as `SensoryProtocolVersion` (`DOMAIN_MODEL.md` §4) —
attribute sets vary by product type and can evolve without losing historical
comparability (old responses stay tied to the form version they were
answered under).

```
consumer_sensory.respondent(id, email, created_at, marketing_opt_in
  (nullable), user_account_id (nullable))
```

Not a `core.UserAccount` — a lighter-weight record. `user_account_id` is
populated either at submission time (if the person happens to be logged into
My Néctar already) or later via an email-match "claim" flow if they create/
log into an account afterward with the same email.

```
consumer_sensory.session(id, form_version_id, batch_type
  [honey_batch|coffee_lot|fermentation_run|other], batch_id, respondent_id,
  submitted_at, source='qr_scan')

consumer_sensory.response(id, session_id, attribute_id, intensity_0_5)

consumer_sensory.batch_aggregate(batch_type, batch_id, attribute_id,
  response_count, avg_intensity, last_computed_at)
```

`batch_aggregate` is a rollup (recomputed on write or on a schedule) — the
"compare to other buyers of this exact jar" view reads from this, not from
scanning every individual response live.

## 3. QR flow

Assumption, flagged for confirmation: **QR codes are batch-level**, printed
once per harvest/batch label, shared across every physical unit from that
batch — not individually serialized per jar. Standard traceability practice;
avoids a unit-serialization system that wasn't asked for. If you actually
want per-unit uniqueness (e.g., for a numbered limited edition), that's a
straightforward addition (`unit_serial` on the Asset/Product's inventory
record) but shouldn't be assumed as the default.

```
Scan → /feedback/{batch_type}/{batch_id}
  → auto-selects the right form_version for that product's type
  → short hedonic form (attributes + 0-5 intensity)
  → email requested at submission (§4)
  → immediate result shown (§5)
```

## 4. Anonymity — precise language matters

Per your decision: **email required, no full account.** This is
**pseudonymous, not anonymous** — worth being precise about this distinction
in the platform's own copy shown to the person (e.g., "your response isn't
tied to a public profile" rather than claiming "fully anonymous," which
would be inaccurate given an email is collected).

Email serves three purposes, all legitimate, none requiring full
registration:
- Basic spam/duplicate-submission control (one response per email per batch).
- The claim mechanism for My Néctar linking (§5).
- Optional marketing opt-in (explicit checkbox, off by default, per the
  Declared vs. Inferred preference distinction already in `DOMAIN_MODEL.md`
  §15/customer profile principles — never assumed from the act of
  submitting feedback).

The respondent's email is never shown to other people viewing aggregate
results — only `batch_aggregate` (fully de-identified) and the person's own
individual response are ever rendered back to anyone.

## 5. Result persistence — one-time unless linked to an account

Per your decision:
- **Not logged into My Néctar at submission, and never claims it later**:
  result is shown once, immediately, in the browser. Reasonable middle
  ground worth building: also email a one-time results link (since an email
  was already collected) so the person isn't dependent on not closing their
  browser tab — but this doesn't create persistent in-app access.
- **Logged into My Néctar at submission, or claims it later via matching
  email**: `respondent.user_account_id` gets set, and the response becomes
  part of that Person's permanent Sensory History (`PLATFORM_OVERVIEW.md`
  §14 — this is literally the missing data source that section referenced
  with nothing behind it until now).
- Underlying data is retained either way (never deleted, consistent with the
  platform's version-preservation discipline) — "one-time" is a UI/access
  rule, not a storage rule. This matters for the aggregate comparison (§2)
  to remain accurate even for people who never create an account.

## 6. Comparison views

Two distinct, independently-toggled comparisons — never combined:

**Default: this batch's other buyers** (per your decision on default scope)
- Individual's own responses overlaid on `batch_aggregate` for the same
  `batch_type`/`batch_id`.
- Rendered as a radar/spider chart, 0-5 per attribute, "You" vs. "Other
  tasters of this batch (n=X)."

**Optional secondary view: expert panel comparison**, shown only when a
formal `sensory.PanelResult` exists for the same batch (i.e., this batch was
also formally cupped/evaluated) —
- A third, clearly separately-labeled trace: "Expert panel (calibrated
  evaluation)" — different color/style, own legend entry, explicit label
  distinguishing it as professional evaluation vs. consumer impression.
- This view is additive, opt-in (a toggle, not the default), and the two
  data types are never averaged into a combined score at any point in the
  pipeline — enforced at the query layer (separate queries, joined only for
  display, never for calculation) as well as the UI layer.

Broader comparison (same specimen/harvest across multiple batches) is a
reasonable future extension of the same `batch_aggregate` mechanism —
grouping by `specimen_id` or harvest window instead of single `batch_id` —
but not required for v1 per your stated default.

## 7. Classification and rate limiting

- `batch_aggregate` rows: `classification = public` — this is the whole
  point, letting anyone compare against the community.
- `consumer_sensory.respondent.email`: never public, restricted to system
  use (spam control, claim-matching) — same discipline as any other PII
  field (`SECURITY.md` §4).
- Public, unauthenticated submission endpoint needs the same rate-limiting
  requirement as any other public mutation (`SECURITY.md` §7) — one response
  per email per batch, plus basic abuse/bot protection, before this ships.

## 8. Sequencing

This depends on:
- Commerce (Slice 3) — needs `Product`/batch linkage to exist.
- Sensory (Slice 6) — needs the expert `PanelResult` comparison target to
  exist for the optional secondary view (§6) to have anything to compare
  against; the consumer-only default view (§6, batch peer comparison) could
  technically ship without waiting for Slice 6, once Commerce and a batch
  concept exist.
- My Néctar's Sensory History (already named in `PLATFORM_OVERVIEW.md` §14)
  gets its actual data source from this work — worth noting as a nice
  convergence rather than two separate features.

Reasonable placement: **after Slice 3 (Commerce), can run in parallel with
or shortly after Slice 6 (Sensory)** rather than waiting for the full
Research OS. Log as accepted domain-model input in `DECISIONS.md`, same
pattern as the other planning docs — not an immediate build order.
