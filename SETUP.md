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

To also get a DEMO Platform Admin login for local testing
(`demo-admin@nectar-nomada.example` / see prisma/seed.ts console output for
the password — never do this in a shared environment):

```bash
SEED_DEMO_ADMIN=true npx prisma db seed
```

To also get a DEMO Partner Field Collector login, assigned to the Las Nubes
project (`demo-partner@nectar-nomada.example` / see console output for the
password) — this is what lets you actually see the Slice 5 Partner Workspace
classification restriction in action (the partner sees one DEMO Task, not
the other, deliberately internal-classified one):

```bash
SEED_DEMO_CONTENT=true SEED_DEMO_PARTNER=true npx prisma db seed
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

Everything through Slice 5 (Partner Workspace) has been verified against
**Neon**, the primary database as of ADR-022, via `npm run build`,
`npm run lint`, `npm test`, `npx tsc --noEmit`, and real browser sessions:

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
- Slice 4 (Experiences, core engine): schema/migration on Neon; an
  Experience page with zero `ExperienceSession` rows correctly shows "no
  sessions currently scheduled"; a real (non-fabricated, date-only) test
  session correctly renders its date/capacity and correctly withholds the
  booking form because the DEMO Experience has no price ("booking opens
  once pricing is set"); My Néctar's Bookings section shows "no bookings
  yet" for a real logged-in user.
- Slice 5 (Partner Workspace): schema/migration on Neon; logged in as the
  real seeded DEMO Partner Field Collector account, Partner Workspace's
  project list correctly shows only Las Nubes (the project they're
  assigned to — a Platform Admin's platform-scoped Assignment does *not*
  populate this list, by design, ADR-029 decision 2); the project workspace
  correctly shows only the `partner`-classified DEMO Task, not the
  `internal`-classified one on the same project; both write paths (task
  status update, new field submission) exercised live and confirmed working.

**Not verified yet — Slices 3, 4 & 5**: a real Stripe Checkout purchase
(Commerce order or Experience booking) completing through the shared
webhook (`markOrderPaid`/`markBookingPaid`), and a real Partner Workspace
media upload completing through R2. Blocked on credentials this session
can't supply: `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` and a decision on
how to price at least one DEMO `ProductVariant`/Experience (DECISIONS.md
ADR-025 decision 10, ADR-028 decision 8), and
`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`
(ADR-029 decision 6/verification note) respectively.

**Not built yet — Slice 4**: `TOURISM_EXPERIENCES.md`'s gastro-tourism
extensions (waitlist, multi-day sessions, dietary structure, pairing menus,
live sensory feedback) — accepted planning input (ADR-026/027), layered onto
the core engine in a future increment, not part of this verification.

**Not built yet — Slice 5**: an admin-facing UI for creating/reclassifying
Tasks (Task rows currently come from seed data only — ADR-029 decision 4).

**Not verified anywhere yet**: Google OAuth (needs real credentials + a live
redirect), email verification/transactional email (no provider wired up).

**Deployment**: a real Vercel production deployment exists at
https://nectar-nomada-package.vercel.app (linked project
`danieljosegiraldez-4768s-projects/nectar-nomada-package`), verified working
end to end — homepage, Discover (real Neon data), and a full login → My
Néctar walkthrough all checked directly against production after fixing a
`DATABASE_URL` formatting bug caught during that verification. Stripe/R2
env vars are not set in Vercel either, so the same gaps noted above apply
in production too.
