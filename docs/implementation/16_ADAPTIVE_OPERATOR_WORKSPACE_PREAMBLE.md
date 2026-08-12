# Reconciliation Preamble — Adaptive Operator Workspace Research

**Prepend this to `ADAPTIVE_OPERATOR_WORKSPACE_RESEARCH_PROMPT.md`. Where
that prompt and this preamble disagree, this preamble wins.**

The research prompt that follows was drafted independently and is written as
though this platform has no existing architecture. It does. Several of its
sections would, taken literally, redesign work that is already built,
verified in production, and logged in `DECISIONS.md`. This preamble names
those boundaries so the research produces something that can actually be
built against rather than something that has to be reconciled afterward.

This is the same failure the Phase 1 prompt had — an incomplete reading list
that omitted the document already answering its central question. That one
worked out because the model went and found the right document unprompted.
Do not rely on that happening twice.

**Gate:** do not run this until `13_DEFINE_PLATFORM_V1_PROMPT.md` has landed
and v1 scope is settled. Without that boundary, "adaptive operator
workspace" expands to cover the entire platform and T10 becomes unbounded.

---

## 1. Required reading before answering anything

- `RBAC.md` — the whole document, especially §3 (scope containment), §4
  (resolution algorithm), §5 (seed Role Profiles), §7 (blind evaluation)
- `DOMAIN_MODEL.md` §1–3 — the Person / UserAccount / Role distinction and
  the canonical entity layer
- `AI_PERSONA_MODES_KNOWLEDGE_TOOLS_ARCHITECTURE.md` and `AI_GOVERNANCE.md`
- `OFFLINE_FIELD_CAPABILITY.md`
- `COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md` §F (lot genealogy)
- `PHASE_1_TECHNICAL_EXECUTION_PLAN.md`, T10's ticket definition
- `DECISIONS.md` — ADR-020, ADR-030, ADR-037

## 2. Vocabulary map

The research prompt uses terms this platform names differently. Use the
platform's names in all output; do not introduce the prompt's synonyms as
new concepts:

| Prompt term | This platform |
|---|---|
| Capability | `Permission` (`resource_type` + `action`) |
| Membership | `Assignment` (platform access) or `OrganizationMembership` (descriptive title only, grants nothing) |
| Role | `RoleProfile` — data, not code, not a column on a user |
| EffectiveContext | The resolved permission set from `RBAC.md` §4, plus the active scope selection |
| Tool entitlement | Derived, not stored — see §4 below |

`OrganizationMembership` granting no permission by itself
(`DOMAIN_MODEL.md` §2) is load-bearing. A design that treats "member of
Farm A" as implying access to Farm A's data contradicts the model.

## 3. Four things that are already decided — design within them, do not redesign

**(a) Scope containment is not a tree.** The prompt's §4 proposes
`ORGANIZATION → FARM/LOCATION → PROJECT → ROLE` and then invites proposing a
better hierarchy. `RBAC.md` §3 is explicit that scope types are *not* a
strict single tree: `location`, `competition`, `session`, and `experience`
are **leaf scopes** granting only within themselves, inheriting from and
granting to nothing. Containment flows downward from `platform`/`program`
only; the resolver never walks upward from a narrow scope. This is the
literal mechanism behind "narrow, never broaden." **Decision: RBAC.md §3 is
fixed.** Design the UX within it. The prompt's own §36 already says "do not
change RBAC" — where §4 contradicts §36, §36 governs. If the UX genuinely
cannot be built within these rules, say so explicitly as a finding rather
than quietly assuming a different model.

**(b) Blind session restriction already exists.** The prompt's §16 says
"this is not normal RBAC alone" and asks for a new `SessionPolicy`. In this
platform it *is* normal RBAC: `RBAC.md` §7 makes the blind-mapping table
separately permission-gated, so a Judge's resolved permission set genuinely
cannot query the mapping — it is not hidden in the UI, it is unreachable.
This shipped in Slice 6 and was verified live (ADR-030). Design the judge
*interface* on top of that mechanism; do not design a parallel one.

