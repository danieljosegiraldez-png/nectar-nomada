# Design-to-Implementation Coverage Audit

**Read-only.** No code, no schema, no migrations, no document edits. Produce
a report. Where something is uncertain rather than confirmed, say so — the
value of this audit is entirely in its honesty, and a finding asserted
without evidence is worse than a gap left open.

Every finding must come from the live repository — `prisma/schema.prisma`,
`lib/`, `app/`, `tests/`, `git log`, and the actual database where a claim
concerns database state — never from what an architecture document says
should be true. **The documents are the thing being audited, not the
evidence.**

`GAP_ANALYSIS_2026-08-10.md` did a version of this and its method was
sound — programmatic extraction and checking rather than reading. Some of
its findings are now stale (resolved since); some were incomplete. Treat it
as prior art to verify and extend, not as current truth.

---

## Part A — Enforcement claims (highest value, do this first)

The architecture set makes a specific class of claim: that something is
structurally impossible, not merely prohibited by policy. Each one is either
real in the code and database, or it is a sentence in a document. Verify
each **at the layer where it claims to be enforced.**

1. **`AI_GOVERNANCE.md` §3** — a separate `ai_service` Postgres role with
   `INSERT` on `ai.recommendation` only and no write grant on `research.*`,
   `sensory.*`, `competitions.*`, `core.*`. Verify against the actual
   database role grants, not the application code. ADR-033 claims this was
   verified against Neon; confirm it still holds.
2. **`RBAC.md` §7 / `SECURITY.md` §4** — blind-code mapping genuinely
   unreachable by a Judge's resolved permission set, not hidden in the UI.
   Show the permission check, and whether a test covers it.
3. **`SECURITY.md` §4** — the public read path hard-filters
   `classification = 'public'` by construction, so a new public route
   cannot expose a non-public record by omitting a filter. Verify the
   filter is the only path to the data.
4. **`SECURITY.md` §6** — `audit_event` append-only, with no
   `UPDATE`/`DELETE` grant for any application role including admin.
   Database-level check.
5. **`COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F** — `Lot` and
   `LotTransformation` never updated in place. Already spot-checked via
   grep; confirm it holds after T10 added write paths.
6. **`MEDIA_INTELLIGENCE_PIPELINE.md` §1** — Drive integration read-only at
   the credential/scope level, not by application convention. If the
   integration isn't built, say so rather than reporting the claim as
   satisfied.
7. **`DATA_ARCHITECTURE.md` §4** — provenance columns mandatory on
   fact-bearing tables, with unknown values surfacing as
   `missing_source_record` rather than a sentinel. Report current state
   post-T9.5.

For each: **enforced structurally / enforced in application logic only /
documented but not enforced / not applicable because unbuilt.** The
distinction between the first two matters — application-only enforcement is
a real control, but it is not what the document claims.

## Part B — Coverage matrix

For each architecture and planning document, list what it specifies
(entities, tables, permissions, workflows) and classify each against the
live code:

- **BUILT** — exists and is used by a real code path
- **PARTIAL** — exists but incompletely, or exists and is never exercised
  (the `provenanceClass`-present-but-never-set case; this category is the
  one worth finding)
- **SPECIFIED ONLY** — designed, not built, and correctly deferred
- **DRIFTED** — built differently from what the document specifies

SPECIFIED ONLY is expected and fine for anything the roadmap defers. Do not
report intentional deferral as a problem. PARTIAL and DRIFTED are the
findings that matter.

Cover at minimum: `DOMAIN_MODEL.md`, `DATA_ARCHITECTURE.md`, `RBAC.md`,
`SECURITY.md`, `AI_GOVERNANCE.md`, `INTEGRATIONS.md`, `COMPETITIONS.md`,
`BEVERAGE_SENSORY_PROTOCOLS.md`, `CONSUMER_SENSORY_FEEDBACK.md`,
`PHASE_1_TECHNICAL_EXECUTION_PLAN.md`, and the four approved architecture
reviews.

## Part C — Drift, in detail

For anything marked DRIFTED, state what the document says, what the code
does, and which is correct. Sometimes the code is right and the document is
stale; say so plainly rather than defaulting to treating the document as
authoritative. `Sample.sourceLotId` is a known example — a deliberate
denormalization beyond `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F's
minimal design, correct in code, unrecorded in the doc.

## Part D — Orphan code

The inverse check: schema tables, permissions, service functions, or routes
that exist with **no** governing design document. Not necessarily wrong —
but undocumented structure is how a future session re-derives a decision
that was already made, and that's the specific failure `DECISIONS.md`
exists to prevent.

## Part E — Stale document claims

Places where a document asserts current state that is no longer true in
either direction — something described as built that isn't, or as unbuilt
that now is. `GAP_ANALYSIS_2026-08-10.md` itself is a likely source
(several of its findings were fixed after it was written), as is
`MVP_ROADMAP.md` §3's deferral list.

## Part F — Report

Structure as:

1. **Enforcement claims** — the Part A table, first, because it is the
   part where a false claim carries real consequence.
2. **Findings requiring action**, each with: what, where, why it matters,
   and whether the cost of fixing it is fixed or compounding.
3. **Findings worth logging but not acting on.**
4. **Confirmed sound** — briefly. Knowing what has been verified is as
   useful as knowing what hasn't, and prevents re-auditing it later.
5. **What could not be determined**, and why.

Then recommend, but do not implement, a durable way to keep this from
drifting again — for example a build-status marker per entity in
`DOMAIN_MODEL.md` so a future reader can distinguish specified from shipped
without checking the schema, and a note on whether this audit should be
repeated on a trigger (each phase completion) rather than ad hoc.

No fixes, no ADR, no document edits. Report and stop.
