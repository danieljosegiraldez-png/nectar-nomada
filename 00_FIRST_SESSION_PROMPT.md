# First Claude Code Session — Copy/Paste Prompt

Use this as your literal first message to Claude Code, inside the project folder
that already contains `CLAUDE.md` at its root.

---

## Step 0 — before you open Claude Code

You've indicated no stack preference — that's fine. This package is set up so
Claude Code will propose the full stack itself, with reasoning logged in
`DECISIONS.md`, rather than picking silently. It's still worth deciding one
thing yourself before you start, since it's more about how you work than
what technology is used:

- **Budget/ops complexity tolerance**: solo-maintained vs. eventually a small
  team? This shapes how much operational complexity (managed hosting vs.
  self-hosted, number of external services) is reasonable to accept.

Everything else — framework, database, hosting, auth — is intentionally left
open in the prompt below so Claude Code proposes it and justifies the choice
against the constraints already baked into your spec (Postgres-shaped data
model, object storage for media, modular monolith, no premature microservices).
Review its proposal before approving; don't just accept the first answer.

---

## Step 1 — the actual first message

```
Read CLAUDE.md fully before responding.

Follow Section 60 (WHAT I WANT YOU TO DO FIRST) exactly, in order, but stop after
step 10 (create the architecture documentation) — do not create database
migrations, an application shell, or any vertical slice implementation yet.
I want to review the architecture docs before any code is written.

Repo is currently empty except for CLAUDE.md, docs/architecture/PLATFORM_OVERVIEW_draft.md,
and git init.

I have no stack preference — propose the full stack (frontend, backend,
database, time-series storage for environmental data, media/object storage,
auth, hosting) and justify each choice in DECISIONS.md rather than picking
silently. Weigh proposals against the constraints already in CLAUDE.md:
relational/provenance-heavy data model, large media never in the SQL database,
environmental time-series must scale to millions of rows without degrading
the transactional DB, modular monolith not microservices.

Team/ops context: Solo-maintained for now (Daniel). Nathy Rubio assists with
project operations and content, not software development — no need to design
for a multi-developer workflow yet, but keep the RBAC model ready to add
non-developer collaborator roles (e.g. content/ops) later without rework.

Deliverables for this session:
1. /docs/architecture/PLATFORM_OVERVIEW.md
2. /docs/architecture/DOMAIN_MODEL.md
3. /docs/architecture/DATA_ARCHITECTURE.md
4. /docs/architecture/RBAC.md
5. /docs/architecture/AI_GOVERNANCE.md
6. /docs/architecture/INTEGRATIONS.md
7. /docs/architecture/SECURITY.md
8. /docs/architecture/MVP_ROADMAP.md
9. /docs/architecture/DECISIONS.md

After producing these, stop and summarize the key architectural decisions and
open questions for me to confirm before you touch section 51 items 11-13
(schema/migrations, application shell, first vertical slice).
```

---

## Step 2 — what to check before approving

When Claude Code comes back with the docs, read them with these questions in mind
(this mirrors your own anti-fabrication standard — don't let assumptions slide
through unlabeled):

- [ ] Does `DOMAIN_MODEL.md` actually distinguish Person vs. User Account vs.
      contextual Role (per section 9)? This is easy to collapse by accident.
- [ ] Does `DATA_ARCHITECTURE.md` separate transactional data (Postgres) from
      time-series environmental data (per section 7's "millions of observations"
      requirement) — or is it treating everything as one flat schema?
- [ ] Does `RBAC.md` implement the User → Assignment → Scope → Role Profile →
      Permission chain (section 10), not a flat "admin/user" role field?
- [ ] Does `AI_GOVERNANCE.md` explicitly state AI is never an authoritative source
      and cannot approve scientific conclusions (sections 3 and 17)?
- [ ] Is the MVP roadmap actually the vertical slices from section 53, in that
      order, or has scope crept back into "build everything at once"?
- [ ] Are open assumptions logged in `DECISIONS.md` with reasoning — not silently
      resolved?

If any of these are missing or fuzzy, send Claude Code back to revise that specific
doc before moving forward. It's much cheaper to fix the domain model on paper than
after three vertical slices are built on top of it.

---

## Step 3 — after architecture is approved

Only then say something like:

```
Architecture docs approved. Proceed with section 51 items 11-13: create the
database schema/migrations, application shell, and implement Vertical Slice B
(Identity: Authentication, Profile, RBAC, My Néctar) first, since every other
slice depends on it.
```

Starting with **Slice B (Identity)** rather than Slice A (Public discovery) is a
deliberate deviation from the doc's listed order — auth and RBAC are the foundation
everything else (partner workspace, research permissions, sensitive records) sits
on. Worth raising this with Claude Code explicitly and deciding together.
