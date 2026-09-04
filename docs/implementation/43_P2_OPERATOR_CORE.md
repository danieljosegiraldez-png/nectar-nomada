# P2 — Operator core: tasks people actually receive, sessions, events, and honest timestamps

> **ESTADO — cerrado el 2026-09-04, y a propósito sin §1 ni §2.**
>
> - **§3 `FieldSession`, §4 `FieldEvent`, §5 columnas de integridad temporal,
>   §6 GPS:** construidos. ADR-098/099/101 y la migración
>   `20260904150000_p2_cierre_gps_asset_y_desfase_reloj`, que cerró lo que
>   faltaba de §5 (`clock_offset_ms`) y todo §6 (`latitude`/`longitude`/
>   `accuracy_m` en `core.asset`).
> - **§1 (extender `partner.Task`) y §2 (`TaskTemplate`): NO construidos.**
>   Se contestó la pregunta que §0 exige contestar antes de tocarlos, y la
>   respuesta fue la primera de sus tres ramas: nunca se asignó trabajo por la
>   plataforma. **ADR-107** lleva la medición, el razonamiento y —lo que
>   importa para retomarlo— qué lo reabre: la primera `FieldSession` real.
> - **§7 (aceptación) sigue sin cumplirse**, y no puede cumplirse hoy: exige
>   que una persona que no sea Daniel reciba una tarea y recorra un bloque.
>   Sigue siendo el criterio correcto.
>
> §0 de abajo se conserva entero: es el razonamiento que produjo esta decisión,
> no un preámbulo superado.

Phase 2 of `docs/architecture/COFFEE_FIELD_OS_AUDIT.md` §26. The last phase
before the API and synchronisation work, and the one that decides whether any
of that is worth building.

**Context to read first:** the audit §6 (Task / Field Session / Event
assessment) and §21 (Auditability), plus ADR-095, whose "load the real data
before building on the model" reasoning applies here with more force.

---

## 0. The finding that should shape this ticket

Measured 2026-08-28 against production:

| | count |
| --- | --- |
| `partner.task` rows, ever | **0** |
| `partner.field_submission` rows, ever | **0** |

The Partner Workspace is **built and unused**. `getProjectWorkspace`,
`updateTaskStatus`, `createFieldSubmission`, `requestAssetUpload` and
`finalizeAssetUpload` all exist and work. Nobody has ever created a task or
submitted a thing.

So Phase 2 as the audit scoped it would extend a model that has never carried
a record, to serve operators who do not yet have accounts, for a workflow
nobody has walked end to end. That is three unvalidated assumptions stacked,
and it is the same shape P1 hit — except P1's land model at least had eight
plots and a real planting event behind it.

**This does not make Phase 2 wrong.** `FieldSession`, `FieldEvent`, GPS and
the time-integrity columns are all genuinely required, and the time columns in
particular get expensive to retrofit once sync exists and rows are arriving
from devices. But it does change what "done" means.

**Before building §1–§2, answer one question with whoever would use it: why
has no task ever been created?** The answers point in very different
directions:

- *Nobody was ever assigned work through the platform* → the gap is adoption,
  not schema, and §1's extensions are speculative. Build §3–§5 (which sync
  needs regardless) and defer templates and dependencies.
- *Someone tried and it could not express the work* → find out precisely what
  was missing. That is the actual specification for §1, and it will be better
  than this document's guess.
- *The partner workspace is for external partners and farm work is different*
  → then Task may be the wrong parent entirely, and a farm work order is its
  own concept. Decide that before extending Task, not after.

That conversation is minutes. Building the wrong half of this phase is weeks.

---

## 1. Extend `partner.Task` — do not fork it

`Task` has project scope, title, description, `dueDate`, status
(`open|in_progress|submitted|completed|blocked`), a single assignee and a
classification. What it lacks for farm work:

- **A target.** No farm, block or cohort — a task can only point at a project.
  "Fertilise Lote 3" has nowhere to say Lote 3.
- **`assignedToUserAccountId` is a `UserAccount`.** Field crew do not have
  logins, and most `Person` rows in this database have no email at all. This is
  the single hardest blocker in the model: **a task cannot be assigned to most
  of the people who would do it.** Add a nullable `assignedToPersonId`
  alongside, do not replace the existing column.
- **No planned vs actual.** One `dueDate`, no planned start, planned duration,
  actual start or actual completion. Labour and scheduling reporting need all
  four.
- **No sequence, dependency or recurrence.** Pruning follows fertilising;
  fertilising happens quarterly. Neither is expressible.
- **No required evidence.** A task cannot demand a photo, a measurement or an
  observation before it may be closed — which is exactly what makes a protocol
  more than a suggestion.

Extend in place. A parallel "work order" model would duplicate status,
assignment and classification, and the partner workspace already reads `Task`.

---

## 2. `TaskTemplate`

A reusable definition: title, description, default target type, expected
duration, required observations/measurements/evidence, and an optional link to
a `ProtocolVersion` when the task is executing one.

**Deliberately not a second protocol system.** `ProtocolVersion` already
declares required measurements per stage (RO1). A `TaskTemplate` that executes
a protocol should point at it, not restate it. The distinction: a protocol says
*what must be measured*; a template says *what someone is asked to go and do*.

---

## 3. `FieldSession`

Nothing today groups "Kenneth went to Lote 3 on Tuesday morning and did these
eleven things." Every existing event table is anchored to its own domain parent
— a run, a colony, a stage — never to a visit.

