#!/usr/bin/env bash
# Build entry point. Builds first, then applies migrations and seed data — and
# the database steps run only for a real production deployment.
#
# Why the database steps exist at all. `next build` alone let the repository's
# schema and production's schema drift apart: S2 added three columns to
# sensory.sensory_session and nothing in the pipeline would ever have applied
# them. Prisma selects every scalar on a model, so `include: { session: true }`
# becomes SELECT ... purpose, subject, preparation_method — against a table
# without those columns, which is an error, not a missing value. Deploying the
# code without the migration takes the sensory module down, and nothing warned
# about it.
#
# Why they are guarded rather than unconditional. DATABASE_URL is scoped to
# Production in this Vercel project — Preview deployments have no database at
# all. An unconditional `prisma migrate deploy` would fail every preview build
# for a reason unrelated to the change being previewed, which is a good way to
# get the step deleted by whoever is next inconvenienced by it.
#
# Local `npm run build` takes the same skip path: VERCEL_ENV is unset, so
# nothing touches any database.

set -euo pipefail

# Generate the Prisma client before anything imports it. Unconditional, and
# outside the production branch, because every build needs it and it talks to
# no database — it reads prisma/schema.prisma and writes TypeScript.
#
# Why this is not optional. The generator writes to ../generated/prisma, which
# is gitignored, so the client does not arrive with a checkout. Nothing else in
# the pipeline creates it: `prisma migrate deploy` does not generate (verified
# by removing the directory and running it — the client did not come back), and
# there is no postinstall hook.
#
# Production builds were nonetheless succeeding, on Vercel's restored build
# cache still holding a generated/prisma from an older deployment. Preview
# builds, which restore a different cache, failed every time with
# "Can't resolve '../generated/prisma/client'" — the same failure production
# was one cache eviction away from.
npx prisma generate

# Build BEFORE touching the database (ADR-070).
#
# This used to run last, and a real deploy showed why that was wrong: a
# TypeScript error in a test file failed `next build` — but only *after* the
# seed had already run against production. The deployment was never promoted,
# so the code never shipped, yet the database had been written to. A deploy
# that does not ship should not be able to change production data.
#
# Building first makes every build failure — type error, compile error, a bad
# import — happen while the database is still untouched. It is safe because
# `next build` needs no database: verified by building a clean checkout with
# DATABASE_URL, DIRECT_URL and TEST_DATABASE_URL all unset, which compiled and
# statically generated every page.
#
# Ordering for the live site is unchanged. Vercel promotes a deployment only
# after this whole command exits 0, so migrations and seed still land while the
# old code is serving, and the new code goes live after them — the property
# ADR-064 added and ADR-069 relied on.
npx next build

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "▲ production deployment — applying pending migrations"
  npx prisma migrate deploy

  # Seed after migrating, never before: the seed writes rows, so it needs the
  # schema those rows live in.
  #
  # Why this runs at all. Permissions and Role Profiles are seed-managed data
  # (RBAC.md §2), not schema — so a migration-only pipeline lets code that
  # depends on a new grant reach production before the grant does. ADR-063 hit
  # exactly that: shipping the enforced classification gate ahead of its
  # clearances would have denied every Farm Operator the lots they created.
  # Migrations were guarded; seeds were not, and the ordering hazard was real.
  #
  # Safe to run every time: the seed is entirely upserts on natural keys, with
  # no delete anywhere in it, so a re-run is a no-op.
  #
  # The DEMO gates are unset explicitly rather than trusted to be absent. They
  # are opt-in by design (prisma/seed.ts's own header says so, specifically so
  # a production pipeline never ships a default login), but "absent from the
  # Vercel dashboard" is a weaker guarantee than "cleared right here". A stray
  # SEED_DEMO_CONTENT would otherwise write demo projects into the real
  # research record.
  echo "▲ production deployment — seeding permissions, role profiles and catalogs"
  env -u SEED_DEMO_ADMIN -u SEED_DEMO_CONTENT -u SEED_DEMO_PARTNER -u SEED_DEMO_JUDGE \
    npx prisma db seed
else
  echo "▲ ${VERCEL_ENV:-local} build — skipping migrate and seed (no production database here)"
fi
