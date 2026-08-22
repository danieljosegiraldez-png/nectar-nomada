#!/usr/bin/env bash
# Build entry point. Applies pending migrations before building, but only for
# a real production deployment.
#
# Why this exists. `next build` alone let the repository's schema and
# production's schema drift apart: S2 added three columns to
# sensory.sensory_session and nothing in the pipeline would ever have applied
# them. Prisma selects every scalar on a model, so `include: { session: true }`
# becomes SELECT ... purpose, subject, preparation_method — against a table
# without those columns, which is an error, not a missing value. Deploying the
# code without the migration takes the sensory module down, and nothing warned
# about it.
#
# Why it is guarded rather than unconditional. DATABASE_URL is scoped to
# Production in this Vercel project — Preview deployments have no database at
# all. An unconditional `prisma migrate deploy` would fail every preview build
# for a reason unrelated to the change being previewed, which is a good way to
# get the step deleted by whoever is next inconvenienced by it.
#
# Local `npm run build` takes the same skip path: VERCEL_ENV is unset, so
# nothing touches any database.

set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "▲ production deployment — applying pending migrations before build"
  npx prisma migrate deploy
else
  echo "▲ ${VERCEL_ENV:-local} build — skipping migrate deploy (no production database here)"
fi

npx next build
