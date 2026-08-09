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
- `AUTH_SECRET` — generate one: `npx auth secret` (or `openssl rand -base64 32`).
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
session (migration applied, seed data inserted and queried, signup → login →
protected-page flow driven through an actual browser) — see the chat history
for the walkthrough. **Not verified**: Neon in production, Google OAuth (needs
real credentials + a live redirect), and email verification/transactional
email (no provider wired up yet — out of Slice 1 scope per MVP_ROADMAP.md).
