# Platform Overview — Néctar Nómada Digital Platform
**Status: DRAFT — for your review before Claude Code builds its own version**

This is a starting skeleton, not a finished architecture doc. Its purpose is to
give you something concrete to react to before Claude Code writes its version —
so you're negotiating from a document instead of a blank page. Treat every
placeholder marked `[DECIDE]` as a real decision point, not a filled-in answer.

---

## 1. What this platform is

Néctar Nómada is not a store, not a blog, and not a set of dashboards. It's a
relational knowledge graph — people, places, organizations, projects, samples,
and products all reference a shared canonical layer — expressed through
role-aware interfaces (public visitor, registered customer, implementing
partner, researcher, admin) on top of one data model.

The commercial layer (shop, bookings) and the scientific layer (research,
sensory, provenance) are both first-class, but they are **not the same thing**
and must never be conflated: a product's marketing description is not evidence,
and a scientific measurement is not a sales asset.

## 2. Canonical entity layer

These entities exist once and are referenced everywhere else — never
recreated per module:

- Person
- User Account
- Organization (Farm, Estate, Roaster, Brewery, Winery, Distillery, Apiary,
  Laboratory, Venue, Association, University, Supplier, Tour Operator, Partner)
- Location (with hierarchy: country → province/state → district → locality)
- Project / Program
- Product
- Experience
- Event
- Sample
- Asset (media)
- Role / Permission / Assignment

Domain modules (commerce, research, sensory, competitions, environmental data,
partner workspace) attach to these canonical entities rather than duplicating
them. Example: Finca Rosina is one Organization + one Location record, referenced
by its coffee lots, apiary records, research projects, products, and stories —
never re-entered per module.

## 3. Provenance and evidence model (non-negotiable, carried from Research OS)

Every fact in the system carries a provenance classification:

`measured fact | original record | direct observation | scientific evidence |
manufacturer specification | interpretation | hypothesis | conclusion |
recommendation | AI-generated suggestion`

Rules that apply system-wide, not just in the research module:

- AI is never an authoritative source and never silently fills missing values.
- Missing data stays labeled `Missing / Unknown / Unconfirmed / Pending
  verification` — it is never inferred and saved as fact.
- Approved protocols/documents are versioned, not overwritten. Old versions
  stay accessible.
- Traceability chains (Harvest → Lot → Treatment → Fermentation → Drying →
  Sample → Analysis → Product) are preserved end to end.

## 4. Role-aware experience, one platform

Same application, different surface depending on identity + permission +
intent:

| Identity | Primary workspace |
|---|---|
| Public visitor | Discover (map, story, product, experience) |
| Registered customer | My Néctar (orders, bookings, sensory history, saved items) |
| Implementing partner | Partner Workspace (tasks, uploads, forms, reports) |
| Researcher | Research Workspace (experiments, protocols, samples, evidence) |
| Admin/owner | Platform Command Center (all modules + data quality + AI oversight) |

RBAC chain: `User → Assignment → Scope (Platform/Program/Project/Location/
Competition/Session/Experience) → Role Profile → Permission`. Contextual
assignments narrow permissions; they do not broaden them. Project-level role
is never conflated with platform-level user role.

## 5. Core modules (v1 candidates)

- Discover (public exploration)
- Map & Territory (geospatial layer)
- Environmental Data (time-series, source-typed, never treated as one uniform stream)
- Project System (Programs → Projects → Subprojects, multi-domain tagging)
- People & Organizations (canonical identity)
- Commerce (Product/Variant/Order, connected to but not duplicating Project data)
- Experiences & Reservations (dedicated booking engine, not a commerce SKU hack)
- Events (distinct from recurring Experiences)
- My Néctar (registered user home)
- Story & Knowledge Engine (editorial, immutable original evidence)
- Research OS (experiments, protocols, evidence — highest rigor bar in the system)
- Agricultural Traceability (coffee first, cacao/apiculture to follow — no
  redesign required to extend)
- Sensory Evaluation (blind protocols, evaluators, panel results — kept
  separate from consumer "liking" data)
- Competitions (entries, flights, judging, results — pluggable scoring, not
  hard-coded to one system)

## 6. Explicit non-goals for v1

Carried directly from your "Do Not Do These Things" list — repeating here so
it's visible at the top level, not buried at line 1744 of the spec:

- No single giant table; no duplicated canonical entities across modules.
- No hard-coded sensory protocol or competition scoring system.
- AI never authoritative; never silently mutates scientific records.
- No JSON-blob-everything; no large media inside the SQL database.
- No exposing confidential research to public users.
- No treating all environmental data sources as equivalent.
- No commerce-as-the-organizing-model — commerce is one module among several.
- No desktop-only or static-marketing-only build.

## 7. Technology direction — no preference stated, Claude Code to recommend

No stack preference has been specified. Claude Code should propose the full
stack (frontend, backend, database, time-series storage, media storage, auth,
hosting) in its architecture pass, with reasoning for each choice recorded in
`DECISIONS.md` rather than picked silently. A few constraints already exist
in the spec itself and should shape those recommendations:

- Relational, provenance-heavy data model → a relational database (e.g.
  Postgres) is the natural fit; Claude Code should justify if it proposes
  otherwise.
- Environmental time-series data must scale to millions of observations
  without degrading the transactional database (Section 7) — this likely
  argues for a separate store or partitioned tables, not one flat schema.
- Large media must not live in the SQL database (Section 49) — object storage
  required.
- Architecture style: modular monolith, not microservices, unless the repo
  gives a strong reason otherwise (Section 59).
- No premature multi-app split — one platform, role-aware interfaces
  (Section 4).

Once Claude Code proposes a stack, review it against these constraints before
approving — don't just accept the first answer.

## 8. MVP sequencing (proposed deviation from spec's listed order)

The spec (Section 53) lists Vertical Slice A (Public discovery) first. This
draft proposes starting with **Identity (Slice B)** instead, since RBAC and
auth are load-bearing for every other slice — partner workspace permissions,
research confidentiality, and sensitive-record classification all depend on
it existing first. Flag this to Claude Code explicitly rather than letting it
default silently to the spec's listed order.

1. Identity — auth, profile, RBAC, My Néctar shell
2. Public Discovery — location, project, story, product, experience (read-only)
3. Commerce — product, cart, order
4. Experiences — session, booking
5. Partner Workspace — assignment, task, data submission, media upload
6. Sensory — session, blind sample, evaluator, assessment, panel results
7. AI — permission-aware assistant, data-completeness suggestions (last,
   deliberately — it needs the governed data model beneath it to be real first)

---

*This draft is meant to be argued with, not accepted as-is. Fill in Section 7,
confirm or reject the sequencing in Section 8, then hand both this file and
CLAUDE.md to Claude Code as grounding for its own architecture pass.*