**(c) Ask Néctar's architecture is approved.** ADR-037 fixed the modes
(FIELD, OPERATOR, SENSORY, COMPETITION, COMMERCE, DISCOVER), the intent
router, and — importantly — that `ai:converse` is initially held by
**Platform Admin and Content/Ops Coordinator only**. A field operator does
not have it yet. Design where Ask Néctar *would* sit in the operator surface
and how context inheritance works, but treat operator-level access as a
future widening, not a current state, and do not redefine the modes.

**(d) Offline/mobile is specified.** `OFFLINE_FIELD_CAPABILITY.md` covers
PWA and service worker, draft lifecycle, versioned conflict resolution (both
versions preserved, never last-write-wins), quota warnings, and sync
ordering. The prompt's §12 should build on that document, not re-derive it.

## 4. Tool entitlement — derived, never stored

**Decision: tool entitlement is computed from the resolved permission set,
not stored as a second axis.** A stored entitlement table would inevitably
drift from RBAC, producing the worst failure mode in a permission-aware UI:
the interface offers an action the server then refuses. If a user's
permissions include the writes a tool performs, the tool appears. Specify
the derivation rule, not a new table.

The prompt's §13/§30 UI states (Hidden / Read-only / Disabled-with-reason /
Available) are good and worth designing properly — but they are *rendering*
of the resolved permission set, never a separate source of truth.
`SECURITY.md` §2 is unambiguous: the frontend is not the security boundary,
and every route re-checks server-side regardless of what the UI showed.

## 5. Scope of this research

**Coffee operator is the design target.** T10 is the first real operator UI
and v1 is scoped to carrying one real harvest end to end. Coffee — lots,
harvest, fermentation, drying, storage, samples, measurements — is what must
actually work.

**Apiary is forward research, explicitly labeled as such.** Include the
beekeeper scenarios and the domain-toolkit question, because the answer
shapes whether the architecture generalizes — but state plainly in the
output that **no apiary tables exist**; `Apiary / Hive / Colony / Queen` is
architecture-only (`DOMAIN_MODEL.md` §4), unbuilt, and not in v1. Apiary UX
must not appear in any T10 recommendation.

**One real structural insight in the apiary addendum, worth carrying
forward:** colony division (parent hive → H-021-A / H-021-B, lineage
preserved, "which colonies originated from H-021") is the *same shape* as
`lot_transformation` with its separate input/output rows — a DAG, append-only,
traversed by recursive CTE. When apiary is eventually built it should reuse
that verified pattern rather than inventing a parallel genealogy mechanism.
Note this; do not design it.

**Out of scope entirely for this pass:** marketing/community workspace,
research workspace beyond what sensory already provides, commerce operations,
consulting. Reference them as future context surfaces only.

## 6. One thing the prompt is missing

Quick-capture UX must answer **how an operator states provenance.** T9.5
removed the silent `direct_observation` default — provenance is now a
deliberate choice at every write path, and `operatorPersonId` (who
observed) is distinct from `createdBy` (who typed it in) — the same
existing field every T1-T13 write path already carries, per ADR-038
decision 2, which rejected a separate `recordedBy` column precisely
because `operatorPersonId` already covers this; do not add a new field.
So a "+ Measurement" button
cannot just capture a number: the flow has to establish whether this is a
measured fact, an estimate, or a secondhand report, and who actually
observed it — in two taps at a drying bed, in sunlight, possibly offline.

That is a genuine UX design problem and the platform's central epistemic
claim depends on it being solved well rather than buried in an optional
field. Treat it as a required section, not an afterthought.

## 7. Output

Produce `ADAPTIVE_OPERATOR_WORKSPACE_REFERENCE_RESEARCH.md` per the
prompt's §32 structure, with two additions: a section on provenance capture
(§6 above), and an explicit statement of which recommendations are v1/T10
versus deferred.

Research and UX architecture only — no code, no schema, no migrations, no
RBAC changes, per the prompt's own §36. End with the decisions genuinely
requiring product-owner input, separated from those this preamble already
settled.
