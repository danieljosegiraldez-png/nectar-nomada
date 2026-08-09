# RBAC — Néctar Nómada Digital Platform

Implements CLAUDE.md Section 10's chain: `User → Assignment → Scope → Role Profile
→ Permission`. This is the single most load-bearing document in the set — Identity
is the first vertical slice (`MVP_ROADMAP.md`) specifically because every other
module's confidentiality and workflow rules depend on this resolving correctly.

---

## 1. Why not a flat role field

A flat `user.role = 'admin' | 'partner' | 'customer'` cannot express "Person X is
Research Contributor on Project B and also a public customer" without either
inventing a combinatorial role for every combination, or silently upgrading a
user's global access because of one project relationship. CLAUDE.md §10 is
explicit that contextual assignments must narrow, never broaden — a flat role
field structurally cannot guarantee that property. The chain below can, because
every grant is scoped by construction.

## 2. The five entities

```
core.role_profile(id, name, description, status)
core.permission(id, resource_type, action, description)
                 -- e.g. ('sample', 'create'), ('protocol', 'approve'), ('order', 'refund')
core.role_profile_permission(role_profile_id, permission_id)   -- join table
core.scope(id, scope_type, scope_ref_id)
                 -- scope_type: platform | program | project | location | competition
                 --             | session | experience
                 -- scope_ref_id: null when scope_type = 'platform', else FK to the
                 -- referenced entity's id (validated by scope_type at the app layer)
core.assignment(id, user_account_id, role_profile_id, scope_id, granted_by,
                 granted_at, valid_from, valid_to(nullable), status[active|revoked|expired])
```

Role Profiles and Permissions are **data, not code** — adding "Content Editor" or
"Sensory Panel Lead" is an insert into `role_profile` and
`role_profile_permission`, not a deploy. This is what makes the "add non-developer
collaborator roles later without rework" requirement (CLAUDE.md team context)
already satisfied by the model as specified, rather than deferred.

## 3. Scope containment — the "narrow, never broaden" rule made concrete

Scope types are **not** a strict single tree. Containment rules per type:

- `platform` contains everything. An Assignment scoped to `platform` grants the
  Role Profile's permissions everywhere. This is the only scope type with
  unbounded reach — reserved for the Admin/owner surface.
- `program` contains its child `project`s. An Assignment scoped to a Program
  grants access to all Projects under that Program, but not to sibling Programs,
  and not platform-wide.
- `project` grants only within that Project — not its parent Program, not other
  Projects, even ones in the same domain tag.
- `location`, `competition`, `session`, `experience` are **leaf scopes** — they
  grant only within that specific entity and do not inherit from or grant to any
  Project/Program that references them. A Location scope for a farm visit does
  not imply access to the Research Project that also references that Location.

The resolver never walks *upward* from a narrow scope to imply broader access.
Containment only flows downward from `platform`/`program`. This is the literal
mechanism behind "contextual assignments should normally narrow permissions
rather than automatically broaden them" (CLAUDE.md §10) — it's not a review
guideline, it's what the containment table allows the resolver to do.

## 4. Permission resolution algorithm

To check "can User U perform Action A on Resource R (which lives at some concrete
scope target, e.g. Project P or Location L)":

1. Load all `active` Assignments for U where `now()` is within `[valid_from,
   valid_to)`.
2. For each Assignment, determine whether its Scope contains R's actual location
   in the containment hierarchy (§3) — `platform` always matches; `program`
   matches if R's Project's Program equals the Assignment's Program; `project`
   matches only if R's Project equals the Assignment's Project; leaf scopes match
   only on exact identity.
3. Collect the Permissions granted by the Role Profile of every Assignment that
   matched in step 2.
4. Grant if `(resource_type(R), A)` is in that collected set **and** (for records
   carrying a classification — `SECURITY.md` §4) U's resolved access also clears
   R's classification level. Classification is an independent AND-gate, not
   folded into the permission set itself, so "can edit" and "can see this
   confidential record" are never accidentally conflated.
5. Deny otherwise. There is no implicit default-allow anywhere in this chain —
   absence of a matching Assignment is a deny, not a fallback to public-level
   access.

This resolution runs server-side, in one shared authorization service used by
every module (`SECURITY.md` §2) — no module implements its own permission check
against these tables directly, to keep the "narrow, never broaden" guarantee in
one place instead of re-derived per module with room for drift.

## 5. Standard Role Profiles for v1 (seed data, not schema)

Concrete starting Role Profiles — editable data, listed here so the MVP has
something to assign, not a closed list:

- **Platform Admin** (scope: platform) — full permission set.
- **Content/Ops Coordinator** (scope: platform or program) — story/content and
  project-operations permissions, explicitly excluding research-approval and
  competition-result permissions. This is the profile that satisfies "non-developer
  collaborator" from day one.
- **Research Lead** (scope: project) — full research module permissions within
  that project, including protocol approval.
- **Research Contributor** (scope: project) — create/edit measurements and
  evidence, no approve/publish.
- **Partner Field Collector** (scope: project or location) — task/data
  submission, media upload, no approval permissions.
- **Sensory Judge** (scope: session) — submit assessments only, no visibility into
  other judges' scores or blind-code mapping.
- **Customer** — not an Assignment-based profile; every authenticated
  UserAccount without further Assignments gets the implicit baseline "Registered
  Customer" permission set (My Néctar, ordering, booking) enforced as a default
  in the authorization service, not via a phantom "everyone" Assignment row.

## 6. Sensitive record classification (companion axis)

`public | registered | partner | internal | confidential | trade_secret`
(CLAUDE.md §10) is stored per record (or inherited from parent entity where a
child table doesn't need its own, e.g. an Assessment inherits its SensorySession's
classification unless explicitly overridden). This axis is checked in resolution
step 4 above and is orthogonal to the Assignment/Scope chain — a Research Lead
with full project permissions still cannot see a `trade_secret`-classified
protocol unless their resolved access separately clears that classification
(classification clearance is itself modeled as a Permission,
e.g. `('classification', 'view_confidential')`, grantable via the same Role
Profile mechanism).

## 7. Blind-evaluation special case

Competition and Sensory blind coding (CLAUDE.md §29: "never reveal sample identity
to a judge during blind evaluation unless protocol explicitly allows it") is
enforced as a classification + resolution rule, not a UI-only hide: the mapping
table between `blind_code` and the real `sample_id`/`entry_id` is its own table
with its own restrictive Role Profile requirement (e.g. only Head Judge / Admin
Role Profiles carry `('blind_mapping', 'view')`), so a Judge's resolved
permission set genuinely cannot query the mapping — it is not merely absent from
the screen they're shown.

## 8. Audit

Every Assignment create/revoke and every classification-clearance grant is a
mandatory `AuditEvent` row (`SECURITY.md` §6) — permission changes are exactly the
category of event CLAUDE.md §35 calls out as always requiring an audit trail.

## 9. Testing requirement

Per CLAUDE.md §57, RBAC tests are mandatory, not optional coverage: for each
Role Profile defined in seed data, an automated test asserts both a positive case
(the profile's permissions succeed within its scope) and a negative case (the
same profile's permissions fail outside its scope, and fail against a
classification it doesn't clear). This is scoped as explicit work in
`MVP_ROADMAP.md` Slice 1 (Identity), not deferred to "later hardening."
