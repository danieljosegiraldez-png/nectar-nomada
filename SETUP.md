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
- `DATABASE_URL` — for local dev, start Prisma's bundled local Postgres in
  another terminal (`npx prisma dev`) and it prints a `postgres://...` TCP
  URL; paste that in. For production this becomes a Neon connection string
  (DECISIONS.md ADR-007).
- `SHADOW_DATABASE_URL` — required for `prisma migrate dev` to work locally
  (DECISIONS.md ADR-021): `prisma dev`'s automatic shadow-database
  provisioning doesn't work against its own local PGlite instance, so this
  must point at the separate shadow instance `prisma dev` also provisions —
  run `npx prisma dev ls` and use the `shadowDatabaseUrl` it prints (same
  host, different port from `DATABASE_URL`). Not needed against Neon in
  production, which provisions its own shadow database correctly.
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

Everything above was actually run against a real local Postgres during this
session (migrations applied, seed data inserted and queried, signup → login →
protected-page flow driven through an actual browser, and the Foundational
schema's relationships — Location hierarchy, Organization/Program/Project/
Sample FKs, the domain-tag join — exercised in a rolled-back transaction) —
see the chat history for the walkthroughs. **Not verified**: Neon in
production, PostGIS (deferred — DECISIONS.md ADR-021, the local dev database
can't load Postgres extensions), Google OAuth (needs real credentials + a
live redirect), and email verification/transactional email (no provider
wired up yet — out of Slice 1 scope per MVP_ROADMAP.md).
