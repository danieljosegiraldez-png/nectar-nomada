# Adaptive Operator Workspace — Research Prompt

> **Status note, added on filing (2026-08-12).** This document was drafted
> outside the repository and existed only in conversation until now; it is the
> companion `16_ADAPTIVE_OPERATOR_WORKSPACE_PREAMBLE.md` refers to. Read that
> preamble first — **where it and this document disagree, the preamble wins.**
>
> Three things have changed since this was written, and they change what it is
> for:
>
> 1. **T10 (Operator Workbench) is built and verified live.** This prompt was
>    written to shape T10's design. It no longer does. Its remaining value is
>    refinement of what exists, plus design input for A5 (the apiary operator
>    UI) and later multi-role context-switching work.
> 2. **Apiary is now in v1**, reversing what the preamble §5 says. The apiary
>    scenarios below are no longer "forward research."
> 3. **The apiary addendum below proposes its own apiary data model. It is
>    superseded.** The real model is in `22_APIARY_V1_SCOPING_REPORT.md` as
>    revised by `24_`: `Apiary` is a `Location` row (not a new table);
>    `Inspection` and `ColonyEvent` are separate tables (feeding, treatment and
>    passing observations are *not* inspections); `HoneyBatch` is a `Lot` with
>    `lotType: "honey"`. Where the addendum's model differs, those documents
>    govern. Read the addendum for its **UX** content — the workflows, the
>    field-capture patterns, the scenarios — not for its schema.

---

I am designing the authenticated operator experience for the Néctar Nómada
platform.

Néctar Nómada is a modular digital platform that connects coffee farms,
producers, coffee processing, fermentation, drying, storage, lot traceability,
sensory evaluation, research, apiaries, beverages, tourism, commerce,
consulting, media/content, marketing/community management, and AI-assisted
operations.

The operator interface must NOT be a generic admin dashboard.

The central requirement is that the interface continuously adapts to:

```text
USER + ORGANIZATION/FARM + PROJECT + ROLE + ASSIGNMENT + PERMISSIONS
+ AVAILABLE TOOLS + CURRENT TASK/OBJECT + DEVICE/CONNECTIVITY
```

The same human may perform different roles in different contexts:

```text
User A
  Néctar Nómada Internal   → Project Manager
  Finca Las Nubes          → Researcher
  Kiva Estate              → Field Operator
  Competition 2026         → Judge
```

The system should not require separate accounts or different applications. The
navigation, homepage, actions, data visibility and AI assistance should adapt to
the user's **effective working context**.

---

## 1. Research objective

Research current, active software interfaces and UX patterns that can inform
this architecture. Do not look only for attractive dashboards. Study systems
that solve some combination of: role-based interfaces; multi-organization
context; farm/location scoping; project assignments; workspace switching;
permission-aware navigation; tool entitlement; adaptive dashboards; contextual
actions; field/mobile operations; data-heavy workflows; operator efficiency;
contextual AI; multi-tenant SaaS; hierarchical permissions.

Use current products and official documentation where possible.

## 2. References to study

