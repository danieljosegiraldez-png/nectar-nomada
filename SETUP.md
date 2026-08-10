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

Then:

```bash
npx prisma migrate dev   # applies prisma/migrations/, safe to re-run
npx prisma db seed       # seeds Permissions + Role Profiles (RBAC.md §5)
npm run dev              # http://localhost:3000
```

To also get a DEMO Platform Admin login for local testing
(`demo-admin@nectar-nomada.example` / see prisma/seed.ts console output for
the password — never do this in a shared environment):

```bash
SEED_DEMO_ADMIN=true npx prisma db seed
```

## Common commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest — RBAC resolution engine unit tests (no DB needed) |
| `npx prisma studio` | Browse the database in a GUI |
| `npx prisma migrate dev --name <description>` | New migration after a schema change |

## What's verified vs. not

Everything through the Foundational schema has now been verified against
**Neon**, the primary database as of ADR-022: `prisma migrate deploy` (both
migrations, including PostGIS), seeding, and a full signup → login → My
Néctar walkthrough through an actual browser session, plus a PostGIS round
trip (`ST_MakePoint`/`ST_Distance` via raw SQL) and the Foundational schema's
relationships (Location hierarchy, Organization/Program/Project/Sample FKs,
the domain-tag join) — all exercised in rolled-back transactions, all
against real Postgres. Local `prisma dev` was also exercised earlier for the
same flows and is documented above purely as a fallback now. **Not verified
anywhere yet**: Google OAuth (needs real credentials + a live redirect),
email verification/transactional email (no provider wired up — out of Slice
1 scope per MVP_ROADMAP.md), and an actual Vercel deployment (nothing has
been deployed anywhere yet — this has all run through `npm run dev`/`next
build` locally against Neon).
