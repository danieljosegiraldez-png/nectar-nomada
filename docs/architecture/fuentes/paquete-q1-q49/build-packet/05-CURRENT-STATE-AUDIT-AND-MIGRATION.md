# Current-state audit, gap analysis and migration checklist

All checklist items are **IMPLEMENTATION REQUIREMENT**. Implementation methods and unresolved parameters are **OPEN TECHNICAL DECISION** until an evidence-backed architecture decision resolves them. No boxes are checked by preparation of this packet; the application repository has not been inspected.

## 1. Identify the real working state

- [ ] Confirm repository root, remote, branch, current commit and deployed commit/environment without exposing secrets.
- [ ] Read repository instructions and current approved plan, including Claude's session notes/handoff and actual V1/V2 scope.
- [ ] Inventory staged/unstaged/untracked changes and ongoing migrations or background jobs. Do not reset, stash, overwrite or “clean” another session's work.
- [ ] Establish public-site versus private OS repositories, shared packages and deployment boundaries.
- [ ] Record current build/test baseline and known failures before attributing problems to new work.
- [ ] Locate canonical entities, schema/migrations, services, validation, API/server actions, routes, jobs, policy enforcement and tests.
- [ ] Find working implementations under alternative names; “not found by one keyword” is not evidence of absence.
- [ ] Record whether production has real field/client data, old offline clients, printed labels or external consumers depending on current IDs/contracts.

## 2. Inventory by domain

For each family below list schema model/table, keys/constraints, service/API, UI, permission policy, offline behavior, tests, data population and migration history.

| Family | Audit questions |
|---|---|
| People/organizations/projects/sites | Are Person and login distinct? Is tenancy enforced? How are external collaborators scoped? |
| Geography | How are parcel/block/lot/microparcel represented? Are changes historical? Are overlapping groups possible? |
| Coffee/materials | What do existing lot and batch names mean? How are three-stage mass balance, split/merge and yield calculated? |
| Process/drying | What rules already exist? Are SOPs versioned? Do runs retain exact versions and actual deviations? |
| Inventory/samples/roast | Are physical withdrawals and consumption accounted for once? Are all sample stages linked? |
| Apiary/hive/colony | Are biological and hardware identities conflated? Can historical continuity be mapped without fabrication? |
| Tasks/workdays | Are assignments, attendance and task time distinct? Are dependencies/generated tasks idempotent? |
| Equipment/inputs | Asset/model/configuration distinction? Current custody versus ownership? Supplier lot/expiry/calibration? |
| Measurements/evidence | Units/method/source/calibration, originals/derivatives, verification and corrections? |
| Sensory/research | Standalone use, guest scopes, blind keys, raw evaluations, experiments and analysis versions? |
| Consulting/commercial | Findings/baselines/verification, external portals, reservations/fulfillment and costs? |
| Knowledge/AI/publication | Permissioned retrieval, provenance, promotion, rights, approvals and public projections? |
| Sync/recovery | Local durable store, queue/outbox, retry semantics, old clients, restore/export and selective replication? |

## 3. Required gap-analysis format

Produce a row for every Q1–Q49 and each relevant non-question requirement. Include sub-decisions Q9A/Q9B, Q11 revision/Q11B, Q26A and all later revisions.

| Field | Required content |
|---|---|
| Requirement ID/classification | Q number or stable technical ID; confirmed vs derived vs open |
| Source | Packet section and exact decision/transcript reference |
| Current implementation | Verified paths, symbols, schema relations and tests, with commit |
| Evidence confidence | Inspected / Tested / Historical claim / Missing evidence |
| Status | Satisfied / Partial / Compatible extension / Missing / Conflict / Deferred / Unknown |
| Current behavior | Concrete example, not only table existence |
| Target behavior | Observable acceptance condition |
| Minimal change | Extend, adapt, preserve, or justified replacement candidate |
| Migration/data impact | Old records, labels, users, pending devices, APIs, reports |
| Current work impact | Blocker now / Small compatibility fix / Next increment / Later |
| Acceptance evidence | AT IDs and extra tests where needed |
| Decision owner | Technical or product owner; date/gate |

**IMPLEMENTATION REQUIREMENT:** show a vocabulary crosswalk separately. Example: packet “Field Parcel” → repository `Location` subtype/`FarmBlock` if that is the actual equivalent. Do not add `Parcel` solely for naming consistency. Conversely, a generic `Lot` string is not proof that geography and inventory are safely separated.

## 4. Invariant audit

