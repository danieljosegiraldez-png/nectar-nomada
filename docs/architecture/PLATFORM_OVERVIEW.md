# Platform Overview — Néctar Nómada Digital Platform

**Status: v1 — architecture baseline.** Supersedes `PLATFORM_OVERVIEW_draft.md`, which
remains in the repo as historical input, not as a living doc. Where this file and the
draft disagree, this file wins; the disagreement (if any is substantive) is logged in
`DECISIONS.md`.

---

## 1. Repository state at time of writing

Empty except for `CLAUDE.md`, `docs/architecture/PLATFORM_OVERVIEW_draft.md`, a
`README_SETUP.md`, and `00_FIRST_SESSION_PROMPT.md` — no code, no schema, no
dependencies installed. This document and its siblings are the first substantial
output. There is no prior implementation to preserve or conflict with; every choice
below is a fresh decision, not a reconciliation.

## 2. What this platform is

Néctar Nómada is a relational knowledge graph, not a store, blog, or dashboard
collection. A shared canonical layer — Person, Organization, Location, Project,
Product, Experience, Event, Sample, Asset, Role/Permission/Assignment — is referenced
by every domain module (commerce, research, sensory, competitions, environmental
data, partner workspace) rather than re-created inside each one. The same Finca
Rosina record is the Organization + Location that coffee lots, apiary records,
research projects, products, and stories all point back to.

The commercial layer (shop, bookings) and the scientific layer (research, sensory,
provenance) are both first-class and are never conflated: a product description is
not evidence; a scientific measurement is not a sales asset.

## 3. Provenance and evidence model (system-wide, not research-only)

Every fact carries a provenance classification:

`measured fact | original record | direct observation | scientific evidence |
manufacturer specification | interpretation | hypothesis | conclusion |
recommendation | AI-generated suggestion`

- AI is never authoritative and never silently fills missing values.
- Missing data stays labeled `Missing / Unknown / Unconfirmed / Pending verification`
  — never inferred and saved as fact.
- Approved protocols/documents are versioned, never overwritten in place.
- Traceability chains (Harvest → Lot → Treatment → Fermentation → Drying → Sample →
  Analysis → Product) are preserved end to end via foreign keys, not free text.

This rule is enforced structurally in `DATA_ARCHITECTURE.md` (provenance columns are
mandatory, not conventions) and `AI_GOVERNANCE.md` (AI has no write grant to
authoritative tables).

## 4. Role-aware experience, one platform

One deployable application, five identity-driven surfaces:

| Identity | Primary workspace |
|---|---|
| Public visitor | Discover (map, story, product, experience) |
| Registered customer | My Néctar (orders, bookings, sensory history, saved items) |
| Implementing partner | Partner Workspace (tasks, uploads, forms, reports) |
| Researcher | Research Workspace (experiments, protocols, samples, evidence) |
| Admin/owner | Platform Command Center (all modules + data quality + AI oversight) |

No separate apps per surface. Surface is derived from the resolved permission set for
the signed-in identity (or lack thereof), not from a hard-coded role field. See
`RBAC.md` for the resolution mechanism.

## 5. Architecture style

**Modular monolith.** One Next.js/TypeScript application (see `DATA_ARCHITECTURE.md`
and `DECISIONS.md` ADR-004) with strict internal module boundaries — each domain
module (commerce, research, sensory, competitions, environmental, partner workspace)
owns its own service layer and database tables, and reaches other modules only
through the canonical entity layer or an explicit internal API, never through direct
cross-module table joins on module-private tables. This gives most of the
maintainability benefit of service boundaries (Section 43, API-first) without the
operational cost of running and coordinating separate deployable services for a
solo-maintained project. A module boundary can be extracted into a real service later
if load or team growth justifies it — the internal API discipline is what makes that
extraction possible without a rewrite.

## 6. Core modules (v1 candidates, unchanged from draft)

