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

Everything through Slice 3 (Commerce) has been verified against **Neon**,
the primary database as of ADR-022, via `npm run build`, `npm run lint`,
`npm test`, `npx tsc --noEmit`, and real browser sessions:

- Slice 1 (Identity): signup → login → My Néctar, RBAC resolution (unit
  tests + a live Platform Admin permission list), `prisma migrate deploy`.
- Foundational schema: PostGIS round trip (`ST_MakePoint`/`ST_Distance`),
  Location hierarchy, Organization/Program/Project/Sample FKs, domain-tag
  join.
- Slice 2 (Discover): all five public entity types listing and linking
  correctly, identical content for signed-in vs. signed-out visitors.
- i18n: locale switcher, `Person.locale` persistence across login.
- Slice 3 (Commerce): schema/migration on Neon; Discover and product pages
  correctly show "pricing coming soon" / "not available for purchase yet"
  for the two DEMO products (zero `ProductVariant` rows, per CLAUDE.md §54);
  `/cart` redirects an unauthenticated visitor to `/login` and shows the
  empty-cart state for a real logged-in user with no cart.

**Not verified yet — Slice 3**: a real Stripe Checkout purchase completing
through the webhook (`markOrderPaid`). Blocked on two things this session
can't supply: `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (see above), and a
decision on how to price at least one DEMO `ProductVariant` for testing
without fabricating a real price (DECISIONS.md ADR-025 decision 10).

**Not verified anywhere yet**: Google OAuth (needs real credentials + a live
redirect), email verification/transactional email (no provider wired up),
and an actual Vercel deployment (nothing has been deployed anywhere yet —
this has all run through `npm run dev`/`next build` locally against Neon).
