# Local development setup

Node.js (via `nvm`) was installed as part of this session. A **new** terminal
window will have `node`/`npm` on `PATH` automatically (the nvm installer
appended the necessary lines to `~/.zshrc`). If you're reusing an old shell,
run this first:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use --lts
```

## First-time setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — **Neon by default now** (DECISIONS.md ADR-022, ahead of
  ADR-007's original "at deploy time" plan): create a project at neon.tech
  and paste its connection string (use the pooled one Neon shows by
  default). Real Postgres has neither of the two limitations the local
  sandbox below runs into.
  <br>Optional fallback for offline/disposable local work: run
  `npx prisma dev` in another terminal and paste the `postgres://...` URL it
  prints instead — if you do, also set `SHADOW_DATABASE_URL` (see
  `.env.example`; not needed with Neon, which provisions its own shadow
  database correctly).
- `AUTH_SECRET` — generate one with `openssl rand -base64 32`. (Do **not**
  run `npx auth secret` — that resolves to an unrelated npm package named
  `auth`, maintained by Better Auth, and prints `BETTER_AUTH_SECRET`, which
  this codebase doesn't use. This app is Auth.js/`next-auth` per
  DECISIONS.md ADR-006; the only variable it reads is `AUTH_SECRET`.)
- Leave `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` blank to run with just the
  email/password provider.
- `STRIPE_SECRET_KEY` — a **test-mode** secret key from
  [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys)
  (starts `sk_test_`). Requires a free Stripe account; this can't be created
  on your behalf. Needed for Slice 3 checkout (DECISIONS.md ADR-025).