```
FieldSession
  locationId    → Location, required   (the block or site visited)
  operatorId    → Person, required     (not UserAccount — see §1)
  taskId        → Task, nullable       (a session may be unplanned)
  startedAt / endedAt
  startLatitude / startLongitude / startAccuracyM
  notes
  provenanceClass, dataQuality
```

This is the natural **offline transaction boundary** and the natural unit of
selective sync: a device pulls the sessions assigned to its operator, and
pushes them back as units. Getting it right here is what makes Phase 4
tractable.

---

## 4. `FieldEvent` — a spine, not a replacement

The temptation is one generic event table that the specialised ones migrate
into. **Do not.** `FermentationIntervention`, `DryingTurnEvent`,
`SpecimenObservation`, `QuantityEvent` and `ProcessingStageObservation` each
carry domain-specific typed columns that a generic table would degrade into
JSON — precisely what CLAUDE.md §49 forbids.

Instead:

```
FieldEvent
  fieldSessionId → FieldSession, required
  occurredAt / recordedAt
  eventKind      (catalog value, not an enum — see below)
  latitude / longitude / accuracyM
  operatorId     → Person
  notes
  + nullable FK per domain row it indexes:
      measurementId, quantityEventId, specimenObservationId,
      assetId, harvestEventId, lotTransformationId, …
  provenanceClass
```

One queryable chronological timeline over heterogeneous events, without owning
their semantics. This is the `Asset` pattern — many nullable parent FKs,
ADR-020 decision 8 — which this codebase has applied consistently fifteen
times and clearly knows how to operate.

`eventKind` is a `VariableCatalog`, not an enum: the list of things an operator
might record will grow, and P1 already established that a growing vocabulary is
a catalog entry plus a re-seed rather than a migration.

---

## 5. Time integrity — the part that is cheap now and expensive later

Today: `occurredAt` and `createdAt` are everywhere, and that is all. The only
device reference in the entire schema is `Measurement.deviceId`, an untyped
string that nothing writes.

Add, nullable, to every operationally-captured table:

| Column | Meaning |
| --- | --- |
| `occurredAt` | when it happened *(exists)* |
| `recordedAt` | device clock when the operator entered it |
| `createdAt` | server receipt *(exists)* |
| `syncedAt` | when it reached the server from a device |
| `deviceId` | → a real `Device` row, not a string |

The audit's §9 worked example is the point: measurement at 14:00, entered on
the phone at 14:23, synced the next morning at 09:17. Three different facts,
and today the schema can hold one of them.

**`Device` itself belongs to Phase 4**, with token issuance and revocation.
Add the columns now as plain nullable UUIDs and wire the FK when `Device`
lands — the same additive-FK-per-parent pattern `Measurement` already used for
`FermentationRun` and `DryingRun`.

Capture the **device clock offset** at sync time too. Cheap phones drift, and
a fermentation curve reconstructed from a drifting clock is wrong in a way
nobody will notice.

---

## 6. GPS on `Asset`

`Asset.locationId` is an FK to a `Location` *entity*. A photo taken at a point
on a hillside has no `Location` row and must not create one. Add
`latitude`/`longitude`/`accuracyM`, matching `FieldEvent`.

Annotations, upload-state lifecycle and resumable upload stay in **Phase 3/4**
as the audit scoped them. This ticket adds only the coordinates, because a
field photo without them is most of the way to useless and the column is free.

---

## 7. Acceptance — not the schema

Per ADR-095's precedent, the criterion is a real workflow, not a passing test:

**One real person, who is not Daniel, receives a task, goes to a block,
records at least one observation and one photo with GPS, and completes it —
and the resulting `FieldSession` reconstructs what they did in order.**

If that cannot be done because the person has no account, §1's
`assignedToPersonId` is the first thing to build. If it cannot be done because
nobody knows what task to assign, §0's question is still unanswered and the
rest of this ticket is premature.

---

## 8. Tests

- A task assigned to a `Person` with no `UserAccount` is valid and visible.
- A task with a block target resolves RBAC against that block's scope.
- Required evidence: closing a task without its required observation is refused;
  with it, succeeds.
- A `FieldSession` with three events reconstructs them in `occurredAt` order.
- `FieldEvent` indexes a `Measurement` without duplicating its values.
- `recordedAt` before `occurredAt` is refused (entering something before it
  happened is a clock problem worth catching).
- `syncedAt` null for a web-created row, set for a device-created one.
- RBAC: an operator scoped to one block cannot open a session on another.

---

## 9. Migration

Additive throughout. New: `field_session`, `field_event`, `task_template`.
Added columns: `task.assigned_to_person_id`, `task.location_id`,
`task.planting_cohort_id`, `task.planned_start_at`, `task.actual_start_at`,
`task.completed_at`, `task.task_template_id`; `recorded_at`/`synced_at`/
`device_id` on operationally-captured tables; `latitude`/`longitude`/
`accuracy_m` on `asset`.

`assignedToUserAccountId` stays — 0 rows use it today, but removing a column to
replace it with a near-identical one is churn with a migration attached.

Seed: an `event_kind` VariableCatalog.

---

## Not in scope

- `Device`, tokens, revocation, the JSON API, the sync protocol — Phase 4.
- Asset annotations, upload-state lifecycle, resumable upload — Phase 3/4.
- The native client — Phase 5.
- Migrating existing specialised event tables into `FieldEvent`. They stay
  where they are and `FieldEvent` indexes them; see §4.
- Offline behaviour of any of this. It is web-first on purpose, which is where
  iteration is cheap.
