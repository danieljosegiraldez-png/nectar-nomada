/**
 * The production build guard — scripts/vercel-build.sh, ADR-064.
 *
 * These are static assertions about a shell script rather than behavioural
 * tests, because the behaviour they defend only ever happens on Vercel with
 * production credentials attached. What can be checked here is the part that
 * silently rots: the guard names the demo gates literally, so it stops
 * covering any gate added to the seed afterwards.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const guard = readFileSync(join(root, "scripts", "vercel-build.sh"), "utf8");
const seed = readFileSync(join(root, "prisma", "seed.ts"), "utf8");

const demoGates = (source: string) => new Set(source.match(/SEED_DEMO_[A-Z_]+/g) ?? []);

// Ordering assertions must read the commands, not the prose. The script's
// header explains `prisma migrate deploy` many lines above the line that runs
// it, so an indexOf over the raw file finds the comment first and "seeds after
// migrating" passes for the wrong reason.
const commands = guard
  .split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

describe("production build guard", () => {
  it("clears every demo gate the seed reads", () => {
    // The failure this prevents: someone adds SEED_DEMO_COMPETITION to the
    // seed, a matching variable exists in the Vercel dashboard for a preview,
    // and demo competition entries get written into the real record on the
    // next production deploy. Compare as sorted arrays so the failure message
    // names the gate that was missed.
    const inSeed = [...demoGates(seed)].sort();
    const inGuard = [...demoGates(guard)].sort();
    expect(inSeed.length).toBeGreaterThan(0);
    expect(inGuard).toEqual(inSeed);
  });

  it("seeds only after migrating, never before", () => {
    // The seed writes rows, so it needs the schema those rows live in. A guard
    // with these two reversed fails on any deploy that adds a column the seed
    // populates — which is exactly the deploy that most needs to work.
    const migrate = commands.indexOf("prisma migrate deploy");
    const dbSeed = commands.indexOf("prisma db seed");
    expect(migrate).toBeGreaterThan(-1);
    expect(dbSeed).toBeGreaterThan(migrate);
  });

  it("builds before touching the database, so a failing build cannot write to it", () => {
    // The failure this prevents actually happened (ADR-070): a type error
    // failed `next build` *after* the seed had run against production. The
    // deployment was never promoted, so nothing shipped — but the database had
    // already been written to. A deploy that does not ship must not be able to
    // change production data.
    const build = commands.indexOf("next build");
    expect(build).toBeGreaterThan(-1);
    expect(commands.indexOf("prisma migrate deploy")).toBeGreaterThan(build);
    expect(commands.indexOf("prisma db seed")).toBeGreaterThan(build);
  });

  it("runs neither migrate nor seed outside a production deployment", () => {
    // DATABASE_URL is scoped to Production in this Vercel project; preview
    // builds have no database. Both writes must sit inside the VERCEL_ENV
    // test, not before it.
    const branch = commands.indexOf('"${VERCEL_ENV:-}" = "production"');
    expect(branch).toBeGreaterThan(-1);
    expect(commands.indexOf("prisma migrate deploy")).toBeGreaterThan(branch);
    expect(commands.indexOf("prisma db seed")).toBeGreaterThan(branch);
    expect(commands.indexOf("else")).toBeGreaterThan(commands.indexOf("prisma db seed"));
    // next build sits outside the branch entirely — every deployment builds.
    expect(commands.indexOf("next build")).toBeLessThan(branch);
  });

  it("generates the Prisma client unconditionally, before the build needs it", () => {
    // The failure this prevents: generated/prisma is gitignored, so the client
    // does not arrive with a checkout, and nothing else creates it —
    // migrate deploy does not generate, and there is no postinstall. Preview
    // builds failed on exactly this; production only survived on a stale build
    // cache. Generate must sit OUTSIDE the production branch, since preview
    // builds need the client too and generating touches no database.
    const generate = commands.indexOf("prisma generate");
    const branch = commands.indexOf('"${VERCEL_ENV:-}" = "production"');
    expect(generate).toBeGreaterThan(-1);
    expect(generate).toBeLessThan(branch);
    // Generate must precede the build that imports the client it writes.
    expect(commands.indexOf("next build")).toBeGreaterThan(generate);
  });

  it("aborts the build if either step fails", () => {
    // Without -e a failed seed still ships the build, which is the ADR-063
    // hazard with extra steps: code live, grants missing.
    expect(guard).toMatch(/set -euo pipefail/);
  });
});
