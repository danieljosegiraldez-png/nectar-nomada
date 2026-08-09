# Néctar Nómada Platform — Claude Code Starter Package

This is everything you need to hand this project to Claude Code and start the
architecture phase. Follow these steps in order.

---

## What's in this package

```
nectar-nomada/
├── CLAUDE.md                                  ← your platform spec (Claude Code reads this automatically)
├── 00_FIRST_SESSION_PROMPT.md                  ← the message you paste into Claude Code first
├── README_SETUP.md                             ← this file
└── docs/
    └── architecture/
        └── PLATFORM_OVERVIEW_draft.md          ← starting reference doc, for Claude Code to build on
```

---

## Step 1 — Install Claude Code (skip if already installed)

macOS / Linux / WSL:
```bash
curl -fsSL claude.ai/install.sh | bash
```

Windows PowerShell:
```powershell
irm https://claude.ai/install.ps1 | iex
```

Verify:
```bash
claude doctor
```

You'll need a Claude Pro, Max, Team, or Enterprise subscription — or a Console
(API) account — to log in.

---

## Step 2 — Set up the project folder

Move this entire package to where you want the project to live, then turn it
into a git repo:

```bash
cd path/to/nectar-nomada          # this folder, wherever you placed it
git init
git add .
git commit -m "Initial spec: CLAUDE.md, first-session prompt, platform overview draft"
```

(Optional but recommended: create a matching empty repo on GitHub and push,
so you have remote backup from day one.)

---

## Step 3 — Fill in one blank

Open `00_FIRST_SESSION_PROMPT.md` and fill in the one bracketed field near the
bottom of the prompt block:

```
Team/ops context: [YOUR ANSWER]
```

e.g. "solo-maintained for now, may grow to a small team later." Everything
else in that file is ready to use as-is — the stack itself is intentionally
left for Claude Code to propose and justify, not pre-decided.

---

## Step 4 — Start Claude Code and paste the first prompt

```bash
cd path/to/nectar-nomada
claude
```

Once you're in the interactive session, paste the entire prompt block from
`00_FIRST_SESSION_PROMPT.md` (the part inside the triple backticks under
"Step 1 — the actual first message").

Claude Code will read `CLAUDE.md`, inspect the (currently near-empty) repo,
and produce the nine architecture documents listed in the prompt — including
its own version of `PLATFORM_OVERVIEW.md`, `DOMAIN_MODEL.md`, `RBAC.md`,
`DATA_ARCHITECTURE.md`, and the rest. It should **stop after that** and wait
for your review, rather than jumping into code.

---

## Step 5 — Review before approving

Use the checklist in `00_FIRST_SESSION_PROMPT.md` (Step 2 section) to check
the generated docs before giving the go-ahead. In particular:

- Does the RBAC doc actually implement the assignment/scope chain from
  CLAUDE.md, not a flat admin/user role?
- Does the domain model keep Person, User Account, and contextual Role
  separate?
- Is environmental time-series data architected separately from the
  transactional database?
- Is AI explicitly barred from being an authoritative source or approving
  scientific conclusions?
- Are open decisions logged in `DECISIONS.md` with reasoning, not just
  silently picked?

Send anything fuzzy back for revision before moving to schema/migrations or
any actual application code.

---

## Step 6 — Proceed to implementation

Only after the architecture docs are approved, tell Claude Code to continue
with schema/migrations, the application shell, and the first vertical slice —
see the "Step 3" section of `00_FIRST_SESSION_PROMPT.md` for that follow-up
prompt and a note on why starting with Identity/RBAC (rather than Public
Discovery, as listed first in CLAUDE.md) is worth considering.

---

## A note on pace

This spec describes a large, multi-module platform. Expect this to take many
Claude Code sessions across weeks, not one sitting. Use `/resume` to continue
prior sessions, keep `DECISIONS.md` up to date as the source of truth for
choices already made, and hold Claude Code to one vertical slice at a time —
your own spec's Section 50 (Development Methodology) and Section 60 already
say this explicitly; it's worth re-stating it back to Claude Code if it starts
to sprawl.