Discover · Map & Territory · Environmental Data · Project System · People &
Organizations · Commerce · Experiences & Reservations · Events · My Néctar · Story &
Knowledge Engine · Research OS · Agricultural Traceability · Sensory Evaluation ·
Competitions.

Not all ship in v1 — see `MVP_ROADMAP.md` for sequencing. Their data model is
designed together now (`DOMAIN_MODEL.md`) so later modules attach to canonical
entities instead of forcing a migration.

## 7. Explicit non-goals for v1

Carried directly from CLAUDE.md Section 49:

- No single giant table; no duplicated canonical entities across modules.
- No hard-coded sensory protocol or competition scoring system.
- AI never authoritative; never silently mutates scientific records.
- No JSON-blob-everything; no large media inside the SQL database.
- No exposing confidential research to public users.
- No treating all environmental data sources as equivalent.
- No commerce-as-the-organizing-model.
- No desktop-only or static-marketing-only build.
- No microservices split at this stage (Section 5 above).
- No multi-developer tooling overhead (CI matrices, monorepo build orchestration)
  beyond what a solo maintainer benefits from directly — see `MVP_ROADMAP.md` team
  context.

## 8. Technology direction (summary — full reasoning in DECISIONS.md)

| Layer | Choice |
|---|---|
| Frontend + backend | Next.js (App Router) + TypeScript, single deployable |
| Database | PostgreSQL + PostGIS |
| ORM | Prisma |
| Environmental time-series | Same Postgres instance, declarative range-partitioned tables (not a separate DB for v1) |
| Object/media storage | S3-compatible (Cloudflare R2) |
| Auth | Auth.js (self-hosted credentials + OAuth), custom RBAC tables — not vendor RBAC |
| Hosting | Vercel (app) + managed Postgres (Neon) + R2 |
| Payments | Stripe |
| Maps | Mapbox |
| Search | Postgres full-text search (v1), migration path to dedicated search later |
| AI | Provider-agnostic adapter, default Anthropic Claude |

Each row is a decision with trade-offs, recorded with reasoning in `DECISIONS.md`
(ADR-001 through ADR-011). None of this is provisional or "and we'll revisit" —
these are the v1 choices; revisiting any of them is itself a future ADR, not an
open question left over from this pass.

## 9. Team and operational context

Solo-maintained (Daniel) for now. Nathy Rubio assists with project operations and
content, not software development. Implications:

- Optimize for low operational surface area: managed services over self-hosted
  infrastructure wherever the cost/control trade-off is reasonable (see
  `DECISIONS.md` ADR-007).
- No multi-developer workflow tooling (branch protection ceremony, code-owner
  routing, etc.) is being designed in now — RBAC itself, however, is built to add
  non-developer collaborator roles (content/ops) later without rework, since that is
  a data-model concern, not a tooling concern. See `RBAC.md` §6.
- Documentation (this doc set) is written to let a future second developer or a
  future Claude Code session pick the project up cold — it is not a personal
  scratchpad.

## 10. How the remaining documents relate

- `DOMAIN_MODEL.md` — canonical entities, the Person/User Account/Role distinction,
  and how domain modules attach.
- `DATA_ARCHITECTURE.md` — Postgres schema conventions, time-series partitioning,
  object storage integration, provenance/versioning mechanics.
- `RBAC.md` — the Assignment/Scope/Role Profile/Permission chain and its resolution
  algorithm.
- `AI_GOVERNANCE.md` — the AI Suggestion → Review → Action loop and its technical
  enforcement.
- `INTEGRATIONS.md` — adapter boundaries for every external system.
- `SECURITY.md` — authn/authz enforcement, secrets, audit, and the specific threats
  this platform's data (research evidence, competition blind coding, customer PII)
  is exposed to.
- `MVP_ROADMAP.md` — vertical slice sequencing, with the Identity-first deviation
  from CLAUDE.md Section 53's listed order explained and justified.
- `DECISIONS.md` — the ADR log; the source of truth for "why," updated every session.