- **Cropster** (https://www.cropster.com/) — locations, coffee workflows,
  users/roles, permissions, cupping, quality, lot/process context, mobile
  operator workflows. Focus on how responsibilities and locations affect what
  users can access and do.
- **Grafana** (https://grafana.com/) — organizations, teams, folder/dashboard
  permissions, inherited permissions, resource isolation.
- **Odoo** (https://www.odoo.com/) — multi-company context, role-dependent
  modules, context switching, business app visibility. Study its
  permission/context architecture, not its visual design.
- **Linear** (https://linear.app/) — contextual navigation, workspace/project
  switching, command palette, fast actions, information density.
- **Retool** (https://retool.com/) — internal tools, role-based apps, resource
  permissions, contextual tool access.
- **Appsmith** (https://www.appsmith.com/) — internal tools, RBAC, application
  composition, operator workflows.

Find 5–10 additional current references relevant to farm management, field
operations, agricultural SaaS, traceability, multi-location operations,
laboratory/research systems, industrial/production operations, and
permission-aware dashboards. Prioritise systems where the UI meaningfully
changes based on role, location, project, assignment or responsibility. Do not
add references only because they look modern.

**Copyright discipline** (this repository's standing rule): extract structural
and interaction *patterns* and rebuild them in this platform's own words.
Do not reproduce layouts pixel-for-pixel, proprietary illustrations,
photography, brand colours, interface text or icons.

## 3. Core architecture to evaluate

```text
USER → MEMBERSHIP → ORGANIZATION → FARM/LOCATION → PROJECT ASSIGNMENT
     → ROLE → CAPABILITIES → TOOL ENTITLEMENTS → EFFECTIVE CONTEXT → ADAPTIVE UI
```

Determine whether this is appropriate. **See preamble §3(a): scope containment
is fixed and is not a strict tree.** Design within it.

## 4. Distinguish these concepts

- **Role** — what function is this person performing? (Researcher, Field
  Operator, Project Manager, Sensory Judge, Head Judge, Marketing, Producer,
  Consultant, Admin)
- **Scope** — where can that role operate? (Organization, Farm, Location,
  Project, Lot, Sensory Session, Competition)
- **Capability/Permission** — what is the user allowed to do? (`lot.read`,
  `measurement.create`, `sensory.submit`, `research.approve`, `media.publish`)
- **Tool entitlement** — which tools appear? (Lots, Processing, Fermentation,
  Drying, Storage, Sensory, Research, Media, Reports)

Do not use a large number of hyper-specific roles to solve what capabilities
and scopes should solve. **See preamble §2 for this platform's actual names,
and §4: tool entitlement is derived, never stored.**

## 5. Effective context

Design the concept of an `EffectiveContext`: user, organization,
farm/location, project, active role, capabilities, available tools, current
object, current task, device, connectivity, session restrictions.

This context should determine navigation, homepage, quick actions, visible
tools, visible records, and AI tool access.

```ts
type EffectiveContext = {
  userId: string;
  organizationId?: string;
  locationId?: string;
  projectId?: string;
  sessionId?: string;
  roles: RoleAssignment[];
  capabilities: Capability[];
  toolEntitlements: ToolKey[];
  currentResource?: ResourceRef;
  sessionPolicies?: SessionPolicy[];
};
```

Evaluate this shape; do not adopt it blindly.

## 6. Context switcher

Research and propose a context switcher. Switching context may change tools,
navigation, tasks, allowed actions, homepage and AI context — not merely filter
data. Evaluate how to avoid user confusion when context changes, and how to make
the active context unmistakable so cross-farm data entry cannot happen by
accident.

## 7. Adaptive navigation and homepage

Propose how navigation is constructed dynamically:

```text
Base Navigation + Context Tools + Role Capabilities
+ Current Resource Actions + Session Restrictions
```

The home surface should reflect what matters *now* — what needs attention, what
is active, what is scheduled today, and quick capture. Research good patterns
for this. Do not assume any specific menu or panel set is correct; recommend.

## 8. Current work / object context

The interface should recognise what the user is currently working on. Standing
at a fermentation, the operator should not have to select farm → project → lot
→ fermentation again to record against it. Research contextual action patterns.

## 9. Command palette and quick actions

Evaluate a Linear-style contextual command pattern (⌘K), with the command list
adapting to permissions and context.

## 10. Mobile field mode

Research mobile-first operator workflows. Field mode should prioritise QR scan,
quick capture, offline draft, recent records, measurements, photos, voice notes,
next task, and current lot/process. **Do not simply shrink the desktop sidebar.**
Build on `OFFLINE_FIELD_CAPABILITY.md` (preamble §3(d)) rather than re-deriving
offline behaviour.

## 11. Permission-aware UI

Distinguish `HIDDEN`, `VISIBLE_READ_ONLY`, `DISABLED_WITH_REASON`, `AVAILABLE`.
Research best practice for when each is appropriate. These are *renderings* of
the resolved permission set, never a separate source of truth — the frontend is
not the security boundary (`SECURITY.md` §2).

## 12. Ask Néctar context

Ask Néctar should inherit current context and permissions. It may answer "which
lots need measurement?" for a user with `lot.read`; it must not answer "show me
all data from Farm B" without permission. Research how contextual AI assistants
are integrated into enterprise/operator tools. **See preamble §3(c): the modes,
router and `ai:converse` permission are already decided.**

## 13. Session restrictions

Certain contexts impose temporary restrictions — a competition judge under blind
conditions must not see origin, producer, process, previous scores or AI
predictions. **See preamble §3(b): this already exists as normal RBAC in this
platform. Design the interface on top of it; do not design a parallel
mechanism.**

## 14. Multi-farm / multi-organization

Research patterns for users working across multiple farms and organizations.
The interface must make active context obvious and avoid accidental cross-farm
data entry. Consider cases where a project spans multiple farms, a farm hosts
multiple organizations, or a user is project-scoped but not farm-wide.

## 15. My Work vs Current Context

Distinguish a personal cross-context view (tasks from every assigned farm,
project and competition) from a current-context operational view (this farm
only). This matters for multi-project staff.

## 16. Tasks vs modules

Operators should not have to think in software modules. Sometimes task-first
navigation is better: a list of what to do today, where clicking a task opens
the correct tool in the correct context. Research when task-first versus
module-first navigation works best.

## 17. Attention and notifications

Design attention states — `INFO`, `DUE`, `WARNING`, `BLOCKED`,
`REVIEW_REQUIRED`. Avoid excessive red badges. Research actionable notification
UX. Note that the `Notification` entity is specified (`DOMAIN_MODEL.md` §5) and
not built.

## 18. Handoffs

Research workflows where one role hands work to another — field operator →
researcher, researcher → sensory panel, sensory → reporting, content creator →
approver. The interface should expose ownership and state.

## 19. Density modes

Different users need different density: field (low density, action-first),
operator (medium-high, status-first), research (high, data-first), public (low,
narrative). Keep one design system.

## 20. Required user scenarios

Produce at least 10 detailed scenarios, each showing active context,
navigation, homepage, quick actions, visible tools, restricted tools, Ask
Néctar access and mobile behaviour:

1. Farm operator, one farm
2. Operator across three farms
3. Researcher across multiple projects
4. Producer with access only to their own farm
5. Sensory assessor
6. Competition judge under blind restrictions
7. Head judge
8. Marketing/content operator
9. Consulting project manager
10. Platform administrator

## 21. Required matrices

**Reference matrix** — for each product studied: specific interface,
role/context pattern, permission pattern, navigation pattern, farm/location
applicability, mobile applicability, what to borrow, what not to copy.

**Permission matrix** — role, scope, capability, tool, UI visibility, backend
enforcement, AI access, with representative examples.

## 22. Required wireframes

Conceptual wireframes for: operator home (desktop and mobile); context
switcher; lot/fermentation context with contextual quick actions; researcher
home; judge/blind session; marketing workspace; My Work across assignments.

## 23. MVP recommendation

Recommend the smallest adaptive operator workspace MVP. Likely elements to
evaluate: effective context, context switcher, role/capability-aware
navigation, My Work, farm/project home, contextual actions, server-side
permission enforcement. Do not include every tool.

## 24. Risks to address

Role explosion; permission complexity; hidden context; accidental cross-farm
data entry; over-personalization; inconsistent navigation; AI permission
leakage; mobile complexity; context-switch confusion; performance; too many
dashboards; excessive configuration.

## 25. Constraints

This is research and UX architecture only. Do **not** implement code, design
production schema, create migrations, choose a final component library,
redesign the current production UI, create AI agents, change RBAC, or build
navigation.

## 26. Output

Structure the response as `ADAPTIVE_OPERATOR_WORKSPACE_REFERENCE_RESEARCH.md`:
executive summary; design problem; research references; reference comparison;
core UX principles; role vs scope vs capability vs tool; effective context
architecture; multi-organization/multi-farm UX; context switcher; adaptive
navigation; adaptive home; My Work vs current context; contextual actions;
command palette; mobile field mode; permission-aware UI; session restrictions;
Ask Néctar context; task/notification system; tool entitlements; handoffs;
density modes; user scenarios; permission matrix; context model; navigation
model; wireframes; risks; recommended MVP; product decisions needed.

Be specific and opinionated. Do not produce a generic dashboard-design summary.

---

# Addendum — Beekeeper / Apiary Operator Scenario

> **Superseded as a data model — read for UX only.** See the status note at the
> top of this document. `22_APIARY_V1_SCOPING_REPORT.md` (as revised by `24_`)
> is the authority on apiary entities: `Apiary` is a `Location`; `Inspection`
> and `ColonyEvent` are separate tables; `HoneyBatch` is a `Lot`. The workflow
> and field-capture content below remains useful and informed that scoping.

A beekeeper may be responsible for one apiary or several sites. The interface
should adapt to user + organization + apiary site + hive/colony + season +
current objective + role + permissions + available tools.

Operational activities include: apiary management, inspections, colony health
management, hive population management, colony divisions/splits, queen
management, pollination management, honey harvest, terroir/sensory work, raw
honey processing, and commerce.

The same beekeeper may hold different roles at different sites (lead beekeeper
at one, operator at another, pollination technician at a third) without separate
accounts. The active apiary context must be clearly visible to reduce accidental
entry against the wrong site.

**Single-site home** should surface what needs attention (colonies requiring
follow-up, unresolved queen status, colonies scheduled for division, health
checks due), what is scheduled today, current colony counts by condition, and
quick actions (inspection, health observation, division, queen record,
feeding/treatment, harvest, photo, note). Do not assume these exact categories
or thresholds are correct — research and recommend.

**Multi-site home** should provide a cross-site "My Apiaries" view summarising
each site's outstanding work, with a path into a single apiary's context.

**Hive/colony detail** should make the current hive implicit context so the
operator does not reselect site and hive for every entry.

**Inspection workflow** should prioritise fast mobile entry: date/time, apiary,
hive, operator, queen observed, brood, population strength, brood pattern, food
stores, comb condition, temperament, swarming indicators, queen cells,
pests/disease, interventions, photos, notes, next action. **Do not require all
fields for every inspection**; use protocols or templates where appropriate.

**Colony health** should support structured observation and intervention
without pretending to diagnose. AI may flag recorded patterns or incomplete
follow-up; AI must not convert field observations into veterinary or biological
diagnosis.

**Colony divisions** should preserve lineage — parent colony, division date,
operator, queen status, resources transferred, destination apiary, new hive IDs,
follow-up — so "which colonies originated from H-021" is answerable. A division
is not an unrelated new hive. *(Structurally this is the same shape as
`lot_transformation` with separate input/output rows; see preamble §5.)*

**Queen management** may include observation, marking, introduction, acceptance,
rejection, loss, replacement, rearing, cells and mating status. Do not build
advanced breeding/genetics functionality unless current requirements support it.

**Pollination management** should connect deployments to farm, project and
apiary rather than becoming isolated beekeeper notes.

**Honey harvest** must preserve hives → harvest → honey lot, since multiple
hives may contribute to one lot. **Raw honey processing** should distinguish
actual recorded processing steps from marketing descriptors — do not imply
pasteurisation, filtration or floral origin unless explicitly recorded.

**Terroir and floral context** must distinguish *surrounding flora observed*
from *confirmed botanical origin*; the latter requires specific evidence.
**Honey sensory** uses the platform's shared sensory architecture with honey
protocols; do not infer descriptors from location or flora.

**Commerce**: a honey lot may become a sellable product exposing approved public
information. Private health records, treatments and internal observations must
not automatically become public commerce content.

**Mobile field mode** should prioritise scanning a hive, opening it as context,
and recording inspection, health, queen event, division or harvest with photo
and voice note. Offline drafts matter — apiary sites often have limited
connectivity.

**Add two further scenarios** to §20: a beekeeper responsible for one apiary,
and a beekeeper responsible for several apiaries and pollination projects. For
the latter, also show My Work, context switcher, cross-site alerts and
site-specific home.

**Key question to evaluate explicitly:** can one adaptive operator architecture
support both a coffee operator and a beekeeper without separate applications —
a shared operator platform whose domain tools change by context and entitlement?
Identify what should be shared (people, organizations, locations, projects,
tasks, measurements, observations, media, sensory, reports, commerce, AI, audit)
and what must remain domain-specialized. Do not force domain-specific objects
into generic models where doing so destroys important semantics.