- [ ] Tenant-bound foreign keys and service-level checks prevent attaching another client's objects without a grant.
- [ ] Exact-decimal quantities, conversions and rounding are consistent across server/mobile/export.
- [ ] Accepted material transactions are atomic, idempotent and nonduplicating; stock cannot silently become impossible.
- [ ] Genealogy is complete and acyclic for material ancestry; movements/containment/biological continuity are semantically separate.
- [ ] Authoritative custody/placement does not overlap incompatibly.
- [ ] Run/SOP and measurement/method/calibration histories remain reconstructable.
- [ ] Original evidence, corrections, rejected commands and report versions are retained under applicable policy.
- [ ] Blind sample keys, payroll-like rates, client-private evidence and learning provenance do not leak.
- [ ] Unknown versus zero/estimated/inherited values are distinct in storage and analytics.
- [ ] Offline capture does not claim globally final approval where reconciliation is still pending.
- [ ] Permission expiration/revocation, old clients and shared-device caches have explicit behavior.
- [ ] Backup/export/restore includes database relationships and media, plus separate treatment of unsynced devices.

## 5. Migration preparation

- [ ] Establish actual schema and migration baseline; detect drift and failed/partially applied migrations.
- [ ] Create an isolated representative test copy using synthetic or properly protected/redacted records.
- [ ] Count records and relationships; identify null/duplicate IDs, orphan references, invalid units, negative balances, missing sources, merged identities and incomplete evidence.
- [ ] Inventory existing QR labels, external links, API clients, exports and offline schema versions.
- [ ] Propose additive expand → backfill → validate → switch → retire steps. Preserve compatibility until old clients and references are accounted for.
- [ ] Document data mapping and ambiguous cases. “Unknown biological continuity” remains unknown; never fabricate occupancy histories or source weights to satisfy new fields.
- [ ] Use resumable, idempotent batches with checkpoints and reconciliation counts. Estimate lock/time/storage risks from actual scale.
- [ ] Keep an ID/alias map for existing entities and printed tags; never blindly regenerate primary keys.
- [ ] Write specific rollback/forward-repair steps and test them before production. A rollback after new writes may require compensating migration, not merely dropping a column.
- [ ] Verify historical calculations remain reproducible or intentionally versioned; do not rewrite old balances without an audit trail.
- [ ] Obtain the required approval for structural/destructive changes after the concrete gap/migration plan is reviewable.

## 6. Domain-sensitive migration cases

**Hive/colony conflation:** inspect whether an existing record represents hardware, current biology or both. Introduce relationships/occupancy only as necessary. Preserve prior identifiers as aliases; attach uncertain historical records to an explicit unresolved interval/source, not an invented queen/colony. Verify inspections and honey material lineage after mapping.

**Farm lot versus material lot:** classify records from real usage and references. Preserve UI language where appropriate while creating distinct semantics in services/relationships. Do not mass-rename tables before confirming every consumer.

**Samples as attachments:** migrate only when physical withdrawal evidence exists. If historical quantity was never recorded, mark unknown; do not retroactively deduct an invented quantity. Establish a reconciled opening balance with date/source/approval when needed.

**Mutable measurements/stock:** preserve available legacy audit history; record its limitations. New correction semantics apply prospectively and through explicit reviewed migration. Never claim immutable provenance for legacy edits that cannot be reconstructed.

**Offline identifiers:** keep original field IDs and pending commands. If a new canonical ID must be introduced, persist alias mapping and reconcile queued references atomically. Label scans and external exports must still resolve.

**Costs:** migrating an old zero cost must distinguish measured zero, absent value and borrowed/in-kind resource where evidence allows. Do not infer historical market value or allocate shared cost repeatedly across descendants.

## 7. Release and pilot gates

- [ ] Approved scope maps to current increment and remains distinct from discovery Phase 1/2 and older V1/V2/V3.
- [ ] Feature flags/routes/scopes allow incremental release without breaking existing users.
- [ ] Migrations pass representative rehearsal and rollback/repair tests.
- [ ] Critical AT scenarios pass; deferred/non-applicable tests have explicit rationale, not silently omitted rows.
- [ ] Field trial covers low-end devices, manual fallback, poor network, real capture ergonomics and supervisor reconciliation.
- [ ] Security review includes denied paths, shared phones, external portal, AI/search/media and exports.
- [ ] Restore and client export/readback are demonstrated; owners know recovery procedures.
- [ ] Instrumentation shows queue depth/age, conflict backlog, rejected commands, missing media, stock reconciliation, authorization denials and failed jobs without exposing private data.
- [ ] Staff can distinguish saved locally, pending upload, accepted/synced, media pending and needs review.
- [ ] Independent Codex verification names exact reviewed commit/diff and remaining findings.

## 8. Open technical decision register template

For each open item record ID, problem, options, current repository constraints, recommendation, tradeoffs, required evidence, owner, decision deadline/gate, affected requirements, migration impact, acceptance tests and status. Start with: mobile framework/store; sync architecture; offline inventory/custody allocation; permission leases; IDs/aliases; ledger/projection strategy; units/tolerances; tenancy enforcement; media/encryption; RPO/RTO; client lifecycle/retention; learning disclosure; research methods; API/vendors/licenses; reporting/localization; costs/valuation; and integration with the existing V1/V2 plan.

Do not leave “TBD” without an owner and a gate. Do not turn an unresolved technical choice into a new product-discovery question when repository evidence can decide it.