- `STRIPE_WEBHOOK_SECRET` — for local testing, install the
  [Stripe CLI](https://docs.stripe.com/stripe-cli) and run
  `stripe listen --forward-to localhost:3000/api/webhooks/stripe`; it prints
  a `whsec_...` value to use here. In production this comes from the
  webhook endpoint's settings in the Stripe Dashboard instead.
- `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET` —
  Cloudflare R2 object storage (DECISIONS.md ADR-003/ADR-029), needed for
  Slice 5's Partner Workspace media upload. Create a bucket and an API
  token scoped to it at [dash.cloudflare.com](https://dash.cloudflare.com)
  → R2. Requires a free Cloudflare account; this can't be created on your
  behalf.

Then:

```bash
npx prisma migrate dev   # applies prisma/migrations/, safe to re-run
npx prisma db seed       # seeds Permissions + Role Profiles (RBAC.md §5)
npm run dev              # http://localhost:3000
```

### Slice 7 (AI)

`prisma/migrations/*_slice7_ai` creates a restricted `ai_service` Postgres
role (NOLOGIN, no password) as part of the migration — deliberately, since
migration files are committed to git and must never contain a real secret.
After running migrations, give it a password yourself and build
`AI_SERVICE_DATABASE_URL`:

```bash
npx prisma db execute --stdin <<< "ALTER ROLE ai_service WITH LOGIN PASSWORD '$(openssl rand -hex 24)';"
```

That command doesn't print the password back to you on purpose (avoid
leaving it in shell history readably) — instead run it as two steps if you
need the value for the connection string:

```bash
PW=$(openssl rand -hex 24)
npx prisma db execute --stdin <<< "ALTER ROLE ai_service WITH LOGIN PASSWORD '$PW';"
echo "postgresql://ai_service:$PW@<your-neon-host>/<your-db>?sslmode=require"
```

Paste that into `.env` as `AI_SERVICE_DATABASE_URL`. Without it, `/ai`'s
"Scan for suggestions" button will fail — everything else in the app works
fine regardless.

## Getting a login

**There is no DEMO account any more.** The seeded DEMO identities were removed
from production on 2026-08-21 (ADR-066) — they held the only three passwords in
the database, which is why production briefly had no usable login at all
(ADR-067). Two operator scripts replace them.

```bash
npm run auth:grant-admin -- you@example.com    # Platform Admin at platform scope
npm run auth:set-password -- you@example.com   # prompts; needs a real TTY
```

Both act on a Person that **already exists**. Sign-up is not the way in for
someone already in the database: it creates a *new* Person, and these people
carry Assignments (CLAUDE.md §2 — do not duplicate canonical people).

`auth:set-password` prompts with echo off and refuses a password given as an
argument, which would survive in shell history and the process list. The first
Platform Admin has to come from outside the app because granting that role
requires `rbac:manage_permissions`, which only Platform Admin holds.

Note that most People have no email address yet, so they cannot be given a
password until one is set.

### DEMO seed data — local only

The `SEED_DEMO_*` gates still exist and still work, for a throwaway local
database:

```bash
SEED_DEMO_ADMIN=true npx prisma db seed
SEED_DEMO_CONTENT=true SEED_DEMO_PARTNER=true npx prisma db seed
SEED_DEMO_CONTENT=true SEED_DEMO_JUDGE=true npx prisma db seed
```

**Never against production.** `scripts/vercel-build.sh` clears all four gates
with `env -u` before seeding on a production deploy (ADR-064), precisely so a
stray dashboard variable cannot write demo content into the real research
record. Running them by hand bypasses that.

If demo rows do end up in production, `npm run data:remove-demo-places` removes
DEMO Locations and Organizations; note that ADR-066's project-subtree cleanup
did *not* reach those, because a Location carries no `projectId`.

## Common commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build. Generates the Prisma client, builds, *then* migrates and seeds — and only on a real production deploy (ADR-064, ADR-070) |
| `npm run typecheck` | `tsc --noEmit`. **Run before merging** — `npm test` passing says nothing about types (ADR-070) |
| `npm run lint` | ESLint |
| `npm test` | Vitest — 419 tests across RBAC, traceability, sensory, apiary, research, auth and the build guard. **Needs a database**; see below |
| `npm run test:db -- up` | Restore the newest *verified* backup into a local throwaway cluster and print `TEST_DATABASE_URL` |
| `npm run backup:db` | Dump production to `~/nectar-backups/<timestamp>/` |
| `npm run backup:verify -- <dir>` | Restore that dump into a throwaway cluster and compare row counts. A backup is unverified until this passes |
| `npm run secrets:seal` / `secrets:open` | Encrypt/decrypt `.env` for off-machine custody |
| `npm run auth:grant-admin -- <email>` | Grant Platform Admin at platform scope |
| `npm run auth:set-password -- <email>` | Set a credentials password (prompts; needs a TTY) |
| `npm run data:remove-demo-places` | Remove DEMO Locations/Organizations (ADR-071) |
| `npx prisma studio` | Browse the database in a GUI |
| `npx prisma migrate dev --name <description>` | New migration after a schema change |

### Running the tests

The suite used to run against production Neon. It no longer does, and
`tests/setup.ts` refuses a remote database unless `ALLOW_REMOTE_TEST_DB=1`:

```bash
npm run test:db -- up          # restores the newest verified backup locally
export TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"
npm test
```

## What's verified vs. not

*Last checked against the running system on 2026-08-22. Everything below was
observed, not inferred from architecture documents.*

**Verified now:**

- `tsc --noEmit`, `npm run lint`, `npm run build` — all clean; `npm test` — 419
  passing against a database restored from a verified backup.
- Production schema: `prisma migrate status` against Neon reports 40 migrations
  and "up to date". The last three production deployments are `Ready`.
- Sign-in works end to end: a real login against production recorded
  `last_login_at`, with an Argon2id hash and `status = active`.
- The classification AND-gate is enforced at every call site that has a record
  to gate on (ADR-068/069); `grep -rn CLASSIFICATION_GATE_DEFERRED lib app`
  returns no call sites.
- Producer export: `/api/export` returns 401 to an anonymous request and builds
  a zip for a caller holding `lot:export`.
- Backups: `backup:db` + `backup:verify` restore into stock PostgreSQL 18 with
  identical row counts — provider exit demonstrated, not assumed.
- Production data is real data: 43 lots, 17 people, 3 projects, 2 stories, and
  zero DEMO rows in any table (ADR-066, ADR-071).

**Credentials — the real gaps:**

| Variable | Local | Vercel production |
|---|---|---|
| `DATABASE_URL`, `AUTH_SECRET`, `AI_SERVICE_DATABASE_URL` | set | set |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | set | set |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **declared but empty** | absent |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | absent | absent |

Google sign-in therefore does not appear at all — the provider only registers
when both values are non-empty. Stripe throws a named "see SETUP.md" error when
checkout is attempted, rather than failing at boot.

**Not verified end to end:** a real Stripe Checkout purchase through the shared
webhook (`markOrderPaid`/`markBookingPaid`), and a Partner Workspace media
upload through R2. R2 *credentials* are now configured in both environments —
what has not been re-confirmed since is an actual upload completing.

**Historical note.** Earlier revisions of this section described verification
performed by signing in as `DEMO Platform Admin`, `DEMO Partner Field
Collector` and `DEMO Sensory Judge`, and by inspecting DEMO Tasks, products,
experiences and cupping sessions. That work was genuinely done and is recorded
in DECISIONS.md — but none of it is reproducible now, because those accounts
and fixtures were deleted (ADR-066). The claims were removed rather than
rewritten, since a document asserting a state the system has left behind is
worse than one that says less.

**Not built yet:** `TOURISM_EXPERIENCES.md`'s gastro-tourism extensions
(waitlist, multi-day sessions, dietary structure, pairing menus, live sensory
feedback — ADR-026/027); an admin UI for creating/reclassifying Tasks
(ADR-029 decision 4); the Assessment-correction workflow (schema supports it
via `supersedesAssessmentId`; `submitAssessment` currently rejects a second
submission — ADR-030 decision 5); sensory protocol domains beyond coffee
cupping; email verification and transactional email (no provider wired up).

**Deployment.** Production is live at https://nectar-nomada-package.vercel.app
(project `danieljosegiraldez-4768s-projects/nectar-nomada-package`). The public
`/discover` page renders the editorial register with real content only.
